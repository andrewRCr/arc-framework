# Task List: Artifact Editor Handoff

- **Design:** `spec-artifact-editor-handoff.md`

---

## **Phase 1:** Editor destination for artifact viewing

_Purpose:_ Deliver editor access through the existing viewer, keeping selection, process handoff, and CLI policy
in one exercisable capability.

_Mode:_ `slice` — closes on a resolved artifact opened through the CLI's guarded editor destination.

_Exit criterion:_ An interactive `arc view --editor` hands the same real absolute file as `--path` to the selected
command; forbidden and failed invocations return diagnostics, and ordinary view destinations remain compatible.

### `[x]` **1.1 Hand resolved artifacts to the configured editor — Decisions 1, 2, 3, 4**

- _Goal:_ Editor handoff opens the resolved real file with the chosen command, preserves literal filename transport,
  and reports process failures without producing ARC presentation content.

    - `[x]` **1.1.a Select and launch the editor through an injectable process boundary**
        - Added `src/handlers/view-editor.ts` with injected Git/process ports.
          Non-empty `ARC_EDITOR` overrides Git selection; an invocation-local Git shell alias transports the real
          file as literal argv, inherits terminal streams, waits, and reports failures with an override remedy.

    - `[x]` **1.1.b Route resolved artifacts to the editor before presentation**
        - Added an injectable editor destination to `runView`, using the resolver's real absolute file before
          reading or formatting. Conflicting destinations and missing interaction permission refuse before
          resolution; absence and failed handoffs return diagnostics, and repaired commands can retry.

### `[x]` **1.2 Expose guarded editor handoff through the CLI — Decisions 1, 3, 4**

- _Goal:_ `arc view [kind] --editor` and `-e` reach the launcher only when interaction is allowed, while preserving
  all existing artifact selection and destination behavior.

    - `[x]` **1.2.a Register and validate the editor destination**
        - Registered `--editor` / `-e`, normalized the editor schema field, and declared its interaction policy.
          Schema validation preserves omitted-kind selection and existing selector restrictions while refusing
          conflicting editor destinations before resolution.

    - `[x]` **1.2.b Wire interaction policy and prove selection compatibility**
        - Wired the editor adapter after explicit interaction checks, bypassed presentation clock setup, and
          declared the editor process boundary. Recorder-based CLI coverage compares bare fallback, explicit,
          identity-scoped, and project-inbox paths with `--path`, and exercises refusal and repair/retry behavior.

### `[x]` **1.3 Document the editor destination — Decision 4**

- _Goal:_ Command help and the quick reference let a person choose editor handoff, configure it, and understand
  completion and interaction requirements without needing implementation context.

- _Outcome:_ View help and both quick-reference copies describe editor selection, destination conflicts,
  interaction requirements, and wait-enabled GUI use. The installed reference retains its self-hosting prefix.

## **Phase 2:** Verification

### `[x]` **2.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The completed viewer satisfies the editor-handoff contract and compatibility checks, with quality gates
  and evidence sufficient for integration.

- _Quality gates:_ Full Markdown, TypeScript, and shell lint, both type checks, ARC contract checks, 13,294 routine
  tests, 41 view E2E checks, and the production build passed.
- _Success criteria:_ All ten met, with none superseded or deferred. The fresh-context follow-up returned no findings
  after the command-preservation and helper-collision fixes in `8729b64e9`.

---

## Success Criteria

- `[x]` With kind omitted, bare rendering and editor handoff select the same real artifact for all four defaults
  in tasks → spec → draft → meta order.

- `[x]` Explicit kinds and permitted `--for` / `--project` selections send exactly the matching `--path` absolute
  filename to the injected launcher, without ARC presentation content, temporary copies, or artifact rewrites.

- `[x]` Non-empty `ARC_EDITOR` takes precedence; otherwise editor selection delegates to `git var GIT_EDITOR`,
  including its fallback. Selection failures report `ARC_EDITOR` as a remedy and never silently switch editors.

- `[x]` Executable/argument checks prove quoted commands and command-side expansion while filenames containing
  spaces, quotes, and shell metacharacters remain literal arguments on supported platforms.

- `[x]` Process checks prove inherited streams, waiting for completion, and unchanged configured wait flags;
  launch errors, signals, and unsuccessful exits return nonzero stderr diagnostics and allow retry after repair.

- `[x]` Conflicting editor flags, forbidden interaction, and missing/error artifacts return nonzero diagnostics
  without launching; interaction refusal occurs before selecting an editor.

- `[x]` Existing rendering, `--path`, and `--current` checks pass. Editor mode skips presentation setup and effects;
  automated checks exercise CLI wiring and use injected launchers or harmless recorders rather than real editors.

- `[x]` Command help and the synced quick reference describe the option, short form, editor override, Git fallback,
  interaction requirements, and command-wait semantics with a GUI example.

- `[x]` All quality gates pass (tests, linting, type checking).
- `[x]` Ready for integration.
