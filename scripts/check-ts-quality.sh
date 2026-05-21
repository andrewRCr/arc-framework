#!/bin/bash
# Project-specific pre-commit check: TypeScript quality gate.
# Called from .husky/pre-commit AFTER check-package-sync.sh.
#
# Dev-only — runs only on staged changes touching the CLI package's TS sources
# or tests. Does NOT ship to adopters via the ARC hook system; adopters configure
# their own quality tooling.
#
# Three commands run in sequence on any staged TS change:
# - npm run lint:ts        — eslint coverage
# - npm run typecheck      — production tsconfig (excludes __tests__/)
# - npm run typecheck:test — tsconfig.test.json (covers __tests__/)
#
# All three are needed: production tsconfig excludes tests; vitest's esbuild
# transpile skips typechecking; eslint surfaces issues neither tsc pass does.
# Failures collect through the chain so all three report in one shot.

. .arc/system/.internal/scripts/arc-lib.sh
RED="$ARC_RED"
NC="$ARC_NC"

staged_ts=$(git diff --cached --name-only --diff-filter=ACMR | \
    grep -E '^packages/arc-framework/(src|__tests__)/.*\.ts$' || true)

if [ -z "$staged_ts" ]; then
    exit 0
fi

failures=""

if ! npm run -s lint:ts; then
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
