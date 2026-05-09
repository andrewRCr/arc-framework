# Strategy: Configurability Architecture

> **Full guide:** [Customization](https://andrewrcr.github.io/arc-framework/customization/) — design
> philosophy, adoption defaults, validation scenarios, and the complete agent hooks guide.

**Purpose:** Operational reference for ARC's customization mechanisms — configuration settings, extension
points, method overrides, and the convention inventory. Agents and workflows consult this document when
encountering customization decisions.

**Scope:** Configuration settings, extension points, method overrides, content-level customization (project
strategies, workflows, domain-specific rules), platform compatibility, and the full convention inventory.

---

## Contents

- [The Customization Model](#the-customization-model) — mechanisms, boundary tests, convention inventory
- [Configuration](#configuration) — `arc-config.yml` design, structural vs. runtime settings
- [Extension Points](#extension-points) — adding behavior to workflows
- [Method Overrides](#method-overrides) — replacing convention implementations
- [Platform and Tool Compatibility](#platform-and-tool-compatibility) — platform commands, skills positioning

---

## The Customization Model

ARC's three-tier flexibility model draws a sharp line between principles (tier 1, non-negotiable) and
conventions (tier 2, configurable with defaults). Escape hatches (tier 3) acknowledge practices outside ARC's
design envelope without blocking them.

Customizing conventions — not principles — is the entire scope of the configurability architecture. Three
mechanisms handle different kinds of customization, and existing project documentation absorbs a fourth concern:

| Mechanism       | What It Does              | File                 | Example                                    |
|-----------------|---------------------------|----------------------|--------------------------------------------|
| Config          | Toggles enforcement       | `arc-config.yml`     | `commit.format: any` disables hook check   |
| Extension       | Adds steps to workflows   | `system/extensions/` | Post-task quality: also run security scan  |
| Method override | Replaces default behavior | `system/methods/`    | Session state: custom format, not default  |
| QUICK-REFERENCE | Environment/tool commands | `QUICK-REFERENCE.md` | `glab mr create` instead of `gh pr create` |

### Which mechanism do I use?

- If the customization changes a **value** that affects existing behavior → **config**
- If it adds **new steps** at a workflow point → **extension**
- If it **replaces** how ARC does something with how the team does it → **method override**
- If it changes **which CLI tool** to use for an operation → **QUICK-REFERENCE**
- If it adds **domain-specific guidance** for your project → **project strategy**
- If it adds **project-specific procedures** not covered by ARC → **project workflow**
- If it extends **project standards** for a specific domain → **domain-specific dev-rules**

Config, extensions, and method overrides are the three customization mechanisms. QUICK-REFERENCE is not a
"mechanism" in the same sense — it is existing project documentation that naturally absorbs platform command
variation.

Beyond mechanisms, adopters extend ARC through **content-level customization** — creating their own files that
add domain-specific guidance, project-specific procedures, or extended standards:

| Content Channel       | What It Does                | Location              | Example                                        |
|-----------------------|-----------------------------|-----------------------|------------------------------------------------|
| Project strategies    | Domain-specific guidance    | `strategies/project/` | `strategy-authentication.md` for auth patterns |
| Project workflows     | Project-specific procedures | `workflows/project/`  | Custom deploy workflow, release checklist      |
| Domain-specific rules | Extended project standards  | `constitution/`       | `DEV-RULES.FRONTEND.md`, `DEV-RULES.AUTH.md`   |

These are project-owned files — adopters create them, ARC doesn't ship them. `DEV-RULES.ARC.md` and
`DEV-RULES.PROJECT.md` are loaded during session initialization; project strategies, workflows, and domain-specific
rules are loaded on demand when work touches their domain.

**Authoring project workflows.** Unlike `workflows/arc/` (framework-owned, wholesale replaced on update),
`workflows/project/` is adopter territory. Project workflows may load ARC methods or extensions by declaring them
in the frontmatter's `arc.methods` / `arc.extensions` arrays — see [Workflow Authoring Strategy][workflow-authoring]
for the schema and declaration rule, and [`template-workflow.md`][template-workflow] for canonical structure.
Workflows with no method/extension dependencies can skip the schema.

**DEV-RULES.PROJECT splitting:** `DEV-RULES.PROJECT.md` can be split into domain-specific files
(`DEV-RULES.FRONTEND.md`, `DEV-RULES.AUTH.md`, etc.) as project standards grow. The base file remains the entry
point with cross-project standards; domain files extend it for specific areas.

**None of these mechanisms or content channels apply to principles.** Config settings exist for conventions.
Extension points exist at convention-level workflow boundaries. Method overrides replace convention-level
implementations. Content-level customization adds project-specific guidance alongside ARC's framework guidance.
Principles (tier 1) are not configurable through any mechanism — they define what ARC is.

### Convention inventory

ARC's conventions span its core principles. Each convention has a default (what ARC provides out of the box) and
a configurability path (how teams adapt it).

#### Core commitment conventions

| Convention                                                  | Principle | Default                  | Configurability Path                                  |
|-------------------------------------------------------------|-----------|--------------------------|-------------------------------------------------------|
| Document hierarchy (META-PRD → PRD → tasks)                 | P1        | Full hierarchy           | Structural contract — workflows depend on structure   |
| Template-first documents                                    | P1        | Copy-ready templates     | Structural contract — fill in, don't redesign         |
| Per-task mandatory review stop                              | P2        | Stop after each checkbox | Behavioral guidance — adjust review increment scope   |
| Completion protocol (check → mark → verify → report → stop) | P2        | Full ceremony            | Behavioral guidance — adjust protocol steps           |
| Deferred review                                             | P2        | User-defined scope       | Behavioral guidance — adjust scope and conditions     |
| Markdown task list checkboxes                               | P7        | Markdown in git          | Extension — add tracker sync via post-task-completion |

#### Operational discipline conventions

| Convention                              | Principle | Default                             | Configurability Path                                  |
|-----------------------------------------|-----------|-------------------------------------|-------------------------------------------------------|
| Zero-tolerance quality gates            | P4        | All errors must be fixed            | Behavioral guidance — adjust severity levels          |
| Tiered quality gate system (Tier 1/2/3) | P4        | Per-task / per-unit / per-phase     | Behavioral guidance — adjust tier boundaries          |
| Pre-merge aggregate review              | P4        | Lightweight diff review before push | Config setting — `review.pre_merge` + Method override |
| Leave it cleaner (capture floor)        | P4        | Fix or document pre-existing issues | Method override — fix-now vs. capture-and-defer       |
| Test-first assessment                   | P4        | Decision tree by change type        | Method override — substitute assessment criteria      |
| Conventional commit format              | P6        | `type(scope): description`          | Config setting — `commit.format`                      |
| Context footer on commits               | P6        | `Context: tasks-*.md (Task X.Y)`    | Config setting — `commit.context_footer`              |
| Atomic commits                          | P6        | One logical change per commit       | Behavioral guidance — adjust unit of organization     |
| Branch naming conventions               | P6        | `feature/`, `technical/`, etc.      | Behavioral guidance — any consistent scheme           |
| Per-WU status + user/{identity}/ state  | P5        | Two-file session state in user dir  | Method override — substitute session mechanism        |
| Session init/handoff ceremonies         | P5        | Structured document loading         | Behavioral guidance — ceremony adapted to agent type  |
| Commit interlock release                | P5        | Manual commit                       | Config setting — `session.commit_interlock`           |
| Sync interlock release                  | P5        | Sync at handoff                     | Config setting — `session.sync_interlock`             |
| Push interlock release                  | P5        | Manual push                         | Config setting — `session.push_interlock`             |

#### Design commitment conventions

| Convention                         | Principle | Default                                  | Configurability Path                         |
|------------------------------------|-----------|------------------------------------------|----------------------------------------------|
| Collaborative voice in docs        | P9        | Team perspective, no "user/AI" framing   | Behavioral guidance — documentation style    |
| Reference-style markdown links     | P9        | Reference links, definitions at file end | Behavioral guidance — link formatting style  |
| No meta-project references in code | P9        | Task IDs stay in `.arc/` docs            | Behavioral guidance — enforcement strictness |

**Configurability path definitions:**

- **Config setting** — A value in `arc-config.yml` that hooks, workflows, or agents read at runtime to change
  behavior. See [Configuration](#configuration).
- **Method override** — A populated `.override` section in a file under `system/methods/` that substitutes
  ARC's default implementation with the team's alternative. See [Method Overrides](#method-overrides).
- **Extension** — Additional steps added at preset workflow points via files under `system/extensions/`. See
  [Extension Points](#extension-points).
- **File-customizable** — The convention is configured by editing Configurable project-level files.
  DEV-RULES.PROJECT, QUICK-REFERENCE, agent-specific files — the file itself is the configuration. Changes
  are preserved across framework updates via three-way merge.
- **Structural contract** — The convention defines artifact structure that workflows depend on. Templates
  (PRD, task list, plan) are Framework files — adopters fill them in but don't redesign them. Workflows
  assume specific fields, headers, and formats.
- **Behavioral guidance** — The convention is expressed as prose that agents and developers follow. Adjusted by
  editing the guidance in strategy or workflow documents.

### Agent discovery

The agent learns about the active configuration during session initialization. After loading standard documents,
the agent reads `arc-config.yml` and enumerates active extensions:

1. **Platform**: If `platform.type` differs from `github`, reference QUICK-REFERENCE § Platform Commands for
   platform-appropriate commands
2. **Active extensions**: Run `grep -l "^active: true" system/extensions/*.md` and map hits to extension
   basenames — this is the active-extensions list consulted by fire-point directives in downstream workflows.
   Methods are not enumerated at session init; method defaults and overrides always load on-demand when
   workflows reference them (see [Session Operations Strategy][session-ops])
3. **Custom patterns**: If `commit.format: custom` or `commit.context_footer: custom`, note the active patterns

This is a read-and-note step, not a ceremony. The agent carries this awareness through the session and applies
it when encountering method references, extension fire points, or platform-specific operations.

---

## Configuration

### Design: `arc-config.yml`

`arc-config.yml` is the single configuration file for all convention-level settings. It uses dotted keys for
logical grouping within a flat-file, shell-parseable format.

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
pm.mode: none
```

### What earns a config setting

Not every convention needs a config knob. Three categories determine where configurability lives:

**Runtime-checkable (config setting):** The convention's current value is needed at runtime by hooks, workflows,
or agent guidance to change operational behavior. All config settings fall in this category.

**File-customizable (edit the file):** The convention is configured by modifying the file that embodies it.
Template formats, document hierarchy structure, agent-specific file content — these are customized by editing the
relevant template or document.

**Behavioral guidance (prose instructions):** The convention is expressed as guidance that agents and developers
follow. Review increment scope, collaborative voice, completion protocol details — these are adjusted by editing
the prose in strategy or workflow documents.

**Criteria for adding new settings:** A convention earns a config setting when (a) its value is consumed
programmatically by hooks, workflows, or agent processing, AND (b) the alternative — editing framework files
directly — would create update safety or maintenance problems.

### Config scope: project-wide by design

`arc-config.yml` is a **project-level** file — all settings apply to the entire team. There is no per-developer
layering mechanism.

- Every current setting (`branch.*`, `commit.*`, `merge.*`, `hooks.*`, `platform.*`) is inherently project-wide.
  Per-developer variation would create inconsistency.
- Per-developer values (e.g., identity) route through **git config** (`git config arc.identity alice`).
- Project-level defaults that individuals may want to override (e.g., `user.notes_push`) follow the same pattern:
  `arc-config.yml` sets the team default, git config provides a personal override.

### Settings with behavioral implications

Most config settings are straightforward toggles. Some carry deeper implications for how workflows behave.

**Merge strategy** (`merge.strategy`) has three values with different traceability characteristics:

- **`merge`** (default) — Merge commits preserve branch topology and individual commit history. Most aligned
  with P6 (traceability).
- **`rebase`** (convention, tier 2) — Commits replayed onto a new base for linear history. Hashes change,
  which can complicate traceability if commits are referenced elsewhere by hash.
- **`squash`** (escape hatch, tier 3) — Individual commits collapse into one per branch. Traceability shifts:
  PR descriptions must carry the traceability that individual commits would normally provide.

**Session interlocks** govern how approval propagates through the commit, sync, and push interlocks:

- **`session.commit_interlock: manual`** (default) — commit requires explicit user invocation.
- **`session.commit_interlock: on-task-approval`** — task approval releases the commit interlock.
- **`session.commit_interlock: on-workflow`** — task approval and workflow-ceremony commits both
  release the commit interlock.
- **`session.sync_interlock: on-handoff`** (default) — handoff invokes `arc sync` as part of the
  handoff ceremony.
- **`session.sync_interlock: manual`** — handoff surfaces unpushed state without invoking sync.
- **`session.sync_interlock: on-workflow`** — handoff and other workflow-driven sync triggers
  both release the sync interlock (forward-compatible with upcoming worktree work units; today
  behaviorally equivalent to `on-handoff`).
- **`session.push_interlock: manual`** (default) — push requires explicit user invocation.
- **`session.push_interlock: on-sync`** — an `arc sync` event releases the push interlock.
- **`session.push_interlock: on-workflow`** — sync events and other workflow-driven push events
  both release the push interlock.

The three values per interlock form an ascending permissiveness ladder: `manual` (zero triggers)
< `on-{primary}` (the named trigger) < `on-workflow` (`on-{primary}` plus other agent-mediated
workflow events). Trigger sets, not single triggers.

The three interlocks chain: handoff event → sync, sync event → push (and notes-push). Each
interlock's `on-X` value names its own trigger. The interlock model these settings configure
lives in [Session Operations Strategy][session-ops] § Interlock Model and § Handoff-Interior
Toggle Pattern.

**Release-wrapper opt-in** (`arc.release.enabled`) is a separate config axis from the interlocks
— orthogonal to WHEN the agent fires (interlock-governed), it controls HOW the invocation is
shaped. Resolution layers per-developer git-config (`arc.releaseEnabled`, local scope) over the
project-wide yaml setting (`release.enabled`); default `false`. See [Session Operations
Strategy][session-ops] § Interlock Model for the wrapper layer.

### Handoff-interior toggles

Inside the orthogonal session-handoff ceremony, individual actions (notes push, future worktree
push, future quality-gate finalization) are configured via flat keys under their primary domain —
`user.notes_push`, future `worktree.<action>`. Standard value enum: `manual | on-X` where `X`
names the operation's trigger event; `prompt` is an opt-in third value for toggles that want
review-before-fire (e.g., team-mode `user.notes_push: prompt`). The pattern is documented in
[Session Operations Strategy][session-ops] § Handoff-Interior Toggle Pattern; consumer plans
adding new toggles follow that shape.

### Structural vs. runtime settings

Config settings divide into two categories based on how changes take effect:

**Structural settings** affect which files are installed and how templates render. Changing them requires
`arc init --reconfigure`:

- `pm.mode` — Adds or removes arc-in-git files (ROADMAP, backlogs, PROJECT-STATUS, strategies)
- `team.mode` — Adds or removes team coordination content in rendered templates
- `project_name` — Re-renders token substitutions (`{{PROJECT_NAME}}`) across templates

**Runtime settings** are read by hooks and the agent at runtime. Changing them is a direct edit to
`arc-config.yml` — no command needed:

- `commit.format`, `commit.context_footer` — Hook validation rules
- `hooks.pre_commit`, `hooks.commit_msg` — Hook enable/disable
- `branch.base`, `branch.protection` — Branch model
- `merge.strategy` — Integration strategy
- `platform.type` — Agent platform awareness
- `review.pre_merge` — Pre-merge review toggle

**Personal settings** (role, tools) route through `git config` and are managed by `arc join` and
`arc join --reconfigure`, not through `arc-config.yml`.

### Tier 3 in config

Escape hatches (tier 3) are not formally supported but not blocked. Most are prose-acknowledged.

**When a tier 3 item appears in config:** When ARC's workflows or hooks can meaningfully adapt behavior based on
the setting. The squash merge example demonstrates this — the config value triggers adapted guidance.

**When a tier 3 item stays prose-only:** When ARC has no behavioral adaptation to offer.

---

## Extension Points

Extension points let teams add behavior at specific locations in ARC workflows — custom quality checks,
additional context loading, pre-commit verification — without modifying framework-owned files.

### Mechanism

Each extension has its own file under `system/extensions/`. Files are framework-owned and project-filled: ARC
provides the structure (YAML frontmatter plus an `.actions` section), teams populate `.actions` with their steps
and flip `active: true` in the frontmatter. Classified Configurable — preserved through three-way merge during
framework updates.

Each preset file includes: which workflow it extends, when it fires, what the contract allows, and an empty
`.actions` section.

### References in workflows

Extension points appear as conditional steps in workflow documents, with a backtick anchor tag for grep-ability:

```markdown
- **Extensions** · `#post-task-quality`: If `post-task-quality` appears in the active-extensions
  list (established at session init), load and execute its [`.actions`][arc-ext-task-quality].
  Otherwise, skip.
```

The agent checks the active-extensions list (enumerated at session init via `grep -l "^active: true"` on
`system/extensions/*.md`). If the extension is active, the agent reads its `.actions` section and executes;
otherwise the step short-circuits.

### Preset vs. custom

**Preset (convention, tier 2):** ARC defines these at specific, tested locations in workflow docs. They have
defined contracts and corresponding files in `system/extensions/`. This is the expected customization path.

**Custom (escape hatch, tier 3):** Teams may add their own extension points elsewhere in workflow docs. ARC does
not block this, but custom points are outside the framework's design envelope — framework updates may conflict,
and the team is responsible for maintaining them.

---

## Method Overrides

Method overrides let teams replace ARC's default convention implementations with their own. Where config toggles
enforcement and extensions add behavior, method overrides substitute behavior — a different way of satisfying the
same principle.

### Mechanism

Each method has its own file under `system/methods/`, co-located with `system/extensions/`. Same
classification (Configurable), same ownership model (framework-owned structure, project-filled `.override`
sections).

Each preset method defines a contract — the invariant that both the default and any override must satisfy.
Contracts are advisory, not mechanically enforced.

When an override is populated, the agent follows the override instead of the default. Method content loads
on-demand when the agent reaches a workflow step that references the method — not at session initialization.

### Method references in workflows

Method references appear as inline links in workflow prose. The workflow describes WHAT to do; the method
defines HOW:

```markdown
5. Commit using the [commit-format][arc-methods-cf] and
   [commit-context-format][arc-methods-ccf] methods
```

### Hook interaction

For methods with mechanical enforcement (commit format, context footer), hooks read override configuration from
`arc-config.yml`. The `custom` config value bridges "I want enforcement" and "I want _different_ enforcement":

| Setting value  | Hook behavior                                                |
|----------------|--------------------------------------------------------------|
| `conventional` | Validates against ARC's built-in conventional commit pattern |
| `custom`       | Validates against the team's `commit.custom_pattern` regex   |
| `any`          | Skips format validation entirely                             |

For behavioral methods (session state, issue-triage, test-first) that do not have mechanical hook enforcement,
the override is purely agent-level.

### Preset vs. custom

Same model as extension points. **Preset methods** are defined by ARC at tested locations with contracts — the
expected customization path. **Custom methods** may be defined by teams for operations ARC does not preset —
escape hatch territory, not guaranteed compatible across updates.

---

## Platform and Tool Compatibility

### Platform commands

ARC handles platform-specific tool commands through QUICK-REFERENCE rather than the method override system.
Platform commands and behavioral methods are distinct concerns:

- **Behavioral methods** (what to do) → `system/methods/`
- **Tool commands** (which CLI to run) → QUICK-REFERENCE

QUICK-REFERENCE is the project-specific environment context and command patterns document. It is Configurable
classification, read every session, and designed for teams to edit. Teams on GitLab replace `gh` commands with
`glab` equivalents. The structure is the same; the commands differ.

### Platform notes in workflows

Workflows retain concrete commands for the default case (GitHub), with brief platform notes pointing to
QUICK-REFERENCE § Platform Commands for alternatives:

```markdown
### Push and Create PR

git push -u origin {branch-name}
gh pr create --base {parent-branch} --head {branch-name}

> **Platform:** Commands above use GitHub CLI. See QUICK-REFERENCE § Platform Commands for
> alternative platform equivalents.
```

### Platform config setting

`arc-config.yml` includes a platform declaration:

```yaml
platform.type: github
```

This is informational, not mechanical. The agent reads it during session initialization and knows to reference
QUICK-REFERENCE § Platform Commands when invoking platform tooling. Hooks do not consume it.

### Portable behavioral guidance

ARC acknowledges the emerging cross-agent convention of portable, self-contained behavioral guidance as a
legitimate, complementary practice. This includes standards like [Agent Skills][agent-skills-spec] (reusable
skill modules adopted across multiple platforms) as well as platform-specific custom instructions and slash
commands.

**The boundary is dependency.** If guidance depends on ARC concepts — quality tiers, session lifecycle, task
loop protocol — it belongs in an ARC strategy or workflow. If guidance is fully self-contained, it can exist
independently.

**Coexistence, not competition.** Teams using self-contained guidance for independent concerns (TDD methodology,
code review patterns, style guides) alongside ARC are not in conflict. Integration requires bringing the content
into ARC's model — adapted into a project strategy or workflow in `project/` directories, where it gains ARC's
lifecycle guarantees.

### Agent lifecycle hooks

Most modern agent platforms support lifecycle hooks — event handlers that fire deterministically when platform
events occur. These operate alongside ARC's methodology-layer customization (config, extensions, method
overrides) but at a different layer:

- **ARC's customization mechanisms** are methodology-directed — the agent reads configuration and follows it
- **Agent hooks** are platform-directed — the platform executes them regardless of agent decision-making

Agent hooks are configured in the platform's native format (not in `arc-config.yml`). ARC does not ship hook
configurations — the methodology describes what behaviors to trigger, and teams configure their platform
accordingly. For detailed mapping of ARC behaviors to hook events, value assessment, and adopter guidance, see
the [Agent Hooks](https://andrewrcr.github.io/arc-framework/customization/hooks/) guide on the docs site.

---

## Relationship to Other Documentation

- **[Principles](https://andrewrcr.github.io/arc-framework/methodology/principles/)** — Defines what ARC is:
  P1-P11 principles, philosophical foundation. This document defines how teams customize it.
- **[Development Rules][dev-rules-arc]** — Operational rules for how work happens (commit standards, session
  management, task protocols). The conventions that this document's configuration system makes adjustable.
- **[Quality Gates Strategy][quality-gates]** — The tiered quality gate system. Extension points at quality gate
  boundaries let teams add project-specific checks.
- **[Work Organization Strategy][work-org]** — Branch model, work categories, archival. Branch-related config
  settings interact with conventions defined there.

---

[session-ops]: strategy-session-operations.md
[dev-rules-arc]: ../../constitution/DEV-RULES.ARC.md
[quality-gates]: strategy-quality-gates.md
[work-org]: strategy-work-organization.md
[workflow-authoring]: strategy-workflow-authoring.md
[template-workflow]: ../../templates/template-workflow.md
[agent-skills-spec]: https://agentskills.io/
