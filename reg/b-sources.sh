source "$(dirname "$0")/../lib8.sh"
# S3-shaped history with multi-line files so fixes and later hunks can be placed precisely
build() {
  newrepo $SP2/r/$1; put base.txt v0; put other.txt o0; put shared.txt s1 s2 s3 s4 s5 s6
  git switch -qc wu; put m1.txt m1 x y; S1=$(hd)
  git switch -q main; put base.txt v1; B1=$(hd)
  git switch -q wu; git merge -q --no-edit main; put m2.txt m2 a b c d e; S2=$(hd)
  git switch -q main; put other.txt o1; B2=$(hd)
  git switch -q wu; git merge -q --no-edit main; put m3.txt m3; put life.md L; TOP=$(hd)
}
carries() { git show "$1:$2" 2>/dev/null | grep -c "$3"; }

echo "== F. two sequential pre-publication fixes (pass five's case B)"
build f; run2 "F first cut" $B2 $TOP "$(cuts $B2 $S1 $S2 $TOP)"; C0=$OUT
git switch -q wu; put m1.txt m1 FIX1 y; F1=$(hd)
run2 "F fix1 placed on m1" $B2 $F1 "$(spans $C0)" 1; C1=$OUT; echo "   vs C0: $(same "$C0" "$C1")  m1 FIX1=$(carries $(sed -n 1p <<< "$C1") m1.txt FIX1)"
put m2.txt m2 a FIX2 c d e; F2=$(hd)
run2 "F fix2 placed on m2, chain as it stands" $B2 $F2 "$(spans $C1)" 2; C2=$OUT
echo "   vs C1: $(same "$C1" "$C2")  m1 FIX1=$(carries $(sed -n 1p <<< "$C2") m1.txt FIX1)  m2 FIX2=$(carries $(sed -n 2p <<< "$C2") m2.txt FIX2)"
run2 "F fix2 on m2, original cut points" $B2 $F2 "$(cuts $B2 $S1 $S2 $TOP)" 2
echo "   (the cut list's terminal is the pre-fix top, so the delta to the corrected top is fix1+fix2 -> m1 FIX1=$( [ -n "$OUT" ] && carries $(sed -n 1p <<< "$OUT") m1.txt FIX1))"

echo "== G. a binding stopped after member 2, re-run over the mixed chain (pass five's case A)"
build g; run2 "G first cut" $B2 $TOP "$(cuts $B2 $S1 $S2 $TOP)"; C0=$OUT
git switch -q wu; put m2.txt m2 a FIX c d e; FT=$(hd)
run2 "G full rebuild, fix on m2" $B2 $FT "$(spans $C0)" 2; C1=$OUT
M0=($C0); M1=($C1); MIX="${M1[0]} ${M1[1]} ${M0[2]}"
run2 "G re-run over mixed chain, own predecessors" $B2 $FT "$(spans $MIX)" 2; echo "   vs full rebuild: $(same "$C1" "$OUT")"
run2 "G re-run over mixed chain, list neighbours" $B2 $FT "$(nspans $MIX)" 2; echo "   vs full rebuild: $(same "$C1" "$OUT")"
M1b=(${M0[0]} ${M1[1]}); MIX2="${M1[0]} ${M0[1]} ${M0[2]}"
run2 "G re-run, stopped after member 1" $B2 $FT "$(spans $MIX2)" 2; echo "   vs full rebuild: $(same "$C1" "$OUT")"

echo "== H. authoring-side recut: a hand chain on a base the top lacks (probe 2's shape)"
build h; git switch -q main; put newer.txt n; BN=$(hd)
h1=$(echo h1 | git commit-tree $(compose $(git merge-base $S1 $BN) $BN $(norm $S1)) -p $BN)
h2=$(echo h2 | git commit-tree $(compose $(norm $S1) $h1 $(norm $S2)) -p $h1)
h3=$(echo h3 | git commit-tree $(compose $(norm $S2) $h2 $(norm $TOP)) -p $h2)
report2 "H hand chain" $BN $TOP $h1 $h2 $h3
run2 "H construct over the hand chain as it stands" $BN $TOP "$(spans $h1 $h2 $h3)"
run2 "H construct from the cut list (the recut)" $BN $TOP "$(cuts $BN $S1 $S2 $TOP)"

echo "== I. placement on member 1 (the path the pass-four spike modelled wrongly)"
build i; run2 "I first cut" $B2 $TOP "$(cuts $B2 $S1 $S2 $TOP)"; C0=$OUT
git switch -q main; put far.txt f; B3=$(hd); git switch -q wu; git merge -q --no-edit main; put m1.txt m1 FIX y; FT=$(hd)
run2 "I1 fix on m1, range merged a disjoint base" $B3 $FT "$(spans $C0)" 1
echo "   vs C0: $(same "$C0" "$OUT")  m1 FIX=$(carries $(sed -n 1p <<< "$OUT") m1.txt FIX)  m1 far.txt=$(git show $(sed -n 1p <<< "$OUT"):far.txt 2>/dev/null || echo absent)  m3 far.txt=$(git show $(sed -n 3p <<< "$OUT"):far.txt 2>/dev/null || echo absent)"
build i2; run2 "I2 first cut" $B2 $TOP "$(cuts $B2 $S1 $S2 $TOP)"; C0=$OUT
git switch -q main; put m1.txt MAIN x y; B3=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1
printf '%s\n' RES x y > m1.txt; git add m1.txt; git commit -qm merge; put m1.txt RES x FIX; FT=$(hd)
run2 "I2 fix on m1, range merged a base overlapping m1" $B3 $FT "$(spans $C0)" 1
echo "   m1 m1.txt=$(git show $(sed -n 1p <<< "$OUT"):m1.txt 2>/dev/null | tr '\n' ' ') m1 on tip: $([ "$(git rev-parse $(sed -n 1p <<< "$OUT")^1 2>/dev/null)" = $B3 ] && echo yes || echo no)"
run2 "I2 same, no placement" $B3 $FT "$(spans $C0)"

echo "== J. the pass-four placement cases, re-run"
build j5; git switch -q wu; git reset -q --hard $S2; put shared.txt s1 s2 s3 s4 s5 M3; put m3.txt m3; TOP=$(hd)
run2 "J first cut" $B2 $TOP "$(cuts $B2 $S1 $S2 $TOP)"; C0=$OUT
put shared.txt FIX s2 s3 s4 s5 M3; FT=$(hd); run2 "S5a fix m2, later member edits other hunk" $B2 $FT "$(spans $C0)" 2
git reset -q --hard $TOP; put shared.txt s1 s2 s3 s4 s5 FIX; FT=$(hd); run2 "S5b fix m2, later member edits same hunk" $B2 $FT "$(spans $C0)" 2
build j6; run2 "J first cut" $B2 $TOP "$(cuts $B2 $S1 $S2 $TOP)"; C0=$OUT
git switch -q main; put far.txt f; B3=$(hd); git switch -q wu; git merge -q --no-edit main; put m2.txt m2 a FIX c d e; FT=$(hd)
run2 "S6 fix m2, range absorbed a newer base" $B3 $FT "$(spans $C0)" 2; echo "   vs C0: $(same "$C0" "$OUT")"
build j6b; run2 "J first cut" $B2 $TOP "$(cuts $B2 $S1 $S2 $TOP)"; C0=$OUT
git switch -q main; put m3.txt main-m3; B3=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; put m3.txt m3-resolved; put m2.txt m2 a FIX c d e; FT=$(hd)
run2 "S6b fix m2, range merged a conflicting base" $B3 $FT "$(spans $C0)" 2; echo "   vs C0: $(same "$C0" "$OUT")  m3 m3.txt=$(git show $(sed -n 3p <<< "$OUT"):m3.txt 2>/dev/null)"
build j7; run2 "J first cut" $B2 $TOP "$(cuts $B2 $S1 $S2 $TOP)"; C0=$OUT
git switch -q wu; put m3.txt m3 more; T7=$(hd); run2 "S7a further work -> terminal" $B2 $T7 "$(spans $C0)"; echo "   vs C0: $(same "$C0" "$OUT")"
git switch -q main; put far.txt f; B3=$(hd); git switch -q wu; git merge -q --no-edit main; T7b=$(hd)
run2 "S7b + base merge into top -> terminal" $B3 $T7b "$(spans $C0)"; echo "   vs C0: $(same "$C0" "$OUT")"
