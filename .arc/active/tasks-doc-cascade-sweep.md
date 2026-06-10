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

### `[x]` **1.1 Retire `incidental`-as-WU-shape concept prose**

- _Goal:_ No workflow, strategy, or template frames `incidental/` as a distinct work-unit shape; only
  ordinary-English uses of the word survive.

    - `[x]` **1.1.a Enumerate & vet the concept sites** — vetted the in-scope `incidental` footprint into the
      § Incidental concept-site map in `notes-doc-cascade-sweep.md`: 59 live-surface hits across 16 files (the
      ~500 frozen `completed/`/`backlog/`/ADR/analysis hits excluded per Success Criterion 1's workflows /
      strategies / templates scope), each classified KEEP (ordinary-English fix/commit sense) vs. RETIRE
      (`Incidental` task-list form, `Interrupts:`/pause residue) vs. PHASE 2 (`strategy-work-organization`
      heaviest residue, per 1.1.b). Surfaced new scope: `manage-incidental-work.md` is an entire live workflow on
      the retired model — flagged as a DECISION (retire-and-redirect vs. rewrite) needing sign-off before 1.1.b.

    - `[x]` **1.1.b Retire the concept sites against the vetted list** — applied the retirement across the vetted
      live surfaces (both copies): deleted `manage-incidental-work.md` and slimmed `process-task-loop` § Incidental
      Work Management to a pointer to DEV-RULES § Discovered Work Routing; retired the `Incidental` task-list form
      (`strategy-task-list-formatting`, `2_generate-tasks`); stripped the interrupt/pause-parent callout
      (`deactivate-work-unit`) and `Interrupts:`/`Paused At:` residue (`template-meta`); neutralized the dangling
      work-org link (the section's full retirement stays Phase 2); cleaned the install layer (`init-recipe.json`
      entry + the `manifest.json` entry) and the `strategy-package-project-sync` dependency-map row.

- _Outcome:_ The incidental-as-WU-shape surface is retired with no replacement — its function is fully subsumed by
  DEV-RULES § Discovered Work Routing (the routing decision) plus `arc-inbox` / Errands / backlog graduation
  (execution); full rationale in `notes-doc-cascade-sweep.md` § Incidental concept-site map. Deleting the installed
  `manage-incidental-work.md` was newly-discovered scope and surfaced a `manifest.json` ↔ `framework-sync.test.ts`
  drift-test coupling now flagged into Phase 4 (4.3). `strategy-work-organization` § Incidental Work Model is
  deferred to Phase 2.

### `[x]` **1.2 Retire the `atomic` tier concept prose**

- _Goal:_ No residual `atomic tier` / `atomic-tier` framing remains; `Atomic` reads strictly as work character.

    - Swept the retired atomic/quick/standard tier taxonomy from the live surfaces (both copies): `branch-format`
      (hotfix `atomic-tier` → "atomic in character"); `arc-inbox` SKILL + `drain-inbox` (the infra smell-flag /
      at-drain re-triage — `atomic-tier`/`quick-tier` → the `Atomic` smell-flag / "larger than atomic");
      `completed/README` (companion-presence reframed from the tier taxonomy to `Class` / planning depth). The four
      ADRs are frozen records that document the retirement in historical context — left as-is.

- _Outcome:_ `Atomic` now reads strictly as work character across live surfaces; the atomic/quick/standard
  planning-tier taxonomy survives only in frozen ADR history. Footprint was wider than the ~9 estimate's live
  slice: the smell-flag concept spans `arc-inbox` (capture) + `drain-inbox` (drain), and `completed/README` carried
  the full tier taxonomy (included per scope decision, reframed to the `Class` model).

### `[x]` **1.3 Align the always-loaded agent surfaces**

- _Goal:_ `AGENT-BRIEF.ARC`, `DEV-RULES.ARC`, and `session-init.md` read coherently against the
  `Class` / planning-depth / Work Character model an agent loads every session.

    - `[x]` **1.3.a `AGENT-BRIEF.ARC`** — verified coherent; the Vocabulary `Class` entry already carries the
      worklist-balancing / parallelism purpose and is distinct from quality-gate `Tier 1/2/3`, and `Atomic` is
      already defined as work character. No edit needed.

    - `[x]` **1.3.b `DEV-RULES.ARC`** — added a Work-Character-vs-`Class` distinction to § Scaled Process,
      Invariant Discipline (both copies): `Class` is work-unit-scoped weight (`Light`/`Heavy`/`Novel`); Work
      Character is the below-wrapper atomic / Errand-shaped property; `Atomic` is a character, never a fourth
      `Class` value.

    - `[x]` **1.3.c `session-init.md`** — reworked the item-10 `planning` lifecycle branch (both copies): dropped
      the `refine-plan-loop.md` "Expanded Planning Path" forward-pointer and, instead of leaving it `none`, made it
      defer to the meta **Next Action** for the active planning-stage workflow (`draft-design` / `1_create-spec` /
      `2_generate-tasks`). Planning is a multi-session design → spec → tasks progression, not one workflow; the
      Next Action (probe gives `sessionType`, judgment picks the stage) names it — no new `sessionType` values.

    - _Note:_ copy mechanics differ — `AGENT-BRIEF.ARC` / `DEV-RULES.ARC` are plain both-copies; `session-init`
      is a `.template.md` → rendered pair. See `notes-doc-cascade-sweep.md` § Copy mechanics.

- _Outcome:_ The always-loaded surfaces read coherently against the `Class` / planning-depth / Work Character
  model: `DEV-RULES.ARC` now names the Character-vs-`Class` distinction, `session-init`'s `planning` branch defers
  to the meta Next Action for the stage workflow (dropping the unlanded-WU forward-pointer), and `AGENT-BRIEF.ARC`
  was confirmed coherent without edit. Completes Phase 1.

## **Phase 2:** Strategy & template cascade

_Purpose:_ Cascade the `Class` model and the corrected `active/`-layout statement through the strategy and
template surface — the heaviest single surface, anchored on `strategy-work-organization.md`. Satisfies Decisions
3 and 4.

_Design decisions:_ The canonical `active/`-is-flat statement (what + why) lives in `strategy-work-organization.md`
because the "why" (one WU per worktree) is a work-organization truth; `file-classification` and `QUICK-REFERENCE`
state the _what_ and defer. Full per-file edit map in `notes-doc-cascade-sweep.md` § Documentation cascade.

### `[x]` **2.1 Reconcile `strategy-work-organization.md` against the shipped model and the flat `active/` layout**

- _Goal:_ work-organization's `Class` / cohort / sizing / branches sections read coherently against the shipped
  model, residual tier-era phrasing is swept, and the single canonical `active/`-is-flat statement is present.

    - `[x]` **2.1.a Verify § Class Model / § Spec-Flow Invariants / § Escape-hatch read coherently** — already
      coherent against the `light`/`heavy`/`novel` model; no tier-era residue (`tier` hits are ROADMAP tiers,
      `standard` hits are "render/sizing standard"). No edits.

    - `[x]` **2.1.b Verify § WU sizing standard + § Cohorts grouping convention** — sizing co-home and the
      derived-membership cohort-doc convention read coherently; nothing to sweep.

    - `[x]` **2.1.c § Task Lists and Branches — already Model-B-only** — the stacked-PR (262) and team-sub-branch
      (410/421) mentions are correct current-model framing, not pre-ADR-019 leftovers; removed only the retired
      "Incidental task lists may live alongside…" branch-scope clause.

    - `[x]` **2.1.d Canonical `active/`-is-flat statement + nested-`active/` path corrections** — the canonical
      statement already lived in § Directory Structure; strengthened it with the "concurrency = more worktrees, not
      more metas" _why_. Corrected the 5 nested-`active/` sites (§ Source of truth line 764 + the 4 regeneration
      fire-points); left `backlog/`/`completed/` nesting and the recursive render-walk intact.

- _Outcome:_ The Class / cohort / sizing / spec-flow / branches sections were already coherent against the shipped
  model — zero tier-era residue — so the substantive edits were narrower than "reconcile" implies: the 5
  nested-`active/` path corrections, a strengthened single canonical flat-`active/` statement (§ Directory
  Structure), and the incidental-concept retirement. Per spec Decision 1, § Incidental Work Model was reframed to a
  short pointer **§ Discovered Work During a WU** (redirect to DEV-RULES § Discovered Work Routing), with the TOC
  entry, the line-413 incidental-task-list clause, and the docs-site topic reference (line 4) swept. Both copies
  synced.

### `[x]` **2.2 Correct `strategy-file-classification.md` to flat `active/`**

- _Goal:_ file-classification states `active/` is flat (the `active/api-modernization/` per-WU-subdir example
  corrected) and defers to work-organization for the why.

- _Outcome:_ § Directory naming corrected — the `active/api-modernization/` example now states `active/` is flat
  (artifacts sit directly in `active/`), keeps the slug-named-subdir convention for `backlog/`/`completed/`, and
  defers the _why_ to work-organization § Directory Structure.

### `[x]` **2.3 Update `strategy-task-list-formatting.md` phase grammar**

- _Goal:_ task-list-formatting states the phase-count one-grammar (1..N substantive phases + an always-present
  verification phase) with no tier-era qualifiers.

- _Outcome:_ No tier-era qualifiers existed to sweep; added the uniform phase-count grammar to § Phase Headers
  (one-or-more substantive phases + the always-present verification phase, uniform across `Class`). The
  verification-phase-always-present rule was already stated in § Verification Phase.

### `[x]` **2.4 Sweep the templates**

- _Goal:_ `template-meta`, `template-tasks`, and `template-cohort` read cleanly against the shipped model.

    - `[x]` **2.4.a `template-meta.md`** — `Class` / `Design` / path-valued `Cohort` fields read cleanly; the
      reserved-`Tier:` comment is absent. No edit.

    - `[~]` **2.4.b `template-tasks.md`** — depth-scaling note dropped: a template is self-evidently a skeleton,
      and depth scaling now lives in `strategy-task-list-formatting.md` § Phase Headers, so a note here was
      documenting-for-completeness. No edit.

    - `[x]` **2.4.c `template-cohort.md`** — reads cleanly against the derived-membership cohort model; no edit
      (sweep-only; `decomposition-machinery` owns the template).

- _Outcome:_ All three templates already read cleanly against the shipped model — no edit needed. The planned
  `template-tasks` depth note was dropped as redundant with the strategy (relevance trim).

### `[x]` **2.5 `Class`-awareness in quality-gate-commands + `QUICK-REFERENCE` pointer**

- _Goal:_ the quality-gate-commands surface carries `Class` awareness where relevant, and `QUICK-REFERENCE`
  carries a one-line pointer to the canonical `active/`-layout statement.

- _Outcome:_ quality-gate-commands gained a `Class`-invariant note (the same gates run from `light` to `novel`;
  `Class` scales design ceremony, not the engineering bar). The `QUICK-REFERENCE` pointer was dropped: it is not a
  misstating surface and its reader needs the path (already in the Critical Path table), not the layout rationale —
  the binding success criterion (one canonical statement + the two misstating strategies corrected) is met by
  Tasks 2.1 and 2.2 without it.

## **Phase 3:** Targeted doc reconciliations

_Purpose:_ Reconcile the remaining point surfaces — the stale conductor draft, the pre-shape cohort docs, the
manual graduation, and the commit/PR language register. Satisfies Decisions 5, 6, 7, and 8.

### `[x]` **3.1 Realign `draft-arc-plan-conductor.md` to the shipped `Class` / `planning depth` model**

- _Goal:_ the conductor draft carries no references that contradict the shipped model — the retired `atomic` /
  `quick` / `standard` tier vocabulary and the quick-tier `## Scope` task-list-header claim are gone.

    - _Outcome:_ scope broadened from stale-vocab-only to full body realignment on the maintainer's call (the
      `Class` ↔ spec-form relationship and the `brief` template are settled / shipped by `class-model-foundation`
      / `scalable-authoring-pipeline`, so leaving the depth-mode vocab half-aligned would have left settled things
      contradicted). Realigned the body throughout (Design Goal, Working Thesis, Design Lean §§ 1–20, Proposed
      Changes, Dependencies, Alternatives, Open Questions): tiers → `Class` (`atomic` survives only as Work
      Character / Errand); depth modes → `planning depth` (`low` / `medium` / `high`); `## Scope` claim dropped
      (lightest spec is the separate `brief` form, `template-spec-brief.md`); spec form anchored to "derivation
      selects form, `Class` constrains". Inbound-buffer item #5 trimmed to its residual conductor-design idea
      (depth-aware navigation as a `Class`-lane-miscall correction). The WOR alignment note's two tier→spec-form
      items were retired as well (settled by the shipped model). **Left to the conductor WU** (out of scope per
      Decision 6): the WOR file-class rename (`plan-*` / `PRD` / `status-*` / `**Spec:**`) the note's remaining
      items (template-family scaling, `refine-plan-loop` rename, `create-spec` body reframe) still defer to
      activation. Spec Decision 6 + the matching Success Criterion were reconciled to the broadened scope. Single
      file, one copy.

### `[x]` **3.2 Bring cohort docs into conformance with the `cohort-{name}.md` record shape**

- _Goal:_ all three `backlog/planned/**` cohort docs satisfy `decomposition-machinery`'s three-condition invariant
  (field ↔ dir path-match; constitutive-doc + `Purpose` floor; per-member slugs ⊆ derived members).

    - `[x]` **3.2.a `cohort-agile-parallelism.md`** — backticked the H1, added the `**Purpose:**` floor, and retired
      the roster-style "Membership and ownership map"; membership now rests on the derived `Cohort` field (per-member
      ownership already lives in the cross-cutting design-spine §, so nothing of record was lost). Validator-clean
      standalone. No `## Members` slug sections added — they would trip condition (c) at commit unless the member
      metas are co-staged, and the template makes per-member sections optional.

    - `[x]` **3.2.b Audit `cohort-principle-anchored-core.md` + `cohort-agile-wu-lifecycle.md`** —
      `cohort-principle-anchored-core.md` is validator-clean as-is (no change). `cohort-agile-wu-lifecycle.md` left
      unchanged: conceptually conformant (canonical H1, `Purpose` floor, `## Members` partition), but all four of its
      members have graduated out of `backlog/planned/`, so the backlog-scoped validator mis-flags them as orphans —
      unfixable in this WU's scope (the validator is `decomposition-machinery`'s, a No-go to re-open here).

- _Outcome:_ The audit surfaced a designed-but-unreconciled lifecycle gap in dm's cohort validator: it derives
  membership from co-located `backlog/planned/` metas, but members relocate out as they activate/ship, so it
  conflates a _graduated_ member with a _removed_ WU. Captured to `operational-state-docs` (lifecycle-complete
  membership resolver → validator fix + cohort-doc archival-trigger) rather than worked around. Net: only the
  prose-era diverger needed conforming; the other two were resolved by audit.

### `[x]` **3.3 Codify the manual graduation as a worked example**

- _Goal:_ `decomposition-machinery`'s graduation-workflow doc reflects the steps the manual run surfaced, and the
  worked-example writeup exists.

- _Outcome:_ Verify-and-confirm — `decomposition-machinery` already codified against this cohort's own manual run
  at ship (its spec D9 hands the post-hoc reconciliation here and names PR #55 as the worked example).
  Reconciliation confirms both surfaced steps are present and correctly placed by ownership: field-inheritance in
  `decompose-work-unit.md` Step 4, member-slug naming in `assess-cohort-fit.md` § Member-slug naming — nothing
  missing or mis-ordered. The worked example exists as PR #55; no in-repo narrative authored (would be redundant,
  and any actual-run writeup naming internal WUs is barred from the adopter-facing workflow by audience boundary).

### `[x]` **3.4 Record the commit / PR surface-language register**

- _Goal:_ `DEV-RULES.ARC` § Documentation Boundaries carries the surface-language-register refinement.

- _Outcome:_ Added a `### Commit and PR surface language` subsection to § Documentation Boundaries (both copies),
  grouped with `Write for the reader`: prose reads as the operation performed, legible without ARC-specific
  knowledge (backticked artifact refs fine; insider vocabulary as a load-bearing term not), with traceability
  routed to the `Context:` footer. Held to ~5 lines — DEV-RULES.ARC loads every session. Two spec literals were
  reframed for the adopter-facing audience boundary: PR #55 (internal-dev) is not cited, and "starting point ARC
  refines over time" became "illustrative, not exhaustive" — same intent without the ARC-self-evolution voice.

## **Phase 4:** Workflow-file rename cascade

_Purpose:_ Execute the mechanical `1_`/`2_`/`3_` prefix-drop **last**, so it sweeps every numbered-name reference
any prior phase wrote, and fix the `draft-design` commit-template drift alongside. Satisfies Decisions 3 and 9.

_Design decisions:_ Runs last for coverage robustness. Three grounding findings: (1) the rename touches **two**
template/render pairs — `generate-tasks` _and_ `process-task-loop` are `.template.md` → rendered pairs in package
source, while `create-spec` is plain `.md` in both (the spec named only `generate-tasks`); (2) the numbered names
appear in **config + tests** (`init-recipe.json` + 4 test files), so this is not doc-only and the WU's gates run
the full suite (test + typecheck + build), not just markdown lint — and `manifest.json` needs a **file-scoped
path-key update** for the renamed files (its broader regeneration stays `self-hosting-manifest-freshness`'s, but
`framework-sync.test.ts` — the self-hosting drift check — iterates every `Framework` manifest entry against its
package source and fails on a stale path; confirmed live in 1.1.b's file deletion); (3) the commit-template
sweep narrows to `draft-design` only — `graduate-work-unit.md`'s non-accepted `(graduation)` is routed to
`rules-restructure` (it owns the `commit-msg` allowed-contexts list). Sequenced ahead of `naming-conventions`,
which rebases its `TYPE.QUALIFIER` cascade onto the prefix-dropped tree.

### `[x]` **4.1 Rename the three workflow files (both copies, template/render pairs)**

- _Goal:_ `create-spec` / `generate-tasks` / `process-task-loop` carry prefix-less names in both copies, with the
  `.template.md` → rendered pairs renamed for `generate-tasks` and `process-task-loop`.

- **Strategies:** strategy-package-project-sync.md

    - `git mv` `1_create-spec.md` → `create-spec.md` (both copies, plain `.md`).

    - `git mv` `2_generate-tasks.template.md` → `generate-tasks.template.md` (package) and `2_generate-tasks.md`
      → `generate-tasks.md` (`.arc/` rendered).

    - `git mv` `3_process-task-loop.template.md` → `process-task-loop.template.md` (package) and
      `3_process-task-loop.md` → `process-task-loop.md` (`.arc/` rendered).

### `[x]` **4.2 Update all doc references + the package-sync dependency map**

- _Goal:_ zero references to the numbered names (`1_create-spec`, `2_generate-tasks`, `3_process-task-loop`)
  remain in any markdown across either copy; the dependency-map entries are updated.

- **Strategies:** strategy-package-project-sync.md

    - Token-swept the references across the 72 live-surface framework files in both copies (workflows,
      strategies, methods, templates, skills, session-init, extensions, rules, STRATEGY-INDEX).

    - Updated `strategy-package-project-sync.md`'s dependency map: render-pair conditionals table and the
      Framework / template-counterpart listings (`create-spec.md` stands alone as plain both-copy; the
      `generate-tasks` / `process-task-loop` pairs render from `.template.md`).

- _Outcome:_ Scope held to the two-copy live framework surface (72 files), not the full ~140 token-bearing
  set — historical records (`completed/`, analysis, ADR), this WU's own artifacts, and single-copy `backlog/`
  drafts were excluded per the notes edit map (they reconcile via `naming-conventions` / on activation). The
  shortened names misaligned three Markdown tables (MD060); realigned in both copies, copies verified identical.

### `[x]` **4.3 Update the config + test references**

- _Goal:_ `init-recipe.json` and the test fixtures carry the renamed workflow filenames; the full quality-gate
  suite passes against the rename.

    - Updated `init-recipe.json`'s `include_files` (`create-spec.md` plain; `generate-tasks` /
      `process-task-loop` as `.template.md`).

    - Updated the 4 test files referencing the numbered names (`init.test.ts`, `active/meta-reader.test.ts`,
      `scripts/validate-extension-points.test.ts`, `integration/active.test.ts`) — fixtures and their paired
      assertions move together, so verbatim round-trips stay green.

    - Renamed the three `manifest.json` path keys **in place** — a file-scoped rename, not a regeneration; the
      `pristine_hash` values are untouched since the files only moved. Broader regeneration / freshness stays
      `self-hosting-manifest-freshness`'s concern.

- _Outcome:_ Full quality-gate suite passes against the rename — 2405 unit/integration + 61 e2e, typecheck,
  build, markdown/TS/shell lint all clean. `framework-sync.test.ts` (the self-hosting drift check) confirms no
  stale manifest path, the forced-consequence pattern proven in 1.1.b.

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
