# Draft: planning-lane-relief

- **Origin:** [internal] — decomposed out of `judgment-authority-model` on 2026-07-26, which diagnosed it as one
  of three faces of a single defect and then settled that only this face reaches code. That work unit ships the
  authority model; this one applies it to the planning-lane classifier.
- **Purpose:** Stop the reviewed lane from creating a second disposition moment over content that already had one,
  without pushing a deterministic classification back into agent judgment.

- **State:** rough — the problem is well characterized and one candidate resolution is named, but the gating
  unknown below is unresolved and the shape depends on it.
- **Class:** `Heavy` — an estimate, resolved at promotion into `planned` on 2026-07-26. Derivation fires: the
  forgeability question must be settled before a competent engineer can start, and `adr-029`'s precedent does not
  transfer without working the asymmetry. Scale does not fire — one classifier plus at most one typed input. The
  candidate resolution _composes_ from existing primitives rather than inventing, so it stays `Heavy` rather than
  reaching `Novel`. No design authored yet, so this estimate is revisable in either direction.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Widen planning-artifact paths to the cohort nesting cap**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-08-10).
- _Concern:_ `isPlanningArtifactPath` accepts only one or two backlog directory segments, while legal subcohort
  members use three. Pure planning changes therefore fall onto the reviewed lane; PR #465 reproduced the mismatch.
- _Approach:_ align the path grammar with the recorded nesting cap and cover the local and server-side consumers.

### `[ ]` **Detect CODEOWNERS drift from the planning-lane predicate**

- _Routed from:_ `USER-INBOX § Work Unit` (original cohort target `decompose-core-hardening`), housekeep drain
  (2026-08-10). The target resolves to a cohort rather than a work unit; this classifier-focused WU is the concrete
  authoritative home.
- _Concern:_ the unowned CODEOWNERS block and shipped skeleton restate planning paths independently. Predicate drift
  can classify a change as planning while host ownership still requires review, blocking a lane ARC meant to admit.
- _Approach:_ define parity over representable directory/depth coverage and test the repository plus shipped skeleton.

---

## Problem

`classifyPlanningLane` (`change-facts.ts`) reads path-class only. The sole additional gate is
`isPlainPlanningContentChange`, a mode check hardening against symlink and mode tricks — not a second semantic
axis. There is no increment-count or gate-history signal.

The principled statement of the lane's purpose is **catch what the per-increment invariant structurally cannot
see** — aggregate and cross-increment effects. Where nothing escapes the increment view, the lane has no work.

Two recorded instances, both correct by the current rule and disproportionate by that purpose:

- PR #355 classified `reviewed` by path, but the human disposition moment had already occurred — one increment,
  the developer present at the gate, two live redirections mid-change.
- A five-line provider-config change (`.coderabbit.yaml` `auto_review` gating) classified `reviewed` on path
  alone.

## The gating unknown — forgeable gate history

**Gate history is only evidence if the agent cannot forge it.** An agent writing "human approved" into a record it
also authors proves nothing, and in a chat harness there is no trace of the approval that is not agent-mediated.
**This work unit does not ship without an answer here.**

Recorded precedent to engage, not re-derive: `adr-029` faced the analogous question in the review domain and
**dissolved rather than solved** it — explicitly rejecting an evidence ledger, eligibility oracle, and fix-carry
proof model in favor of disclosure plus exact-head invalidation plus the final human interlock. It does not
transfer automatically: review applicability is agent-judged with a human downstream, whereas the lane classifier
is machine-read with no human present when it fires. **That asymmetry is the thing to settle.**

The same shape recurs elsewhere, so name it once rather than solving it twice: `review-protocol-alignment`
concern 6 rejected two candidate shapes for the `adversarial-review` `withstood` field on precisely this ground —
both asked an untrusted evaluator to attest its own rigor.

## Candidate resolution

The seed proposed composing path-class × increment-count × gate-history. That composition is in doubt on two
forward-compat grounds:

- `procedure-evolution` Principle 1 ("if the CLI can compute it, the CLI computes it") disfavors pushing lane
  relief back into agent judgment.
- The forgeability unknown disfavors feeding an agent-authored gate record into a machine-read classifier.

Candidate satisfying both: **keep path-class deterministic in the CLI, and model relief as a typed,
human-authorized input** — a human-sourced authorization has nothing to forge, and the classifier stays code. To
be settled, not assumed.

## Composition / Coordination

- **`judgment-authority-model` — upstream, no hard edge.** It supplies the authority model this face applies:
  defaults-versus-invariants, the disclosure obligation, and the withheld-authorization-versus-withheld-capability
  distinction. Nothing here blocks on it landing, and it does not block on this.
- **`unit-scoped-review` — the one genuine coupling.** What "gate history" means under a WU-scoped gate is a
  question this work unit should **specify** rather than conform to; that work unit has not begun planning
  iteration and has no settled model to constrain anything with.

## Continuity

- **Resolved:** the lane's purpose stated principle-first; two live instances recorded; the seed's three-axis
  composition put in doubt on two independent forward-compat grounds; one candidate resolution named.
- **Open:** the forgeability question, which gates everything else and decides this work unit's shape and
  `Class`.
- **Next:** settle forgeability against `adr-029`'s dissolve-rather-than-solve precedent, working the
  machine-read-with-no-human-present asymmetry. The candidate resolution above is the thing to confirm or reject.

---
