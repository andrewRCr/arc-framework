# p11 case F: the removal cells p11-a, p11-c, and p11-d leave open. F1 and F2 remove a whole file a non-terminal member
# above the break (m2) authored, as the second correction and as the first; F3 removes the terminal's line from a shared
# file outside R(B) as the first correction. Same setup as p11-c (the i-window shape with a shared s.txt, re-anchored,
# the loop stopped after m1); for the first-correction cells a disjoint base B2 then moves so construct is owed.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm s
  git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd)
  put m3.txt m3; put t.txt t T3; printf "%s\n" a b c M3 > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
  git add t.txt q.txt n.txt; git commit -q --no-edit; }
first() { FT=$(hd); construct2 $B1 $FT "$(spans ${C0[@]})" $1 > $SD/.o; N=($(cat $SD/.o)); echo "  loop candidates N: ${N[*]}"; }
movebase() { git switch -q main; put z.txt z; B2=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; T2=$(hd); }
cmpz() { local tip=$1 top=$2 place=$3 a b x y
  a=$(construct2 $tip $top "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" $place 2>&1 | tr '\n' ' '); echo "  mixed : $a"
  b=$(construct2 $tip $top "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" $place 2>&1 | tr '\n' ' '); echo "  cands : $b"
  echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"
  x=($a); y=($b)
  [ ${#x[@]} = 3 ] && echo "  mixed: terminal vs top $(complete ${x[2]} $top); m2.txt $(git rev-parse -q --verify ${x[2]}:m2.txt >/dev/null && echo present || echo absent); s.txt=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"
  [ ${#y[@]} = 3 ] && echo "  cands: terminal vs top $(complete ${y[2]} $top); m2.txt $(git rev-parse -q --verify ${y[2]}:m2.txt >/dev/null && echo present || echo absent); s.txt=[$(git show ${y[2]}:s.txt | tr '\n' ' ')]"; }
echo "F1: the loop stopped after m1's fix; a second correction deletes m2.txt, placed on m2"
setup f1; put m1.txt m1 FIXED; first 1; git rm -q m2.txt; git commit -qm "rm m2.txt"; T2=$(hd); cmpz $B1 $T2 2
echo "F2: the first correction deletes m2.txt, placed on m2; the loop rewrote m1 only; then B2 moves"
setup f2; git rm -q m2.txt; git commit -qm "rm m2.txt (first fix)"; first 2; movebase; cmpz $B2 $T2 2
echo "F3: the first correction removes the terminal's M3 line from s.txt, unplaced; the loop rewrote m1 only; then B2 moves"
setup f3; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm "drop M3 (first fix)"; first 0; movebase; cmpz $B2 $T2 0
