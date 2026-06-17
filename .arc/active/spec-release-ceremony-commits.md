# Spec (`brief`): release-ceremony-commits

- **Origin:** [internal] — extracted from `interlock-release-refinement` (2026-06-17), where the wrapper-precondition
  fix was the foundational entry the cohort's other facets build on.

---

`arc release commit` and `arc release push` refuse with code 10 (`no-active-wu`) whenever no active work unit
resolves, which forces a raw-`git` fallback for legitimate no-active-WU ceremony invocations — errands, archival
sweeps (the commit that moves `meta-*` out of `active/`), decompositions, and standalone/housekeep commits —
recurring friction hit repeatedly while draining inboxes and running errands. This work teaches the wrapper to
accept the **zero-candidate** case — proceed and record a null work unit in the audit entry — while still
**refusing the multi-candidate** case (genuine ambiguity), splitting the resolver's single `refused` result into
those two outcomes. Acceptance is unconditional on zero candidates rather than positively validated against
ceremony provenance: the existing branch-protection refusal, interlock gating, and audit trail already cover the
only real risks, so footer-parsing/branch-shape validation would add brittleness for no safety gain. **Out of
scope** (stays in `interlock-release-refinement`): the archival-ceremony finalize tooling, the errand
approval-collapse (whole-tail one-approval), positive ceremony-provenance validation, and any new config surface.

**Success Criteria:** `arc release commit` and `arc release push` succeed on a no-active-WU context — validating
the interlock and writing an audit entry with a null work unit — and still refuse with code 10 when two or more
active metas resolve, with single-active-WU behavior unchanged; all three cases covered by unit tests on both
handlers.
