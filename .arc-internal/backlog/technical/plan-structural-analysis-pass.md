# Plan: Structural Analysis Pass

**Roadmap Reference:** Phase B.3 — Structural analysis pass
**Predecessor:** `tasks-content-refinement-pass.md` (B.2 — content is now clean; evaluate structure)
**Related:** `feature/plan-distribution-and-update-system.md` (structural decisions feed the manifest/update system)

**Purpose:** Audit all `.arc/` files for structural soundness and distribution readiness. Classify files,
identify mixed-concern interleaving, map cross-cutting concept dependencies, and propose section-level
separation to minimize merge conflicts during updates. Results become a focused PRD + task list for the
B.4 structural optimization work.

---

## Observations from B.2 Refinement Pass

Gathered during Phases 1-5 of `tasks-content-refinement-pass.md`. Organized by concern area.

### File-Level Mixed Concerns

Files containing multiple distinct topics that may benefit from separation.

**DEVELOPMENT-RULES.example.md** — ARC-opinionated operational content (session management, verification
protocol, core document reference protocol) mixed with genuinely project-constitutional content (quality
gates, code quality principles, architecture rules, commit standards). Some sections may be better served
closer to workflows or as separate concerns. Key question: what in DEVELOPMENT-RULES is framework
methodology vs. what is the adopter's project constitution?

**strategy-work-organization.md** — Covers 5 distinct concerns in one file: work categorization, git
workflow (branching model), directory structure, incidental work model, and backlog organization.

- Backlog Organization (~55 lines after B.2 trimming) is essentially a separate strategy embedded in
  the doc — candidate for extraction.
- Incidental Work Model (~85 lines) straddles strategy and workflow territory.

### Directory-Level Mixed Concerns

**`.arc/reference/` mixes documentation with infrastructure.** Constitution, workflows, and strategies
are project reference material. Githooks, agent configs, and future additions (commands/, source-of-truth
mechanisms) are tooling ARC provides. These are different concerns — infrastructure is operational tooling,
not reference documentation. Candidate for top-level separation (e.g., `.arc/infrastructure/`), but
balance against directory bloat and adoption complexity.

### Cross-Cutting Concept Management

**Slash command content duplication.** `.claude/commands/`, `.codex/prompts/`, `.gemini/commands/` contain
duplicated content across agent-specific directories. Needs single source of truth + generation script.
Natural fit for the distribution CLI. Source could live in `.arc/` (commands/ or infrastructure/commands/).

**Version footers.** Being removed during B.2 — the update system will handle versioning via manifest.
Structural pass should verify all version footers are gone and that no versioning mechanism is needed
in-file.

**`.example.md` naming convention.** Files are evolving from "filled-in examples" (old CineXplorer content)
to "templates with guidance scaffolding" (structure + guidance + tokens). `.template.md` may be more
accurate. Separately-provided filled-in examples (in package/docs, not install directory) could help
adopters see what a mature document looks like. (Also captured in BACKLOG-TECHNICAL.md.)

### Metadata and Convention Inconsistencies

**Header metadata convention gap.** PRDs and task lists have a consistent header metadata pattern
(Created, Updated, Status, Branch, etc.). Workflow and strategy docs lack any equivalent convention.
Inconsistency to evaluate — does a convention add value here, or is it unnecessary ceremony?

**Footer vs. header versioning.** Workflow docs historically used footer-style version stamps while
PRDs/task lists use header metadata. Moot once version footers are fully removed, but the structural
pass should establish whether any per-file metadata convention replaces them (likely: manifest handles
this externally).

### Workflow Coverage Gaps

**ROADMAP.md not covered by `0_define-constitution.md`.** The define-constitution workflow only covers
PROJECT-STATUS setup. ROADMAP is a planning artifact that currently has no creation workflow. Needs
either a broader "project bootstrap" workflow or explicit coverage in define-constitution.

**Working directory context management.** Currently addressed in session-handoff.md, but may belong
in CURRENT-SESSION template guidance instead — the template is where adopters set up their working
context, not the handoff workflow.

### Adoption and Onboarding Gaps

**File placement and loading model.** ARC manages agent config loading via session-init rather than
relying on tool auto-discovery. This is documented in `agent/README.md` but not in any onboarding
material. First-time adopters need to understand this design choice.

**Audience indicator convention.** Deferred from B.2 Task 1.1 — some documents serve dual audiences
(human contributors + AI agents). A lightweight convention for indicating primary audience could help
adopters understand which docs to customize vs. which to leave as-is. Structural concern, not content.

---

## Roadmap B.3 Scope (from ROADMAP.md)

For reference — the roadmap defines B.3 as:

- File classification inventory (framework / configurable / scaffolded / project-owned)
- Identify mixed-concern files (stable vs configurable content interleaving)
- Cross-cutting concept dependency mapping
- Propose section-level separation to minimize merge conflicts
- Results become a focused PRD + task list for restructuring work

The observations above feed into this scope. Some observations (workflow coverage gaps, onboarding gaps)
may fall outside pure structural analysis but should inform the work or be explicitly deferred.

---

## Open Questions

Questions to resolve during planning, before this becomes a PRD:

1. **Scope boundary:** Should B.3 strictly cover distribution-readiness structure, or also address
   broader structural concerns (workflow gaps, convention inconsistencies) discovered during B.2?
2. **DEVELOPMENT-RULES split:** How aggressively to separate framework methodology from project
   constitution? This is the highest-impact structural decision.
3. **Directory restructuring appetite:** Is `.arc/infrastructure/` (or similar) worth the adoption
   complexity, or should infrastructure stay in `reference/` with clear naming?
4. **Naming convention timing:** Should `.example.md` → `.template.md` rename happen during structural
   optimization (B.4), or is it a distribution CLI concern (Phase C)?

---

**Created:** 2026-02-19
**Status:** Pre-planning — observations gathered, ready to evolve into PRD
