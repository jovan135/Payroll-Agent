import argparse
import calendar
import csv
import io
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import yaml
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def read_calculations(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def digits_only(value: str) -> str:
    return "".join(character for character in value if character.isdigit())


def month_bounds(month: str) -> tuple[date, date]:
    year_text, month_text = month.split("-", 1)
    year = int(year_text)
    month_number = int(month_text)
    _, last_day = calendar.monthrange(year, month_number)
    return date(year, month_number, 1), date(year, month_number, last_day)


def date_digits(value: date) -> str:
    return value.strftime("%Y%m%d")


def split_date(value: str) -> tuple[str, str, str]:
    parsed = date.fromisoformat(value)
    return parsed.strftime("%Y"), parsed.strftime("%m"), parsed.strftime("%d")


def money(value: str | Decimal) -> str:
    return f"{Decimal(str(value)):.2f}"


def draw_text(c: canvas.Canvas, field: dict[str, Any], value: str) -> None:
    x = float(field["x"])
    y = float(field["y"])
    size = float(field.get("size", 8))
    align = field.get("align", "left")
    c.setFont("Helvetica", size)
    if align == "right":
        c.drawRightString(x, y, value)
    elif align == "center":
        c.drawCentredString(x, y, value)
    else:
        c.drawString(x, y, value)


def draw_boxed(c: canvas.Canvas, field: dict[str, Any], value: str) -> None:
    y = float(field["y"])
    size = float(field.get("size", 8))
    align = field.get("align")
    c.setFont("Helvetica", size)
    if align == "center" and "step" not in field and "xs" not in field:
        c.drawCentredString(float(field["x"]), y, value)
        return
    if "xs" in field:
        for x, character in zip(field["xs"], value):
            c.drawCentredString(float(x), y, character)
        return
    x = float(field["x"])
    step = float(field["step"])
    for index, character in enumerate(value):
        c.drawCentredString(x + (index * step), y, character)


def draw_employee_row(c: canvas.Canvas, table: dict[str, Any], row_index: int, row: dict[str, str]) -> None:
    row_step = float(table["row_step"])
    rows_per_employee = int(table.get("rows_per_employee", 1))
    y = float(table["first_row_y"]) - (row_index * row_step * rows_per_employee)
    last_work_y = y + float(table.get("last_work_row_offset", -row_step))
    columns = table["columns"]
    size = float(table.get("size", 7))
    c.setFont("Helvetica", size)

    birth_year, birth_month, birth_day = split_date(row["date_of_birth"])
    employed_year, employed_month, employed_day = split_date(row["date_employed"])
    last_work_year, last_work_month, last_work_day = split_date(row["last_work_date"])
    monday_count = int(row["monday_count"])
    weekly_total = row["total_weekly"]

    values = {
        "nis_number": row["nis_number"],
        "surname": row["surname"],
        "first_name": row["first_name"],
        "birth_year": birth_year,
        "birth_month": birth_month,
        "birth_day": birth_day,
        "date_employed_year": employed_year,
        "date_employed_month": employed_month,
        "date_employed_day": employed_day,
        "last_work_year": last_work_year,
        "last_work_month": last_work_month,
        "last_work_day": last_work_day,
        "salary": money(row["monthly_salary"]),
        "week_1": weekly_total if monday_count >= 1 else "",
        "week_2": weekly_total if monday_count >= 2 else "",
        "week_3": weekly_total if monday_count >= 3 else "",
        "week_4": weekly_total if monday_count >= 4 else "",
        "week_5": weekly_total if monday_count >= 5 else "",
        "total": money(row["total_contribution"]),
    }

    for name, value in values.items():
        if not value:
            continue
        column = columns[name]
        x = float(column["x"])
        align = column.get("align", "left")
        draw_y = y
        if name.startswith("date_employed_"):
            c.setFont("Helvetica", float(table.get("date_size", size)))
            draw_y = y + float(table.get("date_employed_y_offset", 4))
        elif name.startswith("last_work_"):
            c.setFont("Helvetica", float(table.get("date_size", size)))
            draw_y = last_work_y
        else:
            c.setFont("Helvetica", size)
        if align == "right":
            c.drawRightString(x, draw_y, value)
        elif align == "center":
            c.drawCentredString(x, draw_y, value)
        else:
            c.drawString(x, draw_y, value)


def build_overlay(
    page_width: float,
    page_height: float,
    form_map: dict[str, Any],
    values: dict[str, str],
    rows: list[dict[str, str]],
) -> bytes:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(page_width, page_height))

    for name, field in form_map["text_fields"].items():
        value = values.get(name, "")
        if value:
            draw_text(c, field, value)

    for name, field in form_map["box_fields"].items():
        value = values.get(name, "")
        if value:
            draw_boxed(c, field, value)

    table = form_map["employee_table"]
    max_rows = int(table["max_rows"])
    rows_per_employee = int(table.get("rows_per_employee", 1))
    if len(rows) * rows_per_employee > max_rows:
        raise ValueError(
            f"NI184 map supports {max_rows} physical rows, but {len(rows)} employees "
            f"need {len(rows) * rows_per_employee} rows"
        )
    for index, row in enumerate(rows):
        draw_employee_row(c, table, index, row)

    c.save()
    buffer.seek(0)
    return buffer.read()


def fill_ni184(args: argparse.Namespace) -> Path:
    month = args.month
    calculations_path = Path(args.calculations) if args.calculations else Path("runs") / month / "calculations.csv"
    output_path = Path(args.output) if args.output else Path("runs") / month / "NI184-filled.pdf"

    employer_data = load_yaml(Path(args.employer))
    form_map = load_yaml(Path(args.map))
    rows = read_calculations(calculations_path)
    if not rows:
        raise ValueError(f"No calculation rows found in {calculations_path}")

    start_date, end_date = month_bounds(month)
    total_contributions = sum(Decimal(row["total_contribution"]) for row in rows)
    monday_count = rows[0]["monday_count"]
    employer = employer_data["employer"]
    address = employer["address"]
    declarant = employer_data["declarant"]

    values = {
        "employer_trade_name": employer["trade_name"],
        "address_line1": address["line1"],
        "address_line2": address.get("city", ""),
        "employer_registration_number": digits_only(employer["registration_number"]),
        "telephone": digits_only(employer["telephone"]),
        "period_from": date_digits(start_date),
        "period_to": date_digits(end_date),
        "weeks_in_period": str(monday_count).rjust(2, "0"),
        "total_employees": str(len(rows)),
        "total_contributions": money(total_contributions),
        "prepared_by_name": declarant["name"],
    }

    reader = PdfReader(args.template)
    writer = PdfWriter()
    first_page = reader.pages[0]
    if first_page.rotation:
        first_page.transfer_rotation_to_content()
    page_width = float(first_page.mediabox.width)
    page_height = float(first_page.mediabox.height)
    overlay_pdf = PdfReader(io.BytesIO(build_overlay(page_width, page_height, form_map, values, rows)))
    first_page.merge_page(overlay_pdf.pages[0])
    writer.add_page(first_page)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as handle:
        writer.write(handle)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Fill NI184 from monthly NIS calculations.")
    parser.add_argument("--month", required=True, help="Contribution month in YYYY-MM format.")
    parser.add_argument("--calculations", help="Path to calculations.csv. Defaults to runs/YYYY-MM/calculations.csv.")
    parser.add_argument("--employer", default="data/employer.yml")
    parser.add_argument("--template", default="templates/NI184.pdf")
    parser.add_argument("--map", default="references/ni184-form-map.yml")
    parser.add_argument("--output", help="Output PDF path. Defaults to runs/YYYY-MM/NI184-filled.pdf.")
    output = fill_ni184(parser.parse_args())
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
