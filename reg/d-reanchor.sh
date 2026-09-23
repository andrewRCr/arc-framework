# Targeted cases for the re-anchor rule. RULE=lib2 (pass five) or lib6 (re-anchor on overlap).
source "$(dirname "$0")/../lib8.sh"
source "$(dirname "$0")/restack.inc"
# pres TIP m1..mn: each request's three-dot diff — m1 against the tip (its base branch is main), later members
# against their predecessor
pres() { local tip=$1; shift; local prev=$tip m o=""; for m in "$@"; do
  o="$o [$(git diff --name-only "$(git merge-base "$prev" "$m")" "$m" | grep -vx "$LIFE" | tr '\n' ' ' | sed 's/ $//')]"; prev=$m; done; echo "$o"; }
mk() { # middle overlap (conflicting, resolved on the top) plus disjoint movement in the same advance
  newrepo $SP2/r/$1; put base.txt v0; put other.txt o0
  git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2 a b; S2=$(hd); put m3.txt m3; S3=$(hd)
  git switch -q main; put far.txt f; B1=$(hd)
  construct2 $B1 $S3 "$(cuts $B1 $S1 $S2 $S3)" > .c0; C0=$(cat .c0)
  git switch -q main; put m2.txt m2 MAIN; put far2.txt g; T2=$(hd)
  git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' m2 RESOLVED > m2.txt; git add m2.txt; git commit -qm merge; NT=$(hd); }
echo "== RULE=${RULE:-lib6}"
mk r1; run2 "R1 middle overlap + disjoint far2" $T2 $NT "$(spans $C0)"; echo "   presentation:$(pres $T2 $OUT)"
mk r2; put m1.txt m1 FIX; FT=$(hd); run2 "R2 + fix placed on m1" $T2 $FT "$(spans $C0)" 1
  echo "   m1.txt=$(git show $(sed -n 1p <<< "$OUT"):m1.txt | tr '\n' ' ') presentation:$(pres $T2 $OUT)"
mk r3; put m3.txt m3 FIX; FT=$(hd); run2 "R3 + fix placed on m3" $T2 $FT "$(spans $C0)" 3
  echo "   m3.txt=$(git show $(sed -n 3p <<< "$OUT"):m3.txt | tr '\n' ' ') presentation:$(pres $T2 $OUT)"
mk r4; construct2 $T2 $NT "$(spans $C0)" > .o; R=$(cat .o); echo "R4 provider restack over it, fix on m1: $(restack $(tr '\n' ' ' <<< "$R") m1.txt)"
mk r5; construct2 $T2 $NT "$(spans $C0)" > .o; R=$(cat .o)
  git switch -q main; put far3.txt h; T3=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; NT2=$(hd)
  run2 "R5 then disjoint far3 merged into top" $T3 $NT2 "$(spans $R)"; echo "   vs R: $(same "$R" "$OUT")  presentation:$(pres $T3 $OUT)"
