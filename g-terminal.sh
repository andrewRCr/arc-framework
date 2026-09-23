# Spike 8g: a correction placed on the terminal, on a path in R, under disjoint movement (J=n): which commit carries it?
source "$(dirname "$0")/lib8.sh"; SD=$SD8
tfile() { printf '%s\n' t1 "$1" t3 t4 t5 t6 "$2" t8 > t.txt; git add t.txt; git commit -qm "${3:-edit t.txt}"; }
setup() { newrepo $SD/r/$1; put base.txt v0; printf '%s\n' t1 t2 t3 t4 t5 t6 t7 t8 > t.txt; git add t.txt; git commit -qm t
  git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; tfile "t2 T3" t7; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  tfile "t2 MAIN" t7; B1=$(hd); git switch -q wu; git merge -q --no-edit main > /dev/null 2>&1; printf '%s\n' t1 "t2 T3 MAIN" t3 t4 t5 t6 t7 t8 > t.txt; git add t.txt; git commit -q --no-edit; }
where() { local m=$1; printf '   merge-parents=%s  merge t.txt[2,7]=[%s|%s]  authored-diff=[%s] t.txt[2,7]=[%s|%s]\n' \
  "$(git rev-list --parents -n1 $m^1 | awk '{print NF-1}')" "$(git show $m^1:t.txt | sed -n 2p)" "$(git show $m^1:t.txt | sed -n 7p)" \
  "$(git diff --name-only $m^1 $m | tr '\n' ' ')" "$(git show $m:t.txt | sed -n 2p)" "$(git show $m:t.txt | sed -n 7p)"; }
go() { construct2 $B1 $(hd) "$(spans ${C0[@]})" $1 > $SD/.o || { echo "   $(cat $SD/.o)"; return; }; R=($(cat $SD/.o))
  echo "   J=$J R=[$RB] $(report2 x $B1 $(hd) ${R[@]} | sed 's/^x *//')"; where ${R[2]}
  printf '   structural: merge R-path vs top-own=%s  vs split-point=%s\n' "$( [ "$(git rev-parse ${R[2]}^1:t.txt)" = "$(git rev-parse $(hd):t.txt)" ] && echo equal || echo differs)" \
    "$( [ "$(git rev-parse ${R[2]}^1:t.txt)" = "$(git rev-parse $(norm $(split8 2>/dev/null)):t.txt)" ] && echo equal || echo differs)"; }
echo "== merge-then-fix, fix on line 7 of t.txt (R path, terminal's), placed on m3"; setup g1; tfile "t2 T3 MAIN" "t7 FIX"; go 3
echo "== same, no placement"; go 0
echo "== fix-then-merge, fix on line 7, placed on m3"; setup g2; git reset -q --hard HEAD^; tfile "t2 T3" "t7 FIX"; git merge -q --no-edit main > /dev/null 2>&1
printf '%s\n' t1 "t2 T3 MAIN" t3 t4 t5 t6 "t7 FIX" t8 > t.txt; git add t.txt; git commit -q --no-edit; go 3
echo "== control: no fix at all"; setup g3; go 0
