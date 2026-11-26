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

## Grounding basis

- The task list was written against `feat/cutover-flip` at `27a8251579` (read-only from this checkout). It names
  files, headings, symbols, and the specification's sections, and carries no line number or count from that branch.
- Every symbol the specification's § 3 and § 4 cite exists there in the file the specification names. Their behavior
  was not traced again, which task 1.1 does at the landed head.
- Before activation, the list's claims about the flip are audited against the flip's fixed head.

## Writing the shipped text

- Edit the package copy first, then the `.arc/` copy. `STRATEGY-INDEX.md` and `arc-config.yml` are Configurable: change
  both by targeted edits, and confirm afterwards that their `diff` shows only this project's overrides.
- Shipped text states what is. No "cutover", work-unit names, transitional framing, or note of what a section used to
  say, and no reference to this unit's planning artifacts.
- Shipped text cites nothing a project does not receive: no ADR, no project strategy, no backlog or archived record
  (`DEV-RULES.PROJECT.md` § Referencing across the boundary). Where an ADR decides a rule, the shipped text states the
  rule.
- Name verbs as the shipped workflows and help text name them at the landed head.
- Keep every heading that shipped text points at, by link or by `§` reference, its hooks and skills included.
- An assertion that pins rewritten text moves with that text and is not dropped.

## At landing

- **When:** after this change merges, in `integrate-work-unit.md` Step 11 before `arc teardown`, from the checkout that
  integrated it, or from the primary checkout once that one is torn down. Under `archive.cadence: with-integration` the
  archive runs before the merge and the merge approval can be redirected, so none of the saves below is made before the
  merge, and an integration left unmerged makes none. Integration follows this section from its start: the check
  before an archive, the re-run before the merge approval, and the saves after the merge.
- **Who carries it:** verification records the landing criterion's `[~]` deferral and leaves two markers, each
  pointing to this section:
    - a `## Errand` capture in the Owner's personal inbox, written through `arc-inbox` with its reminder set: "Make the
      post-merge saves of `cutover-documentation`";
    - one line saved to the Coordination section of `cohort-storage-cutover.md`: "`cutover-documentation`'s saves after
      its merge are pending (its notes' § At landing). The cohort does not close until they read back and publish; a
      member whose archive would close it stops for the Owner first."

  Session-init reads that cohort record for every active member (`resolveActiveCohortDocPath`,
  `lib/session-init/cohort-doc.ts`), this unit's own resumes included, so a sibling's integration and a resume of this
  one each meet the line at their start, whatever the capture's age. The saves run from these markers. Once every save
  reads back, one more save removes the cohort line before publication, and the capture is removed only once the remote
  holds them.
- **Before an archive that would close the cohort:** while the cohort line stands, a member's integration whose archive
  would close `storage-cutover` stops for the Owner before `arc archive`: this unit's own when every other member has
  shipped, or a sibling's after this unit archived. The archive would close the cohort (`prepareObservedCohorts`,
  `lib/work-unit/verbs/archive-store.ts`; `archive-work-unit.md` Step 3) while rows its closeout criteria require stay
  open until the saves after the merge; the cohort's archive-timing row already holds that order as the Owner's
  decision. If the Owner has the archive run first, the closeout's Follow-up names this section, and the saves open the
  closed record with `arc edit`.
- **Before the merge approval:** re-run both parts of the inventory over every in-scope document that differs between
  the tree task 5.5 searched and the tree that merges, the head composed with the base the integration checkpoint
  observed, and recompute both totals on that tree. A hit holds the merge approval until it is corrected on this branch
  or carries a scope reason.
- **Each save:** open the record as task 5.4 recorded, with `arc edit <path>` first for an archived one; make the edit;
  run `arc save`; then read the record back and confirm the replacement text stands. A closure names this change's
  merge commit as its witness. A save already read back is not made again, so a resumed session continues from the
  first save that does not read back.
- **Publication:** after the last save reads back, run `arc sync` from the same checkout and confirm that the state
  push reports "State pushed." or "State already current on its remote." (`handlers/sync-state-leg.ts`); either means
  the remote holds the saves, the second after a retry whose earlier push the remote accepted. A failed or blocked push
  publishes nothing: retry `arc sync` alone, never the saves. A skipped push means no state remote is designated, and
  stops for the Owner. The capture stays until the remote holds the saves.
- **Conditions:** a save whose condition fails is not made, and the session stops for the Owner. An item § 5 names
  that its unit's plan has not taken comes back to the Owner, and so does the append-only transfer while
  `history-policy`'s draft still assigns the change elsewhere or that unit has moved past its draft; the row stays as
  it is.
- **If the saves are not made:** the rows stay open, and the cutover cohort's closeout criteria require every row it
  owns closed. The landing criterion stays `[~]`, verification's record of that deferral names this section, the
  capture stays in the Owner's inbox, and the cohort line stands.
- **What:** the saves task 5.4 writes out below, in this order: the cutover cohort's record, the storage cohort's
  register, the stored drafts' citations, the archived records' citations. Each has its record, passage, and
  replacement text, how it is opened, and the condition it waits on.
