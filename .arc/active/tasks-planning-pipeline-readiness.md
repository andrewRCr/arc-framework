# Task List: planning-pipeline-readiness

- **Design:** `spec-planning-pipeline-readiness.md`

---

## **Phase 1:** Shared `assess-draft-readiness` formalization-ready method (§ A)

_Purpose:_ Extract the one "is this draft formalization-ready?" judgment into a single conductor-independent
method, and route both live fire points through it so no second implementation can drift. Documentation-tier
(method + workflow edits; markdown lint + reference-integrity).

### `[x]` **1.1 Author the `assess-draft-readiness` method (+ package mirror)**

- _Goal:_ One conductor-independent method defines the formalization-ready bar and its `{ ready, gaps }` contract
  in a single home, so both fire points share one criterion set with no second implementation to drift.
- _Outcome:_ `assess-draft-readiness.md` authored in the package source and byte-identically mirrored to
  `.arc/system/methods/` — standard method shape (frontmatter + `.override`/`.default`), the three-criterion bar,
  the checks-only buffer seam, and the `{ ready, gaps }` contract. No README Index / Method-Dependencies entry:
  followed the `resolve-planning-depth` precedent (curated index) and A3's no-hard-coupling seam. Workflow
  rewiring (the two fire points) is Task 1.2's; no `draft-design` / `create-spec` edits here.

### `[x]` **1.2 Route both fire points through the method**

- _Goal:_ Both fire points evaluate readiness by calling `assess-draft-readiness`, with no inline readiness bar
  surviving in either workflow.

    - `[x]` **1.2.a `draft-design.md` loop-exit calls the method**
        - Replaced the inline formalization-ready bar with a loop-exit call to `assess-draft-readiness`; the
          `fresh / rough / maturing / formalization-ready` ladder labels stay as continuity vocabulary. Method
          declared in `arc.methods` frontmatter; reference link added.

    - `[x]` **1.2.b `create-spec.md` entry calls the method**
        - Replaced the inline entry readiness sentence with a call to `assess-draft-readiness`, leaving the
          buffer-drain hook (the drain floor) in place in the same paragraph. Method declared in `arc.methods`
          frontmatter; reference link added.

- _Outcome:_ Both fire points now share the one criterion home; verified no inline readiness bar survives in
  either workflow. Edited package source and synced byte-identical to the `.arc/` instance (Framework two-copy).

## **Phase 2:** `create-spec` interlock split + overlay-recommendation norm (§ B)

_Purpose:_ Give spec finalization a clean review gate before any irreversible action, and make every advisory
fork in the pipeline carry a recommendation. Documentation-tier (workflow body + always-loaded rule).

### `[x]` **2.1 Split `create-spec` Finalize into review/iterate then proceed-to-finalize gates**

- _Goal:_ Spec finalization stops first for a full read, feedback, and iteration, and only a separate second
  approval authorizes the irreversible Finalize actions — so answering an advisory overlay never reads as
  authorization to finish.
- _Outcome:_ The single Finalize `workflow-interlock` is now two sequential gates in the `create-spec.md` body —
  Gate 1 (review/iterate, loops against the saved spec; approval = "the spec is right") and Gate 2
  (proceed-to-finalize, authorizing draft retirement + meta update + the `workflowCommit`, which fires under that
  approval). Split kept in the workflow body, not a method (control flow). Both copies.

### `[x]` **2.2 Add the overlay-recommendation norm to `DEV-RULES.ARC` (+ package mirror)**

- _Goal:_ One always-loaded rule requires every advisory accept/decline (or either-or) fork in the pipeline to
  state a recommended option with rationale, covering the four scattered overlay sites at once.
- _Outcome:_ Added a `### Recommend on advisory forks` subsection under `DEV-RULES.ARC` § Verification and
  Discovery (placed beside the clarifying-questions guidance, its nearest kin) — one token-tight sentence plus a
  "the user still decides" guard so recommend never reads as decide. Generalizes to every advisory fork; both
  copies.

## **Phase 3:** `Current Workflow` field model + encoding-consistency validator (§ C foundation)

_Purpose:_ Land the pure data + pure validation layer — the new meta field in the model and the invariant it must
satisfy — with no fs/git seam, mirroring how the lifecycle table + guards landed before the executor. Code-tier,
test-first.

### `[x]` **3.1 Add the `Current Workflow` field to the meta model**

- _Goal:_ The meta carries a machine-written `Current Workflow` field naming the active planning workflow as a bare
  basename, round-tripping cleanly through parse/render so one deterministic field is available to read.
- **Strategies:** strategy-testing-methodology.md
- _Outcome:_ Added the `Current Workflow` descriptor to `META_FIELDS` (`lib/active/meta-reader.ts`) — `[none]` default,
  `identifier` value class, placed between `Design` and `Task List` in the reference group so the existing
  `Task List → Last Completed` group-boundary render stays intact. Round-trips verbatim (planning basenames and the
  `[none]` sentinel); a legacy meta lacking the bullet parses to `null` per the marker-absent contract — distinct from
  the rendered `[none]` default rather than coalesced to it.

### `[x]` **3.2 Encoding-consistency validator over `(State, Current Workflow, Design)`**

- _Goal:_ A pure validator asserts `Current Workflow` agrees with the rest of the meta state, failing on an
  injected mismatch — the write-side drift guard.
- **Strategies:** strategy-testing-methodology.md
- _Outcome:_ Added `checkCurrentWorkflowConsistency` (`lib/active/current-workflow-consistency.ts`) — a pure
  `string[]`-diagnostics validator (mirroring `checkCohortConsistency`'s contract) over the
  `(State, Current Workflow, Design)` tuple. Under `State: Planning` it asserts
  `Current Workflow ∈ {draft-design, create-spec, generate-tasks}` and Design agreement per the event-driven repoint
  model (`draft-design` / `create-spec` ⟹ Design is `[none]` or `draft-*`; `generate-tasks` ⟹ `spec-*`); outside
  planning it requires `[none]` / absent. Single-owner executor write + this unit test is the floor — the
  hand-edit-catching pre-commit hook stays forward-compat (routed to `quality-gate-hooks`).

## **Phase 4:** Executor stage-pointer writes + event wiring + `init-work-unit` fold-in (§ C write-side)

_Purpose:_ Make the planning sub-stages CLI-recognized events and write the two field-families (`Current Workflow`,
`Design`) at the workflow moments and lifecycle edges that already exist — a stage-pointer command for sub-stage
entries, the `activate` encoding leg for the exit clear — the write half of resolve-for-reads /
CLI-mutate-for-writes. Code-tier, test-first.

### `[x]` **4.1 Parameterized stage-pointer write primitive**

- _Goal:_ One parameterized primitive writes `Current Workflow` to a target stage (or `[none]`) while preserving the
  rest of the meta — the single write both the stage-entry command (4.2.a) and the activate-exit encoding leg
  (4.2.b) reuse.
- **Strategies:** strategy-testing-methodology.md
- _Outcome:_ Added the pure `setMetaCurrentWorkflow(content, stage)` primitive (`lib/active/meta-reader.ts`, a thin
  named wrapper over `setMetaBulletFields`, mirroring `setMetaBranch`) plus the injected `writeCurrentWorkflowField`
  executor seam (the `ExecutorContext` interface in `lifecycle-executor.ts` + the `executor-context.ts` builder,
  mirroring `writeBranchField`). Writes a target stage or `[none]` while leaving the rest of the meta byte-stable,
  fail-loud when the bullet is absent. The seam is the single write 4.2.a (stage-entry command) and 4.2.b
  (activate-exit leg) reuse; user-facing verb spelling stays deferred to `idiomatic-alignment`. Updated the nine
  hand-rolled executor-context test fakes to carry the new seam.

### `[x]` **4.2 Stage-entry command + activate-exit clear**

- _Goal:_ Entering each planning stage writes its `Current Workflow` and activation clears it, so the field always
  names the live stage — the core that retires the prose-parse.
- **Strategies:** strategy-testing-methodology.md

    - `[x]` **4.2.a Stage-pointer command + planning-workflow wiring**
        - Added `arc set-stage <stage>` (provisional spelling). `runSetStage` (`lib/work-unit/verbs/set-stage.ts`)
          validates the stage against the planning enum and fires the 4.1 `writeCurrentWorkflowField` seam;
          `handleSetStage` (`handlers/lifecycle.ts`) resolves the single active WU and reports; registered in `cli.ts`.
          Wired the entry step of `draft-design` / `create-spec` / `generate-tasks` (both the `.arc/` instance and the
          package source — generate-tasks via its `.template.md`) to invoke it. Exported `isPlanningWorkflow` from the
          consistency module for reuse. Final verb spelling stays deferred to `idiomatic-alignment`.

    - `[x]` **4.2.b Activate-exit clears `Current Workflow → [none]`**
        - Added `clearCurrentWorkflowField` to `MutatorSpec` and the `activate` edge, plus the
          `applyCurrentWorkflowField` executor leg (mirroring `applyBranchField`, gated on the flag) that fires the
          `writeCurrentWorkflowField` seam with `[none]`; folded into the meta-staging gate. Logical-only (no git op).
          One-directional by design — `deactivate` doesn't restore the pointer; re-entering a planning workflow
          re-sets it via `set-stage`.

### `[x]` **4.3 `Design` event-driven repoints — draft-create + create-spec-finalize**

- _Goal:_ `Design` repoints by event, never by presence-scan — so a half-written spec never prematurely repoints
  while the draft is still authoritative.
- **Strategies:** strategy-testing-methodology.md

    - `[x]` **4.3.a `[none] → draft-<name>` at draft creation**
        - `draft-created` event repoints `Design: [none] → draft-<name>.md` (idempotent when the draft already
          points; additive, never clobbering, if a list is present). Wired into `draft-design`'s draft-capture
          ceremony on the `medium` / `high` (draft-producing) paths — both copies; the `low` path skips.

    - `[x]` **4.3.b `draft-<name> → spec-<name>` at create-spec finalization**
        - `spec-finalized` event swaps the `draft-<name>.md` member for `spec-<name>.md` through
          `parseIdentifierList` (layered siblings preserved, order kept); the direct no-draft path repoints
          `[none] → spec-<name>.md`. Wired into `create-spec`'s Finalize meta-update step — both copies.

- _Outcome:_ Added `arc repoint-design <event>` (`runRepointDesign` in `verbs/repoint-design.ts`, `handleRepointDesign`,
  cli registration) firing a new `writeDesignField` executor seam over the `setMetaDesign` primitive — the
  identifier-list sibling of `set-stage` / `writeCurrentWorkflowField` / `setMetaCurrentWorkflow`. Repoints transform
  the parsed list (member-swap), never a blind overwrite. Fixed a latent backtick-stripping defect in the sibling
  `setMetaCurrentWorkflow` (4.1): both stage-pointer primitives now render through `formatValue`
  (`identifier` / `identifier-list`), so a write stays byte-faithful to the meta convention (`[none]` bare,
  filenames backticked) — verified live (an idempotent repoint produces no diff).

### `[ ]` **4.4 `init-work-unit` writes `Current Workflow`, drops the `Next Action` workflow pointer**

- _Goal:_ Init writes `Current Workflow` via the executor and stops writing a `Next Action` workflow pointer, so the
  readiness pre-judgment disappears and the consuming session evaluates against the real draft state.
- **Strategies:** strategy-testing-methodology.md

    - `[ ]` **4.4.a Scaffold writes `Current Workflow` at init; no `Next Action` workflow pointer**
        - In `lib/git/worktree-scaffold.ts` (`scaffoldIntoWorktree`), write the initial `Current Workflow` (the
          entry planning stage) and stop emitting the static `Next Action` workflow pointer (`DEFAULT_NEXT_ACTION`).
        - Build `test-first` (one behavior at a time):
            - the scaffold writes `Current Workflow`
            - `Next Action` carries no workflow pointer after scaffold

    - `[ ]` **4.4.b `init-work-unit.md` reflects the field model**
        - Update the `init-work-unit.md` workflow so it no longer pre-judges spec-readiness — it writes
          `Current Workflow` (via the executor) and leaves the readiness call to the consuming session
          (`arc-plan` → `draft-design`).

## **Phase 5:** session-init read-path + `Next Action` semantics (§ C read-side)

_Purpose:_ Resolve the planning sub-stage deterministically from `Current Workflow` (no prose-parse), with the
artifact-existence heuristic surviving only as a legacy-meta fallback; reduce `Next Action` to within-stage
judgment. Code-tier, test-first.

### `[ ]` **5.1 session-init resolves the planning sub-stage from `Current Workflow`**

- _Goal:_ session-init selects the planning-stage workflow by reading `Current Workflow` directly, with the
  artifact-existence heuristic surviving only as a fallback for legacy metas that predate the field.
- **Strategies:** strategy-testing-methodology.md

    - `[ ]` **5.1.a Probe surfaces `Current Workflow` (with legacy fallback)**
        - The probe (`commands/active/status.ts`) resolves only the coarse `sessionType` today; the planning
          sub-stage is selected downstream. Surface the meta's `Current Workflow` value in the probe envelope; when
          the field is absent (legacy meta), resolve a fallback from the existing draft/spec-presence heuristic.
        - Build `test-first` (one behavior at a time):
            - a current-format meta surfaces the sub-stage from the field with no prose-parse
            - a field-absent meta falls back to artifact-existence

    - `[ ]` **5.1.b `session-init.md` planning arm reads the field**
        - Update the session-init workflow's item-10 planning-branch lifecycle-workflow resolution to select the
          workflow from the probe-surfaced `Current Workflow`, replacing the `Next Action` prose-parse; document the
          artifact-existence guess as the degraded legacy fallback.

### `[ ]` **5.2 `Next Action` loses the workflow pointer**

- _Goal:_ `Next Action` becomes pure within-stage judgment, or the bracketed `[begin current workflow]` sentinel at
  a clean stage boundary — distinct from `[none]` (parked), with no workflow name duplicated.

    - Define the `[begin current workflow]` sentinel (the workflow name lives in `Current Workflow`, so the pointer
      is not duplicated) and distinguish it from `[none]`.
    - Update the meta template / convention docs so `Next Action` no longer carries a workflow pointer; confirm no
      writer emits one (the init writer is handled in 4.4).

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `assess-draft-readiness.md` exists (+ mirror) with the three-criterion bar and `{ ready, gaps }` contract,
  declared in `draft-design.md` and `create-spec.md` frontmatter
- `[ ]` Both fire points call the method; neither retains a second inline readiness implementation
- `[ ]` The buffer criterion is checks-only — no drain act added or moved; the `create-spec` inline hook remains
- `[ ]` `create-spec` Finalize presents two sequential gates; approving review does not authorize retirement/commit
- `[ ]` A general overlay-recommendation rule is in `DEV-RULES.ARC` (+ mirror), generalized and token-tight
- `[ ]` `Current Workflow` is written by the executor at each of the six pinned events and read by session-init;
  `Next Action` no longer carries a workflow pointer
- `[ ]` `Design` repoints event-drivenly (`[none] → draft` at creation; `draft → spec` at finalization)
- `[ ]` `init-work-unit` writes `Current Workflow` and no longer writes a `Next Action` workflow pointer
- `[ ]` The encoding-consistency test passes and fails correctly on an injected mismatch
- `[ ]` session-init resolves the sub-stage from `Current Workflow` with no prose-parse on a current-format meta,
  falling back to artifact-existence only when the field is absent
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

---

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
