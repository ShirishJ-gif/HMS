# User profile

Open **My Profile** from the top-right account menu. All authenticated roles can use this page, including organization owners with no properties and platform owners.

- Users can change their name and optional phone number.
- Email, role, organization, and property access are read-only.
- Organization owners can choose any active property in their organization as their default. Other property users can choose their assigned active property.
- The default applies at the next sign-in. “Remember my last selection” retains the browser's previous selection. Saving a preference does not switch the current workspace property.
- Platform owners do not have a default-property control.
- Password changes require the current password and a new password of 10–128 characters. The current browser receives a new session; older access and refresh tokens become invalid.

## API

`GET /auth/profile` returns the authenticated user's profile and accessible properties.

`PATCH /auth/profile` accepts `name`, nullable `phone`, and nullable `default_property_id`. Identity and access fields cannot be edited through this endpoint.

`POST /auth/change-password` accepts `current_password` and `new_password`, returning a fresh auth response. The endpoint shares the authentication rate limit. It also invalidates outstanding password reset tokens.

## Deployment and verification

Run Prisma generation and apply `20261005120000_user_profile` before starting the updated backend. The migration adds nullable profile fields and credential versions initialized to zero, preserving existing sessions until a password change or reset.

Run the focused tests with:

```sh
npm --workspace apps/backend test -- --runInBand profile.spec.ts
RUN_PROFILE_INTEGRATION=true npm --workspace apps/backend test -- --runInBand profile.integration.spec.ts
```

Integration checks require the development database and roll back all fixture changes.
