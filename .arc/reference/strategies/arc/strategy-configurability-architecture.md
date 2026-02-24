# Strategy: Configurability Architecture

**Purpose:** Define how teams customize ARC — the mechanisms, the boundaries, and the conventions that make the
framework adaptable without losing its identity. This is the companion to
[strategy-core-philosophy.md][core-philosophy], which defines what ARC is.

**Scope:** Configuration settings, extension points, method overrides, adoption profiles, platform compatibility, and
the full convention inventory. For ARC's principles, philosophical foundation, and positioning, see the [core philosophy
strategy][core-philosophy].

---

## Contents

- [The Customization Model](#the-customization-model) — mechanisms, boundary tests, convention inventory
- [Adoption Profiles](#adoption-profiles) — enforcement calibration, scaling
- [Configuration](#configuration) — `arc-config.yml` design and settings
- [Extension Points](#extension-points) — adding behavior to workflows
- [Method Overrides](#method-overrides) — replacing convention implementations
- [Platform and Tool Compatibility](#platform-and-tool-compatibility) — platform commands, skills positioning
- [Validation Scenarios](#validation-scenarios) — high-risk adopter walkthroughs
- [Relationship to Other Documentation](#relationship-to-other-documentation)

---

## The Customization Model

ARC's [three-tier flexibility model][core-philosophy] draws a sharp line between principles (tier 1, non-negotiable) and
conventions (tier 2, configurable with defaults). Escape hatches (tier 3) acknowledge practices outside ARC's design
envelope without blocking them.

Customizing conventions — not principles — is the entire scope of the configurability architecture. Three mechanisms
handle different kinds of customization, and existing project documentation absorbs a fourth concern:

| Mechanism       | What It Does              | File                 | Example                                    |
| --------------- | ------------------------- | -------------------- | ------------------------------------------ |
| Config          | Toggles enforcement       | `arc-config.yml`     | `commit.format: any` disables hook check   |
| Extension       | Adds steps to workflows   | `arc-extensions.md`  | Post-task quality: also run security scan  |
| Method override | Replaces default behavior | `arc-methods.md`     | Task completion: update Jira, not markdown |
| QUICK-REFERENCE | Environment/tool commands | `QUICK-REFERENCE.md` | `glab mr create` instead of `gh pr create` |

### Which mechanism do I use?

- If the customization changes a **value** that affects existing behavior → **config**
- If it adds **new steps** at a workflow point → **extension**
- If it **replaces** how ARC does something with how the team does it → **method override**
- If it changes **which CLI tool** to use for an operation → **QUICK-REFERENCE**

Config, extensions, and method overrides are the three customization mechanisms. QUICK-REFERENCE is not a "mechanism" in
the same sense — it is existing project documentation that naturally absorbs platform command variation.

**None of these mechanisms apply to principles.** Config settings exist for conventions. Extension points exist at
convention-level workflow boundaries. Method overrides replace convention-level implementations. Principles (tier 1) are
not configurable through any mechanism — they define what ARC is.

### Convention inventory

ARC currently has 19 conventions across its 11 principles. Each convention has a default (what ARC provides out of the
box) and a configurability path (how teams adapt it).

#### Core commitment conventions

| Convention                                                  | Principle | Default                  | Configurability Path                                 |
| ----------------------------------------------------------- | --------- | ------------------------ | ---------------------------------------------------- |
| Document hierarchy (META-PRD → PRD → tasks)                 | P1        | Full hierarchy           | File-customizable — edit templates                   |
| Template-first documents                                    | P1        | Copy-ready templates     | File-customizable — edit template format and content |
| Per-task mandatory review stop                              | P2        | Stop after each checkbox | Behavioral guidance — adjust review increment scope  |
| Completion protocol (check → mark → verify → report → stop) | P2        | Full ceremony            | Behavioral guidance — adjust protocol steps          |
| Deferred review                                             | P2        | User-defined scope       | Behavioral guidance — adjust scope and conditions    |
| Markdown task list checkboxes                               | P7        | Markdown in git          | Method override — substitute external tracker        |

#### Operational discipline conventions

| Convention                              | Principle | Default                             | Configurability Path                                 |
| --------------------------------------- | --------- | ----------------------------------- | ---------------------------------------------------- |
| Zero-tolerance quality gates            | P4        | All errors must be fixed            | Behavioral guidance — adjust severity levels         |
| Tiered quality gate system (Tier 1/2/3) | P4        | Per-task / per-unit / per-phase     | Behavioral guidance — adjust tier boundaries         |
| Leave it cleaner (capture floor)        | P4        | Fix or document pre-existing issues | Behavioral guidance — fix-now vs. capture-and-defer  |
| Conventional commit format              | P6        | `type(scope): description`          | Config setting — `commit.format`                     |
| Context footer on commits               | P6        | `Context: tasks-*.md (Task X.Y)`    | Config setting — `commit.context_footer`             |
| Atomic commits                          | P6        | One logical change per commit       | Behavioral guidance — adjust unit of organization    |
| Branch naming conventions               | P6        | `feature/`, `technical/`, etc.      | Behavioral guidance — any consistent scheme          |
| CURRENT-SESSION.md                      | P5        | Dedicated session state file        | Method override — substitute session mechanism       |
| Session init/handoff ceremonies         | P5        | Structured document loading         | Behavioral guidance — ceremony adapted to agent type |

#### Design commitment conventions

| Convention                         | Principle | Default                                  | Configurability Path                         |
| ---------------------------------- | --------- | ---------------------------------------- | -------------------------------------------- |
| Collaborative voice in docs        | P9        | Team perspective, no "user/AI" framing   | Behavioral guidance — documentation style    |
| Reference-style markdown links     | P9        | Reference links, definitions at file end | Behavioral guidance — link formatting style  |
| No meta-project references in code | P9        | Task IDs stay in `.arc/` docs            | Behavioral guidance — enforcement strictness |
| Agent-specific file structure      | P8        | `CLAUDE.md`, `GEMINI.md`, etc.           | File-customizable — file naming and location |

**Configurability path definitions:**

- **Config setting** — A value in `arc-config.yml` that hooks, workflows, or agents read at runtime to change behavior.
  See [Configuration](#configuration).
- **Method override** — A structured replacement in `arc-methods.md` that substitutes ARC's default implementation with
  the team's alternative. See [Method Overrides](#method-overrides).
- **Extension** — Additional steps added at preset workflow points via `arc-extensions.md`. See
  [Extension Points](#extension-points).
- **File-customizable** — The convention is configured by editing the file that embodies it. Template formats, document
  structures, agent-specific files — the file itself is the configuration.
- **Behavioral guidance** — The convention is expressed as prose that agents and developers follow. Adjusted by editing
  the guidance in strategy or workflow documents.

### Agent discovery

The agent learns about the active configuration during session initialization. After loading standard documents, the
agent reads `arc-config.yml` and `arc-methods.md`:

1. **Platform**: If `platform.type` differs from `github`, reference QUICK-REFERENCE for platform-appropriate commands
2. **Active method overrides**: If any method in `arc-methods.md` has a populated project override, note it and follow
   the override when that method is encountered in workflows
3. **Custom patterns**: If `commit.format: custom` or `commit.context_footer: custom`, note the active patterns

This is a read-and-note step, not a ceremony. The agent carries this awareness through the session and applies it when
encountering method references or platform-specific operations.

---

## Adoption Profiles

### Same guidance, less enforcement

ARC's workflow and strategy documents are static prose — they describe conventions as the recommended approach
regardless of profile. The agent loads these documents during session initialization and follows the guidance they
contain.

This means an essentials adopter whose config says `commit.format: any` will still have an agent that produces
well-formatted conventional commits — because the agent read the development methodology strategy, which describes
conventional commits as the recommended format. The difference: the hook will not _reject_ non-conventional commits.

**This is intentional.** The separation is:

- **Config** = enforcement boundary (will you be blocked?)
- **Prose** = quality guidance (what is the recommended approach?)
- **Essentials** = same guidance, less enforcement

Adopters choosing essentials typically want to avoid _friction_ (hook rejection, ceremony blocking), not _quality_
(well-formatted commits, thorough documentation). The agent producing quality output even when not enforced is a feature
— it demonstrates the convention's value without creating barriers.

### Profile definitions

Profiles are a CLI init convenience — they pre-configure `arc-config.yml`. After init, the file is directly editable.
There is no persistent "profile" concept in the framework; the config values are what matter.

**Essentials** — Principles committed, enforcement relaxed, progressive path to deeper adoption.

```yaml
commit.format: any
commit.context_footer: optional
hooks.commit_msg: disabled
hooks.pre_commit: enabled
merge.strategy: merge
branch.protection: unprotected
```

Post-init guidance emphasizes four workflows as the starting path: `create-prd`, `generate-tasks`, `process-task-loop`,
and `session-init`.

**Recommended** (default) — Full convention set with sensible defaults. All enforcement active.

```yaml
commit.format: conventional
commit.context_footer: required
hooks.commit_msg: enabled
hooks.pre_commit: enabled
merge.strategy: merge
branch.protection: partial
```

Post-init guidance covers the full system with appropriate progressive depth.

**Custom** — Interactive selection of individual settings. Each setting is presented with its purpose, default, and
alternatives. The adopter builds their own configuration by choosing values for each configurable convention.

### Two-axis adoption model

Profiles address one axis of adoption flexibility: **enforcement depth** — how strictly ARC's conventions are enforced.
A second axis is necessary for complete flexibility: **method customization** — whether the team uses ARC's default
methods or substitutes their own.

Three adopter postures exist:

1. "I don't care about format" → `commit.format: any`, agent produces quality output. **Profiles handle this.**
2. "I want ARC's convention enforced" → `commit.format: conventional`, hooks enforce. **Profiles handle this.**
3. "I want something _different_ enforced" → No mechanism in profiles alone. **Method overrides needed.**

The two axes are independent. A team can use the recommended profile with selective method overrides (full ARC
enforcement, Jira for task tracking). Or essentials with no overrides (relaxed enforcement, ARC defaults where active).
The full customization space is the product of both axes.

### Scaling up and down

The same-files, config-driven approach enables smooth scaling:

**Scaling up (essentials → recommended):** Tighten config settings. Change `commit.format: any` to
`commit.format: conventional`, enable `hooks.commit_msg`. No file additions, no reinstallation. The agent already knows
the conventions from loaded docs — enforcement catches up to guidance. This is the expected path: an essentials adopter
grows comfortable with conventions the agent has been demonstrating and decides to enforce them.

**Scaling down:** Loosen config settings. The reverse is equally smooth.

**Adding method overrides:** Independent of profile changes. A recommended-profile team that adopts Jira can add a
task-completion-tracking method override without changing their enforcement profile.

---

## Configuration

### Design: `arc-config.yml`

`arc-config.yml` is the single configuration file for all convention-level settings. It uses dotted keys for logical
grouping within a flat-file, shell-parseable format.

```yaml
# ARC Framework Configuration
#
# Project-level settings for ARC conventions.
# Only conventions (tier 2) appear here — principles (tier 1) are non-negotiable.
# Format: Flat key-value pairs with dotted grouping. Parsed by githooks using
# line-based shell matching (grep + cut) — no nested structures.

branch.base: main
branch.protection: partial
commit.format: conventional
commit.context_footer: required
merge.strategy: merge
hooks.pre_commit: enabled
hooks.commit_msg: enabled
platform.type: github
```

**Why dotted keys:** Logical grouping (`branch.*`, `commit.*`) improves readability as settings grow, while preserving
the line-based parsing that hooks depend on. The existing `arc_config_get` function works without modification —
`arc_config_get "commit.format" "conventional"` matches `^commit.format:` via grep, which is unambiguous with the `^`
anchor.

**Why flat-file:** Git hooks read config without a YAML library. The `grep + cut` parsing approach must remain viable.
Dotted keys give structure without requiring a parser upgrade.

### What earns a config setting

Not every convention needs a config knob. Three categories determine where configurability lives:

**Runtime-checkable (config setting):** The convention's current value is needed at runtime by hooks, workflows, or
agent guidance to change operational behavior. The setting is read programmatically and affects what happens during
development. All config settings fall in this category — hooks check `commit.format` to decide whether to validate,
workflows check `merge.strategy` to adjust traceability guidance.

**File-customizable (edit the file):** The convention is configured by modifying the file that embodies it. Template
formats, document hierarchy structure, agent-specific file content — these are customized by editing the relevant
template or document. No config setting needed because the file itself is the configuration.

**Behavioral guidance (prose instructions):** The convention is expressed as guidance that agents and developers follow.
Review increment scope, collaborative voice, completion protocol details — these are adjusted by editing the prose in
strategy or workflow documents. No config setting needed because the guidance is descriptive, not programmatic.

**Criteria for adding new settings:** A convention earns a config setting when (a) its value is consumed
programmatically by hooks, workflows, or agent processing, AND (b) the alternative — editing framework files directly —
would create update safety or maintenance problems.

### Settings with behavioral implications

Most config settings are straightforward toggles. Some carry deeper implications for how workflows behave.

**Merge strategy** is the clearest example. `merge.strategy` has three values, each with different traceability
characteristics:

- **`merge`** (default) — Merge commits preserve branch topology and individual commit history. Full traceability
  through commit messages and context footers. Most aligned with P6 (traceability).
- **`rebase`** (convention, tier 2) — Commits are replayed onto a new base for clean linear history. Commit hashes
  change, which can complicate traceability if commits are referenced elsewhere by hash. Same commit guidance as merge;
  traceability preserved through messages.
- **`squash`** (escape hatch, tier 3) — Individual commits collapse into a single squash commit per branch. Traceability
  shifts: PR descriptions must carry the traceability that individual commits would normally provide. Archive workflows
  reference the PR as the canonical change record rather than individual commits.

ARC accommodates squash merging by shifting traceability mechanisms, not by blocking the choice. Teams choosing squash
should ensure PR descriptions are thorough enough to serve as the traceability record.

### Tier 3 in config

Escape hatches (tier 3) are not formally supported but not blocked. Most are prose-acknowledged — ARC states its
position and the tradeoff. However, some escape hatches have workflow implications that ARC can handle more gracefully
with awareness.

**When a tier 3 item appears in config:** When ARC's workflows or hooks can meaningfully adapt their behavior based on
the setting. The squash merge example above demonstrates this — the config value triggers adapted guidance rather than
the framework ignoring the choice.

**When a tier 3 item stays prose-only:** When ARC has no behavioral adaptation to offer. The team is doing something
outside ARC's design envelope and ARC has nothing useful to do with the information.

---

## Extension Points

Extension points let teams add behavior at specific locations in ARC workflows — custom quality checks, additional
context loading, pre-commit verification — without modifying framework-owned files.

### Mechanism

Extension content lives in `arc-extensions.md` at `system/workflows/`. This file is framework-owned and project-filled:
ARC provides the structure and preset section scaffolding, teams add their content. The file is classified as
Configurable — preserved through three-way merge during framework updates.

Each preset section includes: which workflow it extends, when it fires, what the contract allows, and a
`[No extension configured]` placeholder. When customized, the team replaces the placeholder with their steps.

```markdown
## post-task-quality

**Workflow:** process-task-loop.md · **Fires:** After Tier 1 checks pass, before
marking task complete\
**Contract:** Add quality checks that should run after every task completion.
Steps added here run in addition to ARC's default Tier 1 checks, not instead
of them.

[No extension configured]
```

### Markers in workflows

ARC workflows mark extension points with compact, inline blocks:

```markdown
---
**Extension Point — Post-Task Quality Checks** · `#post-task-quality`
Contract: Runs after Tier 1 checks pass, before marking task complete.
See: [arc-extensions.md](../arc-extensions.md#post-task-quality)
---
```

Markers are bounded by horizontal rules for visual distinction. The inline link lets agents and humans navigate directly
to the extension content. The agent follows the link, reads the section, executes any steps found (or skips if
placeholder), and returns to the workflow.

### Preset vs. custom

**Preset (convention, tier 2):** ARC defines these at specific, tested locations in workflow docs. They have defined
contracts and corresponding sections in `arc-extensions.md`. This is the expected customization path.

**Custom (escape hatch, tier 3):** Teams may add their own extension points elsewhere in workflow docs. ARC does not
block this, but custom points are outside the framework's design envelope — framework updates may conflict, and the team
is responsible for maintaining them.

---

## Method Overrides

Method overrides let teams replace ARC's default convention implementations with their own. Where config toggles
enforcement and extensions add behavior, method overrides substitute behavior — a different way of satisfying the same
principle.

### Mechanism

Override content lives in `arc-methods.md` at `system/workflows/`, co-located with `arc-extensions.md`. Same
classification (Configurable), same ownership model (framework-owned structure, project-filled content).

Each preset method defines a contract — the invariant that both the default and any override must satisfy. Contracts are
advisory, not mechanically enforced. The team is responsible for ensuring their override meets the contract.

```markdown
## task-completion

**Workflow:** process-task-loop.md · **When:** Agent marks a task as complete\
**Contract:** Record that the specified task is complete. Status must be
verifiable by both human and agent.\
**Default:** Mark `[x]` in the markdown task list file, update task description
with completion notes.

### Project Override

[No override configured]
```

When an override is populated, the agent follows the override instead of the default. The agent reads `arc-methods.md`
during session initialization and carries the awareness through the session.

### Markers in workflows

Workflows reference overridable operations with block-style markers, following the same visual pattern as extension
points:

```markdown
---
**Method — Task Completion Tracking** · `#task-completion`
Contract: Record that the specified task is complete. Status verifiable by
human and agent.
Default: Mark `[x]` in the markdown task list file.
See: [arc-methods.md](../arc-methods.md#task-completion)
---
```

The agent encounters a method marker, follows the link, reads the corresponding section, and acts on whatever it finds —
override content or default. Same cross-reference pattern used throughout ARC documentation.

### Hook interaction

For methods with mechanical enforcement (commit format, context footer), hooks read override configuration from
`arc-config.yml`. The `custom` config value bridges "I want enforcement" and "I want _different_ enforcement":

| Setting value  | Hook behavior                                                |
| -------------- | ------------------------------------------------------------ |
| `conventional` | Validates against ARC's built-in conventional commit pattern |
| `custom`       | Validates against the team's `commit.custom_pattern` regex   |
| `any`          | Skips format validation entirely                             |

```yaml
# Custom commit format — hook validates against this pattern
commit.format: custom
commit.custom_pattern: "^\\[?[A-Z]+-[0-9]+\\]? .+"

# Custom context footer — hook validates against this pattern
commit.context_footer: custom
commit.context_pattern: "^(Closes|Fixes|Relates to) [A-Z]+-[0-9]+"
```

Config provides common pattern examples as inline comments to reduce regex-authoring friction: Jira prefix,
ticket-plus-type, issue reference.

For behavioral methods (task completion, session state) that do not have mechanical hook enforcement, the override is
purely agent-level: the agent reads the method override from `arc-methods.md` and follows it. No hook interaction
needed.

### Preset vs. custom

Same model as extension points. **Preset methods** are defined by ARC at tested locations with contracts — the expected
customization path. **Custom methods** may be defined by teams for operations ARC does not preset — escape hatch
territory, not guaranteed compatible across updates.

---

## Platform and Tool Compatibility

### Platform commands

ARC handles platform-specific tool commands through QUICK-REFERENCE rather than the method override system. Platform
commands and behavioral methods are distinct concerns:

- **Behavioral methods** (what to do) → `arc-methods.md`
- **Tool commands** (which CLI to run) → QUICK-REFERENCE

QUICK-REFERENCE is already the project-specific environment context and command patterns document. It is Configurable
classification, read every session, and designed for teams to edit. Teams on GitLab replace `gh` commands with `glab`
equivalents. Teams on Bitbucket use their equivalents. The structure is the same; the commands differ.

**Why QUICK-REFERENCE, not `arc-methods.md`:** Tool commands are environment configuration, not behavioral methods. "Use
`glab` instead of `gh`" is the same kind of project-specific detail as "our test command is `pytest`" or "our lint
command is `eslint`." Routing platform commands through the method override system would inflate the methods file with
what are essentially environment variables.

### Platform notes in workflows

Workflows retain concrete commands for the default case (GitHub), with brief platform notes pointing to QUICK-REFERENCE
for alternatives:

```markdown
### Push and Create PR

git push -u origin {branch-name}
gh pr create --base {parent-branch} --head {branch-name}

> **Platform:** Commands above use GitHub CLI. See QUICK-REFERENCE § Platform Commands for alternative platform
> equivalents.
```

GitHub users — the majority — get immediately actionable commands. Non-GitHub teams get a discoverable pointer to the
right customization surface. Workflows stay specific rather than abstracting to generic placeholders.

### Platform config setting

`arc-config.yml` includes a platform declaration:

```yaml
# Platform for git hosting and CI.
#   Informational — read by agent for context, not consumed by hooks.
platform.type: github
```

This is informational, not mechanical. The agent reads it during session initialization and knows to reference
QUICK-REFERENCE for platform-appropriate commands rather than assuming GitHub. Hooks do not consume it — platform choice
does not affect commit validation.

### Portable behavioral guidance

ARC acknowledges the emerging cross-agent convention of portable, self-contained behavioral guidance (skills, custom
instructions, etc.) as a legitimate, complementary practice.

**The boundary is dependency.** If guidance depends on ARC concepts — quality tiers, session lifecycle, task loop
protocol — it belongs in an ARC strategy or workflow. The dependency is what makes it integrated, and integration is
where ARC's consistency guarantees apply. If guidance is fully self-contained, it can exist independently. ARC does not
guarantee consistency for guidance outside its integration model, but does not block it either.

**Coexistence, not competition.** Teams using self-contained guidance for independent concerns (TDD methodology, code
review patterns, style guides) alongside ARC are not in conflict. Integration requires bringing the content into ARC's
model — adapted into a project strategy or workflow in `project/` directories, where it gains ARC's lifecycle
guarantees. The `project/strategies/` and `project/workflows/` directories are the natural landing zone. A lightweight
integration workflow provides a structured path for teams that want to bring external guidance into ARC's model.

---

## Validation Scenarios

Three high-risk scenarios that test the configurability model against real adopter situations.

### Scenario A: Scrum team with Jira

A Scrum team uses Jira for sprint tracking and wants `[JIRA-XXX] description` as their commit format. They want task
completion to update Jira, not markdown checkboxes.

**What they configure:**

- `commit.format: custom` with `commit.custom_pattern` matching their Jira format
- `commit.context_footer: custom` with `commit.context_pattern` matching `Closes JIRA-XXX` or similar
- Method override for task completion: "Update Jira ticket status to Done" replaces "Mark `[x]` in markdown task list"
- Method override for commit context format: Jira ticket reference replaces ARC's `Context: tasks-*.md` footer

**What stays the same:** All 11 principles honored. Quality gates still run. The agent still follows ARC's task loop —
it just records completion in Jira instead of markdown. Session ceremonies, spec-driven planning, and co-development are
unchanged. The team may still use ARC task lists as a working scratchpad alongside Jira, or rely solely on Jira for
tracking — the method override handles either pattern.

**Profile:** Recommended (full enforcement, custom methods).

### Scenario B: Factory-style agent (bookend pattern)

A team uses ARC for planning and integration but delegates bounded, well-specified execution to an async agent (Codex
cloud, Devin).

**What they configure:** Standard recommended profile. No special configurability needed — the bookend pattern is about
how the team _uses_ ARC, not how they configure it.

**How it works:** ARC governs planning (PRDs, task decomposition with acceptance criteria) and integration (quality
gates, PR review, traceability). The execution phase — where the async agent works autonomously — operates outside ARC's
methodology. ARC's spec-driven planning output serves as the dispatch specification. ARC's quality gates verify the
result at integration.

**What ARC does not cover:** The execution phase itself. ARC's co-development principles (P2, P3, P11) do not apply
during delegated execution. The team accepts this tradeoff for bounded, deterministic work where the cost of reduced
human involvement is low.

**Profile:** Recommended. The bookend pattern is an acknowledged usage pattern, not a configuration choice.

### Scenario C: Essentials to recommended scaling

A solo developer starts with the essentials profile while learning ARC. After a few weeks, they decide to adopt full
enforcement.

**The scaling path:**

1. Edit `arc-config.yml`: change `commit.format` from `any` to `conventional`, change `commit.context_footer` from
   `optional` to `required`, enable `hooks.commit_msg`, change `branch.protection` from `unprotected` to `partial`
2. Done. No file additions, no reinstallation, no migration.

**What changes:** Hooks now enforce commit format and context footers. Branch protection requires branches for planned
work. The agent's behavior is largely unchanged — it was already following the conventions from loaded guidance.
Enforcement catches up to what the agent was already doing.

**What the developer notices:** Commits that would have been accepted are now validated. The quality is the same (the
agent was already producing conventional commits); the enforcement is new. The transition is smooth because the
essentials experience demonstrated the conventions in practice before enforcement was activated.

---

## Relationship to Other Documentation

- **[Core philosophy strategy][core-philosophy]** — The companion to this document. Defines what ARC is: principles,
  philosophical foundation, positioning. This document defines how teams customize it.
- **ADRs (`.arc-internal/reference/adr/`)** — The immutable decision records behind this strategy. ADR-003 (config +
  extensions), ADR-004 (adoption tiers), ADR-005 (external compat + method overrides), and ADR-006 (methodology
  compatibility) document the analysis, alternatives considered, and consequences for each design decision.
- **[Development methodology strategy][dev-methodology]** — Operational rules for how work happens (commit standards,
  session management, task protocols). The conventions that this document's configuration system makes adjustable are
  defined and described there.
- **[Quality gates strategy][quality-gates]** — The tiered quality gate system. Extension points at quality gate
  boundaries let teams add project-specific checks.
- **[Work organization strategy][work-org]** — Branch model, work categories, archival. Branch-related config settings
  (`branch.base`, `branch.protection`, `merge.strategy`) interact with the conventions defined there.

---

[core-philosophy]: strategy-core-philosophy.md
[dev-methodology]: strategy-development-methodology.md
[quality-gates]: strategy-quality-gates.md
[work-org]: strategy-work-organization.md
