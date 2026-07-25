import csv
import json
import subprocess
import sys
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
DATA_DIR = ROOT / "data"
RUNS_DIR = ROOT / "runs"
EMPLOYEE_FIELDS = [
    "employee_id",
    "surname",
    "first_name",
    "nis_number",
    "date_of_birth",
    "date_employed",
    "last_work_date_rule",
    "monthly_salary",
    "bir_number",
    "pay_frequency",
    "tax_residency",
    "td1_annual_allowances",
    "approved_pension_or_annuity",
    "health_surcharge_exempt",
    "active",
]


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
            return float(text)
        return int(text)
    except Exception:
        return text


def yaml_string(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return '""'
    text = str(value)
    if text == "":
        return '""'
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{float(value):.2f}" if "." in str(value) else str(value)
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def load_employees() -> list[dict[str, Any]]:
    path = DATA_DIR / "employees.yml"
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
    return employees


def write_employees(employees: list[dict[str, Any]]) -> None:
    lines = ["employees:"]
    for index, employee in enumerate(employees):
        if index:
            lines.append("")
        first_field = EMPLOYEE_FIELDS[0]
        lines.append(f"  - {first_field}: {yaml_string(employee.get(first_field, ''))}")
        for field in EMPLOYEE_FIELDS[1:]:
            value = employee.get(field, "")
            if field == "last_work_date_rule" and value == "":
                value = "Use the last date of the month for which NIS is being calculated."
            if field == "active" and value == "":
                value = True
            lines.append(f"    {field}: {yaml_string(value)}")
    (DATA_DIR / "employees.yml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def load_settings() -> dict[str, Any]:
    path = DATA_DIR / "app_settings.json"
    if not path.exists():
        return {
            "schedule_enabled": False,
            "scheduled_day": 28,
            "scheduled_time": "17:00",
            "reminder_days_before": 3,
            "last_note": "Confirm employee changes before running payroll.",
        }
    return json.loads(path.read_text(encoding="utf-8"))


def write_settings(settings: dict[str, Any]) -> None:
    (DATA_DIR / "app_settings.json").write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def run_months() -> list[dict[str, Any]]:
    runs = []
    if not RUNS_DIR.exists():
        return runs
    for run_dir in sorted((item for item in RUNS_DIR.iterdir() if item.is_dir()), reverse=True):
        payroll_rows = read_csv(run_dir / "payroll.csv")
        nis_rows = read_csv(run_dir / "calculations.csv")
        gross = sum(float(row.get("gross_pay", 0) or 0) for row in payroll_rows)
        net = sum(float(row.get("net_pay", 0) or 0) for row in payroll_rows)
        deductions = sum(float(row.get("total_deductions", 0) or 0) for row in payroll_rows)
        runs.append(
            {
                "month": run_dir.name,
                "has_payroll": bool(payroll_rows),
                "has_nis": bool(nis_rows),
                "has_ni184": (run_dir / "NI184-filled.pdf").exists(),
                "has_ni187": (run_dir / "NI187-filled.pdf").exists(),
                "employees": len(payroll_rows or nis_rows),
                "gross": round(gross, 2),
                "deductions": round(deductions, 2),
                "net": round(net, 2),
                "payslips": sorted(path.name for path in (run_dir / "payslips").glob("*.html"))
                if (run_dir / "payslips").exists()
                else [],
            }
        )
    return runs


def dashboard_state() -> dict[str, Any]:
    employees = load_employees()
    runs = run_months()
    active = [employee for employee in employees if employee.get("active") is True]
    latest = runs[0] if runs else None
    blanks = [
        employee["employee_id"]
        for employee in active
        if not str(employee.get("bir_number", "")).strip()
        or not str(employee.get("pay_frequency", "")).strip()
        or not str(employee.get("tax_residency", "")).strip()
    ]
    alerts = []
    if blanks:
        alerts.append(
            {
                "level": "warning",
                "title": "Employee tax fields pending",
                "body": f"{len(blanks)} active employee record(s) have blank BIR, pay frequency, or residency fields.",
            }
        )
    if latest and latest["has_payroll"] and latest["employees"] != len(active):
        alerts.append(
            {
                "level": "warning",
                "title": "Payroll output is stale",
                "body": f"{len(active)} active employee record(s) exist, but the latest payroll output includes {latest['employees']}. Run payroll again after submitting changes.",
            }
        )
    return {
        "today": date.today().isoformat(),
        "employees": employees,
        "runs": runs,
        "latest_run": latest,
        "settings": load_settings(),
        "alerts": alerts,
    }


class PayrollHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            self.send_json(dashboard_state())
            return
        if parsed.path.startswith("/runs/"):
            target = (ROOT / parsed.path.lstrip("/")).resolve()
            if ROOT not in target.parents and target != ROOT:
                self.send_error(403)
                return
            if target.exists():
                self.path = parsed.path
                return SimpleHTTPRequestHandler.do_GET(self)
        return super().do_GET()

    def translate_path(self, path: str) -> str:
        parsed = urlparse(path)
        if parsed.path.startswith("/runs/"):
            return str((ROOT / parsed.path.lstrip("/")).resolve())
        return super().translate_path(path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/employees":
                payload = self.read_json()
                employees = load_employees()
                employee_id = str(payload.get("employee_id", "")).strip()
                if not employee_id:
                    self.send_json({"error": "employee_id is required"}, 400)
                    return
                normalized = {field: payload.get(field, "") for field in EMPLOYEE_FIELDS}
                normalized["employee_id"] = employee_id
                normalized["monthly_salary"] = float(payload.get("monthly_salary") or 0)
                normalized["active"] = bool(payload.get("active", True))
                existing = next((index for index, item in enumerate(employees) if item.get("employee_id") == employee_id), None)
                if existing is None:
                    employees.append(normalized)
                    action = "created"
                else:
                    employees[existing] = normalized
                    action = "updated"
                write_employees(employees)
                self.send_json({"status": action, "state": dashboard_state()})
                return
            if parsed.path == "/api/settings":
                settings = load_settings()
                settings.update(self.read_json())
                write_settings(settings)
                self.send_json({"status": "updated", "state": dashboard_state()})
                return
            if parsed.path == "/api/run-payroll":
                payload = self.read_json()
                month = str(payload.get("month", "")).strip()
                generate_nis_forms = bool(payload.get("generate_nis_forms", True))
                mark_paid = bool(payload.get("mark_paid", False))
                if not month:
                    self.send_json({"error": "month is required"}, 400)
                    return
                command = [
                    sys.executable,
                    str(ROOT / "scripts" / "run_payroll_month.py"),
                    "--month",
                    month,
                    "--no-changes",
                ]
                if not generate_nis_forms:
                    command.append("--skip-nis-forms")
                if mark_paid:
                    command.append("--mark-paid")
                completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
                if completed.returncode != 0:
                    self.send_json({"error": completed.stderr or completed.stdout}, 500)
                    return
                self.send_json({"status": "completed", "output": completed.stdout, "state": dashboard_state()})
                return
        except Exception as error:
            self.send_json({"error": str(error)}, 500)
            return
        self.send_error(404)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 8765), PayrollHandler)
    print("Payroll Agent web app: http://127.0.0.1:8765")
    server.serve_forever()


if __name__ == "__main__":
    main()
