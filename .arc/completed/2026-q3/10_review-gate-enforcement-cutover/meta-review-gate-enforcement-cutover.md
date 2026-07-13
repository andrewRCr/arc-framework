# Metadata: Review Gate Enforcement Cutover

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-review-gate-enforcement-cutover.md`
- **Task List:** `tasks-review-gate-enforcement-cutover.md`

- **Current Workflow:** [none]
- **Last Completed:** Phase 8 — verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/228>
- **Completed:** 2026-07-12

---

## Release Notes Entry

The self-hosting review gate now has a complete inactive controller for exact-head hosted review, passive waiting,
finding settlement, qualification, and outage repair. The machinery remains fail-closed behind the existing CI
authority until its live provider capabilities are qualified and enforcement is promoted separately.

### Added

- Provider-neutral request, receipt, evidence, fallback, settlement, and head-mutability contracts with durable,
  causally bound state across review generations.
- Hosted CodeRabbit and Codex adapters with pinned identities, exclusive trigger windows, exact-head evidence
  parsing, deterministic fallback, and typed developer-authenticated actions.
- Passive aggregate-state waiting, original-conversation finding settlement, one-shot FIX head transitions, and
  repository launchers for review coordination.
- Fail-closed qualification, sanitized evidence, opaque GitHub App token probes, activation derivation, and an
  extraction-ready handoff for future productization.

### Changed

- Pull-request coordination and integration workflows now revalidate review state at the current head and guard
  workflow-driven pushes while a review flight is active or a finding transition lacks authorization.
- Repository review guidance now defines the five-dimension `independent-analysis/v1` rubric used by hosted review.

### Fixed

- Receipt reconstruction now rejects incomplete, incongruent, superseded, or causally mismatched payloads instead
  of allowing malformed controller history to influence aggregate review state.
- Provider evidence, native approvals, ambiguous effects, and degraded storage can no longer independently create a
  successful review projection without the complete qualifying authority chain.

### Infrastructure

- Default-branch qualification, wake-up, attestation, and emergency repair workflows now use explicit least
  privileges, bounded inputs, protected environments, and auditable single-writer status authority.
- Legacy `merge-ok` remains the required live authority; review hooks and provider-policy activation remain inactive
  pending post-merge qualification and promotion.

## Completion Notes

Completed the self-hosting review controller from durable request reservation through exact-head projection,
provider execution, passive waiting, evidence reduction, finding settlement, and emergency repair. The neutral core
depends on injected host, provider, receipt, and projection ports; GitHub mechanics, hosted-provider grammars, and
repository policy remain outside that boundary. Repository launchers and workflows compose the implementation
without adding the private controller to the published CLI graph.

Implementation grounding replaced the unused development receipt shape with one definitive initial schema rather
than preserving compatibility machinery for state that had never been deployed. Live provider qualification and
required-check promotion remain deliberately split into dependent deliveries because protected default-branch code
must ship before it can prove its own hosted behavior. Connected-account unavailability is parser-only until an
admissible unconnected actor path is live-proven; project review hooks stay inactive and legacy CI authority remains
unchanged throughout this delivery.

The delivery also produced a sanitized qualification and extraction handoff, a private evidence boundary, an outage
runbook, and updated technical architecture. Review-driven corrections tightened trigger cleanup, coverage,
credential detection, error provenance, workflow authority, receipt congruence, and the complete FIX lifecycle. An
unrelated load-sensitive notes-compaction fixture encountered during integration was stabilized by flattening only
its synthetic construction history while preserving its 304-entry behavior and assertions. Final integration also
corrected the head-mutability guard to permit settled head transitions while retaining exact authorization for
terminal findings.

Verification passed Markdown, TypeScript, and shell linting; source and test typechecking; build; targeted and full
integration runs; and the complete 5,118-test suite with one expected skip. The final GitHub Actions run passed CI,
integration/E2E, and portability on Ubuntu, macOS, and Windows. All 18 review threads are resolved, the incremental
follow-up found no remaining substantive issue, and the final guard correction passed the full local gate without an
additional provider pass. Alignment checks found no conflict with PROJECT-PRD or TECHNICAL-OVERVIEW: the result
strengthens typed boundaries and preserves judgment-bearing review friction without claiming unproven live
enforcement or expanding the published CLI surface.
