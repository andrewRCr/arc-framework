#!/bin/bash
# Project-specific pre-commit check: TypeScript quality gate.
# Called from .husky/pre-commit AFTER check-package-sync.sh.
#
# Dev-only — runs only on staged changes touching the CLI package's TS sources
# or tests. Does NOT ship to adopters via the ARC hook system; adopters configure
# their own quality tooling.
#
# Three commands run in sequence on any staged TS change:
# - eslint <staged files>  — eslint coverage, narrowed to what is being committed
# - npm run typecheck      — production tsconfig (excludes __tests__/)
# - npm run typecheck:test — tsconfig.test.json (covers __tests__/)
#
# All three are needed: production tsconfig excludes tests; vitest's esbuild
# transpile skips typechecking; eslint surfaces issues neither tsc pass does.
# Failures collect through the chain so all three report in one shot.
#
# eslint is per-file, so linting only the staged files loses no coverage the
# whole-package run would have caught in them. The two tsc passes stay
# whole-program: type errors surface in files a change did not touch.
#
# eslint runs from the repository root against package-relative paths; it
# resolves packages/arc-framework/eslint.config.js from each linted file's
# location, so the type-checked rule set applies exactly as `npm run lint:ts`
# would apply it.

# shellcheck source=../.arc/system/.internal/scripts/arc-lib.sh
. .arc/system/.internal/scripts/arc-lib.sh
RED="$ARC_RED"
NC="$ARC_NC"

staged_ts=()
while IFS= read -r staged_file; do
    if [ -n "$staged_file" ]; then
        staged_ts+=("$staged_file")
    fi
done < <(git diff --cached --name-only --diff-filter=ACMR | \
    grep -E '^packages/arc-framework/(src|__tests__)/.*\.ts$' || true)

if [ ${#staged_ts[@]} -eq 0 ]; then
    exit 0
fi

failures=""

if ! npx eslint "${staged_ts[@]}"; then
    failures="${failures}lint:ts\n"
fi
if ! npm run -s typecheck; then
    failures="${failures}typecheck\n"
fi
if ! npm run -s typecheck:test; then
    failures="${failures}typecheck:test\n"
fi

if [ -n "$failures" ]; then
    echo ""
    echo -e "${RED}TypeScript quality gate failed:${NC}"
    echo -e "$failures" | sed '/^$/d' | sed 's/^/   /'
    exit 1
fi

exit 0
