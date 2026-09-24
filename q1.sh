# q1 (pass-15 reviewer probe): p11-a's loop-stopped shape on the bound route, the second correction placed on the
# selected member m1 (the only placement the bound route gives), BOUND=1. Construct over the mixed chain against
# construct over the loop's candidates.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0
  git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
  git add t.txt q.txt n.txt; git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
  construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); }
mix1() { echo "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}"; }
cmpz() { local tip=$1 top=$2 place=$3 a b
  a=$(construct2 $tip $top "$(mix1)" $place 2>&1 | tr '\n' ' '); echo "  mixed : $a"
  b=$(construct2 $tip $top "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" $place 2>&1 | tr '\n' ' '); echo "  cands : $b"
  echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"
  x=($a); [ ${#x[@]} = 3 ] && echo "  mixed terminal m3.txt: $(git rev-parse -q --verify ${x[2]}:m3.txt >/dev/null && echo present || echo absent)"; }
echo "Q1a: second correction deletes m3.txt, placed on m1, BOUND=$BOUND"
setup q1a; git rm -q m3.txt; git commit -qm "remove m3.txt"; T2=$(hd); cmpz $B1 $T2 1
echo "Q1b: second correction removes T3 from shared t.txt, placed on m1, BOUND=$BOUND"
setup q1b; printf '%s\n' t MAIN > t.txt; git add t.txt; git commit -qm "drop T3"; T2=$(hd); cmpz $B1 $T2 1
