const { STANDARD_PLAN } = require("../lib/billing-access");
const { createSubscription } = require("../lib/paypal");
const PROJECT_ID = "payroll-application-f6d25";
const DATABASE = "(default)";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

async function assertCompanyAccess(companyId, token) {
  const response = await fetch(`${FIRESTORE_BASE}/companies/${encodeURIComponent(companyId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error("You do not have access to create a subscription for this company.");
    error.status = response.status === 404 ? 404 : 403;
    throw error;
  }
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
      sendJson(response, 401, { error: "Sign in before starting a PayPal subscription." });
      return;
    }

    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const companyId = String(body.companyId || "").trim();
    const planId = String(body.planId || process.env.PAYPAL_STANDARD_PLAN_ID || "").trim();
    if (!companyId) {
      sendJson(response, 400, { error: "companyId is required." });
      return;
    }
    if (!planId) {
      sendJson(response, 400, { error: "PayPal Sandbox plan ID is required." });
      return;
    }

    await assertCompanyAccess(companyId, token);
    const origin = request.headers.origin || `https://${request.headers.host}`;
    const subscription = await createSubscription({
      companyId,
      planId,
      returnUrl: `${origin}/?paypal=approved&plan=${STANDARD_PLAN.planId}`,
      cancelUrl: `${origin}/?paypal=cancelled&plan=${STANDARD_PLAN.planId}`,
    });

    sendJson(response, 200, {
      subscriptionId: subscription.id,
      status: subscription.status,
      links: subscription.links || [],
    });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || "PayPal subscription setup failed." });
  }
};
