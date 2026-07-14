# Draft: husk-lifecycle-drivers — authorize non-shipped self-teardown

- **Origin:** `worktree-teardown-decoupling` create-spec adversarial review identified the same deleted-cwd
  cascade on pre-merge lifecycle drivers.
- **Purpose:** Extend husk-mode teardown to abandon and park-at-Planning without weakening their distinct
  preservation and authorization requirements.

---

## Inbound Buffer — Pending Integration

### `[ ]` **Wire abandon and park-at-Planning into the husk authorization socket**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14).
- _Concern:_ the shipped driver has a proof that refs may be reaped after integration; abandon and
  park-at-Planning reach the same reconcile-worktree leg before merge but cannot reuse that preservation proof.
- _Approach:_ supply per-driver authorization through `worktree-teardown-decoupling`'s driver socket: abandon
  requires explicit discard confirmation; park requires proof that the planning artifacts were relocated.
  Stamp the resulting husk condition, plumb lifecycle-executor call sites through the shared projection layer,
  and extend advisory/sweep naming for non-shipped husks.
- _Sequencing:_ follow `worktree-teardown-decoupling`; exposure rises when spawned worktrees become the default.

---
