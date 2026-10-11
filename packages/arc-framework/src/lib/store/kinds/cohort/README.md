# Cohort content

`parseCohortDocument` exposes the shared raw Purpose and the cohort's Parent slug. Parent is null when its line is
omitted or contains `[none]`; otherwise exactly one backticked slug is required. Duplicate or invalid Parent lines
return a structured refusal. Purpose preserves empty and placeholder values.

`registration.ts` installs that parser for `cohort/document`, retaining its refusal diagnostics in store listings.
The public index exposes pure content operations; callers obtain stored documents through the store.
