# Notes: Core Philosophy & Configurability Architecture

**Purpose:** Prior research conclusions and starting positions from planning. These are inputs to
ADR discussions — informative, not prescriptive. Extracted from planning documents that have been
absorbed and deleted.

**PRD:** `prd-philosophy-configurability.md`

---

## Prior Decisions (from planning)

### A+B Hybrid Approach (Decided)

The configurability architecture uses an **expanded config + workflow extension points** approach
(referred to as "A+B hybrid" during planning). This was chosen over alternatives:

- Option A: Config-only (insufficient for workflow customization)
- Option B: Extension points only (insufficient for simple toggles)
- A+B hybrid: Config switches toggle behavior; extension points add behavior

This decision is an input to ADR candidates for requirements 4 and 5.

### Two Adoption Tiers (Decided)

Two tiers — basic and full — rather than three. Basic gets the methodology and value without all
ceremony. Full is the complete system. Specifics of what's in each tier are TBD (requirement 6).

### Three-Tier Flexibility Model (Research-Validated)

Prior research validated a three-tier configurability model:

1. **Non-negotiable** — Principles defining ARC's identity. Cannot be changed.
2. **Convention** — Methods with sensible defaults. Configurable via `arc-config.yml`.
3. **Escape hatch** — Things ARC doesn't formally support but doesn't block. Extension points
   and explicit "you're on your own" guidance.

This model is more precise than a binary principle/method split. The PRD references it in the
Configurability Architecture section.

## Audit Findings (from adopter experience audit)

### Dealbreakers (3)

These were identified as adoption-blocking friction points:

1. **Commit format** — Conventional commit format (`type(scope): description`) is enforced by
   hooks. Teams with different commit conventions cannot adopt ARC without disabling hooks.
2. **Context footer** — `Context: tasks-[filename].md (Task X.Y)` footer is required on every
   commit. Unusual convention that surprises adopters.
3. **Squash merge incompatibility** — ARC's atomic commit philosophy assumes individual commits
   survive merging. With squash merge (extremely common), all commit context is lost. PR
   descriptions must carry the context instead.

### Significant Friction Points (7 from audit, summarized)

- Session model overhead (CURRENT-SESSION.md, init/handoff ceremonies)
- One-task-at-a-time strict enforcement
- Agent-specific file requirements (CLAUDE.md, etc.)
- Quality gate zero-tolerance with no severity levels
- Task list formatting rigidity
- Branch naming conventions enforced by hooks
- Documentation volume for small projects

### Principle-vs-Method Analysis

The audit applied a consistent analytical lens: for each friction point, ask "is this a principle
(core to ARC's identity) or a method (one way to implement a principle)?" This analysis revealed
that most friction comes from methods being presented as principles. The principle/method boundary
is the root issue.

## Config Starting Positions

### Current State

`arc-config.yml` currently has 2 settings:

- `base_branch` — Base branch for PRs (default: `main`)
- `branch_protection` — Whether base branch is protected (default: `true`)

### Priority Additions (from audit)

Settings identified as high-priority for configurability:

- Commit format (conventional commit type/scope requirements)
- Context footer (format, whether required)
- Merge strategy (rebase, squash, merge commit)
- Hook toggles (enable/disable specific git hooks)

### Format Constraints

- Shell-parseable (hooks read config without a YAML library)
- Flat key-value or shallow nesting
- Must support the principle/method distinction — only methods appear in config

## Extension Point Starting Positions

### "Insert Your Steps Here" Markers

Prior research recommended self-documenting markers in workflow prose documents:

- No tooling required
- Agents and humans both understand them
- Contract (what the extension point allows) matters more than mechanism
- Must be visible enough for discovery, unobtrusive enough for readability

## Team Workflow Gaps (from multi-branch team audit)

- Task ownership for multi-developer scenarios
- Parallel branch coordination
- Workflow adaptation for team ceremonies
- External tracker integration patterns

These findings inform requirements 7 and 9 (external tools and dev methodology compatibility).

---
