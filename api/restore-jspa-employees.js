const {
  firestoreFetch,
  firestoreFetchAsUser,
  fromFirestoreFields,
  toFirestoreFields,
} = require("./lib/firestore-service");

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

async function fetchCompanyForUser(companyId, token) {
  const payload = await firestoreFetchAsUser(`companies/${encodeURIComponent(companyId)}`, token);
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

    const restoredPayload = await firestoreFetch(
      `companies/${encodeURIComponent(companyId)}/employees?pageSize=100`,
    );
    const restoredIds = (restoredPayload.documents || []).map((document) => document.name.split("/").pop());
    console.log("[restore-jspa-employees] restore verified", { employeeCount: restoredIds.length });

    sendJson(response, 200, {
      status: "restored",
      employees: restoredIds,
    });
  } catch (error) {
    console.error("[restore-jspa-employees] failed", { error: error.message, status: error.status || 500 });
    sendJson(response, error.status || 500, { error: error.message || "Employee restore failed." });
  }
};
