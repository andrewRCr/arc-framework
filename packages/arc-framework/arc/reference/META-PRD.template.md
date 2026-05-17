<!-- Canonical project-PRD template. Rendered once at `arc init` / `arc join` time (per `classification.ts`) into a
     hand-editable file in your project's `reference/` directory. Shape edits land here in the `.template` file;
     content edits land in the rendered file. No parallel template exists in `reference/templates/` — this is the
     sole canonical surface.

     Structural conventions:
     - **Required sections** (always present): Problem, Scope, Principles. Thin or TBD-marked content is valid; the
       section slot itself is load-bearing.
     - **Optional sections** (delete if not applicable): Mission, Design Tradeoffs, Success Criteria, References.
       Add later if the project grows into needing them.
     - **Update Discipline callout** — ARC-level guidance on when this document changes; not project content. -->

# {{PROJECT_NAME}} Meta Product Requirements Document (META-PRD)

The project-level PRD — the canonical statement of what this project is, the problem it addresses, and what it bounds
itself to do. Referenced at lifecycle ceremonies as the alignment check for proposed work: does this serve the stated
problem? Does it fall within scope? Does it align with project principles?

Work-unit PRDs (one per chunk of work) reference this for context. PROJECT-PRD is the canonical statement of what this
project is; other ARC surfaces handle methodology, domain guidance, and decision records.

> [!IMPORTANT]
> **Update Discipline.** This document updates on two triggers — never on cadence.
>
> - **Organic**: When a PR surfaces ambiguity or conflict against documented Problem, Scope, or Principles, resolve
>   it here as part of that PR. The conflict is the signal.
> - **Event-driven**: Major releases, fundamental scope shifts, or governance changes (new principle, retired
>   principle, scope boundary redrawn). These edits ride a dedicated commit with rationale.
>
> Cadence-driven reviews are not used; they drift the document from real decisions.

## Problem

What problem does this project solve? Frame in user / context terms — describe the situation, who experiences it, and
what makes the status quo insufficient. This is the document's anchor; everything else gets evaluated against it.

[PROBLEM_STATEMENT]

<!-- "TBD — see discovery plan" is a valid placeholder when the problem is genuinely unclear at scaffold time.
     Vacuous defaults ("improve developer productivity") are worse than honest TBDs. -->

## Scope

### In Scope

What domains, capabilities, or responsibilities does this project own?

- [IN_SCOPE_ITEM]
- [IN_SCOPE_ITEM]

### Out of Scope

What are you explicitly NOT doing, even if requested? Articulate the predictable adjacent asks you're saying "no" to.

- [OUT_OF_SCOPE_ITEM]
- [OUT_OF_SCOPE_ITEM]

## Principles

3-5 named principles that guide decisions on this project. Quotable by name as alignment-check referents in PRs, ADRs,
and PRDs. Default format is a bulleted list with bolded names:
`**Name**: one or two sentences on how this principle gets applied.`

Principles are *discovered*, not invented — they emerge from recurring decisions that need consistent anchoring.
Resist filling this in vacuously at scaffold; let real patterns reveal them.

[TBD — principles emerge from recurring decisions during work. Add as patterns surface.]

<!-- Filled-in (compact, default):
       - **[Principle Name]**: [How it gets applied — one or two sentences.]
       - **[Principle Name]**: [How it gets applied.]

     Elaborated (when a principle warrants full rationale, promote to H3):
       ### [Principle Name]
       [Proposition — one short sentence.]

       [Rationale paragraph — what it constrains, why it holds, examples of application.]

     Soft guidance: minimum 1, target 3-5, soft cap 7-10 without thematic grouping. Named identifiers (not numbered)
     to avoid renumbering friction. Evolution is explicit and event-driven (see Update Discipline callout above). -->

## Mission

<!-- Optional. Longer-form purpose at a higher level than Problem. Useful for multi-year, multi-team, or
     stakeholder-heavy projects; often skipped for solo / short-lived ones. Delete this section if not needed. -->

[MISSION_STATEMENT — 1-3 sentences on the project's purpose at the highest level of abstraction.]

## Design Tradeoffs

<!-- Optional. Major design calls and what they cost — deliberate choices that constrain future work. Surface them so
     contributors can interpret Principles in light of what's been ruled out. Delete if no significant architectural
     commitments yet. -->

- **[TRADEOFF_NAME]**: Chose [WHAT_WAS_CHOSEN] over [ALTERNATIVE]. Cost: [WHAT_IT_COSTS].
- **[TRADEOFF_NAME]**: Chose [WHAT_WAS_CHOSEN] over [ALTERNATIVE]. Cost: [WHAT_IT_COSTS].

## Success Criteria

<!-- Optional. How will you know you've succeeded? Measurable outcomes preferred over vague aspirations. Delete if
     success is self-evident from Problem + Scope. -->

- [SUCCESS_CRITERION]
- [SUCCESS_CRITERION]

## References

<!-- Optional. External standards, parent specifications, supplemental in-repo documents, or industry frameworks this
     project conforms to or builds on. Delete if not applicable. -->

[none]

---
