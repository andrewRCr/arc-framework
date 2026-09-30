# Draft: Storage Seam

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.
- **Purpose:** Route every ARC reader and writer of operational and planning state through the storage contract,
  running on its first implementation over today's tracked layout, so the ref backend can later replace that
  implementation with nothing above the contract changing.
- **Planning posture:** `P1`; `Class` settles at planning. Its design comes from `storage-contract`'s consumer map, so
  this work unit carries little of its own. When `storage-contract`'s planning closes, it decomposes against that map,
  and its members inherit the map rather than redesigning their subsystem.

---

## Scope

By subsystem, as the storage analysis partitions it (`analysis-storage-substrate-direction.md` § 10.2) and the
consumer map will settle it:

- **Lifecycle and in-flight:** the lifecycle executor's write path, `arc start` placement, in-flight derivation,
  and the archive index.
- **Delivery:** delivery's plan and state records and its reads of lifecycle state.
- **Review and evidence:** Candidate and transition records, review evidence, and the readers that take either out
  of Git history.
- **Locus and session-init:** locus derivation from the checkout marker plus the store, and the notes-related
  session-init probes. Kept narrow: reads through the contract, without reshaping the prose conditionals the
  session-init agenda will replace.
- **Status and roadmap:** ROADMAP rendering and the status surfaces, as derived projections that are never stored.

Readers outside ARC's code — workflows, extensions, method overrides, scripts, and ARC's own lint and contract
checks — move off Git-history and pull-request-diff reads of state as well (§ 6.10, Readers outside ARC).

## Constraints

- `cli-substrate-complete-migration` lands before this work unit starts, and nothing else that edits the lifecycle
  write path runs alongside it (`cohort-state-storage.md` § Cross-cohort).
- When it decomposes, `storage-cutover`'s edge on it re-points to its members.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration, or at its decomposition,_
> _where each goes to the member that owns its partition. Integrate — or consciously reject — each one._

### `[ ]` **Own placement-as-record: directory layout is projection of lifecycle state**

- _Re-cut:_ moved from `singleton-integration-continuity` at the `state-storage` re-cut (2026-09-28); lifecycle and
  in-flight partition. ADR-035 and the storage contract's record model settle the design position; this is the move of
  every placement reader.
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-07-18);
  captured at the storage-substrate grooming (2026-07-17).
- _Concern:_ `backlog/{provisional,planned}` / `active/` / `completed/` placement is today a state _encoding_ —
  the storage-substrate grooming names this a coupling smell: concurrent lifecycle transitions make placement a
  shared-mutable surface, and changing the layout breaks anything that reads it.
- _Fold-in:_ record the target consequence as a design position at grooming: lifecycle state is a record field;
  directory placement is a projection of it; relocating a WU is a record-field change ARC cannot break on.
  Coordinate with `coupling-blast-radius-audit` (now a hard dep of this WU — its enumeration surfaces the
  placement readers) and `strategy-storage-evolution.md` Principles 1–2.

### `[ ]` **Prevent local-ref residue from outranking an archived Shipped record**

- _Re-cut:_ moved from `singleton-integration-continuity` at the `state-storage` re-cut (2026-09-28); lifecycle and
  in-flight partition.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-20); confirmed by teardown on 2026-08-15.
- _Concern:_ readiness composition merges local-ref oracle candidates with tree records so a lingering
  `feat/<slug>` ref can emit Active over an authoritative `completed/` meta reading Shipped. ROADMAP regeneration
  then resurrects shipped work and discharged dependency edges.
- _Evidence:_ deleting the lingering branch immediately restored the correct Shipped result; delivery candidate
  refs and temporary worktrees were inert to status. Their separate cleanup-driver gap is already owned by
  `delivery-native-stack-composition`.
- _Fold-in:_ make completed-and-Shipped tree evidence outrank generic local-ref candidates while surfacing the ref
  as cleanup residue. Preserve legitimate in-flight authority and verify the dependency-discharge consumer.

### `[ ]` **Retire activation's remote plan shadow in the lifecycle model**

- _Re-cut:_ moved from `wu-lifecycle-state-model` at the `state-storage` re-cut (2026-09-28); lifecycle and in-flight
  partition. After the cutover `plan/<slug>` is a zero-commit, local-only anchor (storage analysis § 6.8).
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain
  (2026-07-10); observed during FP wave-1 spawn verification.
- _Concern:_ retire the remote `plan/` shadow ref safely after the new head lands, and reconcile that cleanup with
  the post-reform activation model. SSOA must make any interim shadow ref harmless to lifecycle/status truth; this
  WU owns eliminating the residue.

### `[ ]` **Recognize the archived-but-not-torn-down work unit as a proved terminal frame**

- _Re-cut:_ moved from `singleton-integration-continuity` at the `state-storage` re-cut (2026-09-28); lifecycle and
  in-flight partition. The pending-teardown terminal-condition decision it extends stays with
  `wu-lifecycle-state-model`.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-03); captured during
  `session-locus-model` closeout recovery.
- _Concern:_ the supported integration cadence archives the active meta before merge and physical teardown. An
  interruption in that interval leaves a valid durable role whose active-subject projection is
  `subject-unresolved`, even when a unique same-slug completed subject, exact checkout/head, and open change request
  prove the monotonic terminal transition.
- _Fold-in:_ extend the existing pending-teardown terminal-condition decision to cover this pre-merge interval and
  define the state/projection authority recovery consumes. Coordinate exact-generation mutation and locked cleanup
  with `locus-generation-binding`; keep arbitrary missing or ambiguous subjects fail-closed.
- _Verification:_ cover archive-before-merge restart, merge-before-teardown, partial teardown, retained-control
  finalization, and missing/ambiguous completed-subject negatives in reader, session-init, and recovery tests.

### `[ ]` **The `abandon` → `teardown` lifecycle is not wired for `branch.protection: full` (first live abandon)**

- _Re-cut:_ moved from `wu-lifecycle-state-model` at the `state-storage` re-cut (2026-09-28); lifecycle and in-flight
  partition.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ First real `arc abandon` (2026-07-24, retiring `recovery-load-scoping`) hit four distinct
  failures in sequence. All stem from one root: the abandon cascade is authored as if it commits directly to
  base, which full protection forbids.

    1. **`arc teardown <name> --force` is unreachable after a full-protection abandon — blocking.** It refuses
       with `Cannot husk: retirement evidence is missing`. `arc abandon` writes the receipt to
       `.arc/.internal/retirement-receipts/` in the **base** checkout and stages it; under full protection that
       receipt reaches `main` only via PR. But teardown resolves the evidence from the **target worktree's**
       checkout, which is pinned to the WU branch — a branch that by construction never receives the receipt.
       Verified: the WU worktree's receipts dir held only the prior receipt (`sha256-07d775a0…`), never
       `sha256-a014250111…`, because its HEAD (`8ea4b3892`) predates the retirement commit. `--force` is
       documented for exactly this case ("tear down a retired/parked origin (unmerged branch) using its
       finalized retirement receipt"), so the documented path is unreachable under the default protection mode.
    2. **`arc abandon` leaves a staged cascade on the protected base with no path forward.** It ran against
       `main` in the primary worktree and staged four changes (receipt, ROADMAP, two artifact deletions), then
       `arc release commit` refused with `branch-protection-violation (code 13)`. The verb should either cut its
       own branch, or refuse up front with the branch it needs — not stage a cascade the operator then has to
       rescue by hand.
    3. **The impact plan over-promises on ROADMAP.** It prints `ROADMAP: remove its row`, but the commit only
       bumps the `Last rendered against` SHA; the `## In Flight` row survives because that table renders from
       local refs and the branch still exists. The row clears only after teardown plus a re-render — which,
       per (1), cannot happen.
    4. **One retirement consumed two errands.** Because of (2), landing the cascade required opening
       `chore/retire-recovery-load-scoping` as a second errand purely to carry a commit the lifecycle verb had
       already staged. The retirement itself is not errand-shaped work.
    5. **Nothing deletes the remote branch, so the WU stays visible after full local cleanup.** `arc abandon`
       does not touch `origin`, and remote-head pruning belongs to `teardown` — which refused per (1). After the
       local branch and worktree were removed by hand, `arc status --project` **still** rendered the `In Flight`
       row, sourced from the surviving `origin/plan/recovery-load-scoping` at `8ea4b3892`. This also falsifies
       (3)'s stated cause: the row is not local-ref-driven, so removing the worktree and local branch does not
       clear it. Resolved with `git push origin --delete` + `git fetch --prune`.
    6. **The readiness view has no regeneration command.** `arc status --project --write` does not exist, and
       `handlers/errand.ts:742` records regen as "advisory until `roadmap-tooling` ships the renderer — nudge a
       hand-render." So correcting the tracked `ROADMAP` after a retirement is a hand-edit of a generated file,
       then a third errand (`chore/roadmap-refresh-post-retirement`) to land it. Verified safe here only by
       diffing the tracked table row-for-row against live `arc status --project` output before editing.

- _Net state after the run:_ retirement is authoritative on `main` (receipt recorded, artifacts removed, user
  workspace removed, readiness view refreshed). Local and remote hygiene were completed **manually** —
  `git worktree remove --force`, `git branch -D`, `git push origin --delete` — because the sanctioned verb
  refuses. Preservation was verified first: the analysis doc on `main`, and the full pre-abandon draft retained
  out-of-band.

- _Approach (design, not patch):_ decide where the retirement receipt must be legible from, then make abandon
  and teardown agree. Candidates: have teardown resolve evidence from the base checkout rather than the target
  worktree; have abandon cut and land its own branch so the receipt is on base before teardown runs; or split
  teardown's evidence check from its physical cleanup so unmerged-by-design branches can be reaped on the
  receipt alone. Whatever shape it takes, the retirement should be **one ceremony** — the run above needed three
  errands, three PRs, and four manual git operations to retire a single planning WU, and every one of the six
  failures is a seam between verbs that each did their own part correctly.

- _Captured during:_ `recovery-load-scoping` retirement (2026-07-24) — the first live abandon in this repo.

### `[ ]` **Make direct retirement's clean-index precondition explicit and batch-aware**

- _Re-cut:_ moved from `wu-lifecycle-state-model` at the `state-storage` re-cut (2026-09-28); lifecycle and in-flight
  partition.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ A downstream-first batch of three planned-stub abandons could not stage all three transitions
  before commit. After the first `arc abandon`, the second refused with `retirement evidence does not match the
  requested transition`; `direct-retirement-driver.ts` actually rejects any non-empty staged path set before it
  reads the next subject's authority. Committing each retirement cleared the index and all three then succeeded.
  The isolation invariant is safe, but the generic authority diagnostic hides the actionable condition and makes a
  viable serialized ceremony look like corrupt or mismatched evidence.

- _Approach:_ Preserve the clean-index trust boundary, but return an explicit refusal naming the staged paths and
  the commit-or-clear remedy. Make the multi-retirement procedure state that transitions serialize through commits;
  evaluate a bounded batch primitive only if lifecycle design intends one atomic multi-subject ceremony.

- _Captured during:_ `review-gate-right-sizing` Task 5.2 retirement batch (2026-07-24).

### `[ ]` **Lifecycle-aware link reanchoring for movable ARC artifacts**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); lifecycle and in-flight partition.
- _Routed from:_ `BACKLOG-INBOX`, work-routing-discipline retirement pass (2026-06-01). Folded here because the
  reanchor belongs to the same lifecycle file-move CLI surface this WU owns (`arc graduate`, the boundary
  ceremonies that `git mv` artifacts).
- _Concern:_ in `pm.mode: arc-in-git`, lifecycle workflows move PRDs, task lists, atomic companions, plan docs,
  and archives between `backlog/`, `active/`, and `completed/`. Markdown links inside moved files can go stale
  because relative paths anchor to the source file's old directory. The pre-commit link validator catches the
  failure, but recovery is manual and interrupts the activation/archive flow.
- _Proposed:_ combined helper + lifecycle CLI improvement — (1) a constrained link-reanchor helper accepting
  explicit move pairs (or reading staged `git mv` state), parsing Markdown links / reference definitions and
  rewriting only targets that resolve to moved ARC artifacts; (2) integrate into the lifecycle CLI commands so
  `npx arc` performs `git mv`, state/PM updates, and link reanchoring as one operation. Keep it structural (not
  broad grep/replace); support `--check`/`--write`; preserve filename-only references.
- _Scope:_ M (helper + tests); L if bundled with full activation/archive CLI commands.

### `[ ]` **Prevent withdrawn singleton Candidates from reviving without a new public boundary**

- _Re-cut:_ moved from `singleton-integration-continuity` at the `state-storage` re-cut (2026-09-28); review and
  evidence partition.
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-09-07);
  captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ a withdrawn one-member delivery Candidate can be rediscovered from surviving topology and treated as
  publishable again even though its public boundary was explicitly retired.
- _Fold-in:_ model withdrawal as a lifecycle fact that prevents implicit revival; require a new authorized public
  boundary to create a successor Candidate while preserving the historical record.

### `[ ]` **Decide whether raw review evidence survives the archive sweep, and say so**

- _Re-cut:_ moved from `singleton-integration-continuity` at the `state-storage` re-cut (2026-09-28); review and
  evidence partition.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- _Observation:_ `arc archive` removes the per-WU user workspace as part of the ship sweep. Observed directly
  during `delivery-post-landing-conflict-recovery`: `.arc/user/andrew/<wu>/` was gone at 22:45:40 local, between
  the archive-phase composition commit and the archival commit, taking `SESSION-NOTES.md` and both
  `review-standard-*` record directories (chunk reports, aggregate result, evaluator report) with it. The
  contents are gitignored, so nothing is in git, and the notes-sync ref `refs/notes/arc/user/andrew` held only a
  snapshot predating that day's review work — so the raw evaluator output is unrecoverable. Two consequences
  follow. `integrate-work-unit.md` Step 10 calls `arc user close` and describes itself as "the owning caller";
  by then it is always a no-op on this path. And `archive-work-unit.md` states that teardown belongs to Step 11,
  which is true of the branch and worktree but not of the user subdir it silently retires.

- _Why it matters:_ the narrative survived here only because Steps 5-6 write Release Notes and Completion Notes
  into the tracked meta before Step 8 sweeps — that ordering is sound and should stay. But this work unit closed
  on an owner-accepted review terminus rather than a clean pass, which is exactly the case where the raw
  findings are the evidence someone would want later, and they are the part that does not survive.

- _Approach:_ settle the intent first — whether review artifacts are session-local scratch (disposable at ship)
  or evidence (durable past ship). If durable, carry them into the archived `completed/<dated>/<NN>_<name>/`
  set or into the notes ref before the sweep runs. If disposable, say so plainly in `archive-work-unit.md`,
  correct its teardown-ownership sentence to exclude the user subdir, and reduce Step 10's `arc user close` to
  the documented idempotent backstop it actually is.

- _Boundary:_ the sweep's scope over the user subdir and the two workflow statements that describe it. Not a
  redesign of the user workspace, the notes-sync mechanism, or review-record composition.

- _Captured during:_ `delivery-post-landing-conflict-recovery` integration, 2026-09-18, after the loss was
  observed and confirmed against the sync state and notes ref rather than inferred.

### `[ ]` **Treat branch-carried project projections as the defect, not only their merge conflicts**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ parallelism-GA operating review and housekeep drain (2026-07-20).
- _Evidence:_ with three to six work units plus errands running concurrently, `ROADMAP.md` conflicts now add repeated
  activation, verification, and integration churn. Agents often investigate regeneration mechanics for minutes before
  discovering the canonical staged-index render command; conflict recovery is only the visible tax of carrying a
  shared derived projection on every branch.
- _Posture for grooming:_ strengthen the target beyond a more discoverable resolver or merge driver. A work-unit or
  grooming branch should not carry a project-level `ROADMAP` / eventual `STATUS.PROJECT` projection diff at all.
  Prefer on-demand or explicitly materialized/base-owned views sourced from authoritative operational state, aligned
  with `operational-state-docs`, `local-mode`, `arc-backend`, and the storage-evolution north star. Keep the existing
  resolver wiring as an interim mitigation, but do not mistake faster recovery for the long-term boundary.
- _Additional evidence (routed 2026-07-21):_ the projection header pins the render to a HEAD hash, so every commit
  invalidates it. A verification close that touched one render field across three commits required two renders, with
  the second failure appearing only at pre-commit after message composition. The tax scales with commit count, not
  only concurrent merge conflicts. If branch-carried projection retirement is deferred, dropping or read-time
  deriving the hash is the cheap interim correction.
- _Evidence-schema constraint (routed 2026-07-31):_ "stop staging ROADMAP" is not a separable interim knob. The
  finalized-record gate requires the staged set to equal the receipt plus the recorded transition patch, and ROADMAP
  is currently a managed path in every decomposition projection. Removing it from that patch also removes it from
  `expectedPaths`, drops the `roadmap-missing` refusal, and changes the required `prospectiveProjection.roadmap`
  input to the preparation digest. That changes canonical evidence identity and invalidates in-flight preparations,
  so dematerializing and deleting the projection have roughly the same evidence-migration cost.
- _Renderer-contract evidence (routed 2026-07-31):_ the decomposition planner, pre-commit assertion, and conflict
  remedy render from different input contracts. The core flow avoids divergent bytes because finalization pins the
  candidate head to the result base; a candidate moving across base advancement breaks that structural equality.
  Treat renderer unification and projection dematerialization as one design decision rather than a cheap staging fix
  followed by a later schema change.

### `[ ]` **Align activation staging with ceremony commit boundaries**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-21); captured during
  `cli-layout-resolver` activation.
- _Concern:_ `arc activate` staged a nontrivial `ROADMAP` change with the activation meta while the workflow requires
  a separate projection ceremony commit; manual unstaging and a second staged-index render were needed. The verb
  also surfaced transient stale-branch evidence while its own rename and field rotation were incomplete.
- _Fold-in:_ make lifecycle verb and workflow ownership agree for trivial versus nontrivial refreshes, preserve the
  staged-index renderer as commit-check authority, and suppress transition-internal residue. Keep the longer-term
  target that WU branches do not carry project-level projections.

### `[ ]` **Expose a first-class readiness-view render verb**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-21); captured after hand-editing a dependency
  edge staled the view emitted by `arc stub`.
- _Concern:_ lifecycle verbs render as side effects, but no discoverable CLI verb performs the mandatory
  staged-index refresh after a manual render-field edit; operators learn the shell redirection only from a failed
  pre-commit diagnostic.
- _Approach:_ expose the existing staged-index projection as a verb, or eliminate the manual path by making every
  render-field mutator regenerate before returning. Coordinate with branch-carried projection retirement rather
  than creating a permanent command solely for a surface this WU may dematerialize.

### `[ ]` **Materialize pollutes ROADMAP consistency; in-flight rows key on ephemeral refs**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: roadmap-tooling`), housekeep drain (2026-07-18); captured
  during FP wave-4 cross-machine burn-in (2026-07-17).
- _Concern:_ `arc materialize <slug>` regenerates the primary's `ROADMAP.md` to add the newly-in-flight row and
  **stages it uncommitted** on `main`, where full protection forbids committing it — leaving the primary dirty
  with no clean reconcile. Root cause is deeper: the project render sources In-Flight rows from **origin/remote
  refs** (verified — removing the local branch + worktree left the row; only deleting the origin branch cleared
  it), so any remote plan branch makes _every_ worktree's ROADMAP "want" that row and trips the regen pre-commit
  hook on a sibling worktree's next commit. Hit live: an FP-branch commit was blocked by a probe-c row FP never
  authored. Distinct trigger from the merge-boundary ROADMAP conflict class in the entry below (that one is
  concurrent renders diverging; this one is ref-sourced rows contaminating unrelated worktrees).
- _Fold-in:_ two coupled fixes to weigh at grooming — (1) materialize should not stage an uncommitted ROADMAP
  regen on the primary (skip the regen, route it through a committed ceremony, or render on demand);
  (2) reconsider whether In-Flight rows should derive from **tree metas** (committed, per-worktree coherent)
  rather than ephemeral local/remote refs — the ref-sourced design is what makes an unrelated worktree's commit
  depend on another WU's branch existing. Coordinate with the merge-driver entry below (same owner).

### `[ ]` **Merge-driver ownership for ROADMAP conflict auto-resolve**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ residual of the 2026-07-15 pull-back errand `hook-roadmap-conflict-auto-remedy` (inbox capture
  "Hook auto-remedy for ROADMAP-only merge conflicts (pull-back)"); original capture from housekeep drain /
  FP wave-3 base merge.
- _Landed interim:_ pre-commit hook-side regenerate-and-restage when `ROADMAP.md` is the only conflicted (or
  marker-bearing) path — uses the existing staged-index regenerate-wins projection (`remedy-roadmap-conflict.ts`).
  Covers the post-stage commit path; pure unmerged ROADMAP-only still needs a stage or driver to fire before
  `git commit` will invoke hooks.
- _Residual concern:_ settle whether a scoped **merge driver** with install wiring should own recovery at merge
  time (before pre-commit), or whether the hook-side path is sufficient long-term. Keep any driver constrained to
  ROADMAP-only conflicts and coordinated with the same projection engine (no second renderer).

### `[ ]` **Audit lifecycle workflows for stale ROADMAP hand-render advisories**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); captured after `arc publish` was found
  to regenerate and stage ROADMAP despite stale workflow prose saying to hand-render it.
- _Approach:_ verify each lifecycle verb's actual render/stage side effects before editing. Correct only workflows
  whose command already regenerates and stages, in package and project copies; candidate surfaces are promote,
  deactivate, and planning/init.

### `[ ]` **Move ROADMAP regeneration to the merge boundary**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: roadmap-tooling`), housekeep drain (2026-07-16); captured
  during FP wave-3 external-budget contention analysis; evidence in `notes-finalize-parallelism.md` § Day-2
  evidence.
- _Concern:_ under wave-3 parallelism every shipping PR conflicts on `ROADMAP.md` — the derived-artifact conflict
  class ADR-020's derived-vs-mutated split predicts: concurrent branches each carry a render derived from their
  own base snapshot, and git line-merge cannot converge derived content. In-session friction fixes (already
  shipped) don't touch this; it is structural while branches edit the render.
- _Proposed:_ branch PRs stop editing ROADMAP; a base-side post-merge regen keeps it current. Branch-side
  staleness is already the documented model ("derived-at-merge, mid-WU stale"), so nothing is lost; every-PR
  conflicts and some doc-only CI churn disappear together. Owns-regen-triggers puts this here. Complements (does
  not replace) the day-1 auto-regen conflict-remedy errand capture — elimination vs. remedy.

### `[ ]` **Make the integration ROADMAP preflight parallel-WU aware**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-18) — re-homed here as ROADMAP-projection design
  input; captured during `arc-view` integration entry, after parallel WU state changes appeared in ROADMAP
  regeneration.
- _Concern:_ `integrate-work-unit.md` requires the fresh-entry ROADMAP diff to contain only the current WU's
  state flip. That assumption is stale now that parallel WUs routinely advance lifecycle state between ROADMAP
  renders; regeneration correctly folds their already-authoritative live-ref state into the derived projection.
- _Approach:_ replace the serial "state flip only" rule with a projection-integrity check that distinguishes
  explainable concurrent live-ref deltas from malformed or unrelated output without forcing stale hand-edits.
  Confirm whether executable support is needed beyond the prose change (packaged + self-hosted
  `integrate-work-unit.md` copies; related workflow tests if present).

### `[ ]` **Scope the ROADMAP re-render to what the invoking operation actually changed**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ `arc stub` at the **provisional** tier staged a `ROADMAP` re-render, and the render's only
  substantive content was unrelated to the stub: it dropped an `Integrating` row for a sibling work unit that had
  merged into the base branch the current branch has not merged. Provisional stubs are not rendered in `ROADMAP`'s
  tables at all, so the invoking operation changed nothing the projection shows. The regen was dropped from the
  commit by hand rather than carrying a base-drift projection rewrite into an unrelated planning commit.

- _Observation (why it bites):_ the render reads "tree + local refs," so on any branch behind its base it encodes
  sibling lifecycle transitions the branch has not absorbed. A regen triggered by an unrelated operation therefore
  silently converts base drift into staged content, and the operator has to notice and unstage it. The rule in
  `DEV-RULES.ARC` § Commit Discipline requires regen only for render-field changes on `active/` or
  `backlog/planned/` metas and for moves into or out of `backlog/planned/` — the provisional-tier case is outside
  it, so this is tooling reaching wider than the rule.

- _Approach:_ either skip the regen when the invoking operation cannot affect rendered content (provisional-tier
  stub creation being the clear case), or scope the render so an unrelated cross-branch delta does not ride along.
  The second is the more general fix and interacts with the projection's source-scope choice, which is this work
  unit's territory.

- _Captured during:_ `judgment-authority-model` drafting, 2026-07-26 — hit while minting the `planning-lane-relief`
  stub for a decomposed face.

### `[ ]` **Keep the post-decomposition ROADMAP current after teardown**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: roadmap-tooling`), housekeep drain (2026-07-19); captured
  during `cli-substrate-adoption` post-merge teardown, 2026-07-18.
- _Concern:_ the decomposition PR's generated ROADMAP correctly retained the origin while its planning branch still
  existed. After merge, `arc teardown cli-substrate-adoption --force` deleted that branch and worktree, and the live
  `arc status --project` view dropped the origin, but the tracked ROADMAP remained unchanged with
  `cli-substrate-adoption` still listed as Planning. The required post-merge lifecycle leaves the projection stale
  until an unrelated ceremony regenerates it.
- _Fold-in:_ fold this concrete teardown case into the existing merge-boundary regeneration design. Settle whether
  the merge completion path or receipt-aware teardown owns the base-side refresh, without adding another renderer or
  leaving a dirty uncommitted base checkout. Coordinate with the "Move ROADMAP regeneration to the merge boundary"
  and materialize-consistency items already in this buffer (same owner).

### `[ ]` **Discoverable ROADMAP regen — close the `arc status --project --staged > file` verb-gap**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ self-observed during the 2026-07-19 housekeep-drain grooming PR (live incident); a ROADMAP-only
  merge conflict against a concurrently-merged sibling had to be hand-reconciled.
- _Concern (verb-gap):_ the canonical regen is `arc status --project --staged > .arc/backlog/ROADMAP.md` — a
  `status` subcommand redirected to overwrite a tracked file. It is undiscoverable (`arc view` has no roadmap kind;
  `arc status --project` renders to stdout only), so awareness depends on tripping the pre-commit hook, which prints
  the command in its error. That JIT surface works and keeps miss-cost low, but the idiom is mechanics-narration
  where a verb should exist (DEV-RULES.PROJECT § Verbs over mechanics — verb-gap signal).
- _Approach:_ when this WU builds the render tooling, expose a discoverable regen verb (e.g. `arc roadmap render`)
  that writes the file directly, retiring the redirect idiom. Pairs with the merge-driver auto-resolve item already
  in this buffer — together they close both the awareness gap and the conflict-reconcile gap this incident hit.

### `[ ]` **Make the ROADMAP check reproducible under concurrent sibling sessions**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Errand` (reclassified multi-step), housekeep drain (2026-07-30); captured during
  `decompose-base-mobility` planning.
- _Concern:_ the regen check compares the staged projection to a fresh render that reads live local refs and
  decomposition claims. A sibling branch can move between render and commit, invalidating a projection staged
  moments earlier. The retry remedy races the same mutable input and becomes less reliable as concurrency grows.
- _Fold-in:_ make the check-side render a pure function of reproducible staged inputs, excluding live-ref-derived
  rows from the comparison rather than necessarily from the artifact. If that boundary cannot hold, define a
  bounded re-render/re-compare retry that reports the race explicitly.

### `[ ]` **Gate the ROADMAP regen warning on a real projection difference**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: roadmap-tooling`), housekeep drain (2026-07-30); captured
  during `chunked-delivery` base reconciliation.
- _Concern:_ the hook warns whenever a render field changes even when the rendered row is byte-identical. Its
  suggested full regeneration is actively harmful on a branch behind base because unrelated shipped and
  in-flight rows enter the diff.
- _Fold-in:_ compare the would-be render with the committed projection and warn only on a real difference.
  Evaluate scoping that comparison to rows fed by the staged metas so the result remains correct independently
  of base distance, coordinated with the branch-carried projection retirement already in this draft.

### `[ ]` **Treat the HEAD-pinned render stamp as a composition blocker**

- _Re-cut:_ moved from `roadmap-tooling` at the `state-storage` re-cut (2026-09-28); status and roadmap partition.
  ROADMAP becomes a derived projection that is never stored.
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: roadmap-tooling`), housekeep drain (2026-07-30); captured
  during `decompose-base-mobility` planning.
- _Concern:_ the existing branch-carried-projection entry records per-commit re-render tax, but the stamp now
  blocks dependent design. Core decomposition finalization expects a projection stamped at
  `resultBase.head`; the shared conflict remedy stamps worktree `HEAD`. Those values diverge under the exact
  base-advancement case the remedy is meant to handle, making the paths impossible to compose without weakening
  an invariant.
- _Fold-in:_ sharpen the existing branch-carried-projection evidence rather than creating a separate concern.
  If full projection retirement remains deferred, weigh dropping or read-time deriving the stamp as a focused
  interim correction; that already-recorded option would dissolve this failure class.

### `[ ]` **Retire a work unit's internal Candidate records when it archives**

- _Routed from:_ `USER-INBOX § Work Unit`, drained at the `state-storage` re-cut (2026-09-28); review and evidence
  partition.

- _Observation:_ `.arc/system/.internal/candidates/` carries 16 tracked files for 8 work units, and every one of
  those work units is archived — `evidence-applicability`'s record sits in the working tree while its artifacts
  live in `.arc/completed/2026-q3/61_evidence-applicability/`. Archival relocates artifacts by `git mv` and leaves
  both the Candidate record and its `.boundary.json` behind. There is no deletion path in source at all:
  `candidate-record-store.ts` exports a path resolver, three readers, and `writeCandidateRecord`, and
  `archive-work-unit.md` never mentions the namespace.

- _Approach:_ Decide when retirement fires and whether it lands inside the archive commit; whether the
  `.boundary.json` follows the same rule; and what still needs the record afterwards — `subject-meta.ts:164`
  resolves it live, while `candidate-response-confirmation.ts:107` reads it out of git history and so survives
  deletion. Clearing the 16 existing files is the atomic half, but it rides the mechanism rather than preceding it,
  because a backfill alone re-accumulates.

- _Scope:_ Checked for an existing owner and found none — `graduation-cleanup` covers planning commit-history noise
  at spec graduation; `operational-state-docs` covers `user/{identity}/.internal/` and markdown-projected managed
  documents rather than code-owned JSON records; `cli-substrate-complete-migration` touches legacy record shapes
  rather than their lifecycle. Route or create at the drain rather than assuming a new stub.

- _Observation:_ this already invalidates evidence held elsewhere — `draft-cli-substrate-complete-migration.md`
  records that all seven candidate records parse canonically, and there are now eight.

- _Captured during:_ `delivery-rebuild-continuity` draft-design, checking Candidate-record storage for the
  adversarial pass's blocker, 2026-09-21.

### `[ ]` **Give a singleton a reachable remedy when its own record writes stale the publication boundary**

- _Re-cut:_ moved from `delivery-correction-convergence` at the `state-storage` re-cut (2026-09-28), by the `USER-INBOX`
  capture "Take the singleton record-write stale-boundary arm from correction convergence"; review and evidence
  partition. It is one entry condition of the wedge the reading input below inherits ("Residual after errand 1 lands"):
  a boundary stale for a reason convergence does not satisfy lands a shipped work unit on `resume-pre-publication` with
  no continuation. PR #657 and `8b606fe20` now carry a boundary that holds an Owner-accepted terminus; the no-terminus
  case remains. Deduplicate against that residual, with no new scope.
- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: delivery-correction-convergence`), housekeep drain
  (2026-09-16).

- _Observation:_ `delivery-correction-convergence`'s draft names the mechanism for a stacked delivery — "persisting
  either `review-required` or record-only `covered` applicability moves the terminal head and immediately reopens
  applicability over the record effect itself, creating a self-invalidating loop even though the base did not move". The
  same loop fires on an **ordinary singleton with no delivery plan**, and there it has no exit. Observed live: a
  criterion-driven reviewable change landed after `arc publish`; the checkpoint refused `candidate-publication-stale`
  (`checkpoint-composition.ts:1201-1209` compares the boundary's `candidateSubjectDigest` against the recognized
  target's subject digest); and the offered `resume-pre-publication` remedy requires an active meta that the archive
  sweep had already removed. The sibling arm built for a shipped work unit, `refresh-shipped-delivery`, is delivery-only
  and requires a `delivery-status-required` locus that a singleton never holds.

- _The sharp form:_ the ceremony's own bookkeeping commit — the one recording the Owner's `covered` applicability
  selection — is what invalidated the boundary the checkpoint needed. Every remedy for that state writes another
  record.

- _Why `delivery-correction-convergence` held it before the re-cut:_ the mechanism is identical and that work unit owns
  public boundary renewal and machine-owned applicability effects. Its design's own consolidate-by-mechanism rule
  directs one owner per mechanism rather than one per boundary. What is new is the singleton arm, not the failure.

- _Approach:_ carry the singleton case into the same convergence path — either an arm that renews a publication
  boundary for a work unit already swept to `completed/`, or a rule that machine-owned record-only effects do not
  restale the boundary they were written to satisfy.

- _Evidence:_ `concurrent-integration-characterization` PR #629, merged at `7ca98e1c9` under explicit Owner
  authorization because no typed route to a `ready` checkpoint existed. Base unmoved at `cbf075da7` throughout;
  Candidate `sha256:4b669fca…`, subject advanced `f78db4bf…` → `4cdee44f…`.

- _Failed workflow-only slice:_ PR #634 tried invoking the final checkpoint before the archive sweep. Source
  verification proved that route cannot work: after the completion commit but before its push, local and public
  heads differ and the checkpoint returns `unsafe-reconcile`; after a push but before `with-integration` archival,
  lifecycle state is still incomplete and the publication read is never reached. The PR was withdrawn with a
  zero-file diff. Do not reintroduce an early invocation or reinterpret either refusal as clearance.

- _Forward-compatibility:_ recovery authority must bind typed Candidate and lifecycle records rather than whether a
  Markdown projection currently lives under `active/` or `completed/`. After the re-cut that binding is this
  partition's, and `delivery-correction-convergence` keeps the stacked-delivery convergence behavior.

- _Sequencing:_ `RELEASE-GATES.md` placed `delivery-correction-convergence` third and said "promote earlier only if an
  active correction hits this exact blocker". An active integration hit it on 2026-09-15 and had to merge outside the
  checkpoint, so that promotion trigger was satisfied. Weigh that against
  `delivery-post-landing-conflict-recovery` holding the first slot.

- _Not `delivery-post-landing-conflict-recovery`:_ considered and rejected on its own text. Its trigger is a landed
  delivery member whose retained suffix, terminal binding, or base-history shape leaves the exact-head comparison
  unsatisfiable — none of which a singleton has — and its boundary excludes "unrelated prepublication authoring and
  review-fix convergence", which is the half this failure lives in. The echo is real but narrow: its purpose warns
  against letting an Owner authorization become a general escape contract, which is how this landing was made. That
  is the shape of the escape, not the mechanism that forced it.

- _Captured during:_ `concurrent-integration-characterization` integration, 2026-09-15.

### `[ ]` **Rebuild the code `cli-substrate-complete-migration` carves out, with full session-init schemas**

- _Routed from:_ `USER-INBOX § Work Unit`, drained at the `state-storage` re-cut (2026-09-28); each bullet goes to the
  partition that rewrites it.

- _Observation:_ `cli-substrate-complete-migration` does not migrate code the storage program deletes or rewrites.
  Its closeout exclusion names the `state-storage` storage-coupling register (`cohort-state-storage.md`) as the
  authority for each carved item's owner and fate, so the `cli-substrate-adoption` cohort cannot close until these
  rows exist. The classes follow `analysis-storage-substrate-direction.md` § 10.4; the anchor modules are in
  `draft-cli-substrate-complete-migration.md` § Storage carve-out (later its spec).
    - **Rewritten — owner: the `storage-seam` partition that rewrites each item.**
        - In-flight derivation, with the in-flight oracle behind the `WorkUnitStateResult` and `ErrandStateResult`
          session-init slots.
        - The lifecycle executor's write path and `arc start` placement, with the `provisional-placement` callers.
        - The archive index (`completed-index.ts`).
        - ROADMAP rendering.
        - The notes-related session-init probes, with the `UserSessionInitStatusResult` slot and user-reference
          reconciliation (`user-reference-reconcile.ts`, the `userReferenceReconcile` slot).
        - Locus derivation (`DerivedLocusFrame`), from marker plus store.
        - The `currentWuReconcile` slot, which reads the lifecycle index over tracked placement plus transition
          records from the HEAD tree through `enumerateGitTransitionRecords`.
        - The `StaleWorktreeSweepResult` slot, which takes its shipped set from the archive index's ref readers,
          its retirements and husk evidence from the retirement-authorization context, and its branched selection
          from locus classification.
        - Any hook-check content rule moved into a record-family parser rather than deleted.
    - **Inherited obligation:** `cli-session-envelope` routed full schema authority for its thin session-init
      views to the cohort tail. For the rewritten slots above (`WorkUnitStateResult`, `ErrandStateResult`,
      `UserSessionInitStatusResult`, `userReferenceReconcile`, `DerivedLocusFrame`, `currentWuReconcile`,
      `StaleWorktreeSweepResult`), that obligation passes to the rewriting partition: author the full schema when
      the slot is rebuilt, rather than leave a thin view.
    - **Tests** of carved code keep their local doubles. The shared scripted `GitExec` fake and `GitProcessError`
      fixture the tail adds are there for the rewrites.

- _Approach:_ each bullet is one row in `cohort-state-storage.md`'s storage-coupling register. Reconcile the
  carve owner names in `cli-substrate-complete-migration`'s spec to `storage-cutover` (removed) and
  `storage-seam` (rewritten).

- _Captured during:_ `cli-substrate-complete-migration` draft-design, 2026-09-28.

### `[ ]` **Route surviving code's work-unit state paths through the contract, with one layout authority**

- _Routed from:_ `cli-substrate-complete-migration`'s draft-design recount (2026-09-28), which sorted every code line
  outside its carve that names a work-unit state class by owner.

- _Observation:_ code that survives the carve builds work-unit state paths itself rather than asking for a record,
  either by hand, joining lifecycle directories and artifact prefixes, or through `resolveArcPath` with a
  work-unit kind. Counted at `7ddab4979`, paths under `packages/arc-framework/`:
    - **Hand-built — 36 lines in 19 files:**
        - `arc/system/.internal/scripts/validate-links.sh:130`, `verify-integrity.sh:118,394`
        - `src/commands/active/status.ts:587`
        - `src/handlers/delivery.ts:789`, `src/handlers/status.ts:1690`
        - `src/lib/active/cohort-consistency.ts:263`, `cohort-live-context.ts:19`, `meta-reader.ts:42`
        - `src/lib/compaction-seed/emitter.ts:188,220`
        - `src/lib/delivery/from-branch.ts:555-559`
        - `src/lib/git/worktree-roster.ts:360,424`
        - `src/lib/handoff/restate-candidates.ts:64`
        - `src/lib/markdown/authority.ts:90,98,166`, `descriptor-worktree.ts:39`, `selection.ts:17,18`
        - `src/lib/recover/audit.ts:551,554`
        - `src/lib/setup.ts:147`
        - `src/lib/user-sync/parser.ts:53`, the surviving cross-work-unit parser
        - `src/scripts/review-gate/readiness.ts:668,715,732,784,903,928,975`
    - **Layout-resolver calls with a work-unit kind — 12 in 8 files**, under `src/`:
        - `handlers/plan.ts:155`
        - `lib/git/foreign-artifact-detection.ts:407`
        - `lib/load-set/projection.ts:113,121`
        - `lib/session-init/cohort-doc.ts:78`
        - `lib/status/project-view.ts:562,711`
        - `lib/user-surfaces.ts:72,79`
        - `lib/view-artifact.ts:163,209`
        - `scripts/review-gate/policy/pre-publication-composition.ts:611`
    - **Elsewhere:** the recount's other hits sit under existing register rows, are carved, are the resolver's own
      definitions, or are message text and conventions rather than path access. `lib/user-surface-migration.ts`
      is a pre-release compatibility reader and is judged there rather than here.

- _Approach:_ callers ask the contract for a record or its projected path. The contract's in-repo implementation and
  the projection both resolve paths through `resolveArcPath` (`lib/layout/projection.ts`, from `cli-layout-resolver`),
  so one layout authority remains, and the ref backend later replaces the implementation beneath it with no caller
  changing. Doing this once at the seam, rather than first moving these sites onto layout tokens, migrates each site
  a single time.

- _Captured during:_ `cli-substrate-complete-migration` draft-design, 2026-09-28.

### `[ ]` **Let `arc rename` rename a backlog stub inside an Errand instead of on its own branch**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-30); captured during Errand `state-storage-recut`,
  renaming `arc-backend` to `storage-contract`, 2026-09-28.
- _Observation:_ `arc rename <slug> <new-slug>` on a backlog stub runs on a fixed short-lived branch,
  `chore/rename-<old>-to-<new>`, cut from base (`withRenameStubBranch`, `lib/work-unit/rename-identity.ts:160`). It
  switches the primary checkout to that branch, commits there, and switches back to base. Inside an open Errand
  the verb therefore cannot contribute to the Errand's branch: it moves the checkout off the Errand and leaves a
  second branch that needs its own pull request. Grooming that renames a stub alongside other backlog edits has to
  reproduce the verb by hand — directory move, meta rewrite, artifact-filename code spans, and `Depends On` edges
  (`rename-reference-sweep.ts`) — which is the error-prone path the verb exists to remove.
- _Approach:_ when the invoking checkout already holds a transient role on a non-base branch, apply the stub rename
  and its reference sweep there and leave the commit to the enclosing ceremony, or refuse with a typed remedy that
  names that route. Keep today's short-lived branch for a bare invocation from base.
- _Fold-in:_ the register's `arc rename` stub-branch row already rewrites a rename as a store write, so no interim fix
  is taken. Carry this as that row's acceptance case: a rename invoked from a checkout holding a transient role
  contributes to that transient, with no branch switch and no second change request.

### `[ ]` **Record an Errand's frontline skip so a head move before standard review cannot reopen the phase**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-seam`), housekeep drain (2026-09-30); captured during
  Errand `frontline-pre-pr-only`, 2026-09-28.
- _Observation:_ frontline is an opening phase, closed by a recorded skip, a terminal frontline result, or any
  standard-review attempt, and never re-entered once the change request opens. Errands now share that closure
  (`frontlinePhaseClosed` in `frontline-phase.ts`), read from their claim-keyed lane-progress records. The recorded
  skip is the exception: its marker (`frontline-phase` operation state, `recordSingletonFrontlineInitialSkip`) is keyed
  by Candidate ID, so an Errand skip leaves no durable trace. If an Errand skips frontline and its head then moves
  before any standard-review attempt and before the PR opens, `frontline resolve` offers the phase again.
- _Approach:_ give the phase marker a subject keyed by vehicle lineage rather than Candidate ID, so an Errand claim
  can carry it, and record it on an Errand's accepted skip. That is a new stored record shape, which the pull-forward
  filter keeps out of Errands; design it with the seam's review-and-evidence partition.
- _Naming:_ rename the concept from "phase" to "window" in the same redesign. "Phase" overloads task-plan phases, and
  "stage" would collide with work-unit lifecycle stages; the Owner agreed "window" fits the one-time pre-change-request
  opportunity. Rename it everywhere at once: `frontline-phase.ts` and `frontlinePhaseClosed`, the `frontline-phase`
  record kind and its operation-id domain, the `frontline-phase-closed` diagnostic, and the driver's `phase-closed`
  skip reason.

### `[ ]` **Reconcile the storage state-path register count with file-exact layout evidence**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-seam`), housekeep drain (2026-09-30); captured during
  `cli-substrate-complete-migration` Task 5.4, Phase 5 layout reconciliation.
- _Observation:_ The storage-coupling register's state-path row records 36 hand-built state-class lines in 19 files
  at `7ddab4979` and explicitly excludes `src/lib/delivery/from-branch.ts:555–559` as basename classification.
  The migration work unit's earlier recount placed those five lines in the 36, while the Phase 5 reconciliation
  classifies them under lifecycle classification. The current 15-class layout scan has file-exact rows for
  surviving state-path access, including `arc-root` hits outside the historical state-class count.
- _Approach:_ Re-derive the register's counted state-class line and file set from the current Phase 5 rows, keep
  basename classification under its lifecycle row, and update the historical count or its evidence citation so
  the storage-seam implementation has an exact migration target.

### `[ ]` **Retire the live transition-record test when lineage moves to the store**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-seam`), housekeep drain (2026-09-30); captured during
  Errand `transition-record-checks`, 2026-09-30.
- _Observation:_ An integration test reads the tracked transition records in `.arc/system/.internal/transitions/`
  directly and checks them for structural integrity: each parses, round-trips to canonical bytes, is the one record
  for its origin under `<origin>.json`, and projects to a valid reference set. The ARC contract test tier runs it,
  so docs-only pull requests that add or change a record are checked. The storage register row for Candidate and
  transition records names the records but not this reader. Once lineage is a store family written only by verbs,
  the folder is gone and the store's own record validation carries the integrity check.
- _Approach:_ When the seam moves transition records into the store, delete `live-transition-records.test.ts` and
  its entry in the ARC contract tier selection (`src/lib/local-vitest-runner.ts` and that module's unit test). If
  missed, the test fails loudly at the seam on the missing directory rather than passing vacuously.

### `[ ]` **Flip ADR-022 to Accepted as storage-seam's first action**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-seam`), housekeep drain (2026-09-30); captured during
  `storage-contract` draft close, 2026-09-30.
- _Observation:_ ADR-022's file-as-record amendment (register batch 3) moved its flip trigger to `storage-seam`'s
  kickoff, since the seam builds the family parsers (`storage-contract` C2).
- _Approach:_ Make flipping ADR-022 to Accepted the kickoff's first action.

### `[ ]` **Close the user workspace after the lifecycle executor's record writes, not before**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-seam`), housekeep drain (2026-09-30); captured during
  `storage-contract` draft-design, readiness gap on the in-repo implementation (2026-09-30).
- _Observation:_ The lifecycle executor fires its declared side effects at step 6, the user-workspace close among
  them (`runUserClose`, which removes the work unit's user directory recursively, `SESSION-NOTES` included —
  `commands/user/close.ts:25`), and only then runs the step 7–8.5 meta writes (`lib/work-unit/lifecycle-executor.ts`).
  A throw in those writes returns `finalize-failed`, which is forward-recoverable for the transition, but the
  workspace is already gone, with only a notes snapshot behind it.
- _Approach:_ In the executor write-path rewrite (its register row), close the workspace after the transition's
  records are written. The storage contract's in-repo implementation refuses a batch spanning substrates, so the close
  stays a sequenced step until the flip — ordered after the records, with an idempotent rerun.

---

## Prior Design — `singleton-integration-continuity` (pre-ADR-035 reading input)

> _The seed design record of `singleton-integration-continuity`, dissolved at the `state-storage` re-cut_
> _(2026-09-28): its storage-created half is this work unit's buffer above, its state-vocabulary entries are_
> _`wu-lifecycle-state-model`'s, and its two storage-independent entries are Errands. "This work unit" below_
> _means that stub; the entries it cites by title now sit in those homes._

- _Proposal shape:_ mint a new work unit from the back-end half of the existing `wu-lifecycle-state-model` stub,
  and add it to `RELEASE-GATES.md`'s stabilization sequence as the non-delivery sibling of the three `delivery-*`
  work units. This is a **split plus schedule**, not a new concern: most of the territory is already captured in
  that stub's inbound buffer. Do not re-derive it at drain; read the buffer first.

- _Why split rather than fold in._ `wu-lifecycle-state-model`'s stated Purpose is front-end — unbundling
  planning-completeness from activation/scheduling so async parallelism can hold impl-ready work in the backlog.
  Its buffer has since accreted the back-end: publication → merge → archival → teardown state coherence. Those
  are two designs sharing the word "lifecycle". Folding this session's defects into the existing stub makes an
  already-large stub larger and later, and couples an urgent corrective need to an unrelated reform.
  `RELEASE-GATES.md` already warns against growing one uncut work unit ("Do not extend the consolidation
  further"); splitting is the same instinct applied in the other direction.

- _The spine, stated as one thing._ Every defect observed belongs to a **seam between three state machines that
  were each designed separately**, not to a bug inside any one of them: the **Candidate** (subject digest,
  lineage, terminus), the **lifecycle position** (`Active`/`Integrating`/`Shipped`, `active/` vs `completed/`),
  and the **integration checkpoint** (base movement, publication currentness, merge authority). A work unit that
  owns "these three agree from publication through merge to archival" has a real boundary; one that owns "assorted
  singleton bugs" does not.

- _Why it rotted unobserved._ Recent work has concentrated on stacked delivery, which exercises its own code path
  through the same ceremonies. The singleton integration tail has not been walked end to end in some time. The
  three `delivery-*` work units in the runway are scoped at delivery mechanics — stacked members, private chains,
  correction convergence — so none of them would have surfaced this.

- _Evidence: five reproductions from one continuous run_ (`delivery-post-landing-conflict-recovery` integration,
  2026-09-18/19), each recorded in its own entry above where one exists:

    1. **Terminus vs the mandatory base merge** (Candidate ↔ checkpoint). An accepted terminus is bound to an exact
       subject digest; the checkpoint requires a base reconcile; the reconcile changes the digest and invalidates
       the terminus; the only route to re-accept one appears solely after a completed pass, which the invalidation
       zeroes. Execute-bound errand, queue position 1.
    2. **Swept work unit misreported** (lifecycle ↔ status). After the archive commit, `arc status {name}` returns
       `planning / active` for the checked-out work unit. Execute-bound errand, queue position 2.
    3. **Archive-before-merge circular dependency** (lifecycle ↔ checkpoint). Under `archive.cadence:
       with-integration` both positions block once the boundary is stale: archived routes to a continuation that
       refuses on a shipped work unit, un-archived blocks on `lifecycle-incomplete`.
    4. **Archival destroys review evidence** (lifecycle ↔ evidence). `arc archive` retires the per-WU user
       workspace, taking the raw evaluator reports with it; only the narrative survives, because composition
       happens to run first.
    5. **Singleton routed through a delivery reader** (singleton ↔ delivery). `arc review status --work-unit`
       returns an operational-failure remedy for what is simply the wrong route for a non-delivery work unit.

- _Prior art already in the stub's buffer — confirm, do not re-derive:_

    - **"Recognize the archived-but-not-torn-down work unit as a proved terminal frame"** (2026-08-03) describes
      defect 3's interval exactly: "the supported integration cadence archives the active meta before merge and
      physical teardown. An interruption in that interval leaves a valid durable role whose active-subject
      projection is `subject-unresolved`."
    - **"Prevent local-ref residue from outranking an archived Shipped record"** (2026-08-20) is very likely
      defect 2's mechanism, already diagnosed with a fix direction: a lingering `feat/<slug>` ref outranks an
      authoritative `completed/` meta, and "deleting the lingering branch immediately restored the correct Shipped
      result". **Unconfirmed:** that entry reports `Active` where this session observed `Planning`. Confirm they
      are one defect before designing, and merge the entries if so.
    - **"Own placement-as-record: directory layout is projection of lifecycle state"**, **"Formalize the shipped,
      pending-teardown worktree terminal condition"**, **"Prevent withdrawn singleton Candidates from reviving
      without a new public boundary"**, and **"The readiness reform has a tail-end twin: verification-passed wants
      a `Candidate` projection"** all sit on the back-end axis and should move with the split.

- _Forward-compat: both check-docs fire, and each names a real tension._

    - **`strategy-storage-evolution.md`** — two of its Self-Check triggers hit directly: "storage of WU artifacts
      — where `meta-*` … live" and "WU identity or branch coupling — how ARC associates WU records with git
      artifacts (branches, worktrees, commits)". Defect 2 _is_ a branch-coupling defect. The `active/` →
      `completed/<dated>/<NN>_{name}/` move is placement-as-record, which is a tracked-`.arc/` assumption; under
      the materialized-git-backing-store target, lifecycle state is a record in the store rather than a directory
      the file sits in. The fix must not deepen placement-as-record — resolve state from the record and let
      placement be a projection of it. In-repo remains a supported tier, so the move does not disappear; it stops
      being the source of truth.
    - **`strategy-procedure-evolution.md`** — the archive-before-merge ordering is **prose-encoded logic**. The
      checkpoint branches on `lifecycle.state === "shipped"`, but the reason it is shipped at that moment is a
      step ordering that exists only in `integrate-work-unit.md`'s narrative. No type expresses "archived early,
      under `with-integration`, and therefore not yet merged". That is exactly the accretion this check-doc warns
      against, and it is why defect 3 presents as a circular dependency rather than a typed refusal.

- _Residual after errand 1 lands — this work unit inherits it._ The terminus-carry errand
  (`chore/carry-accepted-review-terminus`, reviewed read-only 2026-09-19) gates the carry on
  `currentness.convergenceVerification === "satisfied"`, which is the only path that publishes with
  `repairCurrent: true`. That is the right gate and it clears defect 1 on the converged path. It leaves defect 3
  untouched: the `shipped` → `attestNewRootArgv` selector in `checkpoint.ts` and the
  `lifecycle-incomplete` ↔ `resume-pre-publication` circularity both survive. So whenever a boundary goes stale
  for a reason convergence does **not** satisfy, a shipped work unit still lands on `resume-pre-publication`
  with no reachable continuation — `arc review pre-publication` refuses on the absent active meta, `arc publish`
  is not open to a shipped work unit, and un-archiving to escape re-blocks on `lifecycle-incomplete`. The wedge
  is narrowed to a smaller entry condition, not removed. Whether that remaining entry condition is reachable in
  practice is worth establishing early here, because it decides whether this is a latent hazard or a live one.

- _Sixth territory item: a shipped work unit leaves its `plan/` branch behind, and nothing reaps it._ After ship,
  both `feat/<slug>` and `origin/plan/<slug>` survive. `arc teardown` resolves exactly one matching local branch
  and refuses on multiple matches; it does not discover or delete a live remote-only sibling (confirmed by the
  primary while reviewing errand 2, 2026-09-19). So the `plan/` ref outlives the work unit with no verb that
  retires it.

    - **This is defect 2's fuel supply, not a separate annoyance.** The surviving `origin/plan/<slug>` carries
      `State: Planning` in its tracked meta, and that branch observation is exactly what produced the
      `planning / active` misreport. Errand 2 corrects the _precedence_ so the archived meta outranks it; the ref
      still exists and is still read. Retire the residue and defect 2 loses its input entirely rather than being
      out-ranked at read time — worth deciding deliberately which of the two is the real fix and whether both are
      wanted.
    - **Ownership check, done 2026-09-19 — do not redo it.** `graduation-cleanup` covers planning-history squash
      and the `--force-with-lease` push at Planning → Active; a grep across its draft for stale/delete/remote/reap
      matched only that force-push line. It does not reap the branch. `delivery-native-stack-composition` owns a
      cleanup-driver gap, but for delivery candidate refs and temporary worktrees.  `review-checkout-lifecycle`
      owns review materializations and ceremony-created checkouts. None covers a singleton work unit's `plan/`
      branch, and no inbox entry claims it.
    - **Prior art one lifecycle class over.** The execute-bound errand "Reap zero-delta Errand branches during
      clean abandonment" states this principle exactly, for Errands: "a successful terminal operation immediately
      created an advisory the following operation had to investigate." Same shape, different subject. Decide
      whether the work-unit case is that errand generalized or a sibling of it; prefer generalizing, since two
      lifecycle classes independently reaching the same defect is the argument for stating the obligation once.
    - **Approach direction.** Make the ref set a work unit owns explicit, and have the terminal operation retire
      the whole set rather than one resolved branch. A multi-match should produce a reap plan, not a refusal.
      Cover local and remote-tracking refs; preserve anything unmerged or carrying unique content.

- _Advisory dependency — the residue advisory cannot be authored until this work unit supplies a verb._ The reflex
  fix is to warn about the residue. Two captures constrain that, and the order matters.

    - `operational-advisory-registers` holds the governing rule — "an advisory with no available action is not an
      advisory… either give it an action or do not raise it" — and already names a linked-worktree
      cleanup-residue section among the sections it must classify.
    - The execute-bound errand "Make the in-flight artifact advisory name its remedy" is closer still: same
      advisory family, same shadowed-meta trigger, and its approach appends an interlock-gated `git branch -d
      <branch>` remedy. But it scopes to "a local branch with no worktree and no marker," and this residue is
      remote-only. That is a **scope extension to that errand**, not a new concern — widen it there rather than
      opening a third site.
    - That errand also carries a standing escalation clause: it is "fourth in a family of diagnostics that report
      a state without naming the fix… If a fifth appears, state the obligation once in the spine rather than
      patching another site." A new cleanup-residue warning would be the fifth, so the clause fires — and this
      work unit is the spine for the lifecycle-tail half of that family.
    - **Ordering constraint:** no residue advisory can name a runnable verb until the reap above exists. Land the
      retire-the-ref-set behaviour here first; the advisory work then has something to point at.
    - **Corrected assumption — recorded so nobody re-derives it.** Stale branches do _not_ generate session-init
      noise. The derived-locus roster is checkout-based: verified 2026-09-19 against a live `arc recover audit`
      whose roster contained only `free-primary` / `work-unit` / `unresolved-checkout` / `unmanaged-checkout`
      rows, each keyed to a checkout path, with `locusGuidance.cleanup: []` and no row for the then-live
      `origin/plan/delivery-post-landing-conflict-recovery`.
    - **The residue is unmonitored at rest, and that is the sharper form of the problem.** The in-flight
      derivation advisory (`in-flight-derivation.ts`, "… was shadowed by …") fired at every publish and archive
      ceremony in this run, which makes it look like the residue is being reported. It is not, at the state that
      matters. `classifyInput` enumerates **active** metas only — "every readable meta becomes a work-unit
      candidate" — and `dedupeWorkUnitCandidates` emits `candidate-shadowed` only for group members that lost to
      a winner. Before the archive, `feat/<slug>` and `origin/plan/<slug>` both carry an active meta, the group
      has two members, and the advisory fires. The archive moves the `feat/` meta to `completed/`, the group
      drops to one, its sole member wins by default, and the warning stops — at exactly the moment the `plan/`
      ref becomes permanent residue. Confirmed 2026-09-19 against the errand-2 terminal-topology regression,
      which leaves one warning and it is not this one. Note the silencing is caused by the **archive step**, not
      by errand 2's precedence change, which does not touch this module; do not mis-attribute it to the fix.
    - Consequence for the reap work above: there is no standing signal for this residue at all. The advisory
      covers only the transient pre-archive window, so the permanent state is unobserved rather than merely
      noisy. That strengthens the case for a reap verb instead of better reporting.

- _Scope boundary — what this work unit does **not** take._ Review-lane contracts (pass accumulation across an
  approved fix, the unstated protocol-ordering constraint) belong to `review-activity-contracts`; folding them in
  would recreate the same two-axis error this split exists to correct. Pure ergonomics (commit-template subject
  overflow, the frontline action that loops, the unsatisfiable singleton remedy) stay errands. Delivery mechanics
  stay with the three `delivery-*` work units.

- _Sequencing._ Errands 1 and 2 ship first and independently — they unblock the wedged work unit and should not
  wait on this design. This work unit then takes the structural question, including whatever those two fixes
  reveal. Note the ordering is not optional: this work unit would hit defect 1 at its own merge, so it cannot
  dogfood itself until errand 1 lands.

- _Open questions for the Owner at drain._ Whether the front/back split of `wu-lifecycle-state-model` is clean or
  whether the core async reform depends on back-end axes in ways the buffer does not show; whether the back-end
  half takes a new slug or keeps the existing one with the front-end half re-stubbed; and where it lands in the
  `RELEASE-GATES.md` order relative to `delivery-rebuild-continuity` and `delivery-correction-convergence`.

- _Honest limit on the evidence._ One continuous run, on one work unit, in the self-hosting repository. The
  reproductions are solid and several are independently confirmed in the buffer from earlier dates, but the
  breadth claim — "the singleton integration tail has an unobserved seam" — rests on this one walk plus that prior
  art, not on a survey.

- _Captured during:_ `delivery-post-landing-conflict-recovery` integration, 2026-09-19, at the point where the
  work unit could not complete its own merge.

---
