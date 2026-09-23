# Unbroken control for the E3 stop's signature: m1 and m3 share s.txt; a fix placed on m1 edits the line m3 changed.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/u1; put base.txt v0; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm s
git switch -qc wu; printf '%s\n' a M1 b c > s.txt; git add s.txt; git commit -qm m1; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd)
printf '%s\n' a M1 b C3 > s.txt; git add s.txt; git commit -qm m3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C=($(cat $SD/.c))
git switch -q wu; printf '%s\n' a M1 b C3-FIX > s.txt; git add s.txt; git commit -qm fix; T=$(hd)
echo "unbroken chain, fix on m1 touching the line m3 changed in the shared s.txt:"
echo "  -> $(construct2 $B0 $T "$(spans ${C[@]})" 1 2>&1 | tr '\n' ' ')   AU[1]=[$(authored ${C[0]} $B0 $B0)]"
