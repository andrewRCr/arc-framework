# Draft: identity-conflict-recovery

- **Origin:** [internal] — surfaced while specifying `session-locus-operability-hardening`; the retained v3 Errand
  identity transaction validates its complete shared basis before any mutation.
- **State:** Provisional — retain for discovery, not sequencing. Consider promotion only if malformed or conflicting
  identity state occurs in practice, or if later evidence makes operator recovery strategically important.
- **Purpose:** Provide a lossless, in-model recovery path when one malformed or same-slug-conflicting Errand identity
  makes the shared identity basis unwritable.

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
