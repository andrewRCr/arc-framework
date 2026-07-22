# Notes: session-locus-model

## Contents

- [Codebase pointers](#codebase-pointers)
- [Dogfood evidence trail](#dogfood-evidence-trail)
- [Adjacent work and shipped substrate](#adjacent-work-and-shipped-substrate)
- [Right-sizing audit (2026-07-22)](#right-sizing-audit-2026-07-22)

## Codebase pointers

- **Grooming-as-residue misclassification** — `in-flight-derivation.ts:1303` emits a cleanup-needed advisory for
  the sanctioned `chore/groom-*` branch because residue detection reads branch shape, not records; it re-fires on
  effectively every CLI invocation (observed 5× in one session, 2026-07-15), and `arc start` mislabels the emission
  a "ROADMAP advisory". The durable fix (Proposed Design D8/D11) is records-based classification — detectors read
  the groom-kind identity record plus the machine-local role, never branch shape.
- **Raw materialize arm** — session-init's Errand materialization currently uses raw `git worktree add`, producing
  markerless worktrees invisible to cleanup surfaces (a self-teardown can leave a markerless husk). D7 replaces it
  with `arc errand materialize`, which writes the ownership marker plus role record at creation.
- **Marker vs. record** — the ownership marker is durable provenance the sweep trusts; the locus record is the live
  frame. They stay distinct artifacts written at the same creation site.

## Dogfood evidence trail

The model was motivated by FP (finalize-parallelism) wave-2/wave-3 dogfooding; the full findings live in
`notes-finalize-parallelism.md`. Key references for design rationale during task-gen/execution:

- **§ Dogfood finding (2026-07-14)** — the originating wave-2 failures: warm `errand open` displaced the WU worktree
  onto the errand branch and hard-blocked on the WU's uncommitted notes; `errand close` died on `git switch main`
  (base held by the primary); a mid-errand compaction recovered errand context only — the suspended WU frame
  survived only in the harness summary. All were checkout-identity failures, not model failures.
- **§ Wave-3 seam-audit decisions (decision 5.3, 2026-07-17)** — settled the serialized-primary default over
  ephemeral-worktree-by-default: out-of-WU work occupies the free primary, one session at a time; warm entries are
  occupancy-keyed (relocate to the free primary, else spawn), not temperature-keyed; spawn is the non-default
  fallback; the sequential drain is codified, addressing "sequential feels slow" by tightening per-errand overhead
  rather than by parallelism. This is why the default (D1/D7) is primary-serialized with spawn as fallback.
- **§ 7.3** — the linked-session husk/orphan cleanup gate: cleanup surfaces render only in the primary worktree,
  invisible to operators in linked worktrees; FP preserved that boundary expecting this record's read verb to lift
  it eventually (a `husk-lifecycle-drivers` seam, not owned here).

## Adjacent work and shipped substrate

- **Mechanization errands around the model** (not this WU's execution): the base-sync verb and `stub-mint-to-launch`
  (in `backlog/planned/`) are determinate mechanization errands; a near-term residue-detector patch (teach the
  detector the `chore/groom-*` shape, dedup the emission, fix the `arc start` provenance label) is a stopgap around
  the durable records-based fix this WU ships.
- **Shipped substrate this builds on**: BI-1 worktree provisioning (spawn/teardown cost dismantled — spawn is cheap
  now), `worktree-teardown-decoupling` (the shipped-husk transition plus the driver socket the lease composes with),
  and PR #241 (the v2 `returnBranch` topological close fix — consumed as the degrade-path shape, superseded for the
  default by displacement removal).

## Right-sizing audit (2026-07-22)

Standalone `design-audit` run over the spec and the delivered implementation against the draft's motivating
intent, ahead of verification — prompted by the disproportion pattern remediated in `review-architecture`.
Efficacy holds: all six motivating failures (worktree displacement, base-held close failure, lost suspended
frame, groom-residue misclassification, markerless materialization, cleanup-vs-live-session) are solved. The
findings are fit/optimality: the spec answered every question the draft deliberately left open at the
maximum-exactness end of the range, and several operator-facing surfaces pay for guarantees the single-operator,
machine-local domain does not need. Phase 7.R carries the remediation; task letters below.

Major findings:

- **Lease scope gap (7.R.b)** — spec D4/D11 expect session-init to attach/refresh the session lease; the shipped
  workflow attaches only on a resolved live-lease match, which a fresh session never produces. Plain WU sessions
  therefore run leaseless (`frame: idle` on a live checkout), leaving the liveness apparatus mainline-idle and the
  roster's session-visibility goal unmet. Resolution: ratify verb-scoped leases and align spec, workflow, and
  narration claims.
- **Warm-entry capability table (7.R.c)** — hard `cold-entry-required` refusal keyed to harness process forensics;
  table churn began pre-ship (`f6d6bda87`). Demote to an operator-confirmed advisory.
- **Awaiting-merge rigidity (7.R.d)** — resume/materialize demand host-proven `requested-work`, so a plain-open
  own PR cannot be resumed to push one more commit. Relax to open-change-request-at-recorded-head; host truth
  stays required only where identity retires.
- **Housekeep plan-commitment protocol (7.R.e)** — canonical plan file, per-entry source digests, immutable plan
  digest, persisted monotonic lane, and dispatch IDs protect against a mid-sweep interruption whose real cost is
  re-confirming a list. Trim to execute-bound marking plus one-live-sweep serialization.
- **Groom overlap arbitration (7.R.f)** — cross-machine unique-winner CAS with exact-set retry adoption, for a
  race a single operator cannot meaningfully lose. Trim to same-key/overlapping-member conflict semantics.

Minor: `locusGuidance` renders non-actionable litany every init — seven `worktree-without-role` diagnostics plus
per-row no-deletion-authority cleanup lines in this repo (7.R.h); routine narration presents bare "locus" to the
operator (7.R.g); `heartbeatAt` changes no verdict and grants nothing (kept as-is; do not extend).

Keep-list (retained deliberately; do not extend): platform inspectors and PID-plus-start-token liveness, the
record store with atomic replace plus record-scoped locks and stale-break protocol, staged provisioning receipts,
teardown linearization, determinism/sorting rules, the v3 identity state model and complete-basis transaction
core, and the `arc locus` reader with typed session-init verdicts. These are internal, tested, and
friction-neutral; deleting them buys churn, not simplicity. Guiding boundary for future edits: full exactness on
data-destroying paths; advisory or simple-conflict semantics on operator-facing routine paths.
