#!/usr/bin/env bash
# Measure the heavyweight E2E anchor inside the CI guest.
#
# Runs the anchor at the workflow's exact invocation, discarding warmups, and
# records per-run wall time alongside the guest's memory across that run.
# Existing as a script rather than a shell loop is the point: single-run and
# concurrent measurements come from one code path, so figures stay comparable
# across phases and guest rebuilds.
#
# At CONCURRENCY > 1 each simultaneous job runs from its own checkout, the way
# two runner services use separate work directories. Sharing one checkout would
# let the test runner's cache serialize the jobs, which is indistinguishable
# from CPU contention in the wall time and would fail a ratio threshold for the
# wrong reason. Memory figures are guest-wide per round, so every job row in a
# round repeats them.
#
# Environment:
#   WARMUPS      discarded rounds before measurement       (default 3)
#   RUNS         measured rounds                           (default 10)
#   CONCURRENCY  simultaneous anchors per round            (default 1)
#   REPO_BASE    checkout root; job N uses "<base>-N"      (default ~/arc)
#                when CONCURRENCY is 1, "<base>" is used unsuffixed
#   OUT          results file, tab-separated               (default ~/anchor-results.tsv)
#   SAMPLE       memory sampling interval, seconds         (default 5)
#   FAILDIR      where a failing job's output is kept       (default ~/anchor-failures)

set -euo pipefail

WARMUPS="${WARMUPS:-3}"
RUNS="${RUNS:-10}"
CONCURRENCY="${CONCURRENCY:-1}"
REPO_BASE="${REPO_BASE:-$HOME/arc}"
OUT="${OUT:-$HOME/anchor-results.tsv}"
SAMPLE="${SAMPLE:-5}"
FAILDIR="${FAILDIR:-$HOME/anchor-failures}"

ANCHOR="__tests__/e2e/command-input-no-input.e2e.test.ts"

# A swapless guest turns memory pressure into an OOM kill rather than swap
# growth, so the kernel log is what carries the memory condition.
started_at="$(date '+%Y-%m-%d %H:%M:%S')"

repo_for_job() {
    if [ "$CONCURRENCY" -eq 1 ]; then
        printf '%s\n' "$REPO_BASE"
    else
        printf '%s-%s\n' "$REPO_BASE" "$1"
    fi
}

run_round() {
    local tag="$1"
    local samples tdir sampler j p rc wall peak_mem min_free min_avail peak_swap
    local pids=()

    samples="$(mktemp)"
    tdir="$(mktemp -d)"

    (
        while :; do
            free -m |
                awk '/^Mem:/{u=$3; f=$4; a=$7} /^Swap:/{s=$3} END{print u, f, a, s}'
            sleep "$SAMPLE"
        done
    ) >"$samples" 2>/dev/null &
    sampler=$!

    for j in $(seq 1 "$CONCURRENCY"); do
        (
            cd "$(repo_for_job "$j")"
            set +e
            /usr/bin/time -f '%e' -o "$tdir/t$j" \
                env VITEST_MAX_WORKERS=1 ARC_E2E_SKIP_BUILD=1 \
                npm run test:e2e -w packages/arc-framework -- \
                "$ANCHOR" --passWithNoTests=false >"$tdir/out$j" 2>&1
            echo "$?" >"$tdir/rc$j"
        ) &
        pids+=("$!")
    done

    for p in "${pids[@]}"; do
        wait "$p" || true
    done

    kill "$sampler" 2>/dev/null || true
    wait "$sampler" 2>/dev/null || true

    peak_mem="$(awk '{ if ($1 > m) m = $1 } END { print m + 0 }' "$samples")"
    min_free="$(awk 'NR == 1 { f = $2 } { if ($2 < f) f = $2 } END { print f + 0 }' "$samples")"
    min_avail="$(awk 'NR == 1 { a = $3 } { if ($3 < a) a = $3 } END { print a + 0 }' "$samples")"
    peak_swap="$(awk '{ if ($4 > s) s = $4 } END { print s + 0 }' "$samples")"

    for j in $(seq 1 "$CONCURRENCY"); do
        rc="$(cat "$tdir/rc$j")"
        # On failure the timer prepends its own diagnostic line, so the elapsed
        # time is the last line, never the whole file. Reading the file whole
        # emits a multi-line field that silently shifts every later column.
        wall="$(tail -n 1 "$tdir/t$j")"

        # A failing job is the result that matters most here, so keep its output
        # instead of discarding it with the round.
        if [ "$rc" != 0 ]; then
            mkdir -p "$FAILDIR"
            cp "$tdir/out$j" "$FAILDIR/${tag}-job${j}.log"
        fi

        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
            "$tag" "$j" "$wall" "$rc" \
            "$peak_mem" "$min_free" "$min_avail" "$peak_swap"
    done

    rm -rf "$samples" "$tdir"
}

printf 'round\tjob\twall_s\trc\tpeak_mem_mb\tmin_free_mb\tmin_avail_mb\tpeak_swap_mb\n' >"$OUT"

i=1
while [ "$i" -le "$WARMUPS" ]; do
    run_round "warmup-$i" >>"$OUT"
    i=$((i + 1))
done

i=1
while [ "$i" -le "$RUNS" ]; do
    run_round "run-$i" >>"$OUT"
    i=$((i + 1))
done

echo "== results (concurrency ${CONCURRENCY}) =="
cat "$OUT"

echo
echo "== kernel OOM events since ${started_at} =="
if journalctl -k --since "$started_at" 2>/dev/null |
    grep -iE 'out of memory|oom-kill|oom_reaper'; then
    echo "OOM EVENTS PRESENT"
else
    echo "none"
fi

echo "BENCH COMPLETE"
