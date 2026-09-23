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
cmpg() { local tip=$1 top=$2 place=$3 mix=$4 a b
  a=$(construct2 $tip $top "$mix" $place 2>&1 | tr '\n' ' ')
  b=$(construct2 $tip $top "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" $place 2>&1 | tr '\n' ' ')
  echo "  mixed : $a"; echo "  cands : $b"; echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"; }
mix1() { echo "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}"; }
echo "V1: first fix on m3 (above the break), placed on m3; second fix extends it"
setup v1; git reset -q --hard HEAD~1; put m3.txt m3 FIXED; FT=$(hd); construct2 $B1 $FT "$(spans ${C0[@]})" 3 > $SD/.o; N=($(cat $SD/.o))
put m3.txt m3 FIXED FIXED2; T2=$(hd); cmpg $B1 $T2 3 "$(mix1)"
echo "V2: second fix spans m1.txt and m2.txt, placed on m1"
setup v2; printf '%s\n' m1 FIXED FIXED2 > m1.txt; printf '%s\n' m2 X > m2.txt; git add m1.txt m2.txt; git commit -qm span; T2=$(hd)
cmpg $B1 $T2 1 "$(mix1)"
echo "V3a: second fix, then disjoint B2 merged"
setup v3a; put m1.txt m1 FIXED FIXED2; git switch -q main; put api.txt api v2; B2=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; T2=$(hd); cmpg $B2 $T2 1 "$(mix1)"
echo "V3b: disjoint B2 merged, then second fix"
setup v3b; git switch -q main; put api.txt api v2; B2=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; put m1.txt m1 FIXED FIXED2; T2=$(hd); cmpg $B2 $T2 1 "$(mix1)"
echo "V4: a lifecycle record commit between the first fix and the second"
setup v4; put life.md record; put m1.txt m1 FIXED FIXED2; T2=$(hd); cmpg $B1 $T2 1 "$(mix1)"
mix2() { echo "${N[0]} ${N[1]} ${C0[2]}|$B1 ${N[0]} ${C0[1]}"; }
echo "V5: tail pending (m1, m2 rewritten), second fix"
setup v5; put m1.txt m1 FIXED FIXED2; T2=$(hd); cmpg $B1 $T2 1 "$(mix2)"
echo "V6: tail pending, nothing moved (resume)"
setup v6; a=$(construct2 $B1 $FT "$(mix2)" 1 2>&1 | tr '\n' ' '); echo "  mixed : $a"; echo "  N     : ${N[*]}"; echo "  equal : $([ "$a" = "${N[*]} " ] && echo yes || echo NO)"
