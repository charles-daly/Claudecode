"""
PMA Parameter Intelligence — Summary Generator
Reads pma_parameter_intelligence.json and prints a formatted human-readable report.
Usage: python pma_parameter_intelligence_summary.py [--id PMA-001]
"""

import json
import sys
from pathlib import Path

DATA_FILE = Path(__file__).parent / "pma_parameter_intelligence.json"

RISK_LABELS = {
    "PMA-001": "CRITICAL",
    "PMA-002": "CRITICAL",
    "PMA-003": "CRITICAL",
    "PMA-004": "HIGH",
    "PMA-005": "HIGH",
    "PMA-006": "HIGH",
    "PMA-007": "MEDIUM",
    "PMA-008": "HIGH",
    "PMA-009": "MEDIUM",
    "PMA-010": "MEDIUM",
    "PMA-011": "HIGH",
    "PMA-012": "MEDIUM",
}

SEPARATOR = "─" * 72


def format_journal(journal: dict) -> str:
    lines = [f"  Trigger : {journal.get('trigger', journal.get('commitment', {}).get('note', '—'))}"]
    for key in ("entries", "entries_cost_posting", "entries_invoice_posted",
                "on_account_method", "product_receipt", "invoice_match"):
        entries = journal.get(key)
        if not entries:
            continue
        label = {
            "entries": "Entries",
            "entries_cost_posting": "Cost Posting",
            "entries_invoice_posted": "Invoice Posting",
            "on_account_method": "On-Account Method",
            "product_receipt": "Product Receipt",
            "invoice_match": "Invoice Match",
        }.get(key, key)
        lines.append(f"  {label}:")
        for e in entries:
            date_note = f"  [{e['posting_date']}]" if "posting_date" in e else ""
            extra = f"  ({e['note']})" if "note" in e else ""
            lines.append(f"    {e['direction']:2}  {e['account']:<40}  {e['amount']:>10,}{date_note}{extra}")
    if "note" in journal:
        lines.append(f"  Note    : {journal['note']}")
    return "\n".join(lines)


def print_parameter(p: dict) -> None:
    risk = RISK_LABELS.get(p["id"], "")
    risk_tag = f"  [{risk}]" if risk else ""
    print(SEPARATOR)
    print(f"  {p['id']}  |  {p['name']}{risk_tag}")
    print(SEPARATOR)
    print(f"  Tab        : {p['tab']}")
    print(f"  Field      : {p.get('field_name', '—')}")
    print(f"  Type       : {p['type']}")
    if "default" in p:
        print(f"  Default    : {p['default']}")
    if "options" in p:
        print(f"  Options    : {' | '.join(p['options'])}")
    print()
    print("  WHAT IT DOES")
    print(f"  {p['explanation']}")
    print()
    print("  ACCOUNTING IMPACT")
    impact = p["accounting_impact"]
    if isinstance(impact, str):
        print(f"  {impact}")
    else:
        for k, v in impact.items():
            print(f"  [{k}]  {v}")
    print()
    print("  EXAMPLE JOURNAL ENTRY")
    print(format_journal(p["example_journal"]))
    print()
    print("  DEPENDENCIES")
    for dep in p["dependencies"]:
        print(f"  •  {dep}")
    print()


def print_index(data: dict) -> None:
    print()
    print(f"  PMA PARAMETER INTELLIGENCE MODULE  —  v{data['version']}")
    print(f"  {data['navigation_root']}")
    print(f"  {data['localization']}")
    print()
    print(f"  {'ID':<10} {'Risk':<10} {'Tab':<18} Name")
    print(f"  {'──':<10} {'────':<10} {'───':<18} ────")
    for p in data["parameters"]:
        risk = RISK_LABELS.get(p["id"], "")
        print(f"  {p['id']:<10} {risk:<10} {p['tab']:<18} {p['name']}")
    stats = data["summary_stats"]
    print()
    print(f"  Parameters : {stats['total_parameters']}")
    print(f"  Must configure before go-live : {', '.join(stats['must_configure_before_go_live'])}")
    print()


def main() -> None:
    data = json.loads(DATA_FILE.read_text())

    filter_id = None
    if "--id" in sys.argv:
        idx = sys.argv.index("--id")
        if idx + 1 < len(sys.argv):
            filter_id = sys.argv[idx + 1].upper()

    print_index(data)

    for p in data["parameters"]:
        if filter_id and p["id"] != filter_id:
            continue
        print_parameter(p)

    print(SEPARATOR)
    print()


if __name__ == "__main__":
    main()
