"""
French e-invoicing annuaire matcher.

Reads customers from an Excel file, looks each one up in the DGFIP
annuaire de la facturation électronique by SIREN, then produces a
colour-coded Excel report showing matches and discrepancies.

Usage:
    python annuaire_matcher.py --input customers.xlsx [--output report.xlsx]

Expected Excel columns (case-insensitive, order does not matter):
    siren           9-digit company identifier          (required if no siret)
    siret           14-digit establishment identifier   (siren derived from this if siren absent)
    nom             Your internal name for the customer (optional)
    adresse         Street address                      (optional)
    code_postal     Postal code                         (optional)
    ville           City / commune                      (optional)
    email           Contact email                       (optional)

If a field is blank, the tool will populate it from the annuaire response
and highlight it in blue so you can copy it back into your system.
"""

import argparse
import os
import sys
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
    siren_source: str = "fichier"   # "fichier" | "dérivé du SIRET"


@dataclass
class AnnuaireRecord:
    siren: str
    siret: str = ""
    denomination_sociale: str = ""
    adresse_code_postal: str = ""
    adresse_commune: str = ""
    statut_inscription: str = ""    # e.g. "INSCRIT" / "NON_INSCRIT"
    pdp_id: str = ""
    pdp_nom: str = ""
    mode_transmission: str = ""
    raw: dict = field(default_factory=dict)


@dataclass
class MatchResult:
    customer: Customer
    annuaire: Optional[AnnuaireRecord]
    status: str     # "MATCH" | "DISCREPANCY" | "NOT_FOUND" | "API_ERROR" | "NOT_REGISTERED"
    discrepancies: list[str] = field(default_factory=list)
    populated_fields: list[str] = field(default_factory=list)  # fields filled in from annuaire
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
    """Query the annuaire for a single SIREN. Returns (record | None, error_message)."""
    url = f"{API_BASE_URL.rstrip('/')}/annuaire/{siren}"
    try:
        resp = requests.get(url, headers=_build_headers(), timeout=API_TIMEOUT)
        if resp.status_code == 404:
            return None, "NOT_FOUND"
        resp.raise_for_status()
        data = resp.json()
        return _parse_response(siren, data), ""
    except requests.exceptions.HTTPError as exc:
        return None, f"HTTP {exc.response.status_code}"
    except requests.exceptions.Timeout:
        return None, "TIMEOUT"
    except requests.exceptions.ConnectionError:
        return None, "CONNECTION_ERROR"
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


def _parse_response(siren: str, data: dict) -> AnnuaireRecord:
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
# Matching and enrichment logic
# ---------------------------------------------------------------------------

def _normalise(value: str) -> str:
    return value.strip().upper()


def compare(customer: Customer, annuaire: AnnuaireRecord) -> list[str]:
    """
    Compare originally-supplied customer fields against the annuaire.
    Only fields that were non-empty in the customer's file are checked.
    Returns a list of human-readable discrepancy strings.
    """
    discrepancies = []
    checks = [
        (annuaire.denomination_sociale, customer.nom,        "Nom"),
        (annuaire.siret,                customer.siret,      "SIRET"),
        (annuaire.adresse_code_postal,  customer.code_postal, "Code postal"),
        (annuaire.adresse_commune,      customer.ville,      "Ville"),
    ]
    for api_val, cust_val, label in checks:
        if not cust_val:
            continue
        if _normalise(api_val) != _normalise(cust_val):
            discrepancies.append(
                f"{label}: votre valeur='{cust_val}' | annuaire='{api_val}'"
            )
    return discrepancies


def populate_from_annuaire(customer: Customer, annuaire: AnnuaireRecord) -> list[str]:
    """
    Fill any blank customer fields from the annuaire response.
    Must be called AFTER compare() so we only compare originally-supplied data.
    Returns a list of field labels that were populated.
    """
    populated = []
    mappings = [
        ("nom",         annuaire.denomination_sociale, "Nom"),
        ("siret",       annuaire.siret,                "SIRET"),
        ("code_postal", annuaire.adresse_code_postal,  "Code postal"),
        ("ville",       annuaire.adresse_commune,      "Ville"),
    ]
    for attr, api_val, label in mappings:
        if not getattr(customer, attr) and api_val:
            setattr(customer, attr, api_val)
            populated.append(label)
    return populated


def process_customer(customer: Customer) -> MatchResult:
    annuaire, error = lookup_siren(customer.siren)

    if error == "NOT_FOUND":
        return MatchResult(customer=customer, annuaire=None, status="NOT_FOUND")
    if error:
        return MatchResult(customer=customer, annuaire=None, status="API_ERROR",
                           error_message=error)

    # Compare first (uses original data), then enrich blanks
    discrepancies = compare(customer, annuaire)
    populated = populate_from_annuaire(customer, annuaire)

    if annuaire.statut_inscription.upper() not in ("INSCRIT", "ACTIF", "ENREGISTRE", ""):
        return MatchResult(customer=customer, annuaire=annuaire,
                           status="NOT_REGISTERED", populated_fields=populated)

    status = "DISCREPANCY" if discrepancies else "MATCH"
    return MatchResult(customer=customer, annuaire=annuaire, status=status,
                       discrepancies=discrepancies, populated_fields=populated)


# ---------------------------------------------------------------------------
# Excel import
# ---------------------------------------------------------------------------

COLUMN_ALIASES: dict[str, str] = {
    "siren":                "siren",
    "numéro siren":         "siren",
    "numero siren":         "siren",
    "n° siren":             "siren",
    "siret":                "siret",
    "numéro siret":         "siret",
    "numero siret":         "siret",
    "n° siret":             "siret",
    "nom":                  "nom",
    "nom client":           "nom",
    "raison sociale":       "nom",
    "dénomination":         "nom",
    "denomination":         "nom",
    "adresse":              "adresse",
    "adresse postale":      "adresse",
    "code postal":          "code_postal",
    "code_postal":          "code_postal",
    "cp":                   "code_postal",
    "ville":                "ville",
    "commune":              "ville",
    "email":                "email",
    "e-mail":               "email",
    "courriel":             "email",
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

    if "siren" not in col_map and "siret" not in col_map:
        console.print("[bold red]Erreur :[/] Ni la colonne 'SIREN' ni 'SIRET' n'ont été trouvées.")
        console.print(f"  Colonnes détectées : {list(df.columns)}")
        sys.exit(1)

    customers = []
    for idx, row in df.iterrows():
        def get(key: str) -> str:
            return str(row[col_map[key]]).strip() if key in col_map else ""

        siren_raw  = get("siren").replace(" ", "").replace(".", "").replace("-", "")
        siret_raw  = get("siret").replace(" ", "").replace(".", "").replace("-", "")
        siren_source = "fichier"

        # Derive SIREN from SIRET's first 9 digits when SIREN is absent or invalid
        if not (siren_raw and siren_raw.isdigit() and len(siren_raw) == 9):
            if siret_raw and siret_raw.isdigit() and len(siret_raw) == 14:
                siren_raw = siret_raw[:9]
                siren_source = "dérivé du SIRET"
                console.print(
                    f"[dim]Ligne {idx + 2} :[/] SIREN absent — dérivé du SIRET → [cyan]{siren_raw}[/]"
                )
            else:
                raw_siren_display = get("siren") or "(vide)"
                console.print(
                    f"[yellow]Attention :[/] Ligne {idx + 2} : SIREN '{raw_siren_display}' invalide "
                    f"et SIRET '{get('siret') or '(vide)'}' non utilisable — ligne ignorée."
                )
                continue

        customers.append(Customer(
            siren=siren_raw,
            siret=siret_raw,
            nom=get("nom"),
            adresse=get("adresse"),
            code_postal=get("code_postal"),
            ville=get("ville"),
            email=get("email"),
            row_index=int(idx) + 2,
            siren_source=siren_source,
        ))
    return customers


# ---------------------------------------------------------------------------
# Excel report output
# ---------------------------------------------------------------------------

FILL_HEADER    = PatternFill("solid", fgColor="1F4E79")  # dark blue
FILL_MATCH     = PatternFill("solid", fgColor="C6EFCE")  # green
FILL_DISC      = PatternFill("solid", fgColor="FFEB9C")  # amber
FILL_MISSING   = PatternFill("solid", fgColor="FFCCCC")  # red/pink
FILL_ERROR     = PatternFill("solid", fgColor="E2EFDA")  # light grey-green
FILL_NOREG     = PatternFill("solid", fgColor="D9D9D9")  # grey
FILL_POPULATED = PatternFill("solid", fgColor="BDD7EE")  # light blue — auto-filled from annuaire

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

# (header_label, col_width, customer_attr_or_None, populated_field_label_or_None)
# populated_field_label must match what populate_from_annuaire() uses
REPORT_COLUMNS = [
    ("SIREN",                       14, None,          None),
    ("Source SIREN",                16, None,          None),
    ("Nom (votre fichier)",         28, "nom",         "Nom"),
    ("Dénomination annuaire",       28, None,          None),
    ("SIRET (votre fichier)",       18, "siret",       "SIRET"),
    ("SIRET annuaire",              18, None,          None),
    ("Code postal (votre fichier)", 14, "code_postal", "Code postal"),
    ("Code postal annuaire",        14, None,          None),
    ("Ville (votre fichier)",       18, "ville",       "Ville"),
    ("Ville annuaire",              18, None,          None),
    ("Statut inscription",          16, None,          None),
    ("PDP (plateforme)",            22, None,          None),
    ("Mode transmission",           16, None,          None),
    ("Champs complétés",            30, None,          None),
    ("Statut correspondance",       22, None,          None),
    ("Détail des écarts",           50, None,          None),
]


def _apply_header(ws, columns: list[tuple]) -> None:
    for col_idx, col_def in enumerate(columns, start=1):
        label, width = col_def[0], col_def[1]
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
        c.siren_source,
        c.nom,
        a.denomination_sociale if a else "",
        c.siret,
        a.siret               if a else "",
        c.code_postal,
        a.adresse_code_postal if a else "",
        c.ville,
        a.adresse_commune     if a else "",
        (a.statut_inscription if a else "") or ("N/A" if result.status == "API_ERROR" else ""),
        a.pdp_nom             if a else "",
        a.mode_transmission   if a else "",
        ", ".join(result.populated_fields) if result.populated_fields else "",
        STATUS_LABELS.get(result.status, result.status),
        "; ".join(result.discrepancies) if result.discrepancies else result.error_message,
    ]

    row_fill = STATUS_FILLS.get(result.status, FILL_ERROR)

    for col_idx, (value, col_def) in enumerate(zip(values, REPORT_COLUMNS), start=1):
        cell = ws.cell(row=row_num, column=col_idx, value=value)
        cell.alignment = Alignment(wrap_text=True, vertical="top")

        # Blue highlight on "votre fichier" cells that were auto-populated from annuaire
        populated_label = col_def[3]
        if populated_label and populated_label in result.populated_fields:
            cell.fill = FILL_POPULATED
        else:
            cell.fill = row_fill


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
    counts: dict[str, int] = {}
    total_populated = sum(len(r.populated_fields) for r in results)
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1

    ws_sum.append(["Statut", "Nombre", "Description"])
    for cell in ws_sum[1]:
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
            ws_sum.append([STATUS_LABELS[status], count, descriptions.get(status, "")])
            ws_sum.cell(row=ws_sum.max_row, column=1).fill = STATUS_FILLS[status]

    ws_sum.append([])
    ws_sum.append(["Total clients", len(results), ""])
    ws_sum.append(["Champs complétés depuis l'annuaire", total_populated,
                   "Cellules en bleu dans l'onglet Résultats"])
    ws_sum.append(["Généré le", datetime.now().strftime("%d/%m/%Y %H:%M"), ""])

    for col in ["A", "B", "C"]:
        ws_sum.column_dimensions[col].width = 44 if col == "C" else 24

    # --- Legend sheet ---
    ws_leg = wb.create_sheet("Légende")
    legend_rows = [
        (FILL_MATCH,     "✓ Correspondance",   "Toutes les données fournies correspondent à l'annuaire"),
        (FILL_DISC,      "⚠ Écart détecté",    "Au moins un champ fourni diffère de l'annuaire"),
        (FILL_MISSING,   "✗ Non trouvé",        "Le SIREN n'existe pas dans l'annuaire"),
        (FILL_NOREG,     "— Non inscrit",       "L'entreprise n'est pas encore inscrite à la facturation électronique"),
        (FILL_ERROR,     "⚡ Erreur API",        "Impossible d'interroger l'annuaire pour ce SIREN"),
        (FILL_POPULATED, "← Complété",          "Ce champ était vide — valeur copiée depuis l'annuaire (cellule bleue)"),
    ]
    ws_leg.append(["Couleur", "Statut", "Signification"])
    for cell in ws_leg[1]:
        cell.fill = FILL_HEADER
        cell.font = Font(color="FFFFFF", bold=True)
    for fill, label, desc in legend_rows:
        ws_leg.append(["", label, desc])
        ws_leg.cell(row=ws_leg.max_row, column=1).fill = fill
    ws_leg.column_dimensions["A"].width = 4
    ws_leg.column_dimensions["B"].width = 22
    ws_leg.column_dimensions["C"].width = 60

    # --- Template sheet ---
    ws_tpl = wb.create_sheet("Modèle import")
    tpl_headers = ["SIREN", "SIRET", "Nom", "Adresse", "Code postal", "Ville", "Email"]
    ws_tpl.append(tpl_headers)
    for col_idx, _ in enumerate(tpl_headers, start=1):
        cell = ws_tpl.cell(row=1, column=col_idx)
        cell.fill = FILL_HEADER
        cell.font = Font(color="FFFFFF", bold=True)
        ws_tpl.column_dimensions[get_column_letter(col_idx)].width = 20
    ws_tpl.append(["", "35600000000048", "",             "", "", "", ""])
    ws_tpl.append(["542107651", "",     "Société Générale", "29 bd Haussmann", "75009", "Paris", ""])
    ws_tpl.append(["380129866", "",     "Carrefour",        "",                "91300", "",      "einvoice@example.com"])

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
    table.add_column("Statut",          style="bold", min_width=22)
    table.add_column("Nombre",          justify="right")
    table.add_column("Exemples SIREN",  min_width=36)

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

    total_populated = sum(len(r.populated_fields) for r in results)
    if total_populated:
        console.print(
            f"  [cyan]→ {total_populated} champ(s) complété(s) depuis l'annuaire[/] "
            f"(cellules bleues dans le rapport)"
        )


def main() -> None:
    args = parse_args()

    if not args.input.exists():
        console.print(f"[bold red]Erreur :[/] Fichier introuvable : {args.input}")
        sys.exit(1)

    if args.output is None:
        date_str = datetime.now().strftime("%Y%m%d_%H%M")
        args.output = args.input.parent / f"{args.input.stem}_rapport_{date_str}.xlsx"

    console.print(f"\n[bold]Chargement du fichier :[/] {args.input}")
    customers = load_customers(args.input)
    derived = sum(1 for c in customers if c.siren_source != "fichier")
    console.print(f"  → {len(customers)} client(s) chargé(s)"
                  + (f" (dont {derived} SIREN dérivé(s) du SIRET)" if derived else ""))

    if args.dry_run:
        table = Table(title="Aperçu (dry-run)", show_header=True)
        for col in ("SIREN", "Source", "SIRET", "Nom", "Code postal", "Ville"):
            table.add_column(col)
        for c in customers[:20]:
            table.add_row(c.siren, c.siren_source, c.siret, c.nom, c.code_postal, c.ville)
        if len(customers) > 20:
            console.print(f"  … (affichage limité à 20 sur {len(customers)})")
        console.print(table)
        return

    if not API_KEY:
        console.print("[bold yellow]Attention :[/] ANNUAIRE_API_KEY n'est pas défini. "
                      "Les appels API pourraient échouer selon la configuration du serveur.")

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

    _print_summary(results)
    write_report(results, args.output)
    console.print(f"\n[bold green]Rapport généré :[/] {args.output}\n")


if __name__ == "__main__":
    main()
