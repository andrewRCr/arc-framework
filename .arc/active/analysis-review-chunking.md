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

The held-out target is `cli-command-inputs`, which did not participate in authoring the chunk doctrine. It is a
mixed declaration, handler, command, test, and work-unit-record change large enough to trip the configured line
attention threshold.

```json
{
  "schemaVersion": 2,
  "semanticsVersion": "review-gate/v2",
  "kind": "change-set",
  "repositoryId": "40a11822-248f-4be0-ae17-c24dfb4ae35a",
  "baseRef": "main",
  "diffBaseSha": "ebe446fe2506927ec88b944dd4a7b13feb4c048e",
  "diffBaseTree": "5d32a6b812bb204ef3e0727ec66b3fb98c7d6545",
  "headSha": "86a0d220dc87e01fed17308cddb13c5604d1a0b9",
  "headTree": "51d83d5b758b3a7ccadcc5165c713c598de5e3f4",
  "targetId": "sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e"
}
```

The immutable diff contains 97 files, 7,727 insertions, 1,244 deletions, 8,971 changed lines, and 672
zero-context hunks. Its canonical zero-context patch digest is
`sha256:19127f27f152d1f9da9c8cdf842edb5ad6a3cf9da50561b78b710b59b34a0500`. These coordinates and digest identify
the complete changed-hunk set; either tree moving invalidates the comparison.

Both arms use fresh non-author local evaluator contexts at the same inherited primary capability with no model
override, the complete `implementation-audit/v1` rubric, identical structured report shape, and the same exact
checkout. Each arm stays blind to the other arm's map and reports until both raw snapshots and aggregate results
exist.

### Baseline map — naive path scopes

The baseline uses first-match path partitioning without moving declarations toward consumers.

| Scope     | Exact path rule                           |  Files |     Lines |   Hunks |
| --------- | ----------------------------------------- | -----: | --------: | ------: |
| B1        | `packages/arc-framework/src/lib/**`       |     18 |     1,983 |      43 |
| B2        | Remaining `packages/arc-framework/src/**` |     43 |     4,213 |     516 |
| B3        | Tests, package metadata, and `.arc/**`    |     36 |     2,775 |     113 |
| **Union** | **Every target path exactly once**        | **97** | **8,971** | **672** |

Its seam owns source-to-test references, command-input declarations consumed by handlers and CLI registration,
Git/work-unit adapters consumed by commands, and project-record claims about the implementation.

### Treatment map — contract-cohesive scopes

The treatment uses ordered first-match predicates. Tests and operational guidance move with their governing
contract; unchanged repository, platform, and library declarations are external or pre-existing.

| Scope     | Contract closure                                                               |  Files |     Lines |   Hunks |
| --------- | ------------------------------------------------------------------------------ | -----: | --------: | ------: |
| T1        | Command-input declarations, resolution, inventory generation, and direct tests |     23 |     3,050 |      23 |
| T2        | CLI registration, interaction consumers, prompts, handlers, and direct tests   |     40 |     3,779 |     456 |
| T3        | Git/release/sync/work-unit adapters, cross-layer tests, and project records    |     34 |     2,142 |     193 |
| **Union** | **Every target path exactly once**                                             | **97** | **8,971** | **672** |

The treatment seam owns declaration-to-registration identity, interaction-context propagation into handlers,
repository capability discovery, Git executor behavior shared by T2 and T3, and record-to-runtime coherence.

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
