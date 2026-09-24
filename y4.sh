# y4: resolutions across a stopped rewrite. A correction on m1 touches the line m2 wrote next to it, so the fold at m1
# and m2's reapplication both conflict; the agent resolves both. The run stops after binding m1, leaving a mixed chain,
# and the re-run carries m2 across the break -- with nothing moved, and after a disjoint base move.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
tset() { local ix; ix=$(mktemp); rm -f $ix; GIT_INDEX_FILE=$ix git read-tree "$1"; shift
  while [ $# -gt 0 ]; do GIT_INDEX_FILE=$ix git update-index --add --cacheinfo 100644,$(printf '%s\n' $2 | git hash-object -w --stdin),$1; shift 2; done
  GIT_INDEX_FILE=$ix git write-tree; rm -f $ix; }
w() { printf '%s\n' $2 > $1; git add $1; }
show() { local x=($1); [ ${#x[@]} = 3 ] && echo "    terminal $(complete ${x[2]} $2); s.txt m1=[$(git show ${x[0]}:s.txt | tr '\n' ' ')] m2=[$(git show ${x[1]}:s.txt | tr '\n' ' ')] m3=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"; }
newrepo $SD/r/y4; put base.txt v0; w s.txt "a b c d e"; git commit -qm s; git switch -qc wu
put m1.txt m1; w s.txt "a b M1 d e"; git commit -qm m1s; S1=$(hd)
put m2.txt m2; w s.txt "a b M1 M2 e"; git commit -qm m2s; S2=$(hd); put m3.txt m3; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
w s.txt "a b M1FIXED M2 e"; git commit -qm fix; FT=$(hd)
R1=$(tset $(git rev-parse ${C0[0]}^{tree}) s.txt "a b M1FIXED d e"); R2=$(tset $(git rev-parse ${C0[1]}^{tree}) s.txt "a b M1FIXED M2 e")
echo "== run 1"; echo "  plain: $(construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' ')"
echo "  RES1: $(FIX1=$R1 construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' ')"
a=$(FIX1=$R1 RES2=$R2 construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); N=($a); echo "  RES1+RES2: $a"; show "$a" $FT
echo "== re-run over the mixed chain (m1 bound, m2 m3 old), nothing moved"
MX="${N[0]} ${C0[1]} ${C0[2]}|$B0 ${C0[0]} ${C0[1]}"
echo "  plain: $(construct2 $B0 $FT "$MX" 1 2>&1 | tr '\n' ' ')"
b=$(RES2=$R2 construct2 $B0 $FT "$MX" 1 2>&1 | tr '\n' ' '); echo "  RES2: $b"; show "$b" $FT
echo "    same objects as run 1: $([ "$a" = "$b" ] && echo yes || echo NO)"
echo "== re-run over the mixed chain after a disjoint base move absorbed by the top"
git switch -q main; put base.txt v1; B1=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; T2=$(hd)
echo "  plain: $(construct2 $B1 $T2 "$MX" 1 2>&1 | tr '\n' ' ')"
c=$(RES2=$R2 construct2 $B1 $T2 "$MX" 1 2>&1 | tr '\n' ' '); echo "  RES2: $c"; show "$c" $T2
echo "== the re-runs with m1 resolved to its own version (it already carries the correction)"
git checkout -q $FT 2>/dev/null; R1b=$(git rev-parse ${N[0]}^{tree})
d=$(FIX1=$R1b RES2=$R2 construct2 $B0 $FT "$MX" 1 2>&1 | tr '\n' ' '); echo "  nothing moved: $d"; show "$d" $FT
echo "    same objects as run 1: $([ "$a" = "$d" ] && echo yes || echo NO)"
R1c=$(tset $(git rev-parse ${N[0]}^{tree}) base.txt v1); R2c=$(tset $R2 base.txt v1)
e=$(FIX1=$R1b RES2=$R2 construct2 $B1 $T2 "$MX" 1 2>&1 | tr '\n' ' '); echo "  base moved: $e"; show "$e" $T2
