# Draft: cohort-design-records

**Purpose:** Give theme groupings, group designs, and program registers suitable record and approval forms without
duplicating typed coordination.

- **Origin:** [internal] — inbox routing, 2026-10-19; original capture provenance is retained below.
- **Planning posture:** provisional; `P2`; `Heavy`. This capture draft carries unresolved design input; no approved
  design is implied.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Give a cohort's shared decisions one live place to change after their owner ships**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ "Give a cohort's group-level design a record form of its own", its "dated history section or forward
  relations in place of inline amendments".

- _Observation:_ the state-storage program records changes to shipped members' decisions as "Forward amendments to
  shipped specifications" sections in later members' specs: `spec-seam-lifecycle.md` § 18 began it (2026-10-13), and
  seam-locus § 15, seam-status-roadmap § 11, seam-decomposition § 17, seam-delivery-review § 13, storage-projection
  § 16, and storage-ref-backend's spec ("a forward amendment to D10") followed; `cohort-identity-verbs`'s draft carried
  11 entries "as `spec-seam-lifecycle.md` § 18 and `spec-seam-decomposition.md` § 17 do theirs". The cause is the
  record's shape: `cohort-storage-seam.md` § Shared contracts keeps each shared decision in its owner's draft through
  its spec and points there, "never the design itself", so once the owner ships, its frozen spec is the only place the
  decision is written, and a later change has nowhere to land but another spec. Two costs followed. A reader finds a
  decision's current form only by chasing amendment chains across archived specs. And review treats the list as
  complete, so every behavior change needs an entry or reads as a propagation gap (`cohort-identity-verbs` pass 3 F1
  named a missing closeout-rule amendment). A spec is binding only within its own work unit, and it describes what that
  unit builds with no reference to what another built, so the relation between members' decisions belongs to the live
  cohort record, which stays live while any member is.

- _Approach:_ PR #1100 added the interim rule: both state-storage cohort documents say a shipped member's spec is not
  amended, and a change to a shared decision is recorded in the cohort document beside the item, stating the decision as
  it stands. The record form should make that the shape rather than a paragraph: shared decisions stated in the cohort
  record itself, or in an ADR where the decision is architectural, with a dated change history. The approved
  forward-amendment sections in live and archived specs stay as written.

- _Captured during:_ `cohort-identity-verbs` draft-design pass 3, 2026-10-23.

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
