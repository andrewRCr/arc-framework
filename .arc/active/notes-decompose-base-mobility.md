# Notes: decompose-base-mobility

Working notes for this work unit. Findings here are verified against source unless marked otherwise.

---

## Held task-audit findings

Surfaced by a fresh-context adversarial pass over the spec and the in-progress task list, then verified against
source. The three `blocker` findings are resolved in `spec-decompose-base-mobility.md`; everything below is
**open** and applies to the task list, which is being repaired rather than rebuilt.

Severity is the reviewer's materiality claim. Disposition stays open until the repairing session acts.

### Phase 1 — descendant landing validator

- **`major` · The extra-path check refuses every real candidate unless the receipt path is excluded.** The
  existing exact-base implementation compares the prepared-base-to-candidate diff against the transition patch
  **plus** `v3DecomposeReceiptPath(receiptId)`. The receipt path is never in the patch (the patch derives from
  managed path results) yet is always in the diff, so a validator built literally from the current task text
  refuses 100% of well-formed candidates on their own receipt blob.

- **`major` · The ancestry-reader bullet reads as a repo-wide refactor.** Seven `merge-base --is-ancestor` call
  sites exist across errand, user-sync, teardown, and sync-status — subsystems this work unit otherwise never
  touches. State whether the new seam migrates them or only serves this validator.

- **`minor` · The validator's success arm is never stated.** `V3DecompositionMismatch` is `{kind, locus?}` with no
  success arm; the core always pairs it inside a discriminated union. Three subtasks currently imply three
  different return shapes (a mismatch, "the verdict", a recovery action).

- **`minor` · The extracted readers publish an undocumented tri-state.** `readTreeEntry` returns
  `GitTreeEntry | null | false`, where `null` is absent and `false` is malformed/duplicate/unreadable, and
  `stateMatches` currently collapses `false` into a plain mismatch. The non-regular-object refusal depends on
  telling those apart.

### Phase 2 — descendant-current integration anchor

- **`major` · Two exact-base tree bindings in the adapter are unnamed, and relaxing them is a safety decision.**
  `landingFor` takes `resultHead` / `resultTree` from the **current base** commit, which must instead come from the
  located landing commit. Separately, the adapter refuses unless `candidate.tree === base.tree` — always false
  under an advanced base. That equality is currently the integrity link between anchor and live base; what
  replaces it (nothing, landing-commit tree equality, or the ancestry proof alone) is undecided.

- **`major` · The descendant proof's shape is unspecified** although one task produces it and another consumes it.
  The producer is pure and performs no ref or history lookup, so it can only trust what it is handed — but no
  field, type, or safety property is named.

- **`minor` · The result-union task has no behaviors and no statement of what it changes.** Admitting a descendant
  base may need no new arm at all.

- **Fresh drift from PR #403** (merged into this branch): `ConfiguredBaseDecompositionAnchorResult` now carries
  optional `ref` / `record` fields on refusals, and receipt selection distinguishes namespace corruption from a
  version conflict. Re-ground Phase 2 against current source before repairing it.

### Phase 3 — base advancement command

- **`major` · A literal single-declaration mode derivation silently changes error routing.** The schema's
  exclusivity refinement counts five modes; the machine-readable predicate and the handler's stderr branch are
  those five **plus** `--continuation`, which is not a mode. Deriving all three from one mode list moves
  `--continuation` parse errors from stderr onto the interactive refusal path — a behavior change invisible to the
  regression test as currently written.

- **`major` · Two repeatability behaviors contradict each other.** "A repeated invocation against an
  already-advanced candidate is idempotent" sits directly beside "a second base movement after advancement
  refuses." One reading makes the command one-shot per candidate, defeating its own goal whenever a review window
  is long enough for the base to move twice; the other duplicates an existing mid-merge refusal. They imply
  materially different state tracking.

- **`minor` · No module or dispatch home is named**, unlike every other phase. Existing modes share a dispatch
  convention — canonical JSON to stdout, `reason` plus `remedy` to stderr with a non-zero exit — that no task
  currently requires and that end-to-end coverage will assume.

### Phase 4 — recovery vocabulary

- **`major` · No cause carries "unavailable immutable-pair binding", and the only available carrier is forbidden.**
  The core's recovery-cause union has seven arms, none representing binding unavailability. Routing on the mismatch
  `locus` is ruled out by this phase's own design decision; constructing the action at the validator is ruled out
  by Phase 1's. Neither phase currently owns the decision.

- **`major` · `committed-candidate` covers states this command cannot repair.** The underlying refusal fires for a
  committed **preparation** record and an invalid record as well as a committed receipt, and the authorizing facts
  are identical in all three cases. So "whenever the established facts authorize the command" cannot discriminate,
  and a committed preparation would be handed an advance-base invocation that later refuses — replacing an honest
  dead end with a misleading route.

- **`minor` · One planned behavior is unreachable.** `committed-candidate` is produced at exactly one site; the
  finalization adapter emits only other causes. An assertion that both feeding paths reach the new arm for that
  cause exercises a shape that does not exist.

### Phase 5 — acceptance and boundaries

- **`major` · The boundary proof's forbidden identifiers do not exist in the repository.** Source-graph identifier
  absence is a real mechanism, but planning-lane and CODEOWNERS strings appear only in review-gate test fixtures,
  and extraction source-thinning has no symbols at all — they belong to an unbuilt sibling. The list would have to
  be invented, and a wrong list reports assurance it cannot support.

## Verified-sound, do not re-derive

Checked against source this session; re-verifying costs time and finds nothing.

- All five Git read helpers are module-private in the exact-base anchor adapter — extraction is genuinely required.
- The core tree-snapshot reader is exported and parameterized by head, and derives incoming edges from every meta
  in the tree. It also loads source-artifact blobs the dependency check does not need.
- The anchor has exactly four consumers, all taking it structurally through a resolved-status wrapper: local
  cleanup, the claim-retirement gate, landed-handoff emission, and the graduation transaction behind work-unit
  launch. The last captures an anchor-policy refusal whenever the anchor does not resolve.
- Receipt identity is invariant under base movement — it digests origin, source branch, and source head only — so
  the same-path refreshed receipt commitment holds. Preparation identity is **not** invariant: the preflight digest
  covers the whole machine block including the result base.
- The prepared-base-to-candidate diff is the correct pair for the candidate's own transition, stable wherever the
  base moves. The current-base-to-candidate diff is not, and would read unrelated base advancement as reverted
  paths.

---
