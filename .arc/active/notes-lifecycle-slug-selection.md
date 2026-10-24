# Notes: lifecycle-slug-selection

- **A real case in this repository.** `decompose-transform-integrity` is both a completed work unit and a live cohort
  on one slug, so it exercises the spec's cohort ranking (§ 1.1) and the cohort rows of its edge table (§ 5.2) against
  real records.
- **Parallel branches.** As of 2026-10-23, `feat/seam-delivery-review` changes no file under
  `packages/arc-framework/src/`, and `feat/storage-ref-backend`'s overlap with this design is the list in § 10.2.
  Re-check both before a phase that edits a shared file.
- **Downstream consumers.** `cohort-identity-verbs` lands after this work unit and builds on the interfaces § 9 lists;
  a change to one of them during execution goes to that work unit's session. The cutover's flip step (§ 9) is routed to
  `storage-cutover` as an inbound requirement.
- **Register row.** The storage-coupling register's row for one-holder-per-slug selection (`cohort-state-storage.md`)
  names this work unit and closes with it; its widening to the checkout claim is routed to the register's drain.
