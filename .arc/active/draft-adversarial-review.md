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
reviewer's *own* overreach); loop until convergence. Advisory and `Class`-scaled. It runs the rubric each stage
already owns:

| Fire-point | Rubric run adversarially |
| --- | --- |
| draft readiness | the existing formalization bar (`assess-draft-readiness` divergence test) + `design-audit` (efficacy + fit) |
| create-spec finalization | `design-audit` + `spec-review` (design *and* artifact) |
| generate-tasks finalization | `task-audit` (grounding + executability + leaf-magnitude) |
| verify-work-unit | verify rubric vs spec + tasks (augments the impl agent's self-verify) |

### Scaling (free from `Class`; not gated on `scalable-core`)

Gate by `Class` / derivation weight via `classify-work-unit` (shipped): `Light` skip or one quick pass; `Heavy`
full pass at spec + tasks; `Novel` mandatory, plausibly multiple independent subagents. This is the
principle-anchored-core *"ceremony scales with `Class`, discipline doesn't"* posture, but needs nothing from
`scalable-core` (config reform) — so this WU is independent of it. The full `Class` × fire-point matrix settles
at spec, alongside the pass-cap numbers.

### Constitutional edit — sharpen § Sub-agent scope generally (settled 2026-07-01)

A carve-out naming this one method is bad constitutional hygiene — exception lists grow, and the rule's real
defect is aim, not reach. History: DEV-RULES § Sub-agent scope ("task-list work stays in the primary's context")
is *stricter than its own source* — ADR-002 explicitly blesses delegation for triage / exploration and bounded
deterministic work ("not a prohibition … an explicit exception, not the expected norm"); the flat
task-membership ban is the drift, not the doctrine. What the rule actually protects is two properties: the
human's formative involvement in *changes* (the co-development loop — a rule for the human operator's seat, not
for agents), and **judgment staying with the primary** (nothing lands on relayed subagent claims) — the second
of which the current text never states.

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
sharpened rule *restores* ADR-002's actual position); `unit-scoped-review` keeps the ADR-002 amendment question
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

### Exit gate (convergence bound)

"Loop until convergence" needs a bound — the `Class` floor + opt-in gate *entry*, not *exit*. Lean: exit on a
**clean pass** (zero primary-confirmed findings) or a **`Class`-scaled pass cap** (`Light` 1 · `Heavy` ~2 ·
`Novel` ~3), whichever comes first; hitting the cap with live findings surfaces them unresolved at the interlock
for the user's call. Exact numbers settle at spec.

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

## Rubric consolidation (pulled into this WU)

- **Pull in `arc-design-audit`** (design efficacy + fit validation) from `review-method-family`'s buffer — it is
  precisely the draft/spec rubric this mechanism runs. `design-audit` ≈ `arc-task-audit` **one rung up**: a
  rubric method + a skill door (ad-hoc standalone re-check) + a thin workflow. (`spec-review` verifies the
  *artifact*; `design-audit` validates the *design* — the thing self-review deliberately disclaims.)
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
  / open-questions discipline, the leaf-magnitude detector) that this mechanism *runs*. Its open question
  *"should generate-tasks gate proactively at entry?"* is the **same** question as "does an adversarial task-gen
  pass fire there" — co-design, don't decide twice.
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

**Open (settle at planning):**

- **Method / skill / workflow factoring** per stage, pending the `composable-workflows` public/private model.

## Config / gating & cost

Opt-in and **advisory even when applicable** — the agent *recommends* invoking (or not) at the `Class` floor and
the user confirms, or requests it outright (advisory-fork rule). The launch stop is **interlock-shaped**: a
per-invocation accept/decline with a recommendation, so a user who judges a given pass unwarranted opts out *that
time* — no global "never run these" config is minted. Cost was ~100–140k subagent tokens per pass; the `Class`
floor + opt-in + advisory-invoke + the exit gate keep cost proportional to the specs/task-lists that warrant it.

Need signaled by the WU (`Class` / planning depth) is not the only axis: token budget and ceremony tolerance are
**team preferences** that vary independently of the work. The recommendation posture carries the economics case —
pre-impl passes are cheap against mid-/post-impl invalidation (measure as many times as needed, cut once) — while
the per-invocation decline absorbs preference variance for now; a durable preference knob is a config axis that
rides `scalable-core` when it lands, not minted here (preserving this WU's independence from it).

## Success signal

On the next `Heavy`+ work unit, the wired workflows themselves recommend the pass at each boundary (nothing
hand-remembered), and a full run either surfaces ≥1 primary-confirmed pre-impl defect or converges clean within
the pass cap — with zero manufactured findings surviving primary verification.

## Scope Estimate

Medium — multi-surface: the `adversarial-review` method (with its invocation contract + prompt template), the
DEV-RULES § Sub-agent scope edit (per the open disposition fork), four workflow wirings (`draft-design`,
`create-spec`, `generate-tasks`, `verify-work-unit`), the `design-audit` pull-in, and the `task-audit`
decouple; across both the package source and the `.arc/` copy. `Class` resolved `Heavy` at init (constitutional
edit + multi-workflow surface).

## Iteration status

- **Readiness:** maturing (2026-07-01, third pass) — scope settled; success signal stated; all original forks
  settled; the § Sub-agent scope disposition is the one open design decision. `Class` resolved `Heavy` at init.
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
  stricter than ADR-002 (its own source); recommendation: sharpen generally by delegation *function*
  (derivation / execution / judgment) rather than mint a per-method carve-out. CW seam routed to `USER-INBOX` →
  `composable-workflows`; coherence pass over the accreted layers.
- **Resolved, pass 4:** § Sub-agent scope disposition ratified (sharpen generally); socket/plug split note
  routed to `USER-INBOX` → `unit-scoped-review`. Readiness re-assessed: **formalization-ready** — pending the
  dogfood adversarial pass (pass 1, this mechanism run on its own draft) before the stage advances.
- **Open:** per-stage factoring (waits on CW); exact pass-cap numbers + `Class` × fire-point matrix (spec);
  ratify the invocation-contract shape at spec.
- **Next:** run the dogfood pass, primary-verify findings, fold confirmed fixes, then advance the stage pointer
  to create-spec.
