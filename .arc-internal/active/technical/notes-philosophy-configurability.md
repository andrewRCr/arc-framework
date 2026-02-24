# Notes: Core Philosophy & Configurability Architecture

**Purpose:** Active input material for upcoming tasks (Phases 4-6). Prior working notes
from Phases 1-3 have been absorbed into their output artifacts (ADR-001, ADR-002) and
removed. Sections below are retained because they are direct inputs to tasks not yet
complete.

**PRD:** `prd-philosophy-configurability.md`
**ADRs:** `adr-001-define-core-identity-and-principle-method-boundary.md`,
`adr-002-session-model-and-agent-compatibility.md`

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

## Practical Benefits for Strategy Document (Requirement 10)

**Purpose:** Supporting arguments that strengthen the case for ARC's co-development model.
These are practical validations of what the three pillars predict — better suited to the
philosophy strategy document than the ADR itself.

**Rework reduction through early detection:** Catching issues at the review increment level
is dramatically cheaper than catching them after a large autonomous work block. The industry
is discovering that "agent produces PR, human reviews" leads to significant rework — the
review surface area is too large, issues compound, and often it's easier to redo than to fix.
ARC's model is essentially continuous integration of human judgment, preventing compound errors
from accumulating. Increased review increment frequency saves significant time on work-unit-level
review time and effort.

**Developer experience and engagement:** A documented burnout pattern is emerging where
developers feel reduced to rubber-stamp reviewers of AI output. They lose engagement, lose
context on their own codebase, and review quality degrades because disengaged review is
ineffective review. ARC's co-development model keeps the developer actively contributing and
learning — sustainable in a way that "review-only" is not.

**Maintainability and codebase familiarity:** Co-development means the developer was there
every step of the way during implementation. In days, weeks, or months when maintenance needs
arise, the developer has a feel for how the implementation works because they participated in
building it — not just reviewed the output. This allows leveraging AI speed without the codebase
becoming a black box. Delegation-based approaches risk producing code that no human deeply
understands, creating maintenance debt that compounds over time.

## Portable Behavioral Guidance (Skills) and ARC

Skills (SKILL.md files) have become a near-universal convention across agent tools — Claude
Code, Codex, Gemini CLI, Copilot all support them to some degree. They provide portable,
self-contained behavioral guidance (e.g., TDD methodology, code review patterns) that works
across repos and agents. ARC needs an explicit position on how they relate to its own
guidance model.

**Core distinction — the boundary is dependency:**

- **ARC strategies/workflows** = project-integrated guidance. They cross-reference each other
  (strategies reference quality gates, workflows reference strategies, task loop references
  session lifecycle). This integration is how ARC delivers consistent, predictable results.
- **Skills** = portable behavioral recipes. Self-contained by design — that's what makes them
  portable. They don't know about ARC's task loop, quality tiers, or session model.
- **The boundary:** If guidance depends on ARC concepts, it's a strategy or workflow. If it's
  fully self-contained, it could be a skill — but ARC doesn't guarantee consistency for
  guidance outside its integration model.

**Key insight:** The moment you reference a skill from an ARC workflow (e.g., "when
implementing, invoke /tdd"), you've created framework content with extra indirection. The
content should just live in a project strategy at that point. The "skill" wrapper adds no
value once it's integrated.

**ARC's position (proposed, not mandated):**

- ARC's consistency guarantees come from the handshake between documents — strategies,
  workflows, quality gates referencing each other predictably
- External portable guidance coexists naturally — it's complementary, not competing
- If you need external guidance integrated with ARC's lifecycle, bring it into a project
  strategy (user/team level, not ARC level). This is where it gains ARC's consistency
  guarantees
- If portable-and-standalone works for your use case, ARC doesn't block it — tier 3
  (escape hatch) philosophy applies. ARC states its position and the tradeoff, doesn't
  forbid the alternative
- ARC won't mandate — teams who find skills reliable enough can use them directly

**Existing coverage in ADR-002:** "Slash commands / invocation" classified as incidental,
tracing to "reusable workflows" as the load-bearing principle. Skills are another invocation
format in that column ("Commands vs. palette vs. natural language"). But ADR-002 addressed
invocation *mechanisms*, not the broader question of ARC's relationship to portable
behavioral guidance *conventions* that are becoming cross-agent standards.

**TBD — Adapter workflow:**

A lightweight workflow for adapting portable skills into ARC project strategies could provide
a clear bridge for users who want both portability and integration. Steps would include:
analyzing existing project strategies/workflows, identifying where skill content overlaps or
fills gaps, and producing an integrated project strategy that incorporates the methodology.
Not heavy — a checklist or short workflow at project level, not an ARC-level mandate.
Evaluate during Phase 5 whether this adds enough value to include. Implementation items
captured in plan-wu2 (Cluster N) and plan-wu3 (Slash Command Generation extension).

**Addressed in:** Task 5.2 — `tasks-philosophy-configurability.md`

---
