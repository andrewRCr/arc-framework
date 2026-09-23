# p9 case D: case B's first correction (disjoint B_a, terminal absorption merge, t.txt resolved), then a SECOND
# disjoint correction (B_b adds z.txt only). The terminal's structural check: where does the constructed absorption
# merge depart from the clean merge-tree, and which window covers those paths?
source "$(dirname "$0")/lib8.sh"; SD=$SD8
newrepo $SD/r/d; put base.txt v0; put t.txt t; put api.txt api v0
git switch -qc wu; put m1.txt m1; put api.txt api v0 m1; S1=$(hd); put m2.txt m2; S2=$(hd); put m3.txt m3; put t.txt t T3; S3=$(hd)
git switch -q main; B0=$(git merge-base main wu); FIRST=1 construct2 $B0 $S3 "$(cuts $B0 $S1 $S2 $S3)" > $SD/.dc; C0=($(cat $SD/.dc))
git switch -q main; put t.txt t MAIN; BA=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' t T3 MAIN > t.txt; git add t.txt; git commit -q --no-edit; put m1.txt m1 FIX1; FT1=$(hd)
construct2 $BA $FT1 "$(spans ${C0[@]})" 1 > $SD/.d1; N1=($(cat $SD/.d1))
git switch -q main; put z.txt z; BB=$(hd); git switch -q wu; git merge -q --no-edit main >/dev/null 2>&1; put m1.txt m1 FIX2; FT2=$(hd)
construct2 $BB $FT2 "$(spans ${N1[@]})" 1 > $SD/.d2; N2=($(cat $SD/.d2)); echo "corr2 (disjoint): J=$J R(chain base)=[$RB]"
AM=$(git rev-parse ${N2[2]}^1); CLEAN=$(git merge-tree --write-tree $(git rev-parse $AM^1) $(git rev-parse $AM^2) | sed -n 1p)
echo "absorption merge departs from clean merge-tree on: [$(git diff --name-only $CLEAN $AM | grep -vx life.md | tr '\n' ' ')]"
TOP=$FT2; ATOP=$BB; P3=$(git rev-parse ${N1[2]}^1^1)
echo "R from terminal recorded pred = [$(rset $P3)]   R from merge-base(recorded terminal, tip) = [$(rset $(git merge-base ${N1[2]} $BB))]"
