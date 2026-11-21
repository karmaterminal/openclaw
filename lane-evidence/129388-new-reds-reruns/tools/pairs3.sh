#!/usr/bin/env bash
# pairs3.sh FIRST LAST REFS FILE...: interleaved control runs (ctl3.sh), serial, one at a time.
# For each iteration N in FIRST..LAST, for each FILE, for each REF in REFS (comma list, in order,
# e.g. cand,prior,base = A B C): ctl3.sh REF FILE N. Iteration 0 is the per-ref warm-up/dep link.
# Holds runs/driver.lock so two drivers never overlap; stops at the disk line (ctl3 exit 3).
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
first=$1 last=$2 refs=$3; shift 3
exec 9>"$here/../runs/driver.lock"
flock -n 9 || { echo "another pairs3 driver holds the lock" >&2; exit 4; }
IFS=, read -r -a reflist <<<"$refs"
echo "# pairs3 start=$(date -u +%FT%TZ) iterations=$first..$last refs=$refs files=$*"
for n in $(seq "$first" "$last"); do
  for f in "$@"; do
    for ref in "${reflist[@]}"; do
      "$here/ctl3.sh" "$ref" "$f" "$n" 9>&-  # the lock stays with this driver, never a test process
      rc=$?
      if ((rc == 3)); then echo "# DISK-STOP at $ref $f run$n $(date -u +%FT%TZ)"; exit 3; fi
    done
  done
done
echo "# pairs3 done=$(date -u +%FT%TZ)"
