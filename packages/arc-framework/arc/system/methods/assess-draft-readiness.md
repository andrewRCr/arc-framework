---
name: assess-draft-readiness
description: Evaluate whether a planning draft is formalization-ready against one shared three-criterion bar.
override-active: false
---

# Method: assess-draft-readiness

> - **Workflow:** [draft-design.md][draft-design], [create-spec.md][create-spec]
> - **When:** A planning stage decides whether a draft is ready to formalize into a spec — `draft-design` at
>   loop-exit (ready ends the shaping loop), `create-spec` at entry (ready proceeds to discovery). One judgment,
>   two fire points.
>
> - **Contract:** Given the draft (or `[none]`) plus WU context, return `{ ready: boolean, gaps: [...] }`. The
>   method owns the **criterion**; the caller owns the **routing** — both fire points read the same verdict and
>   diverge only on how they handle not-ready.

## assess-draft-readiness.override

[No override configured]

## assess-draft-readiness.default

A draft is **formalization-ready** when all three criteria below clear. Otherwise return **not-ready** with the
gaps that block it — each tagged by kind, so the caller can route without re-judging.

### The bar

1. **All settle-able design is settled.** Test it by divergence: where two competent engineers handed this draft
   would build materially different things, a *design* decision is still open and belongs here. Where they would
   each make the same local call without a second thought — variable names, internal structure, a tactical choice —
   that is an *implementation detail*, and leaving it open is fine. Open design decision → not ready.
2. **A stateable success signal exists.** The author can name a concrete outcome or behavior that will show the
   work succeeded — the seed of the spec's success criteria. An aspiration too vague to observe ("make it
   cleaner") does not count.
3. **The inbound buffer is drained.** No `## Inbound Buffer — Pending Integration` section remains un-integrated.
   Read for the section; do not drain it — draining is the caller's act, prompted by the not-ready verdict this
   check produces.

The bar is identical at every planning depth. Depth (via [resolve-planning-depth][resolve-planning-depth]) sets
how far a draft travels to clear it — fewer passes at `low` / `medium`, more at `high` — never how high it sits.

### The verdict

Return `{ ready, gaps }`.

- **ready** — all three clear; `gaps` empty.
- **not-ready** — each gap names its shortfall and a kind:
    - **needs-design** — an unmade decision or unshaped direction; the draft must be shaped further before a spec
      can crystallize it.
    - **needs-detail** — the direction holds but a concrete particular (or the success signal) is missing;
      closeable where the draft already stands.

  The method tags each gap; the caller owns the route — `draft-design` iterates on either; `create-spec` resolves
  `needs-detail` inline and returns `needs-design` to drafting. With no draft (`[none]`), assess the stage's
  determinacy confirmation against the same bar.

---

[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[resolve-planning-depth]: resolve-planning-depth.md
