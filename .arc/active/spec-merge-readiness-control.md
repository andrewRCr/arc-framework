# Spec (`detailed` · `RFC`): merge-readiness-control

- **Origin:** [internal]

- **Purpose:** Replace the `arc-cleared` required-status merge gate with a draft-first pull-request lifecycle as
  ARC's host-side merge-readiness control — an opt-in config axis (`merge.lock: draft | none`) needing zero
  host-side setup — and retire the `arc-cleared` machinery from the corpus.

---

## Introduction / Context

`arc-cleared` guards against an agent or human accidentally merging a pull request that ARC has not declared
ready. The threat model is settled: the control defends against **accidental** premature merge by a human or an
agent operating with the maintainer's authority — not a hostile status writer.

The `decompose-planning-lane` verification exposed a producer-identity limit: a required status can bind to the
GitHub Actions App family but not to one exact workflow, and closing that gap (a dedicated App or an
organization-level required-workflow adapter) is disproportionate to the accidental-action threat. The required
status also under-delivers its own goal under common default configurations: it rides on branch protection, so
the admin actor class — which here includes every agent using the maintainer's token — can bypass it in one
accidental flag (`gh pr merge --admin`). An enforce-admins / no-bypass ruleset closes that flag at its own
ceremony cost, so the bypass is configuration-conditional; the case against the family rests on proportionality
and setup cost. Draft state, by contrast, has no merge-side override at all — unlock is a separate deliberate
verb.

Under ARC's lifecycle the reframe is exact: the draft window hosts agentic review (frontline plus hosted
providers, all explicitly requested and all draft-compatible), finding triage, composition, and base
reconciliation. Removing draft then _is_ "ready for review" in the human sense — CODEOWNERS routing fires at
that moment rather than at PR-open. The solo flow degenerates cleanly: the ready flip happens at merge
authorization and the unlocked window is momentary.

## Goals

1. A work-unit integration PR is structurally unmergeable by any single accidental act (UI click,
   `gh pr merge`, even `--admin`) from open through review, triage, and composition — until the authorized
   terminal sequence in solo flow, and to the review handoff in team flow (the D5 coverage boundary).
2. The control requires zero host-side setup — no workflow, no required check, no ruleset — and is pure config
   to enable.
3. All `arc-cleared` machinery is retired from the corpus (setup workflow, template, CI workflow, ruleset
   check, CLI code paths); historical records exempt.
4. Exact-head merge authorization survives unchanged as an independent invariant, regardless of which host
   control is selected.
5. ARC's platform-agnostic posture is preserved: the control is a config axis with a `none` degenerate mode,
   and host verbs stay behind the single seam they already occupy.

## Non-Goals

- Defending against a hostile status writer or compromised credentials — out of the settled threat model.
- Host adapters for GitLab / Gitea / Forgejo / Bitbucket — draft-family portability is recorded, not built.
- Detection machinery for out-of-lane PRs — the fail-open installation boundary is accepted and priced (§
  Proposed Design D5).
- Changing the auto-merge grooming lane — its control shape (classifier gate, `--match-head-commit` arming,
  repo auto-merge setting) survives unchanged.
- Restructuring `integrate-work-unit.md` / `run-errand.md` — this WU performs only the minimal substitution
  (clearance steps out, abstract D3 touchpoint references in); deeper concrete mechanics land with the owning
  restructure work units (§ Cross-cutting → Coordination).
- Closing the team-flow post-approval, pre-authorization residual — deliberately narrowed versus `arc-cleared`
  and bound by the exact-head invariant plus explicit merge authorization (§ Proposed Design D5).

## Proposed Design

### D1. Mechanism — draft-first lifecycle

Verified mechanics (sourced research pass plus fixture PR #442, 2026-08-03):

- Draft is the only native per-PR merge lock GitHub offers; rulesets carry no label-conditioned or manual
  per-PR merge gate as of mid-2026.
- The block is enforced identically across web UI, `gh pr merge`, and REST/GraphQL, and is not
  admin-bypassable — stronger than a required-check scheme under default configurations.
- Review requests (including CODEOWNERS auto-requests) are suppressed while draft and fire at
  ready-for-review.
- Auto-merge cannot be armed while a PR is draft.
- `gh pr ready` / `gh pr ready --undo` flip the state both ways; `ready_for_review` and `converted_to_draft`
  are distinct webhook actions usable as CI triggers.
- Draft-as-hold is standard practice: GitHub's docs read draft as not ready "for a detailed code review or
  merge"; GitLab defines Draft explicitly as a merge block.
- Provider behavior: `@codex review` works on drafts (verified live); CodeRabbit manual invocation works on
  drafts (known-working) and its auto-review skips drafts by default; Copilot review requests on drafts are
  documented. With auto-review disabled — this project's posture — nothing fires at the ready flip.

### D2. Config axis — `merge.lock`

- Key: `merge.lock: draft | none`, default `none` at install. Rides the existing `merge.*` group in
  `arc-config.yml` beside `merge.strategy`.
- Project-only, runtime setting: workflows and the agent read it; changing it is a direct config edit, no
  reconfigure.
- `draft` enables the draft-first lifecycle for lock-bearing lanes (D3). Enabling is pure config — the
  mechanism needs no host-side machinery.
- `none` is the degenerate mode: interlocks plus harness permissions only, for hosts without a draft state and
  for the unverified Free-plan-private-repo residual.
- Implementation footprint (additive): register the key in the agent-consumable config catalog
  (`src/lib/config/schema.ts`, enum `draft | none`, default `none`) so `arc config status` exposes it and
  `arc config validate` accepts it; ship the key in the `arc-config.yml` template (package source and `.arc/`
  copies per the sync rule); document the axis in `strategy-configurability-architecture.md` (project-only
  `merge.*` classification, runtime-settings list); tests ride the existing config-field coverage.

### D3. Lifecycle touchpoints (abstract)

The lock's workflow surface is four abstract touchpoints plus one transition, specified here as the contract
the lifecycle workflows implement; beyond D6.4's minimal substitution, concrete-mechanics edits to
`integrate-work-unit.md` / `run-errand.md` sequence against their owning restructure work units.

- **draft-open** — lock-bearing lanes open PRs as draft: work-unit integration PRs, and Errand PRs expecting a
  routed review. Create-and-land grooming PRs (the auto-merge lane) never open as draft.
- **provenance-update** — the PR-body provenance update (review passes run, finding counts, triage identity)
  lands **before** the ready flip, so a human reviewer opens onto a complete "what has been done" view.
- **ready-flip** — the flip always rides an existing gate, never floats free. Solo flow: the agent executes
  `gh pr ready` plus the exact-head merge as one terminal sequence inside explicit merge authorization. Team
  flow: the flip is the review handoff, executed after the provenance update at the agentic-triage-complete
  boundary, riding the triage disposition approval.
- **re-lock** — `gh pr ready --undo` re-locks when review surfaces findings after a flip.
- **re-lock-on-escalation** — the lane classifier runs after review settles and planning→reviewed escalation
  is one-way, so an escalated PR converts to draft at escalation.

### D4. Terminal sequence — auto-merge never composed

Native auto-merge survives new pushes from write-permission actors, and `--match-head-commit` guards arming
time, not merge time — structurally incompatible with exact-head authorization. The work-unit integration lane
therefore never arms auto-merge: the terminal sequence is ready flip → immediate direct
`gh pr merge --match-head-commit <authorized-sha>`, keeping the unlocked window to seconds and
exact-head-guarded throughout. Auto-merge remains the grooming lane's tool, governed by its classifier gate.

### D5. Boundaries — accepted and priced

- **Lock coverage.** Draft's guarantee ends at the ready flip. Solo flow: the flip is inside the terminal
  sequence, so coverage runs to merge authorization. Team flow: the flip is the review handoff —
  required-approvals cover the human-review window, and the post-approval, pre-authorization residual is open.
  Deliberate narrowing versus `arc-cleared` (which re-locked on every push and unlocked only at the final
  interlock): the trade buys zero setup and no producer machinery for a residual the exact-head invariant plus
  explicit merge authorization already bound. A team wanting lock-to-authorization holds draft through human
  review — a posture, not a shipped variant; manual review routing is its cost.
- **Installation.** The lock exists only where the opening act performed draft-open — per-PR and procedural,
  so it fails open: a hand-opened PR, a PR opened by a non-ARC agent, or an Errand whose lane prediction
  missed carries no lock. `arc-cleared` failed closed repo-wide. The pricing: the uncovered class requires two
  independent lapses (a mis-opened PR **and** an accidental merge act) where `arc-cleared` bounded it to one.
  Accepted per the accidental threat model; no detection machinery is added.

### D6. Retirement footprint — docs and workflows

Package source and `.arc/` copies both, per the package-project sync rule. Historical records
(`completed/**`) untouched throughout.

1. **Retire outright:** `setup-arc-clearance.md`; the `arc-clearance.yml` merge-gate template; the
   `merge-gate/README.md` coverage of both.
2. **Retain, excise references:** `setup-merge-gate.md` — the auto-merge lane survives unchanged; only its two
   `arc-cleared` cross-references go. The merge-gate `CODEOWNERS` template comment naming the required
   `arc-cleared` context (and this repo's `.github/CODEOWNERS` copy) reword.
3. **Replace the offer:** `01_verify-and-configure.md` clearance offer becomes the `merge.lock` opt-in.
4. **Abstract touchpoints (minimal substitution):** `run-errand.md` / `integrate-work-unit.md` clearance steps
   are replaced with the D3 touchpoints in their abstract form — enough that no live surface references retired
   machinery, no more; concrete mechanics sequence to the owning restructure work units per § Cross-cutting →
   Coordination.
5. **Doctrine and overview rewords:** `strategy-work-organization.md` (auto-merge lane doctrine's clearance
   mentions); `TECHNICAL-OVERVIEW.md` (§ Self-Hosting Review Gate and § Infrastructure — Merge gating describe
   `arc-cleared` in present tense); plus three loci that assert "only a configured required host-side check
   structurally enforces merge safety" without naming `arc-cleared` — `AGENT-BRIEF.ARC.md` (an `[invariant]`),
   `strategy-session-operations.md` § Review enforcement boundary, and `standard-review.md`. Reword constraint:
   do not equate the two families — a required check is repo-configured and fail-closed, draft state is a
   per-PR structural lock whose installation is procedural — and the "never infer merge safety from
   agent-layer discipline" caution must survive.
6. **Historical records (retain, no relitigation):** `analysis-arc-clearance-activation.md` retains as
   historical record, banner-marked as retired machinery; the coupling-audit corpus manifest
   (`packages/arc-framework/audits/coupling-blast-radius/manifest.json`, which lists the deleted
   `arc-clearance.yml`) is digest-pinned historical audit input — retain untouched.
7. **Manifests:** `system/.internal/manifest.json` and the scripts `README.md` entries regenerate/excise with
   the file removals.
8. **Coordination note (not this WU's edit surface):** backlog stubs referencing `arc-cleared`
   (`recovery-hardening`, the `review-protocol-alignment` and `decompose-transform-integrity` cohorts)
   re-ground at their own grooming.
9. **False positives (retain untouched):** `session-recover.md` ("clearance" in the generic sense),
   `close-occupancy.ts` (errand-occupancy clearance), and the lane classifier's "planning clearance" surfaces
   (`cli.ts` classify description, `change-facts.ts`).

### D7. Retirement footprint — CLI and this repo's install

1. **Wholly removed:** the `arc review unlock` command (`src/cli.ts`); `src/scripts/review-gate/unlock.ts` and
   `src/scripts/review-gate/hosts/github/unlock.ts`; the unlock handler portion of `src/handlers/review.ts`;
   their unit tests; the `clearance-status-history.json` fixture; `confirm-live-change-pair.sh` (consumed only
   by the clearance workflow) with its unit test and README/manifest entries; the dangling `LIVE_PAIR_SCRIPT`
   export in `__tests__/helpers/run-script.ts` (its sole consumer is the removed unit test; the rest of the
   helper stays).
2. **Retained files, excise entries:** `src/scripts/review-gate/core/review-command-envelope.ts` — the
   `review-unlock` mode-enum entry, the `ReviewUnlockEnvelopeSchema` import, and the `review-unlock-envelope`
   registration; `src/lib/handoff-critical.ts` — the `review`/`unlock` handoff-critical rule and its
   module-comment mention, with the matching `handoff-critical.test.ts` assertion.
3. **Test excisions and updates:** `review-gate-workflows.test.ts` lock/unlock flow coverage (the largest
   single excision); `review-cli-surfaces.test.ts`, `review-schema-registration.test.ts`,
   `kernel/schema-generation.test.ts`, and `schema-artifact.e2e.test.ts` `review-unlock` references; the
   `handleReviewUnlock` import and describe block in `unit/handlers/review.test.ts` (partial excision);
   `review-driver-lifecycle.test.ts` assertion that `integrate-work-unit.md` contains `arc review unlock`
   (updates with the D6.4 substitution); `pr-open-extensions.test.ts` assertions on TECHNICAL-OVERVIEW's
   `arc-cleared` sentence and on the doctrine sentence "Only a configured required host-side check
   structurally enforces merge safety" (both update with the D6.5 rewords); `init.e2e.test.ts` absence
   assertion (verify it still holds after removals).
4. **Recipe:** `init-recipe.json` drops the `arc-clearance.yml` template and `setup-arc-clearance.md` entries
   (and `confirm-live-change-pair.sh` if listed).
5. **This repo's host-side teardown (dogfooding install):** delete `.github/workflows/arc-clearance.yml`; drop
   the `arc-cleared` required check from the base-branch ruleset (host-side act); set `merge.lock: draft` in
   this repo's `arc-config.yml`.

### D8. ADR record

- **ADR-031** records the draft-first merge-readiness decision: threat model, alternatives weighed, the
  narrowed boundaries as priced trades, and the config axis. Context references ADR-029.
- **ADR-029** takes a dated Tier-2 amendment cross-referencing ADR-031: Decision #4's mechanism (the
  `arc-cleared` thin lifecycle lock) is displaced by the draft-first lifecycle; the authority division
  (Decisions #1–3, #5) stands unchanged.

## Alternatives & Rationale

- **Retain / narrow `arc-cleared` (required status):** bespoke producer, per-repo setup ceremony, an unlock
  surface, and admin-bypassable under default configurations — costlier than draft against the actual threat.
  Its two superior properties are honestly recorded: automatic push re-lock with coverage to the final
  interlock, and fail-closed repo-wide installation. Rejected as the default on proportionality.
- **Label + required check (`do-not-merge` + enforcing workflow):** the industry's other idiom (Prow `/hold`,
  required-label actions, Mergify conditions). Same machinery family as `arc-cleared` with a commoditized
  producer; same bypass and setup costs. Not shipped; documented as the alternative for teams needing passive
  review-request routing during the locked window.
- **No lock (interlocks + harness permissions only):** relies on agent-side discipline alone — the
  accidental-merge residue this work unit exists to close. Remains the `none` degenerate mode.

No third native mechanism exists to evaluate: GitHub offers no label-based or manual per-PR merge gate, and
"lock branch" is a whole-branch read-only control, not a per-PR lock.

## Cross-cutting Considerations

- **Security / trust boundary:** the control is scoped to the accidental-action threat; it grants no new
  authority and removes an admin-bypassable surface. Exact-head authorization remains the invariant guarding
  what merges.
- **Portability:** draft-family is the most portable candidate — GitLab blocks merge on Draft natively,
  Gitea / Forgejo block via the WIP title prefix; a required-status producer is per-host bespoke wiring by
  comparison. Bitbucket draft behavior unverified. No host adapters built; host verbs stay behind their
  existing seam.
- **Testing:** CLI removals ride the existing three-tier suite; the retirement leaves CI green at every
  boundary (the classifier-driven graph and `ci-ok` roll-up are untouched). Quality gates per
  `DEV-RULES.PROJECT` — the mixed Markdown + code change runs everything.
- **Migration / rollout:** pre-public-release posture — remove, don't migrate; no compatibility aliases or
  migration readers. Adopter-facing surfaces never advertised `arc-cleared` beyond the setup workflow being
  replaced, and `merge.lock` defaults `none`, so no adopter action exists to migrate.
- **Coordination:** the review architecture is under active repair by a mostly-paused cohort (the `review-*`
  units and `integration-boundary-accuracy`), and `integrate-work-unit` / `run-errand` are being restructured
  (`delivery-plan-record` active; `errand-transient-lifecycle` next). This WU delivers the contract, the
  abstract touchpoints, and the minimal clearance-step substitution (D6.4); any concrete-mechanics edits to
  those two workflows beyond that substitution sequence against the owning restructure work units.

## Success Criteria

1. On this repo with `merge.lock: draft` — solo flow: a work-unit integration PR is unmergeable by any single
   accidental act (UI click, `gh pr merge`, even `--admin`) from open through review, triage, and composition,
   until the authorized terminal sequence flips ready and exact-head merges it. Team flow: the same holds to
   the review handoff; required-approvals cover the human-review window, with the recorded post-approval
   residual. Both scope to PRs opened through ARC lifecycle lanes (the draft-open touchpoint).
2. `grep -riE "arc.cleared|arc.clearance"` over the corpus returns only historical records (`completed/**`,
   the banner-marked analysis record, the digest-pinned coupling-audit manifest), ADR text, backlog planning
   artifacts that re-ground at their own grooming (D6.8), and this work unit's own active artifacts (archived
   at integration) — no live workflow, template, CI, ruleset, or CLI surface.
3. All quality gates green: Markdown lint, ARC contract checks, both type checks, full test suite, build; CI
   green on the integration PR.
4. The D3 touchpoints are documented at their abstract seam, and `merge.lock` is registered in the config
   catalog — exposed by `arc config status`, accepted by `arc config validate`, present in the shipped
   template — and consumable by the lifecycle workflows. Verified by reading the shipped surfaces, not by
   restructure-WU edits landing.
5. ADR-031 exists and ADR-029 carries the Tier-2 amendment.
6. This repo's host-side teardown is complete: no `arc-clearance.yml` workflow, no `arc-cleared` required
   check in the ruleset, `merge.lock: draft` set.

## Open Questions

None blocking. The exact wording of the three doctrine-loci rewords (D6.5) settles at implementation inside
the recorded constraint; the Free-plan private-repo draft-availability residual is accepted and covered by
`merge.lock: none`.
