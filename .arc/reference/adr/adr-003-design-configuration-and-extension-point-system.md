# ADR-003: Design Configuration and Extension Point System

## Status

Accepted

## Context

ADR-001 established a three-tier flexibility model: principles (tier 1, non-negotiable), conventions (tier 2,
configurable with defaults), and escape hatches (tier 3, not formally supported but not blocked). It classified 11
principles and 19 conventions. ADR-002 added session as a first-class concept and expanded P5 to include context
quality management, both with convention-level specifics.

Two design questions remained open:

1. **How do teams configure conventions?** ARC currently has `arc-config.yml` with 2 settings (`base_branch`,
   `branch_protection`), parsed by git hooks using line-based shell matching. The principle/convention boundary is
   established but no systematic mechanism exists for teams to adjust conventions to their context. An adopter
   experience audit identified 3 adoption-blocking dealbreakers and 7 friction points — nearly all caused by
   conventions presented as non-negotiable. Configuration is how those conventions become genuinely adjustable.

2. **How do teams extend workflows?** Config switches toggle existing behavior, but some customization requires
   adding behavior — custom quality checks, additional context loading, team-specific ceremony steps. ARC's
   prose-based workflows need a structured way for teams to insert custom steps without modifying framework-owned
   content directly.

During planning, an **A+B hybrid approach** was chosen: config switches toggle behavior (A), extension points add
behavior (B). These are complementary mechanisms addressing different customization needs. The design should also
address PRD requirement 8 (merge strategy support), which naturally consolidates into a config setting with
behavioral implications.

**Design constraints:**

- **Shell-parseability:** Git hooks read config without a YAML library. The parsing approach
  (`grep + cut`) must remain viable.
- **Principle protection:** Config settings exist only for conventions (tier 2). Principles (tier 1) are never
  configurable — changing them means you're not using ARC.
- **Update safety:** Teams must be able to update ARC framework files without losing their customizations.
  Config and extension content must be separable from framework-owned content.
- **Dual-audience (P9):** Both humans reading raw markdown and AI agents processing workflows must understand
  the configuration and extension mechanisms without external documentation about how they work.

## Decision

### Part 1: Configuration System Design

We will extend `arc-config.yml` as the single configuration file for all convention-level settings, using dotted
keys for logical grouping within the existing flat-file, shell-parseable format.

#### Schema: Dotted Keys

Settings use dotted key names for logical grouping while maintaining flat file structure:

```yaml
# ARC Framework Configuration
#
# Project-level settings for ARC conventions.
# Only conventions (tier 2) appear here — principles (tier 1) are non-negotiable.
# Format: Flat key-value pairs with dotted grouping. Parsed by githooks using
# line-based shell matching (grep + cut) — no nested structures.

# --- Branch settings ---

# The primary integration branch for the project.
branch.base: main

# Branch protection level. Determines what requires branches and PRs.
#   unprotected - Branches optional. No base branch commit restrictions.
#   partial     - Planned work requires branches. Atomic tasks and backlog
#                 capture may commit directly to the base branch.
#   full        - All changes require branches and PR review.
branch.protection: partial

# --- Commit settings ---

# Commit message format requirement.
#   conventional - type(scope): description (ARC default, validated by commit-msg hook)
#   any          - No format enforcement (hook validation disabled for format)
commit.format: conventional

# Whether a Context: footer is required on every commit.
#   required - Context: line must be present (ARC default, validated by commit-msg hook)
#   optional - Context: line encouraged but not enforced
commit.context_footer: required

# --- Merge settings ---

# Merge strategy for integrating branches.
#   merge  - Merge commits to preserve branch topology (ARC default)
#   rebase - Rebase for clean linear history
#   squash - Squash merge to single commit per branch (escape hatch — see below)
merge.strategy: merge

# --- Hook settings ---

# Enable or disable specific git hooks.
#   enabled  - Hook runs normally
#   disabled - Hook is skipped entirely
hooks.pre_commit: enabled
hooks.commit_msg: enabled
```

**Why dotted keys:** Logical grouping (`branch.*`, `commit.*`) improves readability as settings grow, while
preserving the line-based parsing that hooks depend on. The existing `arc_config_get` function works without
modification — `arc_config_get "commit.format" "conventional"` matches `^commit.format:` via grep, which is
unambiguous with the `^` anchor.

**Migration from current format:** The two existing settings (`base_branch`, `branch_protection`) rename to
`branch.base` and `branch.protection`. This is a breaking change for existing hook scripts, addressed in WU2
when hooks are updated for 1.0.

#### Setting Categories: What Earns a Config Setting

Not every convention needs a config knob. Three categories determine where configurability lives:

**Runtime-checkable (config setting):** The convention's current value is needed at runtime by hooks, workflows,
or agent guidance to change operational behavior. The setting is read programmatically and affects what happens
during development. All initial settings above fall in this category — hooks check `commit.format` to decide
whether to validate, workflows check `merge.strategy` to adjust traceability guidance.

**File-customizable (edit the file):** The convention is configured by modifying the file that embodies it.
Template formats, document hierarchy structure, agent-specific file content, reference-style link conventions —
these are customized by editing the relevant template or document. No config setting needed because the file
itself is the configuration.

**Behavioral guidance (prose instructions):** The convention is expressed as guidance that agents and developers
follow. Review increment scope, collaborative voice, completion protocol details — these are adjusted by editing
the prose in strategy documents or workflow docs. No config setting needed because the guidance is descriptive,
not programmatic.

**Criteria for adding new settings:** A convention earns a config setting when (a) its value is consumed
programmatically by hooks, workflows, or agent processing, AND (b) the alternative (editing framework files
directly) would create update safety or maintenance problems. WU2 should apply these criteria when
implementing convention-level changes across framework documents.

#### Tier 3 in Config: Selective Escape Hatch Representation

Escape hatches (tier 3) are not formally supported but not blocked. Most are purely prose-acknowledged — ARC
states its position and the tradeoff, and teams make their own choice. However, some escape hatches have
workflow implications that ARC can handle more gracefully if it knows about the choice.

**When a tier 3 item appears in config:** When ARC's workflows or hooks can meaningfully adapt their behavior
based on the setting. The config value triggers adapted behavior rather than ignoring the choice.

**When a tier 3 item stays prose-only:** When ARC has no behavioral adaptation to offer — the team is simply
doing something outside ARC's design envelope and ARC has nothing useful to do with the information.

**Example — merge strategy:** `merge.strategy: squash` is an escape hatch. Squash merging collapses individual
commit traceability, which conflicts with P6 (traceability through version control). But ARC can adapt: shift
traceability emphasis to PR descriptions, adjust archive workflow expectations, and modify commit guidance to
focus on the squash commit message rather than individual atomic commits. The config setting enables this
adaptation. See Part 3 for behavioral implications.

### Part 2: Extension Point System

We will establish a preset extension point system for ARC workflows, with extension content stored in a
dedicated file at `system/workflows/arc-extensions.md`.

#### Extension Points in Workflow Docs

ARC defines preset extension points at specific locations in workflow documents. Each is a compact, inline
marker that identifies the customization opportunity, states the contract, and links to the extensions file:

```markdown
---
**Extension Point — Post-Task Quality Checks** · `#post-task-quality`
Contract: Runs after Tier 1 checks pass, before marking task complete.
See: [arc-extensions.md](../arc-extensions.md#post-task-quality)
---
```

**Format requirements:**

- Bounded by horizontal rules (`---`) for visual distinction when scanning raw markdown
- Extension point name in bold, tag in backtick code span for grep-ability
- Contract line states when the extension fires and what it's allowed to do
- Inline link (not reference-style) to the extensions file section — preserves scroll position in the workflow
  doc when the user Ctrl+Clicks to navigate

**Preset vs. custom extension points:**

- **Preset (convention / tier 2):** ARC defines these at specific, tested locations in workflow docs. They have
  defined contracts and corresponding template sections in `arc-extensions.md`. This is the expected
  customization path.
- **Custom (escape hatch / tier 3):** Teams may add their own extension points elsewhere in workflow docs. ARC
  doesn't block this, but custom points are outside the framework's design envelope — ARC updates may conflict,
  and the team is responsible for maintaining them.

#### The Extensions File

`system/workflows/arc-extensions.md` is a framework-owned, project-filled file — ARC provides the structure and
preset section scaffolding, teams add their content. Classified as **Configurable** (same as `arc-config.yml`),
preserved through three-way merge during framework updates.

**Structure:**

```markdown
# ARC Workflow Extensions

Project-specific extensions to ARC workflow steps. Each section corresponds to
a preset extension point in an ARC workflow document.

## How to Use

1. Find the extension point section below that matches what you want to customize
2. Replace the placeholder with your steps, checks, or guidance
3. The workflow will incorporate your content at the marked location

Extensions are optional — uncustomized sections are skipped during workflow execution.

---

## post-task-quality

**Workflow:** process-task-loop.md · **Fires:** After Tier 1 checks pass, before marking task complete
**Contract:** Add quality checks that should run after every task completion. Steps added here run in
addition to ARC's default Tier 1 checks, not instead of them.

[No extension configured]

---

## post-unit-quality

**Workflow:** process-task-loop.md · **Fires:** After Tier 2 checks at coherent unit completion
**Contract:** Add integration-level checks for coherent unit boundaries. Supplements ARC's default
Tier 2 checks.

[No extension configured]

---
```

Each preset section includes: which workflow it extends, when it fires, what the contract allows, and a
`[No extension configured]` placeholder. The placeholder communicates both "nothing here yet" and "this is
where your content goes." When customized, the team replaces the placeholder with their steps.

**No status synchronization needed:** The workflow's extension point marker always links to the section. The
agent follows the link, reads the section, and acts on whatever is there — populated content or placeholder.
No separate status field to maintain, no drift between markers and content.

**Why a separate file (not inline or bottom-of-workflow sections):**

- **Update safety:** ARC can update workflow docs freely without risking merge conflicts with user extension
  content. The extensions file is user-controlled; workflow docs are framework-controlled.
- **Clean ownership boundary:** Workflow docs are purely ARC content. The extensions file is clearly "your
  stuff." No ambiguity about whether you're reading framework guidance or team customization.
- **Discoverability:** `arc-extensions.md` at the `workflows/` root is immediately visible in the file tree and
  self-explanatory. A single file shows all team customizations at a glance.
- **Resists inline pressure:** If extension content were in the same file as the workflow (even in a bottom
  section), the distinction between "content at the extension point" and "content in the bottom section" would
  be hard to justify — users would reasonably push to inline everything, eroding the separation that makes
  updates safe.

**Agent processing flow:** Agent reads a workflow doc, encounters an extension point marker, follows the inline
link to `arc-extensions.md`, reads the corresponding section, executes any steps found (or skips if placeholder),
returns to the workflow doc and continues. This is the same cross-reference pattern agents already follow
throughout ARC documentation.

#### Candidate Preset Extension Points

The following are candidate locations, to be finalized during WU2 when workflows are updated. Scope is 0–3 per
workflow document — enough for meaningful customization without cluttering workflow prose.

| Workflow              | Extension Point         | Contract Summary                                    |
|-----------------------|-------------------------|-----------------------------------------------------|
| process-task-loop     | `post-task-quality`     | Additional checks after Tier 1, before marking done |
| process-task-loop     | `post-unit-quality`     | Additional checks after Tier 2 at unit boundaries   |
| session-init          | `post-context-load`     | Additional context loading after standard docs      |
| atomic-commit         | `pre-stage-review`      | Additional staging verification before commit       |

These are illustrative, not final. WU2 should evaluate each workflow for natural insertion points and add
extension points where teams have demonstrated or anticipated customization needs.

### Part 3: Merge Strategy Behavioral Implications

This section consolidates PRD requirement 8 (merge strategy support) into the configuration system. Merge
strategy is a config setting (`merge.strategy`) with behavioral implications that ARC documents rather than
enforces through tooling.

#### Behavioral Guidance by Strategy

**`merge` (ARC default):**

- Individual commits and branch topology preserved — full traceability of what happened, when, and in
  what context
- Merge commits provide integration points that document when work was incorporated
- Context footers on each commit link directly to task and work context
- Archive workflows reference commit history as the detailed change record
- Most aligned with P6 (traceability): preserves history as it actually happened

**`rebase` (convention — tier 2):**

- Individual commits survive but are replayed onto a new base — clean linear history
- Commit hashes change during rebase (history is rewritten), which can complicate traceability if
  commits have been referenced elsewhere by hash
- Same commit guidance as merge; traceability preserved through commit messages and context footers
- Preferred by teams that value clean linear history over topological accuracy

**`squash` (escape hatch — tier 3):**

- Individual commits collapse into a single squash commit per branch
- **Traceability shifts to PR descriptions:** The PR description must carry the traceability that individual
  commits would normally provide. Include task references, key decisions, and change rationale in the PR body.
- **Commit message guidance adapts:** Focus on the squash commit message as the single traceability artifact.
  Include Context footer. Individual commits during development are working artifacts, not permanent record.
- **Archive workflows adapt:** Reference the PR (not individual commits) as the canonical change record.
  The PR description serves as the detailed history that atomic commits would normally provide.
- **ARC's position:** Squash merging sacrifices granular traceability (P6) for a cleaner integration history.
  This is a legitimate team preference that ARC accommodates by shifting traceability mechanisms, not by
  blocking the choice. Teams choosing squash should ensure PR descriptions are thorough enough to serve as
  the traceability record.

### Part 4: Relationship Between Config and Extension Points

Config and extension points are complementary, not competing:

- **Config toggles behavior:** Changes how existing ARC workflows operate. "Use this format," "enable this
  check," "apply this strategy." The workflow logic is the same; the parameters change.
- **Extension points add behavior:** Inserts new steps into ARC workflows at defined locations. "After the
  standard quality checks, also run these." The workflow gains additional steps without modifying the
  framework-owned content.
- **Boundary test:** If the customization can be expressed as a value that changes existing behavior, it's a
  config setting. If it requires new procedural steps, it's an extension point. If it requires both (e.g.,
  a config setting that enables a feature, plus extension point content that defines the feature's steps),
  both mechanisms are used together.

**Neither mechanism applies to principles.** Config settings exist for conventions. Extension points exist
within workflows at convention-level boundaries. Principles are not configurable and workflows do not offer
extension points that would allow circumventing them.

## Consequences

### Positive

- **All three adoption-blocking dealbreakers become configurable.** Conventional commit format
  (`commit.format`), context footer requirement (`commit.context_footer`), and squash merge incompatibility
  (`merge.strategy`) — the three issues that caused teams to reject ARC outright — are now config settings
  with clear defaults and documented alternatives.
- **Clean separation of concerns.** Config for toggling, extensions for adding, file editing for structural
  customization. Each convention has a clear configurability path, and the filtering criteria prevent
  config sprawl.
- **Shell-parseability preserved.** Dotted keys maintain the grep/cut parsing pattern. No YAML library
  needed, no parser rewrite. Hooks continue to work with the same `arc_config_get` function.
- **Extension points are self-describing.** Both audiences understand what an extension point does, when it
  fires, and where to add content — from reading the marker in context. No external "how extension points
  work" documentation needed to use them.
- **Update safety by design.** Config file uses three-way merge. Extensions file is structurally separated
  from workflow docs. Framework updates don't touch user customizations in either mechanism.
- **Tier 3 handled honestly.** Escape hatches that benefit from config representation (like squash merge)
  get it. Others stay prose-documented. The framework adapts where it can and is transparent about its
  limitations.
- **WU2 has clear implementation scope.** Rename existing settings to dotted keys, update hook parsers, add
  new settings, insert extension point markers in workflows, scaffold `arc-extensions.md`.

### Negative

- **Breaking change for existing hooks.** Renaming `base_branch` → `branch.base` and `branch_protection` →
  `branch.protection` requires updating all hook scripts. Addressed in WU2 as part of the 1.0 transition —
  not an ongoing cost, but a one-time migration.
- **Cross-file navigation for extensions.** Extension content lives in a separate file from the workflow that
  references it. Users must navigate between files (Ctrl+Click inline links). This is standard editor
  behavior but less seamless than same-file anchors. The tradeoff is accepted for the update safety and
  ownership clarity benefits.
- **7 initial settings may grow.** The filtering criteria constrain growth, but as ARC evolves, new
  conventions may earn config settings. The flat-file format scales adequately for the expected range
  (likely under 20 settings), but a very large config file could become unwieldy.
- **Extension point placement is an ongoing design decision.** Each new workflow must consider where (if
  anywhere) extension points belong. The 0–3 per document guideline and contract-based design provide
  structure, but judgment is still required.

### Risks

- **Dotted key collision in grep.** The dot in dotted keys is a regex wildcard in grep. `commit.format`
  would technically match `commitXformat` in a grep pattern. The `^` anchor and specific key text make
  false matches extremely unlikely in practice, but a future key that's a prefix of another
  (e.g., `hooks.pre` and `hooks.pre_commit`) could cause issues. Mitigation: key names should be chosen
  to avoid prefix relationships.
- **Extension point underuse.** If teams don't discover or use extension points, the framework carries
  design complexity for little benefit. Mitigation: discoverability through the `arc-extensions.md` file
  at workflows root, clear markers in workflow docs, and documentation in adoption guides.
- **Merge strategy adaptation is guidance, not enforcement.** `merge.strategy: squash` triggers adapted
  *guidance* (shift traceability to PRs) but ARC has no mechanism to enforce that PR descriptions are
  actually thorough enough. Teams choosing squash are trusting themselves to maintain traceability through
  discipline rather than tooling. This is consistent with ARC's approach (principles define what, not
  how) but carries inherent risk.
- **Strategy opt-out mechanism deferred.** Teams that want to disable an ARC-provided strategy (e.g.,
  team coordination strategy for solo developers) currently must delete the file and its index entry,
  which an ARC update could reverse. The configuration system doesn't address strategy-level opt-out.
  This is a file classification and update mechanism concern, deferred to WU2.

---

Context: tasks-philosophy-configurability.md (Task 4.1)
