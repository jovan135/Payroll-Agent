const { firestoreFetch, toFirestoreFields } = require("./lib/firestore-service");

const PROJECT_ID = "payroll-application-f6d25";
const DATABASE = "(default)";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

const JSPA_EMPLOYEES = [
  {
    employee_id: "EMP001",
    surname: "Diaz-Cummings",
    first_name: "Jhoneile",
    nis_number: "07 152 8487",
    date_of_birth: "1990-01-17",
    date_employed: "2020-09-01",
    last_work_date_rule: "Use the last date of the month for which NIS is being calculated.",
    monthly_salary: 6000,
    bir_number: "",
    pay_frequency: "",
    tax_residency: "",
    td1_annual_allowances: "",
    approved_pension_or_annuity: "",
    health_surcharge_exempt: "",
    active: true,
  },
  {
    employee_id: "EMP002",
    surname: "Hosein",
    first_name: "Marie",
    nis_number: "05 160 6676",
    date_of_birth: "1993-11-02",
    date_employed: "2023-01-09",
    last_work_date_rule: "Use the last date of the month for which NIS is being calculated.",
    monthly_salary: 5000,
    bir_number: "",
    pay_frequency: "",
    tax_residency: "",
    td1_annual_allowances: "",
    approved_pension_or_annuity: "",
    health_surcharge_exempt: "",
    active: true,
  },
  {
    employee_id: "EMP003",
    surname: "Hernandez",
    first_name: "Daniella",
    nis_number: "01 140 0338",
    date_of_birth: "1979-06-05",
    date_employed: "2025-01-10",
    last_work_date_rule: "Use the last date of the month for which NIS is being calculated.",
    monthly_salary: 5000,
    bir_number: "",
    pay_frequency: "",
    tax_residency: "",
    td1_annual_allowances: "",
    approved_pension_or_annuity: "",
    health_surcharge_exempt: "",
    active: true,
  },
];

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
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
  if ("mapValue" in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, fromFirestoreValue(item)]));
  }
  return null;
}

function fromFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

async function fetchCompanyForUser(companyId, token) {
  const response = await fetch(`${FIRESTORE_BASE}/companies/${encodeURIComponent(companyId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "You do not have access to this company workspace.");
    error.status = response.status;
    throw error;
  }
  return fromFirestoreFields(payload.fields || {});
}

function isJspaCompany(company) {
  const text = [
    company.name,
    company.legalName,
    company.tradeName,
    company.contactEmail,
    company.nibEmployerRegistrationNumber,
  ].filter(Boolean).join(" ");
  return /j\s*spa/i.test(text) || /thejspa@gmail\.com/i.test(text) || /\b155218\b/.test(text);
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
      sendJson(response, 401, { error: "Sign in before restoring company records." });
      return;
    }

    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const companyId = String(body.companyId || "").trim();
    if (!companyId) {
      sendJson(response, 400, { error: "companyId is required." });
      return;
    }

    const company = await fetchCompanyForUser(companyId, token);
    if (!isJspaCompany(company)) {
      sendJson(response, 403, { error: "This restore action is only available for The J Spa and Skin Clinic workspace." });
      return;
    }

    await Promise.all(JSPA_EMPLOYEES.map((employee) => firestoreFetch(
      `companies/${encodeURIComponent(companyId)}/employees/${encodeURIComponent(employee.employee_id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          fields: toFirestoreFields({
            ...employee,
            active: true,
            restoredAt: new Date(),
            updatedAt: new Date(),
          }),
        }),
      },
    )));

    sendJson(response, 200, {
      status: "restored",
      employees: JSPA_EMPLOYEES.map((employee) => employee.employee_id),
    });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || "Employee restore failed." });
  }
};
