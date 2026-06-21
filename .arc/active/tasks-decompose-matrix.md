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

### `[ ]` **1.2 Build the hand-rolled boundary parser/validator**

- _Goal:_ A malformed cut-map is rejected at the command boundary, with a discriminated result, before any
  mutation runs.

- **Strategies:** strategy-testing-methodology.md

- Build `test-first` (one behavior at a time):

    - A well-formed cut-map parses to a `DecomposeParams`.

    - A member with a missing/empty required field (slug, `Class`, distribution) is rejected with a named reason.

    - An unsafe or malformed cohort path is rejected (reuse the `cohort-path` guards the sibling verbs use).

    - An unknown or malformed entry-kind discriminant is rejected.

    - An unrecognized `schemaVersion` is rejected (the version envelope is enforced, not ignored).

    - A batch below the floor (fewer members than the selected shape requires) is rejected.

## **Phase 2:** Incoming-edge re-point sweep mutator

_Purpose:_ The one greenfield surface — `lifecycle-deps.ts` exposes only the read side (`resolveDepStates`), so
the write-side sweep that re-points dependents off a retired origin is new code with no helper to extend.

_Design decisions:_ Direct reverse-dependency scan across `active/**` + `backlog/planned/**` (broader than the
cut-map's named dependents); re-point each hit to the delivering member(s) per the cut-map; resolves state from
logical `(phase, location)` + meta fields, never git inference (the ADR-022 guard the whole cohort honors).

### `[ ]` **2.1 Reverse-dependency discovery over the index**

- _Goal:_ Every dependent of the origin is found — across `active/**` and `backlog/planned/**` — including
  dependents the cut-map never enumerated.

- _Approach:_ Reverse-lookup over the `buildLifecycleIndex` entries' parsed `dependsOn`, rather than a raw text
  grep — the index already carries the edges and the logical state, keeping the sweep arc-backend-safe.

- **Strategies:** strategy-testing-methodology.md

- Build `test-first` (one behavior at a time):

    - Returns every slug whose `Depends On` names the origin, spanning both the active and backlog tiers.

    - Returns empty when nothing depends on the origin.

    - Counts only genuine `Depends On` edges — an incidental mention of the origin name elsewhere is not a hit.

### `[ ]` **2.2 Re-point write to the delivering member(s)**

- _Goal:_ Each discovered dependent's edge is rewritten from the origin to the delivering member(s), leaving its
  other edges and field formatting intact.

- _Approach:_ Rewrite the `Depends On` bullet field via `setMetaBulletFields` (update-or-insert, preserves the
  rest of the meta); the origin → delivering-member(s) mapping comes from the Phase 1 cut-map.

- **Strategies:** strategy-testing-methodology.md

- Build `test-first` (one behavior at a time):

    - A dependent on the origin re-points to the single delivering member.

    - A dependent re-points to **multiple** members when the needed work split across several.

    - Sibling `Depends On` edges and the surrounding meta field formatting are preserved.

    - A no-op when no dependent names the origin (nothing rewritten, no spurious edits).

## **Phase 3:** `runDecompose` executor — the four legs

_Purpose:_ The verb function in the `lifecycle-transition-core` executor family — fan-out orchestration over
primitives (not a single `executeTransition` edge), returning a structured result the workflow renders into the
allocation map.

_Design decisions:_ Performs only four legs — batch N-member scaffold, origin teardown via the reserved edges,
the re-point sweep (Phase 2), and ROADMAP regen. Does **not** edit existing artifacts (heterogeneous homes are
workflow-authored) and does **not** relocate the surviving origin (extraction-park is a separate `arc park`
step). Lives in `verbs/decompose.ts`, mirroring `runStub` / `runArchive` / `runPark`.

### `[ ]` **3.1 Batch N-member cohort scaffold**

- _Goal:_ One call scaffolds N member subdirs with `meta-` + `draft-` skeletons, fields set from the cut-map and
  origin, placed correctly across all three parent-position arms.

- _Approach:_ Generalize the shipped single-member `arc stub --cohort` (`StubParams.cohort`) to a batch. Each
  member gets both a `meta-` (via `renderMetaFile`) and a `draft-` skeleton (from `template-draft.md`) — extending
  `runStub`'s meta-only scaffold. The executor writes **skeletons only**; the design _content_ distribution stays
  the workflow's conservation gate (Phase 5), honoring the executor's no-fabricate-content contract.

- **Strategies:** strategy-testing-methodology.md

- Build `test-first` (one behavior at a time):

    - Scaffolds N (≥ 2) member dirs under `backlog/planned/<cohort>[/<subcohort>]/<member>/`, each with
      `meta-<member>.md` + `draft-<member>.md`.

    - `Origin` inherited from the origin; `Design` set to the member's own draft; `State` `Planning`;
      `Class` taken per-member from the cut (not inherited).

    - `Cohort` dual-placed — in the meta **and** mirrored into the member draft's header.

    - `Depends On` distributed by actual need: outgoing edges only where the member genuinely depends; internal
      edges authored from the cut's delivery order; never blanket-inherited.

    - The three parent-position arms place members correctly: top-level cohort, sub-cohort, and at-cap lateral
      fan-out.

### `[ ]` **3.2 Origin teardown via the reserved edges**

- _Goal:_ The origin is retired through its position-appropriate reserved edge, a retired backlog stub leaves no
  orphaned cohort subdir, and the extraction shape skips teardown entirely.

- _Context:_ The reserved edges already exist in `lifecycle-transitions.ts` (`decompose@planning` fires
  `artifacts: remove` + `reconcileBranch: delete` + `reconcileWorktree: teardown`; `decompose@planned` fires
  `artifacts: remove` only). This leg fires the right one for the origin's position.

- _Approach:_ The `artifacts: remove` disposition does not run `relocateArtifacts`, so its emptied-subdir prune
  must be wired explicitly: lift `pruneEmptyBacklogSource` to a shared export and call it from the remove path
  (or from `runDecompose` after teardown) so a retired backlog stub leaves no orphaned subdir.

- **Strategies:** strategy-testing-methodology.md

- Build `test-first` (one behavior at a time):

    - A `Planning`-position origin fires `decompose@planning` (artifacts removed; branch + worktree torn down).

    - A `planned` backlog-stub origin fires `decompose@planned` (artifacts removed; no branch teardown).

    - The emptied-subdir prune fires on a retired backlog stub (via the lifted `pruneEmptyBacklogSource`) — no
      orphaned cohort subdir.

    - The extraction / origin-survives shape fires **no** teardown edge (the origin is kept in place).

### `[ ]` **3.3 Re-point wiring, ROADMAP regen, and structured result**

- _Goal:_ `runDecompose` composes the re-point sweep and ROADMAP regen and returns a structured account of what
  it did — the substrate the workflow renders into the allocation map.

- _Approach:_ The teardown edges carry the render side-effect, but the extraction shape fires no edge, so regen
  must be driven by the verb (via `reconcileRoadmap`) on **every** shape — not left to the edge alone.

- **Strategies:** strategy-testing-methodology.md

- Build `test-first` (one behavior at a time):

    - Invokes the Phase 2 sweep so incoming edges re-point as part of the run.

    - ROADMAP regen fires on every shape — including extraction, where no teardown edge fires: the origin drops
      out of In Flight (when retired); members appear in `backlog/planned/**`.

    - Returns a result describing members scaffolded, edges re-pointed, and origin disposition.

    - Every leg resolves state from `(phase, location)` + meta fields — never `git branch` / `git log` inference.

## **Phase 4:** `arc decompose` command & end-to-end shape coverage

_Purpose:_ Surface the executor as a CLI command and prove every executable transform shape works end-to-end,
including a regression that the symmetric shape reproduces the prior hand-rolled result.

_Design decisions:_ `arc decompose <origin> --cut-map <file>` in the Orchestration category; the cut-map reaches
the command as a structured file (non-interactive by nature), read → parsed/validated → `DecomposeParams` at the
boundary, rejected before any mutation. Wired through `handlers/lifecycle.ts` + `cli.ts`, mirroring the sibling
verbs.

### `[ ]` **4.1 Wire `arc decompose <origin> --cut-map <file>`**

- _Goal:_ `arc decompose` reads a cut-map file, validates it, and runs `runDecompose` — rejecting a malformed
  file before any mutation.

- **Strategies:** strategy-testing-methodology.md

- `[ ]` **4.1.a Add the `decompose` handler in `handlers/lifecycle.ts`**
    - Read the `--cut-map` file, parse/validate via Phase 1, dispatch to `runDecompose`; surface a rejection in
      the same shape the sibling verb handlers use.

- `[ ]` **4.1.b Register `arc decompose <origin> --cut-map <file>` in `cli.ts`**
    - Orchestration category, consistent with the existing lifecycle command registrations.

- `[ ]` **4.1.c Handler-level behavior tests**
    - Mirror `lifecycle-verbs.test.ts`: a valid file executes; a malformed file is rejected before mutation; a
      missing file is rejected.

### `[ ]` **4.2 Integration coverage of the executor shapes**

- _Goal:_ Each executable shape runs end-to-end against a fixture repo — origin disposition, member scaffold, and
  ROADMAP delta all asserted together.

- _Approach:_ Mirror the existing integration roundtrips (`park-resume-roundtrip.test.ts`,
  `archive-staging.test.ts`).

- **Strategies:** strategy-testing-methodology.md

- `[ ]` **4.2.a Symmetric shape** — live origin retired, whole draft distributed, N members minted.

- `[ ]` **4.2.b Extraction / origin-survives** — origin kept (keep-active), only the extracted member minted, no
  teardown edge, origin→member `Depends On` added.

- `[ ]` **4.2.c Backlog-stub-source** — `planned/` stub decomposed in place, origin retired, emptied subdir
  pruned.

### `[ ]` **4.3 Symmetric-shape regression fixture**

- _Goal:_ The symmetric shape reproduces the prior hand-rolled cohort result on a fixture, guarding behavior
  parity against the realized cell.

- **Strategies:** strategy-testing-methodology.md

    - Build a fixture from a known prior decomposition and assert `runDecompose`'s output matches the
      hand-rolled result (members, fields, re-pointed edges, ROADMAP delta).

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
