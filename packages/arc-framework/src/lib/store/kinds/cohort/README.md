# Cohort content

`parseCohortDocument` exposes the shared raw Purpose and the cohort's Parent slug. Parent is null when its line is
omitted or contains `[none]`; otherwise exactly one backticked slug is required. Duplicate or invalid Parent lines
return a structured refusal. Purpose preserves empty and placeholder values.

`registration.ts` installs that parser and all three integrity rules, retaining parse refusals in store listings.
The public index exposes pure content operations; callers obtain stored documents through the store.

`writeCohortDocument` takes the canonical template's identity paragraph and renders a top-level or nested cohort,
including optional authored Purpose and member sections. It finds Parent by its label, so both template placeholder
forms retain the same identity. Missing template landmarks or a noncanonical cohort path return null; member bodies
and their supplied order are preserved.

`rewriteCohortMemberHeading` renames only an exact member heading within Members, preserving all other lines.

`reportOrphanCohortMemberSections` returns member headings whose slugs are absent from the supplied membership,
in document order. It supports advisory consistency diagnostics rather than refusing a document write.

`rules.ts` checks new or changed Purpose and Parent values, and document retirement. `check-support.ts` observes
complete proposed open membership and nesting without treating unavailable entries as absence. A cohort stays open
until its placement is completed; batch writes can settle member paths, children, and archival together. `check.ts`
collects every applicable violation instead of stopping after one.
