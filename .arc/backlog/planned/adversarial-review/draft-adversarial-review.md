# Draft: adversarial-review

- **Origin:** [internal] — founded at housekeep drain (2026-07-01) on two `USER-INBOX` captures from
  `user-save-status-divergence` (2026-06-30): `§ Errand` "adversarial-spec-review loop" and `§ Work Unit`
  "subagentize generate-tasks validation". Both prototyped the same mechanism ad hoc, at different stages, with
  strong results.
- **Purpose:** Make **independent (fresh-subagent) adversarial review a core, `Class`-scaled ARC mechanism**,
  applied at the spec, task-generation, and work-unit-verification boundaries — codifying a practice already
  proven ad hoc, so its value stops depending on remembering to run it by hand.

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
| draft readiness | `design-audit` (efficacy + fit) |
| create-spec finalization | `design-audit` + `spec-review` (design *and* artifact) |
| generate-tasks finalization | `task-audit` (grounding + executability + leaf-magnitude) |
| verify-work-unit | verify rubric vs spec + tasks |

### Scaling (free from `Class`; not gated on `scalable-core`)

Gate by `Class` / derivation weight via `classify-work-unit` (shipped): `Light` skip or one quick pass; `Heavy`
full pass at spec + tasks; `Novel` mandatory, plausibly multiple independent subagents. This is the
principle-anchored-core *"ceremony scales with `Class`, discipline doesn't"* posture, but needs nothing from
`scalable-core` (config reform) — so this WU is independent of it.

### Constitutional carve-out (load-bearing)

DEV-RULES.ARC § Sub-agent scope keeps task-list work in the primary's context. This method needs an explicit
carve-out: delegating **read-only finding-derivation that feeds a human-run confirm gate** does *not* violate it
— judgment and any resulting **fixes stay with the primary**, so the co-development loop and mandatory review
stop are preserved. Coordinate the wording with `unit-scoped-review`, which anticipates the same carve-out for
its orchestration mode.

## Rubric consolidation (pulled into this WU)

- **Pull in `arc-design-audit`** (design efficacy + fit validation) from `review-method-family`'s buffer — it is
  precisely the draft/spec rubric this mechanism runs. `design-audit` ≈ `arc-task-audit` **one rung up**: a
  rubric method + a skill door (ad-hoc standalone re-check) + a thin workflow. (`spec-review` verifies the
  *artifact*; `design-audit` validates the *design* — the thing self-review deliberately disclaims.)
- **Decouple `task-audit` from `arc-task-audit`:** `task-audit` becomes the DRY rubric method (sibling to
  `design-audit`); `arc-task-audit` stays the thin skill door that also houses the mid-impl-reground context
  layer.
- **Why these become public methods:** each rubric now has ≥2 callers — its ad-hoc skill *and* this mechanism —
  which is exactly what promotes `spec-review` / `design-audit` / `task-audit` from single-caller (inline /
  private) to legitimate `system/methods/` members. Forward-compatible with `composable-workflows`' public /
  private-method model without committing to its machinery.

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

## Open design forks (settle at planning)

- **Reusable prompt/template vs dedicated agent profile** — a prompt the mechanism hands a general-purpose
  subagent (lighter, immediately DRY), or an `adversarial-reviewer` subagent type with a codified system prompt
  (à la `external-research-analyst`; more tunable, heavier). Lean: start with the prompt, graduate if it earns
  it. Either way, hard-code the two disciplines that made it work: **fresh context per pass** (later passes aim
  at breaking the prior fixes) and **primary-verifies-findings-against-code**.
- **verify-work-unit** — does the adversarial subagent pass *replace* or *augment* the impl agent's self-verify?
  (Lean: augment; independence is highest-value where confirmation bias is strongest.)
- **Method / skill / workflow factoring** per stage, pending the `composable-workflows` public/private model.

## Config / gating & cost

Opt-in and **advisory even when applicable** — the agent *recommends* invoking (or not) at the `Class` floor and
the user confirms, or requests it outright (advisory-fork rule). Cost was ~100–140k subagent tokens per pass; the
`Class` floor + opt-in + advisory-invoke keep cost proportional to the specs/task-lists that warrant it.

## Scope Estimate

Medium — multi-surface: the `adversarial-review` method, the DEV-RULES § Sub-agent-scope carve-out, three
workflow wirings (`create-spec`, `generate-tasks`, `verify-work-unit`), the `design-audit` pull-in, and the
`task-audit` decouple; across both the package source and the `.arc/` copy. `Class` resolves at draft-design
entry — likely `Heavy` given the constitutional edit + multi-workflow surface.
