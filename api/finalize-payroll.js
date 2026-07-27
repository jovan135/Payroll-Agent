const PROJECT_ID = "payroll-application-f6d25";
const DATABASE = "(default)";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

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
  if (typeof value === "object") return { mapValue: { fields: toFirestoreFields(value) } };
  return { stringValue: String(value) };
}

function toFirestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function fileSafe(value) {
  return String(value || "employee").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function companyName(company, run) {
  return company.tradeName || company.name || company.legalName || run.companyName || "";
}

function companyAddress(company) {
  const address = company.address || {};
  return [address.line1, address.line2, address.city, address.country].filter(Boolean).join(", ");
}

function buildPayrollCsv(run) {
  const headers = [
    "month",
    "employee_id",
    "full_name",
    "nis_number",
    "bir_number",
    "regular_earnings",
    "gross_pay",
    "annualized_income",
    "annual_chargeable_income",
    "annual_paye",
    "paye",
    "nis_employee",
    "health_surcharge",
    "total_deductions",
    "net_pay",
    "nis_employer",
  ];
  const lines = [headers.join(",")];
  for (const row of run.rows || []) {
    lines.push(headers.map((header) => csvCell({
      month: run.month,
      employee_id: row.employeeId,
      full_name: row.fullName,
      nis_number: row.nisNumber,
      bir_number: row.birNumber,
      regular_earnings: money(row.grossPay),
      gross_pay: money(row.grossPay),
      annualized_income: money(row.annualizedIncome),
      annual_chargeable_income: money(row.annualChargeableIncome),
      annual_paye: money(row.annualPaye),
      paye: money(row.paye),
      nis_employee: money(row.nisEmployee),
      health_surcharge: money(row.healthSurcharge),
      total_deductions: money(row.totalDeductions),
      net_pay: money(row.netPay),
      nis_employer: money(row.nisEmployer),
    }[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function buildPayrollSummary(run) {
  const lines = [
    `# Payroll Summary for ${run.month}`,
    "",
    `- Status: Approved`,
    `- Active employees included: ${run.employeeCount || run.employees || 0}`,
    `- Gross pay: TTD ${money(run.grossPay || run.gross)}`,
    `- Employee NIS deductions: TTD ${money(run.nisEmployee)}`,
    `- PAYE deductions: TTD ${money(run.paye)}`,
    `- Health Surcharge deductions: TTD ${money(run.healthSurcharge)}`,
    `- Total employee deductions: TTD ${money(run.totalDeductions || run.deductions)}`,
    `- Net pay: TTD ${money(run.netPay || run.net)}`,
    `- Employer NIS cost: TTD ${money(run.nisEmployer)}`,
    "",
    "## Employees",
    "",
    "| Employee ID | Name | Gross | NIS | PAYE | Health Surcharge | Total Deductions | Net Pay |",
    "|---|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of run.rows || []) {
    lines.push(`| ${row.employeeId} | ${row.fullName} | ${money(row.grossPay)} | ${money(row.nisEmployee)} | ${money(row.paye)} | ${money(row.healthSurcharge)} | ${money(row.totalDeductions)} | ${money(row.netPay)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function buildPayslipHtml(row, run, company) {
  const name = companyName(company, run);
  const address = companyAddress(company);
  const employerReg = company.nibEmployerRegistrationNumber || company.registrationNumber || "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Payslip - ${escapeHtml(row.fullName)} - ${escapeHtml(run.month)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #17202a; margin: 32px; }
    .sheet { max-width: 760px; margin: 0 auto; border: 1px solid #b8c0cc; padding: 28px; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #17202a; padding-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    td, th { padding: 8px; border-bottom: 1px solid #d8dee8; text-align: left; }
    td:last-child, th:last-child { text-align: right; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin-top: 18px; }
    .net { font-size: 20px; font-weight: 700; text-align: right; margin-top: 24px; }
    .muted { color: #5d6978; font-size: 13px; }
  </style>
</head>
<body>
  <section class="sheet">
    <header>
      <div>
        <h1>${escapeHtml(name)}</h1>
        <div class="muted">${escapeHtml(address)}</div>
        <div class="muted">Tel: ${escapeHtml(company.phone || company.telephone || "")}</div>
      </div>
      <div>
        <strong>Payslip</strong><br>
        <span class="muted">Period: ${escapeHtml(run.month)}</span><br>
        <span class="muted">Employer Reg: ${escapeHtml(employerReg)}</span>
      </div>
    </header>
    <div class="meta">
      <div><strong>Employee</strong><br>${escapeHtml(row.fullName)}</div>
      <div><strong>Employee ID</strong><br>${escapeHtml(row.employeeId)}</div>
      <div><strong>NIS Number</strong><br>${escapeHtml(row.nisNumber)}</div>
      <div><strong>BIR Number</strong><br>${escapeHtml(row.birNumber || "")}</div>
    </div>
    <h2>Earnings</h2>
    <table>
      <tr><th>Description</th><th>Amount</th></tr>
      <tr><td>Regular monthly salary</td><td>TTD ${money(row.grossPay)}</td></tr>
      <tr><td><strong>Gross Pay</strong></td><td><strong>TTD ${money(row.grossPay)}</strong></td></tr>
    </table>
    <h2>Deductions</h2>
    <table>
      <tr><th>Description</th><th>Amount</th></tr>
      <tr><td>NIS employee contribution</td><td>TTD ${money(row.nisEmployee)}</td></tr>
      <tr><td>PAYE</td><td>TTD ${money(row.paye)}</td></tr>
      <tr><td>Health Surcharge</td><td>TTD ${money(row.healthSurcharge)}</td></tr>
      <tr><td><strong>Total Deductions</strong></td><td><strong>TTD ${money(row.totalDeductions)}</strong></td></tr>
    </table>
    <div class="net">Net Pay: TTD ${money(row.netPay)}</div>
    <h2>Employer Contributions</h2>
    <table>
      <tr><td>Employer NIS contribution</td><td>TTD ${money(row.nisEmployer)}</td></tr>
    </table>
  </section>
</body>
</html>`;
}

function buildNisHtml(run, company, formName) {
  const name = companyName(company, run);
  const employerReg = company.nibEmployerRegistrationNumber || company.registrationNumber || "";
  const totalNis = Number(run.nisEmployee || 0) + Number(run.nisEmployer || 0);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${formName} Draft - ${escapeHtml(run.month)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #17202a; margin: 32px; }
    main { max-width: 900px; margin: 0 auto; }
    h1 { margin-bottom: 4px; }
    .muted { color: #5d6978; }
    .box { border: 1px solid #b8c0cc; padding: 16px; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td { border-bottom: 1px solid #d8dee8; padding: 8px; text-align: left; }
    td:last-child, th:last-child { text-align: right; }
  </style>
</head>
<body>
  <main>
    <h1>${formName} Draft Review</h1>
    <div class="muted">Generated from approved payroll for ${escapeHtml(run.month)}.</div>
    <section class="box">
      <strong>Employer:</strong> ${escapeHtml(name)}<br>
      <strong>Employer registration:</strong> ${escapeHtml(employerReg)}<br>
      <strong>Address:</strong> ${escapeHtml(companyAddress(company))}<br>
      <strong>Contribution weeks:</strong> ${escapeHtml(run.mondayCount || "")}
    </section>
    <table>
      <thead>
        <tr><th>Employee</th><th>NIS No.</th><th>Class</th><th>Employee NIS</th><th>Employer NIS</th><th>Total</th></tr>
      </thead>
      <tbody>
        ${(run.rows || []).map((row) => `
          <tr>
            <td>${escapeHtml(row.fullName)}</td>
            <td>${escapeHtml(row.nisNumber)}</td>
            <td>${escapeHtml(row.nisClass)}</td>
            <td>TTD ${money(row.nisEmployee)}</td>
            <td>TTD ${money(row.nisEmployer)}</td>
            <td>TTD ${money(Number(row.nisEmployee || 0) + Number(row.nisEmployer || 0))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <section class="box">
      <strong>Total employee NIS:</strong> TTD ${money(run.nisEmployee)}<br>
      <strong>Total employer NIS:</strong> TTD ${money(run.nisEmployer)}<br>
      <strong>Total NIS contribution:</strong> TTD ${money(totalNis)}
    </section>
    <p class="muted">This is a hosted draft review output. Use it to review the NI184/NI187 data before official PDF form mapping is connected.</p>
  </main>
</body>
</html>`;
}

function finalizeRun(run, company) {
  const payslips = (run.rows || []).map((row) => ({
    employeeId: row.employeeId,
    fullName: row.fullName,
    fileName: `${fileSafe(row.employeeId)}-${run.month}-payslip.html`,
    html: buildPayslipHtml(row, run, company),
  }));
  return {
    ...run,
    status: "approved",
    hasPayroll: true,
    hasNis: true,
    hasNi184: true,
    hasNi187: true,
    payslips,
    outputs: {
      payrollCsv: buildPayrollCsv(run),
      payrollSummaryMarkdown: buildPayrollSummary(run),
      ni184Html: buildNisHtml(run, company, "NI184"),
      ni187Html: buildNisHtml(run, company, "NI187"),
      generatedAt: new Date(),
    },
    approvedAt: new Date(),
    updatedAt: new Date(),
    note: "Approved payroll. Hosted payslips, payroll summary, payroll CSV, and NI184/NI187 draft review outputs were generated.",
  };
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
      sendJson(response, 401, { error: "Sign in before finalizing payroll." });
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

    const [companyDoc, runDoc] = await Promise.all([
      firestoreFetch(`companies/${encodeURIComponent(companyId)}`, token),
      firestoreFetch(`companies/${encodeURIComponent(companyId)}/payrollRuns/${encodeURIComponent(month)}`, token),
    ]);
    const company = fromFirestoreFields(companyDoc.fields || {});
    const run = fromFirestoreFields(runDoc.fields || {});
    if (!Array.isArray(run.rows) || !run.rows.length) {
      sendJson(response, 400, { error: "Run payroll first so there is a draft to approve." });
      return;
    }
    if (run.status === "cancelled") {
      sendJson(response, 409, { error: "This payroll run was cancelled. Run payroll again to create a new draft." });
      return;
    }

    const finalized = finalizeRun({ ...run, month, companyId }, company);
    await firestoreFetch(
      `companies/${encodeURIComponent(companyId)}/payrollRuns/${encodeURIComponent(month)}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ fields: toFirestoreFields(finalized) }),
      },
    );

    sendJson(response, 200, { status: "approved", run: finalized });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || "Payroll finalization failed." });
  }
};
