# p9 case C: the i-window (4ae7872f35) shape; after the loop's first rewrite Delivery State records m1 on the
# re-anchored base B1 and m2/m3 on their old predecessors. Re-run construct from those records, chain base = the
# first unlanded member's recorded base (B1), and compare with the full rebuild.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/c; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
git add t.txt q.txt n.txt; git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); echo "full rebuild: J=$J R=[$RB] out=[$(tr '\n' ' ' < $SD/.o)]"
echo "N0 parent is B1 ? $([ "$(git rev-parse ${N[0]}^1)" = "$B1" ] && echo yes || echo no)"
# mixed Delivery State after the first rewrite: m1=(B1,N0) m2=(C0[0],C0[1]) m3=(C0[1],C0[2])
construct2 $B1 $FT "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 1 > $SD/.m 2>&1; echo "re-run over mixed records: J=$J R(chain base B1)=[$RB] out=[$(tr '\n' ' ' < $SD/.m)]"
M=($(cat $SD/.m)); [ ${#M[@]} = 3 ] && echo "same ids as full rebuild? $([ "${M[*]}" = "${N[*]}" ] && echo yes || echo no)"
