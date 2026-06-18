# Spec (`detailed` · `RFC`): lifecycle-mechanics-tail

- **Origin:** [internal] — `lifecycle-state-machine` cohort companion.

- **Purpose:** Give the judgment-free deterministic lifecycle mechanics still hand-run in workflow markdown — the
  post-merge teardown tail, the `arc archive` finalize-fact write, the meta-shape and planning-field writes, the
  errand create/close legs — a single CLI-owned home, extending the shipped `lifecycle-transition-core` executor
  and mutator bundle. The second deliberate migration increment toward the north star where deterministic
  transition mechanics live in the CLI and workflows shrink to the judgment that decides whether/when to fire them.

---

## Introduction / Context

The work-unit lifecycle is still ~90% markdown ceremony. `lifecycle-transition-core` (shipped) took the first
real migration step — a hand-rolled declarative transition table as code, a thin imperative executor, and a 1↔1
mutator bundle (`relocate-artifacts` / `reconcile-branch` / `reconcile-worktree` / `set-phase`) over a logical
`(phase, location)` state model. By design it stopped at B1, leaving a tail of deterministic, no-judgment
mechanics still executed by hand in workflow markdown — the carry-and-skip prose and "do this by hand" tails.

A full audit (planning step one, complete — the lifecycle + adjacent workflow corpus swept by parallel readers,
reconciled against already-captured cross-cohort fragments, then forward-compat-checked against
operational-state-docs / arc-backend / principle-anchored-core) produced the inventory this spec formalizes.
Three recurring live pains anchor it:

- **The post-merge teardown's branch-delete is merge-strategy-fragile.** The shipped inline cleanup uses
  `git branch -d` (reachability-from-base), which false-negatives under squash/rebase merges — so the merged
  in-place branch lingers with no backstop. Hand-run today in three sites (`integrate-work-unit` Step 13, the
  `session-handoff` finalize pass, `decompose-work-unit`'s park-exit).
- **The archive finalize block is hand-added every ship.** `arc archive` flips State, clears Branch, resets soft
  fields, and relocates — but the `PR URL` + `Completed` facts that `template-meta.md` mandates post-integration
  are still appended by hand.
- **`template-meta.md` drifts from the code field model.** The markdown template and the `renderMetaFile` /
  `META_FIELDS` renderer are a dual source of truth for meta shape; the template has already drifted (it lacked the
  `Current Workflow` bullet `META_FIELDS` carries), and a stub minted before a field was added graduates missing it.

The scope thesis (the in/out boundary): this WU owns the **judgment-free deterministic-mechanic** migration on the
lifecycle/transition CLI surface, and only that. A mechanic whose firing needs a human/agent decision stays in its
workflow; a gap that is really a *different domain* (a render engine, a prompting substrate, commit grammar) stays
with its owner. That boundary is the coherence guarantee, not an arbitrary cut.

## Goals

- Give each inventoried judgment-free lifecycle mechanic exactly one CLI-owned home, and remove its hand-run tail
  from the workflow markdown.
- Harden the post-merge teardown safety model to be **merge-strategy-independent** — fix the squash/rebase
  lingering-branch bug — by gating on arc-state authority + push-state durability rather than git reachability.
- Establish the archive finalize facts (`PR URL`, `Completed`) as managed meta **fields**, eliminating the
  recurring hand-added prose block.
- Make code the single source of truth for meta shape (retire `template-meta.md`; heal already-existing metas at the
  graduate edge).
- Build every state-write through the field/record seam so the v1 lifts onto the future OSD record substrate
  without reshape.

## Non-Goals

- **ROADMAP rendering** — owned by `roadmap-tooling`. This surface only emits the derived-state predicates + the
  Parked render bucket RT consumes; extracting the render would be building a renderer (a different foundational
  domain).
- **The decompose batch member-stub cohort scaffold** (scaffold N member dirs + inherit `Origin` / set `Design` +
  `State` / dual-place `Cohort`) — owned by `decompose-matrix`. Only the *single* `arc stub --cohort` is here.
- **`activate` / `deactivate` remote-branch rename legs** (`git push -u` / `git push origin --delete`) and any
  push-from-executor — defer to the push-policy seam (`push-interlock` / `cli-substrate-adoption`).
- **decompose cohort-doc generation** (mint / backfill `cohort-*.md`) — judgment-laden; the structural invariant is
  already commit-guarded by shipped `validate-cohort-consistency`.
- **atomic-inbox completion-order reorder** — owned by `shared-inbox-housekeep` (inbox/housekeep domain).
- **Workspace seed + `arc user open` non-TTY hang** — owned by `cli-substrate-adoption` (the prompting substrate).
- **`arc errand close` (the command) and the durable errand-identity record** — owned by `errand-lattice`. This WU
  exposes the *shared teardown legs* and the create/inbox mechanics it consumes; the close *decision* and the
  identity record stay there.
- **GitHub PR-URL auto-inference** — the v1 verb is platform-light; inference layers on later from the integration
  ceremony.
- **Any build on the OSD record substrate itself** — design-toward only; the substrate is `operational-state-docs`'.

## Proposed Design

The enumerable substrate the task list is built from and validated against. Eleven components on one coherent
surface (the executor / mutator / verb / `META_FIELDS` surface this WU extends). Each is judgment-free and
deterministic; the workflow that fires it keeps the judgment of *whether/when*.

### 1. `arc teardown` — the post-merge physical-cleanup verb

The core deliverable. A CLI verb that performs the deterministic post-merge cleanup currently hand-run in three
sites: reap the merged branch + remove the worktree (worktree-kind dispatched, presence-guarded) + prune the stale
remote-tracking ref. It composes `lifecycle-transition-core`'s executor legs: the existing
`reconcile-worktree:teardown` leg, the **new merged-safe branch-delete variant** (§ 2), and a **new
`git fetch --prune` leg**.

Teardown is **not** a state transition — by the cohort's `(phase, location)` model, the branch and worktree are
*projections*, not lifecycle state (git is barred from lifecycle-state resolution). The verb fires *after* merge,
distinct from `arc archive`, which runs pre-merge as the mergeable sweep riding the ship PR (boundary settled in
`lifecycle-transition-core`: archive preserves no physical teardown — deleting the branch closes the open PR, so
teardown is non-mergeable and runs after merge).

**Timing preserved from `async-merge-lifecycle` (shipped):** eager-in-ceremony + lazy sweep/finalize backstop,
symmetric across the primary (in-place) and linked (spawned) worktree arms.

**Safety gate (the settled model — see § Alternatives).** A branch + worktree may be torn down when **both** clear:

1. **Arc-state authority** — the WU's meta resides in `completed/` (the `archive` transition has run; the WU is
   shipped as a lifecycle fact). Resolved from location, never from `git branch` / `git log` inference.
2. **Push-state durability safety** — every local commit on the branch is contained in its remote-tracking ref
   (the branch is not ahead of `origin/<branch>`). A pure git-ref data-loss check, distinct from lifecycle-state
   resolution, and **merge-strategy-independent** — unlike `git branch -d`'s reachability-from-base test, which
   false-negatives under squash/rebase.

On both clear, delete the branch, remove the worktree (bare `git worktree remove` — clean-checked, no `--force`),
and `git fetch --prune`.

**Merged-safe only — call sites scoped to the two WU-lifecycle ceremonies this WU owns** (`integrate-work-unit`
Step 13 + the `session-handoff` finalize pass). The `decompose` park-exit is a *different* safety profile — a
never-activated planning branch intentionally discarded, served by the already-shipped force-delete path
(`reconcile-branch:delete` (`-D`)) — and its call site lives in `decompose-work-unit.md`, which `decompose-matrix`
(sibling) rewrites wholesale. So this WU builds no `--force` mode (no in-WU caller) and does not edit
`decompose-work-unit.md`; `decompose-matrix` owns migrating its park-exit teardown (consuming the shared legs in
§ 2). This avoids two in-flight WUs editing one file.

### 2. Shared teardown legs + the merged-safe `reconcile-branch` variant

Factor the teardown legs as reusable executor mutators so both `arc teardown` (this WU) and the future
`arc errand close` (`errand-lattice`) compose them — **one verb's worth of mechanics, owned here**; the errand
close *decision* stays with `errand-lattice`. New/extended legs:

- A **merged-safe branch-delete variant** on `reconcile-branch`, distinct from the existing force
  `reconcile-branch:delete` (`-D`) that park/abandon use. It enacts the § 1 push-state gate.
- The **`git fetch --prune` leg** for the stale remote-tracking ref left by delete-on-merge.

### 3. `arc integrate` — the Active → Integrating phase-entry command

Bind the existing `integrate` transition verb (already in the table: `ACTIVE → INTEGRATING`, inverse `reopen`,
fires the render + user-workspace side-effects, soft-field dispositions — only the command binding is missing).
A bare transition verb in the established register, restoring symmetry with the shipped `arc reopen` (its inverse).

**Naming constraint:** the command marks *phase entry*, not the merge (the integration-interlock owns merge
approval). The description must be phase-explicit — e.g. *"Mark a work unit Active → Integrating (enters review);
does not perform the merge."* — exactly as `arc reopen` disambiguates its own effect. The final verb register
coordinates with `idiomatic-alignment` (rename later if it dictates; not a blocker). Replaces the hand-edited State
flip + ROADMAP regen in `integrate-work-unit`.

### 4. `arc archive --pr-url --completed` — archive finalize-fact flags

Teach `arc archive` (which already owns the final archive meta mutation) to accept the remaining final-form facts
and write them as meta **fields**, plus the forward-field reconcile:

- Add `PR URL` and `Completed` to `META_FIELDS` (new entries; storage-agnostic — no per-artifact tracking boolean,
  no "lives in the tracked tree" assumption). Modeled as fields, **not** a free-floating appended prose block
  (ADR-022 §4: meta-`*` fields are the home, no separate completion/status document).
- `--pr-url <url>` and `--completed <YYYY-MM-DD>` (default today, overrideable for resume/backfill). Platform-light
  and explicit first: `--pr-url` optional → omit / placeholder + warn when absent, so backfill and offline work.
- Pull the finalize-**write** half from `interlock-release-refinement` (its approval-collapse stays there).
  Coordinate the shared `archive-work-unit.md` surface with `scalable-core`'s `archive.preserve` work.

### 5. Meta-shape mechanics cluster

Two complementary deterministic gaps on the meta-shape surface, both on the executor surface this WU extends:

- **5a. Graduate forward-reconcile against the code field model.** Teach the graduate transition to reconcile the
  relocated `active/` meta against `META_FIELDS`, backfilling any missing field with its **transition-appropriate**
  value (e.g. `Current Workflow` on a planning-entry graduate is `draft-design`, which `applyCurrentWorkflowField`
  already knows — not the template's `[none]`). **Posture: warn-and-backfill** — emit a one-line "backfilled N
  field(s)" notice; silently migrating a tracked doc's shape should be visible in ceremony output. (Not
  silent-backfill; not a meta-shape lint, which is heavier than this WU needs and coordinates with
  `quality-gate-hooks`.)
- **5b. Retire `template-meta.md` as a scaffold source.** Route `init-work-unit` Path B and the Promote-Errand meta
  creation through `renderMetaFile` (the CLI already scaffolds every fresh-WU entry through it), then delete
  `template-meta.md` (both copies — `.arc/` and the package source). OSD-aligned: a managed doc's shape lives in
  code. Retirement stops *newly minted* stubs from drifting; 5a heals *already-existing* metas at the graduate edge.

### 6. Planning-stage meta-field writes — `Class` / `Task List` / `Next Action`

Migrate the deterministic planning-stage meta writes that shipped `planning-pipeline-readiness` (PPR) left as
hand-fills, the tail-cleanup of what PPR shipped (same pattern as `async-merge-lifecycle`). PPR wrote the *pointer*
fields (`Current Workflow` / `Design` / the begin-sentinel); this WU adds:

- **`Task List`** — a pure filename derivation (`tasks-<name>.md`); clean migrate.
- **`Class`** — the resolved value, written at the create-spec / generate-tasks finalize fire-points.
- The fixed terminal **`Next Action`** strings at create-spec / generate-tasks / verify-work-unit finalize.

All three route through the existing in-place field writers — `Class` through `setMetaCoreFields` (a core-table
field, re-rendering the three table rows so column alignment stays canonical by construction), `Task List` and
`Next Action` through `setMetaBulletFields`. No new alignment handling and no shipped lint preference: core-table
alignment is content-derived (`max(header, cell)` width), the single canonical MD060-passing form. This *is* the
forward-compat field/record-seam write — never raw whole-file string-poking.

### 7. USER-INBOX slug-matched line removal

The write-side complement to errand completion: drop the originating `USER-INBOX` entry on errand completion
(hand-run today in `run-errand` Complete, `drain-inbox`, the `session-handoff` finalize pass — readers exist, no
writer). **Idempotent** (no-op when absent), **targeted** (a single entry, not a whole-file rewrite — so it maps to
the future inbox-as-event-log drain *event*), title-keyed in v1 (forward-compat to OSD's `_Slug:_`; OSD owns the
field, "slug-matched" is the intent, the interim match key is the entry title).

### 8. Errand `chore/<slug>` branch-cut at Launch

The create-side counterpart to the teardown/close leg: cut the `chore/<slug>` branch off `branch.base` at errand
Launch (hand-run today in `run-errand` Launch, `session-init` errand cold-entry, `drain-inbox`). The slug is the
logical identity; `chore/<slug>` is the projection — the cut consumes the slug and never recovers identity by
parsing the branch (the durable errand-identity record is `errand-lattice`'s).

### 9. `arc stub --cohort <slug>`

Add a `--cohort` affordance to the shipped `arc stub` verb: place the new member dir under the cohort tree
(`backlog/planned/<cohort>/<name>/`) and write the `Cohort` field, under the same collision/validation guards the
stub contract already runs. **Single member only** — the batch-into-cohort-tree scaffold is `decompose-matrix`'s.

### 10. `arc start --here` protected-base auto-cut (candidate J)

Upgrade `runColdStart`'s bare refusal on a protected base under `branch.protection: full` ("cannot cold-start onto
protected base … switch to a feature branch") into a guided **auto-cut / offer of `plan/<name>`** — the hand
`git checkout -b` workaround made into the on-label path. (`cold-start-init-polish` facet 2; verified live against
current code 2026-06-18.)

### 11. Executor-hardening rider

Guard the post-side-effect meta writes — `applyBranchField` / `applyCurrentWorkflowField` / `applySoftFields` and
the step-8.5 `stageMeta` — which today run *outside* the leg try/catch, so a throw escapes as an unhandled error
after a partial transition. Wrap them and report a **status distinct from the pre-side-effect `encoding-failed`**:
the recovery differs (pre = nothing fired, retry the whole transition; post = side-effects landed, forward-only
finish-the-write), so a shared status would erase exactly the distinction a recovery handler needs. The new status
carries the applied-side-effect context. Executor-infra robustness on the surface the teardown verb extends — not a
markdown-mechanic migration, but it rides the same code surface.

> **Small rider:** the relocate leg `rmdir`s the emptied cohort-parent subdir on the graduate-to-`active/` leg
> specifically (`promote` / `resume` already prune their own; this is the relocate-mutator gap — local-cosmetic,
> git doesn't track empty dirs, but the same deterministic-placement class). Folds into the § 5 / mutator work.

## Alternatives & Rationale

- **Teardown safety: arc-state + push-state vs. git reachability.** The shipped inline teardown delegates safety to
  `git branch -d` (delete only if merged-reachable from base). Under squash/rebase merges the merged commits are
  *not* reachable as-is, so the check false-negatives and the branch lingers. **Chosen:** authorize on arc-state
  (`completed/`-presence — the lifecycle fact) and protect data with a push-state durability check (tip contained
  in upstream). This is the exact storage-agnostic pattern the OSD model prescribes, and it is merge-strategy
  independent. Reachability inference is the model's named anti-pattern. (push-state is a git-ref data-loss check,
  not lifecycle-state resolution — the one thing barred from git.)
- **One teardown verb vs. two (WU + errand).** Errand-close and WU-post-merge-teardown share the
  `reconcile-worktree:teardown` + merged-safe branch-delete legs and differ only in their judgment shell.
  **Chosen:** one shared set of legs, owned here; `errand-lattice` composes them under its own close decision.
  Building two parallel implementations was the real de-dup risk the audit was charged to settle.
- **Distinct executor status vs. reuse `encoding-failed`.** **Chosen:** a distinct post-side-effect status. The
  pre- and post-side-effect failures need different recovery (retry-whole vs. forward-only finish); collapsing them
  into one status erases the signal a recovery handler reads.
- **Archive finalize as `META_FIELDS` vs. a free-floating prose block.** The template currently mandates an
  appended `PR URL` / `Completed` block. **Chosen:** model them as managed fields. A prose block would not lift onto
  the OSD record substrate (ADR-022 §4: no separate completion/status document — that content is `meta-*` fields).
- **`arc integrate` (transition verb) vs. `set-integrating` (pointer-setter naming).** The CLI vocabulary splits
  cleanly: bare-imperative *transition verbs* (`activate`/`deactivate`, `reopen`, `archive`) vs. `set-*`/`repoint-*`
  *pointer-field setters* (one field, no transition, no inverse, no side-effects). Active → Integrating is a real
  transition (table edge, inverse, side-effects). **Chosen:** `arc integrate` — naming it `set-integrating` would
  mis-shape a transition as a field-setter and break the encoded `reopen ⊥ integrate` symmetry. The merge-implication
  worry is handled in the description, as `reopen` already does.
- **Claim planning-field-writes here vs. a PPR follow-on.** **Chosen:** here — tail-cleanup of what PPR
  shipped-but-left, on the same executor/meta surface, keeping the "no hand-fill at finalize" success signal whole.
- **Retire `template-meta.md` vs. keep the dual source.** **Chosen:** retire — a dual source of truth for meta shape
  drifts (already demonstrated). Single source in code (`renderMetaFile` over `META_FIELDS`).
- **CLI verb vs. a `composable-workflows` markdown fragment for teardown.** **Chosen:** CLI verb — a deterministic
  mechanic belongs in code per the north star. The fragment/visibility model stays `composable-workflows`'; its
  parked teardown "Option 1b" inbox item is superseded when this verb lands (so the two don't double-claim).

## Cross-cutting Considerations

**Testing.** Each verb/leg gets unit + integration + e2e coverage per the tiers. The teardown safety gate is the
priority surface: prove it is merge-strategy-independent by exercising squash, rebase, and merge-commit ship paths
(the bug it fixes lives precisely in squash/rebase). Cover `--pr-url`-absent backfill, the warn-and-backfill notice,
and the executor distinct-status on a forced post-side-effect failure.

**Migration / rollout.** Backward-compatible throughout. The new teardown gate is a strict improvement over the
squash/rebase-fragile `git branch -d` (corrects a false-negative). New `META_FIELDS` and field-writes are additive.
`template-meta.md` deletion is forward-only and self-contained. No adopter migration — these are dev-time lifecycle
operations; adopters receive the improved CLI on `arc update`.

**Forward-compat (design-toward constraints, from the audit's forward-compat check).** No mechanic is superseded —
these are how-to-build constraints so the v1 re-homes onto the future substrate without reshape:

- Every meta / inbox state-write goes through the field-model write path (`META_FIELDS` / `renderMetaFile` for meta;
  a targeted inbox-write for `USER-INBOX`) — never raw whole-file string-poking. This is the OSD lift-without-reshape
  contract and leaves the seam where arc-backend's version-checked writes slot in later.
- New `META_FIELDS` stay storage-agnostic (no per-artifact tracking booleans; no tracked-tree assumption).
- Teardown authorizes on location + meta fields, never `git branch` / `git log` inference (arc-backend design guard).
- Errand identity is the slug; `chore/<slug>` is the projection; never recover identity by parsing the branch.

**Coordination / seams** (pointers, not scope — repoint during execution, never duplicate):

- `errand-lattice` — consumes the teardown legs + the `chore/` branch-cut; build anticipating `arc errand close` as
  a caller. Errand-identity record is its own.
- `planning-pipeline-readiness` (shipped) — the `Class` / `Task List` / terminal-`Next Action` writes sit on its
  stage-pointer surface; confirm the here-vs-PPR cut holds at task time.
- `composable-workflows` — supersede its parked teardown "Option 1b" inbox item when the verb lands.
- `scalable-core` — coordinate the shared `archive-work-unit.md` surface (`archive.preserve`) so they don't collide.
- `decompose-matrix` — single `arc stub --cohort` here; the batch-into-cohort-tree scaffold is its. It also owns
  migrating the `decompose` park-exit teardown call site (it rewrites `decompose-work-unit.md`), consuming this WU's
  shared legs (§ 2) — so this WU does not touch that file.
- `idiomatic-alignment` — the `arc integrate` / `arc teardown` names + final verb register coordinate with it.
- `interlock-release-refinement` — the archive finalize-write half is pulled here; its approval-collapse stays.
- `roadmap-tooling` — receives the derived-state predicates / Parked bucket this surface emits.
- `coord-probe` — its stale-local-branch reaper coordinates with the teardown surface (consumer edge, not owner).
- `async-merge-lifecycle` (shipped) — the migration source: its inline `integrate-work-unit` Step 13 teardown is
  what this verb factors to the CLI, timing preserved, safety model hardened.

**User-facing impact.** New CLI verbs/flags (`arc integrate`, `arc teardown`, `arc archive --pr-url --completed`,
`arc stub --cohort`) and the improved `arc start --here`. The lifecycle workflows shrink — the hand-run tails are
removed and replaced by single command invocations the developer (or the ceremony) fires.

## Success Criteria

Validated at completion by running each lifecycle ceremony end to end:

1. The post-merge teardown fires via `arc teardown` from the `integrate-work-unit` and `session-handoff` ceremonies;
   the safety gate authorizes and protects correctly across squash, rebase, and merge-commit ship paths — no merged
   branch lingers (the squash/rebase bug is gone). (The `decompose` park-exit teardown is `decompose-matrix`'s to
   migrate.)
2. `arc archive --pr-url --completed` writes `PR URL` + `Completed` as `META_FIELDS` and forward-reconciles in one
   call; no hand-added block remains in `archive-work-unit.md`.
3. `arc integrate` performs the Active → Integrating flip + ROADMAP regen; `integrate-work-unit` no longer hand-edits
   `State`.
4. A graduated meta carries every `META_FIELDS` field (warn-and-backfill notice emitted); `template-meta.md` is
   deleted (both copies) and no scaffold path references it.
5. `Class` / `Task List` / `Next Action` are written by code at the finalize fire-points — no hand-fill — with
   core-table alignment intact.
6. `USER-INBOX` slug-matched removal and the errand `chore/<slug>` branch-cut fire from code, not workflow markdown.
7. `arc stub --cohort` places the dir + writes the field under the stub guards; `arc start --here` auto-cuts /
   offers `plan/<name>` on a protected base instead of bare-refusing.
8. The executor reports the distinct post-side-effect status on a forced post-side-effect failure (covered by test).
9. **Falsifiable sweep:** no "set by hand" / "hand-add" / carry-and-skip teardown tail remains in the lifecycle
   ceremonies this WU owns (`integrate-work-unit`, `session-handoff`, `archive-work-unit`, the create-spec /
   generate-tasks / verify finalize fire-points, `run-errand`, `drain-inbox`). The `decompose-work-unit` park-exit
   tail is out — `decompose-matrix`'s to retire via the shared verb.

## Open Questions

Genuine implementation-detail residue — resolved during the work, not deferred as debt. None is a
settle-before-starting design blocker (the safety *model*, the merged-safe-only call-site scope, the one-verb call,
the distinct-status call, the inference-out boundary, and `Class`/decompose are all settled upstream or in
Non-Goals):

- **Push-state durability check — exact shape.** The model is settled (tip contained in upstream); the precise git
  invocation (e.g. `git rev-list <branch> ^origin/<branch>` empty) and the no-upstream / unpushed-branch handling
  resolve at implementation.
- **Executor distinct-status — name + payload shape.** The distinct-status *call* is settled; the identifier and the
  applied-side-effect payload fields resolve at implementation.

**Settled-enough to build (not open for this WU), recorded as known downstream coordination:** the `arc integrate` /
`arc teardown` verb names are stable working names — build against them; the eventual register reconciliation is
`idiomatic-alignment`'s (a rename, not a blocker), tracked in § Coordination.
