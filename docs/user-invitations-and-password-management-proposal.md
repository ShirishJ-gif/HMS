# User invitations and password management

**Status:** Proposal for review — not implemented  
**Prepared:** 5 October 2026  
**Project:** HMS

## 1. Recommended experience

Replace **Add user** with **Invite user**. The manager chooses the person's name, email, role, and property. HMS emails a one-time invitation; the recipient sets their own password and activates their account.

Managers manage access. Each user manages their own password. No manager should see, choose, copy, or email another person's password.

The first release should include:

- Invitations, acceptance, expiry, resend, and cancellation.
- User-selected passwords and email verification during acceptance.
- Forgot-password and manager-triggered password-reset emails.
- Account disabling and immediate enforcement of access changes.
- Clear delivery status and audit history.

This document proposes changes only. Creating it does not change authentication, database records, permissions, or email delivery.

## 2. What the application does today

These findings are from the current repository, not assumptions about the deployed environment.

| Area | Current behavior | Required change |
|---|---|---|
| Add user | The form asks the manager for a password and confirmation. `POST /auth/users` creates the user with that password. | Replace this interactive flow with invitations. |
| Password storage | `PasswordService` uses salted scrypt hashes. | Reuse the hashing service; review its cost settings before production rollout. Never store plaintext passwords. |
| Invitations | No invitation model or acceptance flow exists in the inspected auth code. | Add an invitation lifecycle and public acceptance screen. |
| Email verification | The user model has no email-verification timestamp. | Record verification when the recipient successfully accepts their invitation. |
| Reset request | The public password-reset request endpoint returns the raw reset token for an active account. | Remove token disclosure and send the link through email. |
| Reset confirmation | The token is checked before the update transaction; it is then marked used and refresh sessions are revoked. | Consume the token atomically to prevent concurrent reuse; invalidate other reset tokens too. |
| Account disabling | Login and refresh check `isActive`. The access-token guard does not reload the user's active status or current role. | Enforce disabled accounts and changed permissions on authenticated requests. |
| Outbound delivery | The inspected reservation notification service supports mock/Telegram delivery. | Provide a dedicated transactional email service for authentication messages. OTA email ingestion is a different feature. |

**Priority finding:** Returning a reset token from a public endpoint can let someone who knows an active user's email reset that account's password. This is a release blocker if the endpoint is publicly reachable. The proposal does not establish whether it has been exploited or exposed in production.

Relevant source files:

- [Organization user screen](../apps/frontend/src/pages/OrganizationUsersPage.tsx)
- [Auth service](../apps/backend/src/modules/auth/auth.service.ts)
- [Auth controller](../apps/backend/src/modules/auth/auth.controller.ts)
- [Create-user DTO](../apps/backend/src/modules/auth/dto/create-user.dto.ts)
- [Auth guard](../apps/backend/src/modules/auth/auth.guard.ts)
- [Property and role scope](../apps/backend/src/modules/auth/property-scope.ts)
- [Password hashing](../apps/backend/src/modules/auth/password.service.ts)
- [Prisma schema](../apps/backend/prisma/schema.prisma)

## 3. Screens and user journeys

### Manager invites someone

The **Invite user** form contains:

| Field | Behavior |
|---|---|
| Name | Required; displayed in the invitation and user list. |
| Email | Required; trim and normalize consistently with login. |
| Role | Only roles the manager is permitted to assign. |
| Property | Only accessible properties; required for property-scoped roles. |
| Organization | Derived from the current owner or selected property. Platform administration must select an organization explicitly when inviting an organization owner. |

Remove password and confirmation inputs from this form.

After submitting, show **Invitation queued**. Show **Sent** only once the email provider has accepted the message. A delivery failure must remain visible with a retry action; it must not appear as successful delivery.

Example message:

> You have been invited to join Lakeview Retreat as Staff. Accept your invitation to verify your email and create your password. This invitation expires in 24 hours.

The email names the organization, property, role, and inviter, and contains an **Accept invitation** button. It contains no password. It also says that an unexpected invitation can be ignored.

### Recipient accepts

1. Open the link and view the intended property and role after token validation.
2. Enter a new password and confirm it. Email, role, and property are read-only.
3. Submit acceptance. The server validates and consumes the invitation, creates the account, and records email verification in one transaction.
4. Show **Account activated. Sign in to continue.**

Opening the link alone must not activate the account or consume the token: email security scanners may open links automatically.

The invitation proves control of that mailbox when completed. It does not verify a person's legal identity or let them choose additional permissions.

### User list and available actions

Show name, email, role, property/organization, access status, invitation delivery status, expiry where applicable, and actions.

| State shown | Can sign in? | Manager actions |
|---|---|---|
| Invited | No | Resend invitation, cancel invitation |
| Invitation expired | No | Resend invitation, cancel invitation |
| Invitation cancelled | No | Send a new invitation, if still authorized |
| Active | Yes | Send reset email, change permitted access, disable account |
| Disabled | No | Re-enable account, subject to permission checks |

Delivery status is separate from access status: **Queued**, **Sent**, or **Failed**. An email being sent does not mean the account is active. Do not label an email “delivered” without delivery confirmation from the provider.

### Resend, cancellation, and corrections

- Resend creates a fresh token with a new expiry and invalidates the previous token.
- Cancel immediately prevents acceptance and cancels any outstanding delivery attempt where possible.
- Changing the invited email, role, or property requires cancellation and a new invitation. A recipient must not accept a role different from the one they were shown.
- Expired, cancelled, replaced, and used links show a clear recovery message; they never create a second account.
- Managers see resend cooldowns and can distinguish a pending invitation from an active user.

### Password recovery

Add **Forgot password?** to sign-in. The user enters their email and receives a one-time reset link if their account is eligible.

Always display a neutral public response:

> If an eligible account exists for this email, we’ll send password-reset instructions.

The reset page accepts a new password and confirmation. A successful reset consumes the token, invalidates other reset links, revokes sessions, and sends a password-change notification. The user signs in normally afterward.

A manager's **Send reset email** action uses the same delivery process. It does not disclose the link or change the password immediately. Requesting a reset must not lock the user out or end their current sessions; those changes happen only after a successful reset.

For an invited person, show **Resend invitation** rather than password reset. For a disabled account, require an authorized re-enable action; password recovery must not bypass disabling.

## 4. Proposed role and property rules

The server remains authoritative. Hiding a frontend option is not an authorization check.

| Actor | Proposed invitation permissions | Scope |
|---|---|---|
| Platform owner | Organization owner, super admin, admin, staff | Explicit target organization/property |
| Organization owner | Super admin, admin, staff | Properties belonging to their organization |
| Super admin | Admin, staff | Their assigned property |
| Admin | Staff | Their assigned property |
| Staff | None | Cannot manage other users |

**Policy decision:** Restricting admins to inviting staff is tighter than the current backend helper, which also permits same-property admin creation. Review this change before implementation.

Additional rules:

- Version 1 preserves the existing scope model: an organization owner accesses their organization; super admins, admins, and staff have one assigned property. Arbitrary multi-property staff access would require a separate membership design.
- `SUPER_ADMIN` does not mean unrestricted platform access in the current scope helper.
- Creating another platform owner is outside the ordinary team-invitation form. Keep it as a separately controlled platform administration operation.
- Apply equivalent management boundaries to resend, cancellation, reset-email requests, role changes, disabling, and re-enabling.
- Revalidate the target property, organization, and current inviter authority at acceptance. Reject invitations whose authorization is no longer valid.
- Prevent managers from disabling themselves or removing the last active owner through this flow.
- Never silently replace an existing user's role, organization, property, or password because another invitation uses their email.

The current database has globally unique user emails. For version 1, reject invitations that conflict with an existing account. Show “already a member” only when the requesting manager can access that account; otherwise use a neutral conflict message without revealing another tenant's details. Cross-organization account membership is separate work.

## 5. Proposed defaults for review

These are product defaults, not values already implemented or universally mandated.

| Setting | Recommendation |
|---|---|
| Invitation lifetime | 24 hours |
| Password-reset lifetime | 30 minutes, matching the current intended reset lifetime |
| Resend cooldown | At least 60 seconds, with additional per-manager, per-recipient, and per-IP limits |
| Password policy | 15–128 characters for password-only authentication; allow spaces, password managers, and paste; reject known-compromised/common passwords |
| After acceptance/reset | Normal sign-in; no automatic login |
| Admin visibility | Invitation status and reset-request confirmation only; no passwords or token values |
| Existing users | Keep their current password and access unless an authorized action explicitly changes them |

Invitation and recovery tokens should be cryptographically random, single-use, and expiring. Store their hashes and validate them server-side. These principles follow [OWASP's password-recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## 6. Data model and consistency

### Recommended model: create the user on acceptance

Keep pending invitations separate from `User`. Create the user only when an invitation is accepted. This avoids fake passwords and avoids making `User.passwordHash` nullable solely for invited users.

The user-management API merges pending invitation rows with actual user rows for display. An invitation ID is never treated as a user ID or accepted for login.

Proposed `UserInvitation` fields:

| Field | Purpose |
|---|---|
| `id` | Stable invitation identifier |
| `email`, `name` | Intended recipient; normalized email |
| `role`, `organizationId`, `propertyId` | Server-validated access grant |
| `invitedByUserId` | Who authorized the invitation |
| `tokenHash` | Unique hash of the current invitation token |
| `tokenVersion` | Identifies the current token for delivery jobs and resend handling |
| `status` | `PENDING`, `ACCEPTED`, or `REVOKED` |
| `expiresAt`, `acceptedAt`, `revokedAt` | Lifecycle timestamps; derive the visible “Expired” state from an unaccepted pending invitation's expiry |
| `acceptedUserId` | Resulting user, when accepted |
| `lastSentAt`, `createdAt`, `updatedAt` | Operational history |

Add `User.emailVerifiedAt`, nullable for legacy accounts. Do not mark existing users verified without evidence. Do not suddenly block all legacy users when this column is introduced.

Keep password-reset tokens separate from invitation tokens. Add explicit revocation support and atomic consumption to the existing reset-token model.

Database constraints and transactions must ensure:

- One outstanding pending invitation per normalized email under the current one-account-per-email model. Resending rotates the pending invitation; reinviting after expiry/revocation must resolve the old pending record safely.
- Unique token hashes and unique user emails; handle conflicts without exposing unrelated accounts.
- Acceptance locks or conditionally updates the invitation, verifies its current version/status/expiry, creates the user, and writes its audit event in one transaction.
- Concurrent acceptance requests create exactly one account. A replay cannot overwrite its password or grant a second access scope.
- Resend, cancellation, acceptance, and account disabling serialize conflicting changes.
- Disabled or deleted inviters cannot leave invitations that bypass current access policy.

## 7. API and frontend changes

Proposed routes, subject to implementation review:

| Endpoint | Access | Purpose |
|---|---|---|
| `POST /auth/invitations` | Authorized manager | Create invitation and queue delivery |
| `GET /auth/invitations` | Authorized manager | List invitations within allowed scope |
| `POST /auth/invitations/:id/resend` | Authorized manager | Rotate token and queue a new email |
| `POST /auth/invitations/:id/cancel` | Authorized manager | Revoke pending invitation |
| `POST /auth/invitations/inspect` | Public, token required | Validate link and return minimal recipient/property/role details |
| `POST /auth/invitations/accept` | Public, token required | Set password, verify email, and create account |
| `POST /auth/password-reset/request` | Public | Queue eligible reset email; return a generic response |
| `POST /auth/password-reset/confirm` | Public, token required | Atomically reset password and invalidate sessions |
| `POST /auth/users/:id/password-reset` | Authorized manager | Send reset email to the stored user email |
| `PATCH /auth/users/:id/access` | Authorized manager | Change permitted role/property or active status |

Public inspection/acceptance must not permit client-supplied role, property, organization, or recipient changes. Manager endpoints must not return invitation/reset tokens.

Frontend work:

- Replace the password fields in `OrganizationUsersPage` with the invitation flow.
- Display invitation and user states with appropriate actions.
- Add public invitation-acceptance, forgot-password, and reset-password screens reachable without an existing session.
- Ensure emailed deep links work when opened directly, including frontend hosting fallback configuration.
- Handle expired/replaced links, offline requests, delivery failures, and repeated submissions clearly.
- After creation/resend/cancellation, refresh the list without losing the selected property.
- Retire or reject the old manager-created-password API once its callers have migrated. Leaving it available would preserve the original problem.

Owner self-signup and first-install bootstrap are different journeys: those users choose their own passwords. Do not remove their password fields as part of the staff invitation change. Email verification for owner signup should be addressed explicitly as a follow-up policy, rather than treating owner signup as already verified.

## 8. Transactional email delivery

Select a transactional email provider and a verified sender before enabling invitations. The provider is an implementation decision still to be made; no provider account or credentials have been verified for this proposal.

Required configuration includes an approved public frontend URL, sender address, provider credentials, and expiry/rate-limit settings. Set up the sender domain's required authentication records and test delivery to supported mailboxes.

Use a durable outbox so database success and an email-provider outage do not lose invitations:

1. Save the invitation and delivery job atomically.
2. A worker sends the email with retries and records provider acceptance/failure.
3. Before sending, check that the invitation/reset token version is still current and eligible.
4. Cancel stale jobs after resend, cancellation, acceptance, or disabling.
5. After repeated delivery failure, expose **Failed** and an authorized retry action.

The token hash cannot reconstruct an email link. If a delivery job needs the link for retries, store its sensitive payload encrypted with a key managed outside the database, restrict access, and delete the encrypted payload after delivery or expiry. Do not store plaintext links in general background-job JSON, error messages, or audit metadata.

Email sends may be retried after an uncertain provider response. Use provider idempotency where available and reuse the same current token/version for delivery retries; do not create new invitations on every retry. An older email arriving late must contain a link that the server correctly rejects after token rotation.

Production must never claim “email sent” when no delivery provider is configured. Development testing may use a local mail-capture inbox; production API responses must never expose links as a fallback.

## 9. Security requirements

- Remove the current public `reset_token` response, including any cached/idempotency response that could retain it.
- Use a fixed, trusted frontend origin for links; do not construct links from an untrusted request `Host` header.
- Prefer a URL fragment for the emailed token, then submit it in a POST body. Remove it from the address bar after reading it; keep it only in page memory. Token pages must have no third-party analytics, a `no-referrer` policy, and appropriate no-cache headers.
- Redact passwords, authorization headers, invitation/reset tokens, and full secret-bearing URLs from application logs, request/response tracing, provider errors, metrics, and audit records. Review request-body tracing as well as HTTP URLs.
- Preserve neutral responses and comparable processing behavior on public reset requests. Apply shared, deployment-wide limits rather than relying only on per-process counters.
- Consume a reset token and update the password in one transaction with a conditional state/expiry check. Checking it only before the transaction is insufficient for concurrent requests.
- Successful reset invalidates all outstanding reset tokens and all refresh sessions for the account.
- Disabling a user must block existing access tokens too. Load the current user and current role/property scope on authenticated requests, and reject inactive/deleted users.
- Add a session/auth version checked by the guard to invalidate already-issued access tokens on password reset, role/property change, or disable/re-enable. Refresh-session revocation alone does not invalidate an existing access JWT.
- Re-enabling an account must not revive sessions issued before it was disabled.
- Review password hashing parameters and password validation without weakening existing password verification. Avoid silently truncating passwords.
- Require recent authentication for privileged access changes, including owner-level actions. MFA for privileged accounts is a recommended follow-up, not a claim that it currently exists.

## 10. Audit history

Record invitation creation, resend, cancellation, successful acceptance, reset requests/delivery outcomes, successful resets, account disabling/re-enabling, and role/property changes.

Include the actor, target invitation/user, email where appropriate, organization/property, timestamp, outcome, and before/after access values. Public reset requests must not be attributed to the account owner merely because someone supplied their email; distinguish an anonymous request from a manager action and from token-authorized completion.

For an organization-owner invitation, record organization scope explicitly; do not invent a property scope. Audit-list authorization must handle these organization-level events while keeping them hidden from unrelated tenants. Review whether `AuditLog` needs an `organizationId` field and index to support this cleanly.

Never record passwords, password hashes, raw tokens, full invitation links, or email bodies containing links. Rate-limit security telemetry so public requests cannot flood the user-facing audit feed.

## 11. Migration and rollout

| Phase | Deliverable | Completion check |
|---|---|---|
| 1. Contain reset-token exposure | Remove public token disclosure and make reset consumption atomic. Until real delivery exists, disable unavailable recovery safely rather than returning a token. | No public response/log exposes reset secrets; concurrent reuse fails. |
| 2. Data and delivery foundations | Add invitations, verification timestamp, revocation/session-version support, and encrypted delivery outbox; configure email. | Migration preserves existing users; delivery failures/retries are observable. |
| 3. Invitation experience | Manager invitation UI, acceptance page, resend/cancel, scoped list, and audits. | A new staff member activates without a manager knowing their password. |
| 4. Recovery and access management | Forgot-password UI, manager reset emails, disable/re-enable, role/property changes, guard enforcement. | Reset/disable/access changes invalidate old access and refresh credentials as specified. |
| 5. Release verification | Test all scopes, failure paths, email links, and legacy accounts; retire old user-creation path. | Acceptance criteria below pass before rollout. |

Existing passwords, user IDs, property assignments, and historical audit records remain intact. No mass reset, user deletion, or automatic email-verification backfill is part of this proposal. Do not automatically email existing users during migration.

On rollback or delivery-provider failure, stop issuing new invitations and retain pending/audit records. Do not restore the insecure public token-returning behavior as a fallback.

## 12. Acceptance criteria

- A manager invites an allowed role without entering a password.
- The correct recipient receives an invitation naming the correct organization/property and role.
- No active user account exists before acceptance; link inspection alone does not activate one.
- Acceptance creates exactly one account and records verified email, actor history, and access scope.
- An expired, cancelled, replaced, or previously accepted token cannot activate or alter an account.
- Two simultaneous acceptance requests cannot create duplicate accounts or overwrite a password.
- Existing-account and duplicate-invitation conflicts do not transfer another tenant's account.
- Changing URL parameters or request fields cannot change the granted role/property/email.
- An out-of-scope manager cannot list, resend, cancel, reset, or disable another tenant's users.
- Manager authority lost after invitation creation is enforced at acceptance.
- Delivery failure is visible; retries do not grant access or generate uncontrolled duplicate invitations.
- New reset requests do not reveal account existence or raw tokens to the public.
- Reset tokens are consumed once, including under concurrent requests, and other reset tokens are invalidated.
- Old access and refresh tokens fail after password reset, disabling, and access changes.
- Re-enabling a user does not reactivate old credentials.
- Existing users can continue signing in after migration; unknown legacy verification remains explicit.
- Opening links on desktop/mobile and directly on the production frontend origin works.
- Email security scanners cannot accidentally consume invitations or reset passwords.
- Automated tests and tracing inspection confirm that secrets are not exposed in responses, logs, or audits.

Use isolated fixtures or transactions that roll back for database tests. Send delivery tests to designated test mailboxes or a mail-capture service, never to real staff without an explicit rollout action.

## 13. Decisions to confirm before implementation

| Decision | Recommended starting point |
|---|---|
| Authentication experience | One-time invitation, then password-based sign-in; no magic link required on every login |
| Invitation expiry | 24 hours |
| Delegation policy | Admins invite staff only; organization owners assign property management roles |
| Staff property access | One property per account in version 1 |
| Mail delivery | Choose provider, verified sender, and public frontend URL |
| Existing accounts | Preserve access/passwords; no automatic bulk invitation or reset campaign |

### Reference

[OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) — recovery responses, token security, email links, password-reset completion, and session handling.

**Review outcome:** Approve or revise this proposal before implementation begins.
