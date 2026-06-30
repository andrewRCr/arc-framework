# Metadata: ci-content-aware-depth

| **State**     | **Owner** | **Branch**                     | **Class** | **Priority** |
| ------------- | --------- | ------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `chore/ci-content-aware-depth` | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-ci-content-aware-depth.md`
- **Task List:** `tasks-ci-content-aware-depth.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification (all phases done; Tier 3 green)
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 2 — pre-PR review before adopting PR #155

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/155>
- **Completed:** [none]

---

## Release Notes Entry

ARC's development CI now runs expensive code checks only when the change content requires them. Docs-only changes
and PR follow-up pushes whose code tree is already verified can stay light, while unverified code still runs the
full lint/typecheck/unit, integration/e2e, and portability gates.

### Changed

- The CI classifier now emits independent `lane` and `weight` decisions, with `weight=light` for docs-only changes
  or pull-request code trees that already have successful heavy check-runs.
- Markdown and ARC documentation linters now run on every CI lane, while code checks, integration/e2e, and
  portability gate on the content-aware weight decision.
- The code-surface definition treats shipped templates, packaged ARC content, `init-recipe.json`, scripts, package
  configuration, and CI workflow changes as heavy because they can affect tests or the build.

### Fixed

- Docs-only follow-up pushes on code PRs can no longer mask red or incomplete code verification; uncertain,
  unverified, or failed lookbacks run the heavy suite.
- The code-tree identity includes full tree-entry metadata, so mode/type changes cannot reuse an earlier verified
  content hash.

### Infrastructure

- Superseded CI runs for the same ref now cancel automatically.
- `scripts/classify-change.sh` holds the classifier and code-tree hashing logic with unit coverage and shell
  linting.

## Completion Notes

ci-content-aware-depth shipped content-aware CI depth for the self-hosting repo. The final CI graph keeps
`merge-ok` as the single required check, splits the classifier into independent `lane` and `weight` outputs, and
runs the expensive code/test/portability jobs only when the current change is not light. Documentation and ARC
linters continue to run on every lane.

The safety model landed as a Checks-API lookback for pull requests. Docs-only changes are light immediately; code
touches run heavy unless some commit in the PR range carries HEAD's exact code-tree identity and has the full heavy
check set at `success`. The code-tree identity is derived from the same canonical path predicate as the weight
decision and hashes full tree-entry metadata, closing the mode/type drift issue raised during review. Push events
use the actual before-to-after endpoints and run heavy for code touches rather than consulting PR history.

Review iteration hardened several edges: duplicate check-run names collapse to the latest row, the classifier's
`GITHUB_OUTPUT` contract is validated before appending, shell-injected event values moved to environment variables,
doc/ARC linters run on light PR lanes, `merge-ok` survives skipped heavy jobs without masking cancellations, and
the ruleset/classic protection gates now require only `merge-ok`.

Verification covered the offline classifier suite, shell lint, TypeScript lint, test typechecking, diff whitespace,
and live PR sequences for docs-only, verified docs follow-up, red-code-then-docs fail-safe, fixture-as-code heavy
classification, push-delta behavior, superseded-run cancellation, and final GitHub CI. PR #155 is open, no draft
status remains, CodeRabbit has no unresolved threads, and all required checks are green.
