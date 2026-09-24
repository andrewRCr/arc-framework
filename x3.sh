# p13 probe x3: a correction that fixes ONLY m1's line, where the line directly below it is one the terminal rewrote
# (adjacent, not overlapping); and at gap 1. mixed? is p12-m's check verbatim.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
mixed() { local m=$1 old=$2 top=$3 out t p ix; out=$(git merge-tree --write-tree -X ours --name-only --merge-base=$old $m $top 2>/dev/null)
  t=$(sed -n 1p <<< "$out"); ix=$(mktemp); GIT_INDEX_FILE=$ix git read-tree $t
  for p in $(sed -n '2,/^$/p' <<< "$out" | sed '/^$/d' | sort -u); do
    if git cat-file -e $m:$p 2>/dev/null; then GIT_INDEX_FILE=$ix git update-index --add --cacheinfo 100644,$(git rev-parse $m:$p),$p
    else GIT_INDEX_FILE=$ix git update-index --force-remove $p; fi; done
  t=$(GIT_INDEX_FILE=$ix git write-tree); rm -f $ix; [ "$t" = "$(git rev-parse $m^{tree})" ] && echo no || echo yes; }
for gap in 0 1; do
  newrepo $SD/r/x3g$gap; put base.txt v0; printf '%s\n' a b c d > s.txt; git add s.txt; git commit -qm s; git switch -qc wu
  pad=(); for ((i=0;i<gap;i++)); do pad+=("p$i"); done
  put m1.txt m1; printf '%s\n' a b M1 "${pad[@]}" d e > s.txt; git add s.txt; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
  put m3.txt m3; printf '%s\n' a b M1 "${pad[@]}" D3 e > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd)
  B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  printf '%s\n' a b M1FIXED "${pad[@]}" D3 e > s.txt; git add s.txt; git commit -qm "fix M1 only"; FT=$(hd)
  echo "== gap $gap"; a=$(construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); echo "  on m1: $a mixed? $(mixed ${C0[0]} ${C0[2]} $FT)"
  x=($a); [ ${#x[@]} = 3 ] && echo "    s.txt in m1=[$(git show ${x[0]}:s.txt | tr '\n' ' ')] terminal $(complete ${x[2]} $FT)"
  a=$(construct2 $B0 $FT "$(spans ${C0[@]})" 3 2>&1 | tr '\n' ' '); x=($a); echo "  on m3: $a"
  [ ${#x[@]} = 3 ] && echo "    terminal $(complete ${x[2]} $FT); s.txt in m1=[$(git show ${x[0]}:s.txt | tr '\n' ' ')] in m3=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"
done
