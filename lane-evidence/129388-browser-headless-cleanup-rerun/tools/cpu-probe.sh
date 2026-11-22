#!/usr/bin/env bash
# cpu-probe.sh REF RUN MODEL: mechanism counterfactual, diagnostic only. Writes an untracked scratch
# copy of chrome.headless-cleanup.test.ts beside it in the REF control worktree, with one added
# vi.mock that reports every os.cpus() entry with model MODEL (no other change), runs it once
# through ctl.sh (mode tag cpu-<MODEL>), then deletes the copy. The only os.cpus() caller in
# extensions/browser is chrome.playwright-cache.ts (macArm64), so this varies exactly that input.
# No tracked file is edited; ctl.sh reports the worktree's tracked dirt after the run.
set -uo pipefail
ref=$1 run=$2 model=$3
here=$(cd "$(dirname "$0")" && pwd)
R=/home/figs/classify-129388-bhc
case "$ref" in
  cand) wt=$R/cand-a329243b ;; prior) wt=$R/prior-16541aa5 ;; up) wt=$R/up-5a3e6b1c ;;
  *) echo "ref must be cand|prior|up" >&2; exit 2 ;;
esac
dir=extensions/browser/src/browser
probe=$dir/chrome.headless-cleanup.cpu-probe.probe.test.ts
[[ ! -e "$wt/$probe" ]] || { echo "probe already present: $wt/$probe" >&2; exit 2; }
trap 'rm -f "$wt/$probe"' EXIT
{
  sed -n '1,8p' "$wt/$dir/chrome.headless-cleanup.test.ts"
  cat <<MOCK
// cpu-probe: report os.cpus() models as "$model" (diagnostic copy, never committed).
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const cpus = () => actual.cpus().map((cpu) => ({ ...cpu, model: "$model" }));
  return { ...actual, cpus, default: { ...actual, cpus } };
});
MOCK
  sed -n '9,$p' "$wt/$dir/chrome.headless-cleanup.test.ts"
} >"$wt/$probe"
sha256sum "$wt/$probe" | sed "s#$wt/##"
CTL_TAG="cpu-${model// /_}" "$here/ctl.sh" "$ref" "$probe" "$run"
