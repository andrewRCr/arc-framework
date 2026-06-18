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

### `[x]` **4.4 `init-work-unit` writes `Current Workflow`, drops the `Next Action` workflow pointer**

- _Goal:_ Init writes `Current Workflow` via the executor and stops writing a `Next Action` workflow pointer, so the
  readiness pre-judgment disappears and the consuming session evaluates against the real draft state.
- **Strategies:** strategy-testing-methodology.md

    - `[x]` **4.4.a Scaffold writes `Current Workflow` at init; no `Next Action` workflow pointer**
        - `scaffoldIntoWorktree` (`lib/git/worktree-scaffold.ts`) now writes `Current Workflow` — the entry stage
          (`PLANNING_WORKFLOWS[0]`) under a Planning scaffold, `[none]` otherwise, keeping it State-consistent by
          construction. The default `Next Action` seed changed from the `"Begin planning."` workflow pointer to the
          `[begin current workflow]` sentinel (no pointer). Covers both `arc start` create-new and cold-start (neither
          passes `nextAction`).

    - `[x]` **4.4.b `init-work-unit.md` reflects the field model**
        - Updated Step 4 Path A (graduated) and Path B (fresh manual) to set `Current Workflow` to the entry stage and
          to seed `Next Action` with no workflow pointer (the sentinel), retiring the "Run `create-spec.md`"
          pre-judgment; fixed stale `Spec` → `Design` field references. Both framework copies.

- _Outcome:_ Init now hands the spec-readiness call to the consuming session (`arc-plan` → `draft-design`) instead of
  pre-judging it. The executor/scaffold path writes `Current Workflow` automatically; the manual fallback sets it by
  hand. `template-meta.md` (the `Current Workflow` bullet + `Next Action` convention) is left to Phase 5.2's
  template/convention scope — safe because the encoding-consistency validator is defined-only (not yet hook-enforced),
  so the manual-path field gap is latent, not a live failure.

## **Phase 5:** session-init read-path + `Next Action` semantics (§ C read-side)

_Purpose:_ Resolve the planning sub-stage deterministically from `Current Workflow` (no prose-parse), with the
artifact-existence heuristic surviving only as a legacy-meta fallback; reduce `Next Action` to within-stage
judgment. Code-tier, test-first.

### `[x]` **5.1 session-init resolves the planning sub-stage from `Current Workflow`**

- _Goal:_ session-init selects the planning-stage workflow by reading `Current Workflow` directly, with the
  artifact-existence heuristic surviving only as a fallback for legacy metas that predate the field.
- **Strategies:** strategy-testing-methodology.md

    - `[x]` **5.1.a Probe surfaces `Current Workflow`**
        - `meta-reader.ts` now parses `Current Workflow` into the candidate; the session-init probe
          (`commands/active/status.ts` / `types.ts`) surfaces a `planningStage: PlanningWorkflow | null` on the
          envelope, resolved only for a single-candidate planning session. It reads the `Current Workflow` field
          directly; a meta with no usable value (absent / `[none]`) resolves to the `draft-design` entry stage —
          no artifact-existence scan (presence is too ambiguous to refine, and a fresh init starts at
          `draft-design`). Reuses Phase 3's `PLANNING_WORKFLOWS` / `isPlanningWorkflow`.

    - `[x]` **5.1.b `session-init.md` planning arm reads the field**
        - Item-10's planning branch now loads `.arc/system/workflows/arc/<active.value.planningStage>.md`,
          retiring the `Next Action` prose-parse. Edited in both the `.arc/` instance and the package-source
          `.template.md`.

- _Outcome:_ The planning sub-stage resolves from one code-owned field, defaulting to the `draft-design` entry
  stage when absent — no scan, no degraded-source ceremony (an earlier `{stage, source}` + artifact-presence
  design was simplified out after establishing presence is an unreliable stage proxy). The `Current Workflow`
  field also moved from the `reference` group to the head of the `progress` block (live operational position, not
  an artifact pointer). `currentWorkflow` / `planningStage` are required on the shared `MetaFileCandidate` /
  `ActiveSessionInitResult` types, so a few test fixtures gained defaults.

### `[x]` **5.2 `Next Action` loses the workflow pointer**

- _Goal:_ `Next Action` becomes pure within-stage judgment, or the bracketed `[begin current workflow]` sentinel at
  a clean stage boundary — distinct from `[none]` (parked), with no workflow name duplicated.

    - Defined the `[begin current workflow]` sentinel as a shared constant (`BEGIN_CURRENT_WORKFLOW_SENTINEL` in
      `current-workflow-consistency.ts`, de-duped from `worktree-scaffold`); documented it in the `template-meta`
      legend (and the `Current Workflow` field) + spec § C. A _relative_ pointer ("begin whatever `Current Workflow`
      names"), distinct from `[none]`.
    - Retired the `Next Action` workflow pointers from the planning workflows — `create-spec` / `generate-tasks` no
      longer write "Run X.md". The "confirm no writer emits one" check surfaced these two beyond the 4.4 init writer.

- _Outcome:_ The check surfaced a model defect in § C5: `Current Workflow` was wired to advance at each stage's
  _entry_, but the typical flow finalizes a stage → hands off → runs the next in a fresh session, so the field must
  advance at the _preceding_ stage's finalization (else session-init loads the just-finished workflow). Corrected
  (spec § C5 rewritten): a new `set-stage <next> --advance` fires at each finalization, writing `Current Workflow` +
  the `Next Action` sentinel atomically (sentinel never hand-written); the lone surviving entry write is
  `create-spec`'s, gated on draft-absence (the only skip-into-cold-stage case). Added the `--advance` flag to the
  `set-stage` verb/CLI/handler; rewired all three planning workflows (both copies), with `generate-tasks` as the
  terminus (within-stage `Next Action`, no advance). Also reconciled spec § C7 + acceptance with the
  `draft-design`-default read-path shipped in 5.1.

## **Phase 6:** Verification

### `[x]` **6.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

- _Quality gates:_ md lint (0 errors), TS lint, shell lint, typecheck (source + tests), 2954 tests
  (1 skipped), and build — full Tier 3 suite passed.
- _Success criteria:_ 10 spec criteria, all met (12 task-list rows including quality-gates + integration-ready);
  none superseded or unmet. § A method extraction, § B interlock split + overlay rule, and § C stage-pointer
  mechanics verified against the spec and the shipped `Current Workflow` / `Design` event model.

---

## Success Criteria

- `[x]` `assess-draft-readiness.md` exists (+ mirror) with the three-criterion bar and `{ ready, gaps }` contract,
  declared in `draft-design.md` and `create-spec.md` frontmatter
- `[x]` Both fire points call the method; neither retains a second inline readiness implementation
- `[x]` The buffer criterion is checks-only — no drain act added or moved; the `create-spec` inline hook remains
- `[x]` `create-spec` Finalize presents two sequential gates; approving review does not authorize retirement/commit
- `[x]` A general overlay-recommendation rule is in `DEV-RULES.ARC` (+ mirror), generalized and token-tight
- `[x]` `Current Workflow` is advanced at each stage's finalization (plus the draft-gated `create-spec` entry
  correction) and read by session-init; `Next Action` no longer carries a workflow pointer (within-stage judgment
  or the `[begin current workflow]` sentinel)
- `[x]` `Design` repoints event-drivenly (`[none] → draft` at creation; `draft → spec` at finalization)
- `[x]` `init-work-unit` writes `Current Workflow` and no longer writes a `Next Action` workflow pointer
- `[x]` The encoding-consistency test passes and fails correctly on an injected mismatch
- `[x]` session-init resolves the sub-stage from `Current Workflow` with no prose-parse on a current-format meta,
  defaulting to the `draft-design` entry stage when the field is absent
- `[x]` All quality gates pass (tests, linting, type checking)
- `[x]` Ready for integration

---

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
