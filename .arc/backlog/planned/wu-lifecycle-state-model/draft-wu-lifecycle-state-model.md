# Draft: wu-lifecycle-state-model — async-first WU lifecycle state model

- **Origin:** [internal] — consolidated from seven `USER-INBOX` captures at the housekeep drain (2026-07-07);
  all surfaced during `finalize-parallelism` planning and wave-1 dogfooding (2026-07-04 → 2026-07-06).
- **Purpose:** Split ARC's conflated lifecycle verbs into two clean axes — **planning-completeness** (a property
  of the work) and **activation/scheduling** (an act) — so async parallelism can hold impl-ready WUs in the
  backlog until bandwidth frees, and so `arc start` / `activate` stop being path-dependent and readiness stops
  being read off the wrong field.
- **Re-scoped:** at the `state-storage` re-cut (2026-09-28). Its placement and record entries moved to
  `storage-seam` and `storage-contract`, where lifecycle state becomes a record field and placement a projection.
  It keeps the state axes and their vocabulary, and waits on `storage-cutover`.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration. Seed material_
> _is the core async-first reform plus activation-mechanics facets drained here; a save-location wording gap_
> _that was parked here was peeled out and fixed as a standalone errand (`planning-artifact-save-location`)._

### `[ ]` **Decide whether an Owner-invoked lifecycle rewind is a proven need**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: wu-lifecycle-state-model`

- _Observation:_ dogfooding a Candidate-bearing work unit surfaced a proposed rule: once verification completes and
  a Candidate exists, scope freezes for ordinary continuation, and the Owner's only way to grow scope in place is an
  explicit rewind to the appropriate planning or execution stage — regenerating affected tasks or delivery topology
  and invalidating downstream Candidate, verification, and review evidence rather than retaining it. No such path
  exists today: `reopen-work-unit` rewinds only Integrating → Active against an open PR, the pre-publish route is
  review-fix plus applicability, and anything larger exits by extraction. `amend-design` refuses a general rewind by
  design (D4, plus a Non-Goal frozen at activation) on recorded evidence that whole lifecycle re-entry regressed
  state painfully in this project.

- _Approach:_ decide first whether the need is real — an in-place scope growth that extraction genuinely serves
  badly — before designing anything. If it is, the state axes are where an explicit rewind would have to be
  expressible, with its evidence consequences typed rather than left to prose, and with Owner override selecting
  that path rather than waiving its consequences. This work unit has the authority to fold it in or route it out to
  its own stub once that call is made; deliberately not a stub yet, and not urgent.

- _Boundary:_ the defect-versus-scope-expansion distinction is already the `amend-design` entry gate, the
  same-concern versus distinct-concern routing is already `DEV-RULES.ARC § Anti-rider`, and whether prior review,
  verification, and merge evidence still holds is `evidence-applicability`'s. Open here is only the rewind path and
  whether the state model should admit one.

- _Captured during:_ `plan-amendment` Phase 4 close, assessing a routed-in scope-expansion proposal against that
  work unit's design, 2026-09-12.

### `[ ]` **Qualify dependency edges with the lifecycle boundary they gate**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-08-22);
  captured during `decomposition-doctrine` re-grounding.
- _Concern:_ unqualified `Depends On` means blocks-start, leaving implement-time and integrate-time ordering in
  unchecked prose that readily goes stale. The inverse also fails: recording a true later-boundary dependency as
  today's edge falsely blocks planning.
- _Fold-in:_ evaluate lifecycle-qualified degrees such as required-to-plan, required-to-implement, and
  required-to-integrate against this WU's state axes. Preserve today's unqualified blocks-start reading as the
  default, enforce each degree at its owning ceremony, and keep later-boundary session orientation advisory.

### `[ ]` **Model draft-first review as a three-tier audience transition**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-08-10).
- _Concern:_ the current private-Candidate/publication model assumes private versus public, but draft locking adds a visible,
  review-suppressed middle state. Treat release rather than PR creation as the public transition when locked;
  `merge.lock: none` collapses the two events naturally.

### `[ ]` **Give parked work units a lifecycle contract consumed by integration gates**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-08-10).
- _Concern:_ lane classification, merge-lock readiness, and teardown each mis-handle a parked WU because they infer
  a shipped/abandoned binary despite a valid `park-planning` receipt. Define parked state on the model's axes and
  make these gates consume it rather than infer from branch topology.

### `[ ]` **Re-aim the retired locus-generation coordination pointer**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-08-10).
- _Concern:_ the draft coordinates exact-generation mutation and locked cleanup with the killed
  `locus-generation-binding` WU. Re-evaluate whether the surviving identity-ref CAS owns the concern; re-aim or
  remove the pointer without weakening fail-closed missing/ambiguous-subject behavior.

### `[ ]` **`decomposition-hardening` rename-move marker is an operational projection to re-vocabulary later**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-23); captured during
  `decomposition-hardening` create-spec finalization.
- _Concern:_ DH area 3 adds a session-init sweep surface for "worktree path lags renamed identity" as an
  **operational stamped marker** (derived projection reusing husk-stamp mechanics), minting **no** lifecycle-state
  term — because this WU owns that vocabulary and is unsettled. When this model settles, it may fold the marker
  into a named terminal state **without schema churn**.
- _Fold-in:_ treat the shipped rename-move marker as a candidate to absorb into the state model at settle time
  (same boundary posture as the pending-teardown husk formalization already buffered here). See
  `spec-decomposition-hardening.md` area 3.

### `[ ]` **Advance `Last Completed` at planning-stage finalize**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-23); captured during `wu-rename`
  create-spec finalization.
- _Concern:_ after `arc finalize create-spec`, `Current Workflow` advanced to `generate-tasks` while
  `Last Completed` still named `draft-design`. Handoff eventually repairs the field, but a crash or session end
  between finalize and handoff leaves the tracked meta internally inconsistent.
- _Fold-in:_ make each planning-stage finalize advance `Last Completed` through the field model alongside the
  `Class` write and stage advance, instead of leaving it handoff-owned.

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
  Sanity-check against `strategy-storage-evolution.md` + `draft-storage-contract.md` (the standing WORKING-MEMORY
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

### `[ ]` **Expose the lifecycle-stage distinctions the stage-aware design-load read dispatches on**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-07-18);
  captured during the sidecar-discovery session, 2026-07-18.
- _Concern:_ a stage-aware design-load read (`draft-stage-aware-design-load.md`, provisional) needs a stable
  stage vocabulary to dispatch on — specifically the spec-settled vs activation distinction (a WU with a
  finalized spec but not yet activated carries materially less remaining design load than one in draft-design).
  That is the `State` semantics this WU owns; make the distinction a first-class citizen of the model, not
  inferred from artifact existence. It is also the natural home for making the probe's `inFlightComposition`
  stage-aware, since the states are its contract.
- _Concern — verb gap:_ `arc status <slug>` reports coarse lifecycle state (`planning` / position) but not the
  current workflow or planning stage, so no CLI verb today answers "is this WU past create-spec?" — stage-aware
  consumers would have to read the meta. Grow the slug-status record to report it (storage-evolution
  forward-compat: consumers resolve stage through the verb, never the artifact's location).

### `[ ]` **Make the quick-scan lifecycle-stage signal first-class (vocabulary + derived tail states)**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-07-18);
  captured during `session-locus-model` draft-design grooming (stage-signal discussion), 2026-07-18.
- _Concern:_ under live parallelism (5 WUs in flight) a glanceable "which stage is each WU in" signal is
  load-bearing, and nothing renders it — current practice is manually renaming harness sessions per stage
  (draft-design → create-spec → generate-tasks → process-task-loop → verify → integrate), which works and confirms
  the demand. `Current Workflow` (meta, ceremony-advanced) is the working interim key and tracks the authored
  lifecycle nearly 1:1; past the ship boundary the stages are _derived_ states (awaiting-review / mergeable /
  merged-needs-archival — probe `workUnitState`), not workflows.
- _Ask:_ the state-model vocabulary should yield one stable per-WU stage value spanning the authored range and the
  derived tail, for consumers to key off: session-title automation (`session-retitle`, planned stub minted at this
  drain), the `session-locus-model` read verb's join, `status-hud`'s card and any roster view.
- _Open:_ roster-view placement ("all in-flight WUs × stage, one line each") — `status-hud` vs. `STATUS.USER` /
  `operational-state-docs` territory.
- _Coordination:_ `session-locus-model` settled derive-not-store at its 2026-07-18 grooming — the locus record
  never stores stage; the read verb joins locus identity with the subject's meta at query time. Stage therefore
  homes in the meta (today) / this WU's substrate (later), never in machine-local locus state.

### `[ ]` **Decide whether a cold-minted work unit may record `Class` at start**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ `arc start --new` mints a work unit with no backlog stub, and `--class` never reaches that arm —
  the flag is threaded only into `graduate`, where it reconciles against the stub's recorded value. Before
  `cli-command-inputs`, passing `--class` alongside `--new` was silently ignored; it is now an explicit refusal.
  The refusal is honest about today's wiring, but it makes visible an unanswered question: a cold-minted unit
  starts at `[TBD]` and can only resolve weight later at a `finalize` fire-point, even when the operator already
  knows the weight at mint time.

- _Approach:_ decide the policy, then align the flag with it — either accept `--class` on the cold-mint arms and
  seed the scaffolded meta, or keep the refusal and word it as a deliberate routing instruction toward
  `finalize` rather than as a scope statement about stubs. Worth checking against the `class-resolved` guard,
  which today reads as graduation-specific.

- _Why here:_ this WU owns the axis the question sits on — `arc start` being path-dependent and readiness being
  read off the wrong field. `cli-command-inputs` surfaced it but explicitly does not own stub or lifecycle
  policy.

- _Captured during:_ `cli-command-inputs` base reconciliation (2026-07-24); the inherited `rename` end-to-end
  setup was passing the inert flag and began failing once the refusal landed.

### `[ ]` **Own the code-written `Current Workflow` boundary**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: wu-lifecycle-state-model`), housekeep drain (2026-09-07);
  captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ a pre-commit validator can immediately reject internal inconsistency, but the durable question is
  which lifecycle transitions may write `Current Workflow` and how that projection composes with canonical state.
- _Fold-in:_ define the authoritative write boundary and derivation rules here; keep handoff from becoming an
  unrestricted repair writer and treat the validator Errand as an interim guard.

#### Evidence — Settle whether planning-stage re-entry moves the stage pointer, and guard the write

- _Additional routed evidence:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: wu-lifecycle-state-model`

- _Observation:_ `set-stage` validates only the stage enum, so it accepts writing `Current Workflow` backward to
  `create-spec` while `Design` still points at `spec-*`. `checkCurrentWorkflowConsistency` rejects that exact
  tuple, so the next session-init resolves the checkout `subject-unresolved` and stops. The write path does not
  guard what the read path rejects, and the cost lands a session later, on whoever opens the checkout next rather
  than on the write that caused it.

- _Decision to settle:_ what a mid-stage re-entry means for lifecycle state. If re-entry is a **detour** back
  through an earlier workflow's process, the pointer is forward-only and `set-stage` should refuse any write
  leaving the `(State, Current Workflow, Design)` tuple inconsistent. If it is an actual **rewind**, the
  re-entered tuple needs a legal encoding the validator accepts, and `Design` must say which artifact is live.
  Current lean: the detour reading.

- _Why the lean:_ a true rewind has no coherent downstream story — re-entering `create-spec` from
  `generate-tasks` would imply re-running the whole of `generate-tasks` afterwards, when the actual need is to
  regenerate the phases the new design touches and leave the settled ones alone. It also falsifies the record:
  `Current Workflow` and `Last Completed` stop describing what completed, so the meta no longer reads as a
  truthful history of the work unit. A detour keeps both intact — the pointer stays at the stage that owns the
  finalize fire-point, and the detour lives in `Next Action` prose.

- _Approach:_ run the same tuple check on the write side so `set-stage` refuses, rather than deferring the failure
  to the next read. Whichever reading wins, state it in `resolve-planning-depth.md` § Mid-stage re-entry: it routes
  a derivation surprise to the spec today without saying what becomes of the pointer, which is how the backward
  write came to be made.

- _Files:_ `packages/arc-framework/src/lib/work-unit/verbs/set-stage.ts`,
  `packages/arc-framework/src/lib/active/current-workflow-consistency.ts`,
  `.arc/system/methods/resolve-planning-depth.md`, `.arc/system/workflows/arc/generate-tasks.md`.

- _Captured during:_ `delivery-post-landing-conflict-recovery` session-init, 2026-09-17 — entry was blocked by it;
  pointer corrected in `a30ebed17`.

#### Evidence — State the `Current Workflow` field's planning-only constraint, or widen it

- _Additional routed evidence:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: wu-lifecycle-state-model`

- _Observation:_ setting `Current Workflow: verify-work-unit` on an `Active` work unit makes that work unit
  un-enterable. The locus reader refuses with `subject-unresolved: Current Workflow "verify-work-unit" does not
  match non-planning State "Active"`, which surfaces as `locusGuidance.kind: "unavailable"` at session-init and as
  a `refused / locus-unresolved` handoff — the same "cannot init, cannot hand off" shape already recorded for
  `evidence-applicability` and `review-signal-convergence`. Recovery was cheap here only because the meta commit
  was still unpushed and could be amended.

- _Observation:_ nothing states the constraint where someone writing the meta would meet it. The field is set by
  `init-work-unit`, advanced by `arc set-stage`, and cleared by `generate-tasks` and `reopen-work-unit` — all
  planning-stage machinery — but that is a reader's inference across four workflow files, not a stated rule. The
  live meta carries no comment on the field, no meta template documents it, and `session-handoff.md`'s own
  § Work Unit Metadata block omits the field entirely while listing every neighbouring one.

- _Approach:_ decide what the field is, then make the artifact say it. If it stays a planning-stage pointer, say
  so at the field and reject the write at authorship rather than at the next probe. If an execution work unit
  should be able to name the lifecycle workflow it sits inside — `verify-work-unit` between task close and
  attestation is the motivating case, where `Next Action` is currently the only carrier — that is a widening, and
  it belongs to whatever settles the field's meaning.

- _Observation:_ the severity is in the asymmetry, not the refusal. The guard is right to catch an inconsistent
  record; what is disproportionate is that a one-field edit costs the work unit both its entry and its handoff
  path, with no authoring-time signal that the field was not the author's to set.

- _Captured during:_ `delivery-post-landing-conflict-recovery` Task 8.1 handoff, 2026-09-18.

### `[ ]` **Formalize the shipped, pending-teardown worktree terminal condition**

- _Re-cut:_ returned from `singleton-integration-continuity` at the `state-storage` re-cut (2026-09-28): the state
  vocabulary this work unit owns, beside the rename-move marker entry.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured during
  `finalize-parallelism` Task 4.1 slate resolution.
- _Concern:_ `worktree-teardown-decoupling` deliberately represents a self-teardown husk through existing
  signals—detached HEAD, ARC ownership marker, and a completed-record match—without adding a lifecycle state.
  Decide whether that terminal condition graduates into the four-state vocabulary, becomes an annotation, or
  remains a derived operational projection.
- _Boundary:_ consume the shipped mechanics and the `session-locus-model` reporting record; do not rebuild them.
  This WU owns the state vocabulary and may re-vocabulary the locus record later without schema churn.

### `[ ]` **The readiness reform has a tail-end twin: verification-passed wants a `Candidate` projection**

- _Re-cut:_ returned from `singleton-integration-continuity` at the `state-storage` re-cut (2026-09-28): the tail-end
  peer of the core reform's readiness projection, so the two land as one primitive.
- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Forward amendment (2026-08-19):_ The transition descriptions below are historical input, not the current
  boundary contract. `arc attest` runs after verification and establishes the private Candidate/prepublication
  locus; `arc publish` ends private preparation and starts public integration before the first push and change
  request. Keep Candidate on the attested artifact/projection axis when integrating this item.

- _Observation:_ the core reform names planning-completion as an attested artifact-axis signal that `State`
  flattens into the scheduling axis, with the missing primitive being its projection to an observable field
  (`Ready`). The identical shape exists at the other end of the lifecycle and is not captured. Verification
  completes entirely under `**State:** Active` — the task list's verification phase runs Tier 3 gates, success
  criteria, and the adversarial pass before any lifecycle transition — and its terminal event, `arc finalize
  verify`, records itself **only as a string prefix in the meta's free-text `Next Action`**, which the session-init
  probe then pattern-matches to set `sessionType: integration`. That is the same defect the reform already
  states for readiness, in the same field, one lifecycle stage later.

- _Observation (what the signal is worth):_ past verification means the implementation holds up against its
  design, which is materially stronger and different in kind from "the code may still have defects" — the
  integration-level concern. Nothing in `State` distinguishes them, so an outside observer, the roadmap, and an
  agent deciding what a work unit needs next all read the weaker signal.

- _Observation (the flattening this exposes):_ ARC distinguishes review **lanes** — frontline and local versus
  hosted and PR — but has no lifecycle distinction between "no eyes on this but ours" and "visible to the team or
  the public." The lanes carry the audience difference; the state model does not. A `Candidate` state is where
  that distinction would live: work whose implementation is attested but which has not yet gone public.

- _Approach:_ treat `Candidate` as the tail-end peer of `Ready` on the same attested artifact axis, so the reform
  lands one projection primitive with two instances rather than solving readiness and then rediscovering the shape.
  The two transitions the vocabulary then supports are **attest** (implementation clears, enter verification and
  local review — private) and **publish** (verification and local review clear, open the pull request — public).

- _Related — a live inconsistency the tail state would resolve:_ `integrate-work-unit` Step 1 states that
  "the `Integrating` state covers PR open through review-response," but fires the transition at Step 1 while the
  pull request opens at Step 3, with the local self-review preflight in between. So a work unit is `Integrating`
  through a window where nothing is public. The lifecycle command is now `arc publish`; its owning boundary work
  moves that fire point to the publication-step head while deliberately minting **no** state and not re-keying
  `Integrating`, per the `project-state-integrity` axis contract recorded in this WU's buffer. That
  change shrinks `Integrating` to the public phase, which is the carve-out a `Candidate` state would make anyway,
  so the two compose rather than collide.

- _Captured during:_ `review-protocol-alignment` grooming, 2026-07-26 — surfaced while settling the scheduling
  verb now named `arc publish`, distinct from the `arc integrate` procedure namespace.
