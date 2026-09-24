# p12 case C: the pass-twelve reviewer's probe q3, kept as written.
# Reviewer probe q3: p11-h's unbroken chain, no base merge. One correction commit fixes m1.txt and removes ONE LINE of a
# file only the terminal holds (m3.txt has two lines; the correction drops one), placed on m1. Controls: the whole file
# removed (p11-h span), and the terminal's line in a file m1 also holds (p11-h line).
source "$(dirname "$0")/lib8.sh"; SD=$SD8
for v in fileline span; do
newrepo $SD/r/q3$v; put base.txt v0; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm s
git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); printf '%s\n' x y z > m3.txt; git add m3.txt; git commit -qm m3; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
printf '%s\n' m1 FIXED > m1.txt; git add m1.txt
if [ $v = span ]; then git rm -q m3.txt; else printf '%s\n' x z > m3.txt; git add m3.txt; fi
git commit -qm "fix m1 + remove terminal content"; FT=$(hd)
echo "== $v"; for fu in 1 0; do a=$(FOLDUP=$fu construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a); echo "  FOLDUP=$fu: $a"
[ ${#x[@]} = 3 ] && echo "    terminal vs top: $(complete ${x[2]} $FT)"; done
done
