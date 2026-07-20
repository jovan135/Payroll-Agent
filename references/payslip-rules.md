# Payslip Rules

Use this repository's payslip workflow to combine earnings, statutory deductions, and net pay.

## Payslip Contents

Each payslip should show:

- Employer trade name and address.
- Employee name, employee ID, NIS number, and BIR number when available.
- Payroll month.
- Earnings, currently regular monthly salary.
- Employee deductions: NIS, PAYE, and Health Surcharge.
- Total deductions.
- Net pay.
- Employer NIS contribution shown separately as employer cost, not deducted from employee pay.

## Output Convention

Create monthly payroll files under:

```text
runs/YYYY-MM/
```

Expected full payroll outputs:

```text
payroll.csv
payroll-summary.md
payslips/
```

Keep the existing NIS-only outputs intact:

```text
calculations.csv
summary.md
NI184-filled.pdf
NI187-filled.pdf
```
