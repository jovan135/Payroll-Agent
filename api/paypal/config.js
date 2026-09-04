const { STANDARD_PLAN } = require("../lib/billing-access");
const { paypalEnvironment } = require("../lib/paypal");

function sendJson(response, status, payload) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  sendJson(response, 200, {
    environment: paypalEnvironment(),
    clientId: process.env.PAYPAL_CLIENT_ID || "sb",
    planId: process.env.PAYPAL_STANDARD_PLAN_ID || "",
    plan: STANDARD_PLAN,
  });
};
