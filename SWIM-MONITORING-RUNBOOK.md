# === FIRST PRINCE 🌻 MONITORING RUNBOOK ===

_Elliott 🌻 — Monitoring, deployment, and evidence collection for Swim runs._
_Companion to `SEAL-BOY-SWIM-RUNBOOK.md` on this branch._
_Updated for the current continuation implementation and Swim 7 priorities._

---

## 0. Role Definition

| Role                   | Prince     | Responsibilities                                                                      |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------- |
| **Admin**              | Ronan 🌊   | drives the execution protocol, prompts the SUT, probes results                        |
| **Monitor / Deployer** | Elliott 🌻 | watches logs, captures evidence, performs requested deploys/restarts, flags anomalies |
| **Subject**            | Silas 🌫️   | canary SUT; does not get test contents out-of-band                                    |
| **Operator**           | figs 🍖    | ground truth, pass/fail arbiter, policy decisions                                     |

Key rule:

- monitor can deploy/restart when requested
- monitor should not improvise deploys mid-test unless the admin/operator explicitly calls for it

---

## 1. Monitoring Deltas Versus The Older Swim-Monitoring Draft

These older assumptions should be dropped:

1. no observable `setDelegatePending` / `clearDelegatePending` log stream exists to monitor directly
2. `continuation-generation.js` is not the right canary thumbprint anymore
3. post-compaction delegates are no longer just a speculative path; stage/persist/release behavior exists now
4. hard-coded old session-store paths are risky; discover the live store path once per subject

Current monitoring should key off the actual runtime strings and artifacts.

---

## 2. Pre-Test Setup

### 2.1 Discover the live paths once

On the SUT:

- config is usually `~/.openclaw/openclaw.json`
- default session store is `~/.openclaw/agents/<agentId>/sessions/sessions.json`

If unsure, discover rather than guess.

Recommended:

```bash
openclaw sessions list --json
```

or, if you know the agent id:

```bash
ls -l ~/.openclaw/agents/main/sessions/sessions.json
```

### 2.2 Open monitoring surfaces

Use at least:

```bash
# Terminal 1: live filtered gateway log
ssh silas 'journalctl --user -u openclaw-gateway -f --no-pager' 2>/dev/null || \
ssh silas 'tail -f /tmp/openclaw-gateway.log'
```

```bash
# Terminal 2: raw unfiltered capture for later evidence
ssh silas 'journalctl --user -u openclaw-gateway -f --no-pager' > /tmp/swim-raw-$(date +%Y%m%d-%H%M%S).log
```

```bash
# Terminal 3: session store watch
watch -n5 'ssh silas "jq \".\\\"agent:main:discord:channel:1466192485440164011\\\" | {chainCount: .continuationChainCount, chainTokens: .continuationChainTokens, chainStarted: .continuationChainStartedAt, pendingPostCompactionDelegates}\" ~/.openclaw/agents/main/sessions/sessions.json 2>/dev/null"'
```

### 2.3 Baseline capture

Before each test:

```bash
ssh silas 'cat ~/.openclaw/openclaw.json' > /tmp/swim-config-before.json
ssh silas 'cat ~/.openclaw/agents/main/sessions/sessions.json' > /tmp/swim-sessions-before.json
```

Also capture:

- current commit SHA
- active profile: shipped-default smoke or fleet/mast-cell
- whether the gateway was restarted after the last config edit
- active finding IDs the current test is supposed to resolve

---

## 3. Real Log Strings To Watch

Do not monitor against guessed phrases from older notes. Watch for these exact families.

### 3.1 Tool delegate flow

```text
[continue_delegate] Consuming N tool delegate(s) for session ...
[continuation] Tool delegate rejected: maxDelegatesPerTurn exceeded (...)
[continuation] Tool delegate rejected: chain length ... reached
[continuation] Tool delegate rejected: cost cap exceeded (...)
[continuation:delegate-spawned] Tool delegate turn N/M: ...
Tool DELEGATE timer cancelled ...
[continuation-guard] Timer fired: stored=... current=... drift=... tolerance=...
```

### 3.2 Bracket-origin subtree flow

```text
[subagent-chain-hop] Spawned chain delegate (N/M) ...
[subagent-chain-hop] Chain length ... rejecting hop ...
[subagent-chain-hop] Cost cap exceeded (...) ...
[subagent-chain-hop] Timer cancelled (generation drift=... > tolerance=...)
[subagent-chain-hop] Accumulated ... tokens ...
```

### 3.3 Silent return / wake flow

```text
[continuation:enrichment-return] ...
```

For silent-wake paths, also look for the parent waking afterward rather than a visible shard announce.

### 3.4 Post-compaction flow

```text
[system:post-compaction] Session compacted at ...
Released N post-compaction delegate(s) into the fresh session.
[continuation:compaction-delegate-spawned] Post-compaction shard dispatched: ...
```

---

## 4. What Is And Is Not Observable

### Directly observable

- spawned task prefixes
- timer fire/cancel logs
- accept/reject logs
- session-store chain counters
- post-compaction lifecycle event text

### Not directly observable

- internal pending-delegate map contents
- internal `setDelegatePending` toggles as a stable log surface
- generation counter except as implied by timer fire/cancel logs

Do not write monitoring plans that depend on invisible internals.

---

## 5. Subject-Side Realities The Monitor Must Account For

### 5.1 The subject cannot verify silent return delivery

The subject usually experiences silent enrichment as "my next turn just had more context."

So the subject cannot reliably confirm:

- shard spawned
- shard completed
- silent return landed

Use logs and session-store evidence for delivery confirmation. Treat subject self-report as secondary.

### 5.2 Confabulation is the main blind-test failure mode

If enrichment did not land, the subject may still answer confidently and incorrectly.

Monitor for:

- detailed but wrong answers
- answers that sound inferential rather than recall-based
- better behavior when the subject explicitly says it lacks specific knowledge

### 5.3 Contamination often comes from the subject

A blind test is burned if the subject references enrichment contents before the probe.

Watch for:

- subject narrating shard results too early
- subject casually referencing the topic in unrelated replies
- anyone asking leading probe questions that contain the answer

### 5.4 Quiet sessions are better

For blind enrichment, DM or the quietest available surface is preferred.

Group-chat debate adds noise and makes the subject's recall less clean, even if the enrichment technically landed.

---

## 6. What To Monitor For Each Swim 7 Priority

### 6.1 Hot-reload confirmations

For 7-A and 7-B:

- record config before change
- record the exact moment of change
- verify the later fire log reflects the new tolerance
- verify the spawn actually happens

If the timer survives but no spawn happens, that is not a hot-reload pass.

### 6.2 Width widen / narrow

For 7-C and 7-D:

- capture the requested delegate count
- capture tool/runner acceptance count
- separate runner rejections from spawn-gate `forbidden`

Important distinction:

- tool/runner limit failure = continuation behavior
- spawn-gate `forbidden` = concurrency policy / operational ceiling

### 6.3 Bracket subtree boundary

For 7-E:

- capture every spawned task string
- verify `[continuation:chain-hop:2]` appears on the grandchild
- verify the next hop rejection happens at the correct boundary

### 6.4 Tool-only / no-text delegate turn

This is a likely real bug target.

Monitor for:

- no visible assistant text
- no delegate consumption
- no rejection log
- no spawn

If all four line up, capture it as a likely runner early-return defect.

### 6.5 Post-compaction guard coverage

Current branch should already show:

- staged delegates persist when compaction does not happen
- persisted + current-turn delegates release when compaction does happen

Still monitor for guard coverage:

- no chain-length rejection even when chain should already be exhausted
- no cost-cap rejection even when chain token total should already exceed cap

### 6.6 Prompt/tool-choice behavior

For prompt-level swims, monitor whether the SUT:

- prefers `continue_delegate` for delayed/silent/compaction-aware background work
- avoids faking scheduling through `exec`, shell sleep, or manual `openclaw ...`
- keeps the main session free instead of relaying every shard hop itself

This is product-shape evidence, not just scheduler evidence.

---

## 7. Blind Enrichment And Context-Pressure Monitoring

### 7.1 Blind enrichment controls

For enrichment swims, the monitor should ensure:

1. one positive probe exists
2. one negative probe exists
3. the subject was not given hints
4. the subject did not leak content before probe

Useful classifications:

- `RECALL`: subject answers planted detail accurately
- `LOW_CONFIDENCE_ABSENCE`: subject admits it lacks the detail
- `CONFABULATION`: subject gives a plausible but false answer
- `TAINTED`: content leaked before probe

### 7.2 Context-pressure subject-awareness check

When the pressure event fires, record two separate things:

1. did the gateway inject the event?
2. did the subject appear to notice it?

If the event definitely fired and the subject ignored it, that is a behavioral miss, not a delivery miss.

### 7.3 `/new` versus gateway restart

From the subject perspective:

- `/new` wipes conversation memory but does not itself kill already-scheduled gateway timers
- gateway restart kills pending delegate timers

If a post-`/new` return succeeds, that is expected.
If a post-restart return never happens, that is also expected.

---

## 8. Canary Deploy / Restart Procedure

Pick one deployment style and stay consistent during a run.

### 8.1 Systemd-managed subject

If the SUT already runs as a user service:

```bash
ssh silas 'systemctl --user restart openclaw-gateway'
ssh silas 'systemctl --user status openclaw-gateway --no-pager'
```

### 8.2 Ad hoc canary run

If the swim uses a manual canary process:

```bash
ssh silas 'pkill -9 -f openclaw-gateway || true; nohup openclaw gateway run --bind loopback --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &'
```

Do not mix systemd and ad hoc control within the same run without noting it.

### 8.3 Post-restart verification

After any deploy/restart:

```bash
ssh silas 'ss -ltnp | rg 18789'
ssh silas 'tail -n 120 /tmp/openclaw-gateway.log 2>/dev/null || journalctl --user -u openclaw-gateway -n 120 --no-pager'
ssh silas 'openclaw health --json'
ssh silas 'openclaw channels status --probe'
```

---

## 9. Canary Thumbprints For This Branch

Prefer commit SHA first.

If you need feature thumbprints, use current branch markers such as:

```bash
ssh silas 'test -f dist/auto-reply/reply/continuation-runtime.js && echo ok'
ssh silas 'grep -q "maxDelegatesPerTurn" dist/agents/tools/continue-delegate-tool.js && echo ok'
ssh silas 'grep -q "post-compaction" dist/agents/tools/continue-delegate-tool.js && echo ok'
ssh silas 'grep -q "\\[continuation:chain-hop:" dist/auto-reply/reply/agent-runner.js && echo ok'
ssh silas 'grep -q "delegate-return" dist/agents/subagent-announce.js && echo ok'
```

These better reflect the current implementation than the older `continuation-generation` thumbprint idea.

---

## 10. Config Mutation Procedure

Use atomic temp-file writes.

Example:

```bash
ssh silas 'TMP=$(mktemp) && jq ".agents.defaults.continuation.generationGuardTolerance = 3" ~/.openclaw/openclaw.json > "$TMP" && mv "$TMP" ~/.openclaw/openclaw.json'
```

Recommended live mutations for Swim 7:

```bash
# widen fan-out
ssh silas 'TMP=$(mktemp) && jq ".agents.defaults.continuation.maxDelegatesPerTurn = 20" ~/.openclaw/openclaw.json > "$TMP" && mv "$TMP" ~/.openclaw/openclaw.json'
```

```bash
# narrow fan-out
ssh silas 'TMP=$(mktemp) && jq ".agents.defaults.continuation.maxDelegatesPerTurn = 3" ~/.openclaw/openclaw.json > "$TMP" && mv "$TMP" ~/.openclaw/openclaw.json'
```

```bash
# lower chain length
ssh silas 'TMP=$(mktemp) && jq ".agents.defaults.continuation.maxChainLength = 2" ~/.openclaw/openclaw.json > "$TMP" && mv "$TMP" ~/.openclaw/openclaw.json'
```

```bash
# lower cost cap
ssh silas 'TMP=$(mktemp) && jq ".agents.defaults.continuation.costCapTokens = 50000" ~/.openclaw/openclaw.json > "$TMP" && mv "$TMP" ~/.openclaw/openclaw.json'
```

Important current expectations:

- `generationGuardTolerance` hot-reloads
- `maxDelegatesPerTurn` hot-reloads
- `maxChainLength` and `costCapTokens` are read at guard time on the announce path
- delay values already baked into existing timers do not retroactively change

---

## 11. Evidence Package

For each test, save:

1. pre-test config snapshot
2. post-test config snapshot
3. pre-test session-store snapshot
4. post-test session-store snapshot
5. raw log slice
6. one short structured summary
7. mapped finding IDs

Suggested summary:

```markdown
### Swim N Test N-X: [Name]

**Time:** HH:MM-HH:MM
**Build:** [commit]
**Profile:** [shipped-default smoke | fleet/mast-cell]
**Finding IDs:** [P1-drop | P1-postcomp | etc.]
**Result:** [PASS | FAIL | TAINTED]

**Key evidence:**

- [timer fire/cancel line]
- [spawn/reject line]
- [spawned task prefix]
- [session-store delta]
- [artifact path or grep the coordinator can quote later]

**Anomalies:** [none | describe]
```

If a test resolves an existing review finding, say so explicitly in the summary. Do not make the coordinator infer it from raw logs later.

---

## 12. Anomaly Flags

Escalate quickly if you see:

- timer fire with the wrong tolerance after a live config edit
- delegate consumption count inconsistent with requested width
- bracket hop spawned without `[continuation:chain-hop:N]`
- no post-compaction lifecycle event when compaction clearly happened
- raw spawn success but no useful return signal
- queue/lane delays so high that operational behavior masks logic results
- subject leaks enrichment content before the intended probe
- subject answers a negative probe confidently as if it were planted

Also call out when a failure is clearly operational rather than logical.

---

## 13. Guardrails

### Do

- keep raw capture running for the whole swim
- label every config mutation with a timestamp
- distinguish tool/runner rejection from spawn-gate rejection
- note whether the main session stayed free or became a relay bottleneck
- capture whether a blind probe included a negative control

### Do not

- rely on invisible `delegate-pending` state as evidence
- hard-code outdated session-store paths
- conflate width policy with depth policy
- restart mid hot-reload test unless the test is already burned
- accept a leading or contaminated probe as valid evidence
