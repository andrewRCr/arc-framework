# Task List: Doc Cascade Sweep

- **Design:** `spec-doc-cascade-sweep.md`

---

## **Phase 1:** Concept retirement & vocabulary coherence

_Purpose:_ Retire the conceptual residue of the superseded `incidental/` shape and `atomic` tier, and bring the
always-loaded agent surfaces into coherence with the settled `Class` / planning-depth / Work Character model.
Satisfies Decisions 1 and 2.

_Design decisions:_ The category _prefix_ is already WOR-retired and the _tier_ is `class-model-foundation`-retired;
these tasks sweep the lingering _prose_ only, using grep coverage plus per-hit judgment (ordinary-English
"incidental" survives; "incidental as a distinct WU shape" does not).

### `[ ]` **1.1 Retire `incidental`-as-WU-shape concept prose**

- _Goal:_ No workflow, strategy, or template frames `incidental/` as a distinct work-unit shape; only
  ordinary-English uses of the word survive.

    - `[ ]` **1.1.a Enumerate & vet the concept sites** — grep the ~46-file `incidental` footprint (both copies)
      and classify each hit concept-ref (retire) vs. ordinary-English word (keep); record the result as a mapping
      table in `notes-doc-cascade-sweep.md` § Incidental concept-site map, reviewed before any edit.

    - `[ ]` **1.1.b Retire the concept sites against the vetted list** — mechanically apply the retirement across
      the vetted sites (workflows, methods, strategies, briefs, `QUICK-REFERENCE`, templates, the status template,
      examples), removing WU-shape framing and pause-pointer residue; both copies. `strategy-work-organization.md`'s
      heaviest residue is flagged on the map but edited in Phase 2.

### `[ ]` **1.2 Retire the `atomic` tier concept prose**

- _Goal:_ No residual `atomic tier` / `atomic-tier` framing remains; `Atomic` reads strictly as work character.

    - Grep the ~9-file footprint across `system/` + `reference/` (both copies); retire the tier framing and
      preserve `Atomic` as below-the-wrapper work character.

### `[ ]` **1.3 Align the always-loaded agent surfaces**

- _Goal:_ `AGENT-BRIEF.ARC`, `DEV-RULES.ARC`, and `session-init.md` read coherently against the
  `Class` / planning-depth / Work Character model an agent loads every session.

    - `[ ]` **1.3.a `AGENT-BRIEF.ARC`** — verify the `Class` treatment reads coherently; the worklist-balancing /
      parallelism purpose is already present in the Vocabulary § `Class` entry, so this confirms coherence rather
      than adds it.

    - `[ ]` **1.3.b `DEV-RULES.ARC`** — confirm the landed `Class` boundary tests read coherently in context;
      state the Work-Character-below-wrapper vs. `Class`-WU-weight relationship across the full `Errand`-floor →
      `novel`-ceiling spectrum; preserve `Atomic` as character (never a fourth `Class` value).

    - `[ ]` **1.3.c `session-init.md`** — drop the `planning → refine-plan-loop.md` "Expanded Planning Path"
      forward-pointer (item 10 lifecycle branch): a live, adopter-facing workflow shouldn't name a
      may-or-may-not-land downstream WU.

    - _Note:_ copy mechanics differ — `AGENT-BRIEF.ARC` / `DEV-RULES.ARC` are plain both-copies; `session-init`
      is a `.template.md` → rendered pair. See `notes-doc-cascade-sweep.md` § Copy mechanics.

## **Phase 2:** Strategy & template cascade

_Purpose:_ Cascade the `Class` model and the corrected `active/`-layout statement through the strategy and
template surface — the heaviest single surface, anchored on `strategy-work-organization.md`. Satisfies Decisions
3 and 4.

_Design decisions:_ The canonical `active/`-is-flat statement (what + why) lives in `strategy-work-organization.md`
because the "why" (one WU per worktree) is a work-organization truth; `file-classification` and `QUICK-REFERENCE`
state the _what_ and defer. Full per-file edit map in `notes-doc-cascade-sweep.md` § Documentation cascade.

### `[ ]` **2.1 Reconcile `strategy-work-organization.md` against the shipped model and the flat `active/` layout**

- _Goal:_ work-organization's `Class` / cohort / sizing / branches sections read coherently against the shipped
  model, residual tier-era phrasing is swept, and the single canonical `active/`-is-flat statement is present.

- _Note:_ `## Class Model`, `## Cohorts` + the `cohort-{name}.md` record, `## WU sizing standard`,
  `## Task Lists and Branches`, `## Spec-Flow Invariants`, and `### Escape-hatch` already exist (landed by
  `class-model-foundation` + `decomposition-machinery`) — this is verify-coherence + sweep, not build-from-scratch.

- _Notes:_ See `notes-doc-cascade-sweep.md` § Documentation cascade for the section-by-section map.

    - `[ ]` **2.1.a Verify § Class Model / § Spec-Flow Invariants / § Escape-hatch read coherently** — sweep
      residual intent-level / tier phrasing; confirm the cohort's model is named as the `Class`-classification home.

    - `[ ]` **2.1.b Verify § WU sizing standard + § Cohorts grouping convention** — confirm the sizing co-home and
      the cohort-doc grouping convention (shared with Concurrent Work Conventions + file-classification) read
      coherently; sweep residual phrasing.

    - `[ ]` **2.1.c § Task Lists and Branches — sweep to Model-B-only** — clear any residual stacked-PRs / phased /
      team-sub-branch pre-ADR-019 leftovers; coordinate with `decomposition-machinery`'s flagged reconciliation
      debt.

    - `[ ]` **2.1.d Author the canonical `active/`-is-flat statement, and correct the nested-`active/` paths** —
      state _what_ (flat) and _why_ (one WU per worktree; concurrency = more worktrees, not more metas in one
      `active/`). Correct the `active/` path templates (`active/**/<wu-name>/meta-<name>.md` → `active/meta-<name>.md`,
      line ~764) and the lifecycle-transition paths (`active/<wu>/` → `active/`, lines ~867–876). **Leave
      `backlog/planned/**` nested** (cohort-wrapped) and **keep the recursive render-walk** — the nesting is real
      there; only `active/` is flat.

### `[ ]` **2.2 Correct `strategy-file-classification.md` to flat `active/`**

- _Goal:_ file-classification states `active/` is flat (the `active/api-modernization/` per-WU-subdir example
  corrected) and defers to work-organization for the why.

### `[ ]` **2.3 Update `strategy-task-list-formatting.md` phase grammar**

- _Goal:_ task-list-formatting states the phase-count one-grammar (1..N substantive phases + an always-present
  verification phase) with no tier-era qualifiers.

### `[ ]` **2.4 Sweep the templates**

- _Goal:_ `template-meta`, `template-tasks`, and `template-cohort` read cleanly against the shipped model.

    - `[ ]` **2.4.a `template-meta.md`** — confirm the `Class` / `Design` / path-valued `Cohort` fields read
      cleanly (the reserved-`Tier:` comment is already absent — verify, don't re-retire).

    - `[ ]` **2.4.b `template-tasks.md`** — reflect the depth variants.

    - `[ ]` **2.4.c `template-cohort.md`** — sweep references only (it generalizes from the prototype cohort docs;
      `decomposition-machinery` owns the template itself).

    - _Note:_ each template edits in both copies.

### `[ ]` **2.5 `Class`-awareness in quality-gate-commands + `QUICK-REFERENCE` pointer**

- _Goal:_ the quality-gate-commands surface carries `Class` awareness where relevant, and `QUICK-REFERENCE`
  carries a one-line pointer to the canonical `active/`-layout statement.

## **Phase 3:** Targeted doc reconciliations

_Purpose:_ Reconcile the remaining point surfaces — the stale conductor draft, the pre-shape cohort docs, the
manual graduation, and the commit/PR language register. Satisfies Decisions 5, 6, 7, and 8.

### `[ ]` **3.1 Retire stale vocabulary in `draft-arc-plan-conductor.md`**

- _Goal:_ the conductor draft carries no references that contradict the shipped model — the retired `atomic` /
  `quick` / `standard` tier vocabulary and the quick-tier `## Scope` task-list-header claim are gone.

    - Retire the `atomic` / `quick` / `standard` tier vocabulary and the quick-tier `## Scope`-header generation
      claim (the tier is retired; the spec is always a separate doc).

    - _Note:_ scope is stale-vocab retirement only. The deeper model realignment (mapping the depth modes onto
      `planning depth`, realigning tier-awareness to `Class`, dropping the tier → spec-form coupling, invoking the
      `brief`-form spec template) is the conductor WU's own — it already tracks it in the draft's inbound buffer,
      so leave that buffer item in place. Single file at `backlog/planned/arc-plan-conductor/` (one copy).

### `[ ]` **3.2 Bring cohort docs into conformance with the `cohort-{name}.md` record shape**

- _Goal:_ all three `backlog/planned/**` cohort docs satisfy `decomposition-machinery`'s three-condition invariant
  (field ↔ dir path-match; constitutive-doc + `Purpose` floor; per-member slugs ⊆ derived members).

    - `[ ]` **3.2.a `cohort-agile-parallelism.md`** — replace the prose H1 with the backticked slug; retire the
      roster-style "Membership and ownership map" in favour of the derived-membership partition.

    - `[ ]` **3.2.b Audit `cohort-principle-anchored-core.md` + `cohort-agile-wu-lifecycle.md`** — both already
      use backticked-slug H1s (likely conformant); verify the `Purpose`-floor and derived-membership conditions
      and conform any residual divergence.

    - _Note:_ `decomposition-machinery` already conformed its own member section; the validator is staged-scoped,
      so verify each by staging against it (no flag = conformant).

### `[ ]` **3.3 Codify the manual graduation as a worked example**

- _Goal:_ `decomposition-machinery`'s graduation-workflow doc reflects the steps the manual run surfaced, and the
  worked-example writeup exists.

- _Notes:_ See `notes-doc-cascade-sweep.md` § Manual-graduation codification (field-inheritance step,
  member-slug naming heuristic).

    - Reconcile the shipped graduation-workflow doc (`graduate-work-unit.md`; check `decompose-work-unit.md` too —
      both copies in `work-unit-lifecycle/`) against this cohort's actual manual run (capture any step revealed as
      missing or mis-ordered); add the worked-example writeup. The workflow itself is `decomposition-machinery`'s
      deliverable — this WU contributes the post-hoc reconciliation only.

### `[ ]` **3.4 Record the commit / PR surface-language register**

- _Goal:_ `DEV-RULES.ARC` § Documentation Boundaries carries the surface-language-register refinement.

    - Add the refinement: commit / PR text reads as the operation performed, legible without ARC-specific
      knowledge (concrete artifact references fine; insider vocabulary as load-bearing terms not); framed as a
      starting point ARC refines over time, with PR #55 as the first worked example. Both copies.

## **Phase 4:** Workflow-file rename cascade

_Purpose:_ Execute the mechanical `1_`/`2_`/`3_` prefix-drop **last**, so it sweeps every numbered-name reference
any prior phase wrote, and fix the `draft-design` commit-template drift alongside. Satisfies Decisions 3 and 9.

_Design decisions:_ Runs last for coverage robustness. Three grounding findings: (1) the rename touches **two**
template/render pairs — `generate-tasks` _and_ `process-task-loop` are `.template.md` → rendered pairs in package
source, while `create-spec` is plain `.md` in both (the spec named only `generate-tasks`); (2) the numbered names
appear in **config + tests** (`init-recipe.json` + 4 test files), so this is not doc-only and the WU's gates run
the full suite (test + typecheck + build), not just markdown lint — but `manifest.json` is **out** (generated by
`arc update`, which self-hosting doesn't run; owned by `self-hosting-manifest-freshness`); (3) the commit-template
sweep narrows to `draft-design` only — `graduate-work-unit.md`'s non-accepted `(graduation)` is routed to
`rules-restructure` (it owns the `commit-msg` allowed-contexts list). Sequenced ahead of `naming-conventions`,
which rebases its `TYPE.QUALIFIER` cascade onto the prefix-dropped tree.

### `[ ]` **4.1 Rename the three workflow files (both copies, template/render pairs)**

- _Goal:_ `create-spec` / `generate-tasks` / `process-task-loop` carry prefix-less names in both copies, with the
  `.template.md` → rendered pairs renamed for `generate-tasks` and `process-task-loop`.

- **Strategies:** strategy-package-project-sync.md

    - `git mv` `1_create-spec.md` → `create-spec.md` (both copies, plain `.md`).

    - `git mv` `2_generate-tasks.template.md` → `generate-tasks.template.md` (package) and `2_generate-tasks.md`
      → `generate-tasks.md` (`.arc/` rendered).

    - `git mv` `3_process-task-loop.template.md` → `process-task-loop.template.md` (package) and
      `3_process-task-loop.md` → `process-task-loop.md` (`.arc/` rendered).

### `[ ]` **4.2 Update all doc references + the package-sync dependency map**

- _Goal:_ zero references to the numbered names (`1_create-spec`, `2_generate-tasks`, `3_process-task-loop`)
  remain in any markdown across either copy; the dependency-map entries are updated.

- **Strategies:** strategy-package-project-sync.md

    - Grep-sweep the ~140 referencing markdown files (workflows, strategies, methods, templates, skills,
      session-init, READMEs) and update each reference.

    - Update `strategy-package-project-sync.md`'s dependency-map entries for the renamed template/render pairs
      (the render-pair table ~lines 70/73 and the dependency list ~lines 200/259/260).

### `[ ]` **4.3 Update the config + test references**

- _Goal:_ `init-recipe.json` and the test fixtures carry the renamed workflow filenames; the full quality-gate
  suite passes against the rename.

    - Update `init-recipe.json`'s `include_files` entries (`packages/arc-framework/` — hand-maintained source).

    - Update the 4 test files referencing the numbered names (`init.test.ts`, `active/meta-reader.test.ts`,
      `scripts/validate-extension-points.test.ts`, `integration/active.test.ts`).

    - _Note:_ `manifest.json` is **out of scope** — it is generated by `arc update` (not run self-hosting), so its
      staleness is `self-hosting-manifest-freshness`'s concern. Exclude the gitignored
      `user/{identity}/.internal/.pre-load-backup-*.json`.

### `[ ]` **4.4 Fix the `draft-design` commit-template `Context:` line**

- _Goal:_ `draft-design.md`'s commit template validates against the `commit-msg` hook.

    - `draft-design.md` "Capture the draft": `Context: meta-{name}.md (draft-design)` →
      `Context: draft-{name}.md (planning)`. Both copies.

    - _Note:_ `graduate-work-unit.md`'s non-accepted `(graduation)` parenthetical is **out of scope** — routed to
      `rules-restructure` (owns the `commit-msg` allowed-contexts list + `commit-footer.md`), with the
      recommendation to add `(graduation)` as a first-class category. See `USER-INBOX`.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` Grep finds zero conceptual references to the retired framing (`incidental` as a WU shape, the `atomic`
  tier, `minimum`/`standard`/`expanded` modes, the `## Scope` task-list header) across workflows, strategies, and
  templates.
- `[ ]` Grep finds zero references to the numbered workflow filenames in markdown, config, or tests across either
  copy; all three files renamed (including both template/render pairs); the package-sync dependency map and
  `init-recipe.json` updated.
- `[ ]` The full quality-gate suite (vitest, typecheck, build) passes against the rename — including the updated
  `init-recipe.json` / test fixtures and the activate / integrate / archive integration flows.
- `[ ]` Exactly one canonical `active/`-is-flat statement exists (in `strategy-work-organization.md`); the two
  previously-misstating strategies are corrected and defer to it.
- `[ ]` All three `backlog/planned/**` cohort docs satisfy the three-condition invariant (no validator flag when
  staged).
- `[ ]` `draft-arc-plan-conductor.md` carries no `## Scope`-header or `minimum`/`standard`/`expanded` references
  and speaks in `Class` + `planning depth`.
- `[ ]` `decomposition-machinery`'s graduation-workflow doc reflects the manual-run steps; the worked-example
  writeup exists.
- `[ ]` The commit / PR surface-language register is recorded in `DEV-RULES.ARC` § Documentation Boundaries.
- `[ ]` `draft-design.md`'s commit-template `Context:` line validates against the `commit-msg` hook
  (`graduate-work-unit.md`'s `(graduation)` is routed to `rules-restructure`).
- `[ ]` Markdown lint passes with zero violations across the changed surface; both copies (package source +
  `.arc/`) are consistent.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

---

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
