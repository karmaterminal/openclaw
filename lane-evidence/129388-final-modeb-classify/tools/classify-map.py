"""Join a failset's tests with classify-rules.tsv (one row per failing file) into classify-map.tsv.

`python3 -I classify-map.py FAILSET.tests.tsv RULES.tsv OUT.tsv`: one output row per failing test
(shard, file, title, sources, class, evidence paths). A failing file with no rule is written as
UNCLASSIFIED and the script exits 1, so a new red cannot slip through unnoticed.
"""
import csv
import sys

tests_path, rules_path, out_path = sys.argv[1:4]
with open(rules_path, newline="") as fh:
    rules = {r["file"]: r for r in csv.DictReader(fh, delimiter="\t")}
missing = set()
with open(tests_path, newline="") as fh, open(out_path, "w", newline="") as out:
    w = csv.writer(out, delimiter="\t", lineterminator="\n")
    w.writerow(["shard", "file", "title", "sources", "class", "evidence_paths"])
    n = 0
    for r in csv.DictReader(fh, delimiter="\t"):
        rule = rules.get(r["file"])
        if rule is None:
            missing.add(r["file"])
        w.writerow([r["shard"], r["file"], r["title"], r["sources"],
                    rule["class"] if rule else "UNCLASSIFIED",
                    rule["evidence_paths"] if rule else ""])
        n += 1
print(f"rows={n} unclassified_files={len(missing)}")
for f in sorted(missing):
    print(f"UNCLASSIFIED\t{f}")
sys.exit(1 if missing else 0)
