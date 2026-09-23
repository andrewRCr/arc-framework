# p9 case C2: continue case C's repo. During the interruption main moves B2 on m1's path q.txt... (overlap, so D2's
# guard refuses the candidates and the projection owes construct); the top merges B2. Construct then runs over the
# mixed records with chain base B1.
source "$(dirname "$0")/lib8.sh"; SD=$SD8; cd $SD/r/c
C0=($(cat $SD/.c)); N=($(cat $SD/.o)); B1=$(git rev-parse main); B0=$(git merge-base ${C0[0]} $B1)
git switch -q main; put api.txt api v2; B2=$(hd); git switch -q wu
git merge -q --no-edit main >/dev/null 2>&1; printf '%s\n' api v2 > api.txt; git add api.txt; git commit -q --no-edit; FT2=$(hd)
echo "D2 guard over the candidates vs B2: $(guard $B1 $B2 ${N[@]})"
construct2 $B2 $FT2 "${N[0]} ${C0[1]} ${C0[2]}|$B1 ${C0[0]} ${C0[1]}" 1 > $SD/.m2 2>&1; echo "construct, mixed records, chain base B1: J=$J R=[$RB] -> [$(tr '\n' ' ' < $SD/.m2)]"
TOP=$FT2; ATOP=$B2; echo "R from B1 (chain base now) = [$(rset $B1)]   R from B0 (m2/m3 recorded bases' base) = [$(rset $B0)]  R from C0[1] (m3 recorded pred) = [$(rset ${C0[1]})]"
