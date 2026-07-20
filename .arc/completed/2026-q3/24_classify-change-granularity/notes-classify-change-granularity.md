# Notes: classify-change-granularity

## Operating context

- A two-file Markdown-only change during `design-load-settle-point` classified `heavy` on 2026-07-18, providing the
  live cost signal for this work.
- The existing `ci-defer-heavy` PR label provides partial review-cycle relief by skipping integration, end-to-end, and
  portability legs while keeping `ci-ok` red. It is an interim billing control, not the target classifier behavior.

## Related work

- `adopter-content-aware-ci` owns the adopter-facing generalization of this repository mechanism. Cross-reference the
  completed classifier design during that work unit's grooming; no dependency edge is required.
