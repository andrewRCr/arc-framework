# Task List: lifecycle-mechanics-tail

- **Design:** `spec-lifecycle-mechanics-tail.md`

---

## **Phase 1:** Executor hardening & shared teardown legs

_Purpose:_ Land the executor/mutator infrastructure the teardown verb composes — the distinct
post-side-effect failure status and the two reusable teardown legs — before any verb consumes them.
Foundation-first: pure infra on the shipped executor/mutator surface, no new verb yet.

_Design decisions:_ The push-state durability gate lives **in** the merged-safe `reconcile-branch`
variant (the leg enacts it), distinct from lifecycle-state resolution; the arc-state authority gate
is the teardown verb's precondition (Phase 2). The settled safety model lives in the spec's Alternatives
& Rationale.

### `[x]` **1.1 Distinct post-side-effect executor status**

- _Goal:_ A failure in `executeTransition`'s post-side-effect write block reports a status distinct
  from `encoding-failed`, carrying which side-effects already landed — so a recovery handler can tell
  retry-whole (nothing fired) from forward-only finish-the-write (side-effects landed).

- _Outcome:_ Open Question resolved — new status `finalize-failed` (peer to `encoding-failed`) carrying
  `legsFired` + `sideEffectsFired` + `failedWrite: FinalizeWrite` (`"branchField" | "currentWorkflowField"
  | "softFields" | "stageMeta"`) + `message`. The step-7→8.5 writes in `lifecycle-executor.ts` are now a
  guarded block tracking the in-flight write; the pre-side-effect `encoding-failed` arm is unchanged. All
  verbs already map any non-`ok` outcome to a refusal via `outcome.message`, so the new variant surfaces
  with no consumer changes.

### `[x]` **1.2 Merged-safe `reconcile-branch` delete variant**

- _Goal:_ `reconcile-branch` offers a merged-safe delete that removes a branch only when its tip is
  contained in its upstream — a merge-strategy-independent data-loss guard, distinct from the force
  `-D` path park/abandon use.

- _Outcome:_ Open Question resolved — new `delete-merged` mutation on `ReconcileBranchOp`, a **local-only**
  delete (the work is preserved on the remote, so the remote ref is never touched). Containment proven via
  `git rev-parse --verify --quiet <remote>/<branch>` (no upstream → refuse) then `git rev-list <branch>
  ^<remote>/<branch>` (empty → contained → `git branch -D`; non-empty → ahead → refuse). Uses `-D` after
  its own containment proof because `-d`'s base-reachability check false-negatives under squash/rebase —
  the exact bug this guards. Edge wiring in the teardown verb lands in Phase 2.

### `[x]` **1.3 `git fetch --prune` teardown leg**

- _Goal:_ A `git fetch --prune` leg removes the stale `origin/<branch>` remote-tracking ref left behind
  after a delete-on-merge, so the pruned branch doesn't linger in the ref namespace.

- _Outcome:_ New `mutators/fetch-prune.ts` — a thin injected-`exec` leg running `git fetch --prune
  <remote>` (default `origin`), with no branching logic so its error policy is the composing verb's.
  No dedicated unit (integration-covered at the teardown verb, Task 2.1); composition into `arc teardown`
  lands in Phase 2.

## **Phase 2:** `arc teardown` verb & merge-strategy-independent post-merge cleanup

_Purpose:_ The headline deliverable — the CLI verb that performs the deterministic post-merge cleanup
hand-run today in two WU-lifecycle ceremonies, gated by the settled arc-state + push-state safety model
and composing the Phase-1 legs. Removes the hand-run teardown tails from those ceremonies.

_Design decisions:_ Merged-safe only — **no** `--force` mode (no in-WU caller) and this WU does **not**
edit `decompose-work-unit.md` (the park-exit teardown is `decompose-matrix`'s to migrate via the shared
legs). Call sites scoped to `integrate-work-unit` + `session-handoff`.

### `[x]` **2.1 `arc teardown` verb + arc-state authority gate**

- _Goal:_ `arc teardown <name>` reaps the merged branch, removes the worktree, and prunes the stale
  remote ref — but only when the WU is shipped (`completed/` presence) **and** the branch tip is durably
  pushed (the Task 1.2 gate) — across squash, rebase, and merge-commit ship paths.

- **Strategies:** strategy-work-organization.md, strategy-concurrent-work.md

    - `[x]` **2.1.a Arc-state authority gate**
        - Gates on `isShipped` (location-derived `completed/` presence), never `git branch` / `git log`.

    - `[x]` **2.1.b Compose the teardown legs with worktree-kind dispatch + presence guard**
        - Worktree teardown (linked arm only; in-place / absent is a presence-guarded no-op) → merged-safe
          branch delete → prune. Dirty linked worktree refuses (no `--force`).

    - `[x]` **2.1.c CLI registration + handler + end-to-end ship-path coverage**
        - `arc teardown [name]` in `cli.ts` + `handleTeardown`; integration coverage proves squash / rebase /
          merge-commit each leave no lingering branch; e2e smoke covers the CLI refusal surface.

- _Outcome:_ New `verbs/teardown.ts` + `handleTeardown` + `arc teardown` command. Teardown is not a
  transition, so it composes the legs directly. Two design points settled at implementation: (1) the branch
  is resolved by enumerating `refs/heads` and matching `branchToWorkUnitSlug` (type-prefix agnostic) — the
  meta `Branch` is `[none]` post-archive; (2) the constraint-correct leg order is **worktree teardown →
  branch delete → prune** (not the listed order): `-D` refuses a checked-out branch, and the merged-safe
  delete must read the _stale_ `origin/<branch>` tracking ref before prune removes it — so prune runs last.
  The handler's exec lets `opts.cwd` win (the cleanliness check targets the linked worktree, not the cwd),
  inverting the transition-executor's repo-root pin.

### `[x]` **2.2 Wire `arc teardown` into the integrate + handoff ceremonies**

- _Goal:_ `integrate-work-unit` Step 13 and the `session-handoff` Same-session finalize pass invoke
  `arc teardown` in place of the hand-run `git branch -d` cleanup — the carry-and-skip teardown prose is
  gone from both.

- _Outcome:_ Both ceremonies' WU teardown is now `arc teardown <wu-name>` (Step 13 loses its primary/linked
  `git branch -d` + `git worktree remove` bash; the finalize pass's WU candidate routes through the verb).
  **Errand handling diverges from the original Note:** `arc teardown` is WU-gated (`isShipped` / `completed/`
  presence) and errands carry no meta, so the finalize pass's `chore/<slug>` candidate keeps its hand-run
  teardown — errand teardown is `errand-lattice`'s `arc errand close` (confirmed owned in its draft). The
  shipped doc states the errand path neutrally (no forward-pointer, per the adopter audience boundary).
  Synced to both package copies (`integrate-work-unit.md` direct, `session-handoff.template.md`); no unit
  test (doc change, verified by the verification-phase sweep).

## **Phase 3:** Integration-tail commands — `arc integrate` & archive finalize facts

_Purpose:_ Bind the already-tabled `integrate` edge to a command, and teach `arc archive` to write the
final-form facts (`PR URL`, `Completed`) as managed fields. Both shrink the `integrate-work-unit` /
`archive-work-unit` ceremonies (the hand-edited State flip and the hand-added finalize block).

_Design decisions:_ The new `META_FIELDS` entries land **here**, before Phase 4's graduate
forward-reconcile audits a meta against the full field set. `arc integrate` is a transition verb (not a
`set-*` setter); its description marks phase entry, not the merge.

### `[x]` **3.1 `arc integrate` command binding**

- _Goal:_ `arc integrate [slug]` flips Active → Integrating through the executor (firing the edge's
  render + soft-field side-effects) so `integrate-work-unit` no longer hand-edits `State`.

    - `[x]` **3.1.a Thin `runIntegrate` verb + CLI/handler wiring**
        - `verbs/integrate.ts` dispatches `executeTransition` forwarding the `Last Completed` / `Next Action`
          input soft fields; `handlers/lifecycle.ts` `handleIntegrate` (refuses without `--last-completed` /
          `--action`); `cli.ts` `arc integrate [slug]`; `integrate` added to `dispatch.ts`
          `CONTEXT_DEFAULTING_VERBS` so a bare invocation defaults to the current WU.

    - `[x]` **3.1.b Replace the hand-edited State flip in `integrate-work-unit.md`**
        - The fresh-entry step invokes `arc integrate`; the manual State edit is gone. ROADMAP regen now rides
          the command's interim advisory (a one-line hand-render pointer) rather than standalone prose.

- _Outcome:_ `arc integrate` binds the pre-tabled `integrate` edge (inverse `reopen`) — verb + handler + CLI +
  dispatch registry — mirroring `reopen.ts`. The description is phase-explicit (marks review entry, not the
  merge). Both ceremony copies (`.arc/` + package source) delegate the State flip; the interim ROADMAP
  hand-render stays, now driven by the command's `reconcile-roadmap` advisory until `roadmap-tooling` ships.

### `[ ]` **3.2 `PR URL` / `Completed` `META_FIELDS` + `arc archive --pr-url --completed`**

- _Goal:_ `arc archive --pr-url <url> --completed <date>` writes `PR URL` and `Completed` as managed
  `META_FIELDS` and forward-reconciles in one call — eliminating the hand-added finalize prose block.

- _Context:_ New `META_FIELDS` entries are storage-agnostic (no per-artifact tracking boolean, no
  tracked-tree assumption); modeled as fields, not an appended block (ADR-022 §4). `--pr-url` optional =
  graceful placeholder + warn for backfill / offline / resume, **not** "never passed": the archive ceremony
  normally passes it (3.2.c is the trigger). `--completed` defaults to today — archive runs **pre-merge**
  (the mergeable sweep riding the ship PR), so the git merge timestamp isn't available at archive time and
  "today" (the ship day) is the correct default, overrideable only for backfill. The finalize-**write** half
  is pulled from `interlock-release-refinement` (its approval-collapse stays there); coordinate the
  `archive-work-unit.md` surface with `scalable-core`'s `archive.preserve`.

- **Strategies:** strategy-work-organization.md

    - `[ ]` **3.2.a Add `PR URL` / `Completed` to `META_FIELDS`**
        - `meta-reader.ts` `META_FIELDS` (group, `valueClass`, default); `renderMetaFile` /
          `parseMetaRecord` pick them up by construction.
        - Build `test-first` (one behavior at a time):
            - `renderMetaFile` emits both fields at their defaults; `parseMetaRecord` round-trips them

    - `[ ]` **3.2.b `--pr-url` / `--completed` flags + the field write**
        - Extend `ArchiveParams` / `runArchive`; write via the field-model seam (`setMetaBulletFields`),
          not a raw prose append; warn + placeholder on absent `--pr-url`; default `--completed` to the
          injected clock.
        - Build `test-first` (one behavior at a time):
            - Writes both fields as managed fields in one archive call
            - Absent `--pr-url` warns and writes a placeholder (backfill path)
            - `--completed` honors an explicit date and defaults to the injected clock otherwise

    - `[ ]` **3.2.c Pass `--pr-url` / `--completed` from the archive ceremony invocation**
        - `archive-work-unit.md` Step 2 (and the inline `with-integration` path from
          `integrate-work-unit.md`) invokes `arc archive … --pr-url <url>`, the agent sourcing `<url>` from
          the integration PR (created at `integrate-work-unit` Step 5; `gh pr view --json url` — no
          auto-inference in v1). `--completed` defaults to today. This invocation is the trigger; the
          hand-add it replaces was the `template-meta.md` field mandate, retired in Phase 4 (Task 4.2.b) — so
          no facts are hand-added anywhere.

## **Phase 4:** Meta-shape single source of truth

_Purpose:_ Make code the sole source of truth for meta shape — heal already-existing metas at the
graduate edge, retire the markdown template that drifts from the renderer, and close the relocate-leg
empty-dir gap. Eliminates the dual source of truth `template-meta.md` represents.

_Design decisions:_ Graduate reconcile is **warn-and-backfill** (visible one-line notice), not silent
and not a heavier meta-shape lint (which coordinates with `quality-gate-hooks`). Retirement stops newly
minted stubs from drifting; the graduate reconcile heals existing ones — the two halves are
complementary.

### `[ ]` **4.1 Graduate forward-reconcile against `META_FIELDS` (warn-and-backfill)**

- _Goal:_ The graduate transition reconciles the relocated `active/` meta against `META_FIELDS`,
  backfilling any missing field with its transition-appropriate value and emitting a one-line
  "backfilled N field(s)" notice in ceremony output.

- _Context:_ Transition-appropriate value, not the template default — e.g. `Current Workflow` on a
  planning-entry graduate is `draft-design` (which `applyCurrentWorkflowField` already knows), not
  `[none]`. Posture is warn-and-backfill: silently migrating a tracked doc's shape should be visible. The
  "graduate transition" is the `arc start` collision-dispatch arm (`init-work-unit` Step 3 / Step 4 Path A
  reconcile), not a standalone `graduate` verb — enacted via the executor's relocate + worktree-spawn legs.

    - Detect fields present in `META_FIELDS` but absent from the relocated meta; backfill via the
      field-model write seam; compose the count notice.

    - Build `test-first` (one behavior at a time):
        - A meta missing a field is backfilled with the transition-appropriate value
        - A complete meta is a no-op — no write, no notice
        - The notice reports the backfilled count

### `[ ]` **4.2 Retire `template-meta.md`; route scaffolds through `renderMetaFile`**

- _Goal:_ `init-work-unit` Path B and the Promote-Errand meta creation scaffold through `renderMetaFile`,
  and `template-meta.md` is deleted in both copies — code is the single source of meta shape.

    - `[ ]` **4.2.a Route Path B + Promote-Errand meta creation through `renderMetaFile`**
        - The CLI already scaffolds fresh-WU entries through `renderMetaFile`; converge these two paths.
        - Build `test-first` (one behavior at a time):
            - A Path B scaffold produces a `renderMetaFile`-shaped meta (every `META_FIELDS` field present)

    - `[ ]` **4.2.b Delete `template-meta.md` (both copies) + drop references**
        - Remove the `.arc/` copy and the package source; confirm no scaffold path references it.
          Forward-only and self-contained; covered by the falsifiable sweep (no dedicated test).

### `[ ]` **4.3 Relocate-leg `rmdir` of the emptied cohort-parent subdir**

- _Goal:_ The `relocate-artifacts` leg removes the emptied `backlog/planned/<cohort>/` parent on the
  graduate-to-`active/` leg (`promote` / `resume` already prune their own).

- _Note:_ The `rmdir` lands in the `relocate-artifacts` **mutator** (shared by any relocate caller), not the
  graduate arm — `promote` / `demote` and `abandon` prune at the **verb** level via their own `rmdir` seams,
  but the graduate path runs through `relocate-artifacts`, which has none (the relocate-mutator gap).

    - Local-cosmetic (git doesn't track empty dirs) but the same deterministic-placement class as the
      mutator work; folds onto the relocate leg.

    - Build `test-first` (one behavior at a time):
        - Graduating the last member out of a cohort subdir `rmdir`s the emptied parent
        - A still-occupied parent dir is left in place

## **Phase 5:** Planning-stage meta-field writes

_Purpose:_ Migrate the deterministic planning-stage meta writes that shipped `planning-pipeline-readiness`
left as hand-fills — the tail-cleanup of what PPR shipped, on the same stage-pointer surface. Removes the
hand-fill at the create-spec / generate-tasks / verify finalize fire-points.

_Design decisions:_ All three writes route through the existing in-place field writers — `Class` via
`setMetaCoreFields` (core-table re-render keeps alignment canonical by construction), `Task List` /
`Next Action` via `setMetaBulletFields`. The field/record-seam write, never raw whole-file
string-poking. Extends the `set-stage --advance` finalize precedent (which already resets `Next Action`
to the begin-sentinel). The here-vs-PPR boundary: this WU owns the `Class` / `Task List` / `Next Action`
writes; PPR shipped `Current Workflow` / `Design`.

### `[ ]` **5.1 Code-write `Class` / `Task List` / `Next Action` at the planning finalize fire-points**

- _Goal:_ `Class`, `Task List`, and the terminal `Next Action` strings are written by code at the
  create-spec / generate-tasks / verify-work-unit finalize fire-points — no hand-fill — with core-table
  alignment intact.

- **Strategies:** strategy-task-list-formatting.md

    - `[ ]` **5.1.a `Class` write at the create-spec / generate-tasks finalize fire-points**
        - `setMetaCoreFields` re-renders the three core rows; alignment is `max(header, cell)`-derived.
        - Confirm create-spec's current `Class` hand-fill at impl — `generate-tasks` Finalize hand-fills all
          three fields and `verify` hand-fills `Next Action` (both confirmed); create-spec's `Class` write is
          named by the design but unverified in the current ceremony.
        - Build `test-first` (one behavior at a time):
            - `Class` is written; core-table alignment stays MD060-passing; other core cells untouched

    - `[ ]` **5.1.b `Task List` filename-derivation write at generate-tasks finalize**
        - Pure `tasks-<name>.md` derivation through `setMetaBulletFields`.
        - Build `test-first` (one behavior at a time):
            - `Task List` is set to the bare derived filename

    - `[ ]` **5.1.c Terminal `Next Action` strings at create-spec / generate-tasks / verify finalize**
        - The fixed terminal strings (distinct from `set-stage --advance`'s begin-sentinel reset).
        - Build `test-first` (one behavior at a time):
            - Each fire-point writes its fixed terminal `Next Action`

    - `[ ]` **5.1.d Remove the hand-fill from the three workflow finalize fire-points**
        - `create-spec.md`, `generate-tasks.md`, `verify-work-unit.md` invoke the code writes instead of
          prescribing hand-fills.

## **Phase 6:** Errand legs & lifecycle affordances

_Purpose:_ The remaining standalone judgment-free mechanics — the errand create/close legs (inbox-line
removal, branch-cut) and two verb affordances (`arc stub --cohort`, `arc start --here` auto-cut). Each is
an independent small mechanic; together they remove the hand-run tails from `run-errand`, `drain-inbox`,
and the cold-start refusal.

_Design decisions:_ The inbox removal is idempotent + targeted + title-keyed in v1 (forward-compat to
OSD's `_Slug:_`). The errand branch-cut consumes the slug as logical identity — never recovers identity
by parsing `chore/<slug>`. Single-member `--cohort` only (the batch scaffold is `decompose-matrix`'s).

### `[ ]` **6.1 `USER-INBOX` slug-matched line removal**

- _Goal:_ Errand completion drops the originating `USER-INBOX` entry via an idempotent, targeted,
  title-keyed removal — a no-op when absent, a single entry (not a whole-file rewrite).

- _Context:_ Title-keyed in v1 (forward-compat to OSD's `_Slug:_`, which owns the field later); maps to
  the future inbox-as-event-log drain _event_. Readers already exist (`inbox-state.ts`,
  `user-sync/parser.ts`) — this is the missing writer. `run-errand` Complete is the authoritative removal
  point; `drain-inbox` and the `session-handoff` § Same-session finalize pass (the auto-merge backstop)
  replay it idempotently. Not the errand-WIP-handoff path, which deliberately retains the entry until the
  errand completes.

    - `[ ]` **6.1.a Targeted line-removal primitive**
        - Build `test-first` (one behavior at a time):
            - Removes the title-matched entry; sibling entries stay byte-stable
            - Idempotent no-op when the entry is absent
            - The rest of `USER-INBOX` is untouched (targeted, not a re-render)

    - `[ ]` **6.1.b Wire the removal into the completion sites**
        - `run-errand` Complete (authoritative), `drain-inbox`, and `session-handoff` § Same-session
          finalize pass (backstop) call the writer (slug-matched removal at completion), replacing the
          hand-run removal.

### `[ ]` **6.2 Errand `chore/<slug>` branch-cut at Launch**

- _Goal:_ Errand Launch cuts the `chore/<slug>` branch off `branch.base` from code, consuming the slug as
  logical identity.

- _Context:_ Reuse `ERRAND_BRANCH_PREFIX` (`errand-branch.ts`); never recover identity by parsing the
  branch (the durable identity record is `errand-lattice`'s). Call sites: `run-errand` Launch,
  `session-init` errand cold-entry, `drain-inbox`.

    - `[ ]` **6.2.a Branch-cut mechanic (`chore/<slug>` off `branch.base`)**
        - Build `test-first` (one behavior at a time):
            - Cuts `chore/<slug>` off the configured base; slug → branch via `ERRAND_BRANCH_PREFIX`
            - Handles an already-existing branch of that name safely (no clobber)

    - `[ ]` **6.2.b Wire into the three launch sites**

### `[ ]` **6.3 `arc stub --cohort <slug>`**

- _Goal:_ `arc stub --cohort <slug>` places the new member dir under `backlog/planned/<cohort>/<name>/`
  and writes the `Cohort` field, under the stub contract's existing collision/validation guards.

- _Context:_ Single member only — the batch-into-cohort-tree scaffold is `decompose-matrix`'s. Extend
  `stub.ts` / `runStub` + its handler; reuse `isSafeCohortPath` for the cohort-path guard.

    - `--cohort` flag → cohort-tree placement + `Cohort` field override; runs under the stub guards.

    - Build `test-first` (one behavior at a time):
        - Places the dir under the cohort tree and writes the `Cohort` field
        - Runs under the stub collision/validation guards (commitment + priority still required)
        - Rejects an unsafe cohort path (`..` traversal, leading `/`)

### `[ ]` **6.4 `arc start --here` protected-base auto-cut**

- _Goal:_ On a protected base under `branch.protection: full`, `arc start --here` offers / auto-cuts
  `plan/<name>` instead of bare-refusing — the hand `git checkout -b` workaround made the on-label path.

- _Context:_ Upgrade `runColdStart`'s `isProtectedBranch` refusal (`commands/start.ts`) into a guided
  auto-cut / offer; candidate J, verified live against current code 2026-06-18.

    - Build `test-first` (one behavior at a time):
        - A protected base yields a `plan/<name>` cut + scaffold (or an offer), not a bare refusal
        - The non-protected / feature-branch path is unchanged

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `arc teardown` fires from the `integrate-work-unit` and `session-handoff` ceremonies; the safety
  gate authorizes and protects correctly across squash, rebase, and merge-commit ship paths — no merged
  branch lingers (the squash/rebase bug is gone)
- `[ ]` `arc archive --pr-url [--completed]` writes `PR URL` + `Completed` as `META_FIELDS`, invoked with
  the PR URL by the archive ceremony; the `template-meta.md` finalize-field mandate is retired so no facts
  are hand-added
- `[ ]` `arc integrate` performs the Active → Integrating flip + ROADMAP regen; `integrate-work-unit` no
  longer hand-edits `State`
- `[ ]` A graduated meta carries every `META_FIELDS` field (warn-and-backfill notice emitted);
  `template-meta.md` is deleted (both copies) and no scaffold path references it
- `[ ]` `Class` / `Task List` / `Next Action` are written by code at the finalize fire-points — no
  hand-fill — with core-table alignment intact
- `[ ]` `USER-INBOX` slug-matched removal and the errand `chore/<slug>` branch-cut fire from code, not
  workflow markdown
- `[ ]` `arc stub --cohort` places the dir + writes the field under the stub guards; `arc start --here`
  auto-cuts / offers `plan/<name>` on a protected base instead of bare-refusing
- `[ ]` The executor reports the distinct post-side-effect status on a forced post-side-effect failure
  (covered by test)
- `[ ]` Falsifiable sweep: no "set by hand" / "hand-add" / carry-and-skip teardown tail remains in the
  lifecycle ceremonies this WU owns (`integrate-work-unit`, `session-handoff`, `archive-work-unit`, the
  create-spec / generate-tasks / verify finalize fire-points, `run-errand`, `drain-inbox`)
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

---

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
