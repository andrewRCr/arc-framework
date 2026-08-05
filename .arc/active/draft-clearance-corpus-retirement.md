# Draft: clearance-corpus-retirement

- **Origin:** [internal] — split from `merge-readiness-control` at its task-generation scale check.
- **Purpose:** Retire the `arc-cleared` documentation surface from the corpus once its mechanism is gone —
  the setup workflow and merge-gate template, the retained merge-gate surfaces' cross-references, the
  initial-setup offer, the doctrine and overview rewords, and the install-manifest entries that track them.

---

## Context

`merge-readiness-control` (shipped) replaced the `arc-cleared` required-status merge gate with a draft-first
pull-request lifecycle driven by `arc merge lock` verbs, and removed the required-status producer, this
repository's CI clearance workflow, and the base-branch requirement on the status. It deliberately left the
**documentation** surface standing.

The split is by review burden. A single change set ran past this project's pull-request size target; the
mechanism half carries essentially all of the review burden, while this half is largely whole-file deletion and
prose. The seam was forced rather than chosen — the `arc-cleared` required status is produced by the repository
dispatch inside the retired unlock path, so removing that dispatch and dropping the required check had to land
together or every pull request would block on a context no producer would ever post. That welded the CLI
retirement to the host cutover and left the documentation surface as the only separable half.

**Entry state (re-verified after merging `main`, 2026-08-05):** nothing produces or requires `arc-cleared`
anymore — no `.github/workflows/arc-clearance.yml`; this repo runs `merge.lock: draft` with `merge-ok` as the
sole required check; the auto-merge lane's extracted attestation lives in `arc-lane-attestation.yml`. What
remains is text describing machinery that no longer exists, plus the recipe and manifest entries tracking the
files that text lives in.

## Scope

Package source and `.arc/` copies both, per the package-project sync rule. Historical records (`completed/**`)
untouched throughout.

1. **Retire outright:** `setup-arc-clearance.md`; the `arc-clearance.yml` merge-gate template; the
   `merge-gate/README.md` coverage of both.
2. **Retain, excise references:** `setup-merge-gate.md` — the auto-merge lane survives unchanged; only its two
   `arc-cleared` cross-references go. The merge-gate `CODEOWNERS` template comment naming the required
   `arc-cleared` context (and this repo's `.github/CODEOWNERS` copy) reword.
3. **Replace the offer — config opt-in, not a new setup workflow:** the two **ARC merge guard** choices in
   `01_verify-and-configure.md` currently point at Set Up ARC Clearance. Replace them with a `merge.lock` opt-in:
   set `merge.lock: draft` (or leave `none`) in project config / the shipped template default, and rely on the
   existing `arc merge lock` verbs plus ADR-031 / work-organization doctrine for semantics. **Do not invent a
   parallel `setup-merge-lock.md` install ceremony** — the key is already registered in the config catalog and
   shipped in the template; installation is a config choice, not a host-workflow install path.
4. **Doctrine and overview rewords:** `strategy-work-organization.md` (auto-merge lane doctrine's clearance
   mentions); `TECHNICAL-OVERVIEW.md` (§ Self-Hosting Review Gate and § Infrastructure — Merge gating describe
   `arc-cleared` in present tense); plus the loci that assert host-side structural enforcement without naming
   `arc-cleared` — `AGENT-BRIEF.ARC.md` (an `[invariant]`), `strategy-session-operations.md` § Review
   enforcement boundary, and `standard-review.md` (and the sibling frontline/self-review sentences the
   pr-open tests pin).

    **Reword constraint:** do not equate the two families — a required check is repo-configured and
    fail-closed, draft state is a per-PR structural lock whose installation is procedural — and the "never
    infer merge safety from agent-layer discipline" caution must survive every reword.

5. **Historical records (retain, no relitigation):** `analysis-arc-clearance-activation.md` retains as a
   historical record, banner-marked as retired machinery; the coupling-audit corpus manifest
   (`packages/arc-framework/audits/coupling-blast-radius/manifest.json`, which lists the deleted
   `arc-clearance.yml`) is digest-pinned historical audit input — retain untouched.
6. **Installed script — keep (closed):** `confirm-live-change-pair.sh` stays. Live consumer is
   `.github/workflows/arc-lane-attestation.yml` (the auto-merge lane's extracted attestation gate from
   `merge-readiness-control`), which shells the script on the planning arm. The gate's context is observational
   rather than required — `main` requires `merge-ok` alone — so the script is not a merge blocker, but removing
   it still breaks attestation. Keep the script, its unit test, the `LIVE_PAIR_SCRIPT` test-helper export, and
   the recipe / manifest entries that install it.
7. **Recipe and manifests:** `init-recipe.json` drops the `arc-clearance.yml` template and the
   `setup-arc-clearance.md` entry; **retain** `confirm-live-change-pair.sh`.
   `system/.internal/manifest.json` and the scripts `README.md` entries regenerate or excise with the file
   removals only.
8. **Coupled test updates** (broader than the original list — re-scanned post-`main` merge):

    - `pr-open-extensions.test.ts` — TECHNICAL-OVERVIEW's `arc-cleared` sentence and the "structurally enforces
      merge safety" / frontline-self-review pins update with the item-4 rewords.
    - `review-gate-workflows.test.ts` — several blocks still treat clearance as a **shipped** asset:
      setup/README/CODEOWNERS prose pins on `arc-cleared`; the whole "ships an installable clearance workflow"
      case (template + setup + recipe membership + template `arc-cleared` contexts); the "keeps clearance setup
      additive…" case; the byte-identical host-policy asset list (drop `arc-clearance.yml` and
      `setup-arc-clearance.md` from the path set; keep `confirm-live-change-pair.sh` and `setup-merge-gate.md`);
      and the initial-setup offer assertion that names `setup-arc-clearance.md` / "ARC merge guard". Invert or
      retire presence expectations; reword residual prose pins with the docs.
    - `init.e2e.test.ts` — verify the existing absence assertion still holds after the removals.

## Out of scope

- **Coordination note (not this work unit's edit surface):** backlog stubs referencing `arc-cleared`
  (`recovery-hardening`, the `review-protocol-alignment` and `decompose-transform-integrity` cohorts) re-ground
  at their own grooming.
- **False positives (retain untouched):** `session-recover.md` ("clearance" in the generic sense),
  `close-occupancy.ts` (errand-occupancy clearance), and the lane classifier's "planning clearance" surfaces
  (`cli.ts` classify description, `change-facts.ts`).
- **Mechanism / host cutover:** already shipped by `merge-readiness-control` (CLI verbs, producer removal,
  classic protection retirement, lane attestation extraction, `merge.lock` registration).
- **USER-INBOX absorbs:** none targeted at this work unit. Captures from the mechanism WU (CI double-run under
  draft flip, config-test key-count churn, park/resume open unlocked, etc.) stay on their own homes.

## Success signal

`grep -riE "arc.cleared|arc.clearance"` over the corpus returns only historical records (`completed/**`, the
banner-marked analysis record, the digest-pinned coupling-audit manifest), ADR text, backlog planning artifacts
that re-ground at their own grooming, and this work unit's own active artifacts — no live workflow, template,
CI, ruleset, or CLI surface. `confirm-live-change-pair.sh` and lane attestation remain. All quality gates green.

## Resolved (planning)

- **Script consumer:** keep `confirm-live-change-pair.sh` — live consumer is `arc-lane-attestation.yml`.
- **Offer shape:** `merge.lock` config opt-in only; no new setup-workflow install path.
- **Class:** `Light` — whole-file deletion + constrained prose + test retarget; no mechanism design.
- **Inbox:** no entries to absorb into this draft.

## Open questions

The exact wording of the item-4 doctrine rewords settles at implementation, inside the recorded constraint.

---
