"""Rates table from runs/summary.tsv (or controls.tsv): ref x file pass/fail, plus Dirty stats.

Counts only RUN >= 1 (run 0 is the warm-up/dep link). Usage: python3 -I rates.py runs/summary.tsv
Prints a Markdown table: file, ref, runs, PASS, RED, other (RUN-BROKEN, timeouts...), red rate,
red runs, median/max seconds, max Dirty during any run (MiB), runs whose max Dirty reached 2 GiB.
"""
import csv
import statistics
import sys
from collections import defaultdict

rows = list(csv.DictReader(open(sys.argv[1]), delimiter="\t"))
cells = defaultdict(list)
for r in rows:
    if r["run"] == "0":
        continue
    cells[(r["file"], r["ref"])].append(r)

order = {"cand": 0, "prior": 1, "base": 2}
print("| file | ref | runs | PASS | RED | other | red rate | red runs | median s | max s | max Dirty MiB | runs with Dirty >= 2 GiB |")
print("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |")
for (f, ref), rs in sorted(cells.items(), key=lambda kv: (kv[0][0], order.get(kv[0][1].split("+")[0], 9), kv[0][1])):
    verdicts = [r["verdict"].split(" ")[1] if r["verdict"].startswith("VERDICT ") else "NO-VERDICT" for r in rs]
    npass = sum(v == "PASS" for v in verdicts)
    nred = sum(v == "RED" for v in verdicts)
    other = len(rs) - npass - nred
    red_runs = ",".join(r["run"] for r, v in zip(rs, verdicts) if v == "RED") or "-"
    secs = [int(r["secs"].rstrip("s")) for r in rs]
    dmax = [int(r["dirty_max_kb"] or 0) for r in rs]
    over = sum(d >= 2 * 1024 * 1024 for d in dmax)
    print(f"| `{f}` | {ref} | {len(rs)} | {npass} | {nred} | {other} | {nred}/{len(rs)} | {red_runs} | "
          f"{statistics.median(secs):.0f} | {max(secs)} | {max(dmax) / 1024:.0f} | {over} |")
