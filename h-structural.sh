# Spike 8h: F1's structural rule over the constructed terminal absorption merge (J=n, placement below the terminal)
source "$(dirname "$0")/lib8.sh"; SD=$SD8
tfile() { printf '%s\n' t1 "$1" t3 t4 t5 t6 "$2" t8 > t.txt; git add t.txt; git commit -qm "${3:-edit t.txt}"; }
setup() { newrepo $SD/r/$1; put base.txt v0; printf '%s\n' t1 t2 t3 t4 t5 t6 t7 t8 > t.txt; git add t.txt; git commit -qm t
  git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; tfile "t2 T3" t7; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c)); }
check() { construct2 $B1 $(hd) "$(spans ${C0[@]})" $1 > $SD/.o || { echo "   $(cat $SD/.o)"; return; }; R=($(cat $SD/.o)); local M=${R[2]}^1 out mt clean q own=""
  out=$(git merge-tree --write-tree --name-only $(git rev-parse $M^1) $(git rev-parse $M^2)); clean=$?; mt=$(sed -n 1p <<< "$out")
  for q in $RB; do [ "$(git rev-parse $M:$q 2>/dev/null)" = "$(git rev-parse $(hd):$q 2>/dev/null)" ] && own="$own $q=own" || own="$own $q=DIFF"; done
  echo "   J=$J R=[$RB] $(complete ${R[2]} $(hd))  m2'+base merge-tree clean=$([ $clean = 0 ] && echo yes || echo no)  merge vs clean differs on [$(git diff --name-only $mt $M | tr '\n' ' ')]  R paths:$own"
  echo "   terminal proof (after-pred=merge): [$(proofpaths $(norm ${C0[1]}) $(norm $M) $(norm ${C0[2]}) $(norm ${R[2]}))]"; }
echo "== clean merge of main into the top, departure on t.txt (terminal's path), fix on m1.txt placed on m1"
setup s1; tfile t2 "t7 MAIN"; put far.txt f; B1=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1
printf '%s\n' t1 "t2 T3" t3 t4 t5 t6 "t7 MAIN ADAPTED" t8 > t.txt; git add t.txt; git commit -q --amend --no-edit; put m1.txt m1 FIXED; check 1
echo "== conflicting merge on t.txt (b7 shape), fix on m1.txt placed on m1"
setup s2; tfile "t2 MAIN" t7; put far.txt f; B1=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1
printf '%s\n' t1 "t2 T3 MAIN" t3 t4 t5 t6 t7 t8 > t.txt; git add t.txt; git commit -q --no-edit; put m1.txt m1 FIXED; check 1
echo "== conflicting merge + departure on a base-added path, fix placed on m2"
setup s3; tfile "t2 MAIN" t7; put n.txt n main; B1=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1
printf '%s\n' t1 "t2 T3 MAIN" t3 t4 t5 t6 t7 t8 > t.txt; printf '%s\n' n main ADAPTED > n.txt; git add t.txt n.txt; git commit -q --no-edit; put m2.txt m2 FIXED; check 2
echo "== clean merge, no departure (control), fix on m1"
setup s4; put far.txt f; B1=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; put m1.txt m1 FIXED; check 1
