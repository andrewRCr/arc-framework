# ADR-001: Define Core Identity and Principle/Method Boundary

## Status

Accepted

## Context

ARC has been developed and battle-tested as a single-developer, single-agent framework. Moving toward 1.0, the framework
must answer foundational questions: What IS ARC at the philosophical level? What's non-negotiable identity vs.
configurable method? How do teams of any size adopt it without hitting walls?

**The root problem:** ARC currently blurs the line between principles (what defines ARC) and methods (how those
principles are implemented). An adopter experience audit identified 3 adoption-blocking dealbreakers and 7 significant
friction points — nearly all caused by methods being presented as principles. Teams encounter non-negotiable-seeming
requirements that are actually configurable choices, and vice versa. Drawing a sharp principle/method boundary is the
prerequisite for everything else: configurability architecture, adoption tiers, agent compatibility, and methodology
integration.

**Three-tier flexibility model:** Prior research validated a three-tier approach rather than a binary split:

1. **Principle (tier 1)** — Non-negotiable. Defines ARC's identity. Removing it makes the framework not-ARC.
2. **Convention (tier 2)** — Configurable method with a sensible default. Changing it keeps ARC intact. The assumed
   approach in absence of an alternative.
3. **Escape hatch (tier 3)** — Things ARC doesn't formally support but doesn't block. Outside ARC's design envelope,
   acknowledged without active design investment.

**Analytical test applied to every practice:** "If an adopter changed or removed this, would they still be meaningfully
using ARC?" Yes → convention. No → principle. Depends → discussion needed.

**Evidence base:** Classifications are grounded in:

- Current ARC documentation (META-PRD, AGENTS.md, development methodology strategy, process task loop, aspirational
  README)
- Adopter experience audit (3 dealbreakers, 7 friction points, principle-vs-method analysis)
- Phase 1 research: AI coding agent landscape (17 tools across 4 categories), human attention and single-tasking (20+
  peer-reviewed sources, targeted counterevidence), context degradation, development methodology landscape

## Decision

We will establish ARC's core identity through the following principle/convention classifications. Principles define what
ARC IS — the non-negotiable commitments that any ARC adoption must honor. Conventions are the methods ARC provides by
default — strong starting points that teams can configure to their context without leaving the framework.

### Principles (Tier 1 — Non-Negotiable)

#### P1. Spec-Directed Development

**Statement:** Development begins from explicit, written specifications that establish intent, scope, and success
criteria before implementation. Planning leads execution at every level, never the reverse.

Spec-directed development is foundational — remove it and the entire methodology collapses into ad-hoc AI prompting with
organized folders. The specification is what makes work directed rather than reactive. "Plan before executing" is
integral: spec-directed thinking applies from project vision down to individual tasks.

The decomposition may be refined iteratively, but it always precedes the work it governs. Retrofitting planning
artifacts to match what was already done introduces drift between intent and execution and defeats the purpose of the
planning — both as preservation prior to implementation and as a record of intent vs. outcome.

Not every action requires formal specification. The test is: "Does this need up-front planning?" Quick fixes with clear
scope can rely on well-crafted git commits as the record. ARC provides methods for specification; teams decide how
strictly to apply them based on context. Drawing this line differently doesn't break the framework.

**Conventions under this principle:** The specific document hierarchy (META-PRD → PRD → task list), file naming and
locations, template formats, and the constitutional document set are strong defaults — not mandatory structure.

#### P2. Human-Agent Co-Development

**Statement:** Humans and AI agents collaborate through tight, iterative feedback loops. Review happens at the micro
level — during work, not after it. The human directs; the agent executes within bounded scope, reports back, and the
cycle repeats. The human trusts the agent within each cycle but retains decision authority at cycle boundaries.

This is ARC's most distinctive characteristic — the quality that someone encounters and immediately recognizes as
fundamentally different from delegation-based approaches. Not review-at-merge-time, but continuous iterative refinement
at the micro level. Everything flows from the importance placed on recursive back-and-forth vs. delegation and autonomy.

The human is a co-developer, not merely a reviewer. Even when the developer isn't directly editing code, they're
involved at the micro level — contributing context, judgment, and course correction at every review increment. The human
takes professional ownership of the work: their name is in the commit author field, and they bear responsibility for the
output. The agent may execute operations, but the human owns the result.

**Review increment scope:** The bounded chunk of autonomous execution between human review points must be kept small
enough to maintain micro-level collaboration:

- **Too narrow:** Per-edit or per-tool-call review destroys momentum and signals task scoping problems, not effective
  collaboration. Trust the agent within the cycle.
- **Right range:** Per-task or per-task-grouping (parent task level). Small enough for meaningful micro-level
  collaboration; large enough for productive autonomous execution.
- **Too loose:** Per-phase or per-PR. At this level, the methodology's distinctive value is lost — you're delegating,
  not co-developing.

**Subsumes:** Verification protocol (agent verifies from source, never assumes), stop on anomalies (agent flags
unexpected state rather than making autonomous recovery decisions), and manual commit control (human authorizes
permanent state changes).

**Conventions under this principle:** ARC's task list system provides the default review boundary structure (per-task
checkbox). The specific tracking mechanism, completion protocol steps, and review granularity configuration are
convention. Deferred review (user-defined scope for multi-task continuation) is an existing flexibility mechanism.

**Terminology note:** "Work unit" refers to the combined document set (PRD + task list + notes) for a coherent body of
work. "Review increment" refers to the bounded autonomous execution chunk between human review points. These are
distinct scales.

#### P3. Focused, Sequential Execution

**Statement:** ARC is built around focused, sequential work. This is a core operating principle, not a suggestion. The
vast majority of work should follow this pattern, and the framework is built on the basis that focused work produces
better results than the alternative in most application domains.

This principle rests on three pillars:

**Pillar 1 — Cognitive reality:** Novel knowledge work has well-documented multitasking costs. Task-switching can cost
up to 40% of productive time (Rubinstein, Meyer & Evans, 2001). Recovery from interruptions averages 23 minutes for
knowledge workers (Mark, Gudith & Klocke, 2008) and 10-15 minutes for software engineering specifically (Lestan,
Leventis & Ivanovic, 2024). The attention bottleneck is one of the most replicated findings in cognitive psychology,
supported by 70+ years of evidence from Broadbent (1958) through Pashler (1994) to contemporary research.

Genuine exceptions exist: supertaskers (~2.5% of the population, innate and not trainable; Watson & Strayer, 2010),
practiced time-sharing under narrow conditions (Schumacher et al., 2001), and domain-structured multitasking like air
traffic control. None generalize to novel, complex, semantically rich work — which is what AI-assisted software
development is. ARC designs for the 97.5%.

ARC's design IS the environmental structure that mitigates bottleneck costs — analogous to how air traffic control uses
radar, separation standards, and checklists to manage inherent attention limits through intelligent task ordering rather
than true parallel processing.

**Pillar 2 — Human-for-humans:** Software is overwhelmingly produced for human consumption. Deep human involvement isn't
just quality control — it's quality input. Humans bring perspective, taste, and judgment about what feels right that an
AI modeling human needs cannot replicate. Fully delegated development optimizes for an abstraction of human needs, not
the real thing.

A cultural parallel illustrates: there is near-universal rejection of AI-produced art, music, and game assets — a
widely-felt distinction between "things that are supposed to be human" and "things where it doesn't matter." Most
software sits closer to the former than the industry currently admits — certainly any software where user experience
matters. This argument is more durable than the cognitive one: it doesn't diminish with better technology.

**Pillar 3 — Complementary strengths amplified by frequency:** Human and agent bring fundamentally different
capabilities. Humans: perspective, context, judgment, lived experience with the problem domain. Agents: breadth of
knowledge, speed, tooling, pattern recognition across training data. Neither is sufficient alone — the output is more
robust than either could achieve independently, and that robustness scales with interaction frequency.

Each exchange is an opportunity for both parties to contribute what they're uniquely good at. Agents perform better with
sharper context; frequent human input provides exactly that. Humans benefit from the agent's speed and breadth at each
step. Lengthen the review increment and you underutilize both parties: the agent gets fewer course corrections and
context injections; the human gets fewer chances to leverage the agent's capabilities.

**Reframe:** The industry's default framing treats human single-threaded attention as a bottleneck to be minimized or
routed around. ARC's position: human attention being single-threaded is a feature, not a bug. It forces focus, ensures
quality input at every step, and produces work that reflects genuine human judgment. Throughput alone is not the gold
standard for most work.

**What this does not mean:**

- Multiple work units active on different branches (team-level parallelism) is fine
- Sequential agent handoffs (e.g., one agent for design, another for implementation) are compatible — sequential, not
  parallel; the human is the continuity thread
- Background agents on bounded tasks may work, but are outside ARC's designed operating mode

**Conventions under this principle:** The specific enforcement mechanism (one checkbox + mandatory stop) is covered
under P2's review increment. This principle provides the cognitive and philosophical justification for keeping review
increments small and sequential.

#### P4. Quality Gate Enforcement

**Statement:** Automated quality verification is a required step before work is considered complete. Quality is
verified, not assumed.

Quality gates are the feedback mechanism that makes directed collaboration reliable. Without automated verification, the
agent can declare "done" with no check, and errors compound across review increments. The principle is about the
existence of automated verification, not the specific gates, tools, or strictness level.

**Conventions under this principle:** Zero-tolerance policy (vs. severity levels or warning-level gates), specific tier
definitions (Tier 1/2/3), specific tools, and when each tier runs relative to the review cycle — all convention. The
"leave it cleaner" practice is convention with a capture floor: discovered issues must at minimum be documented (task
inbox, backlog, as directed) rather than identified and then dismissed. Identifying an issue and not capturing it is a
wasted opportunity.

#### P5. Context Preservation

**Statement:** Work context must be recoverable across work boundaries through structured, human-controlled, and
transparent mechanisms. Knowledge gained during work — decisions, state, rationale — must not be lost when a session
ends.

Without context preservation, each session starts from scratch and the reciprocal feedback loop — the mechanism by
which the framework improves itself and the project accumulates institutional knowledge — breaks entirely.

The human controls what is preserved. The mechanism must be:

- **Structured:** Consistent format — you know where to find things and what to expect
- **Human-controlled:** The human decides what's preserved, can edit and curate
- **Transparent:** Visible, inspectable, debuggable — when something goes wrong, you can see why and know what to fix
- **Predictable:** Reliable recovery, not dependent on ambient tool features that may change or fail silently

**Two types of context preservation (distinct but related):**

- **Session-level:** What was being worked on, current state, what's next. Serves continuity across work sessions.
- **Project-level:** What decisions were made, what patterns emerged, why things were done a certain way. Serves
  institutional memory and onboarding.

**What doesn't meet the bar (as sole mechanism):** Git commit history alone (unstructured for this purpose), PR
descriptions alone (too coarse), opaque auto-memory systems (no manual control or transparency). These may supplement
but don't substitute.

**Conventions under this principle:** CURRENT-SESSION.md, session initialization ceremony, session handoff protocol,
specific document-reading order — all convention. Alternative mechanisms that satisfy the criteria above are valid.

#### P6. Traceability Through Version Control

**Statement:** Work is traceable — changes link back to the intent that motivated them. Git serves as the canonical
record of what was done, when, and why.

Git is assumed as the VCS. This is a pragmatic choice: git is universal across all agent tools surveyed and effectively
synonymous with version control in current practice. Non-git VCS is escape-hatch territory — the traceability principle
still applies but ARC's specific tooling guidance won't cover it.

The deeper principle is traceability: you can follow the thread from any change back to the decision that motivated it.
This is what makes the improvement loop auditable and what gives commits, branches, and PRs their role as the
canonical interface for work artifacts.

**Conventions under this principle:** Conventional commit format, context footer format, atomic commit granularity,
branch naming conventions, and branch/task list coupling are all convention. The traceability principle accommodates
different merge strategies: if commits survive merge, make them traceable; if you squash, the PR description carries
traceability. Either way, the thread from change to intent must be followable.

Platform-specific assumptions (GitHub Actions, `gh` CLI, PR-based workflows) are convention, deferred to the external
tool compatibility design (requirement 7).

#### P7. Granular Task Tracking

**Statement:** Work is decomposed into explicit, trackable increments before execution. Progress is visible and
verifiable — not implicit in code changes or assumed from activity. Planning leads execution at every level, never the
reverse.

Task tracking is the operational bridge between spec-directed development (P1) and the human-agent interaction loop (P2).
Specifications define intent; tracking makes that intent executable and reviewable at the right granularity. Without
explicit tracking, the human can't review what they can't see decomposed, and the agent lacks the context needed to work
effectively within bounded scope.

Tracking granularity should roughly match review increment granularity — this connection ensures the methodology's
components reinforce each other rather than pulling apart.

**Conventions under this principle:** Markdown checkboxes in task list files (ARC's default), task list naming and
formatting, specific granularity guidelines. Teams using external trackers (Jira, Linear, GitHub Issues) can satisfy the
principle through those tools. ARC's markdown task lists offer the additional benefit of automatically satisfying the
context preservation principle (P5) — version-controlled, structured, transparent, human-controlled — but this is a
strength of the default method, not a mandate to use it exclusively.

#### P8. Agent-Agnostic Design

**Statement:** ARC's methodology is defined independently of any specific AI tool. The framework's value is the
methodology, not coupling to one AI product.

Agent lock-in would be a fundamental design failure. Core workflows must be written in agent-neutral terms, with
agent-specific guidance isolated to dedicated files.

Agent-agnostic does not mean universally compatible. Some agent types are philosophically misaligned with ARC's
co-development model (see Positioning below). The framework acknowledges them without designing for them. The goal is
not universal compatibility but clarity about which assumptions are load-bearing and where ARC's methodology applies.

**Conventions under this principle:** Agent-specific file structure (CLAUDE.md, GEMINI.md, etc.), the specific
agent-neutral abstractions used in workflows.

#### P9. Dual-Audience Documentation

**Statement:** All project artifacts are structured for both human comprehension and AI agent consumption. Documentation
that only works for one audience misses the purpose of a framework designed for human-AI collaboration.

This is the "Agentic" in ARC. The dual-audience principle drives template structure, formatting choices, and content
organization throughout the framework.

**Conventions under this principle:** Specific formatting rules, template layouts, what "agent-friendly" means in
practice.

#### P10. Codified Improvement

**Statement:** The framework and the projects that use it improve through documented feedback loops. Patterns are
codified from experience; decisions are captured; future work builds on prior context rather than starting fresh.

Without knowledge evolution, ARC is a static project management template. The reciprocal feedback — decisions
documented, patterns extracted, future work informed by prior cycles — is what makes it a living methodology.

**Conventions under this principle:** The specific evolution path (working notes → strategy documents → constitutional
docs), archival processes, where patterns live.

#### P11. Shared-Context Co-Development

**Statement:** Developer and agent operate in shared context with mutual visibility. The developer can see what the
agent is doing, intervene at any point, and contribute directly to the same work artifacts.

The co-development model is what enables the tight interaction loop (P2) and the complementary strengths pillar (P3). If
the agent works in an opaque sandbox and the developer only sees output, collaboration is lost — you're reviewing, not
co-developing.

**Compatibility envelope:**

- **Within principle:** CLI agents (Claude Code, Aider, Codex CLI) and IDE-integrated agents (Cursor, Windsurf,
  Antigravity). Both provide shared context and mutual visibility through different mechanisms.
- **Outside principle:** Async delegation agents (Codex cloud, Jules, Warp Oz, Devin). The developer doesn't see work in
  progress; there's no real-time shared context. This is delegation with review, not co-development.

**Conventions under this principle:** Local CLI with filesystem access is ARC's primary design target. The specific
mechanism (terminal, editor, remote session) is convention; the shared context and mutual visibility requirement is not.

### Conventions (Tier 2 — Configurable Methods)

The following are strong defaults that ARC provides. They represent tested, effective methods for implementing the
principles above. Teams may configure or replace them while remaining within the framework, provided the underlying
principles are honored.

| Convention                                                  | Underlying Principle      | Default                                  | Configurable Aspect                            |
|-------------------------------------------------------------|---------------------------|------------------------------------------|------------------------------------------------|
| Document hierarchy (META-PRD → PRD → tasks)                 | P1 (spec-directed)        | Full hierarchy                           | Number of docs, naming, structure              |
| Template-first documents                                    | P1 (spec-directed)        | Copy-ready templates                     | Template format and content                    |
| Markdown task list checkboxes                               | P7 (task tracking)        | Markdown in git                          | Tracking tool (Jira, Linear, etc.)             |
| Per-task mandatory review stop                              | P2 (co-development)       | Stop after each checkbox                 | Review increment size (per-task to per-parent) |
| Completion protocol (check → mark → verify → report → stop) | P2 + P4                   | Full ceremony                            | Protocol steps and ordering                    |
| Deferred review                                             | P2 (co-development)       | User-defined scope                       | Scope and conditions                           |
| Conventional commit format                                  | P6 (traceability)         | `type(scope): description`               | Any communicative format                       |
| Context footer on commits                                   | P6 (traceability)         | `Context: tasks-*.md (Task X.Y)`         | Any commit-to-work linking method              |
| Atomic commits                                              | P6 (traceability)         | One logical change per commit            | Unit of organization (commit or PR)            |
| Branch naming conventions                                   | P6 (traceability)         | `feature/`, `technical/`, etc.           | Any consistent naming scheme                   |
| Zero-tolerance quality gates                                | P4 (quality gates)        | All errors must be fixed                 | Severity levels, warning-level gates           |
| Tiered quality gate system (Tier 1/2/3)                     | P4 (quality gates)        | Per-task / per-unit / per-phase          | Tier boundaries and gate contents              |
| CURRENT-SESSION.md                                          | P5 (context preservation) | Dedicated session state file             | Alternative structured mechanisms              |
| Session init/handoff ceremonies                             | P5 (context preservation) | Structured document loading protocol     | Ceremony adapted to agent type                 |
| Leave it cleaner (capture floor)                            | P4 (quality gates)        | Fix or document pre-existing issues      | Fix-now vs. capture-and-defer                  |
| Collaborative voice in docs                                 | P9 (dual-audience)        | Team perspective, no "user/AI" framing   | Documentation style                            |
| Reference-style markdown links                              | P9 (dual-audience)        | Reference links, definitions at file end | Link formatting style                          |
| No meta-project references in code                          | P9 (dual-audience)        | Task IDs stay in `.arc/` docs            | Enforcement strictness                         |
| Agent-specific file structure                               | P8 (agent-agnostic)       | `CLAUDE.md`, `GEMINI.md`, etc.           | File naming and location                       |

### Positioning: Multi-Agent and Autonomy Spectrum

ARC is built for collaborative development — tight human-agent pairing where both parties contribute their distinct
strengths through frequent interaction. This is a deliberate design choice, not a limitation to be overcome.

**Core reframe:** The industry's default framing treats human single-threaded attention as a bottleneck. ARC's position:
human attention being single-threaded is a feature, not a bug. It forces focus, ensures quality human input at every
step, and produces work that reflects genuine human judgment. Throughput alone is not the gold standard for most work.

**Where ARC's model provides distinct value:**

- Novel, complex work where requirements are ambiguous or emergent
- Human-facing software where user experience, taste, and judgment matter
- Work requiring institutional context not fully captured in code or documentation
- High-stakes decisions where the cost of errors exceeds the cost of slower execution
- Learning environments — both the human learning the domain and the agent learning the project

**Where orchestration and high-autonomy agents provide legitimate value:**

- Bounded, deterministic domains: batch migrations, boilerplate generation, CI/CD automation, large-scale refactoring
  with known patterns
- Triage and exploration: bounded autonomy for information gathering (ARC's own research sub-agent uses this pattern)
- Parallel execution on truly independent, well-specified work — with the key qualifier that "well-specified" means
  someone did the spec-directed planning work first

**Sequential agent handoffs are compatible:** Using different agents for different phases (e.g., one for design, another
for implementation) is sequential, not parallel. The human is the continuity thread with full attention on each phase.
This is fully compatible with ARC's principles.

**The bookend pattern (acknowledged, not promoted):** ARC's planning output serves as a quality dispatch specification,
and ARC's quality gates provide rigorous integration. Teams that delegate execution to autonomous agents for
well-specified, bounded work are using ARC for planning and integration while the execution phase operates under a
different model. This is an acknowledged pattern for bounded work — not the recommended primary workflow. If delegation
becomes the default path, ARC's most distinctive value (the tight co-development loop, the complementary strengths) is
lost.

## Consequences

### Positive

- **Sharp adoption boundary:** Adopters can evaluate ARC by reading the principles and knowing exactly what they're
  committing to. No trial-and-error discovery of hidden requirements.
- **Configurable without losing identity:** Conventions can be adapted to team context (commit format, review
  granularity, tracking tools, session mechanisms) while principles ensure the methodology retains its distinctive
  value.
- **Audit dealbreakers resolved:** All three adoption-blocking issues (conventional commit format, context footer,
  squash merge incompatibility) are classified as conventions — configurable without principle violation.
- **Friction points addressed:** 6 of 7 audit friction points are convention-level, giving WU2 clear scope to make them
  configurable.
- **Agent compatibility clarified:** CLI and IDE agents are within ARC's design envelope; async delegation agents are
  outside it. No ambiguity about where ARC's methodology applies.
- **Evidence-grounded philosophy:** Three-pillar justification (cognitive science, human-for- humans, complementary
  strengths) provides durable, citable reasoning rather than assertion.
- **Clear design foundation for WU2-WU4:** Downstream work units can implement against a stable set of principles rather
  than navigating ambiguous requirements.
- **Practical co-development benefits:** Frequent review increments reduce costly rework (issues caught early, not after
  large autonomous work blocks). Active developer involvement prevents codebase-as-black-box — the developer maintains
  familiarity with implementation because they participated in building it, improving long-term maintainability. The
  co-development model also sustains developer engagement rather than reducing them to reviewers of AI output.

### Negative

- **11 principles is a substantial commitment.** Adopters must honor all of them to be meaningfully "using ARC." This is
  intentional (ARC has a clear identity) but may deter teams looking for a lighter framework.
- **Co-development requirement excludes async agents.** Teams wanting to use ARC with Jules, Codex cloud, or Devin for
  primary execution cannot do so within the framework's principles. The bookend pattern offers a partial accommodation
  but not full methodology coverage.
- **Value proposition self-selects audience.** ARC's positioning prioritizes the quality of human-agent collaboration
  over raw development throughput. This naturally narrows the audience compared to throughput-focused frameworks — teams
  that prioritize speed above all else will choose different tradeoffs. This is the natural consequence of having a clear
  identity, not a deficiency, but it does mean ARC isn't trying to be everything to everyone.
- **Convention count is high.** 19 conventions require WU2 to design configuration mechanisms for each. Some may
  consolidate naturally during implementation.

### Risks

- **Principle inflation:** Over time, conventions may drift back toward being treated as principles in practice,
  especially in documentation and agent guidance. WU2 should build explicit principle/convention markers into framework
  documents.
- **Review increment terminology:** "Review increment" is proposed but not yet established. If the term doesn't land
  with adopters, the principle/convention boundary around review granularity may remain confusing.
- **Pillar 2 (human-for-humans) is philosophical, not empirical.** Unlike pillar 1 (cognitive science), this argument
  rests on values rather than measurement. It will resonate with some adopters and not others. The ADR should present it
  as a values-based position, not a factual claim.

---

Context: tasks-philosophy-configurability.md (Task 2.2.d)
