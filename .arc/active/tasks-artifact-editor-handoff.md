# Task List: Artifact Editor Handoff

- **Design:** `spec-artifact-editor-handoff.md`

---

## **Phase 1:** Editor destination for artifact viewing

_Purpose:_ Deliver editor access through the existing viewer, keeping selection, process handoff, and CLI policy
in one exercisable capability.

_Mode:_ `slice` — closes on a resolved artifact opened through the CLI's guarded editor destination.

_Exit criterion:_ An interactive `arc view --editor` hands the same real absolute file as `--path` to the selected
command; forbidden and failed invocations return diagnostics, and ordinary view destinations remain compatible.

### `[ ]` **1.1 Hand resolved artifacts to the configured editor — Decisions 1, 2, 3, 4**

- _Goal:_ Editor handoff opens the resolved real file with the chosen command, preserves literal filename transport,
  and reports process failures without producing ARC presentation content.

- _Note:_ See `notes-artifact-editor-handoff.md` § Existing seams for shell argument transport and the
  noninteractive Git environment override.

    - `[x]` **1.1.a Select and launch the editor through an injectable process boundary**
        - Added `src/handlers/view-editor.ts` with injected Git/process ports.
          Non-empty `ARC_EDITOR` overrides Git selection; an invocation-local Git shell alias transports the real
          file as literal argv, inherits terminal streams, waits, and reports failures with an override remedy.

    - `[ ]` **1.1.b Route resolved artifacts to the editor before presentation**
        - Extend `RunViewOptions` in `src/lib/view/types.ts` and `ViewDependencies` in `src/commands/view/run.ts`
          with the editor option and injectable launcher. Preserve existing callers and the public view surface.
        - In `runView`, reuse the existing resolver and absolute-path conversion used by `--path`; return from the
          editor branch before `readFile`, `prepareViewDocument`, renderer discovery, or paging.
        - Build `test-first` (one behavior at a time) in `__tests__/unit/view/run.test.ts`:
            - Resolved editor handoff passes the actual absolute file once and returns empty ARC stdout on success;
              presentation dependencies are unused and ARC performs no artifact rewrite.
            - Missing/error artifacts return nonzero without launching. Invalid destination combinations and
              forbidden interaction refuse before resolution or editor selection/launch.
            - Selection/launch/exit failures become nonzero stderr diagnostics naming `ARC_EDITOR`, with no silent
              fallback; a successful subsequent handoff returns normally.

### `[ ]` **1.2 Expose guarded editor handoff through the CLI — Decisions 1, 3, 4**

- _Goal:_ `arc view [kind] --editor` and `-e` reach the launcher only when interaction is allowed, while preserving
  all existing artifact selection and destination behavior.

    - `[ ]` **1.2.a Register and validate the editor destination**
        - Add `--editor` / `-e` in `src/cli.ts`; extend `ViewCliOptions`, `ViewCommandInputSchema`, and
          `viewCommandInputRegistration` in `src/handlers/view.ts`.
        - Build `test-first` (one behavior at a time):
            - Both spellings map to the same editor option; omitted kind remains omitted for lifecycle selection.
            - `--editor --path` and `--editor --current` fail before resolution/launch. Existing kind, `--current`,
              `--project`, slug, and identity-global `--for` validation remains effective.
            - Command-input inventory accounts for the new option/schema field and every editor subprocess site.

    - `[ ]` **1.2.b Wire interaction policy and prove selection compatibility**
        - In `handleView`, refuse editor mode using the supplied `InteractionContext` before editor selection;
          carry permission into orchestration explicitly. Wire the real adapter through the injectable launcher.
        - `handleView` currently resolves `resolveViewClock` eagerly: bypass that presentation setup for editor
          mode as well as rendering. Preserve the existing clock and renderer behavior for ordinary viewing.
        - Extend `viewCommandInputPolicyDeclarations` for the editor effect with `subprocess: "editor"` and
          `automation.noInput: "refuse"`; retain the presenter's existing direct-render policy.
        - Build `test-first` (one behavior at a time), using injected launchers and the real artifact resolver:
            - Bare rendering and editor mode select the same file for each tasks → spec → draft → meta fallback;
              reuse the cases in `__tests__/unit/view/artifact.test.ts` without changing `resolveFurthestPresent`.
            - Explicit kinds, permitted `--for` targets, identity-scoped artifacts, and `inbox --project` hand off
              exactly the path from matching `--path` invocations. Leave `VIEW_KINDS` and resolution untouched.
            - Allowed interaction reaches the adapter; `--no-input`, CI, piped stdin, and piped stdout refuse before
              editor selection/launch. The synthetic `GIT_EDITOR=true` from `applyInteractionEnvironment` is unused.
            - Existing rendering, path output, absence messages, and current-task excerpts remain compatible;
              editor mode does not invoke clock/formatting/renderer dependencies.
        - Cover actual CLI parsing and noninteractive refusal in `__tests__/e2e/view.e2e.test.ts`; accepted handoff
          scenarios use an injected adapter or harmless recorder, never the person's configured editor.

### `[ ]` **1.3 Document the editor destination — Decision 4**

- _Goal:_ Command help and the quick reference let a person choose editor handoff, configure it, and understand
  completion and interaction requirements without needing implementation context.

    - Update view help in `src/cli.ts` and add artifact-viewing guidance under `ARC CLI Commands` in
      `packages/arc-framework/arc/reference/QUICK-REFERENCE.template.md`, then sync the installed reference through
      the normal package/project update flow.
    - Describe `--editor` / `-e`, unchanged bare-view selection, `ARC_EDITOR`, delegation to Git's editor selection
      and fallback, inherited terminal interaction, conflicts with `--path` / `--current`, and noninteractive refusal.
    - Explain that ARC waits for the configured command without changing wait flags; command success confirms
      handoff, not that a buffer was opened or saved. Include a wait-enabled GUI command example.
    - Check emitted help for both option spellings and the documented contract; run the existing command-reference
      validation. Documentation prose is test-after; no separate documentation-only test suite is needed.

## **Phase 2:** Verification

### `[ ]` **2.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The completed viewer satisfies the editor-handoff contract and compatibility checks, with quality gates
  and evidence sufficient for integration.

---

## Success Criteria

- `[ ]` With kind omitted, bare rendering and editor handoff select the same real artifact for all four defaults
  in tasks → spec → draft → meta order.

- `[ ]` Explicit kinds and permitted `--for` / `--project` selections send exactly the matching `--path` absolute
  filename to the injected launcher, without ARC presentation content, temporary copies, or artifact rewrites.

- `[ ]` Non-empty `ARC_EDITOR` takes precedence; otherwise editor selection delegates to `git var GIT_EDITOR`,
  including its fallback. Selection failures report `ARC_EDITOR` as a remedy and never silently switch editors.

- `[ ]` Executable/argument checks prove quoted commands and command-side expansion while filenames containing
  spaces, quotes, and shell metacharacters remain literal arguments on supported platforms.

- `[ ]` Process checks prove inherited streams, waiting for completion, and unchanged configured wait flags;
  launch errors, signals, and unsuccessful exits return nonzero stderr diagnostics and allow retry after repair.

- `[ ]` Conflicting editor flags, forbidden interaction, and missing/error artifacts return nonzero diagnostics
  without launching; interaction refusal occurs before selecting an editor.

- `[ ]` Existing rendering, `--path`, and `--current` checks pass. Editor mode skips presentation setup and effects;
  automated checks exercise CLI wiring and use injected launchers or harmless recorders rather than real editors.

- `[ ]` Command help and the synced quick reference describe the option, short form, editor override, Git fallback,
  interaction requirements, and command-wait semantics with a GUI example.

- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
