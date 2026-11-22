#!/usr/bin/env python3
"""cmp-first-errors-vs-16541aa5.py <a329243b aggregate dir> <first-error-cmp-16541aa5.tsv> <a329243b-classes.tsv> <out.tsv>
Reuses first_errors()/norm() from lane 129388-new-reds-reruns' tools/cmp-first-errors.py (af04bdf6) on the
a329243b Mode-B aggregate, then compares each of a329243b's 72 deterministic failing tests with the first error
recorded for 16541aa5 (that file's cand_first_error column)."""
import csv, importlib.util, os, sys
spec = importlib.util.spec_from_file_location("cfe", os.path.join(os.path.dirname(__file__), "cmp-first-errors-af04bdf6.py"))
src = open(spec.origin).read().split("\nprior, cand = ")[0]
ns = {}; exec(compile(src, spec.origin, "exec"), ns)
agg, prior_tsv, classes_tsv, out = sys.argv[1:5]
cur = ns["first_errors"](agg); norm = ns["norm"]
prior = {(r["file"], r["title"]): r["cand_first_error"] for r in csv.DictReader(open(prior_tsv), delimiter="\t")}
rows = list(csv.DictReader(open(classes_tsv), delimiter="\t"))
counts = {}
with open(out, "w") as fh:
    fh.write("file\ttitle\tclass\tcompare\ta329243b_first_error\tprior_16541aa5_first_error\n")
    for r in rows:
        key = (r["file"], "(file-level)" if r["title"] == "(file-level suite failure)" else r["title"])
        e = cur.get(key); p = prior.get(key)
        if e is None: v = "no FAIL block at a329243b"
        elif p is None: v = "not in 16541aa5 table"
        else: v = "same" if norm(e[:300]) == norm(p) else "DIFFERENT"  # the 16541aa5 table stores errors cut at 300 chars
        counts[v] = counts.get(v, 0) + 1
        fh.write(f"{r['file']}\t{r['title']}\t{r['class']}\t{v}\t{(e or '')[:300]}\t{(p or '')[:300]}\n")
print(counts)
