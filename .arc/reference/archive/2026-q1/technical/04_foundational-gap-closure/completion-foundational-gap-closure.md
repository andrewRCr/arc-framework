# Completion: Foundational Gap Closure

**Completed**: 2026-02-26
**Branch**: `technical/foundational-gap-closure`
**Category**: Technical
**Context**: Bridging work between WU1 (philosophy/configurability) and WU2 (methodology implementation)

## Summary

Resolved 11 foundational design gaps and 3 partially addressed audit findings identified by the
Phase 1 audit, producing ADRs, strategy updates, and workflow change specifications that WU2
consumes. The dominant theme was session lifecycle — 5 of 11 gaps clustered around how ARC
handles session state across boundary types. Research-grounded decisions for 4 gaps drew on
76+ external sources across session state management, LLM context effectiveness, and SE planning
practices.

## Key Deliverables

- **ADR-007** — Session state portability and team transfer via two-file decomposition
  (tracked WORK-STATUS.md + gitignored SESSION.md) with git notes for portability
- **Context loading architecture** — Validated and formalized the three-tier model with
  five design decisions (C2-C6): core document restructure, instruction budget framework,
  Tier 2a explicit trigger pattern
- **Planning lifecycle** — `strategy-work-planning.md` codifying the plan-to-PRD pipeline,
  `template-prd.md` for adopter use, G8-G10 workflow integration specs
- **7 fast-track design decisions** — first-session bootstrap (C7), task reference stability
  (C8), method override dependencies (O2), config scope, archive trigger three-operation
  model (D2/D6), mismatch recovery (C9), staleness detection (C10)
- **2 partially addressed findings** — agent switching guidance (C5 note), deferred review
  scope bounds (G11)
- **3 research syntheses** — `research-session-lifecycle.md`, `research-context-loading.md`,
  `research-planning-practices.md`
- **WU2 plan annotations** — 10 new cluster items (C7-C10, G11, plus updates to D2, D6, C5,
  O2, L4) with concrete specs; dependency section updated throughout

## Implementation Highlights

- **Research-then-design pattern** worked well: external evidence grounded the 4 research gaps
  before design decisions. The context loading research (31+ sources) introduced the instruction
  budget concept that reshaped the entire Tier 1 loading strategy.
- **ADR-007's two-file split** resolved multiple gaps simultaneously: session portability (Gap 1),
  team transfer (Gap 5), and indirectly simplified mismatch recovery (Gap 9) and staleness
  detection (Gap 10) by making tracked state inherently fresh.
- **Three-operation model** (Rotate → Complete → Archive) clarified the archive trigger question
  by separating intermediate branch merges from end-of-work-unit archival.
- **Incidental work during WU1.5**: unified markdown line-length at 120 chars (reverted a
  per-directory 100/120 split), annotated WU3 plan with markdownlint config delivery, added
  Codex agent guidance, annotated WU4 with skills convergence observations.

## Related Documentation

- PRD: `prd-foundational-gap-closure.md`
- Tasks: `tasks-foundational-gap-closure.md`
- Notes: `notes-foundational-gap-closure.md`

## Follow-Up Work

No deferred items — all gaps resolved and all partially addressed findings closed. WU2
(`plan-wu2-methodology-completion.md`) consumes the outputs as upstream dependency.

---
