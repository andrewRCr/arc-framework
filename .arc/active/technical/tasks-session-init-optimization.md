# Task List: Session-Init Optimization

- **PRD:** `.arc/active/technical/prd-session-init-optimization.md`
- **Branch(es):** `technical/session-init-optimization`
- **Base Branch:** `main`

## Overview

**Purpose:** Reduce session-init token cost from ~75–80k to ≤60k at orientation completion by retiring the aggregate
`arc-methods.md` / `arc-extensions.md` files in favor of per-file directories with YAML frontmatter, auditing
always-loaded content for operational relevance, narrowing partial-reads, and introducing session-type conditional
loading — without regressing orientation correctness or compliance reliability.

Notes file: `notes-session-init-optimization.md` (alternatives, compliance-reliability grounding, phase sequencing
rationale, risks, research references).

## Scope

### Will Do

- Retire `arc-methods.md` and `arc-extensions.md`; migrate to per-file `system/methods/` and `system/extensions/`
  directories with YAML frontmatter (both copies — package source + `.arc/`)
- Add "Method and extension loading" constitutional rule to DEV-RULES.ARC § Verification and Discovery; absolute,
  hedge-free framing
- Draft ADR-013 Tier 2 amendment; sanity-check against the implemented model at Phase 3 close
- Reliable-trigger CI audit enumerating methods × workflow/DEV-RULES/strategy references
- Pre-commit hooks: frontmatter schema validation, D7a link-resolution, D7b extension-point match
- Operational-context audit across Tier 1 (always-loaded docs), Tier 2 (high-frequency workflows), Tier 3 (remaining
  workflows); extractions staged in `notes-docs-content-sweep.md`
- Task-list-formatting restructure: extract `template-tasks.md`, relocate Quick Format Checklist into
  `2_generate-tasks.md` Step 4, trim `strategy-task-list-formatting.md`
- Partial-read narrowing: QUICK-REFERENCE, task-list current-section, reliability-gated DEV-RULES sections
- Session-init.md Step 2/4/7 restructure to match audit outcomes
- Session-type conditional loading: `Working On:` type prefix formalized, auto-inference rules, per-type load sets, CLI
  template updates
- Test coverage for new infrastructure (frontmatter parser, hooks, inference logic)
- Release-notes entry documenting breaking changes

### Won't Do

- Automatic migration code for `arc update` (zero adopters; dev repo maintains two-copy sync manually; external beta
  installers reinstall fresh)
- Docs-site-side integration of extracted content (handled by `plan-docs-content-sweep.md`)
- Starlight migration / docs-site build work (handled by `prd-arcd-docs-site.md`)
- Adopter-facing methods/extensions extensibility (framework-fixed by design)
- Document classification system (T1/T2/T3) structural changes (out of scope; revisit later)
- `arc-config.yml` structural changes (comments stay; content-trim only where individual comments cross into rationale)

---

## Tasks

### **Phase 1:** Trigger Completeness Audit + CI Check

**Strategies:** `strategy-session-operations.md`, `strategy-configurability-architecture.md`

**Purpose:** Safety precondition for front-load removal. Every method and extension must have ≥1 reliable-trigger
reference before Phase 3 retires the always-loaded bodies. CI check institutionalizes the guarantee.

- [x] **1.1 Method and extension trigger coverage audit**

    **Goal:** Every method and extension has ≥1 qualifying reference in a reachable workflow.

    **Outcome:** All 16 methods/extensions pass. 1.1.a catalog + 1.1.b classification recorded in
    `notes-session-init-optimization.md`. 1.1.c no-op. See § Phase 1 Classification (Task 1.1.b) § Overall verdict.
    - [x] **1.1.a Enumerate methods and extensions**
        - Catalog appended to `notes-session-init-optimization.md` § Phase 1 Trigger Coverage Audit — one subsection per
          method (8) and per extension (8), each with self-definition line refs and a full list of external references
          (file:line + surface-kind annotation)
        - Scope applied: `system/workflows/**/*.md`, `reference/constitution/*.md`, `reference/strategies/**/*.md`,
          `system/agent/*.md`. Excluded `reference/adr/`, `reference/archive/`, and out-of-scope trees (`active/`,
          `backlog/`, `reference/analysis/`, `reference/TECHNICAL-OVERVIEW.md`, `system/skills/`)
        - Observations block flags pre-classification signals for 1.1.b: three extensions (post-unit-quality,
          post-context-load, pre-stage-review) have no strategy/constitution references — workflow trigger +
          self-definition only; one false-match flagged (`strategy-session-operations.md:22` on session-state); strategy
          classification tables and DEV-RULES § When-to-Load bullets marked as informational candidates

    - [x] **1.1.b Classify each reference against the reliable-trigger bar**
        - Classification appended to `notes-session-init-optimization.md` § Phase 1 Classification (Task 1.1.b) — rubric
          block + summary tables for methods and extensions + reliable-trigger location list + judgment-call record
        - **Outcome — no flags.** All 8 methods and 8 extensions have ≥1 reliable trigger. Reliable counts: methods 2–7
          (avg ~3.25); extensions exactly 1 each (the structural `If [X extensions] are configured, execute them`
          wrapper at the firing workflow)
        - Hedged count: 0 across all 16 entries. Unreachable count: 0
        - Method-dependencies blocks (e.g., `3_process-task-loop.md:16–18`, `prepare-commits.md:14–15`,
          `integrate-work-unit.md:33–34`, `session-handoff.md:19`) classified reliable alongside in-step links — each
          bullet is a targeted markdown-link under an imperative preamble ("load on first reference"). Documented in
          judgment-calls
        - `strategy-session-operations.md:22` dropped from catalog (false regex match on `#session-state-portability`
          anchor — not a reference to the `session-state` method)
        - Non-link prose pointers (`integrate-work-unit.md:148` plain-text "see `arc-methods.md` §
          commit-context-format") classified informational — deferred to Phase 3.10 cross-reference sweep for relinking
          to `system/methods/` paths
        - CI-audit (Task 1.3) implication recorded: enumerator must treat method-dependencies bullets and in-step links
          equivalently, and disambiguate substring matches on anchors (e.g., `#session-state` vs
          `#session-state-portability`)

    - [~] **1.1.c Fix coverage gaps surfaced by the audit** — No-op: 1.1.b returned zero gaps across all 16
        methods/extensions. See `notes-session-init-optimization.md` § Phase 1 Classification (Task 1.1.b) § Overall
        verdict.

- [ ] **1.2 Reliable-trigger CI audit script**

    **Goal:** Automated enumeration that fails CI when any method or extension lacks a reliable trigger.
    - Placement: `scripts/audit-method-triggers.mjs` (repo-dev-only; parallel to existing
      `scripts/check-package-sync.sh`; not shipped to adopters)
    - Language: node ESM — aligns with package stack, tests via existing vitest, forward-compatible with Phase 3.2's
      frontmatter parser for later reuse
    - Script enumerates `system/methods/*.md` and `system/extensions/*.md` (placeholder until Phase 3; interim scan of
      legacy aggregate files by iterating `## method-name` sections)
    - Greps for qualifying references across `system/workflows/**/*.md`, `reference/constitution/*.md`,
      `reference/strategies/**/*.md`, `system/agent/*.md`
    - Distinguishes reliable from hedged references per Task 1.1.b rubric (methods: strict; extensions: `if configured`
      wrapper accepted as structurally valid)
    - Exit non-zero with diagnostic output (method/extension name, scanned locations, reason for non-coverage)

    Build `test-first` (one behavior at a time):
    - Enumerates all methods from legacy aggregate (8 entries)
    - Enumerates all extensions from legacy aggregate (8 entries)
    - Reliable method reference passes
    - Hedged method reference flagged
    - Extension reference with `if configured` wrapper passes
    - Method with zero references fails with diagnostic naming the method
    - Empty scope directory handled without crash
    - Malformed input files (non-markdown, unreadable) skipped, not fatal

- [ ] **1.3 Wire script into CI workflow**
    - Add step to `.github/workflows/ci.yml` `quality` job after existing `npm run build`:
      `- run: node scripts/audit-method-triggers.mjs`
    - Step runs on all branches (fail-fast signal before PR)
    - Optional one-line mention in `strategy-session-operations.md` near the methods-loading discussion noting the CI
      check backs the reliability guarantee

- [ ] **1.4 Phase 1 close — Tier 2 quality gates**
    - Run full markdown lint, code lint, typecheck, test suite before Phase 2

---

### **Phase 2:** Constitutional Rule + ADR-013 Amendment Draft

**Strategies:** `strategy-session-operations.md`, `strategy-adr-methodology.md`

**Purpose:** Anchor compliance behavior before Phase 3 removes the always-loaded bodies. Constitutional framing is
absolute — no hedges — per compliance-reliability research.

- [ ] **2.1 "Method and extension loading" rule in DEV-RULES.ARC**

    **Goal:** New subsection under § Verification and Discovery, both copies, hedge-free.
    - Insertion point: `.arc/reference/constitution/DEV-RULES.ARC.md` § Verification and Discovery (adjacent to existing
      `Verify before assuming`, `Consult strategy guidance`, `Re-check core documents` subsections)
    - Rule text (per PRD P0.3):
        > When a workflow step references a method, extension, strategy, or workflow, load the relevant content before
        > acting on that step. Don't proceed from intuition when a governing reference is one link away.
    - Two-copy sync: apply identical edit to `packages/arc-framework/arc/reference/constitution/DEV-RULES.ARC.md`
    - Tier 2 gate: markdown lint both files

- [ ] **2.2 AGENT-BRIEFING.ARC cross-reference**
    - Determine whether the briefing should surface the new rule at init (beyond its existing DEV-RULES pointer)
    - If yes: add a brief reference; if no: record the decision in the notes file so it's auditable later
    - Two-copy sync

- [ ] **2.3 Draft ADR-013 Tier 2 amendment**

    **Goal:** Amendment entry reflects the method-loading model change (per-file structure with frontmatter index +
    constitutional rule). Draft only — sanity check in Phase 3.
    - File: `.arc/reference/adr/adr-013-adopt-on-demand-method-loading.md`
    - Follow [ADR Methodology Strategy][adr-methodology] § Tier 2 amendments format
    - Capture: what changed (per-file structure, frontmatter index at session-init, constitutional rule), why (cost
      reduction, compliance reliability), relation to original decision (reinforces and concretizes on-demand loading)
    - Two-copy sync
    - Leave as draft until Phase 3 close sanity-checks against the implemented model

- [ ] **2.4 Phase 2 close — Tier 2 quality gates**
    - Markdown lint, then proceed to Phase 3

---

### **Phase 3:** Per-File Methods and Extensions Restructure

**Strategies:** `strategy-package-project-sync.md`, `strategy-session-operations.md`,
`strategy-configurability-architecture.md`, `strategy-quality-gates.md`, `strategy-testing-methodology.md`

**Purpose:** The architectural change. Retire aggregate files; establish per-file layout with YAML frontmatter; wire
validation hooks; update cross-references; adapt session-init to scan aggregated frontmatter only. Close with ADR-013
sanity check.

**Note:** Phase 3 is the heaviest phase; Tier 2 gates run at sub-phase boundaries (3.5 content migration close, 3.10
cross-reference sweep close), not only at phase end. Two-copy discipline applies throughout — every file change touches
`packages/arc-framework/arc/` and `.arc/`.

- [ ] **3.1 Design YAML frontmatter schema**

    **Goal:** Fixed field contract for method and extension files.
    - Methods schema fields: `name`, `description` (one-line operational purpose), `workflow` (triggering workflow
      filename), `related` (related method names, array), `has-override` (populated status signal: `true`/`false`)
    - Extensions schema fields: same as methods except `has-steps` replaces `has-override`
    - Document schema in a brief spec (placement: `reference/strategies/arc/` as a section in
      `strategy-session-operations.md`, or inline in each directory's README — decide during task)

- [ ] **3.2 Frontmatter parsing utility (test-first)**

    **Goal:** Shared parsing logic for validation hooks and aggregated-index generation.
    - Placement: `packages/arc-framework/src/lib/frontmatter/` (new module; slot alongside existing `lib/` utilities)

    Build `test-first` (one behavior at a time):
    - Parses valid triple-dash YAML frontmatter correctly
    - Extracts all required fields
    - Rejects files missing required fields with field-name diagnostic
    - Rejects files with type mismatches (e.g., `related` not an array)
    - Returns null or empty result for files without frontmatter (safe default)

- [ ] **3.3 Create per-file directory structure (both copies)**
    - `packages/arc-framework/arc/system/methods/` and `.arc/system/methods/`
    - `packages/arc-framework/arc/system/extensions/` and `.arc/system/extensions/`

- [ ] **3.4 Migrate 8 methods to per-file**

    **Goal:** Each method's `.override` / `.default` body extracted to `{name}.md` with frontmatter; content preserved
    verbatim (no rewording during migration).
    - `commit-format.md`, `commit-context-format.md`, `issue-triage.md`, `test-first.md`, `session-state.md`,
      `pre-merge-review.md`, `review-triage.md`, `quality-gate-commands.md`
    - Frontmatter `workflow` field populated from current method's "Workflow:" line
    - Frontmatter `related` field populated from current Method Dependencies table
    - Frontmatter `has-override` = `false` for all (no current overrides configured)
    - Two-copy sync per file

- [ ] **3.5 Migrate 8 extensions to per-file**
    - `post-task-quality.md`, `post-unit-quality.md`, `post-task-completion.md`, `post-context-load.md`,
      `pre-stage-review.md`, `pre-merge-review.md`, `post-work-unit-activate.md`, `post-work-unit-archive.md`
    - Frontmatter `has-steps` populated based on current `.steps` content (only `pre-merge-review` currently has steps;
      the rest are placeholders)
    - Two-copy sync per file

- [ ] **3.6 Directory READMEs**

    **Goal:** Human-facing whole-system reading surface; not loaded at agent init.
    - `system/methods/README.md` — overview, Method Dependencies table (derived from or mirroring frontmatter `related`
      fields), navigation to per-file content
    - `system/extensions/README.md` — overview, extension-point summary table, navigation
    - Two-copy sync per README

- [ ] **3.7 Frontmatter schema validation hook (test-first)**

    **Goal:** Pre-commit hook rejects staged method/extension files with missing or malformed frontmatter.
    - Placement: slots into `.arc/system/githooks/pre-commit` after CHECK 11 (line ~346) as CHECK 12; mirrors the
      existing check-block pattern (labeled `CHECK 12:`, same output style, short-circuit on failure)
    - Delegates to a helper script (shell + node one-liner using the Phase 3.2 parser, or pure shell — decide during
      task)
    - Two-copy sync per hook edit

    Build `test-first` (one behavior at a time):
    - Valid frontmatter passes
    - Missing `name` field fails with diagnostic naming the file and field
    - Missing `description` fails
    - `related` not an array fails
    - Non-method/extension files staged do not trigger the check

- [ ] **3.8 D7a link-resolution pre-commit hook (test-first)**

    **Goal:** Hook rejects staged files with broken links to `system/methods/*`, `system/extensions/*`,
    `system/workflows/*`, `reference/strategies/*`.
    - Placement: CHECK 13 in `.arc/system/githooks/pre-commit`
    - Per-staged-file; shell-based (grep link targets → verify file exists)
    - Two-copy sync

    Build `test-first` (one behavior at a time):
    - Valid link to existing `system/methods/` file passes
    - Link to nonexistent file fails with diagnostic naming source file and target
    - External links (https://...) are ignored
    - Inline code-span backticks containing link-like strings are ignored

- [ ] **3.9 Session-init Step 2 — aggregated frontmatter scan**

    **Goal:** Session-init reads only frontmatter across all method/extension files (~1k tokens for ~16 files), not full
    bodies.
    - Update `system/workflows/arc/session-lifecycle/session-init.md` Step 2 — replace current "Scan `arc-methods.md`
      for active overrides" with "Aggregate frontmatter from `system/methods/*.md` and `system/extensions/*.md`"
    - Update Step 4 ("Check Active Configuration") to reference new structure
    - Two-copy sync

- [ ] **3.10 Cross-reference sweep**

    **Goal:** All 53+ matches of `arc-methods.md#anchor` / `arc-extensions.md#anchor` across the repo updated to new
    per-file paths using D7a link convention.
    - Scope: `.arc/` + `packages/arc-framework/arc/` (workflows, ADRs, strategies, DEV-RULES, backlog docs,
      AGENT-BRIEFING files, CLAUDE.ARC.md)
    - Grep-and-replace pass (automatable but each match manually verified — ensures anchor points map to the right
      per-file destination)
    - Run the Phase 3.8 link-resolution hook against the full repo to catch residual broken links

- [ ] **3.11 Framework-sync integration test updates**

    **Goal:** Existing framework-sync test enumerates new per-file directories; drift between package source and `.arc/`
    on methods/extensions is caught by CI.
    - File: `packages/arc-framework/__tests__/integration/framework-sync.test.ts`
    - Extend enumeration to include `system/methods/*.md` and `system/extensions/*.md`
    - Add test case for per-file drift detection

- [ ] **3.12 Retire legacy aggregate files**
    - Delete `.arc/system/workflows/arc-methods.md`
    - Delete `.arc/system/workflows/arc-extensions.md`
    - Delete `packages/arc-framework/arc/system/workflows/arc-methods.md`
    - Delete `packages/arc-framework/arc/system/workflows/arc-extensions.md`
    - Verify no remaining references (run grep for filename matches across both trees)

- [ ] **3.13 CLI test coverage — per-file restructure**

    **Goal:** Fresh install, update, reconfigure, and hook behavior all verified against new structure.
    - Integration: fresh `arc init` produces `system/methods/` and `system/extensions/` with all 8 files each
    - Integration: `arc update` on repo with pre-existing `.arc/` migrates correctly (three-way merge preserves any user
      overrides — though none exist at current zero-adopter state, test confirms mechanism)
    - Integration: `arc update` idempotent re-update produces no diff
    - E2E: `arc init --yes` layout matches expected structure
    - E2E: `arc init --reconfigure` unaffected by per-file restructure
    - Hook behavior tests: Phase 3.7 and 3.8 hooks verified against sample repos

- [ ] **3.14 ADR-013 sanity check and finalize**

    **Goal:** Amendment drafted in Phase 2.3 matches the concrete implemented model; tweak wording if needed; mark the
    amendment as accepted.
    - Compare amendment text against the actual per-file structure, frontmatter fields, and session-init Step 2 behavior
    - Apply any minor wording adjustments
    - Remove draft marker; two-copy sync

- [ ] **3.15 Phase 3 close — Tier 3 quality gates**
    - Full markdown lint, code lint (TS + sh), typecheck, test suite, build, framework-sync
    - Verify zero regressions before Phase 4

---

### **Phase 4:** Operational-Context Audit + Task-List-Formatting Restructure + D7b

**Strategies:** `strategy-session-operations.md` (content-tiering lens), `strategy-task-list-formatting.md` (for P1.4
restructure target), `strategy-package-project-sync.md`

**Purpose:** Apply the "operational context only" lens across always-loaded docs and workflows; stage extractions for
the future docs-content-sweep WU; formalize D7b shape-boundary wrappers opportunistically. Ordering is Tier 1 → Tier 2 →
Tier 3 so the highest-leverage content is audited first.

**Heuristic reminder (apply throughout 4.2–4.5):** keep content that helps conceptual flow, is counterintuitive, or
would confuse if absent. Target ~80–90% extraction on rationale/background/overflow-example content with case-by-case
retention. Hedges with undefined state (`unless already loaded`, `if applicable`, `when relevant`) are eliminated.
Operational rationale clauses (`because ...`) are single-clause, ≤12 words, inline — anything longer extracts.

- [ ] **4.1 Staging infrastructure**

    **Goal:** `notes-docs-content-sweep.md` is ready to receive extractions; cross-references from
    `plan-docs-content-sweep.md` are current.
    - Create `.arc/backlog/technical/notes-docs-content-sweep.md` if not present
    - Schema per extraction: source file anchor, content block (verbatim), suggested destination in docs IA
      (Starlight-bound), stylistic notes
    - Verify `plan-docs-content-sweep.md` references this staging file; update if needed
    - Document the `[TODO-docs-site]` reference-style placeholder convention in-repo (one section in the staging file or
      the strategy doc)

- [ ] **4.2 Tier 1 audit — always-loaded docs**

    **Goal:** Operational-context audit applied to every file session-init loads unconditionally.
    - Files:
        - `.arc/system/agent/AGENT-BRIEFING.ARC.md`
        - `.arc/system/agent/AGENT-BRIEFING.PROJECT.md`
        - `.arc/system/agent/CLAUDE.ARC.md` (and any other agent-specific files present)
        - `.arc/reference/constitution/DEV-RULES.ARC.md`
        - `.arc/reference/constitution/DEV-RULES.PROJECT.md`
        - `.arc/reference/QUICK-REFERENCE.md`
        - `.arc/system/workflows/arc/session-lifecycle/session-init.md`
        - `.arc/reference/templates/template-status.md` (shapes every active status file; instantiated file is read at
          every session-init, so template-level bloat propagates)
        - `.arc/system/arc-config.yml` (comment-level audit only; structural changes out of scope)
    - For each: extract rationale/background/overflow examples to `notes-docs-content-sweep.md`; leave
      `[TODO-docs-site]` reference-style link placeholders at extraction sites
    - Two-copy sync per file

- [ ] **4.3 Tier 2 audit — high-frequency workflows**
    - Files:
        - `.arc/system/workflows/arc/3_process-task-loop.md`
        - `.arc/system/workflows/arc/supplemental/prepare-commits.md`
        - `.arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`
        - `.arc/system/workflows/arc/session-lifecycle/session-handoff.md`
    - Same extraction + placeholder protocol as Tier 1

- [ ] **4.4 Tier 3 audit — remaining workflows**
    - Files:
        - `.arc/system/workflows/arc/1_create-prd.md`
        - `.arc/system/workflows/arc/2_generate-tasks.md`
        - All `work-unit-lifecycle/*.md` (activate, integrate, archive, verify, planning/\*)
        - Remaining `supplemental/*.md` (manage-incidental-work, maintain-project-docs, add-agent, verify-arc-integrity,
          integrate-external-content)
    - Same protocol

- [ ] **4.5 Task-list-formatting restructure (P1.4 — three moves)**

    **Goal:** `strategy-task-list-formatting.md` trimmed to rules-only catalogue; templates extracted; Quick Format
    Checklist relocated to point of use.
    - [ ] **4.5.a Extract templates to `template-tasks.md`**
        - New file: `.arc/reference/templates/template-tasks.md`
        - Move: feature/technical header template, incidental header template, verification phase block, atomic
          companion file template, success criteria block
        - Two-copy sync (`packages/arc-framework/arc/reference/templates/template-tasks.md`)

    - [ ] **4.5.b Relocate Quick Format Checklist into `2_generate-tasks.md` Step 4**
        - Move checklist from `strategy-task-list-formatting.md` § Quick Format Checklist into the appropriate point in
          Step 4 ("Write and Save Task List")
        - Cross-reference updates in callers

    - [ ] **4.5.c Trim `strategy-task-list-formatting.md` to rules-only**
        - Remove moved content
        - Apply operational-context audit on the trimmed result (rationale text → staging)
        - Update cross-references (from DEV-RULES.ARC, 2_generate-tasks.md, etc.) if links broke

- [ ] **4.6 D7b extension-point wrappers — opportunistic application**

    **Goal:** Formalize existing anchor-ID convention in workflows using
    `<extension-point name="...">...</extension-point>` tags. No sweeping retrofit — applied only where files are
    touched in 4.2–4.5.
    - Produce a running list of files touched in 4.2–4.5 that contain extension-point anchors
    - For each: wrap the existing anchor region with the D7b tag
    - Also opportunistically wrap `<template>...</template>` and `<output-format>...</output-format>` where relevant

- [ ] **4.7 D7b extension-point match pre-commit hook (test-first)**

    **Goal:** Hook validates every `<extension-point name="X">` tag in workflows has a matching populated definition in
    `system/extensions/`.
    - Placement: CHECK 14 in `.arc/system/githooks/pre-commit`
    - Per-staged-workflow-file; grep for `<extension-point name="X">` → verify `system/extensions/X.md` exists and has
      populated `has-steps: true` OR matches the existing placeholder convention
    - Two-copy sync

    Build `test-first` (one behavior at a time):
    - Tag with matching populated extension passes
    - Tag referencing nonexistent extension fails with diagnostic
    - Tag referencing extension with `has-steps: false` is allowed (placeholder state)
    - Multiple tags in one file all checked

- [ ] **4.8 Phase 4 close — Tier 3 quality gates**
    - Full quality gate pass; verify extractions staged correctly (spot-check 3–5 entries); verify link placeholders are
      greppable by a fixed pattern

---

### **Phase 5:** Partial-Read Narrowing + Session-Init Workflow Restructure

**Strategies:** `strategy-session-operations.md`

**Purpose:** Shrink remaining upfront-read surface. Per-rule reliability gate for DEV-RULES is the cautious path —
default to up-front load; shift to conditional only where trigger is clear.

- [ ] **5.1 QUICK-REFERENCE partial-read at session-init**

    **Goal:** Session-init reads only `## Environment & Path Context` and `## Runtime   Environment`;
    `Command Patterns`, `Quality Gate Commands`, `ARC CLI Commands`, `npm Publishing`, and `Anti-Patterns` load
    on-demand via workflow references.
    - Update `session-init.md` Step 2 item 7 — specify section-level partial read
    - Verify callers (workflows that reference quality gate commands, CLI commands) load the relevant sections on demand

- [ ] **5.2 Task list partial-read narrowing**

    **Goal:** Session-init Item 10 reads Header + Overview + Scope + current phase preamble + current task section only.
    Skip completed phases' preambles.
    - Update `session-init.md` Item 10 with the narrower read specification
    - Graduated triple-anchor lookup (line hint → task number → title fragment) continues to resolve correctly under the
      narrower read (verify in test)

- [ ] **5.3 Status file partial-read narrowing**

    **Goal:** Session-init reads only the `## Active Work` block of the active status file — the 7 load-bearing fields
    (State, Branch, Task List, Next Task, Last Completed, Blockers, Next Action) plus any optional fields present
    (Interrupts, Paused At, Paused To, Superseded By). Non-load-bearing content (the "About this file" blockquote, any
    future documentation) is not read at init.
    - Update `session-init.md` Step 2 item 8 — replace "MUST RESOLVE, THEN READ IN FULL" with partial-read specification
      (from `## Active Work` heading through the last `**Field:**` line in that section)
    - Document the `## Active Work` section as a contract boundary: any content an agent needs at session-init must live
      inside this block
    - Related: Phase 4.2 audits `template-status.md` to eliminate authoring-guidance comment blocks that historically
      shipped from the template; this partial-read narrowing is the durable guard regardless of future template content
    - Two-copy sync

- [ ] **5.4 DEV-RULES section-level partial-read evaluation (per-rule)**

    **Goal:** Each candidate section independently evaluated against a strict reliability bar; dispositions recorded.
    - [ ] **5.4.a Evaluate candidate sections**
        - Candidates: DEV-RULES.ARC § Task Execution; DEV-RULES.ARC § Capture Routing; DEV-RULES.PROJECT § Quality
          Gates; DEV-RULES.PROJECT § Package-Project Sync
        - For each, assess: is there a clear, reliable trigger (session type, config value, workflow activity detectable
          at session-init)?
        - Disposition values: `conditional-load` (with named trigger) / `up-front-load` (with reason) /
          `retired-as-rationale` (if content moves to docs-site staging)

    - [ ] **5.4.b Record dispositions in notes file**
        - Append a "DEV-RULES partial-read dispositions" section to `notes-session-init-optimization.md`
        - One entry per evaluated section: candidate / disposition / named trigger or reason

    - [ ] **5.4.c Apply dispositions**
        - For `conditional-load` sections: update `session-init.md` Step 2 items 4/5 to include trigger-based load logic
        - For `up-front-load` sections: no structural change (safety floor)
        - For `retired-as-rationale` sections: move content to staging, leave placeholder

    **Note:** Default remains up-front load; shifting is opportunistic. "Up-front load remains correct" is always a
    valid disposition.

- [ ] **5.5 Session-init workflow Step 2/4/7 restructure**

    **Goal:** Batching structure, configuration check, and mismatch-handling prose all match Phase 4 audit outcomes and
    Phase 5.1–5.4 partial-reads.
    - [ ] **5.5.a Step 2 batching**
        - Re-express Batch 1 / Batch 2 ordering given slimmed loadset
        - Update embedded examples (e.g., many-file disambiguation prompt) if they reference content that moved

    - [ ] **5.5.b Step 4 simplification**
        - Configuration check simplifies post-audit (fewer defaults to scan, overrides surface the same way but against
          the slimmer content set)

    - [ ] **5.5.c Step 7 tightening**
        - Mismatch-handling prose tightened; trust hierarchy preserved; no semantic change to auto-recover vs.
          stop-and-ask tiers

    - Two-copy sync

- [ ] **5.6 Phase 5 close — Tier 2 quality gates**
    - Markdown lint, framework-sync, targeted re-run of session-init against a representative active task list (if
      available) to spot-check regressions

---

### **Phase 6:** Session-Type Conditional Loading

**Strategies:** `strategy-testing-methodology.md`, `strategy-session-operations.md`

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

    **Goal:** session-init Step 2 branches on resolved session type; loadset matches PRD table.
    - Update `session-init.md` Step 2 to key load decisions off the resolved session type
    - Loadset specification (per PRD P2.3):
        - All types: Items 1–7, methods/extensions frontmatter index, SESSION-NOTES, active status file if present
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
- [ ] Session-init Step 2 loads aggregated frontmatter index only; full method and extension bodies load on-demand at
      workflow references
- [ ] Reliable-trigger CI check active and passing on `main`
- [ ] "Method and extension loading" subsection present in DEV-RULES.ARC § Verification and Discovery (both copies);
      cross-referenced from relevant workflow method-dependencies blocks
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
- [ ] Release-notes entry drafted documenting breaking changes (methods/extensions layout, constitutional rule,
      SESSION-NOTES prefix)
- [ ] Framework-sync integration test passing; two-copy sync clean across methods, extensions, and touched
      workflow/rules files
- [ ] All quality gates pass (markdown lint, TypeScript lint, shellcheck, typecheck, tests, build — zero violations)
- [ ] Ready for archival

---

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
[adr-methodology]: ../../reference/strategies/arc/strategy-adr-methodology.md
