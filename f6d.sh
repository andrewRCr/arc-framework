# f6d: the hunk read's re-anchor fallback. m1 authors a line of s.txt the base conflicts with, so re-anchoring the
# break's recorded predecessor conflicts on s.txt and the read keeps that record as it was. m3 adds Z to s.txt: beside
# the resolution (d1), beside the base's clean movement of another hunk (d2), or far from both (d3). The loop stops
# after m1; a second correction removes Z, placed on m1. Mixed chain against the loop's candidates.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
sv() { printf '%s\n' "$@" > s.txt; git add s.txt; }
setup() { newrepo $SD/r/$1; put base.txt v0; sv a b c d e f g h i j k l; git commit -qm s
  git switch -qc wu; put m1.txt m1; sv a "b M1" c d e f g h i j k l; git commit -qm m1s; S1=$(hd)
  put m2.txt m2; S2=$(hd); put m3.txt m3
  case $1 in d1) sv a "b M1" Z c d e f g h i j k l;; d2) sv a "b M1" c d e f g h i j k Z l;; d3) sv a "b M1" c d e f Z g h i j k l;; esac
  git commit -qm m3s; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; sv a "b MAIN" c d e f g h i j "k MAIN" l; git commit -qm main; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1
  case $1 in d1) sv a "b M1 MAIN" Z c d e f g h i j "k MAIN" l;; d2) sv a "b M1 MAIN" c d e f g h i j "k MAIN" Z l;;
    d3) sv a "b M1 MAIN" c d e f Z g h i j "k MAIN" l;; esac
  git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
  construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o 2>&1; N=($(cat $SD/.o)); echo "  N (construct the loop was binding): ${N[*]}"; }
for c in d1 d2 d3; do echo "== $c"; setup $c; [ ${#N[@]} = 3 ] || continue
  grep -v '^Z$' s.txt > s.tmp; mv s.tmp s.txt; git add s.txt; git commit -qm "drop Z"; T2=$(hd)
  a=$(construct2 $B1 $T2 "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 1 2>&1 | tr '\n' ' ')
  b=$(construct2 $B1 $T2 "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" 1 2>&1 | tr '\n' ' ')
  echo "  mixed : $a"; echo "  cands : $b"; echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"
  x=($a); [ ${#x[@]} = 3 ] && echo "  mixed terminal s.txt: [$(git show ${x[2]}:s.txt | tr '\n' ' ')]"
done
