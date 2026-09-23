# p9 case E: pass-nine F2 candidate rule. The i-window (4ae7872f35) shape re-anchors; the loop rewrites m1 onto B1 and
# stops. Delivery State is mixed: m1=(B1,N0), m2=(C0[0],C0[1]), m3=(C0[1],C0[2]). Then something moves and construct is
# owed. Compare construct over the mixed records with construct over the private candidates the loop was rewriting to
# (N0 N1 N2 on B1 N0 N1), and check the rematerialization proofs from the mixed records land inside each member's
# recorded-predecessor window.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0
  git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
  git add t.txt q.txt n.txt; git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
  construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); }
report() { local tip=$1 top=$2 place=$3 out m
  construct2 $tip $top "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" $place > $SD/.m 2>&1
  echo "  over mixed records : J=$J -> [$(tr '\n' ' ' < $SD/.m)]"
  construct2 $tip $top "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" $place > $SD/.n 2>&1; out=($(cat $SD/.n))
  echo "  over candidates    : J=$J R(chain base)=[$RB] -> $([ ${#out[@]} = 3 ] && echo complete || cat $SD/.n)"
  [ ${#out[@]} = 3 ] || return 0
  TOP=$top; ATOP=$tip
  echo "  m1 recorded (B1,N0) -> new: pred $( [ "$(git rev-parse ${out[0]}^1)" = "$B1" ] && echo B1 || echo moved ), proof [$(proofpaths $B1 $(git rev-parse ${out[0]}^1) ${N[0]} ${out[0]})] window [$(rset $B1)]"
  echo "  m2 recorded (C0_0,C0_1) -> new: proof [$(proofpaths ${C0[0]} ${out[0]} ${C0[1]} ${out[1]})] window [$(rset ${C0[0]})]"
  local ap=${out[1]} am=""; [ "$(git rev-list --parents -n1 ${out[2]}^1 | wc -w)" = 3 ] && { ap=$(git rev-parse ${out[2]}^1); am=" (after-predecessor: its absorption merge)"; }
  echo "  m3 recorded (C0_1,C0_2) -> new$am: proof [$(proofpaths $(norm ${C0[1]}) $(norm $ap) $(norm ${C0[2]}) $(norm ${out[2]}))] window [$(rset ${C0[1]})]"
  echo "  new m2 t.txt=[$(git show ${out[1]}:t.txt | tr '\n' ' ')]  new m3 t.txt=[$(git show ${out[2]}:t.txt | tr '\n' ' ')]  top t.txt=[$(git show $top:t.txt | tr '\n' ' ')]"; }

echo "E1: base B2 moves api.txt (disjoint); the top merges it"
setup e1; git switch -q main; put api.txt api v2; B2=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1 || { printf '%s\n' api v2 > api.txt; git add api.txt; git commit -q --no-edit; }; T2=$(hd)
report $B2 $T2 0

echo "E2: base B2 adds m2.txt (overlaps m2); the top resolves it"
setup e2; git switch -q main; put m2.txt m2 MAIN; B2=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' m2 MERGED > m2.txt; git add m2.txt; git commit -q --no-edit; T2=$(hd)
report $B2 $T2 0

echo "E3: no base move; a second fix on the top for the selected member, placed on m1"
setup e3; put m1.txt m1 FIXED FIXED2; T2=$(hd)
report $B1 $T2 1
