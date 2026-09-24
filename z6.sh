# z6: z2's and z3's shapes -- p11-n's re-anchor, the binding stopped after m1, a correction to m1's file or to q.txt
# placed on m3 or on no member -- continued by recomposing with the recorded top gated to the placement, and by binding
# the chain the stopped run constructed.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
for PL in 3 0; do for FIXF in m1.txt q.txt; do
newrepo $SD/r/z6$PL$FIXF; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
git add t.txt q.txt n.txt; git commit -q --no-edit
if [ $FIXF = m1.txt ]; then put m1.txt m1 FIXED; else printf '%s\n' q m1FIXED ADAPTED > q.txt; git add q.txt; git commit -qm fixq; fi; FT=$(hd)
construct2 $B1 $FT "$(spans ${C0[@]})" $PL > $SD/.o 2>&1; N=($(cat $SD/.o))
c=$(CONT_TOP=$FT CONTPL=1 construct2 $B1 $FT "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" $PL 2>&1 | tr '\n' ' ')
b=$(construct2 $B1 $FT "$(spans ${N[@]})" $PL 2>&1 | tr '\n' ' ')
echo "== placement $PL, fix in $FIXF: gated recomposition equal-N=$([ "$c" = "${N[*]} " ] && echo yes || echo NO); constructed chain bound equal-N=$([ "$b" = "${N[*]} " ] && echo yes || echo NO)"
done; done
