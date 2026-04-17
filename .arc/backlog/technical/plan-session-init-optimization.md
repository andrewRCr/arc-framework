# Plan: Session-Init Optimization

**Purpose:** Reduce the token cost of session initialization from ~40k loadset (observed
~70–80k at orientation completion with harness overhead) toward a defensible floor of
~22–28k, without losing session consistency or forcing agents to proceed from intuition
in place of loaded guidance. Work splits into four coordinated reduction strategies
targeting different shapes of init content: (A) per-file methods/extensions with YAML
frontmatter, (B) operational-context audit of always-loaded docs and high-frequency
workflows with extraction staged for the docs-content-sweep WU, (C) anchored
partial-reads for mixed-purpose docs, (D) session-type-aware conditional init.

**State:** Draft (thesis refined via external research; 4-strategy phase structure
established; open questions scoped for PRD-time resolution)
**Created:** 2026-04-16; research-driven revision 2026-04-17
**Origin:** The atomic task in `atomic-work-status-restructure.md` captured an observed
drift in session-init token usage (~29–35k → ~45–50k → ~75–80k over several weeks) and
commissioned a file-by-file content audit. The audit ran during the session-init that
preceded this plan and surfaced a larger architectural opportunity. Subsequent external
research (nine investigations during plan refinement) reshaped the thesis: pure-JIT via
prose triggers is not a production pattern, but ARC's workflow-trigger model is
structurally different from conversational-intent-matching tools, and reliability holds
differently. A thin always-loaded index plus YAML frontmatter on capability files is
the production pattern that fits ARC's shape. Coordinated with content compression and
session-type awareness, the total reduction is larger than architectural shift alone.

---

## Problem / Motivation

ARC's session-init currently loads a large document set up front. The load set has
drifted upward over time and a fresh audit shows meaningful over-loading across several
different content shapes:

- **~40k tokens of loadset content** read at every session init (maintainer, active
  task work)
- **Observed ~70–80k tokens at orientation completion** (loadset + harness + tool
  schemas + skill registry + init work products)
- Several files loaded in full when workflow intent is targeted scan (`arc-methods.md`,
  `arc-extensions.md`)
- Several files carry significant rationale/background content agents don't need at
  init (DEV-RULES.ARC.md, AGENT-BRIEFINGs) — dual-audience files with human-education
  content bloating agent context
- Several files loaded in full when only a subsection is init-relevant
  (QUICK-REFERENCE.md)

At the same time, the framework ships reliable trigger mechanisms (method-dependencies
blocks, extension hook anchors, workflow cross-references). Rationale content is
loaded defensively, not operationally. And session-type context is only partially
exploited — role distinction and active-task-list presence drive some conditionality,
but session phase (planning / execution / integration) does not.

**Why this matters beyond personal ergonomics:** 70–80k tokens before the first unit
of work begins is a hard sell for adopters. ARC's configurability carries inherent
overhead a centralized-for-solo-use framework wouldn't — that's defensible, but the
current overhead exceeds the architectural floor by a material margin. Bringing the
loadset to ~22–28k keeps ARC's principles intact while making the framework viable
for teams without unlimited token budgets for orientation.

## Working Thesis

Four coordinated reduction strategies, each targeting a different shape of init
content. Independent in execution; compounding in effect.

**Strategy A — Per-file methods/extensions with YAML frontmatter.** Replace single-file
`arc-methods.md` and `arc-extensions.md` with per-capability files
(`system/methods/commit-format.md`, etc.) carrying file-level YAML frontmatter (name,
description, workflow, related, has-override). Init reads a thin index (auto-derived
or via README); bodies load when workflows reference them explicitly.

**Strategy B — Operational-context audit with extraction to docs-content-sweep.**
Audit session-init always-loaded docs + all workflows + `strategy-task-list-formatting`
through an "operational context only" lens: does this serve operational use by agent
or human during work? Extract rationale, background, multi-example illustrations, and
narrative reinforcement. Stage extractions in a notes file for absorption by the
docs-content-sweep WU. In-repo content retains operational declarations plus
link-placeholders pointing at eventual `docs/` destinations.

**Strategy C — Anchored partial-reads for mixed-purpose docs.** QUICK-REFERENCE and
similar docs where one section is init-relevant and others are look-up-when-needed:
load only the init-relevant section; load the rest on-demand.

**Strategy D — Session-type-aware conditional init.** Formalize and extend the existing
partial session-type awareness (role, active-task-list presence) to include session
phase. Auto-inferred from SESSION-NOTES `Working On:` field and status-file state;
baseline loads always, mode-specific workflows/methods conditionally.

**Compliance-reliability grounding.** External research identified production tools'
trigger-reliability problems as specific to *conversational-intent-matching* (agent
decides whether skill X applies based on user utterance). ARC's triggers are *explicit
named references* inside workflow prose ("follow the commit-format method") —
structurally closer to link resolution than intent classification, and empirically
reliable in current ARC use. The thin front-loaded index serves awareness and
compliance reassurance, NOT dispatch. ARC's value remains the explicit workflow model;
methods and extensions remain framework-fixed (adopter-dropped files would be orphaned
without corresponding workflow references).

## Alternatives Considered

**A. Status quo (belt-and-suspenders front-load):** Keep current loadset. Rejected —
current cost is high enough that adopters may abandon the framework rather than
internalize a ~75k-token orientation ceremony. Reliability argument is weaker than
it appears; most loaded content is rationale, not operational.

**B. Sibling defaults files for arc-config / methods / extensions:** Split each into
user-values + framework-defaults sibling files. Rejected — research found no AI-dev
tool uses sibling `.defaults` files; production patterns are either hard-coded
defaults (Biome/Vite/Prettier) or rich inline comments in a single file (TypeScript).
Splitting methods/extensions damages authoring UX (two-file lookup for overrides).

**C. Grep-filter reads on single arc-config.yml:** Keep the file intact, extract KV via
grep at init. Rejected — research found this pattern is novel in AI-dev tools (Cursor,
Aider, Claude Code, Continue all read config files in full) and carries documented
drift risks (silent filter misalignment as format evolves).

**D. Pure JIT via imperative prose triggers:** Remove front-load entirely; rely on
in-workflow prose to trigger loads. Rejected as sole mechanism — research documented
reliability problems in mid-task / full-window / edge-case contexts. BUT the core
insight (ARC already ships explicit workflow references) is preserved via the
thin-index + explicit-reference hybrid: the index provides compliance awareness, the
explicit references drive loads.

**E. Four-strategy coordinated approach (this plan):** Per-file methods/extensions +
operational-context audit + anchored partial-reads + session-type conditional
loading. Selected. Each strategy targets a distinct content shape; none depends on
novel patterns; all have production precedent. Captures architectural, content, and
conditional savings that compound.

## Architectural Decisions

These are settled (pending PRD review); documented here so future readers understand
the reasoning.

### D1. Per-file methods/extensions with file-level YAML frontmatter

Each method becomes `system/methods/{name}.md`; each extension becomes
`system/extensions/{name}.md`. Files carry triple-dash YAML frontmatter at the top —
the industry-standard pattern (Jekyll, Hugo, Astro, Obsidian, Cursor rules, Claude
Code skills). Frontmatter fields: `name`, `description` (one-line operational purpose),
`workflow` (triggering workflow name), `related` (list of related method/extension
names), `has-override` / `has-steps` (populated status signal).

A `system/methods/README.md` and `system/extensions/README.md` provide human-facing
whole-system reading — the conventional role of READMEs in capability directories.

**Session-init consumption:** Session-init loads the aggregated frontmatter from all
per-file docs (~1k tokens for the current ~10 methods), serving as the thin-index
awareness layer. Full method/extension bodies load on-demand when workflow steps
reference them explicitly. The READMEs are authored for human whole-system reading,
not agent init consumption — their token cost is paid only when a human opens them.

**Rationale:** File-level frontmatter is ubiquitous and parseable by standard tools;
per-section mid-file metadata would require a custom syntax. Cross-references
become file-link-based (still clean). Three-way merge becomes file-level. Production
idiom matches. Framework-fixed property holds — adopter-dropped files would be
orphaned without workflow references to invoke them.

### D2. Constitutional rule anchors workflow-trigger compliance

Add a new rule to `DEV-RULES.ARC.md` (candidate: § Verification and Discovery,
subsection "Method and extension loading"). Short, imperative, P10-anchored:

> When a workflow step references a method, extension, strategy, or workflow,
> load the relevant content before acting on that step. Don't proceed from
> intuition when a governing reference is one link away.

**Absolute framing (no "unless already in context" hedge) is deliberate.**
Compliance-reliability research (AGENTIF instruction-following benchmarks,
constitutional-rule audits, motivated-reasoning studies) found conditional hedges
on compliance rules create rationalization surfaces — the agent self-grants the
condition and skips the load. Positive absolutes measurably outperform
conditionals. Meta-constraint confusion between a hedged constitutional rule
and an unhedged in-workflow reminder compounds the effect.

In-workflow references must use semantically aligned framing (absolute, not
hedged). Misalignment between constitutional and inline venues degrades
compliance more than either framing alone.

This makes the behavior durable — not dependent on agent discretion or one-off
workflow wording.

### D3. Operational-context audit with extraction to docs-content-sweep

Content audit across all session-init always-loaded docs, all workflows, and
`strategy-task-list-formatting.md` through the lens: "Does this serve operational
context for agent or human during work?" Extract rationale, background, overflow
examples, and narrative reinforcement for absorption by the docs-content-sweep WU.
Stage extractions in `notes-docs-content-sweep.md` in `backlog/technical/`.

**Retention heuristic:** Keep content that helps conceptual flow, counterintuitive
or nonobvious points, anything confusing if absent. Aim for ~80–90% extraction with
case-by-case retention. Matches the strategies audit precedent.

**Link placeholders:** Slimmed in-repo files leave `[TODO-docs-site]` reference-style
link placeholders pointing at eventual `docs/` destinations. Docs-content-sweep WU
resolves all placeholders during execution. Greppable pattern enables completion
verification.

### D4. Session-type auto-inferred; no new SESSION-NOTES field

The existing SESSION-NOTES `**Working On:**` field already carries a type prefix
(`[planning: name]`, `[execution: name]`, `[integration: name]`). Formalize this
existing pattern: session-init reads it to drive conditional loading; session-handoff
writes it based on current-session state.

**Inference rules** (resolved at init):

- Active status file `**Task List:** [none]` + backlog/planning context → `planning`
- Active status file with incomplete task list → `execution`
- Active status file signals integration-ready OR branch is in integration phase → `integration`
- Between WUs with no active status file → `planning`

User prompt only when genuinely ambiguous. Mid-session pivots handled by re-running
`/arc-resume` or explicit user signal (the documented mitigation from session-type
research).

### D5. arc-config.yml stays as-is structurally

No sibling defaults file. No grep-filter reads. Keep existing human-friendly comments
intact — they serve operational-context understanding for both agent and human, and
are the adopter's primary entry point for understanding configurable behavior.
Absolute token cost is small relative to D1–D4 wins. Content trim per Strategy B
audit may still apply where individual comments cross into rationale territory.

### D6. Session-init workflow restructuring

Once D1 and D3 land, Step 2's parallel batch shrinks (methods/extensions become
targeted index reads; always-loaded docs become slimmer). Step 4 (configuration
check) remains but simplifies. Additional ~1–2k tokens of savings from structural
condensation of session-init.md itself. Semantic flow (gated steps, precedence
rules, trust hierarchy) preserved without reordering.

### D7. Structural conventions for load operations and shape boundaries

Two coordinated authoring conventions, split by mechanism.

**D7a — Inline load-target references: markdown links with path-encoded kind.**
When a workflow step references a method, extension, workflow, or strategy to
load, use a markdown link (reference-style or inline) at the point of invocation.
Target path encodes the kind: `system/methods/*`, `system/extensions/*`,
`system/workflows/*`, `reference/strategies/*`. CI validation derives per-workflow
load-target manifests by grepping link definitions against target-path
conventions. No new tag vocabulary. No block wrappers — a front-loaded
`<dependencies>` manifest would imply eager-load-at-entry semantics, regressing
toward the front-loading this plan is removing.

**D7b — Shape-boundary wrappers: XML tags for templates, output formats, and
extension points.** Use explicit XML-style tags where the agent produces or
consumes against a shape — boundary clarity prevents surrounding guidance from
bleeding into generated output. Bounded vocabulary:

- `<template>...</template>` — template body in template docs (PRD, task list,
  status file, SESSION-NOTES)
- `<output-format>...</output-format>` — shape spec for structured agent-produced
  artifacts (orientation summary, completion reports, handoff summaries)
- `<extension-point name="...">...</extension-point>` — extension boundaries
  (formalizes the existing anchor-ID convention; enables CI validation that
  every extension point has a matching definition in arc-extensions.md)

**Rationale for the split:** External research showed XML tags earn their keep
for structural-section boundaries (Anthropic-trained attention for
content-category delineation), not for inline identifier mentions where tag
clunk costs exceed compliance benefit. Markdown links carry sufficient attention
signal for directives, and encoded-path kind gives CI what XML-tag per-kind
validation would have. Tags apply only where the agent must respect a shape
boundary distinct from surrounding prose.

**Phase placement:** Conventions established during Phase 4 operational-context
audit and applied incrementally as files are touched. Existing files without
the conventions remain valid until their next edit. No sweeping retrofit pass.

## Phased Approach

Phase ordering: trigger completeness before front-load removal; constitutional rule
with or before removal; methods/extensions restructure before content audit (the
restructure affects which body content is in scope for operational audit); content
audit before session-init restructure (restructure depends on slimmed file sizes).

### Phase 1 — Trigger completeness audit

- Audit every method, extension, and config key: confirm ≥1 reliable workflow
  trigger exists
- Strengthen any weak triggers inline (imperative framing, explicit load
  instruction, method-dependencies block where missing)
- **Reliable trigger definition** (research-derived): a reference that is
  (a) positioned at an action step in a workflow reachable from session-init
  or explicit user invocation, (b) phrased in declarative or imperative form
  (not hedged with undefined-state conditions like "if applicable" or
  "unless already loaded"), (c) uses the D7a link convention so CI can
  validate path resolution. Buried references in unreachable or rarely-loaded
  workflows do not qualify as reliable triggers.
- **Reliable-trigger CI check** (implementation): script enumerates all
  method/extension files, greps for qualifying references across workflows,
  DEV-RULES, and strategies per the definition above; fails CI if any method
  or extension lacks ≥1 reliable-trigger reference. Lives alongside the
  framework-sync test. Pre-commit vs. CI placement per Open Question 8.

### Phase 2 — Constitutional rule

- Add "Method and extension loading" subsection to DEV-RULES.ARC § Verification and
  Discovery
- Cross-reference from workflow method-dependencies blocks
- Update `AGENT-BRIEFING.ARC.md` if needed to surface the rule during init

### Phase 3 — Methods/extensions per-file restructure with YAML frontmatter

**Content restructure:**

- Create `system/methods/` and `system/extensions/` directories in both `.arc/`
  and `packages/arc-framework/arc/`
- Split `arc-methods.md` into one file per method; same for `arc-extensions.md`
- Add file-level YAML frontmatter to each file (name, description, workflow,
  related, has-override / has-steps)
- Author `system/methods/README.md` and `system/extensions/README.md` for
  whole-system reading; derive the Method Dependencies table from frontmatter
- Update all cross-references from workflows, DEV-RULES, etc. to point at new
  paths using the D7a link convention
- Update session-init to read aggregated frontmatter at init (thin awareness
  layer) vs. full file bodies
- Retire `arc-methods.md` and `arc-extensions.md`

**CLI updates:**

- `arc init` — install per-file methods/extensions directories with frontmatter
- `arc update` — per-file three-way merge for methods/extensions; migration
  path triggered when old single-file layout detected

**Migration path design:**

- Parse existing `arc-methods.md` and `arc-extensions.md` from adopter
  installations
- Identify populated `.override` sections per method/extension (header + body)
- Map each to target per-file location (`system/methods/{name}.md` frontmatter
  and override block)
- Preserve user content verbatim; no reformatting
- Archive old files on successful migration (not delete — recovery path)
- Handle edge cases: custom sections, malformed overrides, conflicting user edits
- Adopter UX: automatic vs. prompted (see Open Question 7)

**Hook and CI validations:**

- **Frontmatter schema validation** — required fields present and correctly
  typed; values match the YAML contract
- **D7a link-resolution check** — markdown links to `system/methods/*`,
  `system/extensions/*`, `system/workflows/*`, `reference/strategies/*`
  resolve to existing files
- **Framework-sync test updates** — enumerate new per-file directories when
  comparing `packages/arc-framework/arc/` to `.arc/`

Pre-commit vs. CI placement per Open Question 8.

**Test coverage:**

- **Unit**: frontmatter parsing, migration logic, per-file three-way merge
- **Integration**: install fresh / install with pre-existing .arc / update
  from old layout / update with user-modified methods / idempotent re-update
- **E2E**: `arc init` produces expected layout; `arc update` migration path
  end-to-end; `arc update --dry-run` preview correctness; `arc init
  --reconfigure` unaffected
- **Hook behavior tests**: frontmatter and D7a checks reject malformed inputs,
  accept valid ones

### Phase 4 — Operational-context audit + extraction staging

Audit scope (all tiers mandatory):

- **Tier 1** — session-init always-loaded docs: AGENT-BRIEFING.ARC.md,
  AGENT-BRIEFING.PROJECT.md, CLAUDE.ARC.md (and any other agent-specific files),
  DEV-RULES.ARC.md, DEV-RULES.PROJECT.md, QUICK-REFERENCE.md, session-init.md
  workflow itself, arc-config.yml (comment-density pass only)
- **Tier 2** — high-frequency workflows: `3_process-task-loop.md`,
  `prepare-commits.md`, `integrate-work-unit.md`, `session-handoff.md`
- **Tier 3** — other workflows: `1_create-prd.md`, `2_generate-tasks.md`,
  work-unit-lifecycle workflows, supplemental workflows
- **Strategy** — `strategy-task-list-formatting.md` (loaded alongside create-prd and
  generate-tasks; may warrant restructure — extraction to templates/template-tasks
  doc, inline absorption into workflows, or other restructuring; direction decided
  at PRD-time)

Per-file process:

1. Apply operational-context lens: identify rationale, background, multi-example
   lists, narrative reinforcement, duplicated content
2. Retain what serves conceptual flow, counterintuitive points, confusing-if-absent
3. Extract non-operational content to `notes-docs-content-sweep.md` in
   `backlog/technical/` with source-file anchor, content block, suggested
   destination in docs IA, stylistic notes
4. Replace extracted sections with `[TODO-docs-site]` reference-style link
   placeholders
5. Re-verify each file's operational completeness after extraction

Target: ~80–90% extraction rate on rationale/background content, case-by-case
retention per the heuristic.

**Additional audit heuristics** (research-derived, applied during extraction):

- **Prefer declarative over imperative framing** for load directives where it
  reads naturally. "X is loaded here" / "X: loaded in context" tends to reduce
  compliance variance versus "LOAD X" per external research. Don't force
  declarative where imperative reads better; judgment per-occurrence.
- **Operational rationale clauses** (the "because..." pattern on conditionals):
  single clause, ≤12 words, inline with the directive. Purpose is to anchor
  branch decisions against rationalization, not to explain design philosophy.
  Anything longer extracts to `notes-docs-content-sweep.md` under the normal
  rationale-extraction rule.
- **Eliminate hedges with undefined state** — phrases like "unless already
  loaded," "if applicable," "when relevant" create rationalization surfaces.
  Replace with explicit conditions ("if step N incomplete") or remove.
- **Apply D7 conventions opportunistically** as files are touched — markdown
  links at load-reference sites, shape-boundary tags where they apply.

**Hook/CI validation** (introduced as D7b tagging is applied):

- **D7b extension-point match check** — every `<extension-point name="X">` in
  workflows has a matching populated definition section in `arc-extensions.md`
- **Hook behavior tests**: extension-point check rejects mismatched tags,
  accepts valid ones

Pre-commit vs. CI placement per Open Question 8.

### Phase 5 — Partial-read narrowing for mixed-purpose docs and task lists

Narrow the always-loaded partial reads to init-relevant sections only; other
content loads on-demand when workflows reference it.

**QUICK-REFERENCE.md:**

- Init reads `## Environment & Path Context` + `## Runtime Environment`
  sections only
- Command Patterns, Quality Gate Commands, ARC CLI Commands, anti-patterns
  load on-demand
- Update session-init Item 7 spec accordingly

**Active task lists:**

- Session-init Item 10 partial-read spec: Header + Overview + Scope + current
  phase preamble + current task section
- Explicitly skip completed phases' preambles (stale historical context at
  init)
- Verify graduated triple-anchor lookup still resolves cleanly under the
  narrower read

### Phase 6 — Session-init workflow restructuring

- Shrink Step 2 parallel batch (post-Phase 3 effects)
- Simplify Step 4 (configuration check) post-Phase 4 trim
- Tighten Step 7 (mismatch handling) prose
- Preserve semantic flow (no reordering of gated steps)
- Update embedded examples and freshness-check guidance to match new batch structure

### Phase 7 — Session-type conditional loading

**Methodology changes:**

- Formalize `Working On:` field type prefix (planning / execution / integration)
  in SESSION-NOTES template and session-handoff workflow
- Update session-handoff to write type explicitly based on current-session state
- Update session-init to:
    - Read `Working On:` type prefix at init
    - Infer type if SESSION-NOTES is missing or prefix is absent (backwards
      compat)
    - Conditionally load workflows/methods per type
- Define per-type load sets (baseline + mode-specific)
- Document the model in DEV-RULES.ARC or `strategy-session-operations.md`

**CLI and template updates:**

- `arc init` — install updated SESSION-NOTES template with `Working On:` type
  prefix
- `arc join` — same template update; no structural changes otherwise

**Test coverage:**

- **Unit**: session-type inference logic (signals → type resolution)
- **Integration**: session-init with explicit type prefix / with inferred type /
  with ambiguous signals (user-prompt path)
- **E2E**: fresh session-init across each session-type variant produces correct
  load set

### Phase 8 — Verification + before/after measurement

- Run clean session-init against a representative active task list
- Record token count at orientation completion
- Compare against pre-WU baseline (the ~75–80k observation)
- Spot-check sample extractions: 3–5 random passages verified as operational vs.
  non-operational to confirm the audit didn't lose operational content
- Document realized delta in WU archival notes
- If delta is materially short of estimates (>30% off), surface the gap for analysis
  before archival

## Scope Estimate

**Large (3–4 weeks of focused work).** Phase 3 (methods/extensions restructure)
and Phase 4 (operational-context audit) are the heaviest phases — Phase 3 spans
content restructure, CLI/migration work, new validation hooks, and full test
coverage; Phase 4 covers three content tiers plus one strategy with extraction
staging and adds the D7b extension-point match check. Phase 7 adds session-type
conditional loading with template and CLI updates. Other phases are narrower.

**Two-copy discipline:** every framework file change requires sync between
`packages/arc-framework/arc/` and `.arc/`. The framework-sync integration test
catches drift. Affected files: DEV-RULES.ARC, AGENT-BRIEFINGs, QUICK-REFERENCE,
session-init.md, session-handoff.md, process-task-loop.md, prepare-commits.md,
integrate-work-unit.md, create-prd, generate-tasks, work-unit-lifecycle workflows,
supplemental workflows, methods/*, extensions/*, strategy-task-list-formatting.

**Code-side implications:** CLI, hook, CI, and test work are colocated with the
methodology phases each supports — Phase 1 lands the reliable-trigger CI check;
Phase 3 handles per-file methods/extensions install/update/migration plus
frontmatter schema and D7a link-resolution validations, framework-sync test
updates, and associated test coverage; Phase 4 adds the D7b extension-point
match check; Phase 7 handles SESSION-NOTES template updates and session-type
test coverage. arc-config stays as-is structurally; no changes there.

## Unknowns and Open Questions

Resolved via external research (thirteen investigations across two passes —
nine during plan development, four validating the compliance-reliability thesis
against procedural-adherence literature):

- "Reliable trigger" definition — refined via compliance research: action-step
  positioning, declarative/imperative framing, reachable workflow, D7a link
  convention (see Phase 1)
- Front-load vs JIT reliability — ARC's explicit-reference model is structurally
  different from intent-matching; thin-index + explicit-reference hybrid fits;
  pure JIT with no front-load has no empirical baseline in comparable tools
- arc-config format — resolved: keep as-is structurally
- Methods/extensions splits — resolved: per-file with YAML frontmatter (matches
  Claude Skills progressive-disclosure production idiom)
- Grep-filter read pattern — resolved: not an established pattern; ruled out
- Hidden directory conventions — resolved: no tools use `.internal/` for
  human-readable content; keep visible
- Reference-by-link audit heuristics — resolved: concrete heuristics established
  (Strategy B retention principles; D7a link convention)
- Session-type conditional loading — resolved: explicit signal via `Working On:`
  field prefix; auto-inferred at init
- Constitutional rule vs. in-workflow compliance venues — resolved: in-workflow
  triggers are primary (empirically stronger per research); constitutional rule
  adds belt-and-suspenders value only if semantically aligned and hedge-free (D2)
- XML tag applicability — resolved: split by mechanism — D7a markdown links for
  inline load references (lower visual cost, sufficient attention signal); D7b
  XML tags reserved for shape boundaries (templates, output formats, extension
  points) where tag-boundary attention earns its keep
- Compliance-reliability baseline scope — resolved: near-zero failure rate holds
  for Claude/Codex-class agents with focused, well-specified workflows; degrades
  in long sessions, nested conditionals, and on weaker procedural-adherence
  models. ARC's focused-session discipline already mitigates the primary
  degradation vector

Flagged for PRD-time resolution:

1. **Session-type load-set definitions.** Planning / execution / integration each
   need explicit load-set definitions (what's in baseline, what's mode-specific).
2. **Audit pacing within Phase 4.** Tier 1 then 2 then 3, or more granular split?
   Phase 4 is the biggest phase; review cadence matters.
3. **strategy-task-list-formatting restructure direction.** Templates/template-tasks
   doc, inline absorption into workflows, or other.
4. **ADR-013 amendment scope.** Method loading model is changing; amendment is
   in-scope (Tier 2 amendment, not supersession). Draft during Phase 2 or Phase 3.
5. **Link-placeholder resolution verification mechanism.** Markdownlint custom
   rule, separate CI check, or docs-content-sweep WU-internal check?
6. **Measurement rigor for Phase 8 verification.** Statusline token counts
   include harness overhead. Single clean run, averaged across N, or both
   (loadset-only + full orientation)?
7. **CLI migration path granularity.** Automatic migration of user overrides on
   `arc update`, or prompted/manual? Needs UX decision.
8. **Hook vs. CI check placement.** Which new validations (frontmatter schema,
   D7a link resolution, D7b extension-point match, reliable-trigger audit,
   framework-sync updates) run in pre-commit hooks (fast, local, block bad
   commits early) vs. GitHub Actions CI (slower, canonical, catches what
   escapes local checks)? Likely split: frontmatter schema and D7a as
   pre-commit (per-file, fast); reliable-trigger audit and framework-sync as
   CI (cross-file, slower); D7b could go either way. Decision affects
   developer UX and CI coverage strategy.

## Dependencies and Constraints

**Depends on:** Nothing upstream — the blocking dependency (Work-Status Restructure
WU) has merged (`27771f6`) and archived (`15c4a18`). This WU sits on batch branch
`technical/plan-session-init-optimization`.

**Feeds:** `plan-docs-content-sweep.md` absorbs Phase 4 extractions via
`notes-docs-content-sweep.md` staging file (the consumer plan was updated to
explicitly accommodate this input type; see that plan's § Items to Sweep →
Content Contributions).

**Does not block:** `plan-arcd-rebrand.md`, `prd-arcd-docs-site.md`,
`plan-arc-modes.md`, `plan-expanded-planning-path.md`.

**Scope discipline:**

- **In scope:** session-init load set (items 1–11 + config reads), session-init
  workflow itself, per-file methods/extensions restructure with CLI support,
  Tier 1–3 content audit, task-list-formatting strategy pass, constitutional rule,
  session-type conditional loading
- **Out of scope:** docs-site-side integration of extracted content (→
  `plan-docs-content-sweep.md`); Starlight migration (→
  `prd-arcd-docs-site.md`); new adopter-facing extensibility models
  (methods/extensions remain framework-fixed); document classification system
  (T1/T2/T3 from `strategy-session-operations.md`)

**Adopter impact:** Breaking-for-update changes. `arc update` handles the directory
restructure and content slim-down with automatic three-way-merge. Release note
should clearly flag: new methods/extensions layout, new constitutional rule,
SESSION-NOTES `Working On:` type prefix formalization. User customizations
(overrides, extension steps) preserved across per-file restructure.

## Risks

1. **Audit quality risk.** Over-aggressive extraction could lose operational content.
   Mitigation: retention heuristic (flow / counterintuitive / confusing-if-absent),
   spot-check verification in Phase 8, case-by-case judgment throughout Phase 4.

2. **Compliance risk from front-load removal.** Even with thin index + explicit
   references, behavior shift may expose edge cases. Mitigation: constitutional
   rule (Phase 2) lands before removals (Phase 3–4); trigger completeness audit
   (Phase 1) catches gaps; Phase 8 verification measures correctness.

3. **Per-file restructure cross-reference drift.** Many workflows reference methods
   and extensions by anchor. Moving to file-paths requires updates across the
   codebase. Mitigation: automated grep-and-replace pass; CI check for broken
   references; Phase 3 explicitly scoped to include all cross-reference updates.

4. **Docs-content-sweep coordination lag.** Staging file produces docs-content-sweep
   inputs, but docs-content-sweep activates only after docs-site migration merges.
   Extracted content may sit for weeks before integration. Mitigation: staging file
   is self-contained and durable; link placeholders in slimmed files are greppable
   so integration completeness is verifiable at docs-content-sweep time.

5. **Measurement target may not hit.** Success criteria project ~25–35% reduction;
   actual may differ. Mitigation: measurement is a reporting metric, not a gate; if
   delta is materially short, Phase 8 surfaces the gap for analysis rather than
   blocking archival.

6. **CLI migration edge cases.** Adopters with populated `.override` sections in
   `arc-methods.md` need clean migration to per-file structure. Mitigation:
   migration path designed in Phase 3; test against contrived adopter scenarios
   before adopter-facing release.

## Success Criteria

- Observed tokens-at-orientation-completion drops by ≥25% (from ~75–80k to ≤60k) in
  a clean maintainer session with active task work
- No regressions in session-init correctness: every orientation summary section
  (active work state, blockers, non-default config, freshness, next action) remains
  accurate
- Framework-sync test passes (every method/extension has ≥1 reliable trigger)
- DEV-RULES.ARC "Method and extension loading" rule lands and is cross-referenced
  from relevant workflows
- Methods/extensions restructured to per-file with YAML frontmatter; cross-references
  across workflows updated; README files cover whole-system reading
- Operational-context audit completes across Tier 1–3 + task-list-formatting
  strategy; extractions staged in `notes-docs-content-sweep.md` with suggested
  destinations and stylistic notes; link placeholders greppable in slimmed files
- Session-type conditional loading active; SESSION-NOTES `Working On:` type prefix
  formalized; auto-inference handles common cases without user prompts
- CLI (`arc init` / `arc update`) handles new methods/extensions directory structure
  including migration path for existing adopters
- Adopter-facing changes documented in release notes with clear upgrade guidance
- Late-session behavior (20+ task completions in a single session) verifies
  naturally in the first post-change task-executing WU; regressions surfaced
  and reported if observed. Not bundled into Phase 8 to avoid synthetic test
  material

## References

- **Origin:** `atomic-work-status-restructure.md` § "Audit session-init context load
  for token-usage reductions" — atomic task that commissioned the audit
- **Audit findings:** Preserved in conversation leading to this plan's refinement
  (captured in WU notes file during PRD creation)
- **External research** (thirteen investigations across two passes):
    - **Plan development pass (nine):**
        - Config file design idioms (ESLint, Prettier, TypeScript, Biome, Vite)
        - Agent context-loading patterns (Cursor, Claude Code, Aider, MCP)
        - Prompt caching impact on context organization
        - Grep-filter read pattern prior art (ruled out as novel/risky)
        - Hybrid index+body pattern mechanics (Cursor rules, Claude Code skills,
          MCP)
        - Token reduction angles beyond architecture (compression,
          link-not-inline, session-type loading)
        - Hidden/internal directory conventions (ruled against `.internal/` for
          human-readable content)
        - Reference-by-link audit heuristics (Mintlify, `/llms.txt`, agent-doc
          anti-patterns)
        - Session-type conditional loading patterns (Cursor modes, Aider
          architect, explicit-signal + progressive-disclosure consensus)
    - **Compliance-reliability validation pass (four):**
        - Procedural instruction-following reliability in long-horizon agent
          tasks (IFEval, AGENTIF, agent drift, model-specific adherence)
        - Structural phrasing patterns for embedded procedural instructions
          (declarative vs. imperative, positive vs. negative framing, hedge
          effects, XML-tag attention boundaries)
        - Thin front-loaded index vs. pure JIT compliance (Claude Skills,
          Cursor Rules, MCP, RAG-MCP ablation findings)
        - Constitutional rules vs. in-workflow inline reminders (system-prompt
          decay, meta-constraint confusion, venue alignment requirements)
- **Related strategies:** `strategy-session-operations.md` (context loading tiers),
  `strategy-configurability-architecture.md` (override mechanisms),
  `strategy-package-project-sync.md` (two-copy discipline),
  `strategy-task-list-formatting.md` (in scope for Phase 4 restructure)
- **Related ADRs:** ADR-013 (method loading model) — Tier 2 amendment in scope;
  reflects constitutional rule addition and per-file restructure
- **Consumer WU:** `plan-docs-content-sweep.md` absorbs Phase 4 extractions via
  `notes-docs-content-sweep.md` staging file

## Document History

| Date       | Change                                                                                         |
|------------|------------------------------------------------------------------------------------------------|
| 2026-04-16 | Initial draft — problem framed, 7-phase approach, 7 open questions flagged                     |
| 2026-04-17 | Research-driven revision — 4 strategies, 9 phases, per-file methods/extensions, content audit  |
| 2026-04-17 | Compliance-reliability validation — D2 absolute framing, D7 structural conventions added       |
| 2026-04-17 | Code-side scope — Phase 9 added for CLI/hook/CI/test work; old Phase 9 renumbered to Phase 10  |
| 2026-04-17 | Phase restructure — code-side colocated; Phase 5+6 merged; 10 phases → 8                       |
