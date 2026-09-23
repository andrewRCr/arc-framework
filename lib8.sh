# Spike 8: the delta split generalized (pass-seven F5), 2026-09-22.
#  (a) split point = the absorption of the newest absorbed base into the source top, taking on conflicts U R_delta
#      (the delta's own base-absorption merges' resolution) the top's version with the delta's kept non-merge commits
#      to that path reverted newest first — no longer requires the base merge to sit directly on the source top.
#  (b) a revert that conflicts = entangled split. Kept commits: the delta's non-merge commits, oldest first, dropping a
#      commit together with the first later commit whose message records "This reverts commit <id>." — so a
#      correction set aside by `git revert` and re-applied afterwards separates (a revert of the revert re-applies).
#  (c) arms8: the refresh arms' reading of a moved top — the same split; remainder = top minus split point.
#  (d) the absorption merge holds the member's version before its own placed remainder (g-terminal.sh).
#  Delta commit listing uses --full-history (default simplification can hide a side's commit behind a TREESAME merge).
SD8=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SD8/lib7.sh"; SP2=$SD8; ERR=$SD8/.err
# dkeep: the delta's kept non-merge commits, newest first (needs TOP, TOLD, TIP)
dkeep() { local all c r; declare -A drop; all=$(git rev-list --reverse --no-merges "$TOP" "^$TOLD" "^$TIP")
  for c in $all; do [ -n "${drop[$c]}" ] && continue
    for r in $all; do [ "$r" = "$c" ] && continue; [ -n "${drop[$r]}" ] && continue; is_anc "$c" "$r" || continue
      git log -1 --format=%B "$r" | grep -q "This reverts commit $c\." && { drop[$c]=1; drop[$r]=1; break; }; done; done
  for c in $all; do [ -z "${drop[$c]}" ] && echo "$c"; done | tac; }
# dlist PATH: kept delta commits touching PATH, newest first
dlist() { [ -z "$DKEEP" ] && return 0; git rev-list --full-history --no-merges "$TOP" "^$TOLD" "^$TIP" -- "$1" | grep -Fx -f <(echo "$DKEEP"); }
laterlist() { local q=$1 k=$2 i
  [ "$PLACE" -gt "$k" ] && dlist "$q"
  for ((i=n;i>k;i--)); do git rev-list --no-merges "${H[$i]}" "^${P[$i]}" "^$TIP" -- "$q"; done; }
# split8: the split point (a commit whose tree is the base absorption the delta carries), or status 1 with the entangled
# path on stderr (needs TOP, TOLD, TIP, ATOP, DKEEP)
split8() { local ob out t q idx d c paths
  ob=$(git merge-base "$TOLD" "$TIP"); newer "$ATOP" "$ob" || { echo "$TOLD"; return 0; }
  out=$(git merge-tree --write-tree --name-only --merge-base="$ob" "$TOLD" "$ATOP"); t=$(sed -n 1p <<< "$out")
  paths=$( { sed -n '2,/^$/p' <<< "$out" | sed '/^$/d'; words <<< "$(rset "$TOLD")"; } | grep -vx "$LIFE" | sort -u)
  idx=$(mktemp); rm -f "$idx"; GIT_INDEX_FILE=$idx git read-tree "$t"
  for q in $paths; do
    if ! blob "$TOP" "$q" > /dev/null && [ -z "$(dlist "$q")" ]; then GIT_INDEX_FILE=$idx git update-index --force-remove "$q"; continue; fi
    d=$(mktemp -d); cat_or_empty "$TOP" "$q" > "$d/r"
    for c in $(dlist "$q"); do cat_or_empty "$c" "$q" > "$d/b"; cat_or_empty "$c^1" "$q" > "$d/t"
      git merge-file -q -p "$d/r" "$d/b" "$d/t" > "$d/o" 2>/dev/null || { echo "$q" >&2; rm -rf "$d" "$idx"; return 1; }; mv "$d/o" "$d/r"; done
    GIT_INDEX_FILE=$idx git update-index --add --cacheinfo "100644,$(git hash-object -w "$d/r"),$q"; rm -rf "$d"
  done; t=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"; echo fx | git commit-tree "$t" -p "$TOLD" -p "$ATOP"; }
# arms8 TIP TOP TERMINAL: the refresh arms over a moved top — ADMIT (R disclosed, records named) / REFUSE authored
# [paths] / REFUSE entangled path (set the correction aside)
arms8() { TIP=$1; TOP=$2; local fx rem rec
  TOLD=$(oldtop "$TOP" "$3") || { echo "REFUSE no-source-top"; return; }; ATOP=$(git merge-base "$TOP" "$TIP"); DKEEP=$(dkeep)
  fx=$(split8 2>"$ERR") || { echo "REFUSE entangled [$(cat "$ERR")] (set the correction aside)"; return; }
  rem=$(git diff --name-only "$(norm "$fx")" "$(norm "$TOP")" | tr '\n' ' ')
  rec=$(git rev-list --no-merges "$TOP" "^$TOLD" "^$TIP" | while read -r c; do [ -z "$(git diff-tree --no-commit-id --name-only -r "$c" | grep -vx "$LIFE")" ] && echo r; done | wc -l)
  [ -z "${rem// /}" ] && echo "ADMIT R=[$(rset "$TOLD")] records=$rec" || echo "REFUSE authored [$rem]"; }
# Pass-ten D-B: from the first member whose recorded predecessor is not the head of the member below it, carry each
# member's range across by a three-way on its recorded predecessor, taking the attributed version on the base's recorded
# resolution read from that predecessor's window up to the base the members below the break absorbed (rset PRED bounded
# by that base, rk's share); a conflict outside it stops as stage 1 does.
carry10() { local out t q b idx rkp confl x rbs=$RB at=$ATOP
  ATOP=$6; RB=$(rset "$5"); ATOP=$at; rkp=$(rk "$4" | words)
  out=$(git merge-tree --write-tree --name-only --merge-base="$1" "$2" "$3"); t=$(sed -n 1p <<< "$out")
  confl=$(sed -n '2,/^$/p' <<< "$out" | sed '/^$/d' | sort -u)
  x=$(comm -23 <(printf '%s\n' "$confl" | sed '/^$/d') <(printf '%s\n' "$rkp" | sed '/^$/d') | tr '\n' ' ')
  [ -n "${x// /}" ] && { RB=$rbs; echo "$x" >&2; return 1; }
  [ -z "$rkp" ] && { RB=$rbs; echo "$t"; return 0; }
  idx=$(mktemp); rm -f "$idx"; GIT_INDEX_FILE=$idx git read-tree "$t"
  for q in $rkp; do
    if ! blob "$(norm "$TOP")" "$q" > /dev/null && [ -z "$(laterlist "$q" "$4")" ]; then
      GIT_INDEX_FILE=$idx git update-index --force-remove "$q"; continue; fi
    b=$(attributed "$q" "$4") || { RB=$rbs; echo "ENTANGLED m$4 $q" >&2; rm -f "$idx"; return 1; }
    GIT_INDEX_FILE=$idx git update-index --add --cacheinfo "100644,$b,$q"
  done; t=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"; RB=$rbs; echo "$t"; }
# Pass-ten E3: while the chain is broken, the source top advances past the top's first-parent commits the member below
# the break already carries — a commit whose normalized tree equals its first parent's, a base merge whose base that
# member contains, or a change whose cherry-pick onto that member is empty — and stops at the first it does not.
advance10() { local c t=$1 p2 out
  for c in $(git rev-list --first-parent --reverse "$2" "^$1"); do
    if [ "$(ntree "$c")" = "$(ntree "$c^1")" ]; then t=$c; continue; fi
    if p2=$(git rev-parse -q --verify "$c^2"); then is_anc "$p2" "$3" && { t=$c; continue; }; break; fi
    out=$(git merge-tree --write-tree --merge-base="$(norm "$c^1")" "$(norm "$3")" "$(norm "$c")" 2>/dev/null) || break
    [ "$(sed -n 1p <<< "$out")" = "$(ntree "$3")" ] && { t=$c; continue; }; break
  done; echo "$t"; }
construct2() {
  TIP=$1; TOP=$2; local sp=$3; PLACE=${4:-0}; local hs=${sp%%|*} ps=${sp##*|} k x fx="" ob prev c par absb defer=""
  H=("" $hs); P=("" $ps); n=$(( ${#H[@]} - 1 )); [ "$PLACE" = 0 ] && PLACE=$n
  is_anc "${P[1]}" "$TOP" || { echo "REFUSE anchor-not-in-top: recut from the top's history"; return 1; }
  TOLD=$(oldtop "$TOP" "${H[$n]}") || { echo "STOP no-source-top"; return 1; }
  local k0; if [ "${BREAK10:-1}" = 1 ] && [ "${ADV10:-1}" = 1 ]; then for ((k0=2;k0<=n;k0++)); do
    [ "$(git rev-parse "${P[$k0]}")" != "$(git rev-parse "${H[$((k0-1))]}")" ] && { TOLD=$(advance10 "$TOLD" "$TOP" "${H[$((k0-1))]}"); break; }; done; fi
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
  DKEEP=$(dkeep)
  if [ "$TOLD" != "$TOP" ]; then fx=$(split8 2>"$ERR") || { echo "STOP m$PLACE entangled-delta $(cat "$ERR")"; return 1; }; fi
  [ -n "$fx" ] && [ "$J" != 0 ] && [ "$PLACE" -ge "$J" ] && defer=1
  # stage 1: reapply; the delta folded here only when the placed member does not absorb
  T0=(); T0[1]=$(ntree "${H[1]}"); local brk=0
  for ((k=1;k<=n;k++)); do
    if [ $k -gt 1 ]; then
      [ "${BREAK10:-1}" = 1 ] && [ "$brk" = 0 ] && [ "$(git rev-parse "${P[$k]}")" != "$(git rev-parse "${H[$((k-1))]}")" ] && brk=$k
      if [ "$brk" != 0 ]; then T0[$k]=$(carry10 "$(norm "${P[$k]}")" "$(tc "${T0[$((k-1))]}")" "$(norm "${H[$k]}")" "$k" "${P[$k]}" "$(git merge-base "${H[$((brk-1))]}" "$TIP")" 2>"$ERR") \
        || { echo "STOP m$k conflict $(cat "$ERR")"; return 1; }
      else T0[$k]=$(compose "$(norm "${P[$k]}")" "$(tc "${T0[$((k-1))]}")" "$(norm "${H[$k]}")" 2>"$ERR") \
        || { echo "STOP m$k conflict $(cat "$ERR")"; return 1; }; fi
    fi
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
      par=$prev; ta=${T[$k]}
      # (d) the absorption merge takes the member's version before its own placed remainder: with the correction
      # placed on the absorbing member, the attribution reverts the delta's kept commits too (the split point's version)
      if [ -n "$absb" ] && [ -n "$defer" ] && [ "$PLACE" = "$k" ]; then local sp=$PLACE; PLACE=$((n+1))
        ta=$(resolve7 "${CB[$k]}" "$(tc "${T0[$k]}")" "$ATOP" "$k" 2>"$ERR") || { PLACE=$sp; echo "STOP $(cat "$ERR")"; return 1; }; PLACE=$sp; fi
      [ -n "$absb" ] && par=$(absorb_merge7 "$prev" "$absb" "$ta" "$k")
    fi
    c=$(echo "member $k" | git commit-tree "${T[$k]}" -p "$par"); echo "$c"; prev=$c
  done
}
