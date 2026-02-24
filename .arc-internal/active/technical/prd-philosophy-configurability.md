# PRD: Core Philosophy & Configurability Architecture

**Type:** Technical
**Status:** Complete
**Completed:** 2026-02-24

---

## Introduction

ARC has been developed and battle-tested as a single-team, single-agent framework. Moving toward
1.0, the framework needs to answer foundational questions: What IS ARC at the philosophical level?
What's non-negotiable identity vs. configurable method? How do teams of any size adopt it without
hitting walls?

This work unit makes all design decisions that downstream work depends on. It produces ADRs and
strategy documents — no implementation. WU2 (methodology completion), WU3 (CLI/distribution), and
WU4 (public release) all consume WU1 outputs as their design foundation.

The root problem: ARC currently blurs the line between principles (what defines ARC) and methods
(how those principles are implemented). This causes adoption friction — teams encounter
non-negotiable-seeming requirements that are actually configurable methods, and vice versa. Drawing
a sharp principle/method boundary is the prerequisite for everything else.

## Goals

1. **Define ARC's identity** — Establish which principles are non-negotiable (defining what ARC IS)
   and which are configurable methods
2. **Design the configurability architecture** — Create the system that lets adopters tailor methods
   to their context (config schema, extension points, adoption tiers)
3. **Resolve agent and workflow assumptions** — Identify which workflow assumptions are
   load-bearing vs. incidental to the Claude Code development experience
4. **Enable team adoption** — Design patterns for external tool integration, merge strategy
   flexibility, and progressive onboarding
5. **Create authoritative reference material** — ADRs as immutable decision records, strategy
   documents as living guidance for WU2-WU4

## Use Cases

These scenarios illustrate the decisions this work must support. Each represents a real adoption
path the architecture must accommodate.

1. **Solo developer, new project** — Initializes ARC (via CLI or manual copy), follows basic tier,
   uses ARC's built-in methods (task lists, atomic commits, session handoffs). Everything works
   out of the box.
2. **Small team, squash-merge workflow** — Adopts ARC but uses squash merges on PRs. Needs
   commit philosophy to adapt: PR descriptions carry context instead of individual commits.
   Task lists remain the detailed record regardless.
3. **Team with existing Jira/Linear workflow** — Wants ARC's spec-driven methodology and quality
   gates but tracks work in an external tool. ARC workflows reference practices, not specific
   tools. Extension points accommodate their tracker integration.
4. **Team running Scrum sprints** — Uses two-week sprints, story points, velocity tracking,
   standup ceremonies. Asks: "How do ARC PRDs map to stories? Are ARC tasks subtasks under
   stories? Does one-task-at-a-time conflict with sprint velocity? Can we use ARC's quality
   gates within our sprint workflow?" ARC's work organization model must either map cleanly to
   sprint planning or explicitly support it as an alternative decomposition layer. Incompatibility
   here makes ARC a non-starter for a large segment of professional teams. (Research needed —
   validate how common sprint-based workflows are and identify specific integration points.)
5. **IDE-integrated agent (not terminal-based)** — Uses Cursor, Windsurf, or similar. May have
   persistent memory, no explicit session boundaries. ARC's context-preservation principle holds,
   but the session-init/handoff method may not apply. (Research needed — limited direct
   experience with IDE agent workflows.)
6. **Agent with very large context window** — Uses Gemini (1M tokens) or Claude with extended
   context. Handoffs become less frequent but not eliminated. ARC should favor guidance on
   keeping sessions tightly focused (~200k) regardless of capacity, based on evidence that
   context quality degrades well before the window fills. (Research needed — verify degradation
   claims before codifying in guidance.)
7. **Cloud or remote-client agent** — Uses Claude on the web, Codex desktop app, or similar
   hosted agents that manage their own branches and work asynchronously. ARC is built assuming
   local CLI tooling with direct filesystem co-development. The design should acknowledge this
   pattern and articulate why ARC favors the co-development model, without ruling out
   compatibility where possible.
8. **Factory-style autonomous agent** — Uses Devin, SWE-agent, Copilot Workspace, or similar
   systems that receive a task, work autonomously, and submit complete PRs with minimal human
   interaction during execution. Represents the furthest point from ARC's co-development model.
   The design should acknowledge this pattern exists and articulate where ARC's human-in-the-loop
   approach provides distinct value, without claiming factory-style agents have no valid use
   cases. (Research needed — understand current capabilities and typical workflows.)
9. **Team transitioning from multi-agent orchestration** — Coming from systems with autonomous
   agent delegation, parallel execution, and minimal human checkpoints. Represents the most
   extreme philosophical switch to ARC. The design should make the value proposition clear for
   this audience: what they gain (control, predictability, auditability) and what the transition
   looks like, without dismissing what orchestration does well in other domains. Note: sequential
   agent handoffs with human checkpoints between (e.g., Claude for design, Codex for
   implementation) are distinct from autonomous orchestration and compatible with ARC's model —
   the philosophy should acknowledge this spectrum.
10. **Open source project** — Contributors come and go with no persistent context. PRDs, task
    lists, and ADRs serve as onboarding material and institutional memory. ARC's documentation-
    driven model is a natural fit, but workflows may need to accommodate asynchronous
    contribution patterns and less-structured collaboration.
11. **Team on GitLab or Bitbucket** — Uses a platform other than GitHub. ARC currently assumes
    GitHub (Actions CI, `gh` CLI, PR-based workflows). The design should identify which platform
    assumptions are configurable methods vs. which are load-bearing. Most should be methods.
12. **Team evaluating ARC** — Reads the philosophy doc, understands what they're committing to
    (principles) vs. what they can customize (methods). Makes an informed adoption decision
    without trial-and-error discovery of hidden requirements.

## Requirements

### Foundational Decisions

These establish the conceptual framework that all other requirements build on.

1. **Define core identity and non-negotiables (ADR candidate)** — Enumerate ARC's non-negotiable
   principles and distinguish them from configurable methods. Scrutinize each candidate
   (spec-driven development, granular task tracking, human-agent pairing, minimal parallelism,
   quality gates, session documentation, git-native workflows) for whether it's truly
   identity-defining or an implementation choice. Must also explicitly position ARC relative to
   the multi-agent orchestration paradigm — articulate why ARC favors tight human-agent coupling
   and single-threaded execution without being dismissive of orchestration's value in other
   domains. This philosophical positioning is core to ARC's identity and should be part of the
   philosophy document, not an afterthought.

2. **Evaluate the session model (ADR candidate)** — Determine whether the explicit session model
   (CURRENT-SESSION.md, session-init, session-handoff) is a principle or a method. The core
   question: is the principle "sessions with explicit boundaries" or "context must be
   recoverable"? Answer has significant WU2 scope implications.

3. **Assess agent-agnosticism (ADR candidate)** — Identify which workflow assumptions are genuinely
   agent-agnostic vs. shaped by the Claude Code experience. Cover the full agent spectrum:
   - **CLI agents** (Claude Code, Codex CLI, Gemini CLI) — ARC's primary design target
   - **IDE-integrated agents** (Cursor, Windsurf) — persistent memory, different session model
   - **Cloud/remote agents** (Claude web, Codex desktop) — own-branch workflows, asynchronous
   - **Large-context agents** (1M+ token windows) — less frequent handoffs, context quality
     tradeoffs
   - **Factory-style agents** (Devin, SWE-agent, Copilot Workspace) — autonomous task-to-PR,
     minimal human interaction during execution

   Specific assumptions to evaluate: conversational interaction, context window loading,
   turn-based execution, terminal-based co-development, local filesystem access, slash commands,
   deferred review. Goal is not universal compatibility but clarity on which assumptions are
   load-bearing and where ARC's workflows need adaptation points vs. where the CLI co-development
   model is genuinely foundational to how ARC works.

### Configurability Architecture

These design the mechanisms that implement the principle/method distinction. Prior research
validated a three-tier flexibility model: **non-negotiable** (principles — cannot be changed),
**convention** (methods — configurable with sensible defaults), and **escape hatch** (things ARC
doesn't formally support but doesn't block). The design should preserve this three-tier framing
rather than collapsing to a binary principle/method split. See `notes-philosophy-configurability.md`
for detailed starting positions from prior planning.

4. **Design the configuration system (ADR candidate)** — Define what goes in `arc-config.yml`:
   setting categories, format constraints, schema design. Must remain shell-parseable (hooks
   read it without a YAML library). Config options exist only for conventions (tier 2), never
   for non-negotiables (tier 1). Escape hatches (tier 3) may need their own design pattern
   distinct from standard config. Tightly coupled with requirement 1.

5. **Define extension point conventions (ADR candidate)** — Design how extension points work in
   prose workflows: format, contract, placement conventions. Must be visible enough for discovery
   but unobtrusive enough for readability. Extension points add behavior; config switches toggle
   behavior — the design should clarify when each is appropriate.

### Adoption & Compatibility

These ensure ARC works for teams beyond the current single-developer, single-agent context.

6. **Define progressive adoption tiers (ADR candidate)** — Specify what's in "basic" ARC vs.
   "full" ARC. Resolve whether this is a structural difference (different files), a
   documentation/framing difference (same files, guided onboarding), or config-driven
   (`adoption_tier` changes which steps apply). Two tiers (decided during planning).

7. **Design external tool and platform compatibility (ADR candidate)** — Define how ARC coexists
   with external systems at two levels: (a) task/project trackers (Jira, Linear, GitHub Issues)
   and (b) platform/hosting (GitLab, Bitbucket, self-hosted git). Workflows reference practices
   not tools, extension points at tool boundaries, config declares tool choices, ARC built-in
   methods remain first-class, no bidirectional sync. Platform-specific assumptions (GitHub
   Actions CI, `gh` CLI, PR-based workflows) should be identified and made configurable where
   they are methods rather than principles.

8. **Resolve merge strategy support (ADR candidate)** — Define how ARC's value proposition
   survives squash merging. Address commit philosophy implications, archive workflow adaptations,
   and documentation guidance. May consolidate with requirement 4 if a config setting plus
   documentation guidance is sufficient.

9. **Design development methodology compatibility (ADR candidate)** — Define how ARC's work
   organization model (spec → PRD → tasks → execute, one-task-at-a-time, atomic commits, review
   gates) coexists with established development methodologies — particularly Scrum (sprints,
   stories, velocity, ceremonies) and Kanban (continuous flow, WIP limits, boards). Key
   questions: Does ARC's decomposition model layer on top of sprint planning or replace it? How
   do PRDs map to stories? Is one-task-at-a-time compatible with sprint velocity tracking? Can
   teams use ARC's quality gates and spec-driven approach within their existing methodology?

   This is a high-priority design question. Sprint-based workflows are extremely common in
   professional software development. If ARC's work organization is incompatible, it excludes a
   large segment of potential adopters. The design should aim for strong explicit support —
   mapping ARC's constructs to methodology constructs — rather than treating this as an edge case.
   (Research needed — validate prevalence of specific methodologies and identify concrete
   integration patterns.)

### Synthesis & Validation

10. **Produce strategy documents** — Synthesize ADR decisions into living reference documents for
    WU2-WU4. Minimum: a core philosophy document and a configurability architecture document.
    Additional documents (e.g., standalone config schema spec) as warranted by complexity.

11. **Light adopter-scenario validation** — Walk through a small set of adopter scenarios (draw
    from the use cases above) against the completed decisions to catch gaps, contradictions, or
    under-specified areas before handing off to WU2.

12. **Update core internal documents** — Refresh internal constitutional and agent docs to reflect
    WU1 decisions. Scope: META-PRD (stale adoption model, philosophy framing, "vibe coding"
    positioning), AGENTS.md (project overview, collaboration principles), agent-specific files
    (CLAUDE.md, etc. as needed). The repo-root README is out of scope (WU4). This ensures WU2
    inherits accurate constitutional context rather than docs that predate the principle/method
    distinction.

## Non-Goals

- **No implementation** — No editing existing workflows, updating hooks, fixing audit findings,
  or modifying config parsing. That is WU2 scope. However, design decisions must be grounded in
  the current state of ARC's docs, workflows, and structure — read and reference what exists
  today, just don't change it. Decisions made in the abstract won't be actionable for WU2.
- **No structural file changes** — No moving, renaming, or reorganizing existing `.arc/` files.
- **No tooling work** — No CLI design, no `arc init` command, no distribution mechanisms. WU3
  scope.
- **No documentation site content** — No adoption guides, getting-started docs, or README
  rewrites. WU4 scope.
- **No universal agent compatibility** — The goal is identifying assumptions, not making every
  workflow work for every agent type.
- **No bidirectional tool sync** — External tool integration is accommodation (extension points),
  not deep integration.

## Technical Considerations

**ADR methodology:** Follow the established ADR strategy
(`strategy-adr-methodology.md`) — Nygard five-section format, sequential numbering starting at
001, immutable once accepted. ADRs land in `.arc-internal/reference/adr/`.

**Potential ADR consolidation:** 9 ADR candidates with acknowledged tight coupling.
Likely consolidation points:

- Requirements 1 + 4 (core identity directly constrains what can be configured)
- Requirements 4 + 5 (config switches and extension points are complementary mechanisms)
- Requirement 8 may fold into requirement 4 (merge strategy as a config setting)

Consolidation should be decided during work based on natural boundaries, not forced upfront.
The requirement is that all 9 design questions are resolved — not that exactly 9 ADRs are produced.

**Dependency ordering:** Several requirements have natural dependencies:

- Requirement 1 (core identity) informs nearly everything else — should come first
- Requirements 2, 3 inform the configurability scope — should precede requirement 4
- Requirement 4 informs requirements 5, 6, 7, 8, 9
- Requirements 10, 11 depend on all decisions being made
- Requirement 12 depends on requirements 10, 11 (update docs after decisions are validated)

**Strategy documents emerge from ADRs:** Per the ADR methodology, strategy documents synthesize
patterns across ADRs. The exact number and scope of strategy docs should emerge during the work
rather than being prescribed upfront.

**External research dependencies:** Several design decisions require external research to ground
claims and inform areas where direct experience is limited:

- **Context degradation in large windows** — Evidence suggests quality degrades well before a 1M
  token window fills. ARC guidance should favor focused sessions (~200k) regardless of capacity,
  but this claim must be verified before codifying. Informs requirements 2 and 3.
- **IDE agent workflow patterns** — How do Cursor, Windsurf, and similar tools handle context
  persistence, session boundaries, and file-level collaboration? Limited direct experience means
  this needs investigation. Informs requirement 3.
- **Cloud/remote agent patterns** — How do web-based and remote agents (Codex desktop, Claude
  web) manage branching, async work, and handoff? Informs requirement 3 and the philosophical
  positioning on ARC's co-development model.
- **Factory-style autonomous agents** — What are the current capabilities and typical workflows
  of Devin, SWE-agent, Copilot Workspace, and similar systems? How do they interact with
  codebases, manage context, and hand off to humans? Informs requirement 3 and the philosophical
  positioning in requirement 1.
- **Development methodology landscape** — How prevalent are Scrum, Kanban, and hybrid
  methodologies in professional software teams? What are the specific constructs (sprints,
  stories, velocity, WIP limits, ceremonies) that ARC must map to or accommodate? Where do
  structured documentation frameworks typically integrate with these workflows? Informs
  requirement 9.
- **Human attention and single-tasking** — ARC's core philosophy rests on the claim that human
  attention is naturally single-threaded — the foundation for minimal parallelism,
  one-task-at-a-time, and tight human-agent coupling. This is well-supported in cognitive
  science (task-switching costs, attention splitting, the multi-tasking myth), but the
  philosophy document should cite current empirical evidence rather than assert it. Without
  citable research, the claim is vulnerable to "I can monitor 5 agents fine" dismissal.
  Informs requirement 1 and the core philosophy strategy document.

Research should happen early (during or before the relevant ADR work), not deferred to synthesis.

**Open question from planning (carry forward):** Should the core philosophy document be purely
abstract (principles only, no implementation mention) or demonstrate principles through the
configurability architecture? Leave this to emerge during requirement 1 work.

## Success Criteria

1. **All 9 design questions resolved** — Every requirement (1-9) has a clear, documented decision
   with rationale and consequences, captured in ADRs
2. **Sharp principle/method boundary** — For each current ARC practice, it is unambiguous whether
   it is a non-negotiable principle or a configurable method
3. **Actionable for WU2** — Strategy documents provide sufficient detail for WU2 to implement
   changes to existing workflows, hooks, and templates without needing further design decisions
4. **Actionable for WU3** — Config schema is specified well enough for CLI tooling to implement
   `arc init` and config management
5. **Adopter-scenario validated** — Light walkthrough confirms the decisions hold up for at least
   the use cases defined in this PRD, with no obvious gaps or contradictions
6. **Internally consistent** — ADRs do not contradict each other; strategy documents align with
   ADR decisions
7. **Constitutional docs current** — META-PRD, AGENTS.md, and agent-specific files reflect WU1
   decisions; WU2 can reference them without encountering stale pre-1.0 framing

## Open Questions (Resolved)

1. **How many ADRs?** — 6 ADRs (ADR-001 through ADR-006). Consolidated from 9 candidates:
   Reqs 2+3 → ADR-002, Reqs 4+5 → ADR-003, Reqs 7+8 → ADR-005.
2. **How many strategy documents?** — Two: core philosophy + configurability architecture.
   Config schema presented narratively within the configurability strategy rather than as a
   standalone spec — the actual `arc-config.yml` with inline comments is self-documenting.
3. **Philosophy doc scope** — Principles with conventions referenced under each, but the
   configurability architecture is a separate companion document. Philosophy defines *what
   ARC is*; configurability defines *how teams customize it*.
4. **Multi-agent orchestration positioning** — Positive value claim, not comparative. ARC
   optimizes for collaboration quality; delegation has legitimate uses for bounded work.
   "Off-label" framing acknowledges without promoting. Evidence-cited, not dogmatic.
5. **ARC's co-development model as principle vs. method** — Shared context with mutual
   visibility is principle (P11). Local CLI is convention. CLI and IDE agents satisfy the
   principle; async delegation agents are outside ARC's design envelope.
6. **ARC's work organization vs. established methodologies** — Complementary layer. ARC
   operates at the execution pair level (developer + agent); Scrum/Kanban operate at team
   coordination level. Naturally complementary — different organizational levels addressing
   different concerns. No fundamental incompatibilities found (ADR-006).

---
