# Spec (`outline`): clearance-corpus-retirement

- **Origin:** [internal]

- **Purpose:** Retire the live `arc-cleared` documentation and install surface now that
  `merge-readiness-control` has removed the mechanism — so the corpus no longer describes, offers, or
  ships a required-status gate that does not exist.

---

## Problem / Context

`merge-readiness-control` replaced the `arc-cleared` required-status merge gate with a draft-first
pull-request lifecycle (`merge.lock` + `arc merge lock` verbs). It removed the producer, this repository's
clearance CI workflow, and the base-branch requirement on that status. The **documentation and install**
half was deferred on purpose: a single change set overran this project's PR size target; the mechanism half
carried the review burden; the seam was forced because producer removal and required-check removal had to
land together.

That mechanism half has shipped. Entry state (re-verified on `main`-merged tip, 2026-08-05): nothing
produces or requires `arc-cleared`; this repo uses `merge.lock: draft` with `merge-ok` as the sole required
check; lane attestation lives in `arc-lane-attestation.yml`. What remains is present-tense text, an installable
setup workflow, a merge-gate template, recipe/manifest entries, and tests that still treat clearance as a
shipped asset — all describing machinery that is gone.

## Decision(s)

1. **Whole-file retirement of the clearance install path.** Delete `setup-arc-clearance.md` and the
   `arc-clearance.yml` merge-gate template, and remove the `merge-gate/README.md` coverage of both.
   Package source and `.arc/` mirrors both, per package-project sync.

2. **Retain auto-merge setup; excise clearance cross-references only.** `setup-merge-gate.md` and the
   auto-merge lane stay. Drop its `arc-cleared` cross-references. Reword the merge-gate `CODEOWNERS` template
   comment (and this repo's `.github/CODEOWNERS` copy) that still names a required `arc-cleared` context.

3. **Replace the initial-setup offer with a config opt-in — no new setup workflow.** In
   `01_verify-and-configure.md`, replace both **ARC merge guard** choices that point at Set Up ARC Clearance
   with a `merge.lock` opt-in: set `merge.lock: draft` (or leave `none`) in project config / the shipped
   template default, and rely on existing `arc merge lock` verbs plus ADR-031 / work-organization doctrine for
   semantics. Also reword or drop the sibling Planning auto-merge sentence that still claims "the independently
   selectable merge guard adds structural host enforcement" without naming the clearance setup — after the
   dedicated offer is removed it is an orphan residual. Do **not** invent a parallel `setup-merge-lock.md`
   install ceremony.

4. **Doctrine and overview rewords under a fixed constraint.** Update present-tense `arc-cleared` coverage in
   `strategy-work-organization.md` and `TECHNICAL-OVERVIEW.md` (§ Self-Hosting Review Gate and § Infrastructure
   — Merge gating). Update the host-side structural-enforcement loci that do not name `arc-cleared` but still
   read as the old required-status world — `AGENT-BRIEF.ARC.md` (an `[invariant]`),
   `strategy-session-operations.md` § Review enforcement boundary, `standard-review.md`, and the sibling
   frontline/self-review sentences tests pin.

   **Constraint:** do not equate a required check (repo-configured, fail-closed) with draft-state lock
   (per-PR structural hold whose installation is procedural). The "never infer merge safety from agent-layer
   discipline" caution must survive every reword.

5. **Keep `confirm-live-change-pair.sh`; reword its install-doc blurb.** Live consumer is
   `.github/workflows/arc-lane-attestation.yml` (the extracted attestation gate from
   `merge-readiness-control`). Keep the script, its unit test, the `LIVE_PAIR_SCRIPT` test helper, and
   recipe/manifest install entries. Removing it would break attestation, not the required merge path (`main`
   requires `merge-ok` alone). The scripts `README.md` entry currently says "Refuse clearance publication
   unless…" — reword that blurb to the live-pair / lane-attestation role so a retained install surface does not
   still narrate the retired publish path.

6. **Recipe and manifests track file retirement; retained entries stay truthful.** `init-recipe.json` drops
   `arc-clearance.yml` and `setup-arc-clearance.md`; retains `confirm-live-change-pair.sh`. Regenerate or
   excise `system/.internal/manifest.json` entries for removed files. Scripts `README.md` loses deleted-file
   rows and updates the retained live-pair blurb per decision 5 — not deletions-only.

7. **Retarget coupled tests with the docs, not as a separate design pass.** Update or retire pins in:

    - `pr-open-extensions.test.ts` — TECHNICAL-OVERVIEW and structural-enforcement / frontline-self-review
      sentences.
    - `review-gate-workflows.test.ts` — prose pins on setup/README/CODEOWNERS; the "ships an installable
      clearance workflow" case; the "keeps clearance setup additive…" case; the byte-identical host-policy
      asset list (drop clearance template + setup from the path set; keep live-pair script and
      `setup-merge-gate.md`); and the initial-setup offer assertion naming `setup-arc-clearance.md` / "ARC
      merge guard".
    - `init.e2e.test.ts` — confirm the existing absence assertion still holds after removals.

8. **Historical retain, no relitigation.** Banner-mark `analysis-arc-clearance-activation.md` as retired
   machinery. Leave `completed/**` and ADR text that records the displacement (ADR-029 amendment, ADR-031)
   alone. Coupling-audit tip artifacts (`packages/arc-framework/audits/coupling-blast-radius/manifest.json`,
   `routing-ledger.json`, README) are **live inventory**, not a residual `arc-cleared` allowlist — tip
   `manifest.json` does not list `arc-clearance.yml`. The digest-pinned historical scan corpus is
   `scan-result.json` (off tip, retrievable from history); do not invent residual-grep exemptions for it, and
   do not treat tip audit inputs as clearance history.

## Scope boundary (No-gos)

- **No mechanism work.** CLI verbs, producer removal, classic protection retirement, lane-attestation
  extraction, and `merge.lock` registration already shipped in `merge-readiness-control`.
- **No new merge-lock install workflow** and no host cutover ceremony beyond docs/config guidance.
- **No edit of historical records** under `completed/**`, or ADRs beyond what rewording present-tense live
  surfaces requires (ADRs that already amend/displace clearance stay as history). No re-litigation of the
  coupling-audit historical scan corpus (off-tip `scan-result.json`).
- **No backlog re-grounding here.** Stubs that still speak of `arc-cleared` in present tense
  (`recovery-hardening`, `review-protocol-alignment`, `decompose-transform-integrity` cohort notes) re-ground
  at their own grooming.
- **No false-positive renames.** `session-recover.md` ("clearance" in the generic sense),
  `close-occupancy.ts` (errand-occupancy clearance), and lane-classifier "planning clearance" surfaces stay.
- **No USER-INBOX absorbs into this WU.** Mechanism-follow-up captures from MRC stay on their own homes.

## Consequences & Risks

- **Adopter-facing truthfulness improves immediately:** new installs no longer offer a dead required-status
  path; doctrine matches the draft-lock model.
- **Test surface is the main failure mode:** several integration cases still assert clearance is shipped.
  Incomplete retarget will red at T2/T3 even if docs look clean. Inventory those cases in the task list; do
  not treat them as afterthoughts.
- **Reword risk:** equating draft lock with a required check would mis-teach the new model. The recorded
  constraint is the mitigation; exact prose settles in implementation inside that constraint.
- **Base freshness:** implementation should run on a tip that includes shipped MRC (this branch has merged
  `main`); residual greps are the acceptance check, not memory of the pre-ship inventory.
- **Tradeoff accepted:** interim untidiness between the two merges was preferred to one oversized PR; this
  WU closes that interim.

## Success Criteria

- `grep -riE "arc.cleared|arc.clearance"` over the corpus returns only historical records (`completed/**`,
  the banner-marked analysis record), ADR text, backlog planning artifacts that re-ground at their own
  grooming, and this work unit's own active/completed artifacts — no live workflow, template, CI, ruleset,
  recipe, install blurb, or CLI install surface. (Tip coupling-audit inputs are not an allowlist residual.)
- Scripts `README.md` describes `confirm-live-change-pair.sh` as live-pair / lane-attestation support, not
  clearance publication.
- `confirm-live-change-pair.sh` remains installed and referenced by lane attestation; recipe still ships it.
- `01_verify-and-configure.md` offers `merge.lock` config opt-in (or equivalent config guidance), does not
  point at Set Up ARC Clearance, and does not leave an orphan "independently selectable merge guard"
  structural-enforcement claim without an install path.
- Coupled tests above are green against the post-retirement corpus (presence cases inverted or removed;
  reword pins match the new prose).
- All quality gates green (relevance-narrowed: Markdown + ARC contract checks for docs; full suite when
  tests/recipe change).

## Open items

- Exact wording of the doctrine / overview rewords — settles during implementation inside the recorded
  constraint (not settle-able design left open; surface detail).

---
