import argparse
import calendar
import csv
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any


MONEY = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def parse_scalar(value: str) -> Any:
    text = value.strip()
    if text.startswith('"') and text.endswith('"'):
        return text[1:-1]
    if text.lower() == "true":
        return True
    if text.lower() == "false":
        return False
    if text == "":
        return ""
    try:
        if "." in text:
            return Decimal(text)
        return int(text)
    except Exception:
        return text


def load_employee_records(path: Path) -> dict[str, dict[str, Any]]:
    employees: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#") or stripped == "employees:":
            continue
        if stripped.startswith("- "):
            if current:
                employees.append(current)
            current = {}
            field_text = stripped[2:]
            if field_text:
                key, value = field_text.split(":", 1)
                current[key.strip()] = parse_scalar(value)
            continue
        if current is not None and ":" in stripped:
            key, value = stripped.split(":", 1)
            current[key.strip()] = parse_scalar(value)

    if current:
        employees.append(current)

    return {str(employee["employee_id"]): employee for employee in employees}


def load_tax_settings(path: Path) -> dict[str, Any]:
    settings: dict[str, Any] = {}
    current_section: dict[str, Any] | None = None
    current_list_key = ""
    current_item: dict[str, Any] | None = None

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip() or raw_line.strip().startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        stripped = raw_line.strip()

        if indent == 0:
            key, value = stripped.split(":", 1)
            key = key.strip()
            value = value.strip()
            if value:
                settings[key] = parse_scalar(value)
                current_section = None
            else:
                current_section = {}
                settings[key] = current_section
            current_list_key = ""
            current_item = None
            continue

        if current_section is None:
            raise ValueError(f"Unexpected nested setting in {path}: {raw_line}")

        if stripped.startswith("- "):
            if not current_list_key:
                raise ValueError(f"Unexpected list item in {path}: {raw_line}")
            current_item = {}
            current_section[current_list_key].append(current_item)
            item_text = stripped[2:]
            if item_text:
                key, value = item_text.split(":", 1)
                current_item[key.strip()] = parse_scalar(value)
            continue

        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()

        if indent == 2:
            if value:
                current_section[key] = parse_scalar(value)
                current_list_key = ""
                current_item = None
            else:
                current_section[key] = []
                current_list_key = key
                current_item = None
        elif indent == 6 and current_item is not None:
            current_item[key] = parse_scalar(value)
        else:
            raise ValueError(f"Unsupported settings structure in {path}: {raw_line}")

    return settings


def decimal_field(record: dict[str, Any], key: str) -> Decimal:
    value = record.get(key, "")
    if value in ("", None):
        return Decimal("0")
    return Decimal(str(value))


def bool_field(record: dict[str, Any], key: str) -> bool:
    value = record.get(key, "")
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "yes", "1"}


def age_at(dob_text: str, as_of: date) -> int | None:
    if not dob_text:
        return None
    dob = date.fromisoformat(dob_text)
    return as_of.year - dob.year - ((as_of.month, as_of.day) < (dob.month, dob.day))


def last_day_of_month(year: int, month: int) -> date:
    _, last_day = calendar.monthrange(year, month)
    return date(year, month, last_day)


def calculate_annual_tax(chargeable_income: Decimal, bands: list[dict[str, Any]]) -> Decimal:
    total = Decimal("0")
    remaining = chargeable_income
    previous_cap = Decimal("0")

    for band in bands:
        if remaining <= 0:
            break
        annual_max = band.get("annual_max", "")
        rate = Decimal(str(band["rate"]))
        if annual_max in ("", None):
            taxable_in_band = remaining
        else:
            cap = Decimal(str(annual_max))
            taxable_in_band = min(remaining, cap - previous_cap)
            previous_cap = cap
        total += taxable_in_band * rate
        remaining -= taxable_in_band

    return money(total)


def calculate_health_surcharge(
    employee: dict[str, Any],
    monthly_salary: Decimal,
    monday_count: int,
    month_end: date,
    settings: dict[str, Any],
) -> Decimal:
    health = settings["health_surcharge"]
    employee_age = age_at(str(employee.get("date_of_birth", "")), month_end)
    if bool_field(employee, "health_surcharge_exempt"):
        return Decimal("0.00")
    if employee_age is not None and employee_age < int(health["exempt_under_age"]):
        return Decimal("0.00")
    if employee_age is not None and employee_age >= int(health["exempt_age_at_or_above"]):
        return Decimal("0.00")

    monthly_threshold = Decimal(str(health["monthly_threshold"]))
    weekly_rate = (
        Decimal(str(health["higher_weekly_rate"]))
        if monthly_salary > monthly_threshold
        else Decimal(str(health["lower_weekly_rate"]))
    )
    return money(weekly_rate * monday_count)


def calculate(args: argparse.Namespace) -> None:
    year_text, month_text = args.month.split("-", 1)
    year = int(year_text)
    month = int(month_text)
    month_end = last_day_of_month(year, month)

    run_dir = Path(args.output_dir) / args.month
    nis_path = run_dir / "calculations.csv"
    if not nis_path.exists():
        raise FileNotFoundError(f"Run NIS calculation first: {nis_path}")

    employees = load_employee_records(Path(args.employees))
    settings = load_tax_settings(Path(args.tax_settings))
    personal_allowance = Decimal(str(settings["paye"]["personal_allowance_annual"]))
    periods = Decimal(str(settings["paye"]["standard_periods_per_year"]))
    bands = settings["paye"]["chargeable_income_bands"]

    rows: list[dict[str, str]] = []
    totals = {
        "gross": Decimal("0"),
        "nis_employee": Decimal("0"),
        "paye": Decimal("0"),
        "health_surcharge": Decimal("0"),
        "deductions": Decimal("0"),
        "net_pay": Decimal("0"),
        "nis_employer": Decimal("0"),
    }

    with nis_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for nis_row in reader:
            employee_id = nis_row["employee_id"]
            employee = employees.get(employee_id, {})
            monthly_salary = Decimal(nis_row["monthly_salary"])
            monday_count = int(nis_row["monday_count"])
            annual_income = monthly_salary * periods
            td1_allowances = decimal_field(employee, "td1_annual_allowances")
            pension = decimal_field(employee, "approved_pension_or_annuity")
            chargeable_income = max(Decimal("0"), annual_income - personal_allowance - td1_allowances - pension)
            annual_paye = calculate_annual_tax(chargeable_income, bands)
            monthly_paye = money(annual_paye / periods)
            health_surcharge = calculate_health_surcharge(employee, monthly_salary, monday_count, month_end, settings)
            nis_employee = Decimal(nis_row["employee_contribution"])
            nis_employer = Decimal(nis_row["employer_contribution"])
            total_deductions = money(nis_employee + monthly_paye + health_surcharge)
            net_pay = money(monthly_salary - total_deductions)

            row = {
                "month": args.month,
                "employee_id": employee_id,
                "full_name": nis_row["full_name"],
                "nis_number": nis_row["nis_number"],
                "bir_number": str(employee.get("bir_number", "")),
                "regular_earnings": f"{money(monthly_salary):.2f}",
                "gross_pay": f"{money(monthly_salary):.2f}",
                "annualized_income": f"{money(annual_income):.2f}",
                "annual_personal_allowance": f"{money(personal_allowance):.2f}",
                "td1_annual_allowances": f"{money(td1_allowances):.2f}",
                "approved_pension_or_annuity": f"{money(pension):.2f}",
                "annual_chargeable_income": f"{money(chargeable_income):.2f}",
                "annual_paye": f"{annual_paye:.2f}",
                "paye": f"{monthly_paye:.2f}",
                "nis_employee": f"{nis_employee:.2f}",
                "health_surcharge": f"{health_surcharge:.2f}",
                "total_deductions": f"{total_deductions:.2f}",
                "net_pay": f"{net_pay:.2f}",
                "nis_employer": f"{nis_employer:.2f}",
            }
            rows.append(row)
            totals["gross"] += monthly_salary
            totals["nis_employee"] += nis_employee
            totals["paye"] += monthly_paye
            totals["health_surcharge"] += health_surcharge
            totals["deductions"] += total_deductions
            totals["net_pay"] += net_pay
            totals["nis_employer"] += nis_employer

    payroll_path = run_dir / "payroll.csv"
    fieldnames = list(rows[0].keys()) if rows else [
        "month",
        "employee_id",
        "full_name",
        "nis_number",
        "bir_number",
        "regular_earnings",
        "gross_pay",
        "annualized_income",
        "annual_personal_allowance",
        "td1_annual_allowances",
        "approved_pension_or_annuity",
        "annual_chargeable_income",
        "annual_paye",
        "paye",
        "nis_employee",
        "health_surcharge",
        "total_deductions",
        "net_pay",
        "nis_employer",
    ]
    with payroll_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    summary_path = run_dir / "payroll-summary.md"
    summary_lines = [
        f"# Payroll Summary for {args.month}",
        "",
        f"- Active employees included: {len(rows)}",
        f"- Gross pay: {money(totals['gross']):.2f}",
        f"- Employee NIS deductions: {money(totals['nis_employee']):.2f}",
        f"- PAYE deductions: {money(totals['paye']):.2f}",
        f"- Health Surcharge deductions: {money(totals['health_surcharge']):.2f}",
        f"- Total employee deductions: {money(totals['deductions']):.2f}",
        f"- Net pay: {money(totals['net_pay']):.2f}",
        f"- Employer NIS cost: {money(totals['nis_employer']):.2f}",
        "",
        "## Employees",
        "",
        "| Employee ID | Name | Gross | NIS | PAYE | Health Surcharge | Net Pay |",
        "|---|---|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        summary_lines.append(
            "| {employee_id} | {full_name} | {gross_pay} | {nis_employee} | "
            "{paye} | {health_surcharge} | {net_pay} |".format(**row)
        )
    summary_path.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")

    print(f"Wrote {payroll_path}")
    print(f"Wrote {summary_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Calculate monthly payroll, PAYE, Health Surcharge, and net pay.")
    parser.add_argument("--month", required=True, help="Payroll month in YYYY-MM format.")
    parser.add_argument("--employees", default="data/employees.yml")
    parser.add_argument("--tax-settings", default="data/tax_settings.yml")
    parser.add_argument("--output-dir", default="runs")
    calculate(parser.parse_args())


if __name__ == "__main__":
    main()
