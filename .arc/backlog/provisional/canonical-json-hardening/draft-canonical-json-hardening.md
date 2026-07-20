# Draft: Canonical JSON Domain and Digest Hardening

- **Origin:** [internal] — consolidated from `cli-schema-kernel` domain auditing and the review-gate digest
  determinism concern.
- **Purpose:** Close the canonical JSON plain-data domain and coordinate every byte-changing digest correction through
  one versioned migration rather than patching individual consumers.

## Problem / Motivation

The canonicalizer accepts structural inputs outside a well-defined JSON plain-data domain. Sparse arrays can collide
with dense arrays or serialize invalidly, while own-property and descriptor edge cases remain unaudited. Separately,
the review-gate identity canonicalizer uses locale-sensitive key sorting and no NFC normalization, so stored trust
digests may diverge across runtimes.

Both corrections can change canonical bytes. Digest consumers include husk retirement receipts, review-gate policy
and change-set identities, and schema-kernel records; an uncoordinated local fix could invalidate stored identities.

## Approach / Scope

- Define and validate the supported dense-array and plain-object property domain before serialization.
- Audit sparse arrays, own properties, descriptors, Unicode normalization, and deterministic codepoint key ordering.
- Preserve existing bytes for every already-valid vector unless a deliberate versioned correction requires otherwise.
- Inventory stored digest consumers and design one explicit digest-version bump plus re-hash or forward-only migration.
- Reconcile the review-gate serializer with the generalized canonical serializer without silently upgrading existing
  receipts.

## Coordination

This work stays separate from the byte-stable `cli-substrate-adoption` cohort. Review-gate qualification consumes the
resulting digest contract but does not own canonical-byte semantics or their migration.

---
