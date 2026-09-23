restack() { local m1=$1 m2=$2 m3=$3 f=$4 N1 N2 N3
  git branch -f d1 $m1; git branch -f d2 $m2; git branch -f d3 $m3; git switch -q d1
  printf 'fixed\n' >> "$f"; git add "$f"; git commit -qm fix; N1=$(hd)
  git rebase -q --onto $N1 $m1 d2 >/dev/null 2>&1 || { echo "stopped at d2 on $(git diff --name-only --diff-filter=U | tr '\n' ' ')"; git rebase --abort; return; }; N2=$(hd)
  git rebase -q --onto $N2 $m2 d3 >/dev/null 2>&1 || { echo "stopped at d3 on $(git diff --name-only --diff-filter=U | tr '\n' ' ')"; git rebase --abort; return; }; N3=$(hd)
  echo "d2 proof=$(proof $m1 $m2 $N1 $N2) d3 proof=$(proof $m2 $m3 $N2 $N3) m2 kept=$(git diff --quiet $m2 $N2 -- m2.txt && echo yes || echo NO) m3 kept=$(git diff --quiet $m3 $N3 -- m3.txt && echo yes || echo NO)"
  git switch -q --detach; }

