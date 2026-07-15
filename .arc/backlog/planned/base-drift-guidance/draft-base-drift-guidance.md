# Draft: base-drift-guidance

- **Origin:** FP session-init reported 17 raw commits of base drift after one sibling integration, while suggesting
  a rebase that concurrent-work doctrine forbids for pushed branches.
- **Purpose:** Make base-drift guidance describe integration-level movement, distinguish meaningful overlap from
  derived-artifact churn, and recommend the safe append-only reconciliation action.

---

## Problem / Motivation

Under routine parallelism, one merged sibling contributes its whole branch history to every other branch's raw
behind count. The current prompt therefore turns normal progress into an alarming large number, gives an
off-doctrine rebase suggestion, and weighs regenerate-wins paths such as `ROADMAP.md` like substantive code
overlap. Repeated false urgency trains operators to ignore the surface that should flag genuine contention.

## Candidate Shape

- Summarize first-parent integrations ahead of the branch and name the corresponding work units or PRs when the
  available lifecycle/host data can do so without guessing.
- Recommend merging base forward for a pushed branch; never recommend rewriting published history.
- Classify derived artifacts separately from substantive overlap, with regeneration as their recovery.
- Render routine sibling integration calmly and reserve attention-level language for overlap on actively edited,
  non-derived paths.
- Degrade honestly when integration identity or overlap classification is unavailable.

## Design Questions

- Whether derived-path knowledge remains a contained `ROADMAP.md` rule or uses a small reusable file-classification
  seam.
- Which existing lifecycle and PR surfaces can name first-parent integrations without coupling prompt composition
  to tracked planning-artifact paths.
- How much overlap analysis belongs at session-init versus the integration-time behind-base gate.

## Coordination

FP consumes this surface in later burn-in sessions and retains verification. Keep the fix compatible with the
append-only concurrent-work doctrine and avoid building new notes-specific machinery; the prompt is code-repository
base guidance, independent of the user-state backing-store transition.

---
