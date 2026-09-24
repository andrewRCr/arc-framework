# p12 case A: the pass-twelve reviewer's probe q1, kept as written.
# Reviewer probe q1: the p11-s shape narrowed to ONE path. The first correction (folded into m1 by the stopped loop) is
# one commit that fixes m1's line in shared s.txt AND removes the terminal's line in the same s.txt (hunks far apart);
# the loop stops after m1; then the top absorbs a disjoint base B2 so construct is owed.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0; printf '%s\n' a b c d e f g h i j > s.txt; git add s.txt; git commit -qm s
  git switch -qc wu; put m1.txt m1; printf '%s\n' a "b m1" c d e f g h i j > s.txt; git add s.txt; git commit -qm m1s; S1=$(hd)
  put m2.txt m2; S2=$(hd); put m3.txt m3; printf '%s\n' a "b m1" c d e f g h i j "Z m3" > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  if [ "$2" = b1 ]; then git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
    git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; git add t.txt; git commit -q --no-edit; else B1=$B0; git switch -q wu; fi
  if [ "$3" = span ]; then printf '%s\n' a "b FIXED" c d e f g h i j > s.txt; else printf '%s\n' a "b FIXED" c d e f g h i j "Z m3" > s.txt; fi
  git add s.txt; git commit -qm "fix m1 (+ drop Z m3)"; FT=$(hd)
  construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); echo "  N (unbroken construct over FT): ${N[*]}"
  [ ${#N[@]} = 3 ] && echo "  N terminal vs FT: $(complete ${N[2]} $FT)"; }
for b in b0 b1; do for v in span ctl; do echo "== $b $v"
  setup q1$b$v $b $v
  git switch -q main; put z.txt z; B2=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; T2=$(hd)
  a=$(construct2 $B2 $T2 "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 1 2>&1 | tr '\n' ' '); x=($a)
  b2=$(construct2 $B2 $T2 "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" 1 2>&1 | tr '\n' ' '); y=($b2)
  echo "  mixed: $a"; echo "  cands: $b2"; echo "  equal: $([ "$a" = "$b2" ] && echo yes || echo NO)"
  [ ${#x[@]} = 3 ] && echo "  mixed terminal vs T2: $(complete ${x[2]} $T2); s.txt=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"
  [ ${#y[@]} = 3 ] && echo "  cands terminal vs T2: $(complete ${y[2]} $T2); s.txt=[$(git show ${y[2]}:s.txt | tr '\n' ' ')]"
done; done
