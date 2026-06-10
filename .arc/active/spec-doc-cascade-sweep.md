# Spec (`outline`): doc-cascade-sweep

- **Origin:** [internal]

- **Purpose:** The terminal member of the `principle-anchored-core/agile-wu-lifecycle` cohort — sweep the
  documentation surface into coherence with the shipped sibling models (`class-model-foundation`,
  `scalable-authoring-pipeline`, `decomposition-machinery`), reconcile the three concrete debts they left
  (workflow-file prefixes, cohort-doc shape, `active/`-layout docs), and codify this cohort's own manual
  graduation as a worked example.

---

## Problem / Context

The `Class` model, the scalable pipeline, and the decomposition machinery introduced new vocabulary
(`Class` / `light` / `heavy` / `novel` / `planning depth` / `brief` / `outline` / `detailed`) and retired old
framing (the `incidental/` shape, the `atomic` *tier*, "PRD = any spec," the conductor's
`minimum/standard/expanded` modes, the `## Scope` task-list header). Now that those siblings have shipped,
conceptual references to the retired framing linger across workflows, strategies, and templates — orphaned,
lint-invisible, and quietly contradicting the shipped model.

The same siblings left three concrete reconciliation debts on the doc surface: `scalable-authoring-pipeline`
dropped the `1_`/`2_`/`3_` workflow-file prefixes but renamed nothing existing (a mixed interim state);
`decomposition-machinery` defined a `cohort-{name}.md` record shape that pre-existing cohort docs predate; and
the `active/` layout is documented as per-WU subdirs when it is flat by design. This work is the mechanical
sweep that closes every gap, plus the post-hoc codification of the graduation workflow against the real manual
run that created this cohort. It is terminal: it consumes the vocabulary the three heavy siblings establish, and
nothing depends on it.

## Decision(s)

1. **Retire the incidental / tier *concepts*, do not repurpose them.** The `incidental/` category and the
   `atomic` tier have no remaining function under worktree isolation + the `Class` model. The WOR-retired
   *prefix* and `class-model-foundation`-retired *tier* leave lingering *conceptual* prose; we sweep that prose
   to clean retirement rather than rename or repurpose the categories.

2. **Frame the one-spectrum vocabulary explicitly and sweep the always-loaded surfaces.** We will state that
   **Work Character** decides whether a concern is atomic / Errand-shaped *below* the WU wrapper, while **`Class`**
   records WU-scoped weight across the full `light` → `heavy` → `novel` spectrum. `Atomic` is preserved as work
   character (never a fourth `Class` value). The coherence pass covers the surfaces an agent loads every session
   — `AGENT-BRIEF.ARC` (add the worklist-balancing / parallelism purpose of `Class`), `DEV-RULES.ARC` (confirm
   the landed boundary tests read coherently), and `session-init.md` (drop the stale "Expanded Planning Path"
   forward-pointer) — and removes residual `tier` / `atomic tier` / `quick` / `standard` /
   `minimum`/`standard`/`expanded` language.

3. **Drop the `1_`/`2_`/`3_` workflow-file prefixes in this work unit, sequenced ahead of `naming-conventions`.**
   Rename `1_create-spec.md` → `create-spec.md`, `2_generate-tasks.md` → `generate-tasks.md`,
   `3_process-task-loop.md` → `process-task-loop.md`, and update every cross-reference across both copies
   (package source + `.arc/`), including the `generate-tasks` template/render pair and the package-sync
   dependency map. This cohort owns the closure of SAP's R18 convention; routing it to `naming-conventions`
   (still `backlog/planned/`, now unblocked) would leave the half-renamed interim state lingering. The two rename
   cascades touch overlapping files but **different tokens** — no semantic conflict — so this WU lands first and
   `naming-conventions` rebases its `TYPE.QUALIFIER` cascade onto the prefix-dropped tree.

4. **Home the canonical `active/`-is-flat statement in `strategy-work-organization.md`.** Correct both
   misstating strategies (`strategy-work-organization.md` § ROADMAP render-walk and
   `strategy-file-classification.md`'s `active/api-modernization/` example) to flat, and name **one** canonical
   statement carrying both *what* (flat) and *why* (one WU per worktree; concurrency = more worktrees, not more
   metas in one `active/`). It lives in work-organization because the "why" is a work-organization truth (it
   already carries the worktree / lifecycle-state model that makes flatness a consequence);
   `strategy-file-classification.md` states the *what* and defers; `QUICK-REFERENCE` carries at most a one-line
   pointer.

5. **Bring pre-existing cohort docs into conformance with the shipped `cohort-{name}.md` record shape.** Audit
   every `backlog/planned/**` cohort doc against `decomposition-machinery`'s three-condition invariant
   (field ↔ dir path-match; constitutive-doc + `Purpose` floor; per-member slugs ⊆ derived members) and bring
   divergent docs into conformance — retiring roster / status surfaces in favour of the derived-membership
   partition (`cohort-agile-parallelism.md` is the known diverger; the other two are unaudited).

6. **Write back the stale `arc-plan-conductor` draft.** Retire the `## Scope` task-list-header and the
   `minimum`/`standard`/`expanded` modes; rewrite to invoke the `brief`-form spec template; realign tier-awareness
   to `Class` and map the conductor's `depth` modes onto the planning-stage instance of `planning depth`
   (`low` / `medium` / `high`).

7. **Codify the manual graduation as a worked example.** Reconcile `decomposition-machinery`'s graduation-workflow
   doc against this cohort's actual manual run, capturing any step the run revealed as missing or mis-ordered, and
   write the run up as the worked example. (The graduation *workflow* is `decomposition-machinery`'s deliverable;
   this WU contributes the post-hoc reconciliation only.)

8. **Codify a commit / PR surface-language register as a DEV-RULES § Documentation Boundaries refinement.** Commit
   messages and PR descriptions read as *the operation performed*, legible without ARC-specific knowledge:
   concrete artifact references (`meta-*`, `draft-*`, filenames, `ROADMAP`) are fine; insider vocabulary as
   load-bearing terms (`Class` values, internal procedure names) is not. Framed explicitly as a starting point ARC
   refines over time; PR #55 is the first worked example.

9. **Correct invalid commit-message `Context:` templates in the workflow docs.** `draft-design.md`'s "Capture the
   draft" codeblock prescribes `Context: meta-{name}.md (draft-design)`, which the `commit-msg` hook rejects —
   `(draft-design)` is not an accepted parenthetical, and a draft-capture commit's artifact-under-edit is the
   `draft-*`, not the meta. Correct it to `Context: draft-{name}.md (planning)`, and grep the other authoring /
   lifecycle workflow docs for commit-template codeblocks whose `Context:` line fails the hook's accepted-format
   set, fixing any found. Both copies.

## Scope boundary (No-gos)

- **The sibling deliverables themselves** — the model, schema, pipeline, and machinery the three heavy siblings
  ship. This WU sweeps *references* to them, never re-opens them.
- **The graduation *workflow*** — owned by `decomposition-machinery`; this WU only reconciles it post-hoc.
- **The `active/`-layout drift-validation hook** (documented-layout == reader / scaffold behavior) — routed to
  `decomposition-machinery`'s layout-drift hook family. This WU corrects today's drift; the hook prevents
  recurrence.
- **The `TYPE.QUALIFIER` file/section renames** (the `STATUS` / `MEMORY` / `NOTES` family) — owned by
  `naming-conventions`. This WU drops only the `1_`/`2_`/`3_` numeric prefixes (SAP R18).
- **The relocatability link-def sweep + enforcement hook** — owned by `quality-gate-hooks`.

## Consequences & Risks

- **Orphaned references that lint / CI doesn't catch** (the primary risk). Conceptual prose and cross-file
  references to retired vocabulary or renamed files are invisible to markdown lint. *Mitigation:* thorough grep
  coverage plus integration-test coverage on the activate / integrate / archive flows, which exercise the renamed
  workflow references in practice.
- **Two large rename cascades over an overlapping file surface** (this WU's prefix-drop and
  `naming-conventions`'s eventual `TYPE.QUALIFIER` cascade, ~139 files touch the numbered names). *Mitigation:*
  the cascades touch different tokens (no conflict); explicit sequencing (this WU first, `naming-conventions`
  rebases) makes the double-touch one-directional and cheap.
- **Two-copy consistency.** Every workflow-file rename and reference edit must land in both the package source and
  the `.arc/` instance, or the package-project sync hook flags drift. *Accepted cost:* the sweep is broad but each
  edit is determinate.
- **Cohort-doc conformance is staged-scoped.** `decomposition-machinery`'s validator only flags a divergent cohort
  doc when it is next staged, so there is no forced break in the interim — the audit is proactive, not
  hook-forced.

## Success Criteria

- Grep finds zero residual conceptual references to the retired framing (`incidental` as a WU shape, the `atomic`
  *tier*, `minimum`/`standard`/`expanded` planning-depth modes, the `## Scope` task-list header) across
  workflows, strategies, and templates.
- Grep finds zero references to the numbered workflow filenames (`1_create-spec`, `2_generate-tasks`,
  `3_process-task-loop`) anywhere in either copy; the three files are renamed and the `generate-tasks`
  template/render pair + package-sync dependency map are updated.
- The activate / integrate / archive integration tests pass against the renamed workflow references.
- Exactly one canonical `active/`-is-flat statement exists (in `strategy-work-organization.md`); the two
  previously-misstating strategies are corrected and defer to it.
- Every `backlog/planned/**` cohort doc satisfies `decomposition-machinery`'s three-condition invariant (verified
  by staging each against the validator with no flag).
- `draft-arc-plan-conductor.md` carries no `## Scope`-header or `minimum`/`standard`/`expanded` references and
  speaks in `Class` + `planning depth`.
- `decomposition-machinery`'s graduation-workflow doc reflects the steps the manual run surfaced, and the
  worked-example writeup exists.
- The commit / PR surface-language register is recorded in `DEV-RULES.ARC` § Documentation Boundaries.
- Every commit-message `Context:` template in the workflow docs validates against the `commit-msg` hook's
  accepted-format set (`draft-design.md`'s `(draft-design)` template corrected to `draft-{name}.md (planning)`).
- Markdown lint passes with zero violations across the changed surface; both copies (package source + `.arc/`)
  are consistent.

## Open items

- The exact wording of the canonical `active/`-layout statement (and how lightly `QUICK-REFERENCE` points at it)
  — settled while writing, not a blocking design decision.
- Whether `cohort-principle-anchored-core.md` and `cohort-agile-wu-lifecycle.md` need any substantive change or
  already conform — resolved by the audit during execution.
- The full enumerated set of always-loaded surfaces needing a vocabulary-coherence edit may grow as the grep
  sweep runs; the three named (`AGENT-BRIEF.ARC`, `DEV-RULES.ARC`, `session-init.md`) are the known starts.
