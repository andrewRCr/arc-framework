# Task List: projected-markdown-checks

- **Design:** `spec-projected-markdown-checks.md`

---

## **Phase 1:** Refuse introduced link violations in record writes

_Purpose:_ Close ARC's record-side link boundary through production registration and backend writes.

_Mode:_ `slice` — a registered record write refuses newly introduced link violations without checkout access.

_Exit criterion:_ A reference backend using production registrations refuses violating `write` and `batch` calls,
admits unchanged historical violations and valid corrections, and leaves existing kind checks intact.

### `[x]` **1.1 Declare the projected roots through layout — D2.1**

- _Goal:_ Every consumer recognizes the same projected roots, including exact roots and valid identity roots,
  without treating the tracked user README or similarly prefixed directories as projected state.

- _Outcome:_ Shared lifecycle and personal roots and normalized recognition now export through the layout API;
  identity recognition uses `SlugSchema`, preserving the tracked user README and prefix boundaries.

### `[x]` **1.2 Check introduced Markdown link violations — D2.1–D2.3, D2.5**

- _Goal:_ A checkout-independent check returns one actionable `BrokenRule` per newly broken link rule, with all
  new occurrences located in stored content, while unrelated edits to historical violations remain admissible.

    - `[x]` **1.2.a Read Markdown links and full references with source locations**
        - A GFM reader extracts URLs and undefined full references from source text spans, preserving stored
          positions, CommonMark label matching, and the parser's code, HTML, destination, and formatting boundaries.

    - `[x]` **1.2.b Resolve targets by record family and key**
        - Movable records refuse relative links; fixed personal and project-inbox targets resolve through layout.
          Decoding and normalization identify projection roots, while keyed non-Markdown content stays unchecked.

    - `[x]` **1.2.c Refuse only increased violation counts**
        - The write check compares rule/key occurrence counts against prior content independently of parsed fields.
          Each increased key reports all its next-content locations, grouped by rule with the specified retry remedy;
          removals, unchanged historical violations, and corrections remain admissible for every writer.

### `[x]` **1.3 Compose link rules into every covered kind — D2.4, D2.6**

- _Goal:_ Every projecting kind with a stored family receives the link rules exactly once, preserving its parser,
  anchor fields, and the ordering of its original check results.

- _Outcome:_ Production registrations derive fourteen covered kinds from projection and family storage data,
  retain each original parser, anchors, and check order, and add missing link-only registrations without duplicates.
  Reference-store writes and atomic batches refuse each link rule and accept corrected retries and historical content.

### `[x]` **1.4 Exercise record-write admission — D2** — validate exit criterion at segment scope

- _Goal:_ Production registration, not only direct helper calls, proves introduced-only record admission for both
  single writes and batches without depending on the future projection or ref backend.

- _Outcome:_ Production-backed write and batch scenarios admit valid content, refuse introduced violations without
  partial publication, preserve imported historical links, accept corrected retries, and retain metadata authority
  refusals. The runtime bundle includes the GFM parser and both extensions.

## **Phase 2:** Refuse tracked Markdown links into movable or ignored state

_Purpose:_ Enforce the tracked side of the link boundary in the shipped hook and repository audit.

_Mode:_ `slice` — a staged tracked file and the link audit agree on the new target restrictions.

_Exit criterion:_ Real Git fixtures prove both restrictions, repository-root absolute resolution, and the tracked
user README exception; the complete tracked link audit passes after the two named corpus corrections.

### `[ ]` **2.1 Enforce normalized target rules in the shipped hook — D3.1–D3.2**

- _Goal:_ The shipped staged-file check refuses movable and ignored ARC targets before existence fallback, and
  interprets leading-slash targets from the repository root consistently across supported shells.

- _Note:_ See `notes-projected-markdown-checks.md` § Framework synchronization for the non-Markdown counterparts.

    - Update package `arc/system/.internal/scripts/validate-links.sh` at `validate_target`, retaining the source skips
      and current `is_movable` source rule; target recognition additionally includes completed movable artifacts.
    - Normalize repository-relative targets without GNU-only `realpath` flags, then apply movable-target recognition
      and `git check-ignore` for ARC targets. Keep external, anchor-only, template-counterpart, and reference behavior.
    - Update package `arc/system/.internal/githooks/pre-commit`'s `CHECK[markdown-links]` advice with the filename
      correction. Keep all shipped commands in their ordinary `arc` register.
    - Apply the matching targeted edits to installed `.arc/system/.internal/scripts/validate-links.sh` and
      `.arc/system/.internal/githooks/pre-commit`, preserving executable modes. Verify paired-file agreement before
      the installed-script cases pass; these non-Markdown files are outside `render:framework`'s accepted operands.
    - Build `test-first` (one behavior at a time):
        - Extend both `__tests__/integration/validate-links.test.ts` and `integration/scripts/validate-links.test.ts`
          as appropriate, using real temporary repositories for ignore rules and repository-root discovery.
        - Relative and root-absolute movable targets fail even when present; ignored ARC targets fail even when
          present; a tracked user README passes despite broad personal ignore rules.
        - Dot segments, directories, missing targets, source skip rules, existing relative-from-movable refusal,
          undefined references, and portable root-absolute resolution retain their intended behavior.

### `[ ]` **2.2 Audit the same targets and accept named paths — D3.3**

- _Goal:_ The repository audit enforces the same target boundary in its normal corpus and explicit-path modes,
  while preserving target-existence and Markdown-anchor feedback.

    - Extend `resolveTarget`, `checkTarget`, `auditLinks`, and the CLI in `src/scripts/audit-links.ts`; use the layout
      root declaration and an injectable ignored-target result with one batched `git check-ignore --stdin` read.
    - With operands, select exactly the supplied `.arc/` Markdown paths, retaining template/archive exclusions;
      with none, retain `selectLinkAuditFiles` over Git's tracked list. Do not enumerate through Git in named mode.
    - Build `test-first` (one behavior at a time):
        - Both target rules apply before missing-target and anchor checks, including normalized/decoded targets and
          the tracked user README exception; existing source-position and anchor diagnostics still work.
        - Named ignored projected paths can be audited, unrequested files are not read, and no-operand behavior
          retains its existing corpus. Verify the single batched ignore read at the process boundary.
    - Extend `__tests__/unit/scripts/audit-links.test.ts` and add real-Git integration coverage for ignored targets
      and CLI operand handling, rather than proving ignore behavior with a fake filesystem alone.

### `[ ]` **2.3 Correct the existing corpus links and render framework changes — D3.4**

- _Goal:_ The new tracked-link rules land over a clean existing corpus, and installed framework content reflects its
  authoritative package sources.

    - Replace ADR 021's cohort link with `cohort-agile-parallelism.md` as a backticked filename, and replace the
      `02_define-project` ROADMAP link with a backticked path in the package template and its rendered counterpart.
    - Render changed Markdown framework sources/templates with `npm run render:framework -- <package-source.md...>`;
      use its template handling. Task 2.1 synchronizes the hook and shell script through matching targeted edits.
    - Run `npm run -s lint:arc:links` over the whole tracked corpus. Restrict corrections to the specified link rules;
      unrelated findings follow the discovered-work route.

### `[ ]` **2.4 Exercise the tracked-file link boundary — D3** — validate exit criterion at segment scope

- _Goal:_ Both production entry points reject links that Git-hosted readers cannot follow, while legal tracked
  targets still pass and the installed corpus remains valid.

    - Run the real-Git hook and audit scenarios, the no-operand whole-corpus audit, and `npx arc check segment`.
    - Exercise a movable target, a separate ignored target, root-absolute tracked target resolution, the tracked user
      README, and a corrected source that succeeds on retry; cover package-source and installed script paths.

## **Phase 3:** Run selection checks as uncached feedback

_Purpose:_ Take projected paths through the existing check runner without changing Git-backed selection or gates.

_Mode:_ `slice` — `increment`, `segment`, and named runs execute checks over injected projected selections.

_Exit criterion:_ An injected changed selection reaches a batched feedback command; full, named, empty, unavailable,
and recovered selections produce their specified outcomes, while every gate excludes selection checks.

### `[ ]` **3.1 Admit selection declarations and request membership — D4.1, D4.3**

- _Goal:_ Selection declarations are feedback-only by construction, and no existing gate or ordinary declaration
  changes membership or defaults when the new mode is added.

    - Extend `CheckDeclarationSchema` in `lib/checks/declaration.ts` with `selection`; resolve mode-dependent cache
      and widen defaults while preserving explicitly supplied values for refinement and emitted schema behavior.
    - Extend `selectRequestChecks` in `lib/checks/gates.ts` so only `increment`, `segment`, and a named `run` select
      this mode. Keep `checkResultKind` reporting it as feedback through the absence of a gate.
    - Build `test-first` (one behavior at a time):
        - Defaults are false for selection and unchanged for files/project; each forbidden declaration from D4.1
          refuses with its field named, including `ci_only`, `reads_index`, and `fixes` when declared.
        - `runtime_inputs` remains legal; selection has no gate; shell and path-withholding refinements remain sound.
        - Increment/segment add selection checks in declaration order; hooks, every gate, and `new-head` exclude them;
          named runs still validate identifiers and select exactly those requested.
    - Extend unit `lib/checks/declaration.test.ts`, `gates.test.ts`, and the declaration registry/schema tests.

### `[ ]` **3.2 Match explicit path lists with Git pathspecs — D4.2**

- _Goal:_ A supplied path list is filtered exactly as tracked Git pathspec inputs would filter it, without touching
  the checkout's real index, writing objects, or inheriting ambient pathspec policy.

- _Note:_ See `notes-projected-markdown-checks.md` § Check-runner grounding for the existing Git execution seam.

    - Export `inputPathspecs` from `lib/checks/matching.ts` and add the explicit-list matcher using a disposable index,
      `git update-index --add --index-info`, and `git ls-files -z` with those same pathspecs.
    - Use `RawGitExec` for stdin bytes, alternate-index selection, and environment removal; wire its production
      executor at the consumer boundary. Derive the repository's empty-blob ID without `-w`, and clean up in `finally`.
    - Return matched-path success as `{ status: "ok", paths }`, or `{ status: "unavailable", reason }` when temporary
      index preparation or Git matching fails. Preserve the underlying reason instead of letting a rejection escape
      the per-check execution path.
    - Build `test-first` (one behavior at a time):
        - Real Git agrees for every declared input pattern, positive/excluded combinations, dot-directories, case,
          whitespace, newline and pathspec-looking filenames, and empty path/input lists.
        - SHA-1 and supported SHA-256 repositories use the right identity; alternate-index creation and failure leave
          the real index and object store unchanged, and temporary files are removed on either outcome.
        - Temporary-index creation, population, and pathspec-read failures return unavailable with their reason;
          restoring the failed dependency allows the same match to succeed.
        - Ambient `GIT_*_PATHSPECS` settings cannot change explicit matching. Extend `integration/check-matching.test.ts`.

### `[ ]` **3.3 Resolve projected scopes independently of Git changes — D4.2–D4.3, D4.6**

- _Goal:_ One stable projected selection supplies each request's intended scope without selecting or widening any
  Git-backed check, and an unconnected provider yields the specified empty success.

- _Note:_ See `notes-projected-markdown-checks.md` § Check-runner grounding for scope and supplier boundaries.

    - Add `readProjectedSelection(root, { changed })` in `lib/checks/` with the exact success/unavailable union from
      D4.6; initially return empty success unless the supplier interface has already landed, then connect there only.
    - Inject the provider through `DeclaredCheckDependencies` and wire it in `handlers/check/run-cli.ts`; resolve it
      once per request with requested selection checks, sharing the result and mapping reader errors to unavailable.
      Thread an optional selection-reader dependency override through the public check handlers for in-process
      command tests, following `handleSchemaInstall`'s existing override pattern; retain real repository/process I/O.
    - Exclude selection entries from `resolveCheckSelection`'s own-input map and widening coverage in
      `lib/checks/selection.ts`. Filter projected paths independently using Task 3.2's matcher.
      Keep an unavailable match distinct from an empty match and from the request-wide selection-reader result.
    - Build `test-first` (one behavior at a time):
        - Increment and segment request changed paths regardless of their Git coordinates; a named run with no scope
          or `--all` requests the whole selection; explicit paths intersect it; other scopes request changed paths.
        - Preserve named-directory selectors' existing descendant semantics, intersected with the selection, and
          relative operands for a check's `root`; `--ci` does not suppress a selection check.
        - Declarations and `global_inputs` never make selection entries contribute to Git coverage or widening, and
          adding a selection declaration leaves existing files/project selections unchanged.
        - The provider is not read for requests containing no selection check. Unit-test the empty fallback and
          extend `unit/lib/checks/selection.test.ts` and `unit/handlers/check/run.test.ts`.

### `[ ]` **3.4 Execute projected paths without tree evidence or reuse — D4.4**

- _Goal:_ Projected checks execute over live selected files on every request and preserve accurate empty, failed,
  unavailable, retry, and dry-run reporting without borrowing Git-tree evidence.

    - Extend `runRequestedCheck` and its execution path in `handlers/check/run.ts`, `checkArgumentBatches`,
      `CheckForecast`/`resolveCheckForecast`, and `checkRetryCommand` to carry selection mode throughout execution.
    - Keep `readCheckDivergence`, `readRangeMergedInPaths`, and Git content context on the ordinary check paths only;
      use null keys through `resolveCheckKey`'s uncached path and never record or reuse selection passes.
    - Build `test-first` (one behavior at a time):
        - Commands receive literal paths in bounded batches relative to `root`; repeats execute again and successful
          outcomes are `not-recordable`, even when ordinary checks in the same request reuse their passes.
        - Empty filtered paths report `not selected`/`no files to check`; failed feedback exits 1; an unavailable or
          thrown provider gives every affected check `couldn't run` with its reason and request exit 2.
        - A successful provider followed by unavailable matching reports the affected check as `couldn't run`,
          preserving its reason and retry remedy; ordinary checks finish and retain their results, including with
          `--serial`, and request exit 2 reflects the missing result.
        - No selection-specific divergence, merged-in, key, runtime-input, or pass-store read occurs; unrelated checks
          still execute with their usual evidence when selection is unavailable.
        - Increment/segment remedies are `arc check run <id> --changed`; named-run remedies retain their original
          scope; dry-run resolves and forecasts the same batches without executing the command.
        - Restoring an unavailable provider permits the same request to run successfully. Extend runner, batching,
          forecast, remedies, and report test homes rather than introducing a second check runner.
        - Restoring failed matching also permits the same request to succeed without changing its selection scope.

### `[ ]` **3.5 Publish mode help and regenerate the declaration schema — D4.5, D7.1**

- _Goal:_ CLI users and editor validation see the actual mode defaults, restrictions, request composition, and
  full-versus-changed scope behavior.

    - Update the `check run`, `check increment`, and `check segment` descriptions in `src/cli.ts`, and describe the
      modes in `registerCheckDeclarationSchemas`' source schema metadata.
    - After building the source, run `npx arc schema install --json` and review the regenerated declaration JSON.
      `writeEditorDocuments` writes checkout-local ignored schemas; commit the schema source and tests, not that output.
    - Verify generated declaration validation/default descriptions and CLI help against the runtime cases from
      Tasks 3.1–3.4; retain the same schema version/migration posture unless existing tooling requires otherwise.

### `[ ]` **3.6 Exercise selection feedback through the command boundary — D4** — validate exit criterion at segment scope

- _Goal:_ The command orchestration proves feedback over real ignored-file content, all scope variants, and recovery,
  while pre-flip empty selection and existing gates remain usable.

    - Exercise the public check handlers with Task 3.3's injected provider and real temporary projected files; run an
      actual process over their operands and assert the presented command result, not only a helper result.
    - Cover increment and segment changed-only feedback, named-run whole and path scopes, repeated uncached runs,
      empty fallback, unavailable failure followed by successful retry, and dry-run no-execution behavior.
    - Include successful selection acquisition followed by matcher failure alongside an ordinary check, asserting
      both presented results, exit 2, the selection check's retry remedy, and successful recovery on the same request.
    - Run existing gate and Git-backed check regression cases plus `npx arc check segment`; retain no production
      environment switch or fake projection index solely to let tests inject the selection.
    - Built-CLI subprocess E2Es cover the empty production provider, invalid declarations, and gate exclusion;
      nonempty selection runs through the in-process command boundary until the projection connects.

## **Phase 4:** Request feedback at the enumerated ceremony boundaries

_Purpose:_ Carry the check request through every authored-state ceremony without changing its approval machinery.

_Mode:_ `replication` — exhaust the ceremony inventory using the same increment request at each specified boundary.

_Exit criterion:_ All eighteen inventory rows have their required request placement, repeated writes and handoff
failures follow their specified handling, and exempt ceremonies acquire no redundant request.

### `[ ]` **4.1 Check draft and specification capture — D5.1–D5.2**

- _Goal:_ Draft and specification authors see feedback before their existing approval gates and after later prose
  edits, without redundant requests for unchanged or rendered-field-only captures.

- _Note:_ See `notes-projected-markdown-checks.md` § Ceremony coverage for the authoritative row-to-task map.

    - In package `arc/system/workflows/arc/draft-design.md`, request `arc check increment` before the readiness
      interlock and again before capture only if the post-settle reread changes text; exempt the Class-only low path.
    - In `create-spec.md`, request it before Gate 1 and again before the final commit over notes migration and
      post-Gate-2 edits. Preserve every existing review, lint, and approval step.
    - Render the two installed counterparts through `render:framework`; verify source and installed placement and
      the after-stop text scenario against ceremony rows 1–2.

### `[ ]` **4.2 Check task generation and design amendments — D5.1–D5.2**

- _Goal:_ Task generation and amendment captures request state feedback at the boundary carrying their authored
  text, with task and review-site amendments sharing their caller's feedback request.

- _Note:_ See `notes-projected-markdown-checks.md` § Ceremony coverage, rows 3–4.

    - In package `generate-tasks.template.md`, request `arc check increment` after the final post-settle coherence
      reread, immediately before the pre-save interlock, so adversarial folds and delivery rendering are included.
      Repeat if later authored text changes before commit; keep descriptor lint and segment-verification instructions.
    - In `supplemental/amend-design.md`, request increment feedback after grounding before the capture commit.
      Task and review sites use their caller's increment request before the shared commit, without adding a duplicate.
    - Preserve the task arm's existing increment and use Tasks 4.5–4.6's review-fix requests for review-site amendments;
      render both installed workflows and inspect each capture/task/review branch in its full surrounding step.
    - Verify a fold or delivery rendering that changes the plan after an earlier check: the final request must read
      the changed plan before approval, rather than reuse an earlier report as coverage of the later text.

### `[ ]` **4.3 Check decomposition, initialization, and inbox routing — D5.1–D5.2**

- _Goal:_ Authored decomposition, initialization, and routing text receives feedback before the release that carries
  it, under both existing protection postures where routing differs.

- _Note:_ See `notes-projected-markdown-checks.md` § Ceremony coverage, rows 5–7.

    - In package `work-unit-lifecycle/decompose-work-unit.md`, request increment before the distribution interlock
      and before finish-release commit over owner reconciliation written after apply approval.
    - In `planning/init-work-unit.md`, request it before the init commit for the in-place and resumed paths; do not
      add it to the spawned/graduate command's self-committing scaffold.
    - In `supplemental/drain-inbox.md` § 5, request it before the grooming routing commit under full protection and
      before each direct routing commit under partial protection; render all three installed counterparts.

### `[ ]` **4.4 Check handoff and activation edits — D5.1–D5.3**

- _Goal:_ Handoff checks its own edited meta before committing while preserving unfinished-work continuity, and
  activation requests feedback exactly when its ceremony carries authored spec or task text.

- _Note:_ See `notes-projected-markdown-checks.md` § Ceremony coverage, rows 8–9.

    - In package `session-lifecycle/session-handoff.template.md`, request increment after staging and meta lint,
      before the handoff commit; preserve the explicit later SESSION-NOTES lint.
    - State that failures in unfinished work go into remaining-work notes without a fix-now/defer stop, while a
      failure in the handoff's own meta edit is corrected before its commit.
    - In `work-unit-lifecycle/activate-work-unit.md` Step 3, request increment before the commit only when a fold
      includes spec/task prose edits; render the installed handoff and activation workflows.

### `[ ]` **4.5 Check integration fixes and preserve completion feedback — D5.1–D5.2**

- _Goal:_ Integration's existing completion check remains in place, and review fixes and hand-authored repairs within
  the checked corpus receive feedback before commit or reconcile retry, with completed-only repairs exempt.

- _Note:_ See `notes-projected-markdown-checks.md` § Ceremony coverage, rows 10–13 and 18.

    - In package `work-unit-lifecycle/integrate-work-unit.md`, retain Step 7's current increment request.
    - Before an approved review-fix commit, request increment feedback when the fix includes authored state text the
      checks read. Cover ordinary corrections and spec-changing amendments through this one caller-owned request,
      retaining all existing gate requests and review-response approval machinery.
    - Add a request before the merged-PR guard's missing Completion/Release Notes repair commit; before a composition
      correction commit after an integration-interlock redirect, beside affected gates; and after a hand correction
      in Step 10's pending reconcile arm, before retry. Apply D5.1's exclusions at every repair site: add no request
      for an edit confined to completed files, and do not widen the selection or project checks to admit those files.
    - Render the installed workflow and inspect each branch independently, preserving all existing commit routing,
      gate reruns, and exact-head integration stops. Applied reconcile and record-only paths remain exempt.
    - Verify both archive cadences: active-meta repairs under `manual` receive feedback when eligible, while repairs
      confined to the archived meta under `with-integration`, or after a manual archive, remain exempt.

### `[ ]` **4.6 Check publication fixes, resumption, and deactivation corrections — D5.1–D5.2**

- _Goal:_ Preparation's review fixes, hand-corrected publication and resumption advisories, and Case C's reversed
  deactivation fields receive feedback before the corresponding commit or retry.

- _Note:_ See `notes-projected-markdown-checks.md` § Ceremony coverage, rows 14–17.

    - In package `work-unit-lifecycle/prepare-work-unit.md`, request increment before an approved review-fix commit
      when the fix includes authored state text the checks read. Ordinary corrections and spec-changing amendments
      share this caller-owned request; retain existing gate requests and review-response approval machinery.
    - Also request increment after an advisory correction and before rerunning `arc publish`; leave the no-correction
      publish path alone.
    - In `resume-work-unit.md` Step 5, request it after hand correction in the pending reconcile arm and before retry.
    - In `deactivate-work-unit.md` Case C, request it before the deactivation PR commit over the reversed meta fields;
      render all three counterparts, keeping ordinary rendered transition commits exempt.

### `[ ]` **4.7 Verify the complete ceremony inventory — D5** — validate exit criterion at segment scope

- _Goal:_ Every specified ceremony row has feedback at the correct side of its existing stop, and no exception loses
  its required handling or acquires an unintended gate.

- _Note:_ See `notes-projected-markdown-checks.md` § Ceremony coverage and § Ceremony verification.

    - Walk all eighteen rows against package sources and rendered workflows, including each repeated-write branch,
      every protection variant, and both handoff failure classes; record a per-row source locus and result.
    - At both review sites, include an ordinary active notes-only correction and a spec-changing amendment. Each
      receives one feedback request before its commit while retaining the original gate requests; the ordinary fix
      does not rely on entering an amendment arm.
    - Include a task-generation edit after an earlier check and both integration archive cadences; distinguish actual
      feedback over the edited file from an exempt completed-only repair or an invocation that selected no such file.
    - Use the executable request scenarios from Phase 3 to verify the shared call's feedback/empty/failure outcomes;
      exercise the real repository recipes again in Phase 5. Verify prose placement by reading its containing step,
      rather than adding a workflow parser or claiming a textual presence check proves agent execution.
    - Confirm the enumerated exemptions and existing Errand/task-loop requests remain intact. Run the existing
      workflow/content integration coverage affected by these files and `npx arc check segment`.

## **Phase 5:** Connect repository lint and exact-list fixing

_Purpose:_ Make the declared Markdown tools and on-demand fixers consume exactly their authorized paths.

_Mode:_ `slice` — projected findings reach the real tools, and fixing uses the same admitted corpus.

_Exit criterion:_ Real tool fixtures report each admitted projected finding, the fixer changes only the lint corpus,
and an unavailable selection causes no write before a successful retry after repair.

### `[ ]` **5.1 Admit ignored lint operands without weakening file authority — D6.2**

- _Goal:_ Explicit lint can read an authorized ignored operand on request, while ordinary selection, exclusions,
  repository containment, and Git-administration boundaries keep their existing guarantees.

    - Parse `--allow-ignored` in `src/scripts/lint-markdown-worktree.ts` and `lint-markdown-underwrap.ts`; thread named
      operands into `validateExplicitMarkdownPaths`' existing `allowIgnoredPaths`, only on explicit worktree reads.
    - Replace `runExplicitMarkdownlint`'s `matchesGlob` ignore test with the matcher from Task 3.2; preserve
      `isMarkdownPathExcluded` and worktree configuration validation.
    - Build `test-first` (one behavior at a time):
        - Ignored projected files fail without the option and are read with it; the option is never treated as a path.
        - Excluded files, escaping paths, nonregular operands, and Git administration paths remain refused; admitted
          paths retain existing lint-read symlink semantics rather than inheriting mutation authority.
        - Dot-directory and letter-case exclusions match Git pathspecs on each supported platform.
    - Extend `integration/markdown-file-lint.test.ts`, `markdown-worktree-lint.test.ts`, `markdown-underwrap.test.ts`,
      and the focused authority/contract unit cases.

### `[ ]` **5.2 Declare the three selection checks and prove input agreement — D6.1–D6.2**

- _Goal:_ The three project checks admit only paths their scripts accept and remain ungated feedback declarations,
  with existing tracked-corpus checks retaining their selection and reuse behavior.

    - Add the three D6.1 declarations to project `.arc/system/arc-checks.yml`, using the specified argv commands.
      Mirror `MARKDOWN_SELECTION.ignores` as negative markdownlint inputs, retain the existing underwrap exclusions
      plus `!**/.venv*`, and apply the audit's ARC/template/archive exclusions.
    - Build `test-first` (one behavior at a time):
        - Feed each script's admission predicate every fixture its declaration inputs admit, covering each exclusion
          class, nested personal basenames, case, and a `.venv`-prefixed filename as well as a directory.
        - No admitted operand is refused before lint, all three declarations resolve to selection with no gate, and
          existing gated checks and CI membership are unchanged.
    - Exercise declarations through `CheckDeclarationSchema` and the actual shared matcher, not a second test-only
      interpretation of globs; keep the project-owned declaration out of framework synchronization.

### `[ ]` **5.3 Prove the actual Markdown tool recipes over projected files — D6.1**

- _Goal:_ Real markdownlint, underwrap, and link-audit processes report their known findings in every admitted
  projected fixture and never inspect unchanged or excluded members of the selection.

    - Build `test-first` (one behavior at a time):
        - Give `runDeclaredRequest` an injected changed selection and execute each actual D6.1 command over temporary
          ignored files; assert feedback findings for every admitted path, not merely that the process started.
        - Include new and nested projected paths, literal special-character filenames, a contrasting unchanged file,
          and excluded personal/archive/conflict/protected cases represented by the supplier selection fixture.
        - Test the actual markdownlint configuration and literal argv together; disable tool-side selection behavior
          where necessary so a tool cannot silently drop an admitted operand or glob beyond it.
    - Keep the fixture's supplier list distinct from tool exclusions. Do not implement the projection's index,
      change-mark, conflict, or ownership machinery in this work unit.

### `[ ]` **5.4 Replace glob fixing with the exact lint corpus — D6.3**

- _Goal:_ Both fix commands mutate exactly the current lint corpus, report any listed path unsafe to write, and
  leave every file untouched when selection acquisition fails.

- _Note:_ See `notes-projected-markdown-checks.md` § Fixer grounding for selection and mutation authority.

    - Add the shared fixer script under `src/scripts/` and switch root `lint:md:fix` and `lint:md:fix:file` to it;
      reuse `readProjectedSelection`, Task 3.2's matcher, and `loadWorktreeMarkdownConfigurations`.

    - `[ ]` **5.4.a Resolve the exact lint corpus before mutation**
        - Build `test-first` (one behavior at a time):
            - Union present worktree paths from `enumerateTrackedMarkdownPaths` with the full projected selection,
              excluding `MARKDOWN_SELECTION.ignores`; deduplicate, omit absent tracked entries, and keep literals.
            - Treat only the enumerator's `markdown.empty-selection` as an empty Git contribution: a projected-only
              corpus still fixes normally; other enumeration failures remain failures, and a wholly empty union
              reports nothing to fix without invoking the tool with no path operands.
            - Selection unavailable or thrown acquisition refuses with its reason before any tool or file write;
              repairing the provider makes the same command succeed.

    - `[ ]` **5.4.b Apply mutation authority and constrain explicit fixing**
        - Validate paths with `validateExplicitMarkdownPaths` using `operation: "mutate"`; allow ignored membership
          only for selection paths. Report and skip unsafe listed paths, including symlinks a lint read may follow.
        - Build `test-first` (one behavior at a time):
            - Full fixing rewrites the authorized union alone, reports skipped paths, and invokes markdownlint-cli2
              with literal operands and `--fix --no-globs` after loading validated configuration.
            - Explicit fixing first refuses any operand outside the union, naming the exclusion reason, and never
              widens into a glob; valid explicit subsets are fixed without touching other union members.
            - Cover special-character names, ignored state, ordinary tracked and untracked nonignored Markdown,
              exclusions, Git administration, and no-write refusal followed by successful recovery.

    - `[ ]` **5.4.c Execute the validated corpus in bounded literal batches**
        - Resolve the entire selection, validate every explicit operand's membership, finish write-authority checks,
          and validate worktree configuration before the first mutating invocation.
        - Reuse `batchCheckPaths` from `lib/checks/batching.ts`, budgeting the actual platform command and fixed flags
          plus the literal `:path` arguments. Keep each admitted path in exactly one batch and retain nonzero results.
        - Build `test-first` (one behavior at a time):
            - A corpus exceeding the Windows argument budget produces bounded invocations whose operands cover
              every admitted path exactly once, leave excluded files untouched, and preserve literal filenames.
            - Nonzero results from any batch make the overall command nonzero; the whole-list and explicit-subset
              commands share this behavior rather than silently returning a later successful batch's status.
            - Invalid explicit membership or configuration prevents all mutating invocations, even when the valid
              operands alone would already fill a batch; an unbatchable command/path fails before any writes.

### `[ ]` **5.5 Document feedback declarations and literal tool inputs — D7.2**

- _Goal:_ Projects can declare their own Markdown feedback over editable state and configure tools to honor the
  supplied paths without confusing local feedback with gate evidence.

    - Update package `reference/strategies/arc/strategy-quality-gates.md` and render its installed counterpart.
    - Explain Git/index enumeration versus disk globs, per-clone excludes, and literal operands with tool glob/ignore
      filtering disabled; show `validate-links.sh` declared as an ungated selection check over `**/*.md`.
    - Explain changed-since-save increment/segment feedback, named whole-selection runs, and on-demand fixing in
      adopter-facing terms. Keep the flip notice's authoring/publication with its supplier and avoid internal WU refs.

### `[ ]` **5.6 Exercise repository feedback and fixing together — D6** — validate exit criterion at segment scope

- _Goal:_ Repository tools demonstrably see changed projected Markdown, share the intended lint/fix corpus, and keep
  durability and every Git-backed quality gate independent of selection availability.

    - Run the real-tool recipes, input-admission agreement, exact-list fixer, explicit-subset, and unavailable/recovery
      cases from Tasks 5.1–5.4, plus `npx arc check segment`.
    - Include large-corpus batch coverage and failure reporting, projected-only fixing with an empty Git list, and an
      entirely empty union that invokes no fixer; verify full-list validation precedes the first batch.
    - Verify the ordinary tracked lint commands still pass and the unconnected production adapter reports selection
      checks `not selected`; successful injected fixtures prove the post-connection behavior without waiting on it.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The completed change satisfies the operational success criteria with recorded quality-gate evidence and
  is ready for the existing integration workflow.

---

## Success Criteria

- `[ ]` Production-registered `write` and `batch` calls refuse newly introduced relative links from movable records,
  links into projected roots, and undefined full references with the corresponding `links.*` rule, all new occurrence
  locations, and an actionable remedy; historical violations pass unchanged and a corrected retry succeeds.

- `[ ]` Coverage derives from projecting kinds and stored families with the specified queue exception; every covered
  kind has exactly one composed registration preserving its parser, anchors, and original check ordering.

- `[ ]` The shipped hook and repository audit reject relative and root-absolute links to movable or Git-ignored ARC
  targets, admit the tracked user README, resolve leading slashes from repository root, and pass after source correction.

- `[ ]` ADR 021 and the package/rendered project-definition prompt contain the specified filename/path corrections,
  and the complete tracked link audit passes.

- `[ ]` Runtime and generated declaration schemas expose selection mode and its false cache/widen defaults, retain
  ordinary defaults, and reject each forbidden field/value with a field-specific reason.

- `[ ]` Increment and segment pass only the changed projected selection; named runs support whole, named-path, and
  changed scopes as specified; every hook, gate, and new-head request excludes selection checks.

- `[ ]` Git-pathspec filtering agrees with tracked-path semantics across all declared inputs, dot-directories, case,
  and literal filenames, without modifying the real index or object store or leaving temporary indexes behind.

- `[ ]` Selection feedback runs uncached with no tree-divergence or merged-in filtering; empty selection is not
  selected, failed feedback exits 1, unavailable selection exits 2 with each affected check's reason, and repair permits
  the same request to succeed with the specified retry scope.

- `[ ]` Temporary-index or Git matching failure after successful selection acquisition reports the affected check as
  `couldn't run` with its reason and retry remedy, preserves ordinary check results under serial execution, exits 2,
  and permits the same request to succeed after matching is repaired.

- `[ ]` Draft capture checks before readiness approval and after post-settle text changes; specification creation
  checks before Gate 1 and before the final capture of notes migration/post-Gate-2 text, preserving rendered-only skips.

- `[ ]` Task generation checks after the settled reread and immediately before its final interlock, including any
  post-check fold or rendering change; amendment capture checks after grounding and before commit, while task and
  review-site amendments share their caller's increment request without a duplicate.

- `[ ]` Decomposition checks before distribution approval and finish-release commit; in-place/resumed initialization
  checks before init commit; inbox routing checks before the grooming commit or each direct commit as protection requires.

- `[ ]` Handoff checks after staged-meta lint and before commit, retains explicit session-notes lint, fixes its own meta
  failures, and records unfinished-work failures without another stop; activation checks before a fold's authored-text
  commit and skips a rendered-fields-only transition.

- `[ ]` Integration retains its completion-content increment and checks ordinary review fixes over authored state,
  eligible merged-PR missing-notes repairs, and composition corrections before commit, plus eligible hand-corrected
  pending reconciles before retry; completed-only repairs remain exempt under both archive cadences without widening
  checks or altering merge authority. Review fixes preserve existing gates and need no amendment to receive feedback.

- `[ ]` Preparation checks ordinary review fixes over authored state before commit while preserving existing gates;
  publication and resumption check hand-corrected advisories before retry; Case C deactivation checks reversed fields
  before its repair PR commit. The eighteen-row inventory and enumerated exemptions agree in package and installed
  workflows without adding a request to an exempt ceremony.

- `[ ]` Each declared markdownlint, underwrap, and link-audit selection recipe runs its real process over every admitted
  changed fixture, reports its known findings as feedback, reads no unrequested selection member, and refuses none of the
  paths its inputs admit.

- `[ ]` The whole-list fixer rewrites only present Git-selected Markdown plus the admitted full selection, with shared
  ignores applied, reporting unsafe mutation skips; explicit fixing confines itself to a valid subset and names the
  exclusion for any refused operand, including before the projection connects.

- `[ ]` Both fix commands write nothing when selection acquisition is unavailable, report its reason, and succeed over
  the same intended corpus once acquisition is repaired; literal operands never expand as tool globs.

- `[ ]` Large fixer corpora use bounded literal batches after complete membership, authority, and configuration
  validation; every admitted path is processed once, excluded files remain untouched, and any nonzero batch result
  remains nonzero overall. An empty Git list permits projected-only fixing; an empty union invokes no fixer.

- `[ ]` CLI help, regenerated editor schema, and the rendered quality-gates strategy explain feedback scope and the
  worked link-validator declaration consistently; the production empty adapter needs no projection dependency to land.

- `[ ]` All quality gates pass at their declared deadlines.

- `[ ]` Ready for integration.
