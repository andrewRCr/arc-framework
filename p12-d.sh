# p12 case D: the pass-twelve reviewer's probe q4, kept as written.
# Reviewer probe q4: p11-h's unbroken chain, no base merge. m1 holds shared s.txt; the terminal appends TWO adjacent
# lines W Z to it. One correction commit fixes m1.txt and removes only Z (part of the terminal's block), placed on m1.
# Control: the correction removes the terminal's whole block W Z (p11-h line shape).
source "$(dirname "$0")/lib8.sh"; SD=$SD8
for v in part whole; do
newrepo $SD/r/q4$v; put base.txt v0; printf '%s\n' a b c d e f > s.txt; git add s.txt; git commit -qm s
git switch -qc wu; put m1.txt m1; printf '%s\n' a b-m1 c d e f > s.txt; git add s.txt; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
put m3.txt m3; printf '%s\n' a b-m1 c d e f W Z > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
printf '%s\n' m1 FIXED > m1.txt
if [ $v = part ]; then printf '%s\n' a b-m1 c d e f W > s.txt; else printf '%s\n' a b-m1 c d e f > s.txt; fi
git add m1.txt s.txt; git commit -qm "fix m1 + drop terminal content"; FT=$(hd)
echo "== $v"; for fu in 1 0; do a=$(FOLDUP=$fu construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a); echo "  FOLDUP=$fu: $a"
[ ${#x[@]} = 3 ] && echo "    terminal vs top: $(complete ${x[2]} $FT)"; done
done
