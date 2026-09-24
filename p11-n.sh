# p11 case N: a binding stopped after m1 under a re-anchor (the i-window shape), re-run reading each old member's range
# from its list neighbour and from its own recorded predecessor, with the fold at the placed member alone (FOLDUP=0) and
# at every member from the placement up. Beside reg/b-sources G, where the later folds happen to restore what the
# neighbour-read range reversed, here the range also reverses what the re-anchor absorbed, which no fold restores.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/xn; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
git add t.txt q.txt n.txt; git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); echo "full rebuild N: ${N[*]}"
for fu in 1 0; do
own=$(FOLDUP=$fu construct2 $B1 $FT "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 1 2>&1 | tr '\n' ' '); o=($own)
nb=$(FOLDUP=$fu construct2 $B1 $FT "$(nspans ${N[0]} ${C0[1]} ${C0[2]})" 1 2>&1 | tr '\n' ' '); b=($nb)
echo "FOLDUP=$fu own predecessors: $own -> $([ ${#o[@]} = 3 ] && complete ${o[2]} $FT) equal-N=$([ "$own" = "${N[*]} " ] && echo yes || echo NO)"
echo "FOLDUP=$fu list neighbours:  $nb -> $([ ${#b[@]} = 3 ] && complete ${b[2]} $FT) equal-N=$([ "$nb" = "${N[*]} " ] && echo yes || echo NO)"
done
