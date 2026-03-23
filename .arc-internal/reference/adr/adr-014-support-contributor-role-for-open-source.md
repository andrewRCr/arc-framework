# ADR-014: Support Contributor Role for Open Source Projects

## Status

Accepted

## Context

ARC's workflow and constitutional documents assume a single interaction model: the user is a project maintainer
who participates in the full planning pipeline — sessions, task lists, WORK-STATUS tracking, handoffs. This
assumption is embedded throughout the framework: session-init loads planning state, commit discipline requires
WORK-STATUS updates, task execution orients around the project's task list.

This model works for solo developers and team members. It does not work for open source contributors.

**The open source contribution pattern is fundamentally different.** A contributor forks a repo, picks up an
issue, makes a bounded change, and submits a PR. They don't drive the project roadmap, manage task lists, or
track work status. They interact through issues and pull requests, not ARC's planning pipeline. Their AI agent
should understand the project's quality standards, coding patterns, and architectural decisions — but should not
try to load or modify the maintainer's planning state.

**Without native support, ARC creates friction at every interaction point.** Tracing through a concrete
contribution scenario (contributor using an ARC-aware agent to fix a bug) reveals systematic breaks:

1. **Session-init loads WORK-STATUS.md** — the agent orients around the maintainer's current task, not the
   contributor's issue
2. **Commit discipline says to update WORK-STATUS** — the agent modifies the maintainer's planning state
3. **The agent creates task lists in `active/`** — contributor planning artifacts mix with project planning
4. **Context footer validation expects task list references** — the contributor has no task list to reference
5. **All of the above ends up in the PR** — the maintainer must review and reject planning file changes
   alongside the actual contribution

Each break is individually manageable through reviewer diligence, but collectively they make ARC a liability
for any open source project. Contributors who encounter this friction will conclude ARC is poorly designed;
maintainers who have to repeatedly clean up planning file modifications will abandon ARC or make their repos
private. Either outcome undermines adoption.

**The contributor still benefits from ARC's reference layer.** The project's DEV-RULES, strategies, quality
gates, agent briefing, and architectural decisions are valuable to contributors — they help the contributor's
agent understand project standards and produce conforming code. The problem is not that contributors see ARC
content; it's that ARC's workflows treat every user as a planning participant.

**The boundary is ownership, not visibility.** Planning content (task lists, PRDs, WORK-STATUS, backlog) is
maintainer-managed — visible to all, modified by maintainers. Reference content (constitution, strategies, ADRs)
and system content (agent config, workflows, hooks) are project assets — visible to all, contributable via PR.
This mirrors how open source projects already work: CI config is visible but maintainer-managed, roadmaps are
public but maintainer-driven.

**Alternatives considered:**

1. **Guidance-only** — Document contributor conventions in CONTRIBUTING.md and rely on CI checks (GitHub Actions
   to flag protected file changes) and CODEOWNERS for enforcement. No framework changes. Simple but pushes the
   problem to every adopter individually. Each open source ARC project must DIY contributor support, getting it
   wrong in different ways. The agent still behaves as if the contributor is a maintainer — guidance tells the
   human what to do but doesn't change what the agent does.

2. **Directory-level visibility** — Gitignore planning directories (`active/`, `backlog/`) so contributors
   never see them. Breaks down immediately: the maintainer wants planning tracked in git (recoverable, portable),
   but gitignored files aren't in the repo for anyone. Workarounds (force-add, separate tracking mechanisms) are
   fragile and confusing. Also hides useful project context from contributors who benefit from seeing the
   roadmap and current priorities.

3. **Two-repo mirror pattern** — Private development repo (full ARC) syncs to a public read-only mirror
   (reference layer only). PRs against the public mirror are manually applied to the private repo. Optimizes for
   publishing but creates friction for receiving contributions: manual re-application of PRs, flattened
   contributor history, sync automation to build and maintain. The contribution workflow — ARC's stated goal —
   becomes the most painful path.

4. **Native contributor role (chosen)** — ARC supports a contributor role via per-developer git config, with
   adjusted session-init behavior, hook validation, and a framework-owned contributor briefing document. Zero
   tracked file modifications. The role is metadata that influences runtime behavior, not file content.

## Decision

We will add native support for a contributor role in ARC, implemented as a per-developer git config value that
adjusts agent behavior, hook validation, and session lifecycle — without modifying any tracked files.

### Role mechanism

A single git config value distinguishes roles:

- `arc.role = maintainer` — default, existing behavior (full planning pipeline)
- `arc.role = contributor` — adjusted behavior (reference layer + lightweight workflow)

The role is per-developer (stored in local `.git/config`), not per-project. Any ARC project can have
contributors; the project doesn't need to declare itself open source. A contributor's clone is byte-for-byte
identical to the maintainer's committed state.

### Entry point: `arc join` role prompt

`arc join` will prompt for role selection:

```text
How are you joining this project?
  ● Team member (full planning access)
  ○ Contributor (open source contributor)
```

Both paths install git hooks and set up `arc.identity`. The contributor path additionally sets
`arc.role = contributor` and skips planning-related setup. A `--contributor` flag provides non-interactive
selection for scripted setups.

### Session-init branching

When `arc.role = contributor`, session initialization:

- **Loads**: reference layer (AGENT-BRIEFING, DEV-RULES, strategies, QUICK-REFERENCE), system layer
  (arc-config.yml, agent-specific file), and the contributor briefing document
- **Skips**: WORK-STATUS.md, task lists, task execution workflow, backlog, next work unit discovery
- **Checks for local planning state**: if `user/{identity}/WORK-STATUS.md` exists, loads the contributor's
  personal planning state (see Contributor Planning below)
- **Orients**: "Contributing to [project]. Quality gates: [commands]. What are you working on?"

Session handoff in contributor mode skips WORK-STATUS.md updates (project-level) but writes SESSION-NOTES.md
to `user/{identity}/` as normal.

### Contributor briefing document

A new framework-owned document, `AGENT-BRIEFING.CONTRIBUTOR.md`, lives in `.arc/system/agent/` alongside the
existing briefings. It is loaded during session-init only when `arc.role = contributor`. Contents:

- Do not modify files in `active/` or `backlog/` (maintainer-managed planning state)
- Use `Context: contribution (...)` footer format, not task list references
- Local planning state (if desired) goes in `user/{identity}/`
- Quality gates apply in full — same standards as maintainers
- Agent-specific files are project contributions — PR them if the project would benefit

This document is framework-level (ships with ARC, updated by `arc update`). Project-specific contributor
guidance goes in CONTRIBUTING.md (human-facing, project-owned).

### CONTRIBUTING.md template

ARC will ship `CONTRIBUTING.template.md` as a scaffolding option during `arc init`. The template includes
ARC-specific sections (setup via `arc join`, quality gate commands, "what files are maintainer-managed")
alongside standard open source sections (PR process, issue guidelines, code of conduct reference). Projects
customize it like any other template.

### Hook adjustments

Git hooks read `arc.role` and adjust validation:

- **Commit message format**: enforced for all roles (project standard applies to everyone)
- **Context footer**: contributor mode accepts `Context: contribution (...)` — flexible format accommodating
  different issue tracking conventions (GitHub issues, Jira, plain descriptions)
- **Task numbering**: skipped for contributors (not editing task lists)
- **Protected file warning**: contributor mode warns at commit time when staging files in `active/` or
  `backlog/`, with an explanation and option to proceed. This is proactive — catch the mistake before push,
  not at PR review time

### Hook manager integration

ARC hook scripts will be designed as standalone composable scripts callable from any hook management tool
(husky, lefthook, pre-commit). `arc init` and `arc join` will detect existing hook managers and integrate
rather than overwrite:

- **Hook manager detected** (husky, lefthook, etc.): add ARC hook calls to the manager's configuration.
  Contributors get ARC hooks automatically on `npm install` (or equivalent) with no additional setup.
- **No hook manager**: install to `.git/hooks/` directly (current behavior, remains the fallback).

This addresses a pre-existing limitation where ARC hooks conflicted with project hook managers, but is
especially important for contributors who expect `npm install` to be sufficient setup.

### Contributor planning (optional, in `user/{identity}/`)

Contributors who want to use ARC's planning pipeline for complex contributions can create planning state in
their gitignored user directory:

```text
.arc/user/{identity}/
  SESSION-NOTES.md                      ← already exists
  WORK-STATUS.md                        ← contributor's work state
  active/
    tasks-fix-issue-42.md               ← contributor's task list
```

Session-init in contributor mode checks for this local planning state and loads it if present, enabling the
full ARC lifecycle (sessions, task lists, work status, handoffs) scoped entirely to the contributor's local
environment. Git notes portability (already supported for session state) extends naturally to contributor
planning state for cross-machine workflows.

This provides a smooth gradient: quick fixes need no planning setup, medium contributions benefit from a
personal task list, and multi-session contributions get the full ARC experience — all without touching
tracked project files.

### Defense-in-depth (project-configured, not framework-core)

The framework-level protections (agent behavior, hook warnings) are the primary mechanism. Projects can layer
additional protection as appropriate to their platform:

- **CODEOWNERS**: require maintainer approval for `active/`, `backlog/`, `system/arc-config.yml`
- **CI checks**: GitHub Actions that flag PRs modifying protected paths from non-members
- **Branch protection**: require status checks to pass before merge

These are project-specific configurations, not ARC framework features. ARC may ship example configurations
or documentation but does not mandate a specific CI platform.

### Role-aware workflow paths

Analysis of existing workflow and constitutional documents shows that the contributor role requires ~5 touchpoints
across 4 documents — far fewer than a naive estimate would suggest. Three factors keep the impact small:

1. **Session-init branching is the heavy lifter.** By not loading planning-heavy workflows (process-task-loop,
   task list, WORK-STATUS) for contributors, one routing decision eliminates dozens of potential conditionals.
   The contributor's agent never encounters most maintainer-specific instructions.
2. **Existing implicit preconditions already handle most cases.** Instructions like "if committing task work,
   update WORK-STATUS" naturally don't apply when there's no task list. The language is already conditional on
   having planning state.
3. **The contributor briefing acts as a behavioral override.** For the handful of unconditional instructions
   ("update WORK-STATUS at commit time"), `AGENT-BRIEFING.CONTRIBUTOR.md` provides the more specific guidance.
   This is the same pattern as agent-specific files overriding general guidance.

**Identified touchpoints:**

| Document                             | Change                                                               | Type                         |
|--------------------------------------|----------------------------------------------------------------------|------------------------------|
| Session-init workflow                | Branch at Step 2: skip items 8-11, load contributor briefing         | Branch point (designed)      |
| Session-handoff workflow             | Skip project WORK-STATUS.md update and conditional commit sections   | Note in WORK-STATUS sections |
| commit-context-format method         | Add `Context: contribution (...)` format alongside existing patterns | Additive (new format)        |
| DEV-RULES.ARC.md § Commit Discipline | "Work status accuracy" bullet — contributor briefing overrides       | 0-1 inline note              |

Documents requiring **no changes**: process-task-loop (not loaded for contributors), prepare-commits (implicit
preconditions sufficient), all other arc-methods, all strategy documents.

## Consequences

### Positive

- **ARC becomes viable for open source.** Any ARC-managed project can receive contributions without friction.
  Contributors run one command and their agent understands the project's standards without interfering with
  maintainer planning.
- **Zero tracked file modifications.** The contributor role is entirely runtime metadata — git config,
  session-init branching, hook behavior. A contributor's clone is identical to the maintainer's. No merge
  conflicts, no PR pollution, no `.arc/` changes to review and reject.
- **Smooth contributor gradient.** From "ignore ARC, just follow CONTRIBUTING.md" through "agent loads project
  context" to "full ARC planning locally" — contributors choose the level of engagement that fits their work.
- **Proactive protection.** Hook warnings at commit time catch planning file modifications before push. CI
  checks provide defense-in-depth at the PR level. Multiple layers without relying on any single mechanism.
- **Hook manager coexistence.** The composable hook design solves a pre-existing limitation where ARC hooks
  conflicted with project hook managers, improving the experience for all users (not just contributors).
- **Framework-level solution, not per-project DIY.** Every ARC open source project gets contributor support
  from the framework. No custom CI, no hand-written CONTRIBUTING.md boilerplate, no reinventing conventions.

### Negative

- **Workflow document updates required.** Four documents need role-aware touchpoints (~5 changes total).
  The scope is bounded and identified — session-init branching, session-handoff WORK-STATUS sections,
  commit-context-format method, and optionally a note in DEV-RULES commit discipline.
- **Two interaction models to maintain.** Framework changes must now consider both maintainer and contributor
  paths. New workflows, methods, and constitutional rules need to be evaluated for role applicability. This is
  a permanent maintenance cost, though proportionate to the adoption benefit.
- **Hook complexity increases.** Hooks gain role-checking logic (read `arc.role`, branch on value). Combined
  with hook manager detection, the hook installation and validation code becomes more complex. Mitigated by
  keeping the role check to a single `git config` read at the top of each hook.
- **Contributor briefing is another document to maintain.** `AGENT-BRIEFING.CONTRIBUTOR.md` must stay
  synchronized with changes to the contributor model. If commit discipline rules change, the briefing must
  reflect the contributor implications. Mitigated by keeping the briefing focused on behavioral overrides
  rather than duplicating content from DEV-RULES.

### Risks

- **Agent compliance with role branching.** Different agents may handle the contributor session-init branch
  with varying reliability. An agent that ignores `arc.role` and runs full session-init will encounter
  maintainer planning state — not harmful (read-only) but confusing. The hook warning provides a second layer
  if the agent then tries to commit planning file changes.
- **Contributor planning in `user/` may see limited adoption.** The full ARC planning experience for
  contributors depends on local state in a gitignored directory. Contributors may prefer simpler ad-hoc
  approaches. This is acceptable — the feature is optional, and the lightweight contributor path (no local
  planning) is the expected common case.
- **Role-aware path coverage.** The ~5 identified touchpoints cover the known paths, but future workflow
  changes could introduce new maintainer-assumed instructions. Mitigated by the two-interaction-models
  maintenance cost (Negative above) — evaluating role applicability becomes part of the workflow change
  process. The hook warning provides a safety net for any missed paths.
