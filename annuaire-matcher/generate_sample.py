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

# Columns: SIREN, SIRET, Nom, Adresse, Code postal, Ville, Email
# Rows intentionally have varying levels of completeness to demo auto-population
SAMPLE_ROWS = [
    # Full data — everything provided, tool will compare all fields
    ("356000000", "35600000000048", "Orange SA",       "78 rue Olivier de Serres", "75015", "Paris",  "facturation@orange.fr"),
    # SIRET only, no SIREN — SIREN will be derived from first 9 digits of SIRET
    ("",          "54210765100015", "",                "",                          "",      "",       ""),
    # SIREN + name only — code_postal and ville will be populated from annuaire
    ("380129866", "",               "Carrefour SA",    "",                          "",      "",       "einvoice@carrefour.com"),
    # SIREN + partial address — ville will be populated
    ("423764738", "",               "Ma PME SARL",     "12 rue du Commerce",        "69002", "",       ""),
    # SIREN only — all other fields populated from annuaire
    ("572073396", "",               "",                "",                          "",      "",       ""),
]

HEADERS = ["SIREN", "SIRET", "Nom", "Adresse", "Code postal", "Ville", "Email"]
FILL_HDR = PatternFill("solid", fgColor="1F4E79")

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Clients"

ws.append(HEADERS)
for col_idx in range(1, len(HEADERS) + 1):
    cell = ws.cell(row=1, column=col_idx)
    cell.fill = FILL_HDR
    cell.font = Font(color="FFFFFF", bold=True)
    ws.column_dimensions[get_column_letter(col_idx)].width = 22

for row in SAMPLE_ROWS:
    ws.append(list(row))

out = Path("customers_sample.xlsx")
wb.save(out)
print(f"Sample file written: {out}")
print("Row breakdown:")
print("  Row 2: Full data (all fields)")
print("  Row 3: SIRET only — SIREN derived automatically")
print("  Row 4: SIREN + name — address fields populated from annuaire")
print("  Row 5: SIREN + partial address — ville populated from annuaire")
print("  Row 6: SIREN only — all other fields populated from annuaire")
