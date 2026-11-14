# Cohort content

`parseCohortDocument` exposes the shared raw Purpose and the cohort's Parent slug. Parent is null when its line is
omitted or contains `[none]`; otherwise exactly one backticked slug is required. Duplicate or invalid Parent lines
return a structured refusal. Purpose preserves empty and placeholder values.

`ParsedCohortDocumentSchema` narrows a stored record's untyped fields to its nullable Purpose and Parent, preserving
the slug validation. `ParsedCohortDocument` is inferred from that schema.

`registration.ts` installs that parser and all three integrity rules, retaining parse refusals in store listings.
The public index exposes pure content operations; callers obtain stored documents through the store.

`writeCohortDocument` takes the canonical template's identity paragraph and renders a top-level or nested cohort,
including optional authored Purpose and member sections. It finds Parent by its label, so both template placeholder
forms retain the same identity. Missing template landmarks or a noncanonical cohort path return null; member bodies
and their supplied order are preserved.

`rewriteCohortMemberHeading` renames only an exact member heading within Members, preserving all other lines.

`writeCohortFanout` sorts members by UTF-8 bytes and appends an origin's marked fan-out block before the final rule,
or at the end when no rule exists. It reuses an exact block without edits and refuses conflicting same-origin markers
as `conflicting-provenance`.

`cohortMemberSectionSlugs` returns the slug of each member heading under Members, in document order, and
`reportOrphanCohortMemberSections` those absent from the supplied membership. The report itself never refuses a write.

`member-section-rule.ts` refuses a hand edit whose resulting record keeps a member heading that names no current
member: a work unit, live or completed, whose Cohort field's last segment names the cohort by its current or a former
name. A verb's write never refuses over a heading it leaves, so such a heading refuses the record's next hand edit.

`rules.ts` checks new or changed Purpose and Parent values, and document retirement. `check-support.ts` observes
complete proposed open membership and nesting without treating unavailable entries as absence. A cohort stays open
until its placement is completed; batch writes can settle member paths, children, and archival together. `check.ts`
collects every applicable violation instead of stopping after one.
