# Notes: ci-content-aware-depth

## Contents

- [Local probing gotcha (grep/ugrep)](#local-probing-gotcha-grepugrep)
- [Fixture-dependency evidence for the code-surface set](#fixture-dependency-evidence-for-the-code-surface-set)

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
