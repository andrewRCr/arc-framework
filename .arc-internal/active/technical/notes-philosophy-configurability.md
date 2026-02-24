# Notes: Core Philosophy & Configurability Architecture

**Purpose:** Active input material for upcoming tasks (Phases 4-6). Prior working notes
from Phases 1-3 have been absorbed into their output artifacts (ADR-001, ADR-002) and
removed. Sections below are retained because they are direct inputs to tasks not yet
complete.

**PRD:** `prd-philosophy-configurability.md`
**ADRs:** `adr-001-define-core-identity-and-principle-method-boundary.md`,
`adr-002-session-model-and-agent-compatibility.md`,
`adr-003-design-configuration-and-extension-point-system.md`,
`adr-004-define-progressive-adoption-tiers.md` (draft),
`adr-005-design-external-tool-platform-compatibility.md` (draft)

---

## Prior Decisions (from planning)

### A+B Hybrid Approach (Decided)

The configurability architecture uses an **expanded config + workflow extension points** approach
(referred to as "A+B hybrid" during planning). This was chosen over alternatives:

- Option A: Config-only (insufficient for workflow customization)
- Option B: Extension points only (insufficient for simple toggles)
- A+B hybrid: Config switches toggle behavior; extension points add behavior

This decision is an input to ADR candidates for requirements 4 and 5.

### Two Adoption Tiers → Profile-Based Adoption (Evolved)

Original decision: two tiers (basic and full). Evolved during Task 5.1 analysis into a
profile-based model with a two-axis adoption framework. See "Two-Axis Adoption Model"
below for the full analysis.

**Key evolution:** Tiers are not structural (different files) or purely documentation
(same experience). They are config-driven profiles that control enforcement depth, with
all files always installed. The system's coherence is preserved because the file set is
identical — only config values and onboarding emphasis differ.

## Config Starting Positions (Consumed by ADR-003)

Absorbed into ADR-003. See `arc-config.yml` schema in ADR-003 Part 1 for the 7 initial
settings (dotted keys, three setting categories, tier 3 selective representation).

## Extension Point Starting Positions (Consumed by ADR-003)

Absorbed into ADR-003. See ADR-003 Part 2 for the preset extension point system,
`arc-extensions.md` design, and candidate extension points.

## Team Workflow Gaps (Consumed by ADR-005)

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

## Portable Behavioral Guidance (Skills) — Consumed by ADR-005

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

## Two-Axis Adoption Model (Task 5.1 Analysis)

**Purpose:** Core analysis for ADR (Task 5.1, progressive adoption tiers). Captures the
exploration and decision rationale for the profile-based approach.

### The Central Tension

ARC is a system — its value comes from cross-referenced, mutually-reinforcing documents.
8 strategies reference each other, 12+ workflows reference strategies, session-init loads
8+ documents in sequence. This integration is why it works, but it also means adopters
can't casually remove pieces without breaking references and losing coherence.

At the same time, 11 principles + 19 conventions + ~55 files is a substantial commitment.
The goal: don't dilute the system in service of "take what you need," but don't require
"take it or leave it" either.

### Options Evaluated

Five options were analyzed for how tiers could work in practice:

**A. Structural (different files installed):** CLI installs a subset for "basic." Problem:
cross-references break. STRATEGY-INDEX has dead entries, workflows link to missing
strategies. Maintaining two parallel reference sets is a significant burden. Scaling up
requires reinstallation. **Rejected.**

**B. Documentation/framing only (same files, guided onboarding):** Everyone gets the same
files. Tiers are a docs-site concept. Problem: doesn't address audit dealbreakers — hooks
still enforce conventional commits regardless of tier. Necessary but insufficient on its
own. **Partially adopted** (progressive docs guide is part of the solution).

**C. Config-driven behavior toggle:** `adoption.tier` setting changes hook enforcement.
Problem: config can toggle hooks (mechanical), but can't toggle workflow prose — agents
read static docs and follow them. Conditional callouts ("if basic tier, skip this")
throughout workflow docs would dilute quality for everyone. **Partially adopted** (config
for hooks, not for prose).

**D. Convention-à-la-carte:** No binary tiers. Adopters review ADR-001's convention table
and decide which to keep, modify, or replace. Problem: operationally vague — "review 19
conventions and make decisions" is not an onboarding experience. **Philosophically right**
but needs a delivery mechanism.

**E. Profile-based hybrid (selected):** Combines B, C, and D:

1. Everyone gets the same files (system stays coherent)
2. CLI init offers profiles that pre-configure convention settings
3. Documentation provides the progressive path
4. Config settings have real teeth (hooks respect them)
5. Scaling up = tightening config (no reinstallation)

### Profile Definitions

**Essentials** — lighter hooks (format enforcement off, context footer optional),
recommended focus areas highlighted in post-init guidance. Same ~55 files installed.
`arc-config.yml` pre-configured: `commit.format: any`, `commit.context_footer: optional`,
`hooks.commit_msg: disabled`.

**Recommended** (default) — full convention set with sensible defaults. All enforcement
active from day one.

**Custom** — pick and choose individual settings via CLI prompts. The convention-à-la-carte
approach (Option D) with CLI guidance rather than "read the ADR."

### The Two-Axis Reframe

During analysis, a critical gap emerged: profiles control *enforcement depth* (whether
hooks block non-compliant behavior), but they don't address *method customization* (teams
that want to do things *differently*, not just less strictly).

Three adopter postures exist:

1. "I don't care, do whatever" → `commit.format: any`. Agent produces quality output. Fine.
2. "I want ARC's convention enforced" → `commit.format: conventional`. Hooks enforce. Fine.
3. "I want something different, and I want THAT enforced" → No mechanism exists.

Case 3 is real and common: Jira ticket references instead of Context footers, team-specific
commit formats, external tracker as status-of-record instead of markdown checkboxes. These
are active alternative practices, not absence of preference.

This revealed that adoption flexibility requires two independent axes:

**Axis 1 — Enforcement depth (profiles):** How strictly are conventions enforced? Controlled
by `arc-config.yml` settings and hook behavior. Profiles pre-configure this axis.

**Axis 2 — Method customization (overrides):** Which ARC default methods does the team
replace with their own? Controlled by a structured override mechanism (see "Method Override
Concept" below). Independent of enforcement — you can have relaxed enforcement with no
overrides, or strict enforcement with multiple overrides.

The axes are independent. Common combinations:

- Essentials + no overrides = solo dev learning ARC (most common starting point)
- Recommended + no overrides = team adopting ARC wholesale (ideal case)
- Recommended + selective overrides = team with Jira/custom commit format
- Essentials + heavy overrides = team evaluating ARC with existing practices

### Prose vs. Config: The "Gentle Over-Delivery" Resolution

ARC's workflow and strategy docs are static prose. They describe conventions as active
defaults. If the agent loads `strategy-development-methodology.md` (which says "conventional
commit format: required") but config says `commit.format: any`, the agent has conflicting
signals.

Resolution: **essentials means "same guidance, less enforcement."**

- **Config** = enforcement boundary (will you be blocked?)
- **Prose** = quality guidance (what's the recommended approach?)
- The agent follows loaded guidance and produces quality output (well-formatted commits,
  thorough documentation) regardless of profile
- The difference: essentials adopters aren't *blocked* when they deviate

This works because adopters choosing `commit.format: any` typically want to avoid
*friction* (hook rejection), not *quality* (well-formatted commits). The agent producing
good output even when not enforced is a feature — it may motivate the adopter to turn
enforcement on later.

**Where this breaks down:** When the adopter has an *active alternative preference* (Case 3
above). If they want `[JIRA-XXX] description` format but the agent keeps producing
`type(scope): description`, the gentle over-delivery becomes a gentle annoyance. This is
where method overrides (Axis 2) become necessary — the agent reads the team's override and
follows *that* instead of the ARC default.

### What "Minimum Viable ARC" Means

The 11 principles are the philosophical floor — honor all of them or you're not meaningfully
using ARC. But the adoption question isn't "which principles?" (all of them) — it's "how
much of ARC's provided machinery do you use to satisfy those principles?"

An adopter could honor P7 (task tracking) with Jira, P6 (traceability) with informal but
consistent commits, P5 (context preservation) with a lighter mechanism than full
session-init/handoff. The principles are always the same. What varies is how much of ARC's
convention set you adopt as-is vs. bring-your-own or configure away.

### Scaling Up and Down

Option E handles both naturally:

- **Scaling up** (essentials → recommended): tighten config settings. No reinstallation,
  no file additions. Agent already knows the conventions from loaded docs.
- **Scaling down**: loosen config settings. WU2 Cluster J (archive ceremony scaling)
  addresses ceremony weight by work complexity, orthogonal to tiers.

### Gotchas Identified

**Activation ceremony weight (low):** `activate-work-unit.md` Steps 5-6 (PROJECT-STATUS,
ROADMAP) may feel heavy for essentials. Resolution: light prose callouts marking optional
steps. Step 6 already says "if tracked."

**55-file overwhelm (low):** Adopters see all files regardless of profile. Resolution:
docs-site progressive guide (WU4) creates the "you are here" feeling. Agent navigates
files — adopter doesn't need to know the tree.

**No config toggle for prose ceremony (design question):** Config toggles hooks but
can't toggle "write a completion doc." Resolution: ceremony scales by work complexity
(WU2 Cluster J), not adoption tier. Essentials reduces enforcement friction, not
process steps.

**Addressed in:** Task 5.1 ADR (draft) — `tasks-philosophy-configurability.md`

## Method Override Concept (Consumed by ADR-005)

**Purpose:** Design direction for the method override mechanism. Captured during Task 5.1
analysis as the second axis of adoption flexibility. Task 5.2 should design the specifics;
this section captures the concept and rationale.

### The Gap

ADR-003 established two customization mechanisms:

- **Config** toggles existing behavior (enforcement on/off, value selection)
- **Extensions** add behavior at preset workflow points (additional steps)

Neither handles: "ARC's default way of doing X is Y, but our team does Z instead." Teams
with Jira, custom commit formats, or alternative context preservation mechanisms need a
way to express "use this instead" — not just "use ours" or "don't enforce."

### The Three-Mechanism Model

| Mechanism       | What it does                               | Example                                    |
|-----------------|--------------------------------------------|--------------------------------------------|
| Config          | Toggles enforcement (mechanical)           | `commit.format: any` disables hook         |
| Extension       | Adds steps to workflows                    | Post-task quality: also run Snyk scan      |
| Method override | Replaces default convention implementation | Task completion: update Jira, not markdown |

Config handles enforcement. Extensions handle additions. Method overrides handle
replacements. Together they cover the full customization space without requiring teams to
edit framework-owned files (which breaks update safety).

### Sketch: How It Could Work

Workflows reference *methods* — abstract operations with a default implementation. Teams
override specific methods in a structured, team-controlled file. The agent reads the
override and follows it instead of the default.

**In a methods file** (e.g., `arc-methods.md` or a section in `arc-extensions.md`):

```markdown
## task-completion-tracking

**Referenced by:** process-task-loop.md
**When:** Agent marks a task as complete
**Default:** Mark `[x]` in the markdown task list file, update task description
**Contract:** Record that the specified task is complete. Status must be
verifiable by both human and agent.

### Project Override

Update the Jira ticket to "Done" status via jira-cli. Markdown task list
serves as the planning artifact; Jira is the status-of-record.
```

**In the workflow**, instead of hardcoding the default:

```markdown
**Second**: Mark task as complete (see task completion tracking method)
```

The agent follows the reference, reads the method (default or override), acts accordingly.
Same cross-reference pattern as extensions.

### Design Questions for Task 5.2

- **Separate file or shared with extensions?** `arc-methods.md` vs. sections in
  `arc-extensions.md`. Separate is cleaner conceptually (add vs. replace); shared reduces
  file count and follows the "one customization file" pattern.
- **How do hooks interact?** For methods with mechanical enforcement (commit format), the
  hook needs to read the override pattern. Config value (`commit.format: custom`) + method
  file (custom pattern definition) is one approach. Feasibility depends on shell-parseable
  constraint.
- **How many preset methods?** Similar question to extension points — 0-3 per workflow,
  identified where teams have demonstrated or anticipated customization needs.
- **Contract enforcement:** Can the contract be validated, or is it purely advisory? E.g.,
  "status must be verifiable by both human and agent" — what happens if the override
  doesn't satisfy the contract?
- **Relationship to `project/` directories:** Method overrides are team-specific behavioral
  guidance. Do they conceptually belong in `project/` (alongside project strategies and
  workflows) or at the `system/workflows/` level (alongside extensions)?
- **Session-init config awareness:** Should session-init explicitly read `arc-config.yml`
  and method overrides, giving the agent a "profile-aware" context layer? Light addition:
  one step that says "note settings that differ from ARC defaults and any active method
  overrides."

### Candidate Methods (Illustrative)

| Convention               | Default                          | Common Override             |
|--------------------------|----------------------------------|-----------------------------|
| Task completion tracking | Mark `[x]` in markdown           | Update Jira/Linear status   |
| Commit message format    | Conventional commits             | `[TICKET-XXX] description`  |
| Context footer           | `Context: tasks-*.md (Task X.Y)` | `Closes #123` or Jira ref   |
| Quality gate commands    | Markdown linting (framework)     | Project-specific test/lint  |
| Session state mechanism  | CURRENT-SESSION.md               | IDE persistent memory, etc. |

**Addressed in:** Task 5.2 — `tasks-philosophy-configurability.md`

---
