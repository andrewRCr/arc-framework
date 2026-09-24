# z1 (pass 14 reviewer): y5's "touching mixed: fix M1, drop Z of m3's W Z" shape on the bound route, with the agent's
# m3 reapplication resolution taking the corrected top's version on the conflicted hunk (drops Z) instead of the
# reapplication alone. Does the bound check admit it (the y6 outcome via the agent)?
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
tset() { local ix; ix=$(mktemp); rm -f $ix; GIT_INDEX_FILE=$ix git read-tree "$1"; shift
  while [ $# -gt 0 ]; do GIT_INDEX_FILE=$ix git update-index --add --cacheinfo 100644,$(printf '%s\n' $2 | git hash-object -w --stdin),$1; shift 2; done
  GIT_INDEX_FILE=$ix git write-tree; rm -f $ix; }
w() { printf '%s\n' $2 > $1; git add $1; }
newrepo $SD/r/z1; put base.txt v0; w s.txt "a b c d"; git commit -qm s; git switch -qc wu
put m1.txt m1; w s.txt "a b c d M1"; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
put m3.txt m3; w s.txt "a b c d M1 W Z"; git commit -qm m3s; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
w s.txt "a b c d M1FIXED W"; git commit -qm corr; FT=$(hd)
F=$(tset $(git rev-parse ${C0[0]}^{tree}) s.txt "a b c d M1FIXED")
for label in "reapplication-alone:a b c d M1FIXED W Z" "top-version:a b c d M1FIXED W"; do
  R=$(tset $(git rev-parse ${C0[2]}^{tree}) s.txt "${label#*:}")
  a=$(BOUND=1 FIX1=$F RES3=$R construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a)
  echo "== ${label%%:*}: $a"
  [ ${#x[@]} = 3 ] && echo "    terminal $(complete ${x[2]} $FT); m3 s.txt=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"
done
