# Firebase Setup

This folder contains the first multi-company Firebase rule templates for Payroll Agent.

## Bootstrap

After the first Google sign-in, open Firestore and set your `users/{uid}` document:

```json
{
  "platformRole": "platform_admin"
}
```

That unlocks the Administrator tab for approving company signup requests.

## Data Model

```text
users/{uid}
users/{uid}/memberships/{companyId}
signupRequests/{requestId}
companies/{companyId}
companies/{companyId}/members/{uid}
companies/{companyId}/employees/{employeeId}
companies/{companyId}/payrollRuns/{YYYY-MM}
companies/{companyId}/changeRequests/{requestId}
companies/{companyId}/auditLogs/{logId}
```

## Deployment

Deploy these rules from a Firebase CLI project when ready:

```powershell
firebase deploy --only firestore:rules,storage
```
