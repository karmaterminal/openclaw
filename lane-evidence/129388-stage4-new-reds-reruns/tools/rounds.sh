#!/usr/bin/env bash
# rounds.sh FILE FROM TO [EXTRA_ENV...]: interleaved control rounds FROM..TO of FILE via ctl.sh.
# Each round runs all three refs once; the starting ref rotates by round (n%3), so no ref always
# runs first or last.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
file=$1 from=$2 to=$3; shift 3
refs=(cand prior up)
for n in $(seq "$from" "$to"); do
  for k in 0 1 2; do
    "$here/ctl.sh" "${refs[$(( (n + k) % 3 ))]}" "$file" "$n" "$@"
  done
done
