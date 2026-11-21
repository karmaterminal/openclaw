"""Quote each failing test's first error block from Mode-B shard logs.

`python3 -I firsterr.py DLDIR OUT.md [N_LINES]`: for every ` FAIL  <project> <file> > <title>`
block in each gate-test-shard-*.log (ANSI and [shard:...] prefixes stripped), keep the first
block per (shard, file, title) and the next N_LINES lines (default 14).
"""
import os
import re
import sys

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
PREFIX = re.compile(r"^\[[^\]]+\]\s?")
FAIL = re.compile(r"^\s*FAIL\s+(.*?\S+\.(?:test|e2e|spec)[\w.-]*\.(?:ts|tsx|mts|js|mjs)(?:\s+>\s+.*)?)\s*$")
dl, out = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 14
seen = {}
for root, _dirs, files in os.walk(dl):
    for name in sorted(files):
        if not (name.startswith("gate-test-shard-") and name.endswith(".log")):
            continue
        shard = name[len("gate-test-shard-"):-4]
        with open(os.path.join(root, name), errors="replace") as fh:
            lines = [PREFIX.sub("", ANSI.sub("", l.rstrip("\n"))) for l in fh]
        for i, line in enumerate(lines):
            m = FAIL.match(line)
            if not m:
                continue
            key = (shard, m.group(1))
            if key in seen:
                continue
            block = [l for l in lines[i + 1 : i + 1 + n * 2] if l.strip()][:n]
            seen[key] = block
with open(out, "w") as fh:
    for (shard, head), block in sorted(seen.items()):
        fh.write(f"### {shard} :: {head}\n```\n" + "\n".join(block) + "\n```\n\n")
print(f"blocks={len(seen)}")
