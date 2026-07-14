# Draft: Delivery Intent Integrity

- **Origin:** `review-gate-reconcile-composition` postmortem (2026-07-11).
- **Purpose:** Prevent a sound plan and green component suite from being called delivered while its composed intent
  remains unproved or falls into an under-classified, unowned follow-on.
- **Planning posture:** The failure and priority are proven. The routed mechanism still needs design, but the
  cross-workflow/method surface establishes `Class: Heavy` and warrants a planned `P1` slot now.

---

## Problem / Motivation

`reviewed-lane-review-gate` passed heavy adversarial planning, per-phase implementation review, and dual-agent
verification while both production entry points remained stubs. Its cutover was assumed to be a trivial Errand,
but the missing composition and live proof required a substantial implementation WU plus a separate Heavy cutover
WU. The process proved pieces and criteria without owning the top-level intent proof.

The originating postmortem identified six factors:

1. Plan-space review cannot execute the design.
2. Phase-scoped review normalizes cross-phase seams.
3. Intentional-sounding comments can disguise placeholders.
4. "End-to-end" labels can cover reducer integration while excluding entry points and emission.
5. Unverifiable success criteria can be waved through and become false present-tense documentation.
6. An under-classified follow-on can leave the remaining intent with no real deliverable owner.

The source record and detailed examples live in
`active/notes-review-gate-reconcile-composition.md` §§ Postmortem findings / Guard dispositions.

## Inbound Charter

### Composition-seam test planning

Decide how task generation and testing guidance identify an entry point or composition root and require an
executable test that fails on non-emission, dropped durable handoff, or missing downstream effect. Preserve the
distinction between a universally valuable seam check and a blanket integration-test mandate that adds ceremony
where no composition risk exists.

Candidate homes: `generate-tasks`, `testing-standards`, and the success-criteria authoring guidance. Coordinate with
the folded `verify-work-unit` intent-proof guard rather than restating it.

### Deceptive-placeholder review hazard

Design a reviewer check for placeholder or "deliberately X only" language at composition boundaries: locate the
real composition owner and the executable proof before accepting the comment as a design decision. Determine
whether the reusable home is the adversarial-review rubric, the review-method family, or a more general
implementation-review contract.

### Sanctioned rich follow-up route

Decide whether ARC should explicitly allow a WU to scaffold a sufficiently rich follow-up WU when part of its
original intent is legitimately outside the current completion boundary. Settle the minimum record, the handoff
acceptance point, and when the originating WU must remain incomplete instead.

The design must preserve these distinctions:

- Work required by the current WU's completion criteria is not deferrable by relabeling it.
- A deliberate scope split becomes an independently trackable, classified work unit—not a completion note, thin
  inbox capture, or assumed Errand.
- Post-deploy proof is an owned lifecycle obligation with observable evidence and a defined failure response.
- Ownership stays with the originating delivery owner until an explicit handoff is accepted.

Candidate minimum fields to evaluate: parent WU and original intent, deferral rationale/scope boundary, accountable
owner, required completion or verification evidence, activation trigger/horizon/dependency, release reference,
failure/escalation action, and closure link.

## Industry-Precedent Research Note

One bounded research pass found a consistent pattern, while no source prescribes ARC's exact mechanism:

- The Scrum Guide keeps work that misses the Definition of Done in the Product Backlog; incomplete completion
  criteria do not become an invisible tail. ([Scrum Guide][scrum-guide])
- GitHub issue forms support required structured inputs plus automatic ownership and routing metadata; GitHub's
  issue guidance describes assignees as the signal for who is working on an issue. ([Issue forms][issue-forms],
  [issue assignees][issue-assignees])
- Google's SRE production-readiness model agrees outcomes, analyzes shortcomings, negotiates a prioritized plan,
  and transfers responsibility only after readiness; production ownership is not implicit in a handoff.
  ([Production Readiness Reviews][sre-prr])
- Microsoft's safe-deployment guidance treats post-deploy health checks, bake time, and halt/investigate behavior
  as explicit delivery controls. ([Safe deployment practices][safe-deployments])

**Research synthesis to test during grooming:** a WU may close with deferred intent only when that intent is
outside its completion criteria and promoted to an owned, independently verifiable backlog item with parent
linkage, rationale, evidence, activation trigger, and failure response. This is an inference from the sources, not
a quoted industry standard.

## Scope / Open Questions

- Is this one WU or a cohort spanning task generation/testing, review methods, and follow-up lifecycle mechanics?
- Does the rich follow-up route need a workflow primitive, a verification check only, or both?
- What is the cheapest reliable composition-root signal across code, workflows, and documentation systems?
- Which fields are universally required versus storage/PM-mode-specific?
- How does explicit handoff work when the follow-up cannot start until the originating PR merges?

---

[issue-assignees]: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/assigning-issues-and-pull-requests-to-other-github-users
[issue-forms]: https://docs.github.com/en/enterprise-cloud@latest/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms
[safe-deployments]: https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/safe-deployments
[scrum-guide]: https://scrumguides.org/scrum-guide.html
[sre-prr]: https://sre.google/sre-book/evolving-sre-engagement-model/
