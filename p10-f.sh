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
cmpf() { local tip=$1 top=$2 place=$3 a b
  a=$(construct2 $tip $top "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" $place 2>&1 | tr '\n' ' ')
  b=$(construct2 $tip $top "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" $place 2>&1 | tr '\n' ' ')
  echo "  mixed (D-B) : $a"; echo "  candidates  : $b"; echo "  ids equal   : $([ "$a" = "$b" ] && echo yes || echo NO)"
  local x=($a) y=($b) k; [ ${#x[@]} = 3 ] && [ ${#y[@]} = 3 ] && for k in 0 1 2; do
    echo "   m$((k+1)) tree equal: $([ "$(git rev-parse ${x[$k]}^{tree})" = "$(git rev-parse ${y[$k]}^{tree})" ] && echo yes || { echo NO; git diff --stat ${y[$k]} ${x[$k]}; })  parents equal: $([ "$(git rev-list --parents -n1 ${x[$k]} | cut -d' ' -f2- )" = "$(git rev-list --parents -n1 ${y[$k]} | cut -d' ' -f2-)" ] && echo yes || echo NO)"; done; }
echo "R0: nothing moved (resume): construct over the mixed records vs the candidates N"
setup r0; a=$(construct2 $B1 $FT "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 1 2>&1 | tr '\n' ' ')
echo "  mixed (D-B) : $a"; echo "  N           : ${N[*]}"; echo "  ids equal   : $([ "$a" = "${N[*]} " ] && echo yes || echo NO)"
echo "E1: base B2 moves api.txt (disjoint); the top merges it"
setup e1; git switch -q main; put api.txt api v2; B2=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1 || { printf '%s\n' api v2 > api.txt; git add api.txt; git commit -q --no-edit; }; T2=$(hd)
cmpf $B2 $T2 0; cmpf $B2 $T2 1
echo "E2: base B2 adds m2.txt (overlaps m2); the top resolves it"
setup e2; git switch -q main; put m2.txt m2 MAIN; B2=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' m2 MERGED > m2.txt; git add m2.txt; git commit -q --no-edit; T2=$(hd)
cmpf $B2 $T2 0; cmpf $B2 $T2 1
echo "E4: base B2 moves q.txt (overlaps m1, the rewritten member); the top resolves it"
setup e4; git switch -q main; put q.txt q MAIN2; B2=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' q m1 ADAPTED MAIN2 > q.txt; git add q.txt; git commit -q --no-edit; T2=$(hd)
cmpf $B2 $T2 0; cmpf $B2 $T2 1
echo "E3: no base move; a second fix on the top for the selected member, placed on m1"
setup e3; put m1.txt m1 FIXED FIXED2; T2=$(hd)
cmpf $B1 $T2 1
