source "$(dirname "$0")/lib8.sh"; cd $SD8/r/a
FT=$(git rev-parse wu); TOP=$FT; B1=$(git rev-parse main); ATOP=$B1
S2=$(git rev-list --first-parent wu | while read c; do [ "$(git log -1 --format=%s $c)" = "edit m2.txt" ] && { echo $c; break; }; done)
MB=$(git merge-base $S2 $B1); echo "D2 operand for m2 = merge-base(S2, tip): is it the in-range base B_x (main~1)? $([ "$MB" = "$(git rev-parse main~2)" ] || [ "$MB" = "$(git rev-parse main~1)" ] && echo yes || echo no) ($(git log -1 --format=%s $MB))"
echo "window = merge-base(m2, tip): [$(rset $MB)]"
