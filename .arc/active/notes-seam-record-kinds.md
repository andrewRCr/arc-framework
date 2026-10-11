# Notes: Seam Record Kinds

Implementation companion to `spec-seam-record-kinds.md` and `tasks-seam-record-kinds.md`: enumerations, batch plans,
and edge cases too large for the task bodies.

---

## Lineage surface

Phase 3's enumerated surface: every module that imports the lineage record's type, schema, or codec, or reads one of
its fields, plus every test or fixture that builds a record in today's shape. Derived at `a731316ce` by a type-aware
sweep (every identifier whose symbol is declared in `lib/work-unit/transition-record.ts`) and a text sweep for records
built as raw JSON.

The spec's count in § 7.3 — eleven production modules and 21 test files importing the type, schema, or codec — holds
for importers alone. The sets below add the modules that read fields without importing, and the tests that build
records as JSON.

### Production modules (14)

| Batch         | Module                                                       | Touches                            |
| ------------- | ------------------------------------------------------------ | ---------------------------------- |
| Producers     | `lib/work-unit/decompose-transition-record.ts`               | type, parser                       |
| Producers     | `lib/work-unit/terminal-transition-record-writer.ts`         | type, `origin`                     |
| Producers     | `lib/work-unit/verbs/abandon.ts`                             | type                               |
| Producers     | `lib/work-unit/verbs/rename.ts`                              | type                               |
| Producers     | `lib/work-unit/git-decompose-transition-base-advancement.ts` | serializer, `origin`               |
| Store         | `lib/work-unit/transition-record-store.ts`                   | type, serializer, `origin`         |
| Store         | `lib/store/in-repo/read-codec.ts`                            | parser, `origin`                   |
| Store         | `lib/store/in-repo/write-codec.ts`                           | type, `origin`                     |
| Store         | `lib/store/in-repo/lookup.ts`                                | type, parser, `kind`, `successors` |
| Query         | `lib/work-unit/transition-record-enumeration.ts`             | type, parser, `origin`             |
| Query         | `lib/work-unit/transition-disposition-query.ts`              | `kind`, `successors`, `edges`      |
| Reconcilers   | `lib/work-unit/reference-reconcile.ts`                       | `kind`, `origin`, `successors`     |
| Decomposition | `lib/work-unit/decompose-v3-operation.ts`                    | `origin`                           |
| Status        | `lib/status/roadmap-regeneration-assert.ts`                  | parser, `kind`, `origin`           |

`lib/work-unit/transition-record.ts` itself is replaced by the kind folder (`lib/store/kinds/lineage/`).

**Consumers of derived types, unchanged unless their derived type changes:** `git-transition-record-enumeration.ts`,
`side-effects/discharge-dep-edges.ts`, `lib/user-reference-reconcile.ts`, `lib/delivery/plan-resolution.ts`,
`git-decompose-v3-operation.ts`, `git-retirement-authorization-context.ts`, `executor-context-current-wu.ts`, and the
lifecycle, reconcile, status, and user handlers. Each reads enumeration entries, disposition-query results, or
reachable reference transitions rather than record fields. Phase 3 confirms each still compiles and passes unchanged.
Any that has to change joins the batch of the module whose derived type changed.

### Tests and fixtures (31)

| Batch               | File                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| Kind                | `__tests__/unit/work-unit/transition-record.test.ts`                        |
| Producers           | `__tests__/unit/work-unit/decompose-transition-record.test.ts`              |
| Producers           | `__tests__/unit/work-unit/terminal-transition-record-writer.test.ts`        |
| Producers           | `__tests__/integration/terminal-transition-record-writer.test.ts`           |
| Producers           | `__tests__/unit/work-unit/verbs/abandon.test.ts`                            |
| Producers           | `__tests__/unit/work-unit/verbs/rename.test.ts`                             |
| Store               | `__tests__/unit/work-unit/transition-record-store.test.ts`                  |
| Store               | `__tests__/unit/layout/record-addresses.test.ts`                            |
| Store               | `__tests__/helpers/store/in-repo-fixture.ts`                                |
| Store               | `__tests__/helpers/store/in-repo-recovery.ts`                               |
| Store               | `__tests__/integration/store-slug-ambiguity.test.ts`                        |
| Store               | `__tests__/integration/store-tracked-history.test.ts`                       |
| Store               | `__tests__/integration/store-tracked-lookup.test.ts`                        |
| Store               | `__tests__/integration/store-tracked-write-codecs.test.ts`                  |
| Store               | `__tests__/integration/store-tracked-write-ownership.test.ts`               |
| Query               | `__tests__/unit/work-unit/transition-record-enumeration.test.ts`            |
| Query               | `__tests__/integration/work-unit/git-transition-record-enumeration.test.ts` |
| Query               | `__tests__/unit/work-unit/transition-disposition-query.test.ts`             |
| Reconcilers         | `__tests__/unit/work-unit/reference-reconcile.test.ts`                      |
| Reconcilers         | `__tests__/unit/work-unit/side-effects/discharge-dep-edges.test.ts`         |
| Reconcilers         | `__tests__/e2e/wu-reconcile.e2e.test.ts`                                    |
| Decomposition       | `__tests__/integration/decompose-v3-repository-plan.test.ts`                |
| Decomposition       | `__tests__/integration/abandon-transition-location.test.ts`                 |
| Status              | `__tests__/unit/status/roadmap-regeneration-assert.test.ts`                 |
| Status              | `__tests__/integration/status-project.test.ts`                              |
| Delivery, lifecycle | `__tests__/integration/delivery-linked-worktree.test.ts`                    |
| Delivery, lifecycle | `__tests__/integration/exact-target-read-isolation.test.ts`                 |
| Delivery, lifecycle | `__tests__/e2e/delivery-plan.e2e.test.ts`                                   |
| Delivery, lifecycle | `__tests__/e2e/delivery-transfer.e2e.test.ts`                               |
| Delivery, lifecycle | `__tests__/e2e/lifecycle-exit.e2e.test.ts`                                  |
| Delivery, lifecycle | `__tests__/e2e/rename.e2e.test.ts`                                          |

`__tests__/integration/live-transition-records.test.ts` moves with the record conversion (Task 3.2.g).
`__tests__/unit/lib/store/concurrency/rank.test.ts` and `src/lib/store/concurrency/rank.ts` match the text sweep on an
unrelated `successors` and are outside the surface.

## Interim decode, Phases 1–3

From Phase 1, in-repo reads and listings decode a tracked record through its registered parser, but only the meta is
registered then. `decodeTrackedContent`'s lineage branch stays until Phase 3 registers the lineage kind (Task 3.2.c),
and its Candidate and integration-boundary branches stay for good (§ 11.1). Drafts, specs, companions, task lists, and
cohort documents keep listing with no parsed fields until Phases 4 and 5 register them.

Two of the contract's shared pieces parse meta content themselves, outside any read or listing, and stay as they are:
the lifecycle index re-parses a record whose `fields` its schema rejects (`lib/store/lifecycle-index.ts`), and the
current-work-unit resolver checks that a claimed meta parses (`parseMetaFile`, `lib/store/current-work-unit.ts`).
Neither is an in-repo decode, so Task 1.2.d leaves both untouched.

## Meta fixtures to convert

Task 2.4.b's surface: every test that fails once the setters throw on an unanchored meta or the flat-bullet fallback
is gone. Derived at `a731316ce` by two runs of the unit and integration suites in a disposable clone. The first had
`parseMetaProjectionRecord` throwing wherever `parseCoreTable` finds no core table — a meta in the bullet form, or one
with no H1: 268 unit tests fail across 30 files and 79 integration tests across 7. The second had each exported setter
throw first on a meta with no H1 or no `---` after it: 21 tests fail across 5 files, every one on a missing closing
`---`. The unchanged clone fails none. The counts are failing tests per file. The end-to-end files were found by
searching for a `**State:**` bullet, not run; the end-to-end batch settles its set by running that suite with both
throws in a disposable copy, and a search finds `e2e/session-init-remote-boundary.e2e.test.ts` building a meta with no
closing `---` too.

Some failures are not fixtures. `meta-reader.test.ts` holds the fallback's own tests, which Task 2.6.b turns into
refusal cases. Part of `in-flight-derivation.test.ts`' and `ready-mine-source.test.ts`' failures come from the two
advisory readers that build their empty record with `parseMetaRecord("")`, which Task 2.6.a replaces. The Lite
`status.md` fixtures in `active.test.ts` and `wu-resolution.test.ts` convert like any other meta.

| Batch                    | File (under `__tests__/`)                                 | Failing |
| ------------------------ | --------------------------------------------------------- | ------: |
| Meta reader and checks   | `unit/active/meta-reader.test.ts`                         |      36 |
| Meta reader and checks   | `unit/scripts/validate-meta-spec.test.ts`                 |      13 |
| Meta reader and checks   | `unit/scripts/assert-roadmap-regenerated.test.ts`         |       1 |
| Meta reader and checks   | `unit/scripts/check-foreign-writes.test.ts`               |       1 |
| Meta reader and checks   | `integration/pre-commit-current-workflow.test.ts`         |       2 |
| Meta reader and checks   | `integration/validate-cohort-consistency.test.ts`         |       7 |
| Lifecycle and work units | `unit/work-unit/lifecycle-index.test.ts`                  |      19 |
| Lifecycle and work units | `unit/work-unit/composed-lifecycle-index.test.ts`         |      16 |
| Lifecycle and work units | `unit/work-unit/completed-index.test.ts`                  |       2 |
| Lifecycle and work units | `unit/work-unit/lifecycle-deps.test.ts`                   |       5 |
| Lifecycle and work units | `unit/work-unit/lifecycle-query.test.ts`                  |       2 |
| Lifecycle and work units | `unit/work-unit/rename-reference-sweep.test.ts`           |       1 |
| Lifecycle and work units | `unit/work-unit/side-effects/discharge-dep-edges.test.ts` |       8 |
| Lifecycle and work units | `unit/work-unit/verbs/promote-demote.test.ts`             |       1 |
| Lifecycle and work units | `unit/lib/store/current-work-unit-marker.test.ts`         |       8 |
| Lifecycle and work units | `unit/user-sync-current-wu.test.ts`                       |       1 |
| Lifecycle and work units | `unit/base-drift/current-adapters.test.ts`                |       4 |
| Lifecycle and work units | `unit/release/wu-resolution.test.ts`                      |       8 |
| In-flight, locus, roster | `unit/git/in-flight-derivation.test.ts`                   |      62 |
| In-flight, locus, roster | `unit/git/worktree-roster.test.ts`                        |       1 |
| In-flight, locus, roster | `unit/commands/active/in-flight.test.ts`                  |       8 |
| In-flight, locus, roster | `unit/commands/active/roster.test.ts`                     |       2 |
| In-flight, locus, roster | `unit/locus/derived-reader.test.ts`                       |       9 |
| In-flight, locus, roster | `unit/locus/derived-lifecycle-evidence.test.ts`           |       4 |
| In-flight, locus, roster | `unit/locus/subject-meta-active-extensions.test.ts`       |      21 |
| In-flight, locus, roster | `unit/session-init/current-wu-reconcile.test.ts`          |       3 |
| In-flight, locus, roster | `integration/active.test.ts`                              |      52 |
| In-flight, locus, roster | `integration/exact-target-read-isolation.test.ts`         |       1 |
| In-flight, locus, roster | `integration/user-notes-compaction.test.ts`               |       1 |
| Status and views         | `unit/status/project-view.test.ts`                        |      13 |
| Status and views         | `unit/status/ready-mine-source.test.ts`                   |       4 |
| Status and views         | `unit/status/roadmap-conflict-auto-remedy.test.ts`        |       1 |
| Status and views         | `unit/status/roadmap-regeneration-assert.test.ts`         |       4 |
| Status and views         | `unit/status/user-view.test.ts`                           |       6 |
| Status and views         | `unit/handlers/view.test.ts`                              |       4 |
| Status and views         | `integration/status-project.test.ts`                      |      13 |
| Status and views         | `integration/status.test.ts`                              |       3 |
| End to end               | `e2e/session-init.e2e.test.ts`                            |       — |
| End to end               | `e2e/status-lifecycle.e2e.test.ts`                        |       — |
| End to end               | `e2e/teardown.e2e.test.ts`                                |       — |
| End to end               | `e2e/view.e2e.test.ts`                                    |       — |
| End to end               | `e2e/wu-reconcile.e2e.test.ts`                            |       — |
| End to end               | `helpers/session-envelope-compat.ts`                      |       — |

The second run's failures, by file. The bullet-form fixtures among them — in `discharge-dep-edges.test.ts`,
`current-wu-reconcile.test.ts`, and `exact-target-read-isolation.test.ts`, and `setMetaTitle`'s CRLF case in
`meta-reader.test.ts` — take the core table and the closing `---` together. The rest carry an H1 and a core table and
take only the rule: seven `normalizeMetaCoreTable` cases in `meta-reader.test.ts`, the four asserting a malformed table
among them, so each still meets its own table error; and `format-plan.test.ts`' meta, which reaches
`normalizeMetaCoreTable` through the format plan's meta route (`planMetaFile`, `lib/markdown/format-plan.ts`).

| Batch                    | File (under `__tests__/`)                                 | Setter throw |
| ------------------------ | --------------------------------------------------------- | -----------: |
| Meta reader and checks   | `unit/active/meta-reader.test.ts`                         |            8 |
| Meta reader and checks   | `unit/markdown/format-plan.test.ts`                       |            1 |
| Lifecycle and work units | `unit/work-unit/side-effects/discharge-dep-edges.test.ts` |            8 |
| In-flight, locus, roster | `unit/session-init/current-wu-reconcile.test.ts`          |            3 |
| In-flight, locus, roster | `integration/exact-target-read-isolation.test.ts`         |            1 |

`helpers/session-envelope-compat.ts` builds the fixture for `e2e/session-envelope-compat.e2e.test.ts` and
`benchmarks/session-envelope-validation.ts`. A file the base branch gains before landing is found by the same runs at
the final base merge, as the spec's § 12 converts arriving records.

---
