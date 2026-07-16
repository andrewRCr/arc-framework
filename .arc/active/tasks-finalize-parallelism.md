# Task List: Finalize Parallelism

- **Design:** `spec-finalize-parallelism.md`

---

## **Phase 1:** Seam audit — matrix, trace-through, adversarial pass

_Purpose:_ Convert unknown cross-member seams to known, classified ones. Finalize the shared-mutable-surface
matrix to its pre-wave-complete state, trace the two non-write-race seam suspects to source, and adversarially
attack the enumeration. Cell _verification_ (inducing each condition and observing the failure) is wave work —
deferred to Phases 3–6; this phase authors and classifies the enumeration the waves then exercise.

_Design decisions:_ The matrix skeleton and its loud/silent classifications are already authored in
`spec-finalize-parallelism.md` § The authored matrix skeleton; this phase confirms and finalizes that
enumeration and its dispositions rather than re-deriving it. Sequencing context in `notes-finalize-parallelism.md`.

### `[x]` **1.1 Finalize the shared-mutable-surface matrix**

- _Goal:_ Every shared-mutable surface is enumerated and classified loud-vs-silent with a disposition
  (`BI-n` / `wave-n` / `playbook`), so no surface enters the waves unclassified and every silent cell has a
  named closure path.

    - `[x]` **1.1.a Surface set A — repo-shared (common git dir / remote)**
        - Source-checked base-branch, user-notes, same-entry, sync-state, errand-ref, and git-guarded surfaces;
          locked BI-3 / wave / playbook dispositions in `notes-finalize-parallelism.md`.

    - `[x]` **1.1.b Surface set B — tracked, branch-mediated**
        - Classified ROADMAP stale-render residue, foreign-stub route races, duplicate completed-index numbering,
          and shared tracked-file conflicts with wave / playbook dispositions.

    - `[x]` **1.1.c Surface set C — per-checkout gitignored**
        - Classified fresh-worktree absence/divergence surfaces for harness dirs, deps, marker state, user files,
          machine id, spawn-locus writes, compaction seed, and audit log.

    - `[x]` **1.1.d Cross-cutting row + assemble the GA-checklist starting state**
        - Added the probe-snapshot staleness row and seeded the GA checklist's build-gate, wave-evidence, and
          playbook/closeout sections in `notes-finalize-parallelism.md`.

- _Outcome:_ `notes-finalize-parallelism.md` now holds the finalized Layer-1 matrix and the in-progress GA
  checklist starting state. The source-confirmed nuance is that the notes lock exists but remains per-checkout, so
  the same-machine sibling-worktree loss stays a BI-3 gap.

### `[x]` **1.2 Trace the projection-builder consumer contract to source**

- _Goal:_ The `projection.ts` producer/consumer contract across the `async-merge-lifecycle` ↔
  `cross-machine-sync-coherence` boundary is traced to source and classified, so a producer/consumer drift
  can't hide as a silent non-write-race seam.

    - `[x]` **1.2.a Characterize and classify the contract**
        - Source-traced `projectManifest` / `stripTombstoneSections` through `save-load.ts`, `sync-status.ts`, and
          `merge.ts`; classified the contract as source-consistent today but silent-if-drift, with the wave-4
          verification hook recorded in `notes-finalize-parallelism.md`.

- _Outcome:_ The projection basis is tombstone-free for registered cross-WU files only, preserves manifest
  version/path set, and is the single hash / comparison / reconstruction basis its consumers assume.

### `[x]` **1.3 Trace errand-vs-WU teardown symmetry to source**

- _Goal:_ Errand close/reap and WU integration/worktree-removal are shown to tear down branch, worktree, notes,
  and inbox-origin state through symmetric non-interfering paths — or the asymmetry is classified and
  dispositioned.

    - `[x]` **1.3.a Trace both teardown paths and classify**
        - Source-traced errand close's containment-safe branch reap plus record/inbox cleanup and WU archive/teardown's
          logical ship plus post-merge physical cleanup; classified the asymmetries as intentional and
          non-interfering.

- _Outcome:_ Errands own record/inbox cleanup and in-place branch reaping; WUs own lifecycle/user-workspace state
  plus optional linked-worktree teardown, with residual concurrency surfaces already named for wave 3 and the
  playbook.

### `[x]` **1.4 Adversarial pass over the matrix and draft GA checklist**

- _Goal:_ A fresh-context attack surfaces any concurrent-session failure the matrix misses, and surviving
  findings fold back into the matrix before the waves rely on it.

    - `[x]` **1.4.a Run the adversarial pass and reconcile findings**
        - Two broad fresh-context passes plus a targeted BI-3 design pass produced two source-confirmed major
          findings: paired push can export a sibling worktree's saved note before that sibling branch is pushed, and
          workspace-scoped sync-state markers can hide an earlier sibling partial-push intent. Both are folded into
          the spec, matrix, BI-3, and wave-1 verification. The second pass also produced one minor `USER-INBOX`
          local-removal residue, folded into wave 3 / playbook scope.

- _Outcome:_ The matrix now treats paired-push sibling-note early export as a silent notes-ref invariant violation
  and same-workspace marker collapse as a potential silent detector miss, both with BI-3 and wave-1 closure hooks.
  The BI-3 design now treats `.machine-id` as provenance while marker storage keys by export intent, with marker
  `intent` matching the notes export target actually attempted. The `USER-INBOX` different-entry removal RMW is
  recorded as a lower-materiality wave-3/playbook residue.

## **Phase 2:** Build items

_Purpose:_ Land the six committed build items that instrument the flip and gate the waves — worktree
dependency/harness provisioning, in-place Materialize, repo-shared sync-guard anchoring, the worktree launch
bridge, the graduate-transition crash-class fix, and identity-global user-surface binding. Ordinary code work
under per-task quality gates; each item's _in-practice_ verification lands in the wave phases (wave-tied, noted
per wave).

_Design decisions:_ Directions are settled in `spec-finalize-parallelism.md` § Committed build items; the
wave-gating relationships (BI-1 harness leg + BI-3 + BI-6 → wave 1; BI-1 node-deps leg → wave 2; BI-2 → wave 4)
are enforced in the wave preambles, not here. BI-1 and BI-4 carry the most subtasks — kept as single parents with
internal decomposition; the grounding audit (Pass 3) can still split any parent if it proves overcommitted.

### `[x]` **2.1 BI-1 — Worktree dependency provisioning manifest**

- _Goal:_ A spawned worktree comes up fully working — project deps provisioned, harness layer present, per-WU user
  workspace scaffolded, marker tree clean — via an ordered post-create manifest, and emits an actionable notice
  (never a silent no-op) when the deps step is unconfigured.

    - `[x]` **2.1.a `worktree.post_create` deps-script invocation point**
        - Spawned worktrees now read `worktree.post_create`, run a configured script immediately after
          `git worktree add`, surface an unconfigured deps-provisioning notice, and fail loud before marker /
          scaffold follow-on work if the script exits non-zero.

    - `[x]` **2.1.b Registered-harness-dir copy-from-primary**
        - Added `worktree.harness_dirs` with the universal harness-dir default, threaded it through create-new /
          graduate / resume spawn paths, and copied registered dirs from the primary checkout after post-create
          provisioning while leaving unregistered primary dirs untouched. Post-PR #189 intake refined the model:
          copied dirs are authoritative only for per-worktree harnesses; repo-global harnesses such as Codex need
          primary-backed recipe verification instead of treating the linked worktree copy as authoritative.

    - `[~]` **2.1.c User-dir scaffold at the ceremony locus**
        - Superseded by Task 2.4.d, which keeps the executable checkbox after the spawn-mode ceremony-locus fix
          it depends on instead of leaving a blocked open leaf ahead of the current task cursor.

    - `[x]` **2.1.d `worktree-marker.json` ignore-rule registration**
        - Spawn provisioning now resolves Git's `info/exclude` from the spawned worktree, appends the marker path
          once before writing `worktree-marker.json`, and verifies a real spawned worktree no longer reports the
          marker in `git status`.

    - `[x]` **2.1.e Self-hosting `worktree.post_create` script wiring**
        - Added this repo's install-build-install post-create script and wired `.arc/system/arc-config.yml` to run
          it, while leaving the packaged `arc-config.yml` default empty for adopter projects.

- _Outcome:_ BI-1's post-create invocation, registered harness copy, marker ignore, and self-hosting
  provisioning wiring are landed. The per-WU user workspace scaffold leg moved to Task 2.4.d so it runs after
  Task 2.4.c corrects the spawn-mode ceremony locus it depends on.

### `[x]` **2.2 BI-2 — In-place Materialize for cross-machine pickup**

- _Goal:_ Materialize can check out a remote-only in-flight WU into the current checkout without spawning, under
  the worktree-occupancy guard — the cross-machine twin of the `--here` opt-out.

    - `[x]` **2.2.a Add the guarded materialize transition edge**
        - Added `materialize@null` as its own lifecycle edge plus `arc materialize [slug]` CLI wiring. The command
          resolves the selected remote-only candidate, fetches its branch, and passes slug/branch inputs into the
          local-index executor.
        - In-place materialize uses the existing checkout leg with `createBranch: false` and remains under the
          occupancy guard; fresh-worktree materialize creates the local branch from `origin/<branch>` while
          declaring that it does not materialize artifacts in the current checkout, so the guard exempts it.

- _Outcome:_ Remote-only WU pickup now runs through guarded lifecycle machinery via `arc materialize`, and
  session-init guidance points work-unit materialize through that command before `arc user pull`.

### `[x]` **2.3 BI-3 — Repo-shared anchoring for per-machine sync guards**

- _Goal:_ Same-machine cross-worktree notes writers serialize, paired notes pushes do not export sibling notes
  before those sibling branches land, sync-state marker surfacing cannot hide an earlier sibling partial-push intent,
  and `.machine-id` is workspace-scoped so sibling worktrees share one machine identity.

    - `[x]` **2.3.a Re-anchor the notes lock at the git common dir**
        - `getNotesLockPath` now resolves `git rev-parse --git-common-dir` through the caller's git executor and
          anchors the per-identity lock under the repo-shared common dir; `runUserSave` and the true-race worker
          await that async path before acquiring the unchanged advisory lock.
        - Unit coverage now asserts absolute and relative common-dir resolution, and the true-race e2e smoke now
          races primary + linked-worktree note writers to prove both notes survive under the shared lock.

    - `[x]` **2.3.b Mint `.machine-id` at the git common dir (workspace-as-machine)**
        - `getOrCreateMachineId` now stores the per-workspace machine id under the repo git common dir via the
          shared repo-user internal path helper, adopts legacy checkout-local IDs, and leaves `.sync-state.json`
          per-checkout under `.arc/user`.
        - Unit and true-race e2e coverage now prove primary + linked worktrees converge on one id and leave no
          checkout-local `.machine-id` behind; sync-state marker producer tests read the new common-dir store.

    - `[x]` **2.3.c Branch-bounded paired notes export**
        - Paired push now plans a temporary notes export after the worktree leg lands, stages origin's current notes
          plus only local notes reachable from the landed branch, and pushes that exact target through the paired
          notes adapter so sibling branch notes remain local until their commits are published.
        - The sync-state marker records the planned export target, not the raw local notes tip, and same-commit
          remote note conflicts refuse loudly without moving either local or origin notes.

    - `[x]` **2.3.d Multi-intent sync-state marker handling**
        - Sync-state markers now store entries by notes-export intent while retaining `machineId` as payload
          provenance, so one workspace machine can publish multiple unresolved intents without latest-wins
          overwrite.
        - Marker consumers enumerate all keyed entries, keep live same-machine intents independent of fulfilled
          siblings, and continue applying the existing fulfillment and TTL self-invalidation rules.

- _Outcome:_ BI-3 now anchors the notes lock and workspace machine id in the repo git common dir, bounds paired
  notes export to the landed branch, and keys sync-state marker entries by export intent so same-workspace sibling
  pushes cannot hide earlier live notes-push intents.

### `[x]` **2.4 BI-4 — Worktree launch bridge**

- _Goal:_ A shell-invoked `arc start` is CLI-complete (spawn → provision → relocate → reconcile → ceremony
  commit → push) and hands off into the spawned WU's seeded SESSION-NOTES, so worktree-by-default costs one
  session and boots rich — and the ceremony lands correctly under spawn mode.

    - `[x]` **2.4.a CLI-complete `arc start` substrate**
        - _Outcome:_ Added deterministic start-ceremony substrate: graduate resets `Next Action`, stages pointer
          rewrites, and exposes formulaic commit messages; create-new shell `arc start` now refreshes/stages the
          generated ROADMAP, commits, and pushes the `plan/<slug>` branch. The graduate commit/push fire remains
          with Task 2.4.c's spawn-locus fix.

    - `[x]` **2.4.b Mini-handoff into seeded SESSION-NOTES at spawn**
        - Spawned `arc start` paths now seed WU-scoped SESSION-NOTES with handoff fields (`Working On`,
          `Commit at Handoff`, `Session Type`) and shell ceremonies rewrite the pending commit anchor to the actual
          start-ceremony commit.

    - `[x]` **2.4.c Spawn-mode ceremony-locus fix**
        - Graduate spawn now creates the worktree first, rebinds the transition executor to that checkout, runs
          relocation / staging / user-open / ROADMAP from the spawned locus, and commits + pushes the formulaic
          graduate ceremony on the `plan/<slug>` branch. The conservative `--here` path is unchanged.

    - `[x]` **2.4.d Per-WU user workspace scaffold at the corrected ceremony locus**
        - The user-workspace open side-effect accepts the spawn mini-handoff seed and runs at the corrected worktree
          locus for graduate spawn; create-new uses the scaffold path's seed. Identity-global user files remain
          excluded and stay with BI-6's canonical binding work.

    - `[x]` **2.4.e `renderBullets` 120-wrap for multi-line `Depends On`**
        - Long identifier-list bullets now wrap on item boundaries at 120 columns, so multi-value `Depends On`
          re-renders as markdown-valid continuation lines while parsing back to the canonical comma-joined value.

    - `[x]` **2.4.f Harness-conditional relocate / spawn-anchored hop**
        - Spawned start ceremonies now emit a `Next session` recipe with one common root invariant (enter the
          spawned worktree after post-create provisioning and registered harness-dir copy) plus capability-specific
          recipes for Claude Code `EnterWorktree`, Codex fresh-session `codex --cd <path>`, and other harnesses.
          `init-work-unit` now consumes that recipe instead of continuing from the invoking checkout. Codex
          `--cd <DIR>` support was re-verified against the installed CLI help.

    - `[x]` **2.4.g Worktree path naming across activation**
        - Branch/path parity proved cosmetic: activation renames branch/meta state only, while roster, teardown, and
          sweeps resolve live paths from `git worktree list`. Spawned worktree defaults now use the WU-name token
          (`../{repo}.{name}`), with `{branch}` retained for explicit branch-labeled templates.

- _Outcome:_ BI-4 now makes spawned start paths CLI-complete and handoff-ready: create-new / graduate spawn
  provision, relocate, scaffold the user workspace, refresh the project readiness view, commit and push the
  `plan/<slug>` branch, seed SESSION-NOTES, print harness entry recipes, and name spawned worktrees by WU slug so
  activation branch rotation does not imply path churn.

### `[x]` **2.5 BI-5 — Graduate-transition crash-class fix**

- _Goal:_ The graduate transition fails loud on an old-shape meta _before_ any mutation, and all validation
  precedes any mutation so the partial-state window shrinks to near-zero.

    - `[x]` **2.5.a Pre-flight meta-shape validation + `arc verify` check**
        - Added shared managed-field-block shape validation, broadened staged lifecycle-meta validation across
          active/backlog/completed tiers, and taught the integrity verifier to flag missing H1 / closing `---`
          anchors.

    - `[x]` **2.5.b Validate-first mutation ordering in `start.ts`**
        - `runGraduate` now preflights the backlog meta before spawn or `--here` transition execution, rejecting
          old-shape metas before worktree, branch, relocation, or meta mutations.

- _Outcome:_ Graduate now fails loud on metas without the managed field-block closing delimiter before mutation;
  commit-time validation and `arc-verify` flag the same shape class, with regression coverage for both spawn and
  in-place paths.

### `[x]` **2.6 BI-6 — Identity-global user-surface binding**

- _Goal:_ From any worktree, identity-global user surfaces resolve to one canonical machine-local materialization,
  while per-WU SESSION-NOTES remains worktree-scoped. The design composes with `strategy-storage-evolution.md`,
  `draft-arc-backend.md`, and `operational-state-docs`: this is a resolver/storage-boundary fix, not a new
  checkout-local merge convention.

    - `[x]` **2.6.a User-surface resolver by semantic scope**
        - Added `UserSurfaceResolver` and routed identity-global user surfaces through the primary-worktree
          materialization while leaving SESSION-NOTES scoped to the active worktree. User add/inbox removal,
          errand cleanup, STATUS.USER cache/regen, session-init/recover load-set, compaction-seed, nudge markers,
          and user-status drift reads now consume resolver paths; shipped guidance names the resolver/load-set
          path instead of linked-checkout copies.

    - `[x]` **2.6.b Notes save/load split-source handling**
        - Split user-notes save/load now uses one logical manifest over two physical loci: identity-global flat
          files serialize/materialize at the canonical root, while the current WU's SESSION-NOTES
          serializes/materializes from the active worktree. Load verification, pre-load backups, backup listing,
          and status/drift comparison use the same logical split basis, and legacy root SESSION-NOTES entries
          migrate only to the current WU or are preserved as backup-only legacy content.

    - `[x]` **2.6.c Divergent-copy migration and teardown guard**
        - Linked-worktree resolver entry and teardown now scan ignored flat identity-global user files, merge known
          cross-WU shapes into the primary canonical root, discard stale generated `STATUS.USER` caches, refuse
          divergent unknown or malformed files, and feed the same safety signal into stale-worktree and branch-gone
          cleanup offers.

    - `[x]` **2.6.d Clean up and signpost linked-worktree identity-global copies**
        - After merging a linked worktree's durable identity-global copy up, `reconcileLinkedIdentityGlobalUserSurfaces`
          now retires the linked copy in place: a durable surface (`WORKING-MEMORY` / `USER-INBOX`) is replaced with a
          per-surface signpost stub naming the canonical primary-worktree path and `arc user status`; a regenerable
          cache (`STATUS.USER`) is removed. A recognizable sentinel marks the stub so the next resolver-entry scan
          skips it — never merging notice text into canonical, never re-stamping — while real content re-opts into the
          merge-up path. Gated by a `signpost` option: on for the live resolver entry (`resolveUserSurfaceResolver`),
          off for teardown (git deletes the worktree) and the dry-run safety probe. Scan-based cleanup only —
          proactive "present everywhere" materialization stays the downstream always-fresh stub.

    - `[x]` **2.6.e Re-bind the compaction-recovery seed worktree-local, not identity-global**
        - `resolveCompactionSeedPath` now roots the seed at the active checkout (`cwd/.arc/user/{id}/.internal/…`)
          and no longer accepts an identity-global root, so the emit side (`status --write-compaction-seed`) and the
          audit side (`recover`) resolve the same per-worktree path symmetrically. Concurrent worktree sessions each
          own a private seed — no last-writer-wins clobber, and no cross-worktree state recovery — and the seed is
          torn down with its worktree (it lives in the worktree's own gitignored `.internal/`). Both handlers keep
          resolving `identityGlobalUserDir` for their load-set / recovery-manifest projections; only the seed path
          was detached from it. (Live two-worktree no-clobber check is wave work.)

## **Phase 2.R:** ROADMAP renderer gate

_Purpose:_ Repair the discovered pre-wave gap: wave 1 needs deterministic ROADMAP regeneration before concurrent
spawn / integration evidence is meaningful, but full Heavy `roadmap-tooling` completion is not the gate. Pull
forward the smallest renderer slice through its own work unit or session, then verify FP can rely on it before
spawning the sacrificial WUs.

_Design decisions:_ The implementation belongs to `roadmap-tooling` or a split from it, not FP. FP tracks the gate
and records the verification only.

### `[x]` **2.R.1 Pull forward the deterministic ROADMAP renderer slice**

- _Goal:_ The minimal renderer capability needed by wave 1 lands outside FP, without requiring full Heavy
  `roadmap-tooling` completion.

    - `[x]` **2.R.1.a Scope the slice boundary**
        - Scoped the gate to a dedicated renderer-command slice, not full Heavy `roadmap-tooling`: expose /
          stabilize deterministic `ROADMAP.md` refresh around the existing project-readiness composer and
          lifecycle/start ceremony write paths. Exclude `STATUS.USER`, `STATUS.PROJECT` rename, link reanchoring,
          shared render-standard extraction, and `operational-state-docs`' generic managed-record projection engine.

    - `[x]` **2.R.1.b Complete the slice in its own session**
        - Shipped to `main` as a standalone errand (PR #195, `render the project readiness view from meta files`),
          not a dedicated FP-branch session. FP remained the observer and did not absorb the implementation; the
          slice is on base, so FP inherits it via the Phase 2.I merge-back.

    - `[~]` **2.R.1.c Verify the FP gate**
        - Superseded by Phase 2.I: the renderer (on `main` via #195) reaches FP's branch through the 2.I.2.a
          merge-back, and its availability on FP's branch is verified there (2.I.2.b) alongside CLI homogeneity,
          before wave 1.

## **Phase 2.E:** WU-entry architecture

_Purpose:_ Ship proper WU-entry ergonomics before GA — worktree-by-default raises entry cadence, so the entry
paths must be first-class, not the current stopgap. Owns the `--start` disposition and the launch-model rework the
2026-07-05 dogfood finding forces (`notes-finalize-parallelism.md`).

_Design decisions:_ Settled 2026-07-05 — see `spec-finalize-parallelism.md` § WU-entry architecture. Spawn-anchored
launch is the universal entry; `--start` is kept as an agentic focused-recon arm symmetric with the no-agent bare
`arc start <slug>`; readiness is socket-only (FP mints no field/marker); direction is async-first, with the broader
lifecycle state-model reform captured as planned WU `wu-lifecycle-state-model` (FP references it, does not build
it). Positioned pre-2.I so the forward-port carries the entry-arch to `main` and the waves dogfood the final
ergonomics off base — the design anchors are `spec-finalize-parallelism.md` § WU-entry architecture and § Committed
build items (BI-4).

### `[x]` **2.E.1 Sharpen `arc-session --start` into the focused-recon arm**

- _Goal:_ `arc-session --start <slug>` boots the universal load-set (not general discovery), runs a deterministic
  readiness recon on the named WU, and closes on an informed launch prompt — a single-turn green path symmetric
  with the no-agent bare `arc start <slug>`.

    - `[x]` **2.E.1.a Recon arm in the session-init `--start` handling**
        - Repurposed `--start <slug>` in `session-init.md` (+ package `session-init.template.md` mirror) from the
          no-active-WU start shortcut into a checkout-preserving, arm-orthogonal **focused-recon arm**: a new Step 2
          subsection (resolve target → notes-sync + universal-only load + target readiness read → skip Step 5
          discovery) and a Step 6 recon terminal (readiness verdict → spawn-anchored `arc start` → verify the seeded
          mini-handoff landed → generic path-not-command handoff → soft-guard against in-session continuation). Five
          other `--start` cross-references reconciled. Arm-orthogonal (fires regardless of active-WU state) chosen
          over the old no-active-WU-only placement — coherent now that launch spawns its own worktree. Two-tier vet
          gating is 2.E.1.b; skill-doc sync is 2.E.1.c.

    - `[x]` **2.E.1.b Two-tier vet — Tier-1 gates, Tier-2 invites**
        - Added the two-tier readiness vet to the recon arm (both session-init copies): a Tier-1 deterministic gate
          (dependency edges resolved by slug via `arc status`; base-drift staleness wherever a readiness baseline
          exists) and a never-gating Tier-2 judgment pass (soft invite on Tier-1 green → recommendation on drift)
          reusing the probe's already-computed in-flight-composition `Class` advisory. Step 6 verdict line names the
          tiers.

    - `[x]` **2.E.1.c Sync the `arc-session` skill doc**
        - Rewrote the `arc-session` skill's `--start` description (both canonical copies) from the no-active-WU start
          shortcut to the checkout-preserving, arm-orthogonal focused-recon arm — universal load + readiness recon +
          informed launch prompt, still honoring sync/dirty/freshness/mismatch surfaces and, on launch, the spawned
          `arc start`'s commit/push interlocks and `Class` guard. The gitignored harness copy already tracks
          canonical.

### `[x]` **2.E.2 Ship the socket-only readiness contract**

- _Goal:_ The `--start` vet resolves readiness through a layered contract without FP minting any readiness field or
  marker — the socket is present; the scheduling primitive is the reform WU's to add.

    - `[x]` **2.E.2.a Layered readiness resolution**
        - Folded the layered readiness resolution into the recon arm's vet preamble (both session-init copies): a
          recorded ready-attestation when the target's meta carries one, else a "tasks Finalized?" heuristic over its
          task list, else deps-only. FP mints no attestation field, so today it degrades to the heuristic/deps
          fallback — a stable socket `wu-lifecycle-state-model` later fills. Spec already carried the design.

### `[x]` **2.E.3 Recenter the launch recipe on spawn-anchored entry**

- _Goal:_ The BI-4 `Next session` recipe leads with the spawn-anchored fresh-session entry and demotes live
  relocate to an opt-in escape hatch, per the desync finding.

    - `[x]` **2.E.3.a Rework the Task 2.4.f recipe emission**
        - Reworked `renderWorktreeEntryRecipe` (`worktree-entry.ts`): leads with a generic spawn-anchored
          fresh-session entry (worktree path + invoke `arc-session`, boots rich off the seed) and demotes live
          relocate (`EnterWorktree`) to a labeled opt-in escape hatch. Dropped the per-harness launch commands
          (`codex --cd …`) and the now-moot shell-quoting helper; the path shows as plain data. Updated the renderer
          unit test and two `start.test.ts` recipe assertions.

### `[x]` **2.E.4 Document bare `arc start <slug>` as the know-what-to-start default**

- _Goal:_ The entry spectrum reads coherently — bare `arc start <slug>` is the documented default for the
  know-what-to-start case, `--start` is the agent-vetted door, unseeded discovery is the third path.

    - `[x]` **2.E.4.a Signpost the bare-CLI default and reconcile the entry docs**
        - Stated the WU-launch entry spectrum once, in the recon arm intro (both session-init copies): bare
          `arc start <slug>` (know-what-to-start, no agent) ↔ `--start <slug>` (agent-vetted) ↔ unseeded
          `arc-session` discovery. The `arc-session` skill's `--start` symmetry framing aligns — stated once, no
          contradiction.

## **Phase 2.I:** Mid-flight build-items integration

_Purpose:_ Land the completed build items **and the Phase 2.E entry-arch** on `main` before the waves consume them,
so wave worktrees (cut off base) run the same CLI as the observer — the real adopter topology, not a mixed-version
dogfood — and dogfood the final entry ergonomics, not the interim stopgap. Defaults stay unflipped: base gains the
mechanism, never the `--here`→spawn default (that flip is the GA-closeout Task 8.3).

_Design decisions:_ Settled in `spec-finalize-parallelism.md` § Shape and launch constraint. The mechanism is a
**code-only forward-port**, not a branch merge — FP's active-WU branch carries FP's own `.arc/active/*` artifacts,
and merging it whole would make FP appear active on the primary. Mirrors the #195 renderer extraction. Build items
and entry-arch touch the same file classes (`packages/**` + `.arc/system/`), so they forward-port as one combined
PR, not two.

### `[x]` **2.I.1 Forward-port the build-item and entry-arch changes to `main`**

- _Goal:_ The BI-1→BI-6 changes and the Phase 2.E entry-arch reach `main` as one PR — `packages/**` plus
  `.arc/system/` config (workflows, skill), and not FP's `.arc/active/*finalize-parallelism*` planning artifacts.

    - `[x]` **2.I.1.a Assemble the code-only forward-port branch + PR**
        - Cut `chore/forward-port-parallelism-mechanism` off `main` and 3-way-applied FP's net mechanism diff
          (150 files): CLI + tests, `.arc/system/` workflows/skill/config, the `worktree-post-create.sh` script, and
          the strategy/inbox docs describing the shipped user-surface resolver. FP's planning artifacts excluded;
          confirmed no begin-work default flip. Base drift was the #195 renderer only — resolved 2 co-evolved-file
          conflicts preserving #195's test-scoping refinement. Opened PR #196.

    - `[x]` **2.I.1.b Merge to `main` (defaults unflipped)**
        - Ran CodeRabbit on the PR (auto-review is disabled on the repo); folded 7 verified findings into #196 as
          two fix commits (start push-fail SHA, bounded materialize fetch, ENOENT-narrowed load catch, best-effort
          STATUS.USER cache, Windows/UNC load-set traversal reject, reserved `.git`/`.arc` harness-dir reject, two
          doc corrections) with regression tests; a scoped re-review's one follow-up (backslash-canonical Windows
          load-set paths) was resolved too. Routed the one non-folded finding to blocking task `7.1`. CI green
          (all three portability OSes); merged via merge commit `8371a08a`. Base carries the mechanism with the
          begin-work default still `--here`.

### `[x]` **2.I.2 Merge `main` back into FP and verify homogeneity**

- _Goal:_ FP's branch is current with base, and a worktree spawned off `main` runs the same build-item and
  entry-arch CLI as the observer.

    - `[x]` **2.I.2.a Merge `main` into FP's branch**
        - 13 content conflicts, all the same shape — `main` carried the integrated truth (FP's mechanism + #195
          renderer + the #196 review fixes) while FP still held the pre-fix originals; each resolved to `main`'s
          version. FP's `.arc/active/*` planning artifacts merged cleanly and are unaffected. Gates green
          (typecheck / lint / build / test 3889). Merge commit `e28baf53`.

    - `[x]` **2.I.2.b Confirm CLI homogeneity and renderer availability for the waves**
        - Verify a worktree spawned off `main` provisions and resolves `npx arc` to the build-item CLI (BI-1) and
          the entry-arch (the focused-recon `--start` arm + spawn-anchored recipe), and the deterministic ROADMAP
          regeneration path resolves on FP's branch — the base-state precondition the wave gates now require. Record
          the exact renderer capability / command in `notes-finalize-parallelism.md`.
        - Confirmed by artifact presence + `npx arc` CLI-surface probing: full lifecycle CLI, `--start` arm
          (`session-init.md` + arc-session skill), spawn recipe (`worktree-entry.ts`), BI-1 provisioning
          (`worktree-post-create.sh` + `worktree-harness-dirs.ts`), and the deterministic ROADMAP regen path
          (`reconcileRoadmap` → `composeProjectReadinessView`, writing/staging `.arc/backlog/ROADMAP.md` as a
          lifecycle side-effect). Renderer capability / command recorded in `notes-finalize-parallelism.md`
          § Build gates before waves.

## **Phase 3:** Burn-in wave 1 — two synthetic doc-only fixtures

_Purpose:_ First live concurrency exercise on node-toolchain-free workload — spawn, notes sync, ROADMAP
contention, integration ordering — plus induced detector-tests for the cells this wave covers. Gated on
Phase 2.I (build items + entry-arch on base) + BI-1's harness-layer leg + BI-3 + the deterministic ROADMAP renderer slice;
workload: two purpose-built synthetic fixtures (`burn-in-probe-a` + `burn-in-probe-b`), spawned and groomed
in-worktree during the wave.

_Design decisions:_ Workload pivoted from real Light doc WUs to purpose-built synthetic fixtures — the "real
Light doc WU" premise did not survive contact (real Light doc work is Errand-shaped and single-session; real
substantial doc work is Heavy or carries code/lifecycle legs), so no backlog stub cleanly met wave 1's
doc-only + multi-session + surface-disjoint need. The fixtures run the real lifecycle over synthetic content (real
ceremony), each producing its own evidence log as its deliverable; matrix-cell / detector induction is driven by
the observer. Rationale in `notes-finalize-parallelism.md` § Wave-1 workload. Every wave verifies detectors as
well as paths; gating + coordination detail in § Sequencing.

### `[x]` **3.1 Prepare and launch the wave-1 sacrificial workload**

- _Goal:_ Two Light doc WUs run concurrently in spawned worktrees alongside FP, groomed in-worktree during the
  wave — Class and lifecycle stage confirmed at pickup, spec-readiness deliberately not a precondition.

    - `[x]` **3.1.a Confirm the wave-1 slate**
        - Evaluated real Light doc backlog picks and found the "real Light doc WU" premise unsatisfiable for wave
          1: `inbound-routing-method` drifted Heavy (buffer coupled to unstarted `shared-inbox-model`),
          `adr-accept-timing` carries code/lifecycle legs (enforcement hook + `integrate-work-unit` flip step), and
          `cli-readme` is single-session Errand-shaped (no handoff→resume, so cross-session notes convergence never
          fires). The category "real, Light, doc-only, multi-session, coherent WU" is near-empty by construction.
          Pivoted to two purpose-built synthetic fixtures (`burn-in-probe-a` + `burn-in-probe-b`) that run the real
          lifecycle over synthetic content; FP observes and drives cell/detector induction. Finding recorded in
          `notes-finalize-parallelism.md` § Wave-1 workload.

    - `[x]` **3.1.b Scaffold, spawn, and groom the synthetic fixtures in-worktree**
        - Operator-driven since the prior handoff: both fixture stubs scaffolded onto `main`, spawned via the
          spawn-anchored entry (fresh session in each worktree), groomed draft→spec→tasks and executed through
          verification concurrently with FP — real ceremony over synthetic content, task lists complete, both
          paused integration-ready before merge. Each produced its evidence log (`notes-burn-in-probe-{a,b}.md`);
          planning-under-concurrency friction (backlog-path artifact placement, activation-rename stale upstream)
          is recorded there and routed to `wu-lifecycle-state-model` via USER-INBOX captures.

    - `[x]` **3.1.c Verify the spawn-anchored launch model**
        - Verified from both probes' evidence logs plus live worktree state: each worktree was entered by a fresh
          in-worktree session through the normal linked-worktree session-init path, booted rich off the BI-4
          seeded SESSION-NOTES (probe-a's first-handoff save/resume reprobe clean end-to-end), with the BI-1
          harness layer present (`.claude/` agents/skills/settings; hooks resolve per-worktree to the tracked
          `.arc/system/.internal/harness-hooks/` scripts) and no step depending on live relocate. Residual
          launch-ergonomics friction (activation-rename stale upstream + lingering remote `plan/` shadow ref)
          captured to USER-INBOX → `wu-lifecycle-state-model`, not back into 2.E.

- _Outcome:_ Wave-1 workload is live and holding at the observation point: both probes integration-ready, paused
  before merge, launch model verified — 3.2/3.3 induction is unblocked and gated only on driving the concurrent
  integration. Verification also surfaced a new GA-blocking seam (slug-state surfaces checkout-local — blind to
  in-flight siblings; `notes-finalize-parallelism.md` § 2026-07-09 finding), routing decision pending
  (split-out fix off `main` pre-wave-2 recommended vs. Phase 7).

### `[x]` **3.2 Verify the wave-1 matrix cells**

- _Goal:_ Each wave-1 cell's predicted failure is induced and observed, confirming (or correcting) its
  loud/silent classification.

    - `[x]` **3.2.a Notes-ref cross-worktree writer/export race (BI-3 in practice)**
        - Induced truly-concurrent saves from both probe worktrees plus the A-save/B-save/A-paired-push
          interleave, with B's note anchored at a deliberately-unpushed commit. All three invariants held:
          saves serialized by the notes lock (sequential ref commits, zero of 315 baseline notes dropped),
          A's paired push filtered exactly the sibling's unpushed-anchored note from an otherwise-full export
          (silent-safe branch-bounded filter, not a refusal), and the filtered note followed automatically at
          B's own paired push — full local ≡ origin convergence. Evidence in `notes-finalize-parallelism.md`
          § Wave-1 induction evidence.

    - `[x]` **3.2.b Sync-state marker shared-key ordering**
        - Exercised misordered publishes from two genuinely-distinct writers (scratch clones with own machineIds,
          local repo as origin, temporary pre-receive rejecting only the notes ref) with two unresolved intents
          live simultaneously. Confirmed: keyed union retained every entry under misordered CAS writes (no
          earlier live marker hidden), the session-init surface rendered exactly the live intents cross-worktree,
          BI-3's shared per-machine id and intent-keying hold (no key collapse; retries mint fresh keys), and
          residue is TTL-bounded (14d) / presentation-only. One seam sharpened and routed to Phase 7 (7.2):
          recovered pushes never fulfill their recorded intents, leaving false "notes lag" lines until TTL.
          Evidence in `notes-finalize-parallelism.md` § Wave-1 induction evidence.

    - `[x]` **3.2.c ROADMAP concurrent regen**
        - Same-instant renders from FP + both probes produced one normalized projection (`3055f9e0`) across three
          distinct branch states; the earlier merge cascade supplied the loud `both modified` half, and a staged
          stale render was rejected by `assert-roadmap-regenerated` before commit. Full evidence in
          `notes-finalize-parallelism.md` § Cell 3.2.c.

    - `[x]` **3.2.d Base-branch reconcile gate re-verify**
        - Probe-a's real PR #215 merge advanced `origin/main`; the exact integration gate on untouched probe-b
          returned `12 18` for `HEAD...origin/main` and took the mandatory-stop arm before reconcile or merge.
          Probe-b remains clean and behind for 3.2.e. Full evidence in `notes-finalize-parallelism.md`
          § Cell 3.2.d.

    - `[x]` **3.2.e Foreign-write advisory under behind-base divergence**
        - Verified the fixed detector under the preserved behind-base condition: after merging `origin/main`
          (292 commits, both blocker fixes) into FP append-only, the merge staged 32 foreign WU-artifact
          candidates — all inside probe-b's 483-file two-dot divergence, none in its 6-path authored set — and
          the committed probe reported zero overlap across pre-merge, mid-merge, and post-merge states, while a
          probe-b-authored path returned the correct single-path advisory. The 2026-07-09 defect is fixed in
          both directions. One new seam surfaced and bisected: git's hook-exported `GIT_DIR`/`GIT_INDEX_FILE`
          leak into the advisory's cross-worktree uncommitted probe, phantom-matching the committing tree's
          staged set as sibling overlap (hook-context-only; deterministic repro). Routed for split-out to
          `main` per the seam-routing rule — wave 2+ commits consume the surface. Evidence in
          `notes-finalize-parallelism.md` § Cell 3.2.e.

- _Outcome:_ All five wave-1 cells verified with loud/correct classifications confirmed. The cells also earned
  their keep as detector-tests: one detector defect (foreign-write three-dot) was caught, split out, fixed
  upstream, and re-verified under the preserved condition, and two further seams were surfaced and routed
  (marker-intent residue → 7.2; hook-env leakage in the uncommitted probe → split-out). Per-cell evidence in
  `notes-finalize-parallelism.md` § Wave-1 induction evidence.

### `[x]` **3.3 Induce and confirm the wave-1 detector-tests fire**

- _Goal:_ The session-init detectors this wave can exercise (base drift, notes lag, stale worktree) fire when
  their condition is induced — a silent no-op is caught as a GA blocker.

    - `[x]` **3.3.a Induce each detector condition and confirm the surface fires**
        - All three fire loud with composed surface text, each with correct negatives observed: base drift from
          probe-b's preserved 292-behind state (`diverged`/`surface`, overlap named; clean-skip on current
          branches), notes lag from all three worktrees (identity-scoped synthetic markers), and stale worktree
          via an induced recreation of shipped probe-a's worktree with an ARC marker (primary-only sweep,
          `removable` green path; errand oracle correctly declined the `chore/` branch). Induction torn down.
          Evidence in `notes-finalize-parallelism.md` § Detector-tests 3.3.

### `[x]` **3.4 Record wave-1 findings**

- _Goal:_ Wave-1 outcomes are appended to `notes-finalize-parallelism.md` and the in-progress GA checklist
  (seeded at Task 1.1.d), so nothing observed is lost between waves. The incident playbook is distilled from
  these notes later, at Task 8.2.b.

    - `[x]` **3.4.a Append results to the notes and the in-progress GA checklist**
        - Per-cell evidence accumulated in the notes throughout the wave (§ Wave-1 induction evidence,
          § Detector-tests 3.3); this pass closed the GA checklist's wave-1 tier — all seven build-gate boxes
          ticked with landed/field-verified status (BI-2 and BI-5 landed, field verification deferred to their
          waves), and the Wave 1 evidence item ticked with per-condition pointers plus carried-forward residue
          (hook-env advisory split-out, 7.2 marker-intent seam, synthetic-notes cleanup barrier, probe-b
          integration-path decision).

## **Phase 4:** Burn-in wave 2 — two code WUs

_Purpose:_ First real off-primary code exercise — worktree dependency provisioning + per-task quality gates
off-primary — and a re-graduation that verifies BI-4's ceremony-locus fix. Adds BI-1's node-deps leg to the
wave-1 gating set. Slate re-cut 2026-07-14: the doc partner is dropped — wave 1 already field-verified the
doc-only cell, and the 2026-07-05 finding shows the Light / doc-only / multi-session shape is near-empty by
construction — so wave 2 runs two real code WUs instead. **Additional gates:** `slug-state-oracle-alignment` and
`notes-export-state-coherence` merged to `main` and into FP — wave sessions consume the slug-state/dispatch and
notes-entry surfaces they fix. The slug-state fix owns checkout-local blindness + the foreign-write divergence
false positive and is already in flight; notes coherence follows it as a split-out WU. Both route per the burn-in
seam rule in `notes-finalize-parallelism.md`.

### `[x]` **4.1 Prepare and launch the wave-2 workload**

- _Goal:_ Two code WUs — `worktree-teardown-decoupling` (new stub cut from the 2026-07-13 self-teardown finding's
  resolution) and `commit-message-submission` (planned P1; steer grooming toward its Light validator-reuse shape) —
  run concurrently alongside FP, deps provisioned by the BI-1 manifest.

    - `[x]` **4.1.a Confirm the wave-2 slate and spawn**
        - Slate confirmed and both WUs spawned into provisioned worktrees with their init ceremonies on their
          plan branches (`commit-message-submission` at `cec8fd6a2`, `worktree-teardown-decoupling` at
          `6966113dc`). The launch itself surfaced and closed a live gap: the Class guard had no CLI input
          channel, so the launch was blocked agent-driven — split out per the seam rule as the
          `start-class-flag` errand (PR #236: `start --class` resolves a `[TBD]` meta at graduation,
          `stub --class` sets it at birth), after which the CMS launch ran agent-driven end-to-end, first try.
          The teardown stub was minted via a planning errand (PR #237). The split-out cycle also produced the
          2026-07-14 execution-locus finding (`notes-finalize-parallelism.md`): checkout-identity failures
          throughout, routed to a pulled-forward `session-locus-model` stub (PR #238) inside the GA gate, with
          wave 3 re-cast as its evidence collector. 4.3 vehicle note: neither wave-2 stub carries a
          `Depends On` list, which the 120-wrap check needs — pick the vehicle and the deps question together
          at 4.3.a.

### `[x]` **4.2 Verify off-primary node quality gates and dependency provisioning**

- _Goal:_ typecheck / test / build / lint run green in a BI-1-provisioned spawned worktree — the flip-decisive
  `node_modules` gap is closed in practice, with no bare-`npx arc` foreign-registry edge.

    - `[x]` **4.2.a Run the full gate set off-primary and confirm green**
        - Two evidence legs, both BI-1-provisioned wave-2 worktrees. First-hand: the live `commit-message-submission`
          worktree ran the full set (markdown/TS/shell lint, both typecheck configs, build, full test suite) all green,
          with `node_modules/.bin/arc` resolving locally — no foreign-registry edge. Retrospective: `worktree-teardown-decoupling`
          ran its entire lifecycle off-primary — per-task gates through Tier 3 verification plus portability and
          integration/E2E CI — and shipped (PR #246, archived record). Collection was retrospective for the WTD leg;
          its worktree was already torn down when FP resumed.

### `[~]` **4.3 Re-graduate a WU to verify BI-4's ceremony-locus fix**

- _Goal:_ A wave-2 re-graduation lands its init ceremony on the plan branch with a 120-wrapped `Depends On` —
  BI-4's spawn-mode ceremony-locus fix verified live.

    - `[~]` **4.3.a Re-graduate and confirm ceremony locus + wrap**
        - Superseded by events: the penciled vehicle (a WTD re-graduation after the dispatch fix) never ran — WTD's
          split-brain reconcile folded into its grooming and activation ceremonies and the WU shipped. The locus half
          is verified retrospectively: every WTD ceremony commit (init `6966113dc`, activation `130b9b600`, ROADMAP
          refresh `770d6b2dc`) rode the plan/fix branch, none on main's first-parent line — together with 4.1's
          init-locus evidence, BI-4's fix is field-verified. Residuals re-anchored at 5.1.a: the wave-3 launches
          exercise the start-dispatch fix (PR #242) live, and the slate cut decides the `Depends On` discharge
          vehicle; no wrap-shaped multi-dep graduation exists on the FP timeline, so wrap-specific rendering rests
          on unit coverage.

### `[x]` **4.4 Verify wave-2 detector-tests and record findings**

- _Goal:_ Wave-2 detectors fire on induction and findings are recorded to `notes-finalize-parallelism.md` and
  the in-progress GA checklist.

    - `[x]` **4.4.a Induce detectors, confirm firing, record**
        - Wave 2's conditions arose from the real workload rather than deliberate induction; evidence recorded
          in `notes-finalize-parallelism.md` § Wave-2 induction evidence and the GA checklist's Wave 2 item
          ticked with per-condition pointers. BI-5 verified partial (fail-loud Class guard live; old-shape lane
          on test coverage); the dispatch split-brain finding stands as the wave's marquee detector catch, with
          both split-out fixes shipped and the composer fix consumed live at the 2026-07-15 base merge. Detector
          re-probe at wave close: base drift, notes-lag markers, and the ROADMAP regen gate all fired correctly —
          no silent no-ops.

### `[x]` **4.5 Retire synthetic remote notes state before routine writes resume**

- _Goal:_ The wave-2 notes topology remains intact for its planned verification, then the synthetic bulk history
  and synthetic partial-push markers are removed before wave 3's live Errand/drain starts routine paired writes.
  This prevents the first post-NESC paired push from adopting the burn-in-only history into ordinary local refs.

    - `[x]` **4.5.a Clean the shared remote notes fixture and synthetic markers**
        - Retired after wave-2 evidence closed, with the destructive surface confirmed and the exact set recorded
          in `notes-finalize-parallelism.md` § Synthetic-state retirement: 4 unreachable-anchored notes entries
          removed (tip `c79d609db`, published via routine `arc user push` after the branch-before-notes gate
          fired as designed) and 7 synthetic sync-state markers dropped via CAS tree commit (tip `69f91327a`,
          fast-forward pushed). Append-only throughout; local backup refs anchor the undo. Post-push probe:
          zero markers rendered, notes `clean`/`same`, only ordinary reachable-anchor content on the canonical
          ref. Wave-4 marker-resurrection caveat recorded.

## **Phase 5:** Burn-in wave 3 — code + code + live errand

_Purpose:_ Primary-singleton contention + the parallel-errand decision's evidence — first-in-wins reconcile
discipline under real overlap, and a live errand/housekeep drain beside concurrent WU sessions. Resolves two of
the three seam-audit decisions with wave evidence.

_Design decisions:_ The live errand drain doubles as the drain-shape evidence collector (sequential vs.
dispatched; batch size + file-overlap frequency; post-BI-1 spawn cost). Interlock-friction evidence by work
character is recorded here for `interlock-release-refinement` to consume post-waves.

### `[x]` **5.1 Prepare and launch the wave-3 workload**

- _Goal:_ Two Light code WUs (provisional `ci-cross-platform-hardening` + one further pick) and a live errand
  drain session run alongside FP, creating real primary-singleton contention.
- _Decision (2026-07-15):_ Slate cut — `cli-test-hardening` + `husk-lifecycle-drivers` + the live errand drain.
  HLD takes the second slot as the dep-discharge vehicle (its shipped WTD edge discharges at graduation, closing
  the 4.3 re-anchor) with no test-infra overlap against CTH. Launch holds until `commit-message-submission`
  merges, so the spawns cut from a base carrying both wave-2 WUs' surfaces and the dispatch-fix live check runs
  against the freshest base.

    - `[x]` **5.1.a Confirm the wave-3 slate and launch (incl. the errand drain session)**
        - All three legs launched 2026-07-15, same day CMS merged: `plan/cli-test-hardening` (`2ae559b98`) and
          `plan/husk-lifecycle-drivers` (`dfe08394e`) spawned from the synced primary with BI-1 provisioning +
          seeded handoffs verified; the errand/housekeep drain session ran (PR #255) plus follow-on errand
          sessions.

- _Outcome:_ Wave 3 is live with real contention on day one — CTH activated (`chore/` branch, Phase 1 complete)
  and HLD through task generation in parallel. Both 4.3-re-anchored live checks recorded clean (dispatch cut
  from the synced base; HLD's `Depends On` discharged ungated at graduation). The drain leg already supplied
  5.3's first drain-shape datapoints (sequential-primary ten-entry batch; interruption-safety capture), and
  machine-load contention flaked shell-spawn quality gates same-day (captured to CTH) — evidence in
  `notes-finalize-parallelism.md` § Wave-3 launch evidence.

### `[ ]` **5.2 Verify the wave-3 matrix cells**

- _Goal:_ Each wave-3 cell's predicted failure is induced and observed (errands-ref same-slug collision,
  same/different-entry `USER-INBOX` removal reconciliation, the compaction-seed shared-checkout race).

    - `[x]` **5.2.a Errands-ref same-slug collision surfacing**
        - Induced in an isolated two-clone rig (local bare origin, synthetic identity, real CLI verbs): distinct
          slugs union cleanly; a same-slug divergence surfaces loud at the loser's push with the local ref intact
          and remote unchanged — matrix prediction holds. Recovery verified: `arc errand close --force` on the
          losing side, the next push re-unions the survivor and releases wedged records.
        - Surfacing seams (false "reconciles on next sync" promise, colliding slugs never named, fresh-machine
          no-trace, whole-ref wedge) routed to Task 7.4; full evidence in `notes-finalize-parallelism.md`
          § Wave-3 induction evidence.

    - `[x]` **5.2.b `USER-INBOX` removal reconciliation**
        - Cross-machine two-clone induction with the real inbox-remove/save/push/pull verbs. Same-entry removal
          races converge (both sides tombstone); a different-entry removal from a stale copy silently resurrects
          the other side's removed entry (the predicted recency lost-update, extended to removals — feeds 5.4).
          Serialized pull-before-write practice prevents resurrection structurally (tombstones materialize into
          the file and re-publish with the next save) — confirmed live and recorded as the playbook discipline.
        - New unpredicted wedge: same-commit concurrent saves (both machines at the same base tip) cannot
          converge through any sanctioned verb — per-file union refuses, pull refuses, sync refuses; only exit
          is the destructive, contagious `--force`. Split-out capture routed (entry-aware union at push
          reconcile, sequenced behind wave 4); guidance seams routed to Task 7.5. Evidence in
          `notes-finalize-parallelism.md` § Wave-3 induction evidence.

    - `[ ]` **5.2.c Compaction-seed shared-checkout race**

### `[ ]` **5.3 Resolve the parallel-errand fork and batch-errand sub-decision**

- _Goal:_ The parallel-errand fork (pin-primary vs. errands-in-primary + serialization) and the coupled
  batch-errand sub-decision are resolved with wave evidence, and recorded with rationale + any spawned follow-up WU.
- _Context:_ Recorded leanings enter the wave sharpened — pin-primary for the fork, sequential-first for the
  batch shape; the wave confirms or refutes rather than opening a neutral question.

    - `[ ]` **5.3.a Weigh the drain-shape + contention evidence and record the decision**

### `[ ]` **5.4 Resolve the same-entry cross-WU merge disposition**

- _Goal:_ The `resolveCrossWuState` same-entry lost-update is dispositioned (absorb / spawn-dependency / accept)
  with wave evidence and recorded.
- _Note:_ Recorded leaning — ship GA with a documented limitation + deterministic fast-follow; likely build home
  `operational-state-docs`.

    - `[ ]` **5.4.a Decide and record the disposition (+ any follow-up WU)**

### `[ ]` **5.5 Verify wave-3 detector-tests and record findings**

- _Goal:_ Wave-3 detectors fire on induction, errand-vs-WU teardown symmetry (trace-through target 2) is verified
  in practice, and findings are recorded.

    - `[ ]` **5.5.a Verify detectors + teardown symmetry, record**

## **Phase 6:** Burn-in wave 4 — cross-machine resume mid-flight

_Purpose:_ Materialize (spawn and in-place, per BI-2) against work another machine started — notes-lag and
partial-push surfaces under real latency — and verify the projection-builder consumer contract in practice.
Gated on BI-2.

### `[ ]` **6.1 Prepare and launch the wave-4 cross-machine scenario**

- _Goal:_ A remote-only in-flight WU is materialized both spawn and in-place (BI-2), honoring the occupancy
  guard, against work another machine started.

    - `[ ]` **6.1.a Materialize spawn and in-place against a second-machine WU**

### `[ ]` **6.2 Verify the wave-4 matrix cells and the projection-builder contract**

- _Goal:_ Wave-4 cells and the projection-builder contract (trace-through target 1) are exercised under
  cross-machine resume, with producer/consumer agreement confirmed.

    - `[ ]` **6.2.a Exercise the projection contract + wave-4 cells under real latency**

### `[ ]` **6.3 Verify wave-4 detector-tests and record findings**

- _Goal:_ Notes-lag, behind-base-at-integration, and partial-push detectors fire under real latency, and findings
  are recorded.

    - `[ ]` **6.3.a Induce the latency detectors, confirm firing, record**

## **Phase 7:** Resolve discovered seams

_Purpose:_ Land the fixes for seams **discovered during burn-in** that are atomic enough to absorb into this WU,
and record the spawn of a follow-up WU for those that are not — the Resolution model's landing zone, filled as
the waves run rather than authored up front.

> [!NOTE]
> **Open phase — populated during the burn-in waves** (Phases 3–6), per the Resolution model. Near-empty by
> design; the incompleteness is intentional. Remove on close — `_Purpose:_` keeps the emergent-population fact
> legible. _Prototype marker (FP); codified by `task-list-conventions`._

### `[ ]` **7.1 [BLOCKING] Move identity-global user-surface migration out of the path resolver**

- _Goal:_ `resolveUserSurfaceResolver` resolves paths only — it neither performs linked-worktree migration writes
  nor throws on a blocked migration, so routine read-only command paths (`arc user add`, `inbox-remove`, `status`,
  `recover`, plus executor-context and user-view assembly) can't fail on an unrelated divergent flat file.
  Migration relocates to an explicit opt-in flow (command layer or a dedicated reconcile step); if it must stay
  co-located, resolution degrades to advisory rather than throwing.
- _Blocking:_ MUST resolve before FP integration / GA — do not let this ship unfixed. The same issue rides on
  `main` after the Phase 2.I forward-port (the port is byte-faithful), so its fix reaches `main` at FP's own
  integration. Latent, not a current-work blocker: throws only on a linked worktree with an unmergeable divergent
  flat file.
- _Files:_ `src/lib/user-surfaces.ts` (`resolveUserSurfaceResolver` ~90-113 — the
  `reconcileLinkedIdentityGlobalUserSurfaces({ signpost: true })` call and the `blocked` → `throw`) and its call
  sites.
- _Surfaced by:_ CodeRabbit review of the Phase 2.I forward-port (PR #196), 2026-07-05.

### `[ ]` **7.2 Key marker self-invalidation on content fulfillment, not export-commit reachability**

- _Goal:_ A failed-then-recovered notes push stops rendering a false "notes lag" Aware line: the liveness
  predicate treats an intent as fulfilled when its content has landed (e.g., a note for the marker's
  `sourceCommit` is reachable at the notes tip), not only when the exact recorded export commit is reachable —
  recovered pushes land a different export commit, so today's predicate leaves stale-live markers for the full
  14-day TTL.
- _Verification bait:_ three deliberately-left stale-live markers from the 3.2.b induction (machineIds
  `2f8bb305` ×2 / `7647ac4c` ×1) must read fulfilled once the fix lands.
- _Surfaced by:_ wave-1 cell 3.2.b induction, 2026-07-09 — see `notes-finalize-parallelism.md` § Wave-1
  induction evidence.

### `[ ]` **7.3 Disposition the locus-gated awareness seam (hygiene/completion surfaces vs. worktree-resident operators)**

- _Goal:_ The arm/locus gating of the probe's hygiene and completion-tail surfaces is dispositioned — absorbed,
  re-gated, or spawned as a follow-up WU — with wave evidence recorded.
- _Context:_ Under real parallelism the operator resides in linked worktrees, but `sweep` and `orphanBranchSweep`
  emit primary-only, `errandState.residue` / `inFlight` are Orient-arm-only, and `workUnitState` (completion
  tail) skips linked resume arms — so shipped-WU husks, orphan branches, errand residue, and merged-sibling
  events accumulate invisibly. Wave-3 instance: the CMS husk went unsurfaced post-ship until hand-discovered,
  and the CMS merge gate (FP's own Next Action trigger) was probe-invisible on FP's resume arm, needing a manual
  `gh` query. The presence tiers are network-free, so lifting them (nudge-gated) to linked resume arms looks
  cheap; alternatives: a hygiene verb/view runnable anywhere, or `session-locus-model`'s locus-record read-verb
  as the carrier. Coordination captures routed to `husk-lifecycle-drivers` and `session-locus-model`
  (2026-07-15).
- _Surfaced by:_ wave-3 launch session, 2026-07-15 — see `notes-finalize-parallelism.md` § Wave-3 launch
  evidence.

### `[ ]` **7.4 Make errand-ref collision surfacing honest and traceable**

- _Goal:_ A same-slug errand-record collision names the colliding slug(s), states the real recovery (close the
  losing record — `arc errand close --force <slug>` on the discarded side) instead of promising an `arc sync`
  self-reconcile that cannot happen, and leaves a durable trace on machines without a sync-state record (mint
  the record, or stop discarding the marker writer's `false` return). Matters because one collision wedges the
  whole per-identity ref — every subsequent record publish blocks behind it with no pointer to the blocker.
- _Files:_ `handlers/errand.ts` (five conflict arms), `handlers/sync.ts` (`errandPartialPushDetail`),
  `lib/user-sync/sync-state.ts` (`recordErrandPartialPushMarker` no-record arm).
- _Surfaced by:_ wave-3 cell 5.2.a induction, 2026-07-16 — see `notes-finalize-parallelism.md` § Wave-3
  induction evidence.

### `[ ]` **7.5 Give diverged-notes surfaces honest guidance**

- _Goal:_ The diverged-notes conflict surfaces stop pointing at wrong or missing remedies: `arc user status`'s
  next-step names a `repair` verb that doesn't exist; the push-refusal message says "the union produced an
  unparseable note" when the manifests parse fine (it is a per-file content collision) and offers no procedure
  beyond `--force`; status renders the annotated commit's age as the note's save time. Message/guidance honesty
  only — the structural fix (entry-aware same-commit union) is the separate split-out capture from cell 5.2.b.
- _Files:_ `commands/user/push-fetch.ts` (~431), `commands/user/sync-status.ts`,
  `lib/user-sync/compaction.ts` (conflict message).
- _Surfaced by:_ wave-3 cell 5.2.b induction, 2026-07-16 — see `notes-finalize-parallelism.md` § Wave-3
  induction evidence.

## **Phase 8:** GA closeout

_Purpose:_ Bless worktree-by-default for GA — reconcile the concurrency doctrine to the as-built shape, finalize
and bless the GA-readiness checklist + parallelism incident playbook, retire the interim `--here` default (final
flip; the progressive per-wave retirement already ran in the wave phases), and settle the post-waves `/arc-shift`
revival decision.

_Design decisions:_ Doctrine reconciliation is evidence-gated — its exact edit-set (most sharply, whether
pin-primary inverts § "main worktree not always on main") firms up from the wave-3 parallel-errand outcome. The
parent below states the reconciliation _procedure + recorded outcome_, not the unknown edits.

### `[ ]` **8.1 Reconcile the concurrency doctrine to the as-built shape**

- _Goal:_ `strategy-concurrent-work.md` (and the Errand-class slice of `strategy-work-organization.md`) agrees
  with the settled seam-audit decisions and wave findings — no section contradicts verified behavior.
- _Approach:_ Evidence-gated. The touched section-set is determined by the wave outcomes; each subtask's outcome
  is the reconciliation performed and recorded, not a pre-stated edit.

    - `[ ]` **8.1.a § "Your main worktree is not always on main"**
        - Rewrite if wave 3 confirms pin-primary; confirm-as-written if the serialization-invariant arm wins.

    - `[ ]` **8.1.b § Worktrees by default**
        - Add the line acknowledging worktree creation now includes dependency + harness provisioning (BI-1).

    - `[ ]` **8.1.c § Shared files under concurrency**
        - Sharpen the "mutated shared state … out of scope" line with the same-entry merge disposition (5.4).

    - `[ ]` **8.1.d Errand-class slice of `strategy-work-organization.md`**
        - Absorb the parallel-errand invariant the fork settles + any orchestrated-drain-shape convention wave 3
          produces.

    - `[ ]` **8.1.e § Merge ordering / § Async-merge / § Worktree operations**
        - Confirm-as-built unless a wave surfaced a seam.

### `[ ]` **8.2 Finalize and bless the GA-readiness checklist and incident playbook**

- _Goal:_ The single "what-must-be-true" GA-readiness checklist and a symptom → diagnosis → recovery parallelism
  incident playbook exist and are blessed, with each containment invariant verified rather than assumed.

    - `[ ]` **8.2.a Assemble the GA-readiness checklist from the finalized matrix**
        - Finalized in `notes-finalize-parallelism.md` (WU-internal — a one-time gate record that archives with
          the WU on ship).

    - `[ ]` **8.2.b Distill the incident playbook (symptom → diagnosis → recovery)**
        - Distilled from the accumulated wave findings in `notes-finalize-parallelism.md`, then authored into
          `strategy-concurrent-work.md` as a new adopter-facing section (co-located with the doctrine 8.1
          reconciles).

    - `[ ]` **8.2.c Verify each containment invariant (not assumed)**
        - Committed+pushed work unlosable; no ARC verb destroys uncommitted work; notes pre-load backup present;
          same-entry merge loss documented with recovery; every loud failure has a written recovery path.

### `[ ]` **8.3 Retire the interim `--here` default**

- _Goal:_ Worktree-by-default is the default — the interim `--here` caveat is fully retired (final flip + the
  WORKING-MEMORY entry update); the progressive per-wave retirement already lifted it wave by wave.

    - `[ ]` **8.3.a Flip the default and update the WORKING-MEMORY entry**

### `[ ]` **8.4 Settle the `/arc-shift` revival decision**

- _Goal:_ The `/arc-shift` revival is decided with burn-in evidence (did an investigation-shaped detour surface?
  is the PR-review-checkout framing the likelier earning case?) and recorded — revive / materialize-stub / dismiss.

    - `[ ]` **8.4.a Decide and record the disposition (+ any stub or follow-up WU)**

## **Phase 9:** Verification

### `[ ]` **9.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The shared-mutable-surface matrix is complete and every cell is classified loud-vs-silent, with every
  silent cell closed by a build item, verified in a wave, or carried as a documented limitation with a recovery
  path — and the projection-builder contract + errand-vs-WU teardown trace-through are each traced, classified,
  and dispositioned.
- `[ ]` All six build items land and are verified: BI-1 provisions a spawned worktree to a working state (node
  gates pass off-primary; harness layer present; marker tree clean) and notices when unconfigured; BI-2's
  in-place Materialize checks out a remote WU without spawning, honoring the occupancy guard; BI-3 serializes
  same-machine cross-worktree notes writers, prevents paired-push sibling-note early export, and keeps marker
  surfacing from hiding live sibling partial-push intents; BI-4 makes a
  shell-invoked `arc start` CLI-complete with the mini-handoff, and a wave-2 re-graduation lands its ceremony on
  the plan branch with a 120-wrapped `Depends On`; BI-5 fails loud on an old-shape meta before any mutation; BI-6
  makes identity-global user surfaces canonical across worktrees without moving per-WU SESSION-NOTES out of the
  active worktree.
- `[ ]` All four burn-in waves complete on sacrificial workload with their induced detector-tests firing (base
  drift, notes lag, behind-base-at-integration, stale worktree each surface as claimed) — no detector silently
  no-ops.
- `[ ]` The three seam-audit decisions are resolved with evidence (parallel-errand fork + batch sub-decision;
  same-entry merge disposition; `/arc-shift` revival), each recorded with rationale and any spawned follow-up WU.
- `[ ]` The GA-readiness checklist and the parallelism incident playbook exist and are blessed — worktree-by-default
  is declared GA, and the interim `--here` default is retired per its wave-tied trigger.
- `[ ]` The concurrency doctrine matches the as-built shape — `strategy-concurrent-work.md` (and the Errand-class
  slice of `strategy-work-organization.md`) is reconciled with the settled decisions and wave findings; no
  section contradicts verified behavior.
- `[ ]` The containment invariants are each verified, not assumed — committed+pushed work unlosable; no ARC verb
  destroys uncommitted work; notes pre-load backup present; same-entry merge loss documented with recovery.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
