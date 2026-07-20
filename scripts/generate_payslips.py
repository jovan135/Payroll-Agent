import argparse
import csv
import html
from pathlib import Path
from typing import Any


def parse_scalar(value: str) -> Any:
    text = value.strip()
    if text.startswith('"') and text.endswith('"'):
        return text[1:-1]
    if text == "":
        return ""
    return text


def load_employer(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    section = ""
    nested_section = ""

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        if stripped.endswith(":"):
            key = stripped[:-1]
            if indent == 0:
                section = key
                nested_section = ""
            else:
                nested_section = key
            continue
        if ":" in stripped:
            if indent <= 2:
                nested_section = ""
            key, value = stripped.split(":", 1)
            parts = [part for part in [section, nested_section, key.strip()] if part]
            data[".".join(parts)] = str(parse_scalar(value))
    return data


def money(value: str) -> str:
    return f"TTD {value}"


def payslip_html(row: dict[str, str], employer: dict[str, str]) -> str:
    safe = {key: html.escape(value) for key, value in row.items()}
    trade_name = html.escape(employer.get("employer.trade_name", ""))
    address = ", ".join(
        part
        for part in [
            employer.get("employer.address.line1", ""),
            employer.get("employer.address.city", ""),
        ]
        if part
    )
    telephone = html.escape(employer.get("employer.telephone", ""))
    employer_reg = html.escape(employer.get("employer.registration_number", ""))

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Payslip - {safe['full_name']} - {safe['month']}</title>
  <style>
    body {{ font-family: Arial, sans-serif; color: #17202a; margin: 32px; }}
    .sheet {{ max-width: 760px; margin: 0 auto; border: 1px solid #b8c0cc; padding: 28px; }}
    header {{ display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #17202a; padding-bottom: 16px; }}
    h1 {{ font-size: 22px; margin: 0 0 8px; }}
    h2 {{ font-size: 16px; margin: 24px 0 8px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
    td, th {{ padding: 8px; border-bottom: 1px solid #d8dee8; text-align: left; }}
    td:last-child, th:last-child {{ text-align: right; }}
    .meta {{ display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin-top: 18px; }}
    .net {{ font-size: 20px; font-weight: 700; text-align: right; margin-top: 24px; }}
    .muted {{ color: #5d6978; font-size: 13px; }}
  </style>
</head>
<body>
  <section class="sheet">
    <header>
      <div>
        <h1>{trade_name}</h1>
        <div class="muted">{html.escape(address)}</div>
        <div class="muted">Tel: {telephone}</div>
      </div>
      <div>
        <strong>Payslip</strong><br>
        <span class="muted">Period: {safe['month']}</span><br>
        <span class="muted">Employer Reg: {employer_reg}</span>
      </div>
    </header>

    <div class="meta">
      <div><strong>Employee</strong><br>{safe['full_name']}</div>
      <div><strong>Employee ID</strong><br>{safe['employee_id']}</div>
      <div><strong>NIS Number</strong><br>{safe['nis_number']}</div>
      <div><strong>BIR Number</strong><br>{safe['bir_number']}</div>
    </div>

    <h2>Earnings</h2>
    <table>
      <tr><th>Description</th><th>Amount</th></tr>
      <tr><td>Regular monthly salary</td><td>{money(safe['regular_earnings'])}</td></tr>
      <tr><td><strong>Gross Pay</strong></td><td><strong>{money(safe['gross_pay'])}</strong></td></tr>
    </table>

    <h2>Deductions</h2>
    <table>
      <tr><th>Description</th><th>Amount</th></tr>
      <tr><td>NIS employee contribution</td><td>{money(safe['nis_employee'])}</td></tr>
      <tr><td>PAYE</td><td>{money(safe['paye'])}</td></tr>
      <tr><td>Health Surcharge</td><td>{money(safe['health_surcharge'])}</td></tr>
      <tr><td><strong>Total Deductions</strong></td><td><strong>{money(safe['total_deductions'])}</strong></td></tr>
    </table>

    <div class="net">Net Pay: {money(safe['net_pay'])}</div>

    <h2>Employer Contributions</h2>
    <table>
      <tr><td>Employer NIS contribution</td><td>{money(safe['nis_employer'])}</td></tr>
    </table>
  </section>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate HTML payslips from monthly payroll.csv.")
    parser.add_argument("--month", required=True, help="Payroll month in YYYY-MM format.")
    parser.add_argument("--employer", default="data/employer.yml")
    parser.add_argument("--output-dir", default="runs")
    args = parser.parse_args()

    run_dir = Path(args.output_dir) / args.month
    payroll_path = run_dir / "payroll.csv"
    if not payroll_path.exists():
        raise FileNotFoundError(f"Run calculate_payroll.py first: {payroll_path}")

    employer = load_employer(Path(args.employer))
    payslip_dir = run_dir / "payslips"
    payslip_dir.mkdir(parents=True, exist_ok=True)

    with payroll_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            filename = f"{row['employee_id']}-{row['month']}-payslip.html"
            path = payslip_dir / filename
            path.write_text(payslip_html(row, employer), encoding="utf-8")
            print(f"Wrote {path}")


if __name__ == "__main__":
    main()
