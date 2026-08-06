# Notes: decompose-transition-record

## Consumer-trace map — verified loci per cluster

Source-verified starting points for the per-cluster consumer traces (readers of receipt / retirement state as of
spec authoring):

- **Disposition query** — `packages/arc-framework/src/lib/work-unit/retirement-disposition-query.ts`:
  kind-branched — rename → `retarget` + `targetSlug`, discard → `abandoned`, relocate → `absent`; v3 → edges by
  dependent with duplicate-dependent and `edgeId`-match guards. `qualityOf` reads v2 `inventoryRead`; nothing
  anywhere branches on the value.
- **Dependency discharge** — `packages/arc-framework/src/lib/work-unit/side-effects/discharge-dep-edges.ts`:
  branches on `retarget` (recursive rename-chain resolution) and `abandoned`; carries `evidenceQuality` as pure
  pass-through (line ~295); conflict reasons include the enumeration statuses.
- **Reference reconcile** — `packages/arc-framework/src/lib/work-unit/reference-reconcile.ts`:
  `enumerateReferenceTransitions` maps v3 → `decompose`, receipt rename → `rename` + `targetSlug`, discard →
  `removed`; relocate is skipped.
- **Enumeration** — `packages/arc-framework/src/lib/work-unit/retirement-record-enumeration.ts`: fail-closed
  namespace validation ("invalid bytes cannot be classified as unrelated evidence"); `version-conflict` is
  produced only by duplicate digest-id with differing content; the git adapter reads one ref's current tree
  only, so historical old-format records cannot poison current reads.
- **Teardown authorization** —
  `packages/arc-framework/src/lib/work-unit/git-retirement-authorization-context.ts`:
  `readReceiptCandidates` looks up abandon + park-planning receipts by `receiptId` (base and direct-parent
  lookups); `validateAbandonResult` reads `source.head` + `source.artifactDigest` for the conservation proof;
  `validateGitRetirementReceiptEvidence` revalidates husk receipt evidence; decompose receipts deliberately
  carry no teardown authority on this path.
- **Husk stamps** — `packages/arc-framework/src/lib/git/worktree-marker.ts`: persists
  `{kind: "receipt", receiptId, transition}` evidence refs; `huskEvidenceMatchesAuthorization` branches on
  transition + `expectedLifecycle`, both derivable from transition kind.
- **Park landing** — `packages/arc-framework/src/lib/work-unit/park-planning-landing.ts`: the
  partial-protection base-side arm authenticates the park transition commit by its exact receipt (`receiptId`
  recomputation + exact tree entry); the relocation comparison is already structural (blob oids).
- **Park / resume** — `packages/arc-framework/src/lib/work-unit/verbs/park-resume.ts`: resume reads
  pointer-records and metas only, never receipts.
- **Launch readiness** — `decompose-launch-readiness.ts` (`adaptProjectReadinessProvider`, ~line 258): wraps
  `depsOnlyReadinessProvider`; the six `provider-*` refusal codes describe the adapter contract itself.
- **Live records** — nine files in the retirement namespace: five abandon, two rename, one decompose
  (`chunked-delivery`, empty `incomingEdges`), one park-planning (`decompose-extraction`, branch gone locally
  and on origin).

## Refusal-code posture

The corpus carries 92 distinct typed refusal codes. Typed CLI-computed refusals are correct; the recurring
defect is a missing precomposed remedy — with one, code count costs the executing agent nothing; without one,
even ten force improvisation. Codes describing solution-invented states go when their states go (subtractive
only, per the spec's guards). Remedy authoring belongs to `decompose-finalization-diagnostics` — and that member
may be more justified than its hold suggests; revisit it first when re-planning the held members.
