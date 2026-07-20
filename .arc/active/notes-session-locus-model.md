# Notes: session-locus-model

## Contents

- [Codebase pointers](#codebase-pointers)
- [Dogfood evidence trail](#dogfood-evidence-trail)
- [Adjacent work and shipped substrate](#adjacent-work-and-shipped-substrate)

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
