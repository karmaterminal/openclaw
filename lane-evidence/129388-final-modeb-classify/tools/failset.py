"""Build a Mode-B failset from downloaded openclaw-local-ci-batch-* artifacts.

Union of each shard's summary.json .failures[] and the logs' `x` lines (file > title), the
unprefixed `x` lines of a cancelled shard's *.in-flight.log, a file-level row for every vitest worker
killed by a signal, plus every `FAILED (error:` sub-shard crash line. Run with `python3 -I failset.py DLDIR OUT`.
Writes OUT.shards.tsv, OUT.tests.tsv, OUT.crashes.tsv, OUT.other.tsv.
"""
import json
import os
import re
import sys

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
XLINE = re.compile(r"^\[(shard(?:-failure)?):([^\]]+)\]\s+×\s+(.*)$")
TESTFILE = re.compile(r"\S+\.(?:test|e2e|spec)[\w.-]*\.(?:ts|tsx|mts|cts|js|mjs)")
CRASH = re.compile(r"^\[shard-failure:([^\]]+)\]\s+FAILED \(error:(.*)\)\s*$")
TAILMS = re.compile(r"\s+\d+(?:\.\d+)?\s?ms$")
WORKERKILL = re.compile(r"Worker exited unexpectedly with signal (\w+) .*running test file (\S+)")
SHARDROOT = re.compile(r"^.*/shard-\d+-[^/]+/")
INFLIGHT = re.compile(r"^\s*×\s+(\S+)\s+(.*)$")

dl, out = sys.argv[1], sys.argv[2]
shards, tests, crashes, other = [], {}, [], []

def add(key, src, shard, sub):
    row = tests.setdefault(key, {"src": set(), "shard": shard, "sub": set()})
    row["src"].add(src)
    if sub:
        row["sub"].add(sub)

for batch in sorted(os.listdir(dl)):
    bdir = os.path.join(dl, batch)
    if not os.path.isdir(bdir):
        continue
    for sdir in sorted(os.listdir(bdir)):
        spath = os.path.join(bdir, sdir)
        if not os.path.isdir(spath):
            continue
        summ = os.path.join(spath, "summary.json")
        shard = sdir
        if os.path.exists(summ):
            with open(summ) as fh:
                s = json.load(fh)
            shard = s.get("shard") or sdir
            t = s.get("tests") or {}
            shards.append([batch, sdir, shard, str(s.get("conclusion")), str(s.get("rc")),
                           str(t.get("passed")), str(t.get("failed")), str(s.get("failure_count")),
                           str(s.get("flakes_greened_count")),
                           ";".join(map(str, s.get("flakes_greened") or []))])
            for f in s.get("failures") or []:
                detail = (f.get("detail") or "").strip()
                if f.get("kind") == "test":
                    m = TESTFILE.search(detail)
                    if m and " > " in detail[m.end():]:
                        proj = detail[: m.start()].strip()
                        title = detail[m.end():].split(" > ", 1)[1].strip()
                        add((shard, m.group(0), title), "summary", shard, proj)
                        continue
                other.append([batch, shard, str(f.get("kind")), str(f.get("gate")), detail])
        else:
            shards.append([batch, sdir, sdir, "NO-SUMMARY", "", "", "", "", "", ""])
        for name in sorted(os.listdir(spath)):
            if not name.endswith(".log"):
                continue
            with open(os.path.join(spath, name), errors="replace") as fh:
                for raw in fh:
                    line = ANSI.sub("", raw.rstrip("\n"))
                    k = WORKERKILL.search(line)
                    if k:
                        # A killed vitest worker fails its file without a per-test line.
                        rel = SHARDROOT.sub("", k.group(2))
                        sub = line[1:line.index("]")] if line.startswith("[") else ""
                        add((shard, rel, f"(file-level: vitest worker killed by {k.group(1)})"),
                            "log", shard, sub.split(":", 1)[-1])
                        continue
                    m = CRASH.match(line)
                    if m:
                        crashes.append([batch, shard, name, m.group(1), m.group(2).strip()])
                        continue
                    m = XLINE.match(line)
                    if not m and name.endswith(".in-flight.log"):
                        # A cancelled shard's in-flight flush prints vitest lines unprefixed.
                        m = INFLIGHT.match(line)
                        if m:
                            rest = m.group(2)
                            fm = TESTFILE.search(rest)
                            if fm and " > " in rest[fm.end():]:
                                title = TAILMS.sub("", rest[fm.end():].split(" > ", 1)[1].strip())
                                add((shard, fm.group(0), title), "in-flight", shard, m.group(1))
                        continue
                    if not m:
                        continue
                    rest = m.group(3)
                    fm = TESTFILE.search(rest)
                    if not fm or " > " not in rest[fm.end():]:
                        continue
                    title = TAILMS.sub("", rest[fm.end():].split(" > ", 1)[1].strip())
                    add((shard, fm.group(0), title), "log", shard, m.group(2).split(":")[0])

def write(path, header, rows):
    with open(path, "w") as fh:
        fh.write("\t".join(header) + "\n")
        for r in rows:
            fh.write("\t".join(r) + "\n")

write(out + ".shards.tsv", ["batch", "dir", "shard", "conclusion", "rc", "passed", "failed",
                             "failure_count", "flakes_greened_count", "flakes_greened"], shards)
write(out + ".tests.tsv", ["shard", "file", "title", "sources", "subshards"],
      [[k[0], k[1], k[2], "+".join(sorted(v["src"])), ";".join(sorted(v["sub"]))]
       for k, v in sorted(tests.items())])
seen = set()
write(out + ".crashes.tsv", ["batch", "shard", "log", "subshard", "error"],
      [r for r in crashes if not (tuple(r[1:2] + r[3:]) in seen or seen.add(tuple(r[1:2] + r[3:])))])
write(out + ".other.tsv", ["batch", "shard", "kind", "gate", "detail"], other)
print(f"shards={len(shards)} tests={len(tests)} crashes={len(crashes)} other={len(other)}")
