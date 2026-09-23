# Spike 8i: pass-eight finding 1 — the proof's R window across rematerialization's loop (4ae7872f35 shape, re-anchor)
source "$(dirname "$0")/lib8.sh"; SD=$SD8
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0
  git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c)); }
setup w; git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
git add t.txt q.txt n.txt; git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); echo "construct: J=$J R(chain base)=[$RB]"
TOP=$FT; ATOP=$B1
echo "window = old chain base B0          : [$(rset $B0)]"
echo "window = m1's recorded base (B0)    : [$(rset $(git rev-parse ${C0[0]}^1))]"
echo "window = m2's recorded base (old m1): [$(rset ${C0[0]})]"
echo "window = m3's recorded base (old m2): [$(rset ${C0[1]})]"
echo "window = B1 (target after 1st rewrite, and the re-anchored snapshot's chain base): [$(rset $B1)]"
echo "proofs, old -> new: m2 [$(proofpaths ${C0[0]} ${N[0]} ${C0[1]} ${N[1]})]  m3 [$(proofpaths $(norm ${C0[1]}) $(norm ${N[1]}) $(norm ${C0[2]}) $(norm ${N[2]}))]"
