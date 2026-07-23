# Notes: decomposition-hardening

- [Failure-class × verb matrix](#failure-class--verb-matrix)
- [Forward-compat principle map](#forward-compat-principle-map)
- [Evidence, writability, and staging invariants](#evidence-writability-and-staging-invariants)
- [Cohortless placement invariants](#cohortless-placement-invariants)
- [Landed transform terminal invariants](#landed-transform-terminal-invariants)
- [Reference reconciliation authority and mutation invariants](#reference-reconciliation-authority-and-mutation-invariants)
- [Implementation & coordination seams](#implementation--coordination-seams)

## Failure-class × verb matrix

The parallel-era failure classes and how each verb exhibits them. `✅` marks a class confirmed live; the rest are
latent-but-structurally-shared (the root-cause fixes cover them). Useful as an execution checklist — each cell is a
case to verify a fix covers.

| Failure class                                             | decompose                | rename                             | abandon / park             |
| --------------------------------------------------------- | ------------------------ | ---------------------------------- | -------------------------- |
| **Checkout-local view** (`buildLifecycleIndex(cwd)`)      | source + edges blind     | ref-sweep blind                    | retire-only                |
| **ROADMAP-regen oracle timing** (live/remote-ref pre-del) | latent, **more exposed** | ✅ **confirmed live**              | share `reconcile-roadmap`  |
| **Reference-sweep completeness** (gone-slug mentions)     | `Depends On`-only        | ✅ **confirmed incomplete**        | n/a                        |
| **Non-self-healing residue** (orphaned branch/wt/subdir)  | remembered force cleanup | dir-name lags identity             | pre-landed close loses ctx |
| **Husk-consistency of worktree ops**                      | bespoke terminal         | ✅ **confirmed** (POSIX self-move) | park re-cuts on resume     |

`decompose` is _more_ exposed on the ROADMAP-oracle class, not less: its origin branch legitimately persists until
the receipt and transformed artifacts land, so `origin/plan/<slug>` remains live across the whole transform and
merge. The staged tracked-index projection must therefore suppress the retiring identity without treating early
branch deletion as the fix.

## Forward-compat principle map

Which check-doc principle each area answers (the check-docs adjudicated the open forks and all push the fixes into
the shared CLI substrate). Cite the specific principle when validating an area's implementation against its
check-doc.

- **Storage-evolution** (`strategy-storage-evolution.md`) — resolve inventories against the WU-record _abstraction_
  (Principle 1/5), never a git-worktree/ref enumeration the backend dissolves; cross-WU repoint is a
  version-checked write (Principle 3); keep the retirement-record query storage-agnostic even though the current
  in-repo adapter writes under `.arc/system/.internal/retirement-receipts/` (Principle 2).
- **Procedure-evolution** (`strategy-procedure-evolution.md`) — cleanup eligibility, successor derivation, and
  dispatch are CLI-computed (Principle 1); emitted argv / text is typed and precomposed CLI-side (Principle 6); new
  arms land as typed cut-map / result / envelope fields, not prose conditionals (Principle 2); workflow prose
  invokes verbs and offers their actions rather than narrating mechanics (Principle 3).
- **Knowledge-evolution** (`strategy-knowledge-evolution.md`) — the substrate is a genuine multi-consumer fan-in
  (four verbs), so consolidating its shared vocabulary is on-model, not premature (Principle 6); the one new
  load-bearing term (flat-sibling / `cohortless`) is defined once in the spec, while area 3's rename-move marker is
  an operational projection reusing the husk stamp rather than minted terminal vocabulary (Principle 7).

## Evidence, writability, and staging invariants

Composed semantic truth and filesystem authority are separate projections. Per slug, retain the selected
project-readiness record and the current-tree candidate. A `writablePath` exists only when their canonically
normalized semantic payloads match completely: slug, location, state, owner, priority, cohort, dependencies, and
scheduling. Ref-qualified, linked-worktree, remote-only, and divergent sources add knowledge only. The transform
subject itself must have `writablePath`; otherwise the verb refuses before joining a source path to the checkout
root.

Decompose preparation is the durable carrier for the prepare-time read. New preparations use exact schema v2,
persist `inventoryRead`, and derive their locator from the future schema-v2 receipt identity. Exact v1
preparations stay decodable and finalize through the unchanged v1 contract. A post-restart finalization compares
its fresh composed read with the persisted fact; it never rewrites history by substituting fresh quality for
prepare-time quality.

Rename has no independent mandatory fetch-and-throw before that composed read. Its composed oracle owns bounded
refresh; an unreachable origin contributes `degraded` quality and the transform proceeds against reachable truth.

Current finalized receipts and an in-flight exact-v1 preparation already staged in the legacy namespace take a
narrow migration path: authenticate the computed receipt identity, relocate identical bytes to the canonical
namespace, and stage the legacy removal outside the authorized transition patch. A preparation then continues v1
revalidation/finalization. The validator recognizes the authenticated byte-identical relocation pair, admits
legacy removals, and permits no staged result beneath `.arc/.internal/`.

Receipt enumeration authenticates a subject only after the complete record decodes and its digest matches the
filename. Therefore any reachable malformed, unknown-version, digest-mismatched, symlinked, or otherwise
undecodable entry makes the whole enumeration `namespace-corrupt`; a subject query cannot classify it as
unrelated. Valid-plus-corrupt input fails closed identically.

Receipt-query resolution and read quality are orthogonal. The closed resolution set is
`absent | unique | ambiguous | unmapped-dependent | version-conflict | namespace-corrupt`; `unique` and
`unmapped-dependent` carry `inventoryRead: unknown | tree-only | reachable | degraded`. A mapped disposition stays
actionable with degraded or v1-unknown provenance, while an unmapped dependent stays conflicting at every quality.

ROADMAP composition observes a complete staged transition. Lifecycle execution defers its ROADMAP side effect
until the final meta writes and stage; direct-retirement execution stages source/result/additional inputs before
the existing index renderer runs, then writes and stages ROADMAP before recording the receipt. Worktree/index
divergence is a required test oracle: the output must follow the index.

## Cohortless placement invariants

`cohortless` is a value on the placement axis, not an origin-disposition shape. The affirmative
`assess-cohort-fit` result therefore carries `parentPosition` and the conditional `cohort` field alongside its
members, edges, and boundaries; `symmetric`, `extraction`, and the other transform shapes remain orthogonal.

One shared pure resolver projects that decision into the existing planned `WorkUnitPlacement`:

- `standalone` / `in-cohort` use the cut's declared cohort segments;
- `at-cap` uses the origin's existing cohort segments;
- `cohortless` uses the already-supported empty cohort coordinate, yielding
  `.arc/backlog/planned/<member>/`.

The scaffold and retirement preparation/finalization consume that same projection. In particular,
`destinationArtifactPath`, allowed-path derivation, and final target resolution must not retain a separate
required cohort-string path rule.

A cohortless cut has no coordination destination. Its map therefore carries no `cohort-coordination` entry and no
`cohort-shared` source ownership; every conserved source has a destination-owned home. If the design contains
genuinely ownerless shared coordination, the cohort-fit result selects a cohort-backed placement instead.

Flat member metas remain complete canonical meta projections: `Cohort: [none]` records no membership. The draft
omits its cohort header, and no cohort directory or `cohort-*.md` is created. Workflow prose dispatches on the
CLI-computed placement for coordination, structural checks, and result language; it does not reconstruct paths.

## Landed transform terminal invariants

A retirement receipt recorded in the transforming checkout is evidence under construction, not cleanup authority.
`decompose --finalize` and `abandon` run before their ceremony commit, and full protection adds a merge boundary
after that commit. They return a typed pending-cleanup description but do not stamp / detach the worktree, delete
refs, or close the per-WU workspace.

Authority begins when the receipt and transformed result are reachable from the protection-aware base:

- full protection refreshes and reads `origin/<base>`;
- partial protection reads the local integrating base;
- branch-local or unmerged evidence remains non-actionable.

Session entry is the read-only discoverer, not the cleanup executor. It classifies still-branched receipt-backed
residue and offers ordinary `arc teardown <slug>`. That command reuses the existing teardown planner and its
receipt revalidation, exact-`HEAD` / cleanliness, remote-proof, husk, ref-cleanup, current-locus, and replay rails.
`--force` remains accepted for compatibility but selects no authority. The landed plan also owns idempotent
per-WU `runUserClose`; this is separate from teardown's existing identity-global user-surface reconcile. Deferring
the close preserves `SESSION-NOTES.md` for an interrupted or unmerged transform.

The shared retirement result carries subject, transition, authority, and independent
`branch | worktree | userWorkspace` projections with
`not-applicable | pending | completed | blocked`. Authority is
`{ kind: "receipt-backed", receiptId, authorityVersion } |
{ kind: "not-applicable", reason: "extraction" }`. Extraction takes the second arm and reports every cleanup leg
as `not-applicable`; receipt fields do not exist on that arm, though successor readiness may still be present.

Successor readiness is derived from a new member's complete projected dependency list — internal cut edges plus
allocated external dependencies. It becomes actionable only when the receipt and member artifacts are
authoritative. A unique ready member receives precomposed spawn-anchored `arc start <slug>` argv / text; multiple
ready members are listed without a selected action.

Rename path lag is an orthogonal operational projection on the ARC-owned worktree marker:
`renameMovePending = { oldSlug, newSlug, branch, head, from, to }`. It is mutually exclusive with `husk`;
successful / already-completed moves clear it, and terminal husking supersedes it. The session probe validates the
marker against live registration and emits an outside-worktree remedy, never the move itself.

## Reference reconciliation authority and mutation invariants

Reference-only dependents are not dependency dependents. Area 1's `{ retiredSubject, dependentSlug }` receipt
query answers a WU with a `Depends On` edge; area 4 also needs a storage-agnostic enumeration of valid retirement
transitions reachable from the current WU branch even when the retired slug appears only in an artifact filename
or prose. The current WU's committed history is the authority for its tracked artifact scan. A unique acyclic
rename chain composes through intermediate slugs to the final target; ambiguous or cyclic histories surface and
grant no rewrite.

Both reads feed one current-WU tracked operation, `arc wu reconcile [slug] --json`. Its closed plan separates
dependency edits, mechanically rewritable tracked references, and advisory findings. The dependency component
follows a unique acyclic rename chain to a final live slug or terminal decompose/abandon receipt, preserving
per-hop evidence quality and never writing an intermediate retired slug. The tracked-reference component captures
an exact content version per affected artifact; apply validates the whole current-WU path set before writing and
stages only that bounded set. Advisory prose and dangling decompose references remain read-only. The gitignored
identity-global user-reference verb stays separate because it has different authority and locking.

The exact slug-token rule is no adjacent ARC slug-alphabet character: `[a-z0-9-]`. JavaScript `\b` is not the
rule because a hyphen is a non-word character, so it would match `arc` inside `arc-framework`. Tests need both
prefix- and suffix-hyphen neighbors. Structured spans already owned by the mechanical sweep are excluded from the
advisory scanner.

Self-title rewriting is artifact-bound, not arbitrary-heading rewriting. A dedicated closed registry—not the
layout artifact-kind enum or the broad relocation matcher—pairs basename/H1 grammars:
`meta`→`Metadata`, `draft`→`Draft`, `spec`→canonical brief/outline/detailed `Spec (...)`,
`tasks`→`Task List|Tasks`, `notes`→`Notes`, `research`→`Research`, and `analysis`→`Analysis`. The basename must be
`<registered-prefix>-<sourceSlug>.md`, and only the first exact identity H1 is eligible. Later matching headings,
examples, mismatched basenames, unknown companions, and unrelated H1s remain content.

Only `USER-INBOX` Work Unit entries define a managed `WU_Target` contract. Its accepted value is the exact slug
with an optional `(planned|provisional)` suffix, which a rename preserves. `WORKING-MEMORY` and the current WU's
`SESSION-NOTES` are advisory prose surfaces; sibling WU workspaces are outside both scan and mutation scope.
Because this is identity-global state, only rename evidence reachable from the protection-aware base grants
mutation authority — refreshed `origin/<base>` under full protection, local integrating base under partial.
Unmerged branch-local evidence cannot change it.

The session/status probe is read-only. It emits typed findings and precomposed
`arc user reconcile-references --apply` argv. For authoritative, unambiguous evidence, the workflow may invoke
that dedicated verb; the verb takes the per-identity notes lock, re-reads the chosen disk surface, and writes
atomically. It deliberately leaves the canonical notes ref and materialized-baseline stamp unchanged. A disk-only
repair is therefore reported as disk-ahead drift until a later save/load materializes a new baseline, rather than
being hidden as already synchronized.

## Implementation & coordination seams

Where each area touches existing code and which sibling WUs own adjacent surfaces. Cross-references for planning
context — not a work queue for those WUs.

**Existing modules each area extends (not a parallel mechanism):**

- **Area 1 read** — switch `decompose`'s inventory source from `buildLifecycleIndex(cwd)`
  (`lifecycle-index.ts`) to `resolveComposedLifecycleIndex` (`composed-lifecycle-index.ts`), already the
  `arc status --project` index and already cross-worktree-aware. Extend its result to retain the selected semantic
  record and current-tree candidate; derive optional current-checkout `writablePath` only after complete normalized
  semantic agreement. Require it for transform subjects as well as in-transform dependents.
- **Area 1 write** — generalize `dischargeDepEdges` (`side-effects/discharge-dep-edges.ts`), which already rewrites
  a WU's own `Depends On` via `resolveDepStates` + `setMetaBulletFields`, into the single planner/applier consumed
  by lifecycle verbs, session detection, and `arc wu reconcile`. Its typed plan carries dependency,
  tracked-reference, and advisory components; area 4 extends the latter two without adding another command or
  planner. Dependency resolution follows unique acyclic rename chains through their final live or terminal
  disposition. The new machinery is the
  `{ retiredSubject, dependentSlug }` **receipt-discovery read** — the content-addressed store
  (`retirement-record-store.ts`, keyed by a digest of subject+transition+sourceBranch+sourceHead) cannot answer
  that projection today. Only receipts reachable from the dependent branch are actionable; a decompose receipt
  without that dependent's authored mapping returns `unmapped-dependent`.
- **Area 1 store** — relocate `RETIREMENT_RECORD_NAMESPACE` to
  `.arc/system/.internal/retirement-receipts/`; writers use only that path, the in-repo query adapter retains
  historical legacy-path reads, the enumerator returns global `namespace-corrupt` before subject projection on any
  undecodable reachable entry, and the commit validator rejects a staged result under root-level
  `.arc/.internal/` while allowing authenticated migration removals.
- **Area 2** — `parseCutMap` / `ParentPosition` (`decompose-cut-map.ts`) + the shared projection to
  `WorkUnitPlacement` + `scaffoldCohortMembers` (`verbs/decompose.ts`) + preparation/destination path projection
  (`decompose-retirement-projection.ts`).
- **Area 3** — factor and reuse `runTeardown` + `teardown-retirement-driver.ts` for landed receipt-backed cleanup;
  extend `runStaleWorktreeSweep` (`session-init/stale-worktree-sweep.ts`) to discover still-branched retirement
  residue as well as detached husks; defer per-WU `runUserClose` to that cleanup. The rename arm extends
  `runRename` / `resolveRenameWorktreeMove` / `reconcileWorktree` (`verbs/rename.ts`,
  `mutators/reconcile-worktree.ts`) plus the marker projection in `git/worktree-marker.ts`.
- **Area 4 tracked refs** — extend `sweepRenameReferences` (`rename-reference-sweep.ts`) past
  `setMetaTitle`'s meta-only H1 rewrite in `mutators/rewrite-renamed-meta.ts`; add reachable transition
  enumeration to the retirement-record domain query, unique-chain composition, the separate closed self-title
  registry, and current-WU artifact scanning independent of dependency-edge discovery. Feed mechanical edits and
  advisory findings into the shared `arc wu reconcile` plan, with per-file version guards and bounded staging.
- **Area 4 user refs** — extend the `USER-INBOX` parser / managed-field helpers only for the Work Unit
  `WU_Target` contract; compose the read-only status / `session-init` envelope with a dedicated
  lock-serialized apply command using the user-surface resolver and `atomicWriteFile`. Do not reuse save/load's
  materialized-baseline write, and do not enumerate sibling WU session directories.
- **Area 4 regen** — stage the complete transition before using
  `renderRoadmapFromIndexViewResult` through the `reconcile-roadmap` path (`status/` +
  `side-effects/readiness-regen.ts`); lifecycle and direct-retirement drivers need distinct ordering adaptations,
  but share one renderer.

**Cross-WU coordination seams** (record; route sibling notifications at planning close):

- `wu-lifecycle-state-model` — owns husk/terminal-state vocabulary, **unsettled**; area 3 uses an operational
  stamped marker (a derived projection), minting no lifecycle-state term. That WU may re-vocabulary the marker
  later without schema churn.
- `review-gate-right-sizing` — merge-guard boundary **settled**: area 1's `integrate`-time fail-closed reconcile
  lands at the integrate interlock, not RGRS's closed readiness union.
- `cohort-cut-coherence` — adjacent rail to area 2 (what a cohort absorbs on exit vs. the cohort-less split shape);
  coordinate, don't fold.
- `decomposition-doctrine` — demand driver (more cuts, earlier); soft precedence pairing, no hard edge.
- `pr-decomposition` — orthogonal axis (review-surface carving vs. concern splitting); keep cut-map and chunk
  vocabularies distinct.
- **`assess-cohort-fit` has four pending editors** — this WU (cohort-less verdict / `cohortless` value),
  `decomposition-doctrine`, `cohort-cut-coherence`, `pr-decomposition`. Sequence the method edits at each WU's
  grooming close so one surface doesn't churn four ways.
- **Integration order** — `review-chunking` ships before this WU integrates; a large candidate here reviews via
  `review-chunking`.
