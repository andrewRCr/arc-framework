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

## Required Reading Before Drafting

The completion doc must be accurate because it's used for PRs. Before writing:

1. **Task list overview** (first ~100 lines) — Scope, context, what was planned
2. **Final phase(s)** of task list — Actual completion state, follow-up work status
3. **CLEANUP-PROGRESS data** (for large files) — Metrics collected during cleanup
4. **Git log** for final commit hash — `git log -1 --oneline`

---

## Standard Template

```markdown
# Completion: {Work Name}

**Completed**: YYYY-MM-DD
**Branch**: {branch-name}
**Category**: {Feature | Technical | Incidental}
**Context**: {One-liner: "Discovered during X" or "Part of roadmap initiative Y"}

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

### Standard Template Verification Checklist

Before considering the completion doc done, verify EVERY claim:

- [ ] **Completed date**: Verified (matches task list header)
- [ ] **Phase count**: Matches actual phases in task file — `grep -c "^###.*Phase" tasks-*.md`
- [ ] **Quantitative claims**: Each number verified in task file
      - Where does "7 themes" come from? -> Phase X, line Y
      - Where does "50+ components" come from? -> Phase X, line Y
- [ ] **Follow-up work**: Reflects FINAL phase state
      - Check: Did any "deferred" items get completed in later phases?
      - Only list what's ACTUALLY still deferred at task end
- [ ] **No stale references**: No mentions of deleted notes file (if deleted), etc.
- [ ] **All major phases represented**: Check CLEANUP-PROGRESS data includes all phases

**Evidence format:** For each claim, note where verified. This catches stale data from early phases.

---

## Lightweight Template

For single-phase incidental work with a small number of tasks. Omits sections that add little value
at this scale (Key Deliverables, Implementation Highlights, Related Documentation). The task list
itself serves as the detailed record.

```markdown
# Completion: {Work Name}

**Completed**: YYYY-MM-DD
**Branch**: {branch-name}
**Category**: Incidental
**Context**: {One-liner: "Discovered during X"}

## Summary

{2-3 sentences: What was accomplished and why it matters}

## Verification

- **Quality gates**: {Tier 3 status — "all passed" or details}
- **Success criteria**: {N/A — no PRD success criteria}

## Follow-Up Work

{Any deferred items, or "None"}
```

No verification checklist — verify the summary against the task list by inspection.

---

[integrate-work-unit]: ../../system/workflows/arc/supplemental/integrate-work-unit.md
