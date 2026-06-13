#!/usr/bin/env bash
cd "$HOME/source/oc-wo-999-wt" || exit 1
timeout 444m copilot -p "$(cat .copilot-launch-prompt.txt)" --allow-all-tools --allow-all-paths --allow-all-urls --add-dir "$HOME/source/oc-wo-999-wt" 2>&1 | tee tmp-copilot-console.log
echo "COPILOT_LANE_EXIT=$?" >> tmp-copilot-console.log
