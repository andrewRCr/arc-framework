# p9 case A: an UNCUT published chain (boundary commits) whose m2 range holds a conflicting base merge B_x, then an
# overlapping B1 re-anchors. Does the recorded-predecessor window (narrower than the chain base's) leave any raw
# proof divergence outside it?
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/a; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put api.txt api v0 m1; S1=$(hd); put m2.txt m2; put base.txt v0 m2
git switch -q main; put base.txt v0x; BX=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' v0x m2 ADAPT > base.txt; git add base.txt; git commit -q --no-edit; put m2.txt m2 more; S2=$(hd)
put m3.txt m3; put t.txt t T3; S3=$(hd)
B0=$(git merge-base $S1 main)
git switch -q main; put api.txt api v1; put t.txt t MAIN; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' api v1 m1 > api.txt; printf '%s\n' t T3 MAIN > t.txt; git add api.txt t.txt; git commit -q --no-edit
put m1.txt m1 FIXED; FT=$(hd)
construct2 $B1 $FT "$S1 $S2 $S3|$B0 $S1 $S2" 1 > $SD/.o; N=($(cat $SD/.o)); echo "construct: J=$J R(chain base)=[$RB] out=$(wc -l < $SD/.o)"
TOP=$FT; ATOP=$B1
echo "window = chain base B0          : [$(rset $B0)]"
echo "window = m2 recorded pred (S1)  : [$(rset $S1)]"
echo "window = m3 recorded pred (S2)  : [$(rset $S2)]"
echo "m2 raw proof paths: [$(proofpaths $S1 ${N[0]} $S2 ${N[1]})]"
echo "m3 raw proof paths: [$(proofpaths $(norm $S2) $(norm ${N[1]}) $(norm $S3) $(norm ${N[2]}))]"
