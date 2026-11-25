# Notes: Cutover Documentation

## Sources for the Errand ADR

- The shipped design is `spec-storage-contract.md` D5, D10, D11, and D13, with its A5 for promotion, as
  `spec-seam-locus.md` § 7.5, § 8, § 8.1, and § 15.1 amend them. D10 says an abandoned Errand joins no archive. The later
  specification and the code place its record at `completed`.
- The code behind the statements: `prepareErrandAdoption` (`lib/inbox/errand-adoption.ts`) for 3; `setErrandQueue` and
  `listErrandQueue` (`lib/inbox/queue.ts`) for 4; `createStorePromotionSteps` (`lib/errand/promote-store.ts`) and
  `settlePromotedOccupancy` (`lib/errand/promote-runtime.ts`) for 5.

## ADR passages left alone

- Clauses that only name a moved artifact: seven in ADR-001 and two in ADR-008. Most of ADR-005, 008, and 009 described
  artifacts retired before the cutover.
- ADR-014, and the clause in ADR-012 that hands contributors' task lists to it, go with `contributor-path`. ADR-020 is
  `scalable-core`'s, and footer format is `ghost-mode`'s.

## The check-doc

- `PROJECT-PRD.md`, `STRATEGY-INDEX.md`, and the three sibling check-docs list the set of four.
- Principles 5–14 cover identity apart from branches, backend-agnostic workflows, concurrency as normal, one knob, no
  axis explosion, no required service, no reachability dependence, owner identity, freshness by record, and Git as the
  engine.
- `external-pm-composition` settles the question Principle 4 holds.

## The doctrine rewrites

- The isolation acceptance test follows `spec-projection-worktrees.md` § 10.5.
- § Auto-Merge Lane leaves no retired-section note, since text that projects install cannot carry one.
- The new strategy is a `strategy-*` file because that is the live convention. Its index row adds to an always-loaded
  file with nothing offsetting it, since the user-notes row stays, narrowed to the notes lock.
- The errata convention and the relocatability rule are in the cutover's specification, `spec-cutover-flip.md` § 8.12,
  and § 8.3 with § 8.16.

## Captures in `USER-INBOX`

- `cutover-tracked-state-removal`: "Record in ADR-021 that the recommended-recipe consequence is retired, with the
  recipe's removal".
- `cutover-notes-removal`: "Retire or rewrite `strategy-user-notes-concurrency.md` once notes sync is gone".
- `history-policy`: "Correct `history-policy`'s statement that the cutover flips the append-only rule", which names the
  four passages of its draft.
- Errand, held: "Retire `strategy-storage-evolution.md` once its last users have landed".
- Errand, held: "Record the storage-seam members' contract changes in the storage cohort's § Shared contracts".
