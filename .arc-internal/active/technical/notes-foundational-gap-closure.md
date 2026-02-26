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
3. `DEVELOPMENT-RULES.md` — (project specific) quality gates, standards, non-negotiable rules
4. `strategy-development-methodology.md` — (ARC-specific) behavioral constraints, commit/session/task protocols
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
3. **Indexing effectiveness** — Does making an agent _aware_ that documentation exists (Tier 2)
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

## Evaluation: Context Loading Design (Task 2.2 — Complete)

### Research Inputs

Three research syntheses informed this evaluation:

1. `research-context-loading.md` — 31 sources on context architecture (instruction count,
   conflict, category effectiveness, structured vs. monolithic delivery, indexing patterns)
2. `research-context-degradation.md` — 28 sources on window degradation (positioning effects,
   effective capacity thresholds, compaction strategies)
3. `research-instruction-reliability.md` — 17+ sources on instruction delivery mechanisms
   (skill recognition, explicit vs. implicit triggers, the 85%→99% compliance gap)

### Output Format Decision

**WU2 change specifications, not ADR.** The three-tier model is validated structurally.
The changes are: tier formalization, document restructure, and loading sequence redesign —
all of which are implementation work for WU2. The tier model formalization will live in the
slimmed `strategy-development-methodology.md` as a new section. The document restructure
and session-init changes are specified as WU2 cluster additions.

### Evidence Confidence Classification

Three tiers of confidence, to be surfaced in the strategy output where adopters encounter
the guidance:

- **Empirically validated** — supported by peer-reviewed research with citations.
  "Instruction count degrades performance more than token count" (IFScale, ManyIFEval).
  "Inter-category conflicts detected 18% less reliably" (ConInstruct). "Explicit triggers
  achieve 85-95% recognition vs. 60-75% for implicit awareness" (Implicit Intelligence).
- **Experience-validated** — proven through author usage across multiple work units, not
  independently validated. "Tier 2 indexing results in appropriate on-demand consultation."
  The agentic RAG literature validates the pattern; ARC's specific mechanism is untested
  outside this project.
- **First-principles reasoning** — defensible design choice without direct evidence.
  Document ordering within session-init; specific instruction budget target of <80.

Being upfront about knowns/unknowns: (a) builds trust, (b) signals where community
experience can contribute refinements, (c) prevents overstating scientific backing.

### Key Reframing: Instruction Budget

The reliability research introduced a critical concept: **instruction budget.** The "curse
of instructions" (P(all) = P(individual)^n) means every distinct instruction in Tier 1
competes for the same finite compliance capacity. Frontier models maintain reasonable
compliance through ~50-100 instructions; degradation accelerates past 150-200.

ARC's current Tier 1 (~9 documents) imposes roughly **80-125 distinct instructions** —
approaching the threshold where even frontier models with threshold-decay patterns start
losing compliance. The relevant metric is not token count or document count but the number
of distinct behavioral constraints the agent must follow simultaneously.

### Five Design Decisions

**Decision 1: Formalize the tier model as a first-class ARC concept**

The three tiers have never been named or defined. The evidence now supports formalizing
them with explicit reliability characteristics and a critical new distinction:

| Tier | Mechanism                              | Recognition | Compliance (moderate) |
| ---- | -------------------------------------- | ----------- | --------------------- |
| 1    | Always loaded (session-init)           | 100%        | 75-85%                |
| 2a   | Explicit trigger in Tier 1 doc         | 85-95%      | 75-85%                |
| 2b   | Indexed awareness (no explicit cue)    | 60-75%      | 60-70% (combined)     |
| 3    | Search-based discovery / user-directed | 20-40%      | Variable              |

The Tier 2a/2b distinction is the key insight: "Tier 1 says 'load this when you
encounter X'" is significantly more reliable than "agent knows this exists via an index."
ARC already uses both patterns but doesn't distinguish them. Formalizing tells adopters
which mechanism to use for which reliability requirement.

**Evidence confidence:** Empirically validated (IFScale, Implicit Intelligence, practitioner
convergence). Specific percentages are approximate; the ordering is robust.

**Decision 2: Demote process-task-loop to Tier 2a**

Process-task-loop is the strongest demotion candidate by every measure:

- Highest instructional distraction risk (procedural/imperative — 0.301 accuracy in
  distraction studies vs. 0.738 for mathematical reasoning)
- ~20-30 distinct instructions competing in the budget
- Overlaps with strategy-dev-methodology on task management protocol
- The counter-argument ("agents need it before starting work") is addressed by the
  explicit trigger pattern: a brief reference in session-init fires before task execution

The demotion saves ~20-30 instructions from the Tier 1 budget while maintaining 85-95%
recognition via explicit trigger (vs. the current 100% at the cost of instruction density).

**Evidence confidence:** Empirically validated (instructional distractions study, category
hierarchy research). Specific demotion target is experience-validated.

**Decision 3: Restructure dev-rules / strategy-dev-methodology as co-located twin core docs**

The current two-document relationship has problems:

- `strategy-dev-methodology` contains both always-applicable rules AND domain-specific
  reference — conflating "core doc" and "strategy" purposes
- Overlap between dev-rules and the strategy creates ConInstruct conflict risk
- ARC methodology rules are buried in a strategy file — low discoverability for adopters
- The configurability architecture (method-overrides, extensions) now provides a better
  mechanism for the ARC/project customization split than document separation

**Resolution: co-located twin core docs:**

- `DEV-RULES.ARC.md` (framework-owned, Reference classification): always-applicable
  behavioral rules extracted from strategy-dev-methodology. Brief, actionable (~15-20
  instructions). Non-negotiable rules (principle-backed) have no override path. Strong
  defaults (convention-level) get inline method-override pointers.
- `DEV-RULES.PROJECT.md` (project-owned, Scaffolded classification): project-specific
  quality gates, testing requirements, file organization. Renamed from DEVELOPMENT-RULES.md.
  ARC methodology content removed (now in DEV-RULES.ARC).
- `strategy-dev-methodology.md` slimmed to domain-specific reference: commit format details,
  test-first decision tree, code documentation conventions, and the tier model formalization.
  Becomes Tier 2a content triggered from DEV-RULES.ARC.

Both core docs co-located in `reference/constitution/`. Mixed ownership documented via
file classification (existing pattern — same as `system/agent/` which mixes AGENTS.md
framework-owned with project-customizable agent files).

The "defaults beyond core philosophy" filter applies during the split: anything in the
strategy that doesn't trace to P1-P11 either becomes a convention with an explicit
configurability path or gets removed. This addresses the concern about author preference
leakage.

**Evidence confidence:** First-principles reasoning informed by ConInstruct (18%
inter-category gap). The specific restructure is a design choice.

**Decision 4: Formalize explicit trigger mechanism (Tier 2a pattern)**

For any Tier 2 content where compliance needs to be high, embed an explicit trigger
reference in a Tier 1 document. ARC already does this ad-hoc; the decision is to
formalize it as the named Tier 2a pattern.

Concrete triggers to formalize:

- Session-init → process-task-loop ("before starting task execution")
- DEV-RULES.ARC → atomic-commit workflow ("before complex commits")
- DEV-RULES.ARC → strategy-dev-methodology ("for format details and elaboration")
- STRATEGY-INDEX entries → brief "when working on X" phrasing per strategy

Interacts with WU2 Cluster O `post-context-load` extension point — that's where adopters
add their own Tier 2a triggers.

**Evidence confidence:** Empirically validated (Implicit Intelligence: 48% baseline
implicit vs. 85-95% explicit). ARC's specific trigger pattern is experience-validated.

**Decision 5: Instruction density audit as a maintenance practice**

Establish a Tier 1 instruction budget guideline:

- **Target:** Under 80 distinct instructions (safety margin below the 150-200 model
  threshold, accounting for user-turn and tool-description instructions that also compete)
- **Maintenance:** When modifying Tier 1 documents, consider whether new content adds
  instructions or informational context
- **Audit criterion:** Can any two Tier 1 instructions contradict? (ConInstruct finding)

**Evidence confidence:** Empirically validated (IFScale, ManyIFEval). Specific target
number is first-principles reasoning calibrated against research thresholds.

### Per-Document Tier 1 Assessment (Revised)

Post-decision Tier 1 composition:

| #   | Document                   | Category                 | ~Instructions | Status                   |
| --- | -------------------------- | ------------------------ | ------------- | ------------------------ |
| 1   | AGENTS.md                  | narrative/identity       | 5-8           | Stays — foundational     |
| 2   | Agent-specific (CLAUDE.md) | constraints + thresholds | 10-15         | Stays — agent-specific   |
| 3   | DEV-RULES.ARC.md (new)     | constraints/rules        | 15-20         | Replaces #3 + #4         |
| 4   | DEV-RULES.PROJECT.md (new) | project-specific rules   | 10-15         | Slimmed from old #3      |
| 5   | STRATEGY-INDEX.md          | index/metadata           | 2-3           | Stays — enables Tier 2   |
| 6   | QUICK-REFERENCE.md         | environment/factual      | 5-8           | Stays — cheap            |
| 7   | CURRENT-SESSION.md         | state/factual            | 0-2           | Stays — session-critical |
| 8   | Task list (partial)        | state/factual            | 0-2           | Stays — work-critical    |

**Estimated total: ~47-73 instructions** (down from ~80-125). Well within the <80
target and comfortably below the 150-200 degradation threshold.

**Demoted to Tier 2a:**

- process-task-loop → triggered from session-init before task execution
- strategy-dev-methodology → triggered from DEV-RULES.ARC for elaboration/reference

### Cross-Document Conflict Audit (Resolved)

The four overlap areas identified earlier are resolved by the restructure:

- DEV-RULES § Commit Standards ↔ strategy-dev-methodology § Commit Standards →
  **Eliminated.** Brief rule in DEV-RULES.ARC, format details in strategy (Tier 2a).
- DEV-RULES § Task Management ↔ process-task-loop § Task Implementation →
  **Eliminated.** Brief rule in DEV-RULES.ARC, full protocol in process-task-loop (Tier 2a).
- strategy-dev-methodology § Session Doc Control ↔ process-task-loop § Completion Protocol →
  **Eliminated.** Both documents restructured; session doc rule in DEV-RULES.ARC,
  procedural detail in respective Tier 2a docs.
- Agent-specific files overrides → **Unchanged.** CLAUDE.md specializations of general
  rules remain valid; the general rules now live in DEV-RULES.ARC instead of being split
  across two documents.

### Open Questions Resolved

1. _Where does evidence classification live?_ → Inline in the tier model formalization
   section of the slimmed strategy-dev-methodology. Visible where adopters encounter
   guidance, not buried in research docs.
2. _Process-task-loop demoted or stays?_ → **Demoted to Tier 2a** with explicit trigger.
3. _Adopter customization of tier assignment?_ → Yes — noted in the tier model
   formalization. Adopters' Tier 1 may differ from ARC's defaults. The instruction budget
   guideline helps them make informed decisions.
4. _How to frame Tier 2 honestly?_ → Tier 2a/2b distinction addresses this. Tier 2a
   (explicit triggers) is empirically grounded. Tier 2b (indexed awareness) is
   experience-validated with honest framing of the evidence gap.

---

## Session State Portability — Problem Analysis

### The Dual Nature of CURRENT-SESSION.md

CURRENT-SESSION.md may be two things conflated into one:

- **Project state** — what's next for the work, blockers that affect anyone, task pointer. Much
  of this is already tracked elsewhere (task list checkboxes, commit messages). The unique
  additions: blockers, next-action pointer, off-task-list work path.
- **Session state** — where I personally am, what I tried, debugging insights, context that
  helps _my_ next session but is inherently local and ephemeral.

The first is shareable and arguably should be shared. The second is personal and arguably should
stay local. Whether the solution is splitting the file, redesigning the handoff mechanism, or
something else entirely is the design question.

### Why Git Tracking Is Not Straightforward

- **Ordering problem:** Session handoff happens _after_ commits (it assesses git state and
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
