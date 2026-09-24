# Spike 7: construct2 after the 2026-09-22 Owner round.
#  (a) R(B): the top's recorded resolution of the base it absorbed — every path its own base-absorption merges
#      (first-parent merges since the chain base whose second parent the newest absorbed base contains and the chain
#      base does not) resolved: mechanical conflicts plus departures from the mechanical merge (remerge-diff).
#  (b) absorption takes the attributed version on conflicts U R, not conflicts alone; an absorption merge takes the
#      member's version on the same set, so a departure sits in the merge, never in the authored commit.
#  (c) overlap: a non-terminal member whose authored paths meet the movement or R re-anchors the whole chain (J=1);
#      disjoint movement goes to the terminal (J=n).
#  (d) first cut (FIRST=1, or sources not of constructed shape): anchor every member on the newest absorbed base.
#  (e) the delta is folded after absorption when the placed member absorbs.
#  (f) authcheck admits R on the re-anchored first member (its commit is where the base's resolution lives).
source "$(dirname "${BASH_SOURCE[0]}")/lib2.sh"
SP2=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); ERR=$SP2/.err

# rset CHAINBASE: R(B) over the top's first-parent merges since CHAINBASE (needs TOP, ATOP)
rset() { local c p1 p2 out mt
  for c in $(git rev-list --first-parent --merges "$TOP" "^$1"); do read -r _ p1 p2 <<< "$(git rev-list --parents -n1 "$c")"
    is_anc "$p2" "$ATOP" || continue; is_anc "$p2" "$1" && continue
    out=$(git merge-tree --write-tree --name-only "$p1" "$p2"); mt=$(sed -n 1p <<< "$out")
    { sed -n '2,/^$/p' <<< "$out" | sed '/^$/d'; git diff --name-only "$mt" "$c"; }
  done | grep -vx "$LIFE" | sort -u | tr '\n' ' '; }
# resolve7 BASE OURS THEIRS K: three-way tree; conflicts U R take the attributed version (absent in the top = removed)
rk() { local k=$1 i a below="" all=""; for ((i=1;i<=n;i++)); do if [ "${NOAUTH:-1}" = 1 ] && [ -n "${AUA[$i]+x}" ]; then a=${AUA[$i]}; else a=${AU[$i]}; fi
    all="$all $a"; [ $i -le "$k" ] && below="$below $a"; done
  { inter "$RB" "$below"; minus "$RB" "$all"; } | words | tr '\n' ' '; }
resolve7() { local out t q b idx paths; out=$(git merge-tree --write-tree --name-only --merge-base="$1" "$2" "$3")
  t=$(sed -n 1p <<< "$out"); paths=$( { sed -n '2,/^$/p' <<< "$out" | sed '/^$/d'; rk "$4" | words; } | sort -u)
  [ -z "$paths" ] && { echo "$t"; return 0; }
  idx=$(mktemp); rm -f "$idx"; GIT_INDEX_FILE=$idx git read-tree "$t"
  for q in $paths; do
    if ! blob "$(asrc)" "$q" > /dev/null && [ -z "$(laterlist "$q" "$4")" ]; then
      GIT_INDEX_FILE=$idx git update-index --force-remove "$q"; continue; fi
    b=$(attributed "$q" "$4") || { echo "ENTANGLED m$4 $q" >&2; rm -f "$idx"; return 1; }
    GIT_INDEX_FILE=$idx git update-index --add --cacheinfo "100644,$b,$q"
  done; t=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"; echo "$t"; }
# absorb_merge7 PRED BASE MEMBERTREE: merge of BASE into PRED taking the member's version on conflicts U R
absorb_merge7() { local out t f idx rkp; rkp=$(rk "$4"); out=$(git merge-tree --write-tree --name-only --merge-base="$(git merge-base "$1" "$2")" "$1" "$2")
  t=$(sed -n 1p <<< "$out"); idx=$(mktemp); rm -f "$idx"; GIT_INDEX_FILE=$idx git read-tree "$t"
  for f in $( { sed -n '2,/^$/p' <<< "$out" | sed '/^$/d'; words <<< "$rkp"; } | sort -u); do
    if git rev-parse -q --verify "$3:$f" > /dev/null; then GIT_INDEX_FILE=$idx git update-index --add --cacheinfo "100644,$(git rev-parse "$3:$f"),$f"
    else GIT_INDEX_FILE=$idx git update-index --force-remove "$f"; fi
  done; t=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"
  echo "absorb $2" | git commit-tree "$t" -p "$1" -p "$2"; }
constructed_shape() { local k m; for ((k=1;k<=n;k++)); do m=$(git rev-list --count "${H[$k]}" "^${P[$k]}" "^$TIP")
  [ "$m" = 1 ] && continue; [ "$m" = 2 ] && [ "$k" = "$n" ] && [ "$(git rev-list --parents -n1 "${H[$k]}^1" | wc -w)" = 3 ] && continue
  return 1; done; }

construct2() {
  TIP=$1; TOP=$2; local sp=$3; PLACE=${4:-0}; local hs=${sp%%|*} ps=${sp##*|} k x fx="" ob prev c par absb defer=""
  H=("" $hs); P=("" $ps); n=$(( ${#H[@]} - 1 )); [ "$PLACE" = 0 ] && PLACE=$n
  is_anc "${P[1]}" "$TOP" || { echo "REFUSE anchor-not-in-top: recut from the top's history"; return 1; }
  TOLD=$(oldtop "$TOP" "${H[$n]}") || { echo "STOP no-source-top"; return 1; }
  ATOP=$(git merge-base "$TOP" "$TIP"); J=0; local first=${FIRST:-auto}
  [ "$first" = auto ] && { if constructed_shape; then first=0; else first=1; fi; }
  local dau; dau=$(git rev-list --no-merges "$TOP" "^$TOLD" "^$TIP" | while read -r c; do git diff-tree --no-commit-id --name-only -r "$c"; done | grep -vx "$LIFE" | sort -u | tr '\n' ' ')
  AU=(); for ((k=1;k<=n;k++)); do AU[$k]=$(authored "${H[$k]}" "${P[$k]}" "$TIP"); [ "$PLACE" = $k ] && AU[$k]="${AU[$k]} $dau"; done
  local beyond; beyond=$(git diff --name-only "$ATOP" "$TIP" | tr '\n' ' ')
  for ((k=1;k<=n;k++)); do x=$(inter "${AU[$k]}" "$beyond"); [ -n "${x// /}" ] && { echo "REFUSE merge-base-into-top m$k:[$x]"; return 1; }; done
  CB=(); CB[1]=$(git merge-base "${H[1]}" "$TIP")
  for ((k=2;k<=n;k++)); do CB[$k]=$(newest "${CB[$((k-1))]}" "$(git merge-base "${H[$k]}" "$TIP")"); done
  RB=$(rset "${CB[1]}")
  for ((k=1;k<n;k++)); do x=$(inter "${AU[$k]}" "$(git diff --name-only "${CB[$k]}" "$ATOP" | tr '\n' ' ') $RB")
    [ -n "${x// /}" ] && { J=1; break; }; done
  [ "$J" = 0 ] && newer "$ATOP" "${CB[$n]}" && J=$n
  [ "$first" = 1 ] && newer "$ATOP" "${CB[1]}" && J=1
  [ -n "$FORCEJ" ] && J=$FORCEJ
  if [ "$TOLD" != "$TOP" ]; then ob=$(git merge-base "$TOLD" "$TIP")
    if newer "$ATOP" "$ob"; then
      if x=$(compose "$ob" "$TOLD" "$ATOP" 2>"$ERR"); then fx=$(echo fx | git commit-tree "$x" -p "$TOLD" -p "$ATOP")
      else fx=$(git rev-list --parents "$TOLD..$TOP" | awk -v a="$TOLD" -v b="$ATOP" '$2==a && $3==b {print $1}' | tail -1)
        [ -z "$fx" ] && { echo "STOP m$PLACE entangled-delta $(cat "$ERR")"; return 1; }; fi
    else fx=$TOLD; fi
  fi
  [ -n "$fx" ] && [ "$J" != 0 ] && [ "$PLACE" -ge "$J" ] && defer=1
  # stage 1: reapply; the delta folded here only when the placed member does not absorb
  T0=(); T0[1]=$(ntree "${H[1]}")
  for ((k=1;k<=n;k++)); do
    if [ $k -gt 1 ]; then T0[$k]=$(compose "$(norm "${P[$k]}")" "$(tc "${T0[$((k-1))]}")" "$(norm "${H[$k]}")" 2>"$ERR") \
      || { echo "STOP m$k conflict $(cat "$ERR")"; return 1; }; fi
    if [ "$PLACE" = $k ] && [ -n "$fx" ] && [ -z "$defer" ]; then T0[$k]=$(compose "$(norm "$fx")" "$(tc "${T0[$k]}")" "$(norm "$TOP")" 2>"$ERR") \
      || { echo "STOP m$k(fix) conflict $(cat "$ERR")"; return 1; }; fi
  done
  # stage 2: absorption from J up
  T=(); for ((k=1;k<=n;k++)); do
    if [ "$J" != 0 ] && [ $k -ge "$J" ]; then T[$k]=$(resolve7 "${CB[$k]}" "$(tc "${T0[$k]}")" "$ATOP" "$k" 2>"$ERR") \
      || { echo "STOP $(cat "$ERR")"; return 1; }
    else T[$k]=${T0[$k]}; fi; done
  # stage 3: the deferred delta, at the placed member and every member above it
  if [ -n "$defer" ]; then for ((k=PLACE;k<=n;k++)); do
    T[$k]=$(compose "$(norm "$fx")" "$(tc "${T[$k]}")" "$(norm "$TOP")" 2>"$ERR") || { echo "STOP m$k(fix) conflict $(cat "$ERR")"; return 1; }
  done; fi
  [ "$J" = 1 ] && AU[1]="${AU[1]} $(rk 1)"
  for ((k=1;k<=n;k++)); do
    if [ $k = 1 ]; then par=${P[1]}; [ "$J" = 1 ] && par=$ATOP
    else absb=""
      if [ "$J" != 0 ] && [ $k = "$J" ]; then absb=$ATOP
      elif { [ "$J" = 0 ] || [ $k -lt "$J" ]; } && newer "${CB[$k]}" "${CB[$((k-1))]}"; then absb=${CB[$k]}; fi
      par=$prev; [ -n "$absb" ] && par=$(absorb_merge7 "$prev" "$absb" "${T[$k]}" "$k")
    fi
    c=$(echo "member $k" | git commit-tree "${T[$k]}" -p "$par"); echo "$c"; prev=$c
  done
}
# proofpaths BEFOREPRED AFTERPRED BEFORE AFTER: paths where the contribution proof's mechanical reapplication
# conflicts or differs from AFTER (empty = accept)
proofpaths() { local out t; out=$(git merge-tree --write-tree --name-only --merge-base="$1" "$2" "$3"); t=$(sed -n 1p <<< "$out")
  { sed -n '2,/^$/p' <<< "$out" | sed '/^$/d'; git diff --name-only "$t" "$4"; } | grep -vx "$LIFE" | sort -u | tr '\n' ' '; }
