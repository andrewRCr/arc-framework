# p12 case S: p11-h's shapes on the bound route. BOUND=1 checks every member but the placed one against its range's
# three-way reapplication on its rebuilt predecessor, as the contribution proof does (members with no absorption and no
# break only): the fold that removes the terminal's file, or its line, changes the terminal beyond that, so it stops.
BOUND=1 exec bash "$(dirname "$0")/p11-h.sh"
