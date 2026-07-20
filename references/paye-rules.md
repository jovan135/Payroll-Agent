# PAYE Rules

Use this repository's PAYE workflow for Trinidad and Tobago employee payroll estimates.

## Source Basis

Use official Board of Inland Revenue guidance first when updating rules. The current configured rules are based on:

- IRD PAYE guidance: employers deduct PAYE from employment income, use employee TD 1 declarations, issue payslips, and remit deductions monthly.
- IRD individual deductions guidance: the annual personal allowance is TTD 90,000 from income year 2023 onward.
- Current professional tax summaries reviewed in 2026: individual income tax is 25% on chargeable income up to TTD 1,000,000 and 30% above TTD 1,000,000.

## Monthly Calculation

For steady monthly salary payroll:

1. Annualize monthly salary by multiplying by 12.
2. Subtract the annual personal allowance from `data/tax_settings.yml`.
3. Subtract any employee TD 1 annual allowances stored on the employee record.
4. Subtract approved pension or annuity deductions stored on the employee record.
5. Apply the annual tax bands.
6. Divide annual PAYE by 12 for the monthly deduction.

Treat blank employee allowance fields as zero. Round money to two decimals.

## Validation

Before treating a PAYE run as final, confirm:

- Employees have supplied TD 1 details or the blank TD 1 fields are intentionally treated as zero additional allowances.
- Any pension or annuity deduction has support.
- High earners crossing the 30% band have been reviewed manually.
- Monthly PAYE totals reconcile to payslip deductions and payroll summary totals.
