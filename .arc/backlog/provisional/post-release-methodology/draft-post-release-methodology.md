# Draft: Post-Release Methodology Evolution

**Purpose:** Capture methodology improvements, skill expansions, and workflow UX ideas that
emerge during 1.0 development but belong after release. This is a living collection document,
not a single-scope work unit — items here will be triaged into concrete work units when
post-1.0 planning begins.

- **State:** Draft (collecting)
- **Created:** 2026-03-05

> **Note:** Items in this plan that reference `WORK-STATUS.md` predate the Work-Status
> Restructure WU (see `prd-work-status-restructure.md`), which replaces the singular project
> pointer with per-WU `status-{name}.md` files in `active/{category}/`. The design intent of
> each item is unchanged — read `WORK-STATUS.md` mentions here as "the active WU's status
> file" under the restructure model. Specific references will be updated when individual items
> are promoted to PRDs.

---

## Items

### `arc-plan` skill — planning pipeline dispatcher

**Origin:** ADR-011 skill naming discussion (WU2, Task 8.4)

**Concept:** A user-invocable skill (`arc-plan`) that serves as a smart entry point for the
"I'm between work units, what's next?" moment. Rather than requiring users to know which
planning workflow to invoke, it dispatches based on current state.

**Behavior:**

1. **Orient** — Read WORK-STATUS. If active work exists, flag it before proceeding.
2. **Discovery path** (pm.mode-aware):
   - **arc-in-git**: Check ROADMAP.md for sequencing, scan backlog for matching `plan-*`
     docs, present options
   - **none/external**: No backlog to scan — prompt user for what they're thinking about
3. **Branch based on readiness**:
   - No plan doc → discovery conversation → write `plan-*.md` from template → optionally
     flow into create-prd
   - Plan doc exists, no PRD → load plan, flow into `1_create-prd.md`
   - PRD exists, no tasks → flow into `2_generate-tasks.md`
   - Everything exists → flow into `activate-work-unit.md`

**Design notes:**

- User-invocable only (`disable-model-invocation: true` in Claude Code terms) — an agent
  auto-invoking "let's plan" mid-task would be disruptive
- Episodic use (between work units), unlike the three session lifecycle skills which are
  every-session
- The planning workflows already have clear entry points via WORK-STATUS "Next Action" —
  this skill adds convenience and discoverability, not new capability
- Needs pm.mode branching to be tested (WU3 territory) before implementation

**Scope estimate:** Small (hours) — the skill is a dispatcher, not new workflow logic.

---

*Add new items above this line. Each item should include: origin (where the idea came from),
concept (what it does), and enough design context to evaluate scope later.*
