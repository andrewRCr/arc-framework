#!/usr/bin/env bash
# Measure the heavyweight E2E anchor inside the CI guest.
#
# Runs the anchor at the workflow's exact invocation, discarding warmups, and
# records per-run wall time alongside peak memory and swap sampled across that
# run. Existing as a script rather than a shell loop is the point: every
# repetition, and every later concurrency check, comes from one code path, so
# the numbers are comparable across runs, phases, and guest rebuilds.
#
# Environment:
#   WARMUPS   discarded runs before measurement          (default 3)
#   RUNS      measured runs                              (default 10)
#   REPO      checkout root inside the guest             (default ~/arc)
#   OUT       results file, tab-separated                (default ~/anchor-results.tsv)
#   SAMPLE    memory sampling interval, seconds          (default 5)

set -euo pipefail

WARMUPS="${WARMUPS:-3}"
RUNS="${RUNS:-10}"
REPO="${REPO:-$HOME/arc}"
OUT="${OUT:-$HOME/anchor-results.tsv}"
SAMPLE="${SAMPLE:-5}"

ANCHOR="__tests__/e2e/command-input-no-input.e2e.test.ts"

cd "$REPO"

# A swapless guest turns memory pressure into an OOM kill rather than swap
# growth, so the kernel log is what carries the gate's memory condition.
started_at="$(date '+%Y-%m-%d %H:%M:%S')"

run_once() {
    local tag="$1"
    local samples timing sampler rc wall peak_mem peak_swap

    samples="$(mktemp)"
    timing="$(mktemp)"

    (
        while :; do
            free -m | awk '/^Mem:/{m=$3} /^Swap:/{s=$3} END{print m, s}'
            sleep "$SAMPLE"
        done
    ) >"$samples" 2>/dev/null &
    sampler=$!

    set +e
    /usr/bin/time -f '%e' -o "$timing" \
        env VITEST_MAX_WORKERS=1 ARC_E2E_SKIP_BUILD=1 \
        npm run test:e2e -w packages/arc-framework -- \
        "$ANCHOR" --passWithNoTests=false >/dev/null 2>&1
    rc=$?
    set -e

    kill "$sampler" 2>/dev/null || true
    wait "$sampler" 2>/dev/null || true

    wall="$(cat "$timing")"
    peak_mem="$(awk '{ if ($1 > m) m = $1 } END { print m + 0 }' "$samples")"
    peak_swap="$(awk '{ if ($2 > s) s = $2 } END { print s + 0 }' "$samples")"

    rm -f "$samples" "$timing"

    printf '%s\t%s\t%s\t%s\t%s\n' "$tag" "$wall" "$peak_mem" "$peak_swap" "$rc"
}

printf 'tag\twall_s\tpeak_mem_mb\tpeak_swap_mb\trc\n' >"$OUT"

i=1
while [ "$i" -le "$WARMUPS" ]; do
    run_once "warmup-$i" >>"$OUT"
    i=$((i + 1))
done

i=1
while [ "$i" -le "$RUNS" ]; do
    run_once "run-$i" >>"$OUT"
    i=$((i + 1))
done

echo "== results =="
cat "$OUT"

echo
echo "== kernel OOM events since ${started_at} =="
if journalctl -k --since "$started_at" 2>/dev/null |
    grep -iE 'out of memory|oom-kill|oom_reaper'; then
    echo "OOM EVENTS PRESENT"
else
    echo "none"
fi

echo
echo "== swap devices =="
if swapon --show | grep -q .; then
    swapon --show
else
    echo "none"
fi

echo "BENCH COMPLETE"
