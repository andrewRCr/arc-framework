# Task List: Errand Transient Lifecycle

- **Design:** `spec-errand-transient-lifecycle.md`

---

## **Phase 1:** Port `arc errand leave`

_Purpose:_ Deliver the leave producer — persist a `paused` or `awaiting-merge` identity state with its per-state
proof, then close the local locus without retiring identity. One verb, ported whole with its dedicated unit
coverage, so the phase ends with the first production writer of the base deliverable's state pair.

_Design decisions:_ Adaptation, not transplant. The carve source (tag
`archive/session-locus-model-origin-f774446c0`) predates the base deliverable's integration tail. The ported
modules' substrate import surface is signature-stable on current `main` (`locus/mutation.ts`, `evidence`,
`reader`, and `identity-transaction` exports unchanged), so adaptation attention concentrates on behavioral
drift in the locus record store and close path rather than API reshaping — each ported file is still re-derived
against `main`, honoring the leave/close ordering contract as the base now implements it.

### `[ ]` **1.1 Port the leave composition and runtime** (leave + per-state-proof decisions; SC 1, 3)

- _Goal:_ `arc errand leave <slug> --state paused|awaiting-merge` persists the departing state and its exact
  head, then closes the local locus — primary returned to base or spawned worktree torn down — without retiring
  identity; local work that completes while cleanup fails surfaces as recoverable residue, never rewritten.

    - `[ ]` **1.1.a Port `lib/errand/leave.ts`** (165 lines at the tag)
        - Recoverable leave composition: read identity → authorize → persist transition → cleanup, with
          refusal/error vocabulary from `locus/schema`

    - `[ ]` **1.1.b Port `lib/errand/leave-cleanup.ts`** (72 lines at the tag)
        - `closeLeaveOccupancy` — the occupancy-close half of the leave/close ordering contract; consumes
          `leave.ts` result types and `locked-generation.ts`

    - `[ ]` **1.1.c Port `lib/errand/leave-runtime.ts`** (491 lines at the tag), re-derived against the current
      substrate
        - Per-state proof before the locus closes: `paused` requires the WIP head committed and pushed —
          `savedHead` equals the terminal branch head and is a proven ancestor of the fetched remote tip
          (`provePauseHead`); `awaiting-merge` requires the exact change request with recorded coordinates
          matching both the configured repository/base and the observed host object
        - The leave/close ordering contract lives in the runtime's sequencing over `leave-cleanup.ts` — persist
          state, close occupancy, pop the role with its expected generation, rederive the parent frame; verify
          that sequencing against the base's current close behavior rather than assuming the tag's
        - `observeExactChangeRequest` relocated: the tag defines it in `leave-runtime.ts`, but `main` now owns
          it in `change-request-lifecycle.ts` (where `close-runtime.ts` imports it) — drop the local definition
          and import from the new home; do not land a duplicate export on that seam

    - `[ ]` **1.1.d Confirm transition arms compose without edits**
        - `identity-transitions.ts` already carries the `pause` / `await-merge` arms and their refusal
          vocabulary; this task consumes them unchanged (spec scope boundary: producer, not owner)

### `[ ]` **1.2 Wire the handler, CLI registration, and exports**

- _Goal:_ The verb is reachable: `errand leave <slug>` registers with required `--state <paused|awaiting-merge>`
  and `--json`, dispatches through `handleErrandLeave`, and the leave modules export through `lib/errand/index.ts`.

- _Note:_ `handlers/errand.ts` drifted heavily since the carve — port the origin handler's shape onto the
  current handler conventions rather than diffing it in. Refusal messaging records a departure and never
  suggests promotion (`arc errand promote` owns that judgment).

### `[ ]` **1.3 Adapt the dedicated leave unit tests**

- _Goal:_ The ported leave surface carries its inherited proof — `__tests__/unit/errand/leave-locus.test.ts`
  (260 lines at the tag) lands adapted to the current substrate, and the
  `describe("errand leave result rendering")` block ports into the existing
  `handlers/errand-open-result.test.ts` at `describe` granularity — all green under `npm test`.

## **Phase 2:** Port `arc errand materialize`

_Purpose:_ Deliver the pickup half — bring a remote-only full-protection claim onto a machine that lacks it,
with ARC ownership provenance and a role record, accepting exactly the two left shapes and refusing everything
else.

### `[ ]` **2.1 Port the materialize-branch composition** (materialize decision; SC 4, 5)

- _Goal:_ `arc errand materialize <slug>` accepts an identity-only `paused` claim at its `savedHead`, or an
  `awaiting-merge` claim at its `changeRequest.headSha` whose change request is verified still open, and refuses
  `open` identities, branch-derived legacy candidates, changed or missing remote heads, and incomplete
  snapshots. The fetched remote tip must equal the recorded head exactly; preserving the recorded head only as an
  ancestor is insufficient.

- _Note:_ `prepareMaterializedBranch` gains a second consumer when the groom re-entry lane lands (a sibling
  deliverable) — port the composition's signature (`exec` / `remote` / `branch` / `expectedHead` /
  `existingLocal`) unmodified and wire only the errand handler here; `handlers/plan.ts` stays untouched. Its
  behavior does not port unchanged: the carve accepts a descendant remote tip with an advisory, while this spec
  requires exact-head refusal, so adapt that branch and its inherited test explicitly.

    - `[ ]` **2.1.a Port `lib/errand/materialize-branch.ts`** (139 lines at the tag)
        - `prepareMaterializedBranch` prepares the exact branch and nothing more — fetch from `origin`, require
          the fetched tip to equal `expectedHead` (refuse a missing, divergent, or descendant tip), and handle an
          existing local ref; ownership provenance, the role record, and change-request verification arrive
          through the open runtime the handler delegates to (2.2)

    - `[ ]` **2.1.b Verify the refusal set against the v3 identity schema on `main`**
        - `identity-record.ts` state shapes (`savedHead` / `changeRequest` nullability per state) are the
          acceptance oracle; partial protection has no remote branch and therefore no materialize path

### `[ ]` **2.2 Wire the handler, CLI registration, and exports**

- _Goal:_ `errand materialize <slug>` registers with `--json` and dispatches through `handleErrandMaterialize`,
  whose composition delivers the verb's guarantees: validate the exact resumable v3 shape → prepare the branch
  (`prepareMaterializedBranch`) → delegate to `openOrdinaryErrandAtRuntime` under a materialize-specific strict
  reentry policy, which writes ownership provenance and the `errand` role record → delete the exact created local
  branch on a failed open. For `awaiting-merge`, strict reentry accepts only exact-coordinate `open` /
  `requested-work` host truth and refuses `changed-head` or `unreachable`; ordinary resume keeps its existing
  advisory policy unchanged. Exports land in `lib/errand/index.ts`, mirroring the Phase 1 wiring shape.

### `[ ]` **2.3 Adapt the dedicated materialize unit and handler tests**

- _Goal:_ `__tests__/unit/errand/materialize-branch.test.ts` (81 lines at the tag) lands adapted and green,
  and the `describe("errand materialize result rendering")` block ports into the existing
  `handlers/errand-open-result.test.ts` at `describe` granularity. Replace the carve's descendant-tip success
  assertion with exact-head refusal coverage, and prove the materialize-specific change-request policy refuses
  `changed-head` / `unreachable` without weakening ordinary resume's advisory behavior.

## **Phase 3:** Port inherited end-to-end coverage and close the owned materialize gap

_Purpose:_ Land the cross-verb proof: the carved e2e blocks ported into the current suite, then owned
materialize coverage filled to close the origin review's open item.

_Design decisions:_ One combined test phase rather than per-verb slices — the roundtrip (leave → materialize →
resume) spans both verbs. The inherited e2e scope is three named blocks across three files, not a wholesale
move; each ports at `describe` / `it` granularity with harness helpers adapted to the current files' shapes.

### `[ ]` **3.1 Port the carved e2e blocks** (SC 1, 2, 3)

- _Goal:_ Inherited end-to-end behavior lands in the current suite: leave proofs (pause push-proof,
  awaiting-merge coordinate match), refusal paths, materialize with exact provenance, and the resume tail
  through the base's open driver returning identity state to `open` — with no WU meta, task list, or
  SESSION-NOTES created.

    - `[ ]` **3.1.a Port the `describe("arc errand leave")` block** into `errand.e2e.test.ts` (~28 lines at
      the tag)

    - `[ ]` **3.1.b Port the paused-Errand materialize `it`** ("materializes a remote-only paused Errand with
      exact provenance") into `locus-mutations.e2e.test.ts`, beside its surviving work-unit sibling

    - `[ ]` **3.1.c Port the awaiting-merge resume `it`** ("resumes an awaiting-merge tail from an ordinary
      open change request") into `locus-errand-roundtrip.e2e.test.ts`, plus any adjacent paused-resume blocks
      the tag carries in that file

### `[ ]` **3.2 Close the owned materialize e2e gap — verify, then fill** (SC 6; open item)

- _Goal:_ The materialize path is asserted end-to-end against real v3 Errands — paused at `savedHead`,
  awaiting-merge at its change-request head, and a failed-open rollback that deletes the exact created local
  branch and leaves no markerless worktree — with no seeded legacy-record reliance. The awaiting-merge lane also
  proves a moved change-request head is refused rather than admitted under ordinary resume's advisory policy.

- _Note:_ Verify first what the ported 3.1.b test already proves; the net-new work is the remainder (likely
  the awaiting-merge success arm and the failed-open rollback). This closes the origin review's `E5-V1`
  materialize half — the one piece of net-new test authorship in the WU.

## **Phase 4:** Replace legacy discovery and flip the workflow surface

_Purpose:_ Make exact identity state the materialization candidate authority, then make the verbs the documented
path. The current branch-oracle producer still advertises record-less legacy branches, while the shipped workflow
docs treat a remote-only Errand identity as retained evidence and code-side docs still describe the raw
`git worktree add` flow this WU replaces.

### `[ ]` **4.1 Replace branch-derived materialization discovery with identity-backed candidates** (SC 4, 5)

- _Goal:_ `errandState.value.materializable.candidates` contains only remote-only ordinary v3 identities in
  `paused` or `awaiting-merge` state that `arc errand materialize` can actually accept — never an `open` identity
  or a record-less branch-derived legacy candidate — so session-init's candidate list is a correctness mechanism,
  not a dead-route advisory.

    - Build `test-first` (one behavior at a time):
        - Derive eligibility from exact identity/locus evidence rather than the branch oracle's `remoteOnly`
          Errand classification; preserve branch-only legacy entries only on non-materialization advisory surfaces
        - Admit eligible `paused` / `awaiting-merge` identity-only rows and exclude `open`, incomplete, occupied,
          and record-less branch candidates
        - Update `materializable-errands.test.ts`, `errand-state.test.ts`, envelope fixtures/schema, and call sites
          to remove the raw branch-derived candidate contract

### `[ ]` **4.2 Update package-source workflow templates and reference docs** (SC 5, 7)

- _Goal:_ The package-source docs route pause, review-tail, and cross-machine pickup through `arc errand leave`
  and `arc errand materialize` — session-init's Materialize arm offers a remote-only Errand identity as a
  materialization candidate instead of retained evidence.

- _Note:_ The origin templates carry inheritable wording — port and adapt rather than author fresh:
  `run-errand.md` (leave/materialize arms), `session-init.template.md`, `session-handoff.template.md`,
  `QUICK-REFERENCE.template.md` (command table).

    - `[ ]` **4.2.a Port and adapt the four workflow/reference docs** named above

    - `[ ]` **4.2.b Extend `locus-methodology-contracts.test.ts` with the same edit** — its Errand lifecycle
      signature block pins the exact QUICK-REFERENCE command lines, so the `arc errand leave` /
      `arc errand materialize` expectations land together with the doc; `command-surface-documentation.test.ts`
      is inventory-free by design and needs no edit — it must simply stay green

### `[ ]` **4.3 Sync project `.arc/` copies**

- _Goal:_ The self-hosted `.arc/` instance matches package source for every file 4.2 touched — edits flow
  package → project per the sync discipline, never `cp` back. Mirroring is manual per-file work verified by
  the `check-package-sync.sh` pre-commit check; the `.template.md` sources land in their rendered project
  counterparts (`session-init.template.md` → `session-init.md`).

- **Additional Context:** `strategy-package-project-sync.md` § template-counterpart handling and the file
  inventory

### `[ ]` **4.4 Reconcile code-side doc surfaces** (SC 5)

- _Goal:_ No shipped module still documents the replaced flow — `materializable-errands.ts`'s module docstring
  (raw `git worktree add` + run-errand resume) updated to describe the verb path, and the `errand`
  command-group description in `cli.ts` updated to cover the grown verb set.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` `arc errand leave --state paused` succeeds only with the WIP head committed, pushed, and proven an
  ancestor of the fetched remote tip; `--state awaiting-merge` only with change-request coordinates matching
  both configured and observed host state; neither departure retires identity

- `[ ]` A left Errand resumes through the base deliverable's open driver into a newly allocated locus, returning
  identity state to `open` — no resume command is added

- `[ ]` Leaving creates no WU meta, task list, or SESSION-NOTES, and no unleased transient role is reclassified
  as normal waiting

- `[ ]` `arc errand materialize` accepts only an exact paused v3 identity at `savedHead` or an awaiting-merge
  identity at `changeRequest.headSha` with its change request verified still open; it refuses `open` identities,
  branch-derived legacy candidates, changed or missing remote heads, and incomplete snapshots

- `[ ]` Materialization writes ARC ownership provenance and a role record, and no shipped doc or code surface
  still describes a raw materialization path that can create a markerless ARC-owned worktree

- `[ ]` Owned end-to-end coverage asserts materialize success and failed-open rollback against real v3 Errands,
  with no seeded legacy-record reliance for this path

- `[ ]` Package-source and self-hosted workflow copies stay synchronized

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
