# Task List: adversarial-review

- **Design:** `spec-adversarial-review.md`

> _Two-copy discipline (standing, all phases): every edited framework surface lands in both
> `packages/arc-framework/arc/` (authoritative source) and the `.arc/` instance — author through the package
> source, mirror to `.arc/`, and verify the pre-commit sync check is clean. The per-phase reconcile task is the
> parity checkpoint, not the only place the obligation applies. Some package-source files carry a `.template.md`
> suffix the renderer strips (e.g. `generate-tasks.template.md` → `generate-tasks.md`) — edit the `.template.md`
> name in the package and the rendered name in `.arc/`; among this WU's targets only `generate-tasks` is
> `.template`, all other workflows / methods / skills share one name across both copies. This is a methodology
> surface: validation is markdown lint plus the mechanism's own dogfood passes — no `test-first` structure
> applies._

---

## **Phase 1:** The `adversarial-review` core mechanism method

_Purpose:_ Mint `system/methods/adversarial-review.md` as the contracted fresh-subagent review procedure the four
fire-points invoke — its full contract: invariant properties, the invocation contract (inputs + return type +
prompt template), severity model, exit gate, context provisioning, and the `Novel` fan-out hook.

_Design decisions:_ The contract is **stated but advisory** (today's methods-README model — not `fixed`-enforced;
the fixed-vs-overridable call is downstream). The prompt template hard-codes the two disciplines that made the
prototypes work — fresh-context-per-pass and primary-verifies-findings-against-source. `Novel` fan-out is a
defaulted-off contract hook, not orchestration. The method is _the mechanism_ — it runs a supplied rubric
adversarially; it is not itself a rubric. Full design detail: `spec-adversarial-review.md` § D1–D7.

### `[ ]` **1.1 Scaffold the method file and its invariant-properties contract**

- _Goal:_ `adversarial-review.md` exists as a method whose five invariant properties are stated as the contract
  any override must preserve to remain adversarial-review at all.

- _Approach:_ mirror the sibling method shape (`spec-review.md`) — frontmatter (`name`, `description`,
  `override-active: false`), `# Method:` heading, the Workflow / When / Contract blockquote, `.override` (`[No
  override configured]`), then the `.default` body.

- _Note:_ the harness-conditional posture (fresh subagent when the harness supports one) + the degrade path live
  once in `§ Sub-agent scope` (Task 3.2, the single constitutional locus); the method **references** that locus,
  never restates it — an intra-WU forward reference (Phase 3 authors the clause; reference it even though this
  phase lands first, don't inline it).

    - `[ ]` **1.1.a Create the file and header blockquote**
        - Workflow: the four fire-point workflows (`draft-design`, `create-spec`, `generate-tasks`,
          `verify-work-unit`). When: a stage boundary runs its readiness / finalize / verification gate. Contract:
          run a supplied rubric adversarially via a fresh subagent, primary holding judgment, looping to
          convergence — advisory, never a hard gate.

    - `[ ]` **1.1.b State the five invariant properties as the contract**
        - Fresh subagent per pass; adversarial stance (with the do-not-manufacture / say-so-plainly clause);
          primary holds judgment (every finding PLAUSIBLE until verified against source); loop to convergence
          (later passes break the prior fixes); advisory and `Class`-scaled. Frame drop-these-and-it-is-no-longer
          -adversarial-review; note the contract is advisory under today's methods-README model — stated, not
          enforced.

### `[ ]` **1.2 Author the invocation contract — named inputs, return type, prompt template, callsite shape**

- _Goal:_ a caller can marshal a pass without re-deriving the interface — the method carries named inputs, a
  structured return type, the prompt template that serializes the subagent-context inputs, and one canonical
  callsite arg-block the four fire-points instantiate. The primary owns the loop (spawns each pass, applies the
  exit gate, verifies findings); a subagent performs exactly one pass.

- _Approach:_ structured prose + fenced param blocks in the method **body** — not frontmatter (the frontmatter
  schema is deferred to `composable-workflows`).

- _Note:_ this is the output-half contract downstream WUs consume as a worked example; keep it body-level.

    - `[ ]` **1.2.a Named inputs**
        - The input table with each input's Kind and Contents: `rubric` (per-stage), `artifacts` (per-stage),
          `orientation` (fixed), `priorFindings` (pass ≥ 2, a deliberate non-input on pass 1). Distinguish these
          **subagent-context inputs** from `passBudget` — the `Class`-scaled **primary-side loop bound** that caps
          how many passes the primary spawns and is **never serialized into a subagent**.

    - `[ ]` **1.2.b Return type**
        - Per-finding fields (`title`, `severity`, `artifact-locus`, `evidence`, `failure-rationale`) plus the two
          report-level fields (`what-held-up-under-attack`, `certification-verdict`).

    - `[ ]` **1.2.c Prompt template**
        - Method-owned; serializes the subagent-context inputs (not `passBudget`) and hard-codes the two
          disciplines (fresh context per pass; primary-verifies-findings-against-source). Portable — no per-harness
          profile. Resolves OQ1 (exact adversarial phrasing against the two disciplines).

    - `[ ]` **1.2.d Canonical callsite arg-block**
        - Define one prose/fenced arg-block shape in the method body that every fire-point instantiates — naming
          the mechanism invocation (`rubric`, `artifacts`, `orientation`, `passBudget` as the primary's loop bound,
          `priorFindings` on re-runs) and the runtime steps (spawn a fresh subagent with the subagent-context
          inputs; verify each finding against source; loop under the exit gate). The 4.x wirings instantiate this
          shape rather than re-deriving it.

### `[ ]` **1.3 Author the severity model — fixed core enum + severity-vs-disposition**

- _Goal:_ findings carry a stable, ordered severity vocabulary uniform across fire-points, with severity
  (materiality) held distinct from disposition (what the primary does with a confirmed finding).

    - `[ ]` **1.3.a The fixed core enum**
        - `blocker` / `major` / `minor`, ordered. What is fixed (the levels + their ordering) vs. what a rubric
          supplies (the per-artifact interpretation); the `minor | major` boundary as the materiality line the
          exit gate reads.

    - `[ ]` **1.3.b Severity ≠ disposition**
        - Disposition (fix in place / carry forward durably / drop) is the primary's, assigned at verification,
          orthogonal to severity and available at any level. A finding the primary has acted on is _resolved_; an
          _open_ finding above `minor` is what blocks convergence. Carry-forward is a disposition, not a fourth
          tier and not a flatten-to-`minor`.

### `[ ]` **1.4 Author the exit gate — convergence-by-materiality + `Class`-scaled pass cap**

- _Goal:_ the loop has a bound — convergence by materiality is the primary exit; the `Class`-scaled pass cap is a
  cost-ceiling backstop, not the primary exit.

    - `[ ]` **1.4.a Convergence (primary exit)**
        - A pass converges when it surfaces no _open_ primary-confirmed finding above `minor`; zero findings
          (clean) and minors-only-folded (the soft case — fold and exit) are the two cases the
          `certification-verdict` distinguishes.

    - `[ ]` **1.4.b `Class`-scaled pass cap (backstop)**
        - `Light` 1 · `Heavy` 2 · `Novel` 3, whichever comes first with convergence; reaching the cap with live
          `blocker`/`major` does **not** auto-resolve — it stops the loop and surfaces the unresolved findings at
          the stage interlock. Uniform materiality threshold (not `Class`-keyed); pass ≥ 2 is a full rubric re-run
          with `priorFindings` appended, never a fix-only attack. Numbers are a starting calibration
          (Designed-to-evolve, OQ3).

- _Note:_ the final-fold residual (the last pass's folds are not re-attacked) is what motivates the post-settle
  coherence re-read; the method states the rationale, but the re-read itself is wired at the planning fire-points
  (Task 4.5).

### `[ ]` **1.5 Author context provisioning and the orientation set**

- _Goal:_ the subagent receives design-not-implementation context that carries the independence property — a
  prescribed first-read path set (repo read access presupposed), not content serialized into the prompt.

    - `[ ]` **1.5.a `artifacts` — the stage-keyed set**
        - Per stage: the artifact under audit + its upstream chain (draft readiness → draft; spec → draft + spec;
          task-gen → spec + tasks; verify → spec + tasks + the diff under verification), plus the non-exhaustive
          key-file pointer list. At verify, the pass independently re-validates the spec's success criteria against
          the diff, with the implementer's `[x]/[~]/[ ]` markings **withheld**.

    - `[ ]` **1.5.b `orientation` — the fixed set**
        - `AGENT-BRIEF.ARC` + `AGENT-BRIEF.PROJECT`: artifact-neutral ground truth in, author's beliefs about the
          artifact out. Goal referents (`PROJECT-PRD` / `TECHNICAL-OVERVIEW` or equivalents) enter rubric-keyed
          only; constitution / strategies stay pointer-listed, read on demand.

    - `[ ]` **1.5.c `priorFindings` gating**
        - Enters at pass ≥ 2 only; the primary's pass-1 focus list is withheld (the blind spots are exactly what
          it cannot list — fork F3).

### `[ ]` **1.6 Author the `Novel` scope-partitioned fan-out contract hook**

- _Goal:_ the contract admits a `Novel`-only, default-off partitioned pass 1 without a later breaking change —
  the hook, not orchestration.

- _Approach:_ design only the contract surface (per-subagent scoped `rubric`/`artifacts`, a partition map, the
  seam-ownership rule, disjoint merge, cross-report convergence); do not build orchestration and do not default it
  on.

    - `[ ]` **1.6.a Entry test — partition-ability**
        - Slices must be orthogonal with ownable seams (the `assess-cohort-fit` orthogonality discriminator one
          altitude down); state it as **explicitly distinct** from `pr-decomposition`'s bisectability test.

    - `[ ]` **1.6.b Seam-ownership rule**
        - The slice that originates a change owns its downstream blast radius; where seams are dense, a dedicated
          seam/integration slice owns them (else partitioning orphans seam defects — the mechanism's strongest
          point).

    - `[ ]` **1.6.c Merge and convergence**
        - Disjoint responsibility → merge is concatenation; cross-report convergence is a trivial AND (no slice's
          report carries a finding above `minor`). Primary-proposed, `Novel`-only, entry-test-gated.

### `[ ]` **1.7 Reconcile both framework copies + registration**

- _Goal:_ `adversarial-review.md` is byte-identical across both copies and the pre-commit sync check is clean.

- _Note:_ skip the README `## Index` — its retirement is a separately-captured errand, so new methods are
  discoverable via the directory + their frontmatter; no `## Method Dependencies` row either (that table tracks
  override-consistency coupling, not the rubric-running relation).

## **Phase 2:** Rubric consolidation — the rubrics the mechanism runs

_Purpose:_ Consolidate the rubrics into public methods: mint `design-audit`, extract `task-audit` from its skill
door, and author each rubric's category→severity interpretation. `spec-review` (already a method) gains its
second caller through Phase 4's create-spec wiring, not here.

_Design decisions:_ `design-audit` ≈ `task-audit` one rung up — a rubric method + a thin skill door, no dedicated
workflow. `task-audit` becomes the DRY rubric **method**; `arc-task-audit` reduces to a door that calls it and
keeps the mid-impl-reground context layer. Standalone skill-door runs keep the native two-tier disposition
contract; the severity interpretation is new authoring for the through-the-mechanism path (OQ4). Detail:
`spec-adversarial-review.md` § D9.

### `[ ]` **2.1 Mint the `design-audit` method (efficacy + fit)**

- _Goal:_ `design-audit` exists as a public rubric method that validates a **design** (not the artifact) —
  efficacy (does the design solve the goal) and fit (optimal + forward-compatible, not merely non-conflicting).

- _Context:_ it is the missing _destination_ for `spec-review`'s "this reopens design" pointer — `spec-review`
  verifies the artifact, `design-audit` validates the design that self-review deliberately disclaims. Pulled in
  from `review-method-family`'s buffer.

    - `[ ]` **2.1.a Author the method**
        - Frontmatter + Workflow/When/Contract blockquote + `.override`/`.default`, carrying the efficacy + fit
          lenses and the preserved framings: read-only, standalone + optional; floored at a finished draft and
          point-agnostic above (draft / spec / post-task-gen / mid-impl).

    - `[ ]` **2.1.b State the `spec-review` ↔ `design-audit` relationship**
        - In `design-audit`, name the division of labor (artifact-quality vs. design-validity) so the two methods
          compose rather than overlap.

### `[ ]` **2.2 Add the `arc-design-audit` skill door**

- _Goal:_ `design-audit` is invokable ad hoc via a thin skill door that carries only door-work
  (trigger/awareness + dispatch to the method), mirroring `arc-task-audit`'s door role.

- _Approach:_ create the canonical `SKILL.md` under `.internal/skills/arc-design-audit/` in both copies; read-only
  posture, do not invoke proactively. It departs `review-method-family`'s buffer to here.

### `[ ]` **2.3 Extract `task-audit` into a method; reduce `arc-task-audit` to a door**

- _Goal:_ `task-audit` is the DRY rubric **method**; `arc-task-audit` is a thin door that calls it and retains the
  mid-impl-reground context layer — the layering inversion is retired at the extraction, and the `generate-tasks`
  callsite repoint follows in Task 4.3.

    - `[ ]` **2.3.a Author `system/methods/task-audit.md`**
        - Carry the rubric the skill holds today — the grounding floor, the eight issue categories, the two audit
          depths (`grounding-only` / `full`), structured-findings grouping, recommend-actions, **and the native
          two-tier disposition** (`Fix before starting` / `Carry as context`) — as the method. The two-tier
          disposition stays the standalone + `generate-tasks` output contract, alongside the new category→severity
          interpretation (Task 2.4.b) added for the through-the-mechanism path.

    - `[ ]` **2.3.b Reduce `arc-task-audit` to a door**
        - Keep trigger/awareness, the two caller inputs (scope, depth), dispatch to the `task-audit` method, and
          the mid-impl-reground context layer. Remove the now-stale "Also invoked by `generate-tasks`" caller claim
          and its link — superseded by Task 4.3.b's repoint (the workflow calls the method directly).

### `[ ]` **2.4 Author the per-rubric category→severity interpretations**

- _Goal:_ `design-audit` and `task-audit` each map their findings into the fixed `blocker`/`major`/`minor` enum so
  the exit gate can read them — new authoring, since neither carries a severity concept today (OQ4).

- _Context:_ `task-audit`'s native tiers are **dispositions**, not severities — reconcile along the two axes: `Fix
  before starting` ≈ a higher-severity finding with a fix-here disposition; `Carry as context` = the carry-forward
  disposition at whatever severity. The interpretation is for the through-the-mechanism path; standalone skill-door
  runs keep the native two-tier.

    - `[ ]` **2.4.a `design-audit` category→severity interpretation**

    - `[ ]` **2.4.b `task-audit` category→severity interpretation + the two-axis reconciliation**

### `[ ]` **2.5 Reconcile both framework copies + registration**

- _Goal:_ `design-audit.md`, `task-audit.md`, and both skill doors (`arc-design-audit`, the reduced
  `arc-task-audit`) are identical across both copies and the sync check is clean (README `## Index` skipped per
  the pending retirement).

## **Phase 3:** Constitutional edit — `DEV-RULES.ARC § Sub-agent scope`

_Purpose:_ Re-aim `§ Sub-agent scope` from a task-list-membership ban to a **delegate-by-function** rule
(derivation / execution / judgment), with the harness-conditional clause stated once as the single constitutional
locus.

_Design decisions:_ State the sharpened rule on its **own terms** — not re-anchored on the "delegation bypasses the
co-development loop" rationale (the proxy argument the pending `execution-delegation-doctrine` rewrite dismantles)
— and keep verification-subagent language **semantic** ("same capability as the primary," "fresh context"; no
model names or spawn mechanics), so EDD's later rewrite and the future `arc-peer` profile extend rather than
reverse it. Consistent with `ADR-002`'s non-prohibition posture — no ADR amendment for this half. Detail:
`spec-adversarial-review.md` § D8.

### `[ ]` **3.1 Rewrite `§ Sub-agent scope` as the delegate-by-function rule**

- _Goal:_ `§ Sub-agent scope` reads as a delegate-by-function rule that sanctions read-only review delegation and
  closes the current planning-stage _silence_, replacing the task-list-membership ban — protecting the two
  properties (the human's formative involvement in changes; judgment staying with the primary).

    - `[ ]` **3.1.a Derivation tier**
        - Read-only (search, research, review, finding-generation) — freely delegable; outputs advisory until the
          primary verifies them against source. `adversarial-review` becomes the paradigm case, not an exception.

    - `[ ]` **3.1.b Execution tier**
        - Work that lands in the increment — stays with the primary while per-increment co-development is in force;
          delegable only under an explicit, user-approved scope relaxation. Build the relaxation **socket**;
          do not pre-approve the plug (`unit-scoped-review`'s orchestration mode is the intended plug).

    - `[ ]` **3.1.c Judgment tier**
        - Validation against ground truth, break-out detection, gates, commits — never delegates, under any mode.

### `[ ]` **3.2 State the harness-conditional clause and the degrade path**

- _Goal:_ the harness-conditional posture lives here once as the single constitutional locus (callsites reference,
  never restate) — use a fresh subagent when the harness supports one; no per-harness agent-profile fleet.

    - `[ ]` **3.2.a The clause**
        - Fresh subagent when the harness supports one; no profile fleet maintained (grounds the prompt-over-profile
          choice).

    - `[ ]` **3.2.b The degrade path**
        - When subagents are unavailable: skip with a note (the mechanism is advisory), or run a manual
          fresh-session pass — **never** a primary-context self-pass presented as independent.

### `[ ]` **3.3 Reconcile both framework copies**

- _Goal:_ the `§ Sub-agent scope` edit is identical in `DEV-RULES.ARC` across both copies and the sync check is
  clean.

## **Phase 4:** Fire-point wiring and post-settle coherence re-read

_Purpose:_ Wire the **uniform** adversarial-review fire-point + `Class`-scaled recommendation posture at all four
boundaries, retire the `generate-tasks`→skill layering inversion, and wire the post-settle coherence re-read at
the three planning-stage finalize points.

_Design decisions:_ Uniform wiring; only the recommendation posture scales with `Class` — `Light` none / `Heavy`
spec + generate-tasks / `Novel` all four (strongest framing). Each callsite is an inline workflow block plus an
`arc.methods` frontmatter declaration — **not** a `` · `#name` `` extension-fire-point marker (that marker is
extension-only and hook-validated). Every launch stays per-invocation declinable. Each fire-point's `artifacts`
includes authoring that boundary's non-exhaustive key-file pointer list (OQ2) — a wiring-time deliverable, not
just the artifact chain. Detail:
`spec-adversarial-review.md` § D5.

### `[ ]` **4.1 Wire the draft-readiness fire-point in `draft-design`**

- _Goal:_ `draft-design` offers the adversarial pass at the formalization-readiness / capture gate, running the
  existing readiness bar (`assess-draft-readiness` divergence test) + `design-audit` (efficacy + fit)
  adversarially, with the `Class`-scaled posture.

    - `[ ]` **4.1.a Declare methods + add the fire-point block**
        - Add `adversarial-review` (and `design-audit`) to the `arc.methods` frontmatter; add the inline fire-point
          block at the readiness / capture gate — rubric = readiness divergence test + `design-audit`; artifacts =
          the draft; per-invocation declinable.

    - `[ ]` **4.1.b Recommendation posture**
        - Not proactively recommended at draft readiness for `Light` / `Heavy`; recommended at `Novel` (strongest
          framing).

### `[ ]` **4.2 Wire the create-spec finalization fire-point**

- _Goal:_ `create-spec` offers the adversarial pass at Finalize, running `design-audit` + `spec-review` (design
  _and_ artifact) adversarially, alongside the existing non-adversarial self-review — supplying `spec-review`'s
  second caller.

    - `[ ]` **4.2.a Declare methods + add the fire-point block**
        - Add `adversarial-review` (+ `design-audit`) to `arc.methods` (`spec-review` already declared); add the
          fire-point block at Finalize (around Gate 1) — rubric = `design-audit` + `spec-review`; artifacts =
          the draft and spec. Keep it distinct from the `pre-spec-finalization-review` team extension already there.

    - `[ ]` **4.2.b Recommendation posture**
        - Recommended at `Heavy` + `Novel` (the prototype evidence sits here); not proactively at `Light`.

### `[ ]` **4.3 Wire the generate-tasks finalization fire-point + retire the layering inversion**

- _Goal:_ `generate-tasks` offers the adversarial pass at Finalize (`task-audit` run adversarially) _and_ its
  grounding-audit procedure calls the `task-audit` method directly rather than the `arc-task-audit` skill —
  retiring the workflow→skill inversion (depends on Task 2.3).

    - `[ ]` **4.3.a Declare the method + add the fire-point block**
        - Add `adversarial-review` to `arc.methods`; fire-point block at Finalize — rubric = `task-audit`
          (grounding + executability); artifacts = spec + task list; posture recommended at `Heavy` + `Novel`. Note
          the leaf-magnitude detector joins the rubric when `planning-iteration-mechanics` ships it (not now).

    - `[ ]` **4.3.b Repoint the grounding-audit procedure to the method**
        - Change the grounding-audit invocation from the `arc-task-audit` skill to the `task-audit` method
          (workflows call methods; skills are doors) — the inversion retirement. Re-validate that the workflow's
          downstream prose still resolves against the method's output — the Finalize checklist and grounding-audit
          steps key off the native `Fix before starting` / `Carry as context` disposition (preserved per Task
          2.3.a).

### `[ ]` **4.4 Wire the `verify-work-unit` adversarial verify**

- _Goal:_ `verify-work-unit` offers an adversarial verification pass that independently re-validates the spec's
  success criteria against the diff, **augmenting** (not replacing) the implementer's self-verify.

- _Note:_ frame the mandate explicitly for the subagent — it attacks the **claim of spec-conformance**:
  independently walk the success criteria and surface any the self-verify marked met that the diff does not
  actually deliver (plus gaps / wrongly-superseded). The diff is **evidence for conformance**, not the target of
  open-ended critique. This is `verify` (confirm delivery against the expected result), **not** `review` (code
  quality / edge cases) — that runs separately in the pre-PR and PR review lanes (§ D10, NG7).

    - `[ ]` **4.4.a Declare the method + add the fire-point block**
        - Add an `arc.methods` block (the workflow has none today) declaring `adversarial-review`; add the
          fire-point block — the boundary's own success-criteria validation run adversarially (stage-owned, mints
          no rubric); artifacts = spec + tasks + the diff under verification, with the implementer's markings
          withheld and the primary comparing the independent result to the self-verify.

    - `[ ]` **4.4.b Recommendation posture**
        - Recommended at `Novel`; not proactively at `Light` / `Heavy`.

### `[ ]` **4.5 Wire the post-settle coherence re-read at the three planning-stage finalize points**

- _Goal:_ each planning stage re-fires its own coherence check over the settled artifact as the last step before
  the finalize commit, closing the staleness the mechanism's final-fold opens.

- _Context:_ lightweight, always-on, in-context — it re-fires an existing check and mints nothing; distinct from
  the advisory adversarial pass. Generalizing across amendment sources and unifying it cross-stage is
  `planning-iteration-mechanics`' (routed seam).

    - `[ ]` **4.5.a `draft-design`** — re-fire the readiness/coherence check at the capture gate before the
      capture commit.

    - `[ ]` **4.5.b `create-spec`** — re-fire `spec-review`'s coherence slice over the settled spec as the last
      step before the finalize commit (after Gate 2).

    - `[ ]` **4.5.c `generate-tasks`** — re-fire the final suite-coherence read over the settled task list before
      the finalize commit (planning-stages only; `verify-work-unit` gets no re-read).

### `[ ]` **4.6 Reconcile both framework copies across all wired workflows**

- _Goal:_ all four workflow edits and the coherence re-read are identical across both copies and the sync check is
  clean.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

- _Note:_ dogfood at this WU's own finalize — the `generate-tasks` adversarial `task-audit` pass and the SC9
  post-settle coherence re-read run **by hand** (this WU's own wiring cannot yet prompt them). SC1/SC2 are
  effectiveness signals confirmed on the next `Heavy`+ WU that exercises the wiring — mark them at verification
  with an annotation noting the downstream confirmation, not a same-WU gate.

---

## Success Criteria

- `[ ]` SC1 — Wired, not hand-remembered: on the next `Heavy`+ WU the workflows recommend the pass at each
  `Class`-keyed boundary with no hand-invocation
- `[ ]` SC2 — Effective and honest: a full run surfaces ≥ 1 primary-confirmed defect the default review missed, or
  converges clean within the pass cap, with zero manufactured findings surviving verification
- `[ ]` SC3 — `adversarial-review.md` complete (invariant properties, invocation contract, severity model, exit
  gate, context provisioning, prompt template) in both copies
- `[ ]` SC4 — `§ Sub-agent scope` reads as the delegate-by-function rule with the harness-conditional clause, both
  copies
- `[ ]` SC5 — `draft-design`, `create-spec`, `generate-tasks`, `verify-work-unit` each carry the uniform
  fire-point hook + `Class`-scaled posture, both copies
- `[ ]` SC6 — `design-audit` method + `arc-design-audit` door; `task-audit` method with `arc-task-audit` reduced to
  a door; `generate-tasks` calls the `task-audit` method directly — both copies
- `[ ]` SC9 — Each of the three planning-stage finalize points re-fires the stage's coherence check over the
  settled artifact as the last step before the finalize commit, both copies
- `[ ]` All quality gates pass (markdown lint, code lint, type checking, tests, build)
- `[ ]` Ready for integration

> _SC7 (verb standard → `naming-conventions`) and SC8 (coordination-seam routing) are **planning-closeout**
> criteria: their evidence lives in the planning plane (spec § Cross-cutting + gitignored `USER-INBOX` captures),
> not the impl record, so they are completed and verified at planning close — not tracked here for impl
> verification. The spec's § Cross-cutting carries the routed seams._
