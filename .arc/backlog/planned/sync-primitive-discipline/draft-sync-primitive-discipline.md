# Draft: sync-primitive-discipline

- **Origin:** [internal] — `USER-INBOX § Errand`, housekeep drain (2026-07-01); captured between-WUs after
  distinguishing notes-only sync from top-level sync orchestration.
- **Purpose:** Codify when each user-state sync primitive is the right one, and align workflow/skill prose to
  that contract, so hand-rolled `save` + `push` sequences never bypass the coherence gates `arc sync` owns —
  and never add remote side effects at note-reanchor-only sites.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Entry-aware union at push reconcile — resolve the same-commit notes wedge**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: sync-primitive-discipline`), housekeep drain (2026-07-18);
  captured at FP wave-3 cell 5.2.b (deferred behind wave 4, surfaced at the Phase 7 pre-handoff audit,
  2026-07-17).
- _Concern:_ two machines saving divergent notes onto the **same** base commit — routine when both drain at the
  same `main` tip — cannot converge through any sanctioned verb. The push auto-reconcile unions manifests
  per-file and refuses on any same-path divergence (misreported as "the union produced an unparseable note"; the
  manifests parse fine), `arc user pull` refuses diverged refs, and `arc sync`'s paired push hits the same wall.
  The only exit is `arc user push --force` — destructive and contagious (the overwrite makes the other machine
  diverge in turn). No data loss, but a hard stuck state with no clean recovery. Root cause: the entry-aware
  `mergeCrossWuFile` machinery (union + tombstones + recency) that resolves exactly this divergence sits on the
  **load** path but is never consulted by the **push reconcile** (`mergeManifestContent`,
  `lib/user-sync/compaction.ts`), which does a structural manifest union and gives up on a per-file content
  collision rather than delegating to the entry-aware merge.
- _Fold-in:_ route the push-reconcile per-file collision through `mergeCrossWuFile` (entry-union + tombstones +
  the deterministic tie-break the `operational-state-docs` same-entry capture defines) instead of refusing. This
  is the structural half; Task 7.5 - `tasks-finalize-parallelism.md` is the guidance/messaging half; the three
  together harden notes merge. Files: `lib/user-sync/compaction.ts` (`mergeManifestContent`),
  `lib/user-sync/merge.ts` (`mergeCrossWuFile`). Weigh timing against `arc-backend` at grooming (git-notes is
  keep-the-lights-on).

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
