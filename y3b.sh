# y3b: y3's disjoint arm without a conflict -- a base the top absorbed on a path no member touches, then a fix to m1's
# line one line clear of the terminal's: the fold is clean, and only the terminal absorbs the base.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
w() { printf '%s\n' $2 > $1; git add $1; }
newrepo $SD/r/y3b; put base.txt v0; w s.txt "a b c d e f"; git commit -qm s; git switch -qc wu
put m1.txt m1; w s.txt "a b M1 d e f"; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
put m3.txt m3; w s.txt "a b M1 d E3 f"; git commit -qm m3s; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
git switch -q main; put base.txt v1; B1=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1
w s.txt "a b M1FIXED d E3 f"; git commit -qm fix; FT=$(hd)
a=$(construct2 $B1 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a); echo "gap1: $a"
for k in 0 1 2; do echo "  m$((k+1)) parents: $(git rev-list --parents -1 ${x[$k]} | wc -w | awk '{print $1-1}') base.txt=$(git show ${x[$k]}:base.txt)"; done
