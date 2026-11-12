# Notes: Cutover Tracked-State Removal

## Task generation

- The inbound items this unit held keep the numbers they had in `storage-cutover`'s buffer. Each is designed in the
  spec, moved with the internal collapse to `cutover-in-repo-removal`, or handed on by the spec's Non-Goals;
  `cohort-storage-cutover.md` names the shares of the items that span members (#1, #10, #26).
- The inbound entry "Remove `verify-integrity.sh`'s meta-shape check" was declined at the spec's review: the script's
  § 7 reads projected files a refused or unsent hand edit can still leave malformed, so it stays (the spec's
  § Non-Goals).
- Review stop rule for this unit's planning loops (Owner, 2026-11-10): stop when a pass's findings include no
  critical or major one that survives verification, and return to the Owner after three independent passes either
  way.

## At archive

- Close the storage-coupling register rows whose last share this change completes, each with a witness to the row's
  whole fate (`cohort-storage-cutover.md` § Register shares):
    - **Auto-merge planning classification by tracked prefix:** the classifier commands, the classifier, the CI
      workflow, the CODEOWNERS block, and the merge-gate recipe gone (the spec's Success Criteria 2–5).
    - **Lifecycle hook checks:** the hooks and their checks gone, with `task-list.segmentation`,
      `cohort.member-sections`, and `lint:md:descriptors` kept in their homes (Success Criterion 2). `cutover-flip`'s
      spec § 17.2 assigns this change the row's closure.
    - **`STATUS.USER` file, offline cache, and notes sync:** the status rendered on demand (`handleStoreUserStatus`,
      `handlers/status/store-user.ts`); the file kept out of projection discovery (`isExcludedProjectionFile`,
      `lib/store/projection/discovery-exclusions.ts`) and out of the window's import (`importPersonalExcluded`,
      `lib/store/ref/import/personal-disk.ts`, deleted with the transform); and the window's leftover files removed
      (Success Criterion 8).
- Retire `planning-lane-relief`: `cohort-state-storage.md`'s register holds its retirement with the classifier for
  this change.
