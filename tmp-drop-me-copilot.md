# Journal: elliott-oom-diagnostic-20260511 / copilot lane

## 2026-05-11 09:30 PDT — lane initialized

- Worktree: /tmp/oc-elliott-oom-diagnostic-20260511
- Branch: ronan/elliott-oom-diagnostic-20260511/copilot @ 7afc8dc10b (canonical frond/v2026.5.7/canonical)
- Tracking issue: karmaterminal/openclaw#649
- WORKORDER.md written, awaiting copilot dispatch
- Origin: figs canon msg 1503404825 2026-05-11 07:34 PDT — replace "stabbing" with method on Elliott V8-OOM 8-10x/hour
- Scope: READ-ONLY deep investigation. NO mutation. SSH to elliott permitted for read-only diagnostic ONLY.

## 2026-05-11 09:35 PDT — WORKORDER amendment (cite-pin from cohort byte-walk)

- 🩸 cael-seat byte-walk just landed at msg 1503405081
- AMENDED §1 + ADDED §1.5 LIVE COHORT BYTE-EVIDENCE
- Copied LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md + LOCAL-GATEWAY-LEAK-CANARY-RUNBOOK.md + LOCAL-memory-2026-05-11.md into worktree (paths corrected from absolute to local)
- Cite-pin: cael-seat shows cache-invalidation cascade (14.4M-token drops) + 2× FailoverError "unknown error" 5m24s = same family figs named "5xx-shape"
- Sharpens hypothesis: investigate cache-invalidation-cascade as primary heap-pressure source on elliott (not just heap-fill from message volume)
- Producer-2 mechanism named: formatSkillsForPrompt re-allocating per rebuild → systemPrompt digest changes → cache invalidates → V8 retains fragments

## 2026-05-11 09:40 PDT — §1 prerequisite reads complete

- Read WORKORDER, tracking issue #649, PR #642, issues #643/#639/#638, local runbook copies, and `LOCAL-memory-2026-05-11.md`
- External diagnostic docs read: Node heap snapshots / V8 APIs / Node CLI diagnostic flags / cgroup v2 memory semantics / PSI semantics
- gitcrawl unavailable in this environment (`gitcrawl: command not found`), so live `gh` snapshots were used for GitHub refs
- Key starting theory before remote bytes: Elliott's current failure is likely V8 allocator-layer OOM from prompt/cache churn plus GC/event-loop stalls, not cgroup hard-limit OOM; remote cgroup/V8/watchdog/config data will support or falsify
- Wrote initial `output.md` §2.1 with cite-pinned cohort canon and placeholders for §2.2-§2.7

## 2026-05-11 09:42 PDT — §2.2 cgroup/proc sample summarized

- Sampled Elliott gateway PID 1827376 every 10s for 1m at `/tmp/elliott-oom-diagnostic-20260511/elliott-cgroup-v8-samples-20260511-092459.txt`
- cgroup path: `/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/openclaw-gateway.service`
- `memory.max=max`, `memory.high=max`, `memory.events oom=0 oom_kill=0 oom_group_kill=0`, PSI all zero
- `memory.current` ranged 1.80-2.16GB in this post-restart window; memory shape is overwhelmingly anon/RSS, not file cache/slab/swap

## 2026-05-11 09:43 PDT — §2.3/§2.4 journal + watchdog evidence summarized

- Saved journal/systemd evidence at `/tmp/elliott-oom-diagnostic-20260511/elliott-journal-watchdog-v8-20260511-092724.txt`
- Saved counts/timeline at `/tmp/elliott-oom-diagnostic-20260511/elliott-counts-20260511-092811.txt`
- Saved kill-signal counts at `/tmp/elliott-oom-diagnostic-20260511/elliott-kill-signal-counts-20260511-093624.txt`
- Since today: 15 `node::OOMErrorHandler`, 15 `status=6/ABRT`, 0 `Killed process`, 0 `oom-kill`, 0 `status=9`, 0 `code=killed`
- V8 fatal examples show Mark-Compact near 4090-4101MB immediately before `FATAL ERROR: Reached heap limit`
- Systemd `WatchdogUSec=0`; watchdog/SIGTERM loop existed earlier, but 06:14+ dominant crash mode is V8 self-abort

## 2026-05-11 09:44 PDT — §2.5 config diff summarized

- Saved cross-host sanitized configs/units under `/tmp/elliott-oom-diagnostic-20260511/config-diff-20260511-092920/`
- Saved compact summaries under `/tmp/elliott-oom-diagnostic-20260511/config-summary-20260511-093029/`
- Saved Elliott effective process flags at `/tmp/elliott-oom-diagnostic-20260511/elliott-node-effective-flags-20260511-093643.txt`
- Load-bearing finding: Elliott unit has `NODE_OPTIONS=--max-old-space-size=32768` in `override.conf`, then `NODE_OPTIONS=--require=/home/figs/.openclaw/usr2-trap.js` in a later drop-in; live `/proc/<pid>/environ` contains only the `--require` value
- This explains why Elliott dies at the default ~4.1GB V8 old-space threshold despite the unit visually containing a 32768MB setting

## 2026-05-11 09:45 PDT — §2.6 synthesis written

- Updated `output.md` §§2.2-2.7 with cgroup, V8, watchdog, config-diff, synthesis, falsification tests, and recommendations
- Working theory: Elliott's proximate OOM cause is masked `--max-old-space-size` (default V8 old-space active), while prompt/cache churn is the underlying heap-growth workload
- No gateway restart, config mutation, live heap snapshot, PR comment, or push outside the requested branch
