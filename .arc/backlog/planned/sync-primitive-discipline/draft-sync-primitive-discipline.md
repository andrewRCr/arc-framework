# Draft: sync-primitive-discipline

- **Origin:** [internal] — `USER-INBOX § Errand`, housekeep drain (2026-07-01); captured between-WUs after
  distinguishing notes-only sync from top-level sync orchestration.
- **Purpose:** Codify when each user-state sync primitive is the right one, and align workflow/skill prose to
  that contract, so hand-rolled `save` + `push` sequences never bypass the coherence gates `arc sync` owns —
  and never add remote side effects at note-reanchor-only sites.

---

## Problem / Motivation

ARC workflows and skills use several related user-state commands whose behavior is intentionally **not**
identical:

- `arc user save` — re-anchor notes to the current `HEAD` with **no remote side effects**.
- `arc user push` — explicit notes transport only.
- `arc user sync` — notes-only, direction-aware reconciliation.
- top-level `arc sync` — owns worktree/notes coherence, notes-push policy, partial-push markers, errand-ref
  reconcile, paired push ordering, and optional inbound fast-forward.

Workflow prose that hand-rolls `save` + `push` risks bypassing the coherence gates `arc sync` owns; but blindly
replacing every `save` with `sync` would add unintended remote behavior at note-reanchor-only sites. There is no
codified "when to use which" contract, so the choice is made ad hoc per workflow and can drift.

## Approach

Audit the workflow/skill guidance across `arc-inbox`, `drain-inbox`, `run-errand`, `session-handoff`, and the
related between-WU / finalize paths. Codify the primitive-selection contract:

- `arc user save` for local note anchoring;
- `arc user push` only for explicit notes transport;
- `arc user sync` for notes-only, direction-aware reconciliation;
- top-level `arc sync` at lifecycle / handoff boundaries where remote side effects and worktree/notes coherence
  are in scope.

Update misleading comments / help text and tests where behavior has drifted from the intended contract.

## Scope Estimate

Small–Medium — prose/guidance audit across several workflows plus help-text/test reconciliation; both the package
source and the `.arc/` copy.

- **Files:** `.arc/system/workflows/arc/session-lifecycle/session-handoff.md`,
  `.arc/system/workflows/arc/supplemental/drain-inbox.md`,
  `.arc/system/workflows/arc/supplemental/run-errand.md`,
  `.arc/system/.internal/skills/arc-inbox/SKILL.md`,
  `packages/arc-framework/src/handlers/sync.ts`, `packages/arc-framework/src/handlers/user-sync.ts`.
