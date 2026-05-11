# Elliott OOM diagnostic — output

## §2.1 Background + cohort canon at byte

**Status:** §1 prerequisite reads are complete; live remote diagnostics start after this checkpoint.

**Scope / guardrails:** This lane is read-only on ronan, elliott, cael, and silas. I will not restart gateways, change configs, push outside `ronan/elliott-oom-diagnostic-20260511/copilot`, open a PR, or comment outside #649. Source: `WORKORDER.md:19-36`, `WORKORDER.md:154-178`.

**Runbook + docs substrate read:**

- `WORKORDER.md:1-199` end-to-end, including the 09:35 amendment in `WORKORDER.md:40-87`.
- `LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md` required sections: Webhook Heartbeat (`LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md:446-520`), Remote-First (`LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md:606-690`), Failure-Mode Catalog (`LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md:1374-1440`).
- `LOCAL-GATEWAY-LEAK-CANARY-RUNBOOK.md:1-337` for heap snapshot / canary diagnostic shape: compare snapshots, name dominant retainers, and avoid mutating the live gateway.
- GitHub #649, #642, #643, #639, #638 live views rendered to `/tmp/gh-*.md` during §1.
- `LOCAL-memory-2026-05-11.md` / `~/.openclaw/workspace/memory/2026-05-11.md` read for the morning cohort substrate through the latest available entries.
- External docs/research read:
  - Node heap snapshots: creating snapshots can pause the main thread and may need roughly twice heap memory; compare snapshots to identify positive deltas.
  - Node V8 APIs: `v8.getHeapSnapshot()` is a blocking snapshot stream; `getHeapStatistics()` exposes heap limit / used heap / native-context counters.
  - Node CLI: `--inspect`, `--heapsnapshot-signal=SIGUSR2`, `--heapsnapshot-near-heap-limit`, `--trace-gc*`, and inspector security implications.
  - Linux cgroup v2: `memory.max` is the hard-limit OOM boundary; `memory.events:oom_kill` counts OOM-killed cgroup processes; `memory.stat` fields are bytes and include `anon`, `file`, `kernel`, `slab`; `memory.pressure` is PSI.
  - Linux PSI: `some` means at least some tasks stalled; `full` means all non-idle tasks stalled.

**Cohort canon loaded before remote diagnostics:**

- **Producer-1 / PR #642:** body/runtime-context duplication caused by `||` fallback in `resolveRuntimeContextPromptParts`; PR #642 is merged and is a separate correctness fix. Evidence: `/tmp/gh-pr-642.md:8-55`, `/tmp/gh-pr-642.md:105-117`, `/tmp/gh-pr-642.md:176-202`.
- **Producer-2 / #643:** `formatSkillsForPrompt` allocates fresh `<available_skills>` blocks; heap-dump evidence on ronan was 3,664 retained blocks and per-skill descriptions around 4,069-4,070 occurrences. Evidence: `/tmp/gh-issue-643.md:8-65`.
- **Producer-3 / unknown:** morning memory records that Elliott continued to V8-OOM even after the #633 skill-snapshot-cache-gate cherry-pick was deployed on Elliott, so producer-2 may be partial or not sufficient. Evidence: `LOCAL-memory-2026-05-11.md:2640-2656`, `LOCAL-memory-2026-05-11.md:2440-2493`.
- **V8-OOM is real on Elliott:** the earlier "cgroup oom_kill 0 forecloses OOM" claim was corrected; Elliott has V8 allocator self-aborts (`node::OOMErrorHandler`, `status=6/ABRT`) while cgroup OOM remains a separate layer. Evidence: `LOCAL-memory-2026-05-11.md:1047-1100`.
- **Watchdog is a candidate but not sufficient:** morning memory found watchdog SIGTERM / stale detection, but later V8-OOM evidence re-opened OOM as the primary layer. Evidence: `LOCAL-memory-2026-05-11.md:96-140`, `LOCAL-memory-2026-05-11.md:1047-1088`.
- **5xx/header-missing/compact framing:** figs later reframed the visible duplication/empty-envelope issue as retention beyond compaction plus 5xx/header-missing failures; ronan, elliott, and cael byte-evidence now points at GC/event-loop stalls plus model/failover timeouts during compact/heap pressure. Evidence: `LOCAL-memory-2026-05-11.md:4023-4091`, `LOCAL-memory-2026-05-11.md:4094-4133`, `WORKORDER.md:53-87`.
- **Heap-dump artifact:** `/tmp/openclaw-heapdump-20260511-0617/` contains `gateway.200924` and `strings.txt`; this is ronan baseline pre-#633, not Elliott current state. Evidence: `LOCAL-memory-2026-05-11.md:366-415`, `LOCAL-memory-2026-05-11.md:2635-2656`.

**Initial working theory before remote bytes:** Elliott's current V8-OOM cycle is likely not a cgroup hard-limit OOM. It is likely V8 old-space exhaustion driven by prompt/cache churn: producer-1 duplicated runtime-context content before #642; producer-2 / skill prompt rebuilds and system-prompt digest churn invalidate prompt cache and retain prompt fragments; GC/event-loop stalls during compaction/fallback turn provider timeouts into "5xx-shape" failures and dropped/missing body content. Remote Linux/V8/config/watchdog data below will either support or falsify this.

## §2.2 Linux cgroup memory inspection on elliott

**Raw sample:** `/tmp/elliott-oom-diagnostic-20260511/elliott-cgroup-v8-samples-20260511-092459.txt`, captured from Elliott at `2026-05-11T09:24:59-07:00` through `09:25:59-07:00` against gateway PID `1827376`. The gateway cgroup was `/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice/openclaw-gateway.service`; systemd reported `WatchdogUSec=0`, `NRestarts=15`, and `ActiveEnterTimestamp=Mon 2026-05-11 09:16:01 PDT` at the start of the sample.

**Conclusion:** current Elliott V8-OOMs are **not cgroup hard-limit OOMs**. Across seven 10-second samples:

| field                                     | observed                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `memory.max` / `memory.high`              | `max` / `max` in every sample                                                 |
| `memory.events`                           | `oom=0`, `oom_kill=0`, `oom_group_kill=0` in every sample                     |
| `memory.pressure`                         | `some avg10/60/300=0.00`, `full avg10/60/300=0.00`, `total=0` in every sample |
| `memory.current`                          | 1,796,222,976 to 2,164,346,880 bytes                                          |
| `memory.peak`                             | 2,166,214,656 bytes in this post-restart window                               |
| `anon`                                    | 1,751,965,696 to 2,113,400,832 bytes                                          |
| `file`                                    | ~4.9 MB                                                                       |
| `kernel`                                  | ~38.1 to 44.4 MB                                                              |
| `slab`                                    | ~1.97 to 2.25 MB                                                              |
| `sock`, `shmem`, `swapcached`, `anon_thp` | zero except one transient `sock=610304` sample                                |

This is almost all process anonymous heap/RSS, not reclaimable file cache, slab, socket, shmem, or swap. `/proc/1827376/status` and `smaps_rollup` agreed: sample RSS ranged from ~1.78 GB to ~2.13 GB, `RssAnon` from ~1.71 GB to ~2.06 GB, `RssFile` stayed ~66 MB, and `VmSwap=0`. The post-restart process was actively allocating/GCing: `memory.current` climbed from ~1.96 GB to ~2.16 GB, then dropped to ~1.80 GB inside the one-minute window, with no cgroup pressure or kernel OOM event.

**Layer correction:** `memory.events:oom_kill=0` only rules out kernel/cgroup OOM-kill. It does **not** rule out V8 old-space self-abort. The journal evidence below shows V8 allocator-layer fatal errors with `status=6/ABRT` while the cgroup remains unlimited and non-pressured.

## §2.3 V8 heap profiling on elliott

**Raw evidence:** `/tmp/elliott-oom-diagnostic-20260511/elliott-journal-watchdog-v8-20260511-092724.txt`, `/tmp/elliott-oom-diagnostic-20260511/elliott-counts-20260511-092811.txt`, `/tmp/elliott-oom-diagnostic-20260511/elliott-node-effective-flags-20260511-093643.txt`, `/tmp/elliott-oom-diagnostic-20260511/elliott-kill-signal-counts-20260511-093624.txt`, and `/tmp/elliott-oom-diagnostic-20260511/elliott-cgroup-v8-samples-20260511-092459.txt`.

**Fatal shape:** Elliott has repeated V8 old-space fatal errors, not kernel OOM kills. Journal counts since midnight:

- `Started openclaw-gateway`: 126 starts since `00:03:09`, last at `09:16:01` (`elliott-counts-20260511-092811.txt`).
- `FATAL ERROR: Reached heap limit`: 14.
- `FATAL ERROR: Ineffective mark-compacts near heap limit`: 1.
- `node::OOMErrorHandler`: 15.
- `Main process exited, code=dumped, status=6/ABRT`: 15, first `06:14:13`, last `09:15:56`.
- `Killed process`, `oom-kill`, `status=9`, `code=killed`: 0 (`elliott-kill-signal-counts-20260511-093624.txt`).

The fatal logs are canonical V8 old-space failures. The last pre-sample crash shows:

- `09:15:55` PID `1816473`: `Mark-Compact 4090.3 (4100.7) -> 4088.2 (4100.2) MB ... allocation failure; scavenge might not succeed`.
- Immediately after: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`.
- `09:15:56`: systemd reports `Main process exited, code=dumped, status=6/ABRT`.

That ~4.1 GB heap-limit signature is the central byte: Elliott is crashing at the default V8-old-space scale, not at 32 GB.

**Effective Node flags:** Elliott's unit file contains two `NODE_OPTIONS` assignments:

1. `openclaw-gateway.service.d/override.conf`: `Environment=NODE_OPTIONS=--max-old-space-size=32768`
2. `openclaw-gateway.service.d/usr2-trap.conf`: `Environment="NODE_OPTIONS=--require=/home/figs/.openclaw/usr2-trap.js"`

The live process environment resolves to only:

```text
NODE_OPTIONS=--require=/home/figs/.openclaw/usr2-trap.js
```

The live command line is just `node .../dist/index.js gateway --port 18789`, with no `--max-old-space-size` argument. Source: `/tmp/elliott-oom-diagnostic-20260511/elliott-node-effective-flags-20260511-093643.txt` and `/tmp/elliott-oom-diagnostic-20260511/config-diff-20260511-092920/elliott.txt`.

**Interpretation:** the later `usr2-trap.conf` assignment overwrites the intended `--max-old-space-size=32768` assignment. This explains the mismatch between "unit appears configured for 32 GB" and "V8 dies at ~4.1 GB." It does not explain why heap grows, but it explains why Elliott is dying at default old-space instead of surviving long enough for the intended diagnostic window.

**Inspector / snapshot availability:** no inspector listener was visible on `:9229` or `:9230`; the process listened on gateway/internal ports only (`18789`, `18791`, `3334`). No `--trace-gc`, `--trace-gc-verbose`, `--heapsnapshot-signal`, or `--heapsnapshot-near-heap-limit` flag was present in the live command line or environment. I did **not** send `SIGUSR1` or `SIGUSR2`, did **not** restart, and did **not** take a live heap snapshot: the process was not started with an accessible snapshot mechanism, and Node heap snapshots can block the event loop and require roughly 2x heap memory.

**Prompt/cache evidence on Elliott:** the V8 failure window is surrounded by prompt-cache and event-loop symptoms:

- 51 `cache read dropped` events since today; first `06:02:30`, last `09:23:17`.
- 20 `systemPrompt(system prompt digest changed)` cache drops; first `06:02:30`, last `09:08:40`.
- Examples include `3527627 -> 1174148` at `08:44:00`, `5607527 -> 2545690` at `08:59:51`, `3891549 -> 847786` at `09:08:40`, and repeated no-tracked-change drops at `09:11:04`, `09:13:47`, `09:15:44`, `09:23:17`.
- 101 liveness warnings since today; recent ones show `eventLoopUtilization=1`, CPU around one core or higher, and active/queued `model_call` work.
- `08:26:29` Discord `/oauth2/applications/@me` fetch timeout occurred during the same broad failure window.

**Prior heap-dump substrate:** `/tmp/openclaw-heapdump-20260511-0617/` is the ronan baseline pre-#633, not Elliott current state. It still validates the K-pattern family: `strings.txt` has 1,352,817 lines, 4,080 `<available_skills>` marker occurrences, 4,073 closing markers, 72,914 `SKILL.md` occurrences, and the canonical `<available_skills>` header line repeated 3,664 times. This supports producer-2/skill-prompt retention as real heap residue, but it is not sufficient by itself to explain Elliott's post-#633 current OOMs.

## §2.4 Watchdog hypothesis investigation

**Raw evidence:** `/tmp/elliott-oom-diagnostic-20260511/elliott-journal-watchdog-v8-20260511-092724.txt`, `/tmp/elliott-oom-diagnostic-20260511/elliott-kill-signal-counts-20260511-093624.txt`, and cross-host unit snapshots in `/tmp/elliott-oom-diagnostic-20260511/config-diff-20260511-092920/`.

**Answer:** watchdog activity existed earlier in the morning, but it is **not** the mechanism for the 06:14-09:15 V8-OOM sequence.

Evidence:

- `systemctl --user show openclaw-gateway` on Elliott reports `WatchdogUSec=0`; ronan, cael, and silas gateway units also report `WatchdogUSec=0`. Systemd's native watchdog is not enabled for the gateway.
- Elliott `openclaw-gateway` kill-shape counts since today: `node::OOMErrorHandler=15`, `status=6/ABRT=15`, `Killed process=0`, `oom-kill=0`, `status=9=0`, `code=killed=0`.
- The visible V8 sequence is fatal-error then `ABRT`, not watchdog signal then restart.
- Elliott did have 222 `SIGTERM`-matching gateway journal lines earlier, with repeated `signal SIGTERM received` / `received SIGTERM; shutting down` events roughly every few minutes through `05:59:56`. The separate `openclaw-watchdog.service` oneshot also appears in the user journal earlier (`Starting` / `Finished OpenClaw Gateway Watchdog — stale/deaf detection + restart`).
- At `09:29`, Elliott `list-units --all 'openclaw*'` showed `openclaw-gateway.service` and `openclaw-runloop-worker.service`; it did not show an active `openclaw-watchdog.timer`. By contrast, ronan and cael had `openclaw-watchdog.timer loaded active waiting`.

**Interpretation:** there are two phases:

1. **Pre-06:14:** a stale/deaf watchdog-style loop likely produced many SIGTERM restarts. That is real operational noise and should be investigated separately if figs cares about earlier restarts.
2. **06:14 onward:** Elliott's dominant crash mode is V8 self-abort at ~4.1 GB old-space, followed by systemd `status=6/ABRT` restarts. Watchdog is not the current OOM killer.

**Runloop side note:** Elliott's `openclaw-runloop-worker.service` is active and repeatedly ran dry-run bounded windows that failed/restarted around `09:06-09:23`. It is a separate service/cgroup, so it is not included in the gateway cgroup sample, but it can contribute workload or model-call pressure if it drives gateway interactions. Treat it as a possible load amplifier, not the process that died.

## §2.5 Config diff: what's special about Elliott?

**Raw evidence:** sanitized host configs and unit snapshots in `/tmp/elliott-oom-diagnostic-20260511/config-diff-20260511-092920/`; compact summaries in `/tmp/elliott-oom-diagnostic-20260511/config-summary-20260511-093029/`; effective Elliott process flags in `/tmp/elliott-oom-diagnostic-20260511/elliott-node-effective-flags-20260511-093643.txt`.

There is no committed per-host `openclaw.json` baseline in the cohort target SHA to diff against; this section therefore treats "local-only" as "different from the live peer configs/units captured read-only on elliott, cael, silas, and ronan."

**High-confidence Elliott-specific finding: the diagnostic drop-in masks the heap limit.**

| host            | gateway service version         | effective `NODE_OPTIONS` / relevant unit state                                                                                                                    |
| --------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| elliott         | `OpenClaw Gateway (v2026.5.8)`  | intended `--max-old-space-size=32768` drop-in, then later `NODE_OPTIONS=--require=/home/figs/.openclaw/usr2-trap.js`; live process has only the `--require` value |
| ronan           | `OpenClaw Gateway (v2026.4.11)` | `NODE_OPTIONS=--max-old-space-size=32768`; `MemoryPeak=3830915072`; `NRestarts=1`                                                                                 |
| cael            | `OpenClaw Gateway (v2026.4.11)` | `NODE_OPTIONS=--max-old-space-size=32768`; gateway was failing for a different exit-code shape at sample time                                                     |
| silas / urudyne | `OpenClaw Gateway (v2026.4.11)` | `NODE_OPTIONS=--max-old-space-size=8192 --heapsnapshot-signal=SIGUSR2`; `MemoryPeak=5941641216`; `NRestarts=0`                                                    |

This is the strongest "what is special about Elliott?" answer. Elliott is the only sampled host whose unit visually contains a large old-space setting but whose live process environment has lost it.

Other Elliott differences that may affect heap shape, but are weaker than the `NODE_OPTIONS` finding:

- Elliott config meta is `2026.5.8`; cael and silas configs are `2026.5.10-beta.1`; ronan is `2026.5.8`.
- Elliott `agents.defaults.timeoutSeconds=300`; ronan has `1200`; cael/silas are null.
- Elliott uses `thinkingDefault=medium` and model thinking `medium`; cael is high/high; silas is medium/high; ronan is medium/medium.
- Elliott has `hooks.internal.entries.event-loop-lag.enabled=true`; peers did not in the concise summaries.
- Elliott has `plugins.entries.codex.enabled=true`; ronan/cael use `openclaw-claude-code` plugin load paths; silas has fewer plugin entries and no memory-wiki/active-memory in the captured summary.
- Elliott and silas use legacy `channels.discord.threadBindings.spawnSessions`; ronan and cael use split `spawnSubagentSessions` / `spawnAcpSessions`.
- Elliott service version is newer than the other sampled gateway units (`v2026.5.8` vs `v2026.4.11`), but version alone is not the crash proof; the live flag mismatch is.

**Source-level tie-in:** `src/agents/skills/skill-contract.ts:44-64` still formats a fresh skills prompt string when called. The ronan heap artifact shows this can leave many repeated skills strings. On Elliott, the current evidence says that prompt/cache churn is a heap-growth driver, while the masked `--max-old-space-size` setting is the proximate reason the process dies at ~4 GB.

## §2.6 Synthesis: working theory + falsification tests

### Working theory

**Elliott's current V8-OOM cadence is a two-part failure:**

1. **Proximate config fault:** Elliott is not actually running with the intended `--max-old-space-size=32768`. A later `usr2-trap.conf` `NODE_OPTIONS` assignment overwrites the earlier old-space assignment, so V8 uses its default ~4 GB old-space limit. That is why fatal logs die at `4090-4101 MB` instead of near 32 GB.
2. **Underlying heap-growth workload:** prompt/cache churn and retained prompt fragments push the gateway toward that default limit. Elliott shows repeated prompt-cache drops, system-prompt digest/tool-count churn, event-loop-utilization warnings, model/fetch timeouts, and prior heap-dump evidence for repeated skills/system-prompt strings. Producer-1 (#642) is the correctness fix for runtime-context duplication; producer-2 (#643) is real but likely partial; producer-3 is the remaining churn/retention source.

**What this replaces:** "we don't know why" becomes: **the current death mechanism is V8 old-space self-abort at the default heap ceiling because Elliott's effective Node flags lost the intended heap limit; the heap is being driven there by prompt/cache churn, not by cgroup pressure or systemd watchdog.**

### Support

- **V8 threshold matches default old-space:** journal shows Mark-Compact near `4090-4101 MB` immediately before `FATAL ERROR: Reached heap limit`, then `status=6/ABRT`.
- **Effective flags explain the threshold:** live `/proc/<pid>/environ` has `NODE_OPTIONS=--require=/home/figs/.openclaw/usr2-trap.js` only; no `--max-old-space-size`; no inspector/snapshot/GC trace flags.
- **Cgroup falsifies kernel-OOM:** `memory.max=max`, `memory.high=max`, `oom=0`, `oom_kill=0`, `oom_group_kill=0`, PSI all zero, and memory is mostly `anon`/RSS.
- **Watchdog falsifies current-killer hypothesis:** systemd `WatchdogUSec=0`; kill-shaped journal has 15 V8 `OOMErrorHandler`/ABRT events and zero kernel kill/status-9 events; the watchdog/SIGTERM sequence is earlier and separate.
- **Churn evidence supports heap-growth workload:** 51 prompt-cache drops, 20 system-prompt digest changes, 101 liveness warnings, and model/fetch timeouts in the failure window.
- **Heap artifact supports retained prompt strings:** ronan pre-#633 heap strings show thousands of repeated `<available_skills>`/`SKILL.md` strings; not current-Elliott proof by itself, but strong family evidence.

### Falsification tests

These are read-only or next-restart tests for figs/cohort; I did not run mutating tests.

1. **Flag falsifier:** after an authorized restart with a single combined `NODE_OPTIONS`, read `/proc/<pid>/environ` and `process.execArgv` / `v8.getHeapStatistics().heap_size_limit`. If the heap limit remains ~4 GB despite `--max-old-space-size=32768`, the masked-flag theory is wrong or Node is ignoring the flag.
2. **Crash-threshold falsifier:** if Elliott still dies at ~4.1 GB after the effective heap limit is confirmed >30 GB, then the crash is not explained by the masked old-space flag.
3. **Cgroup falsifier:** if `memory.events:oom_kill` or kernel OOM logs increment during future crashes, cgroup/kernel OOM re-enters the theory.
4. **Watchdog falsifier:** if a future failure shows `SIGTERM` / code-killed / watchdog reason immediately before gateway exit instead of V8 fatal logs, watchdog becomes the active killer again.
5. **Churn falsifier:** if a controlled run with stable system-prompt/tools digest and no prompt-cache drops still grows to OOM at the same cadence, prompt/cache churn is not the primary heap-growth driver.

### Confirmation tests / next-byte-walk

1. On next authorized restart, set one combined `NODE_OPTIONS` value and log at gateway start: `process.execArgv`, `process.env.NODE_OPTIONS` with secrets redacted, and `v8.getHeapStatistics().heap_size_limit`.
2. Run the same 10-second cgroup/proc sampler for 10-15 minutes after restart, plus journal tail for `prompt-cache`, `systemPrompt`, `tools(`, `Mark-Compact`, `FATAL ERROR`, and liveness warnings.
3. Add a low-overhead V8 heap-stats interval to gateway diagnostics: used heap, total heap, heap limit, external memory, native contexts, detached contexts, RSS, and event-loop delay.
4. Capture heap snapshots only when configured and safe. Prefer `--heapsnapshot-signal=SIGUSR2` and an operator-triggered snapshot during controlled pressure; avoid surprise snapshots on a saturated live process.
5. For producer-2/3: compare snapshots from the same PID before/after prompt-cache drops and rank retained strings/arrays/contexts by dominators. Specifically separate `<available_skills>`, system prompt, tool schema, Discord message body/envelope, memory-wiki/active-memory, and continuation queue objects.
6. A/B one config knob at a time: disable/enable the Elliott-only or Elliott-different surfaces (`codex`, event-loop-lag hook, runloop worker inputs, active-memory/memory-wiki bridge, legacy `spawnSessions`) while holding traffic shape constant, then compare prompt-cache digest stability and heap growth.

## §2.7 Recommendations

**Watchdog decision:** do not re-enable or tune native systemd watchdog as the OOM fix. Cgroup evidence is clean; `WatchdogUSec=0`; current crashes are V8 ABRT. The earlier SIGTERM/watchdog loop is real but separate. If figs wants a stale/deaf watchdog back in the loop, it should be reason-logging and page/diagnose-first during this investigation, not silently restart-first, so it does not mask the V8 evidence.

**Next authorized restart should fix the masked `NODE_OPTIONS` first.** If figs wants the intended survival window, use one combined assignment, not two separate `NODE_OPTIONS` drop-ins. Example shape:

```text
NODE_OPTIONS=--max-old-space-size=32768 --require=/home/figs/.openclaw/usr2-trap.js --heapsnapshot-signal=SIGUSR2 --report-on-fatalerror
```

If figs wants a shorter diagnostic reproduction instead of survival, pick a smaller explicit old-space value (for example 8192) but still make it explicit and confirm `heap_size_limit` at startup. The key is not the exact MB value; the key is that the live process must prove the intended value is effective.

**Diagnostics flags for one controlled window:**

- `--heapsnapshot-signal=SIGUSR2`: enables deliberate snapshots without inspector; only signal when the operator accepts the pause/memory cost.
- `--report-on-fatalerror` plus a known report directory: captures a Node diagnostic report on fatal abort.
- `--trace-gc --trace-gc-nvp` or `--trace-gc-verbose`: useful for one short diagnostic window, but log volume will be high.
- Add application-level startup logging of `v8.getHeapStatistics().heap_size_limit`, `process.execArgv`, redacted `NODE_OPTIONS`, RSS, and configured plugin/tool counts.

**Config mitigations to test, not blindly apply:**

- Temporarily reduce `agents.defaults.maxConcurrent`, `subagents.maxConcurrent`, and continuation delegate caps if the goal is to lower simultaneous prompt materialization.
- Stabilize system prompt/tool surfaces: investigate why Elliott flips tool count (`42 -> 39 -> 38`) and system-prompt digest; deterministic tools + stable prompt bytes should reduce cache-drop churn.
- A/B Elliott-only or Elliott-different surfaces (`codex` plugin, event-loop-lag hook, runloop worker load, active-memory/memory-wiki bridge, legacy `spawnSessions`) one at a time.
- Keep #643 producer-2 scoped as retention/perf, not the only root cause. The current proximate kill is the masked heap flag; the current growth driver still needs producer-3 proof.

**Standing capture for Elliott going forward:**

1. Every 10 seconds: `memory.current`, `memory.stat`, `memory.events`, `memory.pressure`, `/proc/<pid>/status`, `/proc/<pid>/smaps_rollup`, and `systemctl --user show openclaw-gateway -p NRestarts -p MemoryCurrent -p MemoryPeak -p Result`.
2. Journal tail keyed on `prompt-cache`, `systemPrompt`, `tools(`, `liveness warning`, `Mark-Compact`, `FATAL ERROR`, `OOMErrorHandler`, `status=6/ABRT`, `SIGTERM`, and watchdog service lines.
3. Per-request low-overhead counters: prompt-cache drop bytes/tokens, systemPrompt digest, tool-count/tool-list digest, model-call age, compaction trigger, continuation queue depth, and heap stats.
4. On next failure, correlate: last digest/tool change -> cache drop -> heap growth -> GC stall -> model/fetch timeout -> V8 fatal or recovery.
