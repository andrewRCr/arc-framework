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

### `[x]` **2.1 Enforce normalized target rules in the shipped hook — D3.1–D3.2**

- _Goal:_ The shipped staged-file check refuses movable and ignored ARC targets before existence fallback, and
  interprets leading-slash targets from the repository root consistently across supported shells.

- _Outcome:_ The shipped and installed validators normalize targets lexically, resolve leading slashes at the
  repository root, and refuse movable or Git-ignored ARC targets before existence fallback. Real Git scenarios
  retain the tracked user README exception, source skips, and corrected retries; hook advice names filename references.

### `[x]` **2.2 Audit the same targets and accept named paths — D3.3**

- _Goal:_ The repository audit enforces the same target boundary in its normal corpus and explicit-path modes,
  while preserving target-existence and Markdown-anchor feedback.

- _Outcome:_ The audit shares lifecycle-root recognition, checks normalized targets before existence and anchors,
  and batches ignored-target decisions through Git. Named mode reads literal ignored sources without enumerating
  tracked files; no-operand mode retains the tracked corpus and its exclusions.

### `[x]` **2.3 Correct the existing corpus links and render framework changes — D3.4**

- _Goal:_ The new tracked-link rules land over a clean existing corpus, and installed framework content reflects its
  authoritative package sources.

### `[x]` **2.4 Exercise the tracked-file link boundary — D3** — validate exit criterion at segment scope

- _Goal:_ Both production entry points reject links that Git-hosted readers cannot follow, while legal tracked
  targets still pass and the installed corpus remains valid.

- _Outcome:_ Real-Git scenarios exercise package and installed validators and the audit: movable and ignored targets
  refuse, root-absolute tracked files and the tracked user README pass, and corrected sources succeed on retry.
  The no-operand audit accepts the complete tracked corpus after the two source corrections.

## **Phase 3:** Run selection checks as uncached feedback

_Purpose:_ Take projected paths through the existing check runner without changing Git-backed selection or gates.

_Mode:_ `slice` — `increment`, `segment`, and named runs execute checks over injected projected selections.

_Exit criterion:_ An injected changed selection reaches a batched feedback command; full, named, empty, unavailable,
and recovered selections produce their specified outcomes, while every gate excludes selection checks.

### `[x]` **3.1 Admit selection declarations and request membership — D4.1, D4.3**

- _Goal:_ Selection declarations are feedback-only by construction, and no existing gate or ordinary declaration
  changes membership or defaults when the new mode is added.

    - _Amended in:_ 3.R (A1)
    - _Amended in:_ 3.R2 (A3)

- _Outcome:_ Mode-specific authored schemas preserve omitted defaults while refusing forbidden explicit fields,
  including false flags. Increment and segment include selection feedback in declaration order; gates and hooks
  exclude it, and both input and output JSON Schema projections remain representable.

### `[x]` **3.2 Match explicit path lists with Git pathspecs — D4.2**

- _Goal:_ A supplied path list is filtered exactly as tracked Git pathspec inputs would filter it, without touching
  the checkout's real index, writing objects, or inheriting ambient pathspec policy.

- _Outcome:_ `matchPathList` uses a disposable index, shared Git glob pathspecs, NUL-framed paths, and the
  repository-format empty-blob identity without writing objects. Failures preserve their reason as unavailable;
  real-Git coverage confirms cleanup, ambient-policy isolation, and successful retries.

### `[x]` **3.3 Resolve projected scopes independently of Git changes — D4.2–D4.3, D4.6**

- _Goal:_ One stable projected selection supplies each request's intended scope without selecting or widening any
  Git-backed check, and an unconnected provider yields the specified empty success.

- _Outcome:_ One injected provider read supplies each request’s projected scope, with thrown reads preserved as
  unavailable. Named directories intersect the provider list, Git input coverage excludes selection declarations,
  and public increment, segment, and named handlers accept a narrow provider override.

### `[x]` **3.4 Execute projected paths without tree evidence or reuse — D4.4**

- _Goal:_ Projected checks execute over live selected files on every request and preserve accurate empty, failed,
  unavailable, retry, and dry-run reporting without borrowing Git-tree evidence.

- _Outcome:_ Projected paths rejoin the existing batched executor with no tree content context or divergence
  read. Uncached passes remain not-recordable; failed and unavailable feedback retains scope-correct retry commands,
  ordinary serial results survive matcher failures, and dry runs forecast the same bounded literal arguments.

### `[x]` **3.5 Publish mode help and regenerate the declaration schema — D4.5, D7.1**

- _Goal:_ CLI users and editor validation see the actual mode defaults, restrictions, request composition, and
  full-versus-changed scope behavior.

- _Outcome:_ Built CLI help explains selection composition and full, named, and changed scopes. Regenerated the
  checkout-local declaration schema and inspected its mode descriptions, false cache/widen defaults, and forbidden
  authored shell field; schema version and migration posture remain unchanged.

### `[x]` **3.R Preserve selection diagnostics at the command boundary — D4.1 (A1)**

- _Goal:_ Correct Task 3.1’s diagnostic projection so a declaration refusal presented by the command names the
  forbidden selection field and its reason, as required by A1.

    - _Amended in:_ 3.R2 (A3)

- _Outcome:_ The selection union issue now carries its branch’s field and reason through the structured-file
  reader. Built-CLI refusals name each forbidden field and recover after removal; ordinary declaration validation
  and generated schema projections retain their existing behavior.

### `[x]` **3.R2 Preserve ordinary declaration diagnostics — D4.1 (A3)**

- _Goal:_ A3 restores ordinary declaration field paths and unknown-key diagnostics without changing their accepted
  inputs or defaults, while preserving selection refusals and editor-schema validation.

- _Outcome:_ Mode-discriminated validation preserves ordinary field paths and unknown-key messages while retaining
  the omitted project default and selection restrictions. Input/output editor schemas expose exclusive branches;
  the three failing CLI scenarios now pass alongside selection and installed-schema coverage.

### `[x]` **3.6 Exercise selection feedback through the command boundary — D4** — validate exit criterion at segment scope

- _Goal:_ The command orchestration proves feedback over real ignored-file content, all scope variants, and recovery,
  while pre-flip empty selection and existing gates remain usable.

- _Outcome:_ Public handlers execute real ignored-file content over changed, full, named, and staged/range scopes.
  Repeats remain uncached while ordinary passes reuse; provider and temporary-index failures preserve other results
  and recover on retry. Real process batches preserve a large literal list; dry runs and the empty adapter execute
  nothing, and built CLI cases retain gate exclusion and field-specific declaration refusals after A1.

## **Phase 4:** Request feedback at the enumerated ceremony boundaries

_Purpose:_ Carry the check request through every authored-state ceremony without changing its approval machinery.

_Mode:_ `replication` — exhaust the ceremony inventory using the same increment request at each specified boundary.

_Exit criterion:_ All eighteen inventory rows have their required request placement, repeated writes and handoff
failures follow their specified handling, and exempt ceremonies acquire no redundant request.

### `[x]` **4.1 Check draft and specification capture — D5.1–D5.2**

- _Goal:_ Draft and specification authors see feedback before their existing approval gates and after later prose
  edits, without redundant requests for unchanged or rendered-field-only captures.

- _Outcome:_ Draft capture requests feedback before readiness and conditionally after changed post-settle text;
  specification finalization requests it before Gate 1 and after later notes/prose edits. Rendered both workflows;
  the low Class-only path and both specification approvals retain their existing boundaries.

### `[x]` **4.2 Check task generation and design amendments — D5.1–D5.2**

- _Goal:_ Task generation and amendment captures request state feedback at the boundary carrying their authored
  text, with task and review-site amendments sharing their caller's feedback request.

- _Outcome:_ Task generation checks the final settled list immediately before approval and repeats only after
  later authored edits. Amendment captures check grounded text before commit; task and review arms reuse their
  caller-owned increment request. Rendered counterparts retain descriptor lint and existing release controls.

### `[x]` **4.3 Check decomposition, initialization, and inbox routing — D5.1–D5.2**

- _Goal:_ Authored decomposition, initialization, and routing text receives feedback before the release that carries
  it, under both existing protection postures where routing differs.

- _Outcome:_ Distribution checks precede approval; finish-release feedback follows owner reconciliation and
  staging. In-place/resumed initialization checks reconciled metadata, and both routing protection arms check each
  routing commit. Rendered all three workflows without adding requests to spawned scaffolds or base advancement.

### `[x]` **4.4 Check handoff and activation edits — D5.1–D5.3**

- _Goal:_ Handoff checks its own edited meta before committing while preserving unfinished-work continuity, and
  activation requests feedback exactly when its ceremony carries authored spec or task text.

- _Outcome:_ Handoff requests feedback after staged-meta lint, corrects its own meta failures before committing,
  and records unfinished-work failures without another approval stop. Activation checks only authored fold prose;
  both rendered workflows preserve existing commit routing and the later explicit session-notes lint.

### `[x]` **4.5 Check integration fixes and preserve completion feedback — D5.1–D5.2**

- _Goal:_ Integration's existing completion check remains in place, and review fixes and hand-authored repairs within
  the checked corpus receive feedback before commit or reconcile retry, with completed-only repairs exempt.

- _Outcome:_ Eligible review fixes, missing-product repairs, pending-reconcile corrections, and composition
  corrections now request increment feedback before their commit or retry. Completed-only repairs stay exempt
  under either archive cadence; the rendered workflow retains Step 7, gate requests, and exact-head approval routing.

### `[x]` **4.6 Check publication fixes, resumption, and deactivation corrections — D5.1–D5.2**

- _Goal:_ Preparation's review fixes, hand-corrected publication and resumption advisories, and Case C's reversed
  deactivation fields receive feedback before the corresponding commit or retry.

- _Outcome:_ Publication and resumption corrections request feedback before retry; preparation review fixes share
  one caller request for ordinary and spec-changing fixes; Case C checks reversed fields before its PR commit.
  Existing gate requests, advisory retention choices, and approval machinery remain in their containing steps.

### `[x]` **4.6.R Install the two missing ceremony workflows — A2**

- _Goal:_ A2's resumption and deactivation feedback reaches installations through the recipe and can render through
  the ordinary Framework projection path, with self-hosting membership kept consistent.

- _Outcome:_ Registered both workflows in the recipe and self-hosting manifest; the refused projection now renders all three
  workflows. Updated the recipe-derived inventory counts.

### `[x]` **4.7 Verify the complete ceremony inventory — D5** — validate exit criterion at segment scope

- _Goal:_ Every specified ceremony row has feedback at the correct side of its existing stop, and no exception loses
  its required handling or acquires an unintended gate.

- _Outcome:_ All eighteen source/rendered containing steps have the specified request ordering; the per-row walk
  is recorded in `notes-projected-markdown-checks.md` § Ceremony inventory result. Public-handler probes cover
  ordinary notes-only fixes and amendments at both callers, late task edits, and completed-only exclusion.
  Handoff failure classes, both archive cadences, protection variants, repeated writes, and exemptions hold;
  A2's required workflows now render and belong to the recipe-derived installation.

## **Phase 5:** Connect repository lint and exact-list fixing

_Purpose:_ Make the declared Markdown tools and on-demand fixers consume exactly their authorized paths.

_Mode:_ `slice` — projected findings reach the real tools, and fixing uses the same admitted corpus.

_Exit criterion:_ Real tool fixtures report each admitted projected finding, the fixer changes only the lint corpus,
and an unavailable selection causes no write before a successful retry after repair.

### `[x]` **5.1 Admit ignored lint operands without weakening file authority — D6.2**

- _Goal:_ Explicit lint can read an authorized ignored operand on request, while ordinary selection, exclusions,
  repository containment, and Git-administration boundaries keep their existing guarantees.

- _Outcome:_ Explicit markdownlint and underwrap worktree reads parse `--allow-ignored` and retain physical read
  validation, including contained-file symlinks and Git-administration refusal. `selectMarkdownlintPaths` replaces
  Node glob matching with the shared Git matcher; dot-directory exclusions and case-sensitive paths agree with
  canonical configuration. Default Git selection and indexed underwrap certification retain their existing paths.

### `[x]` **5.2 Declare the three selection checks and prove input agreement — D6.1–D6.2**

- _Goal:_ The three project checks admit only paths their scripts accept and remain ungated feedback declarations,
  with existing tracked-corpus checks retaining their selection and reuse behavior.

- _Outcome:_ Added markdownlint, underwrap, and link-audit selection declarations with the specified argv and
  ungated defaults. The real Git matcher and each script's admission predicate agree across the exclusion/case
  matrix, including nested personal basenames and `.venv` filenames. ARC-qualified template exclusions preserve
  the audit corpus under observed `ls-files` behavior; existing gate and CI declarations remain unchanged.

### `[x]` **5.3 Prove the actual Markdown tool recipes over projected files — D6.1**

- _Goal:_ Real markdownlint, underwrap, and link-audit processes report their known findings in every admitted
  projected fixture and never inspect unchanged or excluded members of the selection.

- _Outcome:_ The public increment handler runs the actual three npm recipes and root configuration over ignored
  files from a changed supplier list. Every admitted file reports its known finding, including nested and literal
  special-character names and case variants; unchanged, protected, conflict, archive, and private files stay outside
  that request. Tool-specific exclusions remain distinct from the supplied corpus; no projection machinery was added.

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
