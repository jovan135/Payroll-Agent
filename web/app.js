import {
  approveSignupRequest,
  completeRedirectSignIn,
  ensureUserProfile,
  getAuthToken,
  listenForAuth,
  loadAdminSignupRequests,
  loadCompanyEmployees,
  loadCompanyPayrollRuns,
  loadMemberships,
  loadMySignupRequests,
  rejectSignupRequest,
  requestCompanySignup,
  saveCompanyEmployee,
  saveCompanyProfile,
  signInWithGoogle,
  signOutUser,
  updateCompanyPayrollRunStatus,
} from "./firebase-client.js";

const companyNavItems = [
  ["dashboard", "Dashboard"],
  ["employees", "Employees"],
  ["runs", "Payroll Runs"],
  ["payslips", "Payslips"],
  ["nibForms", "NIB Forms"],
  ["reports", "Reports"],
  ["settings", "Settings"],
];

const adminNavItems = [
  ["admin", "Admin"],
  ["companies", "Companies"],
];

const fields = [
  ["employee_id", "Employee ID", "text"],
  ["surname", "Surname", "text"],
  ["first_name", "First Name", "text"],
  ["nis_number", "NIS Number", "text"],
  ["date_of_birth", "Date of Birth", "date"],
  ["date_employed", "Date Employed", "date"],
  ["monthly_salary", "Monthly Salary", "number"],
  ["bir_number", "BIR Number", "text"],
  ["pay_frequency", "Pay Frequency", "text"],
  ["tax_residency", "Tax Residency", "text"],
  ["td1_annual_allowances", "TD1 Annual Allowances", "number"],
  ["approved_pension_or_annuity", "Pension/Annuity", "number"],
];

const adjustmentTypes = [
  ["salary_advance_repayment", "Salary advance repayment", "deduction_after_statutory"],
  ["employee_loan_repayment", "Employee loan repayment", "deduction_after_statutory"],
  ["no_pay_leave", "No-pay leave / unpaid absence", "reduce_gross"],
  ["lateness_undertime", "Lateness / undertime deduction", "reduce_gross"],
  ["bonus", "Bonus", "taxable_addition"],
  ["commission", "Commission", "taxable_addition"],
  ["overtime", "Overtime", "taxable_addition"],
  ["allowance", "Allowance", "taxable_addition"],
  ["back_pay", "Back pay", "taxable_addition"],
  ["tips_service_charge", "Tips / service charge", "taxable_addition"],
  ["reimbursement", "Reimbursement", "non_taxable_reimbursement"],
  ["uniform_tools", "Uniform / tools deduction", "deduction_after_statutory"],
  ["staff_purchase", "Staff purchase deduction", "deduction_after_statutory"],
  ["pension_annuity", "Tax-deductible pension/annuity", "pre_tax_deduction"],
  ["insurance_medical", "Insurance / medical deduction", "deduction_after_statutory"],
  ["other_addition", "Other addition", "taxable_addition"],
  ["other_deduction", "Other deduction", "deduction_after_statutory"],
];

const adjustmentTreatments = [
  ["taxable_addition", "Add to taxable gross"],
  ["reduce_gross", "Reduce gross pay"],
  ["pre_tax_deduction", "Pre-tax deduction"],
  ["deduction_after_statutory", "Deduct after statutory deductions"],
  ["non_taxable_reimbursement", "Non-taxable reimbursement"],
];

const adjustmentScopes = [
  ["employee", "This employee"],
  ["all", "All employees"],
];

const defaultEmployee = {
  employee_id: "",
  surname: "",
  first_name: "",
  nis_number: "",
  date_of_birth: "",
  date_employed: "",
  last_work_date_rule: "Use the last date of the month for which NIS is being calculated.",
  monthly_salary: 0,
  bir_number: "",
  pay_frequency: "",
  tax_residency: "",
  td1_annual_allowances: "",
  approved_pension_or_annuity: "",
  health_surcharge_exempt: "",
  payroll_adjustments: {},
  active: true,
};

const localCompanyImport = {
  company: {
    legalName: "The J Spa and Skin Clinic LTD",
    name: "The J Spa and Skin Clinic LTD",
    tradeName: "The J Spa and Skin Clinic LTD",
    nibEmployerRegistrationNumber: "155218",
    registrationNumber: "155218",
    phone: "221-0695",
    address: {
      line1: "25 A Circular Road",
      line2: "",
      city: "San Fernando",
      country: "Trinidad and Tobago",
    },
    declarant: {
      name: "Jhoneile Diaz-Cummings",
      position: "Spa Manager",
      signatureRequiredAfterGeneration: true,
    },
  },
  employees: [
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
  ],
};

let authUser = null;
let userProfile = null;
let memberships = [];
let mySignupRequests = [];
let adminSignupRequests = [];
let selectedAdminCompany = null;
let selectedCompanyId = localStorage.getItem("selectedCompanyId") || "";
let localWorkspace = localStorage.getItem("localWorkspace") === "true";
let authIntent = localStorage.getItem("authIntent") || "login";
let state = null;
let activeView = "dashboard";
let editing = null;
let employeeEditorOpen = false;
let adjustmentEditorRows = null;
let payrollMonth = localStorage.getItem("payrollMonth") || latestMonth();
let loadingMessage = "Connecting to Payroll Agent...";
let backendUnavailable = false;

function friendlyAuthMessage(error) {
  if (error.code === "auth/unauthorized-domain") {
    return "Firebase has not authorized this domain. Add this exact domain in Firebase Authentication > Settings > Authorized domains.";
  }
  if (error.code === "auth/popup-closed-by-user") return "Google sign-in was closed before it completed.";
  if (error.code === "auth/popup-blocked") return "The browser blocked the Google sign-in popup.";
  if (error.code === "auth/cancelled-popup-request") return "Google sign-in was interrupted. Try again and keep the Google sign-in window open until it finishes.";
  if (error.code === "auth/operation-not-supported-in-this-environment") return "This browser does not support Google popup sign-in. Try opening the app in Chrome.";
  return error.message || "Google sign-in could not be completed.";
}

function emptyLocalState() {
  return {
    employees: [],
    runs: [],
    alerts: [],
    latest_run: null,
    settings: {
      schedule_enabled: false,
      scheduled_day: 25,
      scheduled_time: "17:00",
      reminder_days_before: 3,
      last_note: "Hosted payroll generation is not connected yet.",
    },
  };
}

function money(value) {
  return `TTD ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function adjustmentTypeLabel(type) {
  return adjustmentTypes.find(([id]) => id === type)?.[1] || type || "Adjustment";
}

function adjustmentTypeTreatment(type) {
  return adjustmentTypes.find(([id]) => id === type)?.[2] || "deduction_after_statutory";
}

function adjustmentTreatmentLabel(treatment) {
  return adjustmentTreatments.find(([id]) => id === treatment)?.[1] || treatment || "Deduct after statutory deductions";
}

function adjustmentScopeLabel(scope) {
  return adjustmentScopes.find(([id]) => id === scope)?.[1] || "This employee";
}

function employeeAdjustments(employee, month = payrollMonth) {
  const adjustments = employee?.payroll_adjustments || employee?.payrollAdjustments || {};
  return Array.isArray(adjustments?.[month]) ? adjustments[month] : [];
}

function adjustmentSignature(adjustment) {
  return [
    adjustment.type || "",
    adjustmentDisplayLabel(adjustment),
    Number(adjustment.amount || 0),
    adjustment.treatment || adjustmentTypeTreatment(adjustment.type),
    adjustment.note || "",
  ].join("|");
}

function companyWideAdjustments(month = payrollMonth) {
  const seen = new Set();
  const rows = [];
  for (const employee of state?.employees || []) {
    for (const adjustment of employeeAdjustments(employee, month)) {
      if (adjustment.scope !== "all") continue;
      const key = adjustmentSignature(adjustment);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...adjustment, scope: "all" });
    }
  }
  return rows;
}

function payrollAdjustmentRowsForEditor(month = payrollMonth) {
  const rows = companyWideAdjustments(month).map((adjustment) => ({
    ...adjustment,
    targetEmployeeId: "all",
    scope: "all",
  }));
  for (const employee of state?.employees || []) {
    for (const adjustment of employeeAdjustments(employee, month).filter((row) => row.scope !== "all")) {
      rows.push({
        ...adjustment,
        targetEmployeeId: employee.employee_id,
        scope: "employee",
      });
    }
  }
  return rows;
}

function adjustmentRowsForEditor() {
  return adjustmentEditorRows || payrollAdjustmentRowsForEditor();
}

function adjustmentTypeOptions(selectedType) {
  return adjustmentTypes.map(([id, label]) => (
    `<option value="${id}" ${id === selectedType ? "selected" : ""}>${escapeHtml(label)}</option>`
  )).join("");
}

function adjustmentTreatmentOptions(selectedTreatment) {
  return adjustmentTreatments.map(([id, label]) => (
    `<option value="${id}" ${id === selectedTreatment ? "selected" : ""}>${escapeHtml(label)}</option>`
  )).join("");
}

function adjustmentTargetOptions(selectedTarget) {
  const employeeOptions = (state?.employees || []).map((employee) => (
    `<option value="${escapeHtml(employee.employee_id)}" ${employee.employee_id === selectedTarget ? "selected" : ""}>${escapeHtml(fullName(employee) || employee.employee_id)}</option>`
  )).join("");
  return `
    <option value="" ${selectedTarget ? "" : "selected"} disabled>Choose employee</option>
    <option value="all" ${selectedTarget === "all" ? "selected" : ""}>All employees</option>
    ${employeeOptions}
  `;
}

function adjustmentDisplayLabel(adjustment) {
  return adjustment.label || adjustmentTypeLabel(adjustment.type);
}

function normalizeRun(run) {
  const payslips = Array.isArray(run.payslips) ? run.payslips.map((payslip) => (
    typeof payslip === "string"
      ? { fileName: payslip, employeeId: payslip.split("-")[0], fullName: "", html: "" }
      : {
        fileName: payslip.fileName || payslip.file || "",
        employeeId: payslip.employeeId || payslip.employee_id || "",
        fullName: payslip.fullName || payslip.full_name || "",
        html: payslip.html || "",
      }
  )) : [];
  const rows = Array.isArray(run.rows) ? run.rows.map((row) => ({
    employeeId: row.employeeId || row.employee_id || "",
    fullName: row.fullName || row.full_name || "",
    nisNumber: row.nisNumber || row.nis_number || "",
    birNumber: row.birNumber || row.bir_number || "",
    nisClass: row.nisClass || row.nis_class || "",
    grossPay: Number(row.grossPay ?? row.gross_pay ?? 0),
    baseSalary: Number(row.baseSalary ?? row.base_salary ?? row.grossPay ?? row.gross_pay ?? 0),
    taxableAdditions: Number(row.taxableAdditions ?? row.taxable_additions ?? 0),
    grossReductions: Number(row.grossReductions ?? row.gross_reductions ?? 0),
    adjustedGross: Number(row.adjustedGross ?? row.adjusted_gross ?? row.grossPay ?? row.gross_pay ?? 0),
    preTaxDeductions: Number(row.preTaxDeductions ?? row.pre_tax_deductions ?? 0),
    postTaxDeductions: Number(row.postTaxDeductions ?? row.post_tax_deductions ?? 0),
    nonTaxableReimbursements: Number(row.nonTaxableReimbursements ?? row.non_taxable_reimbursements ?? 0),
    statutoryDeductions: Number(row.statutoryDeductions ?? row.statutory_deductions ?? 0),
    nisEmployee: Number(row.nisEmployee ?? row.nis_employee ?? 0),
    nisEmployer: Number(row.nisEmployer ?? row.nis_employer ?? 0),
    paye: Number(row.paye ?? 0),
    healthSurcharge: Number(row.healthSurcharge ?? row.health_surcharge ?? 0),
    totalDeductions: Number(row.totalDeductions ?? row.total_deductions ?? 0),
    netPay: Number(row.netPay ?? row.net_pay ?? 0),
    adjustments: Array.isArray(row.adjustments) ? row.adjustments : [],
  })) : [];
  return {
    id: run.id || run.month,
    month: run.month || run.id || "",
    has_payroll: run.has_payroll ?? run.hasPayroll ?? true,
    has_nis: run.has_nis ?? run.hasNis ?? true,
    has_ni184: run.has_ni184 ?? run.hasNi184 ?? false,
    has_ni187: run.has_ni187 ?? run.hasNi187 ?? false,
    employees: Number(run.employees ?? run.employeeCount ?? 0),
    gross: Number(run.gross ?? run.grossPay ?? 0),
    deductions: Number(run.deductions ?? run.totalDeductions ?? 0),
    net: Number(run.net ?? run.netPay ?? 0),
    taxable_additions: Number(run.taxableAdditions ?? run.taxable_additions ?? 0),
    gross_reductions: Number(run.grossReductions ?? run.gross_reductions ?? 0),
    pre_tax_deductions: Number(run.preTaxDeductions ?? run.pre_tax_deductions ?? 0),
    post_tax_deductions: Number(run.postTaxDeductions ?? run.post_tax_deductions ?? 0),
    non_taxable_reimbursements: Number(run.nonTaxableReimbursements ?? run.non_taxable_reimbursements ?? 0),
    statutory_deductions: Number(run.statutoryDeductions ?? run.statutory_deductions ?? 0),
    nis_employee: Number(run.nisEmployee ?? run.nis_employee ?? 0),
    nis_employer: Number(run.nisEmployer ?? run.nis_employer ?? 0),
    paye: Number(run.paye ?? 0),
    health_surcharge: Number(run.healthSurcharge ?? run.health_surcharge ?? 0),
    monday_count: Number(run.mondayCount ?? run.monday_count ?? 0),
    rows,
    payslips,
    outputs: run.outputs || {},
    status: run.status || "draft",
    note: run.note || "",
  };
}

function mergeRunIntoState(run) {
  if (!run) return;
  const normalizedRun = normalizeRun(run);
  const runs = [
    normalizedRun,
    ...(state?.runs || []).filter((existingRun) => existingRun.month !== normalizedRun.month),
  ].sort((a, b) => String(b.month).localeCompare(String(a.month)));
  state = {
    ...(state || emptyLocalState()),
    runs,
    latest_run: runs[0] || normalizedRun,
  };
}

function latestMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function fullName(employee) {
  return `${employee.first_name || ""} ${employee.surname || ""}`.trim();
}

function isAdmin() {
  return userProfile?.platformRole === "platform_admin";
}

function selectedMembership() {
  return memberships.find((membership) => membership.id === selectedCompanyId) || null;
}

function selectedSignupRequest() {
  return mySignupRequests.find((request) => request.companyId === selectedCompanyId) || null;
}

function selectedAdminSignupRequest() {
  return adminSignupRequests.find((request) => request.companyId === selectedCompanyId) || null;
}

function selectedCompanyProfile() {
  const request = selectedSignupRequest();
  const adminRequest = selectedAdminSignupRequest();
  return selectedMembership()?.company
    || (selectedAdminCompany?.id === selectedCompanyId ? selectedAdminCompany : null)
    || (adminRequest ? {
      id: adminRequest.companyId,
      name: adminRequest.companyName,
      tradeName: adminRequest.tradeName,
      nibEmployerRegistrationNumber: adminRequest.nibEmployerRegistrationNumber,
      address: adminRequest.address,
      contactName: adminRequest.contactName,
      contactEmail: adminRequest.contactEmail,
      phone: adminRequest.phone,
      declarant: adminRequest.declarant,
      status: adminRequest.status,
    } : null)
    || (request ? {
      id: request.companyId,
      name: request.companyName,
      tradeName: request.tradeName,
      nibEmployerRegistrationNumber: request.nibEmployerRegistrationNumber,
      address: request.address,
      contactName: request.contactName,
      contactEmail: request.contactEmail,
      phone: request.phone,
      declarant: request.declarant,
      status: request.status,
    } : null);
}

function currentCompanyName() {
  if (localWorkspace) return "The J Spa and Skin Clinic LTD";
  return selectedMembership()?.company?.name
    || selectedMembership()?.companyName
    || selectedSignupRequest()?.companyName
    || selectedCompanyProfile()?.name
    || "No company selected";
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3500);
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function settleWithTimeout(promise, ms) {
  return Promise.race([
    promise.then(
      (value) => ({ status: "resolved", value }),
      (error) => ({ status: "rejected", error }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ status: "timeout" }), ms)),
  ]);
}

async function loadWorkspaceWithLoading(message) {
  loadingMessage = message;
  renderLoading();
  const result = await settleWithTimeout(loadWorkspaceState(), 12000);
  if (result.status === "rejected") throw result.error;
  if (result.status === "timeout") {
    state ||= emptyLocalState();
    toast("Workspace data is taking longer than expected. Showing the app with available data.");
  }
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Request timed out: ${path}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON from ${path}`);
  }
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || "Request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function loadLocalState() {
  try {
    state = await api("/api/state");
    backendUnavailable = false;
  } catch (error) {
    state = emptyLocalState();
    backendUnavailable = true;
  }
}

async function loadWorkspaceState() {
  await loadLocalState();
  if (localWorkspace || !selectedCompanyId) return;
  try {
    const [employees, payrollRuns] = await Promise.all([
      withTimeout(loadCompanyEmployees(selectedCompanyId), 8000, []),
      withTimeout(loadCompanyPayrollRuns(selectedCompanyId), 8000, []),
    ]);
    const runs = payrollRuns.map(normalizeRun).sort((a, b) => String(b.month).localeCompare(String(a.month)));
    state = {
      ...state,
      employees: employees.sort((a, b) => String(a.employee_id || "").localeCompare(String(b.employee_id || ""))),
      runs,
      latest_run: runs[0] || state.latest_run,
    };
  } catch {
    // Company Firestore data may be unavailable until rules/memberships are fully set up.
  }
}

async function refreshFirebaseState() {
  if (!authUser) return;
  userProfile = await withTimeout(ensureUserProfile(authUser), 8000, {
    uid: authUser.uid,
    email: authUser.email || "",
    displayName: authUser.displayName || "",
    platformRole: "user",
    firebaseSetupIssue: true,
    firebaseSetupMessage: "Firebase workspace reads are taking longer than expected. Reload the page, or check the Firebase connection.",
  });
  memberships = await withTimeout(loadMemberships(authUser.uid), 8000, []);
  mySignupRequests = await withTimeout(loadMySignupRequests(authUser.uid), 8000, []);
  if (isAdmin()) {
    adminSignupRequests = await withTimeout(loadAdminSignupRequests(), 8000, []);
  } else {
    adminSignupRequests = [];
  }
  if (authIntent === "signup") {
    selectedCompanyId = "";
    localWorkspace = false;
    localStorage.removeItem("selectedCompanyId");
    localStorage.removeItem("localWorkspace");
  } else if (selectedCompanyId && !localWorkspace) {
    const hasSelectedWorkspace = memberships.some((membership) => membership.id === selectedCompanyId)
      || mySignupRequests.some((request) => request.status === "approved" && request.companyId === selectedCompanyId)
      || (isAdmin() && adminSignupRequests.some((request) => request.status === "approved" && request.companyId === selectedCompanyId));
    if (!hasSelectedWorkspace) {
      selectedCompanyId = "";
      localStorage.removeItem("selectedCompanyId");
    }
  }
  if (authIntent !== "signup" && !selectedCompanyId && memberships.length) {
    selectedCompanyId = memberships[0].id;
    localStorage.setItem("selectedCompanyId", selectedCompanyId);
  } else if (authIntent !== "signup" && !selectedCompanyId) {
    const approvedRequest = mySignupRequests.find((request) => request.status === "approved" && request.companyId);
    if (approvedRequest) {
      selectedCompanyId = approvedRequest.companyId;
      localStorage.setItem("selectedCompanyId", selectedCompanyId);
    }
  }
}

async function bootstrap() {
  renderLoading();
  let authSettled = false;
  let redirectSettled = false;
  settleWithTimeout(completeRedirectSignIn(), 8000).then((redirectResult) => {
    redirectSettled = true;
    if (redirectResult.status === "rejected") {
      toast(friendlyAuthMessage(redirectResult.error));
    } else if (redirectResult.status === "timeout") {
      toast("Google sign-in is taking longer than expected. Continuing with the current session.");
    }
  });
  const authStartupTimer = setTimeout(() => {
    if (authSettled) return;
    authSettled = true;
    state ||= emptyLocalState();
    render();
    if (!redirectSettled) {
      toast("Firebase sign-in is taking longer than expected. Showing the login page.");
    }
  }, 9000);
  listenForAuth(async (user) => {
    if (authSettled && !authUser) {
      clearTimeout(authStartupTimer);
    }
    authSettled = true;
    clearTimeout(authStartupTimer);
    authUser = user;
    let fallbackRendered = false;
    const fallbackTimer = setTimeout(() => {
      if (fallbackRendered) return;
      fallbackRendered = true;
      state ||= emptyLocalState();
      render();
      toast("Workspace data is taking longer than expected. Showing the app with available data.");
    }, 12000);
    try {
      if (authUser) {
        loadingMessage = "Loading company workspace...";
        renderLoading();
        await refreshFirebaseState();
        if (authIntent === "signup") {
          state = emptyLocalState();
        } else if (localWorkspace || selectedCompanyId || isAdmin()) {
          await loadWorkspaceState();
        } else {
          state = emptyLocalState();
        }
      }
      if (!fallbackRendered) render();
    } catch (error) {
      if (!fallbackRendered) renderError(error);
    } finally {
      clearTimeout(fallbackTimer);
    }
  });
}

function renderLoading() {
  document.getElementById("app").innerHTML = `
    <main class="auth-page">
      <section class="auth-card">
        <div class="brand-mark">PA</div>
        <h1>Payroll Agent</h1>
        <p>${loadingMessage}</p>
      </section>
    </main>
  `;
}

function renderError(error) {
  document.getElementById("app").innerHTML = `
    <main class="auth-page">
      <section class="auth-card wide">
        <div class="brand-mark">PA</div>
        <h1>Payroll Agent needs attention</h1>
        <p>${escapeHtml(error.message)}</p>
        <p class="caption">Check that Google sign-in is enabled, localhost is an authorized domain, and Firestore rules allow your account to read its profile.</p>
        <button class="btn primary" onclick="window.location.reload()">Retry</button>
      </section>
    </main>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderLogin() {
  return `
    <main class="landing-page">
      <header class="landing-nav">
        <div class="landing-brand">
          <div class="brand-mark">PA</div>
          <div>
            <strong>Payroll Agent</strong>
            <span>Payroll tools for T&T employers</span>
          </div>
        </div>
        <div class="landing-nav-actions">
          <button class="btn" onclick="signIn('login')">Log in</button>
          <button class="btn primary" onclick="signIn('signup')">Sign up company</button>
        </div>
      </header>

      <section class="landing-hero">
        <div class="hero-copy">
          <span class="eyebrow">Payroll, payslips, and NIS readiness</span>
          <h1>Run monthly payroll, generate complete payslips, and get automatically filled out NIB forms.</h1>
          <p>
            Payroll Agent helps small businesses keep employee records, calculate payroll deductions,
            prepare payslips, and automatically fill out the NI184 and NI187 forms so they are ready
            to print and sign.
          </p>
          <div class="landing-actions">
            <button class="btn primary large" onclick="signIn('signup')">Sign up company</button>
            <button class="btn large" onclick="signIn('login')">Log in</button>
          </div>
          <div class="requirement-strip">
            <span>To sign up you need:</span>
            <strong>Gmail account</strong>
            <strong>Business NIS Number</strong>
          </div>
        </div>

        <aside class="product-preview" aria-label="Payroll Agent dashboard preview">
          <div class="preview-top">
            <div>
              <span>July 2026 Payroll</span>
              <strong>The J Spa and Skin Clinic LTD</strong>
            </div>
            <span class="status success">Ready</span>
          </div>
          <div class="preview-kpis">
            <div><span>Employees</span><strong>3</strong></div>
            <div><span>Net pay</span><strong>TTD 12,476.10</strong></div>
            <div><span>NIB forms</span><strong>Ready to print</strong></div>
          </div>
          <div class="preview-list">
            <div><span>Employee records</span><strong>Updated</strong></div>
            <div><span>PAYE and Health Surcharge</span><strong>Calculated</strong></div>
            <div><span>NI184 and NI187</span><strong>Filled automatically</strong></div>
          </div>
        </aside>
      </section>

      <section class="nib-highlight">
        <div>
          <span class="eyebrow">Signature-ready NIB forms</span>
          <h2>Automatically prepare NI184 and NI187 forms each month.</h2>
          <p>
            Payroll Agent uses your company profile, employee records, and monthly payroll run to fill
            the two National Insurance Board forms for you. Review them, print them, sign them, and keep
            your payroll file moving without manually typing the same information again.
          </p>
        </div>
        <div class="nib-form-stack" aria-label="NIB forms preview">
          <div>
            <strong>NI184</strong>
            <span>Monthly contribution summary</span>
          </div>
          <div>
            <strong>NI187</strong>
            <span>Employee contribution details</span>
          </div>
        </div>
      </section>

      <section class="landing-section">
        <div class="section-intro">
          <span class="eyebrow">Why businesses use it</span>
          <h2>Built for monthly payroll work that needs to be accurate, repeatable, and easy to review.</h2>
        </div>
        <div class="benefit-grid">
          <article>
            <span class="benefit-icon">01</span>
            <h3>Calculate deductions</h3>
            <p>Bring NIS, PAYE, Health Surcharge, gross pay, deductions, and net pay into one monthly workflow.</p>
          </article>
          <article>
            <span class="benefit-icon">02</span>
            <h3>Organize employee records</h3>
            <p>Keep employee names, NIS numbers, dates employed, salary details, and payroll history together.</p>
          </article>
          <article>
            <span class="benefit-icon">03</span>
            <h3>Fill NIB forms automatically</h3>
            <p>Prepare NI184 and NI187 forms from the monthly payroll run so they are ready to print and sign.</p>
          </article>
          <article>
            <span class="benefit-icon">04</span>
            <h3>Work by company</h3>
            <p>Each approved business gets its own workspace, company profile, employees, payroll runs, and reports.</p>
          </article>
        </div>
      </section>

      <section class="landing-section split-section">
        <div>
          <span class="eyebrow">How signup works</span>
          <h2>Start with your Google account and Business NIS Number.</h2>
          <p>
            New businesses submit a company profile for approval. Once approved, the company workspace is ready
            for employees, monthly payroll runs, payslips, reports, and NIS preparation.
          </p>
        </div>
        <div class="steps">
          <div><strong>1</strong><span>Sign in using Gmail</span></div>
          <div><strong>2</strong><span>Enter company details and Business NIS Number</span></div>
          <div><strong>3</strong><span>Add employees and run monthly payroll</span></div>
        </div>
      </section>

      <section class="landing-section trust-section">
        <div>
          <span class="eyebrow">Designed for small employers</span>
          <h2>A professional payroll workspace without the clutter.</h2>
        </div>
        <div class="trust-grid">
          <span>Google sign-in</span>
          <span>Company-specific workspaces</span>
          <span>Admin-approved onboarding</span>
          <span>Payroll run history</span>
          <span>Employee payslip access</span>
          <span>NI184 and NI187 form preparation</span>
        </div>
      </section>

      <section class="landing-cta">
        <h2>Ready to set up your company payroll workspace?</h2>
        <p>Use your Gmail account and Business NIS Number to request access.</p>
        <div class="landing-actions center">
          <button class="btn primary large" onclick="signIn('signup')">Sign up company</button>
          <button class="btn large" onclick="signIn('login')">Log in</button>
        </div>
      </section>
    </main>
  `;
}

function renderOnboarding() {
  const requests = mySignupRequests.map((request) => `
    <div>
      <span><strong>${escapeHtml(request.companyName)}</strong><br><span class="caption">${escapeHtml(request.status)}</span></span>
      <span class="status ${request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "warning"}">${escapeHtml(request.status)}</span>
    </div>
  `).join("");

  return `
    <main class="auth-page">
      ${firebaseSetupNotice()}
      <section class="auth-card wide">
        <div class="panel-head">
          <div>
            <div class="brand-mark">PA</div>
            <h1>Create a company profile</h1>
            <p>Submit a company request. After approval, the business gets its own payroll workspace.</p>
          </div>
          <button class="btn" onclick="signOut()">Sign out</button>
        </div>
        <div class="form-section">
          <h2>Company details</h2>
          <div class="form-grid">
            <label>Legal company name<input id="signup-company-name" type="text" placeholder="Company LTD"></label>
            <label>Trade name used on NIB forms<input id="signup-trade-name" type="text" placeholder="Company trading name"></label>
            <label>NIB employer registration number<input id="signup-nib-registration" type="text" inputmode="numeric" maxlength="6" pattern="\\d{6}" placeholder="6 digits"></label>
            <label>Phone<input id="signup-phone" type="text"></label>
          </div>
          <p class="caption">The NIB employer registration number is the employer number issued by the National Insurance Board. It is not the same thing as a Companies Registry incorporation number unless NIB assigned the same value.</p>
        </div>
        <div class="form-section">
          <h2>Employer address</h2>
          <div class="form-grid">
            <label>Address line 1<input id="signup-address-line1" type="text" placeholder="Street address"></label>
            <label>Address line 2<input id="signup-address-line2" type="text" placeholder="Optional"></label>
            <label>City / area<input id="signup-city" type="text"></label>
            <label>Country<input id="signup-country" type="text" value="Trinidad and Tobago"></label>
          </div>
        </div>
        <div class="form-section">
          <h2>Contact and declaration</h2>
          <div class="form-grid">
            <label>Contact name<input id="signup-contact" type="text" value="${escapeHtml(authUser?.displayName || "")}"></label>
            <label>Contact email<input id="signup-email" type="email" value="${escapeHtml(authUser?.email || "")}" disabled></label>
            <label>NIB declarant name<input id="signup-declarant-name" type="text" placeholder="Person signing/submitting NIB forms"></label>
            <label>NIB declarant position<input id="signup-declarant-position" type="text" placeholder="Owner, Manager, Payroll Officer"></label>
          </div>
        </div>
        <div class="actions" style="margin-top:16px">
          <button class="btn primary" onclick="submitCompanySignup()">Submit company request</button>
        </div>
      </section>
      <section class="auth-card wide">
        <h2>My company requests</h2>
        <div class="activity">${requests || "<p>No company requests yet.</p>"}</div>
      </section>
    </main>
  `;
}

function firebaseSetupNotice() {
  if (!userProfile?.firebaseSetupIssue) return "";
  return `
    <section class="auth-card wide notice-card">
      <h2>Firebase database permissions need setup</h2>
      <p>Google sign-in is working, but Firestore rejected profile access. Deploy the rules in <code>firebase/firestore.rules</code> and <code>firebase/storage.rules</code>, or temporarily allow signed-in users while testing.</p>
      <p class="caption">${escapeHtml(userProfile.firebaseSetupMessage)}</p>
    </section>
  `;
}

function shell(content) {
  const navItems = isAdmin() ? [...companyNavItems, ...adminNavItems] : companyNavItems;
  const nav = navItems.map(([id, label]) => `
    <button class="${activeView === id ? "active" : ""}" onclick="setView('${id}')">
      <span>${icon(id)}</span>${label}
    </button>
  `).join("");

  const companyOptions = memberships.map((membership) => `
    <option value="${membership.id}" ${membership.id === selectedCompanyId && !localWorkspace ? "selected" : ""}>
      ${escapeHtml(membership.company?.name || membership.companyName || membership.id)}
    </option>
  `).join("");

  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">PA</div>
          <div><strong>Payroll Agent</strong><span>${escapeHtml(currentCompanyName())}</span></div>
        </div>
        <div class="tenant-switcher">
          <label>Company
            <select onchange="selectCompany(this.value)">
              ${localWorkspace ? `<option value="local" selected>Local workspace</option>` : ""}
              ${companyOptions}
            </select>
          </label>
        </div>
        <nav class="nav">${nav}</nav>
        <div class="side-note">
          Signed in<br>
          <strong>${escapeHtml(authUser?.email || "")}</strong>
          <button class="link-button" onclick="signOut()">Sign out</button>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div>
            <h1>${titleFor(activeView)}</h1>
            <p>${subtitleFor(activeView)}</p>
          </div>
          ${topbarActions()}
        </div>
        ${content}
      </main>
    </div>
  `;
}

function topbarActions() {
  if (activeView === "admin" || activeView === "companies") return "";
  const canRunHostedPayroll = !localWorkspace && selectedCompanyId;
  if (backendUnavailable && !canRunHostedPayroll) {
    return `
      <div class="actions">
        <input id="runMonth" type="month" value="${payrollMonth}" onchange="setPayrollMonth(this.value)" disabled>
        <label class="inline-check muted-control"><input id="generateNisForms" type="checkbox" checked disabled> NIS forms</label>
        <button class="btn primary disabled-action" onclick="explainPayrollUnavailable()">Payroll engine offline</button>
      </div>
    `;
  }
  return `
    <div class="actions">
      <input id="runMonth" type="month" value="${payrollMonth}" onchange="setPayrollMonth(this.value)">
      <label class="inline-check"><input id="generateNisForms" type="checkbox" checked> NIS forms</label>
      <button class="btn primary" onclick="runPayroll()">Run payroll</button>
    </div>
  `;
}

function icon(id) {
  return {
    dashboard: "▦",
    employees: "☷",
    runs: "◷",
    payslips: "□",
    reports: "◫",
    settings: "⚙",
    admin: "★",
    companies: "▤",
  }[id] || "□";
}

function titleFor(id) {
  return {
    dashboard: `${state.latest_run?.month || "Current"} Payroll`,
    employees: "Employees",
    runs: "Payroll Runs",
    payslips: "Payslips",
    nibForms: "NIB Forms",
    reports: "Reports",
    settings: "Settings",
    admin: "Administrator",
    companies: "Companies",
  }[id];
}

function subtitleFor(id) {
  return {
    dashboard: "Track company payroll readiness, reminders, statutory forms, and monthly runs.",
    employees: "Add and maintain employee records used by NIS, PAYE, Health Surcharge, and payslips.",
    runs: "Review draft payroll totals before approving final payroll files.",
    payslips: "Open generated payslips grouped by employee.",
    nibForms: "Open generated NI184 and NI187 forms by payroll month.",
    reports: "Compare gross pay, deductions, net pay, and employer costs.",
    settings: "Control reminder timing and scheduled payroll preferences.",
    admin: "Approve company signups and monitor account onboarding.",
    companies: "Review company memberships available to your account.",
  }[id];
}

function dashboard() {
  state ||= emptyLocalState();
  const activeEmployees = state.employees.filter((employee) => employee.active).length;
  const latest = state.latest_run || {};
  const alerts = state.alerts.map((alert) => `
    <div>
      <strong>${escapeHtml(alert.title)}</strong>
      <span class="status warning">Pending changes</span>
    </div>
    <p>${escapeHtml(alert.body)}</p>
  `).join("") || `<p>No pending employee record reminders.</p>`;

  return `
    <div class="grid kpis">
      ${metric("Active employees", activeEmployees)}
      ${metric("Latest net pay", money(latest.net))}
      ${metric("Latest deductions", money(latest.deductions))}
      ${metric("NIS forms", latest.has_ni184 && latest.has_ni187 ? "Ready" : "Pending")}
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Pending changes</h2><span class="status ${state.alerts.length ? "warning" : "success"}">${state.alerts.length ? "Review" : "Clear"}</span></div>
      ${alerts}
    </section>
    <div class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <div class="panel-head"><h2>Employees</h2><button class="btn" onclick="setView('employees')">Manage</button></div>
        ${employeeTable(state.employees.slice(0, 5))}
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Recent payroll runs</h2><button class="btn" onclick="setView('runs')">Reports</button></div>
        ${runList(state.runs.slice(0, 4))}
      </section>
    </div>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function employeeTable(rows) {
  return `
    <table>
      <thead><tr><th>ID</th><th>Name</th><th>NIS</th><th class="money">Salary</th><th>Status</th></tr></thead>
      <tbody>${rows.map((employee) => `
        <tr>
          <td>${escapeHtml(employee.employee_id)}</td>
          <td>${escapeHtml(fullName(employee))}</td>
          <td>${escapeHtml(employee.nis_number || "")}</td>
          <td class="money">${money(employee.monthly_salary)}</td>
          <td><span class="status ${employee.active ? "success" : "neutral"}">${employee.active ? "Active" : "Inactive"}</span></td>
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

function employeesView() {
  state ||= emptyLocalState();
  const employee = editing || defaultEmployee;
  const formOpen = employeeEditorOpen || Boolean(editing);
  const canSaveEmployee = !backendUnavailable || (!localWorkspace && selectedCompanyId);
  const canSaveAdjustments = Boolean(state.employees.length) && (!backendUnavailable || (!localWorkspace && selectedCompanyId));
  const adjustments = adjustmentRowsForEditor();
  const form = fields.map(([key, label, type]) => `
    <label>${label}
      <input id="field-${key}" type="${type}" value="${escapeHtml(employee[key] ?? "")}" ${type === "number" ? 'step="0.01"' : ""}>
    </label>
  `).join("");

  return `
    <section class="panel">
      <div class="panel-head">
        <h2>Employee list</h2>
        <div class="actions">
          <span class="status neutral">${state.employees.length} records</span>
          <button class="btn primary" onclick="startNewEmployee()">Add employee</button>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>NIS</th><th>BIR</th><th class="money">Salary</th><th></th></tr></thead>
          <tbody>${state.employees.map((employee) => `
            <tr>
              <td>${escapeHtml(employee.employee_id)}</td>
              <td>${escapeHtml(fullName(employee))}</td>
              <td>${escapeHtml(employee.nis_number || "")}</td>
              <td>${escapeHtml(employee.bir_number || "")}</td>
              <td class="money">${money(employee.monthly_salary)}</td>
              <td class="right"><button class="btn" onclick="editEmployee('${escapeHtml(employee.employee_id)}')">Edit</button></td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </section>
    ${formOpen ? `
      <section class="panel employee-editor-panel">
        <div class="panel-head">
          <h2>${editing ? `Edit ${escapeHtml(editing.employee_id)}` : "New employee"}</h2>
          <div class="actions">
            <button class="btn" onclick="clearEmployeeForm()">Cancel</button>
            <button class="btn primary" onclick="saveEmployee()" ${canSaveEmployee ? "" : "disabled"}>Submit</button>
          </div>
        </div>
        <div class="form-grid">${form}</div>
        <label style="margin-top:12px"><span><input id="field-active" type="checkbox" ${employee.active ? "checked" : ""} style="width:auto;min-height:auto"> Active employee</span></label>
        <p class="caption">Hosted company changes are saved to Firestore. Local workspace changes use the local payroll engine.</p>
      </section>
    ` : ""}
    <section class="panel payroll-adjustments-panel">
      <div class="panel-head">
        <div>
          <h2>Payroll adjustments</h2>
          <p class="caption">One-time entries for ${escapeHtml(payrollMonth)}. They can apply to all employees or a selected employee.</p>
        </div>
        <div class="actions">
          <button class="btn" onclick="addAdjustment()" ${state.employees.length ? "" : "disabled"}>Add adjustment</button>
          <button class="btn primary" onclick="savePayrollAdjustments()" ${canSaveAdjustments ? "" : "disabled"}>Save adjustments</button>
        </div>
      </div>
      ${adjustmentEditor(adjustments)}
    </section>
  `;
}

function adjustmentEditor(adjustments) {
  if (!adjustments.length) return `<p class="caption">No adjustments for ${escapeHtml(payrollMonth)}.</p>`;
  return `
    <div class="table-scroll">
      <table class="adjustment-table">
        <thead><tr><th>Type</th><th>Apply to</th><th>Label</th><th class="money">Amount</th><th>Treatment</th><th>Note</th><th></th></tr></thead>
        <tbody>${adjustments.map((adjustment, index) => `
          <tr data-adjustment-row="${index}">
            <td>
              <select id="adjustment-type-${index}" onchange="syncAdjustmentTreatment(${index})">
                ${adjustmentTypeOptions(adjustment.type || "salary_advance_repayment")}
              </select>
            </td>
            <td>
              <select id="adjustment-target-${index}">
                ${adjustmentTargetOptions(adjustment.targetEmployeeId || (adjustment.scope === "all" ? "all" : ""))}
              </select>
            </td>
            <td><input id="adjustment-label-${index}" type="text" value="${escapeHtml(adjustmentDisplayLabel(adjustment))}" placeholder="${/other/i.test(adjustment.type || "") ? "Required custom label" : adjustmentTypeLabel(adjustment.type || "salary_advance_repayment")}"></td>
            <td><input id="adjustment-amount-${index}" type="number" min="0" step="0.01" value="${Number(adjustment.amount || 0)}"></td>
            <td>
              <select id="adjustment-treatment-${index}">
                ${adjustmentTreatmentOptions(adjustment.treatment || adjustmentTypeTreatment(adjustment.type || "salary_advance_repayment"))}
              </select>
            </td>
            <td><input id="adjustment-note-${index}" type="text" value="${escapeHtml(adjustment.note || "")}"></td>
            <td class="right"><button class="btn danger-btn" onclick="removeAdjustment(${index})">Remove</button></td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

function runsView() {
  state ||= emptyLocalState();
  return `<section class="panel"><div class="panel-head"><h2>Payroll Runs</h2><span class="status neutral">${state.runs.length} months</span></div>${runTable(state.runs)}</section>`;
}

function runList(runs) {
  if (!runs.length) return `<p>No payroll runs found.</p>`;
  return `<div class="activity">${runs.map((run) => `
    <div>
      <span><strong>${escapeHtml(run.month)}</strong><br><span class="caption">${run.employees} employee(s), ${runStatusLabel(run)}</span></span>
      <span class="right"><strong>${money(run.net)}</strong><br>${formBadges(run)}</span>
    </div>
  `).join("")}</div>`;
}

function formBadges(run) {
  const ni184 = run.outputs?.ni184Html
    ? `<button class="mini-link" onclick="openPayrollArtifact('${escapeHtml(run.month)}', 'ni184Html', 'html')">NI184 draft</button>`
    : `<span class="status neutral">NI184 pending</span>`;
  const ni187 = run.outputs?.ni187Html
    ? `<button class="mini-link" onclick="openPayrollArtifact('${escapeHtml(run.month)}', 'ni187Html', 'html')">NI187 draft</button>`
    : `<span class="status neutral">NI187 pending</span>`;
  return `<span class="form-links">${ni184}${ni187}</span>`;
}

function outputLinks(run) {
  if (!run.outputs?.payrollSummaryMarkdown && !run.outputs?.payrollCsv) return "";
  return `
    <span class="form-links">
      ${run.outputs.payrollSummaryMarkdown ? `<button class="mini-link" onclick="openPayrollArtifact('${escapeHtml(run.month)}', 'payrollSummaryMarkdown', 'markdown')">Summary</button>` : ""}
      ${run.outputs.payrollCsv ? `<button class="mini-link" onclick="downloadPayrollArtifact('${escapeHtml(run.month)}', 'payrollCsv', 'payroll-${escapeHtml(run.month)}.csv', 'text/csv')">Payroll CSV</button>` : ""}
    </span>
  `;
}

function runStatusLabel(run) {
  if (run.status === "approved") return "Approved";
  if (run.status === "cancelled") return "Cancelled";
  if (run.status === "draft") return "Draft";
  if (run.has_payroll) return "Complete";
  return "NIS only";
}

function runStatusBadge(run) {
  const label = runStatusLabel(run);
  const tone = run.status === "approved" ? "success"
    : run.status === "cancelled" ? "danger"
      : run.status === "draft" ? "warning"
        : run.has_payroll ? "success" : "neutral";
  return `<span class="status ${tone}">${label}</span>`;
}

function runActionButtons(run) {
  if (localWorkspace || !selectedCompanyId || run.status !== "draft") return "";
  return `
    <div class="actions compact-actions">
      <button class="btn primary" onclick="approvePayrollRun('${escapeHtml(run.month)}')">Approve</button>
      <button class="btn danger-btn" onclick="cancelPayrollRun('${escapeHtml(run.month)}')">Cancel</button>
    </div>
  `;
}

function runReviewSummary(run) {
  return `
    <div class="detail-grid payroll-summary-grid">
      <div><span>Gross income</span><strong>${money(run.gross)}</strong></div>
      <div><span>Taxable additions</span><strong>${money(run.taxable_additions)}</strong></div>
      <div><span>Gross reductions</span><strong>${money(run.gross_reductions)}</strong></div>
      <div><span>Employee NIS</span><strong>${money(run.nis_employee)}</strong></div>
      <div><span>PAYE</span><strong>${money(run.paye)}</strong></div>
      <div><span>Health Surcharge</span><strong>${money(run.health_surcharge)}</strong></div>
      <div><span>Other deductions</span><strong>${money(run.pre_tax_deductions + run.post_tax_deductions)}</strong></div>
      <div><span>Reimbursements</span><strong>${money(run.non_taxable_reimbursements)}</strong></div>
      <div><span>Total deductions</span><strong>${money(run.deductions)}</strong></div>
      <div><span>Net pay</span><strong>${money(run.net)}</strong></div>
      <div><span>Employer NIS</span><strong>${money(run.nis_employer)}</strong></div>
      <div><span>NIS weeks</span><strong>${run.monday_count || "-"}</strong></div>
      <div><span>Outputs</span><strong>${run.has_ni184 || run.has_ni187 || run.payslips.length ? "Generated" : "Not generated"}</strong></div>
    </div>
  `;
}

function adjustmentLineSummary(row) {
  if (!row.adjustments?.length) return "";
  return `<br><span class="caption">${row.adjustments.map((adjustment) => `${escapeHtml(adjustmentDisplayLabel(adjustment))}: ${money(adjustment.amount)} (${escapeHtml(adjustmentTreatmentLabel(adjustment.treatment))}, ${escapeHtml(adjustmentScopeLabel(adjustment.scope))})`).join("<br>")}</span>`;
}

function runEmployeeBreakdown(run) {
  if (!run.rows.length) return `<p>No employee calculation rows were stored for this run.</p>`;
  return `
    <div class="table-scroll">
      <table class="review-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>NIS class</th>
            <th class="money">Base salary</th>
            <th class="money">Taxable additions</th>
            <th class="money">Gross reductions</th>
            <th class="money">Adjusted gross</th>
            <th class="money">Employee NIS</th>
            <th class="money">PAYE</th>
            <th class="money">Health Surcharge</th>
            <th class="money">Other deductions</th>
            <th class="money">Reimbursements</th>
            <th class="money">Net pay</th>
          </tr>
        </thead>
        <tbody>${run.rows.map((row) => `
          <tr>
            <td><strong>${escapeHtml(row.fullName || row.employeeId)}</strong><br><span class="caption">${escapeHtml(row.employeeId)} ${escapeHtml(row.nisNumber || "")}</span>${adjustmentLineSummary(row)}</td>
            <td>${escapeHtml(row.nisClass || "")}</td>
            <td class="money">${money(row.baseSalary)}</td>
            <td class="money">${money(row.taxableAdditions)}</td>
            <td class="money">${money(row.grossReductions)}</td>
            <td class="money">${money(row.adjustedGross)}</td>
            <td class="money">${money(row.nisEmployee)}</td>
            <td class="money">${money(row.paye)}</td>
            <td class="money">${money(row.healthSurcharge)}</td>
            <td class="money">${money(row.preTaxDeductions + row.postTaxDeductions)}</td>
            <td class="money">${money(row.nonTaxableReimbursements)}</td>
            <td class="money"><strong>${money(row.netPay)}</strong></td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

function runTable(runs) {
  if (!runs.length) return `<p>No payroll runs found.</p>`;
  return runs.map((run) => `
    <div class="run-review">
      <div class="run-review-head">
        <div>
          <h3>${escapeHtml(run.month)}</h3>
          <span class="caption">${run.employees} employee(s)</span>
        </div>
        <div class="run-review-actions">
          ${runStatusBadge(run)}
          ${runActionButtons(run)}
        </div>
      </div>
      ${runReviewSummary(run)}
      ${runEmployeeBreakdown(run)}
      <div class="run-output-row">
        ${outputLinks(run)}
        <span>${formBadges(run)}</span>
        ${run.payslips.length ? `<button class="mini-link" onclick="setView('payslips')">${run.payslips.length} payslip${run.payslips.length === 1 ? "" : "s"}</button>` : `<span class="status neutral">Payslips pending</span>`}
      </div>
    </div>
  `).join("");
}

function payslipsView() {
  state ||= emptyLocalState();
  const employeeMap = new Map(state.employees.map((employee) => [employee.employee_id, employee]));
  const grouped = new Map();
  state.runs.forEach((run) => {
    run.payslips.forEach((file) => {
      const employeeId = file.employeeId || file.fileName?.split("-")[0] || "";
      const employee = employeeMap.get(employeeId);
      const key = employeeId || "unknown";
      if (!grouped.has(key)) {
        grouped.set(key, {
          employeeId: key,
          name: file.fullName || (employee ? fullName(employee) : key),
          files: [],
        });
      }
      grouped.get(key).files.push({ month: run.month, fileName: file.fileName, html: file.html });
    });
  });

  const groups = Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  return `
    <section class="panel">
      <div class="panel-head"><h2>Payslips by employee</h2><span class="status neutral">${groups.reduce((total, group) => total + group.files.length, 0)} files</span></div>
      ${groups.map((group) => `
        <div class="employee-payslip-group">
          <div class="employee-payslip-head">
            <div><strong>${escapeHtml(group.name)}</strong><br><span class="caption">${escapeHtml(group.employeeId)}</span></div>
            <span class="status neutral">${group.files.length} payslip${group.files.length === 1 ? "" : "s"}</span>
          </div>
          <div class="activity">
            ${group.files.map((item) => `<button class="activity-button" onclick="openPayslip('${escapeHtml(item.month)}', '${escapeHtml(item.fileName)}')"><span>${escapeHtml(item.month)}</span><strong>Open payslip</strong></button>`).join("")}
          </div>
        </div>
      `).join("") || "<p>No payslips generated yet.</p>"}
    </section>
  `;
}

function nibFormFiles(run) {
  return [
    {
      key: "ni184Html",
      label: "NI184",
      description: "Employee contribution return",
      fileName: `NI184-${run.month}.html`,
      available: Boolean(run.outputs?.ni184Html),
    },
    {
      key: "ni187Html",
      label: "NI187",
      description: "Employee/employer contribution schedule",
      fileName: `NI187-${run.month}.html`,
      available: Boolean(run.outputs?.ni187Html),
    },
  ];
}

function nibFormsView() {
  state ||= emptyLocalState();
  const runsWithForms = state.runs.filter((run) => (
    run.outputs?.ni184Html || run.outputs?.ni187Html || run.has_ni184 || run.has_ni187
  ));
  const generatedCount = state.runs.reduce((total, run) => (
    total + nibFormFiles(run).filter((form) => form.available).length
  ), 0);
  return `
    <section class="panel">
      <div class="panel-head"><h2>NIB forms by month</h2><span class="status neutral">${generatedCount} files</span></div>
      ${runsWithForms.map((run) => `
        <div class="nib-form-group">
          <div class="nib-form-head">
            <div>
              <strong>${escapeHtml(run.month)}</strong><br>
              <span class="caption">${run.employees} employee(s), ${runStatusLabel(run)} payroll, ${run.monday_count || "-"} NIS week${run.monday_count === 1 ? "" : "s"}</span>
            </div>
            <div class="nib-form-totals">
              <span><strong>${money(run.nis_employee)}</strong><br><span class="caption">Employee NIS</span></span>
              <span><strong>${money(run.nis_employer)}</strong><br><span class="caption">Employer NIS</span></span>
            </div>
          </div>
          <div class="activity nib-form-list">
            ${nibFormFiles(run).map((form) => form.available ? `
              <div class="nib-form-row">
                <span><strong>${form.label}</strong><br><span class="caption">${form.description}</span></span>
                <span class="form-links">
                  <button class="mini-link" onclick="openPayrollArtifact('${escapeHtml(run.month)}', '${form.key}', 'html')">Open</button>
                  <button class="mini-link" onclick="downloadPayrollArtifact('${escapeHtml(run.month)}', '${form.key}', '${escapeHtml(form.fileName)}', 'text/html')">Download</button>
                </span>
              </div>
            ` : `
              <div class="nib-form-row muted-row">
                <span><strong>${form.label}</strong><br><span class="caption">${form.description}</span></span>
                <span class="status neutral">Pending</span>
              </div>
            `).join("")}
          </div>
        </div>
      `).join("") || "<p>No NIB forms generated yet.</p>"}
    </section>
  `;
}

function reportsView() {
  state ||= emptyLocalState();
  return `
    <section class="panel">
      <div class="panel-head"><h2>Reports</h2><span class="status neutral">Historical totals</span></div>
      <table>
        <thead><tr><th>Month</th><th class="money">Gross</th><th class="money">Deductions</th><th class="money">Net Pay</th><th>Payslips</th><th>NIS Forms</th></tr></thead>
        <tbody>${state.runs.map((run) => `
          <tr><td>${escapeHtml(run.month)}</td><td class="money">${money(run.gross)}</td><td class="money">${money(run.deductions)}</td><td class="money">${money(run.net)}</td><td>${run.payslips.length}</td><td>${formBadges(run)}</td></tr>
        `).join("")}</tbody>
      </table>
    </section>
  `;
}

function payrollRun(month) {
  return state.runs.find((run) => run.month === month) || null;
}

function openTextBlob(content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function downloadTextBlob(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function settingsView() {
  state ||= emptyLocalState();
  const company = selectedCompanyProfile();
  const address = company?.address || {};
  const declarant = company?.declarant || {};
  return `
    ${company ? `
      <section class="panel">
        <div class="panel-head"><h2>Company profile</h2><span class="status success">Active</span></div>
        <div class="detail-grid">
          <div><span>Legal name</span><strong>${escapeHtml(company.legalName || company.name || "")}</strong></div>
          <div><span>Trade name on NIB forms</span><strong>${escapeHtml(company.tradeName || company.name || "")}</strong></div>
          <div><span>NIB employer registration number</span><strong>${escapeHtml(company.nibEmployerRegistrationNumber || company.registrationNumber || "")}</strong></div>
          <div><span>Phone</span><strong>${escapeHtml(company.phone || "")}</strong></div>
          <div><span>Employer address</span><strong>${escapeHtml([address.line1, address.line2, address.city, address.country].filter(Boolean).join(", "))}</strong></div>
          <div><span>NIB declarant</span><strong>${escapeHtml([declarant.name, declarant.position].filter(Boolean).join(", "))}</strong></div>
        </div>
      </section>
    ` : ""}
    <section class="panel">
      <div class="panel-head"><h2>Schedule and reminders</h2><button class="btn primary" onclick="saveSettings()" ${backendUnavailable ? "disabled" : ""}>Save settings</button></div>
      <div class="form-grid">
        <label>Scheduled day<input id="scheduled_day" type="number" min="1" max="31" value="${state.settings.scheduled_day}"></label>
        <label>Scheduled time<input id="scheduled_time" type="time" value="${state.settings.scheduled_time}"></label>
        <label>Reminder days before<input id="reminder_days_before" type="number" min="0" max="14" value="${state.settings.reminder_days_before}"></label>
      </div>
      <label style="margin-top:12px"><span><input id="schedule_enabled" type="checkbox" ${state.settings.schedule_enabled ? "checked" : ""} style="width:auto;min-height:auto"> Enable scheduled payroll reminder</span></label>
      <p>This app stores the schedule preference locally. Scheduled Firebase/Cloud Run execution is the next backend phase.</p>
    </section>
  `;
}

function adminView() {
  const pending = adminSignupRequests.filter((request) => request.status === "pending");
  return `
    <section class="panel">
      <div class="panel-head"><h2>Company signup requests</h2><span class="status warning">${pending.length} pending</span></div>
      <table>
        <thead><tr><th>Company</th><th>Contact</th><th>Status</th><th></th></tr></thead>
        <tbody>${adminSignupRequests.map((request) => `
          <tr>
            <td>
              <strong>${escapeHtml(request.companyName)}</strong><br>
              <span class="caption">${escapeHtml(request.tradeName || request.companyName || "")}</span><br>
              <span class="caption">${escapeHtml([request.address?.line1, request.address?.city].filter(Boolean).join(", "))}</span>
            </td>
            <td>
              ${escapeHtml(request.contactName || "")}<br>
              <span class="caption">${escapeHtml(request.contactEmail || request.requestedByEmail || "")}</span><br>
              <span class="caption">NIB employer no. ${escapeHtml(request.nibEmployerRegistrationNumber || "not provided")}</span>
            </td>
            <td><span class="status ${request.status === "approved" ? "success" : request.status === "rejected" ? "danger" : "warning"}">${escapeHtml(request.status)}</span></td>
            <td class="right">
              ${request.status === "pending" ? `
                <button class="btn primary" onclick="approveSignup('${request.id}')">Approve</button>
                <button class="btn" onclick="rejectSignup('${request.id}')">Reject</button>
              ` : request.companyId && /j spa/i.test(`${request.companyName || ""} ${request.tradeName || ""}`) ? `
                <button class="btn primary" onclick="openAdminCompany('${request.id}')">Open workspace</button>
                <button class="btn" onclick="importLocalCompanyData('${request.id}')">Import local data</button>
              ` : ""}
            </td>
          </tr>
        `).join("") || `<tr><td colspan="4">No signup requests found.</td></tr>`}</tbody>
      </table>
    </section>
  `;
}

function companiesView() {
  return `
    <section class="panel">
      <div class="panel-head"><h2>My companies</h2><span class="status neutral">${memberships.length} memberships</span></div>
      <table>
        <thead><tr><th>Company</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>${memberships.map((membership) => `
          <tr>
            <td>${escapeHtml(membership.company?.name || membership.companyName || membership.id)}</td>
            <td>${escapeHtml(membership.role || "")}</td>
            <td><span class="status ${membership.status === "active" ? "success" : "neutral"}">${escapeHtml(membership.status || "active")}</span></td>
            <td class="right"><button class="btn" onclick="selectCompany('${membership.id}')">Open</button></td>
          </tr>
        `).join("") || `<tr><td colspan="4">No approved company memberships yet.</td></tr>`}</tbody>
      </table>
    </section>
  `;
}

function render() {
  if (!authUser) {
    document.getElementById("app").innerHTML = renderLogin();
    return;
  }

  if (authIntent === "signup") {
    document.getElementById("app").innerHTML = renderOnboarding();
    return;
  }

  if (!localWorkspace && !selectedCompanyId && !isAdmin()) {
    document.getElementById("app").innerHTML = renderOnboarding();
    return;
  }

  if (!localWorkspace && !selectedCompanyId && isAdmin() && activeView === "dashboard") {
    activeView = "admin";
  }

  const views = {
    dashboard,
    employees: employeesView,
    runs: runsView,
    payslips: payslipsView,
    nibForms: nibFormsView,
    reports: reportsView,
    settings: settingsView,
    admin: adminView,
    companies: companiesView,
  };

  if (!views[activeView] || (!isAdmin() && (activeView === "admin" || activeView === "companies"))) {
    activeView = "dashboard";
  }

  document.getElementById("app").innerHTML = shell(views[activeView]());
}

async function hydrateAfterWrite(message) {
  await refreshFirebaseState();
  await loadWorkspaceWithLoading("Refreshing company workspace...");
  toast(message);
  render();
}

window.signIn = async function signIn(intent = "login") {
  try {
    authIntent = intent;
    localStorage.setItem("authIntent", intent);
    if (window.location.hostname === "127.0.0.1") {
      window.location.href = window.location.href.replace("127.0.0.1", "localhost");
      return;
    }
    loadingMessage = "Opening Google sign-in...";
    renderLoading();
    await signInWithGoogle({ promptSelectAccount: true, redirect: true });
  } catch (error) {
    render();
    toast(friendlyAuthMessage(error));
  }
};

window.signOut = async function signOut() {
  await signOutUser();
  authUser = null;
  userProfile = null;
  memberships = [];
  localWorkspace = false;
  selectedCompanyId = "";
  selectedAdminCompany = null;
  authIntent = "login";
  localStorage.removeItem("localWorkspace");
  localStorage.removeItem("selectedCompanyId");
  localStorage.removeItem("authIntent");
  render();
};

window.submitCompanySignup = async function submitCompanySignup() {
  const companyName = document.getElementById("signup-company-name").value.trim();
  const nibEmployerRegistrationNumber = document.getElementById("signup-nib-registration").value.trim();
  const addressLine1 = document.getElementById("signup-address-line1").value.trim();
  const city = document.getElementById("signup-city").value.trim();
  if (!companyName) return toast("Company name is required.");
  if (!nibEmployerRegistrationNumber) return toast("NIB employer registration number is required for NIB forms.");
  if (!/^\d{6}$/.test(nibEmployerRegistrationNumber)) return toast("NIB employer registration number must be exactly 6 digits.");
  if (!addressLine1 || !city) return toast("Address line 1 and city are required for NIB forms.");
  try {
    await requestCompanySignup(authUser, {
      companyName,
      tradeName: document.getElementById("signup-trade-name").value.trim(),
      nibEmployerRegistrationNumber,
      phone: document.getElementById("signup-phone").value.trim(),
      address: {
        line1: addressLine1,
        line2: document.getElementById("signup-address-line2").value.trim(),
        city,
        country: document.getElementById("signup-country").value.trim(),
      },
      contactName: document.getElementById("signup-contact").value.trim(),
      declarant: {
        name: document.getElementById("signup-declarant-name").value.trim(),
        position: document.getElementById("signup-declarant-position").value.trim(),
      },
    });
    await hydrateAfterWrite("Company request submitted.");
  } catch (error) {
    const message = error.code === "permission-denied"
      ? "Firestore rules are blocking signup requests. Deploy the rules in the firebase folder, then retry."
      : error.message;
    toast(message);
  }
};

window.openLocalWorkspace = async function openLocalWorkspace() {
  localWorkspace = true;
  selectedCompanyId = "";
  selectedAdminCompany = null;
  authIntent = "login";
  adjustmentEditorRows = null;
  localStorage.setItem("localWorkspace", "true");
  localStorage.removeItem("selectedCompanyId");
  localStorage.setItem("authIntent", authIntent);
  await loadWorkspaceWithLoading("Opening local workspace...");
  render();
};

window.selectCompany = async function selectCompany(companyId) {
  if (companyId === "local") {
    await window.openLocalWorkspace();
    return;
  }
  localWorkspace = false;
  selectedCompanyId = companyId;
  selectedAdminCompany = null;
  authIntent = "login";
  adjustmentEditorRows = null;
  localStorage.setItem("selectedCompanyId", companyId);
  localStorage.removeItem("localWorkspace");
  localStorage.setItem("authIntent", authIntent);
  await loadWorkspaceWithLoading("Opening company workspace...");
  activeView = "dashboard";
  render();
};

window.setView = function setView(view) {
  activeView = view;
  render();
};

window.setPayrollMonth = function setPayrollMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) return;
  payrollMonth = month;
  adjustmentEditorRows = null;
  localStorage.setItem("payrollMonth", payrollMonth);
  render();
};

window.editEmployee = function editEmployee(employeeId) {
  editing = { ...state.employees.find((employee) => employee.employee_id === employeeId) };
  employeeEditorOpen = true;
  activeView = "employees";
  render();
};

window.startNewEmployee = function startNewEmployee() {
  editing = null;
  employeeEditorOpen = true;
  activeView = "employees";
  render();
};

window.clearEmployeeForm = function clearEmployeeForm() {
  editing = null;
  employeeEditorOpen = false;
  render();
};

function collectAdjustmentRows() {
  return Array.from(document.querySelectorAll("[data-adjustment-row]")).map((row) => {
    const index = row.dataset.adjustmentRow;
    const type = document.getElementById(`adjustment-type-${index}`)?.value || "other_deduction";
    const targetEmployeeId = document.getElementById(`adjustment-target-${index}`)?.value || "";
    const scope = targetEmployeeId === "all" ? "all" : "employee";
    const customLabel = document.getElementById(`adjustment-label-${index}`)?.value.trim() || "";
    const amount = Number(document.getElementById(`adjustment-amount-${index}`)?.value || 0);
    const treatment = document.getElementById(`adjustment-treatment-${index}`)?.value || adjustmentTypeTreatment(type);
    const note = document.getElementById(`adjustment-note-${index}`)?.value.trim() || "";
    return {
      type,
      label: customLabel || adjustmentTypeLabel(type),
      amount,
      treatment,
      scope,
      targetEmployeeId,
      note,
    };
  }).filter((adjustment) => adjustment.amount > 0);
}

function setEmployeeMonthAdjustments(employee, month, rows) {
  const payroll_adjustments = { ...(employee.payroll_adjustments || employee.payrollAdjustments || {}) };
  if (rows.length) {
    payroll_adjustments[month] = rows;
  } else {
    delete payroll_adjustments[month];
  }
  return { ...employee, payroll_adjustments };
}

function allScopedRows(rows) {
  const seen = new Set();
  const allRows = [];
  for (const row of rows.filter((adjustment) => adjustment.scope === "all")) {
    const key = adjustmentSignature(row);
    if (seen.has(key)) continue;
    seen.add(key);
    allRows.push(row);
  }
  return allRows;
}

function adjustmentForStorage(adjustment, scope) {
  return {
    type: adjustment.type,
    label: adjustmentDisplayLabel(adjustment),
    amount: Number(adjustment.amount || 0),
    treatment: adjustment.treatment,
    scope,
    note: adjustment.note || "",
  };
}

function applyAdjustmentRowsToEmployees(rows) {
  const companyRows = allScopedRows(rows).map((adjustment) => adjustmentForStorage(adjustment, "all"));
  const rowsByEmployeeId = new Map();
  for (const adjustment of rows.filter((row) => row.scope !== "all")) {
    if (!rowsByEmployeeId.has(adjustment.targetEmployeeId)) rowsByEmployeeId.set(adjustment.targetEmployeeId, []);
    rowsByEmployeeId.get(adjustment.targetEmployeeId).push(adjustmentForStorage(adjustment, "employee"));
  }
  return (state.employees || []).map((employee) => (
    setEmployeeMonthAdjustments(employee, payrollMonth, [
      ...companyRows,
      ...(rowsByEmployeeId.get(employee.employee_id) || []),
    ])
  ));
}

function employeeFormSnapshot(base = {}) {
  const employee = { ...defaultEmployee, ...base };
  fields.forEach(([key, , type]) => {
    const input = document.getElementById(`field-${key}`);
    if (!input) return;
    employee[key] = type === "number" ? Number(input.value || 0) : input.value;
  });
  const active = document.getElementById("field-active");
  if (active) employee.active = active.checked;
  employee.health_surcharge_exempt = base.health_surcharge_exempt || "";
  return employee;
}

function saveAdjustmentEditsToMemory() {
  adjustmentEditorRows = collectAdjustmentRows();
}

window.addAdjustment = function addAdjustment() {
  saveAdjustmentEditsToMemory();
  const rows = adjustmentRowsForEditor().slice();
  rows.push({
    type: "salary_advance_repayment",
    label: "Salary advance repayment",
    amount: 0,
    treatment: "deduction_after_statutory",
    scope: "employee",
    targetEmployeeId: "",
    note: "",
  });
  adjustmentEditorRows = rows;
  render();
};

window.removeAdjustment = function removeAdjustment(index) {
  saveAdjustmentEditsToMemory();
  adjustmentEditorRows = adjustmentRowsForEditor().filter((_, rowIndex) => rowIndex !== index);
  render();
};

window.syncAdjustmentTreatment = function syncAdjustmentTreatment(index) {
  const type = document.getElementById(`adjustment-type-${index}`)?.value || "";
  const treatment = document.getElementById(`adjustment-treatment-${index}`);
  const label = document.getElementById(`adjustment-label-${index}`);
  if (treatment) treatment.value = adjustmentTypeTreatment(type);
  if (label) {
    const knownLabels = adjustmentTypes.map(([, adjustmentLabelValue]) => adjustmentLabelValue);
    if (!label.value.trim() || knownLabels.includes(label.value.trim())) {
      label.value = adjustmentTypeLabel(type);
    }
    label.placeholder = /other/i.test(type) ? "Required custom label" : adjustmentTypeLabel(type);
  }
};

window.saveEmployee = async function saveEmployee() {
  const employee = employeeFormSnapshot({
    payroll_adjustments: editing?.payroll_adjustments || editing?.payrollAdjustments || {},
    health_surcharge_exempt: editing?.health_surcharge_exempt || "",
  });
  const latestEmployee = (state.employees || []).find((existing) => existing.employee_id === employee.employee_id);
  if (latestEmployee) {
    employee.payroll_adjustments = latestEmployee.payroll_adjustments || latestEmployee.payrollAdjustments || {};
  }
  const currentEmployee = employee;
  try {
    if (!localWorkspace && selectedCompanyId) {
      const existingEmployees = state.employees || [];
      const status = existingEmployees.some((existing) => existing.employee_id === currentEmployee.employee_id) ? "updated" : "created";
      await saveCompanyEmployee(selectedCompanyId, currentEmployee);
      await loadWorkspaceState();
      toast(`Employee ${status}.`);
    } else {
      const payload = await api("/api/employees", { method: "POST", body: JSON.stringify(currentEmployee) });
      state = payload.state;
      toast(`Employee ${payload.status}.`);
    }
    editing = null;
    employeeEditorOpen = false;
    render();
  } catch (error) {
    toast(error.message);
  }
};

window.savePayrollAdjustments = async function savePayrollAdjustments() {
  const rows = collectAdjustmentRows();
  const employeeIds = new Set((state.employees || []).map((employee) => employee.employee_id));
  const invalidTarget = rows.find((adjustment) => adjustment.scope !== "all" && !employeeIds.has(adjustment.targetEmployeeId));
  if (invalidTarget) return toast("Choose an employee for each employee-specific adjustment.");
  try {
    const employeesToSave = applyAdjustmentRowsToEmployees(rows);
    if (!localWorkspace && selectedCompanyId) {
      await Promise.all(employeesToSave.map((employeeToSave) => saveCompanyEmployee(selectedCompanyId, employeeToSave)));
      await loadWorkspaceState();
    } else {
      state = { ...state, employees: employeesToSave };
    }
    adjustmentEditorRows = null;
    toast("Payroll adjustments saved.");
    render();
  } catch (error) {
    toast(error.message);
  }
};

window.saveSettings = async function saveSettings() {
  const settings = {
    schedule_enabled: document.getElementById("schedule_enabled").checked,
    scheduled_day: Number(document.getElementById("scheduled_day").value),
    scheduled_time: document.getElementById("scheduled_time").value,
    reminder_days_before: Number(document.getElementById("reminder_days_before").value),
    last_note: "Confirm employee changes before running payroll.",
  };
  try {
    const payload = await api("/api/settings", { method: "POST", body: JSON.stringify(settings) });
    state = payload.state;
    toast("Schedule settings saved.");
    render();
  } catch (error) {
    toast(error.message);
  }
};

window.runPayroll = async function runPayroll() {
  const month = document.getElementById("runMonth").value;
  const generateNisForms = document.getElementById("generateNisForms").checked;
  if (!month) return toast("Choose a payroll month.");
  payrollMonth = month;
  localStorage.setItem("payrollMonth", payrollMonth);
  try {
    const existingRun = (state?.runs || []).find((run) => run.month === month);
    let overwriteApproved = false;
    if (!localWorkspace && selectedCompanyId && existingRun?.status === "approved") {
      overwriteApproved = window.confirm(`Payroll for ${month} has already been approved. Running payroll again will replace the approved payroll with a new draft and previously generated outputs for that month. Continue?`);
      if (!overwriteApproved) return toast(`Kept approved payroll for ${month}.`);
    }
    toast(`Running payroll for ${month}${generateNisForms ? " with NIS forms" : ""}...`);
    let payload;
    if (!localWorkspace && selectedCompanyId) {
      const token = await getAuthToken();
      const runHostedPayroll = (confirmedOverwrite = false) => api("/api/run-payroll", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          month,
          companyId: selectedCompanyId,
          generate_nis_forms: generateNisForms,
          overwrite_approved: confirmedOverwrite,
        }),
      });
      try {
        payload = await runHostedPayroll(overwriteApproved);
      } catch (error) {
        if (error.status !== 409 || error.payload?.code !== "approved_run_exists") throw error;
        const confirmed = window.confirm(`Payroll for ${month} is already approved. Running payroll again will replace the approved payroll with a new draft and previously generated outputs for that month. Continue?`);
        if (!confirmed) return toast(`Kept approved payroll for ${month}.`);
        payload = await runHostedPayroll(true);
      }
      await loadWorkspaceState();
      mergeRunIntoState(payload.run);
    } else {
      payload = await api("/api/run-payroll", {
        method: "POST",
        body: JSON.stringify({ month, generate_nis_forms: generateNisForms }),
      });
      state = payload.state;
    }
    activeView = "runs";
    toast(payload.status === "draft" ? `Draft payroll created for ${month}.` : `Payroll completed for ${month}.`);
    render();
  } catch (error) {
    toast(error.message);
  }
};

window.approvePayrollRun = async function approvePayrollRun(month) {
  if (!selectedCompanyId || localWorkspace) return toast("Open a hosted company workspace before approving payroll.");
  try {
    toast(`Finalizing payroll outputs for ${month}...`);
    const token = await getAuthToken();
    await api("/api/finalize-payroll", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ companyId: selectedCompanyId, month }),
      timeoutMs: 20000,
    });
    await loadWorkspaceWithLoading("Refreshing payroll review...");
    activeView = "runs";
    toast(`Payroll approved and outputs generated for ${month}.`);
    render();
  } catch (error) {
    toast(error.message);
  }
};

window.cancelPayrollRun = async function cancelPayrollRun(month) {
  if (!selectedCompanyId || localWorkspace) return toast("Open a hosted company workspace before cancelling payroll.");
  if (!window.confirm(`Cancel the draft payroll for ${month}? You can run payroll again after making changes.`)) return;
  try {
    await updateCompanyPayrollRunStatus(selectedCompanyId, month, "cancelled");
    await loadWorkspaceWithLoading("Refreshing payroll review...");
    activeView = "runs";
    toast(`Payroll draft cancelled for ${month}.`);
    render();
  } catch (error) {
    toast(error.message);
  }
};

window.openPayrollArtifact = function openPayrollArtifact(month, key, type) {
  const run = payrollRun(month);
  const content = run?.outputs?.[key];
  if (!content) return toast("That payroll output has not been generated yet.");
  if (type === "markdown") {
    openTextBlob(`<pre>${escapeHtml(content)}</pre>`, "text/html");
    return;
  }
  openTextBlob(content, "text/html");
};

window.downloadPayrollArtifact = function downloadPayrollArtifact(month, key, fileName, mimeType) {
  const run = payrollRun(month);
  const content = run?.outputs?.[key];
  if (!content) return toast("That payroll output has not been generated yet.");
  downloadTextBlob(content, fileName, mimeType);
};

window.openPayslip = function openPayslip(month, fileName) {
  const run = payrollRun(month);
  const payslip = run?.payslips.find((item) => item.fileName === fileName);
  if (!payslip?.html) return toast("That payslip has not been generated yet.");
  openTextBlob(payslip.html, "text/html");
};

window.explainPayrollUnavailable = function explainPayrollUnavailable() {
  toast("Hosted payroll running is not connected yet. Use the local payroll engine for now.");
};

window.approveSignup = async function approveSignup(requestId) {
  const request = adminSignupRequests.find((item) => item.id === requestId);
  if (!request) return toast("Signup request not found.");
  await approveSignupRequest(request);
  await hydrateAfterWrite("Company approved.");
};

window.rejectSignup = async function rejectSignup(requestId) {
  await rejectSignupRequest(requestId);
  await hydrateAfterWrite("Company request rejected.");
};

window.importLocalCompanyData = async function importLocalCompanyData(requestId) {
  const request = adminSignupRequests.find((item) => item.id === requestId);
  if (!request?.companyId) return toast("Approved company workspace not found.");
  try {
    await saveCompanyProfile(request.companyId, {
      ...localCompanyImport.company,
      status: "active",
      source: "local-project-migration",
    });
    await Promise.all(localCompanyImport.employees.map((employee) => saveCompanyEmployee(request.companyId, {
      ...employee,
      source: "local-project-migration",
    })));
    await hydrateAfterWrite("Local company data imported.");
  } catch (error) {
    toast(error.message);
  }
};

window.openAdminCompany = async function openAdminCompany(requestId) {
  const request = adminSignupRequests.find((item) => item.id === requestId);
  if (!request?.companyId) return toast("Approved company workspace not found.");
  localWorkspace = false;
  selectedCompanyId = request.companyId;
  selectedAdminCompany = {
    id: request.companyId,
    ...localCompanyImport.company,
  };
  authIntent = "login";
  localStorage.setItem("selectedCompanyId", selectedCompanyId);
  localStorage.removeItem("localWorkspace");
  localStorage.setItem("authIntent", authIntent);
  await loadWorkspaceWithLoading("Opening company workspace...");
  activeView = "dashboard";
  render();
};

bootstrap();
