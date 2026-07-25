# Draft: judgment-authority-model

- **Origin:** [internal] — `USER-INBOX § Work Unit`, "Recognize judgment already exercised instead of
  re-litigating it", captured during errand `gate-tier-right-sizing` (PR #355) and the review-architecture
  discussion following it.
- **Purpose:** Give ARC a model for when its own procedure yields to judgment that has demonstrably already been
  exercised — so codification stops metastasizing into the half of the work `PROJECT-PRD` § Operational friction
  down, judgment friction up explicitly reserves for human and agent judgment.

- **State:** rough — **seeded, not groomed.** The framing below is captured; the design work has not started.
  Resume with `arc-session --plan judgment-authority-model`.
- **Class:** `Novel` (derivation fires at the invent threshold — see below).

---

## Why this is seeded rather than drafted

Minted alongside `review-protocol-alignment` in the 2026-07-25 grooming session, which drafted that WU while it
had rich context on it. This one was deliberately **not** drafted in the same sitting: its `high` path opens with a
free-form orient-then-research sub-phase, and the tail of a long execution-heavy session is the wrong context for
it. Nothing here is a design decision — it is the framing, so the next session starts from the problem rather than
re-deriving it from the inbox.

## Problem / Motivation

One defect with three faces: **ARC treats its own procedure as authoritative over evidence that judgment has
already been applied.** `PROJECT-PRD` states the principle bidirectionally — codify the deterministic, _preserve
friction where judgment is required_ — and this is that principle violated in one direction.

### Face (a) — lane classification is single-axis

`classifyPlanningLane` (`change-facts.ts:370`) reads paths only: planning artifacts → auto, everything else →
reviewed. PR #355 classified `reviewed` correctly by path, but the human disposition moment had already
occurred — one increment, the developer present at the gate, two live redirections mid-change. Review's job is to
create a disposition moment; creating a second one over content that already had one is ceremony.

Proposed composition: path-class × increment-count × gate-history. The principled statement of the lane's purpose
is **catch what the per-increment invariant structurally cannot see** — aggregate and cross-increment effects.
Where nothing escapes the increment view, the lane has no work.

**Live instance from the minting session, worth keeping:** a five-line provider-config change (`.coderabbit.yaml`
`auto_review` gating) classified `reviewed` on path alone. Correct by the current rule, disproportionate by any
reading of the lane's purpose.

### Face (b) — rules do not distinguish invariant from default

Symptom: an independent review returned findings containing a one-character typo, and the primary concluded "per
ARC this is invalidated, we must re-review." Absurd, and the agent knew it — the flaw was ARC's, for not letting
safe agent judgment win.

Proposed discriminator: does the rule exist because the agent might be **wrong** (ignorance-guarding → _default_;
yields when the agent demonstrably does know, because the rule's purpose is already served) or because the agent
might be **biased** (bias-guarding → _invariant_; never yields, because the agent's certainty is the thing being
checked)? Judgment can fix wrongness; it cannot fix bias.

### Face (c) — no runtime override, and rules do not declare whose they are

`DEV-RULES.ARC` contains `override` twice, both config-time (`[configurable]` project settings, method
`.override`). Nothing says an operator's explicit in-the-moment direction governs. Config-time override is the
wrong instrument for "this instance is obviously fine" — nobody should permanently reconfigure a project because
one typo was immaterial.

Proposed: every overridable rule declares an override authority — `owner` (the WU/path owner) / `maintainer` /
`policy` (nobody at runtime). A solo developer owns everything, so it collapses to maximal latitude **with no
special case**, while a team gets real enforcement from the same mechanism and a path owner gets exactly the
latitude a solo developer has. Substrate exists (`arc.role`, per-WU `Owner`); rules simply do not declare
ownership.

**Live instance from the minting session:** the `run-errand` reviewed-lane step reads "leave the PR open for owner
review," which the agent took as removing its authority to _perform_ the merge. The developer's intent was that
**approval** is theirs, not that the button-press is. A procedural line written to locate authority was read as
withholding capability — exactly the failure this face describes, arriving unprompted while grooming it.

## Direction

The anti-escape-hatch mechanism is the load-bearing part: **silent divergence is an escape hatch; stated
divergence is judgment.** An override must name the rule and why its purpose is served anyway, surface where the
developer is already reading (the gate or completion report, never a log), and be reversible in one turn. That does
not skip the human — it informs them and keeps the decision theirs. The agent's obligation becomes **disclosure,
not obstruction**: surface the conflict once, concretely, and on reaffirmation proceed and record it.

## Unknowns and Assumptions

- **The gating unknown — gate history is only evidence if the agent cannot forge it.** An agent writing "human
  approved" into a record it also authors proves nothing, and in a chat harness there is no trace of the approval
  that is not agent-mediated. **Face (a) does not ship without an answer here.** Settle it before designing the
  composition.
- **Same root as a sibling concern.** `review-protocol-alignment` concern 6 rejected two candidate shapes for the
  `adversarial-review` `withstood` field on precisely this ground — both asked an untrusted evaluator to attest its
  own rigor. The forgeable-self-report problem is therefore not unique to gate history; it is a recurring shape
  this WU should name once, generally, rather than solve twice.
- Whether the three faces are one deliverable or want decomposing is open; the cohort-fit read is deliberately not
  made here, since the design is not yet stable enough for the cuts to be real.

## Composition / Coordination

- **`review-protocol-alignment` — downstream consumer, no hard edge.** Four of its judgment-layer concerns are
  informed by this model: the coarse post-fix review-applicability rule, the missing proposal-time
  `Post-fix review:` field, the two-stop author-response cycle, and the determinism-versus-judgment posture. That
  WU holds them in a later phase deliberately so it is not gated on this `Novel` upstream. No `Depends On` edge is
  recorded in either direction.
- **`unit-scoped-review`** relocates the approval gate to the WU boundary, which changes what "gate history" means
  for face (a). Settle the composition against its model, not today's per-leaf default.
- **Prior owners are all shipped** and cannot absorb this: `review-gate-right-sizing`, `review-architecture`, and
  `review-surface-binding` (resolved by slug, 2026-07-25). Hence its own stub.
- **ARC is currently stricter than the general agent-harness norm** on face (c), which treats operator
  reaffirmation as decisive. Worth engaging rather than assuming ARC's position is correct by default.

## Scope Estimate

Large (week+), constitutional — `DEV-RULES.ARC` plus every rule surface, and the lane classifier.

## Continuity

- **Resolved:** nothing. This is a seed.
- **Open:** everything below the framing — most urgently the forgeability unknown, which gates face (a).
- **Next:** open the `high` path's orient-then-research sub-phase. Establish where the compose-vs-invent boundary
  actually falls across the three faces before committing to a shape; the override-authority model is the part most
  likely to require genuine invention, and the forgeability question is the part most likely to constrain it.

---
