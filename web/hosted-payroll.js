import { auth } from "./firebase-client.js";

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 4500);
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function selectedCompanyId() {
  const companyId = localStorage.getItem("selectedCompanyId") || "";
  const localWorkspace = localStorage.getItem("localWorkspace") === "true";
  return localWorkspace ? "" : companyId;
}

async function runHostedPayroll() {
  const companyId = selectedCompanyId();
  if (!companyId) {
    toast("Open a company workspace before running hosted payroll.");
    return;
  }
  if (!auth.currentUser) {
    toast("Sign in before running hosted payroll.");
    return;
  }

  const month = document.getElementById("runMonth")?.value || currentMonth();
  const generateNisForms = document.getElementById("generateNisForms")?.checked ?? true;
  const token = await auth.currentUser.getIdToken();
  toast(`Creating draft payroll for ${month}...`);

  const response = await fetch("/api/run-payroll", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      companyId,
      month,
      generate_nis_forms: generateNisForms,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Hosted payroll run failed.");

  localStorage.setItem("lastHostedPayrollRun", JSON.stringify({
    month,
    net: payload.run?.netPay || payload.run?.net || 0,
    employees: payload.run?.employeeCount || payload.run?.employees || 0,
    generatedAt: new Date().toISOString(),
  }));
  toast(`Draft payroll created for ${month}. Open Payroll Runs to review totals.`);
}

function patchHostedControls() {
  const companyId = selectedCompanyId();
  if (!companyId) return;
  if (!document.querySelector(".main")) return;

  const button = document.querySelector(".disabled-action")
    || Array.from(document.querySelectorAll("button")).find((item) => item.textContent.trim() === "Run payroll");
  if (button) {
    if (button.textContent.trim() !== "Run payroll") {
      button.textContent = "Run payroll";
    }
    button.classList.remove("disabled-action");
    button.removeAttribute("disabled");
    if (!button.dataset.hostedPayrollPatched) {
      button.dataset.hostedPayrollPatched = "true";
      button.onclick = async () => {
        try {
          await runHostedPayroll();
        } catch (error) {
          toast(error.message);
        }
      };
    }
  }

  document.getElementById("runMonth")?.removeAttribute("disabled");
  document.getElementById("generateNisForms")?.removeAttribute("disabled");
  const check = document.getElementById("generateNisForms")?.closest(".inline-check");
  check?.classList.remove("muted-control");

  const latest = JSON.parse(localStorage.getItem("lastHostedPayrollRun") || "null");
  if (latest && !document.querySelector("[data-hosted-run-note]")) {
    const panel = document.querySelector(".main");
    const note = document.createElement("div");
    note.className = "notice";
    note.dataset.hostedRunNote = "true";
    note.textContent = `Latest hosted draft payroll: ${latest.month}, ${latest.employees} employee(s), net pay TTD ${Number(latest.net).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
    panel?.insertBefore(note, panel.children[1] || null);
  }
}

window.runHostedPayroll = runHostedPayroll;

new MutationObserver(patchHostedControls).observe(document.body, { childList: true, subtree: true });
patchHostedControls();
