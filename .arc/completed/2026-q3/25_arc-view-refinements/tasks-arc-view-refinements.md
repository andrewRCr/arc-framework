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

### `[x]` **1.1 Relocate neutral viewer types and `VIEW_KINDS` into `lib`**

- _Goal:_ The viewer's neutral vocabulary — `VIEW_KINDS`, `ViewKind`, `ViewArtifactResult`,
  `ResolveViewArtifactOptions`, `ViewArtifactResolver`, `RunViewOptions`, `ViewOutput` — lives in `lib`, so
  `lib/view-artifact.ts` depends on it downward instead of reaching up into `commands`.
- _Outcome:_ Neutral viewer contracts now live in `lib/view/types.ts`; both command surfaces preserve their public
  compatibility exports.

### `[x]` **1.2 Move semantic formatting out of `commands/view/format.ts` into `lib`**

- _Goal:_ Semantic formatting (`formatTaskBand`, `formatArtifactHeader`, `prepareViewDocument`, and their
  helpers) lives in `lib` (`lib/view/format.ts`, joining the new `lib/view/` directory from Task 1.1), with
  `commands/view/run.ts` importing it from `lib` and a compatibility re-export left at `commands/view/format.ts`.
- _Outcome:_ Formatting now lives in `lib/view/format.ts`; the prior command module is a compatibility re-export
  and command orchestration imports downward into the relocated implementation.

### `[x]` **1.3 Invert `lib/view-artifact.ts` upward `commands` imports**

- _Goal:_ `lib/view-artifact.ts` imports no `commands` module — it consumes a neutral viewer result defined in
  `lib`, and the command layer adapts its active-session envelope into that shape and owns checkout-local
  lifecycle lookup.
    - `[x]` **1.3.a Define the neutral viewer result type in `lib`**
        - Added the canonical slug, lifecycle location, meta path, and task-pointer target contract plus typed
          completed and unavailable outcomes in `lib/view/types.ts`.

    - `[x]` **1.3.b Adapt the active-session envelope in the command layer; drop the `commands` imports**
        - Added and unit-tested the pure `adaptActiveViewTarget` command adapter, including unique branch
          disambiguation; `lib/view-artifact.ts` now consumes only neutral injected target authorities.

- _Outcome:_ The artifact resolver has no command imports, while the command layer retains ownership of the active
  envelope and its task-list-pointer interpretation.

### `[x]` **1.4 Inject viewer production effects from the command layer**

- _Goal:_ Filesystem/access, Git-config execution, executable probing, and process spawning are bound in the
  command/handler layer and injected into `lib`, so no viewer `lib` module defaults a production effect
  internally.
- _Outcome:_ Filesystem, Git-config, lifecycle scanning, executable probing, and process spawning are bound in
  `handlers/view.ts`; viewer library modules require injected ports and retain deterministic unit seams.

### `[x]` **1.5 Add a viewer-scoped import-boundary test**

- _Goal:_ A test rejects upward `lib → commands` imports and directly-bound production effects in the corrected
  viewer `lib` modules, and confirms production effects stay adapter-injected and the compatibility exports
  resolve.
- _Outcome:_ A TypeScript-AST boundary test rejects command imports and directly bound production effects across
  the corrected viewer modules and verifies both compatibility export surfaces resolve.

---

## **Phase 2:** Artifact resolution — explicit targeting, convention fallback, lifecycle-aware bare view

_Purpose:_ Deliver every resolver-layer behavior in the corrected `lib` resolver: explicit `--for <slug>`
targeting with typed outcomes, conventional `tasks-<slug>.md` fallback, and furthest-present bare-view
selection.

_Design decisions:_ Explicit-target failures fail closed to a single unavailable outcome and never fall back to
the ambient WU (spec § Security and trust boundaries). Target precedence implements arms 1–2; arm 3 (recorded
groom locus) is a forward-compatible consumer seam only, not a dependency.

### `[x]` **2.1 Add `--for <slug>` with kernel slug validation and identity-global rejection**

- _Goal:_ `arc view [kind] --for <slug>` accepts a validated WU slug as an ambient-context override, rejecting
  identity-global surfaces and malformed slugs before any resolver runs.
- _Outcome:_ The CLI threads validated WU slugs through the viewer, rejects malformed slugs and every
  identity-global combination before resolution, and accepts all WU-scoped kinds including `session-notes`.

### `[x]` **2.2 Neutral typed target-resolution result and checkout-local explicit-target resolver**

- _Goal:_ An explicit `--for` slug resolves through checkout-local lifecycle authority to a neutral typed result
  — eligible target, completed-unsupported, or a single fail-closed unavailable — never falling back to the
  ambient WU and never reading the network oracle or a sibling worktree.
    - `[x]` **2.2.a Target precedence (arms 1–2, seam for arm 3)**
        - Explicit selection bypasses ambient resolution; ambient selection precedes the optional typed
          recorded-target port, which has no raw-locus or command-output dependency.

    - `[x]` **2.2.b Checkout-local explicit-target resolver with typed outcomes**
        - The command adapter builds the checkout-local lifecycle index, reads the materialized meta, and returns
          eligible, completed, or one unavailable outcome; misses never invoke or fall back to ambient authority.

- _Outcome:_ Target selection is a neutral, fail-closed composition over injected ambient, explicit lifecycle,
  and future recorded-target authorities; production explicit lookup is checkout-local and network-free.

### `[x]` **2.3 Resolve the artifact group by convention and existence**

- _Goal:_ `tasks` resolves to the meta's `Task List` pointer when it points to an existing file, else to the
  conventional `tasks-<slug>.md` sibling of the resolved meta — so a forming task list is viewable before the
  meta pointer is updated, while a valid non-conventional pointer still wins.
- _Outcome:_ Artifact resolution uses the injected existence predicate to preserve a live pointer, fall back to
  the conventional task sibling for missing or stale pointers, and return absence when neither candidate exists.

### `[x]` **2.4 Make bare `arc view` lifecycle-aware**

- _Goal:_ Bare `arc view` renders the furthest-present artifact in the chain meta→draft→spec→tasks (checked in
  reverse), with meta the guaranteed base — useful before a task list exists — while explicit `arc view <kind>`
  keeps exact-kind selection and omitted-kind `--current` still forces tasks.
- _Outcome:_ Bare invocation now probes `tasks → spec → draft → meta`, explicit kinds remain exact, and omitted-kind
  `--current` still forces the established task-only path and degrade behavior.

---

## **Phase 3:** Header metadata — line count and configurable clock

_Purpose:_ Add lightweight, deterministic header metadata in the relocated `lib` formatter: a logical line count
for non-task artifacts and a user-scoped 12h/24h clock — with no repository-history coupling.

_Design decisions:_ `arc.viewClock` mirrors `arc.viewRenderer`'s user-override + warning machinery exactly and
adds no `arc-config.yml` axis. The count is source-logical, never filesystem- or history-derived.

### `[x]` **3.1 Add a logical line count to non-task headers**

- _Goal:_ Every non-task header carries the artifact's exact logical source line count, placed before the
  rendered-at stamp; task documents keep their counter band with no line count.
- _Outcome:_ Non-task formatting counts empty, terminal-newline, CRLF, singular, and plural source shapes before
  header insertion; task bands retain their counter-only metadata.

### `[x]` **3.2 Add the `arc.viewClock` user-scoped clock format**

- _Goal:_ A user-scoped `arc.viewClock` git-config key (`24h` / `12h`, default `24h`) selects the rendered-at
  clock format for both the task band and non-task headers, resolved through the same user-override + warning
  machinery as `arc.viewRenderer`.
- _Outcome:_ `arc.viewClock` resolves unconditionally through the shared user-override machinery, defaults to
  zero-padded `24h`, formats locale-independent `12h` edge cases, and carries invalid-value warnings to non-TTY
  output as well as pager paths.

---

## **Phase 4:** Line-addressable anchoring — top margin and phase context

_Purpose:_ Improve Bat/plain task opening: preserve a top-margin line above the anchor, and open the first
parent task of a phase at its phase heading. Glow's pattern-based anchor is deliberately untouched throughout.

_Design decisions:_ Expose the phase-heading line through the task-list analysis result rather than reparsing
Markdown in the view formatter. The first-parent predicate keys on the parent section, not the current leaf, so
it holds while work advances into later subtasks.

### `[x]` **4.1 Expose the first-parent phase anchor through the task-list analysis result**

- _Goal:_ `analyzeTaskList` reports the phase-heading line **only when the current section is the first
  parent-task section in its phase** — so the value's presence _is_ the first-in-phase signal Task 4.3 keys on,
  with no Markdown reparse in the formatter. Later parents and implicit-phase lists expose no phase anchor.
- _Outcome:_ Task-list analysis now exposes an optional phase-heading line only for the first parent in an explicit
  phase, including when a later subtask is current; later parents and implicit phases expose no anchor.

### `[x]` **4.2 Preserve a top margin for line-addressable anchors**

- _Goal:_ For Bat and plain, the pager opens one source line above the current-task target (the guaranteed blank
  line), accounting for the prepended task band and clamping to the document's first line; Glow is unchanged.
- _Outcome:_ Prepared line anchors target the preceding source line, include the two-line task-band offset, and
  clamp at the document start; Glow continues to consume only the unchanged task-id anchor.

### `[x]` **4.3 Anchor the first parent task to its phase**

- _Goal:_ When the current parent task is the first in its explicit phase, Bat/plain open one line above the
  phase heading (not the task) and stay there while a later subtask inside that first parent is current; every
  later parent anchors to its own preceding line; Glow is unchanged.
- _Outcome:_ Bat/plain use the phase heading when analysis supplies it and otherwise use the parent-task margin;
  first-parent subtasks retain phase context, while later and implicit-phase parents follow the normal path.

---

## **Phase 5:** Glow loose-list fidelity

_Purpose:_ Restore blank-separated sibling-list spacing under Glow via a conservative transient adapter, without
changing stored source, Bat, or plain output, and without introducing a second Markdown parser.

_Design decisions:_ Conservative proof — insert an HTML comment only where the existing state machine can prove
a blank-separated sibling boundary; leave ambiguous boundaries compact (a false negative is acceptable, a
semantic rewrite is not). Pin the causal behavior with an available-binary Glow probe; disable the adapter
rather than broaden or postprocess ANSI if a supported Glow/Glamour version invalidates the assumption.

### `[x]` **5.1 Add the transient loose-list boundary adapter to Glow preparation**

- _Goal:_ Under Glow, blank-separated sibling list items display with one blank row restored, by inserting a
  prefix-matched HTML comment at boundaries the existing state machine can prove — leaving source, non-TTY
  plain, Bat, and plain-pager input byte-for-byte unchanged.
    - `[x]` **5.1.a Provable blank-separated sibling-boundary detector**
        - Proves only blank-only gaps between matching blockquote, indentation, and list-form containers; nested,
          fenced, tight, and ambiguous multi-block cases remain correctly scoped or untouched.

    - `[x]` **5.1.b Insert the prefixed HTML comment and confine to Glow input**

        - Inserts the fixed comment with the proved container prefix before width handling; task markers and
          nested content remain unchanged, and Bat/plain inputs bypass the adapter.

- _Outcome:_ Glow alone receives a conservative transient split at provable loose sibling boundaries, including
  top-level, nested, and blockquoted lists, without source mutation or ANSI postprocessing.

### `[x]` **5.2 Materialize ordered-list ordinals in the transient copy**

- _Goal:_ Ordered lists that use lazy repeated markers (`1.`, `1.`) keep their displayed `1, 2, …` numbering
  after the transient split, by computing and materializing the ordinal in the transient copy only.

- _Outcome:_ Repeated ordered markers become sequential only in the Glow copy when a proved split occurs;
  already-sequential markers and every non-Glow/source surface remain unchanged.

### `[x]` **5.3 Pin Glow behavior with an available-binary probe test**

- _Goal:_ A test drives real Glow (when the binary is available) to confirm the HTML-comment mechanism actually
  restores the blank row, and is skipped — not failed — when Glow is absent; if a supported Glow/Glamour version
  invalidates the assumption, the adapter is disabled rather than broadened.
- _Outcome:_ The unit suite probes `glow --version` once and conditionally drives the real renderer to require a
  blank display row; environments without Glow skip the causal probe while deterministic composition tests run.

---

## **Phase 6:** Verification

### `[x]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Markdown, TypeScript, and shell lint; source/test typechecking; full Vitest suite; real Glow probe;
  and build all passed.
- _Success criteria:_ All 15 criteria met; two adversarial passes and live task-list validation surfaced six
  confirmed findings, all resolved and regression-covered.

---

## Success Criteria

- `[x]` A conventional `tasks-<slug>.md` beside a resolved meta renders before the meta's `Task List` pointer is
  updated; a valid existing non-conventional pointer still wins
- `[x]` `arc view --for <slug>` resolves active, planned, and provisional WUs through checkout-local authority;
  accepts no path; performs no network or direct sibling-worktree read; never falls back on failure; returns one
  unavailable outcome for every unresolved miss; returns the completed-specific error only for a locally
  resolved completed record
- `[x]` `--for` is rejected for identity-global surfaces (`working-memory`, `inbox`, `inbox --project`) and
  accepted for every WU-scoped kind including `session-notes`
- `[x]` Bare `arc view` renders `tasks`, else `spec`, else `draft`, else `meta`; explicit kinds retain exact
  selection and omitted-kind `--current` remains task-specific
- `[x]` Every non-task header carries the exact logical line count (empty / terminal-newline / no-terminal-newline
  / multiline / CRLF); task documents retain the counter band without a line count
- `[x]` `arc.viewClock=24h` and `12h` produce the specified locale-independent timestamps (including midnight and
  noon), with `24h` the default and an invalid value warning then falling back
- `[x]` Bat and plain open one source line above the normal current-task target; when the current parent is the
  first in its explicit phase they open one line above the phase heading even if a later subtask is current; an
  implicit-phase task list retains the normal preceding-task anchor
- `[x]` Glow's anchor behavior remains pattern-based and unchanged by the line-addressable anchor refinements
- `[x]` Glow displays one blank row at every supported blank-separated sibling boundary, preserves computed
  ordered numbering, leaves ambiguous boundaries compact, and changes no stored source or Bat/plain output
- `[x]` Non-TTY invocation remains plain, pager-free, ANSI-free, and render-once; the command adds no writes,
  watch loop, input handling, or arbitrary-path surface
- `[x]` Corrected viewer `lib` modules have no upward command imports or directly bound production effects;
  command adapters own filesystem, lifecycle, Git-config, executable-probe, and process-spawn effects
- `[x]` Existing public viewer imports remain valid through compatibility exports; the correction introduces no
  competing layout service, command-input framework, Git executor, or general substrate
- `[x]` All new behavior is covered through injected unit seams and command-level integration tests, with the
  optional real-Glow probe confirming the renderer assumption where the binary exists
- `[x]` All quality gates pass (tests, linting, type checking)
- `[x]` Ready for integration

---
