const {
  firestoreFetch,
  firestoreFetchAsUser,
  fromFirestoreFields,
} = require("./lib/firestore-service");

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
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
      sendJson(response, 401, { error: "Sign in before loading employee records." });
      return;
    }

    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const companyId = String(body.companyId || "").trim();
    if (!companyId) {
      sendJson(response, 400, { error: "companyId is required." });
      return;
    }

    const companyDocument = await firestoreFetchAsUser(`companies/${encodeURIComponent(companyId)}`, token);
    const company = fromFirestoreFields(companyDocument.fields || {});
    const payload = await firestoreFetch(`companies/${encodeURIComponent(companyId)}/employees?pageSize=100`);
    const employees = (payload.documents || []).map((document) => ({
      id: document.name.split("/").pop(),
      ...fromFirestoreFields(document.fields || {}),
    }));
    let billing = company.billing || null;
    try {
      const billingDocument = await firestoreFetch(`companies/${encodeURIComponent(companyId)}/billing/current`);
      billing = fromFirestoreFields(billingDocument.fields || {});
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    console.log("[company-employees] records loaded", { employeeCount: employees.length });
    sendJson(response, 200, { employees, billing });
  } catch (error) {
    console.error("[company-employees] failed", { error: error.message, status: error.status || 500 });
    sendJson(response, error.status || 500, { error: error.message || "Employee records could not be loaded." });
  }
};
