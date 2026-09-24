# p13 probe x1b: x1's two-commit first correction, nothing else moved; re-run placed on m1 and unplaced. And the
# single-commit control (p12-b's correction) under the same re-runs.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
for shape in two one; do
  newrepo $SD/r/x1b$shape; put base.txt v0; printf '%s\n' a b c d e f > s.txt; git add s.txt; git commit -qm s
  git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; printf '%s\n' a b c d e f M2 > s.txt; git add s.txt; git commit -qm m2s; S2=$(hd)
  put m3.txt m3; S3=$(hd)
  B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  if [ $shape = two ]; then printf '%s\n' m1 FIXED > m1.txt; git add m1.txt; git commit -qm "fix m1"
    printf '%s\n' a b c d e f > s.txt; git add s.txt; git commit -qm "drop M2"
  else printf '%s\n' m1 FIXED > m1.txt; printf '%s\n' a b c d e f > s.txt; git add m1.txt s.txt; git commit -qm "fix m1 + drop M2"; fi; FT=$(hd)
  construct2 $B0 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o))
  for place in 1 0; do
    a=$(construct2 $B0 $FT "${N[0]} ${C0[1]} ${C0[2]}|$B0 ${C0[0]} ${C0[1]}" $place 2>&1 | tr '\n' ' '); x=($a)
    echo "$shape-commit correction, nothing moved, re-run place=$place: equal-to-full-rebuild=$([ "$a" = "${N[*]} " ] && echo yes || echo NO); m2 s.txt=[$(git show ${x[1]}:s.txt | tr '\n' ' ')] terminal $(complete ${x[2]} $FT)"
  done
done
