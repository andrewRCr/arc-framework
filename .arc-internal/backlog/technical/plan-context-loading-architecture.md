# Plan: Context Loading Architecture — Empirical Grounding

**Purpose:** Evaluate ARC's session initialization context loading against empirical research
on LLM agent effectiveness, and make grounded design decisions about what information belongs
at each tier.

**Status:** Draft
**Created:** 2026-02-24

---

## Motivation

ARC loads a chain of 8-9 documents at session start (~2,500-3,500 tokens of workflow
instruction plus the documents themselves). This approach emerged from developer experience
and iterative refinement — it works well in practice, but the reasoning for *what goes where
and when* has never been explicitly grounded.

Recent research (Gloaguen et al., 2026 — "Evaluating AGENTS.md: Are Repository-Level
Context Files Helpful for Coding Agents?")
examines whether repository-level context files improve LLM coding agent performance, with
mixed results and contested interpretation. While ARC's usage pattern differs from the
single-file `AGENTS.md` convention the study examines (ARC uses `AGENTS.md` as an entrypoint
into a structured context chain, not as a standalone instruction file), the underlying question
is directly relevant: **what information actually helps LLM agents perform better, and when
should they receive it?**

Even if research validates ARC's current approach entirely, having that grounding turns implicit
design into defensible design — and gives adopters a basis for understanding *why* the
session-init chain is structured the way it is.

---

## ARC's Current Context Architecture

ARC currently operates with three implicit tiers of context availability. These tiers have
never been named or formally defined — they emerged from what worked.

### Tier 1: Upfront (session-init, mandatory read)

Documents read in full at every session start before work begins:

1. `AGENTS.md` — project identity, tech stack, working guidelines
2. Agent-specific file (e.g., `CLAUDE.md`) — capabilities, thresholds, agent-specific protocol
3. `DEVELOPMENT-RULES.md` — quality gates, standards, non-negotiable rules
4. `strategy-development-methodology.md` — behavioral constraints, commit/session/task protocols
5. `STRATEGY-INDEX.md` — index of available strategy guidance (establishes tier 2 awareness)
6. `QUICK-REFERENCE.md` — environment context, command patterns
7. `3_process-task-loop.md` — task execution protocol
8. `CURRENT-SESSION.md` — active work state, branch, blockers
9. Active task list (partial: overview + current task only)

**Design reasoning (experiential):** These documents contain rules and constraints that, if
discovered mid-task, would require backtracking. The cost of reading them upfront is lower
than the cost of violating them and having to redo work.

### Tier 2: Indexed but unloaded (agent knows it exists, reads on demand)

Agent is made aware these exist during tier 1 reads but doesn't load content until needed:

- **Strategy documents** — 10 strategies listed in `STRATEGY-INDEX.md`; read when entering
  a relevant domain (e.g., read ADR methodology strategy before writing an ADR)
- **Supplemental workflows** — atomic-commit, session-handoff, manage-incidental-work,
  verify-completion; referenced from process-task-loop, read when triggered
- **ADRs** — referenced in strategy docs and task lists; read when a decision needs context
- **Task list sections** — other phases/tasks beyond the current one; read as work progresses

**Design reasoning (experiential):** Too large to load upfront (would consume significant
context window), but the agent needs to know they exist so it can consult them at the right
moment. The index/reference pattern is the mechanism — read the index, load the content later.

### Tier 3: Discoverable but not explicitly surfaced

Agent has no session-specific awareness; content is findable via search or user direction:

- Directory READMEs
- Template files (`.arc/` deployable templates)
- Backlog documents and plan files
- Historical archive materials
- Research files in `.arc-internal/reference/research/`

**Design reasoning (experiential):** Rarely needed during task execution. Loading awareness
of these would add noise for minimal benefit. When needed, the developer directs the agent
or the agent discovers them through search.

---

## Research Questions

**Primary:** Does empirical evidence support ARC's three-tier model, or suggest a different
distribution of context across tiers?

**Secondary questions:**

1. **Volume vs. relevance** — Is there a point where upfront context volume degrades
   performance? Does ARC's ~8 document chain approach that threshold?
2. **Instruction type matters** — Do certain categories of information (constraints/rules,
   environment context, workflow procedures, project state) show different effectiveness
   profiles when loaded upfront vs. on-demand?
3. **Indexing effectiveness** — Does making an agent *aware* that documentation exists
   (tier 2) actually result in appropriate on-demand consultation, or does it get lost
   in context?
4. **Structured chains vs. single files** — The Gloaguen et al. study examines single
   `AGENTS.md` files. Does structured, multi-document loading perform differently?
5. **Refresh triggers** — ARC has a "Core Document Reference Protocol" for re-reading
   docs mid-session when triggered. Is there evidence for or against mid-session
   context refreshing?

---

## Seed Sources

**Academic:**

- Gloaguen et al. (2026), "Evaluating AGENTS.md: Are Repository-Level Context Files
  Helpful for Coding Agents?" — <https://arxiv.org/abs/2602.11988>

**Community discussion and interpretation:**

- Hacker News discussion thread — <https://news.ycombinator.com/item?id=47034087>
  (varied interpretations of the Guo et al. findings)

**Internal (WU1 research):**

- `.arc-internal/reference/research/research-context-degradation.md` — Context degradation
  in large windows (2026-02-23). Covers "lost in the middle" positioning effects, effective
  context capacity thresholds, and compaction strategies. Conducted for WU1 session management
  guidance. Directly relevant to the upfront loading volume question (research question #1)
  and position sensitivity implications for document ordering in session-init.

**To discover during research:**

- Other empirical studies on LLM context window utilization and instruction following
- Research on "lost in the middle" effects and context position sensitivity
- Practitioner reports on repository-level context file effectiveness
- Claude/GPT/Gemini-specific findings on instruction adherence with context volume
- Any studies on structured vs. monolithic context delivery

---

## Expected Outputs

**Research synthesis** — a summary of empirical findings relevant to ARC's context loading
decisions, distinguishing between strong evidence, suggestive evidence, and gaps.

**Design evaluation** — ARC's current three-tier model assessed against the research.
Possible outcomes:

- **Validation:** Current approach is well-supported; document the reasoning as an ADR
  or strategy section so it's explicit rather than implicit
- **Refinement:** Evidence suggests specific documents should move between tiers, or that
  the tier boundaries should shift
- **Restructuring:** Evidence suggests a fundamentally different approach (unlikely given
  the current approach works, but worth considering)

**Likely landing format:** ADR (if a significant design decision emerges) or a new section
in an existing strategy doc (if the finding is "current approach is sound, here's why").

---

## Relationship to WU2

The WU2 plan (`plan-wu2-methodology-completion.md`) implements methodology changes across
existing docs and workflows. Context loading architecture could affect WU2 in several ways:

- **Session-init workflow changes** — If tier assignments shift, the session-init workflow
  (which WU2 may touch) would need updating
- **Strategy document protocol** — WU2 implements strategy consultation patterns; empirical
  grounding on tier 2 effectiveness could refine how that protocol works
- **Workflow index** — WU2's plan includes workflow discoverability improvements; findings
  on tier 2 indexing effectiveness are directly relevant

**Recommended sequencing:** Complete this research before finalizing WU2's plan evaluation.
Findings may not change WU2's scope significantly, but they provide grounding for any
session-init or strategy-protocol work WU2 includes.

---

## Scope and Format

This is a bounded research-and-design effort, not a multi-phase implementation. Expected
work profile:

1. **Research** — Read and synthesize empirical sources (~1-2 sessions of research agent work)
2. **Evaluate** — Assess ARC's current model against findings (~1 session)
3. **Decide** — Produce ADR or strategy update documenting the grounded design (~1 session)

If scope expands beyond this, reassess whether it needs a task list. Current expectation
is that it stays atomic or near-atomic in execution complexity.
