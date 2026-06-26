# Draft: Finalize Parallelism

- **Cohort:** agile-parallelism
- **Origin:** [internal]
- **Purpose:** Own the end-to-end verification and GA gate for ARC's parallelism story — worktree-by-default,
  multiple in-flight work units + errands, and cross-machine resume — delivered across ~6+ work units in two
  cohorts that each ship and integrate independently. Shipping all members is not the same as a
  verified-watertight-end-to-end system; this is the cohort closeout that proves the seams between independently
  shipped members and blesses the worktree-by-default flip for general use.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Worktree dependency provisioning — always-invoked post-create setup command**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: finalize-parallelism`), housekeep drain (2026-06-17); captured
  during the `unit-scoped-review` planning errand (2026-06-15).
- *Concern:* `arc start` create-new and the worktree-spawn primitives create a worktree but don't provision
  dependencies. `node_modules` is gitignored, so a fresh worktree has none; git / shell hooks survive, but every
  node-backed quality gate fails there (`typecheck` / `test` / `build` / `lint:ts` / `lint:md`). A doc-only WU in a
  worktree is fine; a code WU is non-functional for its mandatory per-task quality-gate checkpoint until deps are
  provisioned. Confirmed live 2026-06-15 (`markdownlint-cli2: Permission denied` in a worktree). Un-exercised to
  date — no parallel code WU has actually run in a worktree yet.
- *Proposed:* an **always-invoked** post-worktree-create setup command (e.g. `worktree.post_create`) the scaffold
  runs on every worktree create — not optional, not a doc-only note. Sane default when unconfigured: emit a
  help / notice (deps must be provisioned), not a silent no-op. The project supplies its command (`npm install`
  here). Coordinate with the verify-and-configure workflow so it's configured as an agent-led part of initial ARC
  setup. ARC owns the seam + invocation point + default; the command stays project-specific.
- *Alt home:* the worktree-scaffold owner, if preferred over the parallelism closeout.

### `[ ]` **Mirror the in-place (`--here`) opt-out onto Materialize for cross-machine WU pickup**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: finalize-parallelism`), housekeep drain (2026-06-17); captured
  during `lifecycle-transition-core` Task 6.4 design discussion (2026-06-15).
- *Concern:* `lifecycle-transition-core` adds a `--here` in-place opt-out to the begin-work transitions
  (`graduate` / `resume`) so a stub can graduate or a parked WU resume in the current checkout without spawning a
  worktree. **Materialize** — cross-machine pickup of a remote-only in-flight WU — is the cross-machine twin of the
  same spawn-vs-in-place question, and is currently **spawn-only** (`git worktree add origin/<branch>`). A
  single-checkout / heavy-toolchain dev picking up a remote WU on a second machine hits the same worktree +
  dependency-provisioning tax the in-place hatch relieves locally.
- *Proposed:* mirror the opt-out — an in-place Materialize (`git fetch` + checkout the remote WU branch in the
  current checkout, honoring the worktree-occupancy guard) alongside the default spawn. Locus-only, exactly like
  the local hatch: coherence still rests on the pushed branch + notes-sync. Reuse the hatch's no-spawn
  reconcile-branch legs where applicable.
- *Home note:* `in-flight-awareness` shipped Materialize but is itself shipped; landed here at drain (alt:
  `cross-machine-coherence`).

### `[ ]` **Wire a behind-base reconcile gate into `integrate-work-unit`**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: finalize-parallelism`), housekeep drain (2026-06-18);
  captured during `planning-pipeline-readiness` verification (Task 6.1) — surfaced live on
  `feat/planning-pipeline-readiness` (2 behind `main`, overlapping `.arc/backlog/ROADMAP.md`).
- *Concern:* `integrate-work-unit.md` has no in-ceremony behind-base check — it never detects that the WU branch
  is behind `origin/<base>` nor prompts to reconcile (merge the base in) before the Step 12 merge. The
  merge-safety cluster all shipped (`merge-safety-mechanism`'s base-distance primitive + session-init probe slot;
  `concurrent-work-doctrine`'s behind-base-at-integration / first-in-wins reconcile convention;
  `async-merge-lifecycle`), but the primitive's only reuse was the between-WU completion sweep (the
  `mergeable but behindBase` awareness classification) — never wired as an in-ceremony gate in the active
  integration flow. So a solo integrator running the workflow start-to-finish gets no reconcile prompt; they hit
  it only at GitHub merge-time (conflict) or by recalling the doctrine independently. Touches a load-bearing
  lifecycle workflow (`.arc/system/**`) — infra smell; sized small (one workflow step), but the holistic home is
  this WU's end-to-end seam audit.
- *Proposed:* add one step to `integrate-work-unit.md` (entry pre-condition, or pre-merge before Step 12) —
  compute `origin/<base>` distance (reuse the shipped base-distance primitive, or plain `git rev-list --count`);
  if behind, surface + prompt reconcile (merge the base in, append-only per the doctrine) before the merge. No
  new code or design — the primitive and the reconcile doctrine both shipped; this is pure wiring. *Micro-fork to
  settle at authoring:* placement (entry vs. pre-merge) and strength (advisory surface vs. hard interlock).

### `[ ]` **Give the stale-worktree sweep a base-ref-backed shipped index**

- *Routed from:* `USER-INBOX § Errand`, housekeep drain (2026-06-26); captured during
  `stale-state-detect-and-pull` Task 3.2 (D4) design — the index-refresh fork that scoped the base-ref read to
  the retired-subdir path.
- *Concern:* `runStaleWorktreeSweep` (`lib/session-init/stale-worktree-sweep.ts`) resolves the shipped-WU set via
  `readShippedWorkUnits` (`lib/work-unit/completed-index.ts`), which scans the **working-tree** `.arc/completed/`.
  When the primary worktree sits on a feature branch — the current `arc start --here` default until this WU flips
  worktree-by-default — its `completed/` lags `origin/main`, so the sweep can under-detect a lingering worktree
  whose WU has already shipped (the same staleness D4 fixed for retired subdirs).
- *Proposed:* mirror the D4 fix onto the sweep — give it the same base-ref-backed shipped read (`completed/`
  resolved from `<base>`, freshened by the session-init base-ref ff) so it resolves correctly regardless of the
  primary worktree's branch. D4 added that base-ref read for the retired-subdir path only, deliberately leaving
  the sweep on its working-tree read to stay in scope. Files: `lib/session-init/stale-worktree-sweep.ts`,
  `lib/work-unit/completed-index.ts`.

---

## Problem / Motivation

Parallelism is delivered piecemeal: worktree-default, multi-in-flight WUs/errands, and cross-machine coherence
span the `concurrent-work-conventions` and `cross-machine-coherence` cohorts plus `out-of-wu-entry`, each landing
on its own schedule. Seams *between* those members will otherwise only surface in actual multi-WU practice — the
friction-after-the-fact this closeout exists to pre-empt. Nothing today owns the end-to-end verification or a
GA-readiness checklist; per-cohort closeout criteria are narrower than the cross-cohort whole.

## Scope (audit + verify + flip + gate — NOT a redesign catch-all)

- **End-to-end trace-through** of every parallelism path — start/discovery → `init-work-unit` (worktree spawn) →
  planning → execution → integration / merge / completion → cross-machine resume — hunting seams *between* the
  independently shipped members. Known seam suspects:
    - the three-remover `USER-INBOX`-line reconciliation (`run-errand` § Complete, same-session finalize,
      session-init errand sweep);
    - the projection-builder consumer contract between `async-merge-lifecycle` and `cross-machine-sync-coherence`;
    - base-drift across worktrees;
    - errand-vs-WU teardown symmetry.
- **Verify the worktree-default flip in real practice** — `async-merge-lifecycle` *lands* it (create-new
  `arc start` + `init-work-unit` default); this WU *exercises* it across genuinely concurrent WUs.
- **Own the parallelism GA-readiness checklist** — the single enumeration of what-must-be-true for
  worktree-by-default + multi-in-flight to be blessed. Exists nowhere today.

## Resolution model for discovered seams

This WU **gates** completion, so it cannot route a fix back to an already-shipped owning WU. For each seam found:

- **Absorb-if-relatively-atomic** into this WU's own spec / task list as a general "resolve discovered seams"
  phase; **else**
- **Spawn a direct follow-up WU draft** as an explicit dependency.

(Hope it isn't needed; plan for it.)

## Dependencies

Explicit — it is the closeout:

- `concurrent-work-conventions` members: `concurrent-work-doctrine` (shipped), `merge-safety-mechanism` (shipped),
  `async-merge-lifecycle`, `single-owner-wu-model`.
- `cross-machine-coherence` members: `partial-push-marker`, `stale-state-detect-and-pull` (decomposed from
  `cross-machine-sync-coherence` 2026-06-25; `coord-probe` relocated standalone as the external-coord
  enhancement and dropped from this gate).
- `state-ref-write-safety` — the single-machine state-ref CAS (shed from the cross-machine WU at decomposition).
- `out-of-wu-entry`.
- The worktree-default flip (within `async-merge-lifecycle`'s scope).

Natural **agile-parallelism cohort closeout** — the cohort archives on its ship.

## Scope Estimate

Large (week+) — broad cross-cohort surface; size firms up once the member set has substantially shipped and the
real seam count is visible.
