# Notes: Foundational Gap Closure

Reference material for the foundational gap closure work unit. Extracted from planning
artifacts; preserved here as actionable context for research and design tasks.

---

## Context Loading Architecture — Current State and Research Inputs

### ARC's Current Three-Tier Model

ARC operates with three implicit tiers of context availability. These tiers have never been
named or formally defined — they emerged from what worked.

**Tier 1: Upfront (session-init, mandatory read)**

Documents read in full at every session start before work begins:

1. `AGENTS.md` — project identity, tech stack, working guidelines
2. Agent-specific file (e.g., `CLAUDE.md`) — capabilities, thresholds, agent-specific protocol
3. `DEVELOPMENT-RULES.md` — quality gates, standards, non-negotiable rules
4. `strategy-development-methodology.md` — behavioral constraints, commit/session/task protocols
5. `STRATEGY-INDEX.md` — index of available strategy guidance (establishes Tier 2 awareness)
6. `QUICK-REFERENCE.md` — environment context, command patterns
7. `3_process-task-loop.md` — task execution protocol
8. `CURRENT-SESSION.md` — active work state, branch, blockers
9. Active task list (partial: overview + current task only)

Design reasoning: these documents contain rules and constraints that, if discovered mid-task,
would require backtracking. The cost of reading them upfront is lower than the cost of
violating them and having to redo work.

**Tier 2: Indexed but unloaded (agent knows it exists, reads on demand)**

Agent is made aware these exist during Tier 1 reads but doesn't load content until needed:

- **Strategy documents** — 10 strategies listed in `STRATEGY-INDEX.md`; read when entering a
  relevant domain (e.g., read ADR methodology strategy before writing an ADR)
- **Supplemental workflows** — atomic-commit, session-handoff, manage-incidental-work,
  verify-completion; referenced from process-task-loop, read when triggered
- **ADRs** — referenced in strategy docs and task lists; read when a decision needs context
- **Task list sections** — other phases/tasks beyond the current one; read as work progresses

Design reasoning: too large to load upfront (would consume significant context window), but the
agent needs to know they exist so it can consult them at the right moment. The index/reference
pattern is the mechanism — read the index, load the content later.

**Tier 3: Discoverable but not explicitly surfaced**

Agent has no session-specific awareness; content is findable via search or user direction:

- Directory READMEs
- Template files (`.arc/` deployable templates)
- Backlog documents and plan files
- Historical archive materials
- Research files in `.arc-internal/reference/research/`

Design reasoning: rarely needed during task execution. Loading awareness of these would add
noise for minimal benefit. When needed, the developer directs the agent or the agent discovers
them through search.

### Research Questions

**Primary:** Does empirical evidence support ARC's three-tier model, or suggest a different
distribution of context across tiers?

**Secondary:**

1. **Volume vs. relevance** — Is there a point where upfront context volume degrades
   performance? Does ARC's ~8 document chain approach that threshold?
2. **Instruction type effectiveness** — Do certain categories (constraints/rules, environment
   context, workflow procedures, project state) show different effectiveness profiles when loaded
   upfront vs. on-demand?
3. **Indexing effectiveness** — Does making an agent *aware* that documentation exists (Tier 2)
   actually result in appropriate on-demand consultation, or does it get lost in context?
4. **Structured chains vs. single files** — The Gloaguen et al. study examines single
   `AGENTS.md` files. Does structured, multi-document loading perform differently?
5. **Refresh triggers** — ARC has a "Core Document Reference Protocol" for re-reading docs
   mid-session when triggered. Is there evidence for or against mid-session context refreshing?

### Seed Sources

**Academic:**

- Gloaguen et al. (2026), "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful
  for Coding Agents?" — <https://arxiv.org/abs/2602.11988>

**Community discussion:**

- Hacker News discussion thread — <https://news.ycombinator.com/item?id=47034087>
  (varied interpretations of the findings)

**Internal (WU1 research):**

- `.arc-internal/reference/research/research-context-degradation.md` — Context degradation in
  large windows (2026-02-23). Covers "lost in the middle" positioning effects, effective context
  capacity thresholds, and compaction strategies. Directly relevant to the upfront loading
  volume question (research question 1) and position sensitivity implications for document
  ordering in session-init.

---

## Session State Portability — Problem Analysis

### The Dual Nature of CURRENT-SESSION.md

CURRENT-SESSION.md may be two things conflated into one:

- **Project state** — what's next for the work, blockers that affect anyone, task pointer. Much
  of this is already tracked elsewhere (task list checkboxes, commit messages). The unique
  additions: blockers, next-action pointer, off-task-list work path.
- **Session state** — where I personally am, what I tried, debugging insights, context that
  helps *my* next session but is inherently local and ephemeral.

The first is shareable and arguably should be shared. The second is personal and arguably should
stay local. Whether the solution is splitting the file, redesigning the handoff mechanism, or
something else entirely is the design question.

### Why Git Tracking Is Not Straightforward

- **Ordering problem:** Session handoff happens *after* commits (it assesses git state and
  reports on committed work). If tracked, the handoff always dirties the tree after clean
  commits. Options are all problematic: trailing "session state" commits pollute history;
  accepting perpetual dirty state confuses session-init; reordering handoff before commits
  defeats the purpose.
- **Merge conflicts with yourself:** Different session states from different machines diverge.
  The file content is inherently ephemeral — it changes every session on every machine.
- **Privacy/comfort:** Session state is often messy ("tried X, didn't work, suspect Y") which
  is valuable for continuity but uncomfortable for visibility.

### Analogous Problem Domains

- **Terraform state:** Local state file that causes merge conflicts → industry moved to remote
  state backends. State is shared but through a purpose-built mechanism, not git.
- **Dotenv pattern:** `.env.example` (template/schema) is tracked, `.env` (local instance) is
  gitignored. Everyone knows the shape; no one shares their values.
- **IDE workspace files:** Shared config (`.vscode/extensions.json`) tracked; personal state
  (`.vscode/settings.json`) gitignored. Split: project-relevant vs. personal.
- **Git itself:** Refs are shared (push/pull), working tree state is local. Architectural
  separation of shareable from local.

### What Already Exists in ARC

- Configurability strategy: CURRENT-SESSION is a P5 convention with "Method override —
  substitute session mechanism" as the configurability path
- File classification strategy: classified as "Scaffolded" (project-owned after init)
- Session handoff workflow: one passing mention of gitignore; otherwise assumes untracked
- `.gitignore` comment: "Session handoff file (transient)" — design intent hiding in a comment,
  not codified as a reasoned decision

---
