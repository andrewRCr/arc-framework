# Spike helpers: member construction, the D2 guard, completeness, and the D3 discriminator, in git plumbing.
export GIT_AUTHOR_NAME=a GIT_AUTHOR_EMAIL=a@b GIT_COMMITTER_NAME=a GIT_COMMITTER_EMAIL=a@b
export GIT_AUTHOR_DATE="2026-01-01T00:00:00Z" GIT_COMMITTER_DATE="2026-01-01T00:00:00Z"
LIFE=life.md

newrepo() { rm -rf "$1"; mkdir -p "$1"; cd "$1" || exit 1; git init -q -b main; }
# put <file> <content...>: write lines and commit on the current branch
put() { local f=$1; shift; printf '%s\n' "$@" > "$f"; git add "$f"; git commit -qm "edit $f"; }
hd() { git rev-parse HEAD; }
tree() { git rev-parse "$1^{tree}"; }

# norm <commit>: a parentless commit whose tree is <commit>'s tree without the lifecycle path.
norm() {
  local idx; idx=$(mktemp); rm -f "$idx"
  GIT_INDEX_FILE=$idx git read-tree "$1"
  GIT_INDEX_FILE=$idx git update-index --force-remove "$LIFE"
  local t; t=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"
  echo norm | git commit-tree "$t"
}
# compose <base> <left> <right>: three-way tree, or return 1 with the conflicted paths on stderr.
compose() {
  local out; out=$(git merge-tree --write-tree --name-only --merge-base="$1" "$2" "$3") \
    || { echo "$out" | sed -n '2,/^$/p' | sed '/^$/d' | tr '\n' ' ' >&2; return 1; }
  echo "$out" | sed -n 1p
}
tc() { echo tmp | git commit-tree "$1"; }   # tree -> throwaway commit (merge-tree takes commits)
is_anc() { git merge-base --is-ancestor "$1" "$2"; }
newest() { if is_anc "$1" "$2"; then echo "$2"; else echo "$1"; fi; }   # of two bases on a linear main

# construct MODE TIP "s1 s2 ... sn" [FIX_INTO FIX_BASE FIX_TOP]
#   MODE: flat   — every member one single-parent commit (the spec as written)
#         absorb — option (c): a member whose content absorbed a base newer than its predecessor's also
#                  carries that base as a second parent
#         newest — option (b): flat, anchored on the newest base the top absorbed
#   Sources are the boundary commits the members are recut from (work-unit cuts, or constructed members).
#   FIX_*: fold the delta FIX_BASE→FIX_TOP (both un-normalized tops) into member FIX_INTO.
# Prints member oids, one per line; exits 1 with "CONFLICT k paths" on a stop.
construct() {
  local mode=$1 tip=$2; read -r -a S <<< "$3"; local fk=${4:-0} fb=${5:-} ft=${6:-}
  local n=${#S[@]} k prev prevsrc anchor abs absprev t parents c fixabs=""
  local fx="" n0; n0=$(wc -w <<< "$3")
  if [ "$fk" != 0 ]; then fixabs=$(git merge-base "$ft" "$tip"); is_anc "$fixabs" "$fb" && fixabs=""; fi
  if [ -n "$fixabs" ] && [ "$fk" -lt "$n0" ] && { [ "$mode" = absorb ] || [ "$mode" = split ]; }; then   # SPLIT
    if fx=$(compose "$(git merge-base "$fb" "$fixabs")" "$fb" "$fixabs" 2>/tmp/spk.$$); then
      fx=$(echo x | git commit-tree "$fx" -p "$fb" -p "$fixabs")
    else   # fall back to the range's own resolved merge, when it sits directly on the old top
      fx=$(git rev-list --parents "$fb..$ft" | awk -v a="$fb" -v b="$fixabs" '$2==a && $3==b {print $1}')
      [ -z "$fx" ] && { echo "CONFLICT $fk(fix-base-entangled) $(cat /tmp/spk.$$)"; return 1; }
    fi
  fi
  if [ "$mode" = newest ]; then
    anchor=$(git merge-base "${S[$((n-1))]}" "$tip"); [ -n "$fixabs" ] && anchor=$(newest "$anchor" "$fixabs")
  else anchor=$(git merge-base "${S[0]}" "$tip"); fi
  prev=$anchor; prevsrc=$(git merge-base "${S[0]}" "$tip"); absprev=$anchor
  for ((k=1; k<=n; k++)); do
    local s=${S[$((k-1))]}
    t=$(compose "$prevsrc" "$prev" "$(norm "$s")" 2>/tmp/spk.$$) || { echo "CONFLICT $k $(cat /tmp/spk.$$)"; return 1; }
    [ "$k" = 1 ] && [ "$mode" != newest ] && t=$(tree "$(norm "$s")")
    if [ -n "$fx" ] && [ "$k" = "$n" ]; then   # terminal carries the delta's base absorption
      t=$(compose "$(norm "$fb")" "$(tc "$t")" "$(norm "$fx")" 2>/tmp/spk.$$) \
        || { echo "CONFLICT $k(fix-base) $(cat /tmp/spk.$$)"; return 1; }
    fi
    if [ "$fk" = "$k" ]; then
      t=$(compose "$(norm "${fx:-$fb}")" "$(tc "$t")" "$(norm "$ft")" 2>/tmp/spk.$$) \
        || { echo "CONFLICT $k(fix) $(cat /tmp/spk.$$)"; return 1; }
    fi
    parents="-p $prev"
    if { [ "$mode" = absorb ] || [ "$mode" = split ]; } && [ "$k" -gt 1 ]; then
      abs=$(git merge-base "$s" "$tip")
      if [ -n "$fixabs" ]; then { [ -n "$fx" ] && [ "$k" = "$n" ]; } || { [ -z "$fx" ] && [ "$k" = "$fk" ]; } && abs=$(newest "$abs" "$fixabs"); fi
      if ! is_anc "$abs" "$prev"; then parents="$parents -p $abs"; fi
    elif { [ "$mode" = absorb ] || [ "$mode" = split ]; } && [ "$k" = 1 ] && [ "$fk" = 1 ]; then
      [ -n "$fixabs" ] && { abs=$(newest "$anchor" "$fixabs"); is_anc "$abs" "$prev" || parents="$parents -p $abs"; }
    fi
    if [ "$mode" = split ] && [ "$(wc -w <<< "$parents")" = 4 ]; then
      c=$(absorb_merge "$prev" "${parents##* }" "$t" "$k"); parents="-p $c"
    fi
    c=$(echo "member $k" | git commit-tree "$t" $parents)
    echo "$c"; prev=$c; prevsrc=$(norm "$s")
  done
}

# authored <member> <pred> <tip>: combined-diff paths of the member's commit set, lifecycle excluded.
authored() {
  git rev-list "$1" "^$2" "^$3" | while read -r c; do git diff-tree -c --no-commit-id --name-only -r "$c"; done \
    | grep -vx "$LIFE" | sort -u | tr '\n' ' '
}
# guard <chainbase> <tip> m1..mn: the per-member D2 guard; prints PASS or REFUSE k:paths.
guard() {
  local cb=$1 tip=$2; shift 2; local pred=$cb k=0 out="" a r i
  for m in "$@"; do k=$((k+1))
    a=$(authored "$m" "$pred" "$tip"); r=$(git diff --name-only "$(git merge-base "$m" "$tip")" "$tip" | tr '\n' ' ')
    i=$(comm -12 <(tr ' ' '\n' <<< "$a" | sed '/^$/d' | sort) <(tr ' ' '\n' <<< "$r" | sed '/^$/d' | sort) | tr '\n' ' ')
    [ -n "${i// /}" ] && out="$out m$k:[$i]"
    pred=$m
  done
  [ -z "$out" ] && echo PASS || echo "REFUSE$out"
}
chainbase() { if is_anc "$2" "$1"; then echo "$2"; else git merge-base "$1" "$2"; fi; }   # <m1> <tip>
complete() { [ "$(tree "$1")" = "$(tree "$(norm "$2")")" ] && echo complete || echo INCOMPLETE; }
d3() { is_anc "$(chainbase "$1" "$2")" "$3" && echo ancestor || echo not-ancestor; }   # <m1> <tip> <top>
# report LABEL MODE TIP TOP members...: guard, completeness, and discriminator in one line
report() {
  local label=$1 mode=$2 tip=$3 top=$4; shift 4
  local cb; cb=$(chainbase "$1" "$tip")
  printf '%-44s %-7s guard=%-28s %s d3=%s parents=%s reverts=%s\n' "$label" "$mode" "$(guard "$cb" "$tip" "$@")" \
    "$(complete "${!#}" "$top")" "$(d3 "$1" "$tip" "$top")" \
    "$(for m in "$@"; do git rev-list --parents -n1 "$m" | awk '{printf NF-1}'; done)" "$(reverts "$@")"
}

# reverts m1..mn: for a member with a second parent A, a path A moved that the member leaves at its first
# parent's version is a silently reverted base change (combined diff cannot show it).
reverts() {
  local k=0 out="" m p a f x pred=""
  for m in "$@"; do k=$((k+1))
    for x in $(git rev-list --merges "$m" ${pred:+"^$pred"}); do read -r _ p a <<< "$(git rev-list --parents -n1 "$x")"
      for f in $(git diff --name-only "$(git merge-base "$p" "$a")" "$a"); do
        [ "$(git rev-parse -q --verify "$m:$f")" = "$(git rev-parse -q --verify "$p:$f")" ] \
          && [ "$(git rev-parse -q --verify "$p:$f")" != "$(git rev-parse -q --verify "$a:$f")" ] && out="$out m$k:$f"
      done
    done; pred=$m
  done; echo "${out:- none}"
}

# absorb_merge <pred> <base> <member-tree> <k>: a pure absorption merge of <base> into <pred>; a conflicted
# path takes the member's own version, which is where the work unit's resolution already lives.
absorb_merge() {
  local out t f idx; out=$(git merge-tree --write-tree --name-only --merge-base="$(git merge-base "$1" "$2")" "$1" "$2")
  t=$(sed -n 1p <<< "$out")
  if [ "$(sed -n '2,/^$/p' <<< "$out" | sed '/^$/d' | wc -l)" -gt 0 ]; then
    idx=$(mktemp); rm -f "$idx"; GIT_INDEX_FILE=$idx git read-tree "$t"
    for f in $(sed -n '2,/^$/p' <<< "$out" | sed '/^$/d'); do
      GIT_INDEX_FILE=$idx git update-index --cacheinfo "100644,$(git rev-parse "$3:$f"),$f"
    done; t=$(GIT_INDEX_FILE=$idx git write-tree); rm -f "$idx"
  fi
  echo "absorb base into member $4" | git commit-tree "$t" -p "$1" -p "$2"
}
