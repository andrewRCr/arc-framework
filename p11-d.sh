# p11 case D: the FIRST correction is for the terminal (above the break) and deletes m3.txt; the loop re-anchored and
# rewrote m1 only, then stopped; then a disjoint base B2 moves and the top merges it, so construct is owed over the mixed
# records.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/d1; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
git add t.txt q.txt n.txt; git commit -q --no-edit; git rm -q m3.txt; git commit -qm "first fix: remove m3.txt"; FT=$(hd)
construct2 $B1 $FT "$(spans ${C0[@]})" 3 > $SD/.o; N=($(cat $SD/.o)); echo "candidates N: ${N[*]}  (N terminal $(complete ${N[2]} $FT) vs FT)"
git switch -q main; put api.txt api v2; B2=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; T2=$(hd)
a=$(construct2 $B2 $T2 "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 3 2>&1 | tr '\n' ' ')
b=$(construct2 $B2 $T2 "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" 3 2>&1 | tr '\n' ' ')
x=($a); y=($b)
echo "  mixed : $a -> terminal $(complete ${x[2]} $T2), m3.txt $(git rev-parse -q --verify ${x[2]}:m3.txt >/dev/null && echo present || echo absent)"
echo "  cands : $b -> terminal $(complete ${y[2]} $T2), m3.txt $(git rev-parse -q --verify ${y[2]}:m3.txt >/dev/null && echo present || echo absent)"
echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"
