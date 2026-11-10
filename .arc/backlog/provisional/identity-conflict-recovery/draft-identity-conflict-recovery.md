# Draft: identity-conflict-recovery

- **Origin:** [internal] — surfaced while specifying `session-locus-operability-hardening`; the retained v3 Errand
  identity transaction validates its complete shared basis before any mutation.
- **State:** Provisional — retain for discovery, not sequencing. Consider promotion only if malformed or conflicting
  identity state occurs in practice, or if later evidence makes operator recovery strategically important.
- **Purpose:** Provide a lossless, in-model recovery path when one malformed or same-slug-conflicting Errand identity
  makes the shared identity basis unwritable.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Name a clash exit each Errand holder's owner can run when two people's Errands share a slug**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Approach (provisional) — an operator recovery for same-slug Errand identities; its draft is framed on the
  retired v3 identity ref.

- _Observation:_ for a live slug clash with an Errand holder, the clash repair names `arc errand close <uid>` for the
  first `work-item/record` candidate only (`lib/store/clash-repair.ts`, the slug arm of `lib/store/lookup.ts`). Errand
  verbs refuse a record another person owns ("Errand <slug> is owned by <owner>. Choose another slug for a new
  Errand.", `store-runtime.ts`), and `formatRefusal` drops the candidates. So when two people's Errands share one slug,
  or a work unit clashes with another person's Errand, the printed command refuses its reader, and the reader's own
  Errand UID is never shown. The refusal is explicit and recoverable, and the state needs two people to open one
  Errand slug at once. Every clashed Errand in `store-ref-errand-uid-cli.test.ts` shares one owner.

- _Approach:_ draft alternative, new design amending `spec-cohort-identity-verbs.md` § 3.1, which settles one preferred
  move with an executable argv "where that move runs as printed": for a live tie with Errand holders, name every
  Errand holder's close by UID, and a work-unit holder's rename where one holds, with `arc status --json` as the argv
  unless the reader is known to own the named Errand. Add a two-owner clash case on the ref fixture. It changes the
  text printed by status's slug-clash warning, Start readiness and every slug lookup reader.

- _Observation:_ a second Errand-clash exit with no landing route, deferred from the same round's ad hoc fix check
  (2026-11-08): two Errands tied on one branch name, both left awaiting merge with their change requests merged. Each
  one's UID close reaches the branch-link guard (`lib/errand/close-subject-branch.ts`, `leftSubjectTie`), which names
  the other holder's close or abandon as the exit that lands; the other's close refuses the same way, abandon of an
  awaiting-merge Errand needs a change request closed unmerged (`identity-transitions.ts`), and `arc errand
  materialize` takes only a slug, which the clash refuses. The dead end predates the left-Errand fix, which corrected
  the case where the other holder still has a checkout. Any landing exit is new design: admit close on the record's
  retained change-request evidence without the branch read, which the spec's § 9.2 rejected, or a UID re-entry, a
  Non-Goal. Until then the refusal could at least stop naming a left holder's close as landing. The state needs a
  sync-formed slug clash and runs only from the flip.

- _Captured during:_ `cohort-identity-verbs` pre-publication standard pass 22, finding F1, deferred with Owner approval
  (2026-11-08).

---

## Problem / Motivation

The v3 Errand identity ref is one shared authoritative ledger. Every close, abandon, leave, or promotion mutation
validates the complete basis before rewriting it. That fail-closed boundary prevents a healthy operation from
silently discarding unrelated malformed or conflicting entries, but it also means one bad entry can block later
identity mutations across otherwise unrelated Errands.

The current CLI has no lossless resolver for that condition. In particular, `errand close --force` is refused for
v3 identities and is not a recovery path. `session-locus-operability-hardening` will state this boundary honestly;
it will not weaken complete-basis validation as part of retiring the separate locus-record substrate.

## Promotion trigger

Do not promote or schedule this work merely because the limitation is known. Reconsider it when at least one of the
following supplies evidence that the recovery path earns backlog commitment:

- malformed or same-slug-conflicting v3 identity state occurs in practice and blocks an operator;
- repeated manual intervention shows that fail-closed diagnosis without an in-model repair path is materially
  costly; or
- another committed identity-storage change needs the same resolver contract.

## Approach (provisional)

- Preserve complete-basis validation for ordinary identity mutations.
- Design an explicit operator recovery verb that identifies an exact conflicted generation rather than accepting a
  slug-only or blanket-force target.
- Preserve unrelated raw entries byte-for-byte and require version-checked revalidation at the write boundary.
- Make the proposed post-image inspectable before mutation and refuse ambiguous selections.
- Cover malformed entries, duplicate-slug generations, concurrent ref movement, lost-response replay, and recovery
  from both local and materialized identities.

## Non-goals (provisional)

- Making identity mutations tolerate or silently discard invalid unrelated entries.
- Restoring `errand close --force` as a bypass around the shared identity authority.
- Reintroducing locus records, leases, process-liveness checks, or a second identity store.
- Committing this work to the roadmap before its promotion trigger is met.
