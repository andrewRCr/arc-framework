# FAQ

## I already have a CLAUDE.md / AGENTS.md — what does ARC add?

A context file is static — the agent reads it and interprets whatever it says. ARC is an operational
methodology. Spec-driven planning produces task breakdowns with acceptance criteria before
implementation begins. A session lifecycle preserves context across conversations — the agent picks
up where you left off. Git hooks enforce commit format, quality gates, and traceability at commit
time. A configurability architecture lets you override how ARC does things without modifying
framework files. The result compounds across sessions rather than resetting each time. See
[How ARC Works](how-arc-works.md) for the full picture.

## ARC seems like a lot of overhead

The structure is front-loaded by design — once defined, your project context loads automatically
every session. The startup documents are kept intentionally lean with no overlap between them.
Everything else (methods, strategies, procedural workflows) loads on-demand only when the work
reaches it. The ceremony replaces the ad-hoc effort you'd spend anyway — re-explaining context,
catching preventable issues, recovering lost decisions — with consistent results.

## Why bounded sessions? Why not just let the agent keep working?

Agent output quality degrades as context accumulates; human attention for sustained work follows the
same pattern through a different mechanism. Bounded sessions work with both constraints rather than
against them. The handoff cost is low — a few minutes to capture state — and the fresh start gives
you clean context and a natural checkpoint to reassess direction. See
[Philosophy § Why Bounded Sessions](philosophy.md#why-bounded-sessions) for the evidence.

## Why one task at a time? Why not let the agent work in parallel?

ARC's sequential model serves [co-development](philosophy.md#core-commitments): each task is a
[review increment](reference/glossary.md#review-increment) — a bounded chunk of execution between
human review points. Running tasks in parallel means the developer can't meaningfully participate in
any of them. This applies to the developer's attention, not the agent's capabilities — team-level
parallelism (different pairs on different branches) and supplementary agents are both compatible.

## How much does the agent do between review points?

Each task is one review increment: typically a few files modified, a few minutes of agent execution.
The agent implements it, runs quality gates, reports what was done, and stops for your review. You're
reviewing work in flight with full context, not reconstructing what happened in a long autonomous
run. If a task regularly exceeds a few minutes, it's a signal to break it down further. See
[How ARC Works § Working Through Tasks](how-arc-works.md#working-through-tasks).

## Does ARC work with cloud/async agents like Devin or Codex cloud?

ARC's core value (co-development through tight iterative loops) is absent when the agent works
asynchronously without the developer present. That said, ARC can function at the boundaries:
planning produces well-specified task descriptions that serve as dispatch specifications, and quality
gates verify the output at integration time. See
[Philosophy § Agent Compatibility](philosophy.md#agent-compatibility).

## Which agents does ARC support?

ARC works with any conversational AI coding agent (P8). During beta, it's been primarily developed
with **Claude Code** and **Codex CLI**, with validation against **Warp**, **Gemini CLI**, and
**Copilot CLI**. IDE agents (Cursor, Windsurf, Cline) are architecturally supported but not yet
validated through sustained use — if you're using one and have feedback,
[start a discussion](https://github.com/andrewRCr/arc-framework/discussions) to help improve
support. See
[Philosophy § Agent Compatibility](philosophy.md#agent-compatibility).

## Is ARC only for solo developers?

No. ARC supports teams: task ownership markers, team branching patterns, and integration with
external trackers (Jira, Linear, GitHub Issues). Set `team.mode: true` via
`arc init --reconfigure`, then each developer runs `arc join` for their personal workspace. The "one
task at a time" rule applies per developer-agent pair — multiple pairs work concurrently on different
branches. See [Team Coordination](reference/team-coordination.md).

## Why conventional commits? Can I use a different format?

Conventional commits are a convention (tier 2), not a principle. ARC ships them as a strong default
because the `type(scope): description` format enables automated tooling and produces readable
history. The `Context:` footer links each commit to its task for traceability.

To change: set `commit.format: custom` in `arc-config.yml` and provide your pattern in
`commit.custom_pattern`. Or set `commit.format: any` to disable format validation entirely — the
agent still follows ARC's guidance, but the hook won't block non-conforming messages.

## Why not just use GitHub Issues / Jira for task tracking?

ARC task lists and external trackers serve different purposes. Trackers excel at cross-team
visibility and sprint planning; ARC task lists excel at implementation detail — subtask breakdowns,
acceptance criteria, completion notes, and the review-increment structure the developer-agent pair
works through. Neither replaces the other. Teams using external trackers select that option during
`arc init` and use extension points to sync status. See
[Team Coordination § External Tracker Integration](reference/team-coordination.md#external-tracker-integration).

## Why can't I just let the agent work through tasks while I do something else?

You'd lose more than oversight — you'd lose the architectural insights and cross-cutting connections
that only surface when you're present during implementation. If you need to step away,
[deferred review](how-arc-works.md#working-through-tasks) lets you authorize a batch and review when
you return. If your goal is to hand off work and check results later, ARC isn't the right fit — and
that's by design. See [Philosophy](philosophy.md#three-observations) for the full reasoning.

## Do I need to understand all of ARC before starting?

No. Run `arc init`, start your first session, and the agent handles the mechanics — loading context,
following workflows, running quality gates, managing session state. The first thing that happens is
the agent guiding you through making ARC yours: project briefing, development rules, quality gates,
conventions. You learn the concepts through doing them, not by studying upfront.

## Can I use ARC without the CLI?

Yes, with caveats. The CLI (`arc init`, `arc update`, `arc join`) handles installation, updates, and
developer onboarding — scaffolding files, setting up git hooks, managing the manifest, and handling
file updates by classification. You could maintain the `.arc/` structure manually, but you'd lose
the update mechanism, hook installation, and file classification system.

The methodology itself is expressed as markdown documents that work with any agent. The CLI is the
delivery and maintenance mechanism, not the methodology.

## What are git notes? Do I need to understand them to use ARC?

No. [Git notes](https://git-scm.com/docs/git-notes) are a built-in Git feature for attaching
metadata to commits without modifying commit history. ARC uses them under the hood for session state
portability — your gitignored session context can be saved to git notes and restored on another
machine or by a teammate picking up your branch. The CLI handles everything: `arc sync` saves and
pushes, `arc sync --load` pulls and restores. You'll never need to run `git notes` commands directly.

## Does ARC work with husky / lefthook / pre-commit?

Yes. During `arc init` or `arc join`, the CLI detects whether your project uses a hook manager
(husky, lefthook, or pre-commit) and integrates ARC's hooks into the manager's configuration
automatically. Your existing hooks continue to run alongside ARC's commit validation.

If no hook manager is detected, ARC sets `core.hooksPath` directly — which means only ARC's hooks
run. If you later adopt a hook manager, running `arc init --reconfigure` will re-detect and
integrate.
