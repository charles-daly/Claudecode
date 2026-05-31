"""Generate a sample customers.xlsx for testing the annuaire matcher."""

import sys
from pathlib import Path

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter
except ImportError:
    print("Run: pip install openpyxl")
    sys.exit(1)

SAMPLE_ROWS = [
    # Real-looking but fictitious French company data
    ("356000000", "35600000000048", "Orange SA",          "78 rue Olivier de Serres", "75015", "Paris",    "facturation@orange.fr"),
    ("542107651", "54210765100015", "Société Générale",   "29 boulevard Haussmann",   "75009", "Paris",    "factures@socgen.com"),
    ("380129866", "38012986600020", "Carrefour SA",        "93 avenue de Paris",       "91300", "Massy",    "einvoice@carrefour.com"),
    ("423764738", "",               "Ma PME SARL",         "12 rue du Commerce",       "69002", "Lyon",     ""),
    ("000000001", "",               "SIREN invalide test", "",                          "",      "",         ""),  # will be skipped
]

HEADERS = ["SIREN", "SIRET", "Nom", "Adresse", "Code postal", "Ville", "Email"]
FILL_HDR = PatternFill("solid", fgColor="1F4E79")

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Clients"

ws.append(HEADERS)
for col_idx, _ in enumerate(HEADERS, start=1):
    cell = ws.cell(row=1, column=col_idx)
    cell.fill = FILL_HDR
    cell.font = Font(color="FFFFFF", bold=True)
    ws.column_dimensions[get_column_letter(col_idx)].width = 22

for row in SAMPLE_ROWS:
    ws.append(list(row))

out = Path("customers_sample.xlsx")
wb.save(out)
print(f"Sample file written: {out}")
