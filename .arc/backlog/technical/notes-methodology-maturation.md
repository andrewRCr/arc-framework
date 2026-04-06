# Notes: Methodology Maturation

Implementation reference extracted from the plan document. Research findings, pre-PRD analysis
data, and design context that will be useful during task generation and execution.

---

## Research Findings

### Harness Engineering (Fowler, 2025)

**Source:** [martinfowler.com/articles/harness-engineering.html][harness-engineering]

**Core concept:** "Agent = Model + Harness." Harness engineering builds confidence in AI coding agents
through systems and controls around the model — preventative controls (**guides**, feedforward) and
observational controls (**sensors**, feedback).

**Mapping to ARC:**

| ARC Component                                           | Harness Term               | Direction                          |
|---------------------------------------------------------|----------------------------|------------------------------------|
| Spec-driven development, bounded tasks, context loading | Guides                     | Feedforward (steers before acting) |
| Review increments, quality gates, traceability          | Sensors                    | Feedback (observes after acting)   |
| Session continuity, context preservation                | Harness architecture       | State management                   |
| Human review at increment boundaries                    | Human-in-the-loop steering | Harness improvement                |

**Key positioning insight:** ARC operates one level above model-level harness. Agent platforms provide
model-level controls (tests, linters, architectural checks). ARC provides process-level controls — how
work flows between human and agent, how context is preserved, how the harness itself improves. They
compose: use your agent platform's harness for code quality, use ARC's harness for collaboration
quality.

**Human-side implication:** The harness engineering model naturally highlights ARC's gap. Sensors
(mandatory stops, quality gates) exist, but sensors need an interpreter. ARC specifies the sensor
without articulating what effective human interpretation looks like at review increments. The
methodology boundary work should address this — the human's interpretive role is methodology, not
implementation.

**Terminology to adopt:**

- "Feedforward" for ARC's specification and context-loading patterns — these steer agent behavior
  _before_ it acts, not just evaluate it after
- "Harness" as a framing for what ARC provides — not a prompt template, not a wrapper, but a
  structured system of controls around the collaboration
- "Process-level harness" to distinguish from model-level agent tooling

### Documentation Architecture (Diátaxis + Framework Patterns)

**Diátaxis framework (Procida)** taxonomizes documentation into four types: Tutorials
(learning-oriented), How-to Guides (task-oriented), Reference (information-oriented), and
Explanation (understanding-oriented). Crossing or blurring type boundaries is "at the heart of a
vast number of problems in documentation."

ARC's strategy docs currently mix Reference (operational facts consumed by workflows — task list
format, tier definitions, branching rules) with Explanation (rationale, evidence bases,
philosophical foundations). Diátaxis strongly advocates separating these — they serve different
audiences, update at different frequencies, and have different distribution needs.

**Framework distribution patterns:** Established frameworks consistently externalize Explanation while
shipping Reference. Rails ships code configuration (structured, diffable), not methodology prose.
Kubernetes ships versioned reference docs but externalizes design rationale and conceptual guides. SAFe
and Scrum centralize methodology docs at canonical URLs rather than bundling them in every adopter's
implementation. No major framework ships explanatory "why" content alongside operational tooling in a
way that requires merge on update.

**Three-way merge for prose:** Universally recognized as a pain point. Git's merge is designed for code
(structured, deterministic), not documentation (prose, fragile).

**Key finding for ARC:** The merge burden problem has two solutions that compose: (1) fix the CLI to
wholesale-replace Framework files (eliminates the mechanical problem), and (2) separate Reference from
Explanation using the Diátaxis taxonomy (eliminates the conceptual problem). The CLI fix resolves the
urgency; the taxonomy refinement improves clarity regardless.

**Sources:** Diátaxis framework (diataxis.fr), CLI design guidelines (clig.dev), Kubernetes
documentation versioning, GitHub content model documentation, Rails update patterns.

### Methodology Floor Analysis

Conducted during ARC Operating Modes planning (2026-04-06). Full analysis in the operating modes plan
doc (`plan-arc-modes.md`); key findings:

- All 11 principles (P1-P11) are clearly methodology — tool-independent
- The `arc-methods.md` contract/default pattern is already a near-perfect methodology/implementation
  separator (contracts ≈ methodology, defaults ≈ implementation)
- 10 grey areas identified (enumerated in PRD Req 5)
- The philosophy strategy doc already has principle/convention splits for each P-item — the gap is in
  articulating the methodology layer as a cohesive whole, not in identifying individual boundaries

### Human Co-Development Gap Analysis

**Current state:**

- P2 and P11 articulate the principle: human as co-developer, shared context, mutual visibility
- The process-task-loop (agent-facing) is ~260 lines of detailed protocol
- The human's role appears only as: recipient of completion reports, source of approval/denial
- "Implied permission" is the only operational guidance about how the human responds — and it codifies
  passive behavior
- arc-task-audit exists as a human-invocable pre-implementation tool but is invisible from ARC's
  methodology docs (documentation island)

**Key insight:** ARC specifies feedback sensors (mandatory stops) without articulating what effective
human engagement looks like at those moments. The methodology describes _that_ the human should be a
co-developer but not _what the practice looks like_. This is a methodology gap — applies regardless of
tooling.

**Design constraint:** The human co-development posture must be descriptive ("this is what doing ARC
looks like") not prescriptive ("monitor yourself against this checklist"). Treat practitioners as
responsible engineers. Avoid paternalistic framing.

---

## Pre-PRD Analysis Data

### Strategy Doc Operational Dependency Mapping

Strategy docs by workflow/constitution reference count and operational role:

**Heavily workflow-referenced (operational reference, stays in install):**

| Strategy doc                          | Lines | Referenced from                                                                         |
|---------------------------------------|-------|-----------------------------------------------------------------------------------------|
| strategy-task-list-formatting         | 1,020 | generate-tasks, manage-incidental-work, integrate-work-unit, verify-work-unit           |
| strategy-work-organization            | 757   | process-task-loop, create-prd, activate-work-unit, integrate-work-unit, prepare-commits |
| strategy-configurability-architecture | 710   | arc-methods, arc-extensions, initial-setup, prepare-commits, rotate-branch              |
| strategy-team-coordination            | 395   | session-init, process-task-loop, session-handoff, activate-work-unit                    |
| strategy-context-loading              | 267   | arc-methods, DEV-RULES.ARC                                                              |
| strategy-quality-gates                | 243   | generate-tasks, process-task-loop, verify-work-unit, rotate-branch                      |
| strategy-work-planning                | 232   | create-prd, activate-planning-branch                                                    |

**Lightly referenced (evaluate content split):**

| Strategy doc                | Lines | Referenced from                        | Nature of reference            |
|-----------------------------|-------|----------------------------------------|--------------------------------|
| strategy-core-philosophy    | 466   | DEV-RULES.ARC (link for P-definitions) | Understanding, not operational |
| strategy-adr-methodology    | 356   | DEV-RULES.PROJECT (link)               | Guidance when writing ADRs     |
| strategy-session-management | 211   | session-loop, DEV-RULES.ARC            | Evidence base and thresholds   |

**Not workflow-referenced (strongest docs-site candidates):**

| Strategy doc                  | Lines | Notes                                          |
|-------------------------------|-------|------------------------------------------------|
| strategy-file-classification  | 382   | Reference taxonomy; file inventory is dev-only |
| strategy-agent-hooks          | 216   | Guidance for hook design                       |
| strategy-backlog-organization | 96    | Arc-in-git reference only                      |

Even heavily-referenced docs may contain explanatory sections that could extract to docs site while
operational content stays. The workflow reference anchors specific _sections_, not entire files.

Strategy docs are already on-demand, never loaded at session-init. With the CLI wholesale-replace fix,
there is no merge burden regardless of placement.

### Session-Init Context Baseline

Documents loaded at session init (~1,061 lines total):

| Document                  | Lines |
|---------------------------|-------|
| AGENT-BRIEFING.ARC.md     | 56    |
| AGENT-BRIEFING.PROJECT.md | 47    |
| CLAUDE.ARC.md             | 39    |
| DEV-RULES.ARC.md          | 357   |
| DEV-RULES.PROJECT.md      | 182   |
| STRATEGY-INDEX.md         | 84    |
| QUICK-REFERENCE.md        | 296   |

No strategy docs are loaded at session init. Only the STRATEGY-INDEX (84 lines) is loaded as an index.

### CLI Update Behavior — Current Implementation

**Key files:**

- `packages/arc-framework/src/lib/classification.ts` — File classification (Framework, Configurable,
  Scaffolded). Framework is the default for anything not in the Scaffolded or Configurable sets.
- `packages/arc-framework/src/lib/manifest/merge.ts` — Three-way merge with fast paths. The fast path
  `base === current` (no adopter changes) returns updated content directly — effectively wholesale
  replacement when adopters haven't modified the file.
- `packages/arc-framework/src/lib/manifest/apply.ts` — `applyChangePlan()` processes ALL non-scaffolded
  files through `mergeFileContents()` with no distinction between Framework and Configurable.

**The fix:** In `applyChangePlan()`, check `classifyFile(entry.templateFile)` before merging. If
Framework → write updated content directly (same as the "file missing from disk" path). If
Configurable → three-way merge as today. This eliminates merge conflicts for all 56 Framework files.

The existing fast path already handles the common case (adopter hasn't modified Framework files), so
the behavioral change only affects the uncommon case where an adopter has modified a Framework file —
which the classification says they shouldn't have.

### Install Root Surface Area

**Current `.arc/` root (6 items):**

```text
README.md  active/  backlog/  reference/  system/  user/
```

**Proposed (5 items, README removed):**

```text
active/  backlog/  reference/  system/  user/
```

**README content disposition:**

- Getting Started → docs site `getting-started.md` (already covered)
- Directory Structure → AGENT-BRIEFING.ARC.md has simpler version; docs site covers this
- Update behavior / File classifications → docs site `updating.md` (already covered)
- **Document Audiences table** → unique content, must extract to docs site before removal
  (four-audience taxonomy: agent-executed, collaborative, shared context, human-facing; plus
  explanation of audience headers in workflows)

**`user/` directory placement (ADR-012 context):**

- Currently at root per ADR-012 (unified user directory model)
- `system/` is described as "agent-facing operational files" — `user/` is a human personal workspace
  (ADR-012: "freeform personal workspace — scratch notes, reference links, investigation logs")
- Git notes refs (`refs/notes/arc/user/{identity}`) are path-independent
- CLI path construction is localized: `join(cwd, ".arc", "user", identity)` in `commands/user.ts`
- 141 occurrences of `user/` across 35 `.arc/` docs would need path updates if moved
- Leaning toward keeping at root; revisit if `system/` rename resolves semantic mismatch

---

## Skill Design Context

### Existing ARC Skills

arc-resume, arc-handoff, arc-commit, arc-task-audit, arc-verify

### Pipeline Coverage (with candidates)

| Pipeline stage             | Skill              | Human need                                |
|----------------------------|--------------------|-------------------------------------------|
| Idea → plan doc            | arc-plan           | Collaborative exploration setup           |
| Plan → PRD transition      | arc-plan-audit     | Is this plan ready for PRD?               |
| Task list → execution      | arc-task-audit     | Are these tasks ready for implementation? |
| Mandatory stop (execution) | arc-review         | Structured info for human judgment        |
| Session boundaries         | arc-resume/handoff | Context preservation                      |
| Commit                     | arc-commit         | Structured commit workflow                |
| Installation health        | arc-verify         | Validate ARC setup                        |

### arc-review Design Notes

Surfaces structured information for independent human judgment at the mandatory stop. Not the agent's
narrative (that's the completion report) — the raw material the human needs to form their own view:

- Where the implementation diverged from the task spec
- Files modified not mentioned in the task description
- Points where the task was ambiguous and the agent chose an interpretation
- Judgment calls the agent made

Does NOT present the diff (the user has the code open in their editor). Invoked at user discretion,
not every mandatory stop.

### arc-plan Design Notes

Collaborative exploration setup for the idea → plan doc transition. Unlike typical agent "plan modes"
(agent produces plan, human approves), this helps the human formulate and explore _with_ the agent:

1. Context gathering — reads roadmap, relevant backlog items, prior upstream work, relevant codebase
   state. The part that's genuinely tedious for a human to assemble manually.
2. Framing questions — orienting questions that help the human articulate what's in their head. Not a
   discovery checklist (that exists for PRDs), but exploration-level prompts.
3. Then freeform — the conversation happens naturally. No more structure needed.
4. Convergence signal — when the exploration has produced enough shape, helps transition to writing the
   plan doc.

Probably a skill triggering a short workflow (same pattern as arc-commit → prepare-commits.md).

### arc-plan-audit Design Notes

Pre-PRD readiness assessment for plan documents. Gates the transition from exploration to the
create-prd workflow. Different concern surface from arc-task-audit (post-task-generation,
pre-implementation, codebase-grounded); this is post-exploration, pre-PRD, requirements-grounded:

- Unresolved decisions — alternatives mentioned but no choice made
- Assumption inventory — what's taken as given that hasn't been validated
- Specificity gaps — areas where the PRD will need concrete details the plan doesn't provide
- Scope coherence — does everything serve one coherent purpose
- Downstream readiness — does the plan provide what the PRD template actually needs
- Staleness — plan references states or conditions that may have changed

---

## Backlog Items Resolved

- **ATOMIC-INBOX: Internal path/reference audit** — Fully resolved by sync audit (PRD Req 1)
- **BACKLOG-TECHNICAL: Methodology Update Dependency Checklist / Guard** — Resolved by dev safeguard
  (PRD Reqs 2-3)
- **BACKLOG-TECHNICAL: Methodology Specification Layer** — Resolved by methodology boundary definition
  (PRD Reqs 4-6)

---

[harness-engineering]: https://martinfowler.com/articles/harness-engineering.html
