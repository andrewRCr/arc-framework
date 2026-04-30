# Roadmap: Order of Operations

Planning and reasoning — the sequencing strategy for remaining work, what gets built next
and why. This is a working document, subject to change as you learn. For project state
and record (achievements, current status), see `PROJECT-STATUS.md`.

---

## Current Sequencing Strategy

<!-- Organize phases by whatever grouping makes sense for your project: chronological
     milestones, dependency chains, risk-ordered priorities, or capability areas.
     Adjust the number and naming of phases to fit your planning granularity. -->

### Phase A: [PHASE_NAME]

[Phase description and rationale]

1. **[Work Item 1]**
   - PRD/Plan: `[category]/[filename].md`
   - Rationale: [Why this comes first]
   - Scope: [High-level scope]

2. **[Work Item 2]**
   - Backlog: `[category]/BACKLOG-[CATEGORY].md`
   - Rationale: [Why this sequence position]
   - Scope: [High-level scope]

### Phase B: [PHASE_NAME]

[Phase description]

3. **[Work Item 3]**
   - Plan: `[category]/plan-[name].md`
   - Rationale: [Sequencing rationale]
   - Scope: [High-level scope]

### Phase C: [PHASE_NAME]

[Final phase items — often polish, deployment, etc.]

---

## Dependency Analysis

<!-- Optional. Useful when work items have meaningful ordering constraints.
     ASCII diagrams work well for simple chains. Remove this section entirely
     if dependencies are straightforward or self-evident from the phase structure. -->

```
[Item 1] ──────────► [What it enables]
[Item 2] ──────────► [What depends on it]
```

---

## Scoping Decisions

<!-- Captures the reasoning behind what's in scope and what isn't. Prevents
     relitigating settled decisions during weekly reviews. -->

### Included

| Technology/Approach | Rationale |
|---------------------|-----------|
| [Tech 1]            | [Why]     |
| [Tech 2]            | [Why]     |

### Lower Priority

| Technology/Approach | Rationale            | When              |
|---------------------|----------------------|-------------------|
| [Tech 3]            | [Why lower priority] | [When to revisit] |

### Skipped

| Technology/Approach | Rationale          |
|---------------------|--------------------|
| [Tech 4]            | [Why not included] |

---

## Open Questions

<!-- Track decisions that haven't been made yet. Move to "Resolved" with the
     resolution when decided. Prune resolved items during weekly review once
     they're no longer useful context. -->

- [Question needing decision]

**Resolved:**

- ~~[Previously open question]~~: [Resolution]

---

## Change Log

- **[DATE]**: [Change description]
