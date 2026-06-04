# Draft: Agile WU Lifecycle

**Purpose:** Introduce a three-tier work-unit model (atomic / quick / standard) with structurally
differentiated artifact requirements and invariant execution discipline. Make small bounded work
fast to spin up and ship, while preserving ARC's spec-directed, review-disciplined character. Closes
the agility gap where ARC's uniform ceremony costs more than the work for short-lived WUs.

- **State:** Draft — pre-PRD exploration captured during agile/mobility design discussion 2026-04-28.
  Three-tier model and constitutional reframing identified; external research and PRD-time
  ratification expected. Updated 2026-05-08: sweep-as-you-go foundation (formerly scope item 7a's
  load-bearing pieces) moved to upstream Work Organization Reform WU; this WU retains
  tier-aware adaptations on top. Updated 2026-05-19 with WOR-induced terminology shifts (see
  § WOR alignment note below).

- **Created:** 2026-04-28 (terminology refresh 2026-05-19)

## Cohort reassignment & design-refresh flag (2026-06-02)

> **This draft is stale and pre-PRD; its body has not absorbed ADR-020, ADR-021, or the
> errand-model re-pivot (`work-routing-discipline`). Read the body as the original 2026-04-28
> conception, not current direction.** The items below are flagged open, not resolved here — they
> are the agenda for this WU's eventual planning pass.

**Reassigned cohort: agile-parallelism → principle-anchored-core (priority P1 → P2).** Rationale:
the "agile" motivation (small bounded work spun up fast) was substantially delivered by the Errand
class (`errand-enablement` + `work-routing-discipline`, both shipped). What remains of this WU after
the errand-absorbed parts is **spec-shape scaling + scalable `create-spec`/`generate-tasks` + tier
reconciliation** — which is the scalable-core thesis ("scale grammar, never scale discipline" per
ADR-020), not parallelism. This WU is the *execution arm* of principle-anchored-core's steer, mislabeled
into agile-parallelism by its origin story. It does **not** block `concurrent-work-conventions`
(that dependency was soft — CWC consumes only WOR's `Integrating` state, already shipped, plus
reversible shared-file coordination on `integrate-work-unit.md`); the CWC→AWL edge has been dropped.

**Pulled forward & dependency formalized (2026-06-03).** The P1 → P2 demotion above is **reversed** — AWL
is re-bumped to **P1** and sequenced next-up to unblock `concurrent-work-conventions`. The "does not block
CWC / edge dropped" claim is narrowed: the *runtime* edge stays dropped (CWC's merge-safety mechanism needs
none of AWL's tier model), but the *delivery / build-order* edge is now a **formal hard dependency** — CWC
carries `Depends On: agile-wu-lifecycle`, because its four-WU decomposed delivery cannot be built until AWL
ships the scalable spec/task pipeline + the decomposition procedure (item 6). Cohort is **unchanged**
(principle-anchored-core — AWL sits with its thesis siblings scalable-core / composable-workflows /
workflow-template-loads); pulling-forward is a priority/sequencing move, not a cohort move. CWC was parked to
`backlog/planned/agile-parallelism/` so its settled draft is available on `main` as AWL's worked
requirements input.

**Scope extraction — `arc start` create-new wiring left this WU (2026-06-03).** The worktree-spawning
*create-new* half of scope item 4's `arc start` command is extracted to the parallelism-mechanism cluster
(`draft-concurrent-work-conventions.md` Inbound Buffer): it is thin plumbing over Worktree Foundation's shipped
`spawnWorktree` primitive — **mechanism**, not grammar — and belongs with the cohort that owns parallelism, not
with this WU's spec/task-scaling thesis. AWL retains only the **tier layer**: the `--tier` flag and
tier-conditional activation behavior layered onto whatever create-new command that cluster delivers. This keeps
AWL strictly WU-scalability — nothing parallelism-required. Item 4 below is the stale original conception; read
it through this narrowing.

**Open design agenda for the planning pass** (each needs real design thought + external research; none
decided here):

1. **Atomic-tier retirement.** Strong case that "atomic" should no longer be a WU *tier* at all — the
   Errand class is where atomic-character work executes (inbox captures atomics, drained inline or as an
   errand; errands are a `full`-protection construct, a base commit under `partial`). The tier set likely
   collapses to `{quick, standard}`, with "atomic" reverting to a pure work-character adjective. ADR-021
   already shifted the *default realization* of atomic-character work from "atomic-tier WU" to Errand and
   handed the *name's fate* to this WU (`cohort-agile-parallelism.md`). Tiers may still earn their keep for
   categorization / routing — open.
2. **Spec-shape scaling, not tier-coupled alternates.** ADR-020 ratifies one spec filename
   (`spec-{name}.md`) scaling via a **template family** (full PRD → lighter design-brief → minimal
   paragraph), and explicitly kills the quick-tier "spec via task-list `## Scope` header" still shown in
   this draft's § Three-Tier Model table. Decoupled from tier by default, conventionally correlated.
3. **Task-list scaling = one grammar, fewer phases.** Reconsider the draft's "flat task list (no phases)"
   as a distinct shape. The scalable-core-coherent answer is the *same* task-list grammar with fewer
   phases (down to one substantive phase) + verification always present (gate-check or phase) — keeping CLI
   parsability and verification consistent. "Entirely flat" is an alternate, not a scaling. The real weight
   to scale is `generate-tasks` (a 3-pass procedure today), not the task-list artifact.
4. **AWL ↔ arc-plan-conductor seam (resolve the circular deference).** Today both drafts defer spec-form
   work to each other. Proposed split: **AWL owns the grammar that scales** (the spec template family + the
   scalable `create-spec` / `generate-tasks` workflows); **conductor owns facilitation** (the pre-spec
   elicitation verb, depth selection, invoking the shape AWL defines). This pulls the headline
   "scalable work units" value into AWL and shrinks conductor — de-risking it (conductor is P2, blocked on
   `loadset-composition`; AWL depends only on shipped `worktree-foundation`). A conductor-side note records
   the same split.
5. **Likely new dependency: `composable-workflows`.** In its new cohort, AWL's scalable workflows would be
   built on composable-workflows' resolve-then-load mechanism — set this dependency at planning (left off
   the meta for now rather than asserting it here). Note: composable-workflows is not hard-blocked (its only
   `Depends On`, `work-organization-reform`, has shipped) — design AWL's scalable pipeline *forward-compat*
   with resolve-then-load without blocking on it (it remains a bare stub entangled with the
   agent-context-optimization cohort).

6. **Actionable decomposition procedure is AWL's — with CWC as the live requirements input (2026-06-03).**
   Concurrent Work Conventions parked at terminal planning precisely because it decomposes into a **four-WU
   stack** that today's `1_create-spec` / `2_generate-tasks` can't size down to (the unconditional 3-pass,
   3–7-phase pipeline). Its settled draft + concrete D1–D4 decomposition
   (`draft-concurrent-work-conventions.md` § Delivery plan & parked status) is a **worked requirements
   example** for both the spec-template-family + fewer-phases grammar **and** an **actionable decomposition
   procedure** (sizing triggers, boundary-finding, stack-vs-cohort) this WU owns — `arc-plan-conductor` only
   *routes to / invokes* it, never owns it (it is also far downstream, so the procedure cannot live there).
   This is a **delivery-ergonomics edge**: CWC re-enters as the stack once AWL's scaling / decomposition
   support lands. Treat CWC's parked draft as a primary design input at this WU's planning pass.

   **Folded-in requirements** (from a `USER-INBOX` capture, 2026-06-03 — re-routed here from
   `arc-plan-conductor`: the actionable procedure is AWL's deliverable; the conductor only routes to /
   invokes it). The concrete protocol shape this WU owns:
    - **Decouple planning-grouping from delivery-grouping.** One concern plans as a single coherent
      draft/spec but *delivers* as a stack of PR-sized WUs along natural deliverable/phase boundaries — no
      forced choice between "one concern" and "small PRs."
    - **Sizing heuristics (sense oversize ahead).** Count distinct deliverables / independently-reviewable
      surfaces; estimate LOC + file count; test "reviewable in one sitting." Review effectiveness craters
      past ~200–400 changed LOC (Google / SmartBear studies); >~few-hundred LOC / >~8–10 files / multiple
      independent review surfaces → stack-or-cohort, not one WU.
    - **Stack vs. cohort.** Sequentially-dependent → stack (ordered PRs); independent-ish → cohort (parallel
      WUs). ARC already has the levels — **cohort ≈ epic**, **WU ≈ story / one reviewable PR**; the gap is the
      codified concern→WU-count mapping.
    - **When to split.** At PRD / decomposition time, not mid-execution (a mid-execution split is a costly
      escape hatch).
    - **Live example.** CWC itself — folded to "one WU finishes the cohort," but by these norms ~4–5
      deliverables → plan-as-one, deliver-as-a-stack (its D1–D4). Reason against this case to validate the
      protocol.
    - **Sizing-norm co-home.** The sizing standard itself likely co-homes in `strategy-work-organization`
      (a WU-sizing standard AWL's procedure consumes).

7. **Artifact relocatability invariant (2026-06-03).** WU artifacts (`meta-*`, `draft-*`, `spec-*`,
   `tasks-*`, companions) relocate between lifecycle states (`active/` ↔ `backlog/` ↔ `completed/`) as a
   function of State — a graduate / park / archive move must be a pure `git mv` with **no content edit**.
   That holds only if artifacts carry **position-independent refs** (filename-only, per DEV-RULES.ARC
   § `.arc/` artifact references); relative-path links break on move. AWL owns the *invariant* (a lifecycle
   property of the moves its workflows perform); the *rule* generalization (close the source-side gap — the
   rule today permits relative paths to stable docs, which still break when the source itself moves) routes
   to DEV-RULES.ARC, and *enforcement* (forbidden-pattern hook extended to source-side link-defs + a sweep
   of the ~38 path-style link-defs currently in active/backlog movable artifacts) routes to
   `quality-gate-hooks`. Surfaced live 2026-06-03 — both the CWC park and this graduation hit relative-link
   breakage on move, fixed by converting both drafts to filename-only.

8. **Cohort-consistency invariant (2026-06-03).** A WU's `**Cohort:**` field must match its
   `backlog/planned/<cohort>/` parent directory; a cohort doc's member-list must match its actual members;
   and every cohort dir should carry a `cohort-{name}.md` (`principle-anchored-core` currently has none —
   only `cohort-agile-parallelism.md` exists). Field-vs-directory drift is a silent failure (a WU assigned to
   one cohort but filed under another). AWL owns the *invariant* (cohort semantics — what a cohort is, its
   boundaries, membership — is this WU's charter); *enforcement* (a backlog-scoped structural guard;
   `active/` is flat and `completed/` ordinal, so neither applies) routes to `quality-gate-hooks`, same
   family as its existing forbidden-pattern / layout-drift checks.

## Floor model — planning-pass resolution (2026-06-03)

> Resolves agenda items 1–3 above and informs 4; supersedes the body's § Three-Tier Model wherever they
> conflict. Everything from § Problem / Motivation onward is the 2026-04-28 conception — read this section as
> current direction. Derived during the 2026-06-03 `arc-plan` pass from P1/P2/P4/P7 (ADR-001), ADR-020, and
> ADR-021; the reasoning, not just the conclusions, is recorded so the constitutional pass can rebuild it.

### Two floors, not one

The word "floor" names two different things, and conflating them is what makes the question feel fuzzy:

- **Discipline floor (P2/P4) — universal, sits *below* the wrapper, never scales.** Every increment of change —
  a WU task, an Errand commit, a loose off-WU commit — closes with a review-increment gate and passes its
  quality gates. The floor of *discipline* is the smallest **commit**, not the smallest WU. This is ARC's
  identity; it does not move.
- **Wrapper floor — the smallest thing that is a WU at all.** This is the question with real design content
  (below).

### The wrapper exists for spec-worthiness; tracking is downstream

Over a bare disciplined commit, a WU adds exactly two things: an **authored spec** (P1) and a **tracked
lifecycle** (P7). The defining trait is **spec-worthiness** — work that is *more than a single logical concern*
(more than one review increment), even if multi-step / multi-file. Tracking is a *consequence* of that, never
an independent cause: graduation (an Errand that reveals unforeseen complexity mid-impl → WU) trips on
discovered *complexity*; tracking comes along for the ride. There is no "needs tracking but the work doesn't
warrant it" case — it does not occur. Anchors: P1's own test ("Does this need up-front planning? Quick fixes
with clear scope can rely on well-crafted git commits") and ADR-021 threshold #1.

### The scaling axis: authoring-labor-to-settle (design is always settled)

**Invariant (P1; DEV-RULES.ARC § Design before implementation):** all settle-able design is settled *before*
implementation — best reasonable effort, never a conscious deferral. What varies across tiers is **not whether
design is settled** but **how much design must be *authored* — versus read off existing inputs — to reach the
settled state**:

- **Errand** — zero authoring. The intent *is* the design. ("Intent *to* design" disqualifies it.)
- **Lower tier** — design is determinate from existing inputs (issue / pattern / clear intent); the spec
  *records* the settled design lightly, it does not *derive* it.
- **Top tier** — settling *requires authoring* a real design (a PRD's worth): many concerns, alternatives, and
  tradeoffs that do not exist until someone works them out.

> **Candidate constitutional sharpening (flagged, not decided):** today's spec-directed rule handles *emergent*
> design questions ("route them back to the spec"). Add the stronger *front-loading* duty — settle all
> settle-able design up front; never consciously defer it to impl. AWL touches DEV-RULES.ARC anyway.

### Topology: fixed floor → scalable middle → fixed ceiling (derived, not chosen)

Preference operates in the band between the complexity-set floor and a fixed ceiling (max ceremony ARC
offers). **Band width shrinks as authoring-labor rises**, because the floor climbs toward the fixed ceiling:

- Errand: floor = ceiling = one disciplined commit. Band width **zero**.
- Low authoring-labor (determinate design): floor low, ceiling high. Band **wide** — preference has real room.
- High authoring-labor (PRD-worth): floor already near the ceiling (a paragraph can't hold a large design
  space; many concerns force phasing; real intent-verification is required). Band **≈ zero**.

So **both endpoints are fixed for the same reason — degenerate bands — and only the middle scales.** This falls
out of the two-axis model; it is not symmetry-for-its-own-sake. Topology: **Errand (fixed floor) → scalable
tier (wide band, catch-everything) → standard (fixed ceiling).** The middle↔top boundary is the **design-doc
line** (does settling *require authoring* a design?); the two do **not** overlap — the top tier's floor sits
strictly above the lower tier's ceiling.

**Atomic retires as a *tier* (resolves agenda item 1).** Atomic-character work executes as an **Errand** below
the wrapper, or graduates; ADR-020 §3's spec-in-commit "floor exception" migrates *out of the tier model into
the Errand class*, which reconciles the ADR-020 ↔ ADR-021 tension. "Atomic" reverts to a pure character
adjective. Tier set collapses to **{lower, standard}** (names are placeholders — see § Open below).

### Ceremony stack: three lower-bound layers; the tier label tracks only complexity

1. **Complexity → forced floor** (per-WU, objective, enforced via drift-promotion). *The work demands ≥ this.*
2. **Project preference → team floor** (set at init, trivially changeable, no reinstall). The consistency
   knob; likely a project-config setting per ADR-020 §8's guided-init walkthrough.
3. **User preference → personal investment *above* the team floor** (working style); never below it.

Actual ceremony = the user's pick within `[max(complexity_floor, project_floor), ceiling]`. The **tier label
tracks layer 1 only** (work-demand) — neither preference layer inflates classification. A determinate WU
specced heavily by preference is still **lower-tier**, correctly: the *work* was light; the author simply
likes rigor. This keeps the class objective and useful for parallelism planning ("how much genuinely-heavy
work is in flight").

**Rigor available ≡ across the lower tier's top and the standard tier** — same machinery, full strength. Only
rigor *mandated* differs: standard ceremony is **forced** (the work's authoring-labor demands it, band
collapsed); lower-tier-max ceremony is **chosen** (insurance, not necessary design labor). That is the
"appropriately rigorous, not forced" property — the lower tier's high end is real rigor, never a diet
imitation.

### Invariant vs. convention (this is the "always feels like ARC")

The floor is **identical at every matrix position** — that invariance *is* the ARC feel; the matrix only moves
the convention layer on top.

- **Floor (principle-forced):** a spec in some form (P1); a task list when multi-increment (P2 + P7);
  intent-verification of completed work against the spec (P1's intent-vs-outcome loop); the discipline floor
  (P2/P4). Always present, every tier above Errand.
- **Convention (opinionated, scalable, configurable):** spec *template weight*; phase count beyond one;
  pre-execution task-list audit (`arc-task-audit` is a strong default, **not** a floor — front-loading audit
  is a method under P1, not an invariant); iteration passes.
- **Task list scales by phase *count*, not *shape* (resolves agenda item 3):** one parsed grammar from 1..N
  phases (minimum one substantive phase + always-present verification — gate-check at the low end, dedicated
  phase at standard). A "flat" shape is a *second grammar* = a parser fork = an internal-dev maintenance trap;
  rejected. **Spec scales by template family (resolves agenda item 2):** three variants, heaviest = the current
  PRD; exact shapes informed by external research.

### User-above preference: config knob vs. in-process steer (OPEN)

Deferred until the mechanical design is known (how tier/preference affects each workflow, skill, hook, CLI
surface). **Decision criterion:** a config knob is warranted *iff* "ceremony preference" resolves to a single
coherent ordinal workflows can consume; if it is a scattered bag of per-surface toggles, one knob is a leaky
abstraction and steer-per-process is better until consolidated.

**Forward-compat (binds now, even while deferring):**

- Design the scaling mechanism to consume a **resolved** preference value independent of its source
  (resolve-then-load, ADR-020 §9): the probe resolves active ceremony preference; workflows load the matching
  fragment. This makes knob-vs-steer a **late-binding input decision, not an architectural fork** — decidable
  after the implications are known, without reshaping any workflow.
- If it becomes a knob, its home is the `configuration` cohort's per-developer substrate
  (`draft-config-storage-architecture.md` — `.arc/user/{identity}/config.user.yml`, user-notes-synced), not a
  bespoke surface. Soft coordination, not a hard dependency.

### Open / deferred from this pass

- **Tier names — resolved.** Settled as `Complexity Tier` with values `light` / `full`; see § Naming —
  research-pass resolution below. (The "encode the design-doc line" criterion was corrected there: that
  threshold is the Errand ↔ WU line, not the within-WU tier split — both tiers carry a spec.)
- **Decomposition / WU-sizing / cohorts** (agenda item 6 + CWC requirements input). Resolved this session —
  see § Decomposition model below. Orthogonal-ish to the floor model — ceremony weight ≠ WU scope
  (full-ceremony WUs can be <2-day end-to-end) — but adjacent: it is where the "WUs trend too long" tendency is
  actually corrected, distinct from ceremony-fit.

## Decomposition model — planning-pass resolution (2026-06-03)

> Resolves agenda item 6 (the actionable decomposition procedure AWL owns); leans on items 7 (relocatability)
> and 8 (cohort-consistency). Derived during the 2026-06-03 `arc-plan` pass plus a focused external-research
> pass (stacked-diffs / RFC-impl / epic-story / review-sizing). CWC's parked four-WU decomposition is the
> worked requirements example **and** the procedure's acceptance test. The procedure is AWL's chartered
> deliverable; `arc-plan-conductor` only routes to / invokes it.

### The WU upper boundary (mirror of ADR-021)

ADR-021's threshold answers "is this big enough to warrant a WU?" (Errand vs. WU — the *lower* bound).
Decomposition answers "is this too big to be **one** WU?" (WU vs. cohort — the *upper* bound). Same test,
other end; the symmetry is the spine of the procedure.

### Model B only — decompose into a cohort of self-contained WUs; Model A retired

When a concern exceeds one WU it becomes a **cohort of self-contained, single-owner WUs** (each its own
`meta-* + spec-* + tasks-*`, one branch, one PR) — **not** one WU sliced into stacked PRs (Model A). Three
grounds, weakest to strongest:

1. **One-branch-per-WU (ADR-019) makes Model A inexpressible.** "One WU across many branches" has no ARC
   form; it can only collapse into a stack of *WUs* — which is just Model B's delivery mode.
2. **ARC's review grain is already sub-PR** (per-task review increment, P2) — so Model A's "split PRs to get
   small reviewable units" benefit is largely served at a finer grain already. (This does **not** replace
   PR-level review — different eyes, different altitude; it just means A buys ARC less than it buys PR-grain
   shops.)
3. **Decisive — Model A forces shared mutable planning artifacts across branches.** One spec + one task list
   edited from N worktrees is exactly the cross-branch shared-mutable state that worktree isolation and the
   relocatability invariant (item 7) exist to prevent: it either gravitates up to the cohort/backlog tier
   (detaching the design from any single task list — the spec stops being the live co-located upstream) or
   stays on one branch referenced cross-branch (clunky, conflict-prone, a relocatability breach). **Model B
   keeps each WU's meta+spec+tasks a self-contained, co-located, relocatable bundle** — the agent-native
   in-repo model working *because* the unit is self-contained. The external pass reached this independently:
   co-location / shared-mutable-artifact was "the strongest evidence for Model B" (Google's
   one-RFC-to-many-PRs "works at enterprise scale only because they accept spec drift").

"Stacked PRs" survives in ARC **only** as Model B's *dependency-ordered delivery mode* — a stack of WUs, each
its own branch, merged in order (idiomatic at WU-grain; cf. Graphite at commit-grain). The merge/rebase
*discipline* for executing such a stack is CWC's (`draft-concurrent-work-conventions.md`); AWL owns the
*decision* to decompose, CWC owns delivering the stack safely — they compose.

### The discriminator — orthogonality, not size

Decompose on **design / subsystem orthogonality + independent deliverability / ownership** — *not* raw size.
Size is a secondary symptom, and only when it spans *unrelated* subsystems (review-sizing research: defect
detection craters past ~200–400 LOC per review increment; ~800–1000 LOC across *orthogonal* systems is a
decompose signal). Tightly-coupled work designed as a whole stays **one WU even when large** — the per-task
review grain carries quality — and splits later only if it destabilizes. Concern multiplicity is the trigger;
LOC is a heads-up.

### Two guard rails

- **Lower rail — don't split below WU-warrant.** Decompose only until each piece independently warrants a WU
  (ADR-021 threshold). A piece too small is a **phase of a sibling** or an **Errand**, never a peer WU.
  ("Making a 3-task piece its own WU feels silly" is this rail firing.)
- **Upper rail — don't split coupled one-design work for size alone.** Over-decomposition is a real failure
  mode (the microservices premature-split trap: chatty coordination, onboarding cost). A personal
  under-decomposition bias will feel the lower rail most; the framework needs both for general correctness.

### Timing — gated on design maturity

Decompose when the design is **stable enough that the cuts are real**, not before. Speculative design → hold
as one unit and iterate; settled design → decompose. Mechanically: a **provisional cut at draft-settle** (name
the pieces) **confirmed / re-cut at spec/task time** (size them — merge a piece that came out too small, split
one too big). Iterative, not a single blind upfront gate. CWC parked at *terminal planning* (= design settled)
is the proof case: that maturity is exactly what makes it decomposable now.

### Cohorts stay flat — no nesting

Decomposition **expands or creates a flat cohort of peer WUs**; structure rides **dependency edges**, never a
cohort tree. CWC → D1–D4 become peers of WF / EE / IFA within agile-parallelism, not a sub-cohort under "CWC."
If a piece itself later splits, its parts are more flat peers. (Avoids the reason-about-it-quickly trap.)
Cohort semantics here reconcile with item 8's cohort-consistency invariant and the `cohort-{name}.md`
convention (whose codification is shared with CWC + file-classification — ownership map to settle at spec).

### Plan-grouping ≠ delivery-grouping

One concern **plans** as one draft (a single design exploration); at decomposition it becomes **N
self-contained WU specs + cross-WU coordination** in `cohort-{name}.md`. The cohort doc carries coordination
only — never design that drives a task list (specs feed task lists and validate completion; they are not
coordination docs).

### Deliberate divergence from Shape Up

Adopt Shape Up's *self-contained vertical-slice unit* shape; **reject its design-co-evolves-during-build
timing.** ARC stays spec-directed (P1) — but as a best-effort *goal*, not an absolute: settle everything
*settle-able* up front and never *consciously* defer it, while accepting that genuine unforeseeable unknowns
surface during impl (no plan survives first contact) and are handled by routing them back to the spec. The
divergence is *deliberate under-specification as a design method* (Shape Up) vs. *best-effort settle +
disciplined emergence-handling* (ARC) — not "100% upfront vs. co-evolve."

### Acceptance test

The procedure must cleanly **re-derive CWC's D1–D4 from CWC's one settled draft.** CWC is both the worked
requirements example and the first customer (parked pending this support). If the orthogonality discriminator
and the two rails produce that decomposition, the procedure works; if it strains, the rule is wrong.

### Open / deferred

- **Pipeline fire-point** for the procedure — a new decomposition workflow vs. a phase inside `create-spec`.
- **Sizing-norm co-home** — the WU-sizing standard co-homes in `strategy-work-organization` (consumed by the
  procedure), not authored here.
- **Cohort-as-first-class** — the free-form `**Cohort:**` field (exists) vs. a structural cohort entity with
  member lists; the structural form earns its keep only *if* cohorts gain shared lifecycle events (one PR for
  the wave, coordinated rollout) — they don't today, so graph-derived grouping + the field suffice until they
  do.
- **Reconciliation debt.** `strategy-work-organization` § Task Lists and Branches (stacked-PRs / phased /
  team-sub-branch — pre-ADR-019 leftovers that contradict one-branch-per-WU) needs rewriting to the B-only
  model; § Work Character / § Spec-Flow Invariants § Scaling axes / § Escape-hatch still name the retired
  atomic tier. Compounds with the floor model's tier reconciliation — one DEV-RULES / strategy sweep at
  activation.

## AWL ↔ conductor seam — planning-pass resolution (2026-06-03)

> Resolves agenda item 4 (the circular deference) and the *conceptual* half of item 5; informs the floor
> model's deferred knob-vs-steer question and the upcoming naming pass. Derived during the 2026-06-03
> `arc-plan` pass from the floor model above, the conductor draft's scope-boundary flag
> (`draft-arc-plan-conductor.md`), and `draft-composable-workflows.md`. Mechanism and naming are explicitly
> deferred — see § Deferred below.

### One ceremony axis: tier is the floor, level is the choice

There is **one ceremony axis** (artifact / process weight), and two markers on it — not two orthogonal axes.
The "circular deference" persisted because both drafts called their concern "spec-form work"; the fix is to
name the axis and the two markers:

- **Tier — the floor marker.** Where the complexity floor sits on the axis. A property of the *work*
  (objective authoring-labor / complexity, the floor model's layer 1). Set at entry; a **one-way ratchet** —
  it rises when a stage reveals complexity, never demotes (demotion would discard work).
- **Level — the chosen marker.** Where the user *chooses* to sit within `[floor, ceiling]` (the floor model's
  layer-3 user-above choice). Not a property of the work; a per-stage selection.

These are floor-marker vs chosen-marker on the **same** scale (this supersedes the earlier "different layers /
orthogonal axes" framing from this same pass — same axis, with layer 1 contributing the floor and layer 3 the
chosen position above it). The per-stage choice is a **shared ordinal** (`sketch` / `outline` /
`detailed` — see § Naming) realized in each stage's own units (planning facilitation, spec-template weight,
task-list phase count), **not** a single global enum; and the count of *available* positions is
**tier-relative** — wide under `light`, collapsed toward forced under `full` (the floor model's band-width
topology). The complexity tier and the formulation-depth ordinal use **distinct** vocabularies, so they never
collide. The conductor's "depth" is just the planning-stage instance of this ordinal. (Names settled in
§ Naming below.)

### Lane-switchable per-stage authoring

The user's pick within the band is made **per-stage, not once at entry, and is re-selectable at each stage
transition**. Entry sets a *default cascade* (derived from tier); each of the three pre-implementation
**authoring** stages — pre-spec planning, spec creation, task generation — re-resolves its level within the
band. Two guardrails keep this safe rather than chaotic:

1. **Down-switching is bounded by the tier floor.** You may choose lighter going *into* a stage, never below
   the forced complexity floor — the floor protects genuine design work.
2. **No-demotion, correctly scoped** (replaces the body's blanket "promotion is one-way / no demotion", which
   was too coarse). You are free to choose *how much to produce* going into a not-yet-started stage; you may
   **not tear down** a heavier artifact already produced. Demotion-of-produced-artifacts discards work;
   lighter-choice-going-in does not. The tier ratchet is one-way; the per-stage level floats within the band.

This is **self-diagnosing**: up-switching a *downstream* stage past the tier default (e.g. a minimal spec but
a heavy phased task list) *is* the tier-promotion signal — the incoherent combo is the floor telling you it was
set too low. Lane-switch-up-downstream and tier-promotion are one event seen from two angles.

Integration is **not a lane.** Unlike the three pre-impl authoring stages, integration ceremony is not a
user-selectable per-stage level — it consumes what was produced rather than choosing how much to produce. It
stays consistent, lightweight-by-default, and configurable independently of the level axis. **Open (flagged,
not decided):** whether integration ceremony nonetheless derives *some* weight from the realized tier — the
body's scope items 7 / 7a tier-aware sweep (atomic trivial / quick standard / standard full) — needs a proper
evaluation before those items are dismissed wholesale. Part of 7 / 7a plainly falls out (integration is not a
lane); whether tier-sensitivity of the sweep / archive survives is a separate question. Evaluate at the
reconciliation pass; non-blocking.

### Ownership: AWL defines, the conductor elicits

- **AWL owns the engine and the definitions.** The axis itself; the tier classification + floor enforcement +
  promotion ratchet; the per-stage levels and their grammar (the spec template family, the task-list phase
  grammar, the planning-stage level set); the lane-switch triggers / connections; and the tier→default-cascade
  mapping. This is a structure / workflow / template concern — AWL's charter. Everything here is built and
  workable from AWL, conductor or not.
- **The conductor owns ergonomics only, downstream.** It elicits, guides, and *assesses fit for* a lane —
  recommends, and may flag a misfit ("this reads heavier than the lane you picked") — but **never dictates,
  never defines the lanes, never owns their triggers / connections / codification.** It applies AWL's codified
  tier→cascade mapping at the planning entry; it is the planning-stage facilitation instance, not a cross-stage
  driver.

This narrows the conductor and de-risks it, pulling the headline scalable-WU value into AWL — the resolution
the conductor draft's scope-boundary flag anticipated, now made precise.

### Deferred from this pass

- **Mechanism → coupled with item 5 (`draft-composable-workflows.md`).** Per-stage level re-resolution *is*
  resolve-then-load applied per stage (composable's draft already calls the conductor's depth-selection "the
  tier-axis instance of resolve-then-load"; lane-switching generalizes that to every pre-impl stage). So item
  4's mechanism tail lives with item 5: the through-line-vs-self-resolution call (**lean: per-stage
  self-resolution; the conductor is entry + optional re-engagement, not a mandatory cross-stage driver — a
  mandatory driver would re-bloat the conductor**) and the `arc start`-vs-conductor verb fate are settled in
  that coupled, code-grounded pass.
- **Naming → resolved.** Settled in § Naming — research-pass resolution below: `Complexity Tier` =
  `light` / `full`; `formulation depth` = `sketch` / `outline` / `detailed`. The "why 3?" bucket-count worry
  dissolves there (three is the *light* tier's band resolution, not a universal count).
- **Write-back debt (`draft-arc-plan-conductor.md`).** Its § 4 still says quick-tier generates a `## Scope`
  task-list-header section — stale against the floor model (spec is always a separate doc, lightest template
  variant). Rewrite to "invoke AWL's `sketch`-depth spec template", and retire the conductor's `depth` modes
  (`minimum` / `standard` / `expanded`) into the planning-stage instance of `formulation depth`
  (`sketch` / `outline` / `detailed`).

## Naming — research-pass resolution (2026-06-03)

> Resolves the tier-name question (floor model § Open) and the seam's deferred naming. Settled during the
> 2026-06-03 `arc-plan` pass after a focused external-vocabulary research pass (RFC lightweight/standard idiom,
> Shape Up appetite, incident-severity tiers, t-shirt / magnitude legibility). Research informed the names; the
> calls are the project's. **Supersedes** the placeholder `lower` / `standard` and `quick` / `standard` and
> `minimum` / `standard` / `expanded` usages elsewhere in this draft — reconcile the body at activation.

### The slate

| Slot | Name | Recorded? |
| ---- | ---- | --------- |
| Complexity axis (the floor / work-property) | **`Complexity Tier`** (meta field) | Yes — render deferred (lean off) |
| Complexity-tier values | **`light`** / **`full`** | Yes |
| Per-stage ceremony choice (the band position) | **`formulation depth`** | No — transient, per-stage, lane-switchable |
| Formulation-depth ordinal | **`sketch`** / **`outline`** / **`detailed`** | No |

### Rationale

- **`Complexity Tier`, not bare `tier`.** The axis is named for its **basis** — complexity / design-authoring
  depth — which reinforces the floor model's discipline that the tier tracks *work-demand only*, never
  preference. Naming the basis (`complexity`) while keeping the `tier` abstraction also lets the values carry
  *ceremony weight* (`light` / `full`) without the basis-vs-value grammar clash that a bare `Complexity: full`
  would invite. Taken **regardless of the partial collision** with the quality-gate `Tier 1/2/3` vocabulary —
  whose own rename (`draft-quality-gate-hooks.md`, current lean drops the tier numbers) likely clears it
  anyway, and which is non-catastrophic either way.
- **`light` / `full`, not `quick` / `standard`.** `quick` overweighted *speed* over the authoring-labor
  essence; `standard` implied *default* while naming the *marked / maximal* case. `light` reads as relative
  (vs. `lightweight`, which sounds absolute / "not much" and is over-long against `full`); `full` is the right
  ceiling word (`heavy` carries the same absolute-sounding baggage `full` avoids). This is the **within-WU**
  complexity split — *not* the design-doc-or-not threshold, which is the Errand ↔ WU line (wrapper floor): both
  tiers carry a spec; they differ in design-authoring depth, not in whether a design exists.
- **`formulation depth` is a concept, not a field.** It *defines the lanes* and is re-selectable per stage (can
  differ between planning stages), so it is transient — never a recorded meta value or render column. The name
  captures process **and** artifact (you *formulate* an approach and produce *a formulation*), and fences the
  **pre-implementation** scope in a way `authoring` does not (code is authored too; nothing is "formulated"
  during execution).
- **`sketch` / `outline` / `detailed`** reads as an ordinal progression at every pre-impl stage (sketch /
  outline / detail a plan, a spec, a task list), is collision-free with the tier vocabulary, and avoids the
  floor-word-vs-magnitude-word register trap (`minimum` / `expanded`). It is a **shared ordinal**, not a global
  enum: each stage realizes it in its own units, and the count of *available* positions is tier-relative — wide
  under `light`, collapsed toward forced under `full` (the floor model's band-width topology). **"Why three?"**
  resolves here: three is the resolution of the *light* tier's wide band, not a universal tier count — no
  industry framework runs a 3-level ceremony scale, which was the tell.

### Record-but-don't-necessarily-render

`Complexity Tier` records on the meta — it is scope item 2's `**Tier:**` field, renamed; it groups with the
classification fields (`Depends On` / `Cohort` / `Priority`), not with provenance (`Origin` / `Design`).
**Rendering is a separate call:** the parallelism-planning rationale points at `user.status` In-Flight if
anywhere, not ROADMAP, and with both tables near max width the lean is **off in renders** until that view's
value is demonstrated. Recording is cheap and stable; render-inclusion stays open.

## WOR alignment note (2026-05-19)

WOR R66-R68's renames are applied throughout this draft: WU artifact prefixes `plan-*` → `draft-*`
and `prd-*` → `spec-*`, and the meta field `Spec` → `Design` (`Task List` retained). Spec form
variation routes through template choice under the unified `spec-*` filename — `template-prd.md`
preserved as the heaviest variant; lighter variants defer to `draft-arc-plan-conductor` WU scope
(`brief` ruled out as a name — collides with `reference/briefs/`). References to completed WUs
(Session-Operational Flow, Work Organization Reform, User Sync UX) keep their as-shipped artifact
names. The shift-state reconciliation is applied inline too — see `cohort-agile-parallelism.md`.

Substantive AWL-specific implications (captured here):

1. **Tier ↔ spec-form coupling is a conductor-WU decision, not AWL's.** This plan's § Three-Tier
   Model table currently couples tier to spec form (atomic: none; quick: task-list `## Scope`;
   standard: full PRD). Per WOR follow-on planning (2026-05-19 session), that coupling is now an
   **open conductor-WU question** — the alternative (user picks form per WU, decoupled from tier)
   is on the table. AWL should defer to conductor's resolution rather than encoding coupling here.
   PRD-time: align with whatever conductor lands.
2. **Quick-tier spec shape — partially superseded.** § Open Questions § "Quick-tier spec shape —
   task-list header vs reduced PRD doc" narrows under WOR's variant model. The remaining question
   is "which template variant does quick default to?" — not "does quick have a spec doc?" The
   default-to-spec-doc-with-form-variant answer is the WOR-aligned shape; the exact form (brief,
   compact-PRD, etc.) decides at conductor PRD time.
3. **Atomic-tier spec — binary at conductor PRD time.** Per WOR follow-on planning: atomic either
   gets a required-and-tiny spec (one-paragraph form) OR no spec at all. Not optional. Resolution
   defers to conductor WU's PRD.
4. **Meta field values** (scope item 3) — the field is `**Design:**` (renamed from `Spec`); values are
   `draft-{name}.md` (Planning), `spec-{name}.md` (Active+). Form variation (PRD vs brief vs etc.)
   lives in template choice + H1, not in filename.

- **Origin:** Surfaced during the agile/mobility expansion discussion when Worktree
  Foundation (mechanism) and Concurrent Work Conventions (conventions) were carved out
  of the original Work-Unit Mobility WU. The agility gap — small bounded work paying full ceremony
  cost — emerged as a third concern alongside concurrency. Solo-dev sequential work patterns shaped
  ARC's current uniform ceremony, which doesn't fit team practice where small WUs are spun up and
  shipped constantly.

## Scalable-core alignment note (ADR-020)

ADR-020 (principle-anchored scalable core) ratifies this plan's tiered-artifacts / invariant-execution
thesis and adds two steers to absorb at PRD:

1. **Spec is always a separate document.** ADR-020's invariant floor kills the quick-tier "spec via
   task-list `## Scope` header" option in the § Three-Tier Model table — quick-tier (and above) carries a
   separate `spec-*` doc that scales by template variant (PRD → brief → paragraph), never a header section.
   This narrows § Open Questions' "quick-tier spec shape" further: the answer is a separate doc, lightest
   variant.
2. **Intent-verification survives at quick tier, scaled.** The table's quick-tier closeout ("tasks
   complete + T2 gates") drops the intent check; ADR-020 keeps it — success criteria exist and are checked
   at quick tier, scaling from one falsifiable criterion up. Verification-as-an-explicit-phase still scales
   (gate-check at quick, phase at standard), but *that* intent-verification happens does not. Atomic
   remains the exemption (commit/PR self-review).

The tier model otherwise stands. Comprehensive reconciliation defers to WU activation.

---

## Problem / Motivation

ARC's WU ceremony is uniform regardless of WU size. A 30-minute fix and a 6-week feature go through
the same activate/integrate/archive pipeline. For small bounded work, that ceremony costs more than
the work itself.

Current "lighter" options fall short:

- **`incidental/` category** — documented as the lighter tier, but workflows are identical to
  feature/technical. The "lightening" is mostly about scope (no PRD/plan needed), not ceremony.
- **Lightweight completion-doc template** — exists, but only saves doc time at integration; doesn't
  reduce activation or task-list overhead.
- **Atomic work** (capture rerouted post-WF to fold-into-commit / add a task / spin an Errand /
  `USER-INBOX § Atomic`; per-WU atomic companion file type retired under WF Phase 7.4) — bypasses WU
  lifecycle entirely. But the boundary is "smaller than warrants a branch" — under
  `branch.protection: full` (the default for most teams), most reviewable work needs a branch and
  therefore a WU.
- **`branch.protection: partial`** — allows direct-to-main commits for atomic work, but that's not
  what teams using PR review do.

For an experienced dev's "spin up a branch for a small bug, work, PR, merge" pattern under `full`
protection, there's no lightweight path. Every branch becomes a WU; every WU gets full ceremony.

This WU introduces a tiered model where ceremony scales with the work's actual scope, while
execution discipline (mandatory stops, quality gates, commit format) stays invariant.

---

## Working Thesis: Tiered Artifacts, Invariant Execution Discipline

ARC's value is in **structural enforcement of execution discipline**: mandatory stops at task
completion, quality gates per tier, atomic commits with format and context-footer enforcement,
PR review for shared branches. That discipline drives quality and is invariant across all WU sizes.

What scales with WU size is **artifact ceremony**: planning artifacts (plan-*, PRD), task structure
(phased vs flat vs none), and archival artifacts (completion doc vs PR description).

This framing **explicitly answers the `draft-arc-modes.md` § Mode 1 rejection** of the
"Required vs Available" model. That rejection was about making *execution discipline* optional — task
interlocks removed, quality gates skipped, "trust the dev." This WU does none of that: execution
discipline is enforced at every tier. What varies is where the spec lives, how tasks are organized,
and how the work is archived. Those are scaling-dependent ceremony, not discipline.

---

## Three-Tier Model

| Tier         | Planning artifacts                                   | Task structure                             | Verification                                         | Archive                  |
|--------------|------------------------------------------------------|--------------------------------------------|------------------------------------------------------|--------------------------|
| **atomic**   | None                                                 | None (work IS the task)                    | Per-commit T1 gates                                  | PR description           |
| **quick**    | None (spec via task list header or compact PRD)      | Flat task list (no phases)                 | Tasks complete + T2 gates                            | PR description           |
| **standard** | plan-\* + PRD                                        | Phased task list (with verification phase) | PRD success criteria + verification phase + T3 gates | Completion doc + archive |

### Boundary tests (objective)

**Atomic vs Quick:** *"Does this work need multiple coordinated commits to do well?"*

- Yes → quick (multi-commit means tasks)
- No → atomic (single concern, single commit)

**Quick vs Standard:** *"Could a competent engineer execute this work from the existing description
(issue/ticket/bug/pattern) without writing additional design before they start?"*

- Yes → quick (design space settled, spec is sufficient)
- No → standard (design space open, PRD required)

The Quick-vs-Standard test is the **design-doc boundary** — well-trodden ground in industry practice
(Stripe RFC criteria, Google design doc guidance, Basecamp Shape Up's "shaping" tier, GitLab MR-
driven workflow). The boundary is recognizable in retrospect: when work classified as quick starts
needing design notes, alternatives, or success-criteria specification, it's promoting to standard.

### Promotion is one-way

The system is asymmetric: easy promotion (atomic → quick → standard adds artifacts), no demotion
(standard → quick would discard work). Standard tier WUs that turn out smaller than expected just
complete against their existing artifacts; over-specification is harmless. Quick tier WUs that grow
get promoted: add the plan-*/PRD, restructure the task list into phases, continue.

---

## Scope

### In scope

1. **Three-tier WU model** with structural differentiation per the table above. Constitutional
   amendment to DEV-RULES.ARC establishing tier definitions, boundary tests, and the
   tiered-artifacts/invariant-discipline framing. Companion ADR documenting the constitutional
   shift (parallel scale to ADR-016).

2. **`**Tier:**` field on every meta file** — source of truth, declared at activation. Existing
   in-flight WUs migrate to `**Tier: standard**` (matches their current ceremony level).

3. **`**Design:**` field on every meta file** — pointer to where the work's specification lives.
   **Field introduction is upstream:** `**Design:**` is introduced as a generic optional pointer in
   Session-Operational Flow Phase 1 (planning-session active surface scope, with
   `**Design:** draft-{name}.md` value). This WU adds tier-specific value semantics and tier-aware
   validation on top of the already-introduced field.

   **Orthogonality with `**Origin:**`** (per WOR's Origin ⊥ Design orthogonality): `**Design:**`
   always points at an ARC-owned planning artifact. External trackers (GitHub issues, Jira, Linear)
   go in `**Origin:**`, never `**Design:**`. The two fields are independent — a quick-tier WU can have
   an external `**Origin:**` and an internal `**Design:** tasks-{name}.md`.

   Values:
    - `**Design:** draft-{name}.md` — planning state (introduced upstream)
    - `**Design:** spec-{name}.md` — standard tier, in-repo PRD
    - `**Design:** tasks-{name}.md` — quick tier under `pm.layer: arc-pm`, points to Scope section in
      the task list header (or to a compact PRD doc — see open question below)
    - omitted for atomic — work is self-evident from PR description; `**Origin:**` carries any
      external-tracker reference

4. **`arc start <name>` command** for fast WU activation. Bounded subset of post-WOR
   `activate-work-unit.md` workflow — same logic, faster invocation. Flags:
    - `--tier atomic | quick | standard` (default: `quick`)
    - `--type <conventional-commit-type>` (default: `feat`; per Work Organization Reform's
      Conventional Branch alignment — `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, etc.)
    - `--branch <branch>` (override default `<type>/<name>`)
    - `--spec <path-or-url>` (sets the Spec field)

   Standard tier reached via the planning workflow path (plan → PRD → activate), not via
   `arc start`.

   **Composition with the cold-start primitive (`draft-worktree-foundation.md` item 11).**
   `arc start` is the spawn-from-existing-session entry point — it creates the worktree (when
   applicable per tier), scaffolds the meta file, and reports the new worktree path so a fresh
   session can pick up via the cold-start primitive. Adopters working in tool-spawned worktrees
   (Conductor, emdash, Maestro, Warp, Worktrunk, Zed, etc.) still enter through `arc-session`: on
   finding a bare worktree, its cold-start dispatch scaffolds the meta in place by invoking
   `arc start --here` — same scaffolding logic, reached through the uniform session entrypoint
   rather than `arc start` create-new. The command is agent-invoked, not a human-run step. Both
   paths converge once the meta file is written.

   **Worktree Foundation coordination (2026-05-27).** WF introduces the `arc start` verb with a `--here`
   (use-existing / cold-start) mode — the invocation surface `arc-session` needs for cold-start (WF 5.3.R).
   `arc start` here **extends** that command: it adds the create-new modes (worktree creation + tier flags)
   over the same verb and inherits `--here`, rather than re-registering or redesigning it. The shared
   scaffolding primitive (`scaffoldIntoWorktree` / `spawnWorktree`) underlies both modes.

5. **Quick-tier task list shape.** Flat task list (no phases). Required `## Scope` prose section at
   the top (3-5 sentences, bounded by convention) when no external `**Design:**` is set — fills the
   internal-spec gap under `pm.layer: arc-pm`. New section in `strategy-task-list-formatting.md`
   § Quick Tier.

6. **Atomic-tier WU shape.** No task list. Meta file minimal (Tier, State, Branch, Origin). Execution
   discipline preserved at commit boundaries: each commit IS a review increment with mandatory stop.
   Quality gates: T1 per commit. PR description as archive.

7. **Ceremony scaling for activate / integrate / archive workflows.** Tier-aware branches in each
   workflow, layered on top of Work Organization Reform's consolidated boundary workflows
   and sweep-as-you-go foundation:
    - `activate-work-unit.md` (post-WOR shape — state-transition workflow, not branch creation):
      skip plan/PRD checks for atomic and quick; require for standard. Standard tier path
      inherits Work Organization Reform's planning-checkpoint opt-in
      (`review.planning_checkpoint` config + `pre-execution-graduation` extension) at the
      state-transition fire-site; atomic and quick tiers bypass the planning workflow entirely
      (via `arc start`), so the checkpoint doesn't apply to them.
    - `integrate-work-unit.md` (post-WOR shape — single integration boundary with sweep-as-you-go
      bundled): skip clean-work-unit and completion-doc steps for atomic; lightweight for quick
      (PR description as archive); full ceremony for standard. Integration-time updates advance
      `**State:**` to `Integrating` (WOR folded merge-position into State — no separate
      `**Integration:**` field) plus a one-line ROADMAP touch (one WU's line) — tracking docs are
      current at merge, not stale until sweep.
    - `archive-work-unit.md`: shape depends on Work Organization Reform's resolution of
      the default `archive.cadence` open question. Under `with-integration` default (current
      lean), this workflow collapses into `integrate-work-unit.md`; under `deferred` default, it
      retains its current shape as a separate post-integration ceremony. Tier-aware sweep
      ceremony applies in both cadences; the cadence-default decision affects the workflow's
      existence-as-separate-doc, not the tier-awareness logic itself.

7a. **Tier-aware adaptations on top of WOR's foundation.** Implements Session-Operational Flow
    § Scope → "Metadata-state foundation for WU lifecycle" against the actual lifecycle workflows,
    consuming Work Organization Reform's sweep-as-you-go foundation. Concrete deliverables
    that remain in this WU's scope (post-2026-05-08 split):

    - **State enum.** WOR settled the strict 4-state machine `Planning | Active | Integrating |
      Shipped`, folding merge-position into the `Integrating` state — so there is no separate
      `**Integration:**` field, and no `Paused` / `In Progress` (the pre-WOR / shift-state
      vocabulary; see `cohort-agile-parallelism.md`). Partial supersession is an optional
      `**Superseded By:**` annotation, not a state variant — a partially-superseded WU still ships
      through `Integrating → Shipped` normally (set by `integrate-work-unit § Handling Partially
      Superseded Work`; framing settled under WF Phase 7.5.a). Workflow updates compose with WOR's
      consolidated boundaries: `integrate-work-unit` Step 1 advances State at integration; PR review
      state lives in the PR (the WU sits in `Integrating` while awaiting review).
    - **Tier-aware sweep ceremony.** Atomic WUs: trivial sweep (single meta file delete in
      integration PR). Quick: standard sweep. Standard: full sweep with ROADMAP/PROJECT-STATUS
      updates. Layered on top of WOR's sweep-as-you-go shape.
    - **CodeRabbit-flagged contradictoriness fix.** The `State: Complete` + integration-step
      `Next Action` contradiction is resolved by WOR's `Integrating` state itself — it carries the
      in-flight workflow position without a separate `Integration:` field.

    **Moved to Work Organization Reform** (load-bearing for per-worktree isolation; not
    tier-specific):

    - Sweep cadence configuration (`archive.cadence` config key)
    - Sweep-as-you-go integration PR shape (code → completion → status flip → sweep commit
      ordering)
    - Deferred sweep variant (integration PR omits sweep; archive batches with next-WU planning)
    - Per-worktree isolation invariant (meta file on WU branch only, not on main while in
      flight)

8. **Atomic companion file retirement — owned by Worktree Foundation.** WF retires the `atomic-*`
   companion file type in light of the Errand class (WF scope item 14): the "holding area before
   decision" role evaporates with cheap Errands + worktree-isolated spin-up, and in-WU atomic captures
   reroute by intent (commit / task / Errand / USER-INBOX § Atomic). This WU's earlier "retire or
   repurpose" question resolves in the **retire** direction at WF; AWL inherits the cleaned-up capture
   model rather than owning the decision.

9. **Incidental concept retirement.** With worktree isolation handling "unplanned, interrupts another
   WU" (an atomic-character interrupt defaults to an **Errand** — launched from the main worktree via
   `errand-launch`, no worktree — promoted to an atomic-tier WU only when the WU threshold trips) and the
   tier model handling "lighter ceremony," the incidental concept becomes redundant.
   Work Organization Reform retires the `incidental/` category prefix as part of its
   broader category-prefix retirement (`feature/` / `technical/` / `incidental/` → Conventional
   Branch alignment); this WU retires the remaining conceptual references in workflows, strategy
   docs, and templates that frame incidental as a distinct WU shape. Mechanical sweep across
   those surfaces. (WOR already retired the pause-pointer fields; nothing migrates to a shift state —
   see `cohort-agile-parallelism.md`.)

10. **Documentation cascade.** DEV-RULES.ARC tier definitions and boundary tests;
    `strategy-task-list-formatting.md` tier-aware task list shapes;
    `strategy-work-organization.md` tier integration with categories and branch
    naming, plus § Spec-Flow Invariants updates — name AWL in § Deferred contract as the
    tier-classification model home, and replace § Escape-hatch guardrails intent-level phrasing
    with concrete `--tier atomic` flag default (currently abstracted pending this WU per
    audience-boundary discipline); `template-meta.md` new fields;
    `template-tasks.md` quick-tier shape variant; quality-gate-commands method
    tier awareness.

### Out of scope

- **Worktree mechanism and shift lifecycle** — Worktree Foundation.
- **Focus-role model and concurrent-work conventions** — Concurrent Work Conventions.
- **Tier-aware quality gate scaling beyond T1/T2/T3 split per tier table** — defer detailed gate
  tier mapping to Quality Gate Tiers and Hook Integration WU. This WU establishes that
  tiers exist; gate-tier mapping per WU tier is the gate-tiers WU's PRD work.
- **Auto-promotion of tier based on commit count or duration thresholds.** Manual promotion only.
  Structural-detection nudges (warnings) may be considered at PRD time but auto-promotion is too
  aggressive — promotes work the user hasn't classified.
- **Demotion paths.** No demotion; standard tier WUs complete against their artifacts.
- **Atomic-tier workflow generation tooling.** The atomic tier is intentionally workflow-light;
  scaffolding tooling would defeat the purpose.

---

## Design Decisions

### Tier as structural differentiation, not opt-in optionality

Each tier has a distinct artifact shape — atomic has no tasks, quick has flat tasks no PRD, standard
has phased tasks plus PRD. This is structural, not "skip optional steps." Reviewers, agents, and
tooling can detect tier from artifact presence and the explicit `**Tier:**` field; they don't need to
reason about which optional steps were skipped.

### Default tier at `arc start` is `quick`, not `atomic`

`quick` is the median case for "I'm spinning up a WU." Defaulting to `atomic` would push every "I'll
just fix this quickly" into the smallest ceremony tier, where growth becomes awkward (promotion
required mid-work). Defaulting to `quick` accepts one extra Tier-field declaration for trivial work
in exchange for safer scaling. Atomic is opt-in (`--tier atomic`) for declared-tiny single-commit
work.

### Quick-tier scope section is prose, not frontmatter

Frontmatter is for metadata; the scope is content. A `## Scope` prose section at the top of the
quick-tier task list is human-readable, version-controlled, naturally bounded by convention. The
scope section is the in-repo spec surface regardless of whether an external tracker is the WU's
Origin — under WOR's Origin ⊥ Design orthogonality, external trackers go in `**Origin:**`, not
`**Design:**`, and the internal spec always lives in an ARC-owned artifact.

### Atomic tier preserves task discipline at commit boundaries

The mandatory stop after each task — ARC's core review-increment discipline — applies at atomic
tier too, just at commit boundaries instead of task-list-checkbox boundaries. Each commit is a
review increment; quality gates run per commit; the user reviews and confirms before the next
commit. Execution discipline preserved; task-list ceremony stripped.

### Incidental retirement, not repurposing

The incidental category was a workaround for ARC not having mobility infrastructure. With worktree
isolation handling interrupts (an atomic-character interrupt defaults to an **Errand** launched from the
main worktree, promoting to an atomic-tier WU only when the threshold trips) and the tier model handling
lighter ceremony, the category has no remaining function. Renaming or repurposing would create migration
confusion; clean retirement is simpler. Workflows that reference incidental migrate to the tier model +
Errand / worktree-spawn, not to a shift state.

### Atomic-the-character vs atomic-the-shape

"Atomic" describes the work's character (single bounded concern). The shape it takes adapts to
protection mode: under `partial`, atomic work goes direct-to-main with no branch or meta file;
under `full`, the same atomic intent becomes an atomic-tier WU with branch, minimal meta file, and
PR. The word's meaning is consistent across modes; the framework's shape adapts.

**Towards — atomic-tier WU init shape (surfaced 2026-05-20 during WOR Task 6.7.c):** WOR ships
`init-work-unit.md` as planning-only — Step 2 hardcodes `git checkout -b plan/{name}` and Step 4
sets `**State:** Planning`. Under WOR-as-shipped, an atomic-tier WU under `full` protection has
no codified init workflow that skips Planning; the meta file gets hand-created with
`**State:** Active` on a `<type>/<name>` branch. This WU's `arc start <name>` command (scope item
4) is the natural home for that path — decide at PRD time whether `arc start` covers atomic-tier
init directly (no Planning → Active transition), whether `init-work-unit.md` evolves to accept a
life-phase parameter (Planning vs Active → branch-prefix follows), or whether the conductor
(`draft-arc-plan-conductor.md`) absorbs both shapes. Surfaced during WOR's cross-reference sweep
when reframing `2_generate-tasks.md`'s pre-WOR "directly-on-base-branch" bifurcation — that
workflow narrowed under WOR to the canonical planning-life-phase flow only.

**WF coordination (2026-05-23):** Worktree Foundation ships its `spawn` primitive **tier-agnostic** —
always-worktree, built as a thin wrapper over `init-work-unit` — and deliberately leaves the life-phase
parameter as the seam this WU fills. So the tier-conditional spawn behavior (atomic → no worktree, an
Errand on the bare-git path; quick / standard → worktree) is **AWL's** to layer onto WF's tier-agnostic
primitive, and the life-phase param (`Planning` vs `Active` → branch-prefix follows) flows through WF's
wrapper without reshaping it. WF references whatever tier set this WU lands; this WU references WF's
spawn contract.

**Errand Enablement coordination (2026-05-25):** The Errand path itself — the `errand-launch` primitive, the
Errand decision matrix, and the advisory foreign-artifact gate — is **Errand Enablement's** (the floor WU,
sequenced WF → Errand Enablement → IFA), not AWL's. `arc start` and `errand-launch` are sibling entry verbs.
AWL owns the *tier-side* reconciliation (atomic-character work defaults to an Errand, promoted to an
atomic-tier WU when the threshold trips); the Errand operationalization is EE's. The 2026-05-23 note's
"atomic → an Errand on the bare-git path" routing is realized via EE's matrix.

**Errand-model re-pivot (`work-routing-discipline`, 2026-05-31):** the Errand path is now **execution-only** —
`errand-launch` (seed/queue) is retired for the re-enterable `run-errand` workflow; an errand is a `chore/<slug>`
branch (full) / base commit (partial), state derived from branch + PR. AWL's tier-side reconciliation holds, but
the promote-to-WU path is realized by `run-errand` → `init-work-unit` (mint `meta-*`, rename `chore/` →
`<type>/`); reconcile the EE references when next iterated.

---

## Dependencies and Sequencing

### Upstream

- **Work Organization Reform:** delivers the consolidated boundary workflows (single
  activate/integrate pair under single-branch-per-WU lifecycle), sweep-as-you-go foundation, and
  per-worktree isolation invariant. This WU's tier-aware adaptations layer on top. Hard upstream
  dependency.
- **Worktree Foundation:** clean activate/integrate workflows post-pointer-field retirement;
  the tier model's `arc start` command operates on the worktree-aware activation substrate. Pointer
  fields are retired in WF; the incidental category retirement here folds in cleanly afterward.
- **Session-Operational Flow** (shipped): consumes Phase 7 (metadata-state foundation — the
  `**State:**` model; WOR later folded merge-position into the `Integrating` state, so no separate
  Integration field). Sweep cadence config moved to WOR; this WU consumes it. Phase 2
  (meta-file timing split) also informs which fields belong on commit vs handoff.

### Downstream

- **Concurrent Work Conventions:** tier model informs concurrency conventions (focus-role
  model probably doesn't apply to atomic tier; quick-tier WUs are short-lived enough that focus
  designation is less meaningful).
- **Quality Gate Tiers and Hook Integration:** gate-tier mapping per WU tier is that
  WU's PRD work; this WU establishes that tiers exist.
- **ARCd Rebrand:** tier vocabulary absorbed into rename pass.

### Recommended sequencing

Work Organization Reform → Worktree Foundation → (CLI Substrate Adoption ‖ arc-plan Conductor ‖
Coord Probe — post-WF parallel candidates) → **Agile WU Lifecycle** → Concurrent Work Conventions.
Per 2026-05-20 resequence, this WU sequences after the post-WF parallel layer settles; benefits
especially from arc-plan Conductor's tier-aware orchestration integration if Conductor ships
first, but degrades gracefully if not (Conductor defaults to standard-tier behavior until this
WU's `**Tier:**` field exists).

---

## Pressure Points and Risks

### Tier drift via under-specification

Adopters may default to `quick` for everything to avoid PRD ceremony, even when work is genuinely
standard-tier. Mitigation:

- Boundary test ("does this need a written design document?") is recognizable in retrospect — when
  design notes start accumulating, promotion is the signal
- Explicit `**Tier:**` field invites scrutiny: a reviewer reading "Tier: quick" on a complex change
  has the explicit signal to push back
- Strategy doc guidance with concrete examples on each side of the boundary

### Constitutional change scope

Tier definitions, boundary tests, and tiered-artifacts/invariant-discipline framing are
constitutional-level additions to DEV-RULES.ARC. Scope is comparable to ADR-016's commit-control
downgrade. Companion ADR required to document the architectural shift.

### Incidental retirement ripple

Retiring the incidental category affects every reference: workflows, strategies, status template,
branch-prefix conventions, examples. Mechanical sweep but broad. Risk: orphaned references that
lint/CI doesn't catch. Mitigation: thorough grep + integration test coverage on activation /
integration / archive flows.

### `arc start` command novelty

ARC currently has no activation command — activation is workflow-based. Adding `arc start` is a
real shift. Counter-argument: every CLI subcommand adds maintenance, docs, discoverability burden.
Resolution: `arc start` IS the workflow's automation for the bounded quick-tier case. The workflow
document (`activate-work-unit.md`) stays as canonical specification; the command is its packaged
form. Adopters using defaults run the command; adopters deviating read the workflow.

### Atomic-tier discoverability

If atomic tier WUs have minimal meta files and short lifetimes, session-init's "active WUs"
enumeration could become noisy. Mitigation: tier-aware orientation summary ("3 active WUs: 1
standard, 2 atomic"); auto-cleanup of completed-but-not-archived atomic WUs at session-init.

---

## Open Questions

### Atomic-companion retirement — resolved at Worktree Foundation (retire)

Resolved: WF retires the `atomic-*` companion file type (WF scope item 14) in light of the Errand
class — the "holding area before decision" role evaporates with cheap Errands + worktree-isolated
spin-up. In-WU atomic captures reroute by intent (commit / task / Errand / USER-INBOX § Atomic). This
WU no longer owns the retire-vs-repurpose decision; it inherits the cleaned-up capture model.

### Default `**Origin:**` population with an external tracker present

Under WOR's Origin ⊥ Design orthogonality, external trackers populate `**Origin:**`, not `**Design:**`
(retired `pm.layer: external` value, framing collapsed per WOR's design decision). Should
`arc start --tier quick` default to populating `**Origin:**` from the current branch's linked
PR/issue (via coord-probe) when a `coord.adapter` is configured? Or always require explicit
`--origin`? Auto-population is convenient but risks pointing at the wrong ticket if inference is
wrong. PRD decision.

### Promotion mid-work UX

User starts atomic, scope grows, needs to promote. What's the command shape?

- `arc promote-tier <name> --to quick` — explicit
- Implicit: when a task list is created on an atomic-tier WU, automatically promote with
  notification
- Manual: user edits meta file and creates artifacts; framework detects on next session-init

Likely manual + structural-detection nudges, but PRD decision.

### Tier-aware Spec field validation

Should pre-commit hooks validate the `**Design:**` field matches tier expectations (standard tier must
point at PRD; quick must point at task list or compact PRD; atomic omits)? Validation adds
strictness; relaxed handling tolerates in-flight transitions. Probably warn-not-block; PRD decision.
External-tracker URLs (now in `**Origin:**`, not `**Design:**`, per WOR's orthogonality framing) are
out of this validation's scope.

### Quick-tier spec shape — task-list header vs reduced PRD doc

Under WOR's Origin ⊥ Design orthogonality framing, `**Design:**` always points at an ARC-owned
artifact (external trackers go in `**Origin:**`). The remaining question is where the
quick-tier internal spec lives:

- **Task-list header `## Scope` section** (current scope item 5): in-repo spec surface as a
  prose section at the top of `tasks-{name}.md`. Minimal — no separate doc.
- **Reuse Lite mode's reduced PRD template**: quick tier under `pm.layer: arc-pm` points its
  `**Design:**` field at a compact PRD doc rather than a section of the task list. Creates
  cross-mode parallelism: Lite project's PRD has the same shape as Full mode's quick-tier PRD, and
  graduation Lite → Full preserves the spec shape for the first quick WU.

**Tradeoffs:**

- *(For compact-PRD)* Spec field semantics become uniform — always points at a doc, never at a
  section-of-another-file. Cleaner contract for tooling and reviewers.
- *(For compact-PRD)* Reuses Lite mode's reduced PRD template (when it lands) — no separate
  "scope section" convention to maintain.
- *(For compact-PRD)* Honors ARC's spec-directed principle more cleanly — "spec lives in a doc,
  regardless of tier" is consistent with the principle.
- *(Against compact-PRD)* Adds a doc to quick tier (currently zero docs besides task list + meta
  file).
- *(Against compact-PRD)* Spec budget (5-10 min for Lite's PRD) might be 20-50% of total work time
  for short quick-tier work — boundary check: if you can't articulate the goal in ~5 minutes,
  you're probably standard tier.
- *(Against compact-PRD)* "PRD" naming carries weight quick tier may not warrant — could rename
  for the reduced shape (Spec? Brief? compact-PRD?) but that fragments naming across modes.

**Coordination:** depends on Lite mode's reduced PRD template shape, which is `draft-arc-modes.md`
§ The Lite PRD scope. If Lite PRD template lands first or in parallel, this WU adopts it for
quick tier directly. If Lite mode is still iterating, this WU may need to either wait or ship
with the task-list-header fallback and migrate later.

PRD decision informed by Lite mode's PRD template progress and external research on lightweight
spec patterns.

### Status template versioning during migration

Adding `**Tier:**` and `**Design:**` fields to template-meta is a template change. Existing in-flight
meta files don't have the fields. Migration: assume `Tier: standard`, `Spec: prd-{name}.md` if
PRD exists else `tasks-{name}.md`. Auto-migrate at session-init? Manual? PRD decision.

---

## Scope Estimate

**Large.** Constitutional change scope plus broad sweep of workflows, templates, strategy docs.
Tier model is conceptually clean but touches many surfaces.

Phases (provisional):

1. **Constitutional foundation** — ADR drafting, DEV-RULES.ARC tier-definition amendments,
   tiered-artifacts/invariant-discipline framing, alignment with plan-arc-modes' rejection of
   "Required vs Available" model (explicit answer in the constitutional language).
2. **Meta template + Spec field** — `**Tier:**` and `**Design:**` fields on `template-meta.md`
   (no separate `**Integration:**` field — WOR folded merge-position into `**State:**`); migration
   handling for existing WUs.
3. **`arc start` command** — CLI subcommand implementation, default-tier semantics, flag handling,
   error semantics, tests.
4. **Integration-workflow restructure** — implements the metadata-state foundation from
   Session-Operational Flow Phase 7. `**State:**` rollout in workflows (advancing to `Integrating`
   at integration; no separate Integration field per WOR); sweep cadence configuration;
   sweep-as-you-go integration PR shape (multi-commit with
   isolated sweep commit); deferred sweep variant; tier-aware sweep ceremony. Resolves CodeRabbit
   contradictoriness and stale-tracking-doc inbox concerns.
5. **Workflow tier-awareness** — activate-work-unit, integrate-work-unit, archive-work-unit
   tier-aware branches (built on top of Phase 4's restructured workflows); quick-tier task list
   shape in template-tasks; atomic-tier minimal flow.
6. **Incidental retirement sweep** — workflows, strategies, status template references, branch-
   prefix conventions, examples. Mechanical broad sweep.
7. **Atomic-companion decision and migration** — retire or repurpose per PRD-time decision;
   existing companion-file content migration.
8. **Strategy doc cascade** — strategy-task-list-formatting tier-aware shapes, strategy-work-
   organization tier integration, quality-gate-commands tier awareness.
9. **External research** — Shape Up shaping criteria, Stripe RFC threshold, Google design doc
   guidance, GitLab MR-driven workflow. Validates boundary tests against industry idiom; informs
   PRD-time language refinement.
10. **Documentation / tests / examples** — standard closing phase.

Phase 1 gates everything else (constitutional foundation precedes implementation). Phase 4 has a
hard upstream dependency on plan-session-operational-flow Phase 7; Phases 2-3 can proceed in
parallel. Phase 5 depends on Phase 4. Phases 6-8 are sweeps that depend on Phase 5. Phase 9
(external research) can run alongside any phase but informs Phase 1's language.

---

## External Research

The Quick-vs-Standard boundary aligns with industry-recognized "design-doc-or-not" criteria. PRD-
time research validates the boundary tests against idiomatic practice and refines language:

- **Shape Up methodology (Basecamp)** — explicit "shaping" tier vs "small batch" tier with
  documented criteria.
- **Google's design doc when-to-write guidance** — public engineering blog material on this exact
  boundary.
- **Stripe's RFC process** — documented threshold for when an RFC is required.
- **GitLab's MR-driven workflow** — published criteria for "just open an MR" vs "needs an issue +
  design first."
- **Internal-spec patterns for quick-tier work** — how teams handle "well-defined work that doesn't
  need a design doc" in practice (issue templates, PR templates, conventional task lists).

Research wouldn't change the boundary itself; it would inform PRD-time language and provide
concrete examples for the strategy doc.

### Worktree-management tool landscape (completed 2026-05-12)

- `research-worktree-tool-convergence.md` — convergence pass across 11 agentic worktree-management
  tools (Cluster 1: Zed, Warp, Worktrunk; Cluster 2: Conductor, emdash, Maestro; Cluster 3: Super,
  Superset, T3code, Soloterm, Nora). Closes the question of whether `arc start` retains a clear
  role alongside parallel workspace tools — yes, as the spawn-from-existing-session entry point,
  paired with `draft-worktree-foundation.md` item 11's cold-start primitive (the tool-spawned-
  worktree entry point). Both entry points produce the same scaffolded meta file; adopters pick
  per WU based on origin. Tier model survives unchanged — tier selection at `arc start`
  (`--tier atomic | quick | standard`) and at the cold-start primitive operates on the same
  meta-* foundation.

## Coordination — ADR-022

`**Tier:**` and `**Design:**` are schema-owned meta fields with tier-conditional validity (a cross-field
constraint a flat template cannot express), per ADR-022's structured-record meta model. The State
machine's transitions are schema events, not free-text field edits. See
`adr-022-managed-operational-state-documents.md` § Coordination.

---
