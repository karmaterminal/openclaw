# #1227 investigation journal

## Dispatch receipt

- Owner: Emeric.
- Worker: Copilot CLI in tmux session `emeric-1227-correlated-ingress`.
- Branch: `codeagent/emeric-1227-correlated-ingress`.
- Frozen start SHA: `733512b612e5fcfa96ca0764ac1851990406f187`.
- Workorder: `.specify/workorders/WO-1227-CORRELATED-INGRESS.md`.
- Tracking issue: <https://github.com/karmaterminal/openclaw/issues/1227>.

## Initial known state

- Prior report-only head `3ed51aa7e253d2012f759400d7b7dfe2526dc7ad` did not change product files or establish a causal duplicate path.
- Focused retry/delivery checks were reported 190/190 passing; the broad run was incomplete at 46/81 shards. Treat these as report claims until independently bound to artifacts.
- The current investigation must distinguish duplicate admission of one source event from a sequence of distinct ambient room-event messages and voluntary `message(send)` calls.

## Checkpoints

Copilot must append timestamped, source-backed checkpoints here and push them to the branch. Do not store secrets or unrelated private message content.

### 2026-08-08T06:20Z - context, issue, and prior report

- Instructions read before edits:
  - root `AGENTS.md`;
  - `.github/instructions/copilot.instructions.md`;
  - `extensions/AGENTS.md`;
  - `src/channels/AGENTS.md`;
  - `src/agents/AGENTS.md`.
- Workorder-referenced `.github/copilot-instructions.md`, `.github/process_bootstrap.xml`, and `extensions/discord/AGENTS.md` are absent in this checkout; parent/root guidance applies.
- Issue `karmaterminal/openclaw#1227` is open with current scope retargeted to source/run/tool correlation, not the earlier empty-response continuation theory.
- Prior report-only receipt `3ed51aa7e253d2012f759400d7b7dfe2526dc7ad` was checked through the GitHub commit API after a broad fetch hung. It modified only `journal-empty-visible-retry.md` and `output.md`; no product files, tests, or causal product byte were changed.

### 2026-08-08T06:45Z - source path map

Durable Discord ingress and idempotency:

- `extensions/discord/src/monitor/ingress.ts` builds the durable source identity from the raw Discord message. `inspectDiscordMessage` returns `eventId: rawMessage.id`, `dedupeKey: rawMessage.id`, and `laneKey: channel:<channel_id>` for message-create ingress.
- `src/channels/message/ingress-queue.ts` owns the durable uniqueness key. `enqueue` inserts by `(queue_name,event_id)` and `on conflict` returns the existing row state rather than creating a second row.
- `src/channels/message/ingress-monitor.ts` admits each durable ingress event, wraps handler lifecycle, marks adopted rows complete, and records handler-timeout failures when adoption stalls.

Classification and session identity:

- `extensions/discord/src/monitor/message-handler.preflight.ts:679` calls `classifyChannelInboundEvent(...)`.
- `src/channels/inbound-event/classification.ts:26` classifies unmentioned group/channel events as `room_event` when the configured unmentioned group policy is `room_event`; mentions, native commands, control commands, aborts, and direct messages remain `user_request`.
- `extensions/discord/src/monitor/message-handler.context.ts:363` builds the finalized inbound context and sets `messageId: canonicalMessageId ?? message.id`; that becomes `ctxPayload.MessageSid`.

Post-dispatch warning gap:

- `extensions/discord/src/monitor/message-handler.process.ts:611` calls `dispatchChannelInboundTurn(...)` with `ctxPayload` but without the optional prepared-turn `messageId`.
- `src/channels/turn/execution.ts:84` emits `visible channel turn dispatched with no queued reply payloads`; before this candidate it logged `params.messageId ?? "unknown"` and emitted a warning event with `messageId: params.messageId`.
- Therefore the selected Discord path has the source ID in finalized context (`MessageSid`) but the warning owner drops it unless a caller redundantly passes `messageId`.

### 2026-08-08T07:20Z - fleet evidence sources and onset/rate

Read-only SSH aliases enumerated from local config/known hosts: `elliott`, `silas`, `cael`, `ronan`, `emeric`, `rune`.

Runtime process/build receipts:

- Gateway processes are running from `flesh_beast_tmp/openclaw/dist/index.js gateway --port 18789` on the available seats. Startup logs did not contain a runtime build-info/version/SHA marker when scanned for `openclaw/gateway version|commit|sha|build`.
- Runtime checkout HEADs at the running path, where it is a git checkout:
  - `elliott`: `7e0b29299b7ed1fdcfd091d5a39d45496b60d93a` (`2026-08-04T05:53:09-07:00`, `fix(memory): bound source-wide embedding requests`);
  - `silas`: `f01e2fbf09130103592c948ef7eef6b39a1e5a88` (`2026-07-22T18:42:20-07:00`, `merge: absorb upstream through 7d159fdc for #1172`);
  - `cael`: no git metadata at the running path;
  - `ronan`: `03939273216bc0c08a2df2d768f2f8d6549ca1f2` (`2026-08-06T02:36:49-07:00`, `fix(i18n): leave native locale generation to automation`);
  - `emeric`: `55b6176d43022b27fe0ced575140c4e8cd4bd444` (`2026-07-23T08:17:37-07:00`, `fix(state): keep current sqlite maintenance preflight read-only`);
  - `rune`: `55b6176d43022b27fe0ced575140c4e8cd4bd444`.

Loki receipts:

- Loki endpoint used: `http://loki.dandelion.cult/loki/api/v1/query_range`.
- Earliest retained `visible channel turn dispatched with no queued reply payloads` warning found in retention: `2026-08-01T05:05:09Z`, target channel session key, `messageId=unknown`.
- Query window `2026-08-07T00:00:00Z..2026-08-08T06:00:00Z`, filter `visible channel turn dispatched with no queued reply payloads`, target session key: 9560 warnings total. Per-seat counts: `cael=813`, `elliott=1679`, `emeric=2270`, `ronan=789`, `rune=2220`, `silas=1789`.
- Emeric's hourly count changed sharply after `2026-08-08T00:00Z`: by hour through 05:00Z, `112, 565, 551, 477, 317, 232`.

### 2026-08-08T07:55Z - selected trace ledger

Selected seat/session: `silas`, `agent:main:discord:channel:1466192485440164011`, latest session row `c6acb69a-4241-4ec1-a307-494802919887`.

Durable ingress rows, queried from each seat's `state/openclaw.sqlite` with:

```sql
SELECT event_id, count(*) AS rows, group_concat(status) AS statuses,
       min(datetime(received_at/1000,'unixepoch')) AS first_received_utc,
       max(datetime(completed_at/1000,'unixepoch')) AS last_completed_utc
FROM channel_ingress_events
WHERE channel_id='discord'
  AND account_id='default'
  AND lane_key='channel:1466192485440164011'
  AND event_id IN ('1535523242490601552','1535523310480400484')
GROUP BY event_id;
```

Result summary:

| Seat    | `1535523242490601552`                                         | `1535523310480400484`                                         |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| elliott | 1 row, pending, received `2026-08-08 05:41:10Z`               | 1 row, pending, received `2026-08-08 05:41:26Z`               |
| silas   | 1 row, completed, received `05:41:09Z`, completed `05:41:13Z` | 1 row, completed, received `05:41:25Z`, completed `05:41:29Z` |
| cael    | 1 row, completed, received `05:41:09Z`, completed `05:41:14Z` | 1 row, completed, received `05:41:25Z`, completed `05:41:25Z` |
| ronan   | 1 row, completed, received `05:41:09Z`, completed `05:41:13Z` | 1 row, completed, received `05:41:25Z`, completed `05:41:29Z` |
| emeric  | 1 row, pending, received `05:41:09Z`                          | 1 row, pending, received `05:41:25Z`                          |
| rune    | 1 row, completed, received `05:41:09Z`, completed `05:41:28Z` | 1 row, completed, received `05:41:25Z`, completed `05:41:47Z` |

Pending-row raw fields, read only from `elliott` for `1535523310480400484` because completed tombstones scrub payload:

| Field                               | Value                      |
| ----------------------------------- | -------------------------- |
| `event_id` / raw Discord message ID | `1535523310480400484`      |
| channel                             | `1466192485440164011`      |
| author                              | `1475311338879189142`      |
| author bot                          | `true`                     |
| raw type                            | `0`                        |
| received                            | `2026-08-08 05:41:26.369Z` |

Silas session metadata, queried from `agents/main/agent/openclaw-agent.sqlite` without printing message body:

| UTC        | Evidence                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `05:41:09` | durable ingress event `1535523242490601552` received once; author `1508324617444655225`, bot.                                                                                                                                                                                   |
| `05:41:13` | durable row `1535523242490601552` completed once. Transcript rows `22036` and `22037` both carry transport `messageId=1535523242490601552`, same idempotency key `channel-user:v1:6a3b...aba5`, parent `772c6029`.                                                              |
| `05:41:14` | trajectory run `7c829079-84a0-4744-b6f7-4d0ba1c04d53` starts.                                                                                                                                                                                                                   |
| `05:41:15` | Loki: `[agent/embedded] Merged and removed orphaned user message to prevent consecutive user turns. runId=7c829079-84a0-4744-b6f7-4d0ba1c04d53 sessionId=c6acb69a-4241-4ec1-a307-494802919887 trigger=user`.                                                                    |
| `05:41:19` | trajectory run `7c829079-84a0-4744-b6f7-4d0ba1c04d53` model completes and session ends. Loki zero-count warning on `silas`: `messageId=unknown sessionKey=agent:main:discord:channel:1466192485440164011`. No `conversation_deliveries` row in this window for the session key. |
| `05:41:25` | durable ingress event `1535523310480400484` received once; author `1475311338879189142`, bot. This is a distinct Discord source message from `1535523242490601552`.                                                                                                             |
| `05:41:29` | durable row `1535523310480400484` completed once. Transcript rows `22038` and `22039` both carry transport `messageId=1535523310480400484`, same idempotency key `channel-user:v1:f096...bf6`, parent `75c9b887`.                                                               |
| `05:41:30` | trajectory run `3727b36e-affd-42c5-a21b-5b598ea17fab` starts.                                                                                                                                                                                                                   |
| `05:41:31` | Loki: `[agent/embedded] Merged and removed orphaned user message to prevent consecutive user turns. runId=3727b36e-affd-42c5-a21b-5b598ea17fab sessionId=c6acb69a-4241-4ec1-a307-494802919887 trigger=user`.                                                                    |
| `05:41:34` | trajectory run `3727b36e-affd-42c5-a21b-5b598ea17fab` model completes and session ends. Loki zero-count warning on `silas`: `messageId=unknown sessionKey=agent:main:discord:channel:1466192485440164011`. No `conversation_deliveries` row in this window for the session key. |

Adjacent Loki warning window `2026-08-08T05:41:00Z..05:42:10Z`, filter target session key:

- `ronan`: warnings at `05:41:18.512Z`, `05:41:33.465Z`;
- `silas`: warnings at `05:41:19.273Z`, `05:41:34.401Z`;
- `emeric`: warnings at `05:41:26.589Z`, `05:41:32.260Z`;
- `rune`: warnings at `05:41:28.443Z`, `05:41:47.877Z`.

Literal outbound-marker Loki filters in the same window for `message(send)`, `Discord delivery`, `deliverDiscord`, `message-sent`, `sent message`, and `tool call` returned zero lines. The agent DB `conversation_deliveries` query for the selected silas session key and `05:41:00Z..05:42:30Z` also returned zero rows.

### 2026-08-08T08:10Z - verdict and candidate shape

Classification for the selected transition: **new, distinct Discord message admitted normally, with post-dispatch source identity missing from the zero-count warning**.

Evidence backing:

- No selected seat has more than one durable `channel_ingress_events` row for either selected source ID. On `silas`, each source ID was received once and completed once.
- `1535523242490601552` and `1535523310480400484` are different raw Discord source message IDs, have different bot authors, and have different transcript idempotency keys.
- The selected `silas` runs were separate run IDs, each with its own orphan-merge log and terminal zero-count warning.
- No outbound delivery receipt or `conversation_deliveries` row was found in the selected window, so this trace does not prove same-run retry/continuation after committed delivery.
- The exact blocker for tying current warning text directly back to the source ID is the warning owner's use of only `PreparedChannelTurn.messageId`, while the Discord path carries the ID in `ctxPayload.MessageSid` and does not pass `messageId` at `dispatchChannelInboundTurn(...)`.

Smallest supported change:

- Observability-only repair in `src/channels/turn/execution.ts`: zero-count warnings now resolve `messageId` from `params.messageId ?? params.ctxPayload.MessageSid ?? params.ctxPayload.MessageSidFull`, and the emitted `ChannelTurnLogEvent` uses the same resolved value.
- Focused regression in `src/channels/turn/kernel.test.ts`: a prepared turn with no explicit `messageId` but with finalized `ctxPayload.MessageSid` now emits the zero-count warning event with that source ID.

This candidate does **not** suppress bot messages, change admission, change orphan repair, or claim to fix duplicate delivery.

### 2026-08-08T08:35Z - validation and LOC

Validation commands and results:

| Command                                                                                                                                                           | Result                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/run-vitest.mjs run --execArgv=--no-opt src/channels/turn/kernel.test.ts -t "uses the finalized inbound context message id for zero-count warnings"` | pass: 1 test passed, 61 skipped.                                                                                                                                                                      |
| `pnpm format src/channels/turn/execution.ts src/channels/turn/kernel.test.ts JOURNAL-1227.md`                                                                     | pass.                                                                                                                                                                                                 |
| `git diff --check`                                                                                                                                                | pass.                                                                                                                                                                                                 |
| `node scripts/run-oxlint.mjs --tsconfig tsconfig.json src/channels/turn/execution.ts src/channels/turn/kernel.test.ts`                                            | pass.                                                                                                                                                                                                 |
| `node scripts/check-changed.mjs --dry-run -- src/channels/turn/execution.ts src/channels/turn/kernel.test.ts JOURNAL-1227.md`                                     | pass; classified lanes as `core`, `coreTests`, and `docs`; targeted type/lint plan included `pnpm tsgo:core`, `pnpm tsgo:core:test`, and core oxlint.                                                 |
| `pnpm tsgo:core`                                                                                                                                                  | pass.                                                                                                                                                                                                 |
| `pnpm tsgo:core:test && node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.core.json src/channels/turn/execution.ts src/channels/turn/kernel.test.ts`  | first attempt failed because `@openclaw/session-url-contract/parse` was missing from linked `node_modules`; per repo guidance, dependencies were installed and the command was retried. Retry passed. |
| `pnpm install`                                                                                                                                                    | failed with pnpm `EXDEV` while importing packages from a cross-device store.                                                                                                                          |
| `pnpm install --package-import-method=copy`                                                                                                                       | pass; lockfile unchanged.                                                                                                                                                                             |
| `node scripts/run-vitest.mjs run --execArgv=--no-opt src/channels/turn/kernel.test.ts`                                                                            | failed before tests: Vitest worker threads rejected `--no-opt` in `execArgv` with `ERR_WORKER_INVALID_EXEC_ARGV`.                                                                                     |
| `node --no-opt scripts/run-vitest.mjs run src/channels/turn/kernel.test.ts`                                                                                       | pass: 62 tests passed. This uses the no-opt Node binary path without putting `--no-opt` in `NODE_OPTIONS` or worker `execArgv`.                                                                       |

Diff size from `git diff --numstat` before commit:

| Surface                            | Added | Removed | Notes                                                                                                                  |
| ---------------------------------- | ----: | ------: | ---------------------------------------------------------------------------------------------------------------------- |
| `src/channels/turn/execution.ts`   |     6 |       5 | Production delta `+1`, justified as observability ownership: use the already-finalized source ID at the warning owner. |
| `src/channels/turn/kernel.test.ts` |    36 |       0 | Focused regression.                                                                                                    |
| `JOURNAL-1227.md`                  |   165 |       0 | Required evidence journal.                                                                                             |

Final recommendation: **observability-only candidate**. The selected trace does not prove duplicate admission or same-run retry after committed delivery; it proves distinct Discord source messages plus a missing source identity at the post-dispatch zero-count warning.
