# Analysis: review-chunking

## First-run field evidence (2026-07-21)

> _The first real Mode B run — a review-only retrofit executed ad hoc against `review-architecture`'s change set
> during its pre-integration review (2026-07-21). Empirical grounding for the boundary doctrine._

- **Setup.** Mode B ran against a 307-file / ~24.4k-insertion change set. Eight path-scoped passes covered 10,789
  lines and produced 37 findings: 12 real, 7 advisory, 13 false, 5 unresolved. The mechanism works — but its cost
  profile is specific enough to design against rather than rediscover.
- **Cohesion predicts accuracy far better than size.** The smallest, most self-contained chunk (372 lines, provider
  adapters) scored 5 real / 1 false. False positives concentrated in chunks that cross-reference other chunks —
  decisively in the _critical_ band: all three Criticals were false, each asserting a symbol undeclared when its
  declaration sat in a different chunk. Draw boundaries on contract cohesion, not line budget; a boundary splitting
  a declaration from its consumers manufactures high-severity noise.
- **Type-check before triage.** A full type check refutes that entire class in seconds — three Criticals became
  three dismissals at near-zero cost. Excluding test directories from the chunk set makes every
  verification-dimension finding unreliable: a reviewer blind to the tests reports proven behavior as unproven.
- **Guidance must read distinct from code criteria.** Injected review guidance bled into the judgement — the rubric
  was applied as a specification the _code_ must satisfy, producing a finding that a baseline constant lacked a
  dimension actually contributed by a separate augmentation layer.
- **Scoping axis.** The only bounded scoping axis available today is path-shaped (a directory plus a base ref); the
  commit-range flag scopes a suffix to HEAD, not a bounded range, so a chunk is effectively one directory. Provider
  rate limiting (five reviews per hour) is a real planning constraint on chunk count.
- **Corroborates the retrofit conclusion.** The run is a review decomposition with no merge-topology change — one
  branch, one PR, merging once; only the review surface was carved. No stacking, no integration branch, nothing
  rewritten.

## Paired boundary comparison (prepared 2026-07-23)

### Fixed target and evaluator configuration

The held-out target is `session-locus-model`, which did not participate in authoring the chunk doctrine. It is a
mixed code, test, workflow, strategy, and work-unit-record change large enough to trip both configured attention
thresholds.

```json
{
  "schemaVersion": 2,
  "semanticsVersion": "review-gate/v2",
  "kind": "change-set",
  "repositoryId": "40a11822-248f-4be0-ae17-c24dfb4ae35a",
  "baseRef": "main",
  "diffBaseSha": "826427f21b44fe9d1ee38feb1096ca0254bebddd",
  "diffBaseTree": "8f8dc2a0acf6a9fbc9230a9cf71934df16bbcf62",
  "headSha": "f84f4c56814711559faaed8e0755da5a56b16940",
  "headTree": "0c4c2cc71c2adc44ce76f94cfe63e31d9ee701b5",
  "targetId": "sha256:dc5ef971f55d49a63dab10a67349f61b8fe2cb2af389f7ed94dd1bb266cdeb8d"
}
```

The immutable diff contains 325 files, 38,997 insertions, 3,451 deletions, 42,448 changed lines, and 1,412
zero-context hunks. Its canonical zero-context patch digest is
`sha256:b1e8ebf21e5dc83130efca65cacee46e162cb7153fe52762bdd339e6502ca5db`. These coordinates and digest identify
the complete changed-hunk set; either tree moving invalidates the comparison.

Both arms use fresh non-author local evaluator contexts at the same inherited primary capability with no model
override, the complete `implementation-audit/v1` rubric, identical structured report shape, and the same exact
checkout. Each arm stays blind to the other arm's map and reports until both raw snapshots and aggregate results
exist.

### Baseline map — naive path scopes

The baseline uses first-match path partitioning without moving declarations toward consumers.

| Scope     | Exact path rule                                            |   Files |      Lines |     Hunks |
| --------- | ---------------------------------------------------------- | ------: | ---------: | --------: |
| B1        | `packages/arc-framework/src/lib/**`                        |     108 |     16,642 |       355 |
| B2        | Remaining `packages/arc-framework/src/**`                  |      23 |      2,921 |       260 |
| B3        | `packages/arc-framework/__tests__/unit/**`                 |     103 |     12,602 |       262 |
| B4        | Remaining `packages/arc-framework/__tests__/**`            |      38 |      4,618 |       186 |
| B5        | Package guidance, package metadata, root, and CI remainder |      24 |      1,354 |       173 |
| B6        | `.arc/**`                                                  |      29 |      4,311 |       176 |
| **Union** | **Every target path exactly once**                         | **325** | **42,448** | **1,412** |

Its seam owns source-to-test references, library-to-handler and CLI use, package-to-project projection, and the
cross-directory locus/errand/work-unit/session contracts that the path split separates.

### Treatment map — contract-cohesive scopes

The treatment uses ordered first-match predicates. Tests and operational guidance move with their governing
contract; unchanged repository, platform, and library declarations are external or pre-existing.

| Scope     | Contract closure                                                                          |   Files |      Lines |     Hunks |
| --------- | ----------------------------------------------------------------------------------------- | ------: | ---------: | --------: |
| T1        | Locus schemas, authority/state machinery, direct handlers/commands, fixtures, and tests   |      86 |     17,464 |        86 |
| T2        | Errand identity/lifecycle, grooming, housekeep/inbox routing, workflows/skills, and tests |      75 |     13,180 |       415 |
| T3        | Work-unit placement/lifecycle, worktree support, entry commands/workflows, and tests      |      71 |      4,313 |       435 |
| T4        | Session init/recovery/handoff/status, compaction/envelope support, guidance, and tests    |      49 |      2,812 |       314 |
| T5        | Shared CLI/handler adapters, cross-layer integration/e2e proofs, package metadata, and CI |      26 |      1,158 |        99 |
| T6        | Remaining design, planning, strategy, and two-copy methodology record                     |      18 |      3,521 |        63 |
| **Union** | **Every target path exactly once**                                                        | **325** | **42,448** | **1,412** |

The treatment seam owns the shared locus facts consumed by T2–T4, errand-to-work-unit transitions, placement and
session recovery/status behavior, T5's cross-contract composition, and runtime-to-methodology/two-copy coherence.

### Coverage and identical arm protocol

For both maps, `change-set − union(scopes) = empty`: file, changed-line, and zero-context-hunk totals equal the
canonical target, and ordered first-match assignment prevents overlap. Each arm follows this sequence:

1. Launch one fresh bounded evaluator context per scope with only the exact target, current scope, explicit external
   or pre-existing annotations, and complete rubric.
2. Preserve each structured scope report as a raw snapshot before triage or aggregation.
3. Launch one fresh bounded seam context with the arm-specific seam ownership above and preserve its raw report.
4. Launch one fresh non-author aggregate context with the partition/coverage facts and structured raw reports. It
   may inspect targeted source loci, but does not load every scope body wholesale.
5. Emit one whole-target result for the arm. No scope or seam report has standalone authority, neither arm satisfies
   a review obligation, and the held-out target remains read-only.
