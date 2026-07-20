# NIS Rules

Use this repository's NIS workflow to calculate monthly National Insurance Contributions.

## Monthly Workflow

At the end of each month, ask whether there were any employee, salary, employment-date, termination, or NIS-number changes for that month. If there are no changes, record that in the monthly run folder and calculate from the existing employee master data.

## Contribution Weeks

The contribution week count for a month is the number of Mondays in that calendar month.

## Salary Brackets

Use `data/nis_rates_2026.csv` to assign each active employee to a class based on monthly salary. `monthly_min` is inclusive. `monthly_max` is inclusive when present. A blank `monthly_max` means there is no upper limit.

## Last Work Date

For active employees, use the last calendar date of the month being calculated as the last work date on forms that require it.

## Contribution Amounts

For each active employee:

- employee contribution = `employee_weekly * monday_count`
- employer contribution = `employer_weekly * monday_count`
- total contribution = `total_weekly * monday_count`

Round monetary outputs to two decimal places.
