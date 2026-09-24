# Base-moved path outside R(B): the FIRST correction (folded into m1 by the stopped loop) edits api.txt, which the new
# base B1 changed cleanly; the loop stops after m1; the top then absorbs a disjoint B2.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
newrepo $SD/r/e1; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
git add t.txt q.txt n.txt; git commit -q --no-edit
printf '%s\n' m1 FIXED > m1.txt; printf '%s\n' api v1 FIXED > api.txt; git add m1.txt api.txt; git commit -qm "fix m1 + api"; FT=$(hd)
construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); echo "  N: ${N[*]}"
git switch -q main; put z.txt z; B2=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; T2=$(hd)
a=$(construct2 $B2 $T2 "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 1 2>&1 | tr '\n' ' '); x=($a)
b=$(construct2 $B2 $T2 "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" 1 2>&1 | tr '\n' ' '); y=($b)
echo "  mixed: $a"; echo "  cands: $b"; echo "  equal: $([ "$a" = "$b" ] && echo yes || echo NO)"
[ ${#x[@]} = 3 ] && echo "  mixed terminal vs T2: $(complete ${x[2]} $T2)"
