# f6c: a published chain re-anchoring on the bound route, the base merge clean but adapted in a file the terminal edits
# (a departure, so the file is in the recorded resolution), the terminal's line far from the adaptation; a correction
# placed on m1 fixes m1 and removes the terminal's line, in one commit and in two. Construct over the published chain,
# before publication and under BOUND.
source "$(dirname "$0")/${LIB:-lib8.sh}"; SD=$SD8
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t a b c d e f g h; put api.txt api v0
  git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t a b c d e f g h T3; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; put t.txt MAIN t a b c d e f g h; put api.txt api v1; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' MAIN t a b c D e f g h T3 > t.txt; git add t.txt; git commit -q --amend --no-edit; }
run() { local a b; a=$(construct2 $B1 $1 "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); echo "  pre   : $a"; x=($a)
  [ ${#x[@]} = 3 ] && echo "  pre   m1/m3 t.txt: $(git show ${x[0]}:t.txt | tr '\n' ' ')/ $(git show ${x[2]}:t.txt | tr '\n' ' ')"
  b=$(BOUND=1 construct2 $B1 $1 "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); echo "  bound : $b"; x=($b)
  [ ${#x[@]} = 3 ] && echo "  bound m1/m3 t.txt: $(git show ${x[0]}:t.txt | tr '\n' ' ')/ $(git show ${x[2]}:t.txt | tr '\n' ' ')"; }
echo "one commit: fix m1 and drop T3"
setup a; put m1.txt m1 FIXED; printf '%s\n' MAIN t a b c D e f g h > t.txt; git add m1.txt t.txt; git commit -qm fix; run $(hd)
echo "two commits: fix m1, then drop T3"
setup b; put m1.txt m1 FIXED; printf '%s\n' MAIN t a b c D e f g h > t.txt; git add t.txt; git commit -qm drop; run $(hd)
echo "control: fix m1 only"
setup c; put m1.txt m1 FIXED; run $(hd)
