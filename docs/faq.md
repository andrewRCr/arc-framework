# FAQ

## I already have a CLAUDE.md / AGENTS.md — what does ARC add?

A `CLAUDE.md`, `AGENTS.md`, or `.cursorrules` file is static context — the agent reads it at
conversation start and interprets whatever guidelines it contains. ARC is an operational system.
The documents inside `.arc/` aren't passive reference material; they're mechanical. The
difference shows up in three areas.

**Enforcement, not guidance.** A context file can say "use conventional commits" or "run tests
before committing." The agent follows these *most of the time*. ARC's git hooks validate commit
format, context footers, task numbering, and meta-project references at commit time — they
block non-conforming commits regardless of which agent (or human) is committing. The task
execution workflow requires tiered quality gates before a task can be marked complete, with
mandatory stops for developer review between tasks. These aren't guidelines the agent
interprets; they're checkpoints the agent cannot skip.

**Session lifecycle and state preservation.** Context files don't survive across conversations —
each session starts from whatever the file says, with no memory of where work left off. ARC
splits session state between tracked project status (WORK-STATUS.md, committed to git) and
personal working context (SESSION-NOTES.md, gitignored, portable via git notes). Session
initialization loads these alongside project context in a defined order with freshness detection
and mismatch recovery. Session handoff captures state for the next session. The agent picks up
where you left off — current task, blockers, decisions made, things tried.

**Configurability architecture.** A context file is a single surface you edit directly. ARC
separates what you can change into three mechanisms: config values (`arc-config.yml`) control
runtime behavior like commit format and branch protection; method overrides (`arc-methods.md`)
replace *how* ARC does something (your commit format, triage thresholds, quality gate commands)
while preserving the contract; extension points (`arc-extensions.md`) inject custom steps at
workflow boundaries (post-task quality checks, external tracker sync, review ceremony). Beyond
adapting ARC's defaults, the framework provides scaffolding for your own content — project
strategies, domain-specific rules, project templates — that the agent consults during relevant
work.

Static context files are a good starting point. ARC is what you graduate to when you want the
behavior to be mechanical, consistent across sessions and agents, and embedded in the structure
of how work happens rather than written up in a file you hope the agent follows.

## ARC seems like a lot of overhead

The structure is front-loaded. Once your project briefing, development rules, and quality gates
are defined, each session starts with full context automatically — the agent knows your stack,
your standards, and where work left off. Quality checks run without manual intervention. Commit
format and traceability are enforced by hooks. The minute-to-minute experience is streamlined:
you spend less time re-explaining context, less time catching preventable issues, and less time
recovering from sessions that lost track of prior decisions.

ARC is also deliberate about what it loads and when. The documents read every session —
agent briefings, development rules, strategy index, quick reference, work status — are kept
intentionally lean with no overlap between them. Everything else loads on-demand: method
implementations load when a workflow reaches their trigger point, strategy documents load when
work enters their domain, procedural workflows load only when active task work exists. A
planning-only session never loads the task execution protocol. A session that doesn't touch
commits never loads the commit format method. This tiered delivery keeps the agent's context
focused on what's immediately relevant rather than front-loading everything the framework knows.

The ceremony replaces the ad-hoc effort you'd spend anyway, with consistent results. Any
context engineering approach achieves some of this; ARC systematizes it so you define standards
and practices once and they're enforced and applied across every session.

## Why bounded sessions? Why not just let the agent keep working?

Two converging forces. First, LLM output quality degrades as context accumulates — multiple
studies converge on 60–70% of the advertised context window as the reliable range, with complex
tasks (code generation, multi-hop reasoning) degrading faster than simple retrieval. Second,
human attention for sustained knowledge work follows the same pattern through a different
mechanism — task-switching costs and interruption recovery are well-documented. Bounded sessions
work with both constraints rather than against them.

The handoff cost is low by design — a few minutes to capture state. The value is in the fresh
start: clean context, focused loading, and a natural checkpoint for the developer to reassess
direction. See [Philosophy § Why Bounded Sessions](philosophy.md#why-bounded-sessions) for the
evidence, and [How ARC Works](how-arc-works.md) for practical guidance.

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

## Does ARC work with cloud/async agents like Devin or Codex cloud?

ARC's core value — co-development through tight iterative loops — is absent when the agent
works asynchronously without the developer present. That said, ARC can function at the
boundaries: spec-driven planning produces well-specified task descriptions that serve as
dispatch specifications, and quality gates verify the output at integration time. This "bookend
pattern" uses ARC for planning and verification while the execution phase operates outside the
methodology.

For a full treatment of agent compatibility, see
[Philosophy § Agent Compatibility](philosophy.md#agent-compatibility).

## Which agents does ARC support?

ARC is built to work with any conversational AI coding agent — that's a core design commitment
(P8). During beta, it's been primarily developed and tested with **Claude Code** and **Codex
CLI**, with additional validation against **Warp**, **Gemini CLI**, and **Copilot CLI**.

IDE-embedded agents (Cursor, Windsurf, Cline, etc.) are architecturally supported — ARC's
methodology is expressed as markdown documents and Skills that work across platforms — but not
yet validated through sustained use. Validation with IDE agents is an active priority as beta
testing continues. If you're using an IDE agent with ARC, your experience is valuable:
[file an issue](https://github.com/arc-framework/arc-framework/issues) to help us identify
friction and improve support.

For the full compatibility spectrum, see
[Philosophy § Agent Compatibility](philosophy.md#agent-compatibility).

## Is ARC only for solo developers?

No. ARC's core methodology works for teams — task ownership markers (`(@name)`), team branching
patterns, merge conflict conventions, and integration with external trackers (Jira, Linear,
GitHub Issues) are all supported.

To enable team mode: set `team.mode: true` in `arc-config.yml` (this is a structural setting,
so run `arc init --reconfigure` to apply it). Each developer then runs `arc join` to set up
their personal workspace — role, identity, and agent skills. See
[Team Coordination](reference/team-coordination.md) for the full multi-developer setup.

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

## What are git notes? Do I need to understand them to use ARC?

No. [Git notes](https://git-scm.com/docs/git-notes) are a built-in Git feature for attaching
metadata to commits without modifying commit history. ARC uses them under the hood for session
state portability — your personal session context (SESSION-NOTES.md, workspace files) is
gitignored but can be saved to git notes and restored on another machine or by a teammate
picking up your branch. The CLI handles everything: `arc user sync` saves and pushes, session
initialization loads automatically. You'll never need to run `git notes` commands directly.
