#!/usr/bin/env python3
"""derive-classes.py <aggregate-summary.json> <ref-classify-map-93a1e356.tsv> <out.tsv>
Join a329243b's aggregate failed_details (kind=test) to the classifications on record:
 1. the 93a1e356 reference map, matched on (file, title), then on a file-level row (title empty or '(file)');
 2. the 3 files new at 16541aa5 (lane 129388-new-reds-reruns);
 3. the 3 files classified for stage 4 / a329243b (lanes 129388-stage4-new-reds-reruns, 129388-browser-headless-cleanup-rerun).
Prints counts per class (tests, files) and every unmatched row."""
import csv, json, re, sys, collections
agg, refmap, out = sys.argv[1:4]
rows = [d for d in json.load(open(agg))["failed_details"] if d.get("kind") == "test"]
ref = {}; reffile = {}
for r in csv.DictReader(open(refmap), delimiter="\t"):
    ref[(r["file"], r["title"])] = r["class"]
    reffile.setdefault(r["file"], set()).add(r["class"])
LATER = {
 "src/gateway/server-methods/models-auth-removal.integration.test.ts": ("upstream-carried", "new-reds-reruns (16541aa5)"),
 "test/scripts/team-shape-fixture.test.ts": ("environment (/proc/meminfo Dirty guard)", "new-reds-reruns (16541aa5)"),
 "src/tui/tui-console-pty.e2e.test.ts": ("environment (cold start vs 20 s budget)", "new-reds-reruns (16541aa5)"),
 "src/config/zod-schema.core.test.ts": ("upstream-carried (stale upstream test, fixed upstream #203416)", "stage4-new-reds-reruns"),
 "test/scripts/installed-terminal-observer.test.ts": ("upstream-carried (stale upstream pin, fixed upstream #203415)", "stage4-new-reds-reruns"),
 "extensions/browser/src/browser/chrome.headless-cleanup.test.ts": ("upstream-carried (non-Apple arm64 host)", "browser-headless-cleanup-rerun"),
}
w = csv.writer(open(out, "w", newline=""), delimiter="\t", lineterminator="\n")
w.writerow(["shard", "file", "title", "class", "how"])
per = collections.defaultdict(lambda: [0, set()]); unmatched = []
for d in rows:
    m = re.match(r"^\S+(?: \([^)]*\))?\s{2}(\S+) > (.*)$", d["detail"])
    fl = re.match(r"^\S+(?: \([^)]*\))?\s{2}(\S+) \[ (\S+) \]$", d["detail"])
    if m: f, t = m.group(1), m.group(2)
    elif fl and fl.group(1) == fl.group(2): f, t = fl.group(1), "(file-level suite failure)"
    else: unmatched.append(("unparsed", d["detail"])); continue
    if (f, t) in ref: c, how = ref[(f, t)], "ref (file,title)"
    elif f in LATER: c, how = LATER[f]
    elif f in reffile and len(reffile[f]) == 1: c, how = next(iter(reffile[f])), "ref (file only, single class)"
    else: c, how = "UNMATCHED", "-"; unmatched.append((f, t))
    w.writerow([d["shard"], f, t, c, how])
    k = "upstream" if c.startswith("upstream") else ("environment" if c.startswith("environment") else c)
    per[k][0] += 1; per[k][1].add(f)
print(f"tests={len(rows)} files={len(set(r[1] for r in csv.reader(open(out), delimiter=chr(9)))) - 1}")
for k, (n, fs) in sorted(per.items()): print(f"{k}: {n} tests in {len(fs)} files")
for u in unmatched: print("UNMATCHED", u)
