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
- **State:** Maturing — method settled at the 2026-07-18 design pass; open items are calibration detail
  (thresholds, caps), not fundamentals.

---

## Problem / Motivation

The corpus is too large for judgment-first enumeration: ~480 TS source files plus ~140 shipped markdown files in
package source, with sample probes confirming real spread (`meta-` in 123 files, `active/` in 108, `ROADMAP` in
51). An agent-reads-the-corpus audit would burn tokens exactly where a mechanical pass is equivalent or better —
so the method's design constraint is that token spend concentrates where judgment is irreplaceable (pattern
authoring, volatility rating, ambiguous-hit triage) and mechanical tooling does every corpus-wide read.

## Method (settled)

1. **Corpus boundary — package source authoritative.** Audit `packages/arc-framework/src/**` and
   `packages/arc-framework/arc/**` only; the `.arc/` instance mirrors package source under two-copy sync, so it
   contributes just a small delta pass over configurable-file divergences. Roughly halves the surface.

2. **Two-layer pattern manifest.** The manifest is derived twice over, from complementary directions:
    - **Name layer (forward, from target shapes):** seeded from the three evolution strategies
      (`strategy-storage-evolution.md`, `strategy-knowledge-evolution.md`, `strategy-procedure-evolution.md`)
      plus their paired drafts (`draft-arc-backend.md`, `draft-knowledge-architecture.md`,
      `draft-composable-workflows.md`) and the in-flight roster (pending renames such as
      `ROADMAP → STATUS.PROJECT`, `team.mode → team.enabled`). Any name or layout the recorded target shape
      would move, rename, or abstract is a volatile assumption — the name list falls out pre-weighted by
      volatility.
    - **Idiom layer (backward, from coupling mechanisms):** a closed list of the ways code or prose can assume
      concreteness — path string literals, readdir/existence checks against directories-as-state, git
      invocations on tracked paths, filename-prefix parsing, branch-pattern matching, config-key literals,
      doc-name references in prose. Names say *what* to look for; idioms say *where couplings hide*.

3. **Comprehensiveness via the residue test.** The manifest's coverage claim is evidenced, not asserted: one
   deliberately over-broad catch-all sweep (e.g., every `.arc/`-containing string literal in `src/**`, every
   path-like token in workflow prose) whose hits must each classify into a manifest class or land in a residue.
   The residue is the bounded, inspectable unknown-unknowns surface — each residue item either mints a new class
   or is dismissed with a reason. One pass, capped; small triaged residue is the comprehensiveness evidence.

4. **Mechanical enumeration, re-runnable.** An `rg`-driven script executes the manifest corpus-wide, emitting
   per-class counts and file lists. The manifest + script are checked in as part of the deliverable so the audit
   is re-runnable — `cli-substrate-adoption` can re-measure after each decoupling lands.

5. **Hit classification by surface kind, mechanically.** Classify hits per file path (code / workflow prose /
   template / test) at zero judgment cost; a hardcoded path in `meta-reader.ts` and a prose mention in a
   strategy are different couplings. Agent sampling is reserved for code hits, capped per class.

6. **Volatility per class, from the record.** Volatility is not grep-able but is already recorded: rate each
   assumption class (not each hit) against the in-flight roster and the evolution strategies, citing the
   pending WU that would move each name. A judgment layer over mechanical counts — cheap, one pass.

7. **Ranked deliverable.** Cross fan-out × volatility into the 2×2 (high-fan-out × high-volatility → abstract;
   high-fan-out × stable → leave alone), delivered as a tracked companion report that survives archival — two
   hard-edge consumers read it later — alongside the manifest.

## Alternatives (rejected)

- **Agent corpus sweep:** reading ~600 files for what `rg` counts mechanically — token cost without judgment
  value; rejected on the corpus sizing above.
- **Open-ended pattern discovery:** unbounded discovery is where audits bleed effort; replaced by the seeded
  closed manifest + single bounded residue pass.
- **Per-hit judgment:** classifying every hit individually re-introduces the corpus-wide read; replaced by
  path-based surface-kind classification with capped sampling.

## Unknowns and Assumptions

- **Ranking thresholds:** what fan-out count reads "high" per surface kind — calibrate against the real
  distribution at execution, not pre-committed.
- **Prose-mention weighting:** whether shipped `arc/**` markdown mentions count as coupling or documentation —
  leaning: they count (they ship and drift), weighted below code reads.
- **Residue cap:** the bounded size of the catch-all triage — a spec-time number.
- **`.arc/` divergence delta:** assumed small (configurable-file sections only); verified cheaply at execution.
- **Manifest/script location:** checked-in, exact home resolved at spec time.

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
