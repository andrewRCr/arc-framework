# Template: Completion Document

Templates and guidance for creating `completion-{name}.md` documents during the
[integrate-work-unit][integrate-work-unit] workflow (Phase 1, Step 3).

**All work gets a completion document** (feature, technical, AND incidental). The completion doc
doubles as your PR description draft — creating it as a persistent document ensures it's searchable
beyond GitHub.

---

## Choosing a Template

**Planned work** (feature, technical) always uses the [standard template](#standard-template).

**Incidental work** scales by complexity:

- **Standard template** — Substantial incidental work: multiple phases, significant scope, or
  complex outcomes worth documenting in detail
- **Lightweight template** — Simple incidental work: typically single-phase with a handful of
  tasks, straightforward outcomes. Summary, Verification, and Follow-Up only.

Use judgment — the deciding factor is whether the work has enough substance to fill the standard
template's sections meaningfully. If Implementation Highlights and Key Deliverables would be
padding, use lightweight. When in doubt, use standard — more context is better than less in
the archive.

---

## Standard Template

```markdown
# Completion: {Work Name}

- **Started**: YYYY-MM-DD
- **Completed**: YYYY-MM-DD
- **Branch**: {branch-name}
- **Category**: {Feature | Technical | Incidental}
- **Pull Request**: {URL — add once PR is created in integrate-work-unit Step 7}
- **Context**: {One-liner: "Discovered during X" or "Part of roadmap initiative Y"}

<!-- Optional (supersession case only):
**Superseded By**: `tasks-{new-approach}.md` (YYYY-MM-DD)
See integrate-work-unit.md Appendix § Handling Partially Superseded Work. -->

## Summary

{2-3 sentences: What was accomplished and why it matters}

## Key Deliverables

{Concrete outputs - components, capabilities, test coverage areas}
{Focus on the important stuff, not exhaustive inventory}
{Avoid volatile metrics (test counts, version numbers) - they become stale}

- {Component or capability}
- {Another deliverable}

## Implementation Highlights

{Notable technical details worth remembering}

- {Major decision or pattern established}
- {Significant challenge overcome}
- {Anything useful for similar future work}

## Verification

{Results from the verification phase — makes quality attestation visible in archive output}

- **Quality gates**: {Tier 3 status — "all passed" or details on failures/waivers}
- **Success criteria**: {For planned work: "X of Y met" with deviation/supersession notes.
  For incidental/technical without PRD: "N/A — no PRD success criteria"}

## Related Documentation

- {For planned work: PRD: `path/to/prd-{name}.md`}
- Tasks: `path/to/tasks-{name}.md`
- Notes: `path/to/notes-{name}.md` (if exists)

## {For planned work only: Incidental Work Completed}

{List any incidental task lists completed during this work}

- `tasks-{name}.md` - {brief description}

## Follow-Up Work

{Any deferred items or future considerations - ONLY items still deferred at task end}
```

---

## Lightweight Template

For single-phase incidental work with a small number of tasks. Omits sections that add little value
at this scale (Key Deliverables, Implementation Highlights, Related Documentation). The task list
itself serves as the detailed record.

```markdown
# Completion: {Work Name}

- **Started**: YYYY-MM-DD
- **Completed**: YYYY-MM-DD
- **Branch**: {branch-name}
- **Category**: Incidental
- **Pull Request**: {URL — add once PR is created}
- **Context**: {One-liner: "Discovered during X"}

## Summary

{2-3 sentences: What was accomplished and why it matters}

## Verification

- **Quality gates**: {Tier 3 status — "all passed" or details}
- **Success criteria**: {N/A — no PRD success criteria}

## Follow-Up Work

{Any deferred items, or "None"}
```

---

[integrate-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
