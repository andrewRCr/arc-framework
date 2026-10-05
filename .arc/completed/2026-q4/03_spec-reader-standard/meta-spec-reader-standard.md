# Metadata: spec-reader-standard

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `doc-conventions`
- **Depends On:** [none]

- **Origin:** `[internal] — minted at the 2026-09-30 housekeep drain from a USER-INBOX capture`
- **Design:** `spec-spec-reader-standard.md`
- **Task List:** `tasks-spec-reader-standard.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:f17c0e592c6459367dde9b9a7dd33d9b73d63d3405405ddef03c59d3b27e060a`

- **Current Workflow:** [none]
- **Last Completed:** Task 3.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/790>
- **Completed:** 2026-10-03

## Release Notes Entry

Specification authoring and revision now check that the specification is understandable without planning history
and retains the binding design needed for implementation and verification.

### Changed

- Brief, outline, and detailed specification templates guide authors to preserve complete intent, requirements,
  decisions, and criteria while replacing planning references with their substance.
- The shared specification review requires reader independence and binding completeness for every new specification
  and future substantive edit, including grounding-only review and coherence rereads. Revisions cover the affected
  contract without requiring a retrofit of unchanged specifications.
- Specification-writing workflows invoke the shared checks at their existing approval boundaries. Draft retirement
  keeps binding design in the specification, and extraction reviews the retained source before approval and apply.

## Completion Notes

Implemented the paired reader-independence and binding-completeness checks through the existing shared review
method, four specification-writing workflows, and four specification templates. All nine authoritative sources and
matching project projections carry the same contract. Specifications retain binding obligations and decisive
rationale while preserving technical references, tracking metadata, amendments, supplemental execution context, and
accessible complementary specification sets.

The review-driven amendment makes eligibility explicit: every new specification and future substantive edit receives
the checks regardless of when the specification was authored. Revision review covers removals and affected surrounding
obligations and definitions; unchanged legacy content requires no retrofit. The approved correction was verified and
its hosted finding was settled through the native response path.

Validation covers all seventeen success criteria, all eight representative reader judgments, all nine projection
pairs, and an isolated missing-guidance negative control. Markdown and ARC contract checks passed, as did all 98
framework-contract tests, both type checks, code and shell lint, the build, and the routine suite of 13,260 tests
with two skips. These results establish artifact integrity and intended review judgments; executing-agent adherence
was not measured.

The complete second hosted Codex pass returned clean at `e478b13646f6510b62fbfc017a781a7fdc3139da`, and the native
standard-review route reports settled. Required CI checks remain subject to the final integration checkpoint.

---
