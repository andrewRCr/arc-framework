# p9 case C3: rebuild case C's repo fresh, then re-run construct over the mid-loop records with R read from B0 (the
# base the unrewritten members' recorded predecessors carry) instead of the moved chain base.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/c3; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c3; C0=($(cat $SD/.c3))
git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
git add t.txt q.txt n.txt; git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o3; N=($(cat $SD/.o3))
eval "orig_$(declare -f rset)"; rset() { orig_rset "$B0"; }
construct2 $B1 $FT "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 1 > $SD/.m3 2>&1; M=($(cat $SD/.m3))
echo "stable window over mixed records: J=$J R=[$RB] -> [$(tr '\n' ' ' < $SD/.m3)]"
[ ${#M[@]} = 3 ] && echo "trees equal full rebuild? $(for i in 0 1 2; do [ "$(git rev-parse ${M[$i]}^{tree})" = "$(git rev-parse ${N[$i]}^{tree})" ] && printf = || printf '*'; done)  ids equal? $([ "${M[*]}" = "${N[*]}" ] && echo yes || echo no)"
