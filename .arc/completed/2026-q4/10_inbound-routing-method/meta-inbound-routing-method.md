# Metadata: Inbound Routing Method

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-inbound-routing-method.md`
- **Task List:** `tasks-inbound-routing-method.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:526e64488f74c219e7d33866998c3b91439b088adcfda2f2389d7f0ba557f104`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/860>
- **Completed:** 2026-10-09

---

## Release Notes Entry

Discovered work routes through one shared decision gate, with status and design viewing supplying the facts needed
to choose a work-unit home.

### Added

- A shared routing method checks resolved work, the Errand floor, the decision a concern shapes, and the target's
  stated scope before selecting a destination.
- Work-unit status exposes purpose, owner, lifecycle position, and horizon advice for routing decisions.
- Design viewing reads a started work unit's registered checkout, including uncommitted edits, or a locally held
  ref. Path and editor requests give a clear refusal when only a ref is available.
- The inbox skill supports immediate routing through the shared gate.

### Changed

- Routing callers use the same overridable gate, including cascade routing and re-triage of entries being touched.
- Errand classification asks what record the concern needs; infrastructure sensitivity remains a review signal.

### Fixed

- Purpose extraction handles wrapped Markdown and literal backticks, and ignores fields inside examples and comments.
- Design selection rejects path-bearing filenames before checkout or ref artifact reads.
- Artifact-view help descriptions wrap to 80 columns.

## Completion Notes

Delivered the shared disposition, homing, integration, and re-triage gate with its closed vocabulary and routing
doors; the corresponding record-floor guidance, caller updates, templates, and installation inventories; and the
typed status and started-design reads. The current binding retains hold-and-route and isolated Errand execution.
The future binding describes the storage transition without implementing inbound storage, routing receipts, imports,
or pre-transition count thresholds. The final scope aligns with PROJECT-PRD and TECHNICAL-OVERVIEW.

The original historical-parity criterion remains preserved as failed and superseded by the approved A2 calibration
criterion. Verification covered 30 Owner-calibrated replay entries, 107 drain concern rows, and four route-now forms
through classification-only walks, without carry-out writes. The criteria record retains the historical failures
and the version-bound scenario evidence.

The canonical chunked review covered all 87 paths and cross-chunk seams. Its confirmed major Design filename finding
was fixed at the shared selector; all 18 added regression cases failed before the fix and passed afterward. The
requested independent check examined only that three-file increment and found no material defect. Review closed by
explicit Owner acceptance after the verified response, without another canonical pass. The later base merge retained
both routing and review-risk installation assertions and regenerated ROADMAP from the merged lifecycle records.

The resolved base merge passed the complete local gate: 17,129 routine tests passed with 1,188 skipped, and all
15 affected init E2E cases passed. Code lint, shell lint, both type checks, and the declaration build passed before
the inventory-only Markdown correction; their inputs remained unchanged. The corrected documentation and ARC
contracts passed, and the routine suite was rerun successfully. The first merged-tree run remains recorded as failed
on its stale inventory totals. Required CI supplies complete E2E and portability evidence for the final published head.

---
