const crypto = require("crypto");

function serviceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
  }
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID || "payroll-application-f6d25",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

let cachedToken = null;

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function googleAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;
  const serviceAccount = serviceAccountFromEnv();
  if (!serviceAccount) {
    const error = new Error("Firebase Admin credentials are not configured in Vercel.");
    error.status = 503;
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  const assertion = [
    base64UrlJson({ alg: "RS256", typ: "JWT" }),
    base64UrlJson({
      iss: serviceAccount.clientEmail || serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ].join(".");
  const signature = crypto.createSign("RSA-SHA256").update(assertion).sign(serviceAccount.privateKey || serviceAccount.private_key, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${assertion}.${signature}`,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || "Google service account token request failed.");
    error.status = response.status;
    throw error;
  }
  cachedToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") return { mapValue: { fields: toFirestoreFields(value) } };
  return { stringValue: String(value) };
}

function toFirestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]));
}

async function firestoreFetch(path, options = {}) {
  const token = await googleAccessToken();
  const projectId = process.env.FIREBASE_PROJECT_ID || "payroll-application-f6d25";
  const database = "(default)";
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${database}/documents`;
  const response = await fetch(`${base}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Firestore service request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function saveCompanyBilling(companyId, billing) {
  const fields = toFirestoreFields({
    ...billing,
    updatedAt: new Date(),
  });
  await firestoreFetch(`companies/${encodeURIComponent(companyId)}/billing/current`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  await firestoreFetch(`companies/${encodeURIComponent(companyId)}?updateMask.fieldPaths=billing&updateMask.fieldPaths=updatedAt`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: toFirestoreFields({
        billing,
        updatedAt: new Date(),
      }),
    }),
  });
}

module.exports = {
  saveCompanyBilling,
};
