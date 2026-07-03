# Spec (`detailed` · `RFC`): adversarial-review

- **Origin:** [internal] — founded at a housekeep drain (2026-07-01) on two `USER-INBOX` captures from
  `user-save-status-divergence` (an `§ Errand` "adversarial-spec-review loop" and a `§ Work Unit` "subagentize
  generate-tasks validation"), both of which prototyped the same mechanism ad hoc at different stages with strong
  results.

- **Purpose:** Make **independent (fresh-subagent) adversarial review a core, `Class`-scaled ARC mechanism**,
  wired at the draft-readiness, spec, task-generation, and work-unit-verification boundaries — codifying a
  practice already proven ad hoc so its value stops depending on remembering to run it by hand.

---

## Introduction / Context

A same-session self-review cannot give fresh eyes: the author's motivated "what I meant" leaks into the read. The
existing `spec-review` self-review is deliberately lightweight (coherence + grounding of the written artifact) and
explicitly disclaims validating the *design*. That leaves a real gap — and ad-hoc adversarial passes have already
filled it with measured results.

Two prototype runs, both on `user-save-status-divergence` (Heavy):

- **Spec stage** (`detailed`): a fresh general-purpose subagent given an adversarial prompt, with the primary
  verifying every finding against source, caught an O(k²) cost cliff, a monotonic-reads crack under a load-flipped
  pointer, and a factually-wrong claim about a function's contract — none of which the default self-review
  surfaced.
- **Task-gen stage** (~141k subagent tokens, ~5 min): caught a **cross-phase green break the per-phase grounding
  audits miss by construction** — a Phase-3 field removal that breaks a Phase-4-owned reader, failing type-check
  across the seam — plus two minor grounding fixes, with **zero manufactured findings**.

Neither existing home fits the capability. The `pre-spec-finalization-review` **extension** is a *team-ceremony*
seam (async-PR review, comment window, committee sign-off) — opt-in, layered "on top of" ARC — not an agent
mechanism. `review-method-family` is the *PR/code-review-direction* reshape (self / peer / response). This
capability is **core**, spans planning *and* post-implementation verification, and therefore earns its own home:
a public method that any stage boundary can run its rubric through adversarially.

The design question this RFC settles is a technical one — *what is the right shape for that mechanism*: its
invocation contract as a fresh-subagent function, its severity and exit-gate semantics, how context is
provisioned without leaking author bias, how it scales with `Class`, and the constitutional re-aim of
`DEV-RULES.ARC § Sub-agent scope` that makes read-only review delegation first-class. User-facing impact (agents
and teams get a `Class`-keyed recommended pass at each boundary, nothing hand-remembered) rides § Cross-cutting.

## Goals

- **G1 — Codify the proven mechanism as core.** A single public `adversarial-review` method: a fresh subagent per
  pass, an adversarial stance, the **primary holding judgment** (findings are advisory until verified against
  source), looping to convergence. Advisory and `Class`-scaled — never a hard gate.
- **G2 — Wire it at all four planning/verification boundaries** with **uniform** hooks; scale only the *default
  recommendation posture* with `Class`, never the wiring and never the gate.
- **G3 — Give the mechanism a literal invocation contract.** Because the fresh-subagent boundary means *whatever
  isn't passed doesn't exist for the callee*, the args **are** the interface — named inputs, a structured return
  type, and a prompt template that serializes inputs into the subagent's context.
- **G4 — Re-aim `DEV-RULES.ARC § Sub-agent scope`** from a task-list-membership ban to a **delegate-by-function**
  rule (derivation / execution / judgment), closing the current *silence* around planning-stage delegation and
  making this mechanism the paradigm case rather than an exception.
- **G5 — Consolidate the rubrics the mechanism runs** into DRY public methods: mint `design-audit`, extract
  `task-audit` from its skill door, alongside the already-public `spec-review`.
- **G6 — Stay platform-agnostic** via a harness-conditional posture (use a fresh subagent when the harness
  supports one; a stated degrade path otherwise) and a portable prompt template rather than a per-harness agent
  profile.
- **G7 — Keep cost proportional** to the work that warrants it, via the `Class`-keyed recommendation, the
  per-invocation opt-in, and a bounded exit gate.

## Non-Goals

- **NG1 — No new config axis.** No global "never run these" toggle and no durable per-team preference knob; a
  durable preference axis rides `scalable-core` if/when it lands. This WU stays independent of `scalable-core`.
- **NG2 — No dedicated `adversarial-reviewer` agent profile.** A portable prompt template owned by the method,
  handed to a general-purpose subagent; a bespoke profile only if the prompt demonstrably stops scaling.
- **NG3 — Does not replace the self-verify at verification.** The adversarial pass *augments* the implementation
  agent's self-verify; it does not stand in for it.
- **NG4 — Does not define the boundary structure it runs against.** Readiness *criteria* and content *lenses* stay
  owned by their homes (`planning-iteration-mechanics`; the stages); rubric *content* stays with the rubric
  methods. This mechanism attacks whatever rubrics a boundary already owns.
- **NG5 — Does not own the PR/merge-decomposition model.** The deliverable/PR boundary and its bisectability test
  are `pr-decomposition`'s; see the coordination seam in § Cross-cutting.
- **NG6 — No mass rename.** The semantic-hygiene verb standard (§ D9) is *codified and contributed* to
  `naming-conventions`; actual renames that fail the standard route there, not here.

- **NG7 — The `verify-work-unit` fire-point is spec-conformance verification, not code review.** The adversarial
  verify confirms the delivery against the spec's success criteria (a `verify` per § D10 — *confirm against an
  expected result*); it does **not** perform code-quality, edge-case, or maintainability review (a `review`). Code
  review runs separately — the `pre-pr-review` extension and PR-triggered review — so the two lanes stay
  independent. Some overlap is unavoidable (a conformance gap can also be a defect), but the **reference point** —
  the success criteria, not code craft — keeps the mandate distinct. Load-bearing now that the pass is
  subagent-run: without the fence, a fresh subagent's adversarial stance drifts into generic bug-hunting.

## Proposed Design

The enumerable substrate the task list is built from and validated against. Ten design elements (D1–D10) plus the
two-copy sync obligation (§ Cross-cutting). D1–D7 define the mechanism; D8 the constitutional edit; D9–D10 the
rubric and naming consolidations the mechanism depends on.

### D1 — The `adversarial-review` public method (the mechanism)

A **public method** at `system/methods/adversarial-review.md` — a *contracted procedure* with multiple callers
(the four fire-points). Its invariant properties below are the **contract**: the invariant an override must
preserve to remain adversarial-review at all — drop them (a non-fresh reviewer, findings applied without primary
verification) and the independence that is the mechanism's whole value is gone. This spec **states** that
contract; under today's advisory-contract model it cannot yet **enforce** it (the methods README marks contracts
advisory — § Cross-cutting), and whether the core disciplines become a `fixed` override-policy is CW's /
`surface-architecture`'s call, not this WU's. It is *the mechanism*, not a rubric: it runs a *supplied* rubric
adversarially. Invariant properties, independent of fire-point:

- **Fresh subagent per pass** — no shared context with the primary; independence is the whole value.
- **Adversarial stance** — "try to break this artifact; do not manufacture findings — say plainly and
  specifically if you cannot."
- **Primary holds judgment** — every returned finding is **PLAUSIBLE until the primary verifies it against
  source**; findings are never blind-applied. (In prototyping this caught the reviewer's *own* overreach.)
- **Loop to convergence** — repeat passes under the exit gate (D4); later passes aim to break the *prior fixes*.
- **Advisory and `Class`-scaled** — the launch is a per-invocation accept/decline with a recommendation; it never
  hard-gates a stage.

### D2 — Invocation contract (the method as a function)

The per-stage variation is exactly a parameter list: every fire-point invokes the same mechanism with different
args. The method declares a structured **invocation contract** — prototyped as a structured section of the method
**body** (prose + valid-YAML fenced contract blocks), **not** new frontmatter keys (frontmatter schema is
`composable-workflows`' surface to evolve; the body encoding is designed as a mechanical lift into that schema
when it arrives). The signature leads the section — a canonical callsite block whose single top-level YAML key is
the method name (the shape that identifies a method call wherever it appears), echoed as a one-line
`**Signature:**` entry in the header blockquote. The primary is the **runtime**: it marshals args into the prompt
template, spawns the pass, and verifies returned findings.

**Named inputs** (Kind: per-stage, fixed, `Class`-scaled, pass ≥ 2, or partitioned-only):

| Input            | Kind             | Contents                                                                                        |
|------------------|------------------|-------------------------------------------------------------------------------------------------|
| `rubric`         | per-stage        | The rubric(s) to run adversarially, carrying their own referents (see D5, D6).                  |
| `artifacts`      | per-stage        | The stage-keyed artifact set — the artifact under audit plus its upstream chain (D6).           |
| `orientation`    | fixed            | `AGENT-BRIEF.ARC` + `AGENT-BRIEF.PROJECT` — artifact-neutral shared ground truth (D6).          |
| `pass-cap`       | `Class`-scaled   | The `Class`-scaled pass cap (D4) — set by `Class`, uniform across fire-points.                  |
| `prior-findings` | pass ≥ 2         | Prior findings + the fixes applied to them. A deliberate **non-input on pass 1** (D6, fork F3). |
| `partition-map`  | partitioned-only | Named slices + ownership boundaries; present only on a D7 partitioned pass.                     |

Of these, `rubric` / `artifacts` / `orientation` / `prior-findings` are **subagent-context inputs** — serialized
into each pass's prompt. `pass-cap` is **not**: it is a **primary-side loop bound** the runtime applies to cap
how many passes it spawns. The primary owns the loop — it spawns each pass, applies the exit gate (D4), and bounds
the run by `pass-cap`; a subagent performs exactly one pass and never sees the loop state.

**Return type** (the output half of the contract; field-tested in the spec-stage prototype). Per finding:

- `title` — one line.
- `severity` — one of the fixed core enum (D3).
- `locus` — the specific passage at issue.
- `evidence` — paths + what was found there. These are what make primary verification cheap: findings arrive
  pre-addressed.
- `rationale` — why it breaks, or what two competent engineers would build differently.

Plus two **report-level** fields:

- `withstood` — the claims checked and cleared. Spares re-verification and gives the reviewer a
  sanctioned "nothing here" — the structural guard behind zero-manufactured-findings.
- `verdict` — a one-line verdict keyed to the fire-point's gate question (see D4 for the
  clean-vs-converged distinction it must express).

**Prompt template** — owned by the method; serializes the **subagent-context inputs** (not `pass-cap`) into the
subagent's context and hard-codes the two disciplines that made the prototypes work: **fresh context per pass** and
**primary-verifies-findings-against-source**. Portable across harnesses (no per-harness profile — NG2, D8).

### D3 — Severity model (fixed core enum, rubric-interpreted)

A **fixed core enum**, ordered, uniform across all four fire-points — this is what keeps the return type (D2)
stable and primary-verification consistent:

- **`blocker`** — a real correctness defect (e.g. the cross-phase green break, the O(k²) cliff). The gate's
  certification cannot read clean with a live `blocker`.
- **`major`** — a substantive design or grounding problem that should resolve; not independently ship-blocking.
- **`minor`** — coherence residue, wording, low-materiality findings (the "weak-signal" tier).

What is **fixed**: the levels themselves and their ordering. What each **rubric supplies**: the *interpretation* —
what a `blocker`/`major`/`minor` looks like for its artifact (a masked design decision at draft-readiness reads
`blocker`; a wrong severity claim at spec reads `major`; etc.). Rubrics map *into* the enum; they never extend it.
The `minor | major` boundary is the **materiality line** that drives the exit gate (D4).

**Severity is not disposition.** The enum measures *materiality* — the reviewer's claim about how bad a finding
is. What to *do* with a confirmed finding — fix it in place, **carry it forward durably** (thread it into the
downstream consumer — a task or `notes-*` for the impl session at the planning boundaries; integration or a
follow-up WU at verify — `task-audit`'s "carry as context" case), or drop it — is
the **primary's disposition**, assigned at verification, orthogonal to severity and available at any level. A
carry-forward finding is therefore neither a fourth severity tier nor a flatten-to-`minor`; it composes as a
disposition. Disposition does not change a finding's *severity* — but a finding the primary has **acted on**
(fixed, dropped, or consciously carried forward) counts as **resolved** for the exit gate; an *open* finding above
`minor` is what blocks convergence (D4).

### D4 — Exit gate (convergence bound)

"Loop until convergence" needs a bound. The primary exit is **convergence by materiality**, not zero-findings;
the pass cap is a **cost-ceiling backstop**, not the primary exit:

- **Convergence (primary exit).** A pass converges when it surfaces **no *open* primary-confirmed finding above
  `minor`** — a finding the primary has fixed, dropped, or consciously carried forward is *resolved*, so a
  legitimately carried-forward `major` does not block every pass to the cap. Zero findings (a strong clean pass) is
  one case; a pass returning only `minor` residue is the soft case — **fold the minors and exit**. The
  `verdict` (D2) distinguishes *clean* (zero) from *converged-with-minors-folded*.
- **`Class`-scaled pass cap (backstop).** `Light` 1 · `Heavy` 2 · `Novel` 3, whichever comes first with
  convergence. The cap is a cost ceiling: because convergence is the real exit, a converging run rarely reaches
  it. Reaching the cap **with live `blocker`/`major` findings** does **not** auto-resolve them — it stops the
  auto-loop and **surfaces the unresolved findings at the stage interlock for the user's call**.
- **Materiality threshold is uniform**, not `Class`-keyed. `Class` already scales via the cap and the
  recommendation posture (D5); a third `Class` dependency on the convergence predicate buys complexity without a
  case.
- **Pass ≥ 2 semantics.** A **full rubric re-run** with `prior-findings` (findings + fixes) appended as context —
  never a narrowed fix-only attack (which could not certify a clean pass). The re-run aims to break the prior
  fixes *within* full coverage; the cap bounds its cost.

Pass-cap numbers are a **starting calibration**, revisable from field evidence (Designed-to-evolve) — not open
design. The `Heavy` = 2 value matches the prototype, which converged in two passes with design stable across both.

**Final-fold residual → post-settle coherence re-read.** The primary's folds of the *last* pass's findings are
not themselves re-attacked (no successor pass runs), and any Gate-feedback amendments land *after* the stage's
pre-iteration coherence check. So this WU wires a **coherence re-read of the settled artifact — the stage's own
coherence check (`spec-review`'s coherence slice at create-spec; the analog at draft-readiness and generate-tasks),
re-fired — as the last step before the finalize commit** at the three planning-stage fire-points (SC9). It is a
lightweight, always-on, in-context step (re-fires an existing check, mints nothing), distinct from the advisory
adversarial pass. Generalizing the discipline across amendment sources and unifying it cross-stage is
`planning-iteration-mechanics`' (seam below).

### D5 — Fire-point wiring and `Class`-scaled recommendation

**Uniform wiring at all four boundaries**; only the *default recommendation posture* scales with `Class` (read
via `classify-work-unit`, shipped). Every launch stays per-invocation declinable (§ Cross-cutting, Config).

**Fire-point offer shape** (settled with D2's signature form): the callsite is a stop-class control point —
surfacing the offer is never skippable; running the pass is the user's call — presented as an `[!IMPORTANT]`
callout with a backticked `adversarial-review` method lead naming the posture, wrapping the instantiated
signature block. No new alert type is minted (identity lives in the lead token and the callsite YAML shape, not
the callout enum); mandatory method invocations elsewhere stay unmarked fence-only.

Per-stage rubric — the **gate anatomy** read adversarially. The three planning boundaries decompose along the
semantic-hygiene verbs (D10): an **assess** (readiness criterion), an **audit** (content vs. its external
referent), a **review** (artifact-internal quality); the `verify-work-unit` boundary runs a **verify** activity
(confirm the diff against the spec's success criteria). The mechanism attacks whichever rubric(s) the boundary owns:

| Fire-point                  | Rubric run adversarially                                                                                                               |
|-----------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| draft readiness             | the existing formalization bar (`assess-draft-readiness` divergence test) + `design-audit` (efficacy + fit)                            |
| create-spec finalization    | `design-audit` + `spec-review` (design *and* artifact)                                                                                 |
| generate-tasks finalization | `task-audit` (grounding + executability); the leaf-magnitude detector joins when `planning-iteration-mechanics` ships it               |
| verify-work-unit            | the boundary's own success-criteria validation, run adversarially — stage-owned (NG4), mints no method; augments the self-verify (NG3) |

**Recommendation posture** ("not proactively recommended" = the agent stays silent, invocation still available on
request — one uniform posture, uniform wiring):

- **`Light`** — not proactively recommended at any boundary.
- **`Heavy`** — recommended at spec finalization + generate-tasks finalization (where the prototype evidence
  sits); not proactively recommended at draft readiness + verify.
- **`Novel`** — recommended at all four boundaries, strongest framing.

This is the "ceremony scales with `Class`, discipline doesn't" posture; it needs nothing from `scalable-core`.

### D6 — Context provisioning and the orientation set

What the subagent is handed is **design, not implementation detail** — that drove the prototype's per-pass cost
and carries the independence property. Per pass:

- **`artifacts` — the stage-keyed set:** the artifact under audit plus its upstream chain — draft readiness → the
  draft; spec finalization → draft + spec; task-gen → spec + task list; verify → spec + tasks + **the diff under
  verification** — plus a **non-exhaustive key-file pointer list** (neutral orientation, low bias-risk: "the key
  files, not necessarily complete"). At verify the pass **independently re-validates** the spec's success criteria
  against the diff; the implementer's own `[x]/[~]/[ ]` markings are **withheld** from the subagent (same
  author's-beliefs-out line as below), and the primary compares the independent result to the self-verify (the NG3
  augment).
- **`orientation` — fixed:** `AGENT-BRIEF.ARC` + `AGENT-BRIEF.PROJECT`, artifact-neutral shared ground truth (the
  surface ARC already maintains *as* agent orientation), identical in role in any repo. Grounding raises precision
  without biasing. The line is **artifact-neutral ground truth in, author's beliefs about the artifact out.**
- **Goal referents** (`PROJECT-PRD` / `TECHNICAL-OVERVIEW`, or a project's equivalents) enter **rubric-keyed** —
  only where the stage's rubric names them (e.g. `design-audit`'s efficacy lens) — never as blanket baseline.
- **Constitution / strategies** stay pointer-listed, read on demand.
- **`prior-findings`** enters at **pass ≥ 2** only. The primary's "likely areas to break" **focus list is withheld
  on pass 1** (fork F3): the motivating evidence cannot isolate its contribution, and the primary's blind spots
  are exactly what it cannot list. Passes ≥ 2 necessarily carry prior findings + fixes, so directed context enters
  there by design.

"Receive" means a prescribed **first-read path set**, not content serialized into the prompt — the mechanism
presupposes repo read access (without it, the D8 degrade path applies).

### D7 — `Novel` scope-partitioned fan-out (a defaulted-off lever)

A lever available **only at `Novel`**, **default off** (the standard build is a single subagent running serial
passes). When a `Novel` surface is wide enough that single-subagent attention would spread thin **and** the
surface admits a clean partition, the primary may **propose** a partitioned pass 1: N subagents, each
**responsible for** a disjoint slice of the design, each with **full context access** but a **scoped mandate**.

- **Entry test — partition-ability.** Slices must be orthogonal with **ownable seams**. This is the
  `assess-cohort-fit` **orthogonality** discriminator applied one altitude down (design surface → review slices).
  If the surface partitions cleanly, scoped fan-out is warranted; if it is entangled (seams everywhere), that
  *is* the signal to stay single-subagent. **This test is explicitly distinct from `pr-decomposition`'s
  deliverable *bisectability* test** — orthogonality (independence, for attention partition) is a different cut
  criterion than green-and-consistent-intermediate (for merge partition). Naming both as "partition" without the
  distinction is the conflation this element guards against (§ Cross-cutting, `pr-decomposition` seam).
- **Seam-ownership rule (load-bearing correctness property).** The slice that **originates a change owns its
  downstream blast radius** (so a Phase-3-originating slice owns its Phase-4 reader — the exact cross-phase-break
  failure mode the mechanism most prizes); where seams are dense, a **dedicated seam/integration slice** owns
  them. Without this rule, partitioning would silently orphan seam defects — weakening the mechanism at its
  strongest point.
- **Merge and convergence.** Because responsibility is **disjoint**, merge is **concatenation** (not
  dedup-of-overlap) and cross-report convergence is a trivial AND: the partitioned pass converges when **no
  slice's report** carries a finding above `minor`. (This is *why* partitioned fan-out is tractable where
  redundant fan-out is not — see fork F9.)
- **Scope of this WU:** design the **contract hook** (per-subagent scoped `rubric`/`artifacts`, a partition map,
  the seam-ownership rule, disjoint merge, cross-report convergence) so it is not a breaking contract change
  later. Do **not** build orchestration beyond the contract, and do **not** default it on. Primary-proposed,
  `Novel`-only, entry-test-gated.

### D8 — Constitutional edit: sharpen `DEV-RULES.ARC § Sub-agent scope`

Replace the current *task-list-membership* ban with a **delegate-by-function** rule. The current text bans only
*task-list* delegation, leaving planning-stage delegation (three of this WU's four fire-points) in *silence*
rather than sanction — so this **closes a silence as much as it relaxes a ban**. What the rule protects is two
properties: the human's formative involvement in *changes* (the co-development loop — a rule for the operator's
seat, not for agents) and **judgment staying with the primary** (the second of which the current text never
states):

- **Derivation** (read-only: search, research, review, finding-generation) — **freely delegable**; outputs are
  advisory until the primary verifies them against source. `adversarial-review` becomes the paradigm case, not an
  exception.
- **Execution** (work that lands in the increment) — **stays with the primary** while per-increment co-development
  is in force; delegable only under an explicit, user-approved scope relaxation. This is the socket
  `unit-scoped-review`'s orchestration mode plugs into; the sharpened rule builds the socket without pre-approving
  the plug.
- **Judgment** (validation against ground truth, break-out detection, gates, commits) — **never delegates**, under
  any mode.

**Harness-conditional clause, stated once here** (single constitutional locus — DRY; callsites reference it, never
restate it): *use a fresh subagent when the harness supports one.* No per-harness agent-profile fleet is
maintained (which also grounds the prompt-over-profile choice, NG2) — a WU-scoped design position that stays
spec-side by deliberate coordination: `execution-delegation-doctrine`'s settled agent-role taxonomy ships exactly
such profiles later, so the constitutional text carries only the clause + degrade path, with parity stated
semantically ("the primary's own capability by default" — EDD's inherit-by-default fallback). **Degrade path**
when subagents are unavailable: skip with a note (the mechanism is advisory), or run a manual fresh-session pass —
**never** a primary-context self-pass presented as independent.

This is a re-aim, **not** a removal: co-development stays ARC's identity, and multi-agent harness trends make the
guard more relevant. No ADR amendment is needed for this half — the sharpened rule is consistent with `ADR-002`'s
non-prohibition posture and changes no session-model position; the argument travels in the rule edit itself.
The `ADR-002` modernization now rides `execution-delegation-doctrine` (its 2026-07-02 grooming;
`unit-scoped-review`'s reckoning shrinks to applying that doctrine at WU scope). Rule wording was coordinated
against EDD's "mechanics may delegate; judgment may not" framing at this edit: the execution socket reads
"explicit, user-approved relaxation" (not "scope relaxation" — EDD's per-leaf delegation moves the execution
locus while gates stay unmoved, and must fit the socket).

### D9 — Rubric consolidation (the rubrics the mechanism runs)

Each rubric the mechanism **consolidates** is a **public method**; skill doors exist only where standalone ad-hoc
invocation earns them. Each gains a **second caller** (its ad-hoc skill *and* this mechanism) — the ≥2-callers
argument that mints and extracts them. The exception is the `verify-work-unit` fire-point, which mints no rubric:
it runs the boundary's **existing success-criteria validation** adversarially (stage-owned per NG4), so only three
rubrics are consolidated here.

- **Mint `design-audit`** (new method `system/methods/design-audit.md` + a thin skill door `arc-design-audit`),
  pulled in from `review-method-family`'s buffer — it is precisely the draft/spec rubric this mechanism runs.
  `design-audit` ≈ `task-audit` **one rung up**: a rubric method + a skill door for ad-hoc standalone re-check; no
  dedicated workflow (callsites are inline workflow blocks). Preserved framings: **read-only, standalone +
  optional**; **efficacy** = does the design solve the goal; **fit** = optimal + forward-compatible, not merely
  non-conflicting; **floored at a finished draft and point-agnostic above** (draft / spec / post-task-gen /
  mid-impl). It is the missing *destination* for `spec-review`'s "this reopens design" pointer — `spec-review`
  verifies the *artifact*; `design-audit` validates the *design*, the thing self-review deliberately disclaims.
- **Decouple `task-audit` from the `arc-task-audit` skill.** `task-audit` becomes the DRY rubric **method**
  (sibling to `design-audit`); `arc-task-audit` stays the thin skill door that also houses the mid-impl-reground
  context layer. This retires a **layering inversion**: today `generate-tasks` (an ARC-internal workflow) invokes
  the *skill* (a harness door); post-decouple the workflow calls the `task-audit` **method** directly — workflows
  call methods, skills are doors — while the door keeps the ad-hoc + mid-impl entries. **Two-axis
  reconciliation:** `task-audit`'s native tiers are *dispositions*, not severities — they
  decompose along D3's two axes: `Fix before starting` ≈ a higher-severity finding with a fix-here disposition;
  `Carry as context` = the carry-forward disposition at whatever severity. Run *through the mechanism*,
  `task-audit` supplies severity via an **authored category→severity interpretation** (D3 — new authoring, since
  the skill carries no severity concept today; see OQ4), and the primary assigns disposition; standalone
  skill-door runs keep the native two-tier as their `generate-tasks` contract. Whether that standalone
  contract should itself adopt the severity × disposition split is a downstream `task-audit`-model question, out
  of scope here.
- **`spec-review`** is already a `system/methods/` member; **this WU supplies its second caller** — the mechanism
  runs its rubric adversarially at spec finalization, alongside `create-spec`'s own (non-adversarial) self-review.
  Under `composable-workflows`' visibility axis that second caller is what *earns* it `public` standing, rather
  than the current model's grandfathered all-methods-public. (Method-hood itself is procedure-with-a-contract —
  independent of caller-count *and* of overridability; see § Cross-cutting.)

All three settle as **public** methods (the visibility axis `composable-workflows` proposes) without committing to
its machinery.

### D10 — Semantic-hygiene verb standard → `naming-conventions`

Minting `design-audit` next to `spec-review` / `task-audit` forces a latent verb standard into the open; **codify
the standard, do not mass-rename** (NG6):

- **`audit`** = grounded validation against an **external referent** (design → goal, tasks → code);
- **`review`** = artifact/diff examination for **internal quality** (no external referent);
- **`assess`** = a readiness/fit gate; **`verify`** = confirm against an expected result; **`check`** = a cheap
  precondition guard.

Under that line `spec-review` is *correctly* named — so the deliverable is the **standard**, contributed to
`naming-conventions`; any renames that fail it route there, not here. This WU *defines* the distinction it needs
and hands the codification off.

## Alternatives & Rationale

- **F1 — Public method vs. team-ceremony extension.** *Chosen: public method.* An extension is opt-in "on top of"
  ARC and models a team ceremony (async review, comment window). This capability is core and agent-run, spanning
  planning *and* verification. A method any boundary can call is the right home; the extension seam
  (`pre-spec-finalization-review`) remains for teams layering their own procedure on top.
- **F2 — Portable prompt template vs. dedicated `adversarial-reviewer` agent profile.** *Chosen: prompt template*
  (NG2). The harness-conditional posture (D8) rules out a per-harness profile fleet; a bespoke profile only if the
  prompt demonstrably stops scaling. The prompt hard-codes fresh-context-per-pass and
  primary-verifies-against-source.
- **F3 — Primary's focus list withheld on pass 1 vs. always passed.** *Chosen: withheld on pass 1* (D6). The
  primary's blind spots are exactly what it cannot list; the motivating evidence cannot isolate the list's
  contribution. Passes ≥ 2 carry prior findings + fixes by design, so directed context enters there anyway.
- **F4 — verify-work-unit: augment vs. replace the self-verify.** *Chosen: augment* (NG3). Independence is
  highest-value where confirmation bias is strongest, but the self-verify carries context the fresh pass
  deliberately lacks — they are complementary.
- **F5 — Sharpen `§ Sub-agent scope` generally vs. a per-method carve-out.** *Chosen: sharpen generally* (D8). A
  carve-out naming one method is bad constitutional hygiene (exception lists grow); the rule's real defect is
  *aim*, not reach. Delegate-by-function re-aims it and makes this mechanism the paradigm case.
- **F6 — Rubrics as methods, no per-stage workflows.** *Chosen: rubrics are public methods; callsites are inline
  workflow blocks* (D9). Generalizes the pattern rubric-consolidation already sets; skill doors exist only where
  ad-hoc standalone invocation earns them. `composable-workflows` may re-house under its public/private model
  later — a forward-compat note, not an open fork.
- **F7 — Severity: fixed core enum vs. rubric-supplied per stage.** *Chosen: fixed enum, rubric interprets* (D3).
  A per-stage vocabulary would vary the return type by fire-point, weakening the "one uniform contract" property
  the invocation contract is built around. What legitimately varies is the *interpretation* of the fixed levels,
  not the levels.
- **F8 — Exit gate: convergence-by-materiality vs. binary clean-or-cap.** *Chosen: convergence-by-materiality,
  cap as backstop* (D4). A binary "any finding forces another pass" wastes a full ~120k-token pass on trivial
  residue. Grading the exit by severity — folding `minor`-only residue and exiting — matches the real signal and
  makes the exact cap numbers non-load-bearing (a converging run rarely reaches them).
- **F9 — `Novel` fan-out: scope-partitioned lever vs. redundant fan-out vs. no fan-out.** *Chosen:
  scope-partitioned, defaulted-off lever* (D7). **Redundant** fan-out (N subagents attacking the whole artifact)
  produces overlapping findings and needs hard merge/cross-report-clean semantics — rejected. **No fan-out at all**
  under-covers a wide `Novel` surface (single-subagent attention spreads thin; serial passes add depth, not
  breadth) — rejected as the sole option. **Scope-partitioned** fan-out covers wide-surface under-coverage with
  *disjoint* responsibility, which makes merge trivial (concatenation) and cross-report convergence a trivial AND
  — dissolving the merge-semantics objection that motivated deferring fan-out. Kept a **defaulted-off lever** (no
  Novel WU has yet exercised the mechanism, so on-by-default would be speculative), with the contract hook built
  now so enabling it later is not a breaking change.
- **F10 — `Class`-uniform wiring vs. `Class`-gated wiring.** *Chosen: uniform wiring, `Class`-scaled
  recommendation* (D5). Gating the *wiring* on `Class` would make invocation unavailable at some boundaries;
  scaling only the *recommendation posture* keeps every boundary invokable on request while directing proactive
  nudges to where evidence warrants them.

## Cross-cutting Considerations

- **Cost.** ~100–140k subagent tokens per pass (measured). The `Class`-keyed recommendation (D5), per-invocation
  opt-in, advisory-invoke, and the exit gate (D4) keep cost proportional to the specs/task-lists that warrant it.
  The economics case: pre-impl passes are cheap against mid-/post-impl invalidation — *measure as many times as
  needed, cut once.*
- **Config / gating.** Opt-in and **advisory even when applicable**: the agent *recommends* per the `Class`-keyed
  posture and the user confirms, or requests a pass outright (the advisory-fork rule — recommend with a one-line
  rationale, user decides). The launch stop is **interlock-shaped** (per-invocation accept/decline). No global
  "never run these" config is minted (NG1). Token budget and ceremony tolerance are **team preferences** that vary
  independently of the work; the per-invocation decline absorbs that variance for now, and a durable preference
  knob is a `scalable-core` config axis, not minted here — **preserving this WU's independence from
  `scalable-core`.**
- **Harness-conditional degrade.** Per D8: skip-with-note or a manual fresh-session pass when subagents are
  unavailable; never a primary-context self-pass dressed as independent.
- **Two-copy package/project sync.** Every surface (the method, `design-audit`, the `task-audit` extraction, the
  four workflow wirings, the `DEV-RULES.ARC` edit, the skill doors) lands in **both** `packages/arc-framework/arc/`
  (authoritative source) and the `.arc/` instance, per the package-project sync discipline. Methodology edits go
  through the package source; configurable-file edits never blind-`cp` between copies.
- **Testing / validation posture.** This is a methodology surface. Validation is by **dogfooding** — the
  mechanism's own passes at this WU's own planning stages (this spec stage is one), and the success signal (§
  Success Criteria) on the next `Heavy`+ WU. Any CLI-touching surface that emerges (none currently planned — the
  invocation contract is method-body prose, not a new `arc` verb) would carry the standard vitest tiers.
- **User-facing impact.** Agents and teams get a `Class`-keyed recommended adversarial pass at each planning and
  verification boundary, wired into the workflows themselves — nothing hand-remembered. The pass is always
  declinable per-invocation; a `Light` WU sees no proactive nudge.
- **Coordination seams** (routed to the named WUs, not owned here):
    - **`planning-iteration-mechanics`** owns the readiness *criteria* and content *lenses* this mechanism runs
      (the `assess-*-readiness` / open-questions discipline, the leaf-magnitude detector). Its entry-gate question
      and this WU's finalization fire-point are **adjacent decisions at the same `generate-tasks` boundary** —
      co-design the boundary treatment, don't decide either side alone. **Coherence-re-read seam:** this WU
      *wires* the post-settle coherence re-read at the three planning-stage finalize fire-points (D4, SC9) — since
      this mechanism's folds are what make the stage's *pre*-iteration check (`spec-review` on "the spec you just
      wrote") stale, it closes the gap it opens. PIM owns **generalizing** the discipline: unifying it cross-stage
      and extending it to other amendment sources (Gate feedback, future checks).
    - **`pr-decomposition`** owns the deliverable/PR (merge) boundary and its **bisectability** test. Two concrete
      seams: (1) its "the audit is the terminal stack entry — merges last, sees the whole" *is* this WU's
      `verify-work-unit` fire-point — whether adversarial verify runs once at the terminal deliverable or
      per-deliverable is **`pr-decomposition`'s call** (this WU only makes `verify`'s `artifacts.diff` the *diff
      under verification*, D6, without presuming which); (2) the **orthogonality (D7) vs. bisectability** distinction
      is a coherency input to `pr-decomposition`'s already-buffered `assess-cohort-fit` pass — the *same seam
      reads oppositely* at the two altitudes (a cross-phase seam says *don't cut here / merge together* for PRs,
      but *cover carefully* for review). Route a `USER-INBOX` → `pr-decomposition` note recording both.
    - **`review-method-family`** keeps its review-direction reshape and becomes a **consumer** of this WU's
      fresh-subagent primitive rather than reinventing it; `arc-design-audit` departs its buffer to here.
    - **`composable-workflows`** consumes this WU's invocation-contract prototype (structured method inputs + the
      uniform callsite arg-block) as the worked example for method-signature codification; the frontmatter-schema
      and cross-file step-anchor conventions stay CW's to mint. The exemplar's liftable specifics (settled at the
      D2 reshape): contract blocks are **valid YAML** fences (prose hints as comments) so a future resolver
      consumes them without migration; the **callsite invariant** — a fenced YAML block whose single top-level key
      is the method name *is* the call expression, greppable pre-tooling; the **control-point grammar** — two
      callout classes only (stop `[!IMPORTANT]` / fire `[!CAUTION]`; an advisory method offer is stop-class with a
      backticked `<name>` method lead token; mandatory calls are unmarked fence-only; identity never encodes in
      the alert type, so the enum stays GFM's renderable five); and the blockquote `**Signature:**` line as a
      candidate house shape for parameterized methods. Whether any of these promote into
      `strategy-workflow-authoring`'s marker inventory is CW's call — this WU uses them without codifying.
    - **`unit-scoped-review`** owns the execution-delegation scope relaxation (the plug for D8's socket) and the
      `ADR-002` amendment question for review-frequency; coordinate final `§ Sub-agent scope` wording against its
      "mechanics may delegate; judgment may not" framing.
    - **`naming-conventions`** receives the D10 semantic-hygiene verb standard.
    - **`surface-architecture`** (a not-yet-minted concern — a `WU_Target: TBD` capture this WU's draft-design
      spawned) and **`composable-workflows`**'s method-space model own the method-hood taxonomy; this WU is a
      **worked example, not a codifier.** Two
      sharpenings route there: method-hood = procedure-with-a-contract, **decoupled from overridability** (the
      shipped all-methods-`overridable` model is the defect CW's `override-policy: overridable | fixed` axis
      corrects); and — the open enrichment — an `overridable` method needs a **load-bearing contract** (the methods
      README marks contracts merely "advisory" today) so a team override cannot silently break ARC, with this
      mechanism's D1 disciplines as the example invariant.

## Success Criteria

- **SC1 — Wired, not hand-remembered.** On the next `Heavy`+ work unit, the wired workflows themselves recommend
  the adversarial pass at each `Class`-keyed boundary (D5) with no hand-invocation.
- **SC2 — Effective and honest.** A full run either surfaces **≥ 1 primary-confirmed defect the default review
  missed** (a pre-impl defect at the three planning boundaries; a verification gap at `verify-work-unit`) or
  **converges clean within the pass cap** (D4), with **zero manufactured findings surviving primary
  verification**.
- **SC3 — Method complete.** `system/methods/adversarial-review.md` exists carrying the invariant properties (D1),
  the structured invocation contract with named inputs + return type (D2), the severity model (D3), the exit gate
  (D4), and the prompt template — in **both** framework copies.
- **SC4 — Constitution re-aimed.** `DEV-RULES.ARC § Sub-agent scope` reads as the delegate-by-function rule
  (derivation / execution / judgment) with the harness-conditional clause stated once (D8), in both copies.
- **SC5 — Four boundaries wired.** `draft-design`, `create-spec`, `generate-tasks`, and `verify-work-unit` each
  carry the uniform fire-point hook with the `Class`-scaled recommendation posture (D5), in both copies.
- **SC6 — Rubrics consolidated.** `design-audit` exists as a public method + `arc-design-audit` skill door;
  `task-audit` exists as a public method with `arc-task-audit` reduced to a skill door calling it; `generate-tasks`
  calls the `task-audit` method directly (layering inversion retired) — all in both copies (D9). The
  `verify-work-unit` fire-point mints no rubric (it runs the boundary's existing validation adversarially, NG4),
  so three consolidated rubrics is complete coverage, not a missing fourth.
- **SC7 — Standard contributed, not mass-renamed.** The semantic-hygiene verb standard (D10) is codified and
  routed to `naming-conventions`; no rename sweep is performed in this WU.
- **SC8 — Seams routed.** The `pr-decomposition`, `planning-iteration-mechanics`, `review-method-family`,
  `composable-workflows`, `unit-scoped-review`, `naming-conventions`, and `surface-architecture` coordination
  notes are routed to their homes (§ Cross-cutting).
- **SC9 — Post-settle coherence re-read wired.** Each of the three planning-stage finalize fire-points
  (draft-readiness, create-spec, generate-tasks) re-fires the stage's own coherence check over the settled
  artifact as the last step before the finalize commit (D4) — in both copies.

## Open Questions

Design is settled; the items below are non-blocking implementation-detail or empirical calibration — none is a
resolve-before-starting blocker.

- **OQ1 — Prompt-template wording (D2).** The exact phrasing of the adversarial prompt is an authoring detail
  resolved when the method is written, against the two hard-coded disciplines.
- **OQ2 — Per-stage key-file pointer lists (D6).** The specific non-exhaustive pointer set per fire-point is a
  wiring-time detail, resolved as each workflow is wired.
- **OQ3 — Pass-cap calibration (D4).** `Light 1 / Heavy 2 / Novel 3` is a starting calibration revisable from the
  first real `Novel` run and subsequent field evidence — a Designed-to-evolve knob, not open design.
- **OQ4 — Per-rubric category→severity interpretation (D3).** Each rubric maps its findings into
  `blocker/major/minor`, and the exit gate (D4) depends on it; `task-audit` and `spec-review` carry no severity
  concept today, so this interpretation is **new authoring** added when each rubric method is written or extracted.
  Authoring-time, not open design — sibling to OQ1/OQ2.
