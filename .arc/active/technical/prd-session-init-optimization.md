# PRD: Session-Init Optimization

**Type:** Technical

---

## Introduction

ARC's session-init currently loads a large document set up front. A fresh audit observed ~40k
tokens of loadset content read at every session init, and ~70–80k tokens at orientation
completion (loadset plus harness overhead, tool schemas, skill registry, and init work
products). The load set has drifted upward over several weeks — roughly ~29–35k → ~45–50k →
~75–80k — as new content accreted onto the front-loaded baseline.

**Why now:** 70–80k tokens before the first unit of work is a hard sell for adopters, and the
framework is approaching broader dogfooding and public release. ARC's configurability carries
inherent overhead a centralized-for-solo-use framework wouldn't — defensible, but the current
overhead exceeds the architectural floor by a material margin. The overlapping dependency
(Work-Status Restructure) has merged, so this is the first clean window to modify
`session-init.md` without compound edits.

External research validated the optimization approach: pure-JIT loading via conversational
prose triggers is not a production pattern, but ARC's explicit workflow-trigger model is
structurally different from intent-matching dispatch and empirically reliable. A thin
always-loaded index plus YAML frontmatter on capability files matches the production idiom
(Claude Skills progressive disclosure). Combined with content compression and session-type
awareness, the total reduction is larger than any single strategy alone.

## Goals

- **Reduce session-init token cost materially** without losing session consistency or forcing
  agents to proceed from intuition in place of loaded guidance.
- **Preserve compliance reliability.** Load reduction must not regress orientation correctness
  — every summary section (active work state, blockers, non-default config, freshness, next
  action) remains accurate.
- **Establish durable mechanisms, not point fixes.** Constitutional rule, trigger-completeness
  CI check, and structural conventions prevent drift recurrence.
- **Keep adopter impact minimal.** Framework-level changes land behind `arc update`; no
  migration code required for the current zero-adopter state.

## Use Cases

**Session bootstrap — agent perspective.** An agent begins a session via the `arc-resume` skill,
reads the loadset, and produces an orientation summary. The current cost pushes the agent toward
~75–80k observed tokens before any work begins. The optimized flow loads a thin methods/extensions
index plus operationally-trimmed baseline docs, with full method/extension bodies loading
on-demand when workflows reference them.

**Session type differentiation.** Today, session-init treats planning, execution, and
integration sessions largely identically — the only conditionality is task-list-present or not.
Planning sessions load execution-oriented content; integration sessions lack direct access to
the integrate-work-unit workflow at init. Per-type load sets tighten this to match actual
session needs.

**Compliance against rationalization drift.** As sessions age and contexts fill, agents can
rationalize skipping loads ("I already have the gist of that method"). Absolute, hedge-free
constitutional framing plus explicit named references inside workflows make compliance
decisions deterministic rather than discretionary.

## Requirements

Prioritized to signal sequencing and deferability under scope pressure. MVP is P0 (Phases 1–3);
P1 is content-compression layer (Phases 4–6); P2 is session-type conditional loading (Phase 7).

### P0 — MVP (must-have)

**P0.1 Trigger completeness audit.** Every method and extension has ≥1 reliable-trigger
reference. "Reliable trigger" means: positioned at an action step in a reachable workflow,
phrased declarative/imperative (no hedges like "if applicable" or "unless already loaded"),
uses the D7a link convention.

**P0.2 Workflow frontmatter trigger contract + CI check.** Workflow files declare their
method/extension dependencies via YAML frontmatter (`arc.methods`, `arc.extensions` arrays).
All `system/workflows/**/*.md` files migrate to this schema; body-level "Method dependencies
(load on first reference):" prose preambles retire. CI script enumerates method/extension
files, parses workflow frontmatter, fails CI if any method or extension lacks ≥1 declaration.
Placement: CI (whole-repo frontmatter parse). Scope is workflows only — constitution and
strategies are informational, not trigger declarations.

**P0.3 Constitutional rule pair.** Paired rules anchor the frontmatter trigger contract, each
placed by load-frequency tier:

> **Author-side declaration** — in `strategy-workflow-authoring.md § Author-side Declaration
> Rule` (T3 on-demand; loaded when authoring workflows). When a workflow loads a method or
> extension, declare it in the workflow's frontmatter `arc.methods` or `arc.extensions` array.
> The declaration is the load contract; in-step markdown links and prose references remain for
> reader navigation but do not constitute the trigger. Framework-repo CI enforces ≥1
> declaration per method and extension; project workflows carry no coverage requirement.
>
> **Agent-side compliance** — in `DEV-RULES.ARC § Verification and Discovery § Method and
> extension loading` (T1; every session). When a workflow declares method or extension
> dependencies in its YAML frontmatter (`arc.methods` / `arc.extensions`), load the declared
> content before executing the workflow. Don't proceed from intuition when the declared
> content is one read away.

Split placement matches T1/T3 load frequency to operational need: agent-side loading
compliance is universal every-session behavior; author-side authoring is a rare procedural
event. No AGENT-BRIEFING.ARC cross-reference — the DEV-RULES home is already every-session
loaded; duplication would add drift risk without improving compliance.

**P0.4 ADR-013 amendment drafted (Phase 2).** Tier 2 amendment reflecting the method-loading
model change (per-file structure with frontmatter index). Sanity check pass in Phase 3 to
verify the amendment matches the concrete restructured model; tweak if needed.

**P0.5 Per-file methods restructure.** `arc-methods.md` retired. Each method becomes
`system/methods/{name}.md` in both `packages/arc-framework/arc/` and `.arc/`. Files carry
triple-dash YAML frontmatter with fields: `name`, `description` (one-line operational purpose),
`related` (related method names), `override-active` (populated status signal; `true` when the
file's override body is populated, `false` when the default is in effect). The reverse index
(method→workflows) lives in `strategy-session-operations.md § Method classification by trigger`
— no per-file `workflow` field, which would duplicate and go lossy when methods fan out.

**P0.6 Per-file extensions restructure.** `arc-extensions.md` retired. Each extension becomes
`system/extensions/{name}.md`. Same frontmatter contract, with `active` in place of
`override-active` (`true` when the extension's `.actions` section is populated, `false` when
the extension is an empty placeholder). Section heading convention: `.actions` (renamed from
legacy `.steps`).

**P0.7 Directory READMEs.** `system/methods/README.md` and `system/extensions/README.md`
provide whole-system human-facing reading; Method Dependencies table derived from frontmatter.
READMEs are not agent-init-loaded.

**P0.8 Session-init consumption — asymmetric split.** Methods carry no init read; bodies
load at workflow trigger per the calling workflow's `arc.methods` frontmatter and the
agent-side compliance rule. Extensions are enumerated by a single `grep -l "^active: true"`
across `system/extensions/*.md`, producing the active-extensions list consulted by fire-point
directives at their workflows. Session-init Step 2 adjusted accordingly.

**P0.9 Cross-reference updates.** All workflow / DEV-RULES / strategy references to
`arc-methods.md#anchor` and `arc-extensions.md#anchor` updated to point at new file paths
using the D7a link convention.

**P0.10 Frontmatter schema validation.** Pre-commit hook validates required fields present,
correctly typed, values match YAML contract.

**P0.11 D7a link-resolution validation.** Pre-commit hook validates markdown links to
`system/methods/*`, `system/extensions/*`, `system/workflows/*`, `reference/strategies/*`
resolve to existing files.

**P0.12 Framework-sync CI updates.** Existing framework-sync integration test enumerates new
per-file directories when comparing package source to `.arc/`.

**P0.13 Test coverage for per-file restructure.** Unit (frontmatter parsing, per-file
three-way merge); integration (fresh install, install with pre-existing .arc, update, idempotent
re-update); E2E (`arc init` produces expected layout, `arc update` works end-to-end,
`arc init --reconfigure` unaffected); hook behavior tests.

### P1 — Content compression layer

**P1.1 Operational-context audit — Tier 1.** Audit session-init always-loaded docs
(AGENT-BRIEFING.ARC, AGENT-BRIEFING.PROJECT, CLAUDE.ARC and other agent files, DEV-RULES.ARC,
DEV-RULES.PROJECT, QUICK-REFERENCE, session-init.md, arc-config.yml comments) through the
"operational context only" lens.

**P1.2 Operational-context audit — Tier 2.** Audit high-frequency workflows:
`3_process-task-loop.md`, `prepare-commits.md`, `integrate-work-unit.md`, `session-handoff.md`.

**P1.3 Operational-context audit — Tier 3.** Audit remaining workflows: `1_create-prd.md`,
`2_generate-tasks.md`, work-unit-lifecycle workflows, supplemental workflows.

**P1.4 Task-list-formatting restructure (dedicated step).** Three coordinated moves:

- Extract template blocks (feature/technical header, incidental header, verification phase,
  atomic companion, success criteria) to new `.arc/reference/templates/template-tasks.md`
- Relocate Quick Format Checklist into `2_generate-tasks.md` Step 4
- Trim `strategy-task-list-formatting.md` to rules-only catalogue; cross-reference to
  template-tasks.md; apply operational-context audit on the trimmed result

**P1.5 Retention heuristic applied throughout audit.** Keep content that helps conceptual flow,
counterintuitive points, anything confusing if absent. Target ~80–90% extraction on
rationale/background/overflow-example content with case-by-case retention.

**P1.6 Extracted content staged in `notes-docs-content-sweep.md`.** Staging file in
`backlog/technical/` captures: source-file anchor, content block, suggested destination in
docs IA, stylistic notes. Consumed by docs-content-sweep WU when that WU activates.

**P1.7 Link placeholders.** Slimmed in-repo files carry `[TODO-docs-site]` reference-style
link placeholders at extraction sites. Greppable pattern; docs-content-sweep verifies
completion.

**P1.8 Audit heuristics applied during extraction.** Prefer declarative over imperative
framing for load directives where natural. Operational rationale clauses (the "because..."
pattern) single-clause, ≤12 words, inline — anything longer extracts. Eliminate hedges with
undefined state ("unless already loaded", "if applicable", "when relevant").

**P1.9 D7b extension-point convention.** `<extension-point name="...">...</extension-point>`
tags formalize existing anchor-ID convention in workflows. Applied opportunistically as files
are touched during the audit.

**P1.10 D7b extension-point match validation.** Pre-commit hook validates every
`<extension-point name="X">` tag has a matching populated definition in extensions. Placement:
pre-commit (workflow staging triggers grep for matching definition).

**P1.11 QUICK-REFERENCE partial-read narrowing.** Session-init reads `## Environment & Path
Context` + `## Runtime Environment` sections only. Command Patterns, Quality Gate Commands,
ARC CLI Commands, anti-patterns load on-demand via workflow references.

**P1.12 Task list partial-read narrowing.** Session-init Item 10 reads Header + Overview +
Scope + current phase preamble + current task section. Skips completed phases' preambles.
Graduated triple-anchor lookup continues to resolve under the narrower read.

**P1.13 Session-init workflow restructuring.** Step 2 parallel batch shrinks post-P0 — the
active-extensions grep joins identity/role resolution and item 1–8 reads in Batch 1;
SESSION-NOTES + task list + conditional task-execution-workflow land in Batch 2. Step 4
configuration check simplifies post-audit (non-defaults only; no method-override survey).
Step 7 mismatch-handling prose tightened. Strategy-doc "See X for Y" citations removed from
Step 2 and Step 4 per the imperative-citation safety pass — agents receive the directive at
the venue where it fires, not an out-of-workflow pointer. Semantic flow preserved (no
reordering of gated steps). Embedded examples and freshness-check guidance updated to match
new batch structure.

**P1.14 DEV-RULES section-level partial-reading (reliability-gated per rule).** Apply the
partial-read pattern to DEV-RULES.ARC and DEV-RULES.PROJECT at section granularity
(sub-section granularity permitted where needed). Each rule or section-cluster is
independently evaluated during Phase 4 against a strict reliability bar:

- **Conditional-load eligible** when the content has a clear, reliable trigger — session
  type, config value (e.g., `pm.mode: arc-in-git`), or workflow activity detectable at
  session-init
- **Must remain up-front loaded** when the trigger boundary is ambiguous, content cross-cuts
  multiple activities, or reliability can't be established with confidence

**Default is up-front load.** Shifting content to conditional-load requires explicit
reliability justification recorded in Phase 4 notes. Safety-floor principle: "up-front load
remains correct" is always a valid disposition; reduction is opportunistic, not mandatory.

Candidate sections for evaluation (not predetermined dispositions):

- DEV-RULES.ARC § Task Execution
- DEV-RULES.ARC § Capture Routing
- DEV-RULES.PROJECT § Quality Gates
- DEV-RULES.PROJECT § Package-Project Sync

**Per-rule disposition recorded:** conditional-load (with named trigger) / up-front-load
(with reason) / retired-as-rationale (if the content is better handled by the Phase 4
content audit rather than loading logic).

### P2 — Session-type conditional loading

**P2.1 Probe-computed `sessionType` from tracked state.** The composite probe envelope
(`arc status --session-init --json`) carries an inferred `sessionType` ∈
`{"planning", "execution", "integration", null}` computed in `resolveSessionInit` from the
resolved status file's tracked fields. SESSION-NOTES `**Session Type:**` is an opt-in
personal-layer override — present and valid (case-insensitive
`planning | execution | integration`) supersedes the envelope; invalid value → ignored +
warning at session-init. Default behavior requires zero handoff ceremony — inference covers
the 99% case.

**P2.2 Inference rules at the probe.** Computed in `inferSessionType(taskList, nextAction)`:

- `resolution === "none"` (no active work) → `planning`
- `resolution === "multiple"` (disambiguation pending) → `null` (recompute after disambiguation)
- `resolution === "single"`:
    - `**Task List:**` ∈ `{null, [none], [none associated]}` → `planning`
    - `**Next Action:**` matches `/^(integrate-work-unit|archive-work-unit)\b(?!-)/i` → `integration`
    - else → `execution`
- Contributor-identity-missing short-circuit → `planning`

Negative lookahead defends against hyphen-extended identifiers.

**P2.3 Per-type load sets.** Items 1–8 of `session-init.md` Step 3 (briefings, rules, strategy
index, QUICK-REFERENCE, status file partial-read, SESSION-NOTES) load universally. Items 9–10
gate on `sessionType`:

| Load                            | Planning | Execution                | Integration              |
|---------------------------------|:--------:|:------------------------:|:------------------------:|
| Items 1–8 (universal)           |    ✓     |            ✓             |            ✓             |
| Item 9 — task list partial read |    ✗     |            ✓             |            ✓             |
| Item 10 — lifecycle workflow    |    —     | `3_process-task-loop.md` | `integrate-work-unit.md` |

No supplementary method preloads per type — methods load on first workflow reference. Planning
has no lifecycle workflow today; forward-compatible with `refine-plan-loop.md` if the Expanded
Planning Path WU lands.

**P2.4 SESSION-NOTES override field.** SESSION-NOTES template (single adopter-facing copy)
gains an optional, commented-out `**Session Type:**` line in Handoff Metadata with adjacent
semantics documentation. `session-handoff.md` § Comprehensive Handoff Format documents the
override and the "don't write by default" guidance. Override resolution is agent-side at
SESSION-NOTES read-time — the probe stays focused on tracked state; personal-layer context
stays in the agent's hands. Boundary preservation eliminates the marker drift surface that
an explicit-prefix design would carry.

**P2.5 Test coverage for session-type.** Unit
(`__tests__/unit/active/session-type.test.ts` — `inferSessionType` logic);
integration at the active-probe layer
(`__tests__/integration/active.test.ts` — envelope-level inference across all
active-state shapes) and the composite-probe layer
(`__tests__/integration/status.test.ts` — `sessionType` travels through
`runSessionInitStatus`); E2E (`__tests__/e2e/session-init.e2e.test.ts` —
`arc status --session-init --json` binary output across type variants).
Override behavior is agent-side and exercised manually via SESSION-NOTES override toggle at
phase close (workflow-doc walkthrough).

### Verification (applies across all priorities)

**V.1 Measurement.** Clean session-init against a representative active task list, record
tokens at orientation completion, compare against baseline (~75–80k). Document realized delta.

**V.2 Audit quality spot-check.** 3–5 random extracted passages verified as operational vs.
non-operational to confirm operational content wasn't lost during Phase 1 audits.

**V.3 Late-session verification is organic.** The first post-change task-executing WU
naturally exercises late-session behavior (20+ task completions in a single session).
Regressions surfaced and reported if observed. Not bundled into verification phase to avoid
synthetic test material.

## Non-Goals

- **Automatic migration code for `arc update`.** Zero adopters currently; dev repo maintains
  two-copy sync manually. All breaking changes land pre-publication — `plan-arcd-rebrand`
  republishes under the new package name with no migration audience. Migration WU can be
  commissioned later if actual adopter need materializes.
- **Docs-site-side integration of extracted content.** Handled by `plan-docs-content-sweep.md`.
- **Starlight migration or docs-site build work.** Handled by `prd-arcd-docs-site.md`.
- **Adopter-facing methods/extensions extensibility model.** Methods and extensions remain
  framework-fixed; adopter-dropped files would be orphaned without corresponding workflow
  references.
- **Document classification system (T1/T2/T3) from `strategy-session-operations.md`.**
  Out-of-scope here; may be revisited in a separate effort.
- **arc-config.yml structural changes.** Stays as-is (comments serve human+agent operational
  context; splits damage authoring UX). Content trim applied where individual comments cross
  into rationale territory.
- **Widening `arc sync` to cover the worktree channel.** Worktree drift detection lives
  inside session-init only. Outside of session-init, users use plain git (`git fetch`,
  `git pull --ff-only`). Keeps `arc sync` scoped to notes; preserves the trust boundary
  between notes (per-identity ref, low-risk) and worktree (affects working tree, hooks, CI).
- **`always` mode for worktree `init_pull`.** Offered as `manual | prompt` only. Auto-pulling
  a checked-out branch on session start has no mainstream precedent and introduces
  categorically larger risk than notes auto-pull (hook triggers, CI webhooks, uncommitted
  changes, network-hang blocking). Research-validated decision.

## Technical Considerations

### Architectural Shape

Per-file methods/extensions with file-level YAML frontmatter is the central structural change.
Session-init consumption is asymmetric: methods carry no init read — bodies load at workflow
trigger per the calling workflow's `arc.methods` declaration — and extensions are enumerated
by a single `grep -l "^active: true"` across `system/extensions/*.md`, producing the
active-extensions list consulted by fire-point directives. Full method and extension bodies
load only when their workflows reference them. This matches the Claude Skills
progressive-disclosure production idiom.

File-level frontmatter is standard (Jekyll, Hugo, Astro, Obsidian, Cursor rules, Claude Code
skills) and parseable by standard tools. Per-section mid-file metadata would require custom
syntax — rejected. Cross-references become file-link-based; three-way merge becomes file-level.

### Authoring Conventions (D7)

Two coordinated conventions, split by mechanism.

**D7a — Inline load-target references plus frontmatter trigger contract.** Workflow steps
reference methods, extensions, workflows, and strategies via markdown link at point of
invocation; target path encodes kind (`system/methods/*`, `system/extensions/*`,
`system/workflows/*`, `reference/strategies/*`). For methods and extensions, the authoritative
load trigger is the workflow's YAML frontmatter (`arc.methods` / `arc.extensions` arrays) —
agents load declared dependencies when they read the workflow, per the agent-side compliance
rule. In-step markdown links serve reader navigation only, not as triggers. Framework-repo CI
enforces ≥1 declaration per method and extension. Strategies and workflows (no frontmatter
analog) load on explicit in-step directives ("load and follow X"); STRATEGY-INDEX provides the
T1 navigation layer. No new tag vocabulary for inline references.

**D7b — Shape-boundary wrappers: XML tags for templates, output formats, and extension points.**
Explicit XML-style tags where the agent produces or consumes against a shape, preventing
surrounding guidance from bleeding into generated output:

- `<template>...</template>` — template body in template docs
- `<output-format>...</output-format>` — structured agent-produced artifacts (orientation
  summary, completion reports, handoff summaries)
- `<extension-point name="...">...</extension-point>` — extension boundaries; formalizes the
  existing anchor-ID convention; enables CI validation

Applied opportunistically as files are touched during the Phase 4 audit. No sweeping retrofit.

### Validation Placement

| Check                     | Placement  | Rationale                                                                    |
| ------------------------- | ---------- | ---------------------------------------------------------------------------- |
| Frontmatter schema        | pre-commit | Per-staged-file, schema check is cheap                                       |
| D7a link resolution       | pre-commit | Per-staged-file, file-existence check is cheap                               |
| Reliable-trigger audit    | CI         | Parses workflow frontmatter; checks each method/extension has ≥1 declaration |
| Framework-sync            | CI         | Two-directory comparison; existing pattern                                   |
| D7b extension-point match | pre-commit | Fast grep check when workflow files stage; catches rename drift immediately  |

### Session-Init Consumption Model

Session-init does the minimum work to unblock downstream workflows. Methods carry no init
read — bodies load at the calling workflow's trigger point per the agent-side compliance rule
(DEV-RULES.ARC § Method and extension loading). Extensions are enumerated via a single
`grep -l "^active: true"` producing the active-extensions list; fire-point directives consult
the list by name and skip invocation for extensions not on it, avoiding repeated placeholder
reads across a session in default installs where most extensions are empty. ARC's value
remains the explicit workflow model — methods and extensions load when workflows reference
them by name. External research (AGENTIF, IFEval, compliance-reliability literature)
validated this direction: ARC's explicit-reference triggers are structurally closer to link
resolution than intent classification, and empirically reliable in current use.

### Remote-Sync Integrity (dual-channel)

Session-init integrity depends on two independent git refs: the checked-out branch
(`refs/heads/<branch>` vs `refs/remotes/origin/<branch>`) and the per-identity notes ref
(`refs/notes/arc/user/<identity>`). Phase 3.R.e landed the notes half of the probe and
orientation machinery; Task 5.0 (Phase 5) completes the scope by adding the worktree
channel with its own prompt and config. Both channels gated behind `session.remote_sync`.
Per-channel config `session.init_pull.{worktree,notes}` (`manual | prompt | always`,
default `prompt`; `always` disallowed for worktree) controls prompt behavior. Worktree
pulls precede notes pulls when both channels are remote-ahead — the notes ancestor walk
depends on HEAD being current. Divergence is non-blocking; surfaced as a distinct
orientation section so the agent can continue session-init while the user decides
merge-vs-rebase, and carried forward as an active constraint so later commit requests
are flagged against unresolved divergence. Reporting honesty extends beyond session-init:
`arc user status` and `arc sync` direction reporting carry a qualifier line when the
worktree is out of sync, so a "clean" notes verdict run in isolation isn't misread as
"fully up-to-date" when the check is bounded by a stale worktree.

### Constitutional Rule Framing

Absolute, hedge-free framing is deliberate. Compliance-reliability research found conditional
hedges on compliance rules ("unless already in context") create rationalization surfaces —
the agent self-grants the condition and skips the load. Positive absolutes measurably
outperform conditionals. Meta-constraint confusion between a hedged constitutional rule and
unhedged in-workflow references compounds the effect — both venues must align.

### Two-Copy Discipline

Every framework-file change requires sync between `packages/arc-framework/arc/` and `.arc/`.
The framework-sync integration test catches drift. Files touched: DEV-RULES.ARC,
AGENT-BRIEFINGs, QUICK-REFERENCE, session-init.md, session-handoff.md, process-task-loop.md,
prepare-commits.md, integrate-work-unit.md, create-prd, generate-tasks, work-unit-lifecycle
workflows, supplemental workflows, methods/*, extensions/*, strategy-task-list-formatting,
templates/template-tasks.md (new).

### Dependencies

- **Upstream (complete):** Work-Status Restructure (merged `27771f6`, archived `15c4a18`),
  Methodology Maturation (complete).
- **Feeds:** `plan-docs-content-sweep.md` absorbs P1 extractions via
  `notes-docs-content-sweep.md` staging file.
- **Does not block:** `plan-arcd-rebrand.md`, `prd-arcd-docs-site.md`, `plan-arc-modes.md`,
  `plan-expanded-planning-path.md`.

### Adopter Impact

Breaking-for-update changes. `arc update` handles directory restructure and content slim-down
via three-way merge. Pre-publication breaking changes from this WU (methods/extensions layout,
constitutional rule, agent-file surface removal, briefs rename, probe-side `sessionType`
inference with optional SESSION-NOTES override) land before any adopter exists —
`plan-arcd-rebrand` republishes
under the new package name without a migration path (PRD § "no changelog for the rename, no
release notes"). User customizations (overrides, extension steps) preserved across per-file
restructure where adopters exist; for current zero-adopter state, two-copy manual sync handles
the dev repo.

## Success Criteria

### MVP gate (P0 / Phases 1–3)

Binary qualitative criteria. MVP ships when all hold:

- `arc-methods.md` and `arc-extensions.md` retired; replaced by per-file directories with
  YAML frontmatter
- Session-init loads the aggregated frontmatter index, no longer full-reads the legacy files
- Reliable-trigger CI check active and passing
- "Method and extension loading" rule landed in DEV-RULES.ARC, cross-referenced from relevant
  workflows
- ADR-013 amendment drafted and sanity-checked against the implemented model

**Soft MVP indicator** (reported, not gated): ~8–12% reduction of loadset (~40k baseline).

### Full WU gate

- **Observed tokens-at-orientation-completion drops by ≥25%** (from ~75–80k to ≤60k) in a
  clean maintainer session with active task work
- No regressions in orientation correctness: every summary section (active work state,
  blockers, non-default config, freshness, next action) remains accurate
- Operational-context audit completes across Tier 1–3 + task-list-formatting restructure;
  extractions staged with suggested destinations; link placeholders greppable
- Session-type conditional loading active; probe-side `sessionType` inference handles
  common cases without user prompts, with SESSION-NOTES retaining an optional override
- CLI (`arc init` / `arc join`) delivers updated SESSION-NOTES template
- Two-copy sync clean; framework-sync test passing

### Measurement discipline

Measurement is a reporting metric, not a gate beyond the ≥25% threshold. If delta is
materially short of estimates (>30% below), the verification phase surfaces the gap for
analysis rather than blocking archival.

## Open Questions

### Resolve during work

These are execution-detail questions deferred to task generation or implementation — not
approach-shaping.

1. **Phase 4 audit pacing.** Tier 1 → Tier 2 → Tier 3 as single pass each, or more granular
   per-file pacing? Review cadence matters for the biggest phase.
2. **Link-placeholder resolution verification mechanism.** Markdownlint custom rule, separate
   CI check, or docs-content-sweep WU-internal check? Affects completion verification at
   docs-content-sweep time.
3. **Phase 8 (verification) measurement rigor.** Statusline token counts include harness
   overhead. Single clean run, averaged across N, or both (loadset-only + full orientation)?

### Resolved during discovery

Notable outcomes from discovery and research: arc-config stays as-is structurally;
automatic migration code scoped out (zero-adopter state); hook-vs-CI validation placement
decided per-check; MVP gate is qualitative with soft numeric indicator;
task-list-formatting restructure direction set (hybrid split — extract templates, relocate
checklist, trim strategy).

## Document History

| Date       | Change                                                                                |
|------------|---------------------------------------------------------------------------------------|
| 2026-04-18 | Initial draft                                                                         |
| 2026-04-20 | P0.2/P0.3/D7a refined: workflow frontmatter trigger contract; constitutional pair     |
| 2026-04-20 | P0.3/D7a narrowed at Phase 2.1 landing: frontmatter-triggered rule; T1/T3 split       |
| 2026-04-23 | Task 5.0 revived; dual-channel remote-sync integrity (worktree + notes)               |
| 2026-04-27 | P2 design pivot: explicit `Working On:` type-prefix → probe-side inference + override |
