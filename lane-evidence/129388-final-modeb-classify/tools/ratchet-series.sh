#!/usr/bin/env bash
# ratchet-series.sh: the static-gates ratchet controls, one at a time (ratchets.sh), so their wall
# times compare on one host: session-identity and test-lines at both refs against CI's comparison
# base 7ce2d10e and the candidate against 1129d4c0, then the two long semantic ratchets
# (database-dialect, database-worker) at both refs against 7ce2d10e.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
ci=7ce2d10eced5f379e31a0b01a96fbcbf9741ccbe up=1129d4c0716c7dcc6fba86753ec214584ec8ebd1
"$here/ratchets.sh" base "$ci" scripts/check-session-identity-ratchet.mts
"$here/ratchets.sh" cand "$ci" scripts/check-session-identity-ratchet.mts
"$here/ratchets.sh" cand "$up" scripts/check-session-identity-ratchet.mts
"$here/ratchets.sh" base "$ci" scripts/check-test-lines-ratchet.mts
"$here/ratchets.sh" cand "$ci" scripts/check-test-lines-ratchet.mts
"$here/ratchets.sh" cand "$up" scripts/check-test-lines-ratchet.mts
"$here/ratchets.sh" base "$ci" scripts/check-database-dialect-ratchet.mts
"$here/ratchets.sh" cand "$ci" scripts/check-database-dialect-ratchet.mts
"$here/ratchets.sh" base "$ci" scripts/check-database-worker-ratchet.mts
"$here/ratchets.sh" cand "$ci" scripts/check-database-worker-ratchet.mts
echo SERIES-DONE
