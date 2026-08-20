# Draft: Verification Scope Scaling

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-20).
- **Cohort:** `verification-integrity`
- **Purpose:** Scale verification attention across delivery members while preserving complete whole-work-unit seam
  coverage.

## Problem / Motivation

Stacked delivery already distributes quality gates and exact-head review across members, but verification remains a
single whole-work-unit success-criteria walk. The first field case required a four-agent fan-out over roughly 15,000
changed lines and 15 criteria. This is the same attention limit chunked review addresses, now left at a different
gate.

The general failure is broader than delivery: chunking one attention-sensitive gate does not automatically scale the
task list, implementation arc, or verification boundary.

## Direction

- Define a verification primitive parameterized by an explicit scope.
- Use the delivery plan's member coverage to bind member-scoped criteria without moving work-unit ownership.
- Reserve a complete whole-work-unit pass for cross-member and cross-scope seams.
- Settle where criteria slices and seam obligations live and how their union is proven complete.
- Preserve ordinary whole-WU verification for work that does not need partitioned attention.

`delivery-review-cardinality` remains responsible for provider request cardinality. `decomposition-doctrine` owns
whether the concern should have been several work units rather than one scoped verification campaign.

---
