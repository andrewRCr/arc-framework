# ADR-005: Design External Tool and Platform Compatibility

## Status

Accepted

## Context

ADR-001 established 11 principles and 19 conventions, with platform-specific assumptions (GitHub Actions, `gh` CLI,
PR-based workflows) classified as convention under P6 (traceability). ADR-003 designed two customization mechanisms:
config toggles enforcement, extension points add behavior. ADR-004 identified a gap: neither mechanism handles teams
that want to *replace* ARC's default convention implementations with their own.

Three adopter postures exist:

1. "I don't care about format" → `commit.format: any`, agent produces quality output. **Config handles this.**
2. "I want ARC's convention enforced" → `commit.format: conventional`, hooks enforce. **Config handles this.**
3. "I want something *different* enforced" → No mechanism exists. **This ADR addresses this.**

Case 3 is common and real: Jira ticket references instead of context footers, team-specific commit formats,
external trackers as status-of-record instead of markdown checkboxes, GitLab instead of GitHub. These are active
alternative practices, not absence of preference.

**Three concerns drive this decision:**

**External tracker integration.** Teams using Jira, Linear, or GitHub Issues as their tracking authority need ARC's
methodology (spec-directed planning, quality gates, co-development) without being forced to use markdown checkboxes as
the completion mechanism. ADR-001 already classified markdown task lists as convention under P7; the mechanism for
substitution was deferred.

**Platform compatibility.** ARC's current workflows embed GitHub-specific assumptions: `gh pr create` and
`gh pr merge` in `archive-completed.md`, GitHub CLI references in review workflows, implicit PR terminology
throughout. Research shows GitHub dominates the market (56-67% of repositories, 92% of Fortune 100), but GitLab holds
a significant professional niche (Gartner Magic Quadrant Leader, 9-29% by survey) and Bitbucket persists through
Atlassian ecosystem integration. Platform-specific commands are convention — substitutable — but no structured
substitution path exists.

**Portable behavioral guidance (skills).** SKILL.md files have become a near-universal convention across agent tools
(Claude Code, Codex, Gemini CLI, Copilot). ARC needs an explicit position on how portable self-contained guidance
relates to its own integrated guidance model.

**The gap in the customization model.** ADR-003 established config (toggles) and extensions (adds). The missing
mechanism is *replacement* — a structured way for teams to substitute ARC's default convention implementations
with their own, without editing framework-owned files. ADR-004's two-axis adoption model (enforcement depth ×
method customization) explicitly depends on this mechanism for the second axis.

**Evidence base:**

- Adopter experience audit: 3 adoption-blocking dealbreakers and 4 team workflow gaps, all involving conventions
  teams want to replace rather than disable
- Agent landscape research: 17 tools across 4 categories; platform-specific tooling varies but git is universal
- Platform market research: GitHub 56-67% overall / 92% Fortune 100; GitLab 9-29% (strong enterprise niche);
  Bitbucket 10M+ users (Atlassian ecosystem)
- Existing ARC infrastructure: QUICK-REFERENCE already serves as project-specific command reference;
  `arc-extensions.md` already demonstrates the cross-reference pattern for workflow customization
- Skills analysis: comparison of ARC strategies/workflows with portable behavioral guidance conventions across
  agent tools

## Decision

### Part 1: Method Override Mechanism

We will introduce a **method override** system as the third customization mechanism, completing the model established
in ADR-003:

| Mechanism       | What it does                | File                | Example                                    |
|-----------------|-----------------------------|---------------------|--------------------------------------------|
| Config          | Toggles enforcement         | `arc-config.yml`    | `commit.format: any` disables hook         |
| Extension       | Adds steps to workflows     | `arc-extensions.md` | Post-task quality: also run Snyk scan      |
| Method override | Replaces default convention | `arc-methods.md`    | Task completion: update Jira, not markdown |

**`arc-methods.md`** is a new file at `system/workflows/arc-methods.md`, parallel to `arc-extensions.md`. It is
framework-owned and project-filled — ARC provides the structure and preset method scaffolding, teams add their
override content. Classified as **Configurable** (same as `arc-config.yml` and `arc-extensions.md`), preserved
through three-way merge during framework updates.

#### Method Definition Structure

Each preset method in `arc-methods.md` contains:

```markdown
## task-completion

**Workflow:** process-task-loop.md · **When:** Agent marks a task as complete
**Contract:** Record that the specified task is complete. Status must be verifiable
by both human and agent.
**Default:** Mark `[x]` in the markdown task list file, update task description
with completion notes.

### Project Override

[No override configured]
```

**Key fields:**

- **Workflow**: Which workflow references this method (traceability)
- **When**: The trigger condition (agent knows when to check)
- **Contract**: What the method must accomplish — the invariant that both default and override must satisfy.
  Contracts are advisory, not mechanically enforced. The team is responsible for ensuring their override meets
  the contract. This is consistent with ARC's approach: principles define what, conventions define how, teams
  own their choices.
- **Default**: ARC's built-in implementation (what happens when no override exists)
- **Project Override**: Team-filled section. Replaces the default when populated. The `[No override configured]`
  placeholder communicates "nothing here yet" and "this is where your content goes."

When an override is populated, the agent follows the override instead of the default. The agent reads `arc-methods.md`
during session-init (or on first encounter of a method reference) and carries the awareness through the session.

#### Method References in Workflows

Workflows reference overridable operations with **block-style method markers** at major behavioral override points:

```markdown
---
**Method — Task Completion Tracking** · `#task-completion`
Contract: Record that the specified task is complete. Status verifiable by human and agent.
Default: Mark `[x]` in the markdown task list file.
See: [arc-methods.md](../arc-methods.md#task-completion)
---
```

**Format requirements:**

- Bounded by horizontal rules (`---`) for visual distinction when scanning raw markdown
- Method name in bold, anchor tag in backtick code span for grep-ability
- Contract line states the invariant (what must be true regardless of implementation)
- Default line states ARC's built-in behavior (what happens with no override)
- Inline link to the methods file section (same pattern as extension points)

**Agent processing:** Agent reads a workflow, encounters a method marker, follows the link to `arc-methods.md`,
reads the corresponding section. If a project override exists, follows it. If the placeholder is present, follows
the default. Returns to the workflow and continues. Same cross-reference pattern agents already follow throughout
ARC documentation.

#### Scope: Preset Methods

Method markers appear only at **major behavioral override points** — operations where teams have demonstrated
or anticipated customization needs. The target is 3-5 across all workflows. More can be added in future versions;
fewer is better than more.

**Candidate preset methods** (to be finalized during WU2 when workflows are updated):

| Method                   | Workflow             | Default                          | Common Override               |
|--------------------------|----------------------|----------------------------------|-------------------------------|
| Task completion tracking | process-task-loop    | Mark `[x]` in markdown task list | Update Jira/Linear status     |
| Quality gate commands    | process-task-loop    | Project-specific lint/test/build | Team CI suite, security scans |
| Session state mechanism  | session-init/handoff | CURRENT-SESSION.md read/write    | IDE persistent memory, etc.   |
| Commit context format    | atomic-commit        | `Context: tasks-*.md (Task X.Y)` | `Closes JIRA-XXX`, `Fixes #N` |

These are illustrative, not final. WU2 should evaluate each workflow for natural method points using the same
criteria as extension points: 0-3 per workflow document, identified where teams have demonstrated or anticipated
customization needs.

**Preset vs. custom methods:** Preset methods are defined by ARC at tested locations with contracts. Teams may
define custom methods for operations ARC doesn't preset, following the same structure. Custom methods are escape
hatch territory (tier 3) — ARC doesn't block them but doesn't guarantee compatibility across updates.

### Part 2: Hook Interaction With Custom Methods

For methods with mechanical enforcement (commit format, context footer), hooks read override configuration from
`arc-config.yml`. Config provides both the override declaration and the custom pattern:

```yaml
# Custom commit format — hook validates against this pattern
commit.format: custom
commit.custom_pattern: "^\\[?[A-Z]+-[0-9]+\\]? .+"

# Custom context footer — hook validates against this pattern
commit.context_footer: custom
commit.context_pattern: "^(Closes|Fixes|Relates to) [A-Z]+-[0-9]+"
```

**Hook behavior by config value:**

| Setting value  | Hook behavior                                                |
|----------------|--------------------------------------------------------------|
| `conventional` | Validates against ARC's built-in conventional commit pattern |
| `custom`       | Validates against `commit.custom_pattern` regex              |
| `any`          | Skips format validation entirely                             |

This extends ADR-003's config system naturally — `arc_config_get` already reads values from the flat file. Adding
`commit.custom_pattern` and `commit.context_pattern` settings uses the same grep/cut parsing. The `custom` value
is the bridge between "I want enforcement" and "I want *different* enforcement."

**Config provides common pattern examples** as inline comments to reduce regex-authoring friction:

```yaml
# commit.custom_pattern: Regex for custom commit format validation.
#   Only used when commit.format is 'custom'.
#   Examples:
#     Jira prefix:      "^\\[?[A-Z]+-[0-9]+\\]? .+"
#     Ticket + type:    "^[A-Z]+-[0-9]+ (feat|fix|docs): .+"
#     Issue reference:  "^#[0-9]+ .+"
```

**For behavioral methods** (task completion, session state) that don't have mechanical hook enforcement, the
override is purely agent-level: the agent reads the method override from `arc-methods.md` and follows it. No
hook interaction needed — these are prose-guided operations.

### Part 3: Platform Compatibility

We will handle platform-specific tool commands through **QUICK-REFERENCE** (existing infrastructure) rather
than the method override system. Platform commands and behavioral methods are distinct concerns with distinct
solutions:

- **Behavioral methods** (what to do) → `arc-methods.md`
- **Tool commands** (which CLI to run) → QUICK-REFERENCE

#### QUICK-REFERENCE as Platform Command Reference

QUICK-REFERENCE is already the project-specific "environment context and command patterns" document. It is
Configurable classification, read every session, and designed for teams to edit. Adding a platform commands
section is a natural extension of its existing purpose:

```markdown
## Platform Commands

### Merge Requests / Pull Requests

# Create merge request
gh pr create --base {parent-branch} --head {branch-name}

# Merge
gh pr merge {pr-number} --merge

# View CI status
gh run list --branch {branch-name}
```

Teams on GitLab replace these with `glab mr create`, `glab mr merge`, etc. Teams on Bitbucket use their
equivalents. The structure is the same; the commands differ.

**Why QUICK-REFERENCE, not `arc-methods.md`:** Tool commands are not behavioral methods — they're environment
configuration. "Use `glab` instead of `gh`" is the same kind of project-specific detail as "our test command
is `pytest`" or "our lint command is `eslint`." QUICK-REFERENCE already handles this class of information.
Routing platform commands through the method override system would inflate the methods file with what are
essentially environment variables.

#### Platform Notes in Workflows

Workflows retain concrete commands for the default case (GitHub), with brief platform notes pointing to
QUICK-REFERENCE for alternatives:

```markdown
### 6) Push and Create PR

git push -u origin {branch-name}
gh pr create --base {parent-branch} --head {branch-name}

> **Platform:** Commands above use GitHub CLI. See QUICK-REFERENCE § Platform Commands
> for alternative platform equivalents.
```

**Why this approach:**

- **GitHub users** (the majority) get immediately actionable inline commands — no indirection.
- **Non-GitHub teams** get a clear, discoverable pointer to the right customization surface.
- **Workflows stay specific** rather than abstracting to "create a merge request" — specificity is more useful
  than generality for the default case.
- **The customization path is familiar** — editing QUICK-REFERENCE is something teams already do for other
  project-specific commands.

#### Platform Config Setting

`arc-config.yml` gains a platform declaration:

```yaml
# Platform for git hosting and CI.
#   Informational — read by agent for context, not consumed by hooks.
#   Affects agent behavior when referencing platform-specific operations.
platform.type: github
```

This is informational, not mechanical. The agent reads it during session-init and knows to reference
QUICK-REFERENCE for platform-appropriate commands rather than assuming GitHub. Hooks don't consume it —
platform choice doesn't affect commit validation or branch protection.

### Part 4: Portable Behavioral Guidance (Skills)

We will establish ARC's position on the emerging cross-agent SKILL.md convention. This is a positioning
decision, not a mechanism design — it clarifies how ARC relates to skills without introducing new
infrastructure.

#### The Dependency Boundary

ARC's consistency guarantees come from the handshake between documents — strategies reference quality gates,
workflows reference strategies, the task loop references session lifecycle. This integration is how ARC delivers
predictable results.

Skills are portable, self-contained behavioral guidance. Their portability is their value — they work across
repos and agents precisely because they don't depend on any framework's internal structure.

**The boundary is dependency:**

- If guidance depends on ARC concepts (quality tiers, session lifecycle, task loop protocol), it belongs in an
  ARC strategy or workflow. The dependency is what makes it integrated.
- If guidance is fully self-contained, it can exist as a skill. ARC doesn't guarantee consistency for guidance
  outside its integration model, but doesn't block it either.
- The moment a skill is referenced from an ARC workflow (e.g., "when implementing, invoke /tdd"), it has become
  framework content with extra indirection. The content should live in a project strategy at that point — the
  skill wrapper adds no value once it's integrated.

#### Coexistence, Not Competition

ARC acknowledges skills as a legitimate, complementary convention:

- **Standalone use is fine.** Teams using skills for self-contained guidance (TDD methodology, code review
  patterns, style guides) alongside ARC are not in conflict. The skill handles its domain; ARC handles its
  methodology. Tier 3 philosophy applies — ARC states its position and the tradeoff, doesn't forbid the
  alternative.
- **Integration requires bringing content into ARC.** If a team wants a skill's guidance integrated with ARC's
  lifecycle (quality gates run after the skill's steps, session handoff captures the skill's state), the content
  should be adapted into a project strategy or workflow in `project/` directories. This is where it gains ARC's
  consistency guarantees.
- **`project/` directories are the landing zone.** `project/strategies/` and `project/workflows/` are designed
  for team-specific patterns. Adapted skills land here naturally.
- **ARC doesn't mandate.** Teams who find skills reliable enough for their use case can use them directly. ARC's
  position is that integrated guidance produces more predictable results, but acknowledges the tradeoff
  (portability vs. integration) is a team decision.

#### Adapter Workflow (WU2 Scope)

A lightweight `integrate-skill` workflow (WU2, Cluster N5) provides a structured path for teams that want to
bring external skills into ARC's model. The workflow guides the agent through: reading the skill, classifying it
(procedural → project workflow, reference → project strategy), assessing ARC integration points, and producing
an adapted ARC document with appropriate trigger files. This is a convenience — the manual equivalent (read the
skill, write a project strategy) works too.

#### Trigger/Content Separation

ARC's existing pattern — thin dispatcher files in agent tool directories (`.claude/commands/`, `.codex/tasks/`)
pointing to canonical content in `.arc/` — is the right architecture for agent-specific invocation. This pattern
is already working (e.g., `resume-current.md` in `.claude/commands/` dispatches to `session-init.md` in `.arc/`).

WU2 formalizes this as a convention (Cluster N4). WU3 automates the generation of dispatcher files across
configured agent tools. The pattern applies equally to ARC's own workflows and to team-integrated skills that
followed the adapter workflow.

### Part 5: Relationship Between All Customization Mechanisms

The four mechanisms form a complete customization model:

| Mechanism       | Purpose                   | File                 | Scope             |
|-----------------|---------------------------|----------------------|-------------------|
| Config          | Toggle enforcement        | `arc-config.yml`     | Convention values |
| Extension       | Add workflow steps        | `arc-extensions.md`  | New behavior      |
| Method override | Replace convention impl   | `arc-methods.md`     | Alt. behavior     |
| QUICK-REFERENCE | Environment/tool commands | `QUICK-REFERENCE.md` | Tool specifics    |

**Boundary tests:**

- If the customization changes a *value* that affects existing behavior → **config**
- If it adds *new steps* at a workflow point → **extension**
- If it *replaces* how ARC does something with how the team does it → **method override**
- If it changes *which CLI tool* to use for an operation → **QUICK-REFERENCE**

Config, extensions, and method overrides are the three mechanisms of ADR-004's customization axis. QUICK-REFERENCE
is not a "mechanism" in the same sense — it's existing project-specific documentation that naturally absorbs
platform command variation.

**None of these mechanisms apply to principles.** Config settings exist for conventions. Extension points exist at
convention-level workflow boundaries. Method overrides replace convention-level implementations. QUICK-REFERENCE
documents project-specific tool commands. Principles (tier 1) are not configurable through any mechanism.

### Part 6: Session-Init Config Awareness

Session-init gains a lightweight step for config and method awareness:

After loading standard documents (current step 2 in session-init), the agent reads `arc-config.yml` and notes:

1. **Platform**: If `platform.type` differs from `github`, reference QUICK-REFERENCE for platform commands
2. **Active method overrides**: If any method in `arc-methods.md` has a populated project override, note it
3. **Custom patterns**: If `commit.format: custom` or `commit.context_footer: custom`, note the active patterns

This is a read-and-note step, not a ceremony. The agent carries this awareness through the session and applies it
when encountering method references or platform-specific operations in workflows.

**Implementation note:** This is a WU2 addition to session-init. The step is lightweight — read two files
(config + methods), note deviations from defaults. No new documents to load, no new ceremonies.

## Consequences

### Positive

- **The three-mechanism model is complete.** Config toggles, extensions add, methods replace. Together with
  QUICK-REFERENCE for tool commands, the customization space is fully covered without requiring teams to edit
  framework-owned files. ADR-004's two-axis model (enforcement × customization) has concrete mechanisms for both
  axes.
- **External tracker integration has a clear path.** A team with Jira overrides the task-completion method. The
  agent reads "update Jira ticket to Done" instead of "mark `[x]` in markdown." The completion protocol's
  contract (status must be verifiable) still holds — just through a different tool. No workflow editing required.
- **Platform compatibility uses existing infrastructure.** QUICK-REFERENCE already handles project-specific
  commands. Adding platform command sections is a natural extension, not a new mechanism. Non-GitHub teams get a
  structured customization path without architectural overhead.
- **GitHub users lose nothing.** Workflows retain concrete `gh` commands inline. The platform notes are brief
  and unobtrusive. The majority experience is unchanged.
- **Hook enforcement extends to custom formats.** Teams wanting `[JIRA-XXX] description` enforcement get it
  through `commit.format: custom` + `commit.custom_pattern`. Same mechanical enforcement as conventional
  commits, different pattern. No regression in enforcement quality for teams with custom practices.
- **Skills position is clear and honest.** ARC acknowledges the emerging convention, states its position
  (integrated guidance produces more predictable results), provides an integration path (`project/` directories
  and adapter workflow), and doesn't block standalone use. Teams can make an informed choice.
- **Method markers are self-documenting.** A human reading `process-task-loop.md` sees the method marker and
  immediately understands: this operation is customizable, here's the contract, here's the default, here's where
  to customize it. No external "how methods work" documentation needed — same discoverability benefit as
  extension points.
- **WU2 has clear implementation scope.** Add `arc-methods.md` scaffolding, insert 3-5 method markers in
  workflows, add platform commands section to QUICK-REFERENCE template, add platform notes to workflows with
  `gh` commands, add config awareness step to session-init, add custom pattern settings to config schema.

### Negative

- **Another file to understand.** `arc-methods.md` joins `arc-config.yml` and `arc-extensions.md` as the third
  customization file. The conceptual model (toggle/add/replace) is clean, but three files is more surface area
  than two. Documentation must make the distinction intuitive.
- **Method markers add visual weight to workflows.** Block-style markers with horizontal rules are visible —
  that's the point, but it's also visual noise for teams that never customize. The scope constraint (3-5 total)
  limits this, but any markup in workflow prose is a readability cost. Teams reading workflows for the first
  time encounter markers for a customization system they may not need.
- **Regex patterns in config require expertise.** `commit.custom_pattern` is a regex string that teams must
  write correctly. The inline examples help, but regex is inherently error-prone. A malformed pattern causes
  confusing hook failures. This is a one-time cost (write once, use forever) but the initial experience matters.
- **Platform notes are a lighter pattern than method markers.** Two different customization indicators in
  workflows (block-style method markers for behavioral overrides, inline platform notes for tool commands)
  means two patterns to recognize. The distinction is justified (behavioral vs. environmental) but adds
  conceptual complexity.
- **Contract enforcement is advisory.** Method contracts describe what the override must accomplish, but nothing
  mechanically validates that an override satisfies its contract. A team could write a task-completion override
  that doesn't actually record completion in a verifiable way. ARC trusts the team — consistent with its
  approach — but the gap exists.

### Risks

- **Method count may grow.** 3-5 preset methods is manageable. If pressure emerges to mark every substitutable
  operation as a method, the workflow prose becomes cluttered with markers. The scope constraint (0-3 per
  workflow) and the criteria (demonstrated or anticipated customization need) should hold the line, but requires
  discipline during WU2.
- **QUICK-REFERENCE platform section may be incomplete for non-GitHub platforms.** ARC's team has direct GitHub
  experience. GitLab and Bitbucket command equivalents will be best-effort based on documentation, not validated
  through use. Early adopters on these platforms are effectively beta-testing the platform command reference.
- **Session-init config awareness adds a processing step.** Reading `arc-config.yml` and `arc-methods.md` during
  session-init adds context to the agent's loading sequence. For agents with limited context windows, every
  additional document has a cost. The step is lightweight (note deviations, not internalize everything), but
  it's incremental load on the session-init ceremony that ADR-002 already flagged as potentially heavy for
  some agents.
- **Skills ecosystem is evolving rapidly.** The position established here (dependency boundary, coexistence,
  integration path) is based on the current state of skills conventions across agent tools. If the convention
  evolves significantly (e.g., skills gain dependency/integration features), ARC's position may need revision.
  The position is deliberately lightweight — it states a boundary and a path, not a deep integration — which
  should be durable across convention evolution.
- **Custom pattern validation is shell-dependent.** The `grep -qE` approach for custom pattern validation
  depends on the shell's regex engine. Extended regex syntax varies slightly across platforms (GNU grep vs. BSD
  grep). Patterns that work on Linux may behave differently on macOS. This is a hook implementation concern for
  WU2, not an architectural risk, but worth noting.

---

Context: tasks-philosophy-configurability.md (Task 5.2)
