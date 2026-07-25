const navItems = [
  ["dashboard", "Dashboard"],
  ["employees", "Employees"],
  ["runs", "Payroll Runs"],
  ["payslips", "Payslips"],
  ["reports", "Reports"],
  ["settings", "Settings"],
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

let state = null;
let activeView = "dashboard";
let editing = null;

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

async function load() {
  state = await api("/api/state");
  render();
}

function shell(content) {
  const nav = navItems.map(([id, label]) => `
    <button class="${activeView === id ? "active" : ""}" onclick="setView('${id}')">
      <span>${icon(id)}</span>${label}
    </button>
  `).join("");

  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">PA</div>
          <div><strong>Payroll Agent</strong><span>The J Spa and Skin Clinic LTD</span></div>
        </div>
        <nav class="nav">${nav}</nav>
        <div class="side-note">
          Next scheduled run<br>
          <strong>${state.settings.schedule_enabled ? `${state.settings.scheduled_day} at ${state.settings.scheduled_time}` : "Not enabled"}</strong>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div>
            <h1>${titleFor(activeView)}</h1>
            <p>${subtitleFor(activeView)}</p>
          </div>
          <div class="actions">
            <input id="runMonth" type="month" value="${state.latest_run?.month || latestMonth()}">
            <label class="inline-check"><input id="generateNisForms" type="checkbox" checked> NIS forms</label>
            <button class="btn primary" onclick="runPayroll()">Run payroll</button>
          </div>
        </div>
        ${content}
      </main>
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
  }[id];
}

function titleFor(id) {
  return {
    dashboard: "July 2026 Payroll",
    employees: "Employees",
    runs: "Payroll Runs",
    payslips: "Payslips",
    reports: "Reports",
    settings: "Settings",
  }[id];
}

function subtitleFor(id) {
  return {
    dashboard: "Track changes, reminders, scheduled runs, and payroll readiness.",
    employees: "Add and maintain employee records used by NIS, PAYE, and payslips.",
    runs: "Review previously generated payroll files and statutory outputs.",
    payslips: "Open generated employee payslips by month.",
    reports: "Compare gross pay, deductions, net pay, and employer costs.",
    settings: "Control reminder timing and scheduled payroll preferences.",
  }[id];
}

function dashboard() {
  const activeEmployees = state.employees.filter((employee) => employee.active).length;
  const latest = state.latest_run || {};
  const alerts = state.alerts.map((alert) => `
    <div>
      <strong>${alert.title}</strong>
      <span class="status warning">Pending changes</span>
    </div>
    <p>${alert.body}</p>
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
        <p>${state.settings.last_note}</p>
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
          <td>${employee.employee_id}</td>
          <td>${fullName(employee)}</td>
          <td>${employee.nis_number || ""}</td>
          <td class="money">${money(employee.monthly_salary)}</td>
          <td><span class="status ${employee.active ? "success" : "neutral"}">${employee.active ? "Active" : "Inactive"}</span></td>
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

function employeesView() {
  const employee = editing || defaultEmployee;
  const form = fields.map(([key, label, type]) => `
    <label>${label}
      <input id="field-${key}" type="${type}" value="${employee[key] ?? ""}" ${type === "number" ? 'step="0.01"' : ""}>
    </label>
  `).join("");

  return `
    <section class="panel">
      <div class="panel-head">
        <h2>${editing ? `Edit ${editing.employee_id}` : "Add employee"}</h2>
        <div class="actions">
          <button class="btn" onclick="clearEmployeeForm()">New</button>
          <button class="btn primary" onclick="saveEmployee()">Submit changes</button>
        </div>
      </div>
      <div class="form-grid">${form}</div>
      <label style="margin-top:12px"><span><input id="field-active" type="checkbox" ${employee.active ? "checked" : ""} style="width:auto;min-height:auto"> Active employee</span></label>
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Employee list</h2><span class="status neutral">${state.employees.length} records</span></div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>NIS</th><th>BIR</th><th class="money">Salary</th><th></th></tr></thead>
        <tbody>${state.employees.map((employee) => `
          <tr>
            <td>${employee.employee_id}</td>
            <td>${fullName(employee)}</td>
            <td>${employee.nis_number || ""}</td>
            <td>${employee.bir_number || ""}</td>
            <td class="money">${money(employee.monthly_salary)}</td>
            <td class="right"><button class="btn" onclick="editEmployee('${employee.employee_id}')">Edit</button></td>
          </tr>
        `).join("")}</tbody>
      </table>
    </section>
  `;
}

function runsView() {
  return `<section class="panel"><div class="panel-head"><h2>Payroll Runs</h2><span class="status neutral">${state.runs.length} months</span></div>${runTable(state.runs)}</section>`;
}

function runList(runs) {
  if (!runs.length) return `<p>No payroll runs found.</p>`;
  return `<div class="activity">${runs.map((run) => `
    <div>
      <span><strong>${run.month}</strong><br><span class="caption">${run.employees} employee(s), ${run.has_payroll ? "payroll complete" : "NIS only"}</span></span>
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
          <td>${run.month}</td>
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
            <div><strong>${group.name}</strong><br><span class="caption">${group.employeeId}</span></div>
            <span class="status neutral">${group.files.length} payslip${group.files.length === 1 ? "" : "s"}</span>
          </div>
          <div class="activity">
            ${group.files.map((item) => `<a href="/runs/${item.month}/payslips/${item.file}" target="_blank"><span>${item.month}</span><strong>Open payslip</strong></a>`).join("")}
          </div>
        </div>
      `).join("") || "<p>No payslips generated yet.</p>"}
    </section>
  `;
}

function reportsView() {
  return `
    <section class="panel">
      <div class="panel-head"><h2>Reports</h2><span class="status neutral">Historical totals</span></div>
      <table>
        <thead><tr><th>Month</th><th class="money">Gross</th><th class="money">Deductions</th><th class="money">Net Pay</th><th>Payslips</th><th>NIS Forms</th></tr></thead>
        <tbody>${state.runs.map((run) => `
          <tr><td>${run.month}</td><td class="money">${money(run.gross)}</td><td class="money">${money(run.deductions)}</td><td class="money">${money(run.net)}</td><td>${run.payslips.length}</td><td>${formBadges(run)}</td></tr>
        `).join("")}</tbody>
      </table>
    </section>
  `;
}

function settingsView() {
  return `
    <section class="panel">
      <div class="panel-head"><h2>Schedule and reminders</h2><button class="btn primary" onclick="saveSettings()">Save settings</button></div>
      <div class="form-grid">
        <label>Scheduled day<input id="scheduled_day" type="number" min="1" max="31" value="${state.settings.scheduled_day}"></label>
        <label>Scheduled time<input id="scheduled_time" type="time" value="${state.settings.scheduled_time}"></label>
        <label>Reminder days before<input id="reminder_days_before" type="number" min="0" max="14" value="${state.settings.reminder_days_before}"></label>
      </div>
      <label style="margin-top:12px"><span><input id="schedule_enabled" type="checkbox" ${state.settings.schedule_enabled ? "checked" : ""} style="width:auto;min-height:auto"> Enable scheduled payroll reminder</span></label>
      <p>This app stores the schedule preference locally. A background Windows task or Codex automation can be wired next to run payroll even when the browser is closed.</p>
    </section>
  `;
}

function render() {
  if (!state) return;
  const views = { dashboard, employees: employeesView, runs: runsView, payslips: payslipsView, reports: reportsView, settings: settingsView };
  document.getElementById("app").innerHTML = shell(views[activeView]());
}

function setView(view) {
  activeView = view;
  render();
}

function editEmployee(employeeId) {
  editing = { ...state.employees.find((employee) => employee.employee_id === employeeId) };
  activeView = "employees";
  render();
}

function clearEmployeeForm() {
  editing = null;
  render();
}

async function saveEmployee() {
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
    editing = null;
    toast(`Employee ${payload.status}.`);
    render();
  } catch (error) {
    toast(error.message);
  }
}

async function saveSettings() {
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
}

async function runPayroll() {
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
}

load().catch((error) => {
  document.getElementById("app").innerHTML = `<div class="main"><section class="panel"><h1>Payroll Agent</h1><p>${error.message}</p></section></div>`;
});
