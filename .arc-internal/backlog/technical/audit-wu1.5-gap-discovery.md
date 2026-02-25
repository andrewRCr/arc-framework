# Audit: WU1.5 Foundational Gap Discovery

**Purpose:** Systematic identification of foundational design gaps not addressed in WU1 that must be resolved before or
during WU2 implementation.

**Date:** 2026-02-25 **Status:** Complete (Phase 1) **Governing plan:** `plan-wu1.5-foundational-gap-closure.md`

---

## Methodology

Four independent discovery methods were executed per the WU1.5 plan, with findings cross-referenced against WU1 outputs
(6 ADRs, 2 new strategies) to avoid double-catching issues already resolved by design decisions.

### Methods Executed

**Method 1 — Scenario walks (2 parallel agents, 6 scenarios):**

- Agent A: Solo dev multi-machine (session handoff + resume), new adopter (first-time setup + first session), returning
  contributor (picking up someone else's work)
- Agent B: Small team same agent (parallel execution + handoff), small team mixed agents (session init across agents),
  async/factory agent (bookend pattern)
- Coverage: All 7 personas from the plan matrix, 6 of 7 lifecycle stages. Thin spots: branch management (partially
  covered via assumption extraction), git workflow diversity (trunk-based and squash-merge not explicitly walked),
  multi-session continuity (5+ sessions deep)

**Method 2 — Assumption extraction (1 agent, 7 documents):**

- Documents analyzed: session-init, session-handoff, process-task-loop, atomic-commit, strategy-development-methodology,
  strategy-work-organization, strategy-configurability-architecture
- Output: 26 extracted assumptions across all 7 documents, classified as reasonable or problematic

**Method 3 — Pre-mortem (1 agent):**

- Scenario: "3 sessions into WU2, implementation paused due to foundational gap. What was the gap?"
- Agents read the WU2 plan, WU1.5 plan, all 6 ADRs, and key strategy/workflow docs
- Output: 8 pre-mortem scenarios with evidence citations
- Instruction: push beyond the two known gaps (session state, context loading)

**Method 4 — WU1 output review (main context):**

- All 6 ADRs read in full, cross-referenced against findings from methods 1-3
- WU2 plan reviewed for items that require design decisions vs. pure implementation
- Two new strategies (core-philosophy, configurability-architecture) treated as part of the existing decision base

### Stale State Acknowledgment

The audit ran against ARC's current workflow and strategy documents, which do not yet reflect WU1's design decisions.
WU1 produced 6 ADRs and 2 new strategies that will change these documents during WU2 — but the changes haven't been
implemented yet. This means:

- Some findings flag gaps that WU1 ADRs have already resolved (filtered out during cross-referencing)
- Some findings may be affected by WU2 implementation choices not yet visible in the docs
- A post-WU2 re-audit is recommended as a verification phase item to catch gaps that emerge during implementation

---

## Classification Framework

Each finding is classified against WU1's outputs:

1. **Genuinely new gap** — Not addressed by any existing ADR, strategy, or plan. Requires a design decision before or
   during WU2.
2. **Already decided / intentional boundary** — An ADR or strategy explicitly covers this. WU2 implements the decision,
   or the finding reflects an intentional design boundary.
3. **Partially addressed** — ADR touches the concern but doesn't fully resolve it. May need supplemental design work.

---

## Findings: Already Decided / Intentional Boundary

These findings were surfaced by the audit but are already resolved by WU1 decisions. Listed for completeness and
provenance tracking.

### Async agent compatibility (ADR-002 Tier 3)

**Finding:** Mandatory completion stops are incompatible with autonomous execution. Async agents have no handoff output
channel (CURRENT-SESSION.md is gitignored). Error handling and context management are undefined for async agents.

**Resolution:** ADR-002 Part 4 explicitly classifies cloud/async delegation agents as Tier 3 (off-label). ARC's core
methodology doesn't apply to the execution phase for these agents. The bookend pattern (ARC for planning + integration,
agent's own model for execution) is acknowledged but not promoted. This is an intentional boundary, not a gap.

**Methods:** Scenario walks B (scenarios 5, 6)

### Method contract enforcement (ADR-003, ADR-005)

**Finding:** Extension point and method override contracts are advisory with no mechanical validation. Teams could
violate contracts without detection.

**Resolution:** ADR-003 and ADR-005 explicitly choose advisory contracts as consistent with ARC's approach (principles
define what, teams own their choices). The pre-mortem noted a philosophical tension with P4 (quality gate enforcement),
but the ADRs document this as an intentional tradeoff.

**Methods:** Assumption extraction, pre-mortem (scenario 2)

### Platform command validation (ADR-005 Part 3)

**Finding:** Platform commands in QUICK-REFERENCE are not validated. Wrong commands fail silently.

**Resolution:** ADR-005 Part 3 puts platform commands in QUICK-REFERENCE as project-owned content. Non-GitHub platform
equivalents are best-effort. This is team responsibility by design.

**Methods:** Assumption extraction

### Task list merge conflicts in teams

**Finding:** Concurrent task list edits across branches create merge conflicts.

**Resolution:** strategy-team-coordination.md (lines 134-150) explicitly addresses this: "merge conflicts are
expected... trivially resolvable — accept both sides' checkbox changes."

**Methods:** Scenario walks B (scenario 4)

### Hook dual-directory (WU2 plan D7)

**Finding:** Two hook directories (`.arc/system/githooks/` and `.arc-internal/system/githooks/`) with unexplained
divergence.

**Resolution:** WU2 plan D7 already tracks this: "An atomicity check was added to the internal version... WU2 should
review and port to the canonical `.arc/` copy."

**Methods:** Pre-mortem (scenario 4)

---

## Findings: Genuinely New Gaps

These require design decisions before or during WU2. Ordered by convergence strength (number of independent methods
confirming the gap), then severity.

### Gap 3: First-Session Bootstrap

**Summary:** Session-init assumes CURRENT-SESSION.md exists and contains valid state. No workflow exists for first-ever
session after ARC adoption. New adopters hit a dead end at session-init step 8 ("MUST READ IN FULL") when the file
doesn't exist.

**Evidence:**

- session-init.md line 75: "MUST READ IN FULL" — no fallback for missing file
- ADOPTION.md ends with "Delete or keep `*.template.md` as learning aids" — no onboarding workflow connects setup
  completion to first session
- CURRENT-SESSION.template.md exists with placeholders but no guidance on first-use population
- No workflow document says "after setup, do this first"

**Broader scope:** This is part of a missing "adopter onboarding sequence" — the gap between completing setup
(01_initialize-arc, 02_define-project) and starting productive work. ADR-004 (adoption tiers) discusses post-init
guidance differentiation but doesn't specify the workflow sequence itself.

**Severity:** Critical for adoption. Moderate for framework development (ARC self-hosts past the first session).

**Confirmed by:** Scenario walks A (scenario 2), assumption extraction (session-init), pre-mortem (scenario 3 —
dependency on WU1.5 completing before WU2)

**Design question:** What should happen on the first session after ARC adoption? Options include: (a) session-init
gracefully handles missing CURRENT-SESSION.md by creating it from template, (b) a separate "first session" workflow
bridges setup to session-init, (c) setup workflow's final step creates initial CURRENT-SESSION.md.

### Gap 4: Task Reference Stability

**Summary:** CURRENT-SESSION.md uses line numbers as task anchors (e.g., "Task 5.5 (line 1903)"). Line numbers shift
when tasks are added, edited, or reordered between sessions. Handoff references become invalid.

**Evidence:**

- session-init.md line 81: "Current Task field must include line number"
- session-handoff.md lines 46, 109, 151: line numbers as handoff anchors
- Task lists are actively edited markdown files — line numbers are inherently unstable

**Severity:** Critical for multi-session continuity. References break silently — the agent jumps to a wrong line and may
start working on the wrong task.

**Confirmed by:** Scenario walks B (scenario 4 — parallel devs shift line numbers), assumption extraction
(session-handoff analysis)

**Design question:** Should line numbers be replaced with stable task identifiers (e.g., markdown heading anchors, task
ID patterns), supplemented with verification guidance ("confirm line number still points to expected task"), or handled
through a different referencing mechanism?

### Gap 5: Team Work Transfer Protocol

**Summary:** No documented workflow exists for transferring work from one developer to another. Session-handoff captures
state for the _same_ developer's next session. CURRENT-SESSION.md is gitignored, so even a well-documented handoff can't
be shared. But even if session state becomes shareable, the _process_ of work transfer (what the outgoing dev does, what
the incoming dev does, how context gaps are identified) is undefined.

**Evidence:**

- No workflow document mentions developer-to-developer transfer
- session-handoff.md line 5: "so the next session can resume" — assumes same developer
- strategy-development-methodology.md Session Context Management (lines 198-232): addresses individual context limits,
  not team transitions
- strategy-team-coordination.md: discusses task ownership and parallel work but not mid-work-unit handoff between
  developers

**Severity:** Critical for team adoption. The framework provides excellent context capture format with no sharing or
transfer mechanism.

**Confirmed by:** Scenario walks A (scenario 3 — returning contributor), scenario walks B (scenario 4 — team handoff)

**Design question:** Should ARC provide a team handoff workflow distinct from session handoff? What does the incoming
developer need beyond what task lists and git history provide? Is this a workflow design question or a session state
architecture question (i.e., does solving Gap 1 also solve this)?

### Gap 6: Method Override Dependencies

**Summary:** ADR-005's method override system treats overrides as independent. But some methods are interdependent —
overriding task completion to use Jira implies the commit context format should reference Jira tickets, not markdown
task files. No guidance exists on which overrides need to be paired, and inconsistent configurations are silently
accepted.

**Evidence:**

- strategy-configurability-architecture.md Method Overrides: each method defined independently with independent
  contracts
- ADR-005 Validation Scenario A (Jira adoption): describes overriding both task-completion and commit-context as two
  independent choices, not a coupled set
- No documented convention for method consistency checking

**Severity:** Moderate. The inconsistency produces confusing but not catastrophic results (commit footers reference
files that aren't being used for tracking). Likely addressable through documentation rather than enforcement.

**Confirmed by:** Pre-mortem (scenario 5 — unique find)

**Design question:** Should `arc-methods.md` include dependency notes ("if you override task-completion, review
commit-context-format")? Or is a "consistency checklist" in the adoption guide sufficient?

### Gap 7: Config Semantics in Team Mode

**Summary:** `arc-config.yml` is described as a single project-level file, but in team mode, developers may need
different config values (different platform, different commit format preference). The configurability strategy and team
coordination strategy don't intersect on config semantics.

**Evidence:**

- strategy-configurability-architecture.md Agent Discovery: "The agent reads `arc-config.yml`" — singular, no mention of
  team variants
- strategy-team-coordination.md: documents personal files (`team/{name}/CURRENT-SESSION.md`,
  `team/{name}/ATOMIC-TASKS.md`) but never mentions config
- ADR-003: config design assumes single file read by hooks

**Severity:** Moderate. Most config values (branch protection, merge strategy) are project-wide. But `platform.type`
could legitimately vary per developer (one on GitHub Desktop, another on CLI). The hooks read config per-invocation, so
personal overrides would need a layered config approach.

**Confirmed by:** Pre-mortem (scenario 1 — unique find)

**Design question:** Is `arc-config.yml` always project-wide (personal preferences go elsewhere), or should the config
system support layered resolution (project → team/personal)? If project-wide only, should this be documented as an
explicit design choice?

### Gap 8: Archive Trigger Ambiguity

**Summary:** Work organization strategy says archive task list when "all tasks are complete." But when multiple branches
serve one task list (stacked PRs), "all tasks complete" doesn't guarantee all branches are merged. Premature archival is
possible.

**Evidence:**

- strategy-work-organization.md lines 160-161, 373-375: archive when "all tasks in the task list are complete, not when
  any individual branch is merged"
- Same strategy documents stacked branches (multiple branches per task list)
- No documented check: "are all branches for this task list merged?"

**Severity:** Moderate. The archive workflow could prematurely archive a task list while a branch with uncommitted work
still exists. Recoverable but disruptive.

**Confirmed by:** Assumption extraction (work-organization analysis)

**Design question:** Should the archive trigger require "all tasks complete AND all associated branches merged"? Or is
"all tasks complete" sufficient with guidance to verify branch state before archiving?

### Gap 9: Session State Mismatch Recovery

**Summary:** Session-init step 4 detects mismatches between CURRENT-SESSION.md and reality (git status, task list state)
but offers no recovery protocol — only "stop and ask." If the user is unavailable or the mismatch is severe
(corrupted/stale file), no path forward exists.

**Evidence:**

- session-init.md lines 113-128: "Stop immediately," "Ask for guidance," "Wait for explicit direction" — no
  self-recovery
- No documented decision about trust hierarchy (which source of truth wins when they disagree: git status, task list, or
  CURRENT-SESSION.md?)

**Severity:** Moderate. The "stop and ask" approach is safe but blocks work. A recovery protocol (even if conservative —
"trust git status over CURRENT-SESSION.md, re-derive session state from committed artifacts") would improve resilience.

**Confirmed by:** Assumption extraction (session-init analysis)

**Design question:** Should session-init have a tiered recovery protocol (minor mismatches: auto-correct with notice;
major mismatches: stop and ask)? What's the trust hierarchy among sources of truth?

### Gap 10: CURRENT-SESSION Staleness Detection

**Summary:** Session-init reads CURRENT-SESSION.md without verifying freshness. If a developer skipped handoff (closed
the terminal, forgot), the file contains state from a prior session — potentially days or sessions old. The agent
initializes against stale context with no warning.

**Evidence:**

- session-init.md step 8: reads file with no freshness check
- strategy-development-methodology.md line 139: "AI NEVER updates CURRENT-SESSION.md without explicit instruction" — the
  file only updates when explicitly told to
- No timestamp verification or "last updated" cross-check

**Severity:** Moderate. Stale state cascades into wrong task identification, missed completed work, and redundant
effort. Partially mitigated by the mismatch detection in step 4, but only if the staleness produces a detectable
mismatch (not always the case).

**Confirmed by:** Assumption extraction (development-methodology analysis)

**Design question:** Should session-init check the "Last Updated" field in CURRENT-SESSION.md against the most recent
commit timestamp? If significant drift exists, flag it before proceeding?

---

## Findings: Partially Addressed

These are touched by existing decisions but have remaining design surface.

### Agent switching between sessions

ADR-002 Part 3 classifies all workflow assumptions as incidental to specific agents. Part 5 establishes the hub-spoke
agent file architecture. But no operational guidance exists for "I used Claude last session, switching to Gemini this
session." Specifically: CURRENT-SESSION.md may contain agent-specific context (e.g., "stopped at 150k tokens" is
meaningless to Gemini), and there's no protocol for the incoming agent to filter or adapt prior session state.

**Severity:** Minor. The architecture supports agent switching; operational docs are missing. Addressable during WU2
implementation of session workflow updates.

### Deferred review scope bounds

process-task-loop.md line 57-63 allows user-defined scope for deferred review with "stop... if anything unexpected
arises." This partially addresses unbounded scope, but the threshold for "unexpected" is undefined. Combined with
imprecise effort estimation (noted in work-organization strategy), deferred review could trap an agent in a scope larger
than intended.

**Severity:** Minor. The existing clause is adequate for most cases. A brief clarification ("unexpected includes:
quality gate failure, task scope significantly exceeds estimate, blocking dependency discovered") would strengthen it
without adding ceremony.

### File classification reclassification after WU2

WU2 changes may alter file classifications (e.g., expanded `arc-config.yml` might shift from Configurable toward
Framework). WU2 Cluster M runs the structural validation at end-of-WU2, which should catch this — but the plan doesn't
explicitly include a reclassification pass.

**Severity:** Minor. Cluster M's "validate the final state" framing likely covers this. Worth flagging as a checkpoint
during WU2 Cluster M execution.

---

## Convergence Analysis

### Cross-Method Confirmation Matrix

| Gap                               | Scenario Walks | Assumption Extraction | Pre-mortem | WU1 Review | Count |
| --------------------------------- | :------------: | :-------------------: | :--------: | :--------: | :---: |
| Session state portability (known) |       ✓        |           ✓           |     ✓      |     ✓      |   4   |
| Context loading arch (known)      |       —        |           —           |     ✓      |     ✓      |   2   |
| First-session bootstrap (#3)      |       ✓        |           ✓           |     ✓      |     —      |   3   |
| Task reference stability (#4)     |       ✓        |           ✓           |     —      |     —      |   2   |
| Team work transfer (#5)           |       ✓        |           —           |     —      |     —      |  2\*  |
| Method override deps (#6)         |       —        |           —           |     ✓      |     —      |   1   |
| Config team semantics (#7)        |       —        |           —           |     ✓      |     —      |   1   |
| Archive trigger (#8)              |       —        |           ✓           |     —      |     —      |   1   |
| Mismatch recovery (#9)            |       —        |           ✓           |     —      |     —      |   1   |
| Staleness detection (#10)         |       —        |           ✓           |     —      |     —      |   1   |

\*Team work transfer was found independently by both scenario walk agents (A scenario 3, B scenario 4).

### Saturation Assessment

**High confidence (gaps #3, #4, #5):** Multi-method confirmation, clear evidence trails, grounded in specific document
citations. These are real gaps.

**Moderate confidence (gaps #6, #7):** Single-method finds (pre-mortem only). The pre-mortem's strength is surfacing
risks other methods miss, but single-method findings have lower confidence. Both are plausible and evidence-grounded but
may be addressable as WU2 implementation concerns rather than pre-WU2 design decisions.

**Moderate confidence (gaps #8, #9, #10):** Single-method finds from assumption extraction. Grounded in document
analysis with specific citations. Real gaps but more operational than foundational — likely resolvable through
documentation updates and workflow refinements during WU2.

### Gap Clustering

The dominant theme is **session lifecycle gaps**. Gaps 1 (portability — known), 3 (first-session bootstrap), 5 (team
transfer), 9 (mismatch recovery), and 10 (staleness detection) all concern how ARC handles session state across
different boundary types. These are facets of a single design space rather than independent problems.

The secondary theme is **reference/coordination mechanisms**. Gap 4 (task reference stability), Gap 8 (archive trigger),
and Gap 6 (method override dependencies) all concern how ARC components reference and coordinate with each other.

Gap 7 (config team semantics) is standalone — it sits at the intersection of two strategies that haven't been connected.

---

## Recommendations for Phase 2

### Research Needed

**Session lifecycle design (Gaps 1, 3, 5, 9, 10):** Research how other development frameworks handle session state
portability, first-session bootstrap, and team handoff. This subsumes the known Gap 1 research and adds the newly
discovered facets. A single research effort covering the full session lifecycle design space is more efficient than
separate investigations per gap.

**Context loading architecture (known Gap 2):** Execute the research plan from `plan-context-loading-architecture.md`.
Independent of the session lifecycle research.

### Resolvable Without Research

**Task reference stability (Gap 4):** Decidable from first principles. Options are clear: stable IDs, heading anchors,
or verification guidance. An ADR or strategy update can resolve this without external research.

**Archive trigger (Gap 8):** Small scope. Add "verify all associated branches merged" to the archive workflow. Strategy
update, not ADR-level.

**Method override dependencies (Gap 6):** Documentable as guidance in `arc-methods.md` template. Add dependency notes to
coupled methods. Strategy update scope.

**Config team semantics (Gap 7):** Likely resolvable by documenting `arc-config.yml` as project-wide (explicit design
choice) with a brief rationale. If layered config is deemed necessary, it's a larger design decision — but the simpler
answer is probably correct.

### Post-WU2 Re-Audit

The audit ran against pre-WU2 document state. WU1's design decisions are captured in ADRs but not yet reflected in
workflows and strategies. A lighter re-audit after WU2 implementation is recommended to verify:

- No new gaps emerged during implementation
- Gaps identified here were actually resolved by WU2 changes
- Cross-document consistency is maintained after the volume of WU2 edits

Recommend adding this as a verification phase item in WU2's task list.

---

**Produced by:** Phase 1 audit per `plan-wu1.5-foundational-gap-closure.md` **Next:** Phase 2 research on gaps requiring
external grounding
