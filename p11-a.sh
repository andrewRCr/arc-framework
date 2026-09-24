# p11 case A: the source-top advance's "cherry-pick onto the member below the break is empty" test, against a second
# correction that REMOVES content only members above the break carry. Same setup as p10-i (loop stopped after m1).
source "$(dirname "$0")/lib8.sh"; SD=$SD8
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0
  git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
  git add t.txt q.txt n.txt; git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
  construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); }
mix1() { echo "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}"; }
cmpz() { local tip=$1 top=$2 place=$3 a b x y
  a=$(construct2 $tip $top "$(mix1)" $place 2>&1 | tr '\n' ' '); echo "  mixed : $a  TOLD(after advance)=$(git rev-parse --short $TOLD)"
  b=$(construct2 $tip $top "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" $place 2>&1 | tr '\n' ' '); echo "  cands : $b  TOLD=$(git rev-parse --short $TOLD)"
  echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"
  x=($a); y=($b)
  [ ${#x[@]} = 3 ] && echo "  mixed terminal vs top: $(complete ${x[2]} $top)   m3.txt in mixed terminal: $(git rev-parse -q --verify ${x[2]}:m3.txt >/dev/null && echo present || echo absent)  t.txt=[$(git show ${x[2]}:t.txt | tr '\n' ' ')]"
  [ ${#y[@]} = 3 ] && echo "  cands terminal vs top: $(complete ${y[2]} $top)   m3.txt in cands terminal: $(git rev-parse -q --verify ${y[2]}:m3.txt >/dev/null && echo present || echo absent)  t.txt=[$(git show ${y[2]}:t.txt | tr '\n' ' ')]"
  echo "  top t.txt=[$(git show $top:t.txt | tr '\n' ' ')]"; }
echo "A1: second correction deletes m3.txt (a file only the terminal authored), unplaced (terminal)"
setup a1; git rm -q m3.txt; git commit -qm "remove m3.txt"; T2=$(hd); cmpz $B1 $T2 0
echo "A2: second correction removes the T3 line the terminal added to the shared t.txt, unplaced (terminal)"
setup a2; printf '%s\n' t MAIN > t.txt; git add t.txt; git commit -qm "drop T3"; T2=$(hd); cmpz $B1 $T2 0
echo "A3: control — second correction MODIFIES m3.txt (not a pure removal)"
setup a3; put m3.txt m3 FIXED; T2=$(hd); cmpz $B1 $T2 0
