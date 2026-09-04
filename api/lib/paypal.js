function paypalBaseUrl() {
  return process.env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function paypalEnvironment() {
  return process.env.PAYPAL_ENVIRONMENT === "live" ? "live" : "sandbox";
}

function paypalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    const error = new Error("PayPal sandbox credentials are not configured in Vercel.");
    error.status = 503;
    throw error;
  }
  return { clientId, clientSecret };
}

async function paypalAccessToken() {
  const { clientId, clientSecret } = paypalCredentials();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || "PayPal access token request failed.");
    error.status = response.status;
    throw error;
  }
  return payload.access_token;
}

async function createSubscription({ companyId, planId, returnUrl, cancelUrl }) {
  const accessToken = await paypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: companyId,
      application_context: {
        brand_name: "Payroll Agent",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload.details?.map((item) => item.description || item.issue).filter(Boolean).join(" ");
    const error = new Error(details || payload.message || "PayPal subscription creation failed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function verifyWebhookSignature(headers, webhookEvent) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID || "";
  if (!webhookId) {
    const error = new Error("PAYPAL_WEBHOOK_ID is not configured.");
    error.status = 503;
    throw error;
  }
  const accessToken = await paypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.verification_status !== "SUCCESS") {
    const error = new Error(payload.message || "PayPal webhook signature verification failed.");
    error.status = response.status || 400;
    throw error;
  }
  return payload;
}

module.exports = {
  createSubscription,
  paypalEnvironment,
  verifyWebhookSignature,
};
