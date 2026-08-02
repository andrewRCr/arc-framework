# Metadata: decompose-planning-lane

| **State**     | **Owner** | **Branch**                     | **Class** | **Priority** |
| ------------- | --------- | ------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/decompose-planning-lane` | `Heavy`   | `P2`         |

- **Cohort:** `decompose-transform-integrity`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-decompose-planning-lane.md`
- **Task List:** `tasks-decompose-planning-lane.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Open the pull request

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

Canonical decomposition receipts can now qualify as planning-only changes when all other endpoints are
planning-safe. Classification re-derives receipt evidence from exact Git objects, requires source publication,
and rechecks the live pull-request head and base-branch tip before publishing clearance; ordinary installations
remain reviewed by default and receipt ownership remains unchanged.

- **Added:** Exact-ref classification for one canonical current decomposition receipt alongside otherwise
  planning-only endpoints.
- **Changed:** Decomposition execution now refuses before materialization when a retiring source branch is
  unpublished, stale, malformed, or unreadable.
- **Security:** Clearance publication now confirms the classified head and base are still live, while malformed
  authority fails closed and unreadable evidence remains on the ordinary reviewed path.

## Completion Notes

Delivered the optional planning-lane path for one canonical v3 decomposition receipt. The implementation adds the
remote source-tip precondition, assembles validation facts from the commits that own them, routes callers through
one exact-ref classifier, preserves closed output and failure contracts, and binds host publication to a live
head/base comparison. Package and project host-policy assets remain in parity, and the feature remains default-off.

The proposed receipt-ownership exception was removed after verification showed that matching workflow bytes could
not establish the identity that produced a same-named status. Receipts therefore remain owned, and the broader
choice between `arc-cleared` and a draft-first pull-request lifecycle remains deferred to its durable inbox capture.
The full verification suite passed across Markdown and ARC audits, TypeScript and shell lint, both typechecks, the
production build, and 9,288 tests in 708 files; the focused post-review suite also passed 76 tests.

---
