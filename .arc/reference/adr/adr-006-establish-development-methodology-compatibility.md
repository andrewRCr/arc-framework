# ADR-006: Establish Development Methodology Compatibility

## Status

Accepted

## Context

ADR-001 established ARC's 11 principles and 19 conventions, including focused sequential execution (P3), granular
task tracking (P7), spec-directed development (P1), and quality gate enforcement (P4). These define how a
developer-agent pair works through implementation. But a question remained open: how does this execution model
coexist with the team-level methodologies that govern how professional software teams plan, coordinate, and deliver?

This is not an edge case. The research is unambiguous on prevalence:

- 97% of organizations use Agile methods in some form
- 87% of Agile teams use Scrum; 56% use Kanban; 27% use Scrumban
- 44% of large enterprises use SAFe
- 31.5% of teams use hybrid/homegrown approaches (fastest-growing segment)
- Only 15-20% of professional developers work solo without team-level methodology

If ARC's work organization model is incompatible with these methodologies, it excludes the vast majority of
professional teams. The design question: is ARC a complementary layer (works alongside Scrum/Kanban) or a
competing model (replaces sprint planning)?

**The potential conflict surface:** ARC prescribes spec-directed planning (PRDs → task lists), sequential focused
execution (one-task-at-a-time with mandatory stops), quality gate checkpoints (tiered verification), session
management (bounded work periods), and structured context preservation. Teams using Scrum already have sprint
planning, story decomposition, velocity tracking, Definition of Done, and sprint ceremonies. Teams using Kanban
have boards, WIP limits, cycle time metrics, and flow management. If ARC introduces a parallel planning and
execution system, adopters face either duplication (maintaining two systems) or replacement (abandoning their
methodology for ARC's) — neither is acceptable.

**Evidence base:**

- Development methodology landscape research: comprehensive inventory of 20+ methodologies with prevalence data,
  key constructs, integration patterns, and AI impact analysis
- ADR-001 through ADR-005: the principle/convention framework, session model, configurability architecture,
  adoption tiers, and external tool compatibility that this decision must be consistent with
- WU2-WU4 plans: downstream work that will implement methodology guidance, build CLI tooling, and produce
  adoption documentation — all of which depend on clear methodology positioning
- Integration pattern analysis: research identified four overlay patterns (lightweight specification, documentation
  as workflow, heavyweight overlay, methodology-specific overlay) with clear success/failure characteristics

## Decision

### Part 1: ARC as Complementary Execution Layer

We will position ARC as a **complementary execution layer** that operates at the developer-agent pair level,
below and alongside team-level methodologies. ARC does not replace Scrum, Kanban, Shape Up, or any other
methodology. It governs how a developer and their AI agent collaborate through implementation — a level of work
organization that existing methodologies do not address.

**The organizational level distinction:**

| Level                 | Governs                                  | Examples                     | Typical Artifacts          |
|-----------------------|------------------------------------------|------------------------------|----------------------------|
| **Portfolio/program** | Strategic direction, resource allocation | SAFe PI planning, OKRs       | Roadmaps, PI objectives    |
| **Team coordination** | What to build, when, by whom             | Scrum sprints, Kanban boards | Sprint backlogs, boards    |
| **Execution pair**    | How a developer-agent pair implements    | ARC methodology              | PRDs, task lists, sessions |

Scrum answers: "What does the team commit to this sprint?" Kanban answers: "What's the next highest-priority
item to pull?" ARC answers: "How does this developer-agent pair execute this task effectively right now?"

These are naturally complementary because they address different concerns at different organizational scales.
A Scrum team's sprint planning decides *what* gets built this sprint. ARC's task loop governs *how* each
developer-agent pair works through their assigned items. Neither needs to know the details of the other —
they interface through work items flowing from team planning into execution pair implementation.

**Why this positioning is the right one:**

The research on successful framework overlays is clear: lightweight overlays that enhance existing practice
without replacing ceremonies succeed. Heavyweight overlays that prescribe additional ceremonies on top of
existing ones fail — they create ceremony fatigue, duplicate work, and team resentment. ARC's value is in the
execution discipline it provides to developer-agent collaboration, not in competing with team coordination
methodologies that have decades of refinement and organizational buy-in.

This positioning also aligns with ADR-001's core identity. ARC's principles (P1-P11) are about the
developer-agent relationship: spec-directed development, co-development, focused execution, quality gates,
context preservation. None of them prescribe how a *team* should coordinate. The execution-pair level is where
ARC's principles live, and confining the methodology to that level is both honest and strategically sound.

### Part 2: Construct Mapping

ARC's constructs have natural counterparts in established methodologies. These mappings are illustrative — they
show how ARC's artifacts serve analogous purposes, not prescriptive — teams should adapt the mapping to their
context.

**Planning artifacts:**

| ARC Construct                   | Scrum Equivalent                       | Kanban Equivalent       | Shape Up Equivalent |
|---------------------------------|----------------------------------------|-------------------------|---------------------|
| PRD                             | Epic spec or refined story             | Card description        | Pitch document      |
| Task list                       | Story subtasks / sprint backlog detail | Checklist within card   | Scopes within a bet |
| Work unit (PRD + tasks + notes) | Epic with stories                      | Card with full context  | Shaped project      |
| Phases within task list         | Sprint goals (loosely)                 | Board columns (loosely) | Hill chart stages   |

**Execution constructs:**

| ARC Construct            | Methodology Parallel             | Why Compatible                                                                                   |
|--------------------------|----------------------------------|--------------------------------------------------------------------------------------------------|
| One-task-at-a-time       | WIP limit of 1 (execution level) | Kanban teams recognize instantly; Scrum velocity unaffected (multiple tasks complete per sprint) |
| Quality gates (T1/T2/T3) | Definition of Done               | ARC's tiered gates can serve as or supplement the team's DoD                                     |
| Review increment         | N/A (new concept)                | Operates below the level methodology addresses — within a developer's work session               |
| Session                  | N/A (developer-agent concept)    | Sub-sprint, sub-cycle work period — invisible to team-level methodology                          |
| Context preservation     | Team knowledge management        | Structured handoff serves the same purpose as good sprint notes or card comments                 |

**Work organization:**

| ARC Construct                                    | Methodology Parallel               | Integration Pattern                                               |
|--------------------------------------------------|------------------------------------|-------------------------------------------------------------------|
| `feature/` `technical/` `incidental/` categories | Story types, work item types       | ARC categories map to whatever taxonomy the team uses             |
| Branch model                                     | Team's existing branching strategy | ARC's branch conventions are configurable (ADR-003)               |
| Atomic commits with context                      | Team's commit conventions          | Configurable format (ADR-003), context footer adaptable (ADR-005) |
| Archive workflow                                 | Sprint/cycle closeout              | Runs when work completes, independent of sprint boundaries        |

**The key insight in this mapping:** ARC's constructs don't duplicate methodology constructs — they operate at
a finer granularity. A Scrum sprint backlog says "implement user authentication." An ARC task list says "here
are the 15 specific steps, in order, with quality checkpoints, that the developer-agent pair will execute to
deliver that story." These are different levels of decomposition serving different audiences (team vs. execution
pair).

### Part 3: Methodology-Specific Compatibility Analysis

#### Scrum (87% of Agile teams)

**Integration model:** ARC operates within sprints, not across them. Sprint planning determines what work enters
the sprint. ARC's task loop governs execution within the sprint.

**Workflow trace:**

1. **Backlog refinement** → ARC PRD creation serves as detailed story specification. Writing a PRD IS refinement
   — same activity, structured output.
2. **Sprint planning** → Team selects stories. ARC task lists provide the detailed decomposition for each story.
   Task list creation happens during or just before sprint planning.
3. **Sprint execution** → Developer activates ARC work unit, runs sessions, executes tasks. One-task-at-a-time
   governs agent collaboration rhythm. Multiple tasks complete per day; multiple stories complete per sprint.
   Sprint velocity is unaffected — ARC determines *how* tasks execute, not *how many*.
4. **Daily standup** → Developer reports task-level progress. ARC task list checkboxes provide precise status.
5. **Sprint review** → Completed work with ARC quality gate verification. Completion docs serve as review
   material.

**No fundamental conflicts.** Scrum ceremonies are team coordination events. ARC ceremonies (session-init,
completion protocol, quality gates) are developer-agent workflow steps that happen within a coding session. They
operate at different organizational levels and do not create duplicate meetings.

**Dual-tracker consideration:** Sprint backlogs typically live in Jira/Linear; ARC task lists in markdown. This
is the dual-tracker concern already addressed by ADR-005's method override mechanism. Two patterns work: (a) ARC
task list as agent-facing working scratchpad with Jira as team-facing status-of-record, or (b) ARC task lists as
the authoritative decomposition, with Jira tracking at the story/epic level only.

#### Kanban (56% of Agile teams)

**Integration model:** ARC provides execution discipline within Kanban's continuous flow. The fit is the most
natural of any methodology.

**Core parallel:** ARC's one-task-at-a-time is a WIP limit of 1 at the execution pair level. Kanban teams will
immediately recognize this concept — it's their own philosophy applied to developer-agent collaboration. Quality
gates serve as column transition criteria. Sessions are context-quality-bounded work periods within continuous
flow.

**No friction points significant enough to warrant mitigation.** Kanban's philosophy (limit WIP, optimize flow,
pull-based work) aligns with ARC's principles more naturally than any other methodology. Teams that understand
WIP limits will understand ARC's execution model intuitively.

#### Scrumban (27% of Agile teams, fastest-growing)

Combines Scrum's time-boxed planning with Kanban's continuous flow. ARC integrates via both patterns
simultaneously: sprint-level planning maps to PRD/task list creation, continuous execution maps to ARC's task
loop with WIP-limit-of-1 discipline. Scrumban teams already embrace hybrid approaches, making ARC as an
additional execution layer philosophically aligned.

#### Shape Up (< 2%, growing among product companies)

**Integration model:** ARC's PRDs parallel Shape Up pitches (pre-implementation specification with scope and
constraints). ARC's task decomposition provides the execution structure within six-week cycles.

**Friction point:** Shape Up teams value builder autonomy and minimal ceremony. ARC's completion protocol and
quality gates add execution-level structure. This is real but manageable — the essentials profile (ADR-004)
provides lighter enforcement, and ARC's ceremonies are developer-agent workflow steps, not team meetings that
erode autonomy.

#### SAFe and Enterprise Scale (44% of large enterprises)

**Integration model:** SAFe governs program-level coordination (PI planning, Release Trains). ARC governs
execution pairs. The organizational distance between these levels is large enough that they rarely interact
directly. ARC can function as the developer-agent execution methodology within SAFe teams, but SAFe teams
are unlikely to be early adopters due to existing ceremony load.

**Not a priority audience,** but not incompatible. No design changes needed.

#### Solo Developers and No-Methodology Teams (15-20% solo; 20-30% small teams ad-hoc)

**ARC IS the methodology.** No mapping needed — ARC provides the planning discipline, execution structure,
quality gates, and knowledge preservation these practitioners currently lack. This is ARC's strongest
adoption segment and where it provides the most transformative value. ARC scales from solo to small team
without architectural change (ADR-001's principles apply regardless of team size).

#### Waterfall and Plan-Driven (44% in mixed portfolios)

**Integration model:** ARC's spec-directed approach parallels waterfall's documentation-heavy tradition. PRDs map
to requirements specifications; task lists map to detailed design/implementation plans. ARC's iterative
task execution (test-first ordering, incremental quality gates) operates within waterfall phases without
requiring the team to adopt iterative delivery at the project level.

### Part 4: Ceremony Weight and the Execution Layer Framing

The primary adoption friction for methodology compatibility is not conceptual incompatibility — it is
**ceremony weight perception**. Teams already spending 8-10 hours per week in Scrum ceremonies (standup,
planning, review, retro) are sensitive to anything that feels like "more process."

**The reframe:** ARC ceremonies are not meetings. They are developer-agent workflow steps — structured
alternatives to ad-hoc AI prompting. The execution cost of ARC's task loop (session-init, completion
protocol, quality gates) replaces the rework cost of unstructured agent interaction (hallucinated
implementations, compound errors across large autonomous blocks, context loss between sessions).

**Framing for adopters:**

- "ARC doesn't add meetings to your calendar. It structures how you work with your AI tools."
- "Session-init takes 30 seconds. It replaces the 15 minutes you'd spend re-explaining context to a fresh
  agent conversation."
- "The mandatory stop after each task catches errors that would otherwise compound into hours of rework."

**Profiles address the calibration axis (ADR-004).** Teams that want lighter execution ceremony use the
essentials profile — same guidance, less enforcement. The methodology compatibility question (can ARC coexist
with Scrum?) is distinct from the ceremony weight question (how much execution structure does this team want?).
The first is resolved by organizational level separation. The second is resolved by profiles.

### Part 5: AI-Assisted Development and Methodology Evolution

ARC's methodology compatibility position should acknowledge a broader shift: AI-assisted development is
disrupting the assumptions that established methodologies rest on, and ARC's execution-layer positioning is
particularly relevant in this context.

**What AI changes at the team methodology level:**

- **Estimation destabilized:** Story points based on developer effort lose meaning when AI assistance varies
  the effort 2-5x depending on task type, AI tool, and developer experience. Teams are shifting from
  effort-based estimation (story points, ideal hours) to outcome-based tracking (throughput, cycle time).
- **Velocity metrics strained:** Sprint velocity becomes less predictable and less comparable across sprints
  as AI adoption varies. Some teams are abandoning velocity entirely in favor of flow metrics.
- **Code review bottlenecks:** AI generates code faster, but review capacity doesn't scale proportionally.
  More code produced per sprint means more to review — the review bottleneck tightens.
- **Specification clarity premium:** AI performs measurably better with detailed specifications (reducing
  hallucinations and rework). This creates tension with Agile's "embrace change" philosophy — detailed specs
  improve AI output but reduce adaptability.

**What AI doesn't change:** The fundamental need for team coordination (who works on what, when is it due, how
do we integrate). Scrum's sprint cadence, Kanban's flow management, and Shape Up's fixed timeboxes remain
relevant regardless of how code is produced. Methodology disruption is happening at the estimation and quality
layer, not the coordination layer.

**ARC's position in this landscape:**

ARC provides the **execution discipline that makes AI-assisted work trackable and predictable** regardless of
the team's coordination methodology. Specifically:

- **Spec-directed planning (P1)** produces the detailed specifications that AI performs best with — addressing the
  specification clarity premium without requiring the team to change their planning methodology. The team plans
  at their level (stories, cards, pitches); ARC decomposes at the execution level (task lists with acceptance
  criteria).
- **Quality gates (P4)** provide the verification that AI-generated code requires — catching issues at the
  task level rather than letting them compound to the PR level. This directly addresses the code review
  bottleneck: smaller verified increments are easier to review than large unverified blocks.
- **Granular tracking (P7)** provides task-level completion data that can inform team metrics regardless of
  methodology — cycle time per task, completion rate, quality gate pass rate. This data is methodology-neutral
  and can feed into Scrum velocity, Kanban throughput, or Shape Up scope tracking.
- **Context preservation (P5)** addresses the cross-session continuity problem that AI tools create —
  institutional knowledge that would otherwise be lost when an agent conversation ends or a tool is switched.

**This is not a claim that ARC solves the methodology disruption.** It is a recognition that AI-assisted
development creates a new execution-level concern (how to collaborate with agents effectively) that existing
methodologies don't address, and that ARC's execution-layer positioning fills this gap. Teams will continue to
use Scrum, Kanban, or their preferred coordination methodology. ARC provides the missing execution discipline
for the developer-agent pair within whatever coordination framework the team uses.

### Part 6: What ARC Does NOT Prescribe at the Team Level

To be explicit about boundaries, ARC does not prescribe or replace:

- **Sprint length or iteration cadence** — Teams choose their own cycle length. ARC sessions are sub-cycle.
- **Story format or estimation approach** — Story points, t-shirt sizes, no estimates — all compatible. ARC
  task lists are a finer decomposition, not an alternative to stories.
- **Team ceremonies** — No standups, planning meetings, reviews, or retrospectives are required by ARC.
- **Team roles** — No Scrum Master, Product Owner, or other role changes. ARC's "human in the loop" is
  whichever developer is working with the agent.
- **Board structure or workflow columns** — Teams organize their boards however they want. ARC operates
  within whatever workflow state means "in development."
- **Velocity, throughput, or other team metrics** — ARC provides task-level data that can inform team metrics
  but does not prescribe what to measure.
- **Backlog prioritization** — Teams prioritize using their own methodology. ARC activates whatever work the
  team has prioritized.

This boundary is intentional and load-bearing. ARC's value is in the execution discipline it provides — not
in replacing team coordination patterns that have organizational buy-in, training investment, and tooling
infrastructure behind them.

## Consequences

### Positive

- **No methodology exclusion.** The complementary-layer positioning means ARC is adoptable by Scrum teams,
  Kanban teams, Shape Up teams, and solo developers without requiring them to change their coordination
  methodology. This addresses PRD requirement 9 (methodology compatibility) with strong explicit support
  rather than edge-case accommodation.
- **Natural construct mapping.** ARC's artifacts (PRDs, task lists, quality gates) have clear parallels in
  every major methodology. Adopters can understand ARC's value proposition in terms they already know —
  PRDs are like detailed story specs, one-task-at-a-time is a WIP limit, quality gates are Definition of Done.
- **Kanban alignment is a messaging asset.** The WIP-limit-of-1 parallel gives ARC an immediately intuitive
  explanation for its most distinctive execution choice (one-task-at-a-time). Kanban is widely understood;
  borrowing its language makes ARC's model accessible.
- **Ceremony weight resolved by framing, not redesign.** ARC doesn't need to reduce its execution-level
  ceremony — it needs to clearly communicate that these are developer-agent workflow steps, not team meetings.
  The organizational level distinction does this work. Profiles (ADR-004) handle the remaining calibration.
- **AI-assisted development positioning is forward-looking.** Acknowledging the methodology disruption that AI
  creates, and positioning ARC as the execution discipline for this new reality, gives the framework a relevant
  and distinctive place in the evolving landscape.
- **Downstream work has clear scope.** WU2 can implement methodology-aware guidance in workflow docs. WU4 can
  produce methodology-specific adoption guides (Scrum team walkthrough, Kanban team walkthrough) on the docs
  site. Both have a clear principle to work from.

### Negative

- **"Complementary layer" may underwhelm.** Teams evaluating ARC might expect a full methodology — planning
  through delivery — and find "we complement your existing methodology" less compelling than "we replace your
  broken process." The positioning is honest but less dramatic. Documentation must make the execution-layer
  value proposition vivid enough to stand on its own.
- **Construct mapping is inherently approximate.** PRDs are not exactly epics, task lists are not exactly sprint
  backlogs, quality gates are not exactly Definition of Done. The parallels help adoption but may create false
  expectations about 1:1 correspondence. Documentation should frame these as analogies, not equivalences.
- **Dual-tracker overhead is real.** For Scrum teams with Jira, maintaining ARC task lists alongside Jira
  stories is additional work. ADR-005's method override mechanism addresses this architecturally, but the
  practical burden remains until WU2 implements it. Some teams will see this as overhead, not value-add.
- **No team-level guidance may disappoint.** By explicitly not prescribing team ceremonies, metrics, or roles,
  ARC leaves a gap for teams that want a complete AI-augmented development methodology. This is intentional
  (ARC stays in its lane) but means teams must combine ARC with a separate team methodology — which is more
  work than a single integrated system.

### Risks

- **"Complementary" may be read as "optional."** If ARC is just an execution layer, teams may conclude they
  can get by without it — their existing methodology plus ad-hoc AI prompting is "good enough." The value
  proposition must be strong enough that the execution discipline ARC provides is clearly worth the adoption
  cost. WU4's docs site and comparison content bear this burden.
- **Methodology-specific guidance may drift.** If WU4 produces Scrum and Kanban adoption walkthroughs, these
  will need maintenance as both ARC and the methodologies evolve. Keeping methodology-specific content minimal
  and principle-based reduces this risk.
- **AI methodology disruption is still unfolding.** Part 5's analysis of AI's impact on estimation, velocity,
  and review is based on 2025-2026 observations. The landscape is evolving rapidly — AI capabilities improve,
  teams adapt, new patterns emerge. The specific claims (estimation destabilized, review bottleneck) are well-
  supported now but may be less relevant in 2-3 years. The execution-layer positioning should be durable
  regardless; the specific AI-impact framing may need revision.
- **Enterprise adoption path unclear.** SAFe and large enterprise teams are acknowledged as "compatible but
  not priority." If enterprise adoption becomes strategically important later, a more detailed SAFe integration
  analysis may be needed. The current positioning doesn't block this but doesn't enable it either.

---

Context: tasks-philosophy-configurability.md (Task 5.4)
