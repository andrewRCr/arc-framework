# Notes: Seam Decomposition

## Corrections to the consumer map

The storage contract's consumer map (`notes-storage-contract.md`, archived) is not edited. Its decomposition rows were
re-verified against the code at `5b82bb851`, and these corrections stand here. Under the spec, a row matters only as
carried or deleted (§ 1.5, § 13).

- **Dead in production:** `git-decompose-v3-retirement-delta.ts` has no production importer — the delta is computed in
  `decompose-v3-repository-plan.ts` from trees already read; and `repointDependsOn` (`decompose-sweep.ts`) has no
  production caller, though its import is that file's `store-raw-state` floor entry.
- **Not decomposition's:** `git-decomposition-object-readers.ts` has no decomposition importer; its ten callers are
  delivery, review, integration, status, and session-init modules. Its row's owner, `storage-cutover`, stands.
- **Misread:** `git-decompose-v3-destination-validation.ts` does no Git I/O despite its name, and serves extraction's
  finish alone; `--finish` refuses a retirement map (`map:authoring-shape`, `git-decompose-v3-finish.ts`) rather than
  passing over it.
- **Not shared after all:** `seam-lifecycle` changed teardown's injected removal callback
  (`tryCleanupDecomposeCandidate`, `verbs/teardown.ts`), not `git-owned-decompose-candidate-cleanup.ts`, and teardown's
  store arm (`runStoreTeardown`) handles no candidate. The store version stages no candidate, so the file leaves with
  the in-repo arm.
- **Unrowed but coupled:** `handlers/decompose.ts`, `decompose-v3-operation.ts`, `decompose-transition-record.ts`,
  `decompose-v3-repository-projections.ts`, `decompose-v3-materializer.ts`, `decompose-v3-finish-operation.ts`,
  `decompose-result-occupation.ts`, `decompose-candidate.ts`, and the candidate cleanup. `decompose-candidate.ts` has
  callers outside the machine: teardown and `lib/git/in-flight-derivation.ts`.
- **Sharer missing:** `terminal-transition-record-writer.ts`'s row names no sharer, though decomposition
  (`decompose-v3-operation.ts`, `git-decompose-v3-operation.ts`) and lifecycle (`verbs/abandon.ts`, `verbs/rename.ts`,
  `handlers/lifecycle.ts`, `commands/rename.ts`) both import it.

## A1 — destination locator semantics

The pre-implementation audit after merging `main` at `efd3442b4` found that spec § 8.4 promised more than the
unchanged scanner establishes. The approved correction keeps destination conservation as successful locator
resolution, with arbitrary authored bodies, and makes ordinal retargeting explicit. Task 3.3 realizes the correction;
task 5.3's revision tests use the same unresolved-locator condition, and the spec adds Success Criterion 9.

Superseded text from § 8.4 ¶1:

> A locator names a heading's text and level, its ancestors', and its
> occurrence among headings of the same text (`V3DecomposeLocatorSchema`), so renaming or re-leveling an allocated
> heading or any heading above it, merging it, or adding an earlier heading of the same text refuses, naming the
> allocation; the remedy is to update that allocation's target locator through a revision. Authoring may change anything
> else.

`scanV3DecomposeContent` assigns occurrence ordinals afresh, and `resolveV3DecomposeContentLocator` matches the
complete locator rather than a section's prior content (`decompose-content.ts`). A source probe scanned a destination
with `## Allocated` and body `Original content`, then inserted an earlier `## Allocated` with body `Inserted content`.
The saved occurrence-0 locator resolved successfully to `Inserted content`, and the original section moved to ordinal 1.
`validateProjectedContent` checks resolution alone (`git-decompose-v3-destination-validation.ts`).

Keeping persistent section identity would require additional destination evidence and a decision about which authored
edits preserve it. The approved correction composes the existing scanner and leaves that mechanism out of scope; the
distribution approval reviews the current content the locators name. The origin's content digests still bind the
source inventory between the batches, independently of destination authoring.

## Refusal coverage

Each row of the spec's § 14, by the tasks of `tasks-seam-decomposition.md` that build and test it. A row's tests show
the refusal firing where its condition holds and the cut completing after its remedy.

| Refusal                                                                         | Tasks                        |
| ------------------------------------------------------------------------------- | ---------------------------- |
| The origin holds a stored map, or another cut stores one first                  | 2.2, 2.6                     |
| The origin's inbound list holds entries                                         | 2.2, 2.4, 3.3                |
| The origin is Integrating or archived                                           | 2.2, 2.4, 5.2                |
| The origin is one no member can be made from                                    | 2.2, 2.4, 2.5, 3.2, 5.2, 5.3 |
| A task list the batch would copy carries a completed task                       | 2.5, 5.3                     |
| The origin's meta or a source record holds an open conflict                     | 2.2, 2.4, 3.3, 5.2           |
| The lifecycle listing is unreadable or incomplete                               | 2.2, 3.4, 5.1                |
| The map does not decode, or is version 3                                        | 1.2, 2.4, 5.3                |
| The map breaks a carried ownership, edge, or placement rule                     | 2.4, 5.3                     |
| The map's machine half differs from a fresh preflight                           | 2.4, 5.3                     |
| The wrong flag for the map's shape                                              | 2.4                          |
| A name is held, or taken before the batch lands                                 | 2.4, 2.6, 5.3                |
| An allocation into a file the operator may not edit                             | 2.4, 5.3                     |
| An existing home resolves to nothing, to a completed work unit, or to an Errand | 2.4, 3.1, 5.3                |
| A started home would take an edge, or a started dependent's edge would move     | 2.4, 3.3, 4.1, 4.3, 5.3      |
| A `document` home                                                               | 2.4, 5.3                     |
| An edge's provider does not resolve by slug                                     | 2.4, 3.3, 5.3                |
| A Purpose missing for a created document, or present for an existing one        | 2.4, 5.3                     |
| No stored map                                                                   | 3.1, 5.1, 5.3                |
| The origin's current kind is not the shape's                                    | 3.2                          |
| A member gone, a seeded field diverging, a locator unresolved, an origin moved  | 3.1, 3.2, 3.3, 4.3, 5.3      |
| An `at-cap` subcohort document holds a lone fan-out marker or a different block | 3.4, 4.3                     |
| The origin's checkout fails the removal check                                   | 3.4, 3.5                     |
| The apply authority is stale                                                    | 3.5, 4.3, 5.1, 5.3           |
| A started member would be removed, or its seeded field moved                    | 5.1, 5.3                     |
| An edge names a stub the batch removes                                          | 5.1, 5.3                     |
| A removed stub holds its own stored map, or inbound entries                     | 5.1, 5.3                     |
| An open work item or cohort document holds a cohort document the batch removes  | 5.1, 5.3                     |
| A member was renamed between the batches                                        | 3.2, 5.3                     |
| The cut has landed                                                              | 3.6, 4.3, 5.4                |
| The stored map is conflicted after a sync                                       | 5.5                          |
| A member is gone that the revised map keeps, or a revised `Parent` would change | 5.3                          |
| A placement names a cohort after the origin                                     | 2.4, 5.3                     |
| A retirement's member names the origin                                          | 3.2                          |
| `abandon` lineage for an origin holding a stored map                            | 1.5, 5.6                     |
| `--revise`, `--discard`, or `--finish` without its map, before the flip         | 6.1                          |
| `--advance-base` or `--finish <cut-map>` from the flip                          | 6.2                          |
| A version conflict at the batch                                                 | 2.6, 3.5, 4.3, 5.1, 5.3      |

---
