# Draft: Merge Readiness Control

- **Origin:** `USER-INBOX § Work Unit`, routed at the 2026-08-03 housekeep drain after the
  `decompose-planning-lane` verification exposed the required-status producer-identity limit.
- **Purpose:** Select a proportionate host-side control for ARC pull-request merge readiness across the delivery
  lifecycle. Direction: retire the `arc-cleared` required status and adopt a draft-first PR lifecycle, with the
  ready-for-review transition repurposed as the human-review / merge-window handoff.

---

## Problem / Motivation

`arc-cleared` primarily guards against an agent or human accidentally merging a pull request that ARC has not
declared ready. It is not intended to defend against a hostile status writer. The decomposition planning-lane
ownership exception exposed a larger producer-identity problem: a required status can bind to the GitHub Actions
App family, but not to one exact workflow, while a dedicated App or organization-level required-workflow adapter
appears disproportionate to the accidental-action threat.

Threat-model read (settled): the control guards against **accidental** premature merge by a human or an agent
operating with the maintainer's authority — not a hostile status writer. That resolution cuts against
`arc-cleared` twice over: producer-identity binding is over-spec for the accidental threat, and a required
status under-delivers even its own goal under common default configurations — it rides on branch protection, so
the admin actor class (which here includes every agent using the maintainer's token) can bypass it in one
accidental flag (`gh pr merge --admin`). An enforce-admins / no-bypass ruleset closes that flag at its own
ceremony cost, so the bypass is configuration-conditional, a secondary observation — the family-level case
rests on proportionality and setup cost. Draft state has no merge-side override at all; unlock is a separate
deliberate verb.

## Direction: draft-first lifecycle

Verified mechanics (sourced research pass, 2026-08-03):

- Draft is the only native per-PR merge lock GitHub offers; rulesets carry no label-conditioned or manual per-PR
  merge gate as of mid-2026.
- The block is enforced identically across web UI, `gh pr merge`, and REST/GraphQL, and is not admin-bypassable —
  stronger than a required-check scheme under default configurations (a no-bypass configuration binds admins
  too; see § Problem / Motivation).
- Review requests (including CODEOWNERS auto-requests) are suppressed while draft and fire at ready-for-review.
- Auto-merge cannot be armed while a PR is draft (high-confidence consensus; not an explicit doc sentence).
- `gh pr ready` / `gh pr ready --undo` flip the state both ways; `ready_for_review` and `converted_to_draft` are
  distinct webhook actions usable as CI triggers.
- Semantics: GitHub's own docs read draft as work "not yet ready for a detailed code review **or merge**";
  GitLab defines Draft explicitly as a merge block. Draft-as-hold is standard practice, not off-label.

Verified empirically (fixture PR #442, closed unmerged, 2026-08-03):

- `@codex review` works on a draft PR — eyes-reaction in ~90s, review comment on the exact commit. The trigger
  list Codex advertises (PR opened for review, draft marked ready, the mention) belongs to its **auto-review**
  feature; with auto-review disabled — this project's posture for both providers — only the mention triggers, so
  nothing fires at the ready flip. Projects that enable provider auto-review should expect a benign,
  comment-only review to fire post-flip.
- Draft PR creation works on this private repo (GitHub Pro). GitHub's docs no longer carry any plan-gating note
  for draft PRs (PR-stage page, about-PRs page, and plans page all checked); the old Team/Enterprise-only wording
  for private repos is gone. Residual uncertainty for Free-plan private repos only, covered by the `none` mode.
- CodeRabbit manual invocation on drafts is known-working from prior use (not re-verified — no need to spend a
  run); its auto-review skips drafts by default, which is the desired behavior under this lifecycle.

**Semantic reframe.** Under ARC's lifecycle, "mark ready for review" becomes literally true. The draft window
hosts agentic review — frontline plus hosted providers, all explicitly requested (`@codex review`,
`@coderabbitai review`, Copilot review request) and all draft-compatible: Codex verified live, CodeRabbit
known-working from prior use, Copilot documented — plus finding triage, composition, and base reconciliation.
Removing draft then _is_ "ready for review"
in the human sense: agentic passes are done, findings dispositioned, provenance recorded; if any human review is
warranted or required pre-merge, it starts here — CODEOWNERS routing fires at exactly this moment rather than at
PR-open. The solo flow degenerates cleanly: the ready flip happens at merge authorization and the unlocked
window is momentary.

**Ordering rule.** The PR-body provenance update (review passes run, finding counts, triage identity) lands
**before** the ready flip, so a human reviewer opens onto a complete "what has been done so far" view.

**Lock-coverage boundary.** Draft's guarantee ends at the ready flip. Solo flow: the flip happens inside the
terminal sequence, so coverage runs to merge authorization. Team flow: the flip is the review handoff — native
required-approvals cover the human-review window, and the post-approval, pre-authorization residual is open.
That is a deliberate narrowing versus `arc-cleared`, which re-locked on every push and unlocked only at the
final interlock: the trade buys zero setup and no producer machinery for a residual the exact-head invariant
plus explicit merge authorization already bound. A team wanting lock-to-authorization holds draft through human
review instead (a posture, not a shipped variant — manual review routing is its cost). `gh pr ready --undo`
re-locks when review surfaces findings.

**Installation boundary (fail-open, priced).** The lock exists only where the opening act performed draft-open —
per-PR and procedural, so it fails open: a hand-opened PR, a PR opened by a non-ARC agent, or an Errand whose
lane prediction missed carries no lock, and on a solo repo it is one accidental act from merging once CI is
green. `arc-cleared` failed closed repo-wide — every PR born `pending` via the branch-protection binding. The
pricing: the uncovered class requires two independent lapses (a mis-opened PR **and** an accidental merge act)
where `arc-cleared` bounded it to one. Accepted per the accidental threat model; no detection machinery is
added.

**Terminal sequence (auto-merge resolved: not composed).** Native auto-merge survives new pushes from
write-permission actors — it disarms only when someone _without_ write access pushes, or the base switches — and
`expectedHeadOid` / `--match-head-commit` guards **arming** time, not merge time. An armed auto-merge therefore
merges whatever head eventually satisfies requirements, which is structurally incompatible with exact-head
authorization. The work-unit integration lane never arms auto-merge: the terminal sequence is ready flip →
immediate direct `gh pr merge --match-head-commit <authorized-sha>`, keeping the unlocked window to seconds and
exact-head-guarded throughout. Auto-merge remains the grooming lane's tool, unchanged, governed by its
classifier gate.

**Ready-flip authority.** The flip always rides an existing gate, never floats free. Solo flow: the agent
executes `gh pr ready` plus the exact-head merge as one terminal sequence inside explicit merge authorization —
the flip never precedes authorization. Team flow: the flip is the review handoff, executed after the provenance
update at the agentic-triage-complete boundary, riding the triage disposition approval.

**PR-lane split.** The lock is for PRs with a review-and-composition window (work-unit integration PRs, and
Errand PRs expecting a routed review — those open as draft). Create-and-land lanes — lean grooming PRs on the
auto-merge lane — never open as draft; their control shape is unchanged: auto-merge armed only after their own
integration-interlock and pre-arming classifier re-run (already exact-head-guarded at arming via
`--match-head-commit`), and drafts cannot arm auto-merge anyway. Because the lane classifier runs after review
settles and planning→reviewed escalation is one-way, an escalated PR converts to draft at escalation —
re-lock-on-escalation joins the abstract touchpoint set (draft-open, provenance-update, ready-flip, re-lock).

**Success signal.** On a repo with `integration.merge_lock: draft` — solo flow: a work-unit integration PR is
unmergeable by any single accidental act (UI click, `gh pr merge`, even `--admin`) from open through review,
triage, and composition, until the authorized terminal sequence flips ready and exact-head merges it. Team
flow: the same holds up to the review handoff; required-approvals cover the human-review window from there,
with the recorded post-approval residual. Both signals scope to PRs opened through ARC lifecycle lanes (the
draft-open touchpoint); an out-of-lane PR sits outside the lock's coverage by construction (the recorded
installation residual). In both flows: no `arc-cleared` machinery remains in the corpus (setup workflow,
template, CI workflow, ruleset check, CLI code paths — historical records exempt), with all gates green.

## Alternatives

- **Retain / narrow `arc-cleared` (required status):** bespoke producer, per-repo setup ceremony, an unlock
  surface, and admin-bypassable under default configurations — costlier than draft against the actual threat.
  Its two superior properties are honestly recorded: automatic push re-lock with coverage to the final
  interlock, and fail-closed repo-wide installation — every PR born locked (see § Lock-coverage boundary).
  Rejected as the default on proportionality.
- **Label + required check (`do-not-merge` + enforcing workflow):** the industry's other idiom (Kubernetes Prow
  `/hold`, required-label actions, Mergify conditions). Same machinery family as `arc-cleared` with a
  commoditized producer; same bypass and setup costs. Not shipped by ARC; documented as the alternative for
  teams that need passive review-request routing during the locked window.
- **No lock (interlocks + harness permissions only):** relies on agent-side discipline alone — the
  accidental-merge residue this work unit exists to close. Remains the degenerate mode where the host offers no
  draft state.

No third native mechanism exists to evaluate: GitHub offers no label-based or manual per-PR merge gate, and
"lock branch" is a whole-branch read-only control, not a per-PR lock.

## Platform posture

ARC is platform-agnostic in posture, GitHub-first in practice (`gh` verbs already live in the integration and
merge-gate surfaces). Two commitments:

- The control is a **config axis**, not hardwired behavior — opt-in, with a `none` degenerate mode. Leaning:
  `integration.merge_lock: draft | none`, default `none` at install, preserving the agnostic posture. Enabling
  it is pure config — the draft lock needs **zero host-side setup** (no workflow, no required check, no
  ruleset), itself a decisive cost win over `arc-cleared`'s producer machinery. Final key name settles against
  the config architecture at spec time.
- Draft-family is the _most_ portable candidate: GitLab blocks merge on Draft natively and explicitly, and
  Gitea / Forgejo block via the WIP title prefix, while a required-status producer is per-host bespoke wiring by
  comparison. Bitbucket draft behavior unverified. This work unit builds no host adapters; it keeps host verbs
  behind the single seam they already occupy.

## Retirement footprint (`arc-cleared`)

Inventoried 2026-08-03 (corpus grep). Pre-public-release posture throughout: remove, don't migrate.

- **Retire outright:** `setup-arc-clearance.md`; the `arc-clearance.yml` merge-gate template and its
  `merge-gate/README.md` coverage.
- **Retain, excise references:** `setup-merge-gate.md` — the auto-merge lane (merge-ok classifier, CODEOWNERS,
  required check, repo auto-merge setting) is orthogonal to the readiness lock and survives unchanged; only its
  two `arc-cleared` cross-references go.
- **Replace the offer:** `01_verify-and-configure.md` clearance offer becomes the `integration.merge_lock`
  opt-in.
- **Touchpoints under restructure:** `run-errand.md` / `integrate-work-unit.md` clearance steps become
  draft-lock touchpoints (draft-open, provenance-update, ready-flip, re-lock) — specified abstractly, sequenced
  per § Coordination constraints.
- **Doctrine and overview:** `strategy-work-organization.md` (auto-merge lane doctrine's clearance mentions),
  `TECHNICAL-OVERVIEW.md`; plus three loci that assert "only a configured required host-side check structurally
  enforces merge safety" without naming `arc-cleared` — `AGENT-BRIEF.ARC.md` (an `[invariant]`),
  `strategy-session-operations.md` § Review enforcement boundary, `standard-review.md` — reword when draft-first
  ships, without equating the two families: a required check is repo-configured and fail-closed, draft state is
  a per-PR structural lock whose installation is procedural; the "never infer merge safety from agent-layer
  discipline" caution must survive the reword. A bare `arc-cleared` grep misses all three.
- **CLI surfaces:** clearance appears in review-gate / pr-open code paths and their tests
  (`pr-open-extensions`, `review-gate-workflows`, fixtures, init e2e) — exact removal set inventoried at spec
  time.
- **This repo's own install:** delete `.github/workflows/arc-clearance.yml`; drop the required check from the
  base-branch ruleset (host-side teardown); set `integration.merge_lock: draft` in this repo's config — the
  dogfooding install the success signal presupposes.
- **Adjacent records:** ADR-029 (right-size review authority) engages this territory — amend vs. supersede at
  spec time. `analysis-arc-clearance-activation.md` (a living `reference/supplemental/analysis/` record
  describing the required contexts in present tense) retains as historical record, banner-marked as retired
  machinery at retirement — exact treatment at spec time. Backlog stubs referencing `arc-cleared`
  (`recovery-hardening`, the `review-protocol-alignment` and `decompose-transform-integrity` cohorts) re-ground
  at their own grooming — coordination note, not this work unit's edit surface. Completed-WU artifacts stay
  untouched (historical record).

## Coordination constraints

The review architecture is under active repair by a mostly-paused cohort (the `review-*` work units and
`integration-boundary-accuracy`), sequenced behind the decomposition cohort and above all the `delivery-*`
cohort (stacked-PR delivery). `integrate-work-unit` and `run-errand` are being heavily restructured (active now:
`delivery-plan-record`; soon `errand-transient-lifecycle`). This work unit therefore:

- delivers the merge-readiness **contract** — mechanism, config axis, lifecycle positions, setup surface;
- specifies workflow touchpoints abstractly (where draft-open, provenance-update, ready-flip, and re-lock live)
  rather than landing invasive edits into workflows mid-restructure;
- sequences any direct edits to `integrate-work-unit` / `run-errand` against the owning restructure work units.

## Unknowns and Assumptions

- **CLI clearance touchpoints:** the review-gate / pr-open code paths and tests that reference `arc-cleared`
  need an exact removal inventory at spec time (files known; line-level scope not yet walked).
- **ADR treatment:** amend ADR-029 or supersede it with a new ADR recording the draft-first decision — settle
  at spec time.
- **Config key final name:** `integration.merge_lock` is a leaning; settle against the config architecture at
  spec time.
- **Free-plan private repos:** draft availability residual (docs no longer plan-gate; unverified only there) —
  covered by the `none` mode.

## Scope Estimate

Medium. Treat merge readiness as one cross-lifecycle contract spanning work units, Errands, lifecycle and
grooming PRs, review-provider behavior, integration recovery, auto-merge, CODEOWNERS exceptions, and the
existing `arc-cleared` setup and unlock surfaces. Preserve exact-head authorization as a separate invariant
regardless of which host control is selected. No hard dependencies; the coordination constraints above govern
sequencing.

## Continuity

- **Readiness:** formalization-ready — readiness method returned ready this session (success signal added at
  that check); proportionality re-check clean; adversarial passes one and two (the `Heavy` cap) each returned
  one major plus minors — pass one: the post-ready coverage premise was false and the success signal solo-only;
  pass two: the fail-open installation boundary was unpriced — all findings verified against source and fixed
  in place; loop converged at the cap with no open findings. Remaining opens are spec-time inventory and
  naming, none design-divergent.
- **Resolved:** threat model (accidental-action only); option space (draft vs status-gate — no third native
  mechanism); direction (draft-first, retire `arc-cleared`); semantic reframe (ready = human-review handoff);
  provenance-before-ready ordering; lock-coverage and installation boundaries (both narrowings versus
  `arc-cleared` recorded and priced); terminal sequence (auto-merge never armed on the integration lane —
  exact-head direct merge after the flip); ready-flip authority (rides existing gates);
  PR-lane split; config axis (`integration.merge_lock: draft | none`, default `none`, zero host-side setup);
  `setup-merge-gate` retained with references excised; retirement footprint inventoried; provider behavior on
  drafts (Codex verified live, fixture PR #442; auto-review triggers inert under mention-only posture;
  CodeRabbit known-working; Copilot documented); draft availability (works private+Pro; docs no longer
  plan-gate).
- **Open:** the Unknowns and Assumptions list above.
- **Next:** capture ceremony (workflow-interlock: draft review, stage advance to create-spec, capture commit).

---
