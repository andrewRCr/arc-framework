#!/usr/bin/env bash
# Run every case script from a clean state into results/, then diff each against expected/.
# Usage: ./run.sh [case ...]   (case names as in expected/, e.g. p9-e or reg_b-new; default: all)
set -u
M=$(cd "$(dirname "$0")" && pwd)
cases=("$@")
[ ${#cases[@]} -eq 0 ] && cases=(f5 g-terminal h-structural i-window p9-a p9-a2 p9-b p9-c p9-c2 p9-c3 p9-d p9-e
  p10-f p10-g p10-i p10-u reg_a-overlap reg_b-new reg_b-sources reg_c-checks reg_d-reanchor reg_e-carried)
rm -rf "$M/r" "$M/reg/r" "$M/results"; mkdir -p "$M/results"
fail=0
for c in "${cases[@]}"; do
  s="$M/${c/reg_/reg/}.sh"
  ( cd "$M" && bash "$s" ) > "$M/results/$c.txt" 2>&1
  if [ ! -f "$M/expected/$c.txt" ]; then echo "NEW   $c"
  elif diff -q "$M/expected/$c.txt" "$M/results/$c.txt" > /dev/null; then echo "SAME  $c"
  else echo "DIFF  $c"; fail=1; fi
done
exit $fail
