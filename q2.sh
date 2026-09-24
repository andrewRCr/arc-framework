# q2 (pass-15 reviewer probe): no base movement. m1/m2/m3 add their own files; a first correction fixes m1.txt, placed on
# m1; the loop stops after m1 (mixed: new m1 over old m2, m3); nothing moves; a second correction removes m3.txt (only
# the terminal holds it), placed on m1 (the bound route's placement). Construct over the mixed chain against construct
# over the loop's candidates, under BOUND (and BRKCHK=1 extends the bound check to members at/above the break).
source "$(dirname "$0")/${LIB:-lib8.sh}"; SD=$SD8
newrepo $SD/r/q2$1; put base.txt v0
git switch -qc wu; put m1.txt m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
put m1.txt m1 FIXED; FT=$(hd)
construct2 $B0 $FT "$(spans ${C0[@]})" 1 > $SD/.o; N=($(cat $SD/.o)); echo "  N (loop's candidates): ${N[*]}"
git rm -q m3.txt; git commit -qm "remove m3.txt"; T2=$(hd)
a=$(construct2 $B0 $T2 "${N[0]} ${C0[1]} ${C0[2]}|$B0 ${C0[0]} ${C0[1]}" 1 2>&1 | tr '\n' ' '); echo "  mixed : $a"
b=$(construct2 $B0 $T2 "${N[0]} ${N[1]} ${N[2]}|$B0 ${N[0]} ${N[1]}" 1 2>&1 | tr '\n' ' '); echo "  cands : $b"
echo "  equal : $([ "$a" = "$b" ] && echo yes || echo NO)"
x=($a); [ ${#x[@]} = 3 ] && echo "  mixed terminal m3.txt: $(git rev-parse -q --verify ${x[2]}:m3.txt >/dev/null && echo present || echo absent)"
