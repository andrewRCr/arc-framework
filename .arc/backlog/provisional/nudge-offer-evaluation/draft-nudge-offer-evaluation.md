# Draft: Nudge-Offer Evaluation

- **Origin:** [internal] — captured during `out-of-wu-entry` planning discussion (2026-06-24).
- **State:** Provisional — pre-spec capture, not yet sequenced or vetted (2026-06-24).
- **Purpose:** Evaluate whether ARC's **unprompted housekeep nudge-offers** earn their keep, against the
  direct-intent posture established in `out-of-wu-entry` — keep, trim, or remove.

---

## Problem / Motivation

The unprompted housekeep nudge-offers — the `session-init` Orient-arm soft-offer and the `session-handoff`
offer — may not earn their keep. The developer already knows what's pending and acts when they choose; surfacing
the prompt loads/repeats context that isn't needed for the decision. The instinct is that what's useful is fast,
*direct* intent ("I want to do this now"), not surfaced nudges.

## Approach

Evaluate the nudge-offers against the direct-intent posture established in `out-of-wu-entry` — keep, trim, or
remove. Likely a small design fork plus edits to `session-init` / `session-handoff`. May collapse to an errand
if the conclusion is simply "remove," but it touches load-bearing lifecycle workflows, so size at planning.

## Scope

A broader **nudge-offer philosophy** ("when is an unprompted offer useful vs. noise") that generalizes beyond
housekeep. Orthogonal to `out-of-wu-entry`'s entry-signal work, which deliberately left it out of scope.
