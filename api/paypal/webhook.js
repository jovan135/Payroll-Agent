const { saveCompanyBilling } = require("../lib/firestore-service");
const { STANDARD_PLAN, normalizeBilling } = require("../lib/billing-access");
const { verifyWebhookSignature } = require("../lib/paypal");

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function normalizedHeaders(headers) {
  return Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
}

function subscriptionIdForEvent(event) {
  const resource = event.resource || {};
  return resource.id
    || resource.billing_agreement_id
    || resource.subscription_id
    || "";
}

function companyIdForEvent(event) {
  return event.resource?.custom_id || event.resource?.customId || "";
}

function billingPatchForEvent(event) {
  const resource = event.resource || {};
  const eventType = String(event.event_type || "");
  const subscriptionId = subscriptionIdForEvent(event);
  const base = {
    provider: "paypal",
    providerMode: process.env.PAYPAL_ENVIRONMENT === "live" ? "live" : "sandbox",
    planId: resource.plan_id || STANDARD_PLAN.planId,
    monthlyFee: STANDARD_PLAN.monthlyFee,
    currency: STANDARD_PLAN.currency,
    employeeLimit: STANDARD_PLAN.employeeLimit,
    subscriptionId,
    customerId: resource.subscriber?.payer_id || resource.payer?.payer_info?.payer_id || "",
    currentPeriodEnd: resource.billing_info?.next_billing_time || "",
  };

  if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
    return { ...base, status: "active", lastPaymentAt: new Date().toISOString(), comped: false };
  }
  if (eventType === "BILLING.SUBSCRIPTION.CANCELLED" || eventType === "BILLING.SUBSCRIPTION.EXPIRED") {
    return { ...base, status: "canceled", comped: false };
  }
  if (eventType === "BILLING.SUBSCRIPTION.SUSPENDED") {
    return { ...base, status: "suspended", comped: false };
  }
  if (eventType.includes("PAYMENT.FAILED") || eventType === "PAYMENT.SALE.DENIED") {
    return { ...base, status: "past_due", comped: false };
  }
  if (eventType === "PAYMENT.SALE.COMPLETED" || eventType === "PAYMENT.CAPTURE.COMPLETED") {
    return { ...base, status: "active", lastPaymentAt: new Date().toISOString(), comped: false };
  }
  return null;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const event = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    await verifyWebhookSignature(normalizedHeaders(request.headers), event);

    const companyId = companyIdForEvent(event);
    const patch = billingPatchForEvent(event);
    if (!companyId || !patch) {
      sendJson(response, 202, { status: "ignored", eventType: event.event_type || "" });
      return;
    }

    const billing = normalizeBilling({
      ...patch,
      updatedAtClient: new Date().toISOString(),
    });

    await saveCompanyBilling(companyId, billing);

    sendJson(response, 200, { status: "processed", eventType: event.event_type || "", companyId });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || "PayPal webhook failed." });
  }
};
