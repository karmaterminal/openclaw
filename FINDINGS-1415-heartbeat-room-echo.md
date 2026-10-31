# 1415: Heartbeat room-session echo trace

## Named refs

| Category         | Ref                                        | Full SHA                                                     | Local/tracking/server equality                                                              |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Product/base     | `frond/1415-room-collect-base`             | `22f49a43a118f86dfd8c95dd5b2850420aa8bcad`                   | HEAD, local lane branch, and `origin/frond/1415-room-collect-base` all resolve to this SHA. |
| Lane/safe branch | `codeagent/1415-heartbeat-room-echo-trace` | `22f49a43a118f86dfd8c95dd5b2850420aa8bcad`                   | Local lane branch and origin lane branch published equal before evidence credit.            |
| CI/workflow      | N/A (read-only trace)                      | N/A                                                          | N/A                                                                                         |
| Presentation     | N/A (read-only trace)                      | N/A                                                          | N/A                                                                                         |
| Docs/proof       | This findings file                         | Will be recorded by the findings-file commit SHA after push. | No source, seat, DB, journal, or test mutation.                                             |

Upstream comparison ref supplied by the workorder: U12 `b8b054c13ae859b9ab14d31c5fec90078141e327`. Against the composite, affected upstream flux is in Discord room-history watermarking, cron session execution, and reply normalization; room-session heartbeat execution itself is ordinary automation/session execution rather than the retired heartbeat implementation.

## Timeline reconciled from the evidence

**Traced facts**

1. At `14:00:07Z`, figs supplied the breakfast prompt in Discord channel `1466192485440164011`.
2. At `14:05:25Z`, the room turn answered. 🌊 attributes Discord message `1566092412735193149` (`#1566091324489207910`) to the `07:05 heartbeat-main` run.
3. 🩸 reports that the same room turn answered at `14:05:27Z`, while `#1566091484392849433` was the `07:05 heartbeat-main` result; the run receipt records the same breakfast text as delivered at `07:08` local.
4. The room delivery occurred at approximately `14:07:48Z`.
5. 🌊's journal places room-session work near the heartbeat between `14:07:02Z` and `14:07:48Z`; the last work is the plain-text payload at `14:07:46–48Z` (`eb56cb24`).

**Inferred reconciliation**

- The heartbeat was scheduled for the `07:05` local occurrence, which is approximately `14:05Z`, but delivery was not completed until `14:07:48Z`.
- The room answer at `14:05:25–27Z` and the heartbeat run belong to the same persisted room session. The ordinary session queue can serialize them, so this evidence does not establish a context snapshot before either answer committed; it establishes only that the later heartbeat turn produced and delivered the same prompt-answer class.
- The exact run snapshot time relative to `14:05:25Z` is **not recoverable from the supplied receipts**. The supplied receipt columns do not include context snapshot/admission/commit fields, and no live DB/journal access is authorized by this workorder.

## Traced path

### 1. Context source: persisted room transcript, not the Discord watermark

**Traced**

- A cron job with `sessionTarget: "session:<room-key>"` resolves that exact session key (`src/cron/session-target.ts:23-29`) and `runCronSessionTurn` dispatches it through the ordinary session event handoff (`src/cron/session-run.ts:31-192`).
- The session event handler captures the target session, claims occurrences for that session, and dispatches an ordinary `MsgContext` with `SessionKey` and a prepared prompt (`src/auto-reply/reply/session-event-handoff.ts:68-180`, especially `480-620`; `src/auto-reply/reply/session-event-context.ts:39-99`).
- Custom-session turns use the existing session's saved conversation history (`docs/automation/cron-jobs/payloads.md:488-492`).
- The Discord room-history watermark is a separate in-memory `(agent session, channel)` mechanism used only while Discord renders and dispatches room events. It marks entries for the triggering Discord turn and advances only on completed room-turn outcomes (`extensions/discord/src/monitor/room-history-watermark.ts:68-118`; `message-handler.context.ts:440-445`; `message-handler.process.ts:606-608`).

**Conclusion**

- The heartbeat sees the room session's persisted/transcript context and ordinary scheduled prompt plus automation guidance. It does not consult or advance the Discord per-agent-room-watermark state merely by running. Therefore the room prompt can be present in the heartbeat's model history because the room turn's answer committed to the same transcript, even though the room-turn watermark never marked that history for the heartbeat.

This is distinct from "unseen Discord history" injection: the watermark mechanism and the heartbeat prompt builder are separate. The heartbeat receives session history through the ordinary session model path, while the Discord marker applies only to room-event prompt history rendering.

### 2. Serialization and snapshot race

**Traced**

- Custom/session-target automation explicitly enters the session's ordinary turn queue and waits for active work before preparing context (`docs/automation/cron-jobs/payloads.md:488-488`).
- `runCronSessionTurn` claims `claimSystemEventTurn` for the resolved session queue before asynchronous dispatch (`src/cron/session-run.ts:143-192`; `src/infra/system-events.ts:329-360`).
- Session events are admitted as followups with `queueModeOverride: "followup"` on the ordinary session lane (`src/auto-reply/reply/session-event-handoff.ts:557-566`).
- The agent runner's scheduled/session turn uses `CommandLane.CronNested` for its run lane when scheduled automation/internal-event execution is present (`src/auto-reply/reply/agent-runner-fallback-candidate.ts:118-120`), while the producer still waits for that event turn to settle.

**Verdict**

- There is no code evidence that two turns on the same persisted room session were permitted to snapshot concurrently and commit independently. A custom-session heartbeat should wait behind active room-session work before context preparation. The evidence's later journal interval is consistent with this serialization.
- A race where both reads happened before either answer committed would require the product snapshot/admission facts not present in the current code/evidence path. It is not supported by the supplied receipt or journal alone; the exact snapshot order remains an **exact remaining unknown**. The workorder's live DB/journal access restriction prevents resolving that timing from a run receipt that has no snapshot field.

### 3. Delivery and duplicate suppression

**Traced**

- `delivery.mode=announce` with an explicit Discord channel/target resolves the room route and allows the ordinary final reply to be delivered there (`src/cron/session-run.ts:35-100`; `src/cron/session-target.ts:78-86`; `src/cron/isolated-agent/run-finalize.ts:310-410`).
- Normal automation final text is the deliverable; `NO_REPLY`, explicit silence, and `HEARTBEAT_OK` acknowledgement handling suppress text-only delivery (`src/auto-reply/reply/normalize-reply.ts:85-105`; `src/auto-reply/heartbeat.ts:95-155`; `src/agents/agent-run-terminal-reply.ts:1-75`).
- The Direct/announce owner normalizes visible payloads and sends the final payload(s) to the destination (`src/cron/delivery.ts:40-118`).
- Doctor migration explicitly records that the old heartbeat-specific duplicate suppression and no-route skipping were removed: repeated updates can be delivered, and a missing route no longer skips the run (`src/commands/doctor-heartbeat-retirement.ts:203-214`).
- There is no prompt-transcript dedupe at the room-session heartbeat delivery boundary. The duplicate check absent is semantic: whether a final text repeats a prompt already answered by another turn.

**Verdict**

- The whole substantive final text is announced. A final consisting only of an acknowledged heartbeat silence or `NO_REPLY` would be suppressed. A substantive breakfast answer is not a heartbeat acknowledgement, so it has no generic duplicate suppression and is delivered to the room.

### 4. Intent and owning boundary

**Traced**

- Doctor's legacy heartbeat migration chooses `session:<resolved session key>` when legacy `isolatedSession` is false, and `isolated` when it is true (`src/commands/doctor-heartbeat-cadence-migration.ts:148-174`).
- `resolveLegacyHeartbeatSessionKey` canonicalizes a configured room key when it is a valid non-main, non-subagent session for the agent; otherwise it falls back to that agent's main session (`src/commands/doctor-heartbeat-session.ts:19-109`).
- The migration preserves the legacy heartbeat target/delivery configuration as ordinary announce delivery, and explicitly notes the retirement of heartbeat-specific duplicate suppression (`src/commands/doctor-heartbeat-retirement.ts:203-214`).
- Current automation documentation says custom-session agent turns intentionally retain context and are suited for recurring work that builds on prior summaries, while main/current/isolated sessions differ in explicit ways (`docs/automation/cron-jobs/payloads.md:478-492`).

**Intent verdict**

- Upstream intends a legacy heartbeat session choice to be honored as an ordinary persisted automation context. It does not provide evidence that a Discord channel room is universally the intended heartbeat target; Doctor does migrate a legacy non-isolated choice to its resolved session key. For this live job, binding `heartbeat-main` to the room session is therefore a configuration choice that produces room-history context and room announce delivery.
- The room session is a poor default for an unattended heartbeat that also announces outward: the session transcript is shared with visible conversation turns, no heartbeat-work dedupe exists after migration, and an ordinary substantive answer can be reposted.

## Root cause

**Traced root cause**

`heartbeat-main` is both bound to the shared room session and configured with `delivery.mode=announce` to that room. Doctor converted the legacy heartbeat into an ordinary agent-turn automation; the current code uses custom-session transcript history, waits on the room session lane, and delivers substantive visible finals. A substantive answer is therefore allowed as a second room message after the room turn has already answered. Heartbeat-specific duplicate suppression and acknowledgement-only behavior are not equivalent: acknowledging no new work suppresses text, but repeating an already-answered prompt is not recognized as duplicate.

**Exact remaining unknown**

- The supplied run receipt cannot establish the exact 14:05Z context snapshot time or whether it was prepared before the room turn committed at `14:05:25–27Z`.
- That timing is not needed to explain the observed delivered duplicate if the serialized turn ran after the room answer; however, the authority to claim that ordering from live state is limited without snapshot/admission evidence.

## Owning boundary and config-only remedy

### Fix boundary

- Transcript/context ownership: `src/cron/session-run.ts`, `src/auto-reply/reply/session-event-handoff.ts`, and the custom-session runner own which transcript context an automation sees and serialize it with room turns.
- Duplicate/heartbeat semantics: the automation reply finalization/delivery owner owns silence versus substantive duplicate delivery (`src/auto-reply/reply/normalize-reply.ts`, `src/cron/isolated-agent/run-finalize.ts`, `src/cron/delivery.ts`). A fix would need a prompt/turn provenance key owned at the shared room/session boundary, not Discord message text matching in channel transport.
- Migration/intent boundary: `src/commands/doctor-heartbeat-cadence-migration.ts` and `src/commands/doctor-heartbeat-session.ts` own how legacy heartbeat target/session settings become automation jobs. Implicit room-key migration and later unattended delivery policy need to be explicit.

The existing Codebase instruction that a fix must prove the exact owner/composition boundary also prevents fixing this by adding a Discord-only filter: Discord does not own heartbeat scheduling or the persisted session transcript.

### Config-only remedy available to princes

Because this lane makes no seat/config changes:

1. Prefer disabling `heartbeat-main` for a prince who does not want recurring room-room wakeups.
2. If the heartbeat remains enabled, configure it on `main` or an isolated session rather than the Discord room session, and set delivery explicitly to `none`, or to the intended room only when substantive heartbeat alerts are desired.
3. Rune's heartbeat remains disabled and is out of scope.

## RED test (required invariant; not run in this lane)

Add a production-composition test that:

1. Creates one Discord room prompt with message ID/turn timestamp `Q`, and runs the real room turn on the room session until it commits a visible answer `A`.
2. Starts a real cron `agentTurn` with `sessionTarget: session:<room-key>`, `wakeMode: now`, and `delivery.mode=announce`/the same room target.
3. Verifies the heartbeat run enters the same session queue only after the room turn settles.
4. Verifies one heartbeat prompt contains the persisted answer context but the heartbeat production final does **not** announce another answer for prompt `Q`.
5. Covers nearest siblings:
   - `HEARTBEAT_OK` / `NO_REPLY` produces zero delivery;
   - a genuinely new substantive heartbeat alert does produce one delivery;
   - delivery retries do not create duplicate room sends;
   - restart/recovery does not replay the completed heartbeat delivery.

**RED assertion**

```text
After Q is answered by the room turn, running the same room-session heartbeat
must result in no second room delivery for Q. Existing room answer A may remain
in transcript history.
```

This test must fail deterministically on the rejected SHA when a substantive final for Q is delivered, and pass only when the duplicate is suppressed while preserving legitimate new alerts and exact-once delivery.
