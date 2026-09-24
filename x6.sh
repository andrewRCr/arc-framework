# p13 probe x6: p12-a's b0 span shape at gap 0 — the terminal's line directly below m1's line; one commit fixes m1's
# line and removes the terminal's line. Does the stopped run's own construct even get built?
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/x6; put base.txt v0; printf '%s\n' a b c d e f > s.txt; git add s.txt; git commit -qm s
git switch -qc wu; put m1.txt m1; printf '%s\n' a "b m1" c d e f > s.txt; git add s.txt; git commit -qm m1s; S1=$(hd)
put m2.txt m2; S2=$(hd); put m3.txt m3; printf '%s\n' a "b m1" "Z m3" c d e f > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
printf '%s\n' a "b FIXED" c d e f > s.txt; git add s.txt; git commit -qm "fix m1 + drop Z m3"; FT=$(hd)
echo "stopped run's construct, placed on m1: $(construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' ')"
