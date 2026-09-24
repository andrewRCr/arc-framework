# z3 (pass 14 reviewer): z2 unplaced (the delta to the terminal).
# raised on m3 whose fix edits code m1 introduced -- is unplaced. The binding stops after m1, and is continued with
# the recorded placement (m3) and top (CONT_TOP). Does the continuation rebuild the full rebuild N?
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
for FIXF in m1.txt q.txt; do
newrepo $SD/r/z3$FIXF; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
git add t.txt q.txt n.txt; git commit -q --no-edit
if [ $FIXF = m1.txt ]; then put m1.txt m1 FIXED; else printf '%s\n' q m1FIXED ADAPTED > q.txt; git add q.txt; git commit -qm fixq; fi; FT=$(hd)
echo "== fix in $FIXF, unplaced"
construct2 $B1 $FT "$(spans ${C0[@]})" 0 > $SD/.o 2>&1; N=($(cat $SD/.o)); echo "  full rebuild N: ${N[*]} -> $([ ${#N[@]} = 3 ] && complete ${N[2]} $FT)"
[ ${#N[@]} = 3 ] && echo "  N m1 $FIXF=[$(git show ${N[0]}:$FIXF | tr '\n' ' ')] m3 $FIXF=[$(git show ${N[2]}:$FIXF | tr '\n' ' ')]"
c=$(CONT_TOP=$FT construct2 $B1 $FT "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 0 2>&1 | tr '\n' ' '); o=($c)
echo "  continuation (m3, stopped top): $c -> $([ ${#o[@]} = 3 ] && complete ${o[2]} $FT) equal-N=$([ "$c" = "${N[*]} " ] && echo yes || echo NO)"
[ ${#o[@]} = 3 ] && echo "  cont m3 $FIXF=[$(git show ${o[2]}:$FIXF | tr '\n' ' ')]"
r=$(construct2 $B1 $FT "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 0 2>&1 | tr '\n' ' '); p=($r)
echo "  same run without CONT_TOP (cherry-pick test alone): $r -> $([ ${#p[@]} = 3 ] && complete ${p[2]} $FT) equal-N=$([ "$r" = "${N[*]} " ] && echo yes || echo NO)"
done
