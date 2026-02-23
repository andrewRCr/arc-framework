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

## Working Catalog: ARC Practice Classifications

**Purpose:** Map every current ARC practice to an initial principle/convention/escape-hatch
classification. This grounds the Task 2.2 ADR discussion in what ARC actually does today.

**Sources:** META-PRD philosophy, AGENTS.md principles, development methodology strategy, process
task loop, aspirational README, PRD use cases. Cross-referenced with audit findings (3
dealbreakers, 7 friction points) and Phase 1 research (agent landscape, attention/single-tasking).

**Classification key:**

- **P** — Proposed principle (non-negotiable, identity-defining)
- **C** — Proposed convention (configurable method with sensible default)
- **D** — Discussion needed (bundles principle with method, or classification is contested)

**Analytical test:** "If an adopter changed or removed this, would they still be meaningfully
using ARC?" Yes → C. No → P. Depends → D.

---

### Group A: Core Philosophy

**A1. Spec-driven development** · P

- **What it is:** Work flows from explicit specifications (META-PRD → PRD → tasks → execution),
  not ad-hoc prompts or unstructured requests.
- **Why P:** This is ARC's single most defining characteristic. The README leads with it, the
  META-PRD frames it as the foundation, and the name includes "Coordination" — coordination
  requires shared specifications. Without specs, ARC is just AI prompting with extra folders.
- **Convention aspects:** The specific document hierarchy (META-PRD as root, PRD as feature-level,
  task list as decomposition), file naming, template formats.
- **PRD relevance:** Requirement 1.

**A2. Human oversight at decision points** · P

- **What it is:** Humans make all significant decisions. AI executes within human-defined scope
  and reports back. META-PRD frames this as "antithesis to vibe coding" and "directed, not
  autonomous."
- **Why P:** Without human oversight, ARC becomes another autonomous agent framework. The
  *directed* collaboration model is what distinguishes ARC from factory-style agents and
  vibe coding alike.
- **Convention aspects:** The *mechanism* of oversight varies — per-task mandatory stop, per-edit
  approval gates, plan-then-execute, or review-based acceptance. The agent landscape shows the
  full spectrum; deferred review already loosens the mechanism within ARC itself.
- **Tension:** The principle is clear but the current implementation may overenforce it (see A3,
  B3).
- **PRD relevance:** Requirement 1.

**A3. Focused execution / minimal parallelism** · D

- **What it is:** One task at a time. One agent focus. No parallel agent orchestration.
  Grounded in cognitive science (attention bottleneck, task-switching costs).
- **Principle candidate:** "Novel knowledge work has well-documented multitasking costs; ARC
  designs for the 97.5%, not supertaskers." The cognitive science strongly supports a principle
  here — 70+ years of bottleneck evidence, 23-min recovery time, 40% productivity loss from
  switching. Strongest framing from research: bottleneck is real for novel complex work, and
  AI-assisted development IS novel complex work.
- **Convention candidate:** The exact enforcement (one checkbox, mandatory stop) vs. a looser
  "minimize concurrent work streams" or "single active work focus."
- **Key question:** Is the principle "human-agent pairs work single-threaded" or the broader
  "minimize cognitive switching costs"? The broader framing accommodates deferred review,
  sequential agent handoffs, and teams that manage two or three concurrent PRDs with discipline.
- **Agent landscape context:** Multi-agent orchestration arriving (Warp Oz, Antigravity, Cursor
  background agents) but immature. ATC research shows domain structure and tools can mitigate
  bottleneck costs — ARC's design IS that environmental structure.
- **Audit relevance:** "One-task-at-a-time strict enforcement" listed as friction point.
- **PRD relevance:** Requirement 1, open question 4.

**A4. Quality gate enforcement** · P (principle) + C (implementation)

- **What it is:** Automated quality verification is a required step before work is considered
  complete. Currently: zero-tolerance markdown linting, tiered approach (Tier 1/2/3).
- **Why P:** Quality gates are what prevent AI drift and compounding errors. Without them, the
  directed collaboration model loses its feedback mechanism.
- **Convention aspects:** Zero-tolerance policy (vs. severity levels / warning-level gates),
  specific tier definitions, specific tools, when each tier runs.
- **Audit relevance:** "Quality gate zero-tolerance with no severity levels" listed as friction.
  Teams may need warning-level gates or different tool chains while still maintaining the
  principle that quality is verified, not assumed.
- **PRD relevance:** Requirement 1.

**A5. Git as canonical work record** · P (probably)

- **What it is:** Git commits, branches, and PRs are the canonical interface for all work
  artifacts. Task lists committed to git. Branch/task list coupling. Commits serve as the
  handoff mechanism.
- **Why P (tentatively):** Agent landscape confirms git is universal across all 17 tools
  surveyed — "git is the universal handoff mechanism." Practically, git and "version-controlled"
  are nearly synonymous in 2026. The principle is: work artifacts are version-controlled and
  serve as canonical records.
- **Convention aspects:** Branch naming, branch/task list coupling, specific use of commits for
  state transfer. Platform-specific assumptions (GitHub Actions, `gh` CLI) are clearly methods.
- **PRD relevance:** Requirements 1, 7, 11.

**A6. Context preservation across work boundaries** · P (principle) + C (mechanisms)

- **What it is:** Work context must be recoverable across session boundaries. No knowledge lost
  between sessions. Currently: CURRENT-SESSION.md, init/handoff ceremonies.
- **Why P:** The "Recursive" in ARC depends on knowledge not being lost. Without context
  preservation, each session starts from scratch, defeating the framework's core value
  proposition.
- **Convention aspects:** CURRENT-SESSION.md specifically, init/handoff ceremony structure,
  session-init workflow steps. IDE agents with persistent memory need less ceremony; factory-style
  agents using PR-based handoff need different mechanisms entirely.
- **PRD question:** Requirement 2 asks exactly this: "Is the principle 'sessions with explicit
  boundaries' or 'context must be recoverable'?"
- **Agent landscape context:** Only Augment Code has persistent cross-session memory. ARC's
  handoff fills a real gap, but the *mechanism* should vary by agent type.
- **Audit relevance:** "Session model overhead" listed as friction point.

**A7. Documentation as dual-audience artifact** · P

- **What it is:** Project documentation is structured for both human comprehension and AI agent
  consumption. Not human-only prose, not machine-only config.
- **Why P:** This is the "Agentic" in ARC. A framework for AI-human collaboration where
  documentation only works for one audience misses the point. The dual-audience principle drives
  template structure, formatting choices, and content organization.
- **Convention aspects:** Specific formatting rules, template layouts, what "agent-friendly"
  means in practice.

**A8. Recursive improvement / knowledge evolution** · P

- **What it is:** Working notes mature into strategy documents. Patterns codified from
  experience. Feedback loops built into the methodology. The README describes: "development
  cycles that improve on themselves rather than starting fresh each time."
- **Why P:** This is the "Recursive" in ARC. Without knowledge evolution, ARC is a static
  project management template. The recursive feedback — decisions documented, patterns extracted,
  future work builds on prior context — is what makes it a *living* methodology.
- **Convention aspects:** The specific evolution path (notes → strategies → constitutional docs),
  archival processes, where patterns live.

---

### Group B: Task Execution Model

**B1. Explicit task decomposition** · P (principle) + C (format)

- **What it is:** Work is decomposed into explicit, trackable units (task lists with checkboxes)
  before execution begins. PRDs decompose into tasks; tasks decompose into subtasks.
- **Why P:** Decomposition is what makes spec-driven development (A1) operational. Without
  explicit tasks, specs are just documents — the methodology has no execution mechanism.
- **Convention aspects:** Markdown checkbox format, task list file naming, formatting rules,
  granularity guidelines (when to create subtasks).
- **Audit relevance:** "Task list formatting rigidity" listed as friction point.

**B2. Plan before executing** · P

- **What it is:** Default to plan-driven execution. Agent confirms approach before implementing.
  Skip plans only for trivial tasks.
- **Why P:** Directly supports spec-driven development (A1) and human oversight (A2). Planning
  before execution is what makes ARC's methodology structured rather than reactive. Without
  it, agents just start coding from prompts — which is vibe coding with a task list.

**B3. Mandatory review stop** · D

- **What it is:** After completing one checkbox, agent must stop and report. User approves
  before proceeding. Deferred review loosens this for user-defined scope.
- **Principle claim:** Implements A2 (human oversight). Human reviews AI work before it
  compounds.
- **Convention claim:** The *granularity* of review is the method. Per-task stop is one
  approach; per-coherent-unit, per-phase, or user-defined checkpoints are alternatives.
  Deferred review already acknowledges the mechanism is flexible.
- **Key question:** Is per-task review a *principle* (ARC IS the careful, granular review
  approach) or a *strong default* (the safest starting point, configurable by experienced
  teams)? The audit found friction here; the PRD use cases include teams with different
  ceremony preferences.

**B4. Completion protocol** · C

- **What it is:** Quality checks → mark task complete → verify → report → stop. Pre-report
  checklist. Tier escalation at coherent unit boundaries.
- **Underlying principle:** A2 (oversight) + A4 (quality gates). The structured completion flow
  ensures nothing is skipped.
- **Why C:** The specific protocol steps and their ordering are implementation details. The
  principles they serve (verify quality, update tracking, report status) could be implemented
  through different ceremonies.

**B5. Deferred review** · C

- **What it is:** User can explicitly grant scope for agent to work through multiple tasks
  without per-task stops. Agent-defined scope is never permitted.
- **Underlying principle:** A2 (human oversight) — deferred review IS human oversight; the human
  chose the scope.
- **Why C:** A flexibility mechanism that already demonstrates the convention-nature of
  mandatory per-task stops (B3).

---

### Group C: Commit & Version Control

**C1. Manual commit control** · P (probably)

- **What it is:** AI never initiates commits without explicit user approval. Commits are
  human-authorized actions.
- **Why P:** Directly implements A2 (human oversight) for the most consequential git operation.
  Commits are permanent, shared state changes — unilateral AI commits undermine the directed
  collaboration model.
- **Convention aspects:** What specifically requires approval (commit, push, branch creation)
  could be configurable per team trust level.
- **Agent landscape context:** Only Aider auto-commits natively. Cloud agents abstract commits
  behind PRs. Most tools align with ARC's explicit-commit model.

**C2. Conventional commit format** · C

- **What it is:** `type(scope): description` format enforced by git hooks.
- **Underlying principle:** Commits are communicative and traceable (part of A5).
- **Why C:** Audit dealbreaker #1. Teams with existing commit conventions (Commitizen,
  gitmoji, plain English, etc.) cannot adopt ARC without disabling hooks. The principle is
  traceable commits; conventional format is one widely-adopted method.

**C3. Context footer** · C

- **What it is:** `Context: tasks-[filename].md (Task X.Y)` required on every commit.
- **Underlying principle:** Commits reference the work that motivated them (traceability).
- **Why C:** Audit dealbreaker #2. Unusual convention that surprises adopters. The principle is
  commit-to-work traceability; the footer format is a method. Could be replaced by PR
  descriptions, external tracker links, branch naming conventions, or simplified body
  conventions.

**C4. Atomic commits** · D

- **What it is:** One logical change per commit. Atomicity analysis before staging.
- **Principle candidate:** Changes should be logically organized and traceable.
- **Convention candidate:** Strict one-logical-change-per-commit, atomicity analysis ceremony.
- **Complication:** Audit dealbreaker #3 (squash merge) makes individual atomic commits
  invisible at merge time. The value depends on merge strategy — with squash, the PR is the
  atomic unit, not the commit. The principle might be "changes are logically organized" with the
  *unit* of organization (commit vs. PR) as the convention.

**C5. Branch naming conventions** · C

- **What it is:** Pattern-enforced naming (feature/, technical/, incidental/) via hooks.
- **Underlying principle:** Branch organization is meaningful (part of A5).
- **Why C:** Audit friction point. Purely organizational; any consistent naming scheme works.

**C6. Branch/task list coupling** · C

- **What it is:** Active branch ↔ active task list. Archive task list when branch merged.
- **Underlying principle:** Work tracking and version control stay synchronized.
- **Why C:** Good default for solo/small team workflows. Less natural for teams with external
  trackers or many small branches.

---

### Group D: Documentation & Knowledge

**D1. Constitutional document hierarchy** · C

- **What it is:** META-PRD → PROJECT-STATUS → DEVELOPMENT-RULES → TECHNICAL-ARCHITECTURE as
  the foundation layer.
- **Underlying principle:** A1 (spec-driven). Projects need foundational specs.
- **Why C:** The specific document types, names, and relationships are a recommended structure.
  Teams might use fewer documents, different names, or different organizational patterns while
  still being spec-driven.

**D2. Template-first documents** · C

- **What it is:** Copy-ready templates with inline guidance and framework defaults. Template-first
  over token-replacement.
- **Underlying principle:** Onboarding should be low-friction.
- **Why C:** A distribution and usability choice. Good default, but not identity-defining.

**D3. Collaborative voice** · C (strong convention)

- **What it is:** No "the user said" / "AI did" language. Commits, docs, and task lists read
  from an author/team perspective.
- **Underlying principle:** Work artifacts should be professional and audience-appropriate.
- **Why C:** A documentation style choice. Strong default that improves artifact quality, but
  not identity-defining if violated.

**D4. Reference-style links** · C

- **What it is:** Cross-file references use reference-style markdown links. Link definitions
  collected at file end after `---` separator.
- **Why C:** Pure formatting convention. Improves readability and maintainability but is a
  style choice.

**D5. No meta-project references in code** · C (strong convention)

- **What it is:** Task IDs, phase numbers, `.arc/` references never appear in production code.
  Meta-project info stays in `.arc/` docs.
- **Underlying principle:** Code explains itself independently of project management context.
- **Why C:** Good practice but enforcing it as non-negotiable would be excessive. More of a
  quality standard than an identity marker.

---

### Group E: Agent Interaction Model

**E1. Agent-agnostic design** · P

- **What it is:** ARC's methodology works with any AI agent. Core workflows don't assume a
  specific tool. Agent-specific files provide tool-specific guidance.
- **Why P:** The framework's value is the methodology, not coupling to one AI product. Agent
  lock-in would be a fundamental design failure.
- **Convention aspects:** Agent-specific file structure (CLAUDE.md, etc.), how agent-neutral
  abstractions are written in workflows.
- **PRD relevance:** Requirement 3. Agent landscape identified 5 safe and 5 unsafe assumptions
  to guide this.
- **Nuance:** Agent-agnostic doesn't mean universally compatible. Some agent types (factory-style)
  are philosophically misaligned; the framework acknowledges them without designing for them.

**E2. Verification protocol** · P

- **What it is:** Search/read before assuming. Never generate file paths, content, or
  implementation approaches from memory. Verify from source.
- **Why P:** "Wrong information is worse than no information." This is a core trust mechanism.
  Without it, AI agents hallucinate and compound errors. Fundamental to making directed
  collaboration reliable rather than fragile.

**E3. Stop on anomalies** · P

- **What it is:** Treat unexpected filesystem state as a stop signal. Don't silently "fix"
  discrepancies. Report and ask.
- **Why P:** Implements A2 (human oversight) for error conditions. Without this, agents make
  autonomous recovery decisions that may destroy human work.

**E4. Co-development model** · D

- **What it is:** Agent and human share the same filesystem, same real-time context. Human can
  interrupt, edit alongside, see agent work live. Currently: local CLI tooling with direct
  filesystem co-development.
- **Principle candidate:** "Developer and agent share context in real time" — the deeper
  principle underlying real-time collaboration.
- **Convention candidate:** "Local CLI with filesystem co-development" specifically.
- **Key question (PRD open question 5):** Is co-development a principle or a method? The deeper
  principle might be about shared context and real-time awareness, not the specific mechanism.
  Cloud agents share context differently; IDE agents share it through the editor.
- **Agent landscape context:** Cloud/remote agents (Codex, Jules, Warp Oz) manage their own
  branches asynchronously. IDE agents share context through the editor, not the filesystem.
  CLI agents share through the terminal + filesystem. The mechanism varies; the intent
  (shared awareness) may be the principle.

**E5. Session initialization ceremony** · C

- **What it is:** Structured context loading at session start — verify environment, read
  documents in order, confirm orientation.
- **Underlying principle:** A6 (context preservation). Agent needs full context to work
  effectively.
- **Why C:** The specific ceremony (which docs, in what order, confirmation format) is shaped
  by the CLI agent experience. IDE agents with persistent memory may need no ceremony; cloud
  agents loading context via API need a different one.

**E6. Session handoff protocol** · C

- **What it is:** Explicit state transfer at session end — commit complete work, document
  partial work, update CURRENT-SESSION.md.
- **Underlying principle:** A6 (context preservation).
- **Why C:** Same reasoning as E5. The principle is context recovery; the handoff ceremony is
  one mechanism.

---

### Summary

**Proposed principles (P): 12**

A1 (spec-driven), A2 (human oversight), A4 (quality gates), A5 (git-native), A6 (context
preservation), A7 (dual-audience docs), A8 (recursive improvement), B1 (task decomposition),
B2 (plan first), C1 (manual commit control), E1 (agent-agnostic), E2 (verification), E3 (stop
on anomalies)

**Proposed conventions (C): 14**

B4 (completion protocol), B5 (deferred review), C2 (conventional commits), C3 (context footer),
C5 (branch naming), C6 (branch/task coupling), D1 (document hierarchy), D2 (templates), D3
(collaborative voice), D4 (reference links), D5 (no meta-refs in code), E5 (session init
ceremony), E6 (session handoff ceremony), A4-impl (zero-tolerance specifics)

**Discussion needed (D): 4**

A3 (focused execution — scope of principle), B3 (mandatory review stop — principle or strong
default), C4 (atomic commits — depends on merge strategy), E4 (co-development — principle or
method)

### Key Discussion Threads for Task 2.2

1. **The enforcement question (A3 + B3):** The cognitive science supports a *principle* around
   focused execution, but the current *enforcement* (one checkbox + mandatory stop) may be
   method-level. Where does the principle end and the convention begin?

2. **The co-development question (E4):** Is "local CLI co-development" a principle or a method?
   Resolving this determines ARC's compatibility envelope with cloud, IDE, and factory-style
   agents. The deeper principle may be "shared real-time context" rather than the filesystem
   mechanism.

3. **The traceability question (C2 + C3 + C4):** Three audit dealbreakers live in this cluster.
   The principle is clearly "changes are traceable to their motivation." But the methods
   (conventional format, context footer, atomic commits) are the specific friction points.
   Squash merge complicates C4 further.

4. **Multi-agent positioning (A3 + E1 + E4):** ARC needs a clear, honest position on
   multi-agent orchestration. The attention research provides strong grounding. The framing
   should be: "ARC designs for the cognitive reality of novel knowledge work" — citing evidence,
   not asserting dogma. Acknowledge where orchestration provides value (bounded, well-defined
   tasks in structured domains) without pretending ARC is designed for that use case.

## Task 2.2 Classification Decisions

**Purpose:** Record the outcome of each classification discussion (Tasks 2.2.a–c). Each entry
captures the final tier, the principle statement (if applicable), convention details, and
rationale. These become the direct input to the ADR draft (Task 2.2.d).

**Format per entry:**

- **Decision:** Principle (tier 1) / Convention (tier 2) / Escape hatch (tier 3)
- **Principle statement:** One-sentence, citable formulation (if P, or the underlying P for C)
- **Convention details:** What the default is and what's configurable (if C)
- **Rationale:** Why this classification; key arguments that settled it
- **Consequences:** What this means for WU2-WU4 implementation
- **Catalog refs:** Which working catalog items this covers

---

### 2.2.a — Candidate Classifications

**Spec-driven development** · catalog: A1, B1, B2, D1

- **Decision:** Principle (tier 1)
- **Principle statement:** Development begins from explicit, written specifications that
  establish intent, scope, and success criteria before implementation. Planning before
  executing is integral — spec-driven thinking applies at every level, from project vision
  down to individual tasks.
- **Convention details:** The specific document hierarchy (META-PRD → PRD → task list),
  file naming, template formats, and constitutional document set are strong defaults — the
  assumed structure in absence of an alternative, not a mandatory layout. Task list format
  (markdown checkboxes) is convention.
- **Rationale:** Foundational — remove it and the entire structure collapses (without specs,
  ARC is just AI prompting with organized folders). But not ARC's *most distinctive*
  characteristic; many methodologies are spec-driven. What makes ARC recognizably different
  is the tight human-agent interaction loop (see next entry). Spec-driven development is the
  structural prerequisite that makes that loop possible. "Plan before executing" (B2) folded
  in — it's the same principle at task granularity.
- **Threshold note:** Not every action requires formal specification. The test is "does this
  need up-front planning?" Quick fixes (<5 min, clear scope) can rely on well-crafted git
  commits as the record. The principle is about preserving intent and context for work that
  warrants it — both as preservation prior to implementation (sessions get cut short) and as
  record of intent vs. outcome. ARC provides methods; teams decide how strictly to apply them.
  Drawing this line differently doesn't break the framework.
- **Consequences:** WU2 can make the document hierarchy configurable (adoption tiers offer
  lighter structures). Basic tier still requires *some* form of upfront specification — the
  tier distinction is about ceremony, not whether specs exist.

**Human-agent pairing / oversight** · catalog: A2, B3, B4, B5, C1, E2, E3

- **Decision:** Principle (tier 1) — ARC's most distinctive characteristic
- **Principle statement:** Humans and AI agents collaborate through tight, iterative feedback
  loops. Review happens at the micro level — during work, not after it. The human directs;
  the agent executes within bounded scope, reports back, and the cycle repeats. The human
  trusts the agent within each cycle but retains decision authority at cycle boundaries.
- **Convention details:** ARC's task list system provides the default structure for review
  boundaries (per-task checkbox or per-parent-task grouping). The specific tracking mechanism
  is convention; the review granularity principle is not. The completion protocol (quality
  check → mark complete → verify → report → stop) is the default ceremony — teams may
  adapt the steps while preserving the review-then-proceed pattern.
- **Rationale:** This is what makes ARC recognizably different from delegation-based
  approaches (Devin, Copilot Workspace, vibe coding). Not review-at-merge-time, but
  continuous iterative refinement at the micro level. Everything flows from the importance
  placed on recursive back-and-forth vs. delegation and autonomy.
- **Scope boundaries (from discussion):**
    - **Too narrow:** Per-edit/per-tool-call review. Counterproductive — destroys momentum,
      signals task scoping problems, not collaboration. Trust the agent within the cycle.
    - **Right range:** Per-task or per-task-grouping (parent task level). Small enough to
      maintain micro-level collaboration; large enough for productive autonomous execution.
    - **Too loose:** Per-phase or per-PR. At this level you've lost ARC's distinctive value
      — you're delegating, not collaborating. If you're regularly reviewing at phase level,
      your task scoping is likely wrong.
    - **Generalization need:** These boundaries are expressed in ARC's task list vocabulary
      (task, parent task, phase), but the principle must generalize for teams using
      alternative tracking. Working term: **"review increment"** — the bounded chunk of
      autonomous execution between human review points. ARC's principle: keep review
      increments small. (Terminology TBD — see note below.)
- **Folded in:**
    - **E2 (verification protocol):** Agent verifies from source, never assumes — an
      expression of the same "agent defers to human/reality" philosophy.
    - **E3 (stop on anomalies):** Agent flags unexpected state rather than making autonomous
      recovery decisions — same principle.
    - **C1 (manual commit control):** Human authorizes permanent state changes. The human's
      name is in the author field — professional ownership. The agent may execute the commit,
      but the human takes responsibility for it. The dev gets fired for mistakes, not the
      agent.
- **Consequences:** WU2 can make review granularity configurable (per-task default,
  per-parent-task as explicit option) while the principle stays non-negotiable: review
  happens at the micro level, not just at merge time. Deferred review (B5) already
  demonstrates this flexibility.

**Terminology note (open):** "Work unit" is established for the combined doc set (PRD + task
list + notes). The bounded autonomous execution chunk between reviews needs its own term.
Candidate: **review increment** — self-explanatory, generalizable, clearly distinct from
"work unit." To be finalized during ADR drafting.

**Minimal parallelism / focused execution** · catalog: A3

- **Decision:** Principle (tier 1) — separate from A2 but deeply linked
- **Principle statement:** ARC is built around focused, sequential work. This is a core
  operating principle, not a suggestion. The vast majority of work should follow this
  pattern; doing otherwise in most application domains produces worse results.
- **Convention details:** The specific enforcement (one checkbox + mandatory stop) is
  covered under A2's review increment mechanism. This principle provides the cognitive
  and philosophical justification for keeping those increments small and sequential.
- **Rationale — two pillars:**
    - **Pillar 1 — cognitive science:** Novel knowledge work has well-documented
      multitasking costs (70+ years of bottleneck evidence, 23-min interruption recovery,
      up to 40% productivity loss). AI-assisted development IS novel knowledge work.
      Exceptions exist (supertaskers at 2.5%, domain-structured multitasking like ATC) but
      don't generalize. ARC's design is the environmental structure that mitigates
      bottleneck costs — like ATC uses radar and separation standards.
    - **Pillar 2 — human-for-humans:** Software is overwhelmingly produced for human
      consumption. Deep human involvement isn't just quality control — it's quality *input*.
      Humans bring actual human perspective, taste, and judgment about what feels right.
      Fully delegated software optimizes for an AI's model of human needs, not actual human
      needs. Cultural parallel: near-universal rejection of AI-produced art, music, game
      assets — a visceral distinction between "stuff that's supposed to be human" and "stuff
      where it doesn't matter." Most software sits closer to the former than the industry
      currently admits. This argument is more durable than the cognitive one — it doesn't
      go away with better technology.
    - **Pillar 3 — complementary strengths amplified by frequency:** Human and agent bring
      fundamentally different capabilities. Humans: perspective, context, judgment, lived
      experience with the problem domain. Agents: breadth of knowledge, speed, tooling,
      pattern recognition across training data. Neither is sufficient alone — the output is
      more robust than either could achieve independently, and that robustness scales with
      interaction frequency. Each exchange is an opportunity for both parties to contribute
      what they're uniquely good at. Agents perform better with sharper context — frequent
      human input provides exactly that. Humans benefit from the agent's speed and breadth
      at each step. Lengthen the review increment and you underutilize *both* parties: the
      agent gets fewer course corrections and context injections; the human gets fewer
      chances to leverage the agent's capabilities. The human isn't an "overseer keeping the
      AI in check" — the human is a co-developer whose frequent input makes the agent
      better, and whose own work is made better by the agent's contributions.
- **Framing (between strong and moderate):** Not "you can't do different" but "this is a key
  operating principle built on the basis that focused work produces better results in most
  domains." We severely weaken our position with overly permissive language. But we don't
  claim multi-agent parallelism has zero value — bounded, deterministic domains will likely
  use it effectively. ARC's position: it's not optimized for that, and most software
  development isn't that.
- **What this does NOT mean:**
    - Multiple work units active on different branches (team-level) is fine
    - Sequential agent handoffs (Claude for design → Codex for implementation) are
      compatible — sequential, not parallel
    - Background agents on bounded tasks may work, but are outside ARC's designed
      operating mode — ARC doesn't design for supervising multiple agents simultaneously
- **Consequences:** WU2 should express this clearly in philosophy docs. The language should
  frame human involvement as a positive value proposition ("produces better results") not a
  defensive limitation ("your brain can't handle it"). Multi-agent orchestration acknowledged
  honestly — not dismissed, but clearly outside ARC's design center.

**Quality gates** · catalog: A4

- **Decision:** Principle (tier 1, narrowly scoped)
- **Principle statement:** Automated quality verification is a required step before work is
  considered complete. Quality is verified, not assumed.
- **Convention details:** Zero-tolerance policy (vs. severity levels or warning-level gates),
  specific tier definitions (Tier 1/2/3), specific tools (markdownlint, etc.), when gates
  run relative to the review cycle — all convention. The principle is that verification
  *happens*; how strictly and with what tools is configurable.
- **Rationale:** Quality gates are the feedback mechanism that makes directed collaboration
  reliable. Without them, agents can declare "done" with no verification and errors compound.
  The principle/convention boundary is sharp here: audit friction ("zero-tolerance with no
  severity levels") is clearly about the method, not the principle.
- **Leave it cleaner (related, convention):** The current protocol ("fix or document
  pre-existing issues") is convention. But the *capture* floor should be strong: at minimum,
  discovered issues must be documented (task inbox, backlog, as directed by user). Identifying
  an issue and dismissing it is a wasted opportunity — agents tend to treat off-task or
  cross-session findings as "not my changes" and irrelevant, but they're relevant to the
  *project* even when not relevant to the current task. The "stop and fix immediately"
  behavior is a personal/team convention; the "never let a finding vanish undocumented" part
  should be the convention's floor.
- **Consequences:** WU2 can make gate strictness configurable (zero-tolerance as default,
  severity-level approach as alternative) while keeping the principle non-negotiable. Tool
  choices are entirely project-specific.

**Session documentation / context preservation** · catalog: A6, E5, E6

- **Decision:** Principle (tier 1) — about recoverability with specific qualities, not
  ceremony
- **Principle statement:** Work context must be recoverable across session boundaries
  through structured, human-controlled, and transparent mechanisms. Knowledge gained during
  work — decisions, state, rationale — must not be lost when a session ends. The human
  controls what is preserved; the mechanism is predictable and inspectable.
- **Two types of context preservation (acknowledged separately):**
    - **Session-level:** What was I working on? Current state? What's next? Serves
      continuity across sessions. (ARC default: CURRENT-SESSION.md)
    - **Project-level:** What decisions were made? What patterns emerged? Why did we do X?
      Serves institutional memory and onboarding. (ARC default: ADRs, strategy docs, notes)
    - Both serve context preservation but with different purposes and mechanisms. Related
      through the shared principle; distinct in their individual function.
- **Principle-level criteria for the mechanism (not the mechanism itself):**
    - **Structured:** Consistent format — you know where to find things and what to expect
    - **Human-controlled:** The human decides what's preserved, can edit and curate. Not
      hands-free auto-memory where you don't control or fully understand what's stored
    - **Transparent:** Visible, inspectable, debuggable. When something goes wrong, you can
      see why and know what to fix
    - **Predictable:** Reliable recovery — not dependent on ambient tool features that may
      change or fail silently
- **Convention details:** CURRENT-SESSION.md (session-level mechanism), init/handoff
  ceremonies (shaped by CLI agent experience), specific document-reading protocol, handoff
  document structure — all convention. IDE agents with persistent memory may need less
  ceremony; cloud agents may need different mechanisms. But whatever mechanism is used must
  meet the principle-level criteria above.
- **What doesn't meet the bar:** Git commit history alone (unstructured for this purpose),
  PR descriptions alone (too coarse), opaque auto-memory systems (no manual control or
  transparency). These may supplement but don't substitute.
- **Rationale:** This is the "Recursive" in ARC. Without context preservation, each session
  starts from scratch and recursive feedback breaks. The value of manual control: when
  something goes wrong with hands-free memory, you don't know why or how to fix it.
  Structured manual control provides consistency, predictability, and debuggability.
- **Consequences:** WU2 can present CURRENT-SESSION.md + init/handoff as ARC's default
  method while acknowledging alternative mechanisms that meet the criteria. Basic adoption
  tier might use a lighter version of the ceremony but must still satisfy the principle-level
  criteria.

**Git-native workflows / traceability** · catalog: A5, C2, C3, C4, C5, C6

- **Decision:** Principle (tier 1) for traceability; convention for nearly all methods
- **Principle statement:** Work is traceable — changes link back to the intent that
  motivated them. Git serves as the canonical record of what was done, when, and why.
- **Git itself:** Assumed as the VCS for practical purposes (universal across all 17 agents
  surveyed, synonymous with version control in 2026). Non-git VCS is escape-hatch territory
  — the principle (version-controlled, traceable) still applies but specific tooling
  guidance won't cover it. Worth acknowledging, not worth designing for.
- **Convention details:**
    - **C2 — Conventional commit format:** Convention. Principle = "commits are
      communicative." Teams using Commitizen, gitmoji, plain English, etc. should be able
      to adopt ARC. Strong default, not a requirement.
    - **C3 — Context footer:** Convention. Principle = "commits reference their motivation."
      Footer format is one method; PR descriptions, branch naming, commit body conventions,
      or external tracker links all serve the same principle.
    - **C4 — Atomic commits:** Convention, tied to merge strategy. Principle = "changes are
      logically organized." With squash merge, the PR becomes the atomic unit, not the
      commit. Convention should accommodate both: "if commits survive merge, make them
      traceable. If you squash, the PR description carries traceability. Either way, the
      thread from change to intent must be followable."
    - **C5 — Branch naming:** Convention. Any consistent scheme works.
    - **C6 — Branch/task list coupling:** Not even a recommended default — artifact of solo
      dev workflow. Small teams wouldn't use this; it wouldn't make sense as convention.
      It's an option, nothing more. ARC shouldn't care about this coupling so long as
      traceability is maintained through other means.
    - **Platform assumptions** (GitHub Actions, `gh` CLI, PR workflows): Convention. Detail
      deferred to requirement 7 (external tool/platform compatibility) work.
- **Rationale:** All three audit dealbreakers live here (C2, C3, C4). The principle
  (traceability) is uncontroversial; friction is entirely in the methods. Agent landscape
  confirms git as universal handoff mechanism.
- **Consequences:** WU2 makes commit format, footer, and atomicity configurable. Merge
  strategy support (squash, rebase, merge commit) shifts the traceability carrier between
  commits and PRs — the principle holds either way. Hooks become configurable rather than
  enforcing a single method.

**Granular task tracking** · catalog: B1, B3, B4

- **Decision:** Principle (tier 1)
- **Principle statement:** Work is decomposed into explicit, trackable increments before
  execution. Progress is visible and verifiable — not implicit in code changes or assumed
  from activity. Planning leads execution at every level, never the reverse.
- **Upfront decomposition (principle-level):** Planning leads execution — the decomposition
  may be refined iteratively, but it always precedes the work it governs. You don't need
  every Phase 5 subtask decomposed when starting Phase 1, but when you start a specific
  task, that task and its context are planned. Retrofitting planning docs to match what was
  already done introduces drift and defeats the purpose — the plan is the guiding artifact,
  not a retrospective record. "Measure as many times as needed, cut once."
- **Convention details:** Markdown checkboxes in task list files (ARC's default). Teams using
  Jira, Linear, GitHub Issues can satisfy the principle through those tools. Task list file
  naming, formatting, and specific granularity guidelines ("break down if >3 files, >50
  lines") are convention. Agents can make maintaining parallel markdown + external tracker
  fairly trivial, but there's no mandate to do so.
- **Interaction with A6 (context preservation):** ARC's markdown task lists satisfy both
  tracking AND context preservation — version-controlled, structured, transparent,
  human-controlled. External trackers satisfy tracking but may not satisfy context
  preservation (opaque APIs, not in git, vendor lock-in). Worth flagging but not blocking
  — teams can make their own tradeoff here.
- **Rationale:** Operational bridge between spec-driven development (A1) and the review
  increment (A2). Specs define intent; tracking makes it executable and reviewable. Without
  explicit tracking, the human can't review what they can't see decomposed. Tracking
  granularity should roughly match review increment granularity. Agents need the
  decomposition as context to work effectively.
- **Consequences:** WU2 can support external trackers as alternative mechanisms while keeping
  ARC's markdown task lists as the default. The principle (explicit, trackable, upfront
  decomposition) is non-negotiable regardless of tool choice.

### 2.2.b — Multi-Agent and Autonomy Positioning

· catalog: A3, E1, E4 · research: `research-attention-single-tasking.md`,
`research-agent-landscape.md`

- **Position statement:** ARC is built for collaborative development — tight human-agent
  pairing where both parties contribute their distinct strengths through frequent
  interaction. This is a deliberate design choice grounded in cognitive science, the nature
  of software as a human-consumed artifact, and the observation that frequent exchange
  between complementary collaborators produces more robust results than either alone. ARC
  does not position against autonomous agents as a category. It positions for a specific
  collaboration model — and is honest about why.
- **Core reframe — "feature, not a bug":** The industry's default framing treats human
  attention as a bottleneck to route around. ARC's position: human attention being
  single-threaded is a feature, not a bug. It forces focus, ensures quality input at every
  step, and produces work that reflects genuine human judgment. Throughput alone is not the
  gold standard for most work.
- **Evidence basis (three pillars, from focused execution discussion):**
    1. **Cognitive reality:** Novel knowledge work has well-documented multitasking costs.
       ARC designs the environment to work with this rather than ignore it.
    2. **Human-for-humans:** Software is consumed by humans; deep human involvement is
       quality input, not just quality control.
    3. **Complementary strengths:** Frequent exchange maximizes leverage of both parties'
       distinct capabilities. Lengthen the cycle and you underutilize both.
- **Where orchestration provides legitimate value:** Bounded, deterministic domains
  (batch migrations, boilerplate, CI/CD automation, large-scale refactoring with known
  patterns). Triage and exploration (bounded autonomy for information gathering — ARC's
  own research sub-agent is this pattern). Parallel execution on truly independent,
  well-specified work (key qualifier: "well-specified" means someone did the spec-driven
  work first).
- **Framing approach — positive value, not comparative:** Don't frame as "us vs. them" or
  "ARC for important work, orchestration for boring work." Frame as: if disciplined
  collaboration, human judgment, and iterative refinement are what you value, ARC is
  designed for that — regardless of how other approaches develop. ARC's value proposition
  stands on its own merits. No future predictions about industry trajectory in the ADR —
  even if the industry goes the other direction, the human-centric elements make ARC
  compelling as an alternative depending on your values and needs.
- **Where ARC's model provides distinct value:** Novel/complex work with ambiguous or
  emergent requirements. Human-facing software where UX, taste, and judgment matter. Work
  requiring institutional context not fully captured in code. High-stakes decisions where
  error cost exceeds slowdown cost. Learning environments (human learning codebase, agent
  learning project context through interaction).
- **Sequential agent handoffs (compatible):** Using different agents for different phases
  (design → implementation → review) is sequential, not parallel. The human is the
  continuity thread with full attention on each phase. Fully compatible with ARC's
  principles — focused execution with multiple tools.
- **Tone check:** Cite evidence, don't assert dogma. The three pillars provide strong
  grounding without preachiness. Acknowledge orchestration's value honestly. Don't claim
  ARC is the only responsible approach — claim it's a deliberate choice with clear
  reasoning. ✅
- **Reference language (portfolio draft):** "A structured methodology for spec-driven
  development with AI agents, emphasizing disciplined collaboration over automation.
  Built on the premise that better outcomes come from deliberately coupling human judgment
  with agent capability, not separating them through delegation. Task execution is
  intentionally single-threaded — work scoped into discrete actions that are small enough
  to review meaningfully, with active, hands-on developer involvement creating a tight
  feedback loop that leverages complementary strengths, favoring iterative refinement and
  co-development over raw throughput."

### 2.2.c — Co-Development Model

· catalog: E4 · PRD open question 5

- **Decision:** Principle (the shared-context requirement); convention (the local CLI
  mechanism)
- **Principle statement:** Developer and agent operate in shared context with mutual
  visibility. The developer can see what the agent is doing, intervene at any point, and
  contribute directly to the same work artifacts. This is co-development, not delegation
  with review — the human is involved at the micro level, not only the macro.
- **Convention details:** Local CLI with filesystem access is ARC's primary design target
  and best-understood implementation. Strong default, not the only valid mechanism.
- **Compatibility envelope:**
    - **Within principle — CLI agents:** Claude Code, Aider, Codex CLI, Gemini CLI. Shared
      filesystem, real-time visibility, human can intervene. ARC's primary design target.
    - **Within principle — IDE agents:** Cursor, Windsurf, Antigravity. Shared context
      through the editor. Different mechanism, same mutual visibility. Compatible.
    - **Outside principle — async delegation agents:** Codex cloud, Jules, Warp Oz, Devin.
      Agent works in isolation; developer reviews output. No real-time shared context.
      This is delegation with review, not co-development. Not ARC's model.
- **The bookend pattern (acknowledged, not promoted):** ARC's planning output IS a quality
  dispatch specification; ARC's quality gates and traceability ARE a rigorous integration
  mechanism. Teams that delegate execution to autonomous agents for well-specified, bounded
  work are using ARC for planning and integration — but ARC's co-development loop doesn't
  govern the execution phase. That's the agent's operating model, not ARC's. ARC already
  uses this pattern internally (research sub-agents: bounded autonomy with clear spec,
  results reviewed and integrated). But this is an acknowledged pattern for bounded work,
  not the recommended primary workflow. If delegation becomes the default path, ARC's most
  distinctive value — the tight co-development loop, the complementary strengths — is lost.
  The bookends are valuable but they're not the full value proposition.
- **Reframe worth capturing:** "Co-developing rather than simply reviewing" — a lot of
  current industry discussion treats the human's role as big decisions + review to avoid
  slop. ARC's position: even if the developer isn't directly editing code, they're involved
  at the micro level, contributing context, judgment, and course correction at every review
  increment. The human is a co-developer, not a reviewer.
- **Rationale:** Shared context and mutual visibility are what enable the tight interaction
  loop (A2) and the complementary strengths pillar. If the agent works in an opaque sandbox
  and you only see output, you've lost collaboration — you're reviewing, not co-developing.
  The principle is about the quality of interaction, not the specific transport mechanism.
- **Consequences:** WU2 should be clear that ARC's co-development principle accommodates CLI
  and IDE agents. Async delegation agents are outside the design envelope — ARC doesn't
  forbid their use but doesn't provide methodology guidance for the execution phase. The
  default path must be strongly positioned: co-development is the norm, anything else is a
  departure from the system's core value proposition.

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

## Task 3.1 — Session Model Evaluation

**Core question (PRD Req 2):** Is the principle "sessions with explicit boundaries" or
"context must be recoverable"?

**Answer:** Both — at different levels. ADR-001 P5 already resolved that recoverability is
the principle and specific ceremonies are convention. Task 3.1 analysis adds a layer: the
*session concept itself* is principle-level, but for reasons deeper than context limits.

### Session as First-Class Concept (Principle-Level)

The session is the temporal container for focused work. It's a first-class concept in ARC,
not just a technical necessity forced by context limits.

**Three reasons sessions matter beyond context constraints:**

1. **Human attention is the binding constraint, not agent context.** P3 (focused execution)
   is about the human, not the agent. Even with infinite agent context, the human's effective
   engagement has limits. A session is the natural unit of sustained human focus.

2. **Sessions enforce methodology discipline.** Begin with context establishment, execute
   within scope, end with explicit state capture. This rhythm reinforces P1 (spec-driven),
   P7 (granular tracking), and P2 (tight feedback loop). Without session boundaries, work
   drifts toward open-ended accumulation.

3. **Sessions create natural review/commit points.** They force the question: "Is this work
   done? Is it committed? What's the state?" Without that boundary, the answer is always
   "in progress, kind of."

**What varies (convention-level):**

- **Why the session ends** — context limits (CLI), natural work boundary, human schedule,
  task completion (cloud/async)
- **How long it lasts** — governed by context quality guidance, human attention, work scope
- **What ceremonies bookend it** — init/handoff (convention, varies by agent type)

**What doesn't vary (principle-level):**

- Work happens in bounded, intentional periods with explicit start and end states
- Context quality is actively managed within the session (not just recovered at boundaries)
- The session reinforces focused execution — it's where P3, P5, and P2 converge in practice

### Context Quality Management — P5 Expansion

P5 as written focuses on recoverability at boundaries. Context degradation research
demonstrates that quality management *during* work is equally important:

- Performance degrades 13.9%–85% as context fills, even with perfect retrieval
- Effective capacity: 60–70% of advertised limits
- 75–80% utilization sweet spot for general agentic work, lower for complex reasoning
- Shorter windows with good compression outperform massive windows with naive accumulation
- Complex reasoning (which ARC work IS) degrades faster than simple retrieval

**Proposed P5 expansion:** Context must be recoverable across sessions (existing) AND
context quality must be actively managed within sessions (new). This doesn't change P5's
core statement — it acknowledges that preservation includes proactive management, not just
recovery at boundaries. Specific thresholds and monitoring mechanisms remain convention.

### Agent Spectrum — Session Concept Mapping

| Agent Type                                      | Session concept                      | ARC session maps naturally?                  |
|-------------------------------------------------|--------------------------------------|----------------------------------------------|
| CLI (Claude Code, Aider, Codex CLI, Gemini CLI) | Conversation: launch → work → exit   | Yes — ARC's primary design target            |
| IDE (Cursor, Windsurf, Copilot)                 | Thread within IDE, soft boundaries   | Yes with lighter ceremony                    |
| IDE + memory (Augment Code)                     | Blurry — memories persist            | Session still valuable for focus discipline  |
| Cloud/async (Jules, Codex cloud, Warp Oz)       | Task execution: dispatch → deliver   | Session = task; inherent boundaries          |
| Auto-compaction (Amazon Q, Claude Code)         | Extended via mid-session compression | Compaction is a mini-boundary within session |

**Key observation:** CLI/terminal model is where sustained, methodology-driven development
workflows live. IDE agents are growing but augment editor workflows. Cloud/async agents are
task dispatchers. ARC's session model maps most naturally to the CLI model, which is the
leading model for the kind of work ARC is designed for.

### WU2 Scope Implications

Since the session *concept* is principle but *ceremonies* are convention:

- **Reframe session docs** as ARC's default method for CLI/IDE agents, not the only way
- **Soften session language** in framework docs from "conversation with start/end" to
  "bounded work period with context management"
- **Make ceremonies configurable** — lighter init for IDE agents, different handoff for
  cloud/async
- **Add context quality guidance** as principle-level ("monitor and manage context quality")
- **Keep threshold specifics** as convention-level (75–80%, specific monitoring protocols)

### ADR Consolidation Decision

Tasks 3.1 and 3.2 will produce a single combined ADR-002 (session model + agent
compatibility). Rationale: the session model IS the deepest agent-agnosticism question;
both tasks share the same evidence base and produce WU2 implications for the same docs.
Task 3.2's workflow assumption mapping is the supporting analysis. One coherent document
avoids repetitive context and awkward cross-references between two thin ADRs.

## Task 3.2 — Agent-Agnosticism Assessment

### Workflow Assumption Classifications

All seven assumptions evaluated are **incidental** (shaped by Claude Code experience), each
tracing back to a load-bearing principle already captured in ADR-001:

| Assumption                  | Classification     | Load-bearing principle behind it |
| --------------------------- | ------------------ | -------------------------------- |
| Conversational interaction  | Incidental         | P2 (iterative feedback)          |
| Context window loading      | Incidental         | P5 (context preservation)        |
| Turn-based execution        | Incidental         | P2 (review at increments)        |
| Terminal co-development     | Incidental         | P11 (shared context)             |
| Local filesystem access     | Mostly incidental* | P11 + P5 (shared artifacts)      |
| Slash commands / invocation | Incidental         | Reusable workflows               |
| Deferred review protocol    | Convention         | P2 (review flexibility)          |

*\*Local filesystem access has a nuance: CURRENT-SESSION.md as a shared artifact between
human and agent depends on filesystem co-location. Cloud agents with their own repo clone
don't share this artifact during execution — only at the git level. This is another
expression of P11's co-development envelope: CLI/IDE agents share it natively, cloud/async
agents don't.*

### What's Actually Load-Bearing

1. Agent has project context before working (P5) — method varies
2. Agent and human share context with mutual visibility (P11) — mechanism varies
3. Review happens at meaningful increment boundaries (P2) — interaction model varies
4. Agent can read and modify work artifacts — access mechanism varies
5. Human can intervene during work, not just at completion (P2 + P11)
6. Predefined workflows exist and are triggerable — invocation mechanism varies

### Natural Fit Spectrum (Discussed)

**"All seven incidental" is a strength** — ARC's methodology is genuinely agent-agnostic
at the principle level, with adaptation needed only at ceremony/mechanism level.

**But honest about natural fit:** CLI conversational agents (Claude Code, Codex CLI, Gemini
CLI, Aider) are what ARC has in mind and where it shines. IDE conversational agents (Cursor,
Windsurf, Copilot) are roughly equivalent — so long as you follow a session structure, the
co-development loop functions. Better to be excellent for a clear subset than mediocre
across all.

**Cloud/async agents are "off-label use":** ARC can function at the boundaries (planning
output serves as dispatch spec; quality gates and traceability serve as integration
mechanism — the "bookend pattern" from ADR-001). But the core value proposition — iterative
co-development with frequent micro review and input — is lost during the execution phase.
Not forbidden, but explicitly an exception for certain kinds of bounded work, not the
expected norm. ARC assumes this is an occasional complement, not typical core workflow. It's
antithetical to ARC's design center, even if there are legitimate use cases.

### Agent-Specific File Structure Assessment

The hub-spoke pattern (AGENTS.md as entry point, agent files for truly unique guidance) is
**sound and well-designed**. The README nails the intent.

**Internal CLAUDE.md observation:** Thickest agent file because it carries both genuinely
Claude-specific content (context thresholds, sub-agents) and ARC methodology restated for
Claude context (session init, deferred review). The latter arguably belongs in shared docs
but serves as focused agent-level reminders — reasonable tradeoff for the only battle-tested
agent file.

**WARP.md staleness:** Contains Docker-focused workflow references from earlier project
state. Flag for WU2 cleanup — minor, incidental to this analysis.

### WU2 Scope Implications (Agent-Agnosticism)

- Workflow docs should express the *what* (agent needs context, review happens at
  increments, workflows are triggerable) without over-prescribing the *how*
- Session init/handoff ceremonies: configurable weight (full for CLI, lighter for IDE,
  task-spec-based for cloud)
- Agent-specific file templates: keep hub-spoke pattern, ensure supplements contain truly
  agent-specific content only
- WARP.md: refresh to remove stale Docker references
- Explicitly frame CLI conversational agents as ARC's primary design target, IDE agents as
  compatible, cloud/async as off-label for bounded use

## Forward-Looking: Terminology and Branding

**Context:** Emerged during ADR-002 review. ARC's key concepts — session, review increment,
work unit — would benefit from deliberate terminology design. Memorable, branded terms
reinforce concepts through repeated use and help adopters build shared vocabulary.

**Examples of existing terminology that works:**

- "ARC session initialized" (session-init confirmation) — already reinforces the session concept
- "Work unit" (combined doc set: PRD + task list + notes) — established in ADR-001
- "Review increment" (bounded autonomous execution chunk) — proposed in ADR-001, not yet tested

**Opportunity:** Consider a terminology pass during strategy document synthesis (Requirement
10) or WU4 (public-facing docs). Not about inventing jargon — about ensuring the terms ARC
uses are consistent, intuitive, and recognizable. The session concept formalized in ADR-002
is a good candidate: "ARC session" as a defined term with specific meaning.

**Not an ADR-002 concern** — captured here for the strategy/WU4 phase.

---
