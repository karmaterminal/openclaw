#!/usr/bin/env bash
# prefix-rounds.sh FROM TO REF...: interleaved replays of CI's gateway-methods order cut at
# sessions.dispatch.device (lists/prefix13.include.json: the 12 files that precede it in CI's sub-shard
# order, then the device file), via ctlcfg.sh with the replay-created Vitest cache reset first and the
# /proc sampler attached (samples/<ref>-prefix13-run<N>.tsv). The starting ref rotates by round. Each
# run's executed file order is checked against lists/prefix13.files; a mismatch is printed.
set -uo pipefail
R=/home/figs/classify-129388-s4nr
from=$1 to=$2; shift 2
refs=("$@")
k=${#refs[@]}
for n in $(seq "$from" "$to"); do
  for i in $(seq 0 $((k - 1))); do
    ref=${refs[$(( (n + i) % k ))]}
    CTL_DROP_CACHE=89d6ddc8388601a34066afe135ffbcf7c0dff47a \
      "$R/tools/ctlcfg.sh" "$ref" test/vitest/vitest.gateway-methods.config.ts "$R/lists/prefix13.include.json" "$n" &
    run_pid=$!
    python3 -I "$R/tools/proc-sampler.py" "$run_pid" "$R/samples/$ref-prefix13-run$n.tsv" 0.1
    wait "$run_pid"
    log=$(ls -t "$R"/controls/"$ref"-cfg-node26121-gateway-methods-prefix13-run"$n".log | head -1)
    order=$(sed -E 's/\x1B\[[0-9;?]*[[:alpha:]]//g' "$log" | grep -aoE "(✓|×) \|gateway-methods\| [^ ]+\.test\.ts" | awk '{print $3}' | awk '!s[$0]++')
    if [[ "$order" != "$(cat "$R/lists/prefix13.files")" ]]; then echo "ORDER-MISMATCH $ref run$n"; fi
    holder=$(sed -E 's/\x1B\[[0-9;?]*[[:alpha:]]//g' "$log" | grep -aoE "maintenance process [0-9]+" | head -1 | awk '{print $3}')
    if [[ -n "$holder" ]]; then
      echo "HOLDER $ref run$n ns-pid=$holder: $(awk -F'\t' -v h="$holder" '$3 ~ ","h"$" {print $1" "$7}' "$R/samples/$ref-prefix13-run$n.tsv" | cut -c1-220)"
    fi
  done
done
