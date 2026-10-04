#!/bin/bash
# Project-specific pre-commit check: TypeScript quality gate.
# Called from .husky/pre-commit AFTER check-package-sync.sh.
#
# Dev-only — runs only on staged changes touching the CLI package's TS sources
# or tests. Does NOT ship to adopters via the ARC hook system; adopters configure
# their own quality tooling.
#
# Three commands run in sequence on any staged TS change:
# - lint:ts:file <staged>  — eslint coverage, narrowed to what is being committed
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
# eslint goes through the npm script rather than a bare npx call, because the
# recorded size/complexity floor in eslint-suppressions.json is keyed relative to
# the directory eslint runs in. lint:ts:file runs with the package as its working
# directory. Its root adapter accepts literal repository-relative staged paths;
# a root-cwd ESLint run resolves no baseline and reports recorded violations as new.
#
# This is narrower than `npm run lint:ts` in one direction: a per-file run cannot
# prune, so a suppression the change made stale passes here and fails the
# whole-project run in CI.
#
# Deliberately no --cache. This lints exactly the files that just changed, so
# every entry is a miss by construction, and measurement confirms it saves
# nothing in that shape. The dominant cost is building the TypeScript program
# the type-aware rules need, which a single miss already pays in full. A cache
# would only pay off when re-linting files that did not change -- which is the
# whole-package run, not this one -- against a cache file to place, ignore, and
# invalidate whenever the config or toolchain moves.

# shellcheck source=../.arc/system/.internal/scripts/arc-lib.sh
. .arc/system/.internal/scripts/arc-lib.sh
RED="$ARC_RED"
NC="$ARC_NC"

staged_ts=()
while IFS= read -r -d '' staged_file; do
    case "$staged_file" in
        packages/arc-framework/src/*.ts|packages/arc-framework/__tests__/*.ts)
            staged_ts+=("$staged_file")
            ;;
    esac
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

if [ ${#staged_ts[@]} -eq 0 ]; then
    exit 0
fi

failures=""

if ! npm run -s lint:ts:file -- "${staged_ts[@]}"; then
    failures="${failures}lint:ts:file\n"
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
