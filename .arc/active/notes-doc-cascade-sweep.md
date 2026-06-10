# Notes: Doc Cascade Sweep

## Contents

- Documentation cascade — granular per-file / per-section edit map
- `arc-plan-conductor` write-back — specifics
- Manual-graduation codification — what the run surfaced

---

## Documentation cascade — granular per-file / per-section edit map

The spec records the cascade as a decision; this is the file-by-file surface to enumerate tasks against. Each
edit lands in **both copies** (package source + `.arc/`) unless noted.

- **`DEV-RULES.ARC`** — confirm the `Class` definitions / boundary tests landed by `class-model-foundation` read
  coherently in context; sweep residual tier-era phrasing around them. Also the home for the commit / PR
  surface-language register refinement (§ Documentation Boundaries) and the corrected understanding that
  `Atomic` is work character, not a `Class` value.
- **`AGENT-BRIEF.ARC`** — add the worklist-balancing / parallelism purpose of `Class` to the ceremony-scaling
  explanation (the signal roadmap + parallelism planning read).
- **`session-init.md`** — drop the stale "Expanded Planning Path" forward-pointer.
- **`strategy-task-list-formatting.md`** — the phase-count one-grammar (1..N phases + always-present
  verification).
- **`strategy-work-organization.md`** — the heaviest single surface:
    - `Class` integration;
    - § Spec-Flow Invariants and § Escape-hatch updates (replace intent-level / tier phrasing; name the cohort's
      model as the `Class`-classification home);
    - the sizing-norm co-home;
    - the grouping-taxonomy / cohort-doc convention (shared with Concurrent Work Conventions + file-classification);
    - the § Task Lists and Branches rewrite to the Model-B-only world (clear stacked-PRs / phased /
      team-sub-branch pre-ADR-019 leftovers — coordinate with `decomposition-machinery`'s flagged reconciliation
      debt);
    - the canonical `active/`-is-flat statement (what + why: one WU per worktree; concurrency = more worktrees,
      not more metas), anchored to `class-model-foundation`'s layout model.
- **`strategy-file-classification.md`** — correct the `active/api-modernization/` per-WU-subdir example to flat;
  state the *what* and defer to work-organization for the *why*.
- **`QUICK-REFERENCE.md`** — at most a one-line pointer to the canonical `active/`-layout statement.
- **`template-meta.md`** — confirm the new fields (`Class`, `Design` semantics, path-valued `Cohort`) read
  cleanly; retire the reserved-`Tier:` comment now that `Class` exists.
- **`template-tasks.md`** — depth variants.
- **`template-cohort.md`** — confirm it generalizes cleanly from the prototype cohort docs minted at this
  cohort's graduation (owned by `decomposition-machinery`; sweep references to it only).
- **quality-gate-commands** — `Class` awareness where relevant.
- **Workflow-file rename** — `1_create-spec.md` → `create-spec.md`, `2_generate-tasks.md` → `generate-tasks.md`,
  `3_process-task-loop.md` → `process-task-loop.md`; update every cross-reference (workflows, strategies, methods,
  templates, skills, session-init, READMEs) + the `generate-tasks` template/render pair
  (`2_generate-tasks.template.md` + rendered) + the `strategy-package-project-sync` dependency-map entry. ~139
  files touch the numbered names — grep both copies.
- **Workflow commit-template fix** — `draft-design.md` "Capture the draft" codeblock: `Context:
  meta-{name}.md (draft-design)` → `Context: draft-{name}.md (planning)`; grep other authoring / lifecycle
  workflow docs for commit-template `Context:` lines that fail the `commit-msg` hook's accepted-format set.

## `arc-plan-conductor` write-back — specifics

`draft-arc-plan-conductor.md` is stale in two places:

- its § 4 still says a quick-tier generates a `## Scope` task-list-header section — wrong (the spec is always a
  separate doc);
- it speaks of `atomic` / `quick` / `standard` tiers — wrong (the `Class` set is `light` / `heavy` / `novel`).

Write-back: rewrite to "invoke the `brief`-form spec template"; realign tier-awareness to `Class`; map the
conductor's `depth` modes (`minimum` / `standard` / `expanded`) onto the planning-stage instance of
`planning depth` (`low` / `medium` / `high`).

## Manual-graduation codification — what the run surfaced

This cohort's graduation was run manually, before `decomposition-machinery`'s graduation workflow existed (the
bootstrapping order: a cohort's graduation precedes all its members, including the one shipping the workflow).
Two steps surfaced *during* the run and were folded back into `decomposition-machinery`'s draft — use them as the
worked example when reconciling the workflow doc against what was actually done:

- the **field-inheritance step** (members inherit cohort-level fields);
- the **member-slug naming heuristic** (slugs must read legibly out of context — `class-model-foundation`, not
  `model-foundation`).

Reconcile the graduation-workflow doc against any step the manual run revealed as missing or mis-ordered; the
workflow itself is `decomposition-machinery`'s deliverable, this WU contributes the post-hoc reconciliation +
writeup only.
