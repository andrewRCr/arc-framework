# Template: Completion Document

Templates and guidance for creating `completion-{name}.md` documents during the
[integrate-work-unit][integrate-work-unit] workflow (Phase 1, Step 3).

**All work gets a completion document** (feature, technical, AND incidental). The completion doc
doubles as your PR description draft — creating it as a persistent document ensures it's
searchable beyond GitHub.

**Formatting follows [strategy-task-list-formatting][task-list-formatting]:**

- Bold field labels (`**Field**:`) for file-header metadata describing the doc itself (Started,
  Completed, Branch, Category, Pull Request, Context)
- Italic field labels (`_Field:_`) for in-section descriptors (Verification labels, Follow-Up
  topic phrases, deliverable / highlight topic phrases)
- Loose-list rendering when any bullet spans 2+ lines — blank line between every item in that list

---

## Choosing a Template

**Planned work** (feature, technical) always uses the [standard template](#standard-template).

**Incidental work** scales by complexity:

- _Standard template_ — Substantial incidental work: multiple phases, significant scope, or
  complex outcomes worth documenting in detail
- _Lightweight template_ — Simple incidental work: typically single-phase with a handful of
  tasks, straightforward outcomes. Summary, Verification, and Follow-Up only

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
- **Branch**: {branch-name — category prefix already carries the work type}
- **Pull Request**: {URL — add once PR is created in integrate-work-unit Step 7}

- **Context**: {One-liner: "Discovered during X" or "Part of roadmap initiative Y"}

<!-- Optional (supersession case only):
**Superseded By**: `tasks-{new-approach}.md` (YYYY-MM-DD)
See integrate-work-unit.md Appendix § Handling Partially Superseded Work. -->

## Summary

{2-3 sentences: What was accomplished and why it matters}

## Key Deliverables

{Concrete outputs — components, capabilities, established patterns. Focus on the important
stuff, not exhaustive inventory. Avoid volatile metrics (test counts, version numbers); they
go stale.}

- _{Topic phrase}_ — {what landed; one or two short sentences}

- _{Another deliverable}_ — {description}

## Implementation Highlights

{Notable technical details worth remembering — major decisions, significant challenges, anything
useful for similar future work.}

- _{Decision or pattern}_ — {brief explanation}

- _{Another highlight}_ — {brief explanation}

## Verification

{Results from the verification phase — makes quality attestation visible in archive output.}

- _Quality gates:_ {Categories that ran + "all passed" — md lint, ts/sh lint, typecheck,
  unit/integration/E2E suites, build, etc. Avoid file/test counts; pre-merge review routinely
  shifts those numbers, leaving the doc stale at archive time.}

- _Success criteria:_ {For planned work: "X of Y met" with deviation/supersession notes.
  For incidental/technical without PRD: "N/A — no PRD success criteria".}

## Follow-Up Work

{Any deferred items or future considerations — ONLY items still deferred at task end.}
```

### Optional Sections

> **Routed Reference Files** — Add `## Routed Reference Files` only when work artifacts cross
> archive boundaries: research/analysis files routed to `.arc/reference/research/` or
> `.arc/reference/analysis/` per [integrate-work-unit][integrate-work-unit] Step 1c or
> [archive-work-unit][archive-work-unit] Step 2. List only the routed files; siblings inside the
> WU's own archive directory don't need pointers — readers see them in the same listing.
>
> ```markdown
> ## Routed Reference Files
>
> - `.arc/reference/research/{filename}.md` — {brief description}
> ```

<!-- -->

> **Incidental Work Completed (planned work only)** — Add when incidental task lists were folded
> into this work unit:
>
> ```markdown
> ## Incidental Work Completed
>
> - `tasks-{name}.md` — {brief description}
> ```

---

## Lightweight Template

For single-phase incidental work with a small number of tasks. Omits sections that add little value
at this scale (Key Deliverables, Implementation Highlights). The task list itself serves as the
detailed record.

```markdown
# Completion: {Work Name}

- **Started**: YYYY-MM-DD
- **Completed**: YYYY-MM-DD
- **Branch**: {branch-name — `incidental/` prefix carries the work type}
- **Pull Request**: {URL — add once PR is created}

- **Context**: {One-liner: "Discovered during X"}

## Summary

{2-3 sentences: What was accomplished and why it matters}

## Verification

- _Quality gates:_ {Categories that ran + "all passed"}
- _Success criteria:_ {N/A — no PRD success criteria}

## Follow-Up Work

{Any deferred items, or "None"}
```

---

[integrate-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
[task-list-formatting]: ../strategies/arc/strategy-task-list-formatting.md
