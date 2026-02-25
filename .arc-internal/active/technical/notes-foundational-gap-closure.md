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

## In-Process Analysis: Context Loading Design (Task 2.2.a)

### Likely Output Format

**Strategy update, not ADR.** The three-tier model isn't changing architecturally — the research
validates the structure. What changes is: empirical grounding, documented trade-offs,
potential refinement of which documents live in which tier. A strategy update (or new strategy
section) is the right vehicle. Candidate home: `strategy-development-methodology.md` or a
dedicated context loading section in session-init guidance.

### Evidence Confidence Classification

A key design goal for the output: **transparent evidence classification** for each design
choice. This supports trust-building with adopters and opens refinement avenues as broader
usage yields new insights. Three tiers of confidence:

- **Empirically validated** — supported by peer-reviewed research with citations.
  Example: "instruction count degrades performance more than token count" (IFScale,
  ManyIFEval). "Inter-category instruction conflicts are detected 18% less reliably"
  (ConInstruct).
- **Experience-validated** — proven through author usage across multiple work units, but
  not independently validated by external research. Example: "Tier 2 indexing via
  STRATEGY-INDEX.md results in appropriate on-demand consultation." The agentic RAG
  literature shows the *pattern* works, but ARC's specific mechanism is untested outside
  this project.
- **First-principles reasoning** — defensible design choice without direct evidence.
  Example: document ordering within session-init. Positional bias research supports
  the principle; ARC's specific ordering hasn't been A/B tested.

This classification should appear in the strategy output — not buried in research docs,
but visible where adopters encounter the guidance. Being upfront about knowns/unknowns:
(a) builds trust, (b) signals where community experience can contribute refinements,
(c) prevents the framework from overstating its scientific backing.

### Per-Document Tier 1 Assessment

Evaluate each current Tier 1 document against the research findings:

| # | Document | Category | Instruction Density | Conflict Risk | Tier 1 Justified? |
|---|----------|----------|---------------------|---------------|-------------------|
| 1 | AGENTS.md | narrative/identity | Low | Low | Yes — foundational |
| 2 | Agent-specific (CLAUDE.md) | constraints + thresholds | Moderate | Low (self-contained) | Yes — agent-specific |
| 3 | DEVELOPMENT-RULES.md | constraints/rules | High | Moderate (cross-ref) | Yes — non-negotiable |
| 4 | strategy-dev-methodology | constraints/procedures | High | **High** (overlaps #3, #7) | Review — large, procedural |
| 5 | STRATEGY-INDEX.md | index/metadata | Very low | None | Yes — enables Tier 2 |
| 6 | QUICK-REFERENCE.md | environment/factual | Low | Low | Yes — cheap to include |
| 7 | 3_process-task-loop.md | **procedural/imperative** | High | **High** (overlaps #4) | **Review** — strongest demotion candidate |
| 8 | CURRENT-SESSION.md | state/factual | Low | Low | Yes — session-critical |
| 9 | Task list (partial) | state/factual | Low | Low | Yes — work-critical |

**Demotion candidates:**

- **process-task-loop (#7):** Most procedural document in Tier 1. Highest distraction risk
  per the instructional distractions research. Overlaps significantly with dev-methodology (#4)
  which already covers task management protocol. Could be demoted to Tier 2 with a brief
  reference in Tier 1 ("follow the task processing workflow; load it before starting task
  execution"). Counter-argument: agents need the completion protocol *before* starting their
  first task, not after — late loading risks the exact backtracking that Tier 1 prevents.

- **strategy-dev-methodology (#4):** Large document covering commit standards, session
  management, verification, task management. Some of this overlaps with DEVELOPMENT-RULES (#3)
  and process-task-loop (#7). Partial demotion possible — load the behavioral constraints
  upfront, defer the procedural sections (commit format details, etc.) to Tier 2. But this
  requires splitting the document's role, which adds complexity.

**Key design tension:** The backtracking-prevention rationale for Tier 1 ("if you don't know
this rule, you'll violate it and have to redo work") is in tension with the instruction
conflict evidence ("more upfront instructions = more silent misresolution"). The right
balance is the minimum set that prevents backtracking — anything beyond that threshold is
better served by Tier 2.

### Cross-Document Conflict Audit (TODO for 2.2.a)

The ConInstruct finding (18% inter-category detection gap) means we should explicitly check
for conflicts between Tier 1 documents. Known overlap areas to audit:

- DEVELOPMENT-RULES § Commit Standards ↔ strategy-dev-methodology § Commit Standards
- DEVELOPMENT-RULES § Task Management ↔ process-task-loop § Task Implementation
- strategy-dev-methodology § Session Documentation Control ↔ process-task-loop § Completion
  Protocol
- Agent-specific files (CLAUDE.md) overrides or specializations of general rules

The goal isn't to eliminate all overlap (some reinforcement is intentional) but to identify
cases where the same topic is stated differently enough to create conflict detection failures.

### Open Questions for 2.2.b

1. Where does the evidence confidence classification live in the output? Inline with each
   recommendation? A dedicated section? A companion document?
2. Does process-task-loop get demoted or stay in Tier 1 with a "known trade-off" annotation?
3. Should the strategy output include guidance for adopters on customizing tier assignment
   (their project's Tier 1 may differ from ARC's)?
4. How do we frame the Tier 2 mechanism honestly — "works in our experience, matches
   industry patterns, but no published validation of this specific approach"?

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
