# Strategy: Core Philosophy

**Purpose:** Define what ARC is — its principles, its reasoning, and where it fits. This is the
authoritative reference for ARC's identity. An evaluating team should be able to read this document
and understand what they're committing to.

**Scope:** Philosophy, principles, and positioning. For the configurability architecture (config
settings, extension points, method overrides, adoption profiles), see
[strategy-configurability-architecture.md][config-arch].

---

## Contents

- [What ARC Is](#what-arc-is) — identity and premise
- [Philosophical Foundation](#philosophical-foundation) — the reasoning behind ARC's design
- [Principles](#principles) — the 11 non-negotiable commitments (P1-P11)
- [The Principle/Convention Boundary](#the-principleconvention-boundary) — three-tier flexibility
  model
- [Positioning](#positioning) — where ARC fits, agent compatibility, explicit boundaries

---

## What ARC Is

The ARC Framework is a development methodology for human-AI collaboration. It structures how a
developer and an AI agent work together through implementation — planning, executing, verifying,
and preserving context across work sessions.

The methodology is built on a specific premise: that focused, iterative collaboration between a
human and an agent produces better work than either delegation or ad-hoc prompting, for the kinds
of work where quality, judgment, and maintainability matter. This premise has tradeoffs. ARC
optimizes for the quality of the collaboration, not for raw throughput. Teams that primarily need
throughput on well-specified, bounded work may find other approaches more appropriate.

ARC has 11 non-negotiable principles that define its identity, and a set of configurable conventions
that implement those principles. The principles are what make ARC *ARC* — remove one and the
methodology loses its coherence. The conventions are strong defaults that teams can adapt to their
context without leaving the framework.

---

## Philosophical Foundation

Three observations inform ARC's design. None of them are novel — they're well-established in
cognitive science, software practice, and the emerging experience of AI-assisted development. ARC's
contribution is taking them seriously as design constraints rather than treating them as problems to
solve around.

### Cognitive reality

Human attention is single-threaded for novel knowledge work. This is one of the most replicated
findings in cognitive psychology, supported by over 70 years of evidence from Broadbent's filter
model (1958) through Pashler's dual-task interference work (1994) to contemporary research.
Task-switching costs up to 40% of productive time (Rubinstein, Meyer & Evans, 2001). Recovery from
interruptions averages 23 minutes for knowledge workers (Mark, Gudith & Klocke, 2008) and 10-15
minutes for software engineering specifically (Lestan, Leventis & Ivanovic, 2024).

Genuine exceptions exist — supertaskers (roughly 2.5% of the population, innate and not trainable;
Watson & Strayer, 2010), practiced time-sharing under narrow conditions, domain-structured
multitasking like air traffic control. None of these generalize to novel, semantically rich work,
which is what AI-assisted software development is.

ARC designs for this. Its sequential execution model, bounded work sessions, and single-task focus
are environmental structure that works with the attention constraint rather than against it —
analogous to how air traffic control uses radar, separation standards, and checklists to manage
inherent attention limits through intelligent task ordering.

### Human-for-humans

Software is overwhelmingly produced for human consumption. Deep human involvement during
development is quality input, not just quality control. Humans bring perspective, taste, and
judgment about what feels right that an agent modeling human needs cannot replicate.

A cultural parallel: there is widespread resistance to AI-produced creative work — a felt
distinction between "things that are supposed to be human" and "things where it doesn't matter."
Most software sits closer to the former than the industry currently admits, certainly any software
where user experience matters. This argument is values-based, not empirical. It won't resonate
with everyone. But it is more durable than the cognitive argument — it doesn't diminish as AI
capabilities improve.

Fully delegated development optimizes for an abstraction of human needs. Co-development keeps
a human with lived experience of the problem domain actively shaping the implementation. The
practical effect: developers who participate in building the implementation maintain familiarity
with how it works. When maintenance needs arise in days, weeks, or months, they have context
because they were there — not because they reviewed a PR. Delegation-based approaches risk
producing code that no human deeply understands, creating maintenance debt that accumulates
quietly.

### Complementary strengths amplified by interaction frequency

Human and agent bring fundamentally different capabilities. Humans: perspective, institutional
context, judgment, lived experience with the problem domain. Agents: breadth of knowledge, speed,
tooling, pattern recognition across training data. Neither is sufficient alone — the output is more
robust than either achieves independently.

That robustness scales with interaction frequency. Each exchange is an opportunity for both parties
to contribute what they're good at. Agents perform better with sharper context; frequent human
input provides exactly that. Humans benefit from the agent's speed and breadth at each step.
Lengthen the interval between interactions and you underutilize both: the agent gets fewer course
corrections, the human gets fewer chances to leverage the agent's capabilities.

The practical consequence: catching issues at the task level — while context is fresh and the
scope is small — is dramatically cheaper than catching them after a large autonomous work block.
The industry's emerging experience with "agent produces PR, human reviews" workflows bears this
out — the review surface area is too large, issues compound, and rework costs often exceed the
time saved by delegation. Frequent review also sustains developer engagement. A documented pattern
is emerging where developers reduced to reviewing AI output lose context on their own codebase,
and review quality degrades because disengaged review is ineffective review.

### The operating premise

The industry's default framing treats human single-threaded attention as a bottleneck — something
to minimize, parallelize around, or eliminate. ARC's position: human attention being
single-threaded is a design constraint worth respecting. It forces focus, ensures quality human
input at every step, and produces work that reflects genuine judgment. Throughput is not the only
measure of effective development, and for most work it is not the most important one.

This is a deliberate stance with real costs. ARC is not the right choice for every team or every
kind of work. Where it fits and where it doesn't is addressed in [Positioning](#positioning).

---

## Principles

ARC's 11 principles define its identity. They are non-negotiable — an adoption that doesn't honor
all of them is not meaningfully using ARC. Under each principle, conventions (configurable methods)
implement the principle in practice. Conventions are strong defaults; changing them doesn't change
what ARC is. The [principle/convention boundary](#the-principleconvention-boundary) section explains
this distinction.

Principles are numbered P1-P11 for stable reference across the framework. The grouping below is
conceptual — it reflects how the principles relate to each other, not a hierarchy of importance.

### Core commitments

These define ARC's distinctive approach to development.

#### P1. Spec-driven development

Development begins from explicit, written specifications that establish intent, scope, and success
criteria before implementation. Planning leads execution at every level, not the reverse.

Remove this and the methodology collapses into ad-hoc AI prompting with organized folders. The
specification is what makes work directed rather than reactive. Decomposition may be refined
iteratively, but it always precedes the work it governs.

Not every action requires formal specification. Quick fixes with clear scope can rely on well-crafted
commits as the record. ARC provides methods for specification; teams decide how strictly to apply
them based on context.

*Conventions:* The specific document hierarchy (META-PRD → PRD → task list), file naming and
locations, template formats, and the constitutional document set.

#### P2. Human-agent co-development

Humans and AI agents collaborate through tight, iterative feedback loops. Review happens during
work, not after it. The human directs; the agent executes within bounded scope, reports back, and
the cycle repeats.

This is ARC's most distinctive characteristic — not review-at-merge-time, but continuous iterative
refinement. The human is a co-developer, not merely a reviewer. Even when the developer isn't
directly editing code, they contribute context, judgment, and course correction at every review
increment. The human takes professional ownership of the work: their name is in the commit author
field, and they bear responsibility for the output.

The bounded chunk of autonomous execution between human review points — the "review increment" —
must be kept small enough to maintain this collaboration. Per-task or per-task-grouping is the
right range: small enough for meaningful feedback, large enough for productive autonomous
execution. Per-edit review destroys momentum; per-phase review loses the methodology's value.

*Conventions:* ARC's task list system provides the default review boundary structure. The specific
tracking mechanism, completion protocol steps, review granularity, and deferred review scope are
configurable.

#### P3. Focused, sequential execution

ARC is built around focused, sequential work. The vast majority of development should follow this
pattern, and the framework is designed on the basis that focused work produces better results than
the alternative for most application domains.

The [philosophical foundation](#philosophical-foundation) explains the reasoning in detail. In
brief: the cognitive evidence supports sequential focus for novel knowledge work, the human
involvement that co-development requires is single-threaded by nature, and interaction frequency
between developer and agent benefits from sustained attention.

This does not mean all parallelism is prohibited. Multiple work units active on different branches
(team-level parallelism) is fine. Sequential agent handoffs (one agent for design, another for
implementation) are compatible — sequential, not parallel. Supplementary agents for bounded,
well-defined tasks — research gathering, codebase exploration, targeted analysis — are a natural
part of the workflow; the developer remains the continuity thread, directing the primary work while
incorporating supplementary results as they arrive. What P3 addresses is the developer's own
attention: one primary line of work at a time, with the sustained focus that makes co-development
effective.

*Conventions:* The enforcement mechanism (one checkbox plus mandatory stop after each task) is
covered under P2's review increment. This principle provides the justification for keeping review
increments small and sequential.

### Operational discipline

These make the core commitments reliable in practice.

#### P4. Quality gate enforcement

Automated quality verification is a required step before work is considered complete. Quality is
verified, not assumed.

Quality gates are the feedback mechanism that makes directed collaboration reliable. Without
automated verification, the agent can declare "done" with no check, and errors compound across
review increments. The principle is about the existence of automated verification — not the
specific gates, tools, or strictness level.

*Conventions:* Zero-tolerance policy, specific tier definitions (Tier 1/2/3), specific tools, and
when each tier runs. The "leave it cleaner" practice (discovered issues must at minimum be
documented rather than dismissed) is convention with a capture floor.

#### P5. Context preservation

Work context must be recoverable across work boundaries through structured, human-controlled, and
transparent mechanisms. Knowledge gained during work — decisions, state, rationale — must not be
lost when a session ends.

Without context preservation, each session starts from scratch and the recursive feedback loop
breaks entirely. The mechanism must be structured (consistent format),
human-controlled (the human decides what's preserved and can edit it), transparent (visible and
debuggable), and predictable (reliable recovery, not dependent on ambient tool features).

Context preservation is also proactive. Agent output quality degrades measurably as context
accumulates within a session — the research evidence on this is clear and well-supported. Active
context quality management during work (monitoring utilization, recognizing degradation) is part of
this principle, not just recovery at session boundaries.

Sessions — bounded, intentional periods of agent-assisted work with explicit start and end states —
are the natural container for this. They bound degradation by providing reset points, enforce
methodology discipline through the establish-execute-capture rhythm, and create natural review and
commit points.

*Conventions:* WORK-STATUS.md + SESSION-NOTES.md, session initialization and handoff ceremonies, specific context
quality thresholds, and what triggers session end. Alternative mechanisms that satisfy the
structured/human-controlled/transparent/predictable criteria are valid.

#### P6. Traceability through version control

Work is traceable — changes link back to the intent that motivated them. Git serves as the
canonical record of what was done, when, and why.

Git is assumed as the VCS. This is pragmatic: git is universal across all agent tools surveyed and
effectively synonymous with version control in current practice. Non-git VCS is escape-hatch
territory. The deeper principle is traceability itself — the ability to follow the thread from any
change back to the decision that motivated it.

Teams using different merge strategies satisfy this principle differently. With merge or rebase
commits, traceability lives in individual commit messages. With squash merges, traceability shifts
to PR descriptions. Either way, the thread from change to intent must be followable.

*Conventions:* Conventional commit format, context footer format, atomic commit granularity, branch
naming conventions, platform-specific tooling (GitHub CLI, PR workflows).

#### P7. Granular task tracking

Work is decomposed into explicit, trackable increments before execution. Progress is visible and
verifiable — not implicit in code changes or assumed from activity.

Task tracking is the operational bridge between spec-driven development (P1) and the co-development
loop (P2). Specifications define intent; tracking makes that intent executable and reviewable at the
right granularity. Tracking granularity should roughly match review increment granularity — this
connection ensures the methodology's components reinforce each other.

*Conventions:* Markdown checkboxes in task list files, task list naming and formatting, specific
granularity guidelines. Teams using external trackers (Jira, Linear, GitHub Issues) can satisfy the
principle through those tools.

### Design commitments

These govern how ARC itself is built and how it relates to the tools and teams that use it.

#### P8. Agent-agnostic design

ARC's methodology is defined independently of any specific AI tool. The framework's value is the
methodology, not coupling to one AI product.

Agent lock-in would be a design failure. Core workflows are written in agent-neutral terms, with
agent-specific guidance isolated to dedicated files. Agent-agnostic does not mean universally
compatible — some agent types are philosophically misaligned with ARC's co-development model. The
goal is clarity about which assumptions are load-bearing and where the methodology applies, not
universal compatibility.

*Conventions:* The hub-spoke file architecture — AGENTS.md as the shared entry point for all
agents, with agent-specific files (CLAUDE.md, GEMINI.md, etc.) supplementing guidance unique to
each tool. This structure supports multi-agent use within a project: teams may use different agents
for different tasks or phases, and each agent loads the shared methodology plus its own operational
guidance. The specific file naming, agent-neutral workflow abstractions, and what lives in shared
docs versus agent-specific files are all convention.

#### P9. Dual-audience documentation

All project artifacts are structured for both human comprehension and AI agent consumption.
Documentation that only works for one audience misses the purpose of a framework designed for
human-AI collaboration.

The dual-audience principle drives template structure, formatting choices, and content organization
throughout the framework.

*Conventions:* Specific formatting rules, template layouts, collaborative voice in documentation,
reference-style links.

#### P10. Recursive improvement

The framework and the projects that use it improve through documented feedback loops. Patterns are
codified from experience; decisions are captured; future work builds on prior context rather than
starting fresh.

Without knowledge evolution, ARC is a static project management template. The recursive feedback —
decisions documented, patterns extracted, future work informed by prior cycles — is what makes it a
living methodology. This applies at two levels: projects accumulate institutional knowledge across
sessions, and the framework itself improves through the same mechanism (ARC is developed using
ARC).

*Conventions:* The specific evolution path (working notes → strategy documents → constitutional
docs), archival processes, where patterns live.

#### P11. Shared-context co-development

Developer and agent operate in shared context with mutual visibility. The developer can see what
the agent is doing, intervene at any point, and contribute directly to the same work artifacts.

This is what enables the tight interaction loop (P2) and the complementary strengths dynamic. If
the agent works in an opaque sandbox and the developer only sees output, collaboration is replaced
by review. Shared context means both parties have access to the same state during work — not just
at commit time.

*Conventions:* Local CLI with filesystem access is ARC's primary design target. The specific
mechanism (terminal, editor, remote session) is convention; the shared context and mutual
visibility requirement is not.

---

## The Principle/Convention Boundary

ARC uses a three-tier flexibility model:

1. **Principle (tier 1)** — Non-negotiable. Defines ARC's identity. Removing it means you're not
   using ARC.
2. **Convention (tier 2)** — Configurable method with a sensible default. Changing it keeps ARC
   intact. This is the assumed approach unless an alternative is configured.
3. **Escape hatch (tier 3)** — Something ARC doesn't formally support but doesn't block. Outside
   the design envelope, acknowledged without active design investment.

The test applied to every practice: "If an adopter changed or removed this, would they still be
meaningfully using ARC?" Yes → convention. No → principle.

A few examples to make this concrete:

- **Conventional commit format** is a convention (under P6). Teams can use any communicative format
  and still maintain traceability.
- **Per-task mandatory review stop** is a convention (under P2). Teams can adjust the review
  increment size while still maintaining co-development.
- **Quality gate enforcement** is a principle (P4). Removing automated verification entirely is
  outside ARC.
- **Squash merging** is an escape hatch. ARC accommodates it by shifting traceability to PR
  descriptions, but it sacrifices the granular commit history that the default merge strategy
  preserves.

ARC currently has 19 conventions across the 11 principles. The full inventory and the configuration
mechanisms (config settings, extension points, method overrides, adoption profiles) are covered in
the [configurability architecture strategy][config-arch].

---

## Positioning

### Where ARC operates

ARC governs how a developer-agent pair works through implementation. It operates at the execution
level — below and alongside team coordination methodologies.

| Level               | Governs                                  | Examples                     |
|---------------------|------------------------------------------|------------------------------|
| Portfolio / program | Strategic direction, resource allocation | SAFe, OKRs                   |
| Team coordination   | What to build, when, by whom             | Scrum sprints, Kanban boards |
| **Execution pair**  | **How a developer and agent implement**  | **ARC methodology**          |

Scrum answers: "What does the team commit to this sprint?" Kanban answers: "What's the next
highest-priority item to pull?" ARC answers: "How does this developer-agent pair work through
this task effectively?"

These are complementary because they address different concerns at different scales. A Scrum team's
sprint planning decides *what* gets built. ARC's task loop governs *how* each developer-agent pair
works through their assigned items. ARC does not replace or compete with team-level methodologies.
For teams without an existing methodology (solo developers, small teams working ad-hoc), ARC
provides the planning discipline, execution structure, and knowledge preservation they may
currently lack.

### Agent compatibility

ARC is designed for and validated with conversational agents where the developer and agent share
context in real time.

**Primary design target — CLI conversational agents.** Claude Code, Codex CLI, Gemini CLI, Aider.
ARC's session model maps directly to the conversation lifecycle. Context loading, review increments,
and workflow invocation all work as designed.

**Compatible — IDE conversational agents.** Cursor, Windsurf, GitHub Copilot (agent mode), Cline,
Roo Code. These provide shared context through the editor and iterative feedback through
conversation threads. Session ceremonies may be lighter (IDE persistence and indexing reduce the
loading ceremony), but the methodology applies.

**Off-label — cloud and async delegation agents.** Jules, Codex cloud, Devin, SWE-Agent. ARC
can function at the boundaries: planning output serves as a specification, and quality gates
provide integration verification. But the core value — iterative co-development with frequent
human input — is absent during the execution phase. This is not a prohibition. There are legitimate
use cases for delegation: bounded deterministic work, triage and exploration, parallel execution on
well-specified tasks. ARC acknowledges these without claiming they have no value. But delegation as
the primary workflow is outside ARC's design center.

### What ARC is not

To be explicit about boundaries:

- **Not a team coordination methodology.** ARC does not prescribe sprint length, story format,
  estimation approach, team ceremonies, team roles, board structure, or backlog prioritization.
- **Not universally agent-compatible.** ARC is honest about where its methodology applies and where
  it doesn't. Claiming broad compatibility and underdelivering would be worse than being clear
  about the design target.
- **Not a throughput optimizer.** ARC optimizes for the quality of developer-agent collaboration.
  Teams that primarily need to maximize code output velocity on deterministic, bounded work may
  find delegation-based approaches more appropriate for that work.
- **Not a team-level or organizational methodology.** ARC governs the execution pair — the same
  way Scrum governs the sprint and Kanban governs the flow. It complements team coordination tools
  and methodologies rather than replacing them.

---

## Relationship to Other Documentation

- **[Configurability architecture strategy][config-arch]** — The companion to this document. Covers
  config settings, extension points, method overrides, adoption profiles, and the full convention
  inventory. This document defines *what ARC is*; that document defines *how teams customize it*.
- **ADRs (`.arc-internal/reference/adr/`)** — The immutable decision records behind this strategy.
  ADR-001 through ADR-006 document the analysis, alternatives considered, and consequences for each
  design decision. This strategy synthesizes those decisions into living guidance.
- **[Development methodology strategy][dev-methodology]** — Operational rules for how work happens
  (commit standards, session management, task protocols). Complements this document's philosophical
  grounding with practical workflow constraints.

---

[config-arch]: strategy-configurability-architecture.md
[dev-methodology]: ../../constitution/DEV-RULES.ARC.md
