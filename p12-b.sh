# p12 case B: the pass-twelve reviewer's probe q2, kept as written.
# Reviewer probe q2: the first correction (folded into m1 by the stopped loop, placed on m1) fixes m1.txt AND removes the
# M2 line m2 added to shared s.txt (m3 leaves s.txt alone). The loop stops after m1. Then something moves with a
# different placement: (a) a second correction on m3.txt placed on m3; (b) the same, unplaced; (c) control: a disjoint
# base move with the rebuild placed on m1 as the first correction was.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
setup() { newrepo $SD/r/$1; put base.txt v0; printf '%s\n' a b c d e f > s.txt; git add s.txt; git commit -qm s
  git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; printf '%s\n' a b c d e f M2 > s.txt; git add s.txt; git commit -qm m2s; S2=$(hd)
  put m3.txt m3; S3=$(hd)
  B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  printf '%s\n' m1 FIXED > m1.txt; printf '%s\n' a b c d e f > s.txt; git add m1.txt s.txt; git commit -qm "fix m1 + drop M2"; FT=$(hd)
  construct2 $B0 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); echo "  N: ${N[*]}  N terminal vs FT: $(complete ${N[2]} $FT); N m2 s.txt=[$(git show ${N[1]}:s.txt | tr '\n' ' ')]"; }
cmpz() { local tip=$1 top=$2 place=$3 a b x y
  construct2 $tip $top "${N[0]} ${C0[1]} ${C0[2]}|$B0 ${C0[0]} ${C0[1]}" $place > $SD/.m 2>&1; a=$(tr "\n" " " < $SD/.m); echo "  mixed : $a"; x0=($a); [ ${#x0[@]} = 3 ] && echo "  mixed authcheck (own AU): $(authcheck ${x0[@]}); AU3=[${AU[3]}]"
  b=$(construct2 $tip $top "${N[0]} ${N[1]} ${N[2]}|$B0 ${N[0]} ${N[1]}" $place 2>&1 | tr '\n' ' '); echo "  cands : $b"
  echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"; x=($a); y=($b)
  [ ${#x[@]} = 3 ] && echo "  mixed: terminal $(complete ${x[2]} $top); s.txt m2=[$(git show ${x[1]}:s.txt | tr '\n' ' ')] m3=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]; authcheck $(authcheck ${x[@]})"
  [ ${#y[@]} = 3 ] && echo "  cands: terminal $(complete ${y[2]} $top); s.txt m2=[$(git show ${y[1]}:s.txt | tr '\n' ' ')] m3=[$(git show ${y[2]}:s.txt | tr '\n' ' ')]"; }
echo "a: second correction on m3.txt placed on m3"; setup qa; put m3.txt m3 FIXED; T2=$(hd); cmpz $B0 $T2 3
echo "b: second correction on m3.txt unplaced"; setup qb; put m3.txt m3 FIXED; T2=$(hd); cmpz $B0 $T2 0
echo "c: control — disjoint base move, rebuild placed on m1"; setup qc; git switch -q main; put z.txt z; B2=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; T2=$(hd); cmpz $B2 $T2 1
echo "d: disjoint base move, rebuild unplaced"; setup qd; git switch -q main; put z.txt z; B2=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; T2=$(hd); cmpz $B2 $T2 0
