# Draft: pr-decomposition

- **Origin:** [internal] — surfaced 2026-06-23 during `lifecycle-closeout` planning, reflecting on why ARC's
  work units run broader than the industry small-PR norm and whether that is a coupling artifact rather than a
  deliberate stance.
- **Purpose:** Let a single ARC work unit optionally emit **more than one pull request** — decoupling the
  _merge_ boundary from the _concern_ boundary — with the PR/review seams planned **up front** at `generate-tasks`
  rather than discovered at integration. This amends ARC's current explicit `1 WU = 1 branch = 1 PR` rule to
  `1 WU = 1 branch, emitting ≥ 1 PR`. **Rough draft** — captures established direction; every design call below is
  an open question, not a decision. Grounding research lives in `research-pr-decomposition.md`.

---

## Problem / Motivation

ARC currently **welds two separable boundaries together**: the _concern_ boundary (the work unit — correctly broad
for one uniform concern) and the _merge_ boundary (the PR — currently forced to equal the WU). Industry separates
them: one concern (an epic, or a patch-series cover letter) ships as **many** small, individually-reviewable,
individually-mergeable parts.

The cost of the coupling shows up on cross-cutting WUs. `lifecycle-closeout` is the trigger case: one WU bundling a
~20-file two-mirror doc sweep + several code-wiring legs + a new ceremony + a CLI removal + a terminal audit. By
ARC's own criteria it is correctly _one concern_ — but it lands as _one large diff_ at integration, and review
quality degrades with diff size (the research is strong on this — for **review thoroughness / defect detection**,
not merge speed; and the degradation applies to AI review as much as human, since attention dilutes across a large
diff). So the problem is not "WUs are scoped too broadly" — it is that the merge boundary is welded to the concern
boundary, when it is a separate axis.

**Why now:** the cohort lifecycle work (`lifecycle-state-machine`) has just made transitions first-class CLI
mechanics, and native stacked-PR tooling has arrived in the ecosystem (GitHub, April 2026) — so the substrate to
express this is closer than before.

## Proposed direction (rough)

**Decouple the boundaries into three nested levels:**

- **Work unit = the concern unit** — planning, ownership, the spec. Unchanged. The "this is the thing that handles
  this" instinct stays right; this draft does **not** narrow WUs or push toward more sibling decomposition (that is
  `decompose` / `assess-cohort-fit`'s separate question).
- **Deliverable = the merge + consistency unit** — one PR; the level at which the consistency / bisectability test
  applies.
- **Phase = the review increment** — unchanged from today's task-list model.

**Plan the seams up front, at `generate-tasks`.** Both mature precedents plan the split during decomposition, not
at integration: Google's four splitting strategies + implementation-plan grid, and the Linux kernel's patch-series
designed so every intermediate state builds and runs (the bisectability rule). The consistency-preserving property
**must be designed in**, so the seam decision belongs where ARC already decomposes — `generate-tasks`.

**The cover-letter mapping** makes this low-friction: ARC's `spec-*` + `meta-*` (+ `cohort-*`) already _is_ the
kernel cover letter (whole-series rationale), and the task list's phases are latent stack entries. The missing
piece is **merge topology**, not decomposition — ARC already decomposes.

**Stack-eligibility test (mechanical, the research's open question to answer):** a deliverable is split-eligible
iff it leaves the tree **green + semantically consistent** on its own. This gates work-type applicability:

- **Additive / layered / vertical** work → splits well (most feature work; the additive parts of a mixed WU).
- **Atomic consistency sweep with no consistency-preserving intermediate** → stays one PR. A doc verb-rename is the
  clean example: there is no "both names coexist consistently" intermediate, so it cannot be split without leaving
  `main` half-renamed. (This validates the `lifecycle-closeout` instinct — that sweep is genuinely atomic.)
- **Mixed WU** (e.g. `lifecycle-closeout`) → a stack whose additive legs are their own deliverables, the atomic
  core is one deliverable, and the **audit is the terminal stack entry** (merges last, sees the whole). Note this
  means the single-audit-gate argument does _not_ actually require a single PR — only that the audit be the stack's
  top.

## Alternatives (open)

- **Task-list structure for multi-phase deliverables** (when phases 3+4 must merge together but should stay
  separate phases for impl-time granularity):
    - **(A) Thin orthogonal annotation** _(current lean)_ — phases carry a `Deliverable: N` (merge-group) tag;
      consecutive phases sharing a tag merge as one unit. Keeps the phase axis untouched; adds merge-grouping as a
      separate axis — the same decouple-the-boundaries move as the whole feature.
    - **(B) `Phase 3A / 3B`** — a deliverable-level grouping renaming above the phase.
    - **(C) Subphase level** — keep `Phase 3`, add a `Subphase 3A / 3B` level above the parent task.
    - Default assumption either way: **phase = deliverable**, barring the always-present verification phase.
- **Seam-decision timing:** up-front at `generate-tasks` _(lean — bisectability must be designed in)_ vs.
  integration-time. The research's open question is whether up-front measurably beats integration-time or just
  tracks author skill.
- **Config posture:** ARC default-**on** with a project-level opt-out toggle _(lean)_ vs. opt-in. If multi-PR
  review is justified it is best practice regardless of team size; the **only** opt-out justification is "not
  reviewing PRs at all." Toggle existence + placement is a draft-time call weighing `principle-anchored-core` /
  `scalable-core` (core-always-on vs. scalable layer) and the configuration cohort.
- **Terminology:** ARC-sanctioned, industry-aligned, recognizable. Candidates — `stack` / stacked PRs (most
  recognizable), `deliverable`, `slice`, patch-`series`. TBD.

## Unknowns and Assumptions

- **Spec-time structure** — a reviewer reading the `spec-*` to scope one deliverable-PR needs a design-element →
  deliverable mapping (or PR descriptions generated from the relevant spec slice), else the spec is unwieldy from
  the reviewer's side. The kernel cover-letter's per-patch narration, ARC-ified. Does the spec form need a new
  structural element?
- **Mechanical stack-eligibility** — can "leaves the tree green + semantically consistent" be derived
  automatically (build-green is checkable; semantic consistency is the hard half)?
- **Merge orchestration** — a stack is a dependency graph merged **bottom-up**; tooling cannot treat entries as
  independent. What drives the ordering / rebase cascade (native GitHub stacked PRs, a `git`-level mechanic, or an
  `arc` verb)? Per-layer conflict cost scales with cross-cutting-ness — exactly ARC's hardest WUs.
- **Amended invariant** — this rewrites `strategy-work-organization` § Single branch per work unit and touches the
  integration ceremony (`integrate-work-unit`), `generate-tasks`, the task-list strategy/template, and the spec
  form. Deep change; an enhancement, not a bug-fix.
- **Class:** Set **Novel** (provisional estimate) — it synthesizes a new ARC-domain merge-decomposition model and
  reached its grounding through external research. _Tension:_ the research found **mature prior art to compose
  from** (stacking, patch-series, the cover-letter model), which arguably pulls this toward **Heavy** (composition,
  not invention). Freely revisable; the WU's own planning resolves it — first thing to settle.
- **Relationships:** standalone for now (`Parent: [none]`); likely consumers / coordinations —
  `principle-anchored-core` / `scalable-core` (config-core boundary), the configuration cohort (toggle
  architecture), `composable-workflows` (workflow-shell), and `roadmap-tooling` (a Deliverable column, if added).

## Scope Estimate

**Large** (week+). Spans methodology (the amended invariant + a possible new DEV-RULES / strategy section), the
task-list model (`generate-tasks`, the task-list strategy + template), the spec form, the integration ceremony,
and a config axis — across both the package source and the `.arc/` copy. Sequencing dependency on the terminology
and config-posture calls, both draft-time.
