---
name: pre-spec-finalization-review
description: Opt-in team review ceremony at the spec-finalization gate, augmenting the spec-review self-review
active: false
---

# Extension: pre-spec-finalization-review

> - **Workflow:** [1_create-spec.md][create-spec]
> - **Fires:** At the spec-finalization review gate — after the [spec-review method][spec-review] self-review,
>   before the spec is approved and committed
>
> - **Contract:** Sequential execution with halt-on-fail. create-spec finalizes a spec by running the spec-review
>   self-review, then stopping at the finalization workflow-interlock for approval; this extension fires between
>   the two — the opt-in seam for a team's own spec-review procedure (an async-PR review of the spec, a fixed
>   comment window, a committee sign-off). Inactive with no default `.actions`: the spec-review self-review alone
>   governs finalization until a team activates this and points it at its procedure. Those cadences are
>   informative precedents — ARC enforces none.

## pre-spec-finalization-review.actions

[No extension configured]

---

[create-spec]: ../workflows/arc/1_create-spec.md
[spec-review]: ../methods/spec-review.md
