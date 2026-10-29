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

## Regrounding after the ref backend landing (2026-10-29)

Scope: completed Phases 1–7 and remaining Phase 8, against base `d5eff3e358756aee90fea3ee279653eca598c9d0`
(the ref backend landed in PR #1180). This is an author-run task audit, including source grounding and the eight
categories in `task-audit`, with bounded read-only scouts; it is not independent review or terminal verification.

### Fix before starting

- **Phase 8's cohort premise differs from the landed contract.** `slugCandidates` in
  `packages/arc-framework/src/lib/store/ref/lookup.ts` calls `preferredNameTrees` with `["work-item"]`.
  `answerHolders` and slug skipped-ref conclusiveness also exclude cohort refs. The test in
  `store-ref-lookup.test.ts` explicitly resolves a work item's former slug ahead of a cohort's current slug, and
  refuses a cohort-only slug. The helper's default ranking supports both families, but that is not the slug arm's
  current behavior. Spec § 1.1, § 11, and Task 8.1 therefore cannot rely on cohort admission already being present.
  The approved cohort-ranking outcome still applies. Recommended correction: route this expected-contract mismatch
  through `amend-design` and extend the Phase 8 derivation to include the slug caller, unreadable cohort evidence,
  and the backend's cohort-exclusion test. Preserve shared ranking and name-only reference binding behavior.
- **The landed shared conformance assertion now blocks merge validation.** `suite-lookup.ts` adds
  `slug-held-only-by-a-cohort-not-found`, which contradicts the reference backend's implemented cohort result.
  `arc check new-head --from 5d16bc32756df53cd9a9b13578c6b8b809538ab3` at merge `01867423a` reports exactly
  that assertion failing in `conformance-reference.test.ts`; 20,521 other unit cases pass. Full lint, both type
  checks, and ARC contract checks pass. The backend's cohort admission and replacement of this assertion must
  precede a green new-head check; leaving the shared assertion until Task 8.3 no longer works as a green sequence.
  Recommended disposition: a bounded task-only amendment brings this cohort contract and its shared assertion
  forward together, then the remaining Phase 8 tie, claim, and conformance work proceeds as planned.

### Carry as context

- `RefLookupTree.archived`, `folderPlacement`, `latestArchivedFolders`, and `readLookupTrees` provide the archive
  coordinates and latest-per-owner input required by 8.1. The unranked branch-link arm and name-matched work-unit
  claim arm remain the concrete changes described by 8.2. UID-free claim precedence and completed-only skipped-ref
  conservatism still need their planned cases. `write-views.ts` also calls `lookupCapturedRefTrees`; preserve its
  observable contract when carrying rank and tie facts through that function.
- `StoredUidSchema` now requires canonical lowercase stored UIDs; the teardown operand normalizes UUID input before
  UID lookup. The store contract now separates `push`, `pull`, and `maintain`; promotion uses the selected store's
  sync port. Exclude-file adapters now require `withLock`; production marker and provisioning adapters supply it.
  Companion projection preserves nested paths. Planned stub fixtures already supply `cls: "Light"`.
- Ref-store suites remain under `__tests__/integration/store-ref-*`, but their routine gate is now `test:store`
  with reach selection and normal/separate layout coverage. The integration tier does not supply that gate's
  evidence. Use the current check declaration and `DEV-RULES.PROJECT` when selecting Phase 8 and final checks;
  route heavy checks through the configured arc-offload adapter.
- No completed Phase 1–7 behavior was displaced in the inspected merge footprint. The archive conflict combines
  `membershipIndex`'s generation-keyed members with the landed `publishCohortCloseout` notice/publication contract.
  Reconciliation also updates new holder fakes from `null` to `{ kind: "none" }` and couples status's selected
  record and UID to stay within the complexity limit.

No new scope is needed for the recommended cohort correction: it realizes the existing cohort-ranking goal.
The remaining checked archive, claim, ref-ranking, and reference-binding contracts still match their tasks.
Phase 9 remains the terminal verification boundary. The failed new-head check is unresolved; no passing post-merge
qualification is claimed. The native cleanup matrix passes 75 cases and the ref-store decomposition fixture passes
22 cases, but neither substitutes for the failed shared conformance assertion.

## A3 — Cohort lookup after reconciliation

The amendment takes the task arm at low depth. Spec § 1.1 already requires cohort slug resolution and ranking;
`preferredNameTrees` already implements the required family ranking. The landed slug callers narrow that helper
and its unreadable-evidence domain to work items, and `suite-lookup.ts` adds the opposite cohort-only expectation.
No outcome or Success Criterion changes. Task 8.R brings the missing callers and cohort assertion forward together;
8.1 retains completed tie-breaking and tie facts, 8.2 retains ref and UID claim selection, and 8.3 retains the remaining
shared assertions. Name-only reference binding, commit lookup, and claim evidence domains are unaffected.

Author grounding over A3 and Task 8.R found no further blocker: `preferredNameTrees` tiers both primary families;
`resolveCapturedReference` filters to its typed family before ranking, while `lookupView` delegates to
`lookupCapturedRefTrees`. `assertion` keys exclusions by family and raw assertion name, so the in-repo limitation
belongs under work-item. The affected contract keeps its original observable outcomes and no new acceptance target.
The low-depth amendment uses the author checks without an independent planning pass.

The correction admits both lifecycle families in `slugCandidates`, `answerHolders`, and the highest-tier
conclusiveness check without changing the shared ranker or typed name binding. Native red runs expose the three
cohort selection cases, the shared assertion, unresolved cohort evidence, and the conclusive-current-name boundary;
the corrected paths pass. Focused normal/separate conformance and declaration inventories pass, including the
in-repo exclusion. The original new-head request remains pending until the correction has its commit head.
