# z4: the continuation with the placement strictly below the member below the break -- placed on m1, the binding stopped
# after m2. The correction fixes m1's file and removes the terminal's line, six lines above m2's, from the shared file, in
# one commit and in two.
# Continued with the stopped run's placement and top, does it rebuild the full rebuild N; and without the recorded top?
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
for shape in one two; do
newrepo $SD/r/z4$shape; put base.txt v0; printf '%s\n' a b c d e f > s.txt; git add s.txt; git commit -qm s
git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; printf '%s\n' a b c d e f M2 > s.txt; git add s.txt; git commit -qm m2s; S2=$(hd)
put m3.txt m3; printf '%s\n' M3 a b c d e f M2 > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
if [ $shape = one ]; then printf '%s\n' m1 FIXED > m1.txt; printf '%s\n' a b c d e f M2 > s.txt; git add m1.txt s.txt; git commit -qm "fix m1, drop M3"
else printf '%s\n' m1 FIXED > m1.txt; git add m1.txt; git commit -qm "fix m1"; printf '%s\n' a b c d e f M2 > s.txt; git add s.txt; git commit -qm "drop M3"; fi; FT=$(hd)
construct2 $B0 $FT "$(spans ${C0[@]})" 1 > $SD/.o 2>&1; N=($(cat $SD/.o))
echo "== $shape commit(s), placed on m1: N terminal $([ ${#N[@]} = 3 ] && complete ${N[2]} $FT); m3 s.txt=[$(git show ${N[2]}:s.txt | tr '\n' ' ')]"
MX="${N[0]} ${N[1]} ${C0[2]}|$B0 ${N[0]} ${C0[1]}"
c=$(CONT_TOP=$FT construct2 $B0 $FT "$MX" 1 2>&1 | tr '\n' ' '); o=($c)
echo "  continuation (m1, stopped top): equal-N=$([ "$c" = "${N[*]} " ] && echo yes || echo NO) $([ ${#o[@]} = 3 ] && complete ${o[2]} $FT)"
r=$(construct2 $B0 $FT "$MX" 1 2>&1 | tr '\n' ' '); p=($r)
echo "  without the recorded top: equal-N=$([ "$r" = "${N[*]} " ] && echo yes || echo NO) $([ ${#p[@]} = 3 ] && complete ${p[2]} $FT || echo "${r:0:60}")"
done
