# p11 cases B and C: as p11-a, with a shared file s.txt outside R(B). B: m2 appends M2 and the terminal M3; the second
# correction removes the terminal's line, then m2's, and the first correction removes m2's; the two lines are apart, so
# removing one does not conflict with the other. C: only the terminal appends
# M3, and the second correction removes it. (B's setup originally left s.txt out of m2, making B2 and B3 no-op commits.)
source "$(dirname "$0")/lib8.sh"; SD=$SD8
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm s
  git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2
  [ -n "$2" ] && { printf '%s\n' a M2 b c > s.txt; git add s.txt; git commit -qm m2s; }; S2=$(hd)
  put m3.txt m3; put t.txt t T3; printf "%s\n" a $2 b c M3 > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
  git add t.txt q.txt n.txt; git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
  construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); }
mix1() { echo "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}"; }
cmpz() { local tip=$1 top=$2 place=$3 a b x y
  a=$(construct2 $tip $top "$(mix1)" $place 2>&1 | tr '\n' ' '); echo "  mixed : $a"
  b=$(construct2 $tip $top "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" $place 2>&1 | tr '\n' ' '); echo "  cands : $b"
  echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"
  x=($a); y=($b)
  [ ${#x[@]} = 3 ] && echo "  mixed: terminal vs top $(complete ${x[2]} $top); s.txt m2=[$(git show ${x[1]}:s.txt | tr '\n' ' ')] m3=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"
  [ ${#y[@]} = 3 ] && echo "  cands: terminal vs top $(complete ${y[2]} $top); s.txt m2=[$(git show ${y[1]}:s.txt | tr '\n' ' ')] m3=[$(git show ${y[2]}:s.txt | tr '\n' ' ')]"
  echo "  top s.txt=[$(git show $top:s.txt | tr '\n' ' ')]"
  echo "  advance from the pre-fix top: $(TOP=$top; o=$(oldtop $top ${C0[2]}); a=$(advance10 $o $top ${N[0]}); echo "$(git log -1 --format=%s $o) -> $(git log -1 --format=%s $a)")"; }
echo "B1: second correction removes the M3 line the terminal appended to shared s.txt (outside R(B)), unplaced"
setup b1 M2; printf '%s\n' a M2 b c > s.txt; git add s.txt; git commit -qm "drop M3"; T2=$(hd); cmpz $B1 $T2 0
echo "B2: second correction removes the M2 line m2 (above the break) added to s.txt, placed on m2"
setup b2 M2; printf '%s\n' a b c M3 > s.txt; git add s.txt; git commit -qm "drop M2"; T2=$(hd); cmpz $B1 $T2 2
echo "B3: the FIRST correction itself is for m2 (above the break) and removes m2's line; loop rewrote m1 (re-anchor) only"
setup b3 M2; git reset -q --hard HEAD~1; printf '%s\n' a b c M3 > s.txt; git add s.txt; git commit -qm "drop M2 (first fix)"; FT=$(hd)
construct2 $B1 $FT "$(spans ${C0[@]})" 2 > $SD/.o; N=($(cat $SD/.o)); echo "  loop candidates N: ${N[*]}"
cmpz $B1 $FT 2
echo "C1: shared s.txt, only the terminal appended M3; the second correction removes M3 (unplaced)"
setup c1; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm "drop M3"; T2=$(hd); cmpz $B1 $T2 0
echo "C2: same, correction placed on the terminal explicitly (3)"
setup c2; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm "drop M3"; T2=$(hd); cmpz $B1 $T2 3
echo "C3: control with carry off (BREAK10=0 ADV10=0) — the pre-advance reading"
setup c3; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm "drop M3"; T2=$(hd); BREAK10=0 ADV10=0 cmpz $B1 $T2 0
