# Draft: Doc Cascade Sweep

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** The terminal cleanup member — retire the superseded tier / incidental conceptual vocabulary that
  the model's siblings render obsolete, cascade the documentation updates across workflows / strategies /
  templates, drop the `1_`/`2_`/`3_` workflow-file prefixes the scalable pipeline left half-renamed, bring
  pre-existing cohort docs into conformance with the shipped record shape, write back the stale
  `arc-plan-conductor` draft, and codify this cohort's own (manually-run) graduation against
  `decomposition-machinery`'s workflow. `light` by `Class`: broad but determinate — every edit is a known
  find-and-replace-with-judgment, no design to derive and no deep grounding pass needed to plan it correctly (the
  scale axis stays low even though the file count is high). Terminal because it consumes the vocabulary the three
  heavy siblings establish; nothing depends on it, so Concurrent Work Conventions unblocks ahead of it.

---

## Problem / Motivation

The `Class` model, the scalable pipeline, and the decomposition machinery introduce new vocabulary
(`Class` / `light` / `heavy` / `novel` / `planning depth` / `brief` / `outline` / `detailed`) and retire old
framing (the `incidental/` shape, the `atomic` *tier*, "PRD = any spec," the conductor's
`minimum/standard/expanded` modes and `## Scope` task-list-header). Once the siblings ship, conceptual references
to the retired framing linger across the doc surface — orphaned, lint-invisible, quietly contradicting the
shipped model. The same siblings leave three concrete reconciliation debts on the doc surface: the scalable
pipeline drops the `1_`/`2_`/`3_` workflow-file prefixes but renames nothing existing (a mixed interim state),
the decomposition machinery defines a `cohort-{name}.md` record shape that pre-existing cohort docs predate, and
the `active/` layout is documented as per-WU subdirs when it is flat by design. This WU is the mechanical sweep
that closes every one of those gaps, plus the codification of the graduation workflow against the real manual run
that created this very cohort.

## Incidental retirement, not repurposing

The `incidental/` category was a workaround for ARC lacking mobility infrastructure. With worktree isolation
handling interrupts (an atomic-character interrupt defaults to an Errand) and the `Class` model handling
lighter ceremony, the category has no remaining function. Renaming or repurposing would create migration
confusion; clean retirement is simpler. Work Organization Reform already retired the `incidental/` category
*prefix* (Conventional Branch alignment) and the pause-pointer fields; this WU retires the remaining
*conceptual* references in workflows, strategy docs, and templates that frame incidental as a distinct WU shape.

## Incidental / tier retirement ripple (the risk this WU manages)

Retiring the remaining incidental and tier *concept* references affects workflows, strategies, the status
template, and examples. Mechanical but broad. Risk: orphaned references that lint / CI doesn't catch.
Mitigation: thorough grep + integration-test coverage on activate / integrate / archive flows. (The category
*prefix* is already WOR-retired; the `atomic` *tier* is retired by `class-model-foundation` — this WU sweeps the
lingering prose.)

## Vocabulary coherence — the always-loaded pass

Beyond the mechanical retirement above, the surfaces an agent loads every session must read coherently against
the settled `Class` / planning-depth / Work Character model once the siblings ship. Three drift today:

- **`AGENT-BRIEF.ARC`** — explains ceremony scaling but omits the worklist-balancing / parallelism purpose of
  `Class` (the signal roadmap and parallelism planning read to balance a worklist).
- **`DEV-RULES.ARC`** — confirm the `Class` definitions / boundary tests landed by `class-model-foundation` read
  coherently in context; sweep residual tier-era phrasing around them.
- **`session-init.md`** — still forward-points to the old "Expanded Planning Path" framing.

The pass keeps one relationship explicit without re-authoring the full strategy model: **Work Character** decides
whether a concern is atomic / Errand-shaped *below* the WU wrapper, while **`Class`** records WU-scoped weight
across the whole spectrum. Preserve `Atomic` as work character (never flattened into a fourth `Class` value);
update residual `tier`, `atomic tier`, `quick` / `standard`, and `minimum` / `standard` / `expanded` language so
none of it can contradict the `Errand`-floor → `novel`-ceiling model — covering the full `light` → `heavy` →
`novel` range, not just `light` / `heavy`. Run alongside (not instead of) the mechanical reference sweep.

## Documentation cascade

The full set of in-place documentation updates the model triggers, swept here as one coherent pass (the
cross-cutting cascades — `active/` layout, the workflow-file rename, cohort-doc conformance — have their own
sections below):

- **DEV-RULES.ARC** — confirm the `Class` definitions / boundary tests landed by `class-model-foundation` read
  coherently in context; sweep any residual tier-era phrasing around them (see § Vocabulary coherence).
- **`AGENT-BRIEF.ARC`** and **`session-init.md`** — the always-loaded coherence edits (see § Vocabulary
  coherence).
- **`strategy-task-list-formatting.md`** — the phase-count one-grammar (1..N phases + always-present
  verification).
- **`strategy-work-organization.md`** — `Class` integration; the § Spec-Flow Invariants and § Escape-hatch
  updates (replace intent-level / tier phrasing, name the cohort's model as the `Class`-classification home);
  the sizing-norm co-home; the grouping-taxonomy / cohort-doc convention (shared with Concurrent Work
  Conventions + file-classification); the § Task Lists and Branches rewrite to the Model-B-only world
  (stacked-PRs / phased / team-sub-branch pre-ADR-019 leftovers — coordinate with `decomposition-machinery`'s
  flagged reconciliation debt); the canonical `active/`-layout statement (see § `active/` layout).
- **`template-meta.md`** — confirm the new fields (`Class`, `Design` semantics, path-valued `Cohort`) read
  cleanly; retire the reserved-`Tier:` comment now that `Class` exists.
- **`template-tasks.md`** — depth variants.
- **`template-cohort.md`** — confirm it generalizes cleanly from the prototype cohort docs minted at this
  cohort's graduation (owned by `decomposition-machinery`; this WU only sweeps references to it).
- **quality-gate-commands** — `Class` awareness where relevant.
- **`draft-arc-plan-conductor.md`** — the write-back below (retire the `## Scope`-header + the
  `minimum/standard/expanded` modes).

## `active/` layout — flat by design

`active/` is flat **by design**: `active/meta-<name>.md` with `draft-*` / `tasks-*` / `notes-*` companions flat
alongside, because `active/` never holds more than one WU — multiple in-flight WUs live in separate worktrees,
each with its own single-WU `active/`. The implementation already matches (`meta-reader.ts` `findMetaFiles` is a
non-recursive readdir; `worktree-scaffold.ts` `spawnWorktree` writes flat); two adopter-facing strategies misstate
it — `strategy-work-organization.md` § ROADMAP render-walk (`active/**/<wu-name>/meta-<name>.md`) and
`strategy-file-classification.md` (`active/api-modernization/`).

Correct both to flat, and name **one canonical layout statement in `strategy-work-organization.md`** stating not
just *what* (flat) but *why* (one WU per worktree; concurrency = more worktrees, not more metas in one
`active/`). The "why" anchors to `class-model-foundation`'s layout model and is itself a work-organization truth —
work-organization already carries the worktree / lifecycle-state model that makes the flatness a consequence, so
the canonical home sits there rather than in file-classification. `strategy-file-classification.md` states the
*what* and defers for the *why* (and gets its `active/api-modernization/` example corrected); `QUICK-REFERENCE`
carries at most a one-line pointer. Not a design fork — flat is correct, the docs are simply wrong; folds into the
same two-file sweep § Documentation cascade already names. The layout-drift *validation hook* (documented-layout
== reader / scaffold behavior) is **out of scope** — routed to `decomposition-machinery`'s layout-drift hook
family; this WU corrects today's drift, the hook prevents recurrence.

## Workflow file rename cascade — drop the `1_` / `2_` / `3_` prefixes

`scalable-authoring-pipeline` settled the authoring-stage names as the depth-agnostic, verb-object triad
`draft-design` / `create-spec` / `generate-tasks` and dropped the `1_` / `2_` / `3_` number prefixes (the names
self-sequence; a numeric prefix reasserts a rigid linearity against the re-entrant, depth-relative pipeline). SAP
introduced only the prefix-less `draft-design.md` and renamed nothing existing, so the surface now sits in a mixed
interim state — `draft-design.md` is prefix-less while `1_create-spec.md` / `2_generate-tasks.md` /
`3_process-task-loop.md` still carry prefixes. Half-renaming breaks references, so reconciling the interim state is
this terminal sweep's job (per DEV-RULES.ARC § Discovered Work Routing the cascade lands on the consumer, not on
SAP, which renames nothing existing).

**Scope:** rename the three files (`1_create-spec.md` → `create-spec.md`, `2_generate-tasks.md` →
`generate-tasks.md`, `3_process-task-loop.md` → `process-task-loop.md`) and update every cross-reference across the
doc surface — workflows, strategies, methods, templates, skills, session-init, READMEs — plus the package-sync
dependency map. Mind the `generate-tasks` template/render pair (both `2_generate-tasks.template.md` and the
rendered `2_generate-tasks.md`, and their `strategy-package-project-sync` dependency-map entry) and **both
copies** — package source + `.arc/` — for each file. The reference surface is broad (~139 files touch the numbered
names); the work is mechanical but wants thorough grep coverage.

**Sequencing against `naming-conventions`:** this prefix-drop and `naming-conventions`'s eventual `TYPE.QUALIFIER`
rename cascade touch an overlapping file surface but **different tokens** — no semantic conflict. This WU is the
terminal cohort closure and is ready now (all deps shipped), so it lands **first**; `naming-conventions` (still
`backlog/planned/`, now unblocked) rebases its cascade onto the prefix-dropped tree. The convention's
decision-record stays SAP's spec R18 — no adopter-facing strategy edit or ADR for the convention itself; this is
the mechanical execution. Coordinated with `naming-conventions`. (The `TYPE.QUALIFIER` file/section renames
themselves — the `STATUS` / `MEMORY` / `NOTES` family — are **out of scope**, owned by `naming-conventions`.)

## Cohort-doc conformance

`decomposition-machinery` (shipped) defines the constitutive `cohort-{name}.md` record shape — a `Purpose` floor,
per-member-by-slug partition, membership derived (no roster) — and ships a backlog-scoped cohort-consistency
validator. Pre-existing cohort docs predate that shape and diverge: `cohort-agile-parallelism.md` uses a prose H1
(not the backticked slug) and a roster-style "Membership and ownership map" listing members by prose name +
shipped/departed status, against the membership-derived rule; `cohort-principle-anchored-core.md` and
`cohort-agile-wu-lifecycle.md` are closer but unaudited against the three conditions.

Audit every `backlog/planned/**` cohort doc against the three-condition invariant (field ↔ dir path-match;
constitutive-doc + `Purpose` floor; per-member slugs ⊆ derived members) and bring divergent docs into conformance
— retire roster / status surfaces in favour of the derived-membership partition. `decomposition-machinery`
conformed only its own authored / edited docs (incl. its member section in `cohort-agile-wu-lifecycle.md`); the
broad cross-surface sweep is this WU's, consistent with its § Task Lists and Branches retirement remit. The
validator is staged-scoped, so divergent docs flag only when next staged — no forced break in the interim.

## `arc-plan-conductor` write-back

`draft-arc-plan-conductor.md` is stale against the shipped model in two places: its § 4 still says a quick-tier
generates a `## Scope` task-list-header section, and it speaks of `atomic` / `quick` / `standard` tiers — both
wrong (the spec is always a separate doc; the `Class` set is `light` / `heavy` / `novel`). Write-back: rewrite to
"invoke the `brief`-form spec template", realign its tier-awareness to `Class`, and map the conductor's `depth`
modes (`minimum` / `standard` / `expanded`) onto the planning-stage instance of `planning depth`
(`low` / `medium` / `high`). (This was captured to `USER-INBOX` during the consolidated planning pass for routing
here.)

## Manual-graduation codification

This cohort was created by running `decomposition-machinery`'s graduation lifecycle **manually**, before that
workflow existed (the bootstrapping order: a cohort's graduation precedes all its members, including the one
that ships the workflow). This WU closes the loop: take the actual manual run as the **worked example** and
**reconcile `decomposition-machinery`'s graduation-workflow doc against what was actually done** — capturing any
step the manual run revealed as missing or mis-ordered (e.g. the field-inheritance step and the member-slug
naming heuristic both surfaced *during* this graduation and were folded back into `decomposition-machinery`'s
draft). The graduation *workflow* is `decomposition-machinery`'s deliverable; this WU's contribution is the
post-hoc reconciliation + the worked-example writeup, which is why it is terminal (it can only run once the
workflow doc exists and this cohort's run is complete).

## Commit / PR surface-language register

Surfaced while reviewing this cohort's own graduation PR (#55): commit messages and PR descriptions should
read as *the operation performed*, legible to a reader with no ARC-specific knowledge. Referencing concrete
artifacts (`meta-*`, `draft-*`, filenames, `ROADMAP`) is encouraged — they are real files — but insider
vocabulary as load-bearing terms is not: `Class` values (`heavy` / `light`), internal procedure names
("graduation", "conservation gate", "Purpose floor"), and the like. Where an ARC term is unavoidable (a file
literally named `cohort-*.md`), it should be inferable from context, not require the glossary.

This extends DEV-RULES § Documentation Boundaries ("write for the reader") from workflow-continuity leakage to
the *language register* of communication artifacts, and applies to **all** commits/PRs — the motivating
instance is the graduation-PR variant (`decomposition-machinery`), but the rule is general. Codify it as a
DEV-RULES § Documentation Boundaries refinement, explicitly framed as a **starting point ARC refines over
time**: the exact boundary between an acceptable artifact reference and insider jargon is a convention that
matures with use, not a settled line. PR #55 is the first worked example.

## Scope

**In scope:**

1. **Incidental / tier concept retirement** — the remaining conceptual references in workflows, strategy docs,
   and templates (the prefix is WOR-retired; the tier is `class-model-foundation`-retired). Mechanical sweep
   with grep + integration-test coverage.
2. **Vocabulary coherence pass** — align `Class` / planning-depth / Work Character across the always-loaded
   surfaces (`AGENT-BRIEF.ARC`, `DEV-RULES.ARC`, `session-init.md`); preserve `Atomic` as work character; cover
   the full `Errand`-floor → `novel`-ceiling spectrum; remove stale `minimum/standard/expanded` planning-depth
   language.
3. **Documentation cascade** — the in-place doc list above (DEV-RULES.ARC contextual sweep; task-list-formatting
   phase grammar; work-organization `Class` integration + Spec-Flow Invariants + Escape-hatch + sizing co-home +
   grouping-taxonomy convention + Task-Lists-and-Branches rewrite; template-meta / template-tasks updates;
   quality-gate-commands `Class` awareness).
4. **`active/` layout correction** — correct `strategy-work-organization.md` § ROADMAP render-walk and
   `strategy-file-classification.md` to flat; name one canonical layout statement (what + why) in
   work-organization, the others deferring.
5. **Workflow file rename cascade** — drop the `1_`/`2_`/`3_` prefixes from `create-spec` / `generate-tasks` /
   `process-task-loop`; update every cross-reference across the doc surface (both copies, the `generate-tasks`
   template/render pair, the package-sync dependency map). Sequenced ahead of `naming-conventions`'s
   `TYPE.QUALIFIER` cascade.
6. **Cohort-doc conformance audit** — audit every `backlog/planned/**` cohort doc against
   `decomposition-machinery`'s three-condition invariant and bring divergent docs into conformance.
7. **`arc-plan-conductor` write-back** — retire the `## Scope`-header + `minimum/standard/expanded` modes;
   realign to `Class` + planning-depth.
8. **Manual-graduation codification** — reconcile `decomposition-machinery`'s graduation workflow against this
   cohort's actual manual run; the worked-example writeup.
9. **Commit / PR surface-language register** — a DEV-RULES § Documentation Boundaries refinement: commit and PR
   text reads as the operation performed, legible without ARC-specific knowledge (artifact references fine;
   insider vocabulary not). General to all commits/PRs; framed as a starting point ARC refines over time.

**Out of scope:**

- The model, schema, pipeline, and machinery the siblings deliver (this WU only sweeps the *references* to
  them).
- The graduation *workflow* itself — `decomposition-machinery` (this WU only reconciles it post-hoc).
- The `active/`-layout drift-validation hook (documented-layout == reader / scaffold behavior) —
  `decomposition-machinery`'s layout-drift hook family.
- The `TYPE.QUALIFIER` file/section renames (the `STATUS` / `MEMORY` / `NOTES` family) — `naming-conventions`.
  This WU drops only the `1_`/`2_`/`3_` numeric prefixes (SAP R18).
- The relocatability link-def sweep + enforcement hook — `quality-gate-hooks`.

## Scope estimate

**Medium (broad but determinate).** No design to derive; the work is a thorough reference sweep, a doc cascade, a
mechanical file-rename cascade (~139-file reference surface), a cohort-doc conformance pass, and a post-hoc
workflow reconciliation. `light` by `Class` despite the file count — each edit is determinate and individually
trivial, needing thoroughness (grep coverage) rather than a deep grounding pass to plan correctly. Terminal.
*Depends on: `scalable-authoring-pipeline`, `decomposition-machinery` (both shipped, atop `class-model-foundation`);
consumes all three siblings' output. Sequencing: lands ahead of `naming-conventions`, which rebases its own rename
cascade onto the prefix-dropped tree.*

---
