const { normalizeBilling } = require("../lib/billing-access");
const { saveCompanyBilling } = require("../lib/firestore-service");
const { cancelSubscription } = require("../lib/paypal");

const PROJECT_ID = "payroll-application-f6d25";
const DATABASE = "(default)";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function fromFirestoreValue(value) {
  if (!value) return null;
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

async function loadCompanyForUser(companyId, token) {
  const response = await fetch(`${FIRESTORE_BASE}/companies/${encodeURIComponent(companyId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("You do not have access to cancel this company's subscription.");
    error.status = response.status === 404 ? 404 : 403;
    throw error;
  }
  return fromFirestoreFields(payload.fields || {});
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
      sendJson(response, 401, { error: "Sign in before canceling a PayPal subscription." });
      return;
    }

    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const companyId = String(body.companyId || "").trim();
    const reason = String(body.reason || "Customer requested cancellation.").trim();
    if (!companyId) {
      sendJson(response, 400, { error: "companyId is required." });
      return;
    }

    const company = await loadCompanyForUser(companyId, token);
    const currentBilling = normalizeBilling(company.billing || {});
    const subscriptionId = currentBilling.subscriptionId || "";
    if (!subscriptionId) {
      sendJson(response, 400, { error: "This company does not have a connected PayPal subscription." });
      return;
    }
    if (currentBilling.status === "canceled") {
      sendJson(response, 200, { status: "already_canceled", billing: currentBilling });
      return;
    }

    await cancelSubscription({ subscriptionId, reason });
    const billing = normalizeBilling({
      ...currentBilling,
      status: "canceled",
      comped: false,
      overrideNote: reason,
      currentPeriodEnd: "",
      updatedAtClient: new Date().toISOString(),
    });
    await saveCompanyBilling(companyId, billing);

    sendJson(response, 200, {
      status: "canceled",
      subscriptionId,
      billing,
    });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || "PayPal subscription cancellation failed." });
  }
};
