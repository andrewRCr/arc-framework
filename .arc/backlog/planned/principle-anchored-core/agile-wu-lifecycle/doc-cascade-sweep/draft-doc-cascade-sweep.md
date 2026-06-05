# Draft: Doc Cascade Sweep

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** The terminal cleanup member — retire the superseded tier / incidental conceptual vocabulary that
  the model's siblings render obsolete, cascade the documentation updates across workflows / strategies /
  templates, write back the stale `arc-plan-conductor` draft, and codify this cohort's own (manually-run)
  graduation against `decomposition-machinery`'s workflow. `light` by `Class`: broad but determinate — every
  edit is a known find-and-replace-with-judgment, no design to derive and no deep grounding pass needed to plan
  it correctly (the scale axis stays low even though the file count is high). Terminal because it consumes the
  vocabulary the three heavy siblings establish; nothing depends on it, so Concurrent Work Conventions unblocks
  ahead of it.

---

## Problem / Motivation

The `Class` model, the scalable pipeline, and the decomposition machinery introduce new vocabulary
(`Class` / `light` / `heavy` / `planning depth` / `brief` / `outline` / `detailed`) and retire old framing (the
`incidental/` shape, the `atomic` *tier*, "PRD = any spec," the conductor's `minimum/standard/expanded` modes
and `## Scope` task-list-header). Once the siblings ship, conceptual references to the retired framing linger
across the doc surface — orphaned, lint-invisible, quietly contradicting the shipped model. This WU is the
mechanical sweep that closes that gap, plus the codification of the graduation workflow against the real
manual run that created this very cohort.

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

## `arc-plan-conductor` write-back

`draft-arc-plan-conductor.md` is stale against the shipped model in two places: its § 4 still says a quick-tier
generates a `## Scope` task-list-header section, and it speaks of `atomic` / `quick` / `standard` tiers — both
wrong (the spec is always a separate doc; the `Class` set is `light` / `heavy`). Write-back: rewrite to "invoke
the `brief`-form spec template", realign its tier-awareness to `Class`, and map the conductor's `depth` modes
(`minimum` / `standard` / `expanded`) onto the planning-stage instance of `planning depth`
(`low` / `medium` / `high`). (This was captured to `USER-INBOX` during the consolidated planning pass for
routing here.)

## Documentation cascade

The full set of documentation updates the model triggers, swept here as one coherent pass:

- **DEV-RULES.ARC** — confirm the `Class` definitions / boundary tests landed by `class-model-foundation` read
  coherently in context; sweep any residual tier-era phrasing around them.
- **`strategy-task-list-formatting.md`** — the phase-count one-grammar (1..N phases + always-present
  verification).
- **`strategy-work-organization.md`** — `Class` integration; the § Spec-Flow Invariants and § Escape-hatch
  updates (replace intent-level / tier phrasing, name the cohort's model as the `Class`-classification home);
  the sizing-norm co-home; the grouping-taxonomy / cohort-doc convention (shared with Concurrent Work
  Conventions + file-classification); the § Task Lists and Branches rewrite to the Model-B-only world
  (stacked-PRs / phased / team-sub-branch pre-ADR-019 leftovers — coordinate with `decomposition-machinery`'s
  flagged reconciliation debt).
- **`template-meta.md`** — confirm the new fields (`Class`, `Design` semantics, path-valued `Cohort`) read
  cleanly; retire the reserved-`Tier:` comment now that `Class` exists.
- **`template-tasks.md`** — depth variants.
- **`template-cohort.md`** — confirm it generalizes cleanly from the prototype cohort docs minted at this
  cohort's graduation (owned by `decomposition-machinery`; this WU only sweeps references to it).
- **quality-gate-commands** — `Class` awareness where relevant.
- **`draft-arc-plan-conductor.md`** — the write-back above (retire the `## Scope`-header + the
  `minimum/standard/expanded` modes).

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
2. **Documentation cascade** — the full list above (DEV-RULES.ARC contextual sweep; task-list-formatting phase
   grammar; work-organization `Class` integration + Spec-Flow Invariants + Escape-hatch + sizing co-home +
   grouping-taxonomy convention + Task-Lists-and-Branches rewrite; template-meta / template-tasks updates;
   quality-gate-commands `Class` awareness).
3. **`arc-plan-conductor` write-back** — retire the `## Scope`-header + `minimum/standard/expanded` modes;
   realign to `Class` + planning-depth.
4. **Manual-graduation codification** — reconcile `decomposition-machinery`'s graduation workflow against this
   cohort's actual manual run; the worked-example writeup.
5. **Commit / PR surface-language register** — a DEV-RULES § Documentation Boundaries refinement: commit and PR
   text reads as the operation performed, legible without ARC-specific knowledge (artifact references fine;
   insider vocabulary not). General to all commits/PRs; framed as a starting point ARC refines over time.

**Out of scope:**

- The model, schema, pipeline, and machinery the siblings deliver (this WU only sweeps the *references* to
  them).
- The graduation *workflow* itself — `decomposition-machinery` (this WU only reconciles it post-hoc).
- The relocatability link-def sweep + enforcement hook — `quality-gate-hooks`.

## Scope estimate

**Medium (broad but determinate).** No design to derive; the work is a thorough reference sweep, a doc cascade,
and a post-hoc workflow reconciliation. `light` by `Class` despite the file count — each edit is determinate and
individually trivial, needing thoroughness (grep coverage) rather than a deep grounding pass to plan correctly.
Terminal. *Depends on: `scalable-authoring-pipeline`, `decomposition-machinery` (both atop
`class-model-foundation`); consumes all three siblings' output.*

---
