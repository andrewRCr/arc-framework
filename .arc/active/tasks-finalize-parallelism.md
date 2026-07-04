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

### `[ ]` **2.6 BI-6 — Identity-global user-surface binding**

- _Goal:_ From any worktree, identity-global user surfaces resolve to one canonical machine-local materialization,
  while per-WU SESSION-NOTES remains worktree-scoped. The design composes with `strategy-storage-evolution.md`,
  `draft-arc-backend.md`, and `operational-state-docs`: this is a resolver/storage-boundary fix, not a new
  checkout-local merge convention.

    - `[ ]` **2.6.a User-surface resolver by semantic scope**
        - Build `test-first` (one behavior at a time):
            - Codify the interim `UserSurfaceResolver` contract before wiring callers: visible identity-global
              surfaces use one canonical machine-local materialization, with the primary worktree's
              `.arc/user/{identity}/` root as the zero-config backing store unless the call site is explicitly
              machine-internal; repo-shared common-dir helpers remain for hidden internal stores such as locks /
              machine id.
            - Load-set / compaction-seed / nudge-marker contracts consume resolver-produced identity-global paths
              rather than assuming active-checkout-relative `.arc/user/{identity}/...` paths from linked worktrees.
            - `USER-INBOX`, `WORKING-MEMORY`, `STATUS.USER`, and identity-global nudge markers resolve to the
              canonical root from primary and linked worktrees
            - WU-scoped SESSION-NOTES resolves to the active worktree's per-WU subdir
            - All identity-global readers and writers are routed through the resolver: `arc user add`,
              `arc user inbox-remove` / errand cleanup, `STATUS.USER` cache read/write, session-init
              inbox/reminder/working-memory/load-set surfaces, and `arc user status` drift inspection.
            - Shipped workflow/skill guidance that currently tells agents to edit
              `.arc/user/{identity}/{USER-INBOX,WORKING-MEMORY}.md` directly is updated to use the resolver-backed
              path/command surface, so linked-worktree sessions cannot recreate divergent checkout-local copies.

    - `[ ]` **2.6.b Notes save/load split-source handling**
        - Build `test-first` (one behavior at a time):
            - `arc user save` derives/passes the current WU, then serializes one logical manifest from two physical
              loci: current WU `SESSION-NOTES.md` from the active worktree and identity-global flat files from the
              canonical root.
            - `arc user load` / `arc user pull` materialize each manifest entry to its semantic locus: current WU
              per-WU files into the active worktree and identity-global flat files into the canonical root, without
              importing a sibling WU's SESSION-NOTES into the current worktree.
            - Save/load verification, pre-load backups, backup listing, and sync-status/drift inspection compare the
              same logical split manifest they materialize, not one checkout-local `userDir`.
            - Legacy root-level `SESSION-NOTES.md` from old manifests never becomes identity-global state: load may
              migrate it to the current WU only when no WU-scoped notes entry exists; otherwise preserve it via
              backup/notice, and save excludes any new flat root `SESSION-NOTES.md`.

    - `[ ]` **2.6.c Divergent-copy migration and teardown guard**
        - Detect existing linked-worktree copies of identity-global files, reconcile them once into the canonical
          root with merge-aware behavior, and ensure worktree teardown cannot silently delete the only copy of a
          capture that has not reached notes.
        - The guard runs at the common worktree-removal path, not only during the first migration, because ignored
          `.arc/user/*` edits do not make a linked worktree dirty. Cleanup-offer probes surface the same risk.
        - Test that a git-clean linked worktree containing only ignored identity-global user captures is reconciled
          or refused before `git worktree remove` can delete it.

## **Phase 3:** Burn-in wave 1 — two doc-only WUs

_Purpose:_ First live concurrency exercise on node-toolchain-free workload — spawn, notes sync, ROADMAP
contention, integration ordering — plus induced detector-tests for the cells this wave covers. Gated on BI-1's
harness-layer leg + BI-3 + `roadmap-tooling`; workload: two Light doc-only WUs, spec-ready at pickup.

_Design decisions:_ Workload is sacrificial and surface-disjoint from FP's build items (provisional slate:
`inbound-routing-method` + `adr-accept-timing`). Every wave verifies detectors as well as paths. Gating and
coordination detail in `notes-finalize-parallelism.md` § Sequencing.

### `[ ]` **3.1 Prepare and launch the wave-1 sacrificial workload**

- _Goal:_ Two Light doc-only WUs run concurrently in spawned worktrees alongside FP, each with Class and
  spec-readiness confirmed at pickup.

    - `[ ]` **3.1.a Confirm the wave-1 slate**
        - Confirm `inbound-routing-method` + `adr-accept-timing` are Light and spec-ready (or substitute from the
          doc-only pool); verify surface-disjointness from FP's build items.

    - `[ ]` **3.1.b Spawn and run the two WUs alongside FP**

### `[ ]` **3.2 Verify the wave-1 matrix cells**

- _Goal:_ Each wave-1 cell's predicted failure is induced and observed, confirming (or correcting) its
  loud/silent classification.

    - `[ ]` **3.2.a Notes-ref cross-worktree writer/export race (BI-3 in practice)**
        - Induce two same-machine worktree notes writes plus the A-save/B-save/A-paired-push interleaving; confirm
          serialization holds, no note is dropped, and no sibling note is exported before its branch lands.

    - `[ ]` **3.2.b Sync-state marker shared-key ordering**
        - Exercise misordered sibling publishes with multiple unresolved marker intents; confirm no earlier live
          marker is hidden, and any remaining shared-key residue is TTL-bounded / presentation-only.

    - `[ ]` **3.2.c ROADMAP concurrent regen**
        - Induce concurrent regens from different base states; confirm conflict (loud) vs. stale-render (silent).

    - `[ ]` **3.2.d Base-branch reconcile gate re-verify**
        - Confirm the behind-base reconcile gate fires as landed.

### `[ ]` **3.3 Induce and confirm the wave-1 detector-tests fire**

- _Goal:_ The session-init detectors this wave can exercise (base drift, notes lag, stale worktree) fire when
  their condition is induced — a silent no-op is caught as a GA blocker.

    - `[ ]` **3.3.a Induce each detector condition and confirm the surface fires**

### `[ ]` **3.4 Record wave-1 findings**

- _Goal:_ Wave-1 outcomes are appended to `notes-finalize-parallelism.md` and the in-progress GA checklist
  (seeded at Task 1.1.d), so nothing observed is lost between waves. The incident playbook is distilled from
  these notes later, at Task 8.2.b.

    - `[ ]` **3.4.a Append results to the notes and the in-progress GA checklist**

## **Phase 4:** Burn-in wave 2 — one code WU + one doc WU

_Purpose:_ First real off-primary code exercise — worktree dependency provisioning + per-task quality gates
off-primary — and a re-graduation that verifies BI-4's ceremony-locus fix. Adds BI-1's node-deps leg to the
wave-1 gating set.

### `[ ]` **4.1 Prepare and launch the wave-2 workload**

- _Goal:_ One Light code WU (provisional `cli-test-hardening`) and one doc partner run concurrently alongside FP,
  the code WU's deps provisioned by the BI-1 manifest.

    - `[ ]` **4.1.a Confirm the wave-2 slate and spawn**

### `[ ]` **4.2 Verify off-primary node quality gates and dependency provisioning**

- _Goal:_ typecheck / test / build / lint run green in a BI-1-provisioned spawned worktree — the flip-decisive
  `node_modules` gap is closed in practice, with no bare-`npx arc` foreign-registry edge.

    - `[ ]` **4.2.a Run the full gate set off-primary and confirm green**

### `[ ]` **4.3 Re-graduate a WU to verify BI-4's ceremony-locus fix**

- _Goal:_ A wave-2 re-graduation lands its init ceremony on the plan branch with a 120-wrapped `Depends On` —
  BI-4's spawn-mode ceremony-locus fix verified live.

    - `[ ]` **4.3.a Re-graduate and confirm ceremony locus + wrap**

### `[ ]` **4.4 Verify wave-2 detector-tests and record findings**

- _Goal:_ Wave-2 detectors fire on induction and findings are recorded to `notes-finalize-parallelism.md` and
  the in-progress GA checklist.

    - `[ ]` **4.4.a Induce detectors, confirm firing, record**

## **Phase 5:** Burn-in wave 3 — code + code + live errand

_Purpose:_ Primary-singleton contention + the parallel-errand decision's evidence — first-in-wins reconcile
discipline under real overlap, and a live errand/housekeep drain beside concurrent WU sessions. Resolves two of
the three seam-audit decisions with wave evidence.

_Design decisions:_ The live errand drain doubles as the drain-shape evidence collector (sequential vs.
dispatched; batch size + file-overlap frequency; post-BI-1 spawn cost). Interlock-friction evidence by work
character is recorded here for `interlock-release-refinement` to consume post-waves.

### `[ ]` **5.1 Prepare and launch the wave-3 workload**

- _Goal:_ Two Light code WUs (provisional `ci-cross-platform-hardening` + one further pick) and a live errand
  drain session run alongside FP, creating real primary-singleton contention.

    - `[ ]` **5.1.a Confirm the wave-3 slate and launch (incl. the errand drain session)**

### `[ ]` **5.2 Verify the wave-3 matrix cells**

- _Goal:_ Each wave-3 cell's predicted failure is induced and observed (errands-ref same-slug collision,
  same/different-entry `USER-INBOX` removal reconciliation, the compaction-seed shared-checkout race).

    - `[ ]` **5.2.a Errands-ref same-slug collision surfacing**

    - `[ ]` **5.2.b `USER-INBOX` removal reconciliation**
        - Induce same-entry and different-entry removal races from the live errand/drain shape; confirm whether
          serialized-primary practice prevents local resurrection, or record the accepted playbook limitation.

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
