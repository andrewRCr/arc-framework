# f6a: a published chain re-anchoring on the bound route, the base merge resolving a file the terminal edits; a
# correction placed on m1 that fixes m1 and removes the terminal's line from that resolved file, in one commit and in
# two. Construct over the published chain, before publication and under BOUND.
source "$(dirname "$0")/${LIB:-lib8.sh}"; SD=$SD8
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0
  git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; put t.txt t MAIN; put api.txt api v1; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; git add t.txt; git commit -q --no-edit; }
run() { echo "  pre   : $(construct2 $B1 $1 "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' ')"
  echo "  bound : $(BOUND=1 construct2 $B1 $1 "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' ')"; }
echo "one commit: fix m1 and drop T3"
setup a; printf '%s\n' m1 FIXED > m1.txt; printf '%s\n' t MAIN > t.txt; git add m1.txt t.txt; git commit -qm fix; run $(hd)
echo "two commits: fix m1, then drop T3"
setup b; put m1.txt m1 FIXED; printf '%s\n' t MAIN > t.txt; git add t.txt; git commit -qm drop; run $(hd)
echo "control: fix m1 only"
setup c; put m1.txt m1 FIXED; run $(hd)
