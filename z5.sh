# z5: y4b's shape with a touching mixed correction -- m1's line fixed and m2's adjacent line removed in one commit --
# placed on m1, every conflict resolved by composition (RESDB), the binding stopped after m1. The stopped binding
# continued by recomposing it (the recorded top as the thirteenth fold passed it, gated to the placement, the
# cherry-pick test alone, a first-merge conflict read as not carried) and by binding the chain it constructed.
source "$(dirname "$0")/lib8.sh"; SD=$SD8; export SHOWKEY=1
complete() { [ "$(ntree $1)" = "$(ntree $2)" ] && echo complete || echo INCOMPLETE; }
tset() { local ix; ix=$(mktemp); rm -f $ix; GIT_INDEX_FILE=$ix git read-tree "$1"; shift
  while [ $# -gt 0 ]; do GIT_INDEX_FILE=$ix git update-index --add --cacheinfo 100644,$(printf '%s\n' $2 | git hash-object -w --stdin),$1; shift 2; done
  GIT_INDEX_FILE=$ix git write-tree; rm -f $ix; }
w() { printf '%s\n' $2 > $1; git add $1; }
key() { sed -n 's/.*key=\([0-9a-f:]*\).*/\1/p' <<< "$1" | tr ':' ' '; }
show() { local x=($1); [ ${#x[@]} = 3 ] && echo "    terminal $(complete ${x[2]} $2); s.txt m1=[$(git show ${x[0]}:s.txt | tr '\n' ' ')] m2=[$(git show ${x[1]}:s.txt | tr '\n' ' ')] m3=[$(git show ${x[2]}:s.txt | tr '\n' ' ')]"; }
row() { local label=$1 b; shift; b=$(for kv in "$@"; do export "$kv"; done; RESDB=$DB construct2 $B0 $FT "$MX" 1 2>&1 | tr '\n' ' ')
  echo "  $label: equal-N=$([ "$b" = "$o" ] && echo yes || echo NO) ${b:0:60}"; show "$b" $FT; }
newrepo $SD/r/z5; put base.txt v0; w s.txt "a b c d e"; git commit -qm s; git switch -qc wu
put m1.txt m1; w s.txt "a b M1 d e"; git commit -qm m1s; S1=$(hd)
put m2.txt m2; w s.txt "a b M1 M2 e"; git commit -qm m2s; S2=$(hd); put m3.txt m3; S3=$(hd)
B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
w s.txt "a b M1FIXED e"; git commit -qm "fix M1, drop M2"; FT=$(hd); DB=$SD/r/z5.db; : > $DB
for i in 1 2 3 4 5 6; do
  o=$(RESDB=$DB construct2 $B0 $FT "$(spans ${C0[@]})" 1 2>&1 | tr '\n' ' '); x=($o)
  [ "${x[0]}" != STOP ] && break; echo "  stop: ${o:0:40}"
  case "${x[1]}" in
    "m1(fix)") r=$(tset $(git rev-parse ${C0[0]}^{tree}) s.txt "a b M1FIXED d e");;
    m2) r=$(tset $(git rev-parse ${C0[1]}^{tree}) s.txt "a b M1FIXED M2 e");;
    "m2(fix)") r=$(tset $(git rev-parse ${C0[1]}^{tree}) s.txt "a b M1FIXED e");;
    *) echo "  unexpected stop"; break;; esac
  echo "$(key "$o") $r" >> $DB; done
N=($o); echo "== full rebuild N: ${o:0:130}"; show "$o" $FT
MX="${N[0]} ${C0[1]} ${C0[2]}|$B0 ${C0[0]} ${C0[1]}"
row "recomposed, recorded top" CONT_TOP=$FT CONTPL=0
row "recomposed, recorded top gated to the placement" CONT_TOP=$FT CONTPL=1
row "recomposed, cherry-pick test alone" CONTPL=0
row "recomposed, a first-merge conflict read as not carried" CONT_TOP=$FT NOTCARRIED=1
b=$(RESDB=$DB construct2 $B0 $FT "$(spans ${N[@]})" 1 2>&1 | tr '\n' ' ')
echo "  the constructed chain bound (construct over it): equal-N=$([ "$b" = "$o" ] && echo yes || echo NO)"
