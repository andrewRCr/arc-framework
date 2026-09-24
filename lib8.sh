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
# withq TREE Q SRC: TREE with path Q taken from commit SRC (removed where SRC lacks it)
withq() { local idx b t; idx=$(mktemp); rm -f "$idx"; GIT_INDEX_FILE=$idx git read-tree "$1"
  if b=$(blob "$3" "$2"); then GIT_INDEX_FILE=$idx git update-index --add --cacheinfo "100644,$b,$2"
  else GIT_INDEX_FILE=$idx git update-index --force-remove "$2"; fi; t=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"; echo "$t"; }
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
# ck k kind base left right: compose at member k, kind 're' (its range reapplied or carried) or 'fx' (a fold). A
# conflict takes the resolution recorded for that exact composition -- a line "<base> <left> <right> <result>" of trees in
# $RESDB -- or else the one supplied for the step: RES<k> for the reapplication, after which the member's fold still runs;
# FIX<k> for a fold, the member's content after its whole fold. With TERMRES=1 at the terminal before publication the
# corrected top's normalized tree is taken, the terminal's content by definition. On the bound route (BOUND=1) a fold
# conflict at any member but the placed one is the later-member stop, since any resolution changes that member.
ck() { local k=$1 kind=$2; shift 2; local r
  { [ -e "$RESD/$k.all" ] || { [ "$kind" = fx ] && [ -e "$RESD/$k.fx" ]; }; } && { git rev-parse "$2^{tree}"; return 0; }
  r=$(compose "$@") && { echo "$r"; return 0; }; resk "$k" "$kind" "$@"; }
# resk k kind base left right: member k's resolution of a conflict at that step, or failure (the composition's key on
# stderr) when none is held
resk() { local k=$1 kind=$2 v key e; key="$(git rev-parse "$3^{tree}") $(git rev-parse "$4^{tree}") $(git rev-parse "$5^{tree}")"
  if [ "${BOUND:-0}" = 1 ] && [ "$kind" = fx ] && [ "$k" != "$PLACE" ]; then echo -n "(later member) " >&2; return 1; fi
  if [ -n "${RESDB:-}" ] && e=$(grep "^$key " "$RESDB" | head -1) && [ -n "$e" ]; then
    [ "$kind" = fx ] && : > "$RESD/$k.fx"; echo "${e##* }"; return 0; fi
  if [ "$kind" = re ]; then v="RES$k"; [ -n "${!v:-}" ] && { echo "${!v}"; return 0; }
  else v="FIX$k"; [ -n "${!v:-}" ] && { : > "$RESD/$k.fx"; echo "${!v}"; return 0; }; fi
  [ "${TERMRES:-0}" = 1 ] && { [ "${BOUND:-0}" != 1 ] || [ "${BTERM:-0}" = 1 ]; } && [ "$k" = "$n" ] && { : > "$RESD/$k.all"; ntree "$TOP"; return 0; }
  [ "${SHOWKEY:-0}" = 1 ] && echo -n "key=${key// /:} " >&2; return 1; }
# ovr tree from paths...: tree with each named path taken from commit/tree 'from' (removed where 'from' lacks it)
ovr() { local src=$1 from=$2 ix e p; shift 2; ix=$(mktemp -u); GIT_INDEX_FILE=$ix git read-tree "$src"
  for p in "$@"; do e=$(git ls-tree -r "$from" -- "$p")
    if [ -n "$e" ]; then GIT_INDEX_FILE=$ix git update-index --add --cacheinfo "$(echo "$e" | awk '{print $1}'),$(echo "$e" | awk '{print $3}'),$p"
    else GIT_INDEX_FILE=$ix git update-index --force-remove "$p"; fi; done
  GIT_INDEX_FILE=$ix git write-tree; rm -f "$ix"; }
# rf k lo base left right: the fold at member k. Above the member it is placed on (k > lo) it folds only on the paths
# member k's own range changes; every other path keeps the version reapplication gave it (FOLDPATH=0: every path).
rf() { local k=$1 lo=$2 b=$3 l=$4 r=$5 lt; shift 5
  if [ "${FOLDPATH:-1}" = 1 ] && [ "$k" -gt "$lo" ]; then local ps; ps=$(git diff --name-only "$(norm "${P[$k]}")" "$(norm "${H[$k]}")")
    lt=$(git rev-parse "$l^{tree}"); b=$(tc "$(ovr "$lt" "$b" $ps)"); r=$(tc "$(ovr "$lt" "$r" $ps)"); fi
  ck "$k" fx "$b" "$l" "$r"; }

construct2() {
  RESD=$(mktemp -d)
  TIP=$1; TOP=$2; local sp=$3; PLACE=${4:-0}; local hs=${sp%%|*} ps=${sp##*|} k x fx="" ob prev c par absb defer=""
  H=("" $hs); P=("" $ps); n=$(( ${#H[@]} - 1 )); [ "$PLACE" = 0 ] && PLACE=$n
  is_anc "${P[1]}" "$TOP" || { echo "REFUSE anchor-not-in-top: recut from the top's history"; return 1; }
  TOLD=$(oldtop "$TOP" "${H[$n]}") || { echo "STOP no-source-top"; return 1; }
  TOLD0=""; local k0; if [ "${BREAK10:-1}" = 1 ] && [ "${ADV10:-1}" = 1 ]; then for ((k0=2;k0<=n;k0++)); do
    [ "$(git rev-parse "${P[$k0]}")" != "$(git rev-parse "${H[$((k0-1))]}")" ] && { TOLD0=$TOLD; local st=$TOLD; [ -n "${CONT_TOP:-}" ] && [ "${CONTPL:-0}" = 0 -o "$PLACE" -le $((k0-1)) ] && is_anc "$TOLD" "$CONT_TOP" && is_anc "$CONT_TOP" "$TOP" && st=$CONT_TOP; TOLD=$(advance10 "$st" "$TOP" "${H[$((k0-1))]}"); break; }; done; fi
  # The advance's residual: a passed change, on each path where it never reaches the record of the member below the
  # break from before the rewrite, was never carried there. It stays in the delta, applied with it at the placement.
  # RSPLIT: a commit the member below carries in part was placed at or below it by the stopped run, so its remainder is
  # owed from the break up (RX*, folded from RXK); a commit it carries none of has no placement fixed yet and folds with
  # the delta at the operand placement (RP*).
  # CONT_TOP=<commit>: the thirteenth fold's continuation, recomposing a stopped binding with the advance first passing
  # every commit up to the top it was built from; CONTPL=1 applies that only with the placement at or below the member
  # below the break. NOTCARRIED=1 reads a first-merge conflict as not carried. All three are rejected readings: a
  # stopped binding binds the chain it constructed, which construct over that chain reproduces.
  RXB=""; RXT=""; RPB=""; RPT=""; RXK=0; local rxp="" rpp=""
  if [ -n "$TOLD0" ] && [ "${ADV12:-1}" = 1 ]; then
    local old cur curp sc q s1 sn sf out rt e et o2 bq carried qs qb i; old=$(norm "${P[$k0]}"); cur=$(norm "$TOLD"); curp=$cur
    for sc in $(git rev-list --first-parent --no-merges "$TOLD" "^$TOLD0"); do
      [ "$(ntree "$sc")" = "$(ntree "$sc^1")" ] && continue
      s1=$(norm "$sc^1"); sn=$(norm "$sc"); carried=0; qs=(); qb=()
      for q in $(git diff --name-only "$s1" "$sn"); do
        sf=$(tc "$(withq "$(tree "$s1")" "$q" "$sn")")
        out=$(git merge-tree --write-tree --merge-base="$s1" "$old" "$sf" 2>/dev/null) || { if [ "${NOTCARRIED:-0}" = 1 ]; then qs+=("$q"); qb+=("$s1"); else carried=1; fi; continue; }
        e=$(sed -n 1p <<< "$out"); bq=$s1
        if [ "${HUNK12:-1}" = 1 ]; then
          # hunk level: fold onto s1 the part of the change that reached the old record (old -> E on q); what is left
          # between that and sn is the residual, whole-path when nothing reached it or when this second merge conflicts
          et=$(tc "$(withq "$(tree "$old")" "$q" "$e")")
          o2=$(git merge-tree --write-tree --merge-base="$old" "$s1" "$et" 2>/dev/null) || { qs+=("$q"); qb+=("$s1"); continue; }
          bq=$(tc "$(withq "$(tree "$s1")" "$q" "$(sed -n 1p <<< "$o2")")")
          [ "$(blob "$bq" "$q")" != "$(blob "$s1" "$q")" ] && carried=1
          [ "$(blob "$bq" "$q")" = "$(blob "$sn" "$q")" ] && continue
        else
          [ "$(blob "$e" "$q")" = "$(blob "$old" "$q")" ] || { carried=1; continue; }
        fi
        qs+=("$q"); qb+=("$bq")
      done
      for ((i=0;i<${#qs[@]};i++)); do q=${qs[$i]}; bq=${qb[$i]}
        if [ "${RSPLIT:-0}" = 1 ] && [ "$carried" = 0 ]; then
          rt=$(compose "$(tc "$(withq "$(tree "$curp")" "$q" "$sn")")" "$curp" "$(tc "$(withq "$(tree "$curp")" "$q" "$bq")")" 2>"$ERR") \
            || { echo "STOP residual conflict $q"; return 1; }; curp=$(tc "$rt"); rpp="$rpp $q"
        else
          rt=$(compose "$(tc "$(withq "$(tree "$cur")" "$q" "$sn")")" "$cur" "$(tc "$(withq "$(tree "$cur")" "$q" "$bq")")" 2>"$ERR") \
            || { echo "STOP residual conflict $q"; return 1; }; cur=$(tc "$rt"); rxp="$rxp $q"
        fi; done
    done
    if [ -n "${rxp// /}" ]; then RXB=$cur; RXT=$(norm "$TOLD"); if [ "${RSPLIT:-0}" = 1 ]; then RXK=$k0; else RXK=$PLACE; fi; fi
    [ -n "${rpp// /}" ] && { RPB=$curp; RPT=$(norm "$TOLD"); }
  fi
  ATOP=$(git merge-base "$TOP" "$TIP"); J=0; local first=${FIRST:-auto}
  [ "$first" = auto ] && { if constructed_shape; then first=0; else first=1; fi; }
  local dau; dau=$(git rev-list --no-merges "$TOP" "^$TOLD" "^$TIP" | while read -r c; do git diff-tree --no-commit-id --name-only -r "$c"; done | grep -vx "$LIFE" | sort -u | tr '\n' ' '); dau="$dau $rpp"
  AU=(); for ((k=1;k<=n;k++)); do AU[$k]=$(authored "${H[$k]}" "${P[$k]}" "$TIP"); [ "$PLACE" = $k ] && AU[$k]="${AU[$k]} $dau"
    [ "$RXK" = $k ] && AU[$k]="${AU[$k]} $rxp"; done
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
  { [ -n "$fx" ] || [ -n "$RPB" ]; } && [ "$J" != 0 ] && [ "$PLACE" -ge "$J" ] && defer=1
  local rdefer=""; [ -n "$RXB" ] && [ "$J" != 0 ] && [ "$RXK" -ge "$J" ] && rdefer=1
  # stage 1: reapply; the delta folded here only when the placed member does not absorb
  T0=(); T0[1]=$(ntree "${H[1]}"); local brk=0
  for ((k=1;k<=n;k++)); do
    if [ $k -gt 1 ]; then
      [ "${BREAK10:-1}" = 1 ] && [ "$brk" = 0 ] && [ "$(git rev-parse "${P[$k]}")" != "$(git rev-parse "${H[$((k-1))]}")" ] && brk=$k
      if [ "$brk" != 0 ]; then T0[$k]=$(carry10 "$(norm "${P[$k]}")" "$(tc "${T0[$((k-1))]}")" "$(norm "${H[$k]}")" "$k" "${P[$k]}" "$(git merge-base "${H[$((brk-1))]}" "$TIP")" 2>"$ERR") \
        || T0[$k]=$(resk $k re "$(norm "${P[$k]}")" "$(tc "${T0[$((k-1))]}")" "$(norm "${H[$k]}")" 2>>"$ERR") || { echo "STOP m$k conflict $(cat "$ERR")"; return 1; }
      else T0[$k]=$(ck $k re "$(norm "${P[$k]}")" "$(tc "${T0[$((k-1))]}")" "$(norm "${H[$k]}")" 2>"$ERR") \
        || { echo "STOP m$k conflict $(cat "$ERR")"; return 1; }; fi
    fi
    if [ -n "$RXB" ] && [ -z "$rdefer" ] && { [ "${FOLDUP:-1}" = 1 ] && [ $k -ge "$RXK" ] || [ "$RXK" = $k ]; }; then
      T0[$k]=$(rf $k $RXK "$RXB" "$(tc "${T0[$k]}")" "$RXT" 2>"$ERR") || { echo "STOP m$k(fix) conflict $(cat "$ERR")"; return 1; }; fi
    if [ "${FOLDUP:-1}" = 1 ] && [ $k -ge "$PLACE" ] || [ "$PLACE" = $k ]; then [ -z "$defer" ] && {
      [ -n "$RPB" ] && { T0[$k]=$(rf $k $PLACE "$RPB" "$(tc "${T0[$k]}")" "$RPT" 2>"$ERR") || { echo "STOP m$k(fix) conflict $(cat "$ERR")"; return 1; }; }
      [ -n "$fx" ] && { T0[$k]=$(rf $k $PLACE "$(norm "$fx")" "$(tc "${T0[$k]}")" "$(norm "$TOP")" 2>"$ERR") \
        || { echo "STOP m$k(fix) conflict $(cat "$ERR")"; return 1; }; }; }; fi
  done
  # stage 2: absorption from J up
  T=(); for ((k=1;k<=n;k++)); do
    if [ "$J" != 0 ] && [ $k -ge "$J" ]; then T[$k]=$(resolve7 "${CB[$k]}" "$(tc "${T0[$k]}")" "$ATOP" "$k" 2>"$ERR") \
      || { echo "STOP $(cat "$ERR")"; return 1; }
    else T[$k]=${T0[$k]}; fi; done
  # stage 3: the deferred delta, at the placed member and every member above it
  # FOLDPATH=1: a member above the fold is first reapplied -- its absorbed version's own change -- on the folded member
  # below it, since the fold that follows reaches only its own paths.
  local -a TA
  if [ -n "$rdefer" ]; then TA=(); for ((k=1;k<=n;k++)); do TA[$k]=${T[$k]}; done; for ((k=RXK;k<=n;k++)); do
    [ "${FOLDPATH:-1}" = 1 ] && [ $k -gt "$RXK" ] && { T[$k]=$(ck $k re "$(tc "${TA[$((k-1))]}")" "$(tc "${T[$((k-1))]}")" "$(tc "${TA[$k]}")" 2>"$ERR") || { echo "STOP m$k conflict $(cat "$ERR")"; return 1; }; }
    T[$k]=$(rf $k $RXK "$RXB" "$(tc "${T[$k]}")" "$RXT" 2>"$ERR") || { echo "STOP m$k(fix) conflict $(cat "$ERR")"; return 1; }; done; fi
  if [ -n "$defer" ]; then TA=(); for ((k=1;k<=n;k++)); do TA[$k]=${T[$k]}; done; for ((k=PLACE;k<=n;k++)); do
    [ "${FOLDPATH:-1}" = 1 ] && [ $k -gt "$PLACE" ] && { T[$k]=$(ck $k re "$(tc "${TA[$((k-1))]}")" "$(tc "${T[$((k-1))]}")" "$(tc "${TA[$k]}")" 2>"$ERR") || { echo "STOP m$k conflict $(cat "$ERR")"; return 1; }; }
    [ -n "$RPB" ] && { T[$k]=$(rf $k $PLACE "$RPB" "$(tc "${T[$k]}")" "$RPT" 2>"$ERR") || { echo "STOP m$k(fix) conflict $(cat "$ERR")"; return 1; }; }
    [ -n "$fx" ] && { T[$k]=$(rf $k $PLACE "$(norm "$fx")" "$(tc "${T[$k]}")" "$(norm "$TOP")" 2>"$ERR") || { echo "STOP m$k(fix) conflict $(cat "$ERR")"; return 1; }; }
  done; fi
  # BOUND=1: the bound route, where rematerialization proves every member but the selected one a reapplication of its
  # published range onto its new predecessor. Modelled where no absorption applies: a fold that changed such a member
  # stops, as the exact-member stop does. A member carried across a break is checked against the carry itself, which
  # takes the attributed share of the recorded resolution the proof admits; an absorbing member's R(B) admission is not.
  if [ "${BOUND:-0}" = 1 ]; then local rp v; for ((k=2;k<=n;k++)); do
    [ "$k" = "$PLACE" ] && continue; { [ "$J" != 0 ] && [ $k -ge "$J" ]; } && continue
    if [ "$brk" != 0 ] && [ $k -ge "$brk" ]; then
      # a member carried across the break: its proof admits the carry's attributed share of the recorded resolution
      rp=$(carry10 "$(norm "${P[$k]}")" "$(tc "${T[$((k-1))]}")" "$(norm "${H[$k]}")" "$k" "${P[$k]}" "$(git merge-base "${H[$((brk-1))]}" "$TIP")" 2>/dev/null) \
        || rp=$(resk $k re "$(norm "${P[$k]}")" "$(tc "${T[$((k-1))]}")" "$(norm "${H[$k]}")" 2>/dev/null) || rp=""
    else
    # a reapplication the agent resolved is admitted as the named resolution, as the dependent-suffix scope admits one
    rp=$(compose "$(norm "${P[$k]}")" "$(tc "${T[$((k-1))]}")" "$(norm "${H[$k]}")" 2>/dev/null) || { v="RES$k"; rp=${!v:-}; [ -z "$rp" ] && [ "${BTERM:-0}" = 1 ] && [ "$k" = "$n" ] && rp=$(ntree "$TOP"); }
    fi
    [ "$rp" = "${T[$k]}" ] || { echo "STOP m$k(fold) later member [$(git diff --name-only "$rp" "${T[$k]}" 2>/dev/null | tr '\n' ' ')]"; return 1; }
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
