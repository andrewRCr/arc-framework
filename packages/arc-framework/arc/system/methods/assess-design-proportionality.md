---
name: assess-design-proportionality
description: Assess whether a candidate design's machinery is justified by its chartered problem and real constraints.
override-active: false
---

# Method: assess-design-proportionality

> - **Workflow:** Direct consumers declare this method in `arc.methods`.
> - **When:** A candidate direction introduces a material mechanism, or a planning boundary re-checks a
>   materialized design.
>
> - **Signature:** `assess-design-proportionality(problem, candidate, substrate-referents?) -> { verdict, findings }`
> - **Contract:** Return `proportionate` only when the candidate is the least elaborate credible design that still
>   satisfies every chartered goal and real constraint. Return `revise` with source-grounded corrections for any
>   material mismatch.

## assess-design-proportionality.override

[No override configured]

## assess-design-proportionality.default

Assess the candidate against the problem it is chartered to solve, including concrete constraints, failure
consequences, and trust boundaries. Project or team status is not evidence. Current user scale, security,
compatibility, authority, data-loss, and operational conditions matter only through a concrete requirement or
failure consequence.

**Named inputs:**

| Input                 | Kind     | Contents                                                                                     |
| --------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `problem`             | required | Chartered goals and scope plus real constraints, failure consequences, and trust boundaries. |
| `candidate`           | required | Candidate design plus any stage-available materialized planning evidence.                    |
| `substrate-referents` | optional | Key existing surfaces; otherwise discover them narrowly from the problem and candidate.      |

**Result:**

- **`proportionate`** — `findings` is empty; proceed without adding a proof line or ceremony.
- **`revise`** — every finding identifies a design correction required before proceeding. Each finding records a
  closed `kind`, candidate `locus`, source-grounded `evidence`, and a `credible-alternative`.

Finding `kind` is one of:

- `unsupported-machinery` — no chartered goal, constraint, failure mode, or trust boundary requires it.
- `missed-composition` — existing substrate satisfies the need without the new mechanism's added obligations.
- `disproportionate-rigor` — exactness, persistence, recovery, or ceremony exceeds the authority or consequence
  of the path it protects.
- `speculative-capability` — the mechanism prepays for a hypothetical option or change axis without credible
  evidence that it is required now.
- `adequacy-regression` — a proposed simplification loses behavior required by the problem or real constraints.

Report a finding only when removing or recomposing a mechanism would materially reduce lifecycle cost without
losing required behavior, or when a proposed simplification would lose required behavior. There is no
non-decision-bearing note tier.

Apply these questions as one judgment:

1. **Goal-to-mechanism trace:** Which goal, constraint, failure mode, or trust boundary requires each material
   mechanism?
2. **Minimal credible alternative:** What is the least elaborate candidate that still satisfies the problem and
   real constraints?
3. **Existing-substrate composition:** Which current primitive supplies all or part of the behavior, and what
   concrete mismatch prevents composition when a new primitive remains?
4. **Marginal justification:** What additional requirement or risk reduction buys each increment beyond the
   credible baseline, and is it commensurate with the mechanism's full lifecycle cost?
5. **Consequence-scaled rigor:** Is exactness concentrated where failure is destructive, authoritative,
   irreversible, or expensive while retryable and advisory paths use lighter recovery and ceremony?
6. **Essential-complexity check:** Would removing the mechanism expose complexity intrinsic to the problem, or
   remove states and coordination created by the solution itself?

**Adequacy rail.** The minimal credible alternative is a counterfactual baseline, not an automatic winner. Reject
any simplification that drops behavior required for correctness, safety, trust, compatibility, or a stated goal.
Assess the full lifecycle cost of each material mechanism: concepts, states, schemas, persistence, recovery,
migration, configuration, narration, tests, and future compatibility obligations.
