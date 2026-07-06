# Notes: Finalize Parallelism

Execution-reference context alongside `spec-finalize-parallelism.md` — sequencing/coordination and sizing that
the spec's design body doesn't carry.

## Contents

- [Sequencing & coordination](#sequencing--coordination)
- [Shared-mutable-surface matrix](#shared-mutable-surface-matrix)
- [Seam trace-throughs](#seam-trace-throughs)
- [Adversarial pass](#adversarial-pass)
- [GA checklist starting state](#ga-checklist-starting-state)
- [Scope & sizing](#scope--sizing)

## Sequencing & coordination

No goal-aware-direction mechanism exists yet, so the pre-FP sequence and the still-live cross-WU coordination
edges are recorded here rather than in a tracked sequencing surface. The pre-FP dependency drain has landed
(the behind-base reconcile gate and the sweep base-ref index shipped as pre-FP errands; the `arc status <slug>`
drain-time check landed in the rules + strategy). The edges that remain live during FP's own run:

- **Deterministic ROADMAP handling before wave 1.** Concurrent ROADMAP regens from different base states are a
  wave-1 surface; the deterministic renderer slice from `roadmap-tooling` must land before wave 1, and it also
  unblocks BI-4's CLI-complete `arc start` (deterministic ceremony-commit content). The full Heavy WU is not the
  gate; the slice slots *beside* FP Phases 1–2, not ahead of FP's start. `tasks-finalize-parallelism.md` tracks
  the gate explicitly in Phase 2.R.
    - **2.R.1.a scope verdict:** pull a dedicated renderer-command slice rather than starting the whole Heavy
      `roadmap-tooling` WU. The existing FP branch already has `composeProjectReadinessView` plus lifecycle/start
      ceremony ROADMAP write paths; the missing gate-facing piece is a public, testable render/check command or
      equivalent slice that wave sessions can invoke. Include only deterministic `ROADMAP.md` refresh for lifecycle
      / start ceremony and manual-trigger use. Exclude `STATUS.USER`, `STATUS.PROJECT` rename, link reanchoring,
      shared render-standard extraction, and buffer cleanup.
    - **`operational-state-docs` boundary:** treat the slice as an interim markdown composer over meta files.
      Do not build the generic render/reconcile projection engine, structural-contract migration, or managed-record
      substrate here; those stay with `operational-state-docs` / its decomposed members and later absorb this
      renderer boundary.
- **`interlock-release-refinement` consumes FP's burn-in evidence (post-waves).** Its parallelism-relevant slice
  (integration-time interlock-stacking collapse) either slice-extracts per its own draft, or — preferred —
  consumes this WU's evidence of which stops actually hurt under concurrency and which weren't decision-bearing
  after a trust grant. Inverted out of the hard pre-FP path; approval friction during the sacrificial waves is
  tolerable by design and never corrupts.
- **`sync-primitive-discipline` adjacency.** BI-3 ships the contained lock re-anchor; the principled
  ref-CAS-with-retry rewrite of the notes save routes here. Pull it adjacent to FP or name it a seam-audit input.
- **`graduation-cleanup` coordination.** BI-4's spawn-mode transition rework shares surface with
  graduation-cleanup's flip-time history-hygiene ceremony — coordinate or sequence at its pickup.
- **Coordination-seam captures** (the batch-errand/drain-shape seams, the same-entry-merge build home, the
  `/arc-shift` disposition) are routed at planning close via gitignored `USER-INBOX` captures, not by editing
  sibling WUs' tracked buffers from this branch.
- **Mid-flight build-items forward-port (Phase 2.I) is a base write — sequence it.** The build items reach `main`
  as a code-only forward-port before the waves (so wave worktrees run the observer's CLI), which writes
  `origin/main`. Coordinate with any concurrent base writer (sibling WU integration, errand / housekeep PRs) as a
  normal base merge; FP then merges `main` back. Defaults stay unflipped — the mechanism lands, the `--here`→spawn
  default does not (Task 8.3).

### Dogfood finding (2026-07-05): worktree launch model

Surfaced dogfooding FP from the primary. Three coupled findings: the first two reshape **BI-4** and add a
launch-model doctrine question to the GA scope; the third (below) reinforces the spawn-anchored model with
recovery-integrity evidence and reshapes **BI-6** (Task 2.6.e).

**Relocate desync (retires BI-4(c) as SOP).** `EnterWorktree` — Claude Code's BI-4(c) "true relocate" — hops the
*agent process* cwd into the linked worktree, but the developer's terminal and tooling do not follow: Warp + Herdr
(and any GUI multiplexer, e.g. Superconductor) still present the primary. Structural, not a tool bug — a child
process changing its own cwd has no channel to reconfigure the parent terminal / multiplexer / GUI; OSC-7 / title
escapes would not move a shell cwd or a pane, and GUI apps get nothing. ARC cannot fix it (above its layer), and the
desync between the human's tooling model and the agent's is a dealbreaker for making relocate the SOP. So: demote
layer (c) to an escape hatch at most (a developer who does not care about terminal sync), never the recommended path
— the objection is harness-independent in spirit even though only Claude Code offers the relocate. Promote the
**spawn-anchored** shape (a fresh session started *in* the worktree) from Codex-specific fallback to the
**universal** model, resting on (a) CLI-complete `arc start` from the bare shell + (b) the mini-handoff into the
seeded `SESSION-NOTES` so the fresh session boots rich. Design inversion: **ARC establishes the worktree; the
developer arranges their own tooling; the agent starts fresh in the worktree** — ARC does not drive the terminal /
GUI (out of its control, wildly per-developer). "Seamlessly continue the same session" is off the table as a goal;
"cleanly hand off to a fresh in-worktree session" replaces it.

**Launch-flow / `--start` purpose (GA-scope question, not solve-now).** Keep two entry intents distinct: (1)
*don't-know-what-to-start* → discovery, agent-mediated (`arc-session` discovery arm), keep; (2) *know-what-to-start*
→ a clean CLI op (bare `arc start <slug>`, the (a) substrate), so the developer arranges tooling between launch and
agent-start. But a real **middle ground** the two poles miss: even knowing the target, an `arc-session`-style agent
already carrying the core ARC loadset earns value *before* launch — vet/verify impl-readiness, a second opinion,
sanity-checking the pick. An agent-mediated launch must earn its keep beyond "you did not type the CLI yourself," or
it has no purpose. Open question: the `arc-session --start <slug>` skill signal (which opened the session that
surfaced this) either (i) should not exist — bare CLI is the same effect, and routing it through the full discovery
session-init path is wasteful — or (ii) should be repurposed (likely a different verb): *same effect as the bare CLI
launch, but an ARC-loaded agent vets/verifies before the launch fires*. Still handle the pure just-launch-it case,
but never require an agent that adds nothing. Closing loop: the `--start` shortcut that opened this session is itself
the "launch and seamlessly continue in one session" ambition that walked into the relocate trap — the ambition is
the anti-pattern.

**Bonus BI-6 evidence.** The reflex to capture this so it is not lost routes to `USER-INBOX`, but from this linked
worktree that writes FP's *divergent local* inbox copy (the 2026-07-04 divergence), not the canonical primary — so
the finding lands in these tracked notes instead. The capture reflex hitting the wrong inbox is one more instance of
the BI-6 identity-global-surface gap.

**Compaction-recovery integrity (reinforces spawn-anchored; adds Task 2.6.e).** This session's post-compaction
recovery read a seed describing `main`, not FP — proof the launch model has teeth beyond terminal UX. Two distinct
mechanisms, verified in code: (1) *Capture* — the PreCompact / SessionStart hooks resolve their root from
`CLAUDE_PROJECT_DIR` (unset here) → `git rev-parse --show-toplevel` at the *harness* launch cwd, which is the primary
under relocate; the agent's per-command `cd` is invisible to them, so the emit captured `main`. Spawn-anchored launch
(harness rooted *in* the worktree) fixes this — recovery-integrity evidence for the (a)/(b) model, verified by a
wave. (2) *Storage* — 2.6.a routed the seed through the identity-global resolver (→ primary), but the seed is
per-session state; under concurrent worktrees every session clobbers the one shared seed (last-writer-wins) and
recovers another worktree's state. This bites the *blessed* concurrent path, not the relocate one, so spawn-anchored
does **not** fix it — hence **Task 2.6.e** re-binds the seed worktree-local. No harm this session: the harness's own
compaction summary + tracked state carried the real context; the ARC seed was inert.

## Shared-mutable-surface matrix

This is the finalized Layer-1 starting state for the burn-in waves. It is a source-checked classification
matrix, not the wave evidence itself: waves still induce the conditions and verify the detectors/recovery paths.

Disposition key: **BI-n** = committed build item in `tasks-finalize-parallelism.md`; **wave n** = live burn-in
verification; **playbook** = document/recover rather than build inside FP.

### A. Repo-shared surfaces — common git dir or remote

- **Base branch.** Writers are WU integration, errand / housekeep grooming PRs, and any partial-protection direct
  base commit. The remote serializes the ref update, so two pushes/merges do not overwrite each other, but a branch
  can merge cleanly after `main` moved under its premise. Classification: **silent semantic drift unless the
  behind-base gate fires**. Disposition: pre-FP behind-base reconcile gate is landed; **waves re-verify** the
  session-init / integration surfaces and **playbook** carries recovery.
- **`refs/notes/arc/user/{id}`.** Writers are `arc user save`, handoff/sync saves, and paired push paths across WU
  sessions, errands, housekeep, and machines. The local notes write is `git notes add`: `runUserSave` wraps it in a
  per-identity advisory lock, but the lock currently anchors under the checkout's `.arc/user/{id}/.internal/`, so
  sibling worktrees on the same machine still acquire distinct locks and can race the shared ref. Cross-machine
  push divergence reconciles through the notes push/merge path, but same-machine local ref clobber remains the
  decisive gap. Classification: **silent**. Disposition: **BI-3** re-anchors the lock at the git common dir; **wave
  1** induces same-machine sibling notes saves.
- **Paired-push sibling-note export.** The same local notes ref is shared by sibling worktrees, while paired push
  pushes only the current branch before publishing the whole notes ref. Interleaving A save, B save, A paired push
  can publish B's note for an unpushed B commit, violating the branch-before-notes invariant while still succeeding
  and clearing the partial-push marker. The BI-3 common-dir save lock prevents local note clobber but does not make
  notes export branch-bounded. Classification: **silent invariant violation**. Disposition: **BI-3** adds a
  branch-bounded paired-notes export / reachability guard; **wave 1** induces the export-before-branch case.
- **Same-entry cross-WU resolution.** Writers are concurrent edits to one `WORKING-MEMORY` / `USER-INBOX` entry that
  later merge through the notes window. `mergeCrossWuFile` unions different entries, honors live removal
  tombstones, and resolves the same `(section, key)` identity by the most-recent note that mentions it. Two
  genuinely concurrent edits to one entry therefore produce a last-note-wins lost update. Classification:
  **silent, narrow, recoverable**. Disposition: **playbook** limitation for GA; deterministic tie-break / causal
  ordering is a fast-follow build candidate outside FP. **Wave 3** exercises the three-remover `USER-INBOX` seam.
- **`refs/arc/user/{id}/sync-state`.** Writers publish per-machine partial-push markers before the notes leg. Direct
  writes use tree commits with compare-and-swap retry; cross-machine non-fast-forward pushes reconcile by
  per-machine union. Today each worktree mints a distinct `.machine-id`; after **BI-3** sibling worktrees share a
  workspace machine id, so a same-workspace marker publish can overwrite a sibling's marker. That is
  presentation-only only when no earlier live notes-push intent is hidden; two unresolved sibling intents under one
  key can otherwise make a cross-machine resume miss notes lag. Classification: **loud / aware when every live
  intent remains represented; silent if same-workspace key collapse hides one**. Disposition: **BI-3** keys marker
  storage by export intent, retains machine id as provenance, and uses the same planned export target as the notes
  leg; **wave 1** verifies cross-worktree detector reads and the multi-intent shared-key case.
- **`refs/arc/user/{id}/errands`.** Writers are errand open/close/promote and errand partial-push recovery. Direct
  writes use the same tree-ref compare-and-swap retry; remote non-fast-forward pushes merge distinct slugs and
  surface divergent same-slug records as a conflict, leaving the local ref intact. Classification: **loud**.
  Disposition: **wave 3** verifies live errand beside concurrent WUs.
- **Git-guarded repo surfaces.** Worktree registry, branch creation, branch delete/push, `.git/config`, and
  lower-level `update-ref` races are guarded by git's own locks / old-value checks / refusal behavior. A second
  writer sees a refusal or non-fast-forward, not silent loss. Classification: **loud**. Disposition: **playbook**
  records symptoms and retry/reconcile steps.

### B. Tracked, branch-mediated surfaces

- **`ROADMAP.md`.** Writers are lifecycle ceremonies and hand-rendered readiness updates; the shipped executor still
  emits a "ROADMAP regen pending" advisory until `roadmap-tooling` owns the real renderer. Ordinary branch merges
  usually conflict on concurrent table edits, but a stale derived render can merge cleanly when the changed rows do
  not overlap. Classification: **loud with silent stale-render residue**. Disposition: `roadmap-tooling` before
  **wave 1**; wave 1 exercises concurrent ROADMAP regen live.
- **Foreign stub metas / draft buffers.** The housekeep drain routes captures into existing stubs from a base-branch
  write context; a concurrent owning-WU graduation/groom can move the target directory while the drain's branch
  edits the old path. The rule-level mitigation is to resolve lifecycle state by slug (`arc status <slug>`) before
  treating a stub as live, but a post-check race can still orphan a routed note until merge review catches it.
  Classification: **silent residue**. Disposition: drain-time status check + **wave 3** drain-shape evidence;
  recovery goes to **playbook**.
- **`completed/` archive index.** `computeArchiveDestination` assigns `completed/{quarter}/{NN}_{name}` by scanning
  the current quarter and picking `max(NN)+1`. Two concurrent archives from the same base can mint the same `NN`
  with different slugs and merge without data loss but with duplicated completion-order numbers. Classification:
  **silent cosmetic drift**. Disposition: **playbook** renumber recovery; base-ref shipped-set reads reduce stale
  consumers but do not change the assignment mechanism.
- **`ATOMIC-INBOX`, cohort docs, and `arc-config.yml`.** Writes are rare, human-reviewed, and branch-mediated:
  housekeep flushes homeless atomics, cohort decomposition/closeout updates coordination docs, and config edits are
  explicit operator changes. Overlap is a normal textual merge conflict; disjoint additions can merge cleanly
  without semantic loss. Classification: **loud / acceptable**. Disposition: **playbook** for conflict resolution.

### C. Per-checkout gitignored state

- **Harness integration layer.** Fresh worktrees do not receive `.claude/`, `.codex/`, `.gemini/`, hooks, skills, or
  harness allowlists from git. Without the layer, a session may start outside ARC's recovery and skill machinery,
  which is silent until a recovery/skill path is needed. Classification: **silent blocker**. Disposition: **BI-1**
  registered harness-dir copy-from-primary; **wave 1** verifies harness presence in doc-only worktrees.
- **`node_modules`.** Fresh worktrees lack project dependencies, so node-backed gates fail off-primary; the known
  bare-`npx arc` foreign-registry edge makes "just invoke npx" insufficient. Classification: **loud blocker**.
  Disposition: **BI-1** `worktree.post_create` provisioning; **wave 2** verifies a code WU's gates off-primary.
- **`worktree-marker.json`.** `writeWorktreeOwnershipMarker` writes
  `.arc/system/.internal/worktree-marker.json`; the source comment says the marker is gitignored, but the live
  repo only ignores `pristine.json`, so a spawned worktree currently becomes dirty. Classification: **loud**.
  Disposition: **BI-1** ignore-rule registration / ignored-path move; **wave 1** verifies clean marker state.
- **User files.** Per-WU `SESSION-NOTES` is correctly checkout-adjacent, but `WORKING-MEMORY`, `USER-INBOX`,
  `STATUS.USER`, future `VECTOR.USER`, and identity-global nudge markers are semantically cross-WU while physically
  checkout-local. Live evidence 2026-07-04: the primary and FP worktree inboxes diverged, and the primary probe saw
  only its own captures. Classification: **silent gap**. Disposition: **BI-6** canonical identity-global resolver
  with storage-forward-compat checked against `strategy-storage-evolution.md`, `draft-arc-backend.md`, and
  `operational-state-docs`; remaining row-A same-entry and removal-race seams stay in wave 3 / playbook.
- **`.machine-id`.** `getOrCreateMachineId` currently stores a bare UUID at `.arc/user/{id}/.internal/.machine-id`,
  so sibling worktrees on one machine mint distinct ids. That fragments sync-state marker identity and keeps marker
  semantics per-checkout instead of per-machine. Classification: **silent presentation/coherence drift**.
  Disposition: **BI-3** git-common-dir machine id; **wave 1** verifies sibling worktrees share one id.
- **Spawn-mode transition writes.** The executor's production binding opens user workspaces and stages relocation
  against its bound `cwd`; FP's spawn-mode graduation exposed that the invoking checkout, not the spawned checkout,
  received the transition writes. The spawned session then cannot resolve the WU from its own active tree.
  Classification: **silent until resume fails**. Disposition: **BI-4** spawn-mode ceremony-locus fix; **wave 2**
  re-graduation verifies.
- **`compaction-seed.json` and sibling per-checkout markers.** `resolveCompactionSeedPath` writes one seed per
  identity checkout. Two sessions sharing a checkout overwrite the same file; once a baseline exists, drift is
  visible, but the first-write race has no prior state to compare. Worktree-per-session isolates the steady state.
  Classification: **loud after baseline, first-write silent**. Disposition: one-session-per-checkout invariant +
  **playbook**; waves observe whether any shared-checkout case remains.
- **Audit log.** The release-wrapper audit log appends to `.arc/user/{id}/.internal/.audit-log.jsonl` per checkout,
  and write failure is intentionally non-blocking. Under worktrees the trail fragments by checkout; no work state is
  lost. Classification: **informational completeness gap only**. Disposition: **playbook** note and
  `operational-state-docs` follow-up candidate.

### Cross-cutting row

- **Probe-snapshot staleness (TOCTOU).** Session-init, handoff, and sync decisions read a coherent snapshot and act
  on it; a sibling session can invalidate the snapshot immediately after orientation. The next probe catches the
  drift, and destructive operations still have their own git/dirty/ref guards. Classification: **bounded stale
  premise, self-correcting**. Disposition: **playbook**; every wave deliberately re-probes detector surfaces before
  declaring them verified.

## Seam trace-throughs

These are the two Layer-1 non-write-race seam suspects traced to source. The trace classifies the contract and the
remaining verification hook; the burn-in waves still exercise each one in practice.

### Projection-builder consumer contract

- **Producer contract.** `projectManifest` is a pure projection over an existing sync manifest: it preserves the
  manifest version and path set, strips `## Removed:` sections only from registered cross-WU flat files, and leaves
  per-WU subdir files plus unknown-shape flat files unchanged. `stripTombstoneSections` also preserves
  tombstone-free content byte-for-byte via its early-out, so ordinary sync content is not normalized by accident.
- **Consumer assumptions.** `save-load.ts` writes local sync-state hashes over the projected save/load manifest,
  while raw save readback still verifies the unprojected manifest so projection cannot mask note-write corruption.
  `sync-status.ts` compares projected note, projected disk, and materialized local hash on one tombstone-free basis.
  `merge.ts` strips tombstones from the most-recent base before reconstructing older-only entries and appending the
  current winning tombstones.
- **Classification and disposition.** The contract is **source-consistent today** but **silent-if-drift**: a future
  producer/consumer mismatch could make status read stale/current incorrectly, materialized hashes disagree, or
  tombstone noise re-enter reconstructed content without a hard failure. Disposition: **wave 4** exercises the
  projection contract under cross-machine resume; any drift found there becomes a contract-test or record-projection
  fast-follow rather than an unclassified GA seam.

### Errand-vs-WU teardown symmetry

- **Errand close path.** `openErrand` mints an identity-scoped record in `refs/arc/user/{id}/errands`, optionally
  carrying an inbox-origin back-pointer, and occupies the errand branch in place. `closeErrand` refreshes the base,
  refuses unsafe reaps before record removal, switches off the branch when needed, deletes the local branch only
  after preservation is proven or force-authorized, prunes stale tracking refs, fast-forwards the local base when it
  can, then removes the record and pushes/reconciles that removal. The handler records a partial-push marker on
  deferred record-removal pushes and drops the originating `USER-INBOX` entry only after a successful close; that
  drop is idempotent.
- **WU ship and teardown path.** `integrate` is just the `Active -> Integrating` phase flip; it does not merge or
  reap. `archive` is the mergeable ship: relocate artifacts to `completed/`, set `State: Shipped`, clear the meta
  `Branch` field logically, and close the per-WU user workspace via the `user-workspace` side-effect. Physical
  cleanup is the post-merge `teardown` verb: gate on `completed/` presence, resolve the branch by slug because the
  meta `Branch` field is already `[none]`, remove a linked worktree first or switch the primary to base for the
  in-place arm, then run the merged-safe branch delete and prune. `arc user close` is also replayed in the
  integration tail as an idempotent filesystem-only closer for unattended merges.
- **Classification and disposition.** The paths are **intentionally asymmetric but non-interfering**. Errands own a
  record + optional inbox-origin cleanup and currently have no spawned worktree or per-WU `SESSION-NOTES`; WUs own
  lifecycle artifacts, per-WU user workspace cleanup, and optional linked-worktree teardown. Both delete durable
  intent/projection state only after the work is preserved or the caller has explicitly authorized the destructive
  path. Residual concurrency is already named elsewhere: errand-ref same-slug conflict is loud and wave-3 verified,
  `USER-INBOX` same-entry loss remains the row-A limitation, and branch/worktree refusals are git-guarded loud
  failures for the playbook.

## Adversarial pass

Fresh-context review ran two broad passes plus one targeted BI-3 design pass. Pass 1 found the paired-push
sibling-note export gap, folded into matrix row A, BI-3, and wave 1. Pass 2 confirmed that gap was represented,
then found the sync-state marker multi-intent gap now folded into BI-3 / wave 1, plus the lower-materiality
`USER-INBOX` local removal RMW residue folded into wave 3 / playbook handling. The targeted pass confirmed BI-3 is
a contained extension, not a bad pivot, but tightened the design: `.machine-id` is provenance only; marker storage
is keyed by export intent, and marker `intent` must match the notes export target actually attempted. The passes
withstood source checks for the projection contract, teardown paths, errand ref, archive index, ROADMAP
stale-render, foreign stubs, harness/deps provisioning, compaction marker, and audit-log rows.

## GA checklist starting state

The checklist starts from the finalized matrix above. It closes only when the build gates land, waves induce the
named detector conditions, and the playbook/doctrine closeout absorbs the accepted limitations.

### Build gates before waves

- [ ] **BI-1:** spawned worktree provisioning: deps script, registered harness capability handling, per-WU user
  workspace scaffold, and clean worktree marker state.
- [ ] **BI-2:** in-place Materialize for cross-machine pickup under the occupancy guard.
- [ ] **BI-3:** git-common-dir notes lock, branch-bounded paired-notes export, multi-intent sync-state marker
  handling, and workspace-scoped `.machine-id`.
- [ ] **BI-4:** CLI-complete start / mini-handoff / spawn-mode ceremony-locus fix.
- [ ] **BI-5:** validate-first graduate transition crash-class fix.
- [ ] **BI-6:** identity-global user surfaces resolve to one canonical machine-local materialization from every
  worktree; per-WU SESSION-NOTES remains worktree-scoped.
- [ ] **Deterministic ROADMAP renderer:** renderer slice from `roadmap-tooling` available before wave 1; full
  Heavy WU completion is not the gate.

**2.I.2 homogeneity check (2026-07-06)** — after merging `main` (post-#196) into FP, verified the base-state
precondition the waves require:

- **Build-item CLI (BI-1):** a worktree spawned off `main` resolves `npx arc` to the full lifecycle surface
  (`start`, `materialize`, `park`/`resume`, `activate`/`deactivate`, `integrate`, `teardown`, …); provisioning is
  present (`scripts/worktree-post-create.sh`, `src/lib/git/worktree-harness-dirs.ts` — with the reserved-dir guard
  from the #196 review).
- **Entry-arch (Phase 2.E):** the `--start` focused-recon arm (documented in `session-init.md` and the arc-session
  skill) and the spawn-anchored recipe (`src/lib/harness/worktree-entry.ts`) are on base.
- **Renderer capability / command:** the deterministic ROADMAP regeneration path resolves via `reconcileRoadmap`
  (`src/lib/work-unit/side-effects/readiness-regen.ts`), which composes `composeProjectReadinessView`
  (`src/lib/status/project-view.ts`) and writes + stages `.arc/backlog/ROADMAP.md` as a lifecycle-transition
  side-effect (degrading to an advisory on render/write failure). There is no standalone `arc roadmap` command —
  the **project** readiness view regenerates on lifecycle location moves by design; the per-developer counterpart
  (`STATUS.USER`) renders on demand via `arc status --user`.

Verified by artifact presence + CLI-surface probing (not a live `arc start` spawn, which would cut a real
branch/PR). Merge resolved cleanly — all conflicts took `main`'s integrated version; the only test noise was the
commit-msg-footer suite tripping the hook's `MERGE_HEAD` merge-exemption mid-merge, which cleared on commit.

### Wave evidence to collect

- [ ] **Wave 1:** two doc-only WUs in worktrees; verify harness presence, identity-global user-surface visibility,
  notes-lock/machine-id behavior, paired-push sibling-note export prevention, multi-intent sync-state marker reads,
  ROADMAP contention, base-drift surface, and clean marker state.
- [ ] **Wave 2:** one code WU plus one doc WU; verify dependency provisioning, off-primary quality gates,
  BI-4 re-graduation, and the graduate-transition crash-class detector.
- [ ] **Wave 3:** two code WUs plus live errand/drain; verify errand ref merge/conflict behavior, same/different-entry
  `USER-INBOX` removal reconciliation, teardown symmetry, primary/errand concurrency fork evidence, and
  interlock-friction observations.
- [ ] **Wave 4:** cross-machine resume; verify Materialize spawn + in-place pickup, notes lag / partial-push marker
  surfacing, and projection-contract evidence from Task 1.2.

### Playbook / closeout items

- [ ] Same-entry cross-WU edit limitation: symptom, recovery from notes/backups, and guidance to avoid concurrent
  same-entry edits.
- [ ] `USER-INBOX` local removal RMW residue: serialized-primary guidance, resurrection symptom, and recovery from
  notes/backups.
- [ ] Base-drift and probe-staleness recovery: re-probe, merge base forward, and do not rewrite pushed branches.
- [ ] Git-guarded loud failures: worktree/branch/config/ref refusal symptoms and retry/reconcile path.
- [ ] Duplicate `completed/` sequence number: cosmetic renumber recovery.
- [ ] Shared-checkout compaction-marker race and audit-log fragmentation: document as non-GA-blocking operational
  state limitations.
- [ ] Doctrine reconciliation: update the concurrent-work / errand-class guidance to match wave evidence, especially
  the pin-primary vs. serialized-primary decision.

## Scope & sizing

Large (week+), and deliberately long-*running* — the burn-in waves are calendar-gated and observational, which
is the intended rhythm, not drift. Broad cross-cohort surface carrying five committed build items alongside the
audit / verify / flip / gate core, plus the doctrine-reconciliation closeout deliverable. Size firms up once the
real seam count is visible; the matrix skeleton bounds the known surface, and the § Resolution model bounds the
cost of a discovered seam (absorb-if-atomic, else spawn a follow-up WU dependency).
