SD=$(cd "$(dirname "$0")" && pwd)
source "$SD/../lib8.sh"; SP2=$SD; ERR=$SD/.err
pres() { local tip=$1; shift; local prev=$tip m o=""; for m in "$@"; do
  o="$o [$(git diff --name-only "$(git merge-base "$prev" "$m")" "$m" | grep -vx "$LIFE" | tr '\n' ' ' | sed 's/ $//')]"; prev=$m; done; echo "$o"; }
newrepo $SD/r/e1; put base.txt v0; put shared.txt a b c
git switch -qc wu; put m1.txt m1; put life.md L1; S1=$(hd); put m1b.txt x; S1=$(hd)
git switch -q main; put base.txt v1; BP=$(hd)
git switch -q wu; git merge -q --no-edit main; put m2.txt m2; put life.md L2; S2=$(hd); put m3.txt m3; S3=$(hd)
for fj in "" 1; do FORCEJ=$fj; construct2 $BP $S3 "$(cuts $BP $S1 $S2 $S3)" > $SD/.o; R=$(cat $SD/.o); TIPR=$BP
  echo "S1 3-member first cut FORCEJ=${fj:-none}: $(report2 x $BP $S3 $R | cut -c48-)"; echo "   presentation:$(pres $BP $R)"; done
