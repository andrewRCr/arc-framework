source "$(dirname "$0")/../lib8.sh"
# restack M1 M2 M3 FIXFILE: the provider's plain-rebase restack after member 1 is republished with a fix
restack() { local m1=$1 m2=$2 m3=$3 f=$4 N1 N2 N3
  git branch -f d1 $m1; git branch -f d2 $m2; git branch -f d3 $m3; git switch -q d1
  printf 'fixed\n' >> "$f"; git add "$f"; git commit -qm fix; N1=$(hd)
  git rebase -q --onto $N1 $m1 d2 >/dev/null 2>&1 || { echo "stopped at d2 on $(git diff --name-only --diff-filter=U | tr '\n' ' ')"; git rebase --abort; return; }; N2=$(hd)
  git rebase -q --onto $N2 $m2 d3 >/dev/null 2>&1 || { echo "stopped at d3 on $(git diff --name-only --diff-filter=U | tr '\n' ' ')"; git rebase --abort; return; }; N3=$(hd)
  echo "d2 proof=$(proof $m1 $m2 $N1 $N2) d3 proof=$(proof $m2 $m3 $N2 $N3) m2 kept=$(git diff --quiet $m2 $N2 -- m2.txt && echo yes || echo NO) m3 kept=$(git diff --quiet $m3 $N3 -- m3.txt && echo yes || echo NO)"
  git switch -q --detach; }

echo "== K. provider restack (plain rebase) over the new shapes"
newrepo $SP2/r/k1; put base.txt v0; put other.txt o0
git switch -qc wu; put m1.txt m1; S1=$(hd)
git switch -q main; put base.txt v1; B1=$(hd)
git switch -q wu; git merge -q --no-edit main; put m2.txt m2; S2=$(hd)
git switch -q main; put other.txt o1; B2=$(hd)
git switch -q wu; git merge -q --no-edit main; put m3.txt m3; S3=$(hd)
C0=$(construct2 $B2 $S3 "$(cuts $B2 $S1 $S2 $S3)")
git switch -q main; put m1.txt main-m1; T2=$(hd)
git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' resolved > m1.txt; git add m1.txt; git commit -qm merge; NT=$(hd)
B=($(construct2 $T2 $NT "$(spans $C0)")); echo "K1 member 1 re-anchored, m2 m3 single commits: $(restack ${B[@]} m1.txt)"
newrepo $SP2/r/k2; put base.txt v0; put other.txt o0
git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2 a b; S2=$(hd); put m3.txt m3; S3=$(hd)
git switch -q main; put far.txt f; B1=$(hd); C0=$(construct2 $B1 $S3 "$(cuts $B1 $S1 $S2 $S3)")
git switch -q main; put m2.txt m2 MAIN; T2=$(hd)
git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' m2 RESOLVED > m2.txt; git add m2.txt; git commit -qm merge; NT=$(hd)
C=($(construct2 $T2 $NT "$(spans $C0)")); echo "K2 member 2 absorbed with a resolution: $(restack ${C[@]} m1.txt)"
echo "K2' fix republished on member 2 instead:"; git branch -f d2 ${C[1]}; git branch -f d3 ${C[2]}; git switch -q d2; printf 'fixed\n' >> m2.txt; git add m2.txt; git commit -qm fix; N2=$(hd)
git rebase -q --onto $N2 ${C[1]} d3 >/dev/null 2>&1 && echo "   d3 proof=$(proof ${C[1]} ${C[2]} $N2 $(hd))" || { echo "   stopped"; git rebase --abort; }

echo "== L. the authored-commit check"
newrepo $SP2/r/l1; put base.txt v0; put other.txt o0
git switch -qc wu; put m1.txt m1; S1=$(hd)
git switch -q main; put base.txt v1; B1=$(hd)
git switch -q wu; git merge -q --no-edit main; put m2.txt m2; put base.txt v0; S2=$(hd)
run2 "L1 member 2 merges B1 then deliberately restores base.txt" $B1 $S2 "$(cuts $B1 $S1 $S2)"
newrepo $SP2/r/l2; put base.txt v0; put other.txt o0
git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd)
git switch -q main; put other.txt o1; B1=$(hd)
C=($(construct2 $B1 $S2 "$(cuts $B1 $S1 $S2)"))
# planted: member 2 given B1 as absorbed while its authored tree keeps the pre-B1 other.txt
bad=$(echo bad | git commit-tree $(tree ${C[1]}) -p $(absorb_merge ${C[0]} $B1 $(tree ${C[1]}) 2))
printf '%-46s guard=%-22s %-10s auth=%-18s tipcheck=%s\n' "L2 planted mis-attribution" "$(guard "$(chainbase ${C[0]} $B1)" $B1 ${C[0]} $bad)" "$(complete $bad $S2)" "$(authcheck ${C[0]} $bad)" "$(reverts ${C[0]} $bad)"

echo "== M. controller predicate: construct owed while the chain does not close and construct would clear it"
owed() { local tip=$1 top=$2; shift 2; local cb g c; cb=$(chainbase "$1" "$tip"); g=$(guard "$cb" "$tip" "$@"); c=$(complete "${!#}" "$top")
  if ! is_anc "$cb" "$top"; then echo "stop: anchor-not-in-top"; elif [ "$g" = PASS ] && [ "$c" = complete ]; then echo rematerialize
  elif [ "$g" != PASS ] && ! construct2 "$tip" "$top" "$(spans "$@")" >/dev/null; then echo "stop: $g (not clearable)"
  else echo "construct ($g, $c)"; fi; }
newrepo $SP2/r/m; put base.txt v0
git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2 a b; S2=$(hd); put m3.txt m3; S3=$(hd)
git switch -q main; put far.txt f; B1=$(hd); C0=$(construct2 $B1 $S3 "$(cuts $B1 $S1 $S2 $S3)")
git switch -q wu; put m2.txt m2 FIX; FT=$(hd)
echo "M1 fix on the top, chain not rebuilt:        $(owed $B1 $FT $C0)"
C1=$(construct2 $B1 $FT "$(spans $C0)" 2); echo "M1 after construct:                          $(owed $B1 $FT $C1)"
git switch -q main; put m1.txt MAIN; T2=$(hd)
echo "M2 overlap on m1, top not reconciled:        $(owed $T2 $FT $C1)"
git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' RES > m1.txt; git add m1.txt; git commit -qm merge; NT=$(hd)
echo "M2 top reconciled:                           $(owed $T2 $NT $C1)"
C2=$(construct2 $T2 $NT "$(spans $C1)"); echo "M2 after construct:                          $(owed $T2 $NT $C2)"
