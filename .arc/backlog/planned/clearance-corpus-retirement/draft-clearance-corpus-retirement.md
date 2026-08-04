# Draft: clearance-corpus-retirement

- **Origin:** [internal] — split from `merge-readiness-control` at its task-generation scale check.
- **Purpose:** Retire the `arc-cleared` documentation surface from the corpus once its mechanism is gone —
  the setup workflow and merge-gate template, the retained merge-gate surfaces' cross-references, the
  initial-setup offer, the doctrine and overview rewords, and the install-manifest entries that track them.

---

## Context

`merge-readiness-control` replaces the `arc-cleared` required-status merge gate with a draft-first pull-request
lifecycle driven by `arc merge lock` verbs, and removes the required-status producer, this repository's CI
workflow, and the base-branch requirement on the status. It deliberately leaves the **documentation** surface standing.

The split is by review burden. A single change set ran past this project's pull-request size target; the
mechanism half carries essentially all of the review burden, while this half is largely whole-file deletion and
prose. The seam was forced rather than chosen — the `arc-cleared` required status is produced by the repository
dispatch inside the retired unlock path, so removing that dispatch and dropping the required check had to land
together or every pull request would block on a context no producer would ever post. That welded the CLI
retirement to the host cutover and left the documentation surface as the only separable half.

**Entry state.** Nothing produces or requires `arc-cleared` any more. What remains is text describing machinery
that no longer exists, plus the recipe and manifest entries tracking the files that text lives in.

## Scope

Package source and `.arc/` copies both, per the package-project sync rule. Historical records (`completed/**`)
untouched throughout.

1. **Retire outright:** `setup-arc-clearance.md`; the `arc-clearance.yml` merge-gate template; the
   `merge-gate/README.md` coverage of both.
2. **Retain, excise references:** `setup-merge-gate.md` — the auto-merge lane survives unchanged; only its two
   `arc-cleared` cross-references go. The merge-gate `CODEOWNERS` template comment naming the required
   `arc-cleared` context (and this repo's `.github/CODEOWNERS` copy) reword.
3. **Replace the offer:** the `01_verify-and-configure.md` clearance offer becomes the `merge.lock` opt-in.
   The key already exists by then — registered in the config catalog, shipped in the template.
4. **Doctrine and overview rewords:** `strategy-work-organization.md` (auto-merge lane doctrine's clearance
   mentions); `TECHNICAL-OVERVIEW.md` (§ Self-Hosting Review Gate and § Infrastructure — Merge gating describe
   `arc-cleared` in present tense); plus three loci that assert "only a configured required host-side check
   structurally enforces merge safety" without naming `arc-cleared` — `AGENT-BRIEF.ARC.md` (an `[invariant]`),
   `strategy-session-operations.md` § Review enforcement boundary, and `standard-review.md`.

    **Reword constraint:** do not equate the two families — a required check is repo-configured and
    fail-closed, draft state is a per-PR structural lock whose installation is procedural — and the "never
    infer merge safety from agent-layer discipline" caution must survive every reword.

5. **Historical records (retain, no relitigation):** `analysis-arc-clearance-activation.md` retains as a
   historical record, banner-marked as retired machinery; the coupling-audit corpus manifest
   (`packages/arc-framework/audits/coupling-blast-radius/manifest.json`, which lists the deleted
   `arc-clearance.yml`) is digest-pinned historical audit input — retain untouched.
6. **Installed script — check before removing:** `confirm-live-change-pair.sh` was originally scoped here as
   consumed only by the clearance workflow. `merge-readiness-control` falsifies that: the auto-merge lane's
   extracted attestation gate still shells out to it, and that gate's context is a required base-branch check,
   so removing the script would fail a required check on every planning-lane pull request. Confirm the live
   consumer set before touching it; if the gate still uses it, the script and its unit test stay and only the
   `LIVE_PAIR_SCRIPT` export question remains open.
7. **Recipe and manifests:** `init-recipe.json` drops the `arc-clearance.yml` template and the
   `setup-arc-clearance.md` entry — and the `confirm-live-change-pair.sh` entry only if item 6 clears it;
   `system/.internal/manifest.json` and the scripts `README.md` entries regenerate or excise with the file
   removals.
8. **Coupled test updates:** `pr-open-extensions.test.ts` assertions on TECHNICAL-OVERVIEW's `arc-cleared`
   sentence and on the doctrine sentence "Only a configured required host-side check structurally enforces
   merge safety" update with the item-4 rewords; verify `init.e2e.test.ts`'s absence assertion still holds
   after the removals.

## Out of scope

- **Coordination note (not this work unit's edit surface):** backlog stubs referencing `arc-cleared`
  (`recovery-hardening`, the `review-protocol-alignment` and `decompose-transform-integrity` cohorts) re-ground
  at their own grooming.
- **False positives (retain untouched):** `session-recover.md` ("clearance" in the generic sense),
  `close-occupancy.ts` (errand-occupancy clearance), and the lane classifier's "planning clearance" surfaces
  (`cli.ts` classify description, `change-facts.ts`).

## Success signal

`grep -riE "arc.cleared|arc.clearance"` over the corpus returns only historical records (`completed/**`, the
banner-marked analysis record, the digest-pinned coupling-audit manifest), ADR text, backlog planning artifacts
that re-ground at their own grooming, and this work unit's own active artifacts — no live workflow, template,
CI, ruleset, or CLI surface. All quality gates green.

## Open questions

The exact wording of the item-4 doctrine rewords settles at implementation, inside the recorded constraint.

---
