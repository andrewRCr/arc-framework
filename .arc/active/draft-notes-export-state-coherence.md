# Draft: Notes-Export State Coherence

- **Origin:** USER-INBOX capture drained at stub creation (2026-07-09); surfaced during `finalize-parallelism`
  wave 1, `arc-session` entry after Task 3.2.b — a cross-WU handoff-resume reproduced the false-conflict
  surface live. Re-confirmed at the 2026-07-09 session-init that drained this capture: the probe mapped the
  same topology to `conflict` and recommended a pull that `runUserPull` would refuse.
- **Purpose:** Treat branch-bounded notes projection divergence as expected state, not a pull/replace conflict.
  Session-init must classify the content-compatible `remote-subset` residue of a branch-bounded export as
  non-blocking local-ahead state — and must never offer pull/replace for genuine divergence it cannot safely
  resolve. Lands on `main` before `finalize-parallelism` wave 2 / the next cross-WU handoff-resume
  verification; FP merges it in and re-runs the originating induction.

---

## Problem

FP wave 1 reproduced an **expected** parallel-handoff topology as a **false data-conflict surface**:

- After `slug-state-oracle-alignment` handed off, its branch-bounded notes export preserved origin and
  overlaid only branch-reachable notes, while the shared local canonical ref correctly retained four notes
  attached to deliberately unpushed burn-in commits.
- The resulting refs were graph-diverged (`0fdd01af` local / `232b131f` remote) but **content-compatible**:
  every remote `(annotated commit, blob)` pair was byte-identical locally, and local was a strict content
  superset of remote.
- `arc status --session-init` nevertheless mapped the ancestry-only `diverged` verdict to `conflict` and
  prompted `arc user pull` to "replace local notes."

That guidance is internally inconsistent and unsafe-looking:

- `runUserPull` deliberately **refuses** diverged refs and preserves local state — the recommended action
  cannot do what its prompt text says.
- Actually replacing the local ref would **drop** the intentionally retained notes (data loss dressed as
  conflict resolution).
- Until the refs reconcile, every notes push from the affected machine refuses (non-fast-forward), so
  partial-push markers accumulate and cross-machine handoff continuity degrades with no self-healing path.
  Observed live 2026-07-09: this machine's FP (`94068a6f`) and SSOA (`f53eecf4`) handoff pushes both wedged.

## Approach (seed — settle in drafting)

Make the expected projection residue first-class. Two candidate designs, not yet settled:

1. **Producer-side safe-join** — the branch-bounded export safely joins the pushed export tip into the local
   canonical ancestry while preserving the full local tree, so the refs never read as diverged in the first
   place.
2. **Content-relation classification** — ref inspection derives a content-relation detail
   (`remote-subset` / `local-subset` / `equal` / `conflicting`) alongside raw topology, and consumers branch
   on it.

In either design, session-init must treat the live `remote-subset` case as non-blocking local-ahead state and
must never offer pull/replace for genuine divergence.

**Regression coverage:** an end-to-end regression from a branch-bounded subset export through
user-status/session-init recommendation; plus the existing pull-refusal contract and true same-commit
conflict coverage.

## Files

- `packages/arc-framework/src/lib/user-sync/branch-bounded-notes-export.ts`
- `packages/arc-framework/src/commands/user/sync-status.ts`
- `packages/arc-framework/src/lib/session-init/recommended-action.ts`
- `packages/arc-framework/src/commands/user/push-fetch.ts`
- and their integration / session-init tests

## Sequencing

Split out from `main`. Originally captured as "after `slug-state-oracle-alignment` ships"; deliberately
pulled forward 2026-07-09 — SSOA paused pre-spec (zero implementation, no overlap risk) because the wedge
went live: notes pushes failing on this machine, a false conflict prompt at every session-init, and FP wave 2
explicitly sequenced behind this fix. Land, merge into FP, re-run the originating handoff-resume induction.
