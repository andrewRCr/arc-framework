# Spec (`detailed` · `RFC`): merge-readiness-control

- **Origin:** [internal]

- **Purpose:** Replace the `arc-cleared` required-status merge gate with a draft-first pull-request lifecycle as
  ARC's host-side merge-readiness control — an opt-in config axis (`merge.lock: draft | none`) needing zero
  host-side setup, driven by typed CLI verbs rather than workflow prose — and retire the `arc-cleared` machinery
  from the corpus.

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
2. The control requires zero host-side setup — no workflow, no required check, no ruleset — so enabling it is a
   config edit against machinery the CLI already ships.
3. The `arc-cleared` **mechanism** stops existing: the required-status producer inside the CLI's unlock path,
   this repository's CI workflow, and its ruleset check. The documentation surface that describes it retires in
   the dependent follow-on (D6a).
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
- Restructuring `integrate-work-unit.md` / `run-errand.md` — this WU performs only the minimal substitution: the
  clearance verb invocation is replaced verb-for-verb at its existing site, and one resolve call is added at each
  PR-open site. No step is reordered, merged, or resequenced; deeper restructuring lands with the owning work
  units (§ Cross-cutting → Coordination).
- Closing the team-flow post-approval, pre-authorization residual — deliberately narrowed versus `arc-cleared`
  and bound by the exact-head invariant plus explicit merge authorization (§ Proposed Design D5).
- Retiring the `arc-cleared` documentation surface — deferred whole to `clearance-corpus-retirement`
  (§ Proposed Design D6a), which depends on this work unit.

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
- Project-only, runtime setting. **The lock verbs (D3) are its sole behavioral consumer** — `arc config status`
  displays it, and no workflow prose reads it, compares it, or branches on it. Changing it is a direct config
  edit, no reconfigure.
- `draft` enables the draft-first lifecycle for lock-bearing lanes (D3). Enabling is a config edit — the
  mechanism needs no host-side machinery.
- `none` is the degenerate mode: interlocks plus harness permissions only, for hosts without a draft state and
  for the unverified Free-plan-private-repo residual.
- Implementation footprint: register the key in the config catalog (`src/lib/config/schema.ts`, enum
  `draft | none`, default `none`) so `arc config status` exposes it and `arc config validate` accepts it; ship
  the key in the `arc-config.yml` template (package source and `.arc/` copies per the sync rule); document the
  axis in `strategy-configurability-architecture.md` (project-only `merge.*` classification, runtime-settings
  list); load it in the lock verbs' resolution path (D3). Config-field tests ride the existing coverage; the
  verbs carry their own (D7).

The key stays under `merge.*` rather than `review.*`: it names what is controlled — what may merge — and sits
beside `merge.strategy`. The verb namespace names where the control operates (D9).

### D3. Lifecycle touchpoints — typed verb contract

The lock's workflow surface is four touchpoints plus one transition. Each is a **fire site** at which the
workflow invokes a lock verb and dispatches on its typed action — the same shape the retired clearance step
already used (`arc review unlock -` → `dispatched / await-clearance`). No workflow prose evaluates
`merge.lock`, lane membership, or PR draft state; the CLI computes the disposition and the workflow follows
only the returned action.

**Three verbs, named for the transition.** Which transition a site performs is fixed by the site itself —
triage can only lock, the ready flip can only release, escalation can only lock — so the verb name carries
that information rather than a parameter. One call per site, and each invocation says what it does when read
in isolation. `resolve` covers the one site that is genuinely a query: the pre-open call, where no pull
request exists to act on.

```text
arc merge lock resolve -
  input:  treeRoot, vehicle
  action: locked / open-locked · none / open-plain · blocked / stop

arc merge lock hold -
  input:  treeRoot, target, vehicle
  action: held / proceed · no-lock / none · blocked / stop

arc merge lock release -
  input:  treeRoot, target, vehicle
  action: released / proceed · no-lock / none · blocked / stop
```

Each verb reads the rest itself: `merge.lock`, the vehicle's lane, live PR draft state, open findings, and
lifecycle readiness. `no-lock / none` is the ordinary answer under `merge.lock: none`, on a non-lock-bearing
lane, or when the pull request already holds the requested state — so a workflow calls unconditionally and
dispatches, never testing whether the call applies.

**The fire sites:**

- **draft-open** — `resolve`, immediately before `gh pr create`, on both lanes. It returns
  `locked / open-locked` for a lock-bearing lane under `merge.lock: draft` — work-unit integration PRs, and
  Errand PRs expecting a routed review — and `none / open-plain` otherwise, which is how create-and-land
  grooming PRs (the auto-merge lane) stay unlocked without the workflow classifying the lane itself. The action
  selects whether `--draft` is passed; nothing else about the creation call changes.
- **provenance-update** — the PR-body provenance update (review passes run, finding counts, triage identity)
  lands **before** the release, so a human reviewer opens onto a complete "what has been done" view. Prose
  ordering only; no verb call.
- **ready-flip** — `release`, at the site the retired unlock invocation already occupies. The release always
  rides an existing gate, never floats free. In solo flow that gate is explicit merge authorization, and the
  release opens the terminal sequence (D4). Where the change instead goes to a human — the errand reviewed
  lane's hand-off for owner review, and team flow at the agentic-triage-complete boundary riding the triage
  disposition approval — the same verb fires at the same site, and the release is the review handoff.
- **re-lock** — `hold`, when review surfaces findings after a release.
- **re-lock-on-escalation** — `hold`, where the lane classifier reruns immediately before the auto-merge lane
  arms. `planning → reviewed` escalation is one-way, and a PR that opened unlocked on the grooming lane must
  convert on that reroute, before the escalated change re-enters the reviewed path.

`hold` and `release` retain the exact-head preflight the clearance verb carried — authenticated repository
match, PR open and matching, and the requested SHA equal to the live head — and `release` additionally retains
the lifecycle-readiness gate. `hold` needs no readiness gate: locking is always safe.

Beyond this contract and D6's minimal substitution, concrete-mechanics edits to `integrate-work-unit.md` /
`run-errand.md` sequence against their owning restructure work units.

### D4. Terminal sequence — auto-merge never composed

Native auto-merge survives new pushes from write-permission actors, and `--match-head-commit` guards arming
time, not merge time — structurally incompatible with exact-head authorization. The work-unit integration lane
therefore never arms auto-merge: the terminal sequence is `arc merge lock release -` → immediate direct
`gh pr merge --match-head-commit <authorized-sha>`, keeping the unlocked window to seconds and
exact-head-guarded throughout. `release`'s own preflight re-checks the live head, so a race between the release
and the merge is caught by the verb rather than only by the merge flag. Auto-merge remains the grooming lane's
tool, governed by its classifier gate.

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

### D6. Workflow footprint — fire-site substitution

Package source and `.arc/` copies both, per the package-project sync rule.

**Fire-site substitution (minimal):** in `run-errand.md` / `integrate-work-unit.md`, the `arc review unlock -`
invocation and its typed-action dispatch are replaced by the matching D3 verb and its actions, and a `resolve`
call is added immediately before each `gh pr create`. Enough that every fire site is covered, no more; concrete
mechanics sequence to the owning restructure work units per § Cross-cutting → Coordination.

**False positives (retain untouched):** `session-recover.md` ("clearance" in the generic sense),
`close-occupancy.ts` (errand-occupancy clearance), and the lane classifier's "planning clearance" surfaces
(`cli.ts` classify description, `change-facts.ts`).

### D6a. Corpus retirement — deferred to `clearance-corpus-retirement`

The `arc-cleared` **documentation** surface retires in a dependent follow-on work unit, not here: the setup
workflow and merge-gate template, the retained merge-gate surfaces' cross-references, the initial-setup
clearance offer, the doctrine and overview rewords, the historical-record banner, and the recipe and manifest
entries that track those files. The full inventory, the reword constraint, and the retain-untouched list live in
that work unit's own design.

**The split is by review burden, not by concern.** A single change set ran past this project's pull-request size
target; the mechanism half carries essentially all of the review burden, while the corpus half is largely
whole-file deletion and prose. The seam is forced rather than chosen: the `arc-cleared` required status is
produced by the repository dispatch inside the retired unlock path, so **removing that dispatch and dropping the
required check must land together** (D7.6) or every pull request blocks on a context no producer will ever post.
That welds the CLI retirement to the host cutover and leaves the documentation surface as the only separable
half.

**Interim state between the two merges:** `setup-arc-clearance.md` documents an install path whose producer is
gone, and the initial-setup offer still names it. Untidy, not broken — and invisible to projects installing ARC,
since `merge.lock` defaults to `none` and the clearance setup was always opt-in.

### D7. Retirement footprint — CLI and this repo's install

The unlock path is **retargeted, not deleted** — the clearance verb already occupies the fire site, carries the
exact-head preflight and readiness gate the lock verbs need, and holds the host port they extend, so composing
onto it costs far less than a parallel surface. What dies is the required-status mechanism inside it. The
command surface itself moves: the verbs leave the `review` namespace for `merge lock`, taking their envelope
registrations with them.

1. **Retargeted:** `src/scripts/review-gate/unlock.ts` → the merge-lock module — `ReviewUnlockRequest` /
   `ReviewUnlockEnvelope` become the three request/envelope shapes, the repository / PR / exact-head preflight and
   the readiness gate carry over unchanged, and `merge.lock` plus lane and draft-state resolution replace the
   workflow-inspection step. `src/scripts/review-gate/hosts/github/unlock.ts` → the host port:
   `resolveRepository` / `resolvePullRequest` stay, `inspectWorkflow` and `dispatch` are replaced by a draft-state
   read and `gh pr ready` / `gh pr ready --undo`. `src/cli.ts` — the `unlock` subcommand under `review` is removed
   and an `arc merge lock` group with `resolve` / `hold` / `release` is added. `src/handlers/review.ts` — the
   unlock handler becomes the three lock handlers. `src/lib/handoff-critical.ts` — the `review`/`unlock` rule
   rekeys to the merge-lock verbs, with its module comment and the matching `handoff-critical.test.ts` assertion.
   Both modules stay under the review-gate tree: they consume its target, vehicle, and readiness contracts, and
   the CLI namespace is a surface decision independent of module path.
2. **New envelope family:** `review-command-envelope.ts` drops the `review-unlock` mode entry, the
   `ReviewUnlockEnvelopeSchema` import, and the `review-unlock-envelope` registration. A `merge-lock` envelope
   module supplies its own mode schema (`merge-lock-resolve` / `merge-lock-hold` / `merge-lock-release`), the
   three result envelopes, and the matching error variants, registered into the same kernel registry. The command
   family moves rather than reusing the review slot, so the `ReviewCommandMode` enum keeps naming only review
   commands.
3. **Wholly removed:** the `CLEARANCE_WORKFLOW_PATH` constant, the `arc-clearance` dispatch event type, and
   `ReviewUnlockDispatchPayload` with its port method; the `clearance-status-history.json` fixture.
4. **Test updates:** the unlock unit tests (`unlock.test.ts`, `hosts/github/unlock.test.ts`) retarget to the three
   verbs, covering each typed action and each blocked reason; `review-gate-workflows.test.ts` lock/unlock flow
   coverage rewrites onto the new verbs (the largest single change); `review-cli-surfaces.test.ts`,
   `review-schema-registration.test.ts`, `kernel/schema-generation.test.ts`, and `schema-artifact.e2e.test.ts`
   `review-unlock` references retarget to the three new modes; the `handleReviewUnlock` import and describe block
   in `unit/handlers/review.test.ts` retarget; `review-driver-lifecycle.test.ts` assertion that
   `integrate-work-unit.md` contains `arc review unlock` updates with the D6 substitution.
5. **Not here (follow-on):** the installed `confirm-live-change-pair.sh` and its test, the `LIVE_PAIR_SCRIPT`
   helper export, the `init-recipe.json` and manifest entries, and the `pr-open-extensions.test.ts` /
   `init.e2e.test.ts` assertions all track files the corpus retirement removes — they land with it (D6a), not
   here. This repository's own rendered clearance workflow is the exception below, because the required check
   cannot outlive the dispatch.
6. **This repo's host-side teardown (dogfooding install):** delete `.github/workflows/arc-clearance.yml`; drop
   the `arc-cleared` required check from the base-branch ruleset (host-side act); set `merge.lock: draft` in
   this repo's `arc-config.yml`. The first two are welded to item 3's dispatch removal — with the producer gone
   and the context still required, no pull request can merge.

Renames land in place under the pre-public-release posture — no compatibility aliases, no deprecated
`review unlock` shim (`DEV-RULES.PROJECT` § Engineering Standards).

### D8. ADR record

- **ADR-031** records the draft-first merge-readiness decision: threat model, alternatives weighed, the
  narrowed boundaries as priced trades, and the config axis. Context references ADR-029.
- **ADR-029** takes a dated Tier-2 amendment cross-referencing ADR-031: Decision #4's mechanism (the
  `arc-cleared` thin lifecycle lock) is displaced by the draft-first lifecycle; the authority division
  (Decisions #1–3, #5) stands unchanged.

### D9. Command surface naming

The test applied: which name stays true on every platform, in team and solo flow, with the config on or off,
and on both lanes?

- **Namespace `merge`.** Every host mechanism blocks the merge specifically — draft on GitHub and GitLab, the
  WIP title prefix on Gitea / Forgejo. Both flows prevent the same act. Under `merge.lock: none` the verb
  reports no lock on the merge, which is still an accurate question to have asked. It is also the vocabulary
  ARC config already uses for this domain (`merge.lock`, `merge.strategy`), so key and command say one word for
  one concept. That a merge-namespaced verb might read as merge authority is a concern about a bare `arc merge`
  verb, which this adds none of: every invocation is `arc merge lock <verb>` and none of them merges anything —
  the integration-interlock remains the sole merge authority and `gh pr merge` remains the act (D4).
- **Not `review`.** True only in team flow and only in the host's framing. The solo release has no review
  meaning at all; it makes the change mergeable, nothing more.
- **Not `integration`.** It collides with ARC's own `Integrating` state, which _is_ the window the lock is held
  through — so it would name the phase rather than the blocked act, and describe a work unit as unable to do
  the thing it is currently doing. `arc integrate` also already exists, and is separately recorded as misnamed
  for naming a phase's content rather than a scheduling act.
- **Noun `lock`, not `draft`.** `draft` is one host's mechanic, and naming the verb after it would bake a host
  into the contract the portability posture keeps abstract. `gate` is already overloaded here (review gate,
  merge gate, quality gates).
- **Verbs name the transition.** `hold` / `release` read the same whether the host implements the lock as draft
  state or a title prefix, and `hold` is the established idiom for this control. The retired `unlock` named one
  of the transitions and carried the required-status model in it; a `resolve` / `apply` pair was worse still —
  `apply` would have performed the release while reading as its opposite.

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
- **Workflow prose reads `merge.lock` directly** (no verbs — the cheapest build): rejected. It would replace a
  typed verb with config-evaluating prose, downgrading the one surface in this area that is already typed, and
  it puts lane classification and PR-state reads into markdown where nothing can check them. The verbs cost two
  additional envelope modes over the retired one and buy a contract the test suite covers.

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
- **Testing:** the retargeted verbs carry unit coverage per typed action and per blocked reason, and the
  review-gate workflow test rewrites onto the new verbs; the remaining removals ride the existing
  three-tier suite. Each phase repairs the assertions its own change breaks, so CI stays green at every boundary
  (the classifier-driven graph and `ci-ok` roll-up are untouched). Quality gates per `DEV-RULES.PROJECT` — the
  mixed Markdown + code change runs everything.
- **Migration / rollout:** pre-public-release posture — remove, don't migrate; no compatibility aliases or
  migration readers. Adopter-facing surfaces never advertised `arc-cleared` beyond the setup workflow, which
  survives this work unit and retires in the follow-on, and `merge.lock` defaults `none`, so no adopter action
  exists to migrate.
- **Coordination:** the review architecture is under active repair by a mostly-paused cohort (the `review-*`
  units and `integration-boundary-accuracy`), and `integrate-work-unit` / `run-errand` are being restructured
  (`delivery-plan-record` active; `errand-transient-lifecycle` next). This WU delivers the verb contract and the
  minimal substitution at its fire sites (D6); any concrete-mechanics edits to those two workflows beyond that
  substitution sequence against the owning restructure work units. The verbs are what make the substitution safe
  to land mid-restructure: a restructure moves a fire site without renegotiating what fires there. The same
  holds against `wu-lifecycle-state-model`, which reshapes the `State` axis and the planning-side verbs but
  mints no stored state here and leaves the `merge.*` vocabulary untouched.

## Success Criteria

1. On this repo with `merge.lock: draft` — solo flow: a work-unit integration PR is unmergeable by any single
   accidental act (UI click, `gh pr merge`, even `--admin`) from open through review, triage, and composition,
   until the authorized terminal sequence flips ready and exact-head merges it. Team flow: the same holds to
   the review handoff; required-approvals cover the human-review window, with the recorded post-approval
   residual. Both scope to PRs opened through ARC lifecycle lanes (the draft-open touchpoint).
2. No `arc-cleared` **producer or enforcement point** survives: `grep -riE "arc.cleared|arc.clearance"` over
   `packages/arc-framework/src/`, `packages/arc-framework/__tests__/`, and `.github/` returns nothing, and the
   base-branch ruleset requires no such context. The documentation surface still names it until the follow-on
   lands (D6a).
3. All quality gates green: Markdown lint, ARC contract checks, both type checks, full test suite, build; CI
   green on the integration PR.
4. `arc merge lock resolve`, `arc merge lock hold`, and `arc merge lock release` exist with the D3 typed
   actions, registered as `merge-lock-*` envelope modes and covered per action and per blocked reason;
   `merge.lock` is registered in the config catalog — exposed by `arc config status`, accepted by
   `arc config validate`, present in the shipped template. Verified by reading the shipped surfaces and running
   the verbs, not by restructure-WU edits landing.
5. Each D3 fire site in `integrate-work-unit.md` and `run-errand.md` invokes a lock verb and dispatches on its
   returned action; no workflow prose reads or compares `merge.lock`, classifies a lane, or reads PR draft
   state.
6. ADR-031 exists and ADR-029 carries the Tier-2 amendment.
7. This repo's host-side teardown is complete: no `arc-clearance.yml` workflow, no `arc-cleared` required
   check in the ruleset, `merge.lock: draft` set.

## Open Questions

None blocking. The Free-plan private-repo draft-availability residual is accepted and covered by
`merge.lock: none`. The doctrine-loci rewords and their constraint moved out with the corpus retirement (D6a)
and are that work unit's open question, not this one's.
