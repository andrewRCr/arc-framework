# Metadata: decompose-base-mobility

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `decompose-transform-integrity`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-decompose-base-mobility.md`
- **Task List:** `tasks-decompose-base-mobility.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Phase 6 complete — verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/418>
- **Completed:** 2026-07-31

---

## Release Notes Entry

Canonical decomposition candidates can now absorb configured-base movement without rewriting history, validate
their recorded transition against descendant bases, and remain eligible for ordinary landing and cleanup after
review latency advances the integration branch.

### Added

- Full-protection decomposition exposes an explicit base-advancement mode that merges the pinned current base into
  a committed, unlanded candidate after canonical validation, overlap replay, and base-dependent re-derivation.
- Descendant-base validation and integration-anchor resolution recognize exact transition replay across unrelated
  base commits while binding every decision to immutable Git objects.

### Changed

- Finalized-record validation, projection regeneration, and merge-conflict recovery recognize authorized
  same-path receipt restatements produced by base advancement without weakening existing exact-base behavior.
- Recovery guidance routes committed finalized candidates to the actionable base-advancement command.

### Fixed

- Advanced candidates restate their live claim binding alongside the receipt so ordinary landed cleanup can retire
  and release them against the new base.
- Advancement revalidates candidate worktree ownership immediately before mutation and reconciles claim writes
  whose persistence completed before an interrupted store response.

## Completion Notes

This work delivered one host-neutral descendant-base validator, a descendant-current-base extension of the shared
integration anchor, and an append-only command for advancing committed full-protection candidates. The command
establishes canonical receipt, replay, dependency, claim, ref, and re-derived projection authority before merging;
it restores the bounded pre-merge candidate on later refusal and never rebases, amends, or force-pushes history.

The same authored-cut proof now governs advancing receipt admission in the finalized-record gate, projection
regeneration assert, and merge-overlay discovery. Base-derived receipt and preparation facts are recreated through
their existing producers, the receipt remains at its canonical path and identity, and the live transient claim moves
with the restated base and cut-map digest. Descendant landings preserve the exact-base fallback and carry the landing
relation through cleanup, landed handoff, and validated work-unit launch.

One planned failure boundary was refined during implementation: if the configured base advances after a candidate
has staged its merge, commit authority remains bound to the exact sole merge parent already validated. A later
invocation absorbs the newer base tip through another append-only pass. This preserves claim and receipt coherence
without adding the out-of-scope ledger or transaction record.

Verification covered real Git topologies for advancement, fast-forward and merge landing, overlap and dependency
refusals, ref and worktree races, hook admission, claim retirement, and cleanup. The full Markdown, ARC-contract,
TypeScript, shell, typecheck, unit, integration, E2E, portability, and build gates passed; hosted review findings were
resolved, including candidate worktree revalidation and persisted-claim interruption recovery. A repeated
contention-only integration timeout was stabilized with test-specific headroom while retaining its assertions.
