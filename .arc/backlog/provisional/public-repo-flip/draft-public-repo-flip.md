# Draft: Public Repo Flip

- **Purpose:** Evaluate flipping the repository public — zeroing the Actions bill and unlocking CodeRabbit's
  open-source tier — and enumerate the gated work any flip requires.
- **Origin:** routed from `USER-INBOX § Work Unit` at housekeep drain (2026-07-16); captured during FP wave-3
  external-budget contention analysis; cost data in `notes-finalize-parallelism.md` § Day-2 evidence.

---

## Motivation

Going public zeroes the entire Actions bill (standard hosted runners — including the Windows/macOS portability
matrix — are free for public repos, no quota) and unlocks CodeRabbit's free open-source tier (Pro+ features,
popularity-scaled limits). At wave-3 run rates that is roughly $80–95/month of billable minutes plus
review-subscription headroom.

## Gated work before any flip

1. **Personal notes refs** (`refs/notes/arc/user/*` — SESSION-NOTES, WORKING-MEMORY, USER-INBOX) sync
   cross-machine through origin and would become publicly fetchable — they must move to a private remote first,
   which is effectively `arc-backend`'s storage separation.
2. A **`pull_request_target` security audit** of the review-gate workflow family under a public-fork threat model
   (elevated context, no first-time-contributor approval gate).
3. A **full-history secret scan.**

Presentation mitigations (placeholder WIP README, unlinked docs) are cheap and not the constraint.

## Sequencing

`arc-backend` / `local-mode` are deliberately queued behind substantial backlog clearing, so this evaluation is
not actionable until that work is near; this stub holds the analysis, not a schedule.

## Flip decision (2026-10-06)

The repository goes public in place, keeping its full history, ahead of the backends the notes gate waited on.

- **Notes gate (1)** is held by an interim rather than a backend. `arc.notesPush` is `manual` in repository git config,
  so `arc sync` keeps user notes local, and the remote notes, notes-backup, and sync-state refs are deleted before the
  flip. Objects behind deleted refs stay fetchable by SHA until GitHub garbage-collects them; that residue is accepted.
  Cross-machine notes sync stays off until a backing-repository or local-only backend ships.
- **Still published:** the Errand identity ref (`refs/arc/user/<identity>/errands`), which every Errand open, close,
  and abandon pushes. It holds Errand intents and inbox entry titles.
- **`pull_request_target` audit (2)** and **full-history secret scan (3)** are discharged by a pre-flip audit: no
  secrets in any ref (gitleaks over every branch, tag, pull-request, notes, and backup ref), and the one
  `pull_request_target` workflow (`arc-lane-attestation.yml`) skips fork pull requests at the job level. Any edit to
  that workflow needs the fork threat model re-checked.
- **Self-hosted runners** are deregistered before the flip, per `.github/self-hosted-ci.md`; CI runs on
  GitHub-hosted runners.

What remains here is the coupling the storage register row names: user-scoped state stays off the public remote, and
private notes sync returns with a backing-repository or local-only backend.
