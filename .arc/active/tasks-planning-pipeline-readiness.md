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

### `[ ]` **2.1 Split `create-spec` Finalize into review/iterate then proceed-to-finalize gates**

- _Goal:_ Spec finalization stops first for a full read, feedback, and iteration, and only a separate second
  approval authorizes the irreversible Finalize actions — so answering an advisory overlay never reads as
  authorization to finish.
- **Strategies:** strategy-workflow-authoring.md

    - Replace the single Finalize `workflow-interlock` with two sequential gates. Gate 1 (review/iterate): after the
      spec is saved and self-reviewed (`spec-review`), stop and surface the spec location + self-review findings for
      a full read, feedback, and iteration; iteration loops here against the saved spec; approval means "the spec is
      right," not "finish Finalize."
    - Gate 2 (proceed-to-finalize): only after gate 1 clears, proceed to the irreversible actions — draft retirement
      (`notes-*` migration + draft delete), meta update, and the `workflowCommit`; this approval authorizes those.
    - Keep the split in the workflow body — an interlock is control flow; a method carrying the two-gate structure
      would be less reusable.

### `[ ]` **2.2 Add the overlay-recommendation norm to `DEV-RULES.ARC` (+ package mirror)**

- _Goal:_ One always-loaded rule requires every advisory accept/decline (or either-or) fork in the pipeline to
  state a recommended option with rationale, covering the four scattered overlay sites at once.
- _Note:_ The rule is policy; a future `composable-workflows` present-overlay fragment would implement it (different
  tier — author the norm, not the mechanism). Placement within `DEV-RULES.ARC` resolved at authoring.

    - Add a short always-on rule to `DEV-RULES.ARC` (package source + `.arc/` mirror). Candidate phrasing (final
      wording at authoring): "Recommend on advisory forks. When surfacing an advisory accept/decline (or either-or)
      fork — not a mandatory approval gate — state the recommended option with a one-line rationale; never a bare fork."
    - Authoring constraints: the phrasing must generalize to every advisory fork (not Novel- or planning-specific)
      and stay token-tight, since the rule is always loaded.

## **Phase 3:** `Current Workflow` field model + encoding-consistency validator (§ C foundation)

_Purpose:_ Land the pure data + pure validation layer — the new meta field in the model and the invariant it must
satisfy — with no fs/git seam, mirroring how the lifecycle table + guards landed before the executor. Code-tier,
test-first.

### `[ ]` **3.1 Add the `Current Workflow` field to the meta model**

- _Goal:_ The meta carries a machine-written `Current Workflow` field naming the active planning workflow as a bare
  basename, round-tripping cleanly through parse/render so one deterministic field is available to read.
- **Strategies:** strategy-testing-methodology.md

    - Add a `Current Workflow` descriptor to `META_FIELDS` in `lib/active/meta-reader.ts` — `[none]` default, bullet
      render in the reference group (alongside `Design` / `Task List`), `identifier` value class. The `MetaRecord`
      type derives automatically.
    - Encoding (C1): bare workflow basename — `draft-design` / `create-spec` / `generate-tasks`, and `[none]`
      outside planning. Single-owner: written only by the executor (Phase 4), never hand-edited; session-init reads
      it (Phase 5).
    - Build `test-first` (one behavior at a time):
        - field round-trips through `renderMetaFile` → `parseMetaRecord` (value preserved verbatim)
        - an absent field parses to its `[none]` default (legacy metas)
        - `setMetaBulletFields` updates `Current Workflow` in place, preserving narrative sections

### `[ ]` **3.2 Encoding-consistency validator over `(State, Current Workflow, Design)`**

- _Goal:_ A pure validator asserts `Current Workflow` agrees with the rest of the meta state, failing on an
  injected mismatch — the write-side drift guard.
- _Note:_ The single-owner executor write plus this unit test is the floor. The pre-commit-hook wiring that would
  also catch hand-edits is forward-compat, routed to `quality-gate-hooks` (the meta-layout hook infra isn't shipped yet).
- **Strategies:** strategy-testing-methodology.md

    - Implement as a pure function over the parsed `(State, Current Workflow, Design)` tuple in `lib` (no fs/git side
      effects). Under `State: Planning`, `Current Workflow ∈ {draft-design, create-spec, generate-tasks}` and is
      consistent with the `Design` pointer (e.g. `Current Workflow = generate-tasks` ⟹ `Design` points at a
      `spec-*`); under any non-`Planning` state, `Current Workflow = [none]`.
    - Build `test-first` (one behavior at a time):
        - valid planning tuples pass (each stage with its consistent `Design` pointer)
        - a non-`Planning` state with a non-`[none]` `Current Workflow` fails
        - `Current Workflow = generate-tasks` with `Design` pointing at a `draft-*` fails
        - a `Current Workflow` outside the planning enum under `State: Planning` fails
        - an injected mismatch fails (the drift case named in Success Criteria)

## **Phase 4:** Executor stage-pointer writes + event wiring + `init-work-unit` fold-in (§ C write-side)

_Purpose:_ Make the planning sub-stages CLI-recognized events and write the two field-families (`Current Workflow`,
`Design`) at the workflow moments and lifecycle edges that already exist — a stage-pointer command for sub-stage
entries, the `activate` encoding leg for the exit clear — the write half of resolve-for-reads /
CLI-mutate-for-writes. Code-tier, test-first.

### `[ ]` **4.1 Parameterized stage-pointer write primitive**

- _Goal:_ One parameterized primitive writes `Current Workflow` to a target stage (or `[none]`) while preserving the
  rest of the meta — the single write both the stage-entry command (4.2.a) and the activate-exit encoding leg
  (4.2.b) reuse.
- _Note:_ Open question (lean settled): a single parameterized stage-pointer mutator keyed by the target stage — not
  bespoke per-stage top-level verbs. The user-facing verb spelling waits on `idiomatic-alignment`; the mechanism
  (a bullet-field write over the 3.1 setter) is settled here.
- **Strategies:** strategy-testing-methodology.md

    - Add the write seam over `setMetaBulletFields` (the same bullet-field writer the executor's `writeSoftFields`
      seam uses), keyed by the target stage value (`draft-design` / `create-spec` / `generate-tasks` / `[none]`).
      Mirror the injected-seam shape of `writeBranchField` in `executor-context.ts`.
    - Reads resolve from state; writes are CLI-mutated (the drift-control principle).
    - Build `test-first` (one behavior at a time):
        - the primitive writes `Current Workflow` for a given target stage
        - it writes `[none]` when clearing
        - the rest of the meta (core table, narratives) stays byte-stable

### `[ ]` **4.2 Stage-entry command + activate-exit clear**

- _Goal:_ Entering each planning stage writes its `Current Workflow` and activation clears it, so the field always
  names the live stage — the core that retires the prose-parse.
- **Strategies:** strategy-testing-methodology.md

    - `[ ]` **4.2.a Stage-pointer command + planning-workflow wiring**
        - The planning sub-stages are agent-run markdown with no CLI invocation today (the executor has no
          intra-`planning` transitions). Add a lightweight CLI entry point that fires the 4.1 primitive with the
          target stage, and wire `draft-design.md` / `create-spec.md` / `generate-tasks.md` to invoke it at their
          entry step — the existing workflow moment, no new ceremony. Verb spelling deferred to `idiomatic-alignment`;
          the invocation point is pinned.
        - Build `test-first` (one behavior at a time):
            - the command writes the matching basename for each of the three stages

    - `[ ]` **4.2.b Activate-exit clears `Current Workflow → [none]`**
        - Add a `clearCurrentWorkflowField` flag to the `activate` edge's `encodingUpdates` and an
          `applyCurrentWorkflowField` executor leg mirroring `applyBranchField` — firing the 4.1 primitive with
          `[none]` as `State: Active` takes over.
        - Build `test-first` (one behavior at a time):
            - the `activate` edge clears `Current Workflow` to `[none]`

### `[ ]` **4.3 `Design` event-driven repoints — draft-create + create-spec-finalize**

- _Goal:_ `Design` repoints by event, never by presence-scan — so a half-written spec never prematurely repoints
  while the draft is still authoritative.
- _Note:_ Each repoint is a `Design` bullet-field write fired at a workflow moment (draft-create, create-spec
  finalize), invoked the same way 4.2.a wires the stage entries — not a presence scan over the artifact set.
- **Strategies:** strategy-testing-methodology.md

    - `[ ]` **4.3.a `[none] → draft-<name>` at draft creation**
        - Repoint `Design` when a first draft is created/adopted — conditional, only when a draft is produced. No
          forced draft-first: a `Light` WU may go `[none] → spec-<name>` directly.
        - Build `test-first` (one behavior at a time):
            - draft creation repoints `Design` to the `draft-*`
            - the no-draft path leaves `Design` for a later direct spec repoint

    - `[ ]` **4.3.b `draft-<name> → spec-<name>` at create-spec finalization**
        - Repoint `Design` at `create-spec` finalization (not at spec existence), riding the draft-retire edge. The
          mandatory draft-delete + repoint is the mechanical part; the optional `notes-*` content migration is
          orthogonal — `Design` never points at `notes-*`.
        - Build `test-first` (one behavior at a time):
            - finalization repoints `Design` from the `draft-*` to the `spec-*`

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
