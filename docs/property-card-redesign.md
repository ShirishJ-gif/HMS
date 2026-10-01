# Saved property card redesign — 2026-09-21

Current design: a full-width white Villa sales options card with five aligned metrics, fine vertical dividers, and a pencil beside Edit. Removed the 768px width cap in PropertySetupPage to use the available right-hand space. Replaces the first design with dark and light rate panels. The shared VillaRateSettings component displays this summary wherever used. Editing, saving, validation, and API calls are unchanged.

The user may request reverting only this design. From the repository root:

```sh
git apply --reverse --check docs/property-card-redesign.patch
git apply --reverse docs/property-card-redesign.patch
```

This patch excludes pre-existing edits to the component and all earlier report, calendar, and ledger changes. If later changes conflict, reverse only these visual changes manually rather than restoring the full file.

The rollback patch restores the original card and original width, before either redesign. It includes only the component styling and the width wrapper in PropertySetupPage.
