# PayPal Sandbox Billing Setup

Payroll Agent billing is configured for one company plan:

- Plan name: Standard
- Price: USD 7.99 per month
- Trial: 30 days
- Employee limit: 10 employees
- Pricing model: per company
- Admin comp accounts: supported through billing overrides

## PayPal Sandbox

Create a PayPal Business sandbox app and a monthly subscription product/plan in the PayPal Developer Dashboard.

Use the sandbox plan ID for the Standard monthly plan in Vercel:

```text
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID=your-sandbox-client-id
PAYPAL_CLIENT_SECRET=your-sandbox-client-secret
PAYPAL_STANDARD_PLAN_ID=your-sandbox-plan-id
PAYPAL_WEBHOOK_ID=your-sandbox-webhook-id
```

Add this webhook listener URL to the PayPal sandbox app:

```text
https://<your-vercel-preview-or-production-domain>/api/paypal/webhook
```

Subscribe it to subscription lifecycle and payment events, especially:

```text
BILLING.SUBSCRIPTION.ACTIVATED
BILLING.SUBSCRIPTION.CANCELLED
BILLING.SUBSCRIPTION.EXPIRED
BILLING.SUBSCRIPTION.SUSPENDED
PAYMENT.SALE.COMPLETED
PAYMENT.SALE.DENIED
PAYMENT.CAPTURE.COMPLETED
```

## Firebase Service Account

PayPal webhooks are sent server-to-server, so they cannot use the signed-in browser user's Firebase token. Add one of these credential options to Vercel.

Preferred single variable:

```text
FIREBASE_SERVICE_ACCOUNT_BASE64=base64-encoded-service-account-json
```

Alternative split variables:

```text
FIREBASE_PROJECT_ID=payroll-application-f6d25
FIREBASE_CLIENT_EMAIL=service-account-email
FIREBASE_PRIVATE_KEY=service-account-private-key-with-\n-line-breaks
```

## Test Flow

1. Sign in to Payroll Agent on the preview URL.
2. Open a company workspace.
3. Go to Settings.
4. Confirm the company is on trial or use the admin override controls.
5. Enter or load the PayPal sandbox client ID and plan ID.
6. Click Load PayPal sandbox button.
7. Complete checkout with a PayPal sandbox personal buyer account.
8. Confirm the billing status changes to active after approval or webhook receipt.
