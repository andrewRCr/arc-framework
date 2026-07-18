# Draft: coupling-blast-radius-audit

- **Origin:** [internal] — merged at the 2026-07-18 housekeep drain from two recorded needs that are the same
  enumeration pass: `draft-arc-backend.md` § Sequencing's blast-radius audit ("sooner than later") over every
  tracked-`.arc/`-path / `git log .arc/...` / directory-as-state assumption across `lib/`, hooks, and
  `system/workflows/**`; and the coupling-inventory need (architecture-direction discussion, 2026-07-16) for a
  fan-out inventory of volatile concrete names crossed with volatility to rank decoupling work.
- **Purpose:** One audit, two consumers. Enumerate every concrete-name / concrete-layout assumption the codebase
  and workflow corpus carry (`.arc/completed/`, `backlog/planned/`, `chore/` prefix, `meta-` prefix, branch
  patterns, `ROADMAP.md`, tracked-path and directory-as-state reads), grep-count fan-out per assumption class,
  cross with volatility, and produce a ranked decoupling list (high-fan-out × high-volatility → abstract;
  high-fan-out × stable → leave alone). Findings route to existing owners rather than minting a remediation
  program.
- **State:** Draft — seeded at the 2026-07-18 housekeep drain; planned (P1) as the scheduled-first post-FP
  audit whose output feeds the substrate chain and the lifecycle-state grooming.

---

## Scope shape

- Audit-shaped, `Light`: an enumeration + ranking pass over the existing tree, no design invention. The
  deliverable is the ranked coupling list plus routed findings, not remediation.
- Downstream consumers with hard `Depends On` edges (recorded on their metas at the 2026-07-18 drain):
  `cli-substrate-adoption` (chain head — the ranked list identifies which concrete-path assumptions the
  substrate layer must abstract; `operational-state-docs` → `local-mode` sequence behind it transitively) and
  `wu-lifecycle-state-model` (the placement-reader enumeration is direct input to its placement-as-record
  position).
- Soft consumers (no edges — findings arrive as routed notes): `knowledge-lint`, `session-locus-model`,
  `composable-workflows`, and whichever other WUs the enumeration itself surfaces. The affected set is an
  *output* of the audit; edges are not pre-committed on guesses.

## Closing discipline — route, never re-open

The task list must end with a terminal routing phase: every finding that changes another WU's design lands as a
provenance-stamped inbound-buffer note on that WU (or a `USER-INBOX` capture when the owner is in flight) —
never as a mid-audit edit to a foreign draft body. Whether a finding changes a WU's design is that WU's call at
its own grooming, with its own context loaded.

---
