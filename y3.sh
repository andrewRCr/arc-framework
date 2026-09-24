# y3: resolve-and-continue with the top absorbing a newer base -- disjoint (the terminal absorbs it) and on the shared
# file one line clear of the members' edits (the chain re-anchors). RES1 is the agent's m1; TERMRES the terminal's top.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
tset() { local ix; ix=$(mktemp); rm -f $ix; GIT_INDEX_FILE=$ix git read-tree "$1"; shift
  while [ $# -gt 0 ]; do GIT_INDEX_FILE=$ix git update-index --add --cacheinfo 100644,$(printf '%s\n' $2 | git hash-object -w --stdin),$1; shift 2; done
  GIT_INDEX_FILE=$ix git write-tree; rm -f $ix; }
w() { printf '%s\n' $2 > $1; git add $1; }
for v in disjoint shared; do
  newrepo $SD/r/y3$v; put base.txt v0; w s.txt "a b c d e"; git commit -qm s; git switch -qc wu
  put m1.txt m1; w s.txt "a b M1 d e"; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
  put m3.txt m3; w s.txt "a b M1 D3 e"; git commit -qm m3s; S3=$(hd)
  B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; if [ $v = disjoint ]; then put base.txt v1; else w s.txt "A b c d e"; git commit -qm mainA; fi; B1=$(hd)
  git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1 || echo "  (top merge conflicted)"
  if [ $v = disjoint ]; then w s.txt "a b M1FIXED D3 e"; R="a b M1FIXED d e"; else w s.txt "A b M1FIXED D3 e"; R="A b M1FIXED d e"; fi
  git commit -qm fix; FT=$(hd)
  RES=$(tset $(git rev-parse ${C0[0]}^{tree}) s.txt "$R")
  echo "== $v"; echo "  plain: $(construct2 $B1 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' ')"
  a=$(FIX1=$RES TERMRES=1 construct2 $B1 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a); echo "  RES1+TERMRES: $a"
  [ ${#x[@]} = 3 ] && { echo "    terminal $(complete ${x[2]} $FT); m1 s.txt=[$(git show ${x[0]}:s.txt | tr '\n' ' ')] m3 s.txt=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"
    for k in 0 1 2; do echo "    m$((k+1)) s.txt=[$(git show ${x[$k]}:s.txt | tr "\n" " ")] parents: $(git rev-list --parents -1 ${x[$k]} | wc -w | awk '{print $1-1}') authored: $(git diff --name-only ${x[$k]}^1 ${x[$k]} | tr '\n' ' ')"; done; }
done
