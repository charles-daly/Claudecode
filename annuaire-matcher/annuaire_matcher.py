"""
French e-invoicing annuaire matcher.

Reads customers from an Excel file, looks each one up in the DGFIP
annuaire de la facturation électronique by SIREN, then produces a
colour-coded Excel report showing matches and discrepancies.

Usage:
    python annuaire_matcher.py --input customers.xlsx [--output report.xlsx]

Expected Excel columns (case-insensitive, order does not matter):
    siren           9-digit company identifier          (required)
    siret           14-digit establishment identifier   (optional)
    nom             Your internal name for the customer (optional)
    adresse         Street address                      (optional)
    code_postal     Postal code                         (optional)
    ville           City / commune                      (optional)
    email           Contact email                       (optional)
"""

import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
from dotenv import load_dotenv
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from rich.console import Console
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn
from rich.table import Table

load_dotenv()

console = Console()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_BASE_URL = os.getenv("ANNUAIRE_API_BASE_URL", "https://api.annuaire-facturation.dgfip.finances.gouv.fr/v1")
API_KEY = os.getenv("ANNUAIRE_API_KEY", "")
API_TIMEOUT = int(os.getenv("API_TIMEOUT", "15"))
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "3"))

# Fields pulled from the annuaire response and compared against the customer row.
# Each entry: (annuaire_json_key, customer_excel_column, display_label)
COMPARABLE_FIELDS = [
    ("denominationSociale", "nom",         "Nom (dénomination sociale)"),
    ("siret",               "siret",       "SIRET"),
    ("adresseCodePostal",   "code_postal", "Code postal"),
    ("adresseCommune",      "ville",       "Ville"),
]

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Customer:
    siren: str
    siret: str = ""
    nom: str = ""
    adresse: str = ""
    code_postal: str = ""
    ville: str = ""
    email: str = ""
    row_index: int = 0


@dataclass
class AnnuaireRecord:
    siren: str
    siret: str = ""
    denomination_sociale: str = ""
    adresse_code_postal: str = ""
    adresse_commune: str = ""
    statut_inscription: str = ""      # e.g. "INSCRIT" / "NON_INSCRIT"
    pdp_id: str = ""                  # routing platform ID
    pdp_nom: str = ""
    mode_transmission: str = ""
    raw: dict = field(default_factory=dict)


@dataclass
class MatchResult:
    customer: Customer
    annuaire: Optional[AnnuaireRecord]
    status: str          # "MATCH" | "DISCREPANCY" | "NOT_FOUND" | "API_ERROR" | "NOT_REGISTERED"
    discrepancies: list[str] = field(default_factory=list)
    error_message: str = ""


# ---------------------------------------------------------------------------
# API client
# ---------------------------------------------------------------------------

def _build_headers() -> dict:
    headers = {"Accept": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"
    return headers


def lookup_siren(siren: str) -> tuple[Optional[AnnuaireRecord], str]:
    """
    Query the annuaire for a single SIREN.
    Returns (AnnuaireRecord | None, error_message).
    """
    url = f"{API_BASE_URL.rstrip('/')}/annuaire/{siren}"
    try:
        resp = requests.get(url, headers=_build_headers(), timeout=API_TIMEOUT)
        if resp.status_code == 404:
            return None, "NOT_FOUND"
        resp.raise_for_status()
        data = resp.json()
        record = _parse_response(siren, data)
        return record, ""
    except requests.exceptions.HTTPError as exc:
        return None, f"HTTP {exc.response.status_code}"
    except requests.exceptions.Timeout:
        return None, "TIMEOUT"
    except requests.exceptions.ConnectionError:
        return None, "CONNECTION_ERROR"
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


def _parse_response(siren: str, data: dict) -> AnnuaireRecord:
    """Map the API JSON response to an AnnuaireRecord."""
    return AnnuaireRecord(
        siren=siren,
        siret=data.get("siret", ""),
        denomination_sociale=data.get("denominationSociale", ""),
        adresse_code_postal=data.get("adresseCodePostal", ""),
        adresse_commune=data.get("adresseCommune", ""),
        statut_inscription=data.get("statutInscription", ""),
        pdp_id=data.get("pdpId", ""),
        pdp_nom=data.get("pdpNom", ""),
        mode_transmission=data.get("modeTransmission", ""),
        raw=data,
    )


# ---------------------------------------------------------------------------
# Matching logic
# ---------------------------------------------------------------------------

def _normalise(value: str) -> str:
    return value.strip().upper()


def compare(customer: Customer, annuaire: AnnuaireRecord) -> list[str]:
    """Return a list of human-readable discrepancy strings."""
    discrepancies = []
    checks = [
        (annuaire.denomination_sociale, customer.nom,         "Nom"),
        (annuaire.siret,               customer.siret,        "SIRET"),
        (annuaire.adresse_code_postal, customer.code_postal,  "Code postal"),
        (annuaire.adresse_commune,     customer.ville,        "Ville"),
    ]
    for api_val, cust_val, label in checks:
        if not cust_val:
            continue
        if _normalise(api_val) != _normalise(cust_val):
            discrepancies.append(
                f"{label}: votre valeur='{cust_val}' | annuaire='{api_val}'"
            )
    return discrepancies


def process_customer(customer: Customer) -> MatchResult:
    annuaire, error = lookup_siren(customer.siren)

    if error == "NOT_FOUND":
        return MatchResult(customer=customer, annuaire=None, status="NOT_FOUND")
    if error:
        return MatchResult(customer=customer, annuaire=None, status="API_ERROR",
                           error_message=error)
    if annuaire.statut_inscription.upper() not in ("INSCRIT", "ACTIF", "ENREGISTRE", ""):
        return MatchResult(customer=customer, annuaire=annuaire,
                           status="NOT_REGISTERED")

    discrepancies = compare(customer, annuaire)
    status = "DISCREPANCY" if discrepancies else "MATCH"
    return MatchResult(customer=customer, annuaire=annuaire, status=status,
                       discrepancies=discrepancies)


# ---------------------------------------------------------------------------
# Excel import
# ---------------------------------------------------------------------------

COLUMN_ALIASES: dict[str, str] = {
    # French variants → canonical key
    "siren":            "siren",
    "numéro siren":     "siren",
    "numero siren":     "siren",
    "siret":            "siret",
    "numéro siret":     "siret",
    "numero siret":     "siret",
    "nom":              "nom",
    "nom client":       "nom",
    "raison sociale":   "nom",
    "dénomination":     "nom",
    "denomination":     "nom",
    "adresse":          "adresse",
    "adresse postale":  "adresse",
    "code postal":      "code_postal",
    "code_postal":      "code_postal",
    "cp":               "code_postal",
    "ville":            "ville",
    "commune":          "ville",
    "email":            "email",
    "e-mail":           "email",
    "courriel":         "email",
}


def _map_columns(df: pd.DataFrame) -> dict[str, str]:
    """Return {canonical_key: actual_df_column} for recognised columns."""
    mapping: dict[str, str] = {}
    for col in df.columns:
        canonical = COLUMN_ALIASES.get(col.strip().lower())
        if canonical and canonical not in mapping:
            mapping[canonical] = col
    return mapping


def load_customers(path: Path) -> list[Customer]:
    df = pd.read_excel(path, dtype=str).fillna("")
    col_map = _map_columns(df)

    if "siren" not in col_map:
        console.print("[bold red]Error:[/] Column 'SIREN' not found in the Excel file.")
        console.print(f"  Recognised columns: {list(df.columns)}")
        sys.exit(1)

    customers = []
    for idx, row in df.iterrows():
        def get(key: str) -> str:
            return str(row[col_map[key]]).strip() if key in col_map else ""

        siren_raw = get("siren").replace(" ", "").replace(".", "")
        if not siren_raw or not siren_raw.isdigit() or len(siren_raw) != 9:
            console.print(f"[yellow]Warning:[/] Row {idx + 2}: invalid SIREN '{siren_raw}' — skipped.")
            continue

        customers.append(Customer(
            siren=siren_raw,
            siret=get("siret").replace(" ", ""),
            nom=get("nom"),
            adresse=get("adresse"),
            code_postal=get("code_postal"),
            ville=get("ville"),
            email=get("email"),
            row_index=int(idx) + 2,
        ))
    return customers


# ---------------------------------------------------------------------------
# Excel report output
# ---------------------------------------------------------------------------

# Colour palette
FILL_HEADER  = PatternFill("solid", fgColor="1F4E79")   # dark blue
FILL_MATCH   = PatternFill("solid", fgColor="C6EFCE")   # green
FILL_DISC    = PatternFill("solid", fgColor="FFEB9C")   # amber
FILL_MISSING = PatternFill("solid", fgColor="FFCCCC")   # red/pink
FILL_ERROR   = PatternFill("solid", fgColor="E2EFDA")   # light grey-green
FILL_NOREG   = PatternFill("solid", fgColor="D9D9D9")   # grey

STATUS_LABELS = {
    "MATCH":          "✓ Correspondance",
    "DISCREPANCY":    "⚠ Écart détecté",
    "NOT_FOUND":      "✗ Non trouvé",
    "NOT_REGISTERED": "— Non inscrit",
    "API_ERROR":      "⚡ Erreur API",
}

STATUS_FILLS = {
    "MATCH":          FILL_MATCH,
    "DISCREPANCY":    FILL_DISC,
    "NOT_FOUND":      FILL_MISSING,
    "NOT_REGISTERED": FILL_NOREG,
    "API_ERROR":      FILL_ERROR,
}

REPORT_COLUMNS = [
    ("SIREN",                  14),
    ("Nom client (votre fichier)", 28),
    ("Dénomination annuaire",  28),
    ("SIRET annuaire",         18),
    ("Code postal votre fichier", 14),
    ("Code postal annuaire",   14),
    ("Ville votre fichier",    18),
    ("Ville annuaire",         18),
    ("Statut inscription",     16),
    ("PDP (plateforme)",       22),
    ("Mode transmission",      16),
    ("Statut correspondance",  22),
    ("Détail des écarts",      50),
]


def _apply_header(ws, headers: list[tuple[str, int]]) -> None:
    for col_idx, (label, width) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=label)
        cell.fill = FILL_HEADER
        cell.font = Font(color="FFFFFF", bold=True)
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(col_idx)].width = width


def _write_result_row(ws, row_num: int, result: MatchResult) -> None:
    c = result.customer
    a = result.annuaire

    values = [
        c.siren,
        c.nom,
        a.denomination_sociale if a else "",
        a.siret               if a else "",
        c.code_postal,
        a.adresse_code_postal if a else "",
        c.ville,
        a.adresse_commune     if a else "",
        (a.statut_inscription if a else "") or ("N/A" if result.status == "API_ERROR" else ""),
        a.pdp_nom             if a else "",
        a.mode_transmission   if a else "",
        STATUS_LABELS.get(result.status, result.status),
        "; ".join(result.discrepancies) if result.discrepancies else result.error_message,
    ]

    fill = STATUS_FILLS.get(result.status, FILL_ERROR)
    for col_idx, value in enumerate(values, start=1):
        cell = ws.cell(row=row_num, column=col_idx, value=value)
        cell.fill = fill
        cell.alignment = Alignment(wrap_text=True, vertical="top")


def write_report(results: list[MatchResult], output_path: Path) -> None:
    wb = Workbook()

    # --- Main results sheet ---
    ws_main = wb.active
    ws_main.title = "Résultats"
    ws_main.row_dimensions[1].height = 36
    _apply_header(ws_main, REPORT_COLUMNS)

    for row_num, result in enumerate(results, start=2):
        _write_result_row(ws_main, row_num, result)
        ws_main.row_dimensions[row_num].height = 18

    ws_main.freeze_panes = "A2"
    ws_main.auto_filter.ref = ws_main.dimensions

    # --- Summary sheet ---
    ws_sum = wb.create_sheet("Résumé")
    counts = {s: 0 for s in STATUS_FILLS}
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1

    ws_sum.append(["Statut", "Nombre", "Description"])
    header_row = ws_sum[1]
    for cell in header_row:
        cell.fill = FILL_HEADER
        cell.font = Font(color="FFFFFF", bold=True)

    descriptions = {
        "MATCH":          "Données identiques entre votre fichier et l'annuaire",
        "DISCREPANCY":    "Écart entre votre fichier et l'annuaire",
        "NOT_FOUND":      "SIREN introuvable dans l'annuaire",
        "NOT_REGISTERED": "Entreprise non inscrite à la facturation électronique",
        "API_ERROR":      "Erreur lors de l'appel API",
    }
    for status, count in counts.items():
        if count > 0:
            ws_sum.append([STATUS_LABELS[status], count, descriptions[status]])
            cell = ws_sum.cell(row=ws_sum.max_row, column=1)
            cell.fill = STATUS_FILLS[status]

    ws_sum.append([])
    ws_sum.append(["Total", len(results), ""])
    ws_sum.append(["Généré le", datetime.now().strftime("%d/%m/%Y %H:%M"), ""])

    for col in ["A", "B", "C"]:
        ws_sum.column_dimensions[col].width = 42 if col == "C" else 22

    # --- Template sheet ---
    ws_tpl = wb.create_sheet("Modèle import")
    tpl_headers = ["SIREN", "SIRET", "Nom", "Adresse", "Code postal", "Ville", "Email"]
    ws_tpl.append(tpl_headers)
    for col_idx, h in enumerate(tpl_headers, start=1):
        cell = ws_tpl.cell(row=1, column=col_idx)
        cell.fill = FILL_HEADER
        cell.font = Font(color="FFFFFF", bold=True)
        ws_tpl.column_dimensions[get_column_letter(col_idx)].width = 20
    ws_tpl.append(["123456789", "12345678900014", "Ma Société SARL",
                   "12 rue de la Paix", "75001", "Paris", "contact@masociete.fr"])

    wb.save(output_path)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Match customers against the French e-invoicing annuaire (DGFIP).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--input",  "-i", required=True, type=Path,
                        help="Path to the customer Excel file (.xlsx)")
    parser.add_argument("--output", "-o", type=Path, default=None,
                        help="Path for the output report (default: <input>_rapport_<date>.xlsx)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse the Excel file and show a preview without calling the API")
    parser.add_argument("--workers", type=int, default=MAX_WORKERS,
                        help=f"Concurrent API calls (default: {MAX_WORKERS})")
    return parser.parse_args()


def _print_summary(results: list[MatchResult]) -> None:
    table = Table(title="Résumé", show_header=True, header_style="bold white on dark_blue")
    table.add_column("Statut",  style="bold", min_width=22)
    table.add_column("Nombre",  justify="right")
    table.add_column("Détails", min_width=40)

    counts: dict[str, list[MatchResult]] = {}
    for r in results:
        counts.setdefault(r.status, []).append(r)

    style_map = {
        "MATCH":          "green",
        "DISCREPANCY":    "yellow",
        "NOT_FOUND":      "red",
        "NOT_REGISTERED": "dim",
        "API_ERROR":      "red bold",
    }
    for status, items in sorted(counts.items()):
        examples = "; ".join(i.customer.siren for i in items[:3])
        if len(items) > 3:
            examples += f" … (+{len(items) - 3})"
        table.add_row(
            STATUS_LABELS.get(status, status),
            str(len(items)),
            examples,
            style=style_map.get(status, ""),
        )
    console.print(table)


def main() -> None:
    args = parse_args()

    if not args.input.exists():
        console.print(f"[bold red]Error:[/] File not found: {args.input}")
        sys.exit(1)

    if args.output is None:
        date_str = datetime.now().strftime("%Y%m%d_%H%M")
        args.output = args.input.parent / f"{args.input.stem}_rapport_{date_str}.xlsx"

    # Load customers
    console.print(f"\n[bold]Chargement du fichier :[/] {args.input}")
    customers = load_customers(args.input)
    console.print(f"  → {len(customers)} client(s) chargé(s)")

    if args.dry_run:
        table = Table(title="Aperçu (dry-run)", show_header=True)
        for col in ("SIREN", "SIRET", "Nom", "Code postal", "Ville"):
            table.add_column(col)
        for c in customers[:20]:
            table.add_row(c.siren, c.siret, c.nom, c.code_postal, c.ville)
        if len(customers) > 20:
            console.print(f"  … (affichage limité à 20 sur {len(customers)})")
        console.print(table)
        return

    if not API_KEY:
        console.print("[bold yellow]Attention :[/] ANNUAIRE_API_KEY n'est pas défini. "
                      "Les appels API pourraient échouer selon la configuration du serveur.")

    # Run API lookups concurrently
    results: list[MatchResult] = [None] * len(customers)  # type: ignore[list-item]

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("{task.completed}/{task.total}"),
        console=console,
    ) as progress:
        task = progress.add_task("Interrogation de l'annuaire…", total=len(customers))

        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            future_to_idx = {
                executor.submit(process_customer, c): i
                for i, c in enumerate(customers)
            }
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    results[idx] = future.result()
                except Exception as exc:  # noqa: BLE001
                    results[idx] = MatchResult(
                        customer=customers[idx],
                        annuaire=None,
                        status="API_ERROR",
                        error_message=str(exc),
                    )
                progress.advance(task)

    # Report
    _print_summary(results)
    write_report(results, args.output)
    console.print(f"\n[bold green]Rapport généré :[/] {args.output}\n")


if __name__ == "__main__":
    main()
