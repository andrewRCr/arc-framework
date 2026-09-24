# y5: y2's shapes on the bound route (BOUND=1: every member but the placed one must be its range's reapplication on its
# rebuilt predecessor, a reapplication the agent resolved admitted as named). FIX1 is the agent's m1 after its fold,
# RES3 the agent's m3 reapplication; no TERMRES. A fold that still changes m3 stops (S1). Then the split of the mixed
# shape: the correction reverted on the top, m1's part re-applied alone.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
tset() { local ix; ix=$(mktemp); rm -f $ix; GIT_INDEX_FILE=$ix git read-tree "$1"; shift
  while [ $# -gt 0 ]; do if [ "$2" = "-" ]; then GIT_INDEX_FILE=$ix git update-index --force-remove "$1"
    else GIT_INDEX_FILE=$ix git update-index --add --cacheinfo 100644,$(printf '%s\n' $2 | git hash-object -w --stdin),$1; fi; shift 2; done
  GIT_INDEX_FILE=$ix git write-tree; rm -f $ix; }
w() { printf '%s\n' $2 > $1; git add $1; }
run() { local name=$1 fix1=$2 res3=$3
  B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git commit -qm corr; FT=$(hd); echo "== $name"
  F=$(eval tset $(git rev-parse ${C0[0]}^{tree}) $fix1); R=""; [ -n "$res3" ] && R=$(eval tset $(git rev-parse ${C0[2]}^{tree}) $res3)
  a=$(BOUND=1 FIX1=$F RES3=$R construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a); echo "  bound: $a"
  [ ${#x[@]} = 3 ] && echo "    terminal $(complete ${x[2]} $FT); m1 s.txt=[$(git show ${x[0]}:s.txt | tr '\n' ' ')] m3 s.txt=[$(git show ${x[2]}:s.txt | tr '\n' ' ')] m1 changed: $([ "$(git rev-parse ${x[0]}^{tree})" = "$(git rev-parse ${C0[0]}^{tree})" ] && echo no || echo yes)"
  [ ${#x[@]} = 3 ] || echo "    m1 changed by its resolution: $([ "$F" = "$(git rev-parse ${C0[0]}^{tree})" ] && echo no || echo yes)"; }
repo() { newrepo $SD/r/y5$1; put base.txt v0; w s.txt "$2"; git commit -qm s; git switch -qc wu; }
repo touch "a b c d e"; put m1.txt m1; w s.txt "a b M1 d e"; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
  put m3.txt m3; w s.txt "a b M1 D3 e"; git commit -qm m3s; S3=$(hd); w s.txt "a b M1FIXED D3 e"
  run "touching: fix m1's line, m3 rewrote the next" 's.txt "a b M1FIXED d e"' 's.txt "a b M1FIXED D3 e"'
repo sameblock "a b c d"; put m1.txt m1; w s.txt "a b c d M1"; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
  put m3.txt m3; w s.txt "a b c d M1 W Z"; git commit -qm m3s; S3=$(hd); w s.txt "a b c d M1FIXED W"
  run "touching mixed: fix M1, drop Z of m3's W Z" 's.txt "a b c d M1FIXED"' 's.txt "a b c d M1FIXED W Z"'
  git revert --no-edit HEAD >/dev/null; w s.txt "a b c d M1FIXED W Z"; git commit -qm "m1's part"; FT2=$(hd)
  F=$(tset $(git rev-parse ${C0[0]}^{tree}) s.txt "a b c d M1FIXED"); R=$(tset $(git rev-parse ${C0[2]}^{tree}) s.txt "a b c d M1FIXED W Z")
  a=$(BOUND=1 FIX1=$F RES3=$R construct2 $B0 $FT2 "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a); echo "  split, m1's part: $a"
  [ ${#x[@]} = 3 ] && echo "    terminal $(complete ${x[2]} $FT2); m1 s.txt=[$(git show ${x[0]}:s.txt | tr '\n' ' ')] m3 s.txt=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]; the rest (drop Z) remains terminal work"
repo insert "a b c d"; put m1.txt m1; w s.txt "a b M1 c d"; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
  put m3.txt m3; w s.txt "a b M1 W c d"; git commit -qm m3s; S3=$(hd); w s.txt "a b M1FIXED c d"
  run "touching mixed: fix M1, remove m3's W" 's.txt "a b M1FIXED c d"' 's.txt "a b M1FIXED W c d"'
repo rewrite "a b c"; put m1.txt m1; w s.txt "a b.m1 c"; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
  put m3.txt m3; w s.txt "a b.m3 c"; git commit -qm m3s; S3=$(hd); w s.txt "a b.FIXED c"
  run "wholly later: fix m3's rewritten hunk; m1 keeps its own" '' ''
repo removal "a b c"; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); w m3.txt "x y z"; git commit -qm m3; S3=$(hd)
  w m1.txt "m1 FIXED"; w m3.txt "x z"; run "mixed removal: fix m1, drop a line of m3's own file" 'm1.txt "m1 FIXED"' ''
