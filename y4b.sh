# y4b: y4 with resolutions recorded against the composition they resolve (RESDB) and the binding stop's continuation
# carrying the top the stopped run was built from (CONT_TOP). Re-runs over the mixed chain: nothing moved; a disjoint base
# move; a base move on the shared file, which re-anchors the chain -- m2's carry composes before the absorption, so its
# composition, and its recorded resolution, are run 1's. Then the negative: a second correction after run 1's chain was
# adopted meets new compositions, and run 1's records go unused.
source "$(dirname "$0")/lib8.sh"; SD=$SD8; export SHOWKEY=1
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
tset() { local ix; ix=$(mktemp); rm -f $ix; GIT_INDEX_FILE=$ix git read-tree "$1"; shift
  while [ $# -gt 0 ]; do GIT_INDEX_FILE=$ix git update-index --add --cacheinfo 100644,$(printf '%s\n' $2 | git hash-object -w --stdin),$1; shift 2; done
  GIT_INDEX_FILE=$ix git write-tree; rm -f $ix; }
w() { printf '%s\n' $2 > $1; git add $1; }
key() { sed -n 's/.*key=\([0-9a-f:]*\).*/\1/p' <<< "$1" | tr ':' ' '; }
show() { local x=($1); [ ${#x[@]} = 3 ] && echo "    terminal $(complete ${x[2]} $2); s.txt m1=[$(git show ${x[0]}:s.txt | tr '\n' ' ')] m2=[$(git show ${x[1]}:s.txt | tr '\n' ' ')] m3=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"; }
for v in same disjoint shared; do
  newrepo $SD/r/y4b$v; put base.txt v0; w s.txt "a b c d e"; git commit -qm s; git switch -qc wu
  put m1.txt m1; w s.txt "a b M1 d e"; git commit -qm m1s; S1=$(hd)
  put m2.txt m2; w s.txt "a b M1 M2 e"; git commit -qm m2s; S2=$(hd); put m3.txt m3; S3=$(hd)
  B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  w s.txt "a b M1FIXED M2 e"; git commit -qm fix; FT=$(hd); DB=$SD/r/y4b$v.db; : > $DB
  o=$(RESDB=$DB construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1); echo "$(key "$o") $(tset $(git rev-parse ${C0[0]}^{tree}) s.txt "a b M1FIXED d e")" >> $DB
  o=$(RESDB=$DB construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1); echo "$(key "$o") $(tset $(git rev-parse ${C0[1]}^{tree}) s.txt "a b M1FIXED M2 e")" >> $DB
  a=$(RESDB=$DB construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); N=($a)
  MX="${N[0]} ${C0[1]} ${C0[2]}|$B0 ${C0[0]} ${C0[1]}"; TIP=$B0; TOPX=$FT
  if [ $v != same ]; then git switch -q main; [ $v = disjoint ] && put base.txt v1 || { w s.txt "A b c d e"; git commit -qm mainA; }
    TIP=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1 || echo "  (top merge conflicted)"; TOPX=$(hd); fi
  echo "== $v (run 1 recorded $(wc -l < $DB) resolutions)"
  b=$(RESDB=$DB construct2 $TIP $TOPX "$MX" 1 2>&1 | tr '\n' ' '); echo "  without the continuation's top: ${b:0:70}"
  b=$(RESDB=$DB CONT_TOP=$FT construct2 $TIP $TOPX "$MX" 1 2>&1 | tr '\n' ' '); echo "  continuation: ${b:0:130}"; show "$b" $TOPX
  [ $v = same ] && echo "    same objects as run 1: $([ "$a" = "$b" ] && echo yes || echo NO)"
done
echo "== second correction on m1's line after run 1's chain was adopted: its compositions are new, run 1's records unused"
newrepo $SD/r/y4b2; put base.txt v0; w s.txt "a b c d e"; git commit -qm s; git switch -qc wu
put m1.txt m1; w s.txt "a b M1 d e"; git commit -qm m1s; S1=$(hd); put m2.txt m2; w s.txt "a b M1 M2 e"; git commit -qm m2s; S2=$(hd); put m3.txt m3; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
w s.txt "a b M1FIXED M2 e"; git commit -qm fix; FT=$(hd); DB=$SD/r/y4b2.db; : > $DB
o=$(RESDB=$DB construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1); echo "$(key "$o") $(tset $(git rev-parse ${C0[0]}^{tree}) s.txt "a b M1FIXED d e")" >> $DB
o=$(RESDB=$DB construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1); echo "$(key "$o") $(tset $(git rev-parse ${C0[1]}^{tree}) s.txt "a b M1FIXED M2 e")" >> $DB
N=($(RESDB=$DB construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>/dev/null))
w s.txt "a b M1FIXED2 M2 e"; git commit -qm fix2; F2=$(hd)
b=$(RESDB=$DB construct2 $B0 $F2 "$(spans ${N[@]})" 1 2>&1 | tr '\n' ' '); echo "  over the adopted chain: ${b:0:70}"
echo "$(key "$b") $(tset $(git rev-parse ${N[0]}^{tree}) s.txt "a b M1FIXED2 d e")" >> $DB
b=$(RESDB=$DB construct2 $B0 $F2 "$(spans ${N[@]})" 1 2>&1 | tr '\n' ' '); echo "  after m1's new resolution: ${b:0:70}"
echo "$(key "$b") $(tset $(git rev-parse ${N[1]}^{tree}) s.txt "a b M1FIXED2 M2 e")" >> $DB
b=$(RESDB=$DB construct2 $B0 $F2 "$(spans ${N[@]})" 1 2>&1 | tr '\n' ' '); echo "  after m2's: ${b:0:130}"; show "$b" $F2
