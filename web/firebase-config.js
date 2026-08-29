const defaultAuthDomain = "payroll-application-f6d25.firebaseapp.com";
const hostedAuthDomain = "payroll-agent-ten.vercel.app";
const hostname = window.location.hostname;
const authDomain = hostname === hostedAuthDomain ? hostedAuthDomain : defaultAuthDomain;

export const firebaseConfig = {
  apiKey: "AIzaSyBylmaNc1dq6Cx9UK6zj-N7AF6dXxIIvhk",
  authDomain,
  projectId: "payroll-application-f6d25",
  storageBucket: "payroll-application-f6d25.firebasestorage.app",
  messagingSenderId: "1049795386505",
  appId: "1:1049795386505:web:fb9314ce8eda97df207a58",
};
