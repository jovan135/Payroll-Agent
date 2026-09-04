const STANDARD_PLAN = {
  planId: "monthly_standard",
  monthlyFee: 7.99,
  currency: "USD",
  employeeLimit: 10,
  trialLengthDays: 30,
};

function normalizeBilling(billing = {}) {
  return {
    provider: "paypal",
    status: billing.status || "trial",
    planId: billing.planId || STANDARD_PLAN.planId,
    monthlyFee: Number(billing.monthlyFee ?? STANDARD_PLAN.monthlyFee),
    currency: billing.currency || STANDARD_PLAN.currency,
    subscriptionId: billing.subscriptionId || "",
    customerId: billing.customerId || "",
    trialEndsAt: billing.trialEndsAt || "",
    currentPeriodEnd: billing.currentPeriodEnd || "",
    lastPaymentAt: billing.lastPaymentAt || "",
    employeeLimit: STANDARD_PLAN.employeeLimit,
    comped: Boolean(billing.comped),
    providerMode: billing.providerMode || "sandbox",
    overrideNote: billing.overrideNote || "",
  };
}

function trialIsCurrent(trialEndsAt) {
  if (!trialEndsAt) return true;
  const timestamp = new Date(trialEndsAt).getTime();
  if (Number.isNaN(timestamp)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return timestamp >= today.getTime();
}

function billingAccess(billingInput) {
  const billing = normalizeBilling(billingInput);
  if (billing.comped || billing.status === "comped") {
    return { allowed: true, billing, reason: "Complimentary account access is active." };
  }
  if (billing.status === "active") {
    return { allowed: true, billing, reason: "Standard plan is active." };
  }
  if (billing.status === "trial" && trialIsCurrent(billing.trialEndsAt)) {
    return { allowed: true, billing, reason: "Trial access is active." };
  }
  if (billing.status === "past_due") {
    return {
      allowed: false,
      billing,
      reason: "Payment is past due. Old records remain available, but new payroll runs and generated outputs are locked.",
    };
  }
  if (billing.status === "trial") {
    return {
      allowed: false,
      billing,
      reason: "The free trial has ended. Choose the Standard plan before running or finalizing new payroll.",
    };
  }
  return {
    allowed: false,
    billing,
    reason: "This company needs an active subscription before running or finalizing payroll.",
  };
}

function assertCanCreatePayroll(billingInput) {
  const access = billingAccess(billingInput);
  if (!access.allowed) {
    const error = new Error(access.reason);
    error.status = 402;
    error.code = "billing_required";
    error.billing = access.billing;
    throw error;
  }
  return access;
}

module.exports = {
  STANDARD_PLAN,
  assertCanCreatePayroll,
  billingAccess,
  normalizeBilling,
};
