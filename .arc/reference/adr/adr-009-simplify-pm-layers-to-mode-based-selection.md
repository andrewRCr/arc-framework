# ADR-009: Simplify PM Layers to Mode-Based Selection

## Status

Accepted (Part 2 file placement superseded by ADR-012)

## Context

ADR-008 decomposed the framework into Core methodology and two optional PM layers: Solo PM (in-git project management
for solo developers) and Team PM (conventions and integration for teams). The three-layer model was designed around the
audience axis — who uses which layer.

During implementation of ADR-008 (Task 5.8), a naming and conceptual tension surfaced:

**The audience axis conflates the wrong things.** A small team (2-3 people) that wants in-git backlogs, roadmap, and
PROJECT-STATUS tracking must use "Solo PM" — a name that suggests it's not for them. Meanwhile, "Team PM" doesn't
provide project management at all — it provides integration conventions for external tools. The labels describe who the
user is, not what the feature does.

**Team PM is thin by design.** ADR-008's own risk section anticipated this: "Team PM may feel thin. [...] If this proves
true, Team PM could be folded into Core as optional team conventions rather than a separate layer." The Team PM
artifacts — per-developer ATOMIC-TASKS.md, branch inbox (arc-method), external tracker integration (arc-methods
overrides), honest boundaries document — are either team mode concerns (orthogonal to PM) or arc-methods overrides
(already configurable without a dedicated layer).

**The meaningful distinction is mechanism, not audience.** The question that matters for PM mode selection is: "Where
does your project management live?" The answers are:

- Nowhere — I just want methodology (Core only)
- In-git — ARC provides PM artifacts (backlogs, roadmap, status tracking)
- External tools — I use Jira, Linear, GitHub Issues, etc.

These three answers map to three PM modes that are clearer than the audience-based naming and don't prevent teams from
using in-git PM when it fits their scale.

**Evidence from implementation:** The Core/PM boundary established in ADR-008 Part 2 is correct — execution vs. planning
is the right decomposition. The extension points bridging Core and PM workflows are sound. What changes is how PM modes
are named and what each mode installs. The architectural foundation holds; the layer packaging simplifies.

## Decision

### Part 1: Replace Three Layers with Three PM Modes

We will replace ADR-008's Solo PM / Team PM layer distinction with a mode-based selection that describes where project
management lives:

**`pm.mode: none`** — Core only. No PM artifacts installed. The developer or team uses ARC's methodology (session
management, task execution, commit discipline, specification workflows) without any in-git project management opinions.
Teams with Jira, Linear, or GitHub Issues who don't want explicit integration hooks use this mode.

**`pm.mode: arc-in-git`** — ARC's built-in PM suite. Installs in-git project management artifacts for tracking work
outside of task lists:

| Artifact                         | Purpose                            |
| -------------------------------- | ---------------------------------- |
| ATOMIC-TASKS.md                  | Standalone actionable tasks        |
| BACKLOG-FEATURE.md               | Feature planning bucket            |
| BACKLOG-TECHNICAL.md             | Technical planning bucket          |
| ROADMAP.md                       | Sequencing and dependency tracking |
| PROJECT-STATUS.md                | Project-level status visibility    |
| completed-atomic-{quarter}.md    | Atomic task completion archive     |
| strategy-backlog-organization.md | Backlog management guidance        |

Works for solo developers and small teams. In team mode, ATOMIC-TASKS.md uses per-developer paths
(`team/{name}/ATOMIC-TASKS.md`). The trade-off is clear: in-git PM works well when there are few writers and informal
coordination suffices. Larger teams will encounter merge friction on shared mutable files across branches —
`pm.mode: external` is the honest recommendation for that context.

**`pm.mode: external`** — External tool integration. No PM artifacts installed (same file set as `none`), but the mode
signals that the team uses external project management tools. This enables:

- Agent awareness: the agent knows to check for arc-methods overrides related to external tool integration (task
  completion → tracker update, status sync)
- Extension point relevance: post-task-completion, post-work-unit-activate, and post-work-unit-archive extensions are
  contextually meaningful for external tool hooks
- Future integration guidance and honest boundaries documentation
- Distinct from `none`: "no PM" vs. "PM lives elsewhere" is a meaningful difference for agent behavior

### Part 2: What Happens to Team PM Artifacts

Team PM as a named layer is dissolved. Its components move to where they naturally belong:

| Former Team PM Artifact       | New Home                                                               |
| ----------------------------- | ---------------------------------------------------------------------- |
| `team/{name}/ATOMIC-TASKS.md` | `arc-in-git` mode + team mode (per-developer path is a team concern)   |
| Branch inbox                  | Arc-method (already designed as overridable, not layer-specific)       |
| External tracker integration  | Arc-methods overrides (already the mechanism, not layer-specific)      |
| Honest boundaries document    | Strategy doc or team coordination strategy (guidance, not an artifact) |

The team/ directory continues to exist for team mode — it provides per-developer SESSION-NOTES.md (Core) and, when
`pm.mode: arc-in-git`, per-developer ATOMIC-TASKS.md. Team mode and PM mode are orthogonal axes:

| Configuration       | What you get                                           |
| ------------------- | ------------------------------------------------------ |
| Solo + `none`       | Core methodology only                                  |
| Solo + `arc-in-git` | Core + in-git PM in `active/`                          |
| Solo + `external`   | Core + agent-aware external tool integration           |
| Team + `none`       | Core + team/ session state                             |
| Team + `arc-in-git` | Core + team/ session state + per-developer in-git PM   |
| Team + `external`   | Core + team/ session state + external tool integration |

### Part 3: ADR-008 Dispositions

ADR-008 established several decisions. This ADR supersedes the layer packaging (Parts 1, 3, 5, 6) while preserving the
architectural foundations:

| ADR-008 Section           | Disposition                                                               |
| ------------------------- | ------------------------------------------------------------------------- |
| Part 1: Three layers      | **Superseded.** Replaced by three PM modes.                               |
| Part 2: Core/PM boundary  | **Preserved.** Execution vs. planning boundary is unchanged.              |
| Part 3: Artifact classif. | **Updated.** Solo PM → arc-in-git. Team PM dissolved.                     |
| Part 4: Workflow edits    | **Preserved.** Extension points and conditional sections are unchanged.   |
| Part 5: ADR-004 relation  | **Preserved.** Orthogonality argument holds with modes instead of layers. |
| Part 6: CLI compatibility | **Updated.** `pm.mode` values change; init flow simplifies.               |
| Part 7: Subordinate dec.  | **Preserved.** Atomic task section, TASK-INBOX/weekly-review removal,     |
|                           | WORK-STATUS team location, conditional handoff commit all stand.          |

### Part 4: Documentation Conventions

When referencing PM modes in documentation:

- Spell out "Project Management" on first prominent use per document, then abbreviate to "PM"
- Use `pm.mode` config values (`none`, `arc-in-git`, `external`) when referencing specific modes
- Conditional sections use the pattern: `### With arc-in-git PM (`pm.mode: arc-in-git`)`
- Layer annotations in file inventory: "arc-in-git" replaces "Solo PM"; "Team PM" is removed as a layer

## Consequences

### Positive

- **Names describe the mechanism.** `arc-in-git` says what it is; `external` says where PM lives. No audience
  assumptions that exclude valid use cases.
- **Small teams aren't second-class.** A 2-3 person team using in-git backlogs is a natural, supported configuration —
  not an "escape hatch" from the wrong layer.
- **Simpler model.** Two orthogonal axes (team mode × PM mode) with three clear values each. No overlapping layer
  concept that's hard to explain.
- **Team PM dissolution is clean.** Every Team PM artifact already had a natural home outside the layer. Branch inbox
  and external tracker integration are arc-methods overrides by design. Per-developer ATOMIC-TASKS is a team mode +
  arc-in-git concern.
- **ADR-008 foundations preserved.** Core/PM boundary, extension points, workflow edits, and all subordinate decisions
  carry forward unchanged. This is a packaging simplification, not an architectural change.

### Negative

- **`arc-in-git` is longer than `solo`.** Config value is more verbose, though clearer. Acceptable trade-off for
  precision.
- **Three PM modes where two might suffice.** `external` could be seen as premature if its behavioral impact is minimal
  at launch. However, the config value is self-documenting and establishes the axis for future integration features.
- **Requires updating ADR-008 references.** Documentation, task list, and arc-config.yml comments that reference "Solo
  PM" or "Team PM" layer naming need updating. This is bounded and mechanical.

### Risks

- **`external` mode behavioral gap.** If `external` never gains meaningful distinct behavior beyond `none`, it may
  confuse adopters. Mitigation: ensure at least agent-awareness behavior (checking for integration overrides) is present
  from launch. If no distinction materializes, `external` can be folded back to `none` in a future ADR.
- **In-git PM trade-off communication.** With teams now explicitly supported for arc-in-git, the framework must clearly
  communicate the trade-offs (merge friction, branch divergence) without discouraging valid small-team use. Honest
  documentation, not gatekeeping.

### Amendments

**Amendment (2026-04-08):** `strategy-backlog-organization.md` referenced in the arc-in-git artifacts table was
renamed to `strategy-planning-module.md` during the methodology maturation work unit.

---

Context: tasks-methodology-completion.md (pre-Task 5.9 — PM mode simplification)
