# Spike 2: the constructor after pass five.
#  (a) sources: the operator's cut list at first cut; afterwards the chain as it stands, each member's range taken
#      from the predecessor it was built on (its own first parent, through its absorption merge), never its neighbour
#  (b) the newest base the top absorbed goes to the LOWEST member the per-member guard would refuse (else the
#      terminal); a path that absorption conflicts on takes the top's version when only merges touched it after
#      that member, else an entangled stop naming the member and path; member 1 absorbing = re-anchoring it
#  (c) the authored-commit check: an authored commit changes only paths its member authored
SP2=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SP2/lib1.sh"
ERR=$SP2/.err

ntree() { tree "$(norm "$1")"; }
words() { tr ' ' '\n' | sed '/^$/d' | sort -u; }
inter() { comm -12 <(words <<< "$1") <(words <<< "$2") | tr '\n' ' '; }
minus() { comm -23 <(words <<< "$1") <(words <<< "$2") | tr '\n' ' '; }
newer() { [ "$(git rev-parse "$1")" != "$(git rev-parse "$2")" ] && is_anc "$2" "$1"; }   # $1 strictly descends from $2
ids() { tr '\n' ' ' <<< "$1"; }
same() { local a=($1) b=($2) o="" i; for i in "${!a[@]}"; do [ "${a[$i]}" = "${b[$i]}" ] && o="${o}=" || o="${o}*"; done; echo "$o"; }

# cuts TIP S1..Sn -> "heads|preds": first cut from the operator's boundary list
cuts() { local tip=$1; shift; local ps="" prev=""
  for s in "$@"; do if [ -z "$prev" ]; then ps=$(git merge-base "$s" "$tip"); else ps="$ps $prev"; fi; prev=$s; done
  echo "$*|$ps"; }
# spans m1..mn -> "heads|preds": the chain as it stands, each predecessor read from the member's own structure
spans() { local k=0 ps="" p m
  for m in "$@"; do k=$((k+1)); p=$(git rev-parse "$m^1")
    if [ $k -gt 1 ] && [ "$(git rev-list --parents -n1 "$p" | wc -w)" = 3 ]; then p=$(git rev-parse "$p^1"); fi
    ps="$ps $p"; done
  echo "$*|${ps# }"; }
# nspans m1..mn -> "heads|preds" by list neighbour (the reading pass five showed breaks resume)
nspans() { local ps="" prev=""; for m in "$@"; do if [ -z "$prev" ]; then ps=$(git rev-parse "$m^1"); else ps="$ps $prev"; fi; prev=$m; done; echo "$*|$ps"; }

# oldtop TOP TERMINAL: the newest commit on the top's first-parent line whose normalized tree is the terminal's
oldtop() { local t c; t=$(ntree "$2"); for c in $(git rev-list --first-parent "$1"); do
  [ "$(ntree "$c")" = "$t" ] && { echo "$c"; return 0; }; done; return 1; }

# laterlist PATH K: non-merge commits after member K touching PATH, newest first (the delta's when placed above K,
# then members n..K+1)
laterlist() { local q=$1 k=$2 i
  [ "$PLACE" -gt "$k" ] && git rev-list --no-merges "$TOP" "^$TOLD" "^$TIP" -- "$q"
  for ((i=n;i>k;i--)); do git rev-list --no-merges "${H[$i]}" "^${P[$i]}" "^$TIP" -- "$q"; done; }
blob() { git rev-parse -q --verify "$1:$2" 2>/dev/null; }
cat_or_empty() { local b; b=$(blob "$1" "$2") && git cat-file -p "$b" || true; }
# attributed PATH K: the top's version of PATH with every later member's own commits to it reverted (RESOLVE=hunk),
# or the top's version only when no later commit touched it (RESOLVE=file); status 1 when entangled
attributed() { local q=$1 k=$2 c d; d=$(mktemp -d); cat_or_empty "$(norm "$TOP")" "$q" > "$d/r"
  for c in $(laterlist "$q" "$k"); do
    [ "${RESOLVE:-hunk}" = file ] && { rm -rf "$d"; return 1; }
    cat_or_empty "$c" "$q" > "$d/b"; cat_or_empty "$c^1" "$q" > "$d/t"
    git merge-file -q -p "$d/r" "$d/b" "$d/t" > "$d/o" 2>/dev/null || { rm -rf "$d"; return 1; }; mv "$d/o" "$d/r"
  done; git hash-object -w "$d/r"; rm -rf "$d"; }
# resolve BASE OURS THEIRS K: three-way tree; a conflicted path takes its attributed version, else "ENTANGLED mK path"
resolve() { local out t q b idx; out=$(git merge-tree --write-tree --name-only --merge-base="$1" "$2" "$3") \
    && { sed -n 1p <<< "$out"; return 0; }
  t=$(sed -n 1p <<< "$out"); idx=$(mktemp); rm -f "$idx"; GIT_INDEX_FILE=$idx git read-tree "$t"
  for q in $(sed -n '2,/^$/p' <<< "$out" | sed '/^$/d' | sort -u); do
    b=$(attributed "$q" "$4") || { echo "ENTANGLED m$4 $q" >&2; rm -f "$idx"; return 1; }
    GIT_INDEX_FILE=$idx git update-index --cacheinfo "100644,$b,$q"
  done; t=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"; echo "$t"; }

# construct2 TIP TOP "heads|preds" [PLACE] -> member oids; "REFUSE ..." / "STOP ..." and status 1 on a stop.
# Globals left for the checks: AU (authored sets), J (absorbing member), ATOP.
construct2() {
  TIP=$1; TOP=$2; local sp=$3; PLACE=${4:-0}; local hs=${sp%%|*} ps=${sp##*|} k x fx="" ob prev c par absb
  H=("" $hs); P=("" $ps); n=$(( ${#H[@]} - 1 )); [ "$PLACE" = 0 ] && PLACE=$n
  is_anc "${P[1]}" "$TOP" || { echo "REFUSE anchor-not-in-top: recut from the top's history"; return 1; }
  TOLD=$(oldtop "$TOP" "${H[$n]}") || { echo "STOP no-source-top"; return 1; }
  ATOP=$(git merge-base "$TOP" "$TIP"); J=0
  local dau; dau=$(git rev-list --no-merges "$TOP" "^$TOLD" "^$TIP" | while read -r c; do git diff-tree --no-commit-id --name-only -r "$c"; done | grep -vx "$LIFE" | sort -u | tr '\n' ' ')
  AU=(); for ((k=1;k<=n;k++)); do AU[$k]=$(authored "${H[$k]}" "${P[$k]}" "$TIP"); [ "$PLACE" = $k ] && AU[$k]="${AU[$k]} $dau"; done
  # movement beyond the base the top absorbed that a member authored: merge the base into the top first
  local beyond; beyond=$(git diff --name-only "$ATOP" "$TIP" | tr '\n' ' ')
  for ((k=1;k<=n;k++)); do x=$(inter "${AU[$k]}" "$beyond"); [ -n "${x// /}" ] && { echo "REFUSE merge-base-into-top m$k:[$x]"; return 1; }; done
  # carried bases, then the lowest member whose authored paths the absorbed movement overlaps
  CB=(); CB[1]=$(git merge-base "${H[1]}" "$TIP")
  for ((k=2;k<=n;k++)); do CB[$k]=$(newest "${CB[$((k-1))]}" "$(git merge-base "${H[$k]}" "$TIP")"); done
  for ((k=1;k<=n;k++)); do x=$(inter "${AU[$k]}" "$(git diff --name-only "${CB[$k]}" "$ATOP" | tr '\n' ' ')")
    [ -n "${x// /}" ] && { J=$k; break; }; done
  [ "$J" = 0 ] && newer "$ATOP" "${CB[$n]}" && J=$n
  # the delta's fold base: the old top with the newer base absorbed, or the range's own merge on the old top
  if [ "$TOLD" != "$TOP" ]; then ob=$(git merge-base "$TOLD" "$TIP")
    if newer "$ATOP" "$ob"; then
      if x=$(compose "$ob" "$TOLD" "$ATOP" 2>"$ERR"); then fx=$(echo fx | git commit-tree "$x" -p "$TOLD" -p "$ATOP")
      else fx=$(git rev-list --parents "$TOLD..$TOP" | awk -v a="$TOLD" -v b="$ATOP" '$2==a && $3==b {print $1}' | tail -1)
        [ -z "$fx" ] && { echo "STOP m$PLACE entangled-delta $(cat "$ERR")"; return 1; }; fi
    else fx=$TOLD; fi
  fi
  # stage 1: each member's content reapplied onto its rebuilt predecessor, the delta folded into the placed member
  T0=(); T0[1]=$(ntree "${H[1]}")
  for ((k=1;k<=n;k++)); do
    if [ $k -gt 1 ]; then T0[$k]=$(compose "$(norm "${P[$k]}")" "$(tc "${T0[$((k-1))]}")" "$(norm "${H[$k]}")" 2>"$ERR") \
      || { echo "STOP m$k conflict $(cat "$ERR")"; return 1; }; fi
    if [ "$PLACE" = $k ] && [ -n "$fx" ]; then T0[$k]=$(compose "$(norm "$fx")" "$(tc "${T0[$k]}")" "$(norm "$TOP")" 2>"$ERR") \
      || { echo "STOP m$k(fix) conflict $(cat "$ERR")"; return 1; }; fi
  done
  # stage 2: the newer base absorbed into every member from J up
  T=(); for ((k=1;k<=n;k++)); do
    if [ "$J" != 0 ] && [ $k -ge "$J" ]; then T[$k]=$(resolve "${CB[$k]}" "$(tc "${T0[$k]}")" "$ATOP" "$k" 2>"$ERR") \
      || { echo "STOP $(cat "$ERR")"; return 1; }
    else T[$k]=${T0[$k]}; fi; done
  # commits: member 1 on its anchor (the absorbed base when it is the absorbing member); later members on their
  # predecessor, through an absorption merge when they carry a newer base than it
  for ((k=1;k<=n;k++)); do
    if [ $k = 1 ]; then par=${P[1]}; [ "$J" = 1 ] && par=$ATOP
    else absb=""
      if [ "$J" != 0 ] && [ $k = "$J" ]; then absb=$ATOP
      elif { [ "$J" = 0 ] || [ $k -lt "$J" ]; } && newer "${CB[$k]}" "${CB[$((k-1))]}"; then absb=${CB[$k]}; fi
      par=$prev; [ -n "$absb" ] && par=$(absorb_merge "$prev" "$absb" "${T[$k]}" "$k")
    fi
    c=$(echo "member $k" | git commit-tree "${T[$k]}" -p "$par"); echo "$c"; prev=$c
  done
}

# authcheck m1..mn: each authored commit changes only paths its member authored (AU from the last construct2)
authcheck() { local k=0 out="" m d x
  for m in "$@"; do k=$((k+1)); d=$(git diff --name-only "$m^1" "$m" | grep -vx "$LIFE" | tr '\n' ' ')
    x=$(minus "$d" "${AU[$k]}"); [ -n "${x// /}" ] && out="$out m$k:[$x]"; done; echo "${out:- ok}"; }
# shape m1..mn: commits per member (1 = authored only, 2 = absorption merge + authored)
shape() { local prev="" m o=""; for m in "$@"; do if [ -z "$prev" ]; then o="${o}1"; else o="$o$(git rev-list --count "$m" "^$prev" "^$TIPR")"; fi; prev=$m; done; echo "$o"; }
# report2 LABEL TIP TOP m1..mn
report2() { local label=$1 tip=$2 top=$3; shift 3; local cb; TIPR=$tip; cb=$(chainbase "$1" "$tip")
  printf '%-46s guard=%-22s %-10s d3=%-12s shape=%-4s auth=%-14s tipcheck=%s\n' "$label" "$(guard "$cb" "$tip" "$@")" \
    "$(complete "${!#}" "$top")" "$(d3 "$1" "$tip" "$top")" "$(shape "$@")" "$(authcheck "$@")" "$(reverts "$@")"; }
# run2 LABEL TIP TOP SPANS [PLACE]: construct and report, or print the stop
run2() { local out rc; construct2 "$2" "$3" "$4" "${5:-0}" > "$SP2/.out"; rc=$?; out=$(cat "$SP2/.out")
  if [ $rc = 0 ]; then OUT=$out; report2 "$1" "$2" "$3" $out
    printf '%-46s idempotent over its own output: %s\n' "" "$(same "$out" "$(construct2 "$2" "$3" "$(spans $out)")")"
    construct2 "$2" "$3" "$4" "${5:-0}" > /dev/null; else OUT=""; printf '%-46s %s\n' "$1" "$out"; fi; }
proof() { local t; t=$(compose "$1" "$3" "$2" 2>/dev/null) || { echo conflict; return; }; [ "$t" = "$(tree "$4")" ] && echo accept || echo REFUSE; }
