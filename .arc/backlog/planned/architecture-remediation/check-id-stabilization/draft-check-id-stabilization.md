# Draft: check-id-stabilization

- **Origin:** [internal] — routed from a USER-INBOX capture at the `single-owner-wu-model` housekeep drain
  (2026-06-24); the root-cause follow-up to that WU's Task 4.2, which deliberately left a numbering gap at
  CHECK 10 (Option B) rather than trigger a renumber cascade.
- **Purpose:** Replace the pre-commit hooks' positional `CHECK N` ordinals with stable slug identifiers so check
  identity decouples from position — adding or removing a check never forces a renumber cascade — and correct the
  live off-by-one drift the ordinal scheme has already accumulated.

---

## Problem / Motivation

Pre-commit checks are identified by positional ordinals (`CHECK 1`…`CHECK 19`), and those numbers are referenced
across ~43 live sites: hook headers and in-hook cross-reference comments (both trees), `verify-arc-integrity.md`,
`verify-integrity.sh`, `src/scripts/validate-*.ts` doc comments, and 5 test files. Adding or removing any check
forces a renumber cascade across the whole live corpus (historical references under `.arc/completed/**` are left
stale).

The numbers have **already drifted**, so this is live tech debt, not just latent brittleness:

- `validate-extension-points.ts:2` self-labels "CHECK 16" but the hook invokes it as CHECK 15.
- `validate-package-neutrality.ts:101` and its test call the frontmatter-schema check "CHECK 12" but the hook
  numbers it CHECK 11.

## Direction (rough)

Replace ordinals with stable slug identifiers (e.g. `CHECK[frontmatter-schema]`, `CHECK[cohort-consistency]`) so
identity decouples from position — add/remove never renumbers, tests and docs reference by name, and a one-time
migration pass corrects the current drift.

## Scope

- Both hook trees + validator source comments + the `verify-integrity` doc/script + the hook test suites.
- A slug-syntax and cross-file reference-convention decision (the design floor this WU clears).
- A one-time migration that also fixes the two known off-by-one labels.

## Open questions

- Slug-ID syntax (`CHECK[name]` vs another form) and how cross-references cite it.
- Whether to migrate all sites at once or incrementally (heal-on-touch).
- Coordination with `quality-gate-hooks` (overlapping hook surface) and the `architecture-remediation` cohort
  siblings — `cli-test-hardening` already touches the hook test suites.

## Priority note

Carried `P2` (above the cohort's usual `P3`) because the surfaced off-by-one drift is an *active* inconsistency,
not only future-churn risk — revisit at planning.

---
