# Plan: Core Philosophy & Configurability Architecture (WU1)

**Purpose:** Make all design decisions that downstream work units depend on.
No implementation — strictly decide and document.

**Status:** Draft
**Created:** 2026-02-22

---

## Scope

Define what ARC IS at the philosophical level, then design the architecture
that makes ARC configurable, extensible, and adoptable by teams of any size.
Every design question here has downstream dependents — WU2 (methodology
completion), WU3 (CLI), and WU4 (public release) all reference WU1 outputs.

**This work unit is design-only.** It produces ADRs and strategy documents.
It does not edit existing workflows, update hooks, or fix audit findings.
That is WU2's scope.

## Inputs

**Primary source material:**

- Configurability architecture section of `plan-arc-methodology-gaps.md`
  (core philosophy articulation, three-layer flexibility model, external
  tool compatibility, A+B hybrid approach decision, research findings)
- Session model evaluation item from `plan-arc-methodology-gaps.md`
- Agent-agnosticism audit item from `plan-arc-methodology-gaps.md`
- Progressive adoption path item from `plan-arc-methodology-gaps.md`
- Cross-cutting framework concepts section of
  `plan-distribution-and-update-system.md` (load-bearing opinions,
  agent-driven consistency audit)
- `arc-config.yml` notes from `plan-distribution-and-update-system.md`

**Findings that inform decisions:**

- `temp-audit-adopter-experience.md` — 3 dealbreakers (commit format,
  context footer, squash merge) and 7 significant friction points all
  inform what must be configurable. The principle-vs-method analysis
  throughout provides the analytical lens.
- `temp-audit-multi-branch-team.md` — team workflow gaps inform the
  team mode design and workflow adaptation model.

## Design Questions (ADR Inventory)

Each design question is resolved through discussion, iteration, and
documented as an ADR. Some may merge during work if tightly coupled.

### ADR 1: Core Identity / Non-Negotiables

**Question:** What IS ARC? What principles are non-negotiable (defining
ARC's identity) vs. what are methods (configurable implementations of
those principles)?

**Starting position:** Candidate non-negotiables from methodology-gaps
plan: spec-driven development, granular task tracking, human-agent pairing,
minimal parallelism by design, quality gates, session documentation for
context preservation, git-native workflows.

**Key tensions:** Each candidate needs scrutiny. "Minimal parallelism" is
philosophically clear but may alienate teams that want selective autonomy.
"Git-native" may conflict with teams using other VCS. The principle/method
boundary for each needs to be sharp — the audits showed that blurring this
line is the root cause of most adoption friction.

### ADR 2: Session Model

**Question:** Is the session model (CURRENT-SESSION.md, session-init,
session-handoff) a principle or a method?

**Starting position:** Audit 1 (S4) identifies this as significant
friction. Methodology-gaps plan asks the right questions: is the explicit
session boundary a principle, or is the principle just "context must be
recoverable"? IDE agents with persistent memory may not need explicit
handoffs.

**Downstream impact:** If sessions are a method, WU2 needs to make session
workflows configurable/optional. If they're a principle, WU2 just needs to
clean up the framing. Significant scope difference.

### ADR 3: Agent-Agnosticism Assessment

**Question:** Which ARC workflow assumptions are genuinely agent-agnostic
vs. shaped by the Claude Code experience?

**Starting position:** Methodology-gaps plan identifies specific
assumptions: conversational agent, context window loading, turn-based
interaction, terminal-based co-development, slash commands, deferred
review. These may not translate to IDE-integrated or non-conversational
agents.

**Key constraint:** The goal isn't to make every workflow work for every
agent type — it's to identify which assumptions are load-bearing vs.
incidental, so the configurability architecture can accommodate variation
where it matters.

### ADR 4: Configurability Architecture

**Question:** What goes in `arc-config.yml`? What categories of settings?
What format constraints? What's the schema?

**Starting position:** A+B hybrid approach decided (expanded config +
workflow extension points). Research validated three-tier configurability
(non-negotiable, convention, escape hatch). Current config has 2 settings
(`base_branch`, `branch_protection`). Audit 1 identifies priority
additions: commit format, context footer, merge strategy, hook toggles.

**Key constraints:** Shell-parseable (hooks read it without a YAML
library). Flat key-value or shallow nesting. Must support the
principle/method distinction — config options exist only for methods, never
for principles.

**Relationship to ADR 1:** The non-negotiables definition directly
constrains what CAN appear in config. These two ADRs are tightly coupled.

### ADR 5: Extension Point Conventions

**Question:** How do extension points work in prose workflows? What's the
format, the contract, the placement conventions?

**Starting position:** Research recommended "insert your steps here"
markers in workflow docs — self-documenting, no tooling required, agents
and humans both understand them. Contract matters more than mechanism.

**Key design tension:** Extension points need to be visible enough that
adopters know they exist, but unobtrusive enough that workflows remain
readable for teams that don't use them.

**Relationship to ADR 4:** Extension points and config switches are
complementary mechanisms. Config switches toggle behavior; extension points
add behavior. The design should make clear when each is appropriate.

### ADR 6: Progressive Adoption Tiers

**Question:** What's in "basic" ARC vs. "full" ARC?

**Starting position:** Two tiers (decided during planning discussion).
Basic gets you the methodology and value without all ceremony. Full is
the complete system. Specifics TBD.

**Key design question:** Is this a structural difference (different files
installed, different workflows active) or a documentation/framing
difference (same files, but docs site guides you on what to start with)?
Or a config-driven difference (`adoption_tier: basic` changes which
workflow steps apply)?

**Downstream impact:** If structural, affects WU3 (CLI init options).
If documentation, affects WU4 (docs site content). If config-driven,
affects WU2 (workflow conditional behavior).

### ADR 7: External Tool Compatibility

**Question:** How does ARC coexist with external trackers (Jira, Linear,
GitHub Issues)? What changes in workflows and hooks?

**Starting position:** Methodology-gaps plan has a detailed design:
workflows reference the practice not the tool, extension points at tool
boundaries, config declares tool choices, ARC built-in methods remain
first-class, no bidirectional sync.

**Key constraint:** Must not degrade the experience for teams using ARC's
built-in methods. External tool support is accommodation, not the primary
design target.

### ADR 8: Merge Strategy Support

**Question:** How does ARC's value proposition survive squash merging?
What changes in commit philosophy, archive workflows, and documentation?

**Starting position:** Audit 1 (D3) identifies this as a dealbreaker.
ARC's atomic commit philosophy assumes individual commits survive merging.
With squash, PR descriptions carry the context instead. The task list is
the detailed record regardless of merge strategy.

**Possible scope:** May fold into ADR 4 (a `merge_strategy` config
setting) plus documentation guidance. Or may be substantial enough for
its own decision record if the commit philosophy implications run deep.

## Deliverables

### ADRs

One ADR per design question above (8 planned, may consolidate if questions
prove tightly coupled during work).

### Strategy Documents

Emerging from ADRs — exact number TBD during work. Candidates:

- **Core philosophy doc** — Abstract principles, single source of ARC's
  identity. What's non-negotiable and why. Separate from implementation
  details.
- **Configurability architecture doc** — How the philosophy takes form:
  config schema, extension point conventions, tier definitions, external
  tool model.
- **Possibly: config schema spec** — Could stand alone or fold into the
  architecture doc. Depends on complexity.

**Open question:** Should the philosophy doc be purely abstract (principles
only, no mention of how they're implemented) or should it demonstrate
principles through the configurability architecture? Initial lean: abstract
first as a single source of philosophical truth, separate from
method/implementation details. To be resolved during work.

## Approach

1. Work through ADRs sequentially (some may inform others — ordering TBD
   during PRD/task creation)
2. Each ADR: discuss options → iterate → document decision and rationale
3. After ADRs: synthesize into strategy documents
4. Strategy docs become the authoritative reference for WU2-WU4

## Dependencies

- **Upstream:** None — WU1 is the first work unit
- **Downstream:** WU2 (references ADRs + strategy docs for all methodology
  changes), WU3 (references config schema for CLI design), WU4 (references
  philosophy + tiers for docs site content)

## Exclusions

- No editing existing workflows or strategies
- No updating hooks or config parsing
- No fixing audit findings
- No implementation of config schema in tooling
- No structural analysis of files

All of the above is WU2+ scope.

---
