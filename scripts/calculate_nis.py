import argparse
import calendar
import csv
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any


MONEY = Decimal("0.01")


@dataclass
class Employee:
    employee_id: str
    surname: str
    first_name: str
    nis_number: str
    date_of_birth: str
    date_employed: str
    monthly_salary: Decimal
    active: bool

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.surname}"


@dataclass
class RateBracket:
    nis_class: str
    monthly_min: Decimal
    monthly_max: Decimal | None
    employee_weekly: Decimal
    employer_weekly: Decimal
    total_weekly: Decimal


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


def load_simple_employee_yaml(path: Path) -> list[Employee]:
    employees: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
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

    required = {
        "employee_id",
        "surname",
        "first_name",
        "nis_number",
        "date_of_birth",
        "date_employed",
        "monthly_salary",
        "active",
    }
    parsed: list[Employee] = []
    for row in employees:
        missing = sorted(required - set(row))
        if missing:
            employee_label = row.get("employee_id", "<unknown>")
            raise ValueError(f"Employee {employee_label} is missing fields: {', '.join(missing)}")
        parsed.append(
            Employee(
                employee_id=str(row["employee_id"]),
                surname=str(row["surname"]),
                first_name=str(row["first_name"]),
                nis_number=str(row["nis_number"]),
                date_of_birth=str(row["date_of_birth"]),
                date_employed=str(row["date_employed"]),
                monthly_salary=Decimal(str(row["monthly_salary"])),
                active=bool(row["active"]),
            )
        )
    return parsed


def load_rates(path: Path) -> list[RateBracket]:
    rates: list[RateBracket] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rates.append(
                RateBracket(
                    nis_class=row["class"],
                    monthly_min=Decimal(row["monthly_min"]),
                    monthly_max=Decimal(row["monthly_max"]) if row["monthly_max"] else None,
                    employee_weekly=Decimal(row["employee_weekly"]),
                    employer_weekly=Decimal(row["employer_weekly"]),
                    total_weekly=Decimal(row["total_weekly"]),
                )
            )
    return rates


def count_mondays(year: int, month: int) -> int:
    _, last_day = calendar.monthrange(year, month)
    return sum(1 for day in range(1, last_day + 1) if date(year, month, day).weekday() == 0)


def last_day_of_month(year: int, month: int) -> str:
    _, last_day = calendar.monthrange(year, month)
    return date(year, month, last_day).isoformat()


def find_rate(rates: list[RateBracket], salary: Decimal) -> RateBracket:
    for rate in rates:
        if salary >= rate.monthly_min and (rate.monthly_max is None or salary <= rate.monthly_max):
            return rate
    raise ValueError(f"No NIS rate bracket found for monthly salary {salary}")


def validate_employee(employee: Employee, contribution_month_start: date) -> None:
    if not employee.active:
        return
    if not employee.nis_number.strip():
        raise ValueError(f"{employee.employee_id} is active but has no NIS number")
    if employee.monthly_salary <= 0:
        raise ValueError(f"{employee.employee_id} has a non-positive monthly salary")
    employed = date.fromisoformat(employee.date_employed)
    if employed > contribution_month_start:
        raise ValueError(
            f"{employee.employee_id} date_employed {employee.date_employed} is after the contribution month"
        )


def write_changes_file(path: Path, month: str, no_changes: bool) -> None:
    if path.exists():
        return
    text = (
        f'month: "{month}"\n'
        f"confirmed_no_changes: {'true' if no_changes else 'false'}\n"
        'notes: ""\n'
    )
    path.write_text(text, encoding="utf-8")


def calculate(args: argparse.Namespace) -> None:
    year_text, month_text = args.month.split("-", 1)
    year = int(year_text)
    month = int(month_text)
    contribution_month_start = date(year, month, 1)
    monday_count = count_mondays(year, month)
    month_end = last_day_of_month(year, month)

    employees = load_simple_employee_yaml(Path(args.employees))
    rates = load_rates(Path(args.rates))

    rows: list[dict[str, str]] = []
    totals = {
        "employee": Decimal("0"),
        "employer": Decimal("0"),
        "total": Decimal("0"),
    }

    for employee in employees:
        validate_employee(employee, contribution_month_start)
        if not employee.active:
            continue
        rate = find_rate(rates, employee.monthly_salary)
        employee_contribution = money(rate.employee_weekly * monday_count)
        employer_contribution = money(rate.employer_weekly * monday_count)
        total_contribution = money(rate.total_weekly * monday_count)
        if money(employee_contribution + employer_contribution) != total_contribution:
            raise ValueError(f"Contribution total mismatch for {employee.employee_id}")

        totals["employee"] += employee_contribution
        totals["employer"] += employer_contribution
        totals["total"] += total_contribution
        rows.append(
            {
                "month": args.month,
                "employee_id": employee.employee_id,
                "surname": employee.surname,
                "first_name": employee.first_name,
                "full_name": employee.full_name,
                "nis_number": employee.nis_number,
                "date_of_birth": employee.date_of_birth,
                "date_employed": employee.date_employed,
                "last_work_date": month_end,
                "monthly_salary": f"{money(employee.monthly_salary):.2f}",
                "nis_class": rate.nis_class,
                "monday_count": str(monday_count),
                "employee_weekly": f"{rate.employee_weekly:.2f}",
                "employer_weekly": f"{rate.employer_weekly:.2f}",
                "total_weekly": f"{rate.total_weekly:.2f}",
                "employee_contribution": f"{employee_contribution:.2f}",
                "employer_contribution": f"{employer_contribution:.2f}",
                "total_contribution": f"{total_contribution:.2f}",
            }
        )

    output_dir = Path(args.output_dir) / args.month
    output_dir.mkdir(parents=True, exist_ok=True)
    write_changes_file(output_dir / "changes.yml", args.month, args.no_changes)

    calculations_path = output_dir / "calculations.csv"
    fieldnames = list(rows[0].keys()) if rows else [
        "month",
        "employee_id",
        "surname",
        "first_name",
        "full_name",
        "nis_number",
        "date_of_birth",
        "date_employed",
        "last_work_date",
        "monthly_salary",
        "nis_class",
        "monday_count",
        "employee_weekly",
        "employer_weekly",
        "total_weekly",
        "employee_contribution",
        "employer_contribution",
        "total_contribution",
    ]
    with calculations_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    summary_path = output_dir / "summary.md"
    summary_lines = [
        f"# NIS Summary for {args.month}",
        "",
        f"- Mondays counted: {monday_count}",
        f"- Active employees included: {len(rows)}",
        f"- Employee contributions: {money(totals['employee']):.2f}",
        f"- Employer contributions: {money(totals['employer']):.2f}",
        f"- Total contributions: {money(totals['total']):.2f}",
        "",
        "## Employees",
        "",
        "| Employee ID | Name | Salary | Class | Employee | Employer | Total |",
        "|---|---|---:|---|---:|---:|---:|",
    ]
    for row in rows:
        summary_lines.append(
            "| {employee_id} | {full_name} | {monthly_salary} | {nis_class} | "
            "{employee_contribution} | {employer_contribution} | {total_contribution} |".format(**row)
        )
    summary_path.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")

    print(f"Wrote {calculations_path}")
    print(f"Wrote {summary_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Calculate monthly NIS contributions.")
    parser.add_argument("--month", required=True, help="Contribution month in YYYY-MM format.")
    parser.add_argument("--employees", default="data/employees.yml")
    parser.add_argument("--rates", default="data/nis_rates_2026.csv")
    parser.add_argument("--output-dir", default="runs")
    parser.add_argument(
        "--no-changes",
        action="store_true",
        help="Create changes.yml confirming no changes if one does not exist.",
    )
    calculate(parser.parse_args())


if __name__ == "__main__":
    main()
