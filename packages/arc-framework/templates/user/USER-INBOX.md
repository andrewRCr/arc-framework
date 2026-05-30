# User Inbox

> _Personal capture surface for items to handle later. Drain destination depends on the project's PM mode.
> See `strategy-session-operations.md` § USER-INBOX._

## Atomic

> _Single-step captures. Drain to execution — folded into a WU (inline absorption), or run standalone via
> `arc-errand`. Never executed directly from here._

<!-- Entry shape: H3 + checkbox + bold title (`### `[ ]` **Title**`) +
italic-descriptor bullets (_Observation:_, _Approach:_, _Files:_, _Scope:_, _Captured during:_). -->

## Backlog

> _Multi-step captures bound for a backlog stub. Route to an existing stub, or graduate to a new one —
> directly at housekeep; `arc-errand` only if needed mid-WU. Carries `WU_Target` (TBD ok); an optional
> `(planned|provisional)` parenthetical sets a new stub's dir (decided at drain if omitted)._

<!-- Entry shape: H3 + checkbox + bold title (`### `[ ]` **Title**`) + italic-descriptor bullets, plus a
WU_Target field — `WU_Target: <slug>` / `<slug> (planned|provisional)` / `TBD`. Existence-at-drain decides
route-vs-create (no `new` keyword); the `(planned|provisional)` parenthetical is a new-stub dir hint only,
ignored when the target already exists. -->

---
