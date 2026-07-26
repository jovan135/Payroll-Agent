import {
  approveSignupRequest,
  ensureUserProfile,
  listenForAuth,
  loadAdminSignupRequests,
  loadCompanyEmployees,
  loadMemberships,
  loadMySignupRequests,
  rejectSignupRequest,
  requestCompanySignup,
  saveCompanyEmployee,
  saveCompanyProfile,
  signInWithGoogle,
  signOutUser,
} from "./firebase-client.js";

const companyNavItems = [
  ["dashboard", "Dashboard"],
  ["employees", "Employees"],
  ["runs", "Payroll Runs"],
  ["payslips", "Payslips"],
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
let loadingMessage = "Connecting to Payroll Agent...";
let backendUnavailable = false;

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

function selectedCompanyProfile() {
  return selectedMembership()?.company || (selectedAdminCompany?.id === selectedCompanyId ? selectedAdminCompany : null);
}

function currentCompanyName() {
  if (localWorkspace) return "The J Spa and Skin Clinic LTD";
  return selectedMembership()?.company?.name || selectedMembership()?.companyName || selectedCompanyProfile()?.name || "No company selected";
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3500);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
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
    const employees = await loadCompanyEmployees(selectedCompanyId);
    state = {
      ...state,
      employees: employees.sort((a, b) => String(a.employee_id || "").localeCompare(String(b.employee_id || ""))),
    };
  } catch {
    // Company Firestore data may be unavailable until rules/memberships are fully set up.
  }
}

async function refreshFirebaseState() {
  if (!authUser) return;
  userProfile = await ensureUserProfile(authUser);
  memberships = await loadMemberships(authUser.uid);
  mySignupRequests = await loadMySignupRequests(authUser.uid);
  if (isAdmin()) {
    adminSignupRequests = await loadAdminSignupRequests();
  } else {
    adminSignupRequests = [];
  }
  if (authIntent === "signup") {
    selectedCompanyId = "";
    localWorkspace = false;
    localStorage.removeItem("selectedCompanyId");
    localStorage.removeItem("localWorkspace");
  } else if (!selectedCompanyId && memberships.length) {
    selectedCompanyId = memberships[0].id;
    localStorage.setItem("selectedCompanyId", selectedCompanyId);
  }
}

async function bootstrap() {
  renderLoading();
  listenForAuth(async (user) => {
    authUser = user;
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
      render();
    } catch (error) {
      renderError(error);
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
    <main class="auth-page">
      <section class="auth-card wide">
        <div class="brand-mark">PA</div>
        <h1>Payroll Agent</h1>
        <p>Access an existing payroll workspace, or create a new company profile for approval.</p>
        <div class="actions auth-actions">
          <button class="btn primary" onclick="signIn('login')">Log in with Google</button>
          <button class="btn" onclick="signIn('signup')">Sign up company</button>
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
  const disabled = backendUnavailable ? "disabled" : "";
  return `
    <div class="actions">
      <input id="runMonth" type="month" value="${state.latest_run?.month || latestMonth()}" ${disabled}>
      <label class="inline-check"><input id="generateNisForms" type="checkbox" checked ${disabled}> NIS forms</label>
      <button class="btn primary" onclick="runPayroll()" ${disabled}>Run payroll</button>
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
    runs: "Review generated payroll files, payslips, NI184, and NI187 outputs.",
    payslips: "Open generated payslips grouped by employee.",
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
    <div class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <div class="panel-head"><h2>Pending changes</h2><span class="status ${state.alerts.length ? "warning" : "success"}">${state.alerts.length ? "Review" : "Clear"}</span></div>
        ${alerts}
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Next scheduled run</h2><span class="status neutral">${state.settings.schedule_enabled ? "Enabled" : "Paused"}</span></div>
        <p>${escapeHtml(state.settings.last_note)}</p>
        <div class="activity">
          <div><span>Run day</span><strong>${state.settings.scheduled_day}</strong></div>
          <div><span>Run time</span><strong>${state.settings.scheduled_time}</strong></div>
          <div><span>Reminder window</span><strong>${state.settings.reminder_days_before} days</strong></div>
        </div>
      </section>
    </div>
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
  const form = fields.map(([key, label, type]) => `
    <label>${label}
      <input id="field-${key}" type="${type}" value="${escapeHtml(employee[key] ?? "")}" ${type === "number" ? 'step="0.01"' : ""}>
    </label>
  `).join("");

  return `
    <section class="panel">
      <div class="panel-head">
        <h2>${editing ? `Edit ${escapeHtml(editing.employee_id)}` : "Add employee"}</h2>
        <div class="actions">
          <button class="btn" onclick="clearEmployeeForm()">New</button>
          <button class="btn primary" onclick="saveEmployee()" ${backendUnavailable ? "disabled" : ""}>Submit changes</button>
        </div>
      </div>
      <div class="form-grid">${form}</div>
      <label style="margin-top:12px"><span><input id="field-active" type="checkbox" ${employee.active ? "checked" : ""} style="width:auto;min-height:auto"> Active employee</span></label>
      <p class="caption">Employee changes are saved to the local payroll engine. When a Firebase company is selected, the record is also mirrored to that company's Firestore employee collection.</p>
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Employee list</h2><span class="status neutral">${state.employees.length} records</span></div>
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
    </section>
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
      <span><strong>${escapeHtml(run.month)}</strong><br><span class="caption">${run.employees} employee(s), ${run.has_payroll ? "payroll complete" : "NIS only"}</span></span>
      <span class="right"><strong>${money(run.net)}</strong><br>${formBadges(run)}</span>
    </div>
  `).join("")}</div>`;
}

function formBadges(run) {
  const ni184 = run.has_ni184 ? `<a class="mini-link" href="/runs/${run.month}/NI184-filled.pdf" target="_blank">NI184</a>` : `<span class="status warning">NI184</span>`;
  const ni187 = run.has_ni187 ? `<a class="mini-link" href="/runs/${run.month}/NI187-filled.pdf" target="_blank">NI187</a>` : `<span class="status warning">NI187</span>`;
  return `<span class="form-links">${ni184}${ni187}</span>`;
}

function runTable(runs) {
  if (!runs.length) return `<p>No payroll runs found.</p>`;
  return `
    <table>
      <thead><tr><th>Month</th><th>Employees</th><th>Payroll</th><th>NIS Forms</th><th class="money">Net Pay</th></tr></thead>
      <tbody>${runs.map((run) => `
        <tr>
          <td>${escapeHtml(run.month)}</td>
          <td>${run.employees}</td>
          <td><span class="status ${run.has_payroll ? "success" : "neutral"}">${run.has_payroll ? "Complete" : "NIS only"}</span></td>
          <td>${formBadges(run)}</td>
          <td class="money">${money(run.net)}</td>
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

function payslipsView() {
  state ||= emptyLocalState();
  const employeeMap = new Map(state.employees.map((employee) => [employee.employee_id, employee]));
  const grouped = new Map();
  state.runs.forEach((run) => {
    run.payslips.forEach((file) => {
      const employeeId = file.split("-")[0];
      const employee = employeeMap.get(employeeId);
      const key = employeeId || "unknown";
      if (!grouped.has(key)) {
        grouped.set(key, {
          employeeId: key,
          name: employee ? fullName(employee) : key,
          files: [],
        });
      }
      grouped.get(key).files.push({ month: run.month, file });
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
            ${group.files.map((item) => `<a href="/runs/${item.month}/payslips/${item.file}" target="_blank"><span>${escapeHtml(item.month)}</span><strong>Open payslip</strong></a>`).join("")}
          </div>
        </div>
      `).join("") || "<p>No payslips generated yet.</p>"}
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
  await loadWorkspaceState();
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
    await signInWithGoogle({ promptSelectAccount: intent === "signup" });
  } catch (error) {
    const message = error.code === "auth/unauthorized-domain"
      ? "Firebase has not authorized this domain. Add localhost and 127.0.0.1 in Firebase Authentication > Settings > Authorized domains."
      : error.message;
    toast(message);
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
  localStorage.setItem("localWorkspace", "true");
  localStorage.removeItem("selectedCompanyId");
  localStorage.setItem("authIntent", authIntent);
  await loadWorkspaceState();
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
  localStorage.setItem("selectedCompanyId", companyId);
  localStorage.removeItem("localWorkspace");
  localStorage.setItem("authIntent", authIntent);
  await loadWorkspaceState();
  activeView = "dashboard";
  render();
};

window.setView = function setView(view) {
  activeView = view;
  render();
};

window.editEmployee = function editEmployee(employeeId) {
  editing = { ...state.employees.find((employee) => employee.employee_id === employeeId) };
  activeView = "employees";
  render();
};

window.clearEmployeeForm = function clearEmployeeForm() {
  editing = null;
  render();
};

window.saveEmployee = async function saveEmployee() {
  const employee = { ...defaultEmployee };
  fields.forEach(([key, , type]) => {
    const value = document.getElementById(`field-${key}`).value;
    employee[key] = type === "number" ? Number(value || 0) : value;
  });
  employee.active = document.getElementById("field-active").checked;
  employee.health_surcharge_exempt = editing?.health_surcharge_exempt || "";
  try {
    const payload = await api("/api/employees", { method: "POST", body: JSON.stringify(employee) });
    state = payload.state;
    if (!localWorkspace && selectedCompanyId) {
      await saveCompanyEmployee(selectedCompanyId, employee);
    }
    editing = null;
    toast(`Employee ${payload.status}.`);
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
  try {
    toast(`Running payroll for ${month}${generateNisForms ? " with NIS forms" : ""}...`);
    const payload = await api("/api/run-payroll", {
      method: "POST",
      body: JSON.stringify({ month, generate_nis_forms: generateNisForms }),
    });
    state = payload.state;
    activeView = "runs";
    toast(`Payroll completed for ${month}.`);
    render();
  } catch (error) {
    toast(error.message);
  }
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
  await loadWorkspaceState();
  activeView = "dashboard";
  render();
};

bootstrap();
