# Spike 8: the pass-seven F5 cases — a base merge not directly on the source top.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
sfile() { printf '%s\n' a "$1" c d e f "$2" h > s.txt; git add s.txt; git commit -qm "${3:-edit s.txt}"; }
resolve_s() { printf '%s\n' a "$1" c d e f "$2" h > s.txt; git add s.txt; git commit -q --no-edit; }
show() { local k=0 m; for m in "$@"; do k=$((k+1)); printf '   m%s parents=%s s.txt[2,7]=[%s|%s] m1.txt=[%s]\n' $k "$(git rev-list --parents -n1 $m | awk '{print NF-1}')" \
  "$(git show $m:s.txt | sed -n 2p)" "$(git show $m:s.txt | sed -n 7p)" "$(git show $m:m1.txt 2>/dev/null | tr '\n' ' ' | sed 's/ $//')"; done; }
# run8 LABEL TOP PLACE [TIPX]: lib7 then lib8 construct, report, members, idempotence, proofs, arms
run8() { local label=$1 top=$2 place=$3 tip=${4:-$B1} r7 rc
  r7=$( ( source $SD/lib7.sh; construct2 $tip $top "$(spans ${C0[@]})" $place ) ); rc=$?
  [ $rc != 0 ] && r7="$r7" || r7="complete-run"
  echo "$label (place=$place)"; echo "   lib7: $r7"
  construct2 $tip $top "$(spans ${C0[@]})" $place > $SD/.o; rc=$?; R=($(cat $SD/.o))
  if [ $rc != 0 ]; then echo "   lib8: $(cat $SD/.o)"
  else echo "   lib8: J=$J R=[$RB] kept=$(wc -w <<< "$DKEEP") $(report2 x $tip $top ${R[@]} | sed 's/^x *//')"; show "${R[@]}"
    printf '   idempotent: %s   proof m2: [%s]  terminal: [%s]\n' "$(same "${R[*]}" "$(construct2 $tip $top "$(spans ${R[@]})")")" \
      "$(proofpaths ${C0[0]} ${R[0]} ${C0[1]} ${R[1]})" "$(proofpaths $(norm ${C0[1]}) $(norm ${R[2]}^1) $(norm ${C0[2]}) $(norm ${R[2]}))"; fi
  echo "   arms: $(arms8 $tip $top ${C0[2]})"; }
setup() { newrepo $SD/r/$1; put base.txt v0; printf '%s\n' a b c d e f g h > s.txt; git add s.txt; git commit -qm s; put t.txt t; put api.txt api v0
  git switch -qc wu; sfile "b m1" g; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  sfile "b MAIN" g; put api.txt api v1; B1=$(hd); git switch -q wu; }
mergemain() { git merge -q --no-edit main > /dev/null 2>&1; }
echo "== 1. record, then a conflicting merge of main"
setup c1; put life.md L9; mergemain; resolve_s "b m1 MAIN" g; run8 "record-then-merge" $(hd) 0
echo "== 1b. a fix on a path outside R, then the merge"
setup c1b; put m1.txt m1 FIX; mergemain; resolve_s "b m1 MAIN" g; run8 "fix(m1.txt)-then-merge" $(hd) 1
echo "== 2. fix-then-merge, the fix and the resolution on different hunks of s.txt (case 6's unfolded R-only fix)"
setup c2; sfile "b m1" "g FIX" "fix s.txt"; mergemain; resolve_s "b m1 MAIN" "g FIX"; run8 "fix-then-merge, other hunk" $(hd) 1
echo "== 2b. control: merge-then-fix, the ordering lib7 already split"
setup c2b; mergemain; resolve_s "b m1 MAIN" g; sfile "b m1 MAIN" "g FIX" "fix s.txt"; run8 "merge-then-fix" $(hd) 1
echo "== 3. fix-then-merge, same hunk"
setup c3; sfile "b m1 FIX" g "fix s.txt"; C=$(hd); mergemain; resolve_s "b m1 FIX MAIN" g; run8 "fix-then-merge, same hunk" $(hd) 1
echo "== 3b. merge-then-fix, same hunk (the remedy's target shape: after the merge the fix reverts cleanly)"
setup c3b; mergemain; resolve_s "b m1 MAIN" g; sfile "b m1 FIX MAIN" g "fix s.txt"; run8 "merge-then-fix, same hunk" $(hd) 1
setup c3; sfile "b m1 FIX" g "fix s.txt"; C=$(hd); mergemain; resolve_s "b m1 FIX MAIN" g
echo "== 4. set aside: git revert of the fix (conflicts, resolved by hand) after the merge"
git revert --no-edit $C > /dev/null 2>&1; printf '%s\n' a "b m1 MAIN" c d e f g h > s.txt; git add s.txt; GIT_EDITOR=true git revert --continue > /dev/null 2>&1
RV=$(hd); echo "   revert message: $(git log -1 --format=%B | grep -o 'This reverts commit [0-9a-f]*' | cut -c1-28)... == fix: $(git log -1 --format=%B | grep -q "$C" && echo yes)"
run8 "set aside, nothing re-applied (case 5: the arms)" $RV 1
echo "== 4a. re-applied as a new commit"
sfile "b m1 FIX MAIN" g "re-apply fix"; run8 "set aside + re-applied by hand" $(hd) 1
echo "== 4b. re-applied by reverting the revert"
git reset -q --hard $RV; git revert --no-edit $RV > /dev/null 2>&1; run8 "set aside + revert of the revert" $(hd) 1
echo "== 4c. re-applied, placed on the terminal instead"
run8 "set aside + revert of the revert, placed on m3" $(hd) 3
echo "== 7. two base merges in the delta, the fix between them"
setup c7; put life.md L9; mergemain; resolve_s "b m1 MAIN" g; sfile "b m1 MAIN" "g FIX" "fix s.txt"
git switch -q main; sfile "b MAIN2" g; B2=$(hd); git switch -q wu; mergemain; resolve_s "b m1 MAIN2" "g FIX"; run8 "record, merge, fix, merge" $(hd) 1 $B2
