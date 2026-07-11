# Metadata: reviewed-lane-review-gate

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-reviewed-lane-review-gate.md`
- **Task List:** `tasks-reviewed-lane-review-gate.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/224>
- **Completed:** 2026-07-11

---

## Release Notes Entry

Action-neutral PR-open lifecycle extension points replace the single-action `pre-pr-review` hook, giving projects
retry-safe `pre-pr-open` and idempotent `post-pr-open` points that host ordered project actions around PR creation
and open-PR entry, across both work-unit and Errand integration.

### Added

- `pre-pr-open` and `post-pr-open` extension points, fired around PR creation and open-PR entry in the work-unit and
  Errand integration workflows. Each accepts multiple ordered project actions with halt-on-failure semantics.

### Changed

- The final pre-merge review checkpoint now runs at the settled open-PR head, immediately before the integration
  interlock, and re-settles after any review-driven push.
- `diff-review` is clarified as a local author-side preflight — a cheap aggregate self-check before pushing — and
  explicitly not independent review evidence or a default external-provider invocation.

### Removed

- The `pre-pr-review` extension is removed rather than aliased. Installations that customized it must move any
  still-wanted, non-review action to `pre-pr-open` or `post-pr-open`.

### Breaking Changes

- Removing `pre-pr-review` leaves a customized copy inert after update. Relocate its actions to the canonical hook
  matching the intended timing (`pre-pr-open` before creation, `post-pr-open` on open-PR entry).

## Completion Notes

Replaced this repository's CI-only `merge-ok` rollup with a truthful, host- and provider-neutral review core,
delivered shadow-capable. The core (`src/scripts/review-gate/`) composes typed policy, requirements, authenticated
receipts, evidence, coverage/admission, findings, and a merge-readiness verdict with no host, provider, runtime, or
work-unit concepts; a GitHub host adapter, a dedicated private GitHub App identity, a CodeRabbit provider adapter,
and a source-neutral attestation path deploy it here. CI now emits an independent `ci-ok` with a thin compatibility
`merge-ok`; the controller runs shadow (`review-gate-shadow`, non-required). Enforcement cutover is a
deliberately-deferred post-main operation governed by `.github/review-gate.md`.

Alongside the controller, the shipped ARC surface gained the action-neutral `pre-pr-open` / `post-pr-open` lifecycle
extension pair (replacing `pre-pr-review`), wired across work-unit and Errand PR create/resume boundaries, with
`pre-merge-review` moved to the settled open-PR head and `diff-review` clarified as author-side preflight. ADR-028
records the durable decision cluster.

Key plan deviations, all from the two planning-terminus external-contract spikes (recorded in the notes companion):
the CodeRabbit label mechanic is `auto_review.enabled: true` + `labels`, not a blanket `enabled: false`; the App
permission model is `pull-requests: write` (not `issues: write`) for PR ledger comments and the one-shot label, with
`issues` dropped entirely; provider evidence pins CodeRabbit's `coderabbitai[bot]` numeric user id (distinct from the
App's own `performed_via_github_app` receipt authorship); and CodeRabbit CLI joins Codex CLI and Claude Code as a
third named local-analysis mechanism through the attestation path. The spikes confirmed CodeRabbit's satisfying
qualification stays disabled (completion-not-verdict status, mutable-only clean results, untrustworthy thread
resolution); the decisive branch-protection check-source-pinning premise held live.

Verification (Phase 8): all quality gates green (markdown lint, TS/shell lint, source + test typecheck, 4619 tests,
build), 22 success criteria met with none unmet or superseded, and an independent adversarial-verify pass converged
with no blocker or major finding.

Integration: PR-level independent (CodeRabbit) review was intentionally skipped in favor of the per-phase incremental
review chain (six independent passes across Phases 2.5–7.4, each converging to zero) plus the Phase 8 adversarial
verify — the entire code surface already had independent coverage, and a full-PR pass on a ~14k-line diff is the
low-signal case this WU's own thesis argues against. Two unrelated fixes were folded into the integration PR: a stale
ROADMAP hand-render instruction in the integrate workflow, and a CI test-harness flake (git auto-gc racing temp-repo
teardown, fixed by disabling auto-gc in the temp-repo factories). Recorded for the cutover: CodeRabbit's visible
progress check — whose disappearance was the original motivating symptom — reappeared 2026-07-11; the design is
unaffected (the check was always treated as non-authoritative progress evidence), but the cutover's live probe should
record current behavior.
