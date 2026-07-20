# Task List: arc-view-refinements

- **Design:** `spec-arc-view-refinements.md`

---

## **Phase 1:** Viewer layering foundation

_Purpose:_ Restore the documented `lib → commands` direction and dependency-injection discipline in the
touched viewer slice **before** any feature work expands it, so elements 1–7 are authored in the corrected
structure and held honest by an import-boundary guard. Behavior-preserving — the existing view tests are the
regression floor.

_Design decisions:_ Foundation-first (correct the existing slice, then expand) over correct-last, per spec
Proposed Design 8 "correct the touched slice rather than deepening the inversion." The `--for` neutral
target-resolution result is authored later (Phase 2) but lands in `lib` by construction under the boundary test.

### `[ ]` **1.1 Relocate neutral viewer types and `VIEW_KINDS` into `lib`**

- _Goal:_ The viewer's neutral vocabulary — `VIEW_KINDS`, `ViewKind`, `ViewArtifactResult`,
  `ResolveViewArtifactOptions`, `ViewArtifactResolver`, `RunViewOptions`, `ViewOutput` — lives in `lib`, so
  `lib/view-artifact.ts` depends on it downward instead of reaching up into `commands`.
- _Approach:_ Move the definitions from `commands/view/types.ts` into a new `lib/view/types.ts`; keep
  `commands/view/types.ts` and the `commands/view.ts` barrel as compatibility re-exports.
- _Note:_ Behavior-preserving; `__tests__/unit/view/*` is the regression floor.

### `[ ]` **1.2 Move semantic formatting out of `commands/view/format.ts` into `lib`**

- _Goal:_ Semantic formatting (`formatTaskBand`, `formatArtifactHeader`, `prepareViewDocument`, and their
  helpers) lives in `lib` (`lib/view/format.ts`, joining the new `lib/view/` directory from Task 1.1), with
  `commands/view/run.ts` importing it from `lib` and a compatibility re-export left at `commands/view/format.ts`.
- _Context:_ `format.ts` already imports downward into `lib/task-list/cursor.js`; the move relocates the module
  to where semantic logic belongs without changing behavior.
- _Note:_ `__tests__/unit/view/format.test.ts` is the regression floor — update its import (or rely on the
  compat re-export).

### `[ ]` **1.3 Invert `lib/view-artifact.ts` upward `commands` imports**

- _Goal:_ `lib/view-artifact.ts` imports no `commands` module — it consumes a neutral viewer result defined in
  `lib`, and the command layer adapts its active-session envelope into that shape and owns checkout-local
  lifecycle lookup.
- _Rationale:_ This is the primary `lib → commands` violation (`../commands/active`, `../commands/view`); the
  neutral result separates viewer semantics from the active command's transport shape — the foundation the 2.2
  explicit-target arms extend.
- _Note:_ Scoped to the viewer. `ActiveSessionInitResult` / `MetaFileCandidate` are imported from `commands` by
  other `lib` modules too; that broader type inversion belongs to `lib-layer-type-extraction`, not this WU — so
  define a viewer-neutral result rather than relocating the shared envelope.

    - `[ ]` **1.3.a Define the neutral viewer result type in `lib`**
        - A `lib/view/types.ts` result carrying canonical slug, lifecycle location, meta path, and resolved
          artifact group — the contract Task 2.2 extends with the explicit-target variants. Independent of
          `ActiveSessionInitResult` / `MetaFileCandidate` (per the scoping note above).

    - `[ ]` **1.3.b Adapt the active-session envelope in the command layer; drop the `commands` imports**
        - Extract the `ActiveSessionInitResult` → neutral-result adaptation — including multiple-candidate
          branch disambiguation and computing the resolved task-list path via `resolveTaskListPath` (which stays
          in `commands`) — as a **pure, unit-tested** function; `handlers/view.ts` has no unit test today and the
          disambiguation's only current coverage lives in `artifact.test.ts`.
        - `handlers/view.ts` calls that adapter and injects the neutral result via `ViewArtifactDependencies`.
        - `lib/view-artifact.ts` drops `../commands/active` and `../commands/view`; `resolveActive` now yields the
          neutral result. Migrate `__tests__/unit/view/artifact.test.ts` to inject the neutral shape (it injects
          `ActiveSessionInitResult` today — a required rewrite, not a no-op).

### `[ ]` **1.4 Inject viewer production effects from the command layer**

- _Goal:_ Filesystem/access, Git-config execution, executable probing, and process spawning are bound in the
  command/handler layer and injected into `lib`, so no viewer `lib` module defaults a production effect
  internally.
- _Context:_ Today `createViewArtifactDependencies` defaults `node:fs` access/read + `gitExec` inside
  `lib/view-artifact.ts`, and `runPagerProcess` / `probePathCommand` default inside `lib/view-renderer.ts`.
- _Approach:_ Lift these defaults to `handlers/view.ts` (already the seam layer) and pass them down; keep `lib`
  pure/DI and preserve the `GitExec` seam for later production-adapter migration.
- _Note:_ Regression floor — `__tests__/unit/view/{artifact,renderer}.test.ts` (they already inject seams).

### `[ ]` **1.5 Add a viewer-scoped import-boundary test**

- _Goal:_ A test rejects upward `lib → commands` imports and directly-bound production effects in the corrected
  viewer `lib` modules, and confirms production effects stay adapter-injected and the compatibility exports
  resolve.
- _Approach:_ Mirror the kernel's `auditKernelBoundary` (`__tests__/unit/kernel/import-boundary.ts`) — a
  TypeScript-compiler-API import-graph walker scoped to the viewer `lib` modules.

    - Asserts: a viewer `lib` module importing `../commands/*` fails the audit.
    - Asserts: a directly-bound production effect (fs / git / spawn / probe) in a corrected `lib` module fails
      the audit.
    - Asserts: the compatibility re-exports (`commands/view.ts`, `commands/view/format.ts`) resolve to the
      relocated `lib` symbols.

---

## **Phase 2:** Artifact resolution — explicit targeting, convention fallback, lifecycle-aware bare view

_Purpose:_ Deliver every resolver-layer behavior in the corrected `lib` resolver: explicit `--for <slug>`
targeting with typed outcomes, conventional `tasks-<slug>.md` fallback, and furthest-present bare-view
selection.

_Design decisions:_ Explicit-target failures fail closed to a single unavailable outcome and never fall back to
the ambient WU (spec § Security and trust boundaries). Target precedence implements arms 1–2; arm 3 (recorded
groom locus) is a forward-compatible consumer seam only, not a dependency.

### `[ ]` **2.1 Add `--for <slug>` with kernel slug validation and identity-global rejection**

- _Goal:_ `arc view [kind] --for <slug>` accepts a validated WU slug as an ambient-context override, rejecting
  identity-global surfaces and malformed slugs before any resolver runs.
- _Context:_ `--for` changes only the WU target; precedence and resolution land in Task 2.2. Register the option
  in `cli.ts` beside `--current` / `--project`, thread through `ViewCliOptions` → `handleView` →
  `RunViewOptions`, and validate via the kernel barrel (`isSlugSafe` / `SlugSchema` from `lib/kernel/index.js`).
  Command help describes the operand as a WU slug and the option as an ambient-context override.

    Build `test-first` (one behavior at a time):

    - a valid slug validates and is threaded to the resolver as the explicit target
    - `--for` with `working-memory`, `inbox`, or `inbox --project` is rejected (identity-global surfaces)
    - a malformed slug (fails `SLUG_PATTERN`) is rejected before resolution with a clear error
    - `--for` is accepted for every WU-scoped kind, including identity-dependent `session-notes`

### `[ ]` **2.2 Neutral typed target-resolution result and checkout-local explicit-target resolver**

- _Goal:_ An explicit `--for` slug resolves through checkout-local lifecycle authority to a neutral typed result
  — eligible target, completed-unsupported, or a single fail-closed unavailable — never falling back to the
  ambient WU and never reading the network oracle or a sibling worktree.
- _Rationale:_ Modeling every miss as one unavailable outcome (rather than reducing it to "no active WU") keeps
  explicit targeting honest and fail-closed per spec § Security and trust boundaries.
- _Approach:_ Extend the neutral result from Task 1.3 with the explicit-target arms. Compose the existing
  checkout-local lifecycle authority — `resolveSlugPosition` / `resolveSlugState` over a `LifecycleIndex`
  (`lib/work-unit/lifecycle-{index,resolver,query}.ts`) — to classify the slug into eligible
  (`backlog/provisional` · `backlog/planned` · `active`), completed, or miss; the command builds the
  `LifecycleIndex` from a checkout-local scan (production read, no network). The index carries only
  State / Cohort / Depends On, so the explicit arm reads the resolved target meta's `**Task List:**` field for
  the tasks pointer (Task 2.3). Keep target selection in the artifact-resolver layer (command passes the
  semantic slug; `lib` composes the neutral authorities).

    - `[ ]` **2.2.a Target precedence (arms 1–2, seam for arm 3)**

        Build `test-first` (one behavior at a time):

        - explicit `--for` slug takes precedence over the ambient active WU
        - absent `--for`, the active WU for the current worktree resolves (arm 2)
        - arm 3 (recorded groom locus) is a typed consumer seam only — never reads a raw locus record or parses
          `arc locus` output

    - `[ ]` **2.2.b Checkout-local explicit-target resolver with typed outcomes**

        Build `test-first` (one behavior at a time):

        - an eligible materialized target (active / planned / provisional) resolves canonical slug, lifecycle
          location, meta path, and artifact group
        - a locally resolved completed slug returns the unsupported-lifecycle (completed) error
        - unknown, malformed/unreadable, remote-only, sibling-worktree-only, and unmaterialized misses all
          return the single unavailable outcome
        - an explicit-target failure never falls back to the ambient WU
        - resolution performs no network oracle call and no sibling-worktree read

### `[ ]` **2.3 Resolve the artifact group by convention and existence**

- _Goal:_ `tasks` resolves to the meta's `Task List` pointer when it points to an existing file, else to the
  conventional `tasks-<slug>.md` sibling of the resolved meta — so a forming task list is viewable before the
  meta pointer is updated, while a valid non-conventional pointer still wins.
- _Context:_ Existence is tested through the injected `pathExists` predicate on `ViewArtifactDependencies` — no
  directory enumeration (keeps the storage seam replaceable). A missing companion stays absence, not error.
- _Note:_ The `Task List` pointer's provenance differs by arm — the ambient arm reads it from the active-session
  envelope; the explicit `--for` arm reads it from the resolved target meta (Task 2.2), since the `LifecycleIndex`
  carries no task-list field. The convention fallback and pointer-wins rule are identical across both.

    Build `test-first` (one behavior at a time):

    - meta pointer present and the file exists → the pointer wins
    - meta pointer `[none]` but a `tasks-<slug>.md` sibling exists → the conventional fallback resolves
    - a valid non-conventional pointer to an existing file is preserved over the convention
    - neither pointer nor sibling exists → absence (not error)

### `[ ]` **2.4 Make bare `arc view` lifecycle-aware**

- _Goal:_ Bare `arc view` renders the furthest-present artifact in the chain meta→draft→spec→tasks (checked in
  reverse), with meta the guaranteed base — useful before a task list exists — while explicit `arc view <kind>`
  keeps exact-kind selection and omitted-kind `--current` still forces tasks.
- _Approach:_ Compute the furthest-present member in `lib/view-artifact.ts` (it owns path derivation +
  `pathExists`). Bare-vs-explicit must reach the resolver: `commands/view/run.ts` stops coercing
  `options.kind ?? "tasks"` for the no-`--current` case and threads a bare signal, and the neutral
  `ResolveViewArtifactOptions.kind` (relocated in Task 1.1) becomes bare-aware (optional / sentinel) — so
  `arc view tasks` stays exact-kind while bare view runs the chain. The only bare-view behavior change is when
  `--current` is absent.

    Build `test-first` (one behavior at a time):

    - bare view with only a meta present renders meta (guaranteed base — no synthetic "nothing present")
    - bare view renders draft over meta, spec over draft, tasks over spec (reverse-chain furthest-present)
    - explicit `arc view spec` still selects exactly spec and retains the existing absence output when missing
    - omitted-kind `--current` still forces tasks and preserves missing / malformed / no-open-task behavior

---

## **Phase 3:** Header metadata — line count and configurable clock

_Purpose:_ Add lightweight, deterministic header metadata in the relocated `lib` formatter: a logical line count
for non-task artifacts and a user-scoped 12h/24h clock — with no repository-history coupling.

_Design decisions:_ `arc.viewClock` mirrors `arc.viewRenderer`'s user-override + warning machinery exactly and
adds no `arc-config.yml` axis. The count is source-logical, never filesystem- or history-derived.

### `[ ]` **3.1 Add a logical line count to non-task headers**

- _Goal:_ Every non-task header carries the artifact's exact logical source line count, placed before the
  rendered-at stamp; task documents keep their counter band with no line count.
- _Approach:_ Count logical source lines of the raw content before header insertion, in the relocated `lib`
  formatter (`formatArtifactHeader` / `prepareViewDocument`).

    Build `test-first` (one behavior at a time):

    - empty content → `0 lines`
    - a terminal newline closes the final line and adds no phantom line
    - CRLF counts as one separator
    - exactly one logical line → `1 line`; every other count → `<N> lines`
    - the line count precedes the rendered-at stamp; the task band receives no line count

### `[ ]` **3.2 Add the `arc.viewClock` user-scoped clock format**

- _Goal:_ A user-scoped `arc.viewClock` git-config key (`24h` / `12h`, default `24h`) selects the rendered-at
  clock format for both the task band and non-task headers, resolved through the same user-override + warning
  machinery as `arc.viewRenderer`.
- _Approach:_ Add `VIEW_CLOCK_GIT_CONFIG_KEY` / `VIEW_CLOCKS` / `isViewClock` and resolve via
  `resolveGitConfigOverride` (default `24h`; no PATH fallback — use the default on non-git-config source). Resolve
  the clock **unconditionally at the handler** (injected exec/readFile) and pass it into `prepareViewDocument`
  alongside `now`, threading its invalid-value warning into `prepared.warnings` — not co-located with the TTY-only
  `resolveViewRenderer`, or the clock and its warning never reach non-TTY output (headers render before the
  non-TTY return in `run.ts`). `formatTime` then applies the shared clock to the band and headers.
- _Note:_ `arc.viewClock` shares the renderer key's migration seam to `config-storage-architecture`; add no
  `arc-config.yml` axis.

    Build `test-first` (one behavior at a time):

    - `24h` renders zero-padded (e.g. `09:05`) — the default when the key is unset
    - `12h` renders locale-independent and hour-unpadded (`9:05 AM` / `9:05 PM`)
    - midnight is `12:xx AM`; noon is `12:xx PM`
    - an invalid `arc.viewClock` value warns and falls back to `24h` (parity with `arc.viewRenderer`)
    - the selected format applies to both the task band and non-task headers

---

## **Phase 4:** Line-addressable anchoring — top margin and phase context

_Purpose:_ Improve Bat/plain task opening: preserve a top-margin line above the anchor, and open the first
parent task of a phase at its phase heading. Glow's pattern-based anchor is deliberately untouched throughout.

_Design decisions:_ Expose the phase-heading line through the task-list analysis result rather than reparsing
Markdown in the view formatter. The first-parent predicate keys on the parent section, not the current leaf, so
it holds while work advances into later subtasks.

### `[ ]` **4.1 Expose the first-parent phase anchor through the task-list analysis result**

- _Goal:_ `analyzeTaskList` reports the phase-heading line **only when the current section is the first
  parent-task section in its phase** — so the value's presence _is_ the first-in-phase signal Task 4.3 keys on,
  with no Markdown reparse in the formatter. Later parents and implicit-phase lists expose no phase anchor.
- _Context:_ The parser tracks `phaseIndex` per task (and phase headings via `PHASE_HEADING_RE`), so it owns the
  determination — `firstOpenCursor` gives the current section; it is first-in-phase iff it is the first
  parent-task section carrying that `phaseIndex`. Surface the result on the analysis `found` result (the shape
  Task 4.3 consumes) — decide there vs. `TaskListTallies` before 4.3 reads it.
- _Note:_ `analyzeTaskList` is shared code — `resolveTaskListCursor` / `file-cursor.ts` feed `handlers/status.ts`
  and `handlers/recover-probes.ts`. `__tests__/unit/task-list/cursor.test.ts` is the regression floor for the
  additive change.

    Build `test-first` (one behavior at a time):

    - the current section being the first parent-task in its explicit phase exposes the phase-heading line
    - a later (non-first) parent in an explicit phase exposes no phase anchor
    - the phase anchor holds while the current task advances through later subtasks inside that first parent
    - a task list with only an implicit phase (no explicit phase headings) exposes no phase anchor

### `[ ]` **4.2 Preserve a top margin for line-addressable anchors**

- _Goal:_ For Bat and plain, the pager opens one source line above the current-task target (the guaranteed blank
  line), accounting for the prepended task band and clamping to the document's first line; Glow is unchanged.
- _Approach:_ In the anchor calculation (`prepareViewDocument` currently sets `cursor.section.lineHint + 2` in
  `format.ts`, relocated to `lib/view/format.ts` in Task 1.2; `run.ts` only consumes `prepared.anchor`), target
  the preceding blank source line, translate through the band offset, and clamp to line 1.
- _Note:_ Shifts existing anchor assertions by the top margin — `view.e2e.test.ts`'s `+7` and `format.test.ts`'s
  current-task `anchor` line; update both here (Task 4.3 then re-anchors the first-in-phase case again).

    Build `test-first` (one behavior at a time):

    - a normal current task opens one source line above its target line
    - the band offset is accounted for when translating the source anchor into the prepared document
    - a target at the top of the file clamps to the first line (no negative or zero anchor)
    - Glow's task-id pattern anchor is unchanged (top-margin is a no-op there)

### `[ ]` **4.3 Anchor the first parent task to its phase**

- _Goal:_ When the current parent task is the first in its explicit phase, Bat/plain open one line above the
  phase heading (not the task) and stay there while a later subtask inside that first parent is current; every
  later parent anchors to its own preceding line; Glow is unchanged.
- _Context:_ The predicate is exactly "Task 4.1 exposed a phase anchor" — 4.1 conditions it on the current
  section being first-in-phase (keying on the parent section, not `cursor.leaf`). A later parent or an implicit
  phase exposes no phase anchor, so anchoring falls back to Task 4.2's normal preceding-task margin.
- _Approach:_ When Task 4.1's phase anchor is present, target the line above the phase heading; otherwise reuse
  Task 4.2's preceding-line margin.
- _Note:_ Re-anchors the first-in-phase fixture — the same `view.e2e.test.ts` / `format.test.ts` anchor
  assertions Task 4.2 already shifted move again above the phase heading; update them with this change.

    Build `test-first` (one behavior at a time):

    - the first parent in an explicit phase anchors one line above the phase heading
    - the phase anchor holds while a later subtask within that first parent is current
    - a later (non-first) parent anchors to its own preceding blank line
    - an implicit-phase task list uses the normal preceding-task anchor
    - Glow pattern anchoring is unchanged

---

## **Phase 5:** Glow loose-list fidelity

_Purpose:_ Restore blank-separated sibling-list spacing under Glow via a conservative transient adapter, without
changing stored source, Bat, or plain output, and without introducing a second Markdown parser.

_Design decisions:_ Conservative proof — insert an HTML comment only where the existing state machine can prove
a blank-separated sibling boundary; leave ambiguous boundaries compact (a false negative is acceptable, a
semantic rewrite is not). Pin the causal behavior with an available-binary Glow probe; disable the adapter
rather than broaden or postprocess ANSI if a supported Glow/Glamour version invalidates the assumption.

### `[ ]` **5.1 Add the transient loose-list boundary adapter to Glow preparation**

- _Goal:_ Under Glow, blank-separated sibling list items display with one blank row restored, by inserting a
  prefix-matched HTML comment at boundaries the existing state machine can prove — leaving source, non-TTY
  plain, Bat, and plain-pager input byte-for-byte unchanged.
- _Rationale:_ Glamour flattens loose-list spacing and offers no tight/loose style selector, so fidelity must be
  restored in Glow's transient input, not via a style file or ANSI postprocessing.
- _Approach:_ In `prepareGlowContent`, apply the adapter to the soft-break-normalized content **up front**
  (before the terminal-width guards), so every Glow return path — including the two early returns when
  `terminalWidth` is undefined or the content width collapses — carries the restoration; width-wrap the adapted
  content afterward. Reuse `parseFenceStart` / `isFenceClose`, `parseBlockquote`, and
  `LIST_ITEM_RE` / `LIST_ITEM_PREFIX_RE` awareness. Ambiguous boundaries stay compact.

    - `[ ]` **5.1.a Provable blank-separated sibling-boundary detector**
        - _Goal:_ The proof establishes the enclosing blockquote, list depth, sibling container, and compatible
          list form while respecting fenced blocks and multi-block items.

        Build `test-first` (one behavior at a time):

        - a top-level loose unordered list proves a boundary at each sibling gap; a tight list proves none
        - a nested list proves the boundary at the correct depth and container
        - fenced blocks and multi-block items are respected (no boundary claimed inside a fence)
        - a blockquote-enclosed list carries the blockquote prefix into the proof
        - an ambiguous boundary proves nothing (left compact — false negative acceptable, no semantic rewrite)

    - `[ ]` **5.1.b Insert the prefixed HTML comment and confine to Glow input**

        Build `test-first` (one behavior at a time):

        - the inserted comment uses the same blockquote prefix and list-container indentation
        - the source file, non-TTY plain output, Bat input, and plain-pager input are unchanged
        - task-list markers and nested list content are byte-for-byte unchanged apart from the transient comment

### `[ ]` **5.2 Materialize ordered-list ordinals in the transient copy**

- _Goal:_ Ordered lists that use lazy repeated markers (`1.`, `1.`) keep their displayed `1, 2, …` numbering
  after the transient split, by computing and materializing the ordinal in the transient copy only.

    Build `test-first` (one behavior at a time):

    - lazy repeated `1.` markers render as sequential `1, 2, …` after adaptation
    - an already-sequential ordered list is preserved
    - the transient ordinal is the only change beyond the inserted comment; the source stays unchanged

### `[ ]` **5.3 Pin Glow behavior with an available-binary probe test**

- _Goal:_ A test drives real Glow (when the binary is available) to confirm the HTML-comment mechanism actually
  restores the blank row, and is skipped — not failed — when Glow is absent; if a supported Glow/Glamour version
  invalidates the assumption, the adapter is disabled rather than broadened.
- _Approach:_ Gate the test with a real Glow-binary availability probe (a successful `glow --version`) as the
  `it.runIf` predicate — skipped, not failed, when absent. This is the causal real-binary check, distinct from
  the deterministic fake-bin composition tests (Tasks 5.1 / 5.2), which simulate Glow and never exercise the real
  renderer. No per-invocation version probe is added to production.
- _Note:_ This is the causal pin for Task 5.1 — a regression here means disabling the adapter, never adding ANSI
  postprocessing.

---

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A conventional `tasks-<slug>.md` beside a resolved meta renders before the meta's `Task List` pointer is
  updated; a valid existing non-conventional pointer still wins
- `[ ]` `arc view --for <slug>` resolves active, planned, and provisional WUs through checkout-local authority;
  accepts no path; performs no network or direct sibling-worktree read; never falls back on failure; returns one
  unavailable outcome for every unresolved miss; returns the completed-specific error only for a locally
  resolved completed record
- `[ ]` `--for` is rejected for identity-global surfaces (`working-memory`, `inbox`, `inbox --project`) and
  accepted for every WU-scoped kind including `session-notes`
- `[ ]` Bare `arc view` renders `tasks`, else `spec`, else `draft`, else `meta`; explicit kinds retain exact
  selection and omitted-kind `--current` remains task-specific
- `[ ]` Every non-task header carries the exact logical line count (empty / terminal-newline / no-terminal-newline
  / multiline / CRLF); task documents retain the counter band without a line count
- `[ ]` `arc.viewClock=24h` and `12h` produce the specified locale-independent timestamps (including midnight and
  noon), with `24h` the default and an invalid value warning then falling back
- `[ ]` Bat and plain open one source line above the normal current-task target; when the current parent is the
  first in its explicit phase they open one line above the phase heading even if a later subtask is current; an
  implicit-phase task list retains the normal preceding-task anchor
- `[ ]` Glow's anchor behavior remains pattern-based and unchanged by the line-addressable anchor refinements
- `[ ]` Glow displays one blank row at every supported blank-separated sibling boundary, preserves computed
  ordered numbering, leaves ambiguous boundaries compact, and changes no stored source or Bat/plain output
- `[ ]` Non-TTY invocation remains plain, pager-free, ANSI-free, and render-once; the command adds no writes,
  watch loop, input handling, or arbitrary-path surface
- `[ ]` Corrected viewer `lib` modules have no upward command imports or directly bound production effects;
  command adapters own filesystem, lifecycle, Git-config, executable-probe, and process-spawn effects
- `[ ]` Existing public viewer imports remain valid through compatibility exports; the correction introduces no
  competing layout service, command-input framework, Git executor, or general substrate
- `[ ]` All new behavior is covered through injected unit seams and command-level integration tests, with the
  optional real-Glow probe confirming the renderer assumption where the binary exists
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

---
