# Draft: Configurable Lifecycle Artifacts

- **State:** Draft — provisional / rough shape. Captured from ADR-022's out-of-scope boundary.
- **Created:** 2026-05-27
- **Origin:** [internal] — surfaced during ADR-022 (`adr-022-managed-operational-state-documents.md`)
  authoring; explicitly scoped out of that ADR.
- **Cohort intent:** joins the `configuration` cohort on promotion to `planned/` (kept standalone while
  provisional — cohorts are state-uniform).

---

## Problem / Motivation (rough)

ADR-022 draws the managed-operational-state vs. authored-artifact line by failure domain: violating a managed
document's structure breaks CLI / session plumbing; violating an authored artifact's structure breaks
**workflows**. The second half is a real, unsolved problem this stub captures.

Authored-artifact templates (`spec-*`, `draft-*`, `tasks-*`, PRDs) are not adopter-customizable in practice
even though they exist as templates: ARC's lifecycle workflows (`2_generate-tasks`, `integrate-work-unit`,
etc.) and their formatting strategies are rigidly coupled to the canonical template shapes. Change a task-list
template and `2_generate-tasks` — plus every downstream lifecycle workflow that assumes the canonical shape —
falls out of alignment; the agent surfaces the mismatch mid-workflow (clunky, navigable) rather than the CLI
breaking. The only customization channel today is methods / extensions, which covers some cases but not the
lifecycle-artifact shape itself.

## Direction (unsettled)

Explore a configurable lifecycle-artifact primitive: a generic shape the lifecycle workflows consume, with a
bounded, explicit split between **non-negotiable ARC structure** and **adopter-swappable slots** — so a team
can substitute artifact-shape elements without forking the workflows, and ARC stays coherent. Scoping that
boundary precisely is the hard part, and the reason this is provisional rather than planned.

## Relationship

- **ADR-022** — scoped this out; this stub is the capture so the concern isn't lost.
- Likely interacts with `customization-arch-realign` (the customization-mechanism model) and
  `workflow-template-loads` (template load declarations).
