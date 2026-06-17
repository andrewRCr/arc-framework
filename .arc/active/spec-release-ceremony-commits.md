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
only real risks, so footer-parsing/branch-shape validation would add brittleness for no safety gain. WU presence was
never a safety guard — only an audit-name precondition; the actual guards (destructive-flag, branch-protection, interlock)
are independent of it and unchanged, which is why coarse acceptance is sufficient and positive validation is
overkill.

Two consequences of the split: (1) because zero candidates now proceed, refusal code 10 fires only for the
multi-candidate case, so its identifier is renamed `no-active-wu` → `ambiguous-active-wu` (numeric code unchanged)
to keep the audit label honest. (2) The accept path records `wu: null`, which today is indistinguishable in the
audit from a nameless lite-layout WU (`toAuditWorkUnit` maps an empty name to null) — an accepted interim
limitation: lite-layout is dead ADR-020 residue slated for removal under `scalable-core`, after which null
unambiguously means no active WU. No audit-marker workaround is built here.

**Out of scope** (stays in `interlock-release-refinement`): the archival-ceremony finalize tooling, the errand
approval-collapse (whole-tail one-approval), positive ceremony-provenance validation, and any new config surface.
Also out of scope: removing the lite-layout residue (→ `scalable-core`).

**Success Criteria:** `arc release commit` and `arc release push` succeed on a no-active-WU context **on an
unprotected branch** — validating the interlock and writing an audit entry with a null work unit — and still
refuse with refusal code 10 (`ambiguous-active-wu`) when two or more active metas resolve, with single-active-WU
behavior unchanged. The branch-protection gate still refuses any no-active-WU commit on the protected base
(unchanged), so the accept path is reachable only off-base. Covered by unit tests on both handlers: zero-candidate
off-base → proceeds; zero-candidate on the protected base → branch-protection refusal (code 13); multi-candidate →
code 10; single resolved → unchanged.
