#!/usr/bin/env python3
"""replace-evidence.py <pull.json | body.md> <evidence-section.md> <out-body.md>
Replace the authored "## Evidence" section of openclaw/openclaw#129388's body with a new one.
- The body must have exactly one heading starting with "Evidence" (any level 2-6; upstream's evaluator
  reads the last one), and it must be the level-2 heading "## Evidence".
- The section runs from that heading to the next level-1/2 heading outside a code fence, the proofs-tail
  start marker (<!-- proofs-tail:start -->), or the end of the body, whichever comes first.
- Every byte before the heading and from the section's end onward is kept; the script asserts it.
Refuses (exit 1) otherwise."""
import json, re, sys

START = "<!-- proofs-tail:start -->"
src, evidence_path, out_path = sys.argv[1:4]
raw = open(src, encoding="utf-8", newline="").read()
body = (json.loads(raw)["body"] or "") if src.endswith(".json") else raw
section = open(evidence_path, encoding="utf-8", newline="").read().strip("\n") + "\n"
if not section.startswith("## Evidence\n"):
    sys.exit("refuse: the new section must start with '## Evidence'")
if "\r" in body:
    sys.exit("refuse: the body has CR characters; rebuild from a fresh fetch")

lines = body.split("\n")
offsets, pos = [], 0
for line in lines:
    offsets.append(pos)
    pos += len(line) + 1
fence, headings = "", []
for i, line in enumerate(lines):
    m = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
    if m and (not fence or (m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence))):
        fence = "" if fence else m.group(1)
        continue
    if not fence:
        h = re.match(r"^(#{1,6})\s+\S", line)
        if h:
            headings.append((i, len(h.group(1)), line))
evidence = [(i, lvl, t) for i, lvl, t in headings if re.match(r"^#{2,6}\s+Evidence\b", t, re.I)]
if len(evidence) != 1 or evidence[0][2] != "## Evidence":
    sys.exit(f"refuse: expected exactly one '## Evidence' heading, found {[t for _, _, t in evidence]}")
first = evidence[0][0]
start = offsets[first]
end = len(body)
for i, lvl, _ in headings:
    if i > first and lvl <= 2:
        end = offsets[i]
        break
tail = body.find(START, start)
if tail != -1 and tail < end:
    end = tail
before, after = body[:start], body[end:]
new = before + section + ("\n" + after if after else "")
assert new.startswith(before) and new.endswith(after), "kept bytes changed"
open(out_path, "w", encoding="utf-8", newline="").write(new)
print(f"wrote {out_path}: {len(new.encode())} bytes; kept {len(before.encode())} prefix bytes and "
      f"{len(after.encode())} suffix bytes; replaced {len(body[start:end].encode())} section bytes")
