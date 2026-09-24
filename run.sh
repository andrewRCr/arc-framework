#!/usr/bin/env bash
# Run every case script from a clean state into results/, then diff each against expected/.
# Usage: ./run.sh [case ...]   (case names as in expected/, e.g. p9-e or reg_b-new; default: all)
set -u
M=$(cd "$(dirname "$0")" && pwd)
cases=("$@")
[ ${#cases[@]} -eq 0 ] && cases=(f5 g-terminal h-structural i-window p9-a p9-a2 p9-b p9-c p9-c2 p9-c3 p9-d p9-e
  p10-f p10-g p10-i p10-u p11-a p11-c p11-d p11-e p11-f p11-g p11-h p11-n p11-s p12-a p12-b p12-c p12-d p12-m p12-s
  x1 x1b x1c x1bc x2 x3 x4 x5 x6 y1 y2 y3 y3b y4 y4b y5 y6 z1 z2 z3 z4 z5 z6
  reg_a-overlap reg_b-new reg_b-sources reg_c-checks reg_d-reanchor reg_e-carried)
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
