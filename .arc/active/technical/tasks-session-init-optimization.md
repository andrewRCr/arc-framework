# Task List: Session-Init Optimization

- **PRD:** `.arc/active/technical/prd-session-init-optimization.md`
- **Branch(es):** `technical/session-init-optimization`
- **Base Branch:** `main`
- **Purpose:** Cut session-init token cost from ~75–80k to ≤60k at orientation via per-file
  methods/extensions, narrower partial-reads, and session-type conditional loading — without
  regressing orientation correctness or compliance reliability.

---

## Tasks

## **Phase 1:** Workflow Trigger Contract + Per-File Restructure + CI Enforcement

_Purpose:_ Establish the workflow→method/extension trigger contract end-to-end — structural YAML frontmatter schema,
author-side declaration rule, all in-scope workflows migrated, per-file methods/extensions restructure pulled forward
(so the audit lands on final structure with no legacy-aggregate fallback), `pre-merge-review` method renamed to
`diff-review` (fixing the method/extension name collision), CI enforcement. Replaces brittle prose-grep enforcement
with a structural one. Aggregate files (`arc-methods.md`, `arc-extensions.md`) stay in place until Phase 3 retires
them; per-file is authoritative from Task 1.4 forward.

### `[x]` **1.1 Method and extension trigger coverage audit**

- _Outcome:_ All 16 methods/extensions pass. Catalog (1.1.a) + classification (1.1.b) recorded in
  `notes-session-init-optimization.md` § Phase 1 Trigger Coverage Audit / § Phase 1 Classification.
  1.1.c no-op (zero gaps surfaced).

    - [x] **1.1.a Enumerate methods and extensions**
        - Catalog: 8 methods + 8 extensions, each with self-definition refs and external references
          (file:line + surface-kind annotation). Scope: `system/workflows/**`, `reference/constitution/`,
          `reference/strategies/**`, `system/agent/`. False-match flagged at
          `strategy-session-operations.md:22` (regex hit on `#session-state-portability` anchor, not the method).

    - [x] **1.1.b Classify each reference against the reliable-trigger bar**
        - All 16 entries have ≥1 reliable trigger; zero hedged; zero unreachable. Methods: 2-7 reliable refs
          each (avg ~3.25). Extensions: exactly 1 each (the structural `If [X extensions] are configured,
          execute them` wrapper at the firing workflow). Method-dependencies blocks classified reliable
          alongside in-step links — each bullet is a targeted markdown-link under an imperative preamble.
          Non-link prose pointers classified informational; deferred to Phase 3.6 cross-reference sweep.

    - [~] **1.1.c Fix coverage gaps surfaced by the audit** — No-op: 1.1.b returned zero gaps. See
        `notes-session-init-optimization.md` § Phase 1 Classification § Overall verdict.

### `[x]` **1.2 Define workflow frontmatter schema + author-side declaration rule**

- _Outcome:_ New `strategy-workflow-authoring.md` houses schema + author-side declaration rule + body
  conventions; new `template-workflow.md` provides the canonical skeleton. STRATEGY-INDEX entry +
  pointer in `configurability-architecture.md`; `DEV-RULES.ARC § When to Load Additional Guidance`
  picks up an on-demand bullet (workflow authoring is rare; not T1 every-session). Schema: `purpose`
  first, `audience: agent | collaborative (human and agent) | human` with inline comment,
  `arc.methods` / `arc.extensions` arrays under protected namespace; angle-bracket placeholders for
  author-fillable fields. Two-copy synced.

  Placement decision (dedicated strategy vs. session-operations or configurability-architecture)
  recorded in commit body and `notes-session-init-optimization.md`.

### `[x]` **1.3 Migrate all workflows to frontmatter**

- _Outcome:_ All 25 workflow files under `system/workflows/` carry schema-conformant YAML frontmatter
  per `template-workflow.md`. Body-level `**Audience:**`/`**Purpose:**` callouts and
  `**Method dependencies**` prose preambles removed; in-step markdown links preserved for
  navigation. Unused ref-defs cleaned up. `arc.methods`/`arc.extensions` populated from the
  reliable-trigger ground truth in `notes-session-init-optimization.md` § Phase 1 Classification.
  Audience enum expanded mid-task from binary to three values (`agent | collaborative (human and
  agent) | human`). Two-copy synced; `workflows/project/` single-copy.

  Mid-task absorbed: `prepare-commits.md` H1 normalized (`# Commit Guide` → `# Workflow: Prepare
  Commits`); display-text references updated; `pre-stage-review` extension declared in
  `prepare-commits.md` frontmatter per the audit.

    - [x] **1.3.a `arc/` top-level (3 files)** — `1_create-prd.md` (no arc block),
          `2_generate-tasks.md` (methods: test-first), `3_process-task-loop.md` (methods:
          issue-triage, quality-gate-commands, test-first; extensions: post-task-quality,
          post-unit-quality, post-task-completion).

    - [x] **1.3.b `arc/session-lifecycle/` (3 files)** — `session-init.md` (methods: session-state;
          extensions: post-context-load), `session-handoff.md` (methods: session-state),
          `session-loop.md` (no arc block; audience: human).

    - [x] **1.3.c `arc/work-unit-lifecycle/` (7 files)** — `activate-work-unit.md` (extensions:
          post-work-unit-activate), `archive-work-unit.md` (extensions: post-work-unit-archive),
          `integrate-work-unit.md` (methods: pre-merge-review, review-triage; extensions:
          pre-merge-review). Four others (clean/deactivate/rotate/verify) carry no arc block.

    - [x] **1.3.d `arc/work-unit-lifecycle/planning/` (2 files)** — `activate-planning-branch.md`,
          `integrate-planning-branch.md` — both no arc block. Prose mention of
          `post-work-unit-archive` at `integrate-planning-branch.md:42` classified informational
          in 1.1.b.

    - [x] **1.3.e `arc/supplemental/` (6 files)** — `prepare-commits.md` (methods: commit-format,
          commit-context-format; extensions: pre-stage-review). Five others carry no arc block.

    - [x] **1.3.f `arc/initial-setup/` (3 files)** — `01_verify-and-configure.md`,
          `02_define-project.md`, `03_configure-external-integration.md` (package source only;
          `pm.mode: external` conditional install). All three: no arc block, audience:
          collaborative (human and agent).

    - [x] **1.3.g `project/` (1 file)** — `agent-pre-merge-review.md` (methods: review-triage;
          single-copy). Overview-prose references at lines 6-8 classified informational; reliable
          triggers are the in-step directives at lines 36, 78, 92.

### `[x]` **1.4 Per-file restructure + method rename (structural prep for CI audit)**

- _Outcome:_ Per-file `system/methods/` and `system/extensions/` layout established (audit script
  enumerates from this); `pre-merge-review` method renamed to `diff-review` (fixes name collision
  with the same-named extension). Aggregates retained as frozen snapshots through Phase 2;
  per-file authoritative from this task forward. Pulls forward original Phase 3.1 + 3.3 + 3.4 + 3.5
  so 1.5 lands on final structure with no legacy-aggregate fallback branch.

    - [x] **1.4.a Rename `pre-merge-review` method → `diff-review`; broaden framing to generic activity contract**
        - Method renamed across both copies; framing broadened to generic activity contract with
          primary-caller annotation on `integrate-work-unit.md`. Extension keeps name
          `pre-merge-review`; extension-named refs and step-heading anchors preserved (the rename is
          method-only). Ref-def anchor `[arc-methods-pmr]` → `[arc-methods-diff-review]` everywhere
          it appeared. Files touched: framework (`arc-methods.md`, `arc-extensions.md`,
          `integrate-work-unit.md`, `arc-config.yml`, `integrate-external-content.md`,
          `strategy-session-operations.md`); single-copy (ADR-013, cross-cutting analysis,
          `docs/customization/methods.md`, `verify-integrity.sh`). Backlog references
          (`tasks-arcd-rebrand:447`, `plan-arc-modes:2654/4895/5440`) flagged via persistent-context
          for activation-time reconciliation; archive untouched per "document what is, not what was."

    - [x] **1.4.b Document per-file frontmatter schema (was Phase 3.1)**
        - New `### Per-file Frontmatter Schema` + `### Per-file Body Conventions` subsections in
          `strategy-session-operations.md § Method and Extension Loading`. Schema (revised from spec):
          methods carry `name`, `description`, `related`, `has-override`; extensions carry `name`,
          `description`, `related`, `active` (renamed from `has-steps` during 1.4.c-f for clarity —
          `active: true/false` directly answers the runtime question). Spec's `workflow` field dropped;
          reverse index stays centralized in the strategy's Method Classification table (handles
          fan-out better; `workflow` would have duplicated info with no mechanical consumer and
          drifted silently — captured as a "Why no `workflow` field" paragraph in the section so a
          future author doesn't re-propose it). Body conventions: H1 (`# Method:` / `# Extension:`),
          bulleted-blockquote preamble (mandated to prevent prettier-merge of adjacent bold-lead
          metadata), `.override`/`.default` for methods, `.actions` for extensions.

    - [x] **1.4.c Create per-file directory structure (both copies) (was Phase 3.3)**
        - Four directories created (methods + extensions × 2 copies) with thin READMEs (orientation
          framing + 8-entry index with one-liner each). Detail lives in per-file entries.

    - [x] **1.4.d Migrate 8 methods to per-file (was Phase 3.4)**
        - 8 method files in `system/methods/` (both copies, byte-identical). Content verbatim from
          aggregate; H2→H1, H3→H2; cross-references rewritten to sibling links; ref-defs recomputed.
          Frontmatter (4 fields per 1.4.b-revised schema): `commit-format` ↔ `commit-context-format`
          related; `diff-review` → `[review-triage]` related (one-directional — review-triage has
          no `related` back). All 8 `has-override: false`.

    - [x] **1.4.e Migrate 8 extensions to per-file (was Phase 3.5)**
        - 8 extension files in `system/extensions/` (both copies, byte-identical). Same transformation
          as methods. `related` omitted for all 8 (no coupling table for extensions). `active: false`
          for 7 placeholder extensions (placeholder `.actions` content `[No extension configured]`);
          `active: true` for `pre-merge-review` (CodeRabbit review ceremony). Naming swap during
          execution: `has-steps`/`.steps` → `active`/`.actions` (better reflects runtime state +
          generalized "actions to perform at this fire point"). Methods unchanged
          (`has-override`/`.override` was already crisp).

    - [x] **1.4.f Tier 2 gate after structural prep**
        - Ref-def scan: every relative path across all 16 new entries + 2 READMEs resolves. Final
          shape: 9 files each in methods/ and extensions/ (8 entries + README), both copies. 36 total
          new files this task.

### `[x]` **1.5 Reliable-trigger CI audit script (test-first)**

- _Outcome:_ Structural CI audit at `packages/arc-framework/src/scripts/audit-method-triggers.ts`
  fails when any method/extension lacks a workflow `arc.methods`/`arc.extensions` frontmatter
  declaration. No prose-grepping, no legacy-aggregate fallback. Pure exports + guarded CLI entry
  (`fileURLToPath(import.meta.url) === process.argv[1]`); corpus root resolved from script location;
  corpus is package-source only (`.arc/` drift is the framework-sync test's concern). Tests at
  `packages/arc-framework/__tests__/unit/scripts/audit-method-triggers.test.ts` cover all 9 spec
  behaviors (single batch — tightly coupled glue with no per-behavior discovery value).

  Key invariant: separate coverage maps per kind (method+extension same-name collisions can't
  silently collapse). Root wiring: `lint:arc:triggers` script + `tsx` devDependency in root
  `package.json`; package-level `package.json` unchanged (framework-CI-only per
  `strategy-workflow-authoring.md § Enforcement`).

### `[x]` **1.6 Wire audit into CI**

- _Outcome:_ `lint:arc:triggers` step added to `.github/workflows/ci.yml` `quality` job between
  `npm run build` and `npm run -s lint:md`.

### `[x]` **1.7 Phase 1 close — Tier 2 quality gates**

---

### **Phase 2:** Constitutional Rule + ADR-013 Amendment Draft

**Purpose:** Anchor compliance behavior before Phase 3 removes the always-loaded bodies. Constitutional framing is
absolute — no hedges — per compliance-reliability research.

- [x] **2.1 Add agent-side compliance rule to DEV-RULES.ARC**

    **Outcome:** New subsection § Verification and Discovery § Method and extension loading landed in DEV-RULES.ARC —
    two sentences, purely behavioral. Rule narrowed from PRD P0.3 wording to match the structural load contract:
    trigger is specifically a workflow's YAML frontmatter `arc.methods` / `arc.extensions` declarations, not any
    in-step reference (in-step links are reader navigation per `strategy-workflow-authoring.md`). Paired author-side
    rule intentionally not referenced in DEV-RULES — that rule is T3 on-demand for a rare activity, doesn't warrant
    every-session documentation bloat in a constitutional behavioral rule. Contents-list entry for § Verification
    and Discovery updated to include "load methods/extensions". Two-copy sync applied — both DEV-RULES.ARC copies
    identical. Tier 1 markdown lint clean.

    **Follow-on:** PRD P0.3 wording ("references a method, extension, strategy, or workflow") predates the landed
    frontmatter trigger contract and reads broader than the implemented rule. Consider a PRD refresh to align; not
    blocking — PRDs are "spirit, not verbatim" in ARC convention, and the implemented rule is the more accurate
    behavioral specification.

- [x] **2.2 AGENT-BRIEFING.ARC cross-reference**

    **Outcome:** Decision — no cross-reference. Recorded in `notes-session-init-optimization.md § Phase 2 Decisions §
    Task 2.2`. Rationale: AGENT-BRIEFING.ARC holds framework orientation not behavioral rules; DEV-RULES is the
    single source of truth for rules; both docs are in session-init Batch 1 so earlier position gains are marginal
    and don't change execution-time compliance; two T1 homes carry drift risk. No file edit; no two-copy sync
    needed.

- [x] **2.3 Draft ADR-013 Tier 2 amendment**

    **Outcome:** Amendment dated 2026-04-20 appended to ADR-013's existing `### Amendments` section. Captures five
    consolidated bullets: per-file restructure (including frontmatter schema, terminology renames, `workflow` field
    omission, body conventions); workflow frontmatter as trigger contract; T1/T3 constitutional pair placement;
    `pre-merge-review` → `diff-review` rename and contract broadening; CI-enforced reliable-trigger invariant.
    Closing paragraph ties back to the original decision — direction holds, implementation is concretized.
    Left as draft; Phase 3 close (Task 3.10) will sanity-check against the implemented model. Tier 1 markdown
    lint clean. Single-copy per `strategy-package-project-sync.md` (ADRs project-scoped).

- [x] **2.4 Phase 2 close — Tier 2 quality gates**

    **Outcome:** All Tier 2 gates green locally. `lint:md` (200 files, 0 errors), `lint:ts`, `lint:sh`, `typecheck`,
    `typecheck:test`, `npm test` (43 tests across 8 files, all passing), `build`, and `lint:arc:triggers` (all 8
    methods + 8 extensions covered). Phase 2 complete.

---

### **Phase 3:** Validation, Integration, and Finalization

**Purpose:** Landing phase for the per-file structure established in Phase 1. Build the frontmatter parser utility;
write schema + link-resolution validation hooks; restructure session-init to the post-aggregate mechanism (methods:
no init read; extensions: `^active: true` grep enumeration); sweep cross-references from legacy aggregate anchors to
per-file paths; register per-file entries across the install pipeline (recipe, classification, manifest); retire
legacy aggregate files via scoped reference sweep (hooks, scripts, always-loaded docs, strategy narratives) before
delete; add CLI test coverage; harden the link validator (template-skip + archive-skip) and clear the live-ref and
template false-positive broken-link categories; close with ADR-013 sanity check.

**Note:** Tier 2 gates run at sub-phase boundaries (3.6 cross-reference sweep close), not only at phase end. Two-copy
discipline applies throughout — every file change touches `packages/arc-framework/arc/` and `.arc/`.

- [x] **3.1 Frontmatter schema finalization + parsing utility**

    Parent task. 3.1.a locked in the final field name (`override-active`), then 3.1.b built the parser against
    it with no intermediate-name detour. Schema-name + validator + audit-script refactor landed as a coherent
    unit; all downstream Phase 3 tasks (3.3 schema validation hook, 3.5 aggregated-index generation) now have
    the shared scaffold to build on.

    - [x] **3.1.a Rename method schema field `has-override` → `override-active`**

        **Outcome:** Field renamed across 25 occurrences in 21 files — all 16 method files (8 × 2 copies),
        both README copies, both `strategy-session-operations.md` copies (3 occurrences each: schema spec,
        field-semantics bullet, code-block example), and ADR-013 § Amendments. Status-file, task-list, and
        PRD occurrences intentionally deferred (status/task list refresh on commit; PRD P0.5 bundled with
        Task 3.10 ADR-013 sanity check). Tier 1 `lint:md` clean.

        **Rationale carried forward:** Parallelizes semantics with extensions' `active` field and drops the
        `has-`-prefix plural awkwardness. Self-documenting: the field answers "is the override turned on?" —
        method-side counterpart to the extension-side "is the extension turned on?".

    - [x] **3.1.b Frontmatter parsing utility (test-first)**

        **Outcome:** New `src/lib/frontmatter/` module with generic extractor + method and extension schema
        parsers; barrel re-exports everything. Refactored `src/scripts/audit-method-triggers.ts` to consume
        the shared generic parser (removes the inline triple-dash + `yaml.load` boilerplate, eliminates the
        drift risk between parsers). All 9 task-listed behaviors covered by 21 new unit tests
        (`__tests__/unit/frontmatter/`: 3 generic, 10 method, 8 extension). Full unit suite green (538 tests);
        `lint:ts`, `typecheck`, `typecheck:test`, and the audit script (`npx tsx …/audit-method-triggers.ts`)
        all clean.

        **Implementation notes:**
        - Generic: `parseFrontmatter(content)` → `{ data: unknown, parseError?: string }`. Absent block →
          `data: null, no error`. Malformed YAML → `data: null, parseError: <message>`.
        - Schema parsers return `{ frontmatter, errors: string[] }`; `frontmatter` is populated only when
          `errors` is empty. Diagnostics name the offending field (e.g., `` missing or invalid `override-active`
          (expected boolean) ``). Basename mismatch on `name` fires a separate diagnostic including both
          declared and expected values.
        - Package-source only — no `.arc/` mirror. Two-copy discipline applies to doc content, not TS source.

        **Batching judgment (per test-first method):** The 8 method-schema tests and 8 extension-schema tests
        were batched after the first RED-GREEN cycle rather than sliced one-at-a-time. Rationale: all cover
        field validation on a single function over a shared struct — strict slicing would mean rewriting the
        parser 5+ times with no discovery value. One test per field category kept the diagnostic failure modes
        distinct; generic-layer cycles 1–3 were sliced normally.

- [x] **3.2 Enhance directory READMEs with derived tables**

    **Outcome:** Both READMEs gained their derived tables; two-copy sync preserved.
    - `system/methods/README.md` — added **Method Dependencies** section after Index: 3-row
      Method / Related Methods / Coupling table (commit-format ↔ commit-context-format shown
      both directions + diff-review → review-triage) with note that unlisted methods are
      independent. Mirrors the original aggregate table's coupled-only rows.
    - `system/extensions/README.md` — added **Extension Points** section after Index:
      8-row lifecycle-ordered table with columns Extension / Workflow / Fires / Purpose.
      Order: post-context-load → post-task-quality → post-task-completion →
      post-unit-quality → pre-stage-review → pre-merge-review → post-work-unit-activate →
      post-work-unit-archive. Table alignment run through `markdown-table-prettify`; Tier 1
      `lint:md` clean.
    - Two-copy sync verified (diff -q) after prettifier pass.
    - Spec reconciliation: "Only 3 coupling pairs" in the task description — 2 unique
      semantic pairs, but 3 rows when the bidirectional pair is shown both directions (as
      the original aggregate did). Kept 3 rows for readability parity with the retired
      aggregate.

- [x] **3.3 Frontmatter schema validation hook (test-first)**

    **Outcome:** CHECK 12 wired into both pre-commit copies; TypeScript dispatcher
    validates staged methods/extensions/agent files against their schemas; 19 new unit tests
    (7 agent + 12 dispatcher). Current agent files lack frontmatter — hook blocks agent-file
    commits until 5.7.b deploys the schema (expected per spec sequencing).
    - **Agent schema parser** — `packages/arc-framework/src/lib/frontmatter/agent.ts` plus
      exports via `index.ts`. Minimal schema (`active: boolean` only); delegates to the
      generic layer for triple-dash extraction and malformed-YAML surfacing.
    - **CLI dispatcher** — `packages/arc-framework/src/scripts/validate-frontmatter.ts`.
      `classifyPath(path)` returns `method | extension | agent | other` using regexes that
      require the `system/<dir>/` prefix in either `.arc/` or package-source tree; agent
      files match `^[A-Z][A-Z0-9]*\.ARC\.md$` (CLAUDE/CODEX/GEMINI) — hyphenated briefings
      and READMEs route to `other`. `validateFiles(paths, readFile)` is the pure
      entry point for tests; `main()` is the `fileURLToPath`-guarded CLI. Passes full
      staged file list to avoid double-filtering between shell and TS.
    - **CHECK 12 in pre-commit** — shell-filters staged files under
      `^(\.arc|packages/arc-framework/arc)/system/(methods|extensions|agent)/` and invokes
      `npx tsx packages/arc-framework/src/scripts/validate-frontmatter.ts <paths>`. Short-
      circuits on success; captures stderr and surfaces with 3-space indent on failure.
      Two-copy sync verified.
    - **Test coverage (test-first, sliced then batched where tightly coupled):**
      agent schema — 7 tests sliced one-per-behavior (active:true pass, active:false pass,
      missing active, non-boolean active, ignores extra fields, missing block, malformed
      YAML). CLI dispatcher — 12 tests batched after first RED-GREEN since behaviors are
      tightly coupled around one small dispatcher function; `validateFiles` uses
      dependency-injected `readFile` so tests use an in-memory map without tmp dirs.
    - **Sequencing note with Phase 5.7.b:** 3.3 enforces agent-file schema now; existing
      `{AGENT}.ARC.md` files ship without frontmatter and would be blocked if staged.
      Acceptable per spec — 5.7.b adds frontmatter to templates + existing files before
      this branch merges, and this WU does not otherwise touch agent files.
    - Tier 2 green: lint:md (197 files, 0 err), lint:ts, lint:sh, typecheck,
      typecheck:test, 703 tests (19 new), lint:arc:triggers, build.

    Build `test-first` (one behavior at a time):
    - [x] Valid frontmatter passes (method, extension, and agent schemas)
    - [x] Missing `name` field fails with diagnostic naming the file and field (method/extension)
    - [x] Missing `description` fails (method/extension)
    - [x] Missing `override-active` on a method file fails
    - [x] Missing `active` on an extension file fails
    - [x] Missing `active` on an agent file fails
    - [x] `active` not boolean on an agent file fails
    - [x] `related` not an array fails (method/extension)
    - [x] `name` not matching file basename fails (method/extension)
    - [x] Non-method/extension/agent files staged do not trigger the check

- [x] **3.4 D7a link-resolution pre-commit hook (test-first)**

    **Outcome:** CHECK 13 wired into both pre-commit copies; shell-based validator
    (`system/scripts/validate-links.sh`) checks inline links, reference-style usages, and
    reference definitions in staged markdown; 11 new integration tests covering the spec's
    behavior list plus multi-diagnostic aggregation.
    - **Script** — `system/scripts/validate-links.sh` (both copies). Sanitizes markdown
      (awk state machine drops fenced code blocks, masks inline code spans with a
      placeholder that does not re-match the backtick regex). Validates: inline `[text](t)`
      targets, reference definitions `[ref]: t`, and reference usages `[text][ref]` (must
      have a matching definition). Skips: external URLs (http/https/mailto/ftp/ssh/git),
      anchor-only links, anchor fragments on non-anchor-only links. Relative paths resolve
      from the source file's `dirname`; bash's `test -e` normalizes `..` segments natively
      so no explicit `realpath` call is needed.
    - **CHECK 13 in pre-commit** — shell-filters staged `*.md` files; invokes the script
      via `"$(dirname "$0")/../scripts/validate-links.sh"` (symlink-agnostic — works whether
      `core.hooksPath` points at `.arc/system/githooks/` directly or via copy). Diagnostics
      surface with 3-space indent matching CHECK 12's output style. Two-copy sync verified.
    - **Test coverage (test-first, then fixed one bug)** — 11 integration tests using a
      tmp-dir fixture pattern: valid inline / valid ref-style / broken inline / relative
      path resolution from source dir / anchor fragment passthrough / external skip / code
      span ignored / fenced block ignored / undefined ref / broken ref definition target /
      multiple diagnostics in one run. Bug caught by the code-span test: initial awk
      placeholder `` `CODESPAN` `` re-matched the `` `[^`]*` `` regex on each iteration —
      infinite loop. Fix: placeholder without backticks (`CODESPAN`). Tests green after fix.
    - Tier 2 green: lint:md (197 files, 0 err), lint:ts, lint:sh (includes new script),
      typecheck, typecheck:test, 714 tests (11 new, from 703), lint:arc:triggers, build.

    Build `test-first` (one behavior at a time):
    - [x] Valid inline link to existing `system/methods/` file passes
    - [x] Valid reference-style link resolving to existing file passes
    - [x] Link to nonexistent file fails with diagnostic naming source file and target
    - [x] Relative path resolves from source file's directory (not `cwd`)
    - [x] Anchor fragments: file existence verified, anchor fragment ignored (`file.md#anchor` passes if `file.md` exists)
    - [x] External links (`https://...`) are ignored
    - [x] Inline code-span backticks containing link-like strings are ignored
    - [x] Broken reference-style link (undefined `[ref]`) fails with diagnostic

- [x] **3.5 Session-init mechanism: method scan retired, active-extensions list introduced**

    **Goal:** Eliminate session-init method/extension bulk scan. Methods load entirely at workflow trigger (body reads
    contain both `.override` and `.default` sections — init-time override-presence surfacing serves no agent decision).
    Extensions gain a minimal init-time enumeration via single `grep` for `^active: true`, producing a named
    **active-extensions list** carried in session context and consulted at fire points (avoids re-reading placeholder
    extension files mid-session in default installs).

    **Rationale:** Previous work established reliable workflow-frontmatter-declared triggers (Tasks 1.1, 1.3, 1.5) and
    the agent-side compliance rule (Task 2.1). With those in place, methods need no init-time awareness — body always
    loads at trigger. Extensions need minimal init-time awareness so fire-point checks short-circuit without re-reading
    placeholders; one grep at init is cheaper than 10–15 fire-point reads per session in a default install. See
    `notes-session-init-optimization.md` companion entry at Task 3.10 for the full architecture discussion.

    - [x] **3.5.a Define "active-extensions list" vocabulary in strategy doc**
        - `strategy-session-operations.md § Method and Extension Loading` updated:
            - Per-file Frontmatter Schema intro paragraph rewritten — schema now described as having two
              consumers (session-init grep for extensions; CI audit for both), with methods explicitly no-init-read
            - `override-active` field semantic updated — consumed by CI/docs/authoring tooling; not by session-init
            - `active` field semantic updated — session-init enumerates via `grep -l`; fire points consult the
              active-extensions list by name
            - Stale `### arc-methods.md` and `### arc-extensions.md` subsections replaced with
              `### Session-Init Consumption` (methods: no init read; extensions: grep enumeration; related
              agent-file active-gate pattern noted) plus preserved `### Method Classification by Trigger` table
        - `[dev-rules-arc]` ref-def added to support the agent-side-compliance cross-reference
        - Two-copy sync applied to both `.arc/` and `packages/arc-framework/arc/` copies

    - [x] **3.5.b Session-init.md Step 2/4/6 updates**
        - **Step 2:** Execution-strategy paragraph updated to name the active-extensions grep as Batch-1-eligible
          alongside identity/role and config reads. New "Enumerate active extensions" block inserted after
          "Resolve role" (before the Contributor blockquote so it runs universally). Block specifies the
          `grep -l "^active: true" .arc/system/extensions/*.md` invocation, basename-mapping convention, the
          named session-context artifact, and the empty-list short-circuit semantics. Methods-at-init removal
          was no-op (methods were never in Step 2's document set)
        - **Step 4:** Intro paragraph rewritten — `arc-methods.md` scan removed from the "reads in this step"
          list and from the "read and scan" instruction; replaced with a one-sentence pointer to the strategy
          doc's Session-Init Consumption section. Item 2 (Method overrides) removed; items renumbered (config
          values / platform awareness / custom commit patterns). Closing "Do not mention defaults" paragraph
          trimmed to drop "active method overrides" clause
        - **Step 6 (orientation):** Include/exclude bullets updated — "method overrides" replaced with
          "active-extensions list (only when non-empty)" in the include list; "that no overrides were found"
          and "that extensions had no steps" replaced with "that the active-extensions list is empty" in the
          exclude list
        - Two-copy sync applied to both `.arc/` and package-source `.template.md`
        - **Imperative-citation safety pass (post-3.5.d review):** the trailing
          "See [Session Operations Strategy] § Session-Init Consumption for the loading model" line in
          the Step 2 enumerate-extensions block, and the "per [Session Operations Strategy] § Session-Init
          Consumption" citation in Step 4's intro, were both removed. Inside Step 2's load-the-context flow
          a "See X for Y" sentence reads as an imperative load directive to over-literal agents and could
          trigger an unintended strategy-doc read at init; Step 4's citation served only as an
          appeal-to-authority for a self-evident rule. Workflow stays self-sufficient; rationale remains
          discoverable via STRATEGY-INDEX. Orphaned `[session-ops-extensions]` ref-def removed from both
          copies as a result

    - [x] **3.5.c Fire-point directive updates (6 workflows, two-copy)**
        - All 7 sites rewritten to consult the active-extensions list by name rather than re-reading the
          extension file at fire time. Literal template applied: "If `<extension-name>` appears in the
          active-extensions list (established at session init), load and execute its `.actions`.
          Otherwise, skip."
        - `3_process-task-loop.md` — 3 sites: `#post-task-quality`, `#post-task-completion` (external-tracker
          context sentence preserved post-directive), `#post-unit-quality`
        - `prepare-commits.md` — 1 site: `#pre-stage-review` in Quick Commit Reference step 5
        - `integrate-work-unit.md` — 1 site: `#pre-merge-review` sub-step 2 under Section 6, with the
          "Otherwise, skip this sub-step" variant (preserving the surrounding numbered-list structure)
        - `activate-work-unit.md` — 1 site: `#post-work-unit-activate` Step 6
        - `archive-work-unit.md` — 1 site: `#post-work-unit-archive` Section 6
        - `session-init.md` — 1 site: `#post-context-load` Step 3 with the "(established at Step 2)"
          variant (self-referential within the same workflow)
        - Two-copy sync applied: project copies + package-source counterparts (`.template.md` for
          3_process-task-loop and session-init; plain `.md` for the other four)
        - Duplicate "See `arc-extensions.md` § ..." pointer lines dropped everywhere — the directive's
          inline link is the single reference path now

    - [x] **3.5.d READMEs update (methods + extensions)**
        - `system/methods/README.md` — Loading-model paragraph rewritten: methods always load at workflow
          trigger; `override-active` is consumed by CI audit, docs generation, and authoring tooling, not by
          session-init. Sentence "Session-init scans the `override-active` frontmatter field for override
          _presence_" retired
        - `system/extensions/README.md` — both "How extensions work" and "Loading model" paragraphs
          rewritten. "How extensions work" replaces the old "workflow reads `active` at the fire point"
          mechanism with session-init enumeration + fire-point list-consultation. "Loading model" describes
          the single `grep -l "^active: true"` invocation producing the active-extensions list and
          fire-point behavior
        - Two-copy sync applied to both `.arc/` and package-source README copies

- [x] **3.6 Cross-reference sweep**

    **Outcome:** All anchor-form `arc-methods.md#anchor` / `arc-extensions.md#anchor` ref definitions rewritten
    to per-file paths across 21 files (11 under `.arc/` + 10 package-source mirrors; `agent-pre-merge-review.md`
    is project-only). Total: 44 anchor-form ref-def lines updated. Link resolver passes on all modified files;
    full-tree scan shows zero net change in broken-link count (36 pre-existing broken links in out-of-scope
    areas — `reference/archive/`, `backlog/`, `reference/research/`, `reference/analysis/`, template
    placeholders — none caused by this sweep).

    **Additional cleanup (flagged in notes-session-init-optimization.md § Judgment calls #4):** Rewrote the
    `integrate-work-unit.md` L150 plain-prose pointer ("see arc-methods.md § commit-context-format") into a
    reference-style link pointing at the new `methods/commit-context-format.md` file, adding a matching
    `arc-methods-ccf` ref definition to the file's link block (both copies).

    **Path depth adjustments applied:**
    - `../../workflows/arc-methods.md` → `../../methods/[name].md` (from `arc/` depth)
    - `../arc-{methods,extensions}.md` → `../../{methods,extensions}/[name].md` (from `arc/` depth, one level in)
    - `../../arc-{methods,extensions}.md` → `../../../{methods,extensions}/[name].md` (from `arc/subdir/` depth)
    - `../../../arc-extensions.md` → `../../../../extensions/[name].md` (from `arc/wul/planning/` depth)
    - `../../../system/workflows/arc-methods.md` → `../../../system/methods/[name].md` (from `reference/strategies/arc/`)
    - `../../../../.arc/system/workflows/arc-methods.md` → `../../methods/[name].md` (simplified the
      convoluted 4-up-back-through-`.arc/` path in `agent-pre-merge-review.md`)

    **Deferred to Task 3.8 (explicit gap — not a regression):** Two non-anchor link-def pairs
    (`[arc-methods]: ../../arc-methods.md` / `[arc-extensions]: ../../arc-extensions.md`) remain in
    `supplemental/integrate-external-content.md` (both trees) and `initial-setup/03_configure-external-integration.md`
    (package-only). These require prose rewrites at their usages (L74, L80, L87 / L77, L96, L132 respectively)
    because the prose frames `arc-methods.md` and `arc-extensions.md` as conceptual single-file catalogs —
    after Phase 3.8 deletes the aggregates, both the link targets and the semantic framing break. Task 3.8's
    "Verify no remaining references" step picks up the resolution (either per-file README redirect with matching
    prose update, or larger prose restructure in those setup workflows). Out of strict 3.6 scope (anchor-form only).

- [x] **3.7 Framework-sync + install pipeline: register per-file entries**

    **Outcome:** 18 new per-file paths (8 methods + 8 extensions + 2 READMEs) registered in both
    `.arc/system/.internal/manifest.json` and `packages/arc-framework/init-recipe.json`. Per-file
    method/extension bodies (16 paths — not READMEs) classified as `Configurable`; READMEs remain
    `Framework`. Pristine hashes computed from package-source content via `sha256sum` on UTF-8
    bytes (matches `hashContent` byte-for-byte).

    **Design correction mid-task:** Initial implementation classified all 18 entries as Framework,
    following the as-written task description. Surfaced during cross-check that
    `packages/arc-framework/arc/system/extensions/pre-merge-review.md` shipped with `active: true`
    and a CodeRabbit `.actions` body (local-repo leak from commit `43e7749` Task 1.4.b–f
    migration — see § Phase 3.7 addendum below). The leak forced a semantic choice: Configurable is the
    correct classification for method/extension bodies because the adopter-toggleable frontmatter
    (`active`, `override-active`) and fillable sections (`.override`, `.actions`) are exactly what
    three-way merge handles. Keeping them Framework would either trip the drift test the moment
    any adopter (including us) toggled a switch, or force package source to carry local opinion
    (as happened here). Fix:
    - 16 per-file paths added to `CONFIGURABLE_FILES` in
      `packages/arc-framework/src/lib/classification.ts`
    - 16 manifest entries flipped to `"Configurable"`
    - `packages/arc-framework/arc/system/extensions/pre-merge-review.md` corrected:
      `active: false`, `.actions` body replaced with `[No extension configured]` placeholder
      (matching 7 other extensions)
    - Pristine_hash recomputed from corrected package source:
      `3dd9dbc...` → `7540f37...`

    **Manifest ordering:** Inserted extensions/ block after `system/README.md` and methods/ block
    after `system/githooks/README.md`, mirroring the recipe's directory-grouped convention
    (subdirectory blocks alphabetical, README last within each block). Placement reached by
    alphabetical subdirectory order: `agent/ < arc-config.yml < README.md < extensions/ < githooks/
    < methods/ < scripts/ < skills/ < workflows/`.

    **Aggregate entries untouched:** `system/workflows/arc-methods.md` and
    `system/workflows/arc-extensions.md` remain in recipe L55–56, `CONFIGURABLE_FILES`
    (classification.ts L87–88), and manifest L270/L275 — 3.8.d removes atomically.

    **Phase 3.7 addendum — leak forensics (feeds Task 3.13):**
    - Origin: commit `43e7749` (2026-04-20), Tasks 1.4.b–f, single migration commit creating 36
      per-file files across two copies
    - Blast radius: 1 file. Other 7 extensions and all 8 methods in package source are clean
      (`active: false`, `override-active: false`, neutral `[No ... configured]` bodies). No other
      `CodeRabbit`/`WSL`/`/home/andrew` occurrences in `packages/arc-framework/arc/`
    - Why undetected: framework-sync test skips Configurable — and classification was Framework
      but both copies were identical, so no drift. Pre-commit hooks have no pattern check for
      package-source `active: true` or non-placeholder bodies
    - Guardrails captured in Task 3.13 — pre-commit hook checks targeting the exact leak pattern

    **Verification:**
    - JSON parse: both files load cleanly; all 18 new paths present in `manifest.files` and
      `recipe.include_files`
    - `framework-sync.test.ts` passes in isolation (41ms post-reclassification)
    - Full test suite: 48 files / 673 tests pass (unit + integration) and 8 files / 43 tests pass
      (e2e) — 716 total. Init integration, update integration, status-diff, reconfigure,
      classification assertions all green with new Configurable entries
    - Typecheck clean

- [x] **3.8 Retire legacy aggregate files**

    Parent task. Scoped sweep of all remaining references to the aggregates (hooks, scripts, always-loaded docs,
    strategy narratives), then delete + grep-verify. Reference scope is materially larger than the anchor-form
    ref-defs Task 3.6 swept — ~74 non-archive files still mention `arc-methods.md` or `arc-extensions.md`, with
    live-operational references in install pipeline, hooks, integrity scripts, Tier 1 always-loaded docs, and
    strategy narratives. Subtasks carve the sweep by concern; 3.8.a through 3.8.c must land before 3.8.d so
    the delete commit ships atomically with no residual live references.

    - [x] **3.8.a Active hooks and integrity scripts**

        **Goal:** `arc-verify` and the `commit-msg` hook continue to work post-aggregate-deletion.

        **Outcome:** Hook and diagnostic script aggregate references removed; `verify-integrity.sh` §6
        (Session State) deleted outright; `commit-msg` CHECK 7 loosened to be format-agnostic. Scope
        expanded beyond the original three bullets in two passes: (1) §2 and §5 aggregate references
        folded in to honor the post-deletion-survival goal literal; (2) §6 investigation uncovered a
        silently-non-functional check whose parser tightly coupled to status-file line format — value
        proved marginal (redundant with session-init runtime validation), so the check was deleted
        rather than repaired. CHECK 7 in `commit-msg` retained but loosened to prevent the same
        format-coupling trap for adopters.

        - `system/scripts/verify-integrity.sh` (both copies):
            - §2: removed the two aggregate `check_file` calls (Methods/Extensions file entries).
            - §5: removed the two aggregate entries from the `ref_file` iteration list.
            - §6 (Session State) **deleted entirely**. Duplicated session-init's runtime validation of
              Task List / Next Task references; parser-format coupling was not worth maintaining for
              preemptive detection that the next session itself catches.
            - §7 (now §6 after renumber): replaced section/subsection grep on aggregates with per-file
              enumeration. For each `.md` in `system/methods/` and `system/extensions/` (excluding
              `README.md`): verify first line is `---`, closing `---` within first 20 lines, and
              required keys present (`name`, `description`, plus `override-active` for methods /
              `active` for extensions). Deep schema validation remains pre-commit CHECK 12's
              responsibility. Inline shell — no `npx tsx` dependency — keeps the diagnostic
              self-contained for adopter contexts where `packages/arc-framework/` doesn't exist.
            - §8 renumbered to §7.
        - `system/workflows/arc/supplemental/verify-arc-integrity.md` (both copies): L16
          post-modification-gate bullet retargeted at `system/methods/` / `system/extensions/`;
          "Methods and Extensions" section rewrote structural-check description + severity table;
          "Session State" section deleted.
        - `system/githooks/commit-msg` (both copies):
            - L313 contributor advisory retargeted at `.arc/system/methods/commit-context-format.md`.
            - CHECK 7 Next Task grep loosened from `^- \*\*Next Task:\*\*` to `\*\*Next Task:\*\*`
              (match-anywhere). Tolerates list markers, indentation, backticks, path-prefixed values
              — extracts `Task X.Y` from whatever shape the adopter's status file uses. Trade-off:
              silently no-ops on non-ARC labels (`Current Task:` etc.) rather than false-firing on
              format variance.
        - `packages/arc-framework/__tests__/unit/scripts/commit-msg-status-pattern.test.ts` (new):
          regression + documentation coverage for CHECK 7's pattern. Asserts (a) the hook source
          still carries the lenient form, and (b) the pattern matches five representative status-file
          shapes (list-item, naked bold, indented, backticked-full-path, missing). Protects against
          accidental re-tightening.
        - Quality gates: `lint:sh` clean (both copies); `lint:md` clean on modified markdown;
          unit suite 584/584 passing (including the new 7-test file); functional smoke test of
          `verify-integrity.sh` confirms all 16 per-file frontmatter checks PASS and renumbered §6/§7
          run cleanly.
        - Two-copy sync applied throughout.

    - [x] **3.8.b Tier 1 always-loaded doc references**

        **Goal:** Session-init's always-loaded document set has zero broken references to the aggregates.
        - `reference/constitution/DEV-RULES.ARC.md` (both copies): single `[arc-methods]` ref-def replaced with
          four per-file ref-defs (`-cf`, `-ccf`, `-it`, `-tf`) plus one directory-level ref-def
          (`[arc-methods-dir]` → `system/methods/README.md`). `-qg` dropped from the suggested set — no
          `quality-gate-commands` link usage exists in the file. Body usages rewritten at all six sites:
          L13 (conceptual intro → `system/methods/` directory), L65 (split into two per-method links), L140
          (issue-triage), L175 + L180 (test-first, two sites), L361 (relevant `system/methods/` files).
        - `system/agent/AGENT-BRIEFING.ARC.md` L21–24 (both copies): `**Methods and extensions:**` paragraph
          rewritten — methods now override via `.override` section under `system/methods/`; extensions live
          under `system/extensions/`.
        - `system/skills/arc-commit/SKILL.md` L22 (both copies): commit format guidance now points at
          `system/methods/commit-format.md` and `system/methods/commit-context-format.md`.
        - `system/arc-config.yml` L120 comment (both copies): diff-review pointer updated to
          `system/methods/diff-review.md`.
        - Quality gates: `lint:md` clean on the three modified markdown files in `.arc/` (package-source
          mirrors are excluded from lint by config but are byte-identical to the `.arc/` copies).
        - Full-file grep across all eight modified files confirms zero remaining `arc-methods.md` /
          `arc-extensions.md` references.
        - Two-copy sync applied throughout.

    - [x] **3.8.c Strategy narrative rewrites**

        **Goal:** Strategy docs accurately describe the current per-file customization model. These are content
        rewrites, not link swaps — the old narratives frame customization as writing into the aggregates.
        - `strategy-configurability-architecture.md` (both copies) — 8 rewrite sites landed: (a) mechanisms
          table rows for Extension/Method override → `system/extensions/` / `system/methods/`; (b) `§
          Configurability path definitions` Method override bullet (now describes `.override` section in a
          file under `system/methods/`) + Extension bullet (files under `system/extensions/`); (c) `§ Agent
          discovery` substantively rewritten — dropped the obsolete "scan `arc-methods.md` for override
          presence" mechanism, replaced with current state (grep `active: true` on `system/extensions/*.md`
          → active-extensions list; methods not enumerated at init); (d) `§ Extension Points § Mechanism`
          rewritten to describe per-file structure with frontmatter + `.actions` section, and `References in
          workflows` code sample updated to the active-extensions-list fire-point pattern; (e) `§ Preset vs.
          custom` "corresponding files in `system/extensions/`"; (f) `§ Method Overrides § Mechanism`
          rewritten to describe per-file co-location with `system/extensions/`; (g) `§ Platform commands`
          behavioral-methods bullet → `system/methods/`.
        - `strategy-team-coordination.md` (both copies) § Integration Mechanism: body rewritten — now names
          `.actions` section populated in the relevant per-file extension; single `[arc-extensions]` ref-def
          replaced with 4 per-file refs (`-dir`, `-task-completion`, `-wu-activate`, `-wu-archive`) linking
          the three named extensions + the directory.
        - `strategy-file-classification.md` (both copies) § Template suffix convention: aggregate example
          replaced with `system/methods/commit-format.md` — preserves the "ships as functional content,
          customized in place" framing with a current live example.
        - `strategy-workflow-authoring.md` (both copies) `arc:` namespace § final bullet rewritten — drops the
          "when methods and extensions migrate" forward-looking framing (migration is complete); names match
          file basename in `system/methods/` / `system/extensions/` stated directly.
        - `strategy-package-project-sync.md` (.arc/ only — project-specific strategy, not mirrored):
          Configurable files list expanded — the two aggregate entries replaced with 16 per-file entries
          (8 methods + 8 extensions) in alphabetical order. Directory-glob alternative rejected for
          consistency with the rest of the list, which enumerates specific files.
        - `strategy-project/README.md` (both copies) § Drop zone routing bullets: Method override bullet now
          reads "populate `.override` in the method's file under `system/methods/`"; Extension bullet reads
          "populate `.actions` in the extension's file under `system/extensions/`". Note: corrected `.steps`
          → `.actions` (the current extension field name).
        - `TECHNICAL-OVERVIEW.md` (.arc/ only — template counterpart is generic placeholder content without
          these references) — 3 sites rewritten: Key characteristics bullet, Workflows component description,
          and Customization Layer section (per-file methods listed with the full post-restructure catalogue:
          commit-format, commit-context-format, issue-triage, test-first, session-state, diff-review,
          review-triage, quality-gate-commands).
        - Quality gates: `lint:md` clean on all 7 `.arc/` files; package-source mirrors byte-identical for
          the 5 mirrored docs.
        - Full-file grep across all 12 modified files confirms zero remaining `arc-methods.md` /
          `arc-extensions.md` references.
        - Line-number drift from task description noted: actual target in `strategy-package-project-sync.md`
          was L202–203 (not L52). `TECHNICAL-OVERVIEW.md` template counterpart had no aggregate references
          to mirror — the project's rendered copy is the only place they existed.

    - [x] **3.8.d Delete aggregates + install-pipeline cleanup + grep-verify**

        **Goal:** Aggregate files are gone; install pipeline, manifest, and tests are clean; full-tree grep
        confirms zero operational references remain.
        - Deleted the 4 aggregate files: `.arc/system/workflows/arc-methods.md`,
          `.arc/system/workflows/arc-extensions.md`, and both `packages/arc-framework/arc/system/workflows/`
          counterparts.
        - `packages/arc-framework/init-recipe.json` — removed both aggregate entries (actual L73–74, not L55–56
          as stated in planning; entries had drifted during the per-file additions).
        - `packages/arc-framework/src/lib/classification.ts` — removed both entries from `CONFIGURABLE_FILES`
          (L87–88, matches planning).
        - `.arc/system/.internal/manifest.json` — removed both entries (actual L360, L365, not L270, L275;
          drift similar to init-recipe). Per-file methods/extensions manifest entries ship unchanged.
        - Also cleaned `.arc/system/.internal/pristine.json` (gitignored, two-copy snapshot store): removed
          the two aggregate keys to keep manifest/pristine pairing consistent locally.
        - Unit tests updated (line numbers in planning were stale — resolved from actual references):
            - `__tests__/unit/init.test.ts:282` — replaced `"system/workflows/arc-methods.md"` with
              `"system/methods/commit-format.md"` in the `classifyFile` "Configurable" assertion (per-file
              methods remain Configurable; aggregate path now falls through to Framework).
            - `__tests__/unit/manifest/apply.test.ts:158,168` — replaced `"system/arc-methods.md"` (stand-in
              path for Configurable-class removal fixture) with `"system/methods/commit-format.md"`.
            - `__tests__/unit/removal-prompts.test.ts:40` — same replacement, fixture role only.
            - `__tests__/unit/scripts/validate-package-neutrality.test.ts` — deleted the `it("does NOT
              classify legacy aggregate files — out of scope (retired in 3.8.d)")` case outright; the
              in-file comment explicitly scheduled this test for removal at 3.8.d, now that the source
              files no longer exist in the package tree.
        - Deferred-from-3.6 link-def pair rewrites:
            - `system/workflows/arc/supplemental/integrate-external-content.md` (both trees) — Steps 3a/3b
              rewritten to reference `system/methods/` and `system/extensions/` directories; section-name
              references updated to current field names (`.actions` not `.steps`); added `override-active`
              / `active` frontmatter toggle guidance. Ref-defs `[arc-methods]` / `[arc-extensions]` now
              point at `../../methods/README.md` / `../../extensions/README.md`.
            - `system/workflows/arc/initial-setup/03_configure-external-integration.md` (package-only) —
              L77/L96/L132 + Step 4 Summary bullets rewritten to reference the directories and specific
              per-file paths where a single target is named (`post-task-completion.md`). Ref-defs updated;
              added `[arc-ext-post-task-completion]` for the direct per-file link.
        - **Scope expansion from grep-verification (not enumerated in planning):** the initial grep after
          the above changes surfaced 9 additional live operational references in 5 files — all pre-existing
          narrative hits that were not caught by Tasks 3.6/3.8.a–c. Rewrote each:
            - `system/workflows/arc/session-lifecycle/session-init.md` + `.template.md` (both trees, 4
              files) — "The session state mechanism is overridable via `` [`arc-methods.md` §
              session-state][…] ``" → "… via the `[session-state method][…]`" (ref-defs already pointed
              at per-file method path).
            - `system/workflows/arc/session-lifecycle/session-handoff.md` + `.template.md` (both trees,
              4 files) — same pattern, same rewrite.
            - `system/workflows/arc/initial-setup/01_verify-and-configure.md` (both trees, 2 files) —
              § Customization Beyond Config: rewrote the "two additional customization files" narrative
              to describe `system/methods/` and `system/extensions/` directories with concrete per-file
              examples (`commit-context-format.md` Jira override, `post-task-quality.md` security scan,
              `post-task-completion.md` tracker sync).
            - `system/workflows/project/agent-pre-merge-review.md` — body rewrite: "populates the
              `pre-merge-review` extension point in [arc-extensions.md]…" → "populates the `.actions`
              section in the [pre-merge-review extension]…" (ref-def already correct).
        - Full-tree grep post-cleanup: `grep -rn 'arc-methods\.md\|arc-extensions\.md' .arc/
          packages/arc-framework/arc/ packages/arc-framework/src/ packages/arc-framework/__tests__/`
          filtered against the allowed-zones list (WU artifacts, ADRs, archives, analysis, backlog,
          `.internal/`) returns **zero hits**. Live docs / code / scripts / tests are clean.
        - Quality gates: Tier 1 + Tier 2 full suite passed on modified files (5 `.arc/` workflow files
          lint clean; full `lint:md` across 195 files 0 errors; `lint:ts` / `typecheck` / `typecheck:test`
          clean; 583 unit tests + 43 e2e/integration tests passing; `build` succeeds).
        - **Docs and backlog:** Out of scope this WU. `docs/` handling is covered by the separate
          docs-content-sweep WU. Backlog plan-doc references (ROADMAP, `plan-arc-modes.md`, etc.) refresh at
          activation of their respective WUs.

- [x] **3.9 CLI test coverage — per-file restructure**

    **Outcome:** Per-file methods/extensions layout verified across unit, integration, and E2E tiers. Classification
    matches the landed three-way-merge model (adopter-customizable per-file; READMEs fall through to Framework) — the
    planning-phase "all 18 Framework" framing was rejected after review because Framework classification wholesale-
    replaces on update, which would obliterate adopter `.override` / `.actions` content. Corrected model locked in as
    the single source of truth across the new tests.
    - **Unit — classification** (`__tests__/unit/init.test.ts`): added `classifyFile("system/extensions/post-task-quality.md")`
      → `Configurable` (representative extension; representative method path `system/methods/commit-format.md` → `Configurable`
      was already asserted at :282). Added `classifyFile("system/methods/README.md")` and
      `classifyFile("system/extensions/README.md")` → `Framework` to pin the README fall-through behavior.
    - **Integration — fresh install** (`__tests__/integration/init.test.ts`): three new cases under the
      `pm.mode=none, tools=[claude]` describe — (a) all 8 method files + README present on disk, (b) all 8 extension
      files + README present on disk, (c) all 18 registered in manifest with 16 `Configurable` (methods + extensions)
      and 2 `Framework` (READMEs).
    - **Integration — legacy no-op** (`__tests__/integration/update.test.ts`): new case seeds
      `system/methods/arc-methods.md` and `system/extensions/arc-extensions.md` onto a post-restructure `.arc/`,
      runs `arc update`, and asserts the legacy files are untouched on disk, absent from
      `added`/`removed`/`keptForReview`, and not registered in the post-update manifest. No migration code path
      assumed — zero-adopter state per PRD § Won't Do.
    - **Integration — idempotent re-update** (`__tests__/integration/update.test.ts`): new case runs update twice on a
      fresh post-restructure `.arc/`; second run produces zero `added`/`removed`/`updated`/`reclassified`/`conflicts`
      entries touching any of the 18 per-file paths, and `manifest.json` is byte-identical between runs.
    - **E2E — init layout** (`__tests__/e2e/init.e2e.test.ts`): new case runs `arc init --yes`, asserts all 18 per-file
      paths exist on disk, asserts legacy `arc-methods.md` / `arc-extensions.md` do NOT ship, and validates manifest
      classification split (16 Configurable, 2 Framework).
    - **E2E — reconfigure regression** (`__tests__/e2e/reconfigure.e2e.test.ts`): new case snapshots per-file content
      pre-reconfigure, reconfigures `pm.mode: none → arc-in-git`, asserts all 18 files remain byte-identical on disk and
      retain their manifest classification.
    - **Hook cross-flow coverage — decision: DROP as duplicate.** Rationale: CHECK 12 logic covered by
      `__tests__/unit/scripts/validate-frontmatter.test.ts` (in-memory fixtures, schema logic thoroughly exercised);
      CHECK 13 logic covered by `__tests__/integration/validate-links.test.ts` (subprocess against fixture files);
      CHECK 14 logic covered by `__tests__/unit/scripts/validate-package-neutrality.test.ts`. Hook→validator routing
      positive path is exercised daily by real dev commits touching methods/extensions frontmatter; routing negative
      path (short-circuit on non-matching staged files) is covered by the Task 3.12 planned hook false-positive surface
      check. A synthetic "fresh init → stage bad frontmatter → confirm block" test reproduces validator logic already
      under test with additional infrastructure cost (git setup + hook install + stage + commit attempt) and no new
      coverage dimension.
    - Quality gates: `lint:ts` + `typecheck:test` clean; targeted vitest runs pass — 52 unit / 63 integration (init+update)
      / 22 E2E (init+reconfigure).

- [x] **3.10 ADR-013 sanity check, PRD refresh, and finalize**

    **Outcome:** ADR-013 amendment and PRD brought into alignment with the landed split mechanism. Notes-file
    § Compliance-Reliability Grounding middle paragraph rewritten to reflect the landed state (Persistent Context
    trigger met). No strategy edits — strategy-session-operations.md § Per-file Frontmatter Schema and
    § Session-Init Consumption already match landed state (verified during evaluation). No literal "draft marker"
    existed in the ADR text; the Phase 2.3 "draft" status was conceptual, so no text removal needed.

    **5-point amendment checklist — verification results:**
    - (a) Per-file structure: ✓ 8 methods + 8 extensions + 2 READMEs on disk; aggregate files retired.
    - (b) Schema field names: ✓ `name`, `description`, `related`, `override-active` (methods) / `active`
      (extensions) verified against `commit-format.md`, `diff-review.md`, `post-task-quality.md` and
      strategy-session-operations.md § Per-file Frontmatter Schema.
    - (c) Session-init Step 2 split mechanism: stale amendment text at L164–167 rewrote — "the override scan
      became an aggregated frontmatter-only read across ~16 per-file entries" → asymmetric split (methods no init
      read, bodies load at workflow trigger; extensions enumerated via `grep -l "^active: true"` producing the
      active-extensions list consumed by fire-point directives). Preamble at L165 "performing an override-presence
      scan only" also replaced with "doing minimal init-time work."
    - (d) `pre-merge-review` method → `diff-review` rename: ✓ verified on disk (file exists, contract
      broadened, related link to `review-triage`).
    - (e) CI-enforced reliable-trigger invariant: ✓ `audit-method-triggers.ts` exists at
      `packages/arc-framework/src/scripts/`, `lint:arc:triggers` npm script at `package.json:24`, runs in
      `.github/workflows/ci.yml:21`.

    **PRD refresh — applied:**
    - P0.2: dropped "(or legacy aggregate sections during interim)" parenthetical — historical interim now gone.
    - P0.5: dropped `workflow` field; renamed `has-override` → `override-active`; added one-clause rationale for
      the omitted `workflow` field (duplicates, lossy on fan-out; reverse index lives in strategy).
    - P0.6: renamed `has-steps` → `active`; noted `.steps` → `.actions` section rename.
    - P0.8: retitled "Session-init consumption — asymmetric split"; rewrote body to describe methods-no-init-read
      vs. extensions-grep-enumerate mechanism explicitly.
    - P1.13: tightened to match shipped Step 2 — Batch 1/2 structure, active-extensions grep location, Step 4
      simplification (non-defaults only, no method-override survey), imperative-citation safety pass
      (strategy-doc "See X for Y" citations removed from Step 2 and Step 4).
    - § Architectural Shape (Technical Considerations): updated from "thin awareness index" framing to the
      asymmetric-split description.
    - § Session-Init Consumption Model: retired thin-index framing for methods; narrowed to extensions-only
      enumeration with fire-point-directive rationale retained.
    - § Constitutional Rule Framing: verified against shipped Step 2 and Step 4 — no "See X for Y" strategy
      citations present; content unchanged.
    - Other P0.x bullets audited: P0.1 / P0.3 / P0.7 / P0.9 / P0.10–P0.13 all accurate as written.

    **Notes-file § Compliance-Reliability Grounding:** middle paragraph ("The thin front-loaded index serves
    awareness and compliance reassurance, NOT dispatch") rewritten to reflect landed mechanism. First paragraph
    (intent-matching vs. named-reference distinction), third paragraph (absolute-framing rationale), and fourth
    paragraph (baseline scope of reliability claim) retained as still-valid planning-phase grounding.

    **Sync notes:** ADR-013 is single-copy in `.arc/` (`packages/arc-framework/arc/reference/adr/` contains only
    `README.md`) — single-write confirmed; PRD and notes-file are single-copy per WU convention; no strategy
    edits this task, so no two-copy sync work.

    **Quality gates:** Tier 1 markdown lint clean on all three edited files (ADR-013, PRD, notes).

- [x] **3.11 Link-validator hardening + stale-ref cleanups**

    **Outcome:** Full-tree broken-link scan now yields only the expected backlog cross-WU bucket (6 hits across
    `plan-arc-modes.md`, `plan-expanded-planning-path.md`, `plan-post-release-methodology.md`,
    `plan-work-unit-mobility.md` — all tracked to specific future WU activations). Template and archive
    false-positives cleared structurally in the validator; two surviving live stale refs resolved inline.

    - **`validate-links.sh` extended** (both copies, byte-identical): `validate_file()` now short-circuits
      before target validation for (a) basename matching `*.template.md` or `template-*.md` and (b) any path
      under `reference/archive/`. Case-based early-exit pattern matches the existing `.md` extension guard.
      Comments cite the post-install-relative rationale and DEV-RULES.ARC § Documentation Boundaries
      "document what _is_, not what _was_".
    - **Test coverage**: 3 new cases in `packages/arc-framework/__tests__/integration/validate-links.test.ts` —
      (a) `agent.template.md` with broken link exits 0; (b) `template-agent.md` with broken link exits 0;
      (c) `reference/archive/old-plan.md` with broken link exits 0. Full suite: 16 / 16 tests pass.
    - **ATOMIC-INBOX cleanup**: removed the "Teach `validate-links.sh` to skip template source files" entry
      from `.arc/user/andrew/ATOMIC-INBOX.md` (delivered by this task).
    - **BACKLOG-FEATURE.md `plan-arc-lite.md` → `plan-arc-modes.md`**: Lite concept now lives as Mode 1 of the
      broader ARC Operating Modes plan (PRD-ready draft per `plan-arc-modes.md` L7). Replaced the "ARC Lite —
      Lightweight Project Mode" entry with an "ARC Operating Modes" entry covering Lite, Local, shift
      lifecycle, and mode-aware config template scaffolding.
    - **analysis-workflow-clarity-audit.md undefined `[arc-ext-post-context-load]`**: added ref-def at end
      of file (after existing `---` separator per DEV-RULES.PROJECT § Documentation style) pointing at
      `../../system/extensions/post-context-load.md`. Preserves the historical Fix-proposal prose as-is;
      only the reference target is made current.
    - **Full-tree verification**:
      `find .arc packages/arc-framework/arc -name '*.md' -type f | xargs .arc/system/scripts/validate-links.sh`
      returns exactly 6 `.arc/backlog/feature/**` cross-WU hits — zero live-ref, zero template false-positive,
      zero archive hits. All 6 hits fall inside the expected allow-list.
    - **Quality gates**: Tier 1 clean — markdown lint on 3 edited content files + updated task list;
      shellcheck on both script copies; `lint:ts` on the test file; targeted vitest (validate-links
      integration: 16/16 pass).

- [x] **3.12 Phase 3 close — Tier 3 quality gates**

    **Outcome:** Phase 3 closes clean. All Tier 3 gates green, all hooks short-circuit correctly on
    non-matching paths, full-tree link scan at the expected `backlog/feature/**` steady state. No
    regressions; ready to gate Phase 4.

    - **Tier 3 gates — all green:**
        - `npm run -s lint:md` — 195 files, 0 errors.
        - `npm run lint:ts` — clean (no output = no ESLint violations).
        - `npm run lint:sh` — clean (shellcheck on both hook scripts + `arc/system/scripts/*.sh`).
        - `npm run typecheck` — clean (source `tsc --noEmit`).
        - `npm run typecheck:test` — clean (test `tsc --noEmit --project tsconfig.test.json`).
        - `npm test` — 752 tests pass (50 unit+integration files / 707 tests + 8 E2E files / 45 tests).
        - `npm run build` — tsup success (cli.js 129.30 KB, declarations emitted).
        - Framework-sync: `__tests__/integration/framework-sync.test.ts` passes standalone (1/1) —
          part of the full `npm test` run, re-verified individually.
    - **Hook false-positive surface check:** Path-gating patterns for CHECK 12, CHECK 13, CHECK 14
      verified against a synthetic "non-methods/non-extensions/non-markdown" staged set
      (`tsconfig.json`, `.gitignore`, `packages/arc-framework/src/cli.ts`,
      `packages/arc-framework/src/lib/classification.ts`, `package.json`,
      `packages/arc-framework/package.json`). All three `grep -E` gates produce empty candidate
      lists, so their `if [ -n "$candidates" ]` guards short-circuit without invoking any
      validator. Positive-path mirror (`commit-format.md` + `post-task-quality.md` + README.md +
      QUICK-REFERENCE.md + tsconfig.json) confirms correct targeting: CHECK 12 fires on all three
      methods/extensions/agent paths, CHECK 13 fires on all four `.md` files, CHECK 14 fires only
      on the package-source non-README extension. Path gating is correct in both directions.
    - **Full-tree link-scan invariant:**
      `find .arc packages/arc-framework/arc -name '*.md' -type f | xargs .arc/system/scripts/validate-links.sh`
      yields exactly 6 `.arc/backlog/feature/**` cross-WU hits across `plan-arc-modes.md`,
      `plan-expanded-planning-path.md`, `plan-post-release-methodology.md`, and
      `plan-work-unit-mobility.md`. Zero live-ref hits, zero template false-positives, zero
      archive hits (post-3.11 validator hardening). All 6 hits fall inside the allowed allow-list
      bucket — expected steady-state.
    - **Regression check:** Working tree clean, last 2 commits aggregate the Phase 3 close diff
      (10 files changed, 245 insertions / 127 deletions) — no unstaged drift.

- [x] **3.13 Package-source neutrality guard (follow-on from 3.7 leak discovery)**

    **Outcome:** Pre-commit CHECK 14 now blocks the exact leak pattern that reached main in `43e7749`.
    Package-source per-file methods/extensions must ship `override-active: false` / `active: false`
    frontmatter AND `[No override configured]` / `[No extension configured]` placeholder bodies; any
    deviation fails the commit with a file-path-and-field-specific diagnostic. `.arc/` copies are
    silently skipped (local customization allowed); READMEs and legacy aggregates are out of scope.

    **Implementation:**
    - `packages/arc-framework/src/scripts/validate-package-neutrality.ts` — new validator. Classifies
      staged paths (`package-method` / `package-extension` / `other`), reuses
      `parseMethodFrontmatter` / `parseExtensionFrontmatter` from `lib/frontmatter/` for the toggle
      check, and `extractSectionBody` (new helper) for the placeholder body check. Frontmatter parse
      failures suppress neutrality diagnostics — CHECK 12 owns schema errors; this check declines to
      pile on.
    - `packages/arc-framework/arc/system/githooks/pre-commit` + `.arc/system/githooks/pre-commit`
      (two-copy sync) — CHECK 14 appended after CHECK 13. Grep-filters staged files to the target
      path pattern before invoking the validator, so commits touching no per-file extensions/methods
      skip the `npx tsx` call entirely (no false-positive overhead).

    **Test coverage:**
    `packages/arc-framework/__tests__/unit/scripts/validate-package-neutrality.test.ts` — 20 tests
    covering: path classification (package-method, package-extension, .arc/-skip, README-skip,
    legacy-aggregate-skip, unrelated-skip), section-body extraction (H2-to-H2 boundary, H2-to-`---`
    boundary, blank-line stripping, missing-header), neutral-file pass, each failure mode (active:true,
    override-active:true, custom `.actions` body, custom `.override` body, combined toggle+body on
    same file), `.arc/` local-customization pass, README + unrelated-path pass, frontmatter-parse
    failure suppression, missing section header.

    **Acceptance verification** (all 8 criteria from the original task body):
    - (a)–(d) blocking behaviors: unit tests `flags ... active: true`, `flags ... override-active: true`,
      `flags ... .actions body`, `flags ... .override body` — each asserts `result.pass === false` and
      diagnostic mentions the path + specific field
    - (e) `.arc/` customization pass: `silently skips .arc/ copies even when they carry the exact leak
      pattern` — stages an `.arc/` file with active:true + custom body, asserts pass + empty
      diagnostics
    - (f) READMEs + unrelated paths pass: `silently skips package-source READMEs and unrelated paths`
    - (g) Fast short-circuit: hook-level `grep -E '...' || true` produces empty candidates → `if [
      -n "$neutrality_candidates" ]` skips the validator invocation entirely. Structurally identical
      to CHECK 12's pattern
    - (h) Full suite + typecheck: 49 files / 693 tests pass (unit+integration, +1 file / +20 tests
      from this work) + 8 files / 43 tests pass (e2e); `typecheck` + `typecheck:test` + `lint:ts` +
      `lint:sh` + `lint:md` + `build` all clean

    **Execution order note (superseded):** Originally queued with flexible position within Phase 3.
    Pulled forward to immediately follow 3.7 — guardrails now protect the remaining Phase 3 sweep
    (though 3.8's work doesn't author new per-file files, so no real race condition).

---

### **Phase 3.R:** CLI Vocabulary Alignment + Session-Init Remote-Sync

**Purpose:** Align `arc user` / `arc sync` command vocabulary with developer muscle memory (git fetch/pull semantics),
add an `arc user status` inspection surface, and land session-init's remote-sync awareness — absorbing Phase 5.0. The
rename and workflow integration land together so Phase 4 and Phase 5 are authored once against the final surface.

**Origin:** Follow-on to Phase 3 close, surfaced while debugging multi-machine git-notes staleness. `arc user pull`
semantically only fetched (ref updated, disk untouched); the true `git pull`-equivalent lived behind `arc sync --load`.
No status/inspection surface existed. Session-init had no remote-sync check. A full audit of `arc user` commands vs
dev muscle-memory produced the rename plan and demonstrated Phase 5.0 couldn't be cleanly expressed until vocabulary
stabilized.

**Convention note:** Uses phase-level `X.R` as an extension of the documented task-level `X.Y.R` revision scheme; the
extension is documented in 3.R.h.

- [x] **3.R.a CLI rename + test coverage**

    **Goal:** Primitives align with git muscle memory; `arc sync` becomes bidirectional smart porcelain.

    **Outcome:** Added `arc user fetch` for the existing fetch-only semantic and rewired `arc user pull` to fetch +
    load in one step, preserving `runUserLoad`'s backup behavior. Reworked `arc sync` into a direction-aware
    porcelain that inspects local-vs-remote note refs plus disk-vs-local snapshot state, prints an explicit push/pull
    banner before acting, and prompts on divergence instead of guessing. Removed `arc sync --load`. Updated command
    exports/CLI wiring and refreshed unit coverage in `sync.test.ts`, `user-handlers.test.ts`, and the affected
    `push-recovery.test.ts` mock surface.

- [x] **3.R.b `arc user status` command**

    **Goal:** Three-way comparison (local-ref × remote-ref × disk) with actionable output; online-by-default since
    the primary question is "am I in sync with the other machine?"

    **Design decisions (resolved pre-implementation):**
    - Informational command — exit code stays zero for all state shapes, including degraded remote checks
    - Headline states: `in sync`, `remote ahead`, `disk ahead`, `conflict`; remote probe failure renders as
      `remote unavailable`, not a conflict
    - Output shape: one short summary line always; add detail lines only when there is an actionable next step
    - Default mode performs the remote check; `--offline` skips it; `--all` lists all remote identities for maintainer
      inspection
    - Build on a richer inspection result than 3.R.a's coarse sync matrix so `status` and later session-init work can
      share the same underlying contract

    Build `test-first` (one behavior at a time):
    - Clean state reports `in sync` with no action hint
    - Remote-ahead state reports actionable guidance toward `arc user pull`
    - Disk-ahead state reports actionable guidance toward `arc user save`
    - Conflict state reports both sides diverged and names `arc user fetch` as the non-destructive inspection option
    - Remote-unavailable state reports degraded status without presenting a false conflict
    - `--offline` skips the remote probe and still reports local-vs-disk state coherently
    - Backup presence from 3.R.c is surfaced in the status detail area without overwhelming the summary line
    - Freshness gap between HEAD and the saved-on commit is surfaced in the status detail area

    **Outcome:** Added `arc user status` to the CLI plus a command-layer inspection/formatting surface shared across
    the handler and future session-init work. Default mode probes remote notes and reports `in sync`, `remote ahead`,
    `disk ahead`, `conflict`, or `remote unavailable` with action hints toward `arc user pull`, `arc user save`, or
    non-destructive `arc user fetch` inspection as appropriate. `--offline` skips the remote probe while preserving
    coherent local-vs-disk reporting, `--all` enumerates remote identities for maintainer inspection, and detail lines
    now surface saved-snapshot freshness gaps plus legacy/current pre-load backup presence without bloating the summary
    line. Coverage added in new unit tests for result shaping, handler tests for flag/summary wiring, and integration
    tests for remote-ahead, offline disk-ahead, and `--all` output paths.

- [x] **3.R.c Multi-snapshot backup hardening**

    **Goal:** `.pre-load-backup.json` is no longer single-shot; successive pulls preserve the last N pre-load
    snapshots so a second pull-before-review doesn't lose the first pre-load state.

    **Design decisions (resolved pre-implementation):**
    - Timestamped snapshot files replace new writes to the single-shot backup file
    - Retention is hardcoded at 3 for this phase — no new config key
    - Legacy `.pre-load-backup.json` remains readable/surfaceable during transition, but new pulls write only the
      timestamped form
    - Pruning happens immediately after a new snapshot is created

    Build `test-first` (one behavior at a time):
    - Pull/load creates a timestamped pre-load snapshot before overwriting local state
    - Fourth snapshot prunes the oldest retained snapshot, leaving the latest three
    - Legacy `.pre-load-backup.json` coexists without breaking retention or discovery
    - Dotfile serialization rules continue to exclude both legacy and timestamped backup files
    - Backup metadata surfaces correctly in `arc user status`

    **Outcome:** `runUserLoad` now writes timestamped pre-load snapshots instead of overwriting the single-shot
    legacy backup file, retains only the latest three timestamped snapshots immediately after each new write, and
    leaves any existing legacy `.pre-load-backup.json` in place for explicit transition visibility. Backup discovery
    used by `arc user status` now reports timestamped snapshots newest-first with legacy files still surfaced, and
    backup-related stale-file warnings point at the specific snapshot created during the load. Integration coverage now
    verifies timestamped snapshot creation, retention pruning on the fourth snapshot, legacy coexistence, dotfile
    exclusion, and status-surface backup reporting.

- [x] **3.R.d `session.remote_sync` config addition**

    **Goal:** New config key exists in both `arc-config.yml` copies with inline documentation; no behavior yet
    (consumed by 3.R.e).

    **Design decisions (resolved pre-implementation):**
    - Flat dotted-key config, matching the rest of `arc-config.yml`
    - Governs session-init remote probing only; does not change handoff behavior or manual CLI command behavior

    **Outcome:** Added `session.remote_sync: enabled` to both `arc-config.yml` copies under a new Session
    Initialization section, with inline comments clarifying that session-init may fetch/probe remote notes
    automatically while restoring user-directory content to disk remains explicitly user-confirmed. Updated init
    integration coverage to assert the new default key is rendered for both solo and team-mode installs. No runtime
    behavior consumes the setting yet; 3.R.e remains the first behavioral task.

- [x] **3.R.e Session-init remote-sync integration**

    **Goal:** Land the session-init/runtime pieces needed for remote-sync awareness without bundling them into one
    oversized review increment.

    - [x] **3.R.e.1 Session-init remote fetch + divergence orientation**

        **Goal:** Session-init probes remote state early, surfaces actionable divergence in the orientation, and asks
        about remote resolution before the standard proceed prompt.

        **Design decisions (resolved pre-implementation):**
        - Session-init uses direct git fetch/probe steps, not a subprocess call to `arc user fetch`
        - Remote notes inspection fetches into a temp ref for comparison rather than mutating the live local notes ref
          before user confirmation
        - Orientation reports coarse actionable states, not precise ahead/behind counts for notes
        - Divergence resolution prompt is separate from the standard `Proceed to Next Action?` prompt

        Build `test-first` (one behavior at a time):
        - `session.remote_sync: disabled` skips the remote probe path cleanly
        - Clean remote state produces no divergence block and leaves the normal proceed prompt unchanged
        - Remote-unavailable probe failure degrades gracefully with a single actionable note
        - Notes/code divergence produces the orientation block and the remote-resolution prompt before the normal
          proceed prompt
        - Accepting the resolution path runs the intended pull actions and reports the result clearly

        **Outcome:** Added a non-interactive helper surface, `arc user status --session-init`, that respects
        `session.remote_sync`, performs the existing temp-ref remote probe without mutating live refs or disk, and
        reports coarse session-init states (`disabled`, `clean`, `remote-ahead`, `conflict`, `remote-unavailable`)
        plus whether the agent should prompt the user to pull before continuing. Updated the user-status handler/CLI
        wiring and summary formatting for the new mode, and documented Step 1.5 in both session-init workflow copies
        so the agent runs the probe, incorporates the result into orientation, and keeps the pull prompt in the
        harness layer rather than inside the CLI. Verification: targeted unit tests (`user-status`, `user-handlers`,
        `sync`, framework-sync), targeted `user.test.ts` integration coverage, `lint:ts`, `typecheck`, and task-file
        markdown lint all clean.

    - [x] **3.R.e.2 Ancestor-walk hardening for `arc user load` / `arc user pull`**

        **Goal:** Remove the fragile default-walk failure mode that motivated this phase so "no saved user directory
        found" only appears when there truly is no reachable noted ancestor.

        **Design decisions (resolved pre-implementation):**
        - Fix the core loader behavior rather than exposing a new `--max-ancestors` CLI flag in this phase
        - Use true reachable-ancestor detection internally and surface actionable guidance when the nearest note is far
          back in history

        Build `test-first` (one behavior at a time):
        - Reachable noted ancestor beyond the old 20-commit window is still found and loaded
        - No-note state still reports cleanly when no noted ancestor exists anywhere on reachable history
        - Guidance message distinguishes "note exists but is far back" from "no saved note exists"
        - `arc user pull` inherits the same hardened lookup behavior as `arc user load`

        **Outcome:** Removed the default `maxAncestorWalk: 20` false negative by making nearest-note lookup scan all
        reachable ancestors unless an explicit cap is passed for a targeted test. `runUserLoad` now records how far
        back the loaded note was found, and load summaries surface that distance so a far-back reachable note is
        distinguished from the true no-note case. Updated load/pull/sync handler copy from "recent ancestors" to
        "any reachable ancestor" so the null path only claims what the search actually checked. Verification: targeted
        unit coverage for user status/handlers/sync, targeted `user.test.ts` integration coverage including a
        >20-commit ancestor case, plus `lint:ts` and `typecheck` all clean.

- [x] **3.R.f Hook invocation fix for non-executable shell scripts**

    **Goal:** Fresh clones do not require manual chmod for hook-invoked shell scripts. Top-level hook entrypoints
    continue to rely on install-time executable bits in adopter repos or the project's hook manager.

    **Design decisions (resolved pre-implementation):**
    - Use bash-prefix invocation in hooks for nested `.sh` calls; do not add install-time chmod logic and do not
      change tracked file mode
    - Keep scope on hook-internal shell-script execution; top-level hook executability remains the existing
      install-time / hook-manager contract

    Build `test-first` (one behavior at a time):
    - Hook path executes `validate-links.sh` successfully without relying on the exec bit
    - No remaining hook directly invokes `.sh` files that may be non-executable in a fresh clone

    **Outcome:** CHECK 13 in both pre-commit hook copies now invokes `validate-links.sh` through
    `bash`, removing the nested-script executable-bit dependency that fails in fresh clones where
    tracked `.sh` files land without `+x`. Added unit regression coverage that locks in the
    bash-prefixed invocation and asserts the pre-commit hook no longer directly executes nested
    `.sh` files. Verification: `npm run lint:sh`, `npm run lint:ts`, and `npm run test:unit -- pre-commit-shell-invocation`.

- [x] **3.R.g Documentation + ADR sync (runs after 3.R.m and 3.R.f)**

    **Goal:** Framework two-copy surfaces first, then non-`docs/` single-copy artifacts and ADR history. Scope
    expanded by the second pass to cover the finalized probe commands, vocabulary rename, merge-recovery behavior,
    and `--yes` / `--max-walk` flags. Public `docs/**` drift is captured in `plan-docs-content-sweep.md`, not
    updated in this WU. Runs after second pass so doc churn happens once against the final surface.

    **Outcome:** Synced the remaining shipped doc surfaces to the finalized portability model:
    session-handoff now names the merge recovery label and `arc sync --yes`, session-operations
    documents the fetch/pull split plus direction-aware `arc sync`, team-coordination bootstrap
    now fetches another developer's notes before loading them, QUICK-REFERENCE adds
    `arc user fetch`, `--yes`, and `--max-walk`, and `user/README.md` now reflects the same
    command surface. Single-copy follow-up added the ADR-012 amendment, confirmed the public
    docs drift is routed through `plan-docs-content-sweep.md`, updated `plan-arc-modes.md` to
    the shipped tracked-mode semantics, and retired the old Phase 5.0 pointer as superseded.
    Verification: markdown lint clean on all touched `.arc/` files; package-source copies
    checked with the repo's package-excluded lint path plus a direct spot-check for command
    drift; shipped `reference/`, `system/`, and `user/` surfaces are free of stale
    `arc sync --load`, `arc user pull --identity`, and `disk ahead` references.

    - [x] **3.R.g.1 Two-copy doc sync for remaining CLI references**

        **Goal:** Package-source templates and installed `.arc/` copies reflect the finalized command vocabulary,
        bootstrap semantics, and second-pass additions.

        - Update both-copy references in:
          `session-handoff.md` / `session-handoff.template.md`,
          `strategy-session-operations.md`, `strategy-team-coordination.md`,
          `QUICK-REFERENCE.md` / `QUICK-REFERENCE.template.md`, and `user/README.md`
        - Replace stale `arc sync --load` references with the new command model
        - Where person-to-person bootstrap is ref-only, switch guidance from `arc user pull --identity {outgoing}`
          to `arc user fetch --identity {outgoing}` rather than implicitly overwriting local disk state
        - Second-pass additions to sweep in:
            - New probe commands (`arc extensions status`, `arc active status`, and composite
              `arc status --session-init --json`) where those surfaces are documented
            - Vocabulary: `disk ahead` → `local unsaved`; canonicalize `conflict` over `divergence` in user-facing
              phrasing where this phase's docs touch the sync model
            - Merge-recovery label (`"Merge: rebase my save onto remote, then push"`) wherever push recovery is
              discussed
            - `--yes` flag on `arc sync`, `arc user pull`, `arc user fetch`, `arc user load`
            - `--max-walk` flag on `arc user load`, `arc user pull`, `arc sync` pull direction
        - Grep-verify no remaining stale command references in `.arc/**` and `packages/arc-framework/arc/**`,
          excluding `reference/archive/**` and `reference/analysis/**`

    - [x] **3.R.g.2 Single-copy backlog/docs-sweep routing + ADR-012 amendment + Phase 5.0 retirement pointer**

        **Goal:** Non-`docs/` single-copy artifacts reflect the final command surface, `docs/**` drift is routed to
        the docs-content-sweep plan, ADR-012 captures the full Phase 3.R vocabulary realignment (both passes), and
        the old Phase 5.0 pointer retires formally.

        - Single-copy artifacts to update:
          `plan-arc-modes.md`, `plan-docs-content-sweep.md`, and `adr-012-adopt-unified-user-directory-model.md`
        - Capture public `docs/**` drift in `plan-docs-content-sweep.md` rather than editing `docs/` directly in
          this WU (current known touch points: `docs/the-framework.md`, `docs/reference/team-coordination.md`,
          `docs/index.md`, `docs/faq.md`)
        - ADR-012 amendment — append a dated amendment section; preserve the original decision body unchanged.
          Content covers both passes:
            - First pass: `pull → fetch`, `pull = fetch + load`, `sync` as direction-aware porcelain, durable
              2×2 sync-state matrix
            - Second pass: composite/status probe additions actually shipped, vocabulary rename
              (`local unsaved`, canonical `conflict`), merge-recovery semantics, bounded ancestor walk with
              `--max-walk` override, confirmation-by-default + `--yes` policy
        - QUICK-REFERENCE should point to the amendment for durable semantics context
        - Verify the old Phase 5.0 pointer now resolves entirely through 3.R.e / 3.R.g (confirm no second-pass
          addition introduced a 5.0-adjacent reference)
        - Leave `reference/archive/**` and `reference/analysis/**` untouched as historical record

**Second Pass — Post-Review Remediation**

**Purpose:** Address findings from the post-implementation review of 3.R.a–h. Four groupings: safety behaviors
(user-visible correctness on destructive paths), vocabulary + reporting (CLI output matches mental models),
probe-pattern extension (consistent coverage across extensions / methods / active-status, not a one-off), and
structural cleanup + test coverage (the integration gap that let silent-discard slip past unit tests).

**Origin:** `/arc-task-review` on 3.R.a–h surfaced three warrants-discussion items (non-TTY conflict exits silently,
push-recovery "pull first" discards just-saved note, sync pull path skips overwrite confirm) and a set of smaller
quality concerns. External research (shallow-clone conventions, Gerrit prior art) fed the ancestor-walk strategy.
Probe-pattern extension was added to this pass rather than deferred because the first-pass 3.R.e.1 surface proved
clean enough that inconsistency across the three remaining session-init discovery points is the bigger risk.

- [x] **3.R.i Safety behaviors**

    **Goal:** Every user-visible destructive path confirms by default, degrades gracefully in non-TTY environments,
    never silently discards saved state, and surfaces actionable diagnostics when bounded operations hit their cap.

    - [x] **3.R.i.a Non-TTY conflict + failure hardening**
        - `handleConflict` (`sync.ts`) non-TTY branch now calls `degradeConflictToSaveOnly` — saves the user
          directory, emits two warn-level banners ("conflict", "degrading to save-only"), then outros clean
          without exit code 1. Matches the `prompt` policy degradation shape.
        - `pushWithInteractiveRecovery` non-TTY divergence branch now returns
          `{ kind: "failed-nontty-conflict" }` instead of the generic `{ kind: "failed", error }`. Added to
          the `PushResult` discriminated union.
        - Both `handlePushDirection` (sync.ts) and `handleUserPush` (user.ts) grew a `case "failed-nontty-conflict"`
          arm that renders the "local save preserved; push skipped" banner plus a context-appropriate
          re-run hint and sets exitCode 1 (push attempted and rejected).
        - Tests: `push-recovery.test.ts` divergence-non-TTY case updated + second case added; `sync.test.ts`
          gained the `failed-nontty-conflict` caller test plus a new non-TTY conflict-degradation describe
          block (diverged, remote-ahead+disk-different, save-failure paths); `user-handlers.test.ts`
          converted `isNonInteractiveEnvironment` to a mockable toggle and added the discriminant test.
        - Implementation batched rather than strict test-first: the `PushResult` discriminant change is a
          single coordinated edit across type + impl + two callers, and the non-TTY `handleConflict` path
          mirrors an existing save-only shape verbatim. No independent discovery value from slicing.

    - [x] **3.R.i.b Push-recovery merge redesign**

        **Outcome:** Replaced the silent-discard "Pull first (overwrite local with remote)" recovery option
        with a merge flow (`pushWithInteractiveRecovery`): force-fetch aligns the local notes ref with
        remote, `runUserSave` writes the current disk state on top of the new base, then the aligned
        state is pushed. Select label now reads `"Merge: rebase my save onto remote, then push"`.

        **Surface changes:**
        - `PushResult` discriminant: `via: "merge"` replaces `via: "pull-then-push"` entirely.
        - `pushWithInteractiveRecovery` now requires `cwd: string` as a third arg so the re-save can
          locate the user directory. Both callers (`handlePushDirection` in sync.ts,
          `handleUserPush` in user.ts) updated.
        - Recovery errors (including `UserSaveError` during re-save) flow through the existing outer
          try/catch → `{ kind: "failed", error }`. No partial push on save failure — the final push
          only runs if save succeeded.

        **Test-first execution:**
        - Added failing tests first for both the happy path (fetch→save→push ordering, returns
          `via: "merge"`) and the save-failure path (no second push call, `UserSaveError` surfaces
          as `{ kind: "failed", error }`). Verified they failed against the current code.
        - Implementation change made both green; replaced the parallel `pulls-then-pushes` test in
          `user-handlers.test.ts` with the new merge expectation (adding `mockRunUserSave` tracking).
          Updated `sync.test.ts` push-recovery mock to a 3-arg signature.

    - [x] **3.R.i.c Confirmation defaults + `--yes` flag**
        - `handlePullDirection` (sync.ts) now runs the overwrite confirm when `hasLocalNotes` is true,
          matching `arc user pull` behaviour. The conflict-select pull path passes `yes: true` through a
          shared `DirectionParams` type so the user isn't double-confirmed.
        - Added `-y, --yes` to `arc sync`, `arc user pull`, `arc user fetch`, `arc user load` in cli.ts.
          Handler option types extended: `SyncOptions`, `UserPullOptions`, `UserFetchOptions`,
          `UserLoadOptions`. `handleUserLoad` accepts `yes` preemptively (no confirm exists there yet —
          `runUserLoad` creates a timestamped backup; the flag is wired for future consistency).
        - Standard prompt copy: `"Local notes will be overwritten by remote. Continue?"` — hoisted to a
          module-level `OVERWRITE_CONFIRM_MESSAGE` constant in both sync.ts and user.ts.
        - Non-TTY implicitly skips the overwrite confirm via a shared `shouldSkipOverwriteConfirm` helper
          in user.ts and an inline guard in sync.ts's `handlePullDirection`. Loud failures from 3.R.i.a
          (push-recovery non-TTY, conflict non-TTY) are unaffected — those run before this confirm.
        - Tests added: confirm-present, confirm-declined (cancel), `--yes` bypass, non-TTY bypass — for
          `handleSync` pull direction, `handleUserFetch`, `handleUserPull`. Also: "skips overwrite
          confirm after conflict pull resolution (already acknowledged)" regression case.

    - [x] **3.R.i.d Ancestor-walk cap + diagnostic**

        **Outcome:** Replaced the uncapped rev-list walk with a bounded default (`DEFAULT_MAX_ANCESTOR_WALK = 1000`,
        exported from `save-load.ts`) and an explicit `--max-walk <n>` override on `arc user load`,
        `arc user pull`, and `arc sync`. Cap-hit without finding a note surfaces via the new
        `onWalkExhausted(walked, maxWalk)` callback and renders the spec message verbatim.

        **Surface changes:**
        - `findNearestUserNote` now returns a structured `NearestNoteSearch`
          (`{ note, walked, maxWalk, capped }`) instead of `NearestUserNote | null`. Internal callers in
          `sync-status.ts` (`runUserStatus`, `inspectDiskVsLocalSnapshot`) updated to destructure `.note`.
        - `UserLoadOptions` / `UserPullOptions` gained optional `onWalkExhausted` callback. `runUserLoad`
          fires it when `capped && note === null`. `runUserPull` forwards it through to `runUserLoad`.
        - `buildLoadSummary` replaces the prior
          `"Note: loaded from a reachable ancestor N commit(s) behind HEAD."` line with
          `"Loaded from N commit(s) back."` — emitted only when `ancestorDistance > 0`.
        - Handlers (`handleUserLoad`, `handleUserPull`, `handlePullDirection` in sync.ts) render the
          canonical diagnostic
          `"walked N ancestors without finding a note; use --max-walk to search deeper or confirm remote
          state with arc user status"` when the callback fires and result is null. `handleUserPull` and
          `handlePullDirection` set `process.exitCode = 1`; `handleUserLoad` warns without exit code (its
          existing "no note" path already didn't set one).
        - CLI flags added with `parseInt` coercion on `arc user load`, `arc user pull`, `arc sync`.

        **Test-first execution:**
        - New `__tests__/unit/save-load.test.ts` (8 tests) covers `findNearestUserNote` cap application,
          overrides smaller/larger than default, capped-true accounting, and `runUserLoad`'s
          `onWalkExhausted` callback firing. All failed before implementation, pass after.
        - New `__tests__/unit/user-format.test.ts` (3 tests) covers the `"Loaded from N commits back"`
          phrasing + absence-when-zero + removal of the legacy "reachable ancestor" phrasing.
        - `__tests__/unit/user-status.test.ts` buildLoadSummary assertion updated to the new phrasing.
        - `__tests__/unit/user-handlers.test.ts` / `sync.test.ts` extended with `--max-walk` threading and
          walk-exhausted diagnostic tests (handler-level).
        - `mockHasLocalNotes` persistence across tests fixed by adding
          `mockHasLocalNotes.mockResolvedValue(false)` to the sync `handleSync direction handling` beforeEach —
          `vi.clearAllMocks()` clears history but not `.mockResolvedValue` implementations.
        - Implementation note: `let walkExhausted` pattern triggered
          `@typescript-eslint/no-unnecessary-condition` because TS doesn't see callback-side mutation.
          Refactored to `const walkState: { capture: … | null } = { capture: null }` in all three handler
          sites — the object wrapper keeps narrowing intact while allowing the callback to mutate.

        **Follow-up (post-review):**
        - `handleUserLoad` now sets `process.exitCode = 1` on walk-exhausted to match `handleUserPull` and
          `handlePullDirection`. Rationale: walk-exhausted is ambiguous ("we can't confirm there's no note
          deeper than the cap") and deserves the same failure signal across all three commands. Plain
          "no note found" stays at exit 0 — unambiguous state, nothing to load. One-line change + test
          update. Identified during post-implementation design review.

- [x] **3.R.j Vocabulary + reporting**

    **Goal:** CLI output matches user mental models without requiring code-level translation. Single canonical
    terms across layers. Reporting surfaces enough context that a cold-open user doesn't have to guess.

    - [x] **3.R.j.a Status vocabulary rename + detail enrichment**

        **Outcome:** `disk ahead` renamed to `local unsaved` across `UserStatusHeadline` union, the
        `determineUserStatusHeadline` / `determineUserStatusAction` branches, and all consuming
        tests. Cold-open audit of the other headlines (`in sync`, `remote ahead`, `conflict`,
        `remote unavailable`) — all pass; no further renames. Canonical vocabulary documented as a
        JSDoc block on `UserStatusHeadline` in `types.ts`.

        **Surface changes:**
        - `UserStatusResult` gained `ancestorDistance: number`, `savedAtRelative: string | null`,
          and `unsavedDirection: UserUnsavedDirection | null`. New `UserUnsavedDirection` union
          (`"edits" | "missing" | "mixed"`) added to `types.ts` with JSDoc distinguishing each case.
        - `BuildUserStatusInput` accepts the three new fields as optional; callers keep working
          unchanged. `runUserStatus` populates all three.
        - `buildUserStatusResult` renders three new detail lines when data is present:
            - Direction hint (only when headline is `local unsaved`):
              `"Disk has unsaved edits not yet in the saved note."` /
              `"Disk is missing updates from the saved note."` /
              `"Disk has unsaved edits and is missing updates from the saved note."`
            - Save timestamp: `"Saved 11 hours ago."`
            - Ancestor distance (distance > 0): replaces the prior
              `"Saved snapshot is from abc1234, not current HEAD."` with
              `"Saved snapshot is from abc1234, N commit(s) back."`
        - New `commands/user/relative-time.ts` exporting `formatRelativeTime(past, now?)` — buckets
          seconds → minutes → hours → days with singular/plural handling and future-date clamping.
          `runUserStatus` calls `git show -s --format=%at <commit>` via `io.exec` when a note exists
          and passes the formatted relative string through to `buildUserStatusResult`.
        - `inspectDiskVsLocalSnapshot` refactored from returning `UserSyncDiskState` to a
          `DiskVsSnapshotInspection { state, direction }`. `inspectUserSyncState` destructures
          `.state` to preserve its public contract. New `computeUnsavedDirection` helper
          (exported via `user.ts` barrel for testability) compares manifest file-key sets plus
          content diffs to pick the direction.

        **Test coverage added:**
        - `__tests__/unit/user-status.test.ts`: 4 new `buildUserStatusResult` tests (direction hint
          rendering for each case + suppression when headline is not `local unsaved`), 2 save-timestamp
          tests (present/absent), 1 ancestor-distance-at-HEAD suppression test, 4 `computeUnsavedDirection`
          tests (edits / edits via modified content / missing / mixed). Updated the pre-existing
          3.R.b "disk-ahead" assertions to the new `local unsaved` + `"N commit(s) back"` phrasing.
        - `__tests__/unit/relative-time.test.ts` (new, 5 tests): bucket boundaries, singular/plural,
          future-date clamping.
        - `__tests__/integration/user.test.ts`: existing local-unsaved test extended to assert
          `unsavedDirection === "edits"` + direction-hint line + regex-matched `savedAtRelative`
          (shape, not literal). Integration summary tests updated for the renamed headline.

        **Quality gates:** 772 unit+integration tests green; 45 E2E green; `typecheck`,
        `typecheck:test`, `lint:ts`, and `lint:sh` all pass. Live `npx arc user status`
        confirms rendering end-to-end.

    - [x] **3.R.j.b `conflict` vs `divergence` canonical language**

        **Outcome:** Canonicalized `conflict` as the user-facing term for "refs both moved from common
        ancestor." Added presentation-mapping JSDoc to `UserSyncRefState` in
        `commands/user/types.ts` flagging the `diverged` variant as code-level-only and pointing at
        `UserStatusHeadline` for canonical vocabulary. Swept user-facing strings:
        `pushWithInteractiveRecovery`'s "Push rejected — remote has diverged from local notes."
        → "Push rejected — local and remote notes conflict (both moved since common ancestor)."; same
        phrasing adopted in `handleConflict` (`sync.ts:115`) and in the session-init conflict detail
        (`sync-status.ts:236`). `cli.ts --force` help text and the two JSDoc siblings on
        `UserPushOptions.force` / `UserFetchOptions.force` updated to "conflict" wording. Module-level
        and function-level JSDoc in `push-recovery.ts` and `sync.ts` updated ("divergence" →
        "conflict", "Non-divergence" → "Non-conflict"). Internal helper `isDivergentPushError` retained
        — names the git-level topology, matches `UserSyncRefState.diverged` kept-for-code-clarity
        principle. Disk-vs-note vocabulary in `UserUnsavedDirection` JSDoc moved off the overloaded
        "divergence" term to "mismatch" (different semantic domain from ref-conflict). Tests updated:
        `sync.test.ts` literal string assertion + `user-handlers.test.ts` substring from
        "remote has diverged" → "notes conflict". Doc touch: `session-handoff.md § Save to Git Notes`
        error-handling bullet rewritten with conflict vocabulary, and folded in the stale
        "pull-first" option reference (no such option exists in current `pushWithInteractiveRecovery`
        — replaced with "merge (fetch remote, re-save local state on top, then push)"). Two-copy
        sync applied (`.arc/` + `packages/arc-framework/arc/` template).

        **Quality gates:** lint:ts, typecheck, `lint:md:file` on both session-handoff copies,
        targeted unit tests (`sync`, `user-handlers`, `user-status`, `push-recovery`) all green —
        77 tests pass.

    - [x] **3.R.j.c Label + spinner + summary consistency**

        **Outcome:** Unified the `arc sync` pull direction (`handlePullDirection`) and `arc user
        pull` (`handleUserPull`) result-box label from "Loaded" → "Pulled" so spinner ("Pulling")
        → stop ("Pull complete.") → note ("Pulled") read as one verb. `arc user load` keeps
        "Loaded" (matches its own outer command). Verb-tense audit across `p.log` / `p.spinner` /
        `p.note` calls in `sync.ts`, `user.ts`, and `push-recovery.ts` found all other labels
        already consistent — no further renames. Convention documented in the `runWithSpinner`
        JSDoc in `handlers/shared.ts` (first use of the spinner helper): present-continuous for
        in-progress label, completed-adjective for done label, past-tense for `p.note` matching
        the outer command verb. Split `determineUserStatusAction` to branch on `diskState` for
        the `local unsaved` headline: `diskState === "different"` → "run `arc user save`";
        `diskState === "same"` (implies `refState === "local-ahead"` per the headline
        derivation) → "run `arc user push` (or `arc sync`)". Inline comment records the
        invariant. Kept `refState` out of the signature — diskState alone is sufficient given
        the `determineUserStatusHeadline` logic; adding the param just to document intent would
        invite drift. Two new `buildUserStatusResult` unit tests assert the exact hint for each
        sub-case. Doc touch in `session-handoff.md § Save to Git Notes`: new paragraph directing
        the agent to check `arc sync` exit code and report the outcome in the end-of-session
        summary, closing the "work didn't land but user thought it did" gap flagged in review.
        Two-copy sync applied across `.arc/` + `packages/arc-framework/arc/` template.

        **Quality gates:** lint:ts, typecheck, typecheck:test, `lint:md:file` on session-handoff,
        full unit+integration (774 tests green; +2 new) and E2E (45 green).

- [x] **3.R.k Command surface cleanup + probe-pattern extension**

    **Goal:** Non-destructive CLI probes returning structured state for session-init's harness layer to consume.
    Three individual probes (extensions, active, config) plus a composite `arc status` that orchestrates them
    alongside the retrofitted `arc user status`. Session-init calls the composite once instead of four separate
    probes. Individual probes remain available standalone.

    **Design decisions (resolved pre-implementation):**

    - **Wire format is hybrid.** `--session-init` is a scope flag (session-init-filtered state); `--json` is a
      format flag (machine-parseable output). Orthogonal and composable. Default (no-flag) = human-readable
      Clack. `arc user status --session-init` is retrofit to accept `--json` in the same pass for uniformity —
      no asymmetric first-mover on the wire contract.
    - **Composite lives at `arc status`.** The `arc status` → `arc health` rename (3.R.k.a) frees the
      `arc status` name. The freed slot hosts a composite that invokes the four probe helpers (user,
      extensions, active, config) via `Promise.all` and emits a unified result. Session-init calls
      `arc status --session-init --json` once; agent parses one output. Standalone individuals remain for
      debugging, CI, and future consumers.
    - **No methods probe.** Session-init does not inspect method override state at init time — methods load
      at workflow trigger, not at init. Dropped from the original 3.R.k scope.
    - **Shared lib for extensions scan.** `lib/extensions/{point-scanner,orphan-detector}.ts` serves both the
      extensions probe's `--all` mode and Task 4.6 (D7b pre-commit hook). Shipped here; 4.6 consumes.
    - **arc-config probe added mid-WU.** `arc-config.yml` is ~170 lines but ~85% inline comments (documentation
      for human editors); the agent consumes key-value pairs only. Probe (`arc config status`, 3.R.k.c) emits
      typed settings as JSON — full scope returns all agent-consumable settings, `--session-init` narrows to
      init-gating fields. Replaces Batch 1's whole-file read. `hooks.*` excluded entirely — shell-consumed by
      git hooks, never read by the agent.
    - **Session-init ordering review (3.R.k.g) runs last.** Current Step 1.5 ("Sync Remote State") precedes
      Step 2 but references "After Batch 1 resolves `{identity}`" — Batch 1 fires inside Step 2. The reorder
      depends on all probes + composite integration landing first so it restructures against final command
      surface, not intermediate states.
    - **`arc active` naming holds.** `.arc/active/` houses WUs as bundles of co-named files (prd/notes/atomic/
      tasks/status). `arc active status` = "for each in-flight WU, show its state marker" — parallels
      `arc user status` (sync state of the user bundle). Directory and command agree on scope.
    - **Rename hosted here, not in ARCd Rebrand WU.** The rename's motivation is `/arc-status` skill collision
      plus semantic hygiene (status-command should mean work state, not install health). Both themes belong
      with session-init orientation work, not with the binary rebrand. Rebrand WU absorbs the follow-on
      `arc health` → `arcd health` sweep as part of its global `arc` → `arcd` binary rename — no dedicated
      rename task left in that WU for this concern. Transplanted from ARCd Rebrand Task 1.5.
    - **Forward-compat slot.** Future probes (e.g., `arc hooks status`) drop into the composite's internal
      `Promise.all` without changing session-init workflow prose or adopter-facing CLI surface.
    - **`arc version` subcommand NOT pulled forward.** That's pure rebrand-era work (idiomatic alignment with
      `arcd version`), stays in ARCd Rebrand Task 1.5.

    **Scope note:** `arc hooks status` remains out of scope for this work unit (session-init doesn't discover
    hook state at init time). Worth a future work unit if hook health surfaces as a need; its landing site is
    the composite.

    - [x] **3.R.k.a `arc status` → `arc health` rename (command surface cleanup)**

        **Goal:** Free the `arc status` name for the composite probe by renaming the existing framework-
        installation-health command. Pure rename; no behavior change to the underlying command.

        **Transplanted from:** ARCd Rebrand WU Task 1.5 (subtasks .a, .b, .c, .e, .f). Subtask 1.5.d
        (`arcd version` subcommand) stays in the rebrand WU as rebrand-era work.

        **Outcome:** Source and tests renamed via `git mv` (status.ts → health.ts; status.test.ts →
        health.test.ts; status-diff.test.ts → health-diff.test.ts; status-diff.e2e.test.ts →
        health-diff.e2e.test.ts). Identifier renames applied: `runStatus` → `runHealth`,
        `buildStatusSummary` → `buildHealthSummary`, `StatusResult` → `HealthResult`, `StatusIOContext` →
        `HealthIOContext`, `StatusOptions` → `HealthOptions`, `handleStatus` → `handleHealth`,
        `makeStatusIO` (integration test helper) → `makeHealthIO`. `FileState` / `FileStatus` preserved
        per task spec. CLI binding moved from `.command("status")` → `.command("health")`; description
        updated. `manifestMissingError("status")` → `manifestMissingError("health")` (user-facing
        `The health command requires...` error text). Doc sweep touched two files only: `init.e2e.test.ts`
        (`runArc(["status"])` → `runArc(["health"])` in manifest-missing test), `lifecycle.e2e.test.ts`
        (three golden-path invocations + related variable/comment updates), `smoke.e2e.test.ts`
        (help-output assertion), `errors.ts` JSDoc example, and
        `strategy-testing-methodology.md` (project-only file; no two-copy counterpart). QUICK-REFERENCE
        never referenced `arc status` so no change there. Tier 1 gates all green: `typecheck`,
        `typecheck:test`, `lint:ts`, `test:unit` (643 tests, 20 in the renamed `health.test.ts`), `build`.
        Cross-WU refs in `.arc/active/` notes/tasks and `.arc/backlog/` files intentionally left intact
        (they describe the rename itself or ARCd Rebrand WU coordination).

        - `git mv packages/arc-framework/src/commands/status.ts packages/arc-framework/src/commands/health.ts`
        - Apply the rename to test files: `__tests__/unit/status.test.ts` → `health.test.ts`;
          `__tests__/integration/status-diff.test.ts` → `health-diff.test.ts`;
          `__tests__/e2e/status-diff.e2e.test.ts` → `health-diff.e2e.test.ts`
        - Internal identifier renames in the renamed files: `statusCommand` → `healthCommand`,
          `StatusResult` → `HealthResult`, `StatusIOContext` → `HealthIOContext`. **Keep** `FileState` /
          `FileStatus` — those describe per-file state, not command identity
        - `src/handlers/lifecycle.ts` — rename `handleStatus` → `handleHealth`; grep for callers and update
        - `src/cli.ts` — `.command("status")` → `.command("health")`; update description
        - Sweep test imports and literal command invocations — `arc status` → `arc health` where the
          reference is specifically to the CLI command (not unrelated `status` words in file state strings
          or similar)
        - Doc sweep: `QUICK-REFERENCE.md` (two-copy), any `.arc/` doc referencing `arc status` meaning
          install health. Two-copy sync on framework-file doc edits
        - Tier 1 quality gates: `npm run typecheck`, `npm run lint:ts`, `npm run test:unit`, `npm run build`

    - [x] **3.R.k.b `arc extensions status` probe + shared lib + `arc user status --json` retrofit**

        **Goal:** Replace session-init's extensions grep with a structured probe; extract the extension-point
        scan into a shared lib that Task 4.6 (D7b hook) also consumes; establish the `--json` contract
        across all session-init probes by retrofitting `arc user status`.

        **Outcome:** Shared lib lives at `src/lib/extensions/{point-scanner,orphan-detector}.ts`.
        The scanner recognizes the single anchor form (middle-dot + backtick-delimited hashtag
        marker) serving both header-suffix and inline-bullet forms — no separate patterns needed
        since the anchor uniquely disambiguates extension-point markers from other inline-code
        mentions. The detector returns resolved and orphan buckets at reference-level granularity,
        preserving input order within each. Command module landed at `src/commands/extensions/`
        with `types.ts` / `status.ts` / `format.ts`; handler at `src/handlers/extensions.ts`; CLI
        wiring in `src/cli.ts`. Flag matrix: default Clack renders counts plus active/inactive
        lists plus orphan count; `--all` adds orphan detail entries; `--session-init` narrows to
        the active-list and skips the workflow walk; `--json` emits typed results via
        discriminated union on the `mode` field. The user-status retrofit adds a `--json` flag
        that suppresses Clack intro/outro/note and writes JSON to stdout; works across all three
        existing scopes (default, `--offline`, `--session-init`). Probe uses `fs/promises`
        directly — no IO injection, since scanners/formatter are pure and unit-tested and the fs
        side is covered by integration. Malformed extension frontmatter surfaces a warning and
        still resolves refs by basename so parse errors don't cascade into orphan noise.
        End-to-end sanity check against the repo: the session-init probe emits
        `{"active":["pre-merge-review"]}` (matches the current grep output); the `--all` probe
        surfaces one pre-existing orphan (`pre-merge-inbox-review` at
        `integrate-work-unit.md:166`) — a content issue for Phase 3 sweep, not this task.

        **Tier 1 green:** `typecheck` / `typecheck:test` / `lint:ts` / `test:unit` (674, +31 new:
        8 `point-scanner` + 6 `orphan-detector` + 14 `extensions-format` + 3 `user-handlers` json
        retrofit) / `build`. Integration suite adds 10 new tests under
        `__tests__/integration/extensions.test.ts` against synthetic fixture trees
        (active/inactive, orphans, malformed frontmatter, nested workflows, session-init fast path).

        - `point-scanner` extracts `{ workflowPath, lineNumber, extensionName }` — single anchor
          pattern (`· \`#<kebab-name>\``) serves both header-suffix and inline-bullet forms
        - `point-scanner` accepts an explicit workflow file list (caller filters — probe scans all,
          hook will scan staged)
        - `orphan-detector` classifies refs against the extensions directory listing, returns
          `{ orphans, resolved }` at reference-level granularity
        - `arc extensions status` (no flag) renders active/inactive counts + orphan count in Clack
        - `arc extensions status --session-init` returns only the active extensions list (structural
          replacement for `grep -l "^active: true" .arc/system/extensions/*.md`)
        - `arc extensions status --all` includes orphaned extension-point references
        - `arc extensions status --json` emits typed `ExtensionsStatusResult` (shape in
          `commands/extensions/types.ts`)
        - `--session-init --json` and `--all --json` combinations both valid
        - `arc user status --json` emits typed `UserStatusResult` as JSON, bypassing Clack
        - `arc user status --session-init --json` emits typed `UserSessionInitStatusResult` as JSON

        **Layout delivered:**
        - Shared lib in `packages/arc-framework/src/lib/extensions/{point-scanner.ts,orphan-detector.ts}`
        - Command module in `packages/arc-framework/src/commands/extensions/` + facade
          `src/commands/extensions.ts` (matching `commands/user.ts` pattern)
        - Handler at `src/handlers/extensions.ts`; CLI wiring in `src/cli.ts`
        - `--json` flag added to `arc user status` in `src/cli.ts`; `handleUserStatus` branches on
          the flag to emit JSON and suppress Clack ceremony

    - [x] **3.R.k.c `arc config status` probe**

        **Outcome:** `arc config status` probe delivered at `src/commands/config/` with shared reader at
        `src/lib/config/status-reader.ts`. Handler at `src/handlers/config.ts`; CLI wired as
        `arc config status [--session-init] [--json]`. Full mode emits 13 agent-consumable settings
        (everything except `hooks.*`, which is shell-only). `--session-init` narrows to the 5-key
        init-gating subset: `session.remote_sync`, `branch.protection`, `pm.mode`, `commit.format`,
        `commit.context_footer`. Both scopes expose `defaultsApplied` (keys where the on-disk value was
        absent and a documented default was substituted) and `errors` (file-access diagnostics).

        **Reader:** `readConfigSettings(cwd)` generalizes the narrow readers in `handlers/shared.ts`
        (`readPmMode`, `readSessionRemoteSyncEnabled`) into a single settings-map read with defaults
        applied. Depends on `parseArcConfig` from `lib/config/index.ts`. `AGENT_CONSUMABLE_KEYS` is the
        exported list of 13 keys excluding `hooks.*`.

        **Layout delivered:**
        - `src/lib/config.ts` → `src/lib/config/index.ts` (migration; 8 import-path updates, pure rename)
        - `src/lib/config/status-reader.ts` (new — `readConfigSettings` + `AGENT_CONSUMABLE_KEYS`)
        - `src/commands/config/{types,status,format}.ts` (new — types, probe runners, Clack formatters)
        - `src/commands/config.ts` facade (new — re-exports)
        - `src/handlers/config.ts` (new)
        - `src/cli.ts` — new `arc config status` command wired

        **Tier 1 green:** typecheck / typecheck:test / lint:ts / test:unit (694 tests, +20 new: 8 reader,
        12 format) / build. Integration suite adds 6 new tests under `__tests__/integration/config.test.ts`.

        **Deferred to 3.R.l.b:** `readPmMode` / `readSessionRemoteSyncEnabled` stay in `handlers/shared.ts`
        for now — still consumed by `handlers/user.ts` (×2) and `handlers/join.ts`. 3.R.l.b updated
        mid-implementation to retire both narrow readers in favor of `readConfigSettings` (supersedes
        the earlier "relocate to `lib/config-readers.ts`" plan — relocation is moot once the
        generalized reader already lives in `lib/config/`). No call-site churn added to this task's
        scope; retirement + migration lands with 3.R.l.b.

        **End-to-end sanity:** `npx arc config status --session-init --json` against this repo returns
        the 5-key init-gating subset with zero defaults applied. `npx arc config status --json` returns
        all 13 keys; `commit.custom_pattern` and `commit.context_pattern` correctly flagged as defaulted
        (empty-value fall-through per parseArcConfig's shell-aligned behavior).

    - [x] **3.R.k.d `arc active status` probe**

        **Goal:** Structured enumeration of in-flight work units — full state per WU for general consumers,
        session-init-scoped resolution for the harness.

        **Reader:** `readActiveStatusCandidates(cwd)` at `src/lib/active/status-reader.ts` scans `.arc/active/`,
        detects layout (Lite when `.arc/active/status.md` exists; Full otherwise, enumerating
        `.arc/active/*/status-*.md`), and parses Branch / State / Next Task / Task List per candidate.
        Exported `parseStatusFile(content)` returns `{ branch, state, nextTask, taskList }` nullable —
        tolerant of list-bullet and bare `**Field:** value` forms, blockquote prefixes, and inline
        backticks; takes the first match on repeats; returns `null` for absent or empty values.

        **Probe runners:** `runActiveStatus` (full enumeration) and `runActiveSessionInitStatus`
        (session-init resolution shaping) at `src/commands/active/status.ts`. Session-init applies a thin
        none/single/multiple discriminant over the raw candidate list — zero-file → `{ resolution: "none",
        path: null }`, one-file → `{ resolution: "single", path }`, many-file → `{ resolution: "multiple",
        candidates: [...] }`. The probe does not apply Step 2 Item 8's SESSION-NOTES/branch/state precedence —
        SESSION-NOTES lives in the identity-scoped user workspace and remains an agent-side concern.

        **Layout delivered:**
        - `src/lib/active/status-reader.ts` (new — reader + parser + `ReaderResult` / `ParsedStatusFields`)
        - `src/commands/active/{types,status,format}.ts` (new — types, probe runners, Clack formatters)
        - `src/commands/active.ts` facade (new — re-exports)
        - `src/handlers/active.ts` (new)
        - `src/cli.ts` — new `arc active status` command wired (alongside `arc active` parent group)

        **Types:** `ActiveStatusResult` (full) and `ActiveSessionInitResult` (session-init) form a
        discriminated union on `mode`; `ActiveSessionInitResolution` is `"none" | "single" | "multiple"`.
        `StatusFileCandidate` carries `{ path, filename, branch, state, nextTask, taskList }` with paths
        normalized to forward-slash form relative to cwd.

        **Tier 1 green:** typecheck / typecheck:test / lint:ts / test:unit (725, +31: 16 reader + 15 format)
        / build. Integration suite adds 9 new tests under `__tests__/integration/active.test.ts` (zero-file,
        one-file with full field population, many-file across categories, Lite-layout detection, and the
        three session-init resolution states plus missing-directory warning propagation).

        **Batching rationale:** Reader/parser/formatter tests were batched per the test-first method's
        batching-judgment clause — behaviors are tightly coupled to a single regex-driven parser and a
        single layout detector; one-at-a-time slicing had no independent discovery value.

        **End-to-end sanity:** `npx arc active status --session-init --json` returns
        `{mode:"session-init",layout:"full",resolution:"single",path:".arc/active/technical/status-session-init-optimization.md",…}`;
        `npx arc active status --json` returns the full candidate with `branch`, `state`, `nextTask`,
        `taskList` parsed cleanly (inline backticks stripped from `Task 3.R.k.d — arc active status probe`
        and from the task-list path).

    - [x] **3.R.k.e Composite `arc status` command**

        **Orchestrator:** `runStatus` / `runSessionInitStatus` at `src/commands/status/run.ts` fan out via
        `Promise.all` over four injected probe slots (`user`, `extensions`, `config`, `active`), wrapping
        each probe's resolution or rejection into a typed `Probe<T>` union (`{ ok: true; value } | { ok:
        false; error: { kind: "identity-missing" | "runtime"; message } }`). Rejections never bubble —
        the composite always resolves with a typed envelope and `process.exit` stays untouched. User-slot
        short-circuit: when `identity === null`, the slot resolves synchronously to `identity-missing`
        without invoking the user probe (user notes are identity-scoped; per session-init.md Step 1.5).

        **Types:** `src/commands/status/types.ts` — `StatusResult` (full) and `SessionInitProbeResult`
        (scoped) discriminated on `mode`, with per-slot `Probe<T>` wrapper. `StatusProbes` /
        `SessionInitProbes` interfaces bind cwd and I/O at construction so the orchestrator sees simple
        `() => Promise<T>` functions — enables trivial test mocking without `vi.mock`. Top-level
        `identity: { identity: string | null; role: string | null }` resolves in the handler via two
        parallel `git config --get` reads through `gitConfigGet`; empty/whitespace normalize to `null`
        via the exported `normalizeGitConfigValue` helper.

        **Format:** `src/commands/status/format.ts` — `buildStatusSummary` /
        `buildSessionInitStatusSummary` render five stably-ordered sections (Identity, User, Extensions,
        Config, Active). Each slot delegates to the probe's own `build*Summary` formatter on ok;
        errored slots render `(unavailable) <message>` so one probe's failure doesn't obscure the
        others. Session-init variant delegates to the `*SessionInitSummary` formatters.

        **Handler:** `src/handlers/status.ts` — constructs the real probe bundle from
        `createUserIOContext()` + per-probe imports, reads identity/role via parallel `gitConfigGet`
        calls, and branches on `opts.sessionInit` / `opts.json`. `--json` writes the typed envelope via
        `process.stdout.write` with a trailing newline; default mode renders Clack `intro` / `note` /
        `outro`.

        **CLI:** `src/cli.ts` — `arc status` registered after `arc active status` with `--session-init`
        and `--json` flags (matches the individual probe commands' surface).

        **Layout delivered:**
        - `src/commands/status/{types,run,format}.ts` (new)
        - `src/commands/status.ts` facade (new — re-exports)
        - `src/handlers/status.ts` (new)
        - `src/cli.ts` — composite `arc status` command wired

        **Tier 1 green:** typecheck / typecheck:test / lint:ts / lint:sh / test:unit (757, +32: 19
        orchestrator + 5 normalizer + 8 format) / build. Integration suite adds 4 new tests under
        `__tests__/integration/status.test.ts` (clean state, multi-WU session-init resolution, mixed
        partial-failure, identity-missing short-circuit).

        **End-to-end sanity:** `npx arc status --session-init --json` on this repo returns
        `{mode:"session-init",identity:{identity:"andrew",role:"maintainer"},user:{ok:true,…},…}` with
        all four slots `ok:true` and active `resolution:"single"` pointing at the current WU's status
        file. Default-mode `npx arc status` renders the five Clack sections in stable order with the
        identity pointers + full probe summaries.

        **Batching rationale:** Orchestrator / format / handler-normalizer tests batched per the
        test-first method's batching-judgment clause — behaviors are tightly coupled to a single
        orchestrator function and share mock-probe setup; one-at-a-time slicing had no independent
        discovery value.

    - [x] **3.R.k.f Session-init workflow integration + strategy pointer**

        **Completed in tandem with 3.R.k.g** — both edit the same workflow; `.f` content change without
        `.g`'s ordering pass leaves Step 1.5's "After Batch 1" prose more broken, not less. Combining
        avoided an incoherent intermediate commit state.

        **Outcome:** Session-init calls one composite (`arc status --session-init --json`) instead of
        orchestrating four probes. Probe table in Step 2 documents the five-slot envelope
        (`identity` / `user` / `extensions` / `config` / `active`). Item 8 many-file disambiguation now
        sources candidates from `active.value.candidates`; single / none resolve from the same composite
        response. Direct `arc-config.yml` read retired — `config.value.settings` exposes the session-relevant
        whitelist (`session.remote_sync`, `branch.protection`, `pm.mode`, `commit.format`,
        `commit.context_footer`); `platform.type` and custom commit patterns drop out of init and surface at
        the workflow that consumes them. Probe-failure fallback added (not in original scope — keeps
        session-init survivable on a fresh clone pre-build). `strategy-session-operations.md § Context
        Loading Model` picks up a new **Probe pattern** subsection (non-destructive, harness-first,
        composite-first, `Promise.all` fan-out, standalone individuals for debug/CI, future-composite
        extension slot); § Method and Extension Loading § Session-Init Consumption aligned to "session-init
        consumes from the composite" framing.

        **Files:** `session-init.template.md` (package source, preserving `{{REPO_ROOT}}` +
        `team.mode` / `pm.mode` conditionals); `session-init.md` (rendered for `pm.mode: arc-in-git`,
        `team.mode: false`); `strategy-session-operations.md` (both copies, identical).

    - [x] **3.R.k.g Session-init ordering review + workflow reorder**

        **Completed in tandem with 3.R.k.f.** See `.f` for combining rationale.

        **Outcome — linear 8-step ordering delivered:** 1. Verify Environment · 2. Probe ARC Domain · 3.
        Conditional Sync Pull · 4. Load Context Documents · 5. Post-Context-Load Extensions · 6. Assess
        Readiness · 7. Confirm Orientation · 8. If Context Seems Mismatched. Dependencies are explicit; no
        "Step 1.5 actually fires after Batch 1" derived ordering.

        **Stale-SESSION-NOTES race closed.** Step 3 (Conditional Sync Pull) fires between the probe and
        context-doc loading — any pull happens _before_ SESSION-NOTES reads, not after as the previous
        wording allowed.

        **Design adjustments applied during implementation:**
        - Standalone "Check Active Configuration" step retired (was pre-restructure Step 4). Config
          consumption folded into Step 2 as "carry config forward as behavioral awareness"; platform /
          custom-commit paragraphs removed from init (consumed at the workflow that needs them)
        - "Batch 1 / Batch 2" naming dropped — artifact of four-probe orchestration no longer useful.
          Step 4's "Parallelism" paragraph names the parallel-load group and the status-file serialization
          explicitly

        **Post-implementation review follow-ons (same commit):**
        - Step 1 trimmed to `pwd` only. Runtime-verify comment block retired — template scaffolding that was
          never customized for this project and offered no operational value at init. Template carries a
          one-line adopter hint for where to add project-specific checks
        - Step 2 self-hosting-prefix comment retired. Template shows the plain `arc ...` command (adopters
          don't self-host); `.arc/` rendered copy shows the literal `npx arc ...` command (concrete for this
          repo). Accepted drift — no comment asking the agent to mentally transform the command
        - Broader init-time content audit (Contributor Session Path, Trust Hierarchy, Load Errors, probe
          fallback) captured as Task 5.8.d for Phase 5 scope

        **Downstream step-number references scanned:** ADR-013 and `analysis/`, `archive/`, and
        non-activated `backlog/plan-arc-modes.md` are the only hits. ADRs stable once accepted (step
        numbering is ephemeral content-reference drift, not a decision change); archive and analysis are
        historical by nature; the `plan-arc-modes.md` staleness is already flagged in SESSION-NOTES
        persistent context for Arc Modes activation. No live workflow references needed updating.

        **Tier 1 green:** markdown lint clean on all linted files (`.arc/` rendered session-init +
        strategy, both copies identical). Template copy is excluded from lint globs
        (`packages/arc-framework/arc/**`) but was run through the same table-prettifier for parity.

- [x] **3.R.l Structural cleanup + test coverage**

    **Goal:** Close review-surfaced code quality items; close the integration coverage gap that let
    push-recovery's silent-discard slip past unit tests.

    - [x] **3.R.l.a `findNearestUserNote` cleanup**
        - Extracted the rev-list ancestor scan into `walkAncestorsForNote`, leaving `findNearestUserNote`
          responsible for note discovery orchestration and cap/result shaping.
        - Removed the dead branch in the walk loop (`if (commit && ...)`) while preserving the existing
          walk-count semantics for found vs. exhausted searches.
        - The duplicate null-return cleanup noted in planning had already landed before execution; no
          equivalent branch remained in `save-load.ts` to simplify further.
        - Pure cleanup only; targeted unit suite stays green (`npm run test:unit -- save-load.test.ts`).

    - [x] **3.R.l.b Module relocation + narrow-reader retirement**
        - Moved `runUserPush`, `hasRemoteNotes`, `hasLocalNotes`, `runUserFetch`, and `runUserPull` into new
          `commands/user/push-fetch.ts`; `sync-status.ts` now keeps only sync inspection/status shaping.
        - Updated the `commands/user.ts` facade to re-export the moved primitives from the new module, so the
          public command surface stays unchanged for handlers and tests.
        - Retired `readPmMode` and `readSessionRemoteSyncEnabled` from `handlers/shared.ts`. `handlers/user.ts`,
          `handlers/join.ts`, and the still-live `handlers/status.ts` session-init path now read
          `readConfigSettings()` and derive `pm.mode` / `session.remote_sync` from the returned settings map.
        - Updated `__tests__/unit/user-handlers.test.ts` to mock `readConfigSettings` directly instead of the
          bespoke shared readers; focused handler/config tests stay green under direct Vitest invocation.

    - [x] **3.R.l.c Integration test for `arc sync` → conflict → merge recovery**
        - Added a real git-notes integration case in `__tests__/integration/user.test.ts` that drives the merge
          recovery path end-to-end via `pushWithInteractiveRecovery(..., "merge")`: local save/push → clone
          force-push diverged remote notes → local save diverges → ordinary push rejects → merge recovery
          force-fetches remote, re-saves local disk state on top, and pushes the combined ref.
        - Assertions cover the bug’s failure mode directly: local disk still contains the user's latest notes,
          the recovered local notes ref is a descendant of the pre-recovery remote base, and the remote ref
          equals the recovered local ref after push. A follow-up force-pull/load in the clone confirms the
          recovered content is now portable.
        - Integration work also surfaced a real regression from 3.R.l.b: `sync-status.ts` still referenced
          `notesRef` in detailed ref inspection after the module split. Restored the import so user-status and
          session-init remote probes keep working under integration coverage.

    - [x] **3.R.l.d Refactor `runUserLoad` walk-exhausted surface from callback to discriminated union**

        `UserLoadOptions` / `UserPullOptions` no longer expose `onWalkExhausted`; the command layer now exports
        `UserLoadOutcome = UserLoadResult | UserLoadWalkExhausted`, with `UserLoadResult.kind = "loaded"` and
        `{ kind: "walk-exhausted", walked, maxWalk }` returned when ancestor walking hits the cap. `runUserLoad`,
        `runUserPull`, `handleUserLoad`, `handleUserPull`, and sync's `handlePullDirection` now branch directly on the
        discriminated outcome instead of callback-mutation side state, leaving `null` reserved for the unambiguous
        "no notes exist" case. Unit and integration tests were updated to narrow on `kind`; the shallow-clone cap-hit
        path now asserts the explicit `walk-exhausted` outcome rather than the old `null`.

    - [x] **3.R.l.e `resolveArcRoot` — cwd walk-up for CLI commands touching `.arc/`**

        Added `resolveArcRoot(startDir = process.cwd())` to `lib/paths.ts` plus a handler-level
        `requireArcProjectRoot` guard that emits the canonical
        `"Not inside an ARC project (no .arc/ directory found walking up from cwd)."` error when
        no `.arc/` directory is reachable. Wired the resolved root through every current handler
        that reads or writes project `.arc/` state: user add/save/load/pull/status/push-recovery,
        sync, status/active/config/extensions status, update/health/diff, join, and
        `arc init --reconfigure`. Fresh `arc init` still uses the literal cwd by design.

        Added unit coverage for `resolveArcRoot` (cwd hit, one/two-level walk-up, null, root
        boundary, explicit `startDir`) and an e2e regression test that confirms
        `arc user status --offline --json` from a nested subdirectory matches the repo-root result.

    - [x] **3.R.l.f Sandbox-aware remote-probe degradation + session-init recovery path**

        **Outcome:** `inspectUserSyncRefsDetailed` now starts with `git ls-remote` and only falls back to temp-ref
        fetch + ancestry checks when both local and remote refs exist with different hashes. Easy cases (remote missing,
        remote present with same hash, remote-only ref) no longer need fetch/write access. When the ancestry fallback is
        blocked after remote visibility succeeds, the probe keeps the existing `remote-unavailable` state to avoid
        widening the type surface, but session-init messaging now distinguishes "remote unreachable" from
        "comparison blocked in this environment" and offers a local-continuation vs retry path. Unit coverage added for
        the read-only happy path and the fetch-blocked fallback; existing integration coverage remains sufficient for
        real git-note flows, and the sandbox-specific exec failure stays unit-only because the harness cannot model
        `.git/FETCH_HEAD`/policy denial cleanly.

        **Goal:** Make session-init robust in sandboxed environments without weakening the correctness bar for
        full remote comparisons.

        - [x] **3.R.l.f.1 Probe path split: read-only remote visibility before fetch fallback**
            - `inspectUserSyncRefsDetailed` now probes `git ls-remote origin refs/notes/...` before any fetch, resolving
              the easy cases without temp-ref bookkeeping or `.git/FETCH_HEAD` writes.
            - Temp-ref fetch + `merge-base --is-ancestor` remain only for the ambiguous both-sides-exist / hashes-differ
              case.
            - Fetch failure after successful read-only visibility stays in the pragmatic `remote-unavailable` bucket; the
              extra precision was not worth a public state expansion.

        - [x] **3.R.l.f.2 Session-init workflow recovery branch for sandbox-limited environments**
            - Updated both session-init workflow copies so `remote-unavailable` explicitly branches on probe wording:
              either retry once the remote is reachable, or continue locally / retry in a remote-capable environment when
              fetch/write access is blocked.
            - Session-init status copy now distinguishes unreachable-remote wording from limited-comparison wording so it
              does not read like actual note divergence.

        - [x] **3.R.l.f.3 Tests and documentation**
            - Added unit coverage for the read-only remote-probe path and for the fetch-blocked
              "continue locally or retry elsewhere" session-init shaping.
            - Left the sandbox-specific exec denial case unit-only; the current integration harness exercises real git
              note flows but cannot reliably simulate network-policy / `.git/FETCH_HEAD` write denial.
            - Captured the recovery guidance in the session-init workflow itself, which is the surface that consumes the
              state during resume.

        **Risk flags:**
        - Symlinks: if the cwd is through a symlink (e.g., `~/dev -> /mnt/data/dev`), realpath
          resolution may or may not be desired. Recommend: walk the given path as-is without
          `fs.realpathSync`, matching git's default behavior. Document the choice.
        - Monorepos with nested `.arc/` (unlikely but possible): the first `.arc/` found wins.
          Acceptable since nested ARC projects are out of scope for now.

- [x] **3.R.m Second-pass close — quality gates + Phase 3.R-wide content**

    **Outcome:** Phase 3.R close is green. Full gates passed after updating three stale pre-init E2E expectations to
    match the current root-walk guard copy (`Not inside an ARC project ...`) used by update/health/join before any
    command-specific install check can run. The retired 3.R.h addendum landed in both
    `strategy-task-list-formatting.md` copies: revision numbering now documents both subtask-level `X.Y.R` and
    phase-level `X.R` follow-ons, and the old `3.1.R.1` / `3.1.R.2` examples are tightened to
    `3.1.R.a` / `3.1.R.b`.

    Local smoke ran in throwaway repos using `npx --prefix /home/andrew/dev/arc-framework arc ...` against the built
    CLI: `user add/save/load/fetch/pull/push/status/sync`, `extensions status`, `active status`, and composite
    `status --session-init --json` all exercised successfully; `user status --offline` surfaced the expected
    `local unsaved` headline plus save-timestamp and ancestor-distance lines; `user load --max-walk 1` emitted the
    cap-hit diagnostic and `--max-walk 5` loaded from two commits back. `arc methods status` is not a live CLI
    surface in `cli.ts`, so the task bullet was stale and was verified as absent rather than smoked. For merge
    recovery, a deterministic interactive divergent-notes scenario drove the shared `pushWithInteractiveRecovery`
    helper through the `merge` choice end-to-end (fetch remote, re-save local disk state on top, push combined ref);
    that is the same recovery path `arc sync` uses once it reaches the push branch, whereas reproducing the
    sync-specific race from inspection to push is not stable enough for manual smoke.

    **Atomic companion check:** confirmed `atomic-session-init-optimization.md` has no incomplete items from either
    pass.

    - [x] Full quality gate pass: `typecheck`, `typecheck:test`, `lint:ts`, `lint:sh`, `lint:md`, `build`,
      `test` (unit + integration), `test:e2e`
    - [x] Required local smoke on the full Phase 3.R command surface (both passes):
      `arc user add`, `save`, `load`, `fetch`, `pull`, `push`, `status`, `sync`,
      `arc extensions status`, `arc active status`, composite `arc status --session-init --json`
      (`arc methods status` verified stale/absent)
    - [x] Required local smoke on second-pass behavior additions: merge recovery via the shared
      `pushWithInteractiveRecovery(..., "merge")` path used by `arc sync` push handling,
      `arc user load --max-walk` cap-hit diagnostic, and status output carrying `local unsaved`,
      ancestor-distance, and save-timestamp detail lines
    - [x] Strategy addendum (moved from retired 3.R.h): revision-numbering guidance now covers
      phase-level `X.R` and uses `3.1.R.a` / `3.1.R.b` examples
    - [x] Confirm `atomic-session-init-optimization.md` has no remaining items deferred from either pass
    - [x] Update `status-session-init-optimization.md`: Last Completed = 3.R.m; Next Task = 3.R.f; Next Action =
      begin 3.R.f

    **Next action (after close):** 3.R.f → 3.R.g → Phase 3.R archive + begin Phase 4.1.

- [x] **3.R.n Post-close portability semantics refinement**

    **Origin:** Real cross-machine resume validation after the Phase 3.R close surfaced that `arc user status`
    still collapsed remote-note sync state and on-disk hydration state into a single `local unsaved` bucket.
    The resulting guidance could incorrectly point users toward `arc user save` when the correct recovery was
    `arc user load`.

    **Outcome:** `arc user status` and `arc sync` now share an explicit two-axis model:
    remote saved-note relation (`in sync`, `local ahead`, `remote ahead`, `conflict`, `remote unavailable`)
    and disk relation (`current`, `stale`, `local unsaved`, `mixed`). User-facing headlines now surface the
    dominant actionable state (`up to date`, `disk stale`, `local ahead`, etc.) with explicit `Remote:` and
    `Disk:` detail lines, and `arc sync` consumes the same model to choose among push / pull / load / push-load /
    conflict paths. This follow-up also added targeted unit + integration coverage for the stale-disk,
    local-unsaved, and shared-matrix cases, plus a rebuild/smoke pass verifying the shipped CLI output and
    `arc sync` behavior against the live repo state.

    - [x] **3.R.n.1 Shared domain model + status vocabulary split**
        - Added shared `UserRemoteStatus` / `UserDiskStatus` state in the user-sync types so status and sync derive
          behavior from the same model instead of reinterpreting `diskState` ad hoc.
        - Replaced the overloaded top-line `local unsaved` status in the stale-disk case with a dominant-state
          headline model (`disk stale`, `up to date`, `local ahead`, etc.) and explicit `Remote:` / `Disk:` detail
          lines so git-notes state and disk state are understandable without requiring prior git-notes knowledge.

    - [x] **3.R.n.2 `arc sync` porcelain alignment**
        - Reworked `arc sync` to consume the shared remote/disk model. Stale-disk cases now restore the saved note
          locally via `load`; local-note-ahead + stale-disk cases take a `push-load` path; only true unsaved local
          content defaults to save/push behavior.
        - Rebuilt the package and smoke-tested the real CLI after the change to confirm the shipped output matches
          the new semantics and that the stale-disk case resolves via `arc sync --yes`.

    - [x] **3.R.n.3 Coverage updates**
        - Expanded unit and integration coverage across `user-status`, `sync`, and composite status formatting to pin
          the new vocabulary, detail lines, and action matrix.

- [x] **3.R.o User-internal metadata layout cleanup**

    **Origin:** Follow-on from 3.R.n. The new local-only sync provenance file solved stale-vs-unsaved ambiguity, but
    together with rotating pre-load backups it increased root-level clutter under `user/{identity}/`. The usability
    issue is not behavior but signaling: user-authored working files should be visually distinct from ARC-managed local
    bookkeeping.

    **Outcome:** Local-only user metadata now writes to `user/{identity}/.internal/`, matching the framework's
    existing `system/.internal/` convention. New writes land in `.internal/`; reads remain backward-compatible with
    legacy root-level files so existing clones upgrade in place without a migration step. Status output continues to
    show backup basenames rather than leaking storage layout details.

    - [x] **3.R.o.1 Move local-only portability metadata into `.internal/`**
        - Moved the local sync provenance file and new pre-load backup writes under `user/{identity}/.internal/`.
        - Preserved the user-dir portability contract: dot-directories are already excluded from serialization, so the
          local-only files remain unsynced without additional manifest rules.

- [x] **3.R.p Git-note terminology pass for status/sync UX**

    **Origin:** After 3.R.n, the split between remote-note state and working-file state was clearer, but the new
    phrasing still mixed abstractions (`saved snapshot`, `disk stale`) that made the status read awkwardly for a
    dev-facing tool. Real usage showed that the next-step hints were correct, but the explanatory copy still fought
    the user's mental model.

    **Outcome:** `arc user status` and `arc sync` now use explicit git-note terminology in the user-facing copy while
    keeping the stronger working-file phrasing from 3.R.n. Headlines now read `git note up to date`,
    `git note out of date`, `local note ahead`, `remote note ahead`, and `notes conflict`; detail lines explicitly
    describe working files vs. the latest local git note; sync porcelain messages were aligned to the same language.
    Unit + integration coverage was updated to pin the new copy end-to-end.

    - [x] **3.R.p.1 Status wording alignment**
        - Replaced the snapshot/disk vocabulary in `arc user status` with git-note-specific headlines and detail
          lines, including `Working files have changed since the latest local git note.` and
          `Latest local git note is from <hash>, N commit(s) back.`
        - Kept remote status subordinate via `Remote notes: ...` so the actionable headline reflects the dominant
          local state without implying ordinary git working-tree semantics.

    - [x] **3.R.p.2 Porcelain wording alignment**
        - Updated `arc sync` progress/error copy to refer to local/remote git notes and working files instead of the
          older saved-note/disk phrasing.
        - Preserved the same action matrix from 3.R.n; this follow-up changes language, not sync direction semantics.

    - [x] **3.R.p.3 Coverage + live validation**
        - Updated the status-format, status-run, user-status, user-handlers, sync, and integration suites to pin the
          new git-note wording.
        - Re-ran the focused Vitest surface and checked live `npx arc user status` output against the current repo.

- [x] **3.R.q User sync provenance hardening**

    **Origin:** Pressure-testing the new status vocabulary against the live repo surfaced a remaining dead-end:
    legacy hash-only local provenance could still misclassify a newer local-only user state as stale and point the
    user to `arc user load` when the safe/correct next step was `arc user save`. The same pass also surfaced one
    last duplicated detail-line branch in the `git note out of date` renderer.

    **Outcome:** Local sync provenance now records the source commit and whether the current materialized state came
    from `save` or `load`. Status uses that richer provenance for future precise load/save guidance and degrades
    legacy hash-only provenance to an inspect-first fallback instead of making a wrong destructive recommendation.
    The `git note out of date` summary renderer was also normalized so stale, mixed, and local-unsaved branches no
    longer repeat the same sentence twice.

    - [x] **3.R.q.1 Provenance schema upgrade**
        - Upgraded `.sync-state.json` from hash-only provenance to include `sourceCommit` and `sourceOperation`
          (`save` / `load`) so status can distinguish newer local-only state from older materialized state.
        - `arc user save` and `arc user load` now both write the richer provenance format.

    - [x] **3.R.q.2 Safe fallback for legacy provenance**
        - Legacy v1 provenance now degrades ambiguous cases to `mixed` / inspect-first guidance instead of
          confidently recommending `load`.
        - This prevents status from sending users into a dead end when the tool cannot actually prove direction.

    - [x] **3.R.q.3 Coverage + renderer cleanup**
        - Added scenario coverage for: legacy ambiguous provenance, v2 save provenance, and v2 load provenance.
        - Removed the remaining duplicated `git note out of date` detail-line branch exposed by the local-unsaved
          path during live validation.

    - [x] **3.R.o.2 Backward-compatible reads + retention**
        - `readLocalSyncState` now checks `.internal/` first and falls back to the legacy root-level path.
        - Backup listing reads both `.internal/` and legacy root-level files; timestamped retention now prunes only the
          new `.internal/` location so older root files remain readable without forcing a migration.

    - [x] **3.R.o.3 Coverage + task-state updates**
        - Updated integration coverage for `.internal/` backup/provenance paths and kept the existing legacy-root backup
          case as compatibility coverage.

---

### **Phase 4:** Operational-Context Audit + Task-List-Formatting Restructure + D7b

**Purpose:** Apply the "operational context only" lens across always-loaded docs and workflows; stage extractions for
the future docs-content-sweep WU; land the D7b extension-point match hook against the existing anchor-suffix
convention. Ordering is Tier 1 → Tier 2 → Task-list-formatting restructure → Tier 3, so Tier 3 audits the
post-restructure state of `2_generate-tasks.md` and `strategy-task-list-formatting.md`.

**Heuristic reminder (apply throughout 4.2–4.5):** keep content that helps conceptual flow, is counterintuitive, or
would confuse if absent. Target ~80–90% extraction on rationale/background/overflow-example content with case-by-case
retention. Hedges with undefined state (`unless already loaded`, `if applicable`, `when relevant`) are eliminated.
Operational rationale clauses (`because ...`) are single-clause, ≤12 words, inline — anything longer extracts.

**Stopping rule:** After trim, re-read the file — remaining content should read as imperative operational guidance
with no rationale digressions. That's the signal for "enough."

**Strategy-docs exclusion:** Strategies (`reference/strategies/**/*.md`) are excluded from tiered audit — they're T3
on-demand, not session-init-loaded. `strategy-task-list-formatting.md` is trimmed in 4.4.c as part of the formatting
restructure, not as a Phase 4 audit target.

- [x] **4.1 Staging infrastructure**

    **Outcome:** `notes-docs-content-sweep.md` created at `.arc/backlog/technical/` with the locked entry
    template (Entry N heading; Source / Content / Suggested destination / Stylistic integration notes fields)
    and the source-side `[TODO-docs-site]` placeholder convention documented in the header. Convention
    decisions recorded: descriptive link text + literal `TODO-docs-site` label (no per-entry suffixes — sweep
    resolves globally); no source-side definition added (MD052 unresolved-reference is the intended signal);
    completion verified by `grep -rn "TODO-docs-site"` returning zero matches and MD052 clearing once the
    sweep WU rewrites to final docs URLs. Header also captures lifecycle (populate → source-side placeholder →
    sweep) and the rationale for splitting the convention between this file and
    `plan-docs-content-sweep.md` § Content Contributions.

- [ ] **4.2 Tier 1 audit — always-loaded docs**

    **Goal:** Operational-context audit applied to every file session-init loads unconditionally. Decomposed by file
    weight and cohesion so heavy files get dedicated focus and small files batch.

    **Protocol per subtask:** extract rationale/background/overflow examples to `notes-docs-content-sweep.md` per
    the locked template (Task 4.1); leave `[TODO-docs-site]` reference-style placeholders at extraction sites;
    two-copy sync per file.

    - [x] **4.2.a Agent briefings cluster — audited**

        **Outcome:** All four files trimmed and lint-clean. Total line count 306 → 203 (34% reduction):
        `AGENT-BRIEFING.ARC.md` 57→47 (first pass tightened How ARC Works subsections; second pass
        through strict agent-audience lens dropped invocation-syntax parenthetical, the three
        `[TODO-docs-site]` runtime-link pointers, the adopter-only "add-agent.md" footer pointer,
        the `(per-WU)` table-cell qualifier, and added "Sessions are bounded" lead — the only
        genuinely new orientation a zero-prior-knowledge agent needs), `AGENT-BRIEFING.PROJECT.md`
        47→40 (dropped duplicate ARC framing in Project Overview, dropped Zero-tolerance /
        Commands-in-QUICK-REFERENCE friction items as duplicates of DEV-RULES.PROJECT and
        QUICK-REFERENCE), `AGENT-BRIEFING.CONTRIBUTOR.md` 163→79 (largest win — Personal Workspace
        and Running Pipeline subsections moved to docs site with operational core retained),
        `CLAUDE.ARC.md` 39→37 (dropped two `**Never**` bullets that duplicate DEV-RULES.ARC §
        Context quality).

        **Agent-audience lens — applies to remaining 4.2 / 4.3 / 4.5 subtasks:** for files that load
        only into agent context (no human-reader role), inline `[TODO-docs-site]` placeholders are
        supererogatory because agents can't follow runtime links to docs. Sweep WU finds extractions
        via the staging entry's Source range. Dual-audience files (e.g., contributor briefing,
        DEV-RULES with adopter-template content) keep placeholders. Per-file judgment call; default
        is to retain placeholders, drop only when the file is strictly agent-loaded.

        **Staging entries added to `notes-docs-content-sweep.md`:** six entries —
        Entry 1: AGENT-BRIEFING.ARC.md § Introduction + How ARC Works;
        Entries 2-6: AGENT-BRIEFING.CONTRIBUTOR.md § Boundaries (paragraph) /
        § Commit Convention / § Session Workflow / § Personal Workspace (3 non-contiguous
        extractions consolidated as one thematic unit) / § Running a Full Planning Pipeline Locally.
        AGENT-BRIEFING.PROJECT.md and CLAUDE.ARC.md trims dropped pure duplicates with no extraction
        entries (covered by adjacent loaded files).

        **Two-copy sync:** Framework files (`AGENT-BRIEFING.ARC.md`, `AGENT-BRIEFING.CONTRIBUTOR.md`)
        edited in both `.arc/` and `packages/arc-framework/arc/`; verified identical post-edit.
        Configurable files (`AGENT-BRIEFING.PROJECT.md`, `CLAUDE.ARC.md`) edited in `.arc/` only;
        package templates unchanged (project-specific content trims, not framework defaults).

        **Convention amendment surfaced during execution:** Task 4.1's "no source-side definition for
        `[TODO-docs-site]`" placeholder convention failed MD052 zero-tolerance lint on first
        placeholder use. Convention revised in `notes-docs-content-sweep.md` § Source-Side Placeholder
        Convention to require a stub definition
        (`[TODO-docs-site]: # "Placeholder pending docs-content-sweep — see notes-docs-content-sweep.md"`)
        at file bottom — one stub per file, serves all references via DRY label, sweep WU rewrites
        the stub to resolve all references in the file. User approved before execution proceeded.

        **Follow-on deletion (pre-4.2.b):** `CLAUDE.ARC.md` and `CODEX.ARC.md` deleted from
        `.arc/system/agent/` following pressure-test finding no valid ARC-exclusive use case for
        the `{AGENT}.ARC.md` surface — harness-level files (`CLAUDE.md`, `AGENTS.md`, etc.) dominate
        on load order (pre-session-init) and always-in-context, with no ARC-specific capability
        lost. Surgical scope (project copies only); full mechanism removal — seven package sources,
        `template-agent.md`, session-init Step 4 item 3, `arc init` / `add-agent` scaffolding,
        CHECK 12 hook, directory rename `system/agent/` → `system/briefs/`, file rename
        `AGENT-BRIEFING.*.md` → `AGENT-BRIEF.*.md`, subdir README rewrite — absorbed into revised
        Task 5.7. Docs-site drift captured in `plan-docs-content-sweep.md` Drift Item #4.

    - [x] **4.2.b `DEV-RULES.ARC.md` — audited**

        **Outcome:** Trimmed and lint-clean. 385 → 327 lines (15% reduction). Character of the trim was
        surgical — scattered rationale paragraphs + overflow examples + 4-5 consolidation sites — rather
        than whole-subsection extractions, reflecting the file's already-tight operational baseline.

        **Extractions (4 staging entries, #7-10 in `notes-docs-content-sweep.md`):**
        Entry 7 — Sub-agent scope first paragraph (what sub-agents are, when valuable); operational
        rule "task-list work stays in primary agent" retained with `[TODO-docs-site]` pointer.
        Entry 8 — Context quality rationale ("weaker retrieval positions" / "marathon sessions that
        technically fit in the window"); operational rule + pointer retained.
        Entry 9 — Write for the reader § 4 of 6 examples (kept 2 canonical inline: code-comment +
        PR-description variants; extracted code-comment-FooBar, list-absence, and two notes-file-header
        examples).
        Entry 10 — Preamble P1-P11 framing + rule → principle mapping table (17 rules mapped);
        paired with file-wide strip of `· PN` heading annotations.

        **Compressions (no extractions):**
        Preamble callout restructured ("How configurable rules work" — no more P1-P11 framing).
        Commit control four-bullet "AI controls commits" restatements consolidated to one.
        Commit format "Format enforcement and traceability are required..." framing dropped.
        One-task-at-a-time: "(P2 — human-agent co-development)" parenthetical + "checkpoint at
        checkbox level" redundancy removed; contributor note compressed 4 → 2 lines.
        Leave-it-cleaner: "Don't pass over an issue..." restatement + method meta-commentary
        ("The method determines fix-vs-defer thresholds...") dropped.
        Test-first: major compression 14 → 5 lines. Decision-tree defaults and red-green-refactor
        restatement dropped — method is authoritative and loaded at trigger time; DEV-RULES.ARC
        embedding defaults risked contradiction if adopters override. User call.
        No-meta-project-references: 3 sentences → 2 (restatement dropped).
        When-to-Load: "method dependencies block triggers loading of..." informational subtext
        trimmed from process-task-loop and prepare-commits bullets.

        **Removals (pure cut, no docs-site target):**
        "Re-check core documents" subsection removed entirely. 90% tautology ("if uncertain about X,
        reread X"); remaining "workflows are authoritative for their domain" insight is implied by
        § Method and extension loading. User call; replaced Contents TOC entry.
        "Wrong information is worse than no information." aphorism at § Verify before assuming.

        **P-annotation removal:** 17 `· PN` annotations stripped from rule headings across the file;
        preamble paragraph "Every rule traces to one of ARC's 11 principles (P1–P11)..." removed
        and staged (Entry 10). Rule → principle mapping preserved in the staging table for docs-site
        absorption — adopter-facing methodology coherence retained without inline rule restatement.
        `· [configurable]` annotations retained (operationally meaningful — signals override mechanism
        exists). `[core-philosophy]` link definition removed from DEV-RULES.ARC (no remaining
        inline reference); staged in Entry 10 for docs-site mapping page absorption.

        **Agent-audience lens application:** DEV-RULES.ARC is dual-audience (agent at session-init +
        adopter reading the constitution), so `[TODO-docs-site]` placeholders are retained at
        extraction sites per 4.2.a's lens default. Four placeholders added; stub definition added to
        file bottom.

        **Two-copy sync:** Framework file. Edits in `.arc/` synced to
        `packages/arc-framework/arc/reference/constitution/DEV-RULES.ARC.md` via cp; `diff` verified
        identical post-sync.

    - [x] **4.2.c `DEV-RULES.PROJECT.md` — audited**

        **Outcome:** Trimmed and lint-clean. 214 → 137 lines (36% reduction). Character of the trim was
        structural — whole-section extractions/drops driven by redirection to existing project-level
        strategies — rather than the surgical trim 4.2.b applied to DEV-RULES.ARC.

        **Lens calibration (new precedent for project-level files):** Project-level / configurable files
        have three audit outcomes — **drop**, **tighten-in-place**, or **relocate to a project-level
        strategy**. Staging entries in `notes-docs-content-sweep.md` do NOT apply; that staging flow is
        framework-content-only since the docs site serves adopters, not this repo's project specifics.
        `[TODO-docs-site]` placeholders likewise unused. Apply this lens to remaining project-level
        files in Phase 4 (incl. 4.2.d's QUICK-REFERENCE which is configurable).

        **Relocations (1 cross-file move):**
        Mock hygiene block (Vitest hoisting / resetAllMocks / re-establish defaults + "Why this
        matters" rationale) moved into `strategy-testing-methodology.md` as new `### Vitest mock
        mechanics` subsection under `## Mocking Rules`. Strategy already covered what-to-mock
        (boundaries vs internals); Vitest mechanics is a distinct footgun class. Content moved intact
        — no rewrite. Testing Methodology pointer in DEV-RULES (§ Testing Requirements) updated to
        call out "including Vitest mock mechanics" so readers know the footgun guidance is reachable.

        **Drops (whole sections / subsections, covered by other sources):**
        - **Domain-scoped rules callout** (intro) — framework meta-guidance; session-init Step 4
          already directs the agent to scan `constitution/` for domain rule files
        - **File Organization section** — duplicated AGENT-BRIEFING.PROJECT § Repository Layout and
          QUICK-REFERENCE § Environment, both loaded at session-init
        - **Capture Routing 3 bullets** — pure duplication of DEV-RULES.ARC § Leave it cleaner table
          (same session-init load set); kept pm.mode line + pointer
        - **CI Validation item 6** in Quality Gates list — informational about GH Actions pipeline,
          not an action the agent takes
        - **Redundant "Markdown linting remains the primary quality gate" line** at end of Testing —
          duplicated Quality Gates item 1
        - **Testing Requirements tier descriptions** (Unit/Integration/E2E paragraphs) —
          `strategy-testing-methodology.md` § Test Tiers already covers this more comprehensively;
          pointer retained
        - **ADR decision criteria** ("Write an ADR when" / "Don't write an ADR for" / stability
          paragraph) — `strategy-adr-methodology.md` owns criteria and policy; reduced to intro
          sentence + pointer
        - **Trailing "Separate concerns, prefer composition..." sentence** under Code Quality
          Principles — overlapped with DRY bullet, drop call was close but followed plan

        **Compressions (in-place tightening):**
        - Tiered approach paragraph (Quality Gates) 4 lines → 1 line ("T1 per-task, T2 per-unit, T3
          pre-PR. See strategy.")
        - shellcheck install note (Code Linting item 2) 3 lines → 1 line; dropped apt/brew command
          examples and CI runner note (well-known install, CI detail informational)
        - Line-length rule (Docs Standards) 4 lines → 1 line; dropped underfill rationale paragraph
          (`because ...` clause ~45 words, well over ≤12-word heuristic)
        - TOC updated — File Organization line removed

        **Retained in full (judgment calls flagged during pre-edit review):**
        - DRY/SOLID/KISS/YAGNI list (canon-but-signals-project-values) — kept 4-bullet enumeration
        - Documentation Standards ❌/✅ example pairs (all 3 kept; already minimal vs 4.2.b's 2-of-6
          retention for Write-for-the-reader)
        - Quality Gates items 1-5 current shape (enumeration IS the operational teeth of zero-
          tolerance; commands inline keep gates concrete without ref-chasing)

        **Agent-audience lens application:** DEV-RULES.PROJECT is dual-audience (agent at
        session-init + human contributors reading the constitution). Under the corrected
        project-level lens, `[TODO-docs-site]` placeholders are N/A regardless — no extractions
        destined for the docs site. No placeholders added. File bottom stub not introduced.

        **Two-copy sync:** Configurable file. `.arc/` copy edited only; package source
        (`packages/arc-framework/arc/reference/constitution/DEV-RULES.PROJECT.md`, 173-line
        adopter template with placeholders) intentionally unchanged per 4.2.a configurable-file
        precedent. Cross-file relocation target `strategy-testing-methodology.md` is a project
        strategy (`strategies/project/`); not shipped to adopters, no package counterpart exists.

    - [x] **4.2.d `QUICK-REFERENCE.md` — audited (project copy + template)**

        **Outcome:** Both copies trimmed and lint-clean. Project copy 330 → 296 lines (10%
        reduction). Template 242 → 225 lines (7% reduction net — T3+T4 drops partly offset by T1
        new Platform Commands scaffold).

        **Lens calibration amendment (extends 4.2.c):** Configurable-file audit has TWO passes —
        `.arc/` trim for project-specific content, **plus** package-template edits for
        framework-template quality issues (structural gaps, broken pointers, duplication the
        template itself introduces). The 4.2.c precedent "configurable → `.arc/` only" was
        overgeneralized; it correctly applies to project-specific content changes but NOT to
        framework-template quality improvements that affect every adopter. Carry this refined
        lens into 4.2.f (which touches template-shaping files).

        **Drops (project copy + template):**
        - **Anti-Patterns section** — duplicated Env & Path guidance + AGENT-BRIEFING.PROJECT §
          Common Friction Points + DEV-RULES.PROJECT. No workflow anchors targeted `§
          Anti-Patterns`. Dropped in both copies for DRY.
        - **Bottom summary line** ("Commands assume repo root…" / "If working from subdirectory,
          see active status file for adjusted paths") — redundant with intro and Env & Path
          sections. Dropped in both copies.

        **Project-copy-only changes:**
        - **Working Directory Note** (Env & Path) compressed 2 lines → 1 line, dropped the
          hybrid-project restatement that duplicated AGENT-BRIEFING.PROJECT § Common Friction
          Points.
        - **Runtime Environment § Quality Tools** — 5-bullet command list compressed to
          tool-names-only line + pointer to § Command Patterns / § Quality Gate Commands below.
          Commands were duplicated in both sections; under Phase 5.1 partial-read, commands
          reach the agent via workflow-triggered method loading (quality-gate-commands) rather
          than the partial-read pair.

        **Template-only changes:**
        - **Working Directory Note** (Env & Path) dropped entirely — "Check active status file
          for current context and adjusted paths" was doubly wrong (status file carries task
          state, not paths; SESSION-NOTES would carry adjusted paths if any). User call — note
          was overtuned guidance, cleaner without.
        - **New conditional § Platform Commands section** added between § ARC CLI Commands and
          EOF. Wrapped in `<!-- arc:if platform.type != github --> … <!-- arc:endif -->`, using
          the existing idiomatic conditional-render mechanism (already used for `team.mode` and
          `pm.mode` in other templates). Default (github) adopters render without the section;
          GitLab/Gitea/etc. adopters render a minimal 3-row scaffold (Create PR/MR, List PRs/MRs,
          Create issue) with an intro comment directing them to fill in their platform CLI.
          Resolves all 6 inbound workflow references to `QUICK-REFERENCE § Platform Commands`
          that were previously dead pointers (rotate-branch, integrate-planning-branch,
          deactivate-work-unit, strategy-configurability-architecture ×3). arc-config.yml:131
          comment already says "See QUICK-REFERENCE for platform-specific command alternatives"
          — config and template now align.

        **Shared change (both copies):**
        - **ADR-012 trailing explanation** in § Session State Portability — replaced with
          pointer to `strategy-session-operations.md § Session State Portability`. User call to
          prefer canonical living strategy over the decision record that led to it. Strategy
          covers git notes mechanism, `arc sync` direction semantics, `user.sync_push` policy
          more thoroughly. Added `[session-ops]` reference-style link to project copy's link
          definitions block; template uses inline link (matches its style).

        **Preserved in project copy (judgment calls flagged pre-edit):**
        - § Environment & Path Context Critical Path Reference table (4 rows) — compact
          load-cost-lens orientation aid, info not elsewhere in this form
        - § Quality Gate Commands section unchanged — canonical tier reference per
          strategy-quality-gates, already command-dense
        - ARC CLI Commands self-hosting callout — critical project-specific rule (`npx arc …`
          vs `arc`), operational
        - § Command Patterns Prettier gotchas + Markdown Linting MD060 note — genuine tool
          footguns
        - npm Publishing section — tight, project-specific, on-demand load makes cost OK

        **Retained in template:**
        - Placeholder comments inside sections (`<!-- Example using… -->`, `<!-- Omit this
          section if… -->`) — serve template-use purpose, operational for adopters filling in
        - Command Patterns placeholder scaffolds — template shape guides adopters

        **Two-copy sync model refined:**
        - Project copy (`.arc/reference/QUICK-REFERENCE.md`) edited independently for
          project-specific content trims (C, D)
        - Template (`packages/arc-framework/arc/reference/QUICK-REFERENCE.template.md`) edited
          independently for framework-template quality (T1, T-extra)
        - Shared changes (A/T3, B/T4, E/T2) applied to both — same defects in both copies
        - Template file name is `.template.md` (not `.md`) — it's a rendered-at-init
          configurable file, not a direct copy. Lint-excluded by default in workspace config;
          force-linted via temp-copy workaround, zero errors.

        **Scope note — out of scope:** Workflow references to `§ Platform Commands` previously
        called "drift" are structural gap, not decay. T1 closes the gap. No workflow edits
        needed — references already resolve once template renders with the conditional section
        present.

    - [x] **4.2.e `session-init.md` — audited (both copies)**

        **Outcome:** Project copy 344 → 308 lines (10.5% reduction); template 373 → 336 lines
        (9.9% reduction). Character of the trim was mostly surgical — scattered rationale paragraphs
        plus 3 heavy extractions. Came in below the Phase 4 ~80-90% extraction heuristic by design:
        4.2.g was spun off (DEV-RULES domain scan wording held for full structural replacement), and
        one of the four heavy-extraction candidates was relocated (not staged for docs sweep).

        **Heavy changes:**
        - **SESSION-NOTES load errors (4 error classes with diagnostic commands)** relocated to
          `strategy-session-operations.md § SESSION-NOTES Load Error Recovery` (new subsection under
          § Session State Portability). Operational recovery reference — agent needs the commands at
          runtime; docs-site target serves no read-path. session-init.md retains a single pointer via
          new `[session-ops-load-errors]` reference link.
        - **Multi-file disambiguation prompt example** trimmed from 11-line illustration to 4-line
          structural scaffold (`[N] <filename> · <branch> / Next Task / State` pattern). Verbose
          concrete examples not staged — project-specific pedagogical value low.
        - **Planning-readiness enumeration** (§ Next work unit discovery closing paragraph) dropped;
          staged Entry 12. 4-step discovery protocol retained.
        - **Context-mismatch examples** trimmed Tier 1 4→2 and Tier 2 3→2 (matches 4.2.b Write-for-
          the-reader precedent); dropped examples staged Entry 13.

        **Adjacent captures from audit:**
        - **Step 1 "Adopters: add project-specific runtime checks" prose dropped in both copies.**
          Misleading — rendered copies churn on `arc update`; template isn't adopter-owned. Correct
          surface for non-ARC pre-session guidance is outside ARC (harness-level files). User-
          approved framing: same reasoning that retired `CLAUDE.ARC.md`; no new extension invented
          (no reinventing the wheel). `pwd` retained — lightweight cwd orientation, sessions shift
          cwd genuinely. `plan-docs-content-sweep.md` Drift Item #4 augmented to capture env-
          bootstrap as an additional harness-layer use case.
        - **New task 4.2.g — DEV-RULES domain enumeration via composite probe** added. Replaces
          Step 4 item 5 scan instruction (nearly always-empty) with probe-delivered
          `{path, domain, purpose}` tuples via frontmatter on DEV-RULES.{domain}.md files; ships new
          `reference/templates/template-dev-rules.md` scaffold (user-initiated addition — makes
          domain-rules adoption copy-paste); captures docs-site drift at implementation time. Step 4
          item 5 wording trim held for 4.2.g's wholesale replacement.

        **Staging entries added (3, 11-13 in `notes-docs-content-sweep.md`):**
        Entry 11 — Design context P5 framing + persistent-memory nuance (preamble);
        Entry 12 — Next-work-unit planning-readiness enumeration;
        Entry 13 — Context-mismatch dropped illustrations (Tier 1 ex 3+4, Tier 2 ex 3).

        **Inline tightenings (~10 sites):** Design-context P5 annotation stripped; config-awareness
        rationale tightened (§ 2); probe-failure parenthetical + closing reassurance dropped; remote-
        ahead rationale tightened (§ 3); reading-rule parenthetical dropped; task-list "Why partial
        read OK" folded into the header clause; task-execution-workflow rationale tightened (§ 4);
        post-context-load use-cases dropped (§ 5); "Never include" closing rationale tightened (§ 7);
        contributor-block closing rationale tightened.

        **Agent-audience lens:** `audience: agent` in frontmatter — strictly agent-loaded. Per 4.2.a
        lens default: no `[TODO-docs-site]` placeholders at extraction sites; sweep WU locates
        extractions via staging Source ranges. No file-bottom stub added.

        **Two-copy sync (configurable-file two-pass per 4.2.d):** All content trims applied to both
        copies. Template-specific conditional blocks preserved intact (`team.mode` × 2, `pm.mode ==
        arc-in-git`, `pm.mode != arc-in-git`); `{{REPO_ROOT}}` placeholder preserved. Template
        lint-excluded by workspace config; force-linted via temp-copy, zero errors.

    - [x] **4.2.f Template + reference + config cluster — audited (all three)**

        **Outcome:** `template-status.md` 56 → 11 lines (80% reduction; highest-leverage target because the skeleton
        propagates into every WU's status file and is Tier-1 loaded per-session). `STRATEGY-INDEX.md` `.arc/` copy
        79 → 38 lines (52%); package copy 79 → 56 lines (29%). `arc-config.yml` audited, no material change —
        comments are largely interface documentation, not rationale bloat. STRATEGY-INDEX confirmed Configurable
        per `strategy-file-classification.md:36` — `.arc/`-side divergence is the intended `arc update` merge
        pattern, not a risk.

        **Heavy changes — `template-status.md`:**
        - **"About this file" callout (L3-L9) dropped.** Same P5/companion/protocol framing already authoritative in
          `AGENT-BRIEFING.ARC § Session lifecycle`, `DEV-RULES.ARC § Session Management`, and `session-handoff.md`.
          Carried into every WU's status file was pure duplication.
        - **Optional fields HTML comment (L21-L35) relocated** — Interrupts / Paused At / Paused To / Superseded By
          field documentation moved to new `strategy-work-organization.md § Work Unit State § Optional Pointer
          Fields` subsection.
        - **State enum HTML comment (L37-L56) relocated** — 5-value enum with set-by cross-references moved to new
          `strategy-work-organization.md § Work Unit State § State Enum` subsection.
        - Final template shape: H1 title + `## Active Work` + 7-field scaffold. Self-documenting.

        **Cross-reference updates:**
        - `integrate-work-unit.md` (both copies) L295 + L306 redirected from `[template-status]` to
          `[work-org-state]` (anchor link into the new strategy subsection). `[template-status]` reference link
          removed from the file; `[work-org-state]` added.
        - `activate-work-unit.md` + `manage-incidental-work.md` references to `template-status.md` left intact —
          those point to the template as a copy-source (still valid — the template is the skeleton).

        **Heavy changes — `STRATEGY-INDEX.md` (two-pass):**
        - **§ Usage Protocol (13 lines) dropped from both copies.** Redundant with `DEV-RULES.ARC § Verification
          and Discovery → Consult strategy guidance` (loaded earlier in session-init order). Per-entry "Consult
          when" triggers ARE the discovery mechanism.
        - **Top preamble (Location + Naming, 7 lines) dropped from both copies.** Per-entry `arc/` vs `project/`
          prefixes document the structure inline; framework-authoring guidance on the `strategy-` prefix is
          meta-noise at session-init.
        - **§ Project Strategies divergence (`.arc/` only):** illustrative examples replaced with this project's
          actual strategies (`strategy-package-project-sync.md`, `strategy-testing-methodology.md`). Package copy
          retains the illustrative block (adopter-facing scaffold).
        - **Maintenance note dropped from `.arc/` copy** (framework-authoring guidance), retained in package copy.

        **`arc-config.yml` — audited, no material change.** Per-section comment structure is mostly enum-value
        rosters, default markers, strategy-pointer lines, and examples blocks for regex-valued settings — all
        interface documentation adopters need when configuring. Scattered candidates (header "Format:" paragraph,
        `team.mode` effect bullets, `hooks.subject_max_length` rationale) are minor and don't justify the edit
        churn given 3.R already removed the load-cost pressure. Minimal-touch verdict.

        **Lens application:** Configurable-file lens per 4.2.c/4.2.d precedents — three outcomes (drop /
        tighten-in-place / relocate to project-level strategy). Relocations went to framework strategy
        (`strategy-work-organization.md`), not docs-sweep staging. No `[TODO-docs-site]` placeholders at drop
        sites (agent-loaded files); docs-site coverage happens naturally when the strategy doc is processed.

        **Classification verification:** Pulled `strategy-file-classification.md` during audit to confirm
        STRATEGY-INDEX is Configurable (L36, L147) — three-way merge applies on `arc update`, `.arc/`-side
        divergence in project-specific sections is the intended-use pattern. `template-status.md` not explicitly
        classified in taxonomy but behaves as Framework (no render placeholders, no customization surface) —
        package-source edits authoritative, sync forward to `.arc/`.

        **Two-copy sync:** All trims applied to both copies. Content identical across copies except the two
        intentional STRATEGY-INDEX § Project Strategies divergences.

    - [x] **4.2.g DEV-RULES domain enumeration via composite probe**

        **Goal:** Replace session-init.md Step 4 item 5's `constitution/` scan instruction with
        probe-delivered domain-rules awareness. Surfaced during 4.2.e audit: every session scans
        `constitution/` for `DEV-RULES.*.md` domain files with near-always-empty result (rare adopter
        need). Zero domain files exist in this repo; no migration.

        **Design decisions (resolved pre-implementation):**

        - **Frontmatter schema — flat, unnamespaced**: top-level `domain:` (string) and `purpose:`
          (string). Mirrors method/extension frontmatter precedent (same family: harness-enumerated
          markdown files) rather than the workflow `arc:` namespace pattern. Filename must match
          `DEV-RULES.{DOMAIN}.md` where `{DOMAIN}` matches the `domain:` value (case-insensitive),
          mirroring the method `name`-matches-basename contract.
        - **Enumeration discriminator — frontmatter presence**: probe globs `DEV-RULES.*.md` in
          `reference/constitution/` and filters by successful frontmatter parse. `DEV-RULES.ARC.md`
          and `DEV-RULES.PROJECT.md` carry no frontmatter and are silently skipped — no
          reserved-list maintenance. Any adopter `DEV-RULES.SECURITY.md` with the schema is
          auto-discovered.
        - **Malformed frontmatter handling**: mirrors extensions probe — surfaces in a
          `warnings: string[]` slot on the probe result. File skipped from enumeration; session-init
          continues.
        - **Probe envelope shape**:
            - Module: `src/commands/constitution/` (mirrors `.arc/reference/constitution/` directory
              mapping convention used by other command modules)
            - Top-level slot on `SessionInitProbeResult`:
              `domainRules: Probe<DomainRulesSessionInitResult>` (precise — `constitution` the
              module enumerates specifically the domain-rules subset)
            - Inner shape:
              `{ mode: "session-init"; rules: Array<{ path; domain; purpose }>; warnings: string[] }`
            - **Session-init-only at launch**: no full-mode rendering added — no current consumer.
              `arc status` default rendering skips the slot. Adding full mode is a later task if an
              `arc constitution status` surface is needed.
        - **Session-init.md Step 4 item 5 — re-composed under Option C**: merge domain-rules
          pointer as rewritten nested bullet under existing item 5 (DEV-RULES.PROJECT.md). No
          renumbering. Drops the `constitution/` scan instruction; references `domainRules` probe
          output instead.
        - **`template-dev-rules.md` classification — Framework (default)**: static scaffold with
          fixed content; adopters copy-and-rename to `DEV-RULES.{DOMAIN}.md`, so upstream template
          edits propagate cleanly. No entry needed in `src/lib/classification.ts` (default
          behavior).

        **Scope:**

        - [x] **4.2.g.a `parseDevRulesFrontmatter` — schema parser**

            Shipped `src/lib/frontmatter/dev-rules.ts` with the flat `{domain, purpose}` schema:
            case-insensitive filename-fragment match against `DEV-RULES.{DOMAIN}` basename,
            non-empty `purpose` enforced, extra unknown keys accepted for forward-compatibility.
            Exported from `src/lib/frontmatter/index.ts`. 12 tests in
            `__tests__/unit/frontmatter/dev-rules.test.ts` (11 spec'd behaviors + case-insensitive
            match affirmation). Tier 1 gates clean (lint:ts, typecheck, typecheck:test, 784 unit
            tests passing).

            **Behaviors batched rationale:** Tightly coupled single parser, shared test setup, no
            independent discovery value — per `3_process-task-loop.md` § Batching judgment.

        - [x] **4.2.g.b Probe module — `runDomainRulesSessionInitStatus`**

            Shipped `src/commands/constitution/` module: `types.ts` (envelope shapes), `status.ts`
            (probe enumerating `DEV-RULES.*.md` under `.arc/reference/constitution/`), `format.ts`
            (Clack summary stub), `constitution.ts` (barrel re-export). Discriminator is
            frontmatter-presence: files without a frontmatter block are silently skipped (ARC +
            PROJECT handled automatically), structural/content defects surface in `warnings`.
            Missing-directory throws per extensions probe precedent (composite wraps as per-slot
            runtime error).

            9 integration tests in `__tests__/integration/constitution.test.ts` cover empty
            directory, ARC/PROJECT skip, single/multiple valid, malformed warn, mixed, README
            exclusion, non-`.md` exclusion, missing-directory throw. 4 unit tests in
            `__tests__/unit/constitution-format.test.ts` cover the formatter (empty, rules only,
            rules + warnings, warnings only).

            **Incidental discovered during this subtask:** renderer left `\n\n` at EOF when an
            `arc:if` block stripped near EOF, tripping MD012 in the e2e init-suite lint. Fixed in
            `src/lib/template/render.ts` by normalizing trailing newlines to exactly one (commit
            `b4454c3`). Unblocks full `npm test` suite.

            Tier 1 gates clean (lint:ts, typecheck, typecheck:test, 788 unit tests); full suite
            including 14 e2e tests green post-renderer-fix.

        - [x] **4.2.g.c Composite wiring + handler integration**

            Threaded `domainRules` through the session-init composite. `SessionInitProbeResult`
            and `SessionInitProbes` in `src/commands/status/types.ts` gained a
            `Probe<DomainRulesSessionInitResult>` slot; `runSessionInitStatus` in `run.ts`
            extended to a 5-element `Promise.all`; `buildSessionInitStatusSummary` in `format.ts`
            renders a `Domain Rules:` section after `Active:` via
            `buildDomainRulesSessionInitSummary`. Handler binding added in
            `src/handlers/status.ts` — session-init branch only. Full-mode `StatusResult`
            unchanged (per the resolved session-init-only design).

            7 new behavior-scoped tests added across existing suites: 3 in
            `__tests__/unit/status/run.test.ts` (slot exposure, runtime-error isolation,
            full-mode absence), 4 in `__tests__/unit/status-format.test.ts` (section ordering,
            empty-case delegation, populated delegation, error-marker rendering); existing
            "invokes every probe" and JSON round-trip tests were extended rather than
            duplicated. `__tests__/integration/status.test.ts` fixture updated to create an
            empty `constitution/` dir and `makeSessionInitProbes` to bind the new probe —
            keeps composite integration tests in "clean" state.

            **Behaviors batched rationale:** five behaviors tightly coupled to one composite
            change with shared fixture setup (probe bundle with `domainRules`); one-at-a-time
            slicing offered no independent discovery value.

            Tier 1 gates clean (lint:ts, typecheck, typecheck:test, 797 unit tests); full
            suite green (972 tests). CLI sanity — `arc status --session-init --json` emits a
            `domainRules: {ok: true, value: {mode: "session-init", rules: [], warnings: []}}`
            slot on the self-hosting repo (ARC and PROJECT domain files silently skipped per
            frontmatter-presence discriminator).

        - [x] **4.2.g.d Pre-commit hook — DEV-RULES frontmatter validation**

            Shipped as a new CHECK 13 in `pre-commit` (both copies) — "Domain-rules frontmatter
            validation". CHECK 13 (Markdown link resolution) renumbered to 14; CHECK 14
            (Package-source neutrality) renumbered to 15. Hook greps staged paths matching
            `^(\.arc|packages/arc-framework/arc)/reference/constitution/DEV-RULES\.[^/]+\.md$`
            and delegates to the existing `validate-frontmatter.ts`, which was extended with
            a `"domain-rules"` classification. Reserved filenames (`DEV-RULES.ARC.md`,
            `DEV-RULES.PROJECT.md`) are filtered at the classifier level — captured-fragment
            lookup against the `DOMAIN_RULES_RESERVED = {"ARC", "PROJECT"}` set — so they
            short-circuit to `"other"` before parsing.

            9 behavior tests added to `__tests__/unit/scripts/validate-frontmatter.test.ts`:
            4 in `classifyPath` (domain-rules paths classified, reserved filenames excluded,
            constitution non-DEV-RULES files pass through, existing "unrelated paths"
            trimmed of the now-moved DEV-RULES.ARC reference) and 5 in `validateFiles` (valid
            pass, missing `domain` diagnostic, filename/domain mismatch both-values
            diagnostic, reserved filenames silently skipped, malformed YAML surfaces inner
            parse error, no-domain-rules paths pass cleanly). Tier 1 gates clean
            (lint:ts, lint:sh, typecheck, typecheck:test, 806 unit tests).

            **Behaviors batched rationale:** all 7 specified behaviors exercise one dispatcher
            (`classifyPath` + `validateFiles`) with shared fixture builders; one-at-a-time
            slicing would re-run the same fixture setup without discovery value.

            End-to-end smoke-tested: staged `DEV-RULES.SMOKE.md` with
            `domain: backend` under filename `SMOKE` → hook surfaces
            `Domain-rules frontmatter validation failed` with the expected both-values
            diagnostic. Valid frontmatter smoke → `Pre-commit checks PASSED`.

        - [x] **4.2.g.e CI audit — sibling `audit-domain-rules.ts` + parser case contract**

            Shipped as sibling script — `audit-method-triggers.ts` is strictly method/extension-
            scoped by filename contract, module doc, success message, and corpus (walks
            `system/workflows/`). Force-fitting DEV-RULES validation would require rename +
            module-doc rewrite + widened CLI surface for no structural payoff; the two audits
            share only the `lib/frontmatter/` primitives, which a sibling already inherits for
            free.

            `packages/arc-framework/src/scripts/audit-domain-rules.ts` exports
            `enumerateDomainFiles(dir)` and `audit(constitutionDir): AuditResult` matching the
            method-triggers `AuditResult` shape. Per-file validation delegates to
            `parseDevRulesFrontmatter`. Zero-files returns clean pass with informational
            stdout (`no domain files present (opt-in extension)`); CLI exits 1 on diagnostics,
            0 on pass with file count.

            **Parser case contract (design tightening during this task):** the original
            parser accepted case-insensitive filename/domain matches, which created a
            cross-file duplicate-`domain` corner case only reachable on case-sensitive
            filesystems (two files differing only in fragment case could both parse as valid
            with the same `domain`). Rather than paper over with a platform-skip test or a
            defense-in-depth duplicate check, the parser now enforces an asymmetric case
            contract: filename fragment must be uppercase (signals "broad/overarching" per
            ARC convention — DEV-RULES.ARC.md, DEV-RULES.PROJECT.md, AGENT-BRIEFING, README),
            `domain:` value must be lowercase (programmatic identifier), and
            `fragment.toLowerCase() === domain` exactly. Cross-file uniqueness becomes
            structurally guaranteed — two valid files cannot share a `domain` because their
            fragments would have to be identical. The duplicate check was removed from the
            audit as dead code. Template-side comment documenting this as a **mechanical
            requirement** (probe + hook enforced, not convention) is threaded into 4.2.g.f.

            Tests added / updated:
            - `__tests__/unit/scripts/audit-domain-rules.test.ts` — 7 behavior tests
              (enumeration: sorted + reserved-excluded + non-DEV-RULES excluded + empty;
              audit: empty pass, single valid, invalid-frontmatter diagnostic, reserved
              ignored).
            - `__tests__/unit/frontmatter/dev-rules.test.ts` — existing case-insensitive
              acceptance test inverted to assert lowercase-fragment rejection; 3 new tests
              for mixed-case fragment, uppercase `domain:`, mixed-case `domain:` rejection.

            Wiring: `package.json` adds `lint:arc:domain-rules` alongside `lint:arc:triggers`;
            `.github/workflows/ci.yml` adds a parallel step after `lint:arc:triggers`.
            Smoke-tested on self-hosting repo: `npm run lint:arc:domain-rules` →
            `audit-domain-rules: no domain files present (opt-in extension)`.

            **Behaviors batched rationale:** scenarios exercise one `audit()` + one parser
            with shared fixture setup; one-at-a-time slicing offered no independent
            discovery value.

            Tier 1 gates clean (lint:ts, lint:sh, typecheck, typecheck:test, 816 unit tests).

        - [x] **4.2.g.f Markdown surface — session-init rewrite, template, drift capture**

            Single atomic commit covering the markdown/config surface for the domain-rules
            feature:

            - **`session-init.md` Step 4 item 5 rewritten** (two-copy). Replaced the static
              "scan `constitution/` for additional `DEV-RULES.*.md`" instruction with a nested
              bullet pointing agents at the probe's `domainRules` field for `{path, domain,
              purpose}` tuples; retained "load on-demand when a task touches the relevant domain"
              guidance.
            - **`session-init.md` Step 2 probe table** gained a `domainRules` row documenting
              `value.rules` ({path, domain, purpose} tuples) and `value.warnings` (parse
              diagnostics). Widened the Field column by 1 char so `domainRules` fits without
              MD060 alignment drift; `markdown-table-prettify` applied to both copies.
            - **New `reference/templates/template-dev-rules.md`** (two-copy). Frontmatter
              scaffold (`domain: your_domain`, placeholder `purpose:`), HTML comment block
              framing the case contract as a **mechanical requirement** (probe + pre-commit
              hook enforce it) with a worked example (`DEV-RULES.FRONTEND.md` /
              `domain: frontend`), body skeleton mirroring DEV-RULES.ARC / DEV-RULES.PROJECT
              shape (Contents, sample sections, reference-links block). Framework
              classification (default — no `classification.ts` entry).
            - **`packages/arc-framework/init-recipe.json`** — added
              `reference/templates/template-dev-rules.md` to `include_files` alongside the
              other per-document templates (one-line addition). Scope note: the task
              description called for "markdown-only, no CLI code," but without the recipe
              entry adopters wouldn't receive the template on `arc init`; recipe JSON is
              config, not CLI logic, and the "template ships" outcome stays self-contained in
              this commit. Confirmed with user before applying.
            - **`plan-docs-content-sweep.md`** — added Drift Item #6 (DEV-RULES domain-rules
              pattern) under § Drift Items with the template-standard shape (what changed /
              edit type / touch points / nuance), plus Document History entry.

            **Tier 1 gates clean** on modified markdown (5 files; MD060 surfaced on the new
            probe-table row and was resolved by `markdown-table-prettify` widening the Field
            column across all rows); probe re-verified (`domainRules.rules = []`,
            `warnings = []`); full unit suite green (816/816).

            Closes 4.2.g as a coherent unit — Tier 2 gates to run per process-task-loop §
            Coherent unit completion.

        **Dependencies:** 4.2.g.a blocks 4.2.g.b, .d, .e (they consume the parser). 4.2.g.b blocks
        4.2.g.c (composite consumes probe). 4.2.g.f depends on 4.2.g.c shipping so agents can
        actually consume `domainRules` in the harness. Implementation order:
        a → b → c → (d, e parallel) → f.

        **Commit cadence:** expected 3–4 commits. Candidate boundaries: (1) parser + probe +
        composite wiring; (2) hook + CI audit; (3) markdown surface. Split further if atomicity
        discipline calls for it at commit time.

    **Goal:** Same operational-context audit applied to core lifecycle workflows — commit/task flow (4.3.a) fires
    repeatedly per session; integrate-work-unit (4.3.b) fires per-WU; session-handoff (4.3.c) fires per-session.
    Load-frequency varies; audit pressure is high across the set. Decomposed by file weight.

    **Protocol per subtask:** same as 4.2 — extract to staging, leave placeholders, two-copy sync per file.

    - [x] **4.3.a Commit/task flow cluster — audited**

      **Outcome:** Both files trimmed and lint-clean. `3_process-task-loop.md` 269 → 241 (10%);
      `prepare-commits.md` 171 → 161 (6%). Softer line-count reduction than 4.2.a/b reflects the
      pre-audit baseline — both files were already operational-heavy with limited rationale overhead.

      **Trims applied — `3_process-task-loop.md`:** co-development rationale why-clause (workflow
      directive preserved); inline Tier 1/2/3 definitions recap (pointer to Quality Gates Strategy
      retained); outcome-shaped rewrite second sentence (tautological restatement); "Implied
      permission" note (verbatim duplicate of DEV-RULES.ARC § Task Execution, always-loaded);
      atomicity-check common-splits enumeration (imperative + pointer retained); Quick Decision
      Guide ✅/❌ criteria (compressed to atomic-vs-task-list distinction + manage-incidental-work
      pointer); Where to Capture lifecycle-intent routing with three pm.mode conditional bullets
      (pointer to DEV-RULES.ARC § Leave it cleaner routing table — which covers all PM modes via
      its own conditional tables — replaces the arc:if scaffolding entirely); Session-Scoped
      Tracking TodoWrite rationale paragraph (imperative retained, explanation extracted).

      **Trims applied — `prepare-commits.md`:** Shared-Docs Commit Pattern scenario preamble
      compressed to single-sentence rule (Applies/Does NOT apply bullets preserved as operational
      boundary); Granularity guidance bullet expansion clauses extracted — rule leads and
      intermingled-code exception retained; reversibility bullet keeps its first two sentences
      (operational), drops the category-naming third sentence; tracking-docs-ride-with-content
      keeps through "not a separate meta-commit" (operational), drops the "dangling tracking
      commits create churn" rationale tail.

      **Staging entries added to `notes-docs-content-sweep.md`:** six entries (14-19) —
      Entry 14: process-task-loop § Co-development awareness rationale;
      Entry 15: process-task-loop § Completion protocol atomicity-check common-splits examples;
      Entry 16: process-task-loop § Quick Decision Guide ✅/❌ criteria;
      Entry 17: process-task-loop § Task List Maintenance TodoWrite rationale;
      Entry 18: prepare-commits § Shared-Docs Commit Pattern scenario framing;
      Entry 19: prepare-commits § Granularity guidance bullet expansions.
      Pure duplicates were dropped without staging (Tier definitions recap duplicates Quality Gates
      Strategy; Implied permission duplicates DEV-RULES.ARC; outcome-shaped second sentence is
      tautological; Where to Capture routing duplicates DEV-RULES.ARC § Leave it cleaner table).

      **Agent-audience lens applied:** both files are strictly agent-loaded workflows (no dual
      audience). Per the 4.2.a resolution, no inline `[TODO-docs-site]` placeholders left —
      staging entry Source ranges let the sweep WU find extractions. Matches AGENT-BRIEFING.ARC
      and AGENT-BRIEFING.PROJECT handling.

      **Two-copy sync:** `3_process-task-loop.md` renders from
      `packages/arc-framework/arc/system/workflows/arc/3_process-task-loop.template.md` (contains
      team.mode / pm.mode arc:if directives); template edited first, rendered `.arc/` copy mirrored
      the non-conditional edits. Removed the pm.mode external/none arc:if bullets and the
      conditional `[dev-rules-project]` link definition in the template (no longer referenced).
      `prepare-commits.md` is a straight two-copy file (no template); both copies edited
      identically. Post-edit diff: `prepare-commits` identical across copies; `3_process-task-loop`
      diff shows only the two team.mode conditional blocks (correctly stripped from `.arc/` via
      team.mode=false). Tier 1 markdownlint clean on all five modified files.

      **Note:** The MD046 structural issue in `3_process-task-loop.template.md` (team-mode
      conditional blocks creating phantom indented code blocks) was pre-fixed during an earlier
      CI unblock; this audit only did the operational-context pass.

    - [x] **4.3.b `integrate-work-unit.md` — audited**

      **Outcome:** Trimmed and lint-clean. 360 → 353 (2%) — smallest reduction in Phase 4,
      consistent with the lighter-posture lens applied to this file: it loads per-WU (once per
      branch), not per-session, so amortized cost is low and clarity wins over brevity. Most of
      the file resists trimming — checklist-heavy phases with bash blocks, edge-case handling,
      and `why` clauses that each prevent a specific non-obvious error (standalone status-file
      commits resetting PR reviews, PR body reader-hostility, etc.). The four trims applied were
      all small, targeted redundancy removals.

      **Trims applied:** multi-branch ops rationale tail (status-file-travel mechanics —
      duplicates Work Organization Strategy, whose pointer remains at L36); completion-doc
      freshness rationale tail ("undermines the review it's meant to support" — kept "doubles
      as the PR description" as the operational why-link); `[~]` marker distinct-from
      enumeration (duplicates `strategy-task-list-formatting.md`, whose pointer is in the same
      sentence); Appendix "Key principle" closing block (restates what elements #4 / #5 already
      establish + duplicates the operational boundary from elements #1 / #2).

      **Staging entries added:** one entry (20) — integrate-work-unit § Appendix Key principle
      closer. Conceptual-framing value for adopter docs (audit-trail vs. abandoned-work
      distinction is the essential motivation for the supersession protocol). Other three trims
      were pure drops with existing coverage elsewhere.

      **Deliberately preserved under the lighter lens:** multi-branch intro framing, Workflow
      Overview "Key principle" establishing the docs-as-deliverable model, Supplementary Files
      evaluation criteria with the "6 months from now" heuristic, Status File discipline
      preventive paragraph (L160-164), Common Pitfalls end-of-workflow scan, Appendix elements
      #1-5 with code templates (operational when the scenario applies).

      **Agent-audience lens applied:** no inline `[TODO-docs-site]` placeholder for Entry 20
      — staging Source range sufficient.

      **Two-copy sync:** straight two-copy file (no template suffix); both copies edited
      identically, post-edit diff clean.

    - [x] **4.3.c `session-handoff.md` — audited**

      **Outcome:** Trimmed and lint-clean. 473 → 450 (5%) — standard posture, consistent with per-session
      load frequency but bounded by ADR-016 preservation constraint. The gate model expands
      handoff-interior responsibilities (rotation-field migration commit→handoff; configurable toggles
      for worktree push, notes push, quality-gate finalization), so structural scaffolding — rotation
      template, step-by-step format, Save-to-Git-Notes section, Confirm Handoff orientation — stayed
      intact. Extractions targeted principle-grounding framing and verbose error-handling prose.

      **Trims applied:** Design context (L13–16, ephemeral-context framing + persistent-memory
      nuance) compressed to a two-line override pointer; "Preserve persistent context" paragraph in
      § What to Update (L65–71) compressed to a three-line pointer to § Comprehensive Handoff Format
      step 1 + § Persistent Context (pure dedup); "Long-session bias — resist it" paragraph (L168–172)
      dropped entirely (behavioral nudge redundant with the Audience paragraph's "volume is a side
      effect" framing and the Anti-patterns block's concrete counter-examples); § Save to Git Notes
      error-handling bullets (L425–439) compressed from 15 lines to a three-bullet recognition list
      ("CLI surfaces errors — follow its guidance"), extracting the resolution-choice reasoning and
      root-cause teaching.

      **Staging entries added:** two — Entry 21 (Design context persistent-memory nuance; parallels
      Entry 11's session-init extraction, sets up consolidated Design-context narrative in docs
      absorption) and Entry 22 (error-handling rationale + root-cause patterns). "Long-session bias"
      paragraph dropped without staging (rhetorical nudge without docs-absorbable substance); "Preserve
      persistent context" paragraph compressed without staging (pure dedup with downstream sections).

      **Deliberately preserved under ADR-016 constraint:** rotation-field template block and its
      three _Note_ clauses (becomes the primary site for Next Task / Last Completed / Next Action
      updates under gate model); Save-to-Git-Notes preamble and `arc sync` push-policy bullets
      (attachment point for worktree-push toggle); Confirm Handoff orientation template (pairs with
      session-init); Handoff Examples (canonical rotation-field demonstrations); Anti-patterns
      "omit by name" block (operational teaching that counters the same biases the dropped
      "Long-session bias" paragraph gestured at).

      **Agent-audience lens applied:** no inline `[TODO-docs-site]` placeholders for Entry 21 or
      Entry 22 — staging Source ranges sufficient (mirrors Task 4.3.b / Entry 20 protocol).

      **Two-copy sync:** template suffix file (`session-handoff.template.md`). Both copies edited
      identically; post-edit diff shows only the `<!-- arc:if team.mode == true -->` block at L106–115
      of the template (correctly stripped from `.arc/` via team.mode=false), no other deltas.

- [x] **4.4 Task-list-formatting restructure (P1.4 — three moves) — done**

    **Outcome:** Three moves landed. `template-tasks.md` created (both copies) absorbing
    skeleton blocks; Quick Format Checklist relocated to `2_generate-tasks.md` Step 4 as the
    pre-save gate; `strategy-task-list-formatting.md` rewritten to rules-only (701 → 285 lines,
    ~59% reduction; 7 contract-carrying sections preserved with cross-references to the
    extracted surfaces). Tier 3 audit (4.5) now inherits a tighter `2_generate-tasks.md` and
    `strategy-task-list-formatting.md`. Five staging entries (23-27) captured pedagogical and
    design-philosophy content for the docs-content-sweep WU.

    - [x] **4.4.a Extract templates to `template-tasks.md` + apply resolved `**Strategies:**` convention change**

      **Outcome:** Templates landed; convention change applied; stale annotation swept.

        - **New file:** `.arc/reference/templates/template-tasks.md` (217 lines) — created following
          the `template-completion-doc.md` convention (single file, variants under headings, nested
          triple-backtick code blocks, curly-brace placeholders, prose pointers to
          `strategy-task-list-formatting.md` for rules). Contains: feature/technical header template,
          incidental header template, verification phase block, atomic companion file template,
          success criteria block — each with a short "Use when" framing and a reference back to the
          strategy doc for detailed rules. Phase-header template ships without a `**Strategies:**`
          field (per resolved convention). Two-copy sync: mirrored to
          `packages/arc-framework/arc/reference/templates/template-tasks.md`; post-write diff
          identical.

        - **`2_generate-tasks.md` Step 3 update:** dropped the "under the phase header or" option
          from the `**Strategies:**` wording; reframed the "use when it adds value, skip when the
          connection is obvious" closer to "use when the connection isn't obvious from the task
          title". Applied to both copies (`.arc/` + the `.template.md` counterpart); post-edit diff
          shows only the pre-existing team.mode conditional blocks (L71-79 ownership note, L170-172
          team-coordination link def).

        - **`tasks-arcd-rebrand.md` sweep:** removed the document-level `**Strategies:**` block
          (four-line citation of work-organization, package-project-sync, file-classification, and
          configurability-architecture strategies under the Overview). Only non-task-level
          `**Strategies:**` instance in the file. Also removed three orphaned reference-link
          definitions (`[package-sync]`, `[file-classification]`, `[config-arch]`) — confirmed
          unused elsewhere via grep. `[work-org]` retained (still referenced in Overview prose at
          L25).

        - **Tier 1 markdownlint:** clean on all five modified files after removing an unused
          `[verify-work-unit]` reference-link definition at the bottom of `template-tasks.md` (all
          actual uses of that label are inside nested code blocks, which don't resolve link
          references — definition was orphaned per MD053).

    - [x] **4.4.b Relocate Quick Format Checklist into `2_generate-tasks.md` Step 4**

      **Outcome:** Checklist moved verbatim; caller prose in `2_generate-tasks.md` body tightened
      (dropped the now-redundant "Use its Quick Format Checklist to verify before saving" pointer).
      Strategy doc TOC shrunk by one entry; the new checklist location is surfaced via a pointer
      line directly under the TOC ("See 2_generate-tasks.md § Step 4 for the pre-save format
      checklist"). Placement decision: checklist appears between the "Combine phases..." intro
      and the "Save to" paths, as a pre-save verification gate. Two-copy sync on
      `2_generate-tasks.md` (template suffix; diff clean except expected team.mode blocks).

    - [x] **4.4.c Trim `strategy-task-list-formatting.md` to rules-only**

      **Outcome:** 701 → 285 lines (59% reduction). Above the aspirational ~70-line target but in
      line with the "rough guide, not hard ceiling" framing given the surface area to cover
      (headers, 10 format elements, ownership, test-first, verification, atomic companion,
      success criteria).

      **Restructure shape:** Preserved 7 contract-carrying sections (Task List Headers, Format
      Elements Reference, Task Ownership Markers, Test-First Task Structure, Verification Phase,
      Atomic Companion File, Success Criteria Section). Each format-element subsection collapsed
      to 2-4 line rule summaries with illustrative single-line examples only where the rule text
      alone would be ambiguous (numbering hierarchy tree, team-ownership examples). Templates
      delegated to `template-tasks.md` via cross-reference. Three-state success-criteria marker
      table retained (operationally essential). Heading structure stable — all cross-references
      by section name continue to resolve.

      **Extracted to staging (Entries 23-27 in `notes-docs-content-sweep.md`):**

        - **Entry 23** — Task List Headers § Incidental worked example ("CLI Output Encoding
          on Windows", original L151-181). Adopter-facing concrete illustration.
        - **Entry 24** — Format Elements § Indentation visual hierarchy + fully-populated
          worked example (original L390-440). Pattern-recognition pedagogical content.
        - **Entry 25** — Verification Phase rationale ("Why a single task" +
          "Completion notes as record", original L551-566). Design-philosophy paragraphs.
        - **Entry 26** — Success Criteria Section worked example with Deviation + Superseded
          annotations (original L686-703). Concrete three-state demonstration.
        - **Entry 27** — Atomic Companion File Purpose prose + fully-populated sample (original
          L572-603). Conceptual framing for why atomic is a separate surface.

      **Cross-reference updates:**

        - `STRATEGY-INDEX.md` (both copies): revised one-line description from "formatting
          specification, header templates, element rules" to "formatting rules — structure,
          ownership, verification, success criteria"; added Companion line pointing to
          `template-tasks.md` + `2_generate-tasks.md` § Step 4 for the pre-save checklist.
        - Verified external callers — anchor-free references (DEV-RULES.ARC, 2_generate-tasks.md
          body, integrate-work-unit.md, verify-work-unit.md, manage-incidental-work.md,
          strategy-planning-module.md, arc-config.yml comment, pre-commit hook messages) all
          still resolve; retained sections match original anchor names.

      **Agent-audience lens applied:** no inline `[TODO-docs-site]` placeholders for Entries
      23-27 — staging Source ranges sufficient (mirrors Task 4.3.b-4.3.c protocol). Two-copy
      sync: strategy-task-list-formatting.md is a straight two-copy file (no template suffix);
      both copies identical after rewrite.

- [x] **4.4.d Templates directory outlier cleanup** — `template-tasks.md` 215 → 169 (~21%);
    `template-completion-doc.md` 161 → 126 (~22%); `integrate-work-unit.md` 353 → 380 (+27,
    from 4.4.d.b relocation). 4.4.d.a dropped redundant meta-sections now owned by
    `strategy-task-list-formatting.md` + dangling strategy pointer cleaned up. 4.4.d.b
    relocated pre-drafting gather list + post-drafting verification checklist to
    `integrate-work-unit.md § 3) Create Completion Metadata` (mirrors 4.4.b's
    operational-machinery-to-use-site pattern). Both outlier templates now carry only
    scaffold-pattern content (intro + variant-selection + scaffold code blocks); scaffold
    skeletons themselves retained as on-disk content of target files. Two-copy sync verified
    across all six modified files. Tier 1 markdown lint clean throughout.

    - [x] **4.4.d.a Reshape `template-tasks.md`** — 215 → 169 lines (~21%).

        Dropped § Verification Phase (skeleton already shown inline in
        `strategy-task-list-formatting.md § Verification Phase` and embedded within each
        variant scaffold — dedicated section was pure redundancy). Dropped § Success Criteria
        Section (skeleton embedded within each variant scaffold at the bottom). Trimmed
        § Atomic Companion File to minimal lead-in + skeleton block (Purpose/Ordering
        paragraphs inside the skeleton code block retained — verified against real atomic
        files in use across active + archive; those paragraphs are on-disk content of every
        atomic file, not meta-guidance). Intro collapsed: removed the four-bullet "every task
        list..." list that referenced dead anchors (`#verification-phase`,
        `#success-criteria-section`); kept the pointer to `#atomic-companion-file` (retained
        anchor) + strategy/checklist pointers.

        **Actual reduction vs task-spec target:** 21% vs. ~40%. Driver: the Purpose/Ordering
        paragraphs inside the atomic skeleton code block are on-disk content of every real
        atomic file (verified via `head` of existing atomic files across active + archive),
        so not trim-eligible without changing the atomic-file-creation contract. Target
        adjusted.

        **Cross-reference cleanup (discovered during verification):**
        `strategy-task-list-formatting.md § Verification Phase` had a dangling pointer
        ("See `template-tasks.md` for the skeleton") redundant with the inline skeleton
        directly above it; dropped in both copies. Strategy § Success Criteria Section pointer
        left as-is — still resolves to the variant-scaffold embedded block. No other inbound
        anchor-level references (confirmed via grep for `template-tasks.md#` and
        `template-tasks.md §`). STRATEGY-INDEX entry unchanged (description still accurate —
        post-trim file is still the skeleton source).

        Two-copy sync verified (both `template-tasks.md` and `strategy-task-list-formatting.md`
        are straight two-copy files). Tier 1 markdown lint clean across all four modified files.

    - [x] **4.4.d.b Reshape `template-completion-doc.md`** — 161 → 126 lines (~22%);
        `integrate-work-unit.md` 353 → 380 lines (+27).

        Relocated "Required Reading Before Drafting" (5-item gather list) from template into
        `integrate-work-unit.md § 3) Create Completion Metadata` as a pre-drafting gather
        section. Relocated "Standard Template Verification Checklist" (7-item post-drafting
        verification) into the same § 3 as a post-drafting verify gate (standard template only),
        with the Lightweight-template "verify by inspection" note appended as the tail
        instruction. "Evidence format: note where verified" discipline folded into the
        "Quantitative claims" checklist item inline. Template retains: intro + "All work gets
        a completion document" framing, § Choosing a Template variant-selection prose, both
        variant scaffolds (Standard + Lightweight) as untouched code blocks, closing link
        definition.

        **Actual reduction vs task-spec target:** 22% vs. ~50%. Same structural driver as
        4.4.d.a: the Standard Template scaffold code block (~60 lines) is on-disk content of
        every completion doc — not trim-eligible. Lightweight scaffold similar. The
        relocations landed the full intended content shift; non-scaffold surface reduced
        from ~55 lines to ~30 lines (~45% of non-scaffold prose removed — in line with spec
        intent, just denominated differently). Target adjusted.

        **Integrate-work-unit.md impact:** +27 lines in § 3. Mirrors 4.4.b precedent
        (`2_generate-tasks.md` grew ~23 lines from Quick Format Checklist relocation). 4.3.b's
        trim was prose/rationale; relocating structured operational gates is not a reversal.

        **Cross-reference verification:** No inbound anchor-level references to template
        (confirmed via grep for `template-completion-doc.md#` and `template-completion-doc.md §`).
        Bidirectional pointers preserved: integrate-work-unit.md § 3 still references
        `[template-completion-doc]` for scaffold selection; template intro still references
        `[integrate-work-unit]` workflow (Phase 1, Step 3).

        Two-copy sync verified across all four files (both template-completion-doc.md and
        integrate-work-unit.md are straight two-copy files). Tier 1 markdown lint clean.

- [x] **4.5 Tier 3 audit — remaining workflows — done**

    **Outcome:** Operational-context audit completed across 15 agent-loaded
    workflows in four clusters (4.5.a planning, 4.5.b work-unit-lifecycle core,
    4.5.c branch/verify/planning, 4.5.d supplemental). Aggregate: 2722→2372
    (-350 lines, ~13%). Staging entries 28-68 (41 entries) appended to
    `notes-docs-content-sweep.md`. Two strict no-ops confirmed (verify-work-unit.md
    in 4.5.c, verify-arc-integrity.md in 4.5.d) plus one constrained-yield case
    (2_generate-tasks.md in 4.5.a, ~6%, protected Quick Format Checklist structure).
    **Use-site relocation pattern** (4.4.b / 4.4.d.b) did not recur across the
    series — cluster gates were inline at workflow level across all 15 files.
    **Partial-extract pattern** deployed five times (4.5.c: 3; 4.5.d: 2) — paired
    "full pre-trim" / "retained in trimmed workflow" blocks document the new
    structural variant in staging entries for future audits. Retirement cleanup on
    `add-agent.md` (agent-specific `{AGENT}.ARC.md` configuration step removed per
    separately confirmed framework change) folded in during 4.5.d — not staged,
    retired outright. Two-copy sync verified and Tier 2 markdown lint clean after
    each subtask.

    - [x] **4.5.a Planning workflows** — `1_create-prd.md` (138 → 115, ~17%): preamble
      feature/technical taxonomy collapsed to one-line strategy pointer + consolidated rule
      in Step 2; Step 3 "Without a plan" discovery bullets collapsed to discovery-checklist
      pointer; Step 5 "Framing the notes file" pedagogical paragraph extracted, operational
      constraint retained (notes-file header minimality + DEV-RULES.ARC § Documentation
      Boundaries pointer); Step 2 emphasis-rationale tail trimmed (too vague to stage).
      `2_generate-tasks.md` (177 → 166, ~6%; constrained by protected Quick Format
      Checklist): `## Task List Format` collapsed from Header/Body subsection structure to
      two-pointer flat layout — `template-tasks.md` for skeleton (direct pointer, removes
      previous two-hop workflow→strategy→template lookup), `strategy-task-list-formatting.md`
      for rules; path-update workflow nuance retained.

      **Extracted to staging (Entries 28-31 in `notes-docs-content-sweep.md`):**

        - **Entry 28** — 1_create-prd.md § Preamble feature/technical taxonomy (original
          L8-14). Pedagogical framing duplicated by Step 2 rule.
        - **Entry 29** — 1_create-prd.md § Step 3 "Without a plan" discovery bullets
          (original L72-78). Duplicated `strategy-work-planning.md § Discovery Checklist`.
        - **Entry 30** — 1_create-prd.md § Step 5 "Framing the notes file" guidance
          (original L112-119). Pedagogical application of DEV-RULES.ARC § Documentation
          Boundaries.
        - **Entry 31** — 2_generate-tasks.md § Task List Format Header code block +
          path-update note (original L127-141 in `.arc/`, L136-150 in `.template.md`).
          Skeleton content now canonically owned by `template-tasks.md`.

      **Cross-reference verification:** Section-name anchors preserved (Step 2 Determine
      Work Category, Step 5 Retire Plan Documents). Inbound references from ADR-015,
      strategy-work-planning.md, strategy-work-organization.md, analysis-cross-cutting-
      dependencies.md, archive-work-unit.md all filename-only or section-name-anchored —
      all resolve post-trim. `[template-tasks]` reference-link added to both copies of
      `2_generate-tasks.md` (.arc/ + `.template.md`).

      **Agent-audience lens applied:** no inline `[TODO-docs-site]` placeholders (mirrors
      4.3.b-4.3.c / 4.4.c protocol). Two-copy sync: `1_create-prd.md` straight two-copy
      (identical post-trim); `2_generate-tasks.md` uses `.template.md` in package source
      with team.mode conditional block in Step 3 (Task List Format region has no
      template-only delta). Tier 1 markdown lint clean across six touched files.

      **Discovered during execution:** `template-tasks.md` and `template-completion-doc.md`
      identified as structural outliers in `reference/templates/` (meta-title + embedded
      scaffolds vs. direct-use pattern of other 8 templates). Captured as new Task 4.4.d
      with two subtasks — 4.4.d.a follows 4.4.c driver (strategy-rules-only exposed
      duplicate meta-sections); 4.4.d.b mirrors 4.4.b pattern (operational-machinery-to-
      use-site relocation).

    - [x] **4.5.b Work-unit lifecycle core** — `activate-work-unit.md` 234→222 (~5%); `archive-work-unit.md` 275→229
      (~17%); `clean-work-unit.md` 374→291 (~22%); `deactivate-work-unit.md` 278→260 (~6%). Cluster total 1161→1002
      (~14%). Seventeen staging entries (32-48) appended to `notes-docs-content-sweep.md` covering blockquote
      extractions (Entry 32), rationale paragraphs (33, 44-48), example enumerations (34), reference blocks (35),
      Common Pitfalls sections (36, 40), ✅/❌ mode enumerations (37-38), conceptual recaps (39), and BEFORE/AFTER worked
      examples (41-43). Two-copy sync verified across all four file pairs; Tier 2 markdown lint clean (223 files).
      **Use-site relocation pattern did not recur** in this cluster — all gates already inline at workflow level; the
      4.4.b / 4.4.d.b hoisting opportunity did not surface. Yield driver: clean carried 52% of the cluster trim
      (83/159 lines), consistent with its "heavy" flagging — largest yield from § Common Pitfalls + § Output wholesale
      deletions + three BEFORE/AFTER code fences + two ✅/❌ mode enumerations

    - [x] **4.5.c Work-unit lifecycle (branch/verify/planning)** — `rotate-branch.md` 155→117 (~25%);
      `verify-work-unit.md` 80→80 (no-op, already operational-dense); `planning/activate-planning-branch.md` 115→99
      (~14%); `planning/integrate-planning-branch.md` 152→135 (~11%). Cluster total 502→431 (~14%, 71 lines extracted).
      Eleven staging entries (49-59) appended to `notes-docs-content-sweep.md`: preamble framing (49, 54, 57), scenario
      enumeration (50), consequence-explanation partial extract (51), session-boundary blockquote (52), Common Pitfalls
      wholesale (53, 56, 59), naming-rationale partial extract (55), PR-body-scope partial extract (58). Two new link
      defs added to staging file: `[work-org-branches]`, `[config-merge]`. Two-copy sync verified across all four file
      pairs; Tier 2 markdown lint clean (223 files). **verify-work-unit.md no-op confirmed** — pre-implementation
      assessment that the file was already operational-dense held; no rationale/example content warranted extraction
      (same framing as Task 1.1.c no-op). **Use-site relocation pattern did not recur** (consistent with 4.5.b) —
      cluster's gates were already inline at workflow level. **Partial-extract pattern deployed three times** (Entries
      51, 55, 58) where a consequence signal or operational mechanic needed retention while rationale/examples were
      staged — new structural variant documented in each entry with both "full pre-trim" and "retained in trimmed
      workflow" blocks. Cluster yield matches 4.5.b's 14% exactly by coincidence, despite 4.5.c being less than half
      4.5.b's cluster size (502 vs 1161 lines).

    - [x] **4.5.d Supplemental** — `manage-incidental-work.md` 226→189 (~16%); `maintain-project-docs.md` 150→123
      (~18%); `add-agent.md` 87→72 (~17%, retirement cleanup — not extraction); `verify-arc-integrity.md` 151→151
      (strict no-op, reference material); `integrate-external-content.md` 130→123 (~5%). Cluster total 744→658
      (-86 lines, ~12%). Extraction-only yield: 71 lines / ~9.5% (manage-incidental-work 37, maintain-project-docs 27,
      integrate-external-content 7). Nine staging entries (60-68) appended to `notes-docs-content-sweep.md`:
      § Overview wholesale (60), Key Distinction examples (61), Why This Matters rationale (62), filename-examples
      partial (63), concrete commit-message example (64), full-protection reassurance line (65), § Document Hierarchy
      wholesale (66), SSOT example (67), Skills context blockquote wholesale (68). Two-copy sync verified across all
      five file pairs; Tier 2 markdown lint clean (223 files).

      **`add-agent.md` retirement cleanup** — Step 2 "Check for Agent-Specific Configuration" removed wholesale per
      user note that agent-specific (`{AGENT}.ARC.md`) files were retired from the framework. Steps 3→2 and 4→3
      renumbered; "After this workflow" summary updated to drop "agent-specific config" reference. No staging entry —
      content is retired, not staged for docs absorption. All 15 lines of the file's reduction came from this cleanup;
      0 from content extraction.

      **`verify-arc-integrity.md` strict no-op** — reference material by nature; six Check Categories each carry
      description/severity/remediation triples the agent needs when interpreting script output. Trimming reduces
      reference value.

      **Entry 66 deviation from standard destination framing** — `maintain-project-docs.md` § Document Hierarchy
      duplicated session-init.md's canonical loading model. Staged as known-stale rather than docs-absorption-ready;
      entry flags for discard when docs-sweep WU resolves the loading model.

      Cluster yield (12% total, ~9.5% extraction-only) is the lowest in the 4.5 series, driven by three of five files
      being already operational-dense. Confirms the pre-implementation read that supplementals are tighter than
      lifecycle core.

    - **Out of Tier 3 scope (excluded explicitly for visibility):** `initial-setup/*.md` (one-off install workflows,
      not loaded per-session), `session-lifecycle/session-loop.md` (`audience: human`, not agent-loaded),
      `reference/strategies/**/*.md` (T3 on-demand; `strategy-task-list-formatting.md` handled in 4.4.c as part of
      the formatting restructure)

- [x] **4.6 D7b extension-point match pre-commit hook (test-first)**

    **Outcome:** CHECK 16 landed in both hook copies; new validator script
    `packages/arc-framework/src/scripts/validate-extension-points.ts` delegates scanning to the shared `point-scanner` +
    `orphan-detector` helpers from Task 3.R.k.b. 14 unit tests at
    `__tests__/unit/scripts/validate-extension-points.test.ts` cover path classification, header- and inline-form
    resolution, orphan diagnostics with line numbers, metadata-agnostic existence criterion, multi-reference files,
    malformed-marker rejection, non-workflow skips, empty-input short-circuit, and same-copy lookup in both directions.
    Full unit suite green (830 tests); `lint:ts`, `lint:sh`, `typecheck`, `typecheck:test` all pass.

    **Validator shape (audit C2):** Follows CHECK 12/13/15's pattern — `validateFiles(paths, readFile, listExtensions)`
    is pure and injectable for unit testing; CLI entry reads the working tree and lists extension basenames via
    `readdirSync`. Diagnostics shaped
    `` path:line: extension-point reference `#<name>` has no matching `<copy>/system/extensions/<name>.md` `` so editors
    can jump to the offending line.

    **Same-copy listing (audit C1):** Opted for a minimal local `listExtensionBasenames(dir)` helper inside the
    validator rather than exporting `extensions/status.ts`'s `readExtensionsDirectory`. The task's stated criterion is
    file existence, not frontmatter-declared name (CHECK 12 already enforces name ↔ basename), so the simpler listing
    keeps the validator's dependency surface minimal. `readExtensionsDirectory` remains status.ts-private.

    **CHECK 14 dual-fire (audit C3):** Workflows that pair an anchor-suffix marker with a reference-style link to the
    extension file (e.g., `3_process-task-loop.md`) will surface both CHECK 14 (link resolution) and CHECK 16 (reference
    resolution) when an extension is deleted. Expected — different surfaces, different diagnostics — and tolerable
    given both point at the same root cause.

    **Scope boundary (audit C5):** Hook checks only staged workflow paths; a commit that deletes
    `system/extensions/foo.md` while leaving references in unstaged workflows is by design out of scope (full-repo
    orphan detection lives in `arc extensions status`).

- [x] **4.7 Phase 4 close — Tier 3 quality gates**

    **Outcome:** Tier 3 suite clean — markdown lint (223 files, 0 errors), TS lint, shell lint, typecheck (src + test),
    full test suite (1005 + 46 = 1051 tests across the monorepo), build success. Spot-check on 4 staging entries (1,
    30, 55, 68) across the 68-entry corpus: all follow the locked template (source + line range, verbatim content
    blockquote, suggested destination, stylistic integration notes); the partial-extract variant introduced in 4.5.c
    (paired "Retained in trimmed workflow" + "Extracted" subsections) is cleanly structured. Fixed-pattern
    `[TODO-docs-site]` greppable across all trimmed source files that preserved in-prose continuity (DEV-RULES.ARC,
    AGENT-BRIEFING.CONTRIBUTOR — 11 occurrences total including one reference definition per file). Phase 4.5 workflow
    trims were dominated by wholesale-section removals with no residual anchor — placeholders only apply where trimming
    preserves the surrounding prose; sweep WU enumerates wholesale removals via entry metadata in
    `notes-docs-content-sweep.md`.

    **CHECK 16 surface check (3.12 discipline mirror):**
    - SET A (negative-path staging): `README.md`, strategy `.md`, `src/cli.ts`, `.github/workflows/ci.yml`,
      `docs/release-notes.md` — hook's grep filter produces empty candidate list; validator is not invoked
      (short-circuit holds, mirrors CHECK 12/13/14/15)
    - SET B (positive resolvable): synthetic workflow at `.arc/system/workflows/arc/_surface-valid.md` with
      `` ### X · `#post-context-load` `` reference → validator exit 0
    - SET C (positive unresolvable): synthetic workflow at `.arc/system/workflows/arc/_surface-invalid.md` with
      `` ### X · `#does-not-exist-anywhere` `` reference → validator exit 1 with diagnostic:

      ```text
      .arc/system/workflows/arc/_surface-invalid.md:1: extension-point reference `#does-not-exist-anywhere` has no
        matching `.arc/system/extensions/does-not-exist-anywhere.md`
      ```

    **Phase 4 closes.** Workflow-trigger contract, per-file methods/extensions restructure, method-rename, CI
    enforcement (CHECK 12/13/14/15/16), operational-context audit across Tier 1/2/3 docs, and staging infrastructure
    all shipped. Next: Phase 5 worktree-sync completion + partial-read narrowing + session-init Step 2/4/7 restructure.

---

### **Phase 5:** Worktree-Sync Completion + Partial-Read Narrowing + Session-Init Workflow Restructure

**Purpose:** With Phase 3.R.e + Task 5.0 closing the remote-sync detection half, this phase tightens
the always-loaded surface — task-list authoring shape (5.2), per-document partial-reads (5.1, 5.3–5.5),
companion-file paths via composite probe (5.6), `{AGENT}.ARC.md` retirement and `system/agent/` →
`system/briefs/` rename (5.7) — then restructures `session-init.md` Step 2/4/7 against Phase 4 audit
outcomes (5.8).

**Design decisions:** Per-rule reliability gate for DEV-RULES section partial-reads — default up-front
load; shift to conditional only where trigger is clear. Two-copy sync standard for markdown edits;
Task 5.6 is TS-only (no markdown sync concern).

- [x] **5.0 Worktree-sync detection at session-init — completes 3.R.e scope** — done

    **Outcome:** Worktree drift detection lands across the full session-init pipeline. `runWorktreeSyncStatus`
    (5.0.a) classifies local-vs-`origin/<branch>` drift into a 9-state enum with bounded fetch; flat-dotted
    `session.init_pull.worktree` / `session.init_pull.notes` config (5.0.b) governs per-channel pull policy
    with parser-level `always`-on-worktree rejection. `arc status --session-init --json` (5.0.c) carries a peer
    `worktree` slot and attaches a `clean-at-current-head` qualifier on the user channel when worktree=remote-ahead
    and user=clean. `arc user status` and `arc sync` (5.0.d) share `formatWorktreeQualifierLine` to emit drift
    qualifiers across the user-facing notes-status surfaces; offline and disabled paths handled. Session-init.md
    (5.0.e, both copies) consumes the envelope end-to-end — Step 2 envelope table, Step 3 dual-channel pull surface
    with dirty-tree precheck and combined-prompt, Step 7 conditional `Reconcile required:` / `Local-ahead:` inserts,
    Step 8 Tier 1 diverged example. Integration coverage (5.0.f) verifies real-exec composition through the
    composite orchestrator and `runUserStatus`. ADR-012 amendment, `arc-config.yml` cross-references, and CLI
    help text (5.0.g) close out the doc surface. Per-subtask outcomes carry implementation detail; this block
    summarizes the rolled-up scope.

    **Goal:** Session-init detects and reports local-vs-remote worktree drift with the same rigor as user-notes
    drift. Extends the existing `session.remote_sync` gate and Step 2 probe architecture to the branch channel,
    closing the gap where a stale worktree produces a misleadingly-confident orientation.

    **Context:** Phase 3.R.e pulled forward the notes half of the original Task 5.0 scope during the multi-machine
    dogfooding that surfaced the git-notes staleness failure. The worktree half was not carried forward: session-init
    reports user-notes drift but remains silent on the underlying branch drift that causes it. In practice, when the
    local branch is behind origin, (a) the agent loads stale tracked context (status file, task list, PRD, notes) and
    reports confidently on obsolete state, and (b) the notes probe's "clean" verdict is truthful only with respect to
    reachable ancestors, so notes attached to unfetched commits are invisible and unreported. The same truthfulness
    bound affects any notes-status surface run outside a session-init flow — `arc user status`, direction reporting
    in `arc sync` — so a "clean" verdict there can be misread as "fully up-to-date" when the check is bounded by a
    stale worktree. External research (2026-04-23, captured in `notes-session-init-optimization.md` § Phase 5.0
    Worktree-Sync Research) validated the UX shape: fetch-on-init gated by an opt-in config, `prompt` default, no
    `always` mode for worktree, combined prompt when both channels drift, fast-forward only.

    **Design decisions (resolved pre-implementation):**
    - Narrow fetch scope: `git fetch origin <current-branch>` only; not a whole-remote fetch
    - Bounded fetch timeout (3s default) with `remote-unavailable` on timeout; session-init continues
    - Additive config: new `session.init_pull.worktree` and `session.init_pull.notes`, each
      `manual | prompt | always`. `always` is not a valid value for `worktree` (validation rejects it).
      Defaults `prompt` for both
    - Master gate stays `session.remote_sync` — if disabled, both channels skip entirely
    - Probe layer reports state only; prompt/pull orchestration lives in the session-init workflow, not in the
      CLI probe surface
    - Worktree pull sequence precedes notes pull when both channels drift — notes ancestor walk depends on HEAD
      being current
    - Dirty working tree with remote-ahead: prompt warns explicitly; no auto-stash, no auto-pull override
    - Divergence non-blocking: surfaced as a distinct top-level orientation section (not folded under `Blockers`);
      session-init continues with local state; agent carries the divergence forward as an active constraint
    - `local-ahead` on worktree: no prompt (matches the asymmetry in `user.sync_push` — pushing is intentional,
      not a session-init concern); surfaces as a single informational line in orientation
    - No widening of `arc sync` — worktree drift is strictly a session-init-time concern; outside sessions users
      use plain `git` (`git fetch`, `git pull --ff-only`)
    - Tracking-ref strategy: `git fetch origin <branch>` safely updates `refs/remotes/origin/<branch>` without
      mutating HEAD or the local branch ref. No temp-ref gymnastics needed (contrast with notes, where temp-ref
      was required to avoid mutating the live local note ref)
    - No new persistent state file: worktree state is a pure git comparison (local HEAD vs tracking ref) — git's
      own refs are the state store. `.sync-state.json` remains user-notes-specific (disk-vs-manifest reconciliation)
    - Reporting honesty across surfaces: all user-facing notes-status outputs (session-init JSON envelope via
      5.0.c, `arc user status` and `arc sync` direction reporting via 5.0.d) carry a qualifier when the worktree
      probe indicates drift. A "clean" notes verdict stays accurate but is no longer misreadable as "fully
      up-to-date" when the check is bounded by a stale worktree

    - [x] **5.0.a Worktree sync state inspection (probe)**

        **Outcome:** `runWorktreeSyncStatus` shipped at `packages/arc-framework/src/lib/git/worktree-sync.ts`
        with companion 10-test unit suite at `__tests__/unit/git/worktree-sync.test.ts`. All 10 documented
        behaviors GREEN; 840/840 unit total. Result shape: `{state, ahead, behind, failureReason?}`. State
        enum: `skipped | clean | remote-ahead | local-ahead | diverged | no-upstream | detached-head |
        no-remote | remote-unavailable`.

        **Implementation decisions:**
        - `failureReason: "timeout" | "error"` (optional, omitted outside `remote-unavailable`) added to
          satisfy "distinguishing detail" for the fetch-error behavior — 5.0.c/5.0.d consumers can surface
          this without cluttering the basic state contract.
        - `GitExec` extended with optional `signal: AbortSignal` via new `GitExecOptions`; `gitExec`
          runtime forwards to `execFileAsync`. Backward-compatible (TS function-type variance).
          `GitExecOptions` re-exported from `lib/git/index.ts` alongside the worktree-sync types.
        - Probe sequence: detached-head check → upstream lookup → origin existence (only when upstream
          missing) → bounded fetch (`DEFAULT_FETCH_TIMEOUT_MS = 3000`) → ahead/behind count → classify.
        - `boundedFetch` helper isolates AbortController + timer; uses `signal.aborted` to distinguish
          timeout from other errors post-catch.

        **Test batching:** RED→GREEN in three rounds — (1) disabled short-circuit alone; (2) happy-path
        state mapping from counts (clean, remote-ahead, local-ahead, diverged share one classifier); (3)
        pre-fetch degraded states (no-upstream, detached-head, no-remote share short-circuit pattern);
        (4) fetch failure modes (timeout + error share the GitExec-extension concern). Per process-task-loop
        "batching judgment": tightly-coupled behaviors with no independent discovery value batched into
        their natural unit, RED-GREEN cycle preserved per round.

    - [x] **5.0.b Config schema + types for init_pull channels**

        **Outcome:** Flat-dotted keys `session.init_pull.worktree` and `session.init_pull.notes` parse,
        validate, and default to `prompt` end-to-end. TypeScript reader (`lib/config/status-reader.ts`)
        substitutes the documented default and surfaces a parse-time diagnostic in `ReaderResult.errors`
        for invalid enum values; on absence, records the key in `defaultsApplied`. Shell-side
        `validate-config.sh` rejects invalid values via per-key enum entries; the missing
        `session.remote_sync` enum was backfilled opportunistically.

        **Implementation decisions:**
        - Validation lives in the reader, not in `parseArcConfig`. New `ENUM_VALIDATORS` table in
          `status-reader.ts` carries the per-key allowed sets — extending the table is the way to
          add future parser-level enum checks. `parseArcConfig` stays a flat key/value reader.
        - Invalid values fall back to the documented default in `settings`, push to `errors`, but do
          NOT enter `defaultsApplied`. `defaultsApplied` keeps its meaning of "absent in the file";
          consumers reconcile via `errors` when they care about the substitution.
        - "Cross-field" rejection of `always` on worktree is achieved by separate per-key enum sets
          (worktree: `manual | prompt`, notes: `manual | prompt | always`) — no special-casing.
        - `ConfigSettings` grew from 13 to 15 keys; `ConfigSessionInitSettings` grew from 5 to 7.
          Hardcoded counts in two unrelated test fixtures (`status-format.test.ts`,
          `config-format.test.ts`) updated. Settings literals in `status/run.test.ts` and
          `status-format.test.ts` extended to keep `ConfigSettings`-typed fixtures complete.
        - Two-copy sync covers `arc-config.yml`, `validate-config.sh`, and the shell-side
          `known_keys` allowlist (also extended for the backfilled `session.remote_sync`).
        - `arc init` / `arc init --reconfigure` render both keys via the existing template +
          `renderConfigOverrides` pipeline — no init-prompt addition; both flow paths emit defaults.

        **Test batching:** All 7 reader behaviors batched into a single round (tightly coupled —
        single function, shared fixture, derive-validation-contract together). Envelope and init
        rendering tested as additive integration tests reusing fixture setup. Per process-task-loop
        "batching judgment".

        **Quality gates:** Tier 1 clean — `lint:ts`, `lint:sh`, `typecheck` (src + test),
        `test:unit` 849/849, full `npm test` 46/46 e2e+integration. Live
        `validate-config.sh` against `.arc/system/arc-config.yml` passes the new enum entries;
        smoke-tested rejection of `always` on worktree, unknown values on notes/worktree, and
        invalid `session.remote_sync` against a temp fixture.

    - [x] **5.0.c Composite probe envelope — worktree field + notes qualifier**

        **Outcome:** `arc status --session-init --json` carries a peer `worktree` slot alongside `user`,
        wrapped in `Probe<WorktreeSyncStatusResult>` like the other slots; `user.value` carries an optional
        `qualifier: "clean-at-current-head"` when the worktree probe says `remote-ahead` and the user probe
        says `clean`. All probes run in parallel via the existing `Promise.all` orchestration.

        **Implementation decisions:**
        - Cross-channel qualifier is computed in the composite (`runSessionInitStatus` post-processes the
          resolved slots) rather than in the user probe, because the user probe must remain independently
          reusable for `runStatus` and `arc user status`. The user probe doesn't need to know about
          worktree state; the composite owns the cross-slot reasoning.
        - `qualifier` is an optional field on `UserSessionInitStatusResult` — omitted (not `null`) when not
          applicable. New `UserSessionInitQualifier` type narrows the value space; future qualifiers can
          extend the union without changing the carrier shape.
        - `WorktreeSyncStatusResult` is the same shape produced by 5.0.a's `runWorktreeSyncStatus` — no
          slot-specific reshape; the probe value flows through unchanged.
        - Worktree slot positioned between User and Extensions in both the type ordering and the Clack
          formatter — the two channels are surfaced as a notes-vs-worktree pair, then the per-install
          probes follow.
        - Handler reuses the same `remoteSyncEnabled` flag for both probes — no second config read.

        **Test batching:** All 7 behaviors batched in a single round (orchestration concerns, single
        function, shared probe-fixture factory; no independent discovery value across slices). Per
        process-task-loop "batching judgment".

        **Quality gates:** Tier 1 clean — `lint:ts`, `typecheck` (src + test), `test:unit` 859/859, full
        `npm test` 46/46 e2e+integration, `npm run build` succeeds. Live `npx arc status --session-init
        --json` against the working tree confirms the envelope shape: `worktree` peer slot with
        `state: local-ahead, ahead: 3, behind: 0`, user slot has no qualifier (correct — worktree is
        `local-ahead`, not `remote-ahead`).

    - [x] **5.0.d CLI status reporting surfaces — worktree qualifier**

        **Outcome:** `runUserStatus` orchestrates the worktree probe in parallel with the existing notes/disk
        probes when `session.remote_sync` is enabled and `--offline` is not set; result is appended to
        `UserStatusResult.detailLines` (and surfaced as a peer `worktree` field on the JSON result for
        consumers). `arc sync` reads the same config gate and emits the qualifier as a `p.log.info` line via
        the shared `formatWorktreeQualifierLine` helper before action dispatch — so isolated CLI invocations
        no longer read "fully up-to-date" when the verdict is truthful only with respect to reachable
        ancestors. No new headline values; qualifier is purely additive detail.

        **Implementation decisions:**
        - Worktree probe call lives inside `runUserStatus`, gated on `!offline && remoteSyncEnabled` (added
          to `UserStatusOptions`). Reuses `io.exec` — no new injection points; keeps the layer testable via
          the same fake-exec pattern already established for the notes probes.
        - `formatWorktreeQualifierLine` is a pure helper exported from `commands/user/sync-status.ts` and
          re-exported through `commands/user.ts`. Both `arc user status` (via `buildUserStatusResult`) and
          `arc sync` (via the handler) call it — single source of truth for the qualifier vocabulary.
        - Offline branch: emits the skip note only when `remoteSyncEnabled === true`; disabled config stays
          silent. Distinguishes "user opted out for this run" from "feature not wired up".
        - `remote-unavailable` carries through to a softer "comparison unavailable" qualifier rather than
          silencing — the detail explains why the verdict is approximate.
        - Healthy non-drift states (`clean`, `local-ahead`, `no-upstream`, `detached-head`, `no-remote`,
          `skipped`) emit no qualifier — only `remote-ahead` / `diverged` / `remote-unavailable` carry
          actionable signal.
        - `arc sync` calls `runWorktreeSyncStatus` once alongside `inspectUserSyncState` via `Promise.all`,
          so the probe doesn't serialize behind the notes inspection.
        - `UserStatusResult.worktree` is optional — omitted when no probe ran, so existing JSON consumers and
          test fixtures don't need to know about the new field.

        **Test batching:** All 9 behaviors (8 status, 1 sync) batched in a single round — orchestration
        concerns over a single function plus a single handler, shared probe-fixture pattern, no
        cross-behavior discovery value. Per process-task-loop "batching judgment".

        **Quality gates:** Tier 1 clean — `lint:ts`, `typecheck` (src + test), unit suite 876/876 (was 859;
        +17 new across `user-status.test.ts` and `sync.test.ts`), full `npm test` 46/46, `npm run build`
        succeeds. Live smoke: `npx arc user status` (worktree clean → no qualifier), `npx arc user status
        --offline` (skip note rendered), `npx arc user status --json` (JSON envelope carries the new
        `worktree` peer field).

    - [x] **5.0.e Session-init workflow rewrite — Step 2/3/7/8**

        **Outcome:** `session-init.md` (both copies) now consumes the worktree envelope slot end-to-end.
        Step 2 envelope table documents the new `worktree` field (state vocabulary + `ahead`/`behind`
        semantics) and notes the cross-channel qualifier on the `user` row's `value.detailLines`; the
        `config` row was updated to list the two new `session.init_pull.*` keys. Step 3 renamed to
        "Conditional Sync Pulls" and split into two channel-keyed bullet lists with a dirty-tree
        porcelain precheck preceding any prompt and a combined-prompt section for the both-channels-
        remote-ahead case (worktree pulls first, notes envelope re-evaluated after); divergence routes
        to a non-blocking carry-forward, `local-ahead` to a single informational line. Step 7 grew a
        `Conditional top-level sections` block defining `Reconcile required:` (when diverged) and
        `Local-ahead:` (when local-ahead) as inserts above `Active work state:`, with literal text
        templates the agent can fill at orientation time. Step 8 trust hierarchy gained a Tier 1
        diverged-worktree example reinforcing git-as-ground-truth and the carry-forward treatment.

        **Implementation decisions:**
        - Worktree-first ordering for the combined prompt is documented as workflow contract, not just
          probe-layer behavior — the agent re-probes the notes channel after the worktree pull so the
          notes decision walks from the new HEAD (avoiding the stale-comparison case 5.0.c was designed
          to flag).
        - Combined prompt offers per-channel choices (`pull both / worktree only / notes only / skip`)
          rather than a single yes/no, preserving user control when one channel is dirty or one pull is
          undesired.
        - Mode handling delegates to envelope `config.value.settings` rather than re-reading config;
          both channel sections key on their respective `session.init_pull.*` value (`prompt` /
          `manual`, plus `always` for notes only — `always` is rejected for worktree per 5.0.b).
        - No auto-stash. Dirty-tree precheck adds explicit warning text to the prompt; user resolves
          manually before accepting. No `--autostash` flag, no clobber-stash fallback.
        - `Reconcile required:` placed above `Active work state:` (top-level peer of the work-state
          block, not folded under `Blockers`) so the constraint is visible immediately and the agent
          carries it forward as a session-scoped constraint against later commit/push requests.
        - `Local-ahead:` is a single informational line (not a multi-line section) — lower visual weight
          matches the lower urgency.
        - Tier 1 example keeps the diverged-worktree case in the auto-recover band rather than
          escalating to Tier 2 (which would halt session-init); the design is that the agent surfaces
          and proceeds, not that it stops.
        - No external doc references to the old "Conditional Sync Pull" name needed updating (verified
          by grep across `.arc/` and `packages/arc-framework/arc/`).

        **Two-copy sync:** `.arc/system/workflows/arc/session-lifecycle/session-init.md` and
        `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md`.
        Diff shows expected template-vs-rendered differences only (`{{REPO_ROOT}}` placeholder plus
        three `<!-- arc:if -->` conditional blocks for `team.mode` / `pm.mode`).

        **Quality gates:** Tier 1 — markdown lint clean on both copies (table alignment normalized via
        `markdown-table-prettify` after envelope-row additions broke MD060). No code changes; no test
        suite or build needed at this tier.

        **Streamlining pass:** Initial draft added ~50 net lines to session-init.md; post-review
        compression cut that to ~39 by removing duplicated narrative (worktree-first ordering stated
        in both opener and combined-prompt section), tightening verbose phrasing in the dirty-tree
        precheck, collapsing the diverged-bullet narrative that duplicated Step 7's carry-forward
        treatment, condensing the `Reconcile required:` template body (4 prose lines → 2), and
        trimming the Step 8 mismatch example. State vocabulary, mode→action mappings, and
        `remote-unavailable` failure-mode disambiguation kept verbatim — no operational meaning
        sacrificed.

    - [x] **5.0.f Integration test coverage**

        **Outcome:** Six integration scenarios shipped — four extending
        `__tests__/integration/status.test.ts` (composite envelope with the real `runWorktreeSyncStatus`
        replacing the prior stub at line 185), two extending `__tests__/integration/user.test.ts`
        (`runUserStatus` real-exec worktree drift). Suite counts: status integration 4 → 8 tests,
        user integration 37 → 39 tests. Full unit + integration + e2e suite remains green.

        **Composite-envelope scenarios (`__tests__/integration/status.test.ts` § "real worktree probe"):**
        - Worktree clean + bare-remote in sync → `worktree.state === "clean"`, ahead/behind 0/0,
          no qualifier on user
        - Bare remote ahead by 1 (`commit; push; reset --hard HEAD~1`) → `worktree.state ===
          "remote-ahead"`, `behind === 1`, `user.value.qualifier === "clean-at-current-head"`
        - No origin configured → `worktree.state === "no-remote"`, user channel independent
        - `remoteSyncEnabled: false` (proxy for `session.remote_sync: disabled`) → `worktree.state
          === "skipped"`, `user.state === "disabled"` (distinct vocabularies preserved per design)

        **`runUserStatus` real-exec scenarios (`__tests__/integration/user.test.ts` § "user status"):**
        - Bare remote ahead by 1 → `detailLines` contains "Worktree is behind origin by 1 commit(s).";
          `result.worktree.state === "remote-ahead"`, `behind === 1`
        - Same fixture with `offline: true` → `detailLines` contains "Worktree remote comparison
          skipped (`--offline`); reported state reflects local refs only."; `result.worktree`
          omitted (no probe ran)

        **Implementation decisions:**
        - Reused existing `Fixture` shape from `createFixture()` and added two thin helpers
          (`gitInit` running `git init` + identity config + initial empty commit; `pushToBareRemote`
          mirroring the published `addBareRemote` shape but local to the status suite). Kept these
          inline rather than promoting to `helpers/integration.ts` — both consumers live in one file
          and the existing helper is already exported for the user-suite pattern; consolidation is
          premature.
        - Drift production for the remote-ahead scenario uses `commit → addBareRemote → reset --hard
          HEAD~1` rather than `git update-ref` against the bare dir. Slightly more git operations
          but stays inside the same fixture cwd — no need to bind a second `gitExec` to the bare
          remote dir or compute commit hashes by hand.
        - User-channel state for the `remote_sync: disabled` scenario is supplied by the stub
          (`stubUserSessionInit(identity, "disabled")`) — proves the orchestrator doesn't synthesize
          the `disabled` state itself, which is correct: that's the user probe's responsibility per
          5.0.c's separation-of-concerns decision.
        - The `runUserStatus` tests assert against `result.worktree` (typed peer field) plus
          `detailLines` rather than rendered summary text — same convention as the unit suite.

        **Pre-existing coverage cross-referenced (not duplicated):** Per-state classifier matrix at
        `__tests__/unit/git/worktree-sync.test.ts` (10 tests); composite orchestrator wiring +
        qualifier propagation at `__tests__/unit/status/run.test.ts` (6 tests); `buildUserStatusResult`
        qualifier vocabulary + `--offline` substitute + remote-unavailable softening at
        `__tests__/unit/user-status.test.ts`; `handleSync` qualifier emission at
        `__tests__/unit/sync.test.ts`. Fetch timeout / error fault injection kept unit-only — cannot
        be reproduced reliably at integration tier without partial exec mocking. `arc sync`
        integration kept out of scope — `p.log.info` emission is only assertable with the Clack
        mocks already plumbed at unit tier.

        **Test batching:** All 6 scenarios batched per process-task-loop "batching judgment" —
        tightly coupled (single integration tier, fixture-builder pattern, no independent discovery
        value across slices). Configured-state setup dominates per-test time; one-at-a-time would
        just multiply scaffolding without surfacing additional behavior.

        **Quality gates:** Tier 2 — `lint:ts` clean, `lint:md` clean (223 files), `typecheck` (src +
        test) clean, full `npm test` 46/46 (8 e2e + integration files), `npm run build` succeeds.
        Status integration: 8/8; user integration: 39/39.

    - [x] **5.0.g Documentation + ADR + config comment sync**

        **Outcome:** ADR-012 amendment (2026-04-25) added — distinguishes worktree from notes channel
        as peer concerns at session-start, names per-channel governance keys (`session.init_pull.*`),
        documents the worktree-channel `always`-mode rejection, and points at session-init.md for the
        combined-prompt logic. `arc-config.yml` inline comments (both copies) now carry a one-line
        cross-reference to session-init.md § Conditional Sync Pulls on each `session.init_pull.*`
        block — terse, with deeper rationale deferred to the ADR per the design note about
        future-proofing against a possible `notes` rename. `arc user status` CLI help text updated:
        main description names the worktree-drift qualifier; `--offline` description clarifies that
        both probes are skipped. Release-notes-style writeup redirected to plan-docs-content-sweep.md
        (§ Content Contributions #7) — this project doesn't ship release notes in-repo, and the docs
        site is the public-facing surface for "what's new" copy. Cross-reference scan turned up no
        other docs referencing `session.remote_sync` or Phase 3.R.e behavior outside the WU's own
        notes/tasks files.

        **Implementation decisions:**
        - ADR-012 amendment placed after the 2026-04-22 amendment (chronological sequence preserved)
          and uses the same structural shape as the prior amendment block. Frames worktree-as-distinct
          channel without superseding the notes-channel decision — both coexist as peer governance
          surfaces under the unified user-directory model.
        - `arc-config.yml` cross-reference is a single line per channel block, not a re-explanation of
          modes (modes are already documented in the existing comments). One-line addition keeps
          future renames (e.g., `session.init_pull.notes` → `session.bootstrap.*` per Phase 6 gate-model
          consolidation) a trivial edit.
        - `arc user status` description change is minimal — appended a parenthetical, did not bloat
          the line. `addHelpText("after", ...)` was considered but skipped: no other command in cli.ts
          uses it, and adding the first instance for a single qualifier is disproportionate. The
          worktree-drift qualifier appears in actual command output; help text just signals that it
          exists.
        - "Soft `remote-unavailable` fallback" omitted from CLI help — that's implementation behavior
          (5.0.d auto-degradation when probe times out), not a user-facing flag. Documenting it in
          help would be awkward and out of register with other `--help` text.
        - plan-docs-content-sweep.md entry follows the established "Content Contribution" shape from
          #5 (agent-native positioning): what changed / input type / suggested destinations /
          authoritative sources / nuance. Numbered #7 per shared-sequence convention (last entry was
          Drift Item #6). Document History row added.

        **Two-copy sync:** `arc-config.yml` (both copies) — diff confirms expected project-specific
        value overrides only (`branch.protection`, `hooks.test_patterns`, `hooks.meta_ref_patterns`),
        no comment-block divergence. ADR-012 lives in `.arc/reference/adr/` only (package source has
        only README.md under `packages/arc-framework/arc/reference/adr/`).

        **Quality gates:** Tier 2 — markdown lint clean (223 files), `lint:ts` clean, `typecheck`
        (src + test) clean, `test:unit` 876/876, full `npm test` 46/46 (8 e2e + integration files),
        `npm run build` succeeds. CLI smoke test (`npx arc user status --help`) confirms the new
        description renders cleanly.

- [x] **5.1 QUICK-REFERENCE partial-read at session-init + template structural alignment**

    **Goal:** Session-init reads only `## Environment & Path Context` (subsumes the `### Runtime Environment`
    H3 nested inside it). Other sections — `Command Patterns`, `Quality Gate Commands`, `ARC CLI Commands`,
    `npm Publishing` — load on demand via existing prose pointers in workflows. No new structural trigger
    contract: QUICK-REFERENCE is reference material consulted ad-hoc, not behavior injected at workflow steps.

    **Design decision (resolved pre-implementation):** Hybrid favoring strategy-index-style awareness — load
    `## Environment & Path Context` always; rely on existing prose pointers (`rotate-branch.md`,
    `integrate-planning-branch.md`, `deactivate-work-unit.md`, etc.) for everything else. Rejected: (A)
    structural Phase-1-style triggers (overkill — methods/extensions earn their declaration contract because
    workflows must inject behavior at deterministic points; QUICK-REFERENCE doesn't drive behavior),
    (C) full-load with content tightening (template already clean and agnostic; populated `.arc/` value not
    worth tightening if the section isn't always loaded). Captured in `notes-session-init-optimization.md`
    § Phase 5 Partial-Read Design Decisions.

    - [x] **5.1.a Session-init.md narrowing**
        - Step 4 item 7 reshaped to **section-level partial read**: `## Environment & Path Context`
          only (subsumes `### Runtime Environment`)
        - Reading-rule preamble updated to enumerate both partial reads (item 7 + item 10) so the
          full-read default still reads cleanly
        - Two-copy sync verified byte-identical across `session-init.md` and `session-init.template.md`
          (Step 4 region diff clean)
        - Tier 1: `lint:md` clean on both modified files

    - [x] **5.1.b QUICK-REFERENCE template structural alignment**
        - Awareness note added inside `## Environment & Path Context` in both copies, placed between the
          repository-root frontmatter and `### Critical Path Reference`. Template variant lists the three
          framework-universal sections (`Command Patterns`, `Quality Gate Commands`, `ARC CLI Commands`);
          `.arc/` variant additionally names `npm Publishing` (project-specific). Divergence intentional —
          template stays tech-stack-agnostic
        - Tier 2 slot inserted into `Quality Gate Commands` between T1 and T3 in the template — placeholder
          commands (`[md_lint_command_all]`, `[lint_command_all]`, `[type_check_command_all]`,
          `[test_command_all]`) matching the existing T1/T3 placeholder convention. `.arc/` already had T2
          populated — no edit needed there
        - Template re-verified bare-bones: no Prettier section, no MD060 tooling, no `npm Publishing`, no
          project-specifics. Section-heading shape now matches across both copies (T1 + T2 + T3 symmetric)
        - Tier 1: `lint:md` clean on both modified files

    - [x] **5.1.c Verify callers**
        - Workflow-tree grep hit ~30 `QUICK-REFERENCE` mentions across `.arc/system/workflows/`,
          `.arc/reference/strategies/`, `.arc/reference/constitution/`, plus package counterparts.
          Triaged into: load-on-demand pointers (the in-scope target for promotion),
          file-level/meta-descriptive references (file purpose, classification, capture-routing
          targets), and initial-setup workflows (which create QUICK-REFERENCE rather than load it)
        - **Bare pointers promoted to `§ Platform Commands`** (joining the
          `rotate-branch.md:42` pattern):
            - `system/workflows/arc/work-unit-lifecycle/deactivate-work-unit.md` (line 58 code-block
              comment)
            - `system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md`
              (line 75 platform note)
            - `reference/strategies/arc/strategy-configurability-architecture.md` (line 147 agent
              discovery; line 371 platform-notes meta-prose preceding the canonical example;
              line 392 platform config setting)
        - **Out of scope (descriptive/capture-routing references — left untouched):**
          `session-handoff.md:266` and `integrate-external-content.md:106` (where to _write_
          durable lessons, not where to read them); `02_define-project.md` and
          `01_verify-and-configure.md` initial-setup mentions; `strategy-quality-gates.md`,
          `strategy-session-operations.md`, `strategy-package-project-sync.md`,
          `strategy-file-classification.md`, `strategy-testing-methodology.md`, and
          remaining `strategy-configurability-architecture.md` mentions describing
          QUICK-REFERENCE's role rather than directing a load
        - **Platform Commands conditional-rendering gap** (workflows naming `§ Platform Commands`
          while the section is gated `platform.type != github`) remains captured in
          `user/andrew/ATOMIC-INBOX.md` — orthogonal to caller verification; needs framework-level
          decision on conditional-section pattern
        - All edits two-copy synced (`.arc/` ↔ package source); per-file diffs clean
        - Acceptance met: every workflow-tree QUICK-REFERENCE load-pointer either inlines the
          content directly or names the section

- [x] **5.2 Task list preamble shape codification + one-time cleanup**

    **Goal:** PRD becomes canonical for Scope (Will Do / Won't Do); task-list `## Overview` and `## Scope`
    blocks collapse into a one-line `**Purpose:**` field in the Header; phase-preamble shape codified so the
    boundary contract in 5.3 lands on a tightened authoring spec rather than ratifying current sprawl.

    **Rationale:** PRD is canonical for Scope but isn't loaded at session-init; task lists currently mirror PRD
    Scope as the every-session-read derivative — inverting the canonical hierarchy. The on-demand-via-prose-pointer
    pattern from 5.1 (`§ Platform Commands`) extends naturally: task-list Header carries a one-line Purpose
    summary; agent loads PRD § Scope when scope decisions arise. Boundary contract in 5.3 becomes Header +
    current phase preamble + current task — significantly leaner than the prior shape (Header, Overview, Scope,
    phase preamble, current task).

    - [x] **5.2.a Authoring shape edits**
        - `template-tasks.md` (both copies): Feature/Technical skeleton dropped `## Overview` and `## Scope`
          blocks; added `**Purpose:**` one-line field to the Header bullet list (after PRD / Branch / Base
          Branch). Prose intro for the variant updated to name PRD as canonical for Scope. Incidental
          variant untouched
        - `strategy-task-list-formatting.md` (both copies): § Task List Headers — Feature/Technical bullets
          gained a `**Purpose:**` line; Incidental bullets call out `## Context` replacing the Purpose
          field and explicitly retain `## Scope`; the "Both variants: `## Scope`" wrap-up rewritten to drop
          Scope (now Incidental-only). Added new `### Phase Preamble` sub-section under Format Elements
          Reference, slotted between Phase Headers and Parent Tasks: required `**Purpose:**` line, optional
          `**Design decisions:**` block linking to `notes-{name}.md`, ~12-line soft cap
        - `2_generate-tasks.md` Step 4 checklist (both copies — `.template.md` paired): two new items at the
          top of the checklist — Header `**Purpose:**` field (with Feature/Technical vs. Incidental
          carve-out) and phase-preamble shape. § Task List Format parenthetical refreshed from
          "(Overview, Scope, Tasks, Verification Phase, Atomic Tasks, Success Criteria)" to
          "(header with Purpose, Tasks with phase preambles, Verification Phase, Success Criteria)"
        - All three pairs verified in sync (workflow pair differs only on the expected team-mode toggle
          blocks); Tier 1 markdown lint clean across all six files

    - [x] **5.2.b One-time cleanup**
        - Active + backlog swept (per-session decision; archive deferred — `2025-q4` historical, `2026-q1`/`q2`
          declined for shape consistency since they don't pay session-init cost)
        - This task list: Overview + Scope collapsed into Header `**Purpose:**` (one wrapped sentence);
          notes-file pointer dropped (companion-file convention codified in template); Phase 5 preamble
          compressed 15 → 9 lines, factoring out per-task enumeration and per-task two-copy reminders.
          Phases 1, 2, 3, 6, 7 already under cap; Phase 3.R fully complete (preserved historical Origin
          paragraph); Phase 4 carries operational audit-heuristic guidance applied per-subtask — justified
          soft-cap overrun, left as-is
        - `tasks-arcd-rebrand.md` (backlog): Overview + Scope collapsed; the Multi-branch structure
          paragraph dropped (duplicates the structured Branch(es) header bullet); Activation-time
          reconciliation blockquote preserved (operational); Phase 2 lightly tightened by combining the
          Commit-granularity note into a Design decisions block and inlining Branch — still over cap due
          to inline guardrails A–F cheat sheet (operational reference, justified)
        - Orphan `[work-org]` link reference removed after Multi-branch paragraph deletion. Tier 1
          markdown lint clean on both files. No two-copy sync — both files are project instances

- [x] **5.3 Task list partial-read narrowing**

    **Outcome:** `session-init.md` Step 4 item 10 reshaped to a three-section boundary contract
    (Header + current phase preamble + current task) replacing the prior "first ~100 lines" heuristic.
    Phase preamble located via task-identifier-derived lookup — strip the leaf segment (`5.3` → `5`,
    `3.R.e` → `3.R`), grep `^### \*\*Phase {id}:\*\*`. **Preamble boundary contract** documented
    inline at bullet 2: from the phase heading line through the line immediately before the first
    `- [ ]` / `- [x]` bullet; multi-paragraph framing (Purpose, Design decisions, Rationale) included,
    task entries excluded. Two-copy synced (`.arc/` + `.template.md`); Tier 1 markdown lint clean.

    **Design decisions:**
    - Phase identifier derived from task identifier rather than surfaced via the composite probe or
      stored as a dual pointer in the status file. Probe-computed line numbers couple the CLI to
      markdown structure (parser obligation grows with task-list shape evolution); dual pointers add
      an authoring obligation triple-anchor was designed to avoid. Net cost is two ops at
      session-init — micro-optimization not worth the structural coupling
    - Line-hint-independence inline guardrail (per original task spec) dropped — read as author-facing
      meta-commentary, not runtime-actionable. Graduated lookup step 1 ("Jump to the line hint") is
      self-sufficient; line numbers are absolute by convention. Documented here as a design invariant
      rather than workflow-body content

- [x] **5.4 Status file partial-read narrowing**

    **Outcome:** `session-init.md` Step 4 item 8 lead paragraph rewritten — "resolve from `active.value`
    and read in full" → "resolve from `active.value` and partial-read the `## Active Work` section
    (heading line through the last `**Field:**` line)". Added two sub-bullets after the resolution
    branches: **Read scope** enumerating load-bearing + optional fields, and **Contract boundary**
    requiring any session-init-relevant content to live inside `## Active Work`. Combined with Phase 4.2's
    `template-status.md` cleanup, the partial-read is the durable guard against future authoring drift —
    template content outside the section can't leak into session-init load. Two-copy synced; Tier 1
    markdown lint clean.

- [x] **5.5 DEV-RULES section-level partial-read evaluation (per-rule)**

    **Outcome:** All four candidates evaluated against the strict reliability bar (clear trigger, detectable at
    session-init, agent doesn't need pre-awareness to consult). Dispositions: all `up-front-load`. Default holds; no
    structural change to `session-init.md` Step 4. Per-section rationale: **DEV-RULES.ARC § Task Execution** — § Leave
    it cleaner subsection is universally applicable, sub-section partial-read complexity exceeds benefit on 89-line
    section. **DEV-RULES.ARC § Leave it cleaner** — universal trigger (any session may surface routable issues), no
    detect-at-init signal, agent unawareness causes silent under-routing. **DEV-RULES.PROJECT § Quality Gates** — gate
    awareness needed for any commit (planning, incidentals, task work all hit Tier 1); short policy framing (~27
    lines). **DEV-RULES.PROJECT § Package-Project Sync** — self-hosting context makes framework edits nearly universal;
    pre-commit hook is fallback, not primary defense.

    **Process deviation:** Original 5.5.b ("Record dispositions in notes file") deferred — rationale captured in commit
    message instead. Notes-file step would have been write-once-read-never given immediate execution by 5.5.c; judgment
    call to skip the intermediate documentation overhead.

    **Adjacent finding** (captured to `atomic-session-init-optimization.md`): DEV-RULES.ARC § Task Execution "One task
    at a time" subsection duplicates process-task-loop's Task Implementation lead + Completion protocol. Trim
    opportunity (~6-8 lines) is content-tightening, not partial-read narrowing — outside 5.5 scope.

    - [x] **5.5.a Evaluate candidate sections** — Done; all four → up-front-load (per Outcome above).

    - [~] **5.5.b Record dispositions in notes file** — Deferred; rationale captured in commit message instead.

    - [x] **5.5.c Apply dispositions** — No-op. All dispositions `up-front-load` → no structural change.

- [x] **5.6 Companion-file paths in composite probe**

    **Goal:** Composite probe (`arc status --session-init --json`) surfaces companion-file paths
    (`notes-{stem}.md`, `atomic-{stem}.md`) directly in `active.value`, eliminating the agent-side
    directory listing currently required at session-init item 10's "Companion file awareness" sub-bullet.

    **Rationale:** Pattern parallel to 5.0 (worktree-sync probe surface). Agent-side `ls` of the task-list
    directory at orientation is one Bash call we can avoid by surfacing resolved paths in the probe envelope.
    Net savings: small but consistent with the "let probe carry orientation-relevant state" principle.

    **Lite-mode deferral:** Companion-name derivation here is Full-layout only (`tasks-{stem}.md` filename
    pattern). Lite-shape task lists (e.g., `tasks.md`) → `companions` field omitted, signaling no
    companion-resolution attempted. Lite's overall composite-probe shape (likely a separate path entirely,
    given Lite's single-work-unit model) and companion-file conventions get settled during the ARC Operating
    Modes WU — callback note added to `plan-arc-modes.md` header.

    - [x] **5.6.a Companion resolution + envelope shape (test-first)**

        **Outcome:** `ActiveSessionInitResult` carries optional
        `companions?: { notes: string | null; atomic: string | null }`. Population gated to the `single`
        branch with Full-pattern task-list filename — no extra I/O on `multiple`/`none` paths or
        non-matching filenames (Lite `tasks.md`, `[none]`). Derivation in `resolveSessionInit`
        (`commands/active/status.ts`) reads the `**Task List:**` value verbatim, regex-matches
        `^tasks-(.+)\.md$` to extract stem, stats `notes-{stem}.md` / `atomic-{stem}.md` in the same
        directory, emits paths relative to cwd (forward-slash normalized) or `null` per file.
        `buildActiveSessionInitSummary` renders only present (non-null) companion paths under the
        `Resolved:` line; absent companions field or both-null inner values render no extra lines.

        **Test coverage:** All 9 behaviors covered. Integration tests in
        `__tests__/integration/active.test.ts` exercise the seven resolution × companion-presence
        permutations (both / notes-only / atomic-only / neither / Lite-shape / multiple / none) plus a
        `[none]` task-list edge case; composite carry-through verified in
        `__tests__/integration/status.test.ts`. Formatter coverage in
        `__tests__/unit/active-format.test.ts` exercises the five rendering shapes.

        **Batching rationale (test-first judgment):** Behaviors tightly coupled around a single derive
        helper + parameterized fixture pattern; design parallels the existing single/multiple/none
        resolution branch already shipped. One-at-a-time slicing would only multiply scaffolding
        without independent discovery value.

        - [x] Both companions present → both paths populated, relative to cwd
        - [x] Only notes present → `notes` path populated, `atomic: null`
        - [x] Only atomic present → `atomic` path populated, `notes: null`
        - [x] Neither present → `companions: { notes: null, atomic: null }` (still emitted)
        - [x] Lite-shape task list (`tasks.md`) → `companions` field omitted entirely
        - [x] `resolution === "multiple"` → `companions` field omitted
        - [x] `resolution === "none"` → `companions` field omitted
        - [x] Composite probe envelope (`runSessionInitStatus`) carries `companions` through unchanged
        - [x] `buildActiveSessionInitSummary` renders companion paths when present, omits cleanly when absent

    - [x] **5.6.b Session-init.md item 10 simplification**

        **Outcome:** "Companion file awareness" sub-bullet rewritten to reference
        `active.value.companions` instead of directing the agent to scan the task-list directory.
        Two-copy sync applied to both `.arc/system/workflows/arc/session-lifecycle/session-init.md`
        and `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md`.

- [x] **5.7 Agent file surface removal + `system/briefs/` rename**

    **Goal:** Retire the `{AGENT}.ARC.md` surface entirely (seven package per-agent templates, session-init load,
    init/add-agent scaffolding, schema hook coverage) and rename the containing directory `system/agent/` →
    `system/briefs/` with file-level rename `AGENT-BRIEFING.*.md` → `AGENT-BRIEF.*.md` to match the retained
    session-init briefings.

    **Rationale:** Pressure-test during 4.2.b setup concluded the `{AGENT}.ARC.md` surface has no valid
    ARC-exclusive use case. Candidate content across months of self-hosting fell into three buckets: (a) link
    blocks duplicating already-loaded docs, (b) harness-layer behavior (bash auto-approve quirks, sandbox
    escalation) that belongs in the harness-level file, (c) sub-agent / MCP guidance that's agent-system-prompt
    territory and makes no ARC reference. Harness-level files (`CLAUDE.md`, `AGENTS.md`, `.gemini/GEMINI.md`,
    etc.) dominate on every dimension: load order (pre-session-init), always-in-context (system prompt), and
    agent-specific by design (each harness reads its own file). Keeping `{AGENT}.ARC.md` as a scaffolded-empty
    surface is a false affordance — the empty set for "ARC-aware agent-specific guidance that can't live in the
    harness file" is real. Removal is reversible: if such content ever emerges, adding back a directory + one
    session-init line is cheap.

    Post-removal, `system/agent/` contains only the three session-init briefings (`AGENT-BRIEFING.ARC.md`,
    `.PROJECT.md`, `.CONTRIBUTOR.md`). Directory name becomes misleading — invites sub-agent-housing mental
    model, misaligned with its actual category (orientation documents). Rename to `briefs/` with file-level
    `AGENT-BRIEF.*.md` pairing for cleaner paths and semantic accuracy (`brief` = foundational orienting
    document; noun-noun reads cleaner than "briefing" noun-verb).

    **Superseded scope:** The pre-revision scope ("conditional-load via `active` frontmatter for agent files") is
    retired — the pattern was scoped specifically to `{AGENT}.ARC.md`, which no longer exists. No other
    session-init-loaded files ship as unpopulated templates (briefings all carry real content), so the
    pattern has no remaining application. If such a candidate emerges in future work, the pattern can be
    derived fresh at that point; preserving it here without a use case is premature abstraction.

    **Pre-implementation audit (completed 2026-04-25):** Audit findings folded back into the
    subtasks below. Resolved decisions:

    - **Agent classification path:** retire entirely — delete `frontmatter/agent.ts`,
      `__tests__/unit/frontmatter/agent.test.ts`, agent test cases in
      `validate-frontmatter.test.ts`, and remove the `agent` branch + `AGENT_PATH`/`AGENT_NAME`
      regexes + dispatch case in `validate-frontmatter.ts`. With no remaining `{AGENT}.ARC.md`
      files, the classification has no live callers; retiring avoids surface accumulation.
    - **Execution order:** 5.7.b → 5.7.f → 5.7.a → 5.7.c → 5.7.d → 5.7.e → 5.7.g → 5.7.h → 5.7.i.
      5.7.b first (docs-only) eliminates in-flight session-init mismatches before file deletes.
      5.7.f next (recipe-only) so `init-recipe.json` stops referencing per-agent templates +
      `template-agent.md` before 5.7.a deletes those source files — preserves test-suite green
      across each task boundary. 5.7.f scope reduced to recipe cleanup only; the briefs-path
      renames originally listed under 5.7.f migrate into 5.7.c (where they co-locate with the
      directory rename they depend on).
    - **5.7.g re-scoped:** add-agent.md scaffolding step already retired in commit `27174b8`
      (Task 4.5.d, 2026-04-24). Workflow today is in the desired post-pivot shape — 5.7.g
      reduces to path/filename updates already covered by 5.7.d.
    - **Recipe surface:** 5.7.f's primary edit target is `packages/arc-framework/init-recipe.json`
      (per-tool conditions + `template-agent.md` include + briefs path rename). Source-code init
      flow (`init.ts`) reads the recipe; code edits limit to the post-init message string.
    - **Tools-prompt semantics rename** (harness vs agents) captured to ATOMIC-INBOX.md as a
      follow-on; not blocking 5.7.

    - [x] **5.7.a Package per-agent source removal + agent classification retire**

        **Outcome:** Retired the `{AGENT}.ARC.md` source surface and its
        classification path in a single commit. Deleted seven per-tool templates
        from `packages/arc-framework/arc/system/agent/` (CLAUDE, CODEX, COPILOT,
        CURSOR, GEMINI, WARP, WINDSURF) and both `template-agent.md` copies
        (`.arc/` + package source). Removed seven entries from
        `CONFIGURABLE_FILES` in `classification.ts`; the
        `AGENT-BRIEFING.PROJECT.template.md` entry stays for 5.7.c's rename.

        Deleted `lib/frontmatter/agent.ts` and its `__tests__/unit/frontmatter/`
        sibling. Pruned `parseAgentFrontmatter` and the `AgentFrontmatter` /
        `AgentParseResult` re-exports from `frontmatter/index.ts`; updated the
        module doc comment. In `validate-frontmatter.ts`: dropped `agent` from
        `PathClassification`, removed `AGENT_PATH` / `AGENT_NAME` regexes, the
        `classifyPath` agent dispatch, the `validateFiles` agent branch (now an
        `else` falling through to domain-rules since `other` short-circuits), and
        refreshed the module + `classifyPath` doc comments.

        **`includes` operator retirement (in-flight scope expansion):**
        With per-tool agent files retired, the only consumer of the recipe
        `includes` operator was gone — both `init-recipe.json` and template
        `<!-- arc:if -->` blocks gate exclusively on `==` (and templates
        also `!=`). Surfaced when reviewing the test fixtures the cleanup
        otherwise required: examples like `tools includes claude →
        system/example-claude.md` were testing a code path with no
        production consumer. Pulled the operator retirement into this
        commit rather than deferring. `template/recipe.ts`:
        `CONDITION_PATTERN` regex narrowed to `==` only,
        `validateRecipe` error message updated, `evaluateCondition` doc +
        body collapsed to equality. `template/render.ts` header doc
        re-noted the recipe/template operator split.

        Test-surface updates (combined retirement of agent files +
        `includes` operator):
        `validate-frontmatter.test.ts` lost `validAgent`, the agent
        classification test, the AGENT-BRIEFING-as-other test (no longer
        meaningful — no agent special-case to negate), the per-schema-README
        test's agent line, the agent-file diagnostic test, and the agent
        fixture in the multi-file diagnostics test (replaced with an
        extension fixture).
        `recipe.test.ts`: dropped the "accepts conditions with includes
        operator" schema test and all five `evaluateCondition` includes
        tests (single-item, multi-item, no-match, no-substring,
        missing-key). The `validRecipe` factory's `tools includes claude`
        fixture removed entirely (no replacement needed).
        `unit/init.test.ts`: both `minimalRecipe` fixtures lost their
        `tools includes` conditions; the dedicated
        "includes tool-conditional files when tool is selected" test
        deleted; the fresh-mode test's "Conditional file included"
        expectation removed (token rendering and programmatic write
        coverage retained — conditional resolution stays covered by
        `resolveFileList` tests above and integration/e2e suites). The
        `classifyFile` Configurable assertion for `CLAUDE.ARC.md` removed,
        `not.toContain("CLAUDE.ARC.md")` assertion removed.
        `integration/init.test.ts` "excludes unselected tool agent files"
        deleted wholesale — premise gone.

        Manifest sync: `.arc/system/.internal/manifest.json` purged of
        `template-agent.md` and the two stale `system/agent/{CLAUDE,CODEX}.ARC.md`
        entries (the seven per-agent files were never in `.arc/`, but two
        manifest entries lingered as stale Configurable references).

        **Deferred per spec phasing (5.7.c–e):**
        `validate-package-neutrality.test.ts:110` (`agent/README.md` path) —
        belongs with the directory rename in 5.7.c; left untouched here.
        `validate-links.test.ts:238,250` (`template-agent.md` /
        `AGENT-BRIEFING.ARC.md` fixture filenames in tmpdir) — fixture-only,
        defer to 5.7.c per session-notes coupling.
        Workflow content in `01_verify-and-configure.md` still references
        `[template-agent]` and the `{AGENT}.ARC.md` configuration step;
        retiring belongs to 5.7.d (cross-reference + content updates).
        Hook-only validate-links scope means staged-file checks pass in the
        interim — the dangling reference doesn't surface until 5.7.d stages
        that file. The `agent/README.md` content listing the seven retired
        files belongs to 5.7.e (subdir README rewrite). Strategy-doc text
        references (`strategy-session-operations.md`,
        `strategy-configurability-architecture.md`,
        `strategy-file-classification.md`,
        `system/agent/AGENT-BRIEFING.ARC.md:46`,
        `system/agent/AGENT-BRIEFING.PROJECT.template.md:52`) — all 5.7.d.

        **Tier 2 baseline:** 1099 tests / 8 files green (1054
        unit/integration plus 45 e2e), down 18 from the 1117 baseline:
        7 from `agent.test.ts` deletion, 3 from validate-frontmatter agent
        assertions, 1 from the tool-exclusion integration test, 1 from the
        schema-validator includes test, 5 from `evaluateCondition`
        includes-operator tests, 1 from the fresh-mode conditional-file
        test removal. typecheck + eslint clean; 214 markdown files clean
        (down one from 215 — `template-agent.md` gone). Build green.

    - [x] **5.7.b Session-init integration removal**

        **Outcome:** Removed Step 4 item 3 (agent-specific file conditional load) from
        `session-init.md`; renumbered items 4–11 → 3–10 throughout. Updated every
        renumber-impacted reference: Step 2 contributor cue (`skip items 7, 9–10 in
        Step 4`), reading rule (`item 6` / `item 9`), parallelism guidance (`items 1–6`,
        `item 8`, `item 9` / `item 10`), item 7's inner cross-refs (`Skip items 9–10`,
        SESSION-NOTES `item 8`), Contributor Session Path (`Items 1–6 are universal`,
        `Skip items 7, 9–10`). Dropped the `{AGENT}.ARC.md` row from
        `AGENT-BRIEFING.ARC.md` Key Documents table (row deletion only — closing pointer
        left for 5.7.d's rename sweep per spec scope). Updated `DEV-RULES.ARC.md` § When
        to Load Additional Guidance "session-init item 11" → "item 10" — stale-by-renumber
        cross-reference caught by the disambiguation scan. Two-copy sync across `.arc/` and
        `packages/arc-framework/arc/` (`session-init.template.md` and tracked siblings).
        Tier 1 lint clean (6 files, 0 errors).

    - [x] **5.7.c Directory and file renames**

        **Outcome:** Renamed `system/agent/` → `system/briefs/` in both
        trees and renamed all briefing files via `git mv` (8 rename ops;
        all staged as `R` rename operations preserving history).
        `.arc/system/briefs/`: `AGENT-BRIEF.{ARC,CONTRIBUTOR,PROJECT}.md`
        plus `README.md`. Package source:
        `AGENT-BRIEF.{ARC,CONTRIBUTOR}.md`,
        `AGENT-BRIEF.PROJECT.template.md`, `README.md`.

        Updated `CONFIGURABLE_FILES` in `classification.ts:74` to the new
        template path. Updated `init-recipe.json` unconditional
        `include_files` (4 entries: ARC, CONTRIBUTOR, PROJECT.template,
        README) — briefs-path migration absorbed from 5.7.f as scoped.

        **Test-surface scope expansion:** Path-existence-coupled
        assertions across the test suite required updates to keep
        green — broader than the two files 5.7.a deferred. Updated:
        `recipe.test.ts:21-22` (`validRecipe()` factory `include_files`),
        `__tests__/integration/init.test.ts` (`expectedDirs` list at
        line 96 plus 4 file-existence/path checks at 116, 271, 276, 407),
        `__tests__/unit/init.test.ts:272,279` (`classifyFile` assertions —
        would have flipped Configurable→Framework after the
        `CONFIGURABLE_FILES` Set change). The two explicitly-deferred
        files landed alongside: `validate-package-neutrality.test.ts:110`
        (`agent/README.md` → `briefs/README.md`) and
        `validate-links.test.ts:238,250` (fixture link targets
        `AGENT-BRIEFING.ARC.md` → `AGENT-BRIEF.ARC.md`; fixture source
        filenames left as-is — they test pattern-matching, not specific
        files).

        **Manifest sync:** `.arc/system/.internal/manifest.json` updated
        for 3 path entries (ARC, PROJECT, README); pristine hashes
        preserved (rename only, no content change). Note: the manifest
        carries no `AGENT-BRIEFING.CONTRIBUTOR.md` entry — pre-existing
        gap, not introduced here.

        **Deferred per spec phasing (5.7.d):**
        `src/commands/init.ts:291` post-init message string still says
        "system/agent/AGENT-BRIEFING.ARC.md" — explicitly listed under
        5.7.d source-code path strings. Tests asserting that message
        content (`init.test.ts:474`, `unit/init.test.ts:822,826,829`)
        therefore stay green and update with init.ts:291 in 5.7.d.

        **Tier 2 baseline:** 1099 tests / 8 files green, typecheck +
        eslint clean, 214 markdown files clean, build success.
        Test count unchanged from 5.7.a.

    - [x] **5.7.d Cross-reference + content updates**

        **Outcome:** Swept all live framework docs, source, hooks, and scripts
        for `system/agent/` and `AGENT-BRIEFING` patterns and renamed to
        `system/briefs/` / `AGENT-BRIEF`. Two-copy sync across `.arc/` and
        `packages/arc-framework/arc/` for every touched file.

        **Brief files self-references:** Updated titles (line 1) plus
        embedded references in `AGENT-BRIEF.ARC.md` (Key Documents table
        and closing pointer), `AGENT-BRIEF.PROJECT.md` and
        `AGENT-BRIEF.PROJECT.template.md` (closing pointers — also reframed
        the "agent-specific guidance" trailer to point at harness-level
        files (`CLAUDE.md`, `AGENTS.md`) instead of the retired
        `{AGENT}.ARC.md` surface), `AGENT-BRIEF.CONTRIBUTOR.md` (title).
        Pre-commit hook flagged the 3 link-syntax self-references; opportunistic
        cleanup of the prose-mention "harness-level" framing rode along.

        **Workflows:** `session-init.md` items 1, 2, 7 (contributor variant)
        paths; `add-agent.md` step-1 paths; `02_define-project.md` Step 3
        title + template path + maintenance bullet + "Next Step" mention +
        ref-link target; `maintain-project-docs.md` four `agent/`-prefixed
        path strings; `01_verify-and-configure.md` content section
        deletions per spec — Path 1 `**Agent config file:**` paragraph
        (lines 62-69), Path 2 bullet (lines 150-152),
        `[template-agent]` ref-link definition (line 186), plus `Path 2`
        Constitutional-documents prose mention rename.

        **Constitution + strategies:** `DEV-RULES.ARC.md` two prose
        mentions + ref-link target; `strategy-session-operations.md`
        T1 list (also dropped the now-obsolete "Agent-specific file"
        bullet — surface retired); `strategy-file-classification.md`
        examples list (dropped `CLAUDE.ARC` example), file-type prose
        examples, and template-suffix-stripping example;
        `strategy-package-project-sync.md` (project-only, no package
        counterpart) — table row, Framework templates list (dropped
        `template-agent.md` entry retired in 5.7.a), Framework system
        list, Configurable list (dropped `CLAUDE.ARC.md` and
        `CODEX.ARC.md` entries — files retired in 5.7.a), package-only
        section (entire "Init-selected agent files" subsection removed —
        no per-tool agent files remain), template counterpart list.

        **Reference + READMEs:** `META-PRD.md` Hub-spoke architecture
        bullet (also reframed "agent-specific files (CLAUDE.ARC.md, etc.)"
        to harness-level files outside ARC); `PROJECT-STATUS.md` two
        completion-history entries; `TECHNICAL-OVERVIEW.md` `Agent files`
        directory bullet rewritten as "Agent briefs" (per-agent files
        retired); `.arc/README.md` and `packages/arc-framework/arc/README.md`
        directory tree comment; `.arc/user/README.md` and package
        counterpart contributor briefing path; `template-contributing.md`
        contributor briefing path (both copies).

        **Skills + hooks + scripts + source:** `arc-setup/SKILL.md` brief
        path (both copies); `verify-integrity.sh` 4 direct path checks
        (lines 95-96, 254-255) plus check-message text (`Agent briefing` →
        `Agent brief`); `validate-links.sh` comment example (both copies);
        `pre-commit:351-352` comment cleanup — dropped agent-specific
        files mention (regex change at line 354 stays under 5.7.h);
        `init.ts:291` post-init message string literal +
        `init.test.ts:474` and `unit/init.test.ts:822,826,829` dependent
        message-string assertions.

        **Manifest sync:** Recomputed `.arc/system/.internal/manifest.json`
        pristine_hash for the 3 briefs entries — content (titles, footers)
        changed in this commit so the 5.7.c rename-only hashes were stale.

        **Deferred to 5.7.e:** `.arc/system/briefs/README.md` and package
        counterpart still carry full pre-removal architecture framing
        ("dual-hub pattern with tool-specific extensions", "What Belongs
        in Tool-Specific Files", per-tool template descriptions). 5.7.e
        rewrites this README wholesale; path-substitution alone would
        leave structurally obsolete prose. 34 grep matches remain there
        and clear under 5.7.e.

        **Tier 2 gates clean:** 1099 tests / 8 files green (test count
        unchanged), typecheck + eslint + shellcheck clean, 214 markdown
        files clean, build success.

    - [x] **5.7.e Subdir README rewrite**

        **Outcome:** Rewrote `system/briefs/README.md` wholesale in both
        trees (`.arc/` and `packages/arc-framework/arc/`). Retired the
        dual-hub + tool-files architecture framing, "Why Two Hub Files",
        "What Belongs in Tool-Specific Files", "Adding Files for Other
        Tools", "Tool-Specific Templates", and "When to Update
        Tool-Specific Files" sections — all obsolete under the
        `{AGENT}.ARC.md` removal. New README scoped to session-init
        briefings: opening line, How briefs work + Loading model paragraphs
        (matching `methods/README.md` and `extensions/README.md` style),
        per-file Files table (ARC + CONTRIBUTOR Framework, PROJECT
        Configurable, with role descriptions), customize-PROJECT adoption
        guidance, framework-managed note for ARC + CONTRIBUTOR, and
        "Agent-Specific Guidance Lives Outside ARC" section pointing at
        harness-level files (`CLAUDE.md`, `AGENTS.md`, `.gemini/GEMINI.md`)
        as the pre-session-init system-prompt surface for tool-specific
        guidance. Trimmed from 154 lines to 41 lines (~73% reduction).

        Both copies content-identical (`sha256: 98035b45…`); manifest
        `pristine_hash` for `system/briefs/README.md` recomputed
        (`487b9a12…` → `98035b45…`). Tier 1 markdown lint clean across
        both files; link check confirms `../workflows/arc/session-lifecycle/session-init.md`
        resolves.

        **In-flight correction:** initial draft framed contributor sessions
        as reading `AGENT-BRIEF.CONTRIBUTOR.md` _instead of_
        `AGENT-BRIEF.PROJECT.md`. Per session-init.md "Contributor Session
        Path" (lines 201–209), items 1–6 (which include both ARC + PROJECT
        briefs) are universal; CONTRIBUTOR loads _additionally_. Project
        orientation is just as relevant to contributors as maintainers.
        Corrected the "How briefs work" paragraph and the CONTRIBUTOR row
        in the Files table (role → "addendum" rather than "variant") in
        both copies.

        Vestigial-language scope check passed — grep for `AGENT-BRIEFING`,
        `system/agent`, `{AGENT}.ARC.md`, `dual-hub`, and "Tool-Specific
        Files" returns zero matches in either copy.

    - [x] **5.7.f `arc init` recipe cleanup**

        **Outcome:** Removed `reference/templates/template-agent.md` from
        `init-recipe.json` unconditional `include_files`; removed the seven per-tool
        conditions for `system/agent/{TOOL}.ARC.md` (claude, codex, gemini, copilot,
        cursor, windsurf, warp). Recipe now produces a clean install with no per-agent
        file scaffolding regardless of `--tools` selection; `tools` prompt remains
        intact (drives skill placement only). Briefs-path entries left untouched per
        scope split — they migrate in 5.7.c alongside the directory rename.

        **Test-surface scope expansion (in-flight):** Deleted two obsolete tests that
        asserted per-tool file install behavior — `installs CLAUDE.ARC.md
        (tool-conditional file)` in `__tests__/integration/init.test.ts` and `init
        with --tools claude,codex installs agent-specific files` in
        `__tests__/e2e/init.e2e.test.ts`. Both were recipe-driven assertions (not
        file-deletion-driven), so they belong with the recipe change rather than 5.7.a.
        Remaining file-existence-coupled test alignment (per-agent source presence,
        agent classification fixtures) stays under 5.7.a as originally scoped.

        Tier 2 gates clean: markdown lint (215 files, 0 errors), typecheck
        (source + tests), eslint, full test suite (1117 tests / 8 files) green.

    - [~] **5.7.g `add-agent.md` verification (no-op confirmed)**

        **Outcome:** No-op as anticipated by audit. Verified both copies
        (`.arc/system/workflows/arc/supplemental/add-agent.md` and package
        counterpart) carry zero residual references to `system/agent`,
        `AGENT-BRIEFING`, `{AGENT}.ARC.md`, or `template-agent` — the
        file-scaffolding step was retired in commit `27174b8` (Task 4.5.d)
        and path/filename updates landed in 5.7.d's cross-reference sweep
        (commit `f2c31f9`). Workflow shape is in the post-pivot form
        (orient → skills → restart). `diff -q` between the two copies
        confirms two-copy sync. No file changes.

    - [x] **5.7.h CHECK 12 hook revision**

        **Outcome:** Updated CHECK 12 in both `pre-commit` copies.
        Comment header (line 347) trimmed to "Frontmatter schema
        validation (methods / extensions)" — dropped `/ agent files`.
        Regex (line 354) narrowed to
        `grep -E '^(\.arc|packages/arc-framework/arc)/system/(methods|extensions)/'` —
        dropped the `|agent` alternation. Hook now skips invocation on
        briefs-only staged sets (regex no longer matches `system/briefs/`
        or any other path). `__tests__/unit/scripts/` coverage stayed
        green; full unit suite (1054 tests / 74 files) and e2e suite
        (45 tests / 8 files) green.

        **In-flight scope expansion (5.7.d misses caught by 5.7.i grep
        verification):** Pre-commit grep across live framework surfaces
        (per 5.7.i acceptance criteria) surfaced three references the
        5.7.d sweep missed. Folded into this commit since they
        structurally close the surface removal:

        - `strategy-session-operations.md:315-316` (both copies) —
          context-monitoring example "Agent-specific configuration files
          (e.g., CLAUDE.ARC.md)" updated to point at harness-level files
          (`CLAUDE.md`, `AGENTS.md`); concept retained, example reframed
        - `strategy-configurability-architecture.md:58-67` (both copies) —
          "Agent-specific files" row removed from the content-channel
          inventory table; "(except agent-specific templates)"
          parenthetical removed from the surrounding paragraph
          (ARC ships nothing per-agent now); column widths recompacted
        - `strategy-configurability-architecture.md:118-123` (both
          copies) — "Agent-specific file structure" row removed from the
          design-commitment conventions table; no width changes (agent
          row wasn't widest)

        **Tier 2 gates clean:** 214 markdown files (0 errors),
        eslint, typecheck, shellcheck clean, 1099 tests / 82 files
        green (74 unit/integration + 8 e2e).

    - [x] **5.7.i Sync verification + phase acceptance**

        **Verification bullets all green** (run during the 5.7.h
        commit unit boundary):

        - **Two-copy sync:** `diff -q` confirms identical content in
          both trees for `system/briefs/README.md`, `add-agent.md`,
          `pre-commit`, `strategy-session-operations.md`, and
          `strategy-configurability-architecture.md`
        - **Grep verification:** `grep -rn "AGENT-BRIEFING\|system/agent\|{AGENT}.ARC.md\|{TOOL}.ARC.md"`
          across `.arc/system/`, `.arc/reference/{constitution,strategies,templates}/`,
          `packages/arc-framework/{src,scripts,arc}/` returns zero
          matches. Remaining matches are confined to `reference/adr/`,
          `reference/analysis/`, `reference/research/`, and active-WU
          artifacts — all explicitly excluded per spec
        - **Phase-level acceptance:** `npm test` end-to-end clean
          (1099 tests / 82 files); markdown lint clean (214 files);
          CHECK 12 hook regex no longer matches briefs-only staged
          sets (skips invocation cleanly)

        **Release-notes bullet retired:** Original spec called for
        a `versions.json` entry documenting breaking changes for
        adopters. Superseded by `plan-arcd-rebrand` PRD (backlog) —
        that WU explicitly opts out of release-notes for the package
        transition (PRD § 209 "no changelog for the rename, no release
        notes"; § 328 "zero external adoption of `@arc-framework/cli@0.1.0`").
        First published `@arcd/cli` re-publishes fresh under the new
        name with all session-init-optimization breaking changes
        absorbed pre-publication — no migration audience exists.
        Matching WU-wide success criterion at the bottom of this task
        list also retired.

- [ ] **5.8 Session-init workflow Step 2/4/7 restructure**

    **Goal:** Batching structure, configuration check, and mismatch-handling prose all match Phase 4 audit outcomes and
    preceding Phase 5 changes (remote sync step, partial-reads, agent file surface retirement + briefs/ rename).
    - [ ] **5.8.a Step 2 batching**
        - Re-express Batch 1 / Batch 2 ordering given slimmed loadset
        - Update embedded examples (e.g., many-file disambiguation prompt) if they reference content that moved
        - Evaluate promoting SESSION-NOTES into Batch 1 (or a pre-batch slot after identity resolves).
          SESSION-NOTES carries persistent context and ad-hoc session guidance that can influence subsequent
          reads — loading it in Batch 2 may be structurally late. Identity-resolution prerequisite is already
          satisfied in Batch 1. Decision criteria: does any later load realistically change based on
          SESSION-NOTES content (persistent context, session-type prefix, one-off instructions)? If yes,
          promote; if no, current Batch 2 placement is fine.

    - [ ] **5.8.b Step 4 simplification (reduced scope after Task 3.5)**
        - Task 3.5.b already retired item 4.2 (method overrides). Remaining Step 4 scope: config values, platform
          awareness, custom commit patterns
        - Evaluate whether any further simplification is warranted post-Phase 4 audit (e.g., inline rationale that
          can move to staging). If none, collapse this task to a notes-file entry confirming Step 4 is at minimal
          scope

    - [ ] **5.8.c Step 7 tightening**
        - Mismatch-handling prose tightened; trust hierarchy preserved; no semantic change to auto-recover vs.
          stop-and-ask tiers

    - [ ] **5.8.d Init-time content audit — externalize rarely-triggered content**

        **Origin:** 3.R.k.f+g review observations. Post-restructure the 8-step workflow is structurally
        cleaner, but ~30-40% of its body is scaffolding or rarely-triggered branches loading every session
        for no operational benefit. Externalization candidates (per-candidate evaluation — not all warrant
        extraction):

        - **"Session lifecycle assumption" + "Design context" + "When to use" paragraphs** (~12 lines) —
          meta-commentary, zero init-time operational value. Fold load-bearing bits into
          `AGENT-BRIEFING.ARC § How ARC Works` (already every-session, appropriate home); drop from
          session-init
        - **Contributor Session Path blockquote (~25 lines)** — only fires when `role === "contributor"`.
          Maintainer sessions (most) read and discard. Candidate for extraction to separate doc loaded
          conditionally from Step 2's `identity.role` result
        - **Step 8 Trust Hierarchy (~45 lines)** — only fires when a mismatch is detected during init.
          Most sessions have none. Candidate for on-demand load; risk is latency when it IS needed.
          Consider lean stub in session-init ("if mismatch detected, load
          `session-init-mismatch-handling.md`") with full content externalized
        - **Item 9 "Load errors" sub-bullets** — detailed recovery for rare error classes (no note /
          corrupt / pull failure / stale file warnings). Candidate for on-demand load keyed on
          SESSION-NOTES load-error signal
        - **Step 2 probe-failure fallback** — only fires when the composite CLI call fails (CLI not on
          PATH, fresh clone pre-build). Lean stub + externalized detail

        **Evaluation factors per candidate:** frequency (how often the branch fires), urgency (can the agent
        tolerate an on-demand round-trip when it IS needed), size (is extraction worth the conditional-load
        overhead), cohesion (does the content form a coherent external unit).

        **Deliverables per extracted candidate:** new external doc or section in an existing every-session
        doc; session-init stub with named trigger referencing it; `strategy-session-operations.md` pattern
        documentation updates if the conditional-load mechanism itself evolves.

        **Scope note on 5.8.a / 5.8.b:** Those subtasks reference Batch 1/Batch 2 naming and separate
        Step 4 "Check Active Configuration" structures that 3.R.k.f+g retired. Phase 5 activation should
        refresh or consolidate their scope against the post-restructure workflow before executing.

    **Note:** Audit session-init.md for speed considerations alongside the structural restructure. Baseline:
    ~2 minutes from `/arc-resume` invocation to orientation summary (pre-optimization). Phase 1–4 reductions
    shrink wall-clock time naturally (less content to read and process); 5.8 is the moment to also evaluate
    structural speed wins independent of load-set size — unexploited batching opportunities, redundant checks,
    steps whose cost is dominated by serial tool calls rather than content. Apply low-risk wins inline during
    5.8.a–c; record larger opportunities as follow-ons.

    - Two-copy sync

- [ ] **5.9 Phase 5 close — Tier 2 quality gates**
    - Markdown lint, framework-sync, targeted re-run of session-init against a representative active task list (if
      available) to spot-check regressions

---

### **Phase 6:** Session-Type Conditional Loading

**Purpose:** Planning, execution, and integration sessions have different needs. The `Working On:` type prefix +
auto-inference delivers a per-type load set without forcing user ceremony. Empirical validation during the phase's own
task work confirms the minimal set suffices.

**Note:** Empirical validation (P2.6) is a running observation during Phase 6, not a distinct task — each Phase 6
subtask operates a specific session type, and observed insufficiency surfaces as an adjustment to the load-set
definition plus a notes-file entry.

- [ ] **6.1 `Working On:` type prefix formalized in SESSION-NOTES template**

    **Goal:** Template documents prefix pattern explicitly; agents writing handoff know the convention.
    - File: `packages/arc-framework/templates/user/SESSION-NOTES.md` (plus `.arc/user/` instances — note: gitignored, so
      only the package template ships)
    - Document prefix pattern: `[planning: name]`, `[execution: name]`, `[integration: name]`
    - Include one-line rationale inline (session-type awareness drives conditional load)

- [ ] **6.2 session-handoff writes the prefix explicitly**
    - Update `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` to instruct the agent to compute current
      session type and write the prefix
    - Type-resolution rules parallel Phase 6.3 inference (so handoff and init use the same logic, just in opposite
      directions)
    - Two-copy sync

- [ ] **6.3 Session-init inference logic (test-first)**

    **Goal:** When SESSION-NOTES is absent or prefix is missing, infer from active status file signals and branch state.
    - Placement: documented in `session-init.md` Step 2; if logic is non-trivial, extract to a CLI helper
      (`packages/arc-framework/src/lib/session-type/`) that agent can invoke

    Build `test-first` (one behavior at a time):
    - Explicit prefix in SESSION-NOTES → honored without inference
    - Active status file `**Task List:** [none]` + backlog/planning context → `planning`
    - Active status file with incomplete task list → `execution`
    - Active status file signals integration-ready → `integration`
    - Branch in integration phase (e.g., branch name matches integration convention) → `integration`
    - Between WUs with no active status file → `planning`
    - Genuinely ambiguous signals → prompt user (surface in session-init Step 6 orientation)

- [ ] **6.4 Per-type load set implementation**

    **Goal:** session-init Step 2 branches on resolved session type; loadset matches updated load model.
    - Update `session-init.md` Step 2 to key load decisions off the resolved session type
    - Loadset specification (updated post-3.5 — PRD P2.3 table refresh folded into Task 3.10):
        - All types: Items 1–7, active-extensions list (single grep per 3.5.b), SESSION-NOTES, active status file
          if present. Methods not loaded at init for any session type — they load at workflow trigger only
        - Execution + Integration only: Item 10 (task list partial read)
        - Core workflow: execution → `3_process-task-loop.md`; integration → `integrate-work-unit.md`; planning → none
          today, forward-compatible with `refine-plan-loop.md` if Expanded Planning Path WU lands
    - Two-copy sync

- [ ] **6.5 CLI template updates**

    **Goal:** `arc init` and `arc join` deliver updated SESSION-NOTES template to adopters and contributors.
    - `arc init` sources SESSION-NOTES from `packages/arc-framework/templates/user/SESSION-NOTES.md` (already done in
      6.1); verify initialization writes the template correctly
    - `arc join` uses same template; verify no structural divergence
    - Update any related CLI test fixtures if template content is asserted in tests

- [ ] **6.6 Session-type test coverage**
    - Unit: inference logic test cases from 6.3 (expand if new cases surface)
    - Integration: session-init with explicit prefix, with inferred prefix, with ambiguous signals (expected: user
      prompt)
    - E2E: fresh session-init across each type variant produces the correct load set (assert loaded files / skipped
      files per PRD P2.3)

- [ ] **6.7 Phase 6 close — Tier 3 quality gates + empirical observation note**
    - Full quality gate pass
    - Record empirical observation: did the minimal load set suffice for each session type operated during 6.1–6.6 work?
      Append to notes file. Any adjustments applied as revisions (R-scheme) to Phase 6 tasks

---

### **Phase 7:** Verification

- [ ] **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

    **Note:** The verification workflow conducts Tier 3 quality gates, success criteria validation, atomic task
    resolution, measurement (V.1 — tokens at orientation completion vs ~75–80k baseline; target ≥25% drop to ≤60k),
    audit quality spot-check (V.2 — 3–5 random extracted passages verified as operational vs non-operational), and
    late-session verification observation noted for the next task-executing WU (V.3 — organic, not synthetic).

---

## Success Criteria

- [ ] `arc-methods.md` and `arc-extensions.md` retired; replaced by per-file directories in `system/methods/` and
      `system/extensions/` (both copies)
- [ ] Session-init Step 2: methods not loaded at init (trigger-time only); extensions enumerated via single `grep`
      for `^active: true` producing the active-extensions list carried in session context; fire-point directives
      consult the list by name; method and extension bodies load on-demand at workflow trigger / fire point
- [ ] Reliable-trigger CI check (`npm run lint:arc`) active and passing on `main`; reads workflow frontmatter only
- [ ] All workflows under `system/workflows/**/*.md` carry schema-conformant YAML frontmatter (`audience`, `purpose`,
      `arc.methods`, `arc.extensions`); body-level "Method dependencies" prose preambles retired
- [ ] "Method and extension loading" subsection present in DEV-RULES.ARC § Verification and Discovery (both copies)
      with agent-side compliance rule (load frontmatter-declared methods/extensions before executing the workflow);
      paired author-side declaration rule lives in `strategy-workflow-authoring.md § Author-side Declaration Rule`
      (T3 on-demand, not every-session)
- [ ] ADR-013 Tier 2 amendment reflects the implemented per-file model and constitutional rule
- [ ] Observed tokens-at-orientation-completion drops ≥25% from baseline (~75–80k → ≤60k) in a clean maintainer session
      with active task list
- [ ] Orientation summary correctness verified (active work state, blockers, non-default config, freshness, next action
      remain accurate across sampled session types)
- [ ] Operational-context audit Tier 1–3 complete; extractions staged in `notes-docs-content-sweep.md`;
      `[TODO-docs-site]` placeholders greppable across touched files
- [ ] `template-tasks.md` extracted to `.arc/reference/templates/`; `2_generate-tasks.md` hosts Quick Format Checklist;
      `strategy-task-list-formatting.md` trimmed to rules-only
- [ ] Frontmatter schema + D7a link-resolution + D7b extension-point match pre-commit hooks active and tested
- [ ] Session-type conditional loading active; `Working On:` type prefix formalized; auto- inference handles the common
      cases without user prompts
- [ ] `arc init` and `arc join` deliver updated SESSION-NOTES template with type prefix convention
- [ ] Framework-sync integration test passing; two-copy sync clean across methods, extensions, and touched
      workflow/rules files
- [ ] All quality gates pass (markdown lint, TypeScript lint, shellcheck, typecheck, tests, build — zero violations)
- [ ] Ready for archival

---

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
