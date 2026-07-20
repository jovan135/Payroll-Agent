import argparse
import calendar
from datetime import date


def count_mondays(month: str) -> int:
    year_text, month_text = month.split("-", 1)
    year = int(year_text)
    month_number = int(month_text)
    _, last_day = calendar.monthrange(year, month_number)
    return sum(
        1
        for day in range(1, last_day + 1)
        if date(year, month_number, day).weekday() == 0
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Count Mondays in a YYYY-MM month.")
    parser.add_argument("--month", required=True, help="Contribution month in YYYY-MM format.")
    args = parser.parse_args()
    print(count_mondays(args.month))


if __name__ == "__main__":
    main()
