# p12 case M: the exact-member stop on a mixed correction. Three shapes on an unbroken chain with no base merge, each
# as one correction that also fixes m1 ("mixed") and as the later member's part alone: removing one line of the
# terminal's own file (removal), rewriting the hunk m3 rewrote (rewrite), and fixing m1's line while dropping one line
# of the terminal's block in the same file (same-file). Placed on m1 each stops; `mixed?` folds the correction at m1
# with each conflicting hunk, and each path that conflicts whole, taken at m1's version, and asks whether m1 changed.
# Re-placed on m3, a mixed correction's m1 fix lands in m3. The split -- revert on the top, re-apply m1's part and
# construct on m1, re-apply the rest and construct on m3 -- puts each part in its own member.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
mixed() { local m=$1 old=$2 top=$3 out t p ix; out=$(git merge-tree --write-tree -X ours --name-only --merge-base=$old $m $top 2>/dev/null)
  t=$(sed -n 1p <<< "$out"); ix=$(mktemp); GIT_INDEX_FILE=$ix git read-tree $t
  for p in $(sed -n '2,/^$/p' <<< "$out" | sed '/^$/d' | sort -u); do
    if git cat-file -e $m:$p 2>/dev/null; then GIT_INDEX_FILE=$ix git update-index --add --cacheinfo 100644,$(git rev-parse $m:$p),$p
    else GIT_INDEX_FILE=$ix git update-index --force-remove $p; fi; done
  t=$(GIT_INDEX_FILE=$ix git write-tree); rm -f $ix; [ "$t" = "$(git rev-parse $m^{tree})" ] && echo no || echo yes; }
show() { echo "m1.txt in m1=[$(git show $1:m1.txt | tr '\n' ' ')] s.txt in m1=[$(git show $1:s.txt | tr '\n' ' ')]"; }
setup() { newrepo $SD/r/m$1$2; put base.txt v0; printf '%s\n' a b c d e f g h > s.txt; git add s.txt; git commit -qm s; git switch -qc wu
  put m1.txt m1; printf '%s\n' a "b m1" c d e f g h > s.txt; git add s.txt; git commit -qm m1s; S1=$(hd); put m2.txt m2; S2=$(hd)
  case $1 in removal) printf '%s\n' x y z > m3.txt; git add m3.txt; git commit -qm m3; S3=$(hd) ;;
    rewrite) put m3.txt m3; printf '%s\n' a "b m3" c d e f g h > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd) ;;
    same-file) put m3.txt m3; printf '%s\n' a "b m1" c d e f g h W Z > s.txt; git add s.txt; git commit -qm m3s; S3=$(hd) ;; esac
  B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c)); }
part_m1() { case $1 in removal|rewrite) printf '%s\n' m1 FIXED > m1.txt; git add m1.txt ;;
  same-file) sed -i 's/^b m1$/b FIXED/' s.txt; git add s.txt ;; esac; }
part_m3() { case $1 in removal) printf '%s\n' x z > m3.txt; git add m3.txt ;; rewrite) sed -i 's/^b m3$/b FIXED/' s.txt; git add s.txt ;;
  same-file) sed -i '/^Z$/d' s.txt; git add s.txt ;; esac; }
for shape in removal rewrite same-file; do for v in mixed alone; do
  setup $shape $v; [ $v = mixed ] && part_m1 $shape; part_m3 $shape; git commit -qm correction; FT=$(hd)
  echo "== $shape $v"; echo "  on m1: $(construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' ')mixed? $(mixed ${C0[0]} ${C0[2]} $FT)"
  a=$(construct2 $B0 $FT "$(spans ${C0[@]})" 3 2>&1 | tr '\n' ' '); x=($a); echo "  on m3: $a"
  [ ${#x[@]} = 3 ] && echo "    terminal $(complete ${x[2]} $FT); $(show ${x[0]})"
  if [ $v = mixed ]; then git revert --no-edit HEAD > /dev/null; part_m1 $shape; git commit -qm "m1 part"; TA=$(hd)
    a=$(construct2 $B0 $TA "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($a); echo "  split, m1 part on m1: $a"
    part_m3 $shape; git commit -qm "m3 part"; TB=$(hd)
    b=$(construct2 $B0 $TB "$(spans ${x[@]})" 3 2>&1 | tr '\n' ' '); y=($b); echo "  split, the rest on m3: $b"
    [ ${#y[@]} = 3 ] && echo "    terminal $(complete ${y[2]} $TB); m1 kept from the first: $([ ${y[0]} = ${x[0]} ] && echo yes || echo NO); $(show ${y[0]})"
  fi
done; done
