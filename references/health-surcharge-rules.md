# Health Surcharge Rules

Use this repository's Health Surcharge workflow for Trinidad and Tobago employee payroll estimates.

## Source Basis

Use official Board of Inland Revenue guidance first when updating rules. The current configured rules are based on IRD Health Surcharge guidance:

- Employees under 16 are exempt.
- Employees 60 and over are exempt.
- People whose only source of income is pension are exempt.
- If monthly emoluments are over TTD 469.99, or weekly emoluments are over TTD 109.00, deduct TTD 8.25 per week.
- Otherwise deduct TTD 4.80 per week.

## Monthly Calculation

Use the same contribution week count as NIS: the number of Mondays in the month.

For each active employee:

1. Determine age at the end of the payroll month.
2. If the employee is exempt by age or `health_surcharge_exempt` is true, deduct zero.
3. Otherwise choose the weekly rate based on monthly salary.
4. Multiply the weekly rate by the number of Mondays in the month.

Treat blank `health_surcharge_exempt` values as false. Round money to two decimals.
