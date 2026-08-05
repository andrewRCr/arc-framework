# ADR-031: Lock Merges With Draft State

## Status

Accepted (2026-08-04).

## Context

[ADR-029] Decision #4 made `arc-cleared` a thin lifecycle lock: a required status a pinned default-branch
workflow wrote for one exact head, re-locked by every push. The threat it defends against is settled and
narrow — an **accidental** premature merge by a human or an agent operating with the maintainer's authority,
not a hostile status writer.

Verifying that mechanism against a real integration exposed two limits.

A required status binds to the GitHub Actions App family, not to one exact workflow, so any workflow in the
repository can write the context. Closing that gap needs a dedicated App or an organization-level
required-workflow adapter — disproportionate to an accidental-action threat.

The status also under-delivers its own goal under common configurations. It rides on branch protection, so the
admin actor class — which here includes every agent using the maintainer's token — bypasses it with one
accidental flag (`gh pr merge --admin`). An enforce-admins ruleset closes that flag at its own ceremony cost,
so the bypass is configuration-conditional; the case against the family rests on proportionality and setup
cost, not on a defect.

Meanwhile the mechanism carried real weight: a bespoke status producer inside the unlock path, a per-repository
setup ceremony, an environment, and a required-check list to maintain — all to hold a lock that a native
per-pull-request state already provides.

Draft state has no merge-side override at all. The block is enforced identically across the web UI,
`gh pr merge`, and REST/GraphQL, and is not admin-bypassable. Under ARC's lifecycle the reframe is exact: the
draft window hosts agentic review, finding triage, composition, and base reconciliation, and removing draft
_is_ "ready for review" in the human sense — CODEOWNERS routing fires at that moment rather than at PR-open.
The solo flow degenerates cleanly: the flip happens at merge authorization and the unlocked window is
momentary.

## Decision

We will hold pull requests unmergeable with the host's native draft state, driven by typed CLI verbs and gated
by an opt-in config axis, and retire the `arc-cleared` mechanism.

1. **Config axis `merge.lock: draft | none`**, default `none`, beside `merge.strategy`. Enabling the control is
   a config edit against machinery the CLI already ships — no workflow, no required check, no ruleset. `none`
   is the degenerate mode for hosts without a draft state.
2. **The lock's own read fails closed.** The shared settings reader is fail-soft: it degrades an unreadable
   config to a warning and substitutes defaults, which would silently disable the control it guards. The lock
   verbs therefore resolve the key strictly — absent is the documented `none` default, while unreadable or
   out-of-domain blocks.
3. **Three verbs named for the transition** — `arc merge lock resolve` (how a pull request should open),
   `hold`, and `release`. Each reads `merge.lock`, live lock state, and lifecycle readiness itself and returns a
   typed action; no workflow prose evaluates configuration, classifies a lane, or reads host state. `hold` and
   `release` retain the exact-head preflight the retired verb carried, and `release` retains the
   lifecycle-readiness gate.
4. **Every lock-bearing pull request opens locked, on every lane.** The errand merge lane is deliberately
   undetermined at PR-open, so no caller can classify it there and locking is the only fail-closed answer. The
   lanes that land unreviewed release immediately before arming auto-merge, which they must do regardless —
   auto-merge cannot be armed on a locked pull request.
5. **Auto-merge is never composed on the work-unit lane.** Native auto-merge survives pushes from
   write-permission actors, and arming-time head matching does not guard merge time — structurally incompatible
   with exact-head authorization. That lane's terminal sequence is release, then an immediate direct exact-head
   merge, keeping the unlocked window seconds wide.
6. **Exact-head merge authorization is unchanged**, and the integration interlock remains the sole merge
   authority. This decision replaces the host mechanism only.

## Consequences

### Positive

- The control needs zero host-side setup, so enabling it costs a config edit rather than a per-repository
  install ceremony with an environment and a required-check list.
- Draft has no merge-side override, closing the accidental-admin-merge path that branch protection left open by
  default.
- The bespoke status producer, its dispatch event, and its payload machinery stop existing; what remains is a
  typed verb contract the test suite covers per action and per blocked reason.
- The mechanism is the most portable candidate available: GitLab blocks merge on Draft natively, and
  Gitea / Forgejo block via the WIP title prefix, where a required-status producer is per-host bespoke wiring.
- Review requests, including CODEOWNERS auto-requests, are suppressed while draft and fire at the release — so
  the lock doubles as review-handoff routing rather than fighting it.

### Negative

The retired mechanism was better on two axes, and the trade was made anyway:

- **Push re-lock.** `arc-cleared` re-locked automatically on every push, with coverage to the final interlock.
  Draft does not: the workflows re-lock explicitly at the sites where a released pull request can start
  accepting commits again, which is procedure rather than a host guarantee.
- **Fail-closed installation.** `arc-cleared` failed closed repository-wide. The draft lock exists only where
  the opening act performed open-locked, so it is per-pull-request and procedural, and fails **open**: a
  hand-opened pull request, or one opened by a non-ARC agent, carries no lock.

### Risks

- **Uncovered pull requests.** The installation boundary above means the uncovered class needs two independent
  lapses — a mis-opened pull request **and** an accidental merge act — where the retired mechanism bounded it
  to one. Accepted under the accidental threat model; no detection machinery is added.
- **Team-flow residual.** Draft's guarantee ends at the ready flip. In team flow that flip is the review
  handoff, so required approvals cover the human-review window and the post-approval, pre-authorization window
  is open — bound by the exact-head invariant plus explicit merge authorization. A team wanting
  lock-to-authorization holds draft through human review, at the cost of routing review manually.
- **The grooming lane's arming window.** Lanes that arm auto-merge carry a genuinely unlocked window between
  the release and the arming — a couple of commands wide, inside the lane's own gate and after its exact-head
  recheck. This is the price of the open-locked rule, and it buys those lanes a lock across PR-open, review,
  and triage, which the previous design could not cover because it could not classify the lane in time.
- **Release is not head-scoped, and the lock never claimed it was.** Draft is a property of the pull request, not
  of a commit — the host's ready flip takes a pull request and nothing else — so "release head H" is not
  expressible, and no implementation recovers it. A release reports that the lock came off, never that it came off
  for one head. This is not a separate risk from the push-re-lock regression above: it is that regression observed
  at its smallest scale. A push landing microseconds after the preflight and a push landing a minute after a
  successful release leave the identical state, an unevaluated head sitting ready, and the workflows' explicit
  re-lock is the answer to both.

  What keeps that safe is the merge rather than the release. Callers merge with the host's head-matched merge at
  the exact head the release envelope names, so an advanced head refuses instead of landing. The verbs additionally
  re-read after a flip they performed and revert a release that missed its head, which is **best-effort narrowing,
  not a guarantee**: it holds because a step that mutates state can check its own mutation, and it stops there
  — the no-op path polls for nothing, since sampling a race whose outcome is already accepted buys no safety and
  invites the mistake of treating the verb as head-atomic. Locking is unaffected throughout: a hold that lands on a
  newer head is still locked.
- **Provider auto-review.** With provider auto-review disabled — this project's posture — nothing fires at the
  ready flip. Projects that enable it should expect a benign, comment-only review to fire post-release.
- **Draft availability.** A residual uncertainty applies to Free-plan private repositories, covered by
  `merge.lock: none`.

---

[ADR-029]: adr-029-right-size-review-authority.md
