"""
PMA Transaction Behavior Matrix — Summary Generator
Reads pma_transaction_matrix.json and prints a formatted human-readable report.
Usage:
  python pma_transaction_matrix_summary.py              # full report
  python pma_transaction_matrix_summary.py --matrix     # grid only
  python pma_transaction_matrix_summary.py --id TM-HR   # single cell
  python pma_transaction_matrix_summary.py --notes      # logic notes only
"""

import json
import sys
from pathlib import Path

DATA_FILE = Path(__file__).parent / "pma_transaction_matrix.json"
SEP = "─" * 72
THIN = "·" * 72

RESULT_COLORS = {
    "Cost":           "COST  ",
    "Revenue":        "REV   ",
    "WIP":            "WIP   ",
    "Accrual":        "ACCRL ",
    "Not Applicable": "N/A   ",
}

PHASE_LABEL = {
    "phase_1_cost_posting":           "Phase 1 — Cost Posting",
    "phase_1_cost_to_wip":            "Phase 1 — Cost → WIP",
    "phase_1_inventory_to_wip":       "Phase 1 — Inventory → WIP",
    "phase_1_advance_billing":        "Phase 1 — Advance Billing",
    "phase_1_milestone_invoice":      "Phase 1 — Milestone Invoice",
    "phase_1_estimate_run":           "Phase 1 — Estimate Run",
    "phase_1_estimate_run_including_fee": "Phase 1 — Estimate Run (Fee included)",
    "phase_1_standard_internal":      "Phase 1 — Standard Internal",
    "phase_1_investment_subtype":     "Phase 1 — Investment Sub-type",
    "phase_1_invoice":                "Phase 1 — Invoice Posted",
    "phase_2_invoice":                "Phase 2 — Customer Invoice",
    "phase_2_estimate_run":           "Phase 2 — Estimate Run",
    "phase_2_estimate_run_same_period": "Phase 2 — Estimate Run (same period)",
    "phase_2_matching_on_final_invoice": "Phase 2 — Match on Final Invoice",
    "phase_3_project_elimination":    "Phase 3 — Project Elimination",
}


def format_entries(entries: list) -> str:
    lines = []
    for e in entries:
        note = f"  ({e['note']})" if "note" in e else ""
        lines.append(f"      {e['direction']:2}  {e['account']:<44}  {e['amount']:>9,}{note}")
    return "\n".join(lines)


def format_journal(journal: dict | None) -> str:
    if not journal:
        return "  (no journal — not applicable)"
    lines = []
    for key, value in journal.items():
        if not isinstance(value, dict):
            continue
        label = PHASE_LABEL.get(key, key)
        trigger = value.get("trigger", "")
        entries = value.get("entries", [])
        note = value.get("note", "")
        lines.append(f"  {label}")
        lines.append(f"    Trigger : {trigger}")
        if entries:
            lines.append(format_entries(entries))
        if note:
            lines.append(f"    Note    : {note}")
        lines.append("")
    return "\n".join(lines).rstrip()


def print_cell(cell: dict, project_type: str) -> None:
    tag = RESULT_COLORS.get(cell["result_type"], "      ")
    print(SEP)
    print(f"  {cell['id']}  [{tag}]  {project_type} / {cell['transaction_type']}")
    print(SEP)
    phases = cell.get("lifecycle_phases", [])
    if phases:
        print("  Lifecycle  :  " + "  →  ".join(phases))
    print()
    print("  BEHAVIOUR")
    print(f"  {cell['explanation']}")
    print()
    print("  ACCOUNTING IMPACT")
    print(f"  {cell['accounting_impact']}")
    print()
    print("  JOURNAL ENTRIES")
    print(format_journal(cell.get("example_journal")))
    print()


def print_matrix(data: dict) -> None:
    qr = data["quick_reference"]
    col_w = 18
    header = f"  {'Project Type':<20}" + "".join(f"{h:<{col_w}}" for h in qr["headers"][1:])
    print()
    print(f"  {'─'*20}" + "─" * (col_w * len(qr["headers"][1:])))
    print(header)
    print(f"  {'─'*20}" + "─" * (col_w * len(qr["headers"][1:])))
    for row in qr["rows"]:
        print(f"  {row[0]:<20}" + "".join(f"{v:<{col_w}}" for v in row[1:]))
    print(f"  {'─'*20}" + "─" * (col_w * len(qr["headers"][1:])))
    print()
    print("  Result types:  COST = P&L debit   WIP = BS debit (deferred)")
    print("                 REV  = P&L credit   ACCRUAL = BS holding entry")
    print("                 N/A  = not applicable for this project type")
    print()


def print_logic_notes(data: dict) -> None:
    notes = data["logic_notes"]
    for key, note in notes.items():
        title = key.replace("_", " ").upper()
        print(SEP)
        print(f"  {title}")
        print(SEP)
        print(f"  Principle  :  {note.get('principle', '')}")
        print()
        explanation = note.get("explanation", "")
        words = explanation.split()
        line, current = [], 0
        for word in words:
            if current + len(word) + 1 > 66:
                print("  " + " ".join(line))
                line, current = [word], len(word)
            else:
                line.append(word)
                current += len(word) + 1
        if line:
            print("  " + " ".join(line))
        print()
        for extra_key in ("over_billed_state", "under_billed_state", "key_implication"):
            if extra_key in note:
                label = extra_key.replace("_", " ").capitalize()
                print(f"  {label} : {note[extra_key]}")
        print()


def main() -> None:
    data = json.loads(DATA_FILE.read_text())

    args = sys.argv[1:]
    show_matrix = "--matrix" in args
    show_notes = "--notes" in args
    filter_id = None
    if "--id" in args:
        idx = args.index("--id")
        if idx + 1 < len(args):
            filter_id = args[idx + 1].upper()

    # Header
    print()
    print(f"  PMA TRANSACTION BEHAVIOR MATRIX  —  v{data['version']}")
    print(f"  {data['description']}")
    print(f"  {data['localization']}")

    # Always show the grid unless a specific filter is active
    if not filter_id and not show_notes:
        print_matrix(data)

    if show_matrix:
        return

    # Logic notes section
    if show_notes or (not filter_id and not show_matrix):
        print_logic_notes(data)

    if show_notes:
        return

    # Full detail per cell
    for project in data["matrix"]:
        ptype = project["project_type"]
        print()
        print(SEP)
        print(f"  PROJECT TYPE : {ptype.upper()}")
        print(SEP)
        print(f"  {project['logic_summary']}")

        for cell in project["transactions"]:
            if filter_id and cell["id"] != filter_id:
                continue
            print()
            print_cell(cell, ptype)

    print(SEP)
    print()


if __name__ == "__main__":
    main()
