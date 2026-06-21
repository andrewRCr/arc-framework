# Task List: decompose-matrix

- **Design:** `spec-decompose-matrix.md`

---

## **Phase 1:** Cut-map input contract

_Purpose:_ The structured cut-map's boundary parser/validator and its versionable shape — the foundation every
downstream leg consumes. Authored as a single co-located surface so `cli-substrate-adoption`'s later zod swap is
a drop-in.

_Design decisions:_ Hand-rolled bespoke validator (zod is not yet a CLI dep); single boundary entry point under
`lib/work-unit/`; discriminated `{status: "rejected"} | {status: …}` result matching the shipped verbs
(`StubResult`); a `schemaVersion`-ready top-level object.

### `[x]` **1.1 Define the cut-map / `DecomposeParams` shape**

- _Goal:_ One typed contract describes a decomposition request — members, internal edges, distribution and
  dispositions, and the two entry kinds the new shapes need — versionable so a later zod migration reshapes
  nothing.

- _Outcome:_ `lib/work-unit/decompose-cut-map.ts` (types only; the validator joins it in 1.2). `DecomposeParams`
  is the versioned top-level shape — `schemaVersion` envelope (`DECOMPOSE_SCHEMA_VERSION`), origin
  `(phase, location)` + selected `TransformShape` / `ParentPosition`, optional `cohort`, `entries`, and
  `internalEdges`. Destinations are a `kind`-discriminated `CutEntry` union: `NewMemberEntry` (slug, own
  `workClass`, by-need `dependsOn`, allocated `receives`), `SurvivingOriginEntry` (the extraction entry kind —
  slug + keep-active/park `disposition`, no `receives` since it keeps the unextracted remainder), and
  `ExistingHomeEntry` (the heterogeneous entry kind — `target` + fold/atomic-edit `home` + `receives`). `receives`
  is left as section-label `string[]`, deferring the field-level encoding to settle with 5.2's allocation-map
  render.

### `[x]` **1.2 Build the hand-rolled boundary parser/validator**

- _Goal:_ A malformed cut-map is rejected at the command boundary, with a discriminated result, before any
  mutation runs.

- _Outcome:_ `parseCutMap(input: unknown): CutMapParseResult` in `decompose-cut-map.ts` — the single boundary
  entry point, returning the sibling-verb-shaped `{ status: "rejected"; reason } | { status: "parsed"; params }`.
  Validates the `schemaVersion` envelope, the origin `(phase, location)` (only `Planning`/`Active` sources), the
  matrix-axis enums, each entry by its `kind` discriminant, the internal-edge shape, and a per-shape member floor
  (`shapeFloorError`: symmetric/stub-source ≥ 2 new members; extraction = surviving origin + ≥ 1 extracted;
  heterogeneous ≥ 2 destinations). Reuses the sibling verbs' `cohort-path` + `slug` guards. 10 unit tests; the six
  reject behaviors plus extraction/heterogeneous accept paths. Format deserialization (file read + `JSON.parse`)
  stays the command's job, keeping this a drop-in zod-swap target.

## **Phase 2:** Incoming-edge re-point sweep mutator

_Purpose:_ The one greenfield surface — `lifecycle-deps.ts` exposes only the read side (`resolveDepStates`), so
the write-side sweep that re-points dependents off a retired origin is new code with no helper to extend.

_Design decisions:_ Direct reverse-dependency scan across `active/**` + `backlog/planned/**` (broader than the
cut-map's named dependents); re-point each hit to the delivering member(s) per the cut-map; resolves state from
logical `(phase, location)` + meta fields, never git inference (the ADR-022 guard the whole cohort honors).

### `[x]` **2.1 Reverse-dependency discovery over the index**

- _Goal:_ Every dependent of the origin is found — across `active/**` and `backlog/planned/**` — including
  dependents the cut-map never enumerated.

- _Outcome:_ `resolveReverseDeps(index, originSlug): string[]` in `lifecycle-deps.ts` — the reverse of
  `resolveDepStates`, iterating the lifecycle index's parsed `dependsOn` (not a text grep, so a prose mention is
  never a hit). Scoped to the re-pointable tiers (`active` + `planned`): a `completed` dependent is immutable and
  `provisional` is below the sweep's floor. Returns dependents in index order (active before planned); the origin
  never self-lists. 4 unit tests added to `lifecycle-deps.test.ts`.

### `[x]` **2.2 Re-point write to the delivering member(s)**

- _Goal:_ Each discovered dependent's edge is rewritten from the origin to the delivering member(s), leaving its
  other edges and field formatting intact.

- _Outcome:_ `repointDependsOn(content, originSlug, deliveringMembers): string` in the new `decompose-sweep.ts` —
  replaces the origin slot with the delivering member(s) at its position, keeps every sibling edge, collapses
  duplicates, and re-formats as a backticked identifier list via the shared `setMetaBulletFields` writer (one
  bullet touched, rest byte-stable). A meta not naming the origin returns byte-identical (no spurious edits), so
  the caller applies it unconditionally. 4 unit tests. With 2.1's discovery, the incoming-edge sweep's two
  halves — find dependents, rewrite each — are now both built; Phase 3's executor wires them over the filesystem.

## **Phase 3:** `runDecompose` executor — the four legs

_Purpose:_ The verb function in the `lifecycle-transition-core` executor family — fan-out orchestration over
primitives (not a single `executeTransition` edge), returning a structured result the workflow renders into the
allocation map.

_Design decisions:_ Performs only four legs — batch N-member scaffold, origin teardown via the reserved edges,
the re-point sweep (Phase 2), and ROADMAP regen. Does **not** edit existing artifacts (heterogeneous homes are
workflow-authored) and does **not** relocate the surviving origin (extraction-park is a separate `arc park`
step). Lives in `verbs/decompose.ts`, mirroring `runStub` / `runArchive` / `runPark`.

### `[x]` **3.1 Batch N-member cohort scaffold**

- _Goal:_ One call scaffolds N member subdirs with `meta-` + `draft-` skeletons, fields set from the cut-map and
  origin, placed correctly across all three parent-position arms.

- _Outcome:_ `scaffoldCohortMembers` (`verbs/decompose.ts`) — a direct fan-out writer over the fs seam, **not** N
  `executeTransition` / `runStub` calls, so ROADMAP regen fires once (3.3), not per member. Takes a single resolved
  `cohort` placement path: all three arms collapse to one placement, with the arm→path resolution (`cut-map cohort`
  for standalone / in-cohort, the origin's existing cohort for at-cap) and the origin-meta read for inherited
  `Origin` / `Owner` / `Priority` deferred to 3.3's wiring. `Class` is per-member from the cut; `Design` the
  member's own draft; `Depends On` merges outgoing + internal edges (deduped, never blanket-inherited). Draft
  skeleton rendered programmatically (`renderMemberDraft`, mirroring `template-draft.md`), per the `renderMetaFile`
  precedent.

### `[x]` **3.2 Origin teardown via the reserved edges**

- _Goal:_ The origin is retired through its position-appropriate reserved edge, a retired backlog stub leaves no
  orphaned cohort subdir, and the extraction shape skips teardown entirely.

- _Outcome:_ The teardown fires the reserved edge via `executeTransition` (verb `decompose`): a started
  (`planning`) origin tears down branch + worktree, a `planned` / `provisional` stub removes artifacts only, and
  the extraction shape fires no edge (origin survives). `pruneEmptyBacklogSource` lifted to a shared export in
  `relocate-artifacts.ts` — generalized to accept both repo-relative (relocate) and absolute (the origin-remove
  runner) paths via a tier-root walk — and called from the remove runner so a retired stub's emptied subdir is
  pruned without removing the occupied parent.

### `[x]` **3.3 Re-point wiring, ROADMAP regen, and structured result**

- _Goal:_ `runDecompose` composes the re-point sweep and ROADMAP regen and returns a structured account of what
  it did — the substrate the workflow renders into the allocation map.

- _Outcome:_ `runDecompose` (`verbs/decompose.ts`) orchestrates the four legs and returns `DecomposeResult`
  (members scaffolded, edges re-pointed, origin `retired` / `survived`). The sweep discovers dependents over the
  index (`resolveReverseDeps`, broader than the cut-map) and re-points each off a retired origin to the **full**
  new-member set — the cohort is the origin's new deliverable; the workflow's allocation map narrows specific
  edges as judgment. ROADMAP regen fires once per shape: carried by the teardown edge's `reconcile-roadmap`
  side-effect when one fires, driven directly (same handler) on the edge-less extraction shape. Every leg
  resolves state from `(phase, location)` + meta fields — never `git` inference.

## **Phase 4:** `arc decompose` command & end-to-end shape coverage

_Purpose:_ Surface the executor as a CLI command and prove every executable transform shape works end-to-end,
including a regression that the symmetric shape reproduces the prior hand-rolled result.

_Design decisions:_ `arc decompose <origin> --cut-map <file>` in the Orchestration category; the cut-map reaches
the command as a structured file (non-interactive by nature), read → parsed/validated → `DecomposeParams` at the
boundary, rejected before any mutation. Wired through `handlers/lifecycle.ts` + `cli.ts`, mirroring the sibling
verbs.

### `[x]` **4.1 Wire `arc decompose <origin> --cut-map <file>`**

- _Goal:_ `arc decompose` reads a cut-map file, validates it, and runs `runDecompose` — rejecting a malformed
  file before any mutation.

- **Strategies:** strategy-testing-methodology.md

- `[x]` **4.1.a Add the `decompose` handler in `handlers/lifecycle.ts`**
    - `handleDecompose` deserializes the `--cut-map` file (JSON), validates via `parseCutMap`, and dispatches
      `runDecompose`; a read/syntax failure, a validator rejection, an origin↔cut-map mismatch, and a missing
      `--cut-map` / origin each refuse before mutation in the sibling-handler shape.

- `[x]` **4.1.b Register `arc decompose <origin> --cut-map <file>` in `cli.ts`**
    - Registered alongside the lifecycle commands with the `--cut-map <file>` option.

- `[x]` **4.1.c Handler-level behavior tests**
    - 6 cases in `lifecycle-verbs.test.ts`: valid file executes; malformed file rejected before mutation; missing
      file rejected before parse; origin mismatch, absent `--cut-map`, and absent origin each refuse.

### `[x]` **4.2 Integration coverage of the executor shapes**

- _Goal:_ Each executable shape runs end-to-end against a fixture repo — origin disposition, member scaffold, and
  ROADMAP delta all asserted together.

- **Strategies:** strategy-testing-methodology.md

- `[x]` **4.2.a Symmetric shape** — started origin retired (artifacts removed, branch + worktree torn down, remote
  branch best-effort deleted), members scaffolded, a dependent re-pointed and staged — all on a real repo.

- `[x]` **4.2.b Extraction / origin-survives** — origin kept in place, only the extracted member minted (with its
  `Depends On` edge to the origin), no teardown edge.

- `[x]` **4.2.c Backlog-stub-source** — `planned/` stub at the cap decomposed in place, origin retired, emptied
  own-subdir pruned while the occupied parent cohort dir survives.

- _Outcome:_ `decompose-shapes.test.ts` runs all three shapes through the real binder seams. The symmetric run
  surfaced a latent bug in the shared `executor-context.ts` git-exec binding (`{ ...opts, cwd }` clobbered a
  per-call `cwd`), so the `worktree-clean` guard checked the base repo instead of the teardown-target worktree —
  masked for `park@Active` / `abandon` (base clean or cwd _is_ the worktree), but exposed here because the
  scaffold+sweep dirty the base before the teardown guard. Fixed to `{ cwd, ...opts }` (default repo, honor an
  explicit override); the executor-context cwd test was inverted from asserting-the-bug to pinning the override.

### `[x]` **4.3 Symmetric-shape regression fixture**

- _Goal:_ The symmetric shape reproduces the prior hand-rolled cohort result on a fixture, guarding behavior
  parity against the realized cell.

- **Strategies:** strategy-testing-methodology.md

- _Outcome:_ A golden test (`decompose.test.ts`) over a representative monolith → multi-member split (the shape
  that minted the lifecycle cohort) pins the full per-member field set — inherited `Origin`/`Owner`/`Priority`,
  per-member `Class`, own `Design`, dual-placed `Cohort`, by-need `Depends On`, and unset fields at their
  scaffold defaults — plus the in-cut-order re-point and member paths. Any drift in field composition or the meta
  projection breaks it, not just a behavior change.

## **Phase 5:** Workflow rewrite — judgment half

_Purpose:_ Rewrite `decompose-work-unit.md` to carry the judgment half (cut-map, conservation gate,
shape-selection) and call `runDecompose` for the mechanics, structured forward-compatibly with
`composable-workflows`.

_Design decisions:_ One workflow with the transform-shape arms as **whole conditional blocks** (hoistable to CW
fragments later); mechanics → `runDecompose`, judgment → the workflow; commit `Context` footer uses
`(maintenance)`. Each framework-file edit mirrors to the package source.

### `[ ]` **5.1 Rewrite `decompose-work-unit.md` over `runDecompose` with whole-block shape arms**

- _Goal:_ The workflow carries only judgment and calls `runDecompose` for all relocation / scaffold / teardown
  mechanics, with the four shapes authored as whole conditional blocks atop the existing parent-position arms.

- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

- `[ ]` **5.1.a Replace hand-rolled relocation/scaffold/teardown steps with a `runDecompose` call**
    - The workflow no longer authors `git mv` / `git rm` / stub-loop mechanics; it composes the cut-map and
      invokes the command.

- `[ ]` **5.1.b Author the four transform-shape arms as whole conditional blocks**
    - symmetric / extraction / backlog-stub-source / heterogeneous-home, each a self-contained block — no
      shape conditionals scattered through individual steps.

- `[ ]` **5.1.c Heterogeneous-home: workflow-authored direct edits riding the decompose PR**
    - Fold into a sibling stub / `draft-design` block and atomic edits to standing docs are authored in the
      workflow (same-concern, known-home, conservation-required) and recorded in the allocation map — never
      inbox-captured.

- `[ ]` **5.1.d Extraction-park as a separate `arc park` step**
    - The workflow sequences `arc decompose` then `arc park <origin>` for the park disposition; keep-active is a
      valid terminal outcome with no park.

- `[ ]` **5.1.e Commit/PR surface + package-source mirror**
    - Commit `Context` footer uses `(maintenance)`; mirror the rewritten workflow to the package source.

### `[ ]` **5.2 Generalize the conservation gate**

- _Goal:_ The gate asserts conservation under partial extraction (extracted subset only) and atomic-edit homes
  (a standing-doc destination), with the allocation map rendered into the PR description.

- **Strategies:** strategy-workflow-authoring.md

- `[ ]` **5.2.a Partial-extraction conservation**
    - Conservation is asserted over the _extracted subset_ only; the surviving origin is itself a cut-map entry,
      not a dropped section.

- `[ ]` **5.2.b Atomic-edit homes as valid destinations**
    - A standing doc edited in place is a valid home; the gate asserts the edit lands before the origin retires.

### `[ ]` **5.3 Active-state decomposition — extraction-first-class + full-split escape-hatch guard**

- _Goal:_ Extraction-from-Active runs first-class (origin stays Active, only unbuilt scope extracted), and
  full-split-from-Active is recognized and routed — never automated.

- **Strategies:** strategy-workflow-authoring.md

- `[ ]` **5.3.a Extraction-from-Active as the first-class Active path**
    - Maps onto the extraction shape: origin stays `Active` (branch + committed code untouched), extracted
      member(s) mint as `Planning`, only the unbuilt subset distributed.

- `[ ]` **5.3.b Full-split-from-Active recognition guard**
    - A whole-block precondition guard near the top of the workflow detects `Active` + committed code and routes:
      extraction-from-Active when the built code belongs to one member, else a pointer to the guidance section.
      It directs; it never runs git surgery (no `decompose@active` edge).

## **Phase 6:** Method & strategy documentation

_Purpose:_ The supporting documentation surfaces — the `assess-cohort-fit` cut-map extension and the
`strategy-work-organization` escape-hatch guidance — plus the errand-character framing the workflow states. Each
framework-file edit mirrors to the package source.

### `[ ]` **6.1 Extend `assess-cohort-fit` with the two cut-map entry kinds**

- _Goal:_ The method's cut-map output documents the surviving-origin and existing/atomic-home entry kinds (a
  data-shape change; the decision of _when_ to use them stays the method's existing judgment).

- **Strategies:** strategy-package-project-sync.md

    - Add the two entry kinds to § Output — the cut-map; mirror to the package source.

### `[ ]` **6.2 Escape-hatch guidance + errand-character framing in `strategy-work-organization`**

- _Goal:_ The strategy carries the full-split escape-hatch guidance in general git terms, and the
  errand-character of the stub-source / heterogeneous arms is stated.

- **Strategies:** strategy-work-organization.md, strategy-package-project-sync.md

- `[ ]` **6.2.a Escape-hatch subsection in § Decomposition**
    - General git terms (no `arc decompose --active`): extraction-from-Active first → `cherry-pick` of atomic
      commits for multi-member-built → interleaved-commit surgery is a commit-atomicity smell. Adopter-appropriate.

- `[ ]` **6.2.b Errand-character framing**
    - State that the backlog-stub-source and heterogeneous-home arms are errand-character (pure relocation, no
      design authored), run as a bounded few in-session increments; mirror to the package source.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `arc decompose` executes the **symmetric** shape end-to-end (origin retired, N members scaffolded with
  correct field inheritance, incoming edges re-pointed, ROADMAP regenerated), reproducing the prior hand-rolled
  result on a regression fixture.
- `[ ]` All four transform shapes have a named, reachable path: symmetric / extraction / backlog-stub-source via
  `runDecompose`; heterogeneous-home orchestrated by the workflow, fold / atomic-edit homes authored as direct
  edits that ride the decompose PR and appear in the allocation map.
- `[ ]` `arc decompose <origin> --cut-map <file>` consumes a structured cut-map file parsed/validated at the
  command boundary — a malformed cut-map is rejected before any mutation; the validator is a single co-located,
  hand-rolled, versionable boundary surface under `lib/work-unit/`.
- `[ ]` The batch N-member scaffold produces N members (N ≥ 2) with `Origin` inherited, `Design` / `Cohort`
  (dual-placed) / `Class` / `State` set, and `Depends On` distributed by actual need — across the three
  parent-position arms.
- `[ ]` The extraction shape's optional origin-park is a separate `arc park` step sequenced by the workflow, not
  a `runDecompose` flag; keep-active is a valid terminal outcome.
- `[ ]` The conservation gate asserts conservation under partial extraction and atomic-edit homes, with the
  allocation map rendered into the PR description.
- `[ ]` `assess-cohort-fit`'s cut-map carries the surviving-origin and existing/atomic-home entry kinds.
- `[ ]` Extraction-from-Active runs first-class (origin stays Active, only unbuilt scope extracted);
  full-split-from-Active is recognized by the workflow guard and routed to the `strategy-work-organization`
  guidance — no automated edge exists.
- `[ ]` The rewritten `decompose-work-unit.md` calls `runDecompose` for all relocation/scaffold/teardown
  mechanics and contains no hand-rolled relocation logic; its commit `Context` footer uses `(maintenance)`.
- `[ ]` The emptied-subdir prune fires on a retired backlog-stub-source origin (no orphaned cohort subdir).
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
