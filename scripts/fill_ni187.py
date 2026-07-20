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


def money(value: Decimal) -> str:
    return f"{value:.2f}"


def month_bounds(month: str) -> tuple[date, date]:
    year_text, month_text = month.split("-", 1)
    year = int(year_text)
    month_number = int(month_text)
    _, last_day = calendar.monthrange(year, month_number)
    return date(year, month_number, 1), date(year, month_number, last_day)


def date_digits(value: date) -> str:
    return value.strftime("%Y%m%d")


def digits_only(value: str) -> str:
    return "".join(character for character in value if character.isdigit())


def draw_text(c: canvas.Canvas, field: dict[str, Any], value: str) -> None:
    x = float(field["x"])
    y = float(field["y"])
    size = float(field.get("size", 9))
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
    size = float(field.get("size", 10))
    c.setFont("Helvetica", size)
    if "xs" in field:
        for x, character in zip(field["xs"], value):
            c.drawCentredString(float(x), y, character)
        return
    x = float(field["x"])
    step = float(field["step"])
    for index, character in enumerate(value):
        c.drawCentredString(x + (index * step), y, character)


def build_overlay(
    page_width: float,
    page_height: float,
    form_map: dict[str, Any],
    values: dict[str, str],
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

    c.save()
    buffer.seek(0)
    return buffer.read()


def fill_ni187(args: argparse.Namespace) -> Path:
    month = args.month
    calculations_path = Path(args.calculations) if args.calculations else Path("runs") / month / "calculations.csv"
    output_path = Path(args.output) if args.output else Path("runs") / month / "NI187-filled.pdf"

    employer_data = load_yaml(Path(args.employer))
    form_map = load_yaml(Path(args.map))
    rows = read_calculations(calculations_path)
    if not rows:
        raise ValueError(f"No calculation rows found in {calculations_path}")

    start_date, end_date = month_bounds(month)
    total_due = sum(Decimal(row["total_contribution"]) for row in rows)
    employer = employer_data["employer"]
    address = employer["address"]
    declarant = employer_data["declarant"]

    values = {
        "employer_trade_name": employer["trade_name"],
        "address_line1": address["line1"],
        "address_line2": address.get("city", ""),
        "telephone": digits_only(employer["telephone"]),
        "employer_registration_number": digits_only(employer["registration_number"]),
        "period_from": date_digits(start_date),
        "period_to": date_digits(end_date),
        "number_of_employees": str(len(rows)),
        "contributions_due": money(total_due),
        "total_amount_due": money(total_due),
        "amount_paid": money(total_due) if args.mark_paid else "",
        "payment_total": money(total_due) if args.mark_paid else "",
        "declarant_name": declarant["name"],
        "declarant_position": declarant["position"],
    }

    reader = PdfReader(args.template)
    writer = PdfWriter()
    first_page = reader.pages[0]
    page_width = float(first_page.mediabox.width)
    page_height = float(first_page.mediabox.height)
    overlay_pdf = PdfReader(io.BytesIO(build_overlay(page_width, page_height, form_map, values)))
    first_page.merge_page(overlay_pdf.pages[0])
    writer.add_page(first_page)

    for page in reader.pages[1:]:
        writer.add_page(page)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as handle:
        writer.write(handle)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Fill NI187 from monthly NIS calculations.")
    parser.add_argument("--month", required=True, help="Contribution month in YYYY-MM format.")
    parser.add_argument("--calculations", help="Path to calculations.csv. Defaults to runs/YYYY-MM/calculations.csv.")
    parser.add_argument("--employer", default="data/employer.yml")
    parser.add_argument("--template", default="templates/NI187.pdf")
    parser.add_argument("--map", default="references/ni187-form-map.yml")
    parser.add_argument("--output", help="Output PDF path. Defaults to runs/YYYY-MM/NI187-filled.pdf.")
    parser.add_argument(
        "--mark-paid",
        action="store_true",
        help="Also fill amount paid/payment total with the contribution total.",
    )
    output = fill_ni187(parser.parse_args())
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
