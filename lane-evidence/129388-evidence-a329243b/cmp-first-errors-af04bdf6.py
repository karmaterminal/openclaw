"""Compare each failing test's first error line between two Mode-B downloads.

`python3 -I cmp-first-errors.py PRIOR_DL CAND_DL OUT.tsv`: for every ` FAIL  <project> <file> > <title>`
block in each gate-test-shard-*.log (ANSI and [shard:...] prefixes stripped), takes the first
non-empty line after it, normalizes volatile parts (numbers, hex ids, temp and checkout paths) and
writes one row per (file, title) seen in CAND_DL: whether the normalized first error matches PRIOR_DL.
"""
import os
import re
import sys

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
PREFIX = re.compile(r"^\[[^\]]+\]\s?")
FAIL = re.compile(r"^\s*FAIL\s+\S+\s+(\S+\.(?:test|e2e|spec)[\w.-]*\.(?:ts|tsx|mts|js|mjs))(?:\s+>\s+(.*))?\s*$")


def norm(text):
    text = re.sub(r"/(?:home|tmp)/\S+", "<path>", text)
    text = re.sub(r"\b[0-9a-f]{8,}\b", "<hex>", text)
    text = re.sub(r"-[A-Za-z0-9]{6}(?=/|\s|$)", "-<id>", text)  # mktemp-style -XXXXXX suffixes
    return re.sub(r"\d+", "<n>", text).strip()


def first_errors(dl):
    seen = {}
    for root, _dirs, files in os.walk(dl):
        for name in sorted(files):
            if not (name.startswith("gate-test-shard-") and name.endswith(".log")):
                continue
            with open(os.path.join(root, name), errors="replace") as fh:
                lines = [PREFIX.sub("", ANSI.sub("", l.rstrip("\n"))) for l in fh]
            for i, line in enumerate(lines):
                m = FAIL.match(line)
                if not m:
                    continue
                key = (m.group(1), (m.group(2) or "(file-level)").strip())
                if key in seen:
                    continue
                # Vitest stacks the FAIL headers of tests that share one error above that error.
                nxt = next((l for l in lines[i + 1 : i + 40] if l.strip() and not FAIL.match(l)), "")
                seen[key] = nxt.strip()
    return seen


prior, cand = first_errors(sys.argv[1]), first_errors(sys.argv[2])
with open(sys.argv[3], "w") as fh:
    fh.write("file\ttitle\tin_prior_run\tsame_first_error\tcand_first_error\tprior_first_error\n")
    for (f, title), err in sorted(cand.items()):
        p = prior.get((f, title))
        same = "n/a" if p is None else ("yes" if norm(p) == norm(err) else "NO")
        fh.write(f"{f}\t{title}\t{'yes' if p is not None else 'no'}\t{same}\t{err[:300]}\t{(p or '')[:300]}\n")
print(f"cand={len(cand)} prior={len(prior)}")
