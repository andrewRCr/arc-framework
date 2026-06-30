# Metadata: Compaction Recovery

| **State**     | **Owner** | **Branch**                 | **Class** | **Priority** |
| ------------- | --------- | -------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/compaction-recovery` | `Novel`   | `P3`         |

- **Cohort:** `agent-context-optimization`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-compaction-recovery.md`
- **Task List:** `tasks-compaction-recovery.md`

- **Current Workflow:** integrate-work-unit Step 4 — review iteration
- **Last Completed:** CodeRabbit review pass addressed through `41108ef5`; branch pushed.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 4 — wait for PR #151 CI on the latest pushed branch head; once green, run
  `project/address-pr-review.md` to trigger/respond to CodeRabbit.

- **PR URL:** [PR #151](https://github.com/andrewRCr/arc-framework/pull/151)
- **Completed:** [none]

---

## Release Notes Entry

ARC sessions can now recover deterministically after harness compaction. The framework ships lean compaction
seeds, a recovery audit command, a recovery workflow, a manual fallback skill, and Claude Code / Codex hook
recipes that restore ARC operating context while keeping deliberate clears as ordinary re-initialization.

### Added

- Compaction seed emission and `arc recover audit --json`, including load-set, dirty-path, and task-list cursor
  checks.
- A `session-recover` workflow and `arc-recover` skill for deterministic post-compaction context rehydration.
- Claude Code and Codex CLI hook recipes for pre-compaction seed writes and post-compaction recovery prompts.

### Changed

- Session guidance now treats compaction as recoverable between natural boundaries while keeping handoff as the
  preferred boundary discipline.
- Session status and recovery envelopes expose shared load-set and task-cursor projections for context-load
  recovery.

### Fixed

- Codex recovery markers are scoped per thread or process, fallback markers preserve seed failures, and hook stdout
  stays within Codex's accepted schema.

## Completion Notes

Shipped the compaction-recovery substrate as a cross-harness ARC session recovery path. The work adds a
deterministic seed, shared load-set projection, task-list cursor projection, `arc recover audit --json`,
`session-recover`, `arc-recover`, and opt-in hook recipes for Claude Code and Codex. Together these restore the
procedural ARC floor after compaction without re-running the full session-init dispatch/sync/discovery path.

The main design settlement is the authority split: ARC owns deterministic operating context and coherence checks;
the harness summary owns the volatile "what was happening this second" locus. Recovery therefore reloads the fresh
load set and audits durable drift, but it does not pretend stale meta progress fields reconstruct the current
thought state. OpenCode remains fallback-only because its post-compaction injection surface is still too unstable
for a shipped hook recipe.

The constitutional and workflow cascade reframes compaction as a recoverable discontinuity rather than something
ARC must avoid. Natural-boundary handoff remains the preferred way to get a clean episodic baseline, while
context pressure inside a continuing work segment can compact and recover. The seed stays invocation-neutral, and
self-hosting `npx arc` behavior is carried by harness-local instructions or `ARC_HOOK_ARC_COMMAND`, not by shipped
adopter-facing package content.

Review iteration materially hardened the Codex path: pending markers and seed handoffs are scoped, stale handoffs
are consumed or cleared, fallback markers survive seed failures, unsafe identity segments are rejected, recovery
instructions clear exact marker paths, and PostCompact output now stays inside Codex's accepted hook schema while
still surfacing marker diagnostics through `systemMessage` and marker files. The final remaining CodeRabbit
suggestion to default shipped package hooks to `npx arc` was declined and resolved as an audience-boundary issue.

Verification covered focused unit suites throughout review plus the full local gate set after the final hook fix:
markdown lint, TypeScript lint, shell lint, source and test typecheck, full Vitest suite, build, and
`git diff --check` all pass. PR #151 CI is green on the final pushed head, CodeRabbit review was not re-triggered
after the schema fix, and all review threads are resolved.

---
