# Notes: ci-content-aware-depth

## Contents

- [Local probing gotcha (grep/ugrep)](#local-probing-gotcha-grepugrep)
- [Fixture-dependency evidence for the code-surface set](#fixture-dependency-evidence-for-the-code-surface-set)
- [Ruleset required-checks drift (the spec missed a second gate)](#ruleset-required-checks-drift-the-spec-missed-a-second-gate)

## Local probing gotcha (grep/ugrep)

The on-branch depth predicate was validated locally against 10 path sets. The sandbox aliases `grep` to a `ugrep`
wrapper that mishandles `grep -qv` on multi-line input — the failure that motivates moving the path-set logic into
`scripts/classify-change.sh` with real unit tests rather than ad-hoc inline `grep` in the workflow. Watch for it
when running the offline tests in a sandboxed shell; the extracted script's tests should not depend on `grep -qv`
semantics.

## Fixture-dependency evidence for the code-surface set

The "markdown can't affect tests" assumption fails repo-wide: roughly 165 test files reference `templates` / `arc`
/ `.md` content, and the init / save-load / active-format tests read `packages/arc-framework/{templates,arc}/**`
and `init-recipe.json` as fixtures. This is why the code-surface path set counts that content as code, not docs.
Use this when fixing the exact path membership at implementation — if the offline tests surface a fixture path
outside the listed set, widen the set to cover it.

## Ruleset required-checks drift (the spec missed a second gate)

The spec reasoned that keeping `merge-ok`'s name meant branch protection needed no change, on the premise that
`merge-ok` is the *single* required check (§ Goals; § Non-goals "Renaming `merge-ok`"). That premise held for
classic branch protection (`branches/main/protection` requires `merge-ok`) but **missed a second, independently
configured gate**: the active repository **ruleset `main-protection`** (id `13591109`) had its own
`required_status_checks` rule pinning the two *old* job display names — `Quality Checks` and `Full Test Suite`
(both GitHub Actions, app `15368`).

Two ways that bites once the Task 3.2 renames reach `main`:

- **Stale names never report.** The workflow now emits `Lint, Typecheck & Unit Tests` / `Integration & E2E
  Tests`; the ruleset's old contexts would sit perpetually unsatisfied, deadlocking every PR into `main`.
- **Per-job pins are incompatible with the skip model anyway.** A docs-only PR *skips* the integration/e2e and
  portability jobs, and a skipped check never satisfies a required-check rule — which is the whole reason the
  design funnels the gate through `merge-ok` (always present; rolls up "succeeded **or** skipped").

**Resolved during Phase 4** (surfaced before the verification PR was opened): the `main-protection` ruleset's
`required_status_checks` was rewritten to require only `merge-ok` (other rules — `deletion`, `pull_request`,
`non_fast_forward` — left intact), aligning it with classic protection and the rollup design. Pre-change ruleset
JSON is archived in this session's scratchpad. Takeaway for future check-name changes: **audit both gates
(classic protection *and* rulesets) — they configure required checks independently.**
