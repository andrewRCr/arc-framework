# Spec (`outline`): single-owner-wu-model

- **Origin:** `[internal]` — the single-owner-WU-model half of the decomposed Concurrent Work Conventions concern;
  terminal member of the `concurrent-work-conventions` sub-cohort.

- **Purpose:** Reconcile ARC's constitutional docs to the **single-owner work unit** (one DRI — Directly
  Responsible Individual) model that `concurrent-work-doctrine` already operates on but never reconciled the
  lagging docs to. Remove the within-WU
  concurrent multi-developer apparatus and the `(@name)` convention across the live corpus, decoupling
  ownership-cardinality from PR-cardinality on contact so `pr-decomposition` has a clean seam.

---

## Problem / Context

A work unit is **single-owner** (one DRI). Cross-person parallelism is achieved by decomposing into N single-owner
WUs (cohort ≈ epic), **not** by multiple developers concurrently driving one WU's task list.
`concurrent-work-doctrine` shipped this framing and keys its overlap read on it —
`strategy-concurrent-work.md` already authored single-owner-as-operative-fact, the self/foreign asymmetry, and the
all-owner gate. But `strategy-team-coordination.md` still carries the within-WU multi-dev apparatus
(Personal-Sub-Branches, Stacked-PRs-per-Developer, shared-meta concurrent-write handling, "concurrent pairs on
different tasks" — also in `DEV-RULES.ARC` § Task interlock) plus the per-task `(@name)` ownership marker.

So the corpus carries a **live contradiction**, not merely redundancy: the doctrine asserts single-owner while
team-coordination still describes multiple developers concurrently driving one WU. This WU reconciles the lagging
docs to the model the doctrine already operates on. The asymmetry is already authored upstream — this WU neither
re-authors nor waits on it; the remaining work is deletion + reconciliation of load-bearing constitutional docs,
plus a corpus-coherence sweep so the removal is complete rather than doc-local.

## Decision(s)

1. **Single-owner WU (one DRI) is the operative model; reconcile the docs to it.** The meta `**Owner:**` field
   *is* the assignment — document it as the single source of assignment truth. Non-owner contribution happens via
   PR review (already first-class), pairing (synchronous, one driver, `Co-authored-by:` for credit — convention,
   no structure), and handoff (sequential owner *reassignment*). This WU does not re-author the self/foreign
   asymmetry or the all-owner gate (shipped in `strategy-concurrent-work.md`); where useful it points at the
   shipped doctrine rather than restating it.

2. **Remove the `(@name)` convention entirely.** With single-owner WUs the per-task marker has no remaining job;
   team-coord's own rationale ("git tracks authorship; duplicating adds maintenance burden") now argues against it
   in task lists too. Removal spans every live consumer (see Scope), including the team-mode pre-commit check that
   enforces it.

3. **Kill the within-WU concurrent multi-dev apparatus.** Remove Personal-Sub-Branches, Stacked-PRs-per-Developer,
   the shared-meta concurrent-write handling, and "concurrent pairs on different tasks" (`DEV-RULES.ARC`
   § Task interlock). The task interlock applies per single-owner WU, not per developer-agent pair within a WU.

4. **`strategy-team-coordination.md` survives as a gutted, cross-person-only doc** — not a thin reframe. Most of
   the doc is the apparatus being removed, but a genuine **cross-person** coordination residual remains (a
   different axis than `strategy-concurrent-work.md`, which is per-WU concurrency, owner-agnostic). Survivor
   boundary (leanings, line-by-line confirmable at execution):
    - **Keep + reframe:** Person-to-Person Handoff → sequential `Owner`-field reassignment (drop the `(@name)`
      reassignment step); Interlock-Release Coordination (per-developer release-wrapper/interlock asymmetry is
      genuine cross-person — strip the multi-dev-per-WU "concurrent pairs should pull" bits); Cross-WU Planning
      Dependencies (out-of-band coordination, cross-branch reads, explicit sequencing); External Tracker
      Integration (minus `(@name)`); Configuration Notes (`user.notes_push` team default); the Workflow
      Adaptations table (drop the "concurrent pairs OK" / "`(@name)` markers" rows).
    - **Remove → cross-ref:** the "Parallel WUs on independent branches" mechanics duplicate
      `strategy-concurrent-work.md` — drop the duplicate, point there.
    - **Leaning on the two flagged placement calls:** keep a thin cross-dev commit-visibility note *in*
      team-coord's Interlock-Release Coordination (don't fold into `strategy-concurrent-work.md`, which is
      owner-agnostic); keep External Tracker Integration *in* team-coord (it's the cross-person assignment-layer
      concern, not a work-organization concern). Both are detail-design, settled here, open to revision at review.
    - **Net framing:** team mode parallelizes via **multiple single-owner WUs across identities (worktrees)**, not
      multiple developers on one WU.

5. **Decouple ownership-cardinality from PR-cardinality in-place (minimal).** Where this WU must touch the
   single-owner rationale and it is welded to a one-PR-per-WU claim (`strategy-work-organization.md` § Cohorts ~:297
   and § Task Lists and Branches ~:459; `assess-cohort-fit.md` ~:83, :88), surgically split the two: affirm one
   *owner* per WU, treat PR-count-per-WU as a **separable axis** this WU does not settle. This leaves a clean seam
   for `pr-decomposition` (planned, P1: `1 WU = 1 branch, emitting ≥ 1 PR`) instead of re-hardening the one-PR
   claim under the single-owner banner. This WU does **not** build the multi-PR model.

6. **Decouple wording is audience-split.** In adopter-facing target docs (`strategy-work-organization.md`,
   `assess-cohort-fit.md`, and the `system/**` / `strategy/arc/**` surfaces) the seam stays **neutral** ("PR-count
   per WU is a distinct axis") — never naming an unshipped WU, per `DEV-RULES.PROJECT` § Audience Boundaries. In
   internal planning artifacts (this spec, the task list, notes) `pr-decomposition` is named explicitly as the
   record of *why* the seam exists.

7. **Own a corpus-coherence sweep.** As the terminal doc rewrite in the cohort, broaden the `(@name)`-removal
   blast-radius check into a general dangling-reference sweep: after the apparatus and marker are removed, verify
   nothing across the live corpus references the removed sections (`strategy-concurrent-work.md` cross-refs,
   `strategy-work-organization.md`, `assess-cohort-fit.md`, the session-init/session-handoff team-mode steps,
   `strategy-task-list-formatting.md`, `process-task-loop`/`generate-tasks` templates, the pre-commit hook +
   its README). `finalize-parallelism`'s audit is runtime-focused and won't catch doc drift.

8. **Terminology — "single owner" is operative; "DRI" is an expand-on-first-contact gloss.** Match the shipped
   doctrine (`strategy-concurrent-work.md` already uses "single owner," not jargon): the rewritten docs use
   "single owner" / "the owner" as the operative term and reserve "DRI" for where the singular-accountability
   nuance earns emphasis — and there, spell it out at first contact in that doc ("Directly Responsible Individual
   (DRI)"), never assuming reader familiarity. Fold the lone existing unexpanded use
   (`strategy-work-organization.md` ~:339, "No coordinator or DRI") into the coherence sweep.

## Scope boundary (No-gos)

- **Does not amend the `1 WU = 1 PR` invariant, add a `Deliverable` axis, or touch `generate-tasks` /
  the integration ceremony** — all `pr-decomposition` scope. This WU only stops the welded passages from
  re-hardening the one-PR claim; it never builds the multi-PR model.
- **Does not re-author the self/foreign asymmetry or the all-owner gate** — shipped in
  `strategy-concurrent-work.md`; this WU only ensures the docs it rewrites don't contradict them.
- **Does not remove team mode** — `team.mode` and its genuine cross-person coordination layer survive (gutted, not
  deleted). The removal targets within-WU multi-dev, not multi-WU-across-people.
- **Does not edit frozen records** under `.arc/completed/**` — historical WU artifacts keep their language.
- **Does not touch `strategy-work-planning.md` § implementer/reviewer role split** (~:260, "developer-agent pair
  normally holds both roles") — that is the role-split axis, not multi-dev ownership; reviewed, out of scope.

## Consequences & Risks

- **Two-copy discipline applies to every edit.** Each touched live file exists in both `.arc/` and
  `packages/arc-framework/arc/` (Package-Project Sync); methodology edits go through the package source and sync
  to `.arc/`. Mitigation: the pre-commit sync warnings catch a package counterpart left unstaged; the success
  criteria below assert both copies move together.
- **One code surface, not just prose.** Removing the team-mode `(@name)` pre-commit check means a shell-hook edit
  plus a README update, subject to Tier-1 shell quality gates (`lint:sh`/shellcheck) and the hook test suite —
  heavier than a pure doc change. Accepted: it is a direct consumer of the retired convention; leaving it would
  strand a dead check.
- **Untested at team scale.** The single-owner model is a conscious idiomatic + structural-fit bet (one branch =
  one author; parallelism = more branches/PRs, not more authors per branch), not field-proven. The one genuine
  shared-branch case (a feature too cohesive to split) is absorbed by the dichotomy: too-coupled-to-split → one
  WU, one owner, may pair; separable → multiple WUs. Accepted as documented posture, consistent with team-coord's
  existing "deliberate starting point, not a settled standard" framing.
- **Forward-compat seam, not a forward-pointer leak.** The neutral wording in adopter-facing docs must not name
  `pr-decomposition`; the risk is an accidental leak. Mitigation: audience-split is an explicit decision (6), and
  the corpus sweep re-checks adopter surfaces.
- **Vocabulary dividend.** Removing the multi-*developer* "Stacked PRs per Developer" section frees the "stacked
  PR" term for `pr-decomposition` to reclaim in the single-owner multi-*deliverable* sense — provided this WU does
  not simultaneously harden the work-org "not stacked PRs within a WU" rule (decision 5 ensures it doesn't).

## Success Criteria

- No live corpus surface (excluding `.arc/completed/**`) contains the `(@name)` convention or the within-WU
  multi-dev apparatus (Personal-Sub-Branches, Stacked-PRs-per-Developer, shared-meta concurrent-write handling,
  "concurrent pairs on different tasks"); a repo-wide grep over live surfaces returns clean.
- `strategy-team-coordination.md` reads as a coherent cross-person-only doc — handoff, interlock-release
  coordination, cross-WU planning dependencies, external tracker integration, config notes — with no dangling
  reference to a removed section and no contradiction of `strategy-concurrent-work.md`'s single-owner framing.
- `DEV-RULES.ARC` § Task interlock states the interlock applies per single-owner WU, with no developer-agent-pair
  concurrency language.
- The meta `**Owner:**` field is documented as the single source of assignment truth; per-task `(@name)` markers
  are documented as retired.
- No adopter-facing doc uses "DRI" unexpanded — the operative phrasing is "single owner" / "the owner," and any
  "DRI" is spelled out at first contact in its doc (the existing bare use at `strategy-work-organization.md`
  ~:339 included).
- The welded PR-cardinality passages (`strategy-work-organization.md` ~:297/:459; `assess-cohort-fit.md` ~:83/:88)
  affirm one owner per WU while marking PR-count as a separable axis — neutrally, with no unshipped-WU name in
  adopter-facing text.
- The team-mode `(@name)` pre-commit check and its README documentation are removed; `lint:sh` and the hook tests
  pass.
- Every edited file is changed in both `.arc/` and `packages/arc-framework/arc/`; no Package-Project sync warning
  fires at commit.
- All Tier-1 quality gates pass (`lint:md`, `lint:sh`, and any touched-code gates).

## Open items

- **team-coord survivor boundary, line-by-line.** The two placement calls in decision 4 (commit-visibility note
  location; External Tracker Integration home) are settled here as leanings; final line-by-line placement resolves
  during the rewrite and is confirmable at review without reopening design.
- **Exact `**Owner:**`-semantics edit sites.** Which doc(s) carry the authoritative "Owner is the single source of
  assignment truth" statement (meta template vs. team-coord vs. work-org) resolves at task generation against the
  grounded surfaces.
