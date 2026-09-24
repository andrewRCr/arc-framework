# p11 case H: the fold with no break and no base merge (the delta not deferred). One correction commit fixes m1.txt and
# removes the terminal's file, or its line in a shared file, placed on m1: folded at m1 alone, the terminal's
# reapplication restores what the correction removed; folded at every member from the placement up, it does not.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
for v in span line; do
newrepo $SD/r/x0$v; put base.txt v0; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm s
git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; printf '%s\n' a b c M3 > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
printf '%s\n' m1 FIXED > m1.txt; git add m1.txt
if [ $v = span ]; then git rm -q m3.txt; else printf '%s\n' a b c > s.txt; git add s.txt; fi
git commit -qm "fix m1 + remove the terminal's content"; FT=$(hd)
echo "== $v"; a=$(construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a); echo "  $a"
[ ${#x[@]} = 3 ] && echo "  terminal vs top: $(complete ${x[2]} $FT)"
done
