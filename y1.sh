# y1: x4's gap-0 shape (the terminal inserts W directly after m1's M1) with the correction only removing W, placed on m1;
# and x3's gap-0 shape (m3 rewrote the line below M1) with the correction only rewriting m3's line.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
for v in removeW fixD3; do newrepo $SD/r/y1$v; put base.txt v0; printf '%s\n' a b c d > s.txt; git add s.txt; git commit -qm s; git switch -qc wu
  put m1.txt m1; printf '%s\n' a b M1 c d > s.txt; git add s.txt; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
  if [ $v = removeW ]; then printf '%s\n' a b M1 W c d > s.txt; else printf '%s\n' a b M1 D3 d > s.txt; fi; put m3.txt m3; git add s.txt; git commit -qm m3s; S3=$(hd)
  B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  if [ $v = removeW ]; then printf '%s\n' a b M1 c d > s.txt; else printf '%s\n' a b M1 DFIX d > s.txt; fi; git add s.txt; git commit -qm corr; FT=$(hd)
  a=$(construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a); echo "$v on m1: $a"; [ ${#x[@]} = 3 ] && echo "  terminal $(complete ${x[2]} $FT)"
done
