# p9 case B: constructed chain; correction 1 under disjoint movement B_a (terminal takes an absorption merge, t.txt
# resolved); correction 2 under overlapping B_b (re-anchor). Compare the recorded-predecessor window with D2's
# merge-base(member, tip) operand for the terminal, and the terminal's raw proof paths.
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/b; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put api.txt api v0 m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.c; C0=($(cat $SD/.c))
# correction 1: disjoint base (terminal's path only), conflicting merge resolved, fix on m1
git switch -q main; put t.txt t MAIN; BA=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; git add t.txt; git commit -q --no-edit; put m1.txt m1 FIX1; FT1=$(hd)
construct2 $BA $FT1 "$(spans ${C0[@]})" 1 > $SD/.o; N1=($(cat $SD/.o)); echo "corr1: J=$J R=[$RB] members=${#N1[@]} terminal-parents=$(git rev-list --parents -n1 ${N1[2]}^1 | wc -w)"
echo "corr1 terminal merge-base with B_a == B_a ? $([ "$(git merge-base ${N1[2]} $BA)" = "$BA" ] && echo yes || echo no)"
# correction 2: overlapping base on m1's path api.txt
git switch -q main; put api.txt api v1; BB=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' api v1 m1 > api.txt; git add api.txt; git commit -q --no-edit; put m1.txt m1 FIX2; FT2=$(hd)
construct2 $BB $FT2 "$(spans ${N1[@]})" 1 > $SD/.o2; N2=($(cat $SD/.o2)); echo "corr2: J=$J R(chain base)=[$RB] out=[$(cat $SD/.o2 | tr '\n' ' ')]"
TOP=$FT2; ATOP=$BB
P3=$(git rev-parse ${N1[2]}^1^1)   # terminal's recorded predecessor (spans skips its absorption merge)
echo "terminal recorded predecessor == N1 m2 ? $([ "$P3" = "${N1[1]}" ] && echo yes || echo no)"
echo "window = chain base B0                      : [$(rset $B0)]"
echo "window = terminal recorded pred (N1 m2)     : [$(rset $P3)]"
MB=$(git merge-base ${N1[2]} $BB); echo "D2 operand merge-base(terminal, tip) == B_a ? $([ "$MB" = "$BA" ] && echo yes || echo no)"
echo "window = merge-base(recorded terminal, tip) : [$(rset $MB)]"
echo "window = re-anchored base B_b               : [$(rset $BB)]"
echo "terminal raw proof paths old->new: [$(proofpaths $(norm $P3) $(norm ${N2[1]}) $(norm ${N1[2]}) $(norm ${N2[2]}))]"
echo "m2 raw proof paths old->new      : [$(proofpaths ${N1[0]} ${N2[0]} ${N1[1]} ${N2[1]})]"
echo "terminal rebuilt t.txt == top's own ? $([ "$(git rev-parse ${N2[2]}:t.txt)" = "$(git rev-parse $FT2:t.txt)" ] && echo yes || echo no)"
