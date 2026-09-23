source "$(dirname "$0")/../lib8.sh"
uncut() { printf '%-46s guard=%s\n' "$1 [uncut]" "$(guard "$(chainbase ${2%% *} $3)" $3 $2)"; }
echo "== A. first cut over the pass-four topologies"
# S1 — base merge inside member 2's range, disjoint
newrepo $SP2/r/s1; put base.txt v0; put shared.txt a b c
git switch -qc wu; put m1.txt m1; put life.md L1; S1=$(hd)
git switch -q main; put base.txt v1; BP=$(hd)
git switch -q wu; git merge -q --no-edit main; put m2.txt m2; put life.md L2; S2=$(hd)
uncut "S1 in-range base merge (disjoint)" "$S1 $S2" $BP; run2 "S1 in-range base merge (disjoint)" $BP $S2 "$(cuts $BP $S1 $S2)"
# S2 — member 2's range resolved a conflict between member 1 and the base
newrepo $SP2/r/s2; put shared.txt a b c
git switch -qc wu; put shared.txt a WU c; S1=$(hd)
git switch -q main; put shared.txt a MAIN c; BP=$(hd)
git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' a RESOLVED c > shared.txt; git add shared.txt; git commit -qm merge; put m2.txt m2; S2=$(hd)
uncut "S2 in-range merge resolved a conflict" "$S1 $S2" $BP; run2 "S2 in-range merge resolved a conflict" $BP $S2 "$(cuts $BP $S1 $S2)"
echo "   m1 shared.txt: $(git show $(sed -n 1p <<< "$OUT"):shared.txt | tr '\n' ' ')  m1 parent is BP: $([ "$(git rev-parse $(sed -n 1p <<< "$OUT")^1)" = $BP ] && echo yes || echo no)"
S2OUT=$OUT; again=$(construct2 $BP $S2 "$(spans $S2OUT)"); echo "   rebuilt over its own output: $(same "$S2OUT" "$again")"
# S3 — three members, merges of B1 in m2 and B2 in m3
newrepo $SP2/r/s3; put base.txt v0; put other.txt o0
git switch -qc wu; put m1.txt m1; S1=$(hd)
git switch -q main; put base.txt v1; B1=$(hd)
git switch -q wu; git merge -q --no-edit main; put m2.txt m2; S2=$(hd)
git switch -q main; put other.txt o1; B2=$(hd)
git switch -q wu; git merge -q --no-edit main; put m3.txt m3; S3=$(hd)
uncut "S3 merges in m2 and m3" "$S1 $S2 $S3" $B2; run2 "S3 merges in m2 and m3" $B2 $S3 "$(cuts $B2 $S1 $S2 $S3)"; C0=$OUT
git switch -q main; put far.txt f; T1=$(hd)
run2 "S3 + disjoint tip movement (rebuild C0)" $T1 $S3 "$(spans $C0)"; echo "   vs C0: $(same "$C0" "$OUT")"
git switch -q main; put m1.txt main-m1; T2=$(hd)
run2 "S3 + movement on m1, top not merged" $T2 $S3 "$(spans $C0)"

echo "== B. overlap on member 1 after the cut, reconciled on the top"
git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' resolved > m1.txt; git add m1.txt; git commit -qm merge; NT=$(hd)
uncut "B uncut, cut points S1 S2 NT" "$S1 $S2 $NT" $T2
run2 "B rebuild C0, no placement" $T2 $NT "$(spans $C0)"; B=$OUT
echo "   vs C0: $(same "$C0" "$B")  m1 m1.txt=$(git show $(sed -n 1p <<< "$B"):m1.txt)  m1 parent is tip: $([ "$(git rev-parse $(sed -n 1p <<< "$B")^1)" = $T2 ] && echo yes || echo no)"
again=$(construct2 $T2 $NT "$(spans $B)"); echo "   rebuilt over its own output: $(same "$B" "$again")"
run2 "B fresh first cut S1 S2 NT" $T2 $NT "$(cuts $T2 $S1 $S2 $NT)"; echo "   vs rebuild: $(same "$B" "$OUT")"

echo "== C. overlap on member 2 (middle), reconciled on the top"
newrepo $SP2/r/c; put base.txt v0; put other.txt o0
git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2 a b; S2=$(hd); put m3.txt m3; S3=$(hd)
git switch -q main; put far.txt f; B1=$(hd)
run2 "C first cut" $B1 $S3 "$(cuts $B1 $S1 $S2 $S3)"; C0=$OUT
git switch -q main; put m2.txt m2 MAIN; T2=$(hd)
git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' m2 RESOLVED > m2.txt; git add m2.txt; git commit -qm merge; NT=$(hd)
run2 "C rebuild, no placement" $T2 $NT "$(spans $C0)"; echo "   vs C0: $(same "$C0" "$OUT")  m2 m2.txt=$(git show $(sed -n 2p <<< "$OUT"):m2.txt | tr '\n' ' ')"
Cout=$OUT; again=$(construct2 $T2 $NT "$(spans $Cout)"); echo "   rebuilt over its own output: $(same "$Cout" "$again")"

echo "== D. entangled: members 1 and 3 both edit the path the base moved"
newrepo $SP2/r/d; put shared.txt a b c d e
git switch -qc wu; put shared.txt A b c d e; S1=$(hd); put m2.txt m2; S2=$(hd); put shared.txt A b c d E; S3=$(hd)
git switch -q main; put far.txt f; B1=$(hd)
run2 "D first cut" $B1 $S3 "$(cuts $B1 $S1 $S2 $S3)"; C0=$OUT
git switch -q main; put shared.txt MAIN b c d e; T2=$(hd)
git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' RES b c d E > shared.txt; git add shared.txt; git commit -qm merge; NT=$(hd)
run2 "D rebuild, no placement" $T2 $NT "$(spans $C0)"
echo "   m1 shared.txt: $(git show $(sed -n 1p <<< "$OUT"):shared.txt 2>/dev/null | tr '\n' ' ')  m3: $(git show $(sed -n 3p <<< "$OUT"):shared.txt 2>/dev/null | tr '\n' ' ')"
echo "== D2. members 1 and 3 edit the SAME hunk the base moved"
newrepo $SP2/r/d2; put shared.txt a b c d e
git switch -qc wu; put shared.txt A b c d e; S1=$(hd); put m2.txt m2; S2=$(hd); put shared.txt A3 b c d e; S3=$(hd)
git switch -q main; put far.txt f; B1=$(hd)
run2 "D2 first cut" $B1 $S3 "$(cuts $B1 $S1 $S2 $S3)"; C0=$OUT
git switch -q main; put shared.txt MAIN b c d e; T2=$(hd)
git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' RES b c d e > shared.txt; git add shared.txt; git commit -qm merge; NT=$(hd)
run2 "D2 rebuild" $T2 $NT "$(spans $C0)"

echo "== E. disjoint movement merged into the top: terminal absorbs, lower members retained"
newrepo $SP2/r/e; put base.txt v0
git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put life.md L; S3=$(hd)
git switch -q main; put base.txt v1; B1=$(hd)
run2 "E first cut" $B1 $S3 "$(cuts $B1 $S1 $S2 $S3)"; C0=$OUT
git switch -q main; put far.txt f; T1=$(hd)
run2 "E disjoint, top not merged" $T1 $S3 "$(spans $C0)"; echo "   vs C0: $(same "$C0" "$OUT")"
git switch -q wu; git merge -q --no-edit main; NT=$(hd)
run2 "E disjoint, merged into top" $T1 $NT "$(spans $C0)"; echo "   vs C0: $(same "$C0" "$OUT")"
