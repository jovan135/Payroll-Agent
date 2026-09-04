import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const standardPlan = {
  planId: "monthly_standard",
  monthlyFee: 7.99,
  currency: "USD",
  employeeLimit: 10,
  trialLengthDays: 30,
};

function trialEndDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + standardPlan.trialLengthDays);
  return date.toISOString();
}

function isPermissionError(error) {
  return error?.code === "permission-denied" || String(error?.message || "").includes("Missing or insufficient permissions");
}

function fallbackProfile(user, error) {
  return {
    id: user.uid,
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    platformRole: "user",
    firebaseSetupIssue: true,
    firebaseSetupMessage: error?.message || "Firestore permissions are not ready yet.",
  };
}

export function listenForAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentAuthUser() {
  return auth.currentUser;
}

export async function signInWithGoogle(options = {}) {
  const provider = new GoogleAuthProvider();
  if (options.promptSelectAccount) {
    provider.setCustomParameters({ prompt: "select_account" });
  }
  if (options.redirect) {
    await signInWithRedirect(auth, provider);
    return null;
  }
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function completeRedirectSignIn() {
  return getRedirectResult(auth);
}

export function signOutUser() {
  return signOut(auth);
}

export async function getAuthToken() {
  if (!auth.currentUser) throw new Error("Sign in before running payroll.");
  return auth.currentUser.getIdToken();
}

export async function ensureUserProfile(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);
    const profile = {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      lastLoginAt: serverTimestamp(),
    };
    if (snapshot.exists()) {
      await setDoc(userRef, profile, { merge: true });
    } else {
      await setDoc(userRef, {
        ...profile,
        platformRole: "user",
        createdAt: serverTimestamp(),
      });
    }
    return loadUserProfile(user.uid);
  } catch (error) {
    if (isPermissionError(error)) return fallbackProfile(user, error);
    throw error;
  }
}

export async function loadUserProfile(uid) {
  try {
    const snapshot = await getDoc(doc(db, "users", uid));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  } catch (error) {
    if (isPermissionError(error)) return null;
    throw error;
  }
}

export async function loadMemberships(uid) {
  try {
    const membershipsSnapshot = await getDocs(collection(db, "users", uid, "memberships"));
    const memberships = [];
    for (const membershipDoc of membershipsSnapshot.docs) {
      const companySnapshot = await getDoc(doc(db, "companies", membershipDoc.id));
      memberships.push({
        id: membershipDoc.id,
        ...membershipDoc.data(),
        company: companySnapshot.exists() ? { id: companySnapshot.id, ...companySnapshot.data() } : null,
      });
    }
    return memberships;
  } catch (error) {
    if (isPermissionError(error)) return [];
    throw error;
  }
}

export async function requestCompanySignup(user, company) {
  return addDoc(collection(db, "signupRequests"), {
    companyName: company.companyName,
    tradeName: company.tradeName || company.companyName,
    nibEmployerRegistrationNumber: company.nibEmployerRegistrationNumber || "",
    address: {
      line1: company.address?.line1 || "",
      line2: company.address?.line2 || "",
      city: company.address?.city || "",
      country: company.address?.country || "Trinidad and Tobago",
    },
    contactName: company.contactName || user.displayName || "",
    contactEmail: user.email || "",
    phone: company.phone || "",
    declarant: {
      name: company.declarant?.name || "",
      position: company.declarant?.position || "",
      signatureRequiredAfterGeneration: true,
    },
    status: "pending",
    requestedByUid: user.uid,
    requestedByEmail: user.email || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function loadMySignupRequests(uid) {
  try {
    const requestsQuery = query(collection(db, "signupRequests"), where("requestedByUid", "==", uid));
    const snapshot = await getDocs(requestsQuery);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    if (isPermissionError(error)) return [];
    throw error;
  }
}

export async function loadAdminSignupRequests() {
  try {
    const snapshot = await getDocs(collection(db, "signupRequests"));
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    if (isPermissionError(error)) return [];
    throw error;
  }
}

export async function approveSignupRequest(request) {
  const companyRef = doc(collection(db, "companies"));
  const billing = {
    provider: "paypal",
    status: "trial",
    planId: standardPlan.planId,
    monthlyFee: standardPlan.monthlyFee,
    currency: standardPlan.currency,
    subscriptionId: "",
    customerId: "",
    trialEndsAt: trialEndDate(),
    currentPeriodEnd: "",
    lastPaymentAt: "",
    employeeLimit: standardPlan.employeeLimit,
    comped: false,
    providerMode: "sandbox",
  };
  const company = {
    name: request.companyName,
    legalName: request.companyName,
    tradeName: request.tradeName || request.companyName,
    nibEmployerRegistrationNumber: request.nibEmployerRegistrationNumber || "",
    address: request.address || {
      line1: "",
      line2: "",
      city: "",
      country: "Trinidad and Tobago",
    },
    contactName: request.contactName || "",
    contactEmail: request.contactEmail || "",
    phone: request.phone || "",
    declarant: request.declarant || {
      name: "",
      position: "",
      signatureRequiredAfterGeneration: true,
    },
    status: "active",
    billing,
    createdFromSignupRequestId: request.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(companyRef, company);
  await setDoc(doc(db, "companies", companyRef.id, "billing", "current"), {
    ...billing,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "companies", companyRef.id, "members", request.requestedByUid), {
    uid: request.requestedByUid,
    email: request.requestedByEmail || request.contactEmail || "",
    displayName: request.contactName || "",
    role: "company_owner",
    status: "active",
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "users", request.requestedByUid, "memberships", companyRef.id), {
    companyId: companyRef.id,
    companyName: request.companyName,
    role: "company_owner",
    status: "active",
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "signupRequests", request.id), {
    companyId: companyRef.id,
    status: "approved",
    updatedAt: serverTimestamp(),
  });
  return companyRef.id;
}

export async function rejectSignupRequest(requestId) {
  await updateDoc(doc(db, "signupRequests", requestId), {
    status: "rejected",
    updatedAt: serverTimestamp(),
  });
}

export async function saveCompanyEmployee(companyId, employee) {
  await setDoc(doc(db, "companies", companyId, "employees", employee.employee_id), {
    ...employee,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function saveCompanyProfile(companyId, company) {
  await setDoc(doc(db, "companies", companyId), {
    ...company,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadCompanyBilling(companyId) {
  const snapshot = await getDoc(doc(db, "companies", companyId, "billing", "current"));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function saveCompanyBilling(companyId, billing) {
  await setDoc(doc(db, "companies", companyId, "billing", "current"), {
    ...billing,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await setDoc(doc(db, "companies", companyId), {
    billing: {
      status: billing.status,
      planId: billing.planId,
      monthlyFee: billing.monthlyFee,
      currency: billing.currency,
      employeeLimit: billing.employeeLimit,
      provider: billing.provider,
      providerMode: billing.providerMode,
      subscriptionId: billing.subscriptionId || "",
      customerId: billing.customerId || "",
      trialEndsAt: billing.trialEndsAt || "",
      currentPeriodEnd: billing.currentPeriodEnd || "",
      lastPaymentAt: billing.lastPaymentAt || "",
      comped: Boolean(billing.comped),
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadCompanyEmployees(companyId) {
  const snapshot = await getDocs(collection(db, "companies", companyId, "employees"));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function loadCompanyPayrollRuns(companyId) {
  const snapshot = await getDocs(collection(db, "companies", companyId, "payrollRuns"));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function updateCompanyPayrollRunStatus(companyId, month, status) {
  await updateDoc(doc(db, "companies", companyId, "payrollRuns", month), {
    status,
    updatedAt: serverTimestamp(),
    ...(status === "approved" ? { approvedAt: serverTimestamp() } : {}),
    ...(status === "cancelled" ? { cancelledAt: serverTimestamp() } : {}),
  });
}
