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
