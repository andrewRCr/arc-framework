# Draft: cohort-design-records

**Purpose:** Give theme groupings, group designs, and program registers suitable record and approval forms without
duplicating typed coordination.

- **Origin:** [internal] — inbox routing, 2026-10-19; original capture provenance is retained below.
- **Planning posture:** provisional; `P2`; `Heavy`. This capture draft carries unresolved design input; no approved
  design is implied.

---

## Concerns

### Give a cohort's group-level design a record form of its own

- _Observation:_ the eleven planned cohort documents are three records under one template. Theme buckets run 15–30
  lines, and `cohort-architecture-remediation.md` says it exists to satisfy the grouping-directory convention.
  Coordinating programs carry a register and a closeout rule (`cohort-state-storage.md`), and the closeout's "no open
  row" is stated but unchecked. Group design records carry Unknowns, Won't Do, Constraints, and Shared Rationale
  (`cohort-storage-seam.md` at 427 lines, `cohort-review-protocol-alignment.md` at 311): specs for a group, with no spec
  form and no approval step, and inline "Amended 2026-10-14 —" lines accreting in them. A cohort has no owner by design,
  so nothing names who approves its design. `strategy-work-planning` and `decomposition-doctrine` hold no group-level
  spec form; `template-cohort.md` calls itself expected to iterate, not a fixed schema.
- _Approach:_ decide a form per kind rather than one template: whether a theme-only grouping needs a document or only a
  label; for a group design, stable design text with typed metadata beside it, a dated history section or forward
  relations in place of inline amendments, and an approval step with a named approver; for a register, typed rows whose
  state the CLI reads to say the cohort is done. The cohort model itself — membership derived from each member's
  `Cohort` field, one nesting level, the document loading at session-init — held up in the 2026-10-15 review; the open
  questions are the record's form and its approval. Prior-art leads, to verify at grooming: Kubernetes KEPs (a prose
  README beside `kep.yaml` metadata, with an Implementation History section), Python PEP headers (Type, Status,
  Requires, Replaces, Superseded-By), IETF RFCs' Updates and Obsoletes relations, a Rust RFC beside its tracking issue,
  Shape Up pitches (Rabbit holes, No-gos), a program RAID log (risks, assumptions, issues, dependencies), arc42's
  section set, and Linear's project updates and initiatives.
- _Captured during:_ the `work-item-relations` mint Errand, 2026-10-15, the cohort-document discussion.

---
