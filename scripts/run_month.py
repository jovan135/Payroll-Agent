import argparse
import subprocess
import sys
from pathlib import Path


def run(command: list[str]) -> None:
    print("Running:", " ".join(command))
    subprocess.run(command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run monthly NIS calculations and fill NI184/NI187.")
    parser.add_argument("--month", required=True, help="Contribution month in YYYY-MM format.")
    parser.add_argument(
        "--no-changes",
        action="store_true",
        help="Create changes.yml confirming no changes if one does not exist.",
    )
    parser.add_argument(
        "--mark-paid",
        action="store_true",
        help="Fill NI187 amount paid/payment total with the contribution total.",
    )
    parser.add_argument(
        "--calculate-only",
        action="store_true",
        help="Only generate calculations.csv and summary.md.",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    python = sys.executable

    calculate_command = [
        python,
        str(root / "scripts" / "calculate_nis.py"),
        "--month",
        args.month,
    ]
    if args.no_changes:
        calculate_command.append("--no-changes")
    run(calculate_command)

    if args.calculate_only:
        return

    run([python, str(root / "scripts" / "fill_ni184.py"), "--month", args.month])

    ni187_command = [python, str(root / "scripts" / "fill_ni187.py"), "--month", args.month]
    if args.mark_paid:
        ni187_command.append("--mark-paid")
    run(ni187_command)


if __name__ == "__main__":
    main()
