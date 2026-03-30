# FAQ

## Why bounded sessions? Why not just let the agent keep working?

Two converging forces. First, LLM output quality degrades as context accumulates — multiple
studies converge on 60–70% of the advertised context window as the reliable range, with complex
tasks (code generation, multi-hop reasoning) degrading faster than simple retrieval. Second,
human attention for sustained knowledge work follows the same pattern through a different
mechanism — task-switching costs and interruption recovery are well-documented. Bounded sessions
work with both constraints rather than against them.

The handoff cost is low by design — a few minutes to capture state. The value is in the fresh
start: clean context, focused loading, and a natural checkpoint for the developer to reassess
direction. See [Sessions](sessions.md) for the evidence and practical guidance.

## Why one task at a time? Why not let the agent work in parallel?

ARC's sequential execution model serves [co-development](philosophy.md#core-commitments): the
developer and agent collaborate through the work, not just before and after it. Each task is a
[review increment](reference/glossary.md#review-increment) — a bounded chunk of autonomous
execution between human review points. Running tasks in parallel means the developer can't
meaningfully participate in any of them.

This applies to the *developer's* attention, not the agent's capabilities. Team-level
parallelism (different developer-agent pairs on different branches) and supplementary agents
(bounded research, exploration tasks) are both compatible with ARC — the developer's primary
attention stays single-threaded.

## How does ARC compare to Cursor rules, .cursorrules, or AGENTS.md?

These are complementary, not competing. Files like `.cursorrules` or `AGENTS.md` provide
behavioral guidance to a specific agent — coding style, project conventions, tool preferences.
ARC is a development methodology — it structures how a developer and agent work *together*
through planning, execution, and context preservation across sessions.

You can use both. ARC provides the workflow structure (sessions, task execution, quality gates,
commit discipline); agent-specific files provide the behavioral guidance within that structure.
ARC even generates agent-specific skill files during `arc init` and accommodates platform-level
features like agent hooks alongside its methodology layer.

## Does ARC work with cloud/async agents like Devin or Codex cloud?

ARC's core value — co-development through tight iterative loops — is absent when the agent
works asynchronously without the developer present. That said, ARC can function at the
boundaries: spec-driven planning produces well-specified task descriptions that serve as
dispatch specifications, and quality gates verify the output at integration time. This "bookend
pattern" uses ARC for planning and verification while the execution phase operates outside the
methodology.

For a full treatment of agent compatibility, see
[Philosophy § Agent Compatibility](philosophy.md#agent-compatibility).

## Is ARC only for solo developers?

No. ARC's core methodology works for teams — task ownership markers (`(@name)`), team branching
patterns, merge conflict conventions, and integration with external trackers (Jira, Linear,
GitHub Issues) are all supported. Set `team.mode: true` in `arc-config.yml` to activate team
conventions. See [Team Coordination](reference/team-coordination.md).

The "one task at a time" rule applies per developer-agent pair, not per team. Multiple pairs can
work concurrently on different tasks.

## Why conventional commits? Can I use a different format?

Conventional commits are a convention (tier 2), not a principle. ARC ships them as a strong
default because the `type(scope): description` format enables automated tooling and produces
readable history. The `Context:` footer links each commit to its task for traceability.

To use a different format: set `commit.format: custom` in `arc-config.yml` and provide your
pattern in `commit.custom_pattern`. The git hook validates against your pattern instead of ARC's
default. Or set `commit.format: any` to disable format validation entirely — the agent still
follows ARC's guidance, but the hook won't block non-conforming messages.

## Why not just use GitHub Issues / Jira for task tracking?

ARC task lists and external trackers serve different purposes. External trackers excel at
cross-team visibility, sprint planning, and stakeholder reporting. ARC task lists excel at
implementation-level detail — subtask breakdowns, acceptance criteria, completion notes, and
the review-increment structure that the developer-agent pair works through.

Neither replaces the other. A Jira ticket might say "Implement user authentication"; the ARC
task list breaks that into 15 subtasks with specific acceptance criteria. Teams using external
trackers select `ARC Core + External Tracker` during `arc init` and use extension points to
sync status between the two. See
[Team Coordination § External Tracker Integration](reference/team-coordination.md#external-tracker-integration).

## Can I use ARC without the CLI?

Yes, with caveats. The CLI (`arc init`, `arc update`, `arc join`) handles installation,
updates, and developer onboarding — scaffolding files, setting up git hooks, managing the
manifest, and performing three-way merges during updates. You could create the `.arc/` directory
structure manually and maintain it by hand, but you'd lose the update mechanism, hook
installation, and file classification system.

The methodology itself — sessions, task execution, quality gates, commit discipline — is
expressed as markdown documents that work with any agent. The CLI is the delivery and
maintenance mechanism, not the methodology.

## What does "self-hosting" mean for ARC?

ARC's own development uses ARC. The framework's `.arc/` directory contains the same methodology
files that ship to adopters — sessions, task lists, quality gates, and commit discipline
structure how ARC itself is built. This provides continuous validation that the methodology
works in practice and that framework changes are tested against real usage.
