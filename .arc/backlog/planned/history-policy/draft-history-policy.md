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
