# Metadata: review-architecture

| **State**     | **Owner** | **Branch**                 | **Class** | **Priority** |
| ------------- | --------- | -------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/review-architecture` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-review-architecture.md`
- **Task List:** `tasks-review-architecture.md`

- **Current Workflow:** [none]
- **Last Completed:** Pre-integration chunked review — 37 findings triaged, 10 review-driven fixes committed
- **Next Task:** [none]
- **Blockers:** [none] — one success criterion deferred to `review-surface-binding`, not blocking

- **Next Action:** open the PR after aggregate self-review and fix-delta frontline review

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

ARC now derives review obligations from normalized change and work facts, separates author-side preparation from
independent analysis and host enforcement, and keeps review settlement distinct from lifecycle and merge authority.

- **Added:** Fail-closed review routing, exact-target evidence and applicability contracts, local review continuity,
  structured frontline execution, and channel-neutral finding response.
- **Changed:** Work-unit and Errand integration now use explicit review roles, approved whole-set dispositions,
  resumable exact-head operations, and a fully surfaced provisional candidate tail before merge authorization.
- **Removed:** The ambiguous pre-merge review toggle and legacy review-role overlap between configuration, methods,
  extensions, and workflow-local procedure.
- **Fixed:** Review evidence can no longer silently cross contract versions, target changes, evaluator boundaries,
  disposition authority, or lifecycle readiness boundaries.

## Completion Notes

Delivered a five-layer review architecture spanning canonical change facts, deterministic obligation routing,
versioned exact-target evidence, source-neutral review activities, approved finding response, and honest host-side
enforcement boundaries. The implementation includes strict schema registration and identity derivation, local
receipt and operation-state authorities, structured frontline carrier execution, bounded rerouting, and resilient
integration re-entry for both work units and Errands.

The final design keeps the repository-only review controller inactive as merge authority and preserves the existing
CI gate until separate qualification and promotion work proves the hosted path. Multi-deliverable assurance grouping
also remains separate. Production binding for local independent analysis and additional-rubric delivery was found
unreachable during adversarial verification and routed with concrete implementation loci to
`draft-review-surface-binding.md`; the contract and storage foundations remain delivered without claiming that
deferred capability is operational.

Verification passed Markdown, TypeScript, and shell linting; source and test typechecking; build; 68 ARC contract
tests; and the full 7,632-test suite with one expected skip. Eight bounded pre-integration review passes covered the
production and shipped-methodology surfaces, followed by an aggregate coherence review and focused CodeRabbit CLI
review of the prior fix delta. The final approved disposition set corrected five issues, rejected two unsupported
claims, and selected version-pinned structured agent output with fail-closed parsing; no whole-diff hosted review was
relied upon for this unusually large change set.

---
