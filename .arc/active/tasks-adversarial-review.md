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

### `[x]` **1.1 Scaffold the method file and its invariant-properties contract**

- _Goal:_ `adversarial-review.md` exists as a method whose five invariant properties are stated as the contract
  any override must preserve to remain adversarial-review at all.

    - `[x]` **1.1.a Create the file and header blockquote**
        - Added `adversarial-review.md` in both framework copies with frontmatter, the `# Method:` heading, the
          Workflow / When / Contract blockquote, `.override`, and `.default` sections.

    - `[x]` **1.1.b State the five invariant properties as the contract**
        - Stated fresh context, adversarial stance, primary-held judgment, convergence looping, and advisory
          `Class` scaling as the method identity contract, with `DEV-RULES.ARC § Sub-agent scope` as the single
          harness/degrade locus.

- _Outcome:_ The new method now exists byte-identically in the package source and project instance, with the
  invariant contract in place for later Phase 1 sections to extend.

### `[x]` **1.2 Author the invocation contract — named inputs, return type, prompt template, callsite shape**

- _Goal:_ a caller can marshal a pass without re-deriving the interface — the method carries named inputs, a
  structured return type, the prompt template that serializes the subagent-context inputs, and one canonical
  callsite arg-block the four fire-points instantiate. The primary owns the loop (spawns each pass, applies the
  exit gate, verifies findings); a subagent performs exactly one pass.

    - `[x]` **1.2.a Named inputs**
        - Added the input table and explicitly split subagent-context inputs from the primary-side `passBudget`
          loop bound.

    - `[x]` **1.2.b Return type**
        - Added one canonical report schema with per-finding fields and report-level
          `what-held-up-under-attack` / `certification-verdict` fields.

    - `[x]` **1.2.c Prompt template**
        - Added the portable prompt template with fresh-context discipline, no-manufactured-findings language, the
          `{reportSchema}` serialization point, and primary verification stated in the prompt itself.

    - `[x]` **1.2.d Canonical callsite arg-block**
        - Added one fenced callsite shape plus runtime steps for fresh-pass spawn, source verification, disposition,
          and loop control.

- _Outcome:_ The method now carries the interface contract downstream callers need: named inputs, structured
  output, prompt serialization, and a canonical invocation block, without adding frontmatter schema.

### `[x]` **1.3 Author the severity model — fixed core enum + severity-vs-disposition**

- _Goal:_ findings carry a stable, ordered severity vocabulary uniform across fire-points, with severity
  (materiality) held distinct from disposition (what the primary does with a confirmed finding).

    - `[x]` **1.3.a The fixed core enum**
        - Added the ordered `blocker` / `major` / `minor` enum, with fixed levels and ordering, rubric-supplied
          interpretation, and the `minor` / `major` materiality boundary.

    - `[x]` **1.3.b Severity ≠ disposition**
        - Defined disposition as the primary's source-verified action, orthogonal to severity, and named
          carry-forward as a disposition rather than a fourth tier or a flattening to `minor`.

- _Outcome:_ The method now gives callers and review passes one stable severity vocabulary while preserving the
  primary-owned disposition step that the exit gate will consume.

### `[x]` **1.4 Author the exit gate — convergence-by-materiality + `Class`-scaled pass cap**

- _Goal:_ the loop has a bound — convergence by materiality is the primary exit; the `Class`-scaled pass cap is a
  cost-ceiling backstop, not the primary exit.

    - `[x]` **1.4.a Convergence (primary exit)**
        - Added the materiality-based convergence rule, including clean zero-finding convergence,
          minors-only-folded convergence, resolved above-minor findings, and open above-minor blockers.

    - `[x]` **1.4.b `Class`-scaled pass cap (backstop)**
        - Added `Light` 1 / `Heavy` 2 / `Novel` 3 pass budgets, cap-with-live-findings surfacing, uniform
          materiality threshold, full re-run semantics for pass two onward, and the final-fold residual rationale.

- _Outcome:_ The method now has a bounded loop: exit on convergence first, stop at the pass cap only as a cost
  ceiling, and surface unresolved material findings rather than auto-resolving them.

### `[x]` **1.5 Author context provisioning and the orientation set**

- _Goal:_ the subagent receives design-not-implementation context that carries the independence property — a
  prescribed first-read path set (repo read access presupposed), not content serialized into the prompt.

    - `[x]` **1.5.a `artifacts` — the stage-keyed set**
        - Added the per-fire-point artifact matrix, non-exhaustive key-file pointer guidance, and verify-stage
          success-criteria revalidation rule.

    - `[x]` **1.5.b `orientation` — the fixed set**
        - Defined fixed orientation as `AGENT-BRIEF.ARC` + `AGENT-BRIEF.PROJECT`, with goal referents rubric-keyed
          and constitution / strategies pointer-listed on demand.

    - `[x]` **1.5.c `priorFindings` gating**
        - Added pass-one withholding and pass-two-onward prior-findings / applied-fixes context rules.

- _Outcome:_ The method now defines what the fresh pass receives as first-read context, keeping neutral ground
  truth in and the primary's artifact beliefs out of the first pass.

### `[x]` **1.6 Author the `Novel` scope-partitioned fan-out contract hook**

- _Goal:_ the contract admits a `Novel`-only, default-off partitioned pass 1 without a later breaking change —
  the hook, not orchestration.

    - `[x]` **1.6.a Entry test — partition-ability**
        - Added the `Novel`-only, default-off entry test for orthogonal slices with ownable seams, explicitly
          distinguished from deliverable bisectability.

    - `[x]` **1.6.b Seam-ownership rule**
        - Added the downstream blast-radius ownership rule and the dense-seam fallback to a dedicated seam /
          integration slice.

    - `[x]` **1.6.c Merge and convergence**
        - Added the partition contract, report concatenation, and cross-report convergence as an AND over slice
          reports with no open finding above `minor`.

- _Outcome:_ The method now carries a future-compatible `Novel` fan-out hook without adding orchestration or
  making partitioned review automatic.

### `[x]` **1.7 Reconcile both framework copies + registration**

- _Goal:_ `adversarial-review.md` is byte-identical across both copies and the pre-commit sync check is clean.

- _Outcome:_ Kept README registration untouched by design: the method is discoverable by directory/frontmatter, and
  no `## Method Dependencies` row applies to the rubric-running relationship. Verified the two method copies are
  byte-identical; package-sync cleanliness is covered by the staged pre-commit script.

### `[x]` **1.8 Exempt pre-wiring methods from the trigger-coverage audit**

- _Goal:_ CI is green on a branch where a method legitimately lands ahead of its workflow wiring —
  `audit-method-triggers` carries an explicit, temporary `WIRING_PENDING` allowlist (holding `adversarial-review`
  until Phase 4 declares it) and flags any allowlisted method as stale the moment its first declaration lands, so
  an entry cannot outlive the wiring it waits on.

- _Outcome:_ `audit()` takes the allowlist as a defaulted parameter (tests inject their own), and the stale check
  makes removal mechanical: Phase 4's first declaration turns the lingering entry into a CI failure naming it.

### `[ ]` **1.9 Reshape the invocation contract to the liftable-signature form**

- _Goal:_ the method reads as a declaration — signature leads, contract blocks parse, names carry code-variable
  discipline — without minting frontmatter schema (that surface stays downstream; the body contract becomes a
  mechanical lift when its schema arrives).

    - `[ ]` **1.9.a Signature leads**
        - Reorder the invocation-contract section to callsite signature → named inputs → return schema → prompt
          template; add the one-line signature to the header blockquote; fold the duplicated runtime-loop statement
          to one.

    - `[ ]` **1.9.b Valid-YAML contract blocks + naming pass**
        - Make the callsite and report-schema fences valid YAML (prose hints as comments). Rename for
          one-concept-one-name and uniform kebab-case: `passBudget` → `pass-cap`, `artifact-locus` → `locus`,
          `failure-rationale` → `rationale`, `what-held-up-under-attack` → `withstood`, `certification-verdict` →
          `verdict`, `partitionMap` → `partition-map` — the last also joining the named-inputs table, marked
          partitioned-pass-only.

    - `[ ]` **1.9.c Canonical fire-point block**
        - Document the callsite's control-point shape alongside the signature: `[!IMPORTANT]` callout with a
          backticked `adversarial-review` method lead naming the advisory posture (surfacing the offer is
          non-skippable; the user decides, decline proceeds), then the instantiated YAML arg-block. Mandatory
          method calls stay unmarked fence-only; no new alert type is minted.

    - `[ ]` **1.9.d Spec amendment + coordination-seam enrichment**
        - Amend `spec-adversarial-review.md` D2 to the renamed contract fields; enrich the § Cross-cutting
          `composable-workflows` bullet with the exemplar specifics (valid-YAML fences, the
          method-name-as-top-level-key callsite invariant, the stop/fire callout grammar, the blockquote signature
          line); file the matching `USER-INBOX` capture (`WU_Target: composable-workflows`).

    - `[ ]` **1.9.e Reconcile both copies**
        - `adversarial-review.md` byte-identical across `packages/arc-framework/arc/` and `.arc/`; sync check
          clean.

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
just the artifact chain. The first `arc.methods` declaration to land also removes `adversarial-review` from
`audit-method-triggers.ts`'s `WIRING_PENDING` allowlist (Task 1.8) — the audit flags the entry stale once any
declaration exists. Detail: `spec-adversarial-review.md` § D5.

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
