import argparse
import subprocess
import sys
from pathlib import Path


def run(command: list[str]) -> None:
    print("Running:", " ".join(command))
    subprocess.run(command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run monthly NIS, PAYE, Health Surcharge, and payslips.")
    parser.add_argument("--month", required=True, help="Payroll month in YYYY-MM format.")
    parser.add_argument(
        "--no-changes",
        action="store_true",
        help="Create changes.yml confirming no changes if one does not exist.",
    )
    parser.add_argument(
        "--skip-nis-forms",
        action="store_true",
        help="Calculate NIS data without filling NI184/NI187 forms.",
    )
    parser.add_argument(
        "--mark-paid",
        action="store_true",
        help="Fill NI187 amount paid/payment total when NIS forms are generated.",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    python = sys.executable

    nis_command = [python, str(root / "scripts" / "run_month.py"), "--month", args.month]
    if args.no_changes:
        nis_command.append("--no-changes")
    if args.skip_nis_forms:
        nis_command.append("--calculate-only")
    if args.mark_paid:
        nis_command.append("--mark-paid")
    run(nis_command)

    run([python, str(root / "scripts" / "calculate_payroll.py"), "--month", args.month])
    run([python, str(root / "scripts" / "generate_payslips.py"), "--month", args.month])


if __name__ == "__main__":
    main()
