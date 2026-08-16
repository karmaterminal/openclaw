# Exact specimen requirements

Do not copy, open, check, ANALYZE, or VACUUM a live Gateway-owned DB.

## Required

For each of Cael, Ronan, and Emeric (one seat is enough to start; all three for fleet deploy):

1. Stop that seat's Gateway, or take a filesystem snapshot that is proven idle (no live writer).
2. Copy as a set:
   - `agents/<agentId>/agent/openclaw-agent.sqlite`
   - `openclaw-agent.sqlite-wal` if present
   - `openclaw-agent.sqlite-shm` if present
3. Record: path, seat, UTC time, Gateway PID/inactive proof, `stat` size/mtime, SHA-256 of each file, SQLite version after **copy-only** open.
4. Freeze those copies read-only. Run clones A/B/A' from the copies. ANALYZE only clone B.

## Exact incident sizes to match or supersede with a dated post-incident snapshot

- Cael: **5,403,803,648** B (fenced read 4,864 ms / 5,398 ms)
- Ronan: **3,796,570,112** B (2,327 ms / 2,543 ms)
- Emeric: **6,622,703,616** B (1,222 ms `agent.write`)

A later stopped-Gateway copy of the same seat is acceptable if it is larger, fully sidecar-complete, and labeled as post-incident.

## Rejected on this host (2026-08-15)

- Live Ronan `~/.openclaw/agents/main/agent/openclaw-agent.sqlite` (~3.90 GiB, mtime still moving). Policy exclusion.
- Live Codex `codex-home/state_5.sqlite` / `logs_2.sqlite`. Wrong owner.
- Aug 7 recovery `main-openclaw-agent.sqlite` files at **3,190,161,408** B, no WAL/SHM, receipts say `gateway=active`. Wrong size; not a released snapshot.
- Memory plugin `main.sqlite` backups (~3.16 GiB). Wrong owner.
- State-DB repairs (`ronan-sqlite-repair-20260815`, schema6 `openclaw.sqlite`). Wrong store.

## After a valid copy exists

Run the A/B/A' protocol in `METHOD.md`. Integrity failure → #1261. Do not treat ANALYZE on a healthy 24 KiB control as incident proof.
