# Monthly Run

Create one folder per contribution month:

```text
runs/YYYY-MM/
```

Expected files:

```text
changes.yml
calculations.csv
summary.md
NI184-filled.pdf
NI187-filled.pdf
payroll.csv
payroll-summary.md
payslips/
```

Before filling PDFs, generate and review `calculations.csv` and `summary.md`.

Use `changes.yml` to record the user's end-of-month confirmation or changes. For no changes:

```yaml
month: "YYYY-MM"
confirmed_no_changes: true
notes: ""
```

For the full payroll workflow, run:

```powershell
python scripts\run_payroll_month.py --month YYYY-MM --no-changes
```

This keeps the NIS outputs and adds PAYE, Health Surcharge, payroll summary, and HTML payslips.
