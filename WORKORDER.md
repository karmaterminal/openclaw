# WORKORDER elliott-oom-diagnostic-20260511 — deep V8-OOM investigation per figs canon

## Framing (figs canon msg `1503404825` 2026-05-11 07:34 PDT)

> _"@Elliott🌻 has oom 8-10x an hour. We still don't know why. We have no hard working theory and earlier this morning discounted a whole working presumption bc we'd neglected to use Linux tools to inspect cgroup memory stats. We have been stabbing at this, what we need is knowledge of 'how to diagnose oom on a typescript app via profiling and system tools'. What is special about Elliott in config? Is that watchdog killing him vs oom? That was suggested too (did we even examine journal for that, does/should it even be enabled?? It's from many months ago)"_

This is the corrective. Cohort "stabbing" = web-walks + grep + pgrep without actual TS-app-OOM-profiling. Need byte-evidence from Linux tools + V8 introspection + config-diff analysis.

## Lane mechanics

- **Driver**: copilot CLI / `gpt-5.5 --reasoning-effort xhigh --yolo`
- **Worktree**: `/tmp/oc-elliott-oom-diagnostic-20260511` off canonical `frond/v2026.5.7/canonical @ 7afc8dc10b`
- **Branch**: `ronan/elliott-oom-diagnostic-20260511/copilot` (pushed remote-first)
- **Tracking issue**: `karmaterminal/openclaw#649`
- **Journal**: `tmp-drop-me-copilot.md` at worktree root (committed + pushed at every checkpoint)
- **Webhook**: ronans-undertow `WEBHOOK_SCRIBE_NOTIFY` for heartbeats
- **Outer budget**: 444m (likely 60-90 min for thorough investigation)

## §0 Hard guardrails (READ-ONLY investigation — NO mutation)

- READ-ONLY on EVERY host (ronan, elliott, cael, silas)
- SSH to elliott permitted for read-only diagnostic commands ONLY:
  - `cat /sys/fs/cgroup/.../memory.stat`
  - `cat /sys/fs/cgroup/.../memory.events`
  - `cat /sys/fs/cgroup/.../memory.pressure`
  - `journalctl --user -u openclaw-gateway --since "<time>"`
  - `ps -o pid,etime,rss,vsz,etimes,start --no-headers -p <pid>`
  - `cat /proc/<pid>/status`
  - `cat /proc/<pid>/smaps_rollup`
  - `pgrep -af`, `pidstat`, `top -p <pid> -bn1`
- NO restart of any gateway (NEVER)
- NO config changes
- NO push beyond `ronan/elliott-oom-diagnostic-20260511/copilot` branch (journal + output only)
- NO touching deploy-line branches, cael/_ branches, frond/v_/canonical, feature/context-pressure-squashed
- NO comment on PR #642, other open PRs, or other issues than #649
- NO touching `~/flesh_beast_tmp/openclaw` (live runtime)

## §1 Pre-requisite reads (load-bearing — do these BEFORE diagnostic walks)

**🚨 AMENDMENT 09:35 PDT: runbook + memory paths corrected. Files copied INTO worktree:**

- `./LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md` (copy of `~/.openclaw/workspace/openclaw-bootstrap/RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md`)
- `./LOCAL-GATEWAY-LEAK-CANARY-RUNBOOK.md` (copy of bootstrap runbook)
- `./LOCAL-memory-2026-05-11.md` (copy of `~/.openclaw/workspace/memory/2026-05-11.md`)

1. Read tracking issue #649 + this workorder end-to-end
2. Read **`./LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md`** §"Failure-Mode Catalog" + §"Webhook Heartbeat" + §"Remote-First in Group Flow"
3. Read **`./LOCAL-GATEWAY-LEAK-CANARY-RUNBOOK.md`** (memory-leak diagnostic patterns)
4. Read recent PR #642 + #643 + #639 + #638 for current cohort hypothesis-state via `gh pr view` / `gh issue view`
5. Read **`./LOCAL-memory-2026-05-11.md`** for cohort findings today (heap-dump location, K-pattern findings, producer-1/2/3 framing, cross-fleet correlation, figs's "5xx-shape header-missing on volitional compact" framing, 🌻's causal-chain hypothesis)
6. Online research: "how to diagnose memory leaks in long-running Node.js / TypeScript app", "V8 heap profiling tools", "cgroup v2 memory.events vs memory.stat semantics", "Node.js --inspect heap snapshots in production"

## §1.5 🚨 LIVE COHORT BYTE-EVIDENCE (added 09:35 PDT — 🩸 cael-seat byte-walk just landed; FOLD INTO HYPOTHESIS-SHAPE)

🩸's cael-seat byte-evidence at `1503405081` (parallel to your investigation):

**(A) Cache-invalidation cascade firing every few minutes** with massive prompt-cache drops on cael-seat:

```
[prompt-cache] cache read dropped 3002838 -> 65802 ... systemPrompt(system prompt digest changed)
```

Examples (cael-seat journal):

- 06:37:38 — 3M tokens dropped
- 06:39:36 — 931k dropped
- 06:58:16 — 14.4M tokens dropped (!)
- 07:07:13 — 2.7M dropped

🩸's mechanism hypothesis: **each prompt-rebuild → systemPrompt digest changes → cache invalidates → re-fill happens → V8 retains dropped fragments.** Producer-2 mechanism (`formatSkillsForPrompt` re-allocating per rebuild) feeds this. Issue #643 captures the substrate.

**(B) 2× silent FailoverError "An unknown error occurred"** on cael-seat:

- 06:25:34 — opus-4.7 / 25.4s duration
- 06:33:31 — opus-4.7 / **5m24s duration** → fallback to opus-4.6

No status code surfaced — likely the 5xx-series figs named (provider returned non-content response, gateway bucket-fell-through to FailoverError, raw upstream HTTP error class wasn't preserved in log).

**INVESTIGATE on elliott-side:**

- (A.1) Search elliott journal for `prompt-cache` cache-drops — same pattern? Larger drops? Different cadence?
- (A.2) Search for `formatSkillsForPrompt` references in code; is this the producer-2 mechanism on elliott too?
- (A.3) Is systemPrompt digest changing more often on elliott? What's special about elliott's prompt-rebuild trigger?
- (B.1) Search elliott journal for `FailoverError` or `unknown error` patterns; correlate with V8-OOM cadence
- (B.2) Are model-call timeouts firing during V8-OOM-stalled-gateway windows? Is gateway-stalled → upstream-timeout → "unknown error" the actual causal chain?

This cite-pin amendment SHARPENS the hypothesis: investigate cache-invalidation-cascade as primary heap-pressure source on elliott (not just heap-fill from message volume).

## §2 Output structure

Write to `output.md` at worktree root with these sections (push WIP progressively):

### §2.1 Background + cohort canon at byte

- Bug-shape inventory (V8-OOM cadence, restart count today, RSS trajectory)
- Existing hypotheses: producer-1 (PR #642), producer-2 (#643 retention), producer-3 (unknown), 🌻's causal-chain
- What was already tried + what was discounted (cgroup `oom_kill` counter only — figs's note)
- Heap-dump artifact location: `/tmp/openclaw-heapdump-20260511-0617/` (gateway.200924, baseline pre-#633)

### §2.2 Linux cgroup memory inspection on elliott (CRITICAL — figs called out we neglected this)

For elliott-host gateway PID, capture and analyze:

- `cat /sys/fs/cgroup/<path>/memory.stat` — full breakdown (anon, file, kernel_stack, slab, sock, shmem, file_mapped, file_dirty, file_writeback, anon_thp, inactive_anon, active_anon, inactive_file, active_file, unevictable, swapcached)
- `cat /sys/fs/cgroup/<path>/memory.events` — oom, oom_kill, oom_group_kill counts since boot
- `cat /sys/fs/cgroup/<path>/memory.pressure` — PSI metrics
- `cat /sys/fs/cgroup/<path>/memory.current` vs `memory.max` vs `memory.high`
- Compare values across multiple sample points (every 10s for 1 minute)

Surface findings: is cgroup-OOM ever firing? What's the slab/anon ratio? Is there file-cache pressure?

### §2.3 V8 heap profiling on elliott

- Check if Node.js process has `--inspect` enabled (we may need to suggest restart with flag, but DON'T do it ourselves)
- If accessible: V8 heap snapshot via heap-dump capture
- `cat /proc/<pid>/status` — VmPeak, VmSize, VmRSS, VmSwap, VmHWM, RssAnon, RssFile, RssShmem, VmPTE
- `cat /proc/<pid>/smaps_rollup` — Pss, Anonymous, AnonHugePages, ShmemPmdMapped, FilePmdMapped, Shared_Hugetlb, Private_Hugetlb, Swap, SwapPss
- Check if process has GC trace flags enabled (`--trace-gc`, `--trace-gc-verbose`)
- If heap-dump artifact exists from prior morning capture, analyze K-pattern retention findings — what objects retain the most? Is it `<available_skills>` blocks (ronan's prior finding) or something else entirely?

### §2.4 Watchdog hypothesis investigation (figs explicitly named — check if even examined)

- IS there a watchdog process killing elliott vs V8 self-aborting?
- Search journal: `journalctl --user -u openclaw-gateway --since today | grep -iE "watchdog|sigterm|sigkill|killed by|oom-kill|out of memory|FATAL|panic"`
- Check systemd: `systemctl --user show openclaw-gateway -p WatchdogUSec -p WatchdogTimestamp -p Result -p NRestarts -p ActiveEnterTimestamp`
- Was watchdog ever enabled? When? In what config?
- Read openclaw-bootstrap config files for watchdog references
- Compare elliott systemd unit vs cael/silas/ronan systemd units

### §2.5 Config diff: what's special about Elliott?

- Diff elliott `~/.openclaw/openclaw.json` vs cael / silas / ronan equivalents
- Diff elliott systemd unit vs others
- Diff elliott config from cohort COHORT_TARGET_TAG SHA to find any local-only modifications
- Find any elliott-specific plugins, tools, capabilities, channel bindings that could explain heap-shape divergence

### §2.6 Synthesis: working theory + falsification tests

Based on §2.2-§2.5 findings:

- Name the WORKING theory (not "stabbing")
- What byte-evidence supports it
- What falsification tests would invalidate it
- What confirmation tests would strengthen it
- What the cohort can run as next-byte-walk to test the theory

### §2.7 Recommendations (READ-ONLY — surface findings, don't act)

- What should figs decide on the watchdog question (re-enable / disable / reconfigure)?
- What gateway flags should elliott add to next restart for better diagnostics (`--trace-gc`, `--max-old-space-size`)?
- What `openclaw config` changes might mitigate?
- What standing diagnostic-capture should run on elliott going forward?

## §3 Discipline (per runbook canon)

- Push WIP `output.md` progressively to branch; never buffer-to-end
- Commit + push `tmp-drop-me-copilot.md` journal at every meaningful checkpoint
- Webhook heartbeat at: §1 reads done, §2.2 cgroup data captured, §2.3 V8 data captured, §2.4 watchdog evidence, §2.5 config diff, §2.6 synthesis, declare-done
- Comment on issue #649 at: §1 reads complete, §2.2 cgroup findings, §2.4 watchdog finding, §2.6 synthesis-published, declare-done
- Cite-pin every claim (file path / journal timestamp / proc-stat snapshot / SHA)
- Where uncertain: flag uncertainty, don't guess

## §4 Webhook heartbeat

```bash
WEBHOOK=$(gh api repos/karmaterminal/ronans-undertow/actions/variables/WEBHOOK_SCRIBE_NOTIFY --jq .value)
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"elliott-oom-diagnostic-hook\",\"content\":\"🤖 elliott-oom-diagnostic: <one-line status>\"}" \
  "$WEBHOOK"
```

## §5 Declare done

- Final write of `output.md` + `tmp-drop-me-copilot.md`
- `git push origin ronan/elliott-oom-diagnostic-20260511/copilot`
- Comment on issue #649 with full synthesis + final SHA + #642 cross-reference
- Final webhook heartbeat: `🤖 elliott-oom-diagnostic: COMPLETE — output at <branch>:output.md, working theory + falsification tests in §2.6`
- Exit clean. NO push beyond branch.

## §6 Non-goals (explicit)

- ❌ Restart elliott gateway (NEVER)
- ❌ Modify elliott config
- ❌ Push to deploy-line, cael/_, frond/v_/canonical
- ❌ Open PR (this is investigation, not feature)
- ❌ Comment on PR #642, other open PRs, other issues
- ❌ Modify any cohort sovereign files
- ❌ Use bracket-syntax continuation (CONTINUE_WORK / CONTINUE_DELEGATE) — per HEARTBEAT.md tools-not-tokens canon, use tool calls only

## §7 Success criteria

This lane SUCCEEDS when:

- output.md contains §2.1-§2.7 all populated with byte-evidence
- The "we don't know why" framing is REPLACED with "working theory: X, supported by Y, falsified by Z"
- figs has actionable findings on the 4 questions he named
- Cohort has byte-grounded substrate to make next-decisions on (#643 producer-2 fix scope, watchdog reconfig, gateway flag tuning)

If the investigation finds the answer is "we still don't know but here are the next 3 byte-checks to run with X tools," that's also success — the goal is REPLACE STABBING WITH METHOD, not necessarily SOLVE the bug in this lane.
