#!/usr/bin/env python3
"""apply-evidence.py <pull.json | body.md> <evidence-section.md> <out-body.md>
Insert the authored "## Evidence" section into openclaw/openclaw#129388's body.
- If the proofs tail block (<!-- proofs-tail:start --> ... <!-- proofs-tail:end -->) exists, insert the
  section immediately before its start marker; every byte before and after is kept.
- Otherwise append the section at the end, so the original body is an exact prefix.
Refuses (exit 1) if the body already has a heading starting with "Evidence" (the evaluator reads the last one)."""
import json, re, sys

START, END = "<!-- proofs-tail:start -->", "<!-- proofs-tail:end -->"
src, evidence_path, out_path = sys.argv[1:4]
raw = open(src, encoding="utf-8", newline="").read()
body = (json.loads(raw)["body"] or "") if src.endswith(".json") else raw
section = open(evidence_path, encoding="utf-8", newline="").read().strip("\n") + "\n"
if not section.startswith("## Evidence\n"):
    sys.exit("refuse: the section must start with '## Evidence'")
if re.search(r"^#{2,6}\s+Evidence\b", body, re.I | re.M):
    sys.exit("refuse: the body already has an Evidence heading")

if START in body:
    if body.count(START) != 1 or END not in body[body.index(START):]:
        sys.exit("refuse: proofs tail markers are not exactly one start followed by an end")
    i = body.index(START)
    before, after = body[:i], body[i:]
    sep = "" if before.endswith("\n\n") else ("\n" if before.endswith("\n") else "\n\n")
    new = before + sep + section + "\n" + after
    assert new.startswith(before) and new.endswith(after), "kept bytes changed"
    where = f"before the proofs tail start marker at char {i}"
else:
    sep = "" if body.endswith("\n\n") else ("\n" if body.endswith("\n") else "\n\n")
    new = body + sep + section
    assert new.startswith(body), "prefix changed"
    where = "appended; the original body is an exact prefix"
open(out_path, "w", encoding="utf-8", newline="").write(new)
print(f"wrote {out_path}: {len(new.encode())} bytes ({where})")
