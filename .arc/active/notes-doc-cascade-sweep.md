# Notes: Doc Cascade Sweep

## Contents

- Incidental concept-site map (Task 1.1) — vetted retire/keep mapping
- Documentation cascade — granular per-file / per-section edit map
- `arc-plan-conductor` write-back — specifics
- Manual-graduation codification — what the run surfaced
- Copy mechanics — template/render pairs vs. plain both-copies

---

## Incidental concept-site map (Task 1.1)

Vetted enumeration of the `incidental` footprint across the **in-scope live surfaces** (workflows, methods,
strategies, briefs, `QUICK-REFERENCE`, templates — Success Criterion 1's scope). `completed/**`, `backlog/**`
drafts, `reference/adr/**`, `reference/supplemental/**`, and this WU's own artifacts are out of scope (frozen
history / internal records) and excluded — they account for ~500 of the ~560 raw two-copy hits.

Per-hit test: does the site frame `incidental/` as a **distinct work-unit shape** (retire), or is it the
ordinary-English sense — a fix/commit/concern that surfaced incidentally (keep)? Disposition codes: **KEEP**
(ordinary-English, untouched); **RETIRE** (WU-shape / pause-pointer residue, edited in Task 1.1.b); **PHASE 2**
(`strategy-work-organization` heaviest residue — flagged here, edited in Phase 2 per Task 1.1.b); **DECISION**
(needs sign-off — see below). Edits land in **both copies** unless marked `.arc`-only.

| File (both copies unless noted) | Line(s) | Snippet | Sense | Disposition |
| --- | --- | --- | --- | --- |
| `AGENT-BRIEF.ARC` | 51 | "off-task / incidental, workflow stages" | ordinary | KEEP |
| `strategy-interlock-release-wrappers` | 116 | "zero-friction posture on incidentals" | ordinary | KEEP |
| `strategy-quality-gates` | 124 | "incidental fixes, atomic tasks" | ordinary (incidental fix) | KEEP |
| `commit-footer` | 37, 38, 48, 78 | `Context: … (incidental during X)` | ordinary (live commit-context category) | KEEP |
| `commit-format` | 62 | `(incidental during ...)` parenthetical | ordinary (live context category) | KEEP |
| `DEV-RULES.ARC` | 72 | "Off-workflow / incidental commits" | ordinary | KEEP |
| `strategy-task-list-formatting` | 104 | "incidentally-bracketed prose in titles" | ordinary (adverb) | KEEP |
| `session-handoff` | 407, 413 | "note incidental work separately" / "Incidental: Fixed…" | ordinary | KEEP |
| `3_process-task-loop` | 284, 286 | "### Incidental Commit Discipline" / "off-workflow / incidental commits" | ordinary (live) | KEEP |
| `3_process-task-loop` | 2 | frontmatter purpose "…incidental work routing" | ordinary, but verify after redirect | KEEP/verify |
| `strategy-task-list-formatting` | 14, 39–45, 405, 412 | the `Incidental` (`# Incidental: {Title}`) task-list **form** — "incidental is its own spec" + `manage-incidental` links | concept (task-list form as own-spec WU shape) | RETIRE |
| `2_generate-tasks` | 344 | "Incidental retains `## Context` + `## Scope` (it is its own spec)" | concept | RETIRE |
| `template-meta` | 101–102 | `Interrupts:`/`Paused At:`/`Paused To:` substrate + "retired with the broader incidental-model reform" note | pause residue + what-was note | RETIRE |
| `deactivate-work-unit` | 20–21, 233 | "resume the paused parent — see `manage-incidental-work.md`" | pause-pointer residue | RETIRE/redirect |
| `prepare-commits` | 136 | "Branch model — naming, incidental routing, merge" | pointer to retired branch-model incidental routing | RETIRE-light (update pointer) |
| `strategy-package-project-sync` (`.arc`-only) | 207 | dependency-map row for `manage-incidental-work.md` | consequence of file disposition | DECISION-coupled |
| `strategy-work-organization` | 4, 30, 413, 955, 960, 1130, 1135, 1172, 1260 | "Incidental Work Model" §, TOC entry, "incidental task lists may live alongside…", the cross-cutting matrix prose, `manage-incidental` link | concept (strategy home of the model) | PHASE 2 |
| `strategy-work-organization` | 285 | "rather than an incidental parent" | ordinary | KEEP (in Phase-2 file) |
| `manage-incidental-work.md` (+ pkg mirror) | whole file (14 hits) | entire workflow built on `.arc/active/incidental/` dirs, `incidental/<name>` branches, incidental-task-list-as-own-spec, interrupt/pause-parent | concept (the WU-shape model itself) | **DECISION** |
| `3_process-task-loop` | 254, 261, 263, 294, 295, 314 | "## Incidental Work Management" decision guide ("incidental task list") + "manage-incidental-work.md" pointers + link-def | concept (points at the retired workflow) | **DECISION**-coupled |

### Decision (resolved): retire `manage-incidental-work.md`, no replacement

**Resolved — Option A (retire & redirect), no successor workflow.** The file is an entire live workflow embodying
the **retired** `incidental/`-as-WU-shape model (`.arc/active/incidental/` dirs, `incidental/<name>` branches,
"incidental task lists as their own spec," interrupt/pause-parent coordination). It surfaced as new scope — the
planned cascade map below never listed it. Every function it served is already homed under the current model, so
no replacement is built:

- **Routing decision** → DEV-RULES.ARC § Discovered Work Routing — behavioral/constitutional, correctly
  always-loaded; not extracted to an on-demand doc.
- **Each route's execution** → `arc-inbox` (capture), `run-errand` / `arc-errand` (errand), housekeep +
  `init-work-unit` (multi-step graduation).
- **"Branch without a work unit"** (its full-protection atomic-on-own-branch case) → the Errand (`chore/<slug>`).
- **Parent pause/resume** → retired under worktree isolation (the parent never pauses). Park/resume is a real
  future need but is owned downstream by the arc-plan conductor (§ 20) — deliberately NOT homed here, to avoid a
  premature duplicate home.

The only on-contact substance a successor could hold was the incidental-task-list mechanics — exactly what is
being deleted — so a thin router doc earns nothing beyond what DEV-RULES + the route executors already provide.

**1.1.b actions:** delete `manage-incidental-work.md` (both copies); slim `3_process-task-loop` § Incidental Work
Management to a pointer to DEV-RULES § Discovered Work Routing (keep § Incidental Commit Discipline + the
atomic-task-completion reorder protocol — both process-loop-specific); retire the `Incidental` task-list form
(`strategy-task-list-formatting`, `2_generate-tasks:344`); strip the pause-parent pointer (`deactivate-work-unit`)
and `Interrupts:`/`Paused At:` residue (`template-meta`); drop the `manage-incidental` link-defs + the
`strategy-package-project-sync` dependency-map row. `strategy-work-organization` deferred to Phase 2.

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
- **`strategy-work-organization.md`** — the largest surface, but mostly already landed (Phase 2 grounding audit):
  `## Class Model`, `## Cohorts` + the `cohort-{name}.md` record, `## WU sizing standard`,
  `## Task Lists and Branches`, `## Spec-Flow Invariants`, and `### Escape-hatch` all exist already
  (`class-model-foundation` + `decomposition-machinery`). The work is therefore:
    - verify those sections read coherently and sweep residual intent-level / tier phrasing (confirm the cohort's
      model is named as the `Class`-classification home, the sizing co-home, the grouping convention);
    - sweep § Task Lists and Branches to the Model-B-only world — clear any residual stacked-PRs / phased /
      team-sub-branch pre-ADR-019 leftovers; coordinate with `decomposition-machinery`'s flagged reconciliation
      debt;
    - author the canonical `active/`-is-flat statement (what + why: one WU per worktree; concurrency = more
      worktrees, not more metas), anchored to `class-model-foundation`'s layout model;
    - correct the nested-`active/` path templates (`active/**/<wu-name>/meta-<name>.md` → `active/meta-<name>.md`,
      line ~764) and lifecycle-transition paths (`active/<wu>/` → `active/`, lines ~867–876). **Leave
      `backlog/planned/**` nested and keep the recursive render-walk** — the nesting is real for cohort-wrapped
      backlog dirs; only `active/` is flat.
- **`strategy-file-classification.md`** — correct the `active/api-modernization/` per-WU-subdir example
  (file-classification:188) to flat; state the _what_ and defer to work-organization for the _why_.
- **`QUICK-REFERENCE.md`** — at most a one-line pointer to the canonical `active/`-layout statement.
- **`template-meta.md`** — confirm the new fields (`Class`, `Design` semantics, path-valued `Cohort`) read
  cleanly (the reserved-`Tier:` comment is already absent — verify, don't re-retire).
- **`template-tasks.md`** — depth variants.
- **`template-cohort.md`** — confirm it generalizes cleanly from the prototype cohort docs minted at this
  cohort's graduation (owned by `decomposition-machinery`; sweep references to it only).
- **quality-gate-commands** — `Class` awareness where relevant.
- **Workflow-file rename** — `1_create-spec.md` → `create-spec.md`, `2_generate-tasks.md` → `generate-tasks.md`,
  `3_process-task-loop.md` → `process-task-loop.md`. Both `generate-tasks` _and_ `process-task-loop` are
  `.template.md` → rendered pairs (`create-spec` is plain `.md`); ~140 markdown files reference the numbered names.
  Update: the markdown references (workflows, strategies, methods, templates, skills, session-init, READMEs); the
  `strategy-package-project-sync` dependency map (render-pair table ~lines 70/73, dependency list ~lines
  200/259/260); `init-recipe.json`'s `include_files`; and the 4 test fixtures (`init.test.ts`,
  `active/meta-reader.test.ts`, `scripts/validate-extension-points.test.ts`, `integration/active.test.ts`). Grep
  both copies. **`manifest.json` is out** (generated by `arc update`, not run self-hosting → owned by
  `self-hosting-manifest-freshness`); the WU's gates run the full suite (vitest / typecheck / build), not just lint.
- **Workflow commit-template fix** — `draft-design.md` "Capture the draft" codeblock: `Context:
  meta-{name}.md (draft-design)` → `Context: draft-{name}.md (planning)` (both copies). `graduate-work-unit.md`'s
  non-accepted `(graduation)` is **out of scope** — routed to `rules-restructure` (owns the `commit-msg`
  allowed-contexts list + `commit-footer.md`), with the recommendation to add `(graduation)` as a first-class
  category. See `USER-INBOX`.

## `arc-plan-conductor` write-back — specifics

`draft-arc-plan-conductor.md` is stale in two places that contradict the shipped model:

- its § 4 still says a quick-tier generates a `## Scope` task-list-header section — wrong (the spec is always a
  separate doc);
- it speaks of `atomic` / `quick` / `standard` tiers — wrong (the `Class` set is `light` / `heavy`).

This WU retires only that stale vocabulary. The deeper realignment — mapping the conductor's depth modes
(`minimum` / `standard` / `expanded`) onto `planning depth` (`low` / `medium` / `high`; the draft's own
"process intensity" wording is stale — `planning depth` is the live term), realigning tier-awareness to `Class`,
dropping the tier → spec-form coupling, and invoking the `brief`-form spec template — is the conductor WU's own
design, already tracked in that draft's 2026-06-10 inbound-buffer item. Leave that buffer item in place.

## Manual-graduation codification — what the run surfaced

This cohort's graduation was run manually, before `decomposition-machinery`'s graduation workflow existed (the
bootstrapping order: a cohort's graduation precedes all its members, including the one shipping the workflow).
Two steps surfaced _during_ the run and were folded back into `decomposition-machinery`'s draft — use them as the
worked example when reconciling the workflow doc against what was actually done:

- the **field-inheritance step** (members inherit cohort-level fields);
- the **member-slug naming heuristic** (slugs must read legibly out of context — `class-model-foundation`, not
  `model-foundation`).

Reconcile the graduation-workflow doc against any step the manual run revealed as missing or mis-ordered; the
workflow itself is `decomposition-machinery`'s deliverable, this WU contributes the post-hoc reconciliation +
writeup only.

## Copy mechanics — template/render pairs vs. plain both-copies

"Both copies" (package source + `.arc/`) is not uniform — some framework files render from a `.template.md` in
package source, others are plain `.md` in both. Verify per file before editing or renaming; a template/render
pair means editing the package `.template.md` **and** the rendered `.arc/` copy (the `.arc/` copy is generated,
so package-source is authoritative).

- **Template/render pairs** (package `*.template.md` → rendered `.arc/*.md`): `session-init`,
  `2_generate-tasks`, `3_process-task-loop`. Confirmed during the Phase 1 grounding audit.
- **Plain both-copies** (`*.md` in both): `AGENT-BRIEF.ARC`, `DEV-RULES.ARC`, `1_create-spec`.
- **Single-copy** (`.arc/`-only WU artifacts, never mirrored): `draft-arc-plan-conductor.md` and the cohort docs
  under `backlog/planned/**`.

Bearing on the rename cascade (Phase 4): the spec named only the `generate-tasks` template/render pair, but
`process-task-loop` is one too — both rename across `.template.md` + rendered. `session-init` is a template/render
pair but is **not** renamed (no numeric prefix).
