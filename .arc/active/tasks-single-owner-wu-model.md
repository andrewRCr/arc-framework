# Task List: single-owner-wu-model

- **Design:** `spec-single-owner-wu-model.md`

---

## **Phase 1:** Gut `strategy-team-coordination.md` to a cross-person-only doc

_Purpose:_ Remove the within-WU multi-developer apparatus that creates the live contradiction with the shipped
single-owner doctrine, and reframe the genuine cross-person residual that survives. This is the doc carrying the
contradiction, so it leads.

_Design decisions:_ The doc survives gutted (Decision 4), not deleted — a cross-person-only coordination doc. The
two flagged placement calls (the cross-dev commit-visibility note stays in Interlock-Release Coordination;
External Tracker Integration stays in this doc) are settled as leanings, confirmable at review. Every edit pairs
across both trees (`.arc/**` and `packages/arc-framework/arc/**`).

_Notes:_ See `notes-single-owner-wu-model.md` § `strategy-team-coordination.md` survivor map for the
section-by-section keep/remove/reframe dispositions and line anchors.

### `[x]` **1.1 Reframe § Task Ownership to § Ownership keyed on the meta `**Owner:**` field**

- _Goal:_ The meta `**Owner:**` field is documented as the single source of assignment truth, and no `(@name)`
  marker convention remains anywhere in the doc.

    - `[x]` **1.1.a Replace § Task Ownership (70–105) with § Ownership** — the meta `**Owner:**` field as the
      assignment; non-owner contribution via PR review, pairing (`Co-authored-by:`), and handoff; expand "Directly
      Responsible Individual (DRI)" at first contact; point to the shipped self/foreign asymmetry in
      `strategy-concurrent-work.md` rather than restating it.

    - `[x]` **1.1.b Remove the residual `(@name)` references doc-wide** — the External Tracker assignment-table
      cell (402), the no-extension-points-for-assignment note (420–421), and § When `(@name)` Markers Are Optional
      (423–427).

    - `[x]` **1.1.c Update § Contents entry 2** — "Task Ownership — `(@name)` convention" → "Ownership — meta
      `**Owner:**` field".

### `[x]` **1.2 Strip the within-WU apparatus from the surviving coordination sections**

- _Goal:_ The sections that survive describe cross-person coordination only — no language implying multiple
  developers concurrently drive one WU's task list or share its branch.

    - `[x]` **1.2.a Workflow Adaptations table (41–66)** — drop the "One task at a time / concurrent pairs OK" and
      "Task ownership / `(@name)` markers" rows; in the Key distinction paragraph (58–66) drop the "scanning
      `(@name)` markers" line — the meta is WU-level state owned by the single owner.

    - `[x]` **1.2.b Interlock-Release Coordination (181–226)** — remove the "Task ownership before approval" block
      (187–191) and the "concurrent pairs should pull before starting or committing" sentence (202–204); keep
      Manual commit mode (193–197), the commit-on-task-approval visibility framing incl. "Push remains separate"
      (206–211), Release-wrapper opt-in per-developer (213–218), and Asymmetric setup (220–226).

    - `[x]` **1.2.c Merge Conflict Expectations — within-WU removal (285–359)** — remove § Task Lists Are Shared
      Files (287–305); in § Session State Merge Behavior remove the within-WU team-sub-branch coordination
      (316–322); in § Concurrent Sessions remove the "Within-WU team sub-branches" para (343–358). Keep Cross-WU
      Planning Dependencies (360–382) and Configuration Notes (384–389). (The surviving cross-WU parallel-WU
      material — the 313–315 meta-file fact and the 327–341 para — is consolidated by 1.5.b.)

### `[x]` **1.3 Remove § Team Branching Patterns wholesale**

- _Goal:_ No within-WU branching-pattern catalog remains; the cross-WU branching model lives in
  `strategy-work-organization.md` and `strategy-concurrent-work.md`.

    - `[x]` **1.3.a Remove § Team Branching Patterns (230–284)** — all four patterns (Shared Integration Branch,
      Personal Sub-Branches, Stacked PRs per Developer, Direct Shared Branch) plus the `Branch(es):`
      flat-multi-branch header-field note (236–240).

    - `[x]` **1.3.b Drop § Contents entry 5** ("Team Branching Patterns") and reconcile any in-doc cross-reference.

### `[x]` **1.4 Reframe Person-to-Person Task Handoff to `Owner`-field reassignment**

- _Goal:_ Handoff reads as sequential single-owner reassignment via the meta `**Owner:**` field, not `(@name)`
  marker reassignment.

    - `[x]` **1.4.a Replace the `(@name)` reassignment steps** — the minimum-viable-handoff note (117), Outgoing #1
      (123), and Incoming #2 (157) → meta `**Owner:**`-field reassignment; keep the git-notes namespace bootstrap
      and Async Conventions.

### `[x]` **1.5 Reframe the doc's net framing and defer parallel-WU mechanics**

- _Goal:_ The doc frames team parallelism as multiple single-owner WUs across identities (worktrees), deferring
  parallel-WU mechanics to `strategy-concurrent-work.md` instead of duplicating them.

    - `[x]` **1.5.a Reframe the header / intro (1–25)** to the net framing; preserve the existing "deliberate
      starting point, not a settled standard" validation note (21–25).

    - `[x]` **1.5.b Consolidate the cross-WU parallel-WU residual to a thin pointer** — § Session State Merge
      Behavior's cross-WU meta-file fact (313–315) and § Concurrent Sessions' intro + "Parallel work units on
      independent branches" para (327–341, which already defers mechanics there) collapse to one brief
      cross-identity pointer into `strategy-concurrent-work.md`.

## **Phase 2:** Reconcile constitutional rules + task-list ownership conventions

_Purpose:_ Remove developer-agent-pair concurrency from the constitutional rules and retire the `(@name)` marker
convention from task-list formatting — the two non-team-coord doc homes of the retired apparatus. Both edits pair
across trees.

### `[x]` **2.1 Rewrite `DEV-RULES.ARC` § Task interlock to per-work-unit (drop the team-mode conditional)**

- _Goal:_ § Task interlock states the interlock applies per work unit (one owner), with no developer-agent-pair /
  concurrent-pairs language and no team-mode conditional gating the universal statement.

- _Note:_ Mode-agnostic decoupling per `notes-single-owner-wu-model.md` § Mode-agnostic decoupling — the
  conditional is dropped, not reframed.

    - `[x]` **2.1.a Drop the team-mode pair sentence (189)** — "In team mode, this applies per developer-agent pair
      — concurrent pairs may work on different tasks simultaneously" → state the interlock applies per work unit
      (one owner); cross-person parallelism is multiple WUs.

    - `[x]` **2.1.b Trim the cross-reference (190)** — keep a slim pointer to Team Coordination for cross-person
      coordination conventions; drop "branching patterns" (§ Team Branching Patterns is removed) and the
      "task ownership" phrasing.

### `[x]` **2.2 Retire the `(@name)` Task Ownership Markers convention from `strategy-task-list-formatting.md`**

- _Goal:_ Nothing in the formatting strategy documents the `(@name)` marker; the § Task Ownership Markers section
  is removed.

    - `[x]` **2.2.a Remove § Task Ownership Markers (306–325)** — the section, its `team.mode` activation line, the
      `(@name)` format spec, and the `@alice` example.

    - `[x]` **2.2.b Reconcile the orphaned cross-references** — § Contents entry 3 (line 19), the
      `[team-coordination]` link definition (411, used inline only inside the removed section at 322), and the
      Related Documentation entry if it lists team-coord. (`template-tasks.md` is clean — no `(@name)` reference.)

## **Phase 3:** Decouple ownership-cardinality from PR-cardinality

_Purpose:_ Surgically split the welded one-owner/one-PR passages so PR-count-per-WU reads as a separable axis,
leaving a clean seam without re-hardening the one-PR claim — and reconcile the work-org cross-references that
Phase 1's team-coord removals leave dangling.

_Design decisions:_ Audience-split per Decision 6 — neutral seam wording in these adopter-facing docs (no
unshipped-WU name); the internal planning artifacts name the downstream concern. Minimal in-place split only
(Decision 5 scope boundary — this WU does not build the multi-PR model, does not amend the `1 WU = 1 PR`
invariant). PR-count separability is marked **once**, in the canonical home (work-org § Cohorts); the other welded
spots simply drop the "one PR" specificity. Runs after Phase 1 (the removed team-coord set must be known). Edits
pair across trees.

### `[x]` **3.1 Split the welded passages and reconcile cross-refs in `strategy-work-organization.md`**

- _Goal:_ The one-owner claim survives while PR-count reads as a separable axis, and no cross-reference points at a
  removed or gutted team-coord section.

    - `[x]` **3.1.a § Cohorts** — kept "self-contained, single-owner WUs, each with its own meta/spec/tasks and one
      branch"; dropped the welded "and one PR"; added the neutral seam "how many PRs a work unit emits is a separate
      axis" — the canonical PR-count-separability mark.

    - `[x]` **3.1.b Reconcile the dangling team-coord cross-refs** — re-pointed the stack merge/rebase discipline to
      `strategy-concurrent-work.md` § Branch and rebase discipline (new `[concurrent-work]` link def added); removed
      both within-WU team-sub-branch references (the mechanism is gone); reconciled the § Team Coordination pointer
      to the surviving surface (ownership, interlock-release coordination, cross-WU planning, external tracker).

    - `[x]` **3.1.c Verify the `**Owner:**` field gloss** — confirmed "single owner (per WU)" reads consistently
      with the authoritative single-owner statement; no edit needed.

- _Outcome:_ Ownership-cardinality now reads as separable from PR-cardinality, marked once in the canonical home
  (§ Cohorts); the one-owner claim is preserved and the `1 WU = 1 PR` invariant is left unamended (per the
  minimal-in-place scope). Edits paired across both copies (`.arc/` + package source), byte-identical.

### `[x]` **3.2 Split the welded passages in `assess-cohort-fit.md`**

- _Goal:_ The cohort-fit method affirms one owner per WU and treats PR-count as separable, without re-hardening
  one-PR-per-WU.

    - `[x]` **3.2.a Mental model + stack-vs-cohort** — kept "each its own branch" and one-owner; dropped the "one
      reviewable PR" specificity, leaving "WU ≈ story". The "not one WU spread across many branches" clause asserts
      one-branch-per-WU (a retained invariant), not one-PR — left intact, keeping the method consistent with the
      work-org § WU sizing standard it mirrors.

    - `[x]` **3.2.b "cohort of self-contained WUs" passage** — kept "each its own meta/spec/tasks and one branch";
      dropped the welded "one PR"; softened "not one large WU sliced into several PRs" to "sliced into smaller
      pieces" so PR-count stays separable.

    - `[x]` **3.2.c De-weld the "PR-sized WUs" delivery line** — dropped "PR-sized" from "delivers as a stack of
      PR-sized WUs along natural deliverable/phase boundaries" (the sizing rationale is already carried by the
      "natural deliverable/phase boundaries" clause); neutral, model-agnostic wording, forward-compatible without
      naming the downstream multi-PR concern.

### `[ ]` **3.3 Fold the unexpanded "DRI" gloss at `strategy-work-organization.md` ~:339**

- _Goal:_ The lone bare "No coordinator or DRI" (~339) reads in single-owner terminology — reword to "single
  owner" (lean) or expand "DRI" at first contact if retained.

## **Phase 4:** Remove `(@name)` from workflows/templates and the team-mode code surface

_Purpose:_ Clear the marker from every workflow/template consumer and remove the pre-commit check that enforces
it — including its README docs, the one code surface subject to shell quality gates.

_Design decisions:_ Live-vs-template divergence resolved per-file: the live `.arc/` renders of the _templated_
workflows are already stripped of team-mode-conditional content, so `process-task-loop`, `session-init`, and
`generate-tasks` are **package-`.template.md`-only** edits; only `session-handoff` also needs a live edit (its
line-97 cross-ref is unconditional, so it survived stripping). Because those package edits have no matching `.arc/`
render change, 5.3 (parity) must reckon with the template→render relationship rather than a 1:1 diff — confirm the
Package-Project sync check's behavior at execution. Code edits pair across both `.internal/githooks/` trees.

### `[ ]` **4.1 Remove `(@name)` team-mode steps from the workflow templates (+ the one live cross-ref)**

- _Goal:_ No workflow template or live render instructs `(@name)` marker use, scanning, or claiming.

    - `[ ]` **4.1.a `process-task-loop`** — package template only (`process-task-loop.template.md` ~25, 27–30, 247:
      before-starting `(@name)` ownership check, claim-by-marker, shared-branch concurrency; live render already
      clean). Remove the team-mode `(@name)` step and **drop** the mirrored "In team mode, this applies per
      developer-agent pair" conditional (~25) → per work unit (one owner), matching 2.1
      (`notes-single-owner-wu-model.md` § Mode-agnostic decoupling).

    - `[ ]` **4.1.b `session-init`** — package template only (`session-init.template.md` ~333–340: team-mode
      `(@name)` next-task resolution; live render already clean).

    - `[ ]` **4.1.c `session-handoff`** — **both copies**: `session-handoff.template.md` (~97 and ~300–301) and the
      live `session-handoff.md` (line 97 only — the unconditional person-to-person cross-ref). Remove the `(@name)`
      reassignment and last-committer-wins-via-`(@name)` language; point to `**Owner:**`-field reassignment.

    - `[ ]` **4.1.d `generate-tasks`** — package template only (`generate-tasks.template.md` ~224: "add `(@name)`
      markers to task checkboxes"; live render already clean). Remove the team-mode ownership-marker instruction.

### `[ ]` **4.2 Remove the team-mode `(@name)` pre-commit check and renumber the sequence**

- _Goal:_ The pre-commit hook no longer checks for `(@name)` markers, the check sequence stays gapless, and the
  README no longer documents the check.

    - `[ ]` **4.2.a Remove the CHECK 10 block from `githooks/pre-commit` (304–325)** — the team-mode task-ownership
      check, both trees (`.arc/system/.internal/githooks/` and `packages/arc-framework/arc/system/.internal/githooks/`).

    - `[ ]` **4.2.b Renumber CHECK 11–19 → CHECK 10–18** — both trees, so the sequence stays gapless (verify no
      test/README references a check by number before renumbering).

    - `[ ]` **4.2.c Remove the README entries (90, 119–120)** documenting the team-mode `(@name)` check — both trees.

### `[ ]` **4.3 Verify the hook gates after the check removal**

- _Goal:_ Shell quality gates and the hook test suite pass with CHECK 10 gone and the sequence renumbered.

- _Note:_ Verify-only — no test asserts CHECK 10's team-mode warning (the `(@name)` test hits are the unrelated
  worktree-ownership-marker lib), so there is no test to remove and no red-green-refactor loop. Remove or adjust a
  test only if the removal/renumber actually breaks one.

    - `[ ]` **4.3.a Confirm no test asserts CHECK 10** — re-grep `packages/arc-framework/__tests__/` for the check's
      warning string / number; expected none.

    - `[ ]` **4.3.b Run shell + hook gates** — `lint:sh` (shellcheck) and the hook tests
      (`hook-integration`, `pre-commit-shell-invocation`) green.

## **Phase 5:** Corpus-coherence sweep

_Purpose:_ Verify the removal is complete and coherent across the live methodology corpus — no dangling reference
to a removed section, no unexpanded "DRI", no adopter-facing forward-pointer leak, both trees in parity. The
terminal sweep this WU owns (distinct from `finalize-parallelism`'s runtime-focused audit).

_Design decisions:_ Sweep scope is the **live methodology corpus** — `system/**`, `reference/strategies/arc/**`,
`rules/**`, templates, methods, hooks — excluding `.arc/completed/**`, the historical `reference/supplemental/`
analysis & research records, ADRs, and other WUs' `backlog/` planning artifacts (incl. cohort docs), which
legitimately reference the (now-removed) patterns as historical or external context.

**Known-allowed survivors** (a non-empty grep on these is _not_ incomplete removal — leave them):
`strategy-work-planning.md:260` ("developer-agent pair" in the implementer/reviewer role-split — spec No-go);
`deactivate-work-unit.md:41` and `01_verify-and-configure.md:94` (legitimate cross-person / config "team mode"
references); `strategy-team-coordination.md` itself (survives, `team`-gated); `strategy-concurrent-work.md` (its
team-coord cross-refs are doc-level, verified valid).

### `[ ]` **5.1 Dangling-reference sweep across the live methodology corpus**

- _Goal:_ No live methodology surface references a removed section or the retired apparatus — a scoped repo-wide
  grep returns clean (zero hits **outside the known-allowed survivors above**).

    - `[ ]` **5.1.a Re-grep both trees** for `(@name)`, Personal Sub-Branches, Stacked PRs per Developer, concurrent
      pairs, developer-agent pair, and shared-meta concurrent-write across the in-scope surfaces; the only permitted
      hit is the allowlist (notably the single `developer-agent pair` at `strategy-work-planning.md:260`).

    - `[ ]` **5.1.b Confirm cross-references stay valid** — verify `strategy-concurrent-work.md`'s doc-level
      team-coord cross-refs (13, 353, 450) still resolve to surviving content (no edit expected), and that no other
      live doc links a removed team-coord section.

### `[ ]` **5.2 Adopter-facing leak + terminology check**

- _Goal:_ No adopter-facing doc names an unshipped WU; every "DRI" is expanded at first contact; the operative
  phrasing is "single owner" / "the owner".

    - `[ ]` **5.2.a Forward-pointer leak check** — grep the edited adopter-facing surfaces for an unshipped-WU name
      (`pr-decomposition`); confirm the seam wording stayed neutral.

    - `[ ]` **5.2.b Terminology check** — grep for bare "DRI" across adopter-facing surfaces; confirm each use is
      expanded at first contact in its doc.

### `[ ]` **5.3 Both-trees parity check**

- _Goal:_ Every edited file is changed in both trees; no Package-Project sync warning fires at commit.

    - `[ ]` **5.3.a Diff `.arc/**` against `packages/arc-framework/arc/**`** for each touched file; confirm parity
      and that counterparts are staged together.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` No live corpus surface (excluding `.arc/completed/**`) contains the `(@name)` convention or the within-WU
  multi-dev apparatus; a repo-wide grep over live surfaces returns clean.
- `[ ]` `strategy-team-coordination.md` reads as a coherent cross-person-only doc with no dangling reference to a
  removed section and no contradiction of `strategy-concurrent-work.md`'s single-owner framing.
- `[ ]` `DEV-RULES.ARC` § Task interlock states the interlock applies per single-owner WU, with no
  developer-agent-pair concurrency language.
- `[ ]` The meta `**Owner:**` field is documented as the single source of assignment truth; per-task `(@name)`
  markers are documented as retired.
- `[ ]` No adopter-facing doc uses "DRI" unexpanded; operative phrasing is "single owner" / "the owner".
- `[ ]` The welded PR-cardinality passages affirm one owner per WU while marking PR-count as a separable axis —
  neutrally, with no unshipped-WU name in adopter-facing text.
- `[ ]` The team-mode `(@name)` pre-commit check and its README documentation are removed; `lint:sh` and the hook
  tests pass.
- `[ ]` Every edited file is changed in both `.arc/` and `packages/arc-framework/arc/`; no Package-Project sync
  warning fires at commit.
- `[ ]` All Tier-1 quality gates pass (`lint:md`, `lint:sh`, and any touched-code gates).
- `[ ]` Ready for integration.
