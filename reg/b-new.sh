SD=$(cd "$(dirname "$0")" && pwd)
# Spike 7b: lib7 over the cases that broke lib6, plus the terminal carry proof against R(B).
source "$SD/../lib8.sh"; SP2=$SD; ERR=$SD/.err
show() { local R=("$@"); for k in 0 1 2; do printf '   m%s parents=%s authored-diff=[%s]' $((k+1)) "$(git rev-list --parents -n1 ${R[$k]} | awk '{print NF-1}')" "$(git diff --name-only ${R[$k]}^1 ${R[$k]} | tr '\n' ' ')"
  for f in q.txt n.txt t.txt; do printf ' %s=[%s]' $f "$(git show ${R[$k]}:$f 2>/dev/null | tr '\n' ' ')"; done; echo; done; }
run() { local label=$1 top=$2 place=${3:-0}; construct2 $B1 $top "$(spans ${C0[@]})" $place > $SD/.o; rc=$?; R=($(cat $SD/.o))
  if [ $rc != 0 ]; then echo "$label: $(cat $SD/.o)"; return 1; fi
  echo "$label: J=$J R=[$RB] $(report2 x $B1 $top ${R[@]} | sed 's/^x *//')"; show "${R[@]}"
  printf '   idempotent: %s\n' "$(same "${R[*]}" "$(construct2 $B1 $top "$(spans ${R[@]})")")"; }
# base: three members over B0; m1 writes q.txt, m3 writes t.txt
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0
  git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c)); }
echo "== owner cases (clean merge of main, departure on q.txt / t.txt / main-added n.txt)"
for owner in 1 3 0; do setup f$owner; git switch -q main; put api.txt api v1; [ $owner = 0 ] && put n.txt n main; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1; f=q.txt; [ $owner = 3 ] && f=t.txt; [ $owner = 0 ] && f=n.txt
  printf '%s\n' "$(cat $f)" ADAPTED > $f; git add $f; git commit -q --amend --no-edit; run "departure on $f (owner m$owner)" $(hd); done
echo "== 4ae7872f3 shape: conflict on t.txt (terminal) + departures on q.txt (m1) and n.txt (main-added)"
setup a; git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
git add t.txt q.txt n.txt; git commit -q --no-edit; NT=$(hd); run "no placement" $NT
put m1.txt m1 FIXED; FT=$(hd); run "then a fix placed on m1" $FT 1
# the bound route's proofs: m2 (unselected) and the terminal, old chain -> new chain
O=(${C0[@]}); N=(${R[@]}); echo "   proof m2 (unselected): [$(proofpaths ${O[0]} ${N[0]} ${O[1]} ${N[1]})]   terminal: [$(proofpaths $(norm ${O[1]}) $(norm ${N[1]}) $(norm ${O[2]}) $(norm ${N[2]}))]  R=[$RB]"
echo "== the top fixes a file main added, in its own commit after the merge"
setup g; git switch -q main; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1
put n.txt n main FIXED-BY-WU; run "no placement" $(hd); run "placed on m1" $(hd) 1
echo "== disjoint conflicted absorption at the terminal (b7): proofs"
setup h; git switch -q main; put t.txt t MAIN; put far.txt f; B1=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1
printf '%s\n' t T3 MAIN > t.txt; git add t.txt; git commit -q --no-edit; put m1.txt m1 FIXED; run "fix on m1, conflicted terminal absorption" $(hd) 1
O=(${C0[@]}); N=(${R[@]}); echo "   proof m2: [$(proofpaths ${O[0]} ${N[0]} ${O[1]} ${N[1]})]  terminal after-pred=m2': [$(proofpaths $(norm ${O[1]}) $(norm ${N[1]}) $(norm ${O[2]}) $(norm ${N[2]}))]  after-pred=merge: [$(proofpaths $(norm ${O[1]}) $(norm ${N[2]}^1) $(norm ${O[2]}) $(norm ${N[2]}))]  R=[$RB]"
