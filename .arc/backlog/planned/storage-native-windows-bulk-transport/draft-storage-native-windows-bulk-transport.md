# Draft: Storage Native-Windows Bulk Transport

- **Origin:** [internal] — minted at the 2026-10-28 housekeep drain from a `USER-INBOX § Work Unit` capture made at
  `storage-ref-backend`'s prepublication session-init (2026-10-28). The follow-up itself was decided on 2026-10-26 and
  recorded in `RELEASE-GATES`.
- **Purpose:** Complete native-Windows bulk publication and migration behind the ref backend's semantic push boundary.
- **State:** planned stub. Scope and first step recorded; the design is not started.

---

## Problem / Motivation

`storage-ref-backend` lands fetch through stdin and an honest push-capacity refusal with preserved recovery. Complete
native-Windows bulk publication and migration remain required; this work unit is that accepted residual.

## Scope and Timing

- Must land before the first native-Windows adoption, including an earlier self-owned one, and no later than Gate A.
- A controlled Linux/WSL-only cutover takes no unconditional dependency on it.
- Implements after `storage-ref-backend` lands, potentially alongside `storage-projection`.

## Candidate Direction

The first step is bounded transport feasibility behind the existing semantic push boundary, preserving transaction,
hook, and remote behavior. A storage redesign is not pre-authorized.

## Related

- `RELEASE-GATES` lists it in `gate-a-private-beta`'s must-have storage substrate as an Owner-designated core
  follow-on, under `storage-program`.
