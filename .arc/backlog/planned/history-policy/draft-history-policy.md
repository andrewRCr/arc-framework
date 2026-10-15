# Draft: History Policy

- **Origin:** [internal] — minted at `storage-contract`'s draft close (2026-09-30) from its history-policy decisions
  (C12 and C14 in `draft-storage-contract.md`), as a core storage program follow-on.
- **Purpose:** Turn `history.policy` on once Git notes retire, so a pushed branch may be rewritten under a lease by
  default, while teams that prefer append-only keep it by opting in.
- **Planning posture:** `P2`, tagged core by `storage-contract`; `Class` settles at planning. Depends on
  `storage-cutover`, which retires notes and flips the rule.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration._

### `[ ]` **Remap task commit captures in the lease-guarded catch-up with base**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: history-policy`), housekeep drain (2026-09-30); captured during
  `storage-contract` draft-design, adversarial pass 4 (2026-09-30).
- _Observation:_ `storage-contract`'s close verb (C5) records each task's commits as captures holding the SHA and its
  patch-id. ARC's own rewrites remap them from the rewrite's old-to-new mapping, and the catch-up with base is one of
  those rewrites. This draft owns the lease-guarded catch-up, but neither its Settled inputs nor its Open list names
  the remap. A catch-up rebase that resolves conflicts changes patch-ids, so lookup's patch-id fallback misses it and
  the capture dangles.
- _Approach:_ Add to Settled inputs that the catch-up remaps captures from its old-to-new mapping (C5), and to Open how
  it obtains that mapping for a conflict-resolving rebase. Captures start at the flip, so the remap is needed only
  from then.

### `[ ]` **Have `carry` lease a rewritten branch on the state push, and keep store history immutable**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: history-policy`), housekeep drain (2026-10-11).

- _Shapes:_ its § Open, "The lease" and "The pre-push backstop".

- _Observation:_ `storage-ref-backend`'s `push({ carry? })` names a code ref that rides the state push, and may name the
  remote tip it expects, pushed as `--force-with-lease=<ref>:<tip>`, so a branch rewritten under `rewrite-with-lease`
  rides it too; a carried ref's own rejection ends the code leg and the state leg pushes alone. Store history stays
  immutable (A4), and the pre-push hook treats state refs apart from code (`draft-storage-ref-backend.md` § Decisions,
  Sync).

- _Approach:_ settle the lease against `carry`'s expected tip, and the backstop's state-ref rule with it.

- _Captured during:_ `storage-ref-backend` draft close, 2026-10-10.

### `[ ]` **Remap each branch link's exclusions in the lease-guarded catch-up with base, beside the task captures**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: history-policy`), housekeep drain (2026-10-13).

- _Shapes:_ § Settled inputs, beside the inbound entry "Remap task commit captures in the lease-guarded catch-up with
  base".

- _Observation:_ from the flip a branch link (A3) records exclusions, the commits on its branch that are no task's work
  — an adopted branch's from before its activation, a kept branch's from its time back in Planning, and a carried
  branch's from before the flip's move — each its SHA with its copy key (`spec-seam-lifecycle.md` § 5.2).
  `arc task close`'s default capture and `seam-locus`'s listing of commits not yet closed leave out every commit that
  matches an exclusion by SHA or copy key (§ 9.2). A rewrite that keeps a commit's author line and diff still matches by
  copy key; one that changes either reads as new, and the next close captures it to the task it closes. ARC's own
  rewrites therefore remap exclusions from the rewrite's exact old-to-new mapping as they remap captures
  (`spec-storage-contract.md` D16, D20), each remap adding the new commit's SHA and copy key beside the old entry, which
  stays, so a checkout that has not taken the rewrite still matches its old copy by SHA.

- _Approach:_ the lease-guarded catch-up remaps every branch link's exclusions from the same mapping it uses for
  captures, adding beside the old entry and adding nothing where an entry already holds the new SHA, so a rerun changes
  nothing; links start at the flip, so the remap is needed only from then (`spec-seam-lifecycle.md` § 19, "The history
  policy").

- _Captured during:_ `seam-lifecycle` draft-design, fourth adversarial pass, 2026-10-12; restated against its approved
  spec, 2026-10-13.

### `[ ]` **Give `arc base merge` an arm for ordinary catch-up with base, not only the integration checkpoint**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: history-policy`), housekeep drain (2026-10-13).

- _Shapes:_ § Settled inputs (`arc base merge`'s lease-guarded rewrite path), and § Open, "The lease".

- _Observation:_ `arc base merge` serves only the integration checkpoint (`mergeExpectedBase`), yet agents reach for it
  whenever a branch needs base, then abandon it for a raw `git merge` (Owner, 2026-10-12). `draft-seam-lifecycle.md`
  routes a Planning branch's catch-up to its own merge for that reason (§ Lifecycle, "Catching up while in Planning").
  The name promises the common case and serves the rare one.

- _Approach:_ an unbound arm that merges the configured base into the current branch, with the checkpoint's binding
  kept for its own caller; under `rewrite-with-lease` the same verb becomes the lease-guarded catch-up.

- _Captured during:_ `seam-lifecycle` draft-design, 2026-10-12.

- _Drain note:_ an unbound catch-up arm would also serve today under append-only; only its lease-guarded form waits on
  the policy.

### `[ ]` **Remap task captures and exclusions from Git's `post-rewrite` hook, so hand rewrites keep their tasks**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: history-policy`), housekeep drain (2026-10-13).

- _Shapes:_ § Open, "Each consumer's change".

- _Observation:_ from the flip, `seam-lifecycle`'s close matches a branch's commits to task captures and branch-link
  exclusions by SHA or by a copy key — a SHA-256 over the raw author line and a pinned patch-id, replacing A6's patch-id
  (`spec-seam-lifecycle.md` § 5.2, § 9.2). ARC's own rewrites remap captures and exclusions from their exact old-to-new
  mapping. A hand rewrite that changes a commit's diff (an amend that edits content, a rebase over an edit beside its
  change) or its author line (`--reset-author`, `rebase --ignore-date`) reads as new, and the next close captures it to
  the task it closes — a named residual. Git hands a `post-rewrite` hook that exact mapping for `commit --amend` and
  `git rebase`; probed on Git 2.55 it fires for both rebase backends, `pull --rebase`, autosquash, `--rebase-merges`,
  and `--update-refs`, and not for cherry-pick or `git replay`. A hook running ARC's additive remap would close the
  residual wherever ARC's hooks are installed. Under `history.policy`'s rewrite-with-lease default, hand rewrites of a
  pushed branch become ordinary, which is why this is the candidate home.

- _Approach:_ ARC ships `pre-commit`, `commit-msg`, and `pre-push` hooks; add `post-rewrite` under the standard profile,
  writing the remap through the store best-effort, since its exit status cannot stop the rewrite, with a recoverable
  route when the write fails. Under the ghost profile it follows `ghost-mode`'s answer for Git hook installation (its
  footprint inventory). The routed-in remap entry's "patch-id" wording predates the copy key.

- _Captured during:_ `seam-lifecycle` create-spec, adversarial Pass 5, 2026-10-13.

- _Drain note:_ narrower since `spec-seam-lifecycle.md` § 9.2 attributes a hand rewrite that keeps the commit's author
  line to its original task; what remains is rewrites that write a new author line.

### `[ ]` **Re-pin an open pull request's design link in the lease-guarded catch-up with base**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: history-policy`), housekeep drain (2026-10-15).

- _Shapes:_ § Settled inputs, beside the inbound entries remapping task captures and branch-link exclusions in the same
  catch-up.

- _Observation:_ `pull-request-surface-policy` links the design document from the pull-request body by a commit-pinned
  permalink. A rewrite moves the pinned commit out of reach, so the rewrites ARC performs re-pin it. A review fix that
  rewrites the branch re-pins through the review-fix keep-current step; the catch-up with base under the default
  `rewrite-with-lease` is this work unit's.

- _Approach:_ after the catch-up rewrites an open pull request's branch, update the body's pinned link to the design
  document's commit on the new head.

- _Captured during:_ `pull-request-surface-policy` draft-design close, `draft-pull-request-surface-policy.md` §
  Coordination (2026-10-14).

---

## Problem / Motivation

ARC forbids rewriting a pushed branch to absorb base changes (`DEV-RULES.ARC` § Commit Discipline, ADR-025), because
rewriting published commits orphans SHA-keyed Git notes. Once the cutover retires notes, that reason is gone, and
deferring the policy would keep an append-only rule nothing justifies (C14). The cutover flips the rule's text — the
register's append-only row — but the code built on append-only, and the lease-guarded catch-up with base, have no
other owner.

## Settled inputs (from `storage-contract` and ADR-035)

- **The setting** (ADR-035 items 9 and 10): `history.policy: rewrite-with-lease | append-only`, default
  `rewrite-with-lease`. `append-only` is opt-in for teams that prefer fixup-then-squash review or branches several
  people push to — the idiom turns on who pushes to a branch, not team size.
- **The code built on append-only consults the policy**, with a lease-guarded rewrite path: `arc base merge`,
  decomposition's base advancement, Candidate applicability evidence, recover's strict-ancestry check, and the
  advisory pre-push backstop, which treats state refs separately (the register's append-only row).
- **Supersession detection** (`lib/git/supersession.ts`) stays as the safety net once rewrites are allowed.

## Open

- **The lease** — `--force-with-lease` against the last observed remote tip, or a stronger expectation ARC records —
  and what a lost lease reports and how it recovers.
- **Each consumer's change** — which checks keep ancestry under `append-only` and switch to patch equivalence or
  supersession under `rewrite-with-lease`, and what Candidate applicability evidence binds to once a reviewed head
  can be rewritten.
- **The pre-push backstop** — what it warns on under each policy, and how it tells state refs from code refs.

## Scope boundary (Won't Do)

- Retiring notes and rewriting the rule's text — `storage-cutover`.
- Branchless planning — `storage-seam` (C12); a planning worktree catches up by re-detaching at base's tip.
- Rebase freedom for stateless review refs — delivery's.

## Coordination

- **`storage-cutover`** — the edge: it retires notes and its documentation pass rewrites the rule.
- **`delivery-observe-attest`** — the stacked-delivery terminal top dissolves once state is off-branch and this policy
  allows a lease-guarded rewrite.

## Reading inputs

- `draft-storage-contract.md` — C12 and C14; the append-only row in `cohort-state-storage.md`.
- `adr-035-keep-operational-state-in-repository-refs.md` items 9 and 10; `adr-025-concurrent-work-by-convention.md`.
- `strategy-concurrent-work.md` § Append-only until integration.

---
