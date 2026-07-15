# Draft: wu-lifecycle-state-model — async-first WU lifecycle state model

- **Origin:** [internal] — consolidated from seven `USER-INBOX` captures at the housekeep drain (2026-07-07);
  all surfaced during `finalize-parallelism` planning and wave-1 dogfooding (2026-07-04 → 2026-07-06).
- **Purpose:** Split ARC's conflated lifecycle verbs into two clean axes — **planning-completeness** (a property
  of the work) and **activation/scheduling** (an act) — so async parallelism can hold impl-ready WUs in the
  backlog until bandwidth frees, and so `arc start` / `activate` stop being path-dependent and readiness stops
  being read off the wrong field.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration. Seed material_
> _is the core async-first reform plus activation-mechanics facets drained here; a save-location wording gap_
> _that was parked here was peeled out and fixed as a standalone errand (`planning-artifact-save-location`)._

### `[ ]` **Formalize the shipped, pending-teardown worktree terminal condition**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured during
  `finalize-parallelism` Task 4.1 slate resolution.
- _Concern:_ `worktree-teardown-decoupling` deliberately represents a self-teardown husk through existing
  signals—detached HEAD, ARC ownership marker, and a completed-record match—without adding a lifecycle state.
  Decide whether that terminal condition graduates into the four-state vocabulary, becomes an annotation, or
  remains a derived operational projection.
- _Boundary:_ consume the shipped mechanics and the `session-locus-model` reporting record; do not rebuild them.
  This WU owns the state vocabulary and may re-vocabulary the locus record later without schema churn.

### `[ ]` **Unbundle planning-completion from activation — async-first WU lifecycle state model** _(core reform)_

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-07); captured during `finalize-parallelism`
  Phase 2.E (WU-entry architecture) planning, 2026-07-05.
- _Priority:_ high — the human grooming designs to impl-ready is the throughput ceiling of parallelism; this
  reform is what lets a small pool of impl-ready WUs wait in the wings for available bandwidth.
- _Observation (core defect):_ ARC's lifecycle verbs bundle two independent transitions that async parallelism
  splits apart — **planning-completion** (artifacts authored → impl-ready; a property of the work) and
  **activation** (materialize a worktree, begin impl; a scheduling act). The original synchronous straight-line
  moved them together, so `State: Planning → Active` stood in for both. Async parallelism decouples them (a WU can
  be planning-complete in backlog for weeks before its impl is scheduled), and the model never grew the second
  axis — so `State` conflates the _scheduling_ axis with the _planning-completeness_ axis. Everything downstream
  (ROADMAP, STATUS.USER, an outside observer, an agent deciding "can I let this rip?") reads readiness off the
  wrong field.
- _Design direction (discussed, not yet groomed) — two clean axes:_
    1. **Lifecycle `State`** stays the _scheduling_ axis (Planning / Active / Integrating / Shipped); "Active"
       honestly means impl scheduled + worktree exists.
    2. **Readiness projection** = the _artifact_ axis. The determinate terminal event already exists
       (generate-tasks Finalized) but is only encoded implicitly in the meta `Next Action`, never projected to an
       outside-observable field — that projection is the missing primitive.
    3. **Activation** becomes a pure scheduling act that _consumes_ a ready WU: spawn worktree, move to `active/`,
       `State → Active`, begin impl.
- _Readiness = attested, not derived (Definition-of-Ready idiom):_ all three planning stages Finalizing
  (draft / spec / tasks) is the **prerequisite** — necessary, not sufficient; **impl-ready is the Owner's explicit
  attestation** on top ("I submit this as implementation-ready"). Attestation ≠ derivation. A **pre-activation
  sign-off extension socket** (idiom: CI/CD environment protection rules / required reviewers) defaults to
  self-attested (Owner = approver, zero ceremony); teams hook a separate approver so submitted-ready can't activate
  until signed off.
- _Staleness / DoR decay (two sources, only one detectable):_ (a) **mechanical** — code moved under the plan —
  detectable by reusing FP's base-overlap-drift machinery, stamping the attestation with a baseline commit (like
  SESSION-NOTES `Commit at Handoff`) and degrading `Ready → Ready (stale, re-verify)`; (b) **conceptual** —
  models / goals / semantics shifted so the design's assumptions eroded — undetectable, inherently judgment,
  proxied by time-elapsed-since-attestation (stale-bot idiom). The vet is **two-tier**: Tier-1 deterministic
  signals (deps, base-drift) _can degrade readiness and gate_; the Tier-2 judgment pass _never gates_ — an
  invitation offered because the user chose the agentic entry, its prominence escalating from soft invite (Tier-1
  green) to recommendation (Tier-1 drift).
- _Verb reconciliation:_ `init` (the verb) **retires** — it _was_ the synchronous coupling. Its two jobs split:
  mint-the-stub → `arc stub` (exists) or `--plan <blurb>` (mints-then-grooms when nothing exists yet);
  materialize-the-worktree → `activate` at impl-start. `--plan <existing-stub>` grooms; `--plan <description>`
  discusses → mints → grooms. Precision: async backlog planning under full protection still uses a cheap grooming
  branch (`chore/groom-<slug>`, already how `--plan` works) — no worktree, no `active/` move; what dissolves is the
  _worktree-coupled synchronous_ init. `init`'s surviving escape-hatch (spawn-then-plan-in-worktree) folds into an
  explicit **mode flag on activate/start**, not a top-level verb.
- _`--start` / `--plan` payoff (+ re-attestation):_ the two verbs stop overlapping because they land on different
  axes — `--plan` advances the artifact axis, `--start` acts on the scheduling axis (activate a ready WU).
  `--start` on a not-ready / stale WU is a deterministic mis-route that **routes into `--plan` carrying the drift
  analysis** — the same primed agent continues as a re-groom session — preserving the two-axis split rather than
  merging the verbs. That routing _is_ the re-attestation flow (bring a decayed WU back to impl-ready).
- _Backlog-planning concurrency:_ less surface than code work, not zero. It substantially **overlaps FP's
  shared-mutable-surface matrix** (foreign stub metas / draft buffers; ROADMAP contention; the notes surfaces), so
  the reform inherits FP's discipline (`arc status <slug>` slug-resolution guard, drain-time checks, wave-3
  evidence). **Open policy question:** when is direct cross-stub-buffer routing legitimate (backlog-to-backlog
  planning artifacts, no impl-branch pollution) vs. inbox-mandated — it interacts with the recorded rule (routed to
  `planning-iteration-mechanics`) that coordination routing goes via gitignored `USER-INBOX`, never by editing
  sibling tracked buffers from a WU branch; the lifecycle-state race (target stub activating / moving under you)
  needs the slug guard regardless.
- _Forward-compat (must check):_ readiness is an **event-shaped, baseline-stamped, multi-actor** signal
  (attest → drift → re-attest → sign-off) — a per-artifact meta **boolean is the wrong primitive** (it flattens
  the event history the model needs, and hardcodes tracked-in-repo, killing the `storage.track_design_docs` privacy
  knob). It maps to the backend event-log model (the same shape as BI-6's slug-keyed / entry-granular inbox).
  Sanity-check against `strategy-storage-evolution.md` + `draft-arc-backend.md` (the standing WORKING-MEMORY
  directive for storage-sensitive planning) — the backend substrate could dissolve backlog-planning concurrency by
  moving it off branch-merge onto entry-granular records.
- _FP relationship (feeds evidence; does NOT build this):_ FP Phase 2.E ships the agentic `--start` vet against a
  readiness **contract** (degrade gracefully: attested-ready if present → best-effort "tasks Finalized?" heuristic
  → deps-only) plus the free in-flight-composition advisory and the Tier-2 judgment invitation, so it lights up
  automatically once this reform mints the real signal — but **FP mints no readiness field/marker** (socket-only:
  the marker is a scheduling/throughput primitive with no concurrency failure mode, so it is invisible to the
  burn-in waves, which validate mechanics, not throughput). FP's waves surface the "activation-ready is not a clean
  state" gap as the evidence that justifies this reform.
- _Related WUs (coordinate):_ `planning-iteration-mechanics` (owns the coordination-routing rule +
  planning-closeout gate), `operational-state-docs` (readiness projection onto STATUS surfaces),
  `strategy-storage-evolution` / `arc-backend` (event-log substrate), `roadmap-tooling` (a readiness column on the
  project view), `goal-aware-direction` (the direction layer reads readiness). Also touches the `(activation)`
  init/activate footer split captured for `naming-conventions`.

### `[ ]` **`arc start`/`activate` is path-dependent in the async model — resolve branch type + gate `Class` by path**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-07); captured during `finalize-parallelism`
  wave-1 fixture spawn, 2026-07-06 (the `[TBD]` refusal and hardcoded `plan/` both surfaced live).
- _Observation:_ `arc start`'s spawn hardcodes the `plan/<name>` branch prefix (`start.ts:297,717` — string
  literal, no type resolution) and its `class-resolved` guard hard-refuses a `[TBD]` Class. Both assume the
  _synchronous_ model where start = "graduate a stub and keep planning in a worktree." The async split forks start
  into two paths, and both surfaces are path-dependent:
    - **Branch prefix.** On the impl-ready activation path the branch should be **born typed** (`feat/` / `fix/` /
      `refactor/`…), not `plan/` — planning is already done, so the `plan/` state-proxy is wrong. `plan/` stays
      only for the spawn-then-plan escape hatch. So `start` must resolve _which path_, and on the impl path resolve
      a branch **type** it doesn't model today (`Branch` sits `[none]` on the stub; there is no type field).
      Cleanest source: record the type at `--plan` finalize (known by impl-ready), read it at activate; prompt as
      fallback.
    - **`Class` gating.** A `[TBD]` Class is **legitimate on the planning-entry path** — Class resolves _during_
      planning, so entering planning with it unresolved is correct and the `class-resolved` guard should NOT fire
      there. The guard belongs on the **impl-activation** path only. So class-resolved is path-conditional, not
      merely bypassable.
- _Relationship to the escape-hatch entry below:_ this sharpens it. The deeper structure is that readiness guards
  (class-resolved, and the planned impl-ready flag) are **path-conditional** — enforced on the impl path, relaxed
  on the planning-entry path. A uniform bypass is the manual override; path-awareness is the default behavior.

### `[ ]` **Decide `arc start`'s readiness-guard escape hatch — uniform bypass, not per-guard `--class`**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-07); captured during `finalize-parallelism`
  wave-1 fixture spawn, 2026-07-06 (PR #198 set both `burn-in-probe-*` stubs to `Light` per-instance).
- _Observation (finding):_ The scaffold→spawn seam drops `Class`. A stub minted by a scaffolding errand carries
  `Class: [TBD]`; the spawn-anchored `arc start`'s `class-resolved` guard then hard-refuses it, so the first spawn
  of a wave hit a stop. Working-as-intended guard, but the fixture-prep recipe didn't resolve `Class` up front.
- _Design Q1 (escape-hatch shape):_ Should `arc start` grow an override for its readiness guards? Lean: **not** a
  `--class` flag — it is guard-specific (won't scale as more launch guards land) and conflates "supply the missing
  value inline" with "bypass the check." Preferred shape: a **single uniform `--force`/`--anyway` bypass over all
  readiness guards** (class-resolved + implementation-ready + future), gated loudly (prints what it skips, ideally
  requires a reason). Forward-compatible with the async pivot: if readiness becomes a state you occupy rather than
  a gate you clear, a uniform bypass degrades naturally into "start in a not-yet-ready state."
- _Design Q2 (two distinct needs — hold both open):_ A uniform bypass ("start despite unreadiness") and inline
  value-supply ("resolve `Class` trivially at launch instead of upstream") are genuinely different needs. The async
  pivot may dissolve the first (readiness stops gating) but **not** the second (`Class` still needs to be _set_,
  just maybe lazily). Don't collapse them into one flag.

### `[ ]` **Wave-1 workload finding: `Class` is a rest-state snapshot grooming can invalidate**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-07); captured during `finalize-parallelism`
  wave-1 setup, 2026-07-05 (full detail in `notes-finalize-parallelism.md` § Dogfood finding (Wave-1 workload)).
- _Observation:_ Dogfooding FP's wave-1 slate falsified the "real Light doc WU" workload premise. Real _Light_ doc
  work is Errand-shaped and single-session (no handoff→resume, so cross-session notes convergence never fires);
  real _substantial_ doc work is Heavy or carries code/lifecycle legs. "Real, Light, doc-only, **multi-session**,
  coherent WU" is near-empty by construction — three consecutive `--start`-vetted picks (`inbound-routing-method`,
  `adr-accept-timing`, `cli-readme`) each failed on one of these axes.
- _Implication:_ `Class` is a rest-state snapshot that grooming can invalidate — direct evidence for this WU's
  "activation-ready is not a clean state" thesis. Argues for a sharper readiness/selection axis than
  `Class: Light`: **determinate scope** (grooming yields a known artifact, not a design resolution) +
  **multi-session span**.

### `[ ]` **Make `arc start` spawn ceremony transactional — self-rollback on pre-commit failure**

- _Routed from:_ `USER-INBOX § Work Unit` (WU_Target TBD — folded here at drain; the activation ceremony is where
  atomicity belongs), housekeep drain (2026-07-07); captured during `finalize-parallelism` wave-1 fixture spawn,
  2026-07-06.
- _Observation (incident):_ `arc start <slug>` (spawn/graduate) failed **non-atomically** and left orphaned partial
  state with no cleanup guidance — worktree created + fully provisioned (deps + harness layer), `plan/<slug>` branch
  cut, the backlog→active graduation move left uncommitted inside the spawned worktree — which had to be hand-rolled
  back (`git worktree remove --force` + `git branch -D`). The ceremony died at its commit-staging step, i.e.
  **before any valuable commit existed**.
- _Triggering bug (already fixed):_ a repo-root-relative `worktree.location_template` resolved to a relative
  worktree path that became the executor's cwd, so the staged `git add` carried a `..` escaping the worktree. Fixed
  by absolutizing the spawn path (`fix/fix-spawn-worktree-path`). But _any_ mid-ceremony failure would strand the
  same partial state.
- _Actionable follow-on:_ make the spawn/graduate ceremony **transactional** — on a pre-commit ceremony failure,
  tear down the just-created worktree + branch automatically so the tree returns to its pre-start state; at minimum,
  print the exact rollback commands on failure.
- _Design note (no separate `undo-start` verb):_ do **not** add a dedicated "undo a start" convenience. The clean
  rollback is safe **only** pre-commit; once commits / push / PR / SESSION-NOTES exist, reversal needs the
  containment guards `abandon` / `park` already carry. So: deliberate reversal → `abandon` / `park`; failed-start
  cleanup → transactional self-rollback above.
- _Precedent:_ echoes two drained items (both `## Removed` 2026-07-03) — "graduate-transition crash class" and "Fix
  spawn-mode ceremony locus." The atomicity concern was recognized and partially addressed but not fully closed.

### `[ ]` **Rename the session-init `--start` recon arm to `preflight`; free the term from BI-5**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-07); captured during `finalize-parallelism`
  wave-1 setup, 2026-07-05.
- _Observation:_ The session-init `--start` focused-recon arm reads better as **`preflight`** (closed form) in
  user-facing prose — it pairs with the launch framing (preflight check → launch) where "focused recon" is
  idiosyncratic. Keep the `--start` signal itself: its symmetry with the bare `arc start <slug>` no-agent door
  (vetted-then-go vs. just-go) is worth preserving.
- _Approach:_ Rename the arm in `session-init.md` prose (`focused recon` → `preflight`); to free the term, rename
  BI-5's internal `runGraduate` "preflight" (meta-shape validation-before-mutation) usage to something else (e.g.
  `validate-first`). The prime name goes to the user-facing surface.
- _Cross-ref:_ `naming-conventions` (the `preflight` term overload).

### `[ ]` **Preserve PSI's scheduling/readiness axis contract**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain
  (2026-07-10); settled during `project-state-integrity` grooming.
- _Contract:_ mint no new stored `State` values and do not re-key existing meanings. `State` remains the
  scheduling/progress axis; readiness is an orthogonal attested signal; compositions such as
  `Ready (stale, re-verify)` are projection-time only.
- _Coordination:_ PSI's composer keys identity and life phase on meta content rather than branch naming, so this
  WU may freely reshape `plan/` and activation rename mechanics. If the axis contract itself must change,
  coordinate through PSI's readiness-provider socket rather than the enum.

### `[ ]` **Give parking and backward transitions explicit axis semantics**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain
  (2026-07-10); surfaced by the PSI adversarial audit and design reckoning.
- _Concern:_ parked WUs currently encode literal `State: Active` in a `backlog/planned/` pointer and derive
  “parked” from directory position. Backward verbs likewise mix readiness revocation, de-scheduling, and genuine
  progress retreat.
- _Fold-in:_ give parking an explicit scheduling-axis home and settle the backward edges per axis. Preserve PSI's
  interim single-classifier swap point until this reform replaces it; no parked-WU migration is currently needed.

### `[ ]` **Retire activation's remote plan shadow in the lifecycle model**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain
  (2026-07-10); observed during FP wave-1 spawn verification.
- _Concern:_ retire the remote `plan/` shadow ref safely after the new head lands, and reconcile that cleanup with
  the post-reform activation model. SSOA must make any interim shadow ref harmless to lifecycle/status truth; this
  WU owns eliminating the residue.
