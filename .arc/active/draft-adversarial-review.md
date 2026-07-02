# Draft: adversarial-review

- **Origin:** [internal] — founded at housekeep drain (2026-07-01) on two `USER-INBOX` captures from
  `user-save-status-divergence` (2026-06-30): `§ Errand` "adversarial-spec-review loop" and `§ Work Unit`
  "subagentize generate-tasks validation". Both prototyped the same mechanism ad hoc, at different stages, with
  strong results.
- **Purpose:** Make **independent (fresh-subagent) adversarial review a core, `Class`-scaled ARC mechanism**,
  applied at the draft-readiness, spec, task-generation, and work-unit-verification boundaries — codifying a
  practice already proven ad hoc, so its value stops depending on remembering to run it by hand.

---

## Problem / Motivation

A same-session self-review can't give fresh eyes — the author's motivated "what I meant" leaks in. Ad-hoc
adversarial passes (a fresh general-purpose subagent, adversarial prompt, primary verifying every finding
against source) caught real defects the default self-review missed:

- **Spec stage** (`spec-user-save-status-divergence`, Heavy/`detailed`): an O(k²) cost cliff, a monotonic-reads
  crack under a load-flipped pointer, and a factually-wrong claim about `runUserLoad`'s contract.
- **Task-gen stage** (validated prototype on the same WU's task list, ~141k subagent tokens / ~5 min): a
  **cross-phase green break the per-phase grounding audits miss by construction** — a Phase-3 field removal
  (`noteHistoryDistance`) that breaks a Phase-4-owned reader (`runUserLoad → UserLoadResult`), failing type-check
  across the seam — plus two minor grounding fixes. Zero manufactured findings.

Neither existing home fits. The `pre-spec-finalization-review` **extension** is a *team-ceremony* seam (async-PR
review, comment window, committee sign-off), not an agent mechanism — extensions are opt-in "on top of" ARC.
`review-method-family` is the *PR/code-review-direction* reshape (self / peer / response). This capability is
**core** and spans planning *and* post-impl verification, so it earns its own home.

## Proposed shape

### One mechanism, composing a per-stage rubric

`adversarial-review` is a **public method** (the mechanism), not an extension: fresh subagent per pass;
adversarial stance ("try to break it; don't manufacture findings — say plainly if you can't"); the **primary
holds judgment** — findings are PLAUSIBLE until verified against source, never blind-applied (this caught the
reviewer's *own* overreach); loop until convergence. Advisory and `Class`-scaled. It runs each stage's rubric
(existing, or minted by this WU):

| Fire-point | Rubric run adversarially |
| --- | --- |
| draft readiness | the existing formalization bar (`assess-draft-readiness` divergence test) + `design-audit` (efficacy + fit) |
| create-spec finalization | `design-audit` + `spec-review` (design *and* artifact) |
| generate-tasks finalization | `task-audit` (grounding + executability); leaf-magnitude joins when `planning-iteration-mechanics` ships its detector |
| verify-work-unit | verify rubric vs spec + tasks (augments the impl agent's self-verify) |

### Scaling (free from `Class`; not gated on `scalable-core`)

**Uniform wiring, `Class`-scaled recommendation (settled 2026-07-01).** All four boundaries carry the fire-point
hook; what scales with `Class` (read via `classify-work-unit`, shipped) is the **default recommendation
posture** — never the wiring, and never a hard gate: every launch stays per-invocation declinable (§ Config):

- `Light` — not proactively recommended at any boundary.
- `Heavy` — recommended at spec finalization + generate-tasks finalization (where the prototype evidence sits);
  not proactively recommended at draft readiness + verify.
- `Novel` — recommended at all four boundaries, strongest framing.

"Not proactively recommended" is one posture, uniform: the agent stays silent, and invocation remains available
on request at every boundary (uniform wiring). Multi-subagent fan-out at `Novel` is a spec-time question — the
default build is a single subagent with serial passes (the invocation contract is serial-shaped; fan-out would
need findings-merge semantics and a cross-report clean-pass definition).

This is the principle-anchored-core *"ceremony scales with `Class`, discipline doesn't"* posture, but needs
nothing from `scalable-core` (config reform) — so this WU is independent of it. Pass-cap numbers stay spec-time
calibration.

### Constitutional edit — sharpen § Sub-agent scope generally (settled 2026-07-01)

A carve-out naming this one method is bad constitutional hygiene — exception lists grow, and the rule's real
defect is aim, not reach. Context: the current rule bans only *task-list* delegation, so planning-stage passes
(three of this WU's four fire-points) sit in silence rather than prohibition — the sharpening **closes a silence
as much as it relaxes a ban**. ADR-002 is aligned in spirit — it declines to prohibit delegation ("not a
prohibition … an explicit exception, not the expected norm") and blesses triage / exploration — though its
exception text addresses cloud/async delegation agents and no doc records it as the rule's source, so the
sharpened rule **stands on its own argument**, not on provenance. What the rule actually protects is two
properties: the human's formative involvement in *changes* (the co-development loop — a rule for the human
operator's seat, not for agents), and **judgment staying with the primary** (nothing lands on relayed subagent
claims) — the second of which the current text never states.

Proposed sharpened rule — delegate by **function**, not task-membership:

- **Derivation** (read-only: search, research, review, finding-generation) — freely delegable; outputs are
  advisory until the primary verifies them against source. This mechanism becomes the paradigm case, not an
  exception.
- **Execution** (work that lands in the increment) — stays with the primary while per-increment co-development
  is in force; delegable only under an explicit, user-approved scope relaxation. This is the socket
  `unit-scoped-review`'s orchestration mode plugs into (its v2 owns that relaxation and the ADR-002 / P5
  reckoning); the sharpened rule builds the socket without pre-approving the plug.
- **Judgment** (validation against ground truth, break-out detection, gates, commits) — never delegates, under
  any mode.

Not removal: ADR-002's design center (co-development) is ARC's identity, and multi-agent harness trends make the
guard more relevant, not less — it needs re-aiming, not retiring. No ADR amendment needed for this half (the
sharpened rule is consistent with ADR-002 and changes no session-model position; the argument travels in the
rule edit itself); `unit-scoped-review` keeps the ADR-002 amendment question
for its review-frequency relaxation. The socket/plug split note is routed to `unit-scoped-review`'s buffer via
`USER-INBOX` (2026-07-01); coordinate final rule wording against its "mechanics may delegate; judgment may not"
framing when it activates.

**Harness-conditional, stated once (settled 2026-07-01).** The mechanism assumes a harness that can spawn an
isolated subagent; ARC stays platform-agnostic by conditioning, not abstaining: *use a fresh subagent when the
harness supports one*. The clause lives in the same § Sub-agent scope edit (one constitutional locus — DRY;
callsites reference it, never restate it), and no harness-specific agent-profile fleet is maintained — which also
grounds the prompt-over-profile settlement (§ Design forks). Degrade path when subagents are unavailable: skip
with a note (the mechanism is advisory), or a manually-run fresh-session pass; never a primary-context self-pass
presented as independent.

### Context provisioning (per pass)

What the subagent is handed is design, not implementation detail — it drove the prototype's per-pass cost and it
carries the independence property. Settled shape: the **stage-keyed artifact set** — the artifact under audit
plus its upstream chain (draft readiness → the draft; spec finalization → draft + spec; task-gen → spec + task
list; verify → spec + tasks + the diff) — plus a **non-exhaustive key-file pointer list** (neutral orientation,
low bias-risk: "the key files, not necessarily complete"). The motivating sessions also passed the primary's
"likely areas to try to break" list — value unproven and a plausible bias leak: it channels the fresh eyes
toward what the primary already suspects, and the primary's blind spots are exactly what it can't list. Settled
(2026-07-01): **withheld on pass 1** — the motivating evidence can't isolate the list's contribution; passes ≥2
necessarily carry prior findings + fixes (they aim to break the fixes), so directed context enters there by
design.

**Orientation set (settled 2026-07-01).** Alongside the artifact set, every pass carries a fixed orientation
input: `AGENT-BRIEF.ARC` + `AGENT-BRIEF.PROJECT` — artifact-neutral shared ground truth (the surface ARC already
maintains *as* agent orientation), identical in role in any repo since the reviewer always reviews an ARC-shaped
artifact. Grounding raises precision (fewer noise findings to primary-verify) without biasing; the line is
**artifact-neutral ground truth in, author's beliefs about the artifact out**. Goal referents (PROJECT-PRD /
TECHNICAL-OVERVIEW, or the project's equivalents) enter **rubric-keyed** — where the stage's rubric names them
(design-audit's efficacy lens) — never as blanket baseline. Constitution / strategies stay pointer-listed, read
on demand. "Receive" means a prescribed first-read path set, not content serialized into the prompt — the
mechanism presupposes repo read access (without it, the harness-conditional degrade path already applies).

### Exit gate (convergence bound)

"Loop until convergence" needs a bound — the `Class`-keyed recommendation + per-invocation opt-in gate *entry*,
not *exit*. Lean: exit on a
**clean pass** (zero primary-confirmed findings) or a **`Class`-scaled pass cap** (`Light` 1 · `Heavy` ~2 ·
`Novel` ~3), whichever comes first; hitting the cap with live findings surfaces them unresolved at the interlock
for the user's call. Exact numbers settle at spec.

**Pass-≥2 semantics (settled 2026-07-01):** a **full rubric re-run** with the prior findings + fixes appended as
context — never a narrowed fix-only attack, which could not certify a clean pass. The re-run aims at breaking
the prior fixes *within* full coverage; the cap bounds its cost.

### Draft-stage rubric keys to the existing kickback criteria

draft-design is deliberately the least-structured stage, and the adversarial pass must not impose structure on
it. Settled direction: at the draft-readiness fire-point the subagent attacks the **existing** formalization bar
rather than a freshly-minted rubric — "show this draft is *not* ready": find masked design decisions (the
`assess-draft-readiness` divergence test — where two competent engineers would build materially different
things) and the missing or unfalsifiable success signal — the same criteria the `create-spec → draft-design`
re-entry valve keys on (`needs-design` gaps), plus `design-audit`'s efficacy/fit lens. Criteria ownership stays
with `planning-iteration-mechanics` (seam below); this WU runs them adversarially.

### Invocation contract — the method as a function (direction, 2026-07-01)

The per-stage variation is exactly a parameter list: every fire-point invokes the same mechanism with different
**args** — the rubric(s) to run adversarially, the stage-keyed artifact set, the pass budget, and (pass ≥2) the
prior findings + fixes. ARC method contracts are already informal signatures ("given X, return Y" — e.g.
`assess-draft-readiness` returns `{ ready, gaps }`); this method makes the call *literal*, because the
fresh-subagent boundary forces it: **whatever isn't passed doesn't exist for the callee**, so the args are the
whole interface. Marshalling discipline is load-bearing here, not cosmetic — which is what makes this method the
right prototype for a general shape.

Direction: the method declares a structured **invocation contract** — named inputs (marking which are per-stage
vs fixed), the output shape (findings with severity claims + evidence pointers, PLAUSIBLE until
primary-verified), and the prompt template that serializes the inputs into the subagent's context. Each wired
callsite passes args as one small uniform block; the primary is the *runtime* — it marshals args into the
prompt, spawns the pass, and verifies the returned findings. Prototype the contract as a structured section of
the method **body**, not new frontmatter keys — the frontmatter schema is `composable-workflows`' surface to
evolve (its `arc method resolve` resolver is the natural consumer if inputs later lift into YAML), and the
callsite block stays plain prose/fenced-params for now (the cross-file step-anchor convention is likewise
CW-space; the `` `#name` `` marker is extension-fire-points-only). Contribute the worked prototype to CW as
evidence for method-signature codification.

Named inputs: `rubric` (stage-keyed, carrying its referents), `artifacts` (stage-keyed set), `orientation`
(fixed: the two briefs), `passBudget`, `priorFindings` (pass ≥2 only; the focus-list exclusion is a deliberate
non-input on pass 1).

**Return type (field-tested 2026-07-01, dogfood pass 1).** The output half of the contract. Per finding:
`title`, `severity`, `artifact-locus` (the specific passage at issue), `evidence` (paths + what was found
there), `failure-rationale` (why it breaks / what two engineers would build differently). Plus two report-level
fields: **what-held-up-under-attack** — the claims checked and cleared, sparing re-verification and giving the
reviewer a sanctioned "nothing here" (the structural guard behind zero-manufactured-findings) — and a one-line
**certification verdict** keyed to the fire-point's gate question. Evidence pointers are what make primary
verification cheap: findings arrive pre-addressed. Spec-time detail: whether the severity enum is fixed or
rubric-supplied per stage (lean: fixed core enum, rubric maps into it).

## Rubric consolidation (pulled into this WU)

- **Pull in `arc-design-audit`** (design efficacy + fit validation) from `review-method-family`'s buffer — it is
  precisely the draft/spec rubric this mechanism runs. `design-audit` ≈ `arc-task-audit` **one rung up**: a
  rubric method + a skill door (ad-hoc standalone re-check); no dedicated workflow (per the settled factoring —
  callsites are inline workflow blocks). Preserved framings from the departing RMF entry: read-only, standalone +
  optional; **efficacy** = does the design solve the goal; **fit** = optimal + forward-compat, not merely
  non-conflicting; **floored at a finished draft and point-agnostic above** (draft / spec / post-task-gen /
  mid-impl); it is the missing *destination* for `spec-review`'s "this reopens design" pointer. (`spec-review`
  verifies the *artifact*; `design-audit` validates the *design* — the thing self-review deliberately
  disclaims.)
- **Decouple `task-audit` from `arc-task-audit`:** `task-audit` becomes the DRY rubric method (sibling to
  `design-audit`); `arc-task-audit` stays the thin skill door that also houses the mid-impl-reground context
  layer.
- **Why these live as public methods:** each rubric gains a second caller — its ad-hoc skill *and* this
  mechanism. `spec-review` is *already* a `system/methods/` member (today's shipped model has no private tier —
  every method is public + overridable); the ≥2-callers argument is what *mints* `design-audit` and *extracts*
  `task-audit` there, and it settles all three as `public` under `composable-workflows`' proposed visibility
  axis without committing to its machinery.

## Semantic-hygiene seam → `naming-conventions`

Minting `design-audit` next to `spec-review` / `task-audit` forces a latent standard into the open:

- **`audit`** = grounded validation against an external referent (design→goal, tasks→code);
- **`review`** = artifact/diff examination for internal quality (no external referent);
- (`assess` = readiness/fit gate; `verify` = confirm against expected; `check` = cheap precondition guard).

Under that line `spec-review` is *correctly* named — so the deliverable is **codifying the standard**, not a mass
rename. This WU *defines* the distinction it needs and **contributes it to `naming-conventions`**; any actual
renames that fail the standard route there, not here.

## Coordination seams

- **`planning-iteration-mechanics`** owns the readiness *criteria* and content *lenses* (the `assess-spec-readiness`
  / open-questions discipline, the leaf-magnitude detector) that this mechanism *runs*. Its entry-gate question
  ("should generate-tasks gate proactively at entry?") and this WU's finalization fire-point are **adjacent
  decisions at the same stage boundary**, not one question — co-design the generate-tasks boundary treatment
  (entry, finalization, or both) rather than deciding either side alone. (Correction captured to `USER-INBOX` →
  PIM 2026-07-01; it supersedes the drain-era buffer entry's same-question framing when it lands.)
- **`review-method-family`** keeps its review-direction reshape and becomes a **consumer** of this WU's
  fresh-subagent primitive (rather than reinventing it); `arc-design-audit` departs its buffer to here.
- **`composable-workflows`** consumes this WU's invocation-contract prototype (structured method inputs + the
  uniform callsite arg-block) as the worked example for method-signature codification under its resolver /
  visibility model; the frontmatter-schema and cross-file step-anchor conventions stay CW's to mint.

## Design forks

**Settled (2026-07-01):**

- **Reusable prompt/template over a dedicated agent profile** — the mechanism hands a general-purpose subagent a
  codified prompt template (owned by the method); an `adversarial-reviewer` subagent type (à la
  `external-research-analyst`) only if the prompt demonstrably stops scaling. Portable across harnesses — the
  harness-conditional posture rules out a per-harness profile fleet. The prompt hard-codes the two disciplines
  that made the prototypes work: **fresh context per pass** (later passes aim at breaking the prior fixes) and
  **primary-verifies-findings-against-code**.
- **Primary's focus list withheld on pass 1** — independence: the primary's blind spots are what it can't list,
  and the motivating evidence can't isolate the list's contribution. Passes ≥2 carry prior findings + fixes by
  design, so directed context enters there anyway (see § Context provisioning).
- **verify-work-unit: augment, not replace** — the adversarial pass augments the impl agent's self-verify;
  independence is highest-value where confirmation bias is strongest, and the self-verify carries context the
  fresh pass deliberately lacks.
- **§ Sub-agent scope: sharpen generally** — delegate by function (derivation / execution / judgment), no
  per-method carve-out; see § Constitutional edit. Ratified 2026-07-01.
- **Per-stage factoring: rubrics are methods; no per-stage workflows** — generalize the pattern § Rubric
  consolidation already sets: each rubric is a public method; skill doors exist only where standalone ad-hoc
  invocation earns them (`arc-task-audit` stays, `arc-design-audit` arrives); callsites are inline workflow
  blocks per the invocation contract. `composable-workflows` may re-house under its public/private model later —
  a forward-compat note, not an open fork. Settled 2026-07-01.

**Open:** none — remaining opens are spec-time calibration (pass-cap numbers, severity-enum fixity), tracked in
§ Iteration status.

## Config / gating & cost

Opt-in and **advisory even when applicable** — the agent *recommends* invoking (or not) per the `Class`-keyed
posture (§ Scaling) and the user confirms, or requests it outright (advisory-fork rule). The launch stop is
**interlock-shaped**: a per-invocation accept/decline with a recommendation, so a user who judges a given pass
unwarranted opts out *that time* — no global "never run these" config is minted. Cost was ~100–140k subagent
tokens per pass; the `Class`-keyed recommendation + opt-in + advisory-invoke + the exit gate keep cost
proportional to the specs/task-lists that warrant it.

Need signaled by the WU (`Class` / planning depth) is not the only axis: token budget and ceremony tolerance are
**team preferences** that vary independently of the work. The recommendation posture carries the economics case —
pre-impl passes are cheap against mid-/post-impl invalidation (measure as many times as needed, cut once) — while
the per-invocation decline absorbs preference variance for now; a durable preference knob is a config axis that
rides `scalable-core` when it lands, not minted here (preserving this WU's independence from it).

## Success signal

On the next `Heavy`+ work unit, the wired workflows themselves recommend the pass at each `Class`-keyed boundary
(nothing hand-remembered), and a full run either surfaces ≥1 primary-confirmed pre-impl defect or converges clean
within the pass cap — with zero manufactured findings surviving primary verification.

## Scope Estimate

Medium — multi-surface: the `adversarial-review` method (with its invocation contract + prompt template), the
DEV-RULES § Sub-agent scope edit (sharpen generally, settled), four workflow wirings (`draft-design`,
`create-spec`, `generate-tasks`, `verify-work-unit`), the `design-audit` pull-in, and the `task-audit`
decouple; across both the package source and the `.arc/` copy. `Class` resolved `Heavy` at init (constitutional
edit + multi-workflow surface).

## Iteration status

- **Readiness:** formalization-ready (2026-07-01, sixth pass — dogfood cap reached: two passes, zero
  reopened-design findings; pass-2 coherence residue folded). `Class` resolved `Heavy` at init.
- **Resolved, pass 1 (init):** harness-conditional subagent posture (single constitutional locus + degrade
  path); stage-keyed context provisioning; exit-gate need + clean-pass-or-cap lean; draft-stage rubric keyed to
  the existing kickback criteria (`assess-draft-readiness` bar + re-entry-valve `needs-design` gaps);
  per-invocation launch interlock with the preference-knob deferral to `scalable-core`; corrected the
  `spec-review` already-public claim. Extension fire-point naming (`pre-spec-finalization-review` →
  `pre-spec-finalization`) captured to `USER-INBOX` → `naming-conventions`, not this WU's scope.
- **Resolved, pass 2:** success signal stated; prompt-over-profile and focus-list-withheld forks settled;
  invocation-contract direction recorded (method-as-function prototype, body-level, CW consumes) + the CW
  coordination seam added.
- **Resolved, pass 3:** verify fork settled (augment); § Sub-agent scope analysis recorded — the current rule is
  narrower than ADR-002's non-prohibition posture; recommendation: sharpen generally by delegation *function*
  (derivation / execution / judgment) rather than mint a per-method carve-out. CW seam routed to `USER-INBOX` →
  `composable-workflows`; coherence pass over the accreted layers.
- **Resolved, pass 4:** § Sub-agent scope disposition ratified (sharpen generally); socket/plug split note
  routed to `USER-INBOX` → `unit-scoped-review`. Dogfood pass 1 spawned against the captured draft.
- **Resolved, pass 5 (dogfood pass-1 fold):** all 8 findings primary-confirmed against source (zero
  manufactured; three caught this session's own accretion) and folded — uniform-wiring /
  `Class`-scaled-recommendation matrix (retires "`Novel` mandatory"); per-stage factoring settled by
  generalizing the rubric-consolidation pattern; `task-audit` table cell corrected (leaf-magnitude is PIM's
  detector, joins when shipped); PIM seam reworded to adjacent-decisions co-design (captured to `USER-INBOX` →
  PIM); pass-≥2 = full rubric re-run with prior findings appended; ADR-002 provenance claim softened (the rule stands
  on its own argument); stale accreted layers reconciled. Also folded: the fixed `orientation` input (the two
  briefs; goal referents rubric-keyed) and the field-tested return type into the invocation contract.
- **Resolved, pass 6 (dogfood pass-2 fold):** pass 2 verified all 8 pass-1 fixes as resolving their findings and
  cleared every factual claim; its 6 new findings — all coherence residue, no reopened design — confirmed and
  folded: "+ a thin workflow" contradiction removed and the RMF-preserved framings (efficacy/fit definitions,
  point-agnostic floor, reopens-design destination) imported into § Rubric consolidation; retired "`Class`
  floor" vocabulary swept from § Exit gate + § Config; the not-proactively-recommended posture unified and
  `Novel` fan-out moved to a tracked spec-time question (default: single subagent, serial); PIM routing claim
  corrected (in transit via `USER-INBOX`, supersedes the drain-era entry); pass-3 log's provenance parenthetical
  softened.
- **Open:** spec-time calibration — pass-cap numbers, severity-enum fixity, `Novel` multi-subagent fan-out
  (merge semantics); ratify the invocation-contract shape at spec.
- **Next:** advance the stage pointer to create-spec (dogfood exit gate satisfied at cap: two passes, design
  stable across both, residue folded).
