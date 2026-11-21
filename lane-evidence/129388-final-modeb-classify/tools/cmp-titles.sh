#!/usr/bin/env bash
# cmp-titles.sh FILE RUN [MODE]: compare the failing titles of FILE in the base and cand control logs
# of run RUN (mode prefix MODE, default node26121) with CI's failing titles for FILE in the live
# failset. Prints SAME / DIFF for base-vs-cand and base-vs-CI.
set -uo pipefail
file=$1 run=$2 mode=${3:-node26121}
here=$(cd "$(dirname "$0")/.." && pwd)
slug=$(printf '%s' "$file" | sed -E 's#[/.]+#-#g; s#-(test|ts)-?#-#g; s#-+$##')
titles() { sed -E 's/\x1B\[[0-9;?]*[[:alpha:]]//g' "$1" | grep -aE '^ × ' | sed -E 's/ [0-9]+ms$//; s/.*\.(test|e2e)\.[a-z]+ > //' | sort -u; }
b=$(titles "$here/controls/base-$mode-$slug-run$run.log"); c=$(titles "$here/controls/cand-$mode-$slug-run$run.log")
ci=$(awk -F'\t' -v f="$file" '$2==f {print $3}' /home/figs/classify-129388/fs-live.tests.tsv | sort -u)
[[ "$b" == "$c" ]] && bc=SAME || bc=DIFF
[[ "$b" == "$ci" ]] && bci=SAME || bci=DIFF
echo "$file run$run: base=$(grep -c . <<<"$b") cand=$(grep -c . <<<"$c") ci=$(grep -c . <<<"$ci") base-vs-cand=$bc base-vs-ci=$bci"
[[ $bci == DIFF ]] && diff <(echo "$b") <(echo "$ci") | head -8
true
