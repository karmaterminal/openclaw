#!/usr/bin/env python3
"""proc-sampler.py ROOT_PID OUT_TSV [INTERVAL_S]: record every descendant process of ROOT_PID.

Every INTERVAL_S (default 0.2 s) it walks /proc, and for each descendant (pid, starttime) not seen
before writes one row: first-seen UTC time, host pid, namespace pids (NSpid), ppid, comm, cwd and
cmdline (NUL -> space, truncated to 600 chars). On exit of ROOT_PID it writes the last-seen time of
every recorded process. Read-only: it never signals or touches the processes.
Used to name the sqlite-maintenance holder pid that the device red reports (pid-namespace pid).
"""
import os
import sys
import time
from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]


def read(path, mode="r"):
    try:
        with open(path, mode) as handle:
            return handle.read()
    except OSError:
        return None


def stat_fields(pid):
    raw = read(f"/proc/{pid}/stat")
    if raw is None:
        return None
    rest = raw[raw.rfind(")") + 2:].split()
    return {"ppid": int(rest[1]), "start": rest[19], "comm": raw[raw.find("(") + 1:raw.rfind(")")]}


def main():
    root, out = int(sys.argv[1]), sys.argv[2]
    interval = float(sys.argv[3]) if len(sys.argv) > 3 else 0.2
    seen = {}
    with open(out, "w", buffering=1) as sink:
        sink.write("first_seen\thost_pid\tnspid\tppid\tcomm\tcwd\tcmdline\n")
        while os.path.exists(f"/proc/{root}"):
            procs = {}
            for name in os.listdir("/proc"):
                if name.isdigit():
                    fields = stat_fields(int(name))
                    if fields:
                        procs[int(name)] = fields
            family, frontier = {root}, [root]
            children = {}
            for pid, fields in procs.items():
                children.setdefault(fields["ppid"], []).append(pid)
            while frontier:
                pid = frontier.pop()
                for child in children.get(pid, []):
                    if child not in family:
                        family.add(child)
                        frontier.append(child)
            stamp = now()
            for pid in family:
                if pid not in procs:
                    continue
                key = (pid, procs[pid]["start"])
                if key in seen:
                    seen[key] = stamp
                    continue
                seen[key] = stamp
                status = read(f"/proc/{pid}/status") or ""
                nspid = next((line.split(":", 1)[1].strip().replace("\t", ",") for line in status.splitlines() if line.startswith("NSpid:")), "")
                cmd = (read(f"/proc/{pid}/cmdline", "rb") or b"").replace(b"\0", b" ").decode("utf-8", "replace").strip()[:600]
                try:
                    cwd = os.readlink(f"/proc/{pid}/cwd")
                except OSError:
                    cwd = ""
                sink.write(f"{stamp}\t{pid}\t{nspid}\t{procs[pid]['ppid']}\t{procs[pid]['comm']}\t{cwd}\t{cmd}\n")
            time.sleep(interval)
        sink.write("# last-seen\n")
        for (pid, start), last in sorted(seen.items()):
            sink.write(f"# {pid}\t{start}\t{last}\n")


if __name__ == "__main__":
    main()
