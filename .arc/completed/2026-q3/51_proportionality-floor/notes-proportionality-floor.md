# Notes: proportionality-floor

## Contents

- [Rejected directions](#rejected-directions)
- [Clause gloss](#clause-gloss)
- [Editing constraints](#editing-constraints)

---

## Rejected directions

**Extend `assess-design-proportionality`'s fire-points into execution and review.** The method is a deep
instrument with named inputs and a verdict contract; firing it per-change at execution time is exactly the
disproportionate rigor it exists to catch. An always-on guard has to sit at the floor's altitude, not the
method's.

**A separate skill.** Harness-specific, opt-in, and therefore not universal — the guard has to reach every
session on every harness. The shape's two useful insights were absorbed into the floor in ARC vocabulary
instead: a deletion test (would removing this lose required behavior?) is the necessity trace, and a decision
ladder that prefers the least new machinery is compose-first.

**Review-method or rubric edits.** The standard-review rubric already carries an intent-and-scope dimension,
and the floor governs the agent's own proposals rather than the reviewer's. Adding review surface to police
proportionality would be self-defeating — more mechanism in the name of less.

## Clause gloss

The nine load-bearing clauses, in the fuller phrasing the compressed rule text stands in for. Useful when
checking the shipped section clause by clause.

**Necessity trace.** Every material mechanism traces to a stated goal, real constraint, actual trust boundary,
or observed failure. Plausibility, thoroughness, symmetry, and imagined threat models are not requirements.

**Compose first.** Prefer existing substrate over new mechanism.

**Consequence-scaled rigor.** Concentrate exactness where failure is destructive, authoritative, or
irreversible; advisory and retryable paths get lighter treatment.

**Bounded adequacy rail.** Never simplify away behavior required for correctness, safety, or a stated goal —
where "required" passes the _same_ necessity trace. Symmetric with the trace by construction, so it cannot be
read as license for speculative hardening.

**Scope-boundary binding.** A spec's scope boundary is pre-commitment text; a proposal that crosses it is named
as a scope expansion and routed as a forward amendment — agent proposes, scope owner decides.

**Authority attribution.** Unrequested capability is a scope decision, not engineering taste; it belongs to
whoever set the scope. Absorbs the doctrine removed from both copies of `DEV-RULES.PROJECT`.

**Decision unbundling.** The smallest complete in-scope response to a finding or request is proposed on its
own; any enhancement beyond it is a separately-named, separately-decided proposal. Expansions never ride an
approval for the fix they accompany.

**Completion rail.** Finishing what a change requires — callsites, migrations, tests — is completion, not
expansion. Bounded to mechanical completion; a defect discovered mid-change routes to Discovered Work Routing
and Anti-rider instead.

**Altitude pointer.** At planning boundaries the deep instrument is `assess-design-proportionality`; everywhere
else, apply the trace as one inline judgment.

## Editing constraints

**Package-source-first throughout.** Framework content is authored in `packages/arc-framework/arc/**` and
synced to `.arc/**`. The two `Configurable` files in the touched set are the exception: they take a targeted
edit in each copy, never a copy between them.

**Workflow edits require `strategy-workflow-authoring` loaded first.** Frontmatter, method and extension
declarations, interlock markers, and routing class tags all have conventions that are not safely inferred from
reading a neighbouring workflow.
