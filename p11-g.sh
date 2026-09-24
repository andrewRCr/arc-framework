# p11 case G: where a removal the advance passes lands. s.txt is shared, outside R(B). m2: m2 appends M2 and m3 leaves
# s.txt alone; mod: m2 appends M2 and m3 rewrites that line to M2m3. The loop stopped after m1's fix; a second correction
# then removes the line — unplaced, placed on m2, and placed on the terminal.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
setup() { newrepo $SD/r/$1; put base.txt v0; put t.txt t; put api.txt api v0; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm s
  git switch -qc wu; put m1.txt m1; put q.txt q m1; S1=$(hd); put m2.txt m2; printf '%s\n' a b c M2 > s.txt; git add s.txt; git commit -qm m2s; S2=$(hd)
  put m3.txt m3; put t.txt t T3; [ "$2" = mod ] && { printf '%s\n' a b c M2m3 > s.txt; git add s.txt; git commit -qm m3s; }; S3=$(hd)
  git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
  git switch -q main; put t.txt t MAIN; put api.txt api v1; put n.txt n main; B1=$(hd); git switch -q wu
  git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; printf '%s\n' q m1 ADAPTED > q.txt; printf '%s\n' n main ADAPTED > n.txt
  git add t.txt q.txt n.txt; git commit -q --no-edit; put m1.txt m1 FIXED; FT=$(hd)
  construct2 $B1 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); }
cmpz() { local tip=$1 top=$2 place=$3 a b x y
  a=$(construct2 $tip $top "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" $place 2>&1 | tr '\n' ' '); echo "  mixed : $a"
  b=$(construct2 $tip $top "${N[0]} ${N[1]} ${N[2]}|$B1 ${N[0]} ${N[1]}" $place 2>&1 | tr '\n' ' '); echo "  cands : $b"
  echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"; x=($a); y=($b)
  [ ${#x[@]} = 3 ] && echo "  mixed: terminal $(complete ${x[2]} $top); s.txt m2=[$(git show ${x[1]}:s.txt | tr '\n' ' ')] m3=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"
  [ ${#y[@]} = 3 ] && echo "  cands: terminal $(complete ${y[2]} $top); s.txt m2=[$(git show ${y[1]}:s.txt | tr '\n' ' ')] m3=[$(git show ${y[2]}:s.txt | tr '\n' ' ')]"; }
for mode in m2 mod; do for pl in 0 2 3; do
  rm_line=$([ $mode = mod ] && echo M2m3 || echo M2)
  echo "X-$mode-place$pl: second correction removes $rm_line"
  setup x$mode$pl $mode; printf '%s\n' a b c > s.txt; git add s.txt; git commit -qm "drop $rm_line"; T2=$(hd); cmpz $B1 $T2 $pl
done; done
