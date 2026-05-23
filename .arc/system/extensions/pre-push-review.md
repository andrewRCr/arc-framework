---
name: pre-push-review
description: Verification gate at any push routed through the push wrapper — reserved for future per-push checks
active: false
---

# Extension: pre-push-review

> - **Workflow:** push wrapper (`arc release push`, `arc sync`)
> - **Fires:** Any push routed through the push wrapper
>
> - **Contract:** Sequential execution with halt-on-fail. Fires per push — high-frequency invocation, so
>   `.actions` should stay lightweight. Reserved-for-future framing: shipped to complete the extension-family
>   namespace alongside `pre-commit-review`, `pre-pr-review`, and `pre-merge-review`; `.actions` is empty by
>   default. Use for last-mile push-time checks (upstream-state validation, release-state assertions,
>   protected-branch reaffirmation) that earlier gates can't cover.

## pre-push-review.actions

[No extension configured]

---
