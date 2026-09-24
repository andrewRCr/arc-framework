# p13 probe x5: x2's gap-0 shape, following the split remedy by hand: revert, re-apply only m1's part (fix M1), construct on m1.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/x5; put base.txt v0; printf '%s\n' a b c d > s.txt; git add s.txt; git commit -qm s; git switch -qc wu
put m1.txt m1; printf '%s\n' a b c d M1 > s.txt; git add s.txt; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
put m3.txt m3; printf '%s\n' a b c d M1 W Z > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
printf '%s\n' a b c d M1FIXED W > s.txt; git add s.txt; git commit -qm "fix M1 + drop Z"; FT=$(hd)
git revert --no-edit HEAD >/dev/null; printf '%s\n' a b c d M1FIXED W Z > s.txt; git add s.txt; git commit -qm "m1 part"; TA=$(hd)
echo "split, m1 part on m1: $(construct2 $B0 $TA "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' ')"
