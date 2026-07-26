const PROJECT_ID = "payroll-application-f6d25";
const DATABASE = "(default)";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

const NIS_RATES = [
  ["I", 867, 1472.99, 14.60, 29.20, 43.80],
  ["II", 1473, 1949.99, 21.30, 42.60, 63.90],
  ["III", 1950, 2642.99, 28.60, 57.20, 85.80],
  ["IV", 2643, 3292.99, 37.00, 74.00, 111.00],
  ["V", 3293, 4029.99, 45.60, 91.20, 136.80],
  ["VI", 4030, 4852.99, 55.40, 110.80, 166.20],
  ["VII", 4853, 5632.99, 65.30, 130.60, 195.90],
  ["VIII", 5633, 6456.99, 75.30, 150.60, 225.90],
  ["IX", 6457, 7409.99, 86.40, 172.80, 259.20],
  ["X", 7410, 8276.99, 97.70, 195.40, 293.10],
  ["XI", 8277, 9272.99, 109.40, 218.80, 328.20],
  ["XII", 9273, 10312.99, 122.00, 244.00, 366.00],
  ["XIII", 10313, 11396.99, 135.30, 270.60, 405.90],
  ["XIV", 11397, 12652.99, 149.90, 299.80, 449.70],
  ["XV", 12653, 13599.99, 163.60, 327.20, 490.80],
  ["XVI", 13600, null, 169.50, 339.00, 508.50],
].map(([nisClass, monthlyMin, monthlyMax, employeeWeekly, employerWeekly, totalWeekly]) => ({
  nisClass,
  monthlyMin,
  monthlyMax,
  employeeWeekly,
  employerWeekly,
  totalWeekly,
}));

const TAX_SETTINGS = {
  personalAllowanceAnnual: 90000,
  periodsPerYear: 12,
  payeBands: [
    { annualMax: 1000000, rate: 0.25 },
    { annualMax: null, rate: 0.30 },
  ],
  healthSurcharge: {
    monthlyThreshold: 469.99,
    lowerWeeklyRate: 4.80,
    higherWeeklyRate: 8.25,
    exemptUnderAge: 16,
    exemptAgeAtOrAbove: 60,
  },
};

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function firestoreHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function firestoreFetch(path, token, options = {}) {
  const response = await fetch(`${FIRESTORE_BASE}/${path}`, {
    ...options,
    headers: {
      ...firestoreHeaders(token),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = payload?.error?.message || `Firestore request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]));
}

function cents(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function monthEnd(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0));
}

function mondayCount(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  let total = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    if (new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay() === 1) total += 1;
  }
  return total;
}

function ageAt(dateOfBirth, asOfDate) {
  if (!dateOfBirth) return null;
  const [year, month, day] = String(dateOfBirth).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = asOfDate.getUTCFullYear() - year;
  const beforeBirthday = (asOfDate.getUTCMonth() + 1 < month)
    || (asOfDate.getUTCMonth() + 1 === month && asOfDate.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

function employeeValue(employee, snakeKey, camelKey, fallback = "") {
  return employee[snakeKey] ?? employee[camelKey] ?? fallback;
}

function isActive(employee) {
  const value = employee.active;
  if (typeof value === "boolean") return value;
  return String(value ?? "true").toLowerCase() !== "false";
}

function findNisRate(monthlySalary) {
  const rate = NIS_RATES.find((item) => (
    monthlySalary >= item.monthlyMin && (item.monthlyMax === null || monthlySalary <= item.monthlyMax)
  ));
  if (!rate) throw new Error(`No NIS salary class found for monthly salary ${monthlySalary}.`);
  return rate;
}

function calculateAnnualPaye(chargeableIncome) {
  let remaining = chargeableIncome;
  let previousCap = 0;
  let total = 0;
  for (const band of TAX_SETTINGS.payeBands) {
    if (remaining <= 0) break;
    const taxable = band.annualMax === null ? remaining : Math.min(remaining, band.annualMax - previousCap);
    total += taxable * band.rate;
    remaining -= taxable;
    if (band.annualMax !== null) previousCap = band.annualMax;
  }
  return cents(total);
}

function calculateHealthSurcharge(employee, monthlySalary, weeks, asOfDate) {
  const settings = TAX_SETTINGS.healthSurcharge;
  const exempt = String(employeeValue(employee, "health_surcharge_exempt", "healthSurchargeExempt", "")).toLowerCase();
  if (["true", "yes", "1"].includes(exempt)) return 0;
  const age = ageAt(employeeValue(employee, "date_of_birth", "dateOfBirth", ""), asOfDate);
  if (age !== null && age < settings.exemptUnderAge) return 0;
  if (age !== null && age >= settings.exemptAgeAtOrAbove) return 0;
  const weeklyRate = monthlySalary > settings.monthlyThreshold ? settings.higherWeeklyRate : settings.lowerWeeklyRate;
  return cents(weeklyRate * weeks);
}

function calculatePayroll(month, employees) {
  const weeks = mondayCount(month);
  const asOfDate = monthEnd(month);
  const rows = [];
  const totals = {
    gross: 0,
    nisEmployee: 0,
    nisEmployer: 0,
    paye: 0,
    healthSurcharge: 0,
    totalDeductions: 0,
    netPay: 0,
  };

  for (const employee of employees.filter(isActive)) {
    const employeeId = employeeValue(employee, "employee_id", "employeeId", "");
    const firstName = employeeValue(employee, "first_name", "firstName", "");
    const surname = employeeValue(employee, "surname", "surname", "");
    const monthlySalary = Number(employeeValue(employee, "monthly_salary", "monthlySalary", 0));
    const nisNumber = employeeValue(employee, "nis_number", "nisNumber", "");
    if (!employeeId) throw new Error("Every active employee needs an employee id.");
    if (!nisNumber) throw new Error(`Employee ${employeeId} needs an NIS number.`);
    if (!monthlySalary || monthlySalary <= 0) throw new Error(`Employee ${employeeId} needs a positive monthly salary.`);

    const nisRate = findNisRate(monthlySalary);
    const annualIncome = monthlySalary * TAX_SETTINGS.periodsPerYear;
    const td1Allowances = Number(employeeValue(employee, "td1_annual_allowances", "td1AnnualAllowances", 0) || 0);
    const pension = Number(employeeValue(employee, "approved_pension_or_annuity", "approvedPensionOrAnnuity", 0) || 0);
    const chargeableIncome = Math.max(0, annualIncome - TAX_SETTINGS.personalAllowanceAnnual - td1Allowances - pension);
    const annualPaye = calculateAnnualPaye(chargeableIncome);
    const paye = cents(annualPaye / TAX_SETTINGS.periodsPerYear);
    const healthSurcharge = calculateHealthSurcharge(employee, monthlySalary, weeks, asOfDate);
    const nisEmployee = cents(nisRate.employeeWeekly * weeks);
    const nisEmployer = cents(nisRate.employerWeekly * weeks);
    const totalDeductions = cents(nisEmployee + paye + healthSurcharge);
    const netPay = cents(monthlySalary - totalDeductions);

    const row = {
      employeeId,
      fullName: `${firstName} ${surname}`.trim(),
      nisNumber,
      birNumber: employeeValue(employee, "bir_number", "birNumber", ""),
      nisClass: nisRate.nisClass,
      mondayCount: weeks,
      grossPay: cents(monthlySalary),
      annualizedIncome: cents(annualIncome),
      annualChargeableIncome: cents(chargeableIncome),
      annualPaye,
      paye,
      nisEmployee,
      nisEmployer,
      healthSurcharge,
      totalDeductions,
      netPay,
    };
    rows.push(row);
    totals.gross += row.grossPay;
    totals.nisEmployee += row.nisEmployee;
    totals.nisEmployer += row.nisEmployer;
    totals.paye += row.paye;
    totals.healthSurcharge += row.healthSurcharge;
    totals.totalDeductions += row.totalDeductions;
    totals.netPay += row.netPay;
  }

  Object.keys(totals).forEach((key) => {
    totals[key] = cents(totals[key]);
  });

  return { rows, totals, mondayCount: weeks };
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = request.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) {
      sendJson(response, 401, { error: "Sign in before running payroll." });
      return;
    }

    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const { companyId, month } = body;
    if (!companyId) {
      sendJson(response, 400, { error: "companyId is required." });
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
      sendJson(response, 400, { error: "month must be in YYYY-MM format." });
      return;
    }

    const companyDoc = await firestoreFetch(`companies/${encodeURIComponent(companyId)}`, token);
    const company = fromFirestoreFields(companyDoc.fields || {});
    const employeesPayload = await firestoreFetch(`companies/${encodeURIComponent(companyId)}/employees`, token);
    const employees = (employeesPayload.documents || []).map((doc) => ({
      id: doc.name.split("/").pop(),
      ...fromFirestoreFields(doc.fields || {}),
    }));

    const { rows, totals, mondayCount: weeks } = calculatePayroll(month, employees);
    const run = {
      month,
      companyId,
      companyName: company.name || company.legalName || company.tradeName || "",
      status: "draft",
      hasPayroll: true,
      hasNis: true,
      hasNi184: false,
      hasNi187: false,
      employeeCount: rows.length,
      employees: rows.length,
      mondayCount: weeks,
      grossPay: totals.gross,
      gross: totals.gross,
      totalDeductions: totals.totalDeductions,
      deductions: totals.totalDeductions,
      netPay: totals.netPay,
      net: totals.netPay,
      nisEmployee: totals.nisEmployee,
      nisEmployer: totals.nisEmployer,
      paye: totals.paye,
      healthSurcharge: totals.healthSurcharge,
      rows,
      payslips: [],
      generatedAt: new Date(),
      updatedAt: new Date(),
      note: "Draft payroll generated by hosted payroll backend. NIB PDFs and payslip file storage are the next backend phase.",
    };

    await firestoreFetch(
      `companies/${encodeURIComponent(companyId)}/payrollRuns/${encodeURIComponent(month)}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ fields: toFirestoreFields(run) }),
      },
    );

    sendJson(response, 200, { status: "draft", run });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || "Payroll run failed." });
  }
};
