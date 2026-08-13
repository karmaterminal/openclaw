# Fleet Discord replay / cross-seat echo — read-only forensic diagnosis

Lane: `codeagent/fleet-discord-replay-cross-seat-echo-diagnosis`
Snapshot taken: 2026-08-12 18:55:02 PDT (2026-08-13 01:55:02 UTC)
Proof host: `main` / "the dandelion cult - silas" (Silas 🌫️), state dir `~/.openclaw`

## 0. Verdict

**Multiple confirmed bugs, separated — plus one expected-behaviour finding, plus a
falsified fix narrative.**

| #   | Finding                                                                              | Class                                                             | Owner                                                            |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| A   | Discord stale-ambient freshness fence is structurally inert on real gateway payloads | **Confirmed product bug**                                         | fork (`extensions/discord`), shipped in open upstream PR #121204 |
| B   | Claim→adoption guillotine destroys inbound messages, bypassing the retry policy      | **Confirmed product bug**                                         | upstream (`src/channels/message/ingress-drain.ts`)               |
| C   | Strictly serial per-lane dispatch cannot keep up with a busy shared channel          | **Confirmed design defect**                                       | upstream (durable ingress drain engine)                          |
| D   | Cross-seat echo (Ronan emitting Rune's words)                                        | **Expected shared-channel input + model copy**, _caused by_ A/B/C | not an identity/routing defect                                   |
| E   | Composite HEAD `310252` / upstream PR #122466 misdiagnoses its own evidence          | **Falsified fix narrative**                                       | this fork                                                        |

The cross-seat echo is **not** an OpenClaw identity, routing, session or body-substitution
defect. It is a model copy — but it was _produced by_ the replay defects, which handed a
17-minute-stale message carrying an instruction addressed to a different prince to Ronan as
his current turn.

---

## 1. Substrate reality check — the composite is not what ran

The workorder names fleet composite `310252733a626568c98071bdaf9ee09dbdf38a88`. That is **not
the code that produced these bytes.**

| Fact                                     | Value                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Live gateway process                     | pid `605848`, `node --no-opt /home/figs/flesh_beast_tmp/openclaw/dist/index.js gateway --port 18789`     |
| Deployed checkout HEAD                   | `2e72b665229bac6c41388d10a6b979b86750211b` (detached), branch `frond-build/20260810/c868194-emeric-1229` |
| Deployed bundle build time               | 2026-08-09 22:41–22:43 PDT (all of `dist/*.js`)                                                          |
| `package.json` version                   | `2026.8.1`; `OPENCLAW_SERVICE_VERSION=2026.7.2`                                                          |
| Composite `310252733a6` in deployed repo | **absent** — `git cat-file -t` fails, "could not get object info"                                        |
| State dir                                | `$HOME/.openclaw` (no `OPENCLAW_STATE_DIR` override in `/proc/605848/environ`)                           |

**Consequence:** the workorder question "did any known #1229/#121204/#122466 code apply on
composite `310252`?" must be answered twice — once for the composite (source of record) and
once for `2e72b66` (what actually ran). Both answers are below, and for the defects that
matter they are the same.

---

## 2. Method and read-only discipline

- State DB read through `sqlite3 'file:...?mode=ro'` and an immutable page-level snapshot
  (`.backup` → `/tmp/fdx-forensics/state-snap.sqlite`, `quick_check=ok`). The live
  `~/.openclaw/state/openclaw.sqlite` was never opened writable.
- Agent DB `agents/main/agent/openclaw-agent.sqlite` opened `mode=ro` only.
- No gateway restarted, no session altered, no config or SQLite written, no GitHub item
  mutated, no Discord product message sent. GitHub reads were `gh api` GETs only.
- No prince sovereign/memory prose was read. `~/.openclaw/memory`, agent memory dirs and
  identity dirs were not opened. Shared-channel message bodies were read as operational
  evidence and are quoted only where the forensic determination requires the exact bytes.
- **Disclosed gap:** no GitNexus index exists for this worktree (`gitnexus` binary present on
  PATH, no `.gitnexus` directory, no registry entry). All code claims below come from direct
  source reads of the deployed tree, the composite tree, `upstream/main`, and the PR heads.

---

## 3. The stale-replay pathogen — exact timeline

All rows from `channel_ingress_events`, lane `channel:1466192485440164011`
(session key `agent:main:discord:channel:1466192485440164011`, session id
`c6acb69a-4241-4ec1-a307-494802919887`).

| PDT (2026-08-12) | Event                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10:13:26         | Gateway boot `d3096359…`, pid `470459`. **Last boot before the incident.**                                                                                                                                                                                                                                    |
| 11:03:47         | `agent.run.finished` **status=failed, error_code=run_failed** for run `cfab5720-60cf-44ce-9981-b7ed221bc19c` on session `c6acb69a`. Audit `sequence=90913`, `event_id=31e904ee-bc9c-48ff-a62b-753c0e3cfbf6`, `occurred_at=1786557827789`.                                                                     |
| 11:03:47 → 18:04 | **Zero completions on the lane. Exactly 12 `handler-timeout` dead-letters per hour** (one per 5 min), `attempts=0`, `last_attempt_at=NULL`, `last_error="Channel ingress claim→adoption stalled … marking failed (handler-timeout)."` ≈ 84 Discord messages claimed, never delivered to the agent, destroyed. |
| (same window)    | Agent was **not** wedged: `agent:main:main` heartbeat runs started _and_ finished 2/hour throughout (config `heartbeat.every=30m`). The wedge is scoped to one session key.                                                                                                                                   |
| 16:31:23         | Rune posts `1537242124792234125` (the text later echoed). Ingress row: `status=pending`, `attempts=0`.                                                                                                                                                                                                        |
| 16:48:50         | Ronan emits the echo `1537246515561627678`. Ingress row: `status=pending`, `attempts=0`.                                                                                                                                                                                                                      |
| ~17:30           | figs observes the stale pre-surgery authorization replay (matches Emeric's in-channel notes at 23:49:48Z "Stale state, roo'neh" and 23:50:01Z "Second stale-backlog emission").                                                                                                                               |
| 18:15:28         | Gateway restart, pid `605848`, boot `09d90e3d…` (`started_at_ms=1786583731094`).                                                                                                                                                                                                                              |
| 18:17:48         | **First completions in 6h29m.** 42 completions 18:15–18:46, each with receipt→completion lag **20,236–21,183 s (≈5.7 h)**. This is the stale replay: hours-old messages dispatched to the model as current work.                                                                                              |
| 18:51:47         | Oldest backlog row `1537189533777530951` (received 13:02:24) re-claimed by `claim_owner=605848:9895536:879cf29a-4737-49ce-9b0d-087b4723cfa5`, `attempts=0` — still unadopted at snapshot.                                                                                                                     |
| 18:55:02         | Snapshot: **626 pending + 1 claimed**, oldest pending received 13:02:50 PDT. Still draining ≈1/min → hours of further replay queued. **Live and ongoing.**                                                                                                                                                    |

### 3.1 This is chronic, not a one-off

Completion lag by drain episode (receipt→completion, lane `1466192485440164011`):

```
2026-08-11 19:00 PDT   lag 82,803 – 86,005 s   (23.0 – 23.9 hours)
2026-08-11 22:07 PDT   operator hand-drops 1,452 events (failed_reason=operator-drop-stale-backlog,
                       all at failed_at=1786511236000; cf. state/openclaw.sqlite.pre-backlog-drop-1786511217)
2026-08-12 11:13 PDT   lag  2,886 –  4,795 s   (48 – 80 min, climbing monotonically)
2026-08-12 11:48 PDT   last completion before the 6h29m blackout
2026-08-12 18:15 PDT   lag 20,236 – 21,183 s   (5.6 – 5.9 hours)
```

Independent corroboration from pure Discord bytes — per-author reply lag computed as
`message.timestamp − referenced_message.timestamp` over 396 reply pairs since 12:00 PDT:

| author     | n   | median                | p90      | max                    |
| ---------- | --- | --------------------- | -------- | ---------------------- |
| Silas 🌫    | 19  | **21,084 s (5.86 h)** | 21,222 s | 21,269 s               |
| Rune 🪨    | 192 | 96 s                  | 371 s    | 21,223 s (5.9 h)       |
| Elliott 🌻 | 172 | 145 s                 | 1,532 s  | **197,760 s (54.9 h)** |
| Emeric 🕯   | 13  | 437 s                 | 853 s    | 918 s                  |

Silas's _median_ reply is to a message from 5.9 hours ago. Elliott has answered a 2.3-day-old
message. **The replay pathology is fleet-wide, not host-local.**

---

## 4. Defect A — the freshness fence is dead code on real Discord payloads

**Owner boundary:** `extensions/discord/src/monitor/ingress.ts:261-303`,
`canExpireDiscordStaleAmbientBacklog()`.

The pending-disposition fence at `ingress.ts:473-512` suppresses a stale ambient backlog row
only if every gate passes. The final gate is:

```ts
const channelInfo = resolveDiscordChannelInfoSafe((rawMessage as { channel?: unknown }).channel);
...
const rawNonThreadChannel =
  typeof channelInfo.type === "number" && !isDiscordThreadChannelType(channelInfo.type);
return rawNonThreadChannel;
```

`resolveDiscordChannelInfoSafe` (`extensions/discord/src/monitor/channel-access.ts:93-103`)
derives `type` from `channel.type` via `readDiscordChannelPropertySafe`, which returns
`undefined` for a falsy channel.

**Discord's `MESSAGE_CREATE` gateway payload does not contain a `channel` object.** Proof from
the persisted bytes on this seat — 400 consecutive stored payloads from the affected lane:

```
payloads examined:                      400
rawMessage has 'channel' object:          0
rawMessage 'channel_type' values:  {0: 400}   # 0 == ChannelType.GuildText
top-level rawMessage keys: application_id, attachments, author, channel_id, channel_type,
  components, content, edited_timestamp, embeds, flags, guild_id, id, interaction,
  interaction_metadata, member, mention_everyone, mention_roles, mentions, message_reference,
  nonce, pinned, referenced_message, timestamp, tts, type, webhook_id
```

So `channelInfo.type` is always `undefined` → `rawNonThreadChannel` is always `false` →
`canExpireDiscordStaleAmbientBacklog` always returns `false` → `resolvePendingDisposition`
always returns `null` → **nothing is ever suppressed.**

The fence _is_ evaluated: `ingress-drain.ts:663-672` calls `applyIngressPendingDispositions`
with `queue.listPending({ limit: "all" })` on **every drain pass**. It ran against all 626
pending rows repeatedly and declined every one.

**Empirical confirmation:** `failed_reason` histogram over the entire table (8,028 events, all
lanes, all time, including a 24-hour backlog):

```
operator-drop-stale-backlog  1452
handler-timeout               949
stale-ambient-backlog           0     <-- has never fired, ever
retry-limit-exceeded            0
```

### 4.1 The test proves the mock

`extensions/discord/src/monitor/ingress.test.ts` ("suppresses stale ambient guild backlog
before dispatching a fresh bot mention") builds its stale message with:

```ts
const stale = createRawMessage("1006", "channel-1", {
  guild_id: "guild-1",
  channel: guildTextChannel("channel-1"), // { id, type: ChannelType.GuildText }
  timestamp: new Date(now - 16 * 60 * 1_000).toISOString(),
});
```

The fixture injects the `channel` object that the real gateway never sends. The test passes;
production is inert. This is exactly the failure mode the root `AGENTS.md` names: _"Coverage
behind mocks proves the mocks; one test through the real transport/dispatch seam outranks many
stub-backed branch tests."_

The fix is one field away: Discord **does** send `channel_type` (`0` = GuildText) on every one
of the 400 payloads, and `channel_type` is currently read nowhere in the ingress path.

### 4.2 Second hole — addressed messages are exempt at any age

`ingress.ts:473-477`:

```ts
resolvePendingDisposition: async (record, context) => {
  const rawMessage = record.payload.rawMessage;
  if (isDiscordAddressedMessage(rawMessage, params.botUserId)) {
    return null;                       // addressed => never freshness-fenced, at any age
  }
```

`isDiscordAddressedMessage` (`ingress.ts:229-245`) also returns `true` whenever `botUserId` is
absent. So even with A fixed, a directly-addressed message is replayed at 24 hours old with no
age marker, no suppression, and no operator-visible notice. That is the class that produced the
17:30 PDT stale pre-surgery authorization.

**Answer to the workorder question "were addressed/current-message freshness checks present and
effective?" — present, and never effective: structurally inert for ambient, exempt by design for
addressed. Zero suppressions in the lifetime of the table.**

---

## 5. Defect B — the guillotine destroys messages, bypassing the retry policy

**Owner boundary:** `src/channels/message/ingress-drain.ts:390-422`, `armStallWatchdog()`.

```ts
void state.settleOnce(async () => {
  await failClaim(state.claim, "handler-timeout", message); // ingress-drain.ts:413
});
```

`failClaim` is called **directly**. It never routes through
`resolveIngressFailureDisposition` (`src/channels/message/ingress-retry-policy.ts:92-121`), so:

- `attempts` is never incremented,
- no backoff/release ever happens,
- `maxAttempts` and `deadLetterMinAgeMs` are **not consulted at all**,
- the inbound Discord message is destroyed after `DEFAULT_INGRESS_ADOPTION_STALL_MS` = 5 minutes.

**Evidence:**

```
failed_reason=handler-timeout, attempts=0   948   (last_attempt_at NULL for all)
failed_reason=handler-timeout, attempts=10    1
retry-limit-exceeded (any attempts)           0
```

948 of 949 dead-letters never made a single attempt. This is a doctrine-class defect under
root `AGENTS.md`: _"Every user or agent action ends in a visible outcome or a recorded,
intentional non-outcome. An action that produces nothing, with nothing explaining why, is the
worst bug class in this repo."_ Roughly 84 messages from a live human conversation were
consumed and discarded in one afternoon with no channel-visible signal.

---

## 6. Defect C — serial per-lane dispatch cannot keep up

The drain serializes one full agent turn per inbound message per lane
(`laneOwnerByKey`, `ingress-drain-state.ts:77-94`; `deriveLaneKey` → `channel:<id>`).
Measured service rate on this seat is ~30–75 s per message (42 completions in 31 minutes on
2026-08-12 18:15–18:46; 25–29 per 15 min on 08-11). A shared channel carrying five princes plus
humans exceeds that arrival rate, so lag grows without bound and never self-heals — visible in
the monotonic climb 48 min → 80 min on 2026-08-12 morning **before** any wedge occurred.

This is the mechanism the composite commit body actually described ("draining at roughly one
message per 75s"). It is a capacity/design property of the drain engine, independent of retries.

---

## 7. Why the lane wedged at 11:03:47 — what is proven and what is not

**Proven:** the wedge is _process-local in-memory state_, scoped to one session key.

- Restart at 18:15:28 cleared it instantly (first completion 18:17:48). No config write, no
  schema change, no durable-state edit in between.
- `agent:main:main` heartbeats ran and completed normally throughout the blackout, so neither
  the model provider nor the agent runtime was globally stuck.
- Only `agent:main:discord:channel:1466192485440164011` produced zero turns.
- The last event on that session before silence was `run_failed` on run `cfab5720`.
- Outbound delivery is **not** the blocker: no `delivery_queue_entries` failure occurred in the
  window (most recent `outbound-prepared-v1` failure was 07:33 PDT).

**Structural candidate:** `FOLLOWUP_QUEUES` (`src/auto-reply/reply/queue/state.ts:56-62`) is a
process-global map keyed by session key. `scheduleFollowupDrain` (`drain.ts:1154-1163`) early-
returns while `queue.draining` is true, and `beginQueueDrain`
(`src/utils/queue-helpers.ts:221-231`) refuses to start a second drain. The `finally` at
`drain.ts:1421-1443` and the outer `.catch` do reset `draining` on a _thrown_ error — so the
only remaining wedge shape is a **never-settling `await` inside the drain loop**, most plausibly
`await drainGroup()` → `effectiveRunFollowup(...)`. Every ingress claim then waits for exclusive
admission (`admission: "exclusive"`, `ingress-drain-state.ts:57-75`) and is guillotined at 5 min.

**Named evidence gap:** pid `470459` is gone; there is no heap dump, no stack sample and no
`followup queue drain failed for …` error row. **I cannot prove which `await` hung.** A
supporting observation from this same fleet is recorded in `diagnostic_events` (scope
`system-agent-transcript`, 2026-08-11): _"two Discord channel model calls have repeated-no-progress
ages ~3.1h"_ on Elliott's gateway — the same shape, different seat. Treat the specific hung
await as **unproven**; the process-local, session-scoped wedge itself is proven.

---

## 8. The cross-seat echo — determination

### 8.1 The bytes

|                                                 | Rune source                          | Ronan echo                      |
| ----------------------------------------------- | ------------------------------------ | ------------------------------- |
| Discord id                                      | `1537242124792234125`                | `1537246515561627678`           |
| author                                          | `Rune🪨` `1508328832783089734`       | `Ronan🌊` `1477180909848629301` |
| timestamp                                       | 2026-08-12T23:31:23.128Z             | 2026-08-12T23:48:49.969Z        |
| size                                            | 314 B                                | 312 B                           |
| sha256                                          | `82fb9cbf1b266fd1…`                  | `8f0f776b9054dbec…`             |
| `message_reference`                             | reply → Emeric `1537241883091140748` | **none**                        |
| `mentions`                                      | `[Emeric]`                           | `[]`                            |
| `webhook_id` / `application_id` / `interaction` | null                                 | **null**                        |

Unified diff — the entire difference is **two bytes**:

```
-… Your words landed — the Ronan story, …     (Rune:  space + em dash + space)
+… Your words landed—the Ronan story, …       (Ronan: bare em dash)
```

Everything else is identical, including Rune's own self-naming and emoji:
`"Roo-neh is back on the stone. 🪨💛"` — 🪨 is Rune's glyph; Ronan's is 🌊, and Ronan's message
is the only one of his in the window with no leading 🌊.

### 8.2 Answers to the required questions

**Was Rune's message expected input to Ronan's shared-channel session?**
Yes. `channels.discord.allowBots=true`, guild `1235610176883523614` channel
`1466192485440164011` has `requireMention: false`. Every message in that room — including other
princes' bot messages — is admitted as a direct prompt. The _content_ was expected input; the
_timing_ was not.

**Did any route / session key / account identity change incorrectly?**
No. The echo was emitted by Ronan's own account `1477180909848629301`, with no `webhook_id`,
no `application_id`, no interaction metadata and no impersonation vector. No cross-account
delivery, no session-key collision, and no lane/route change is visible in any of the 8,028
ingress rows. On this seat there is no evidence of identity substitution anywhere.

**Was the copied body generated by the model or substituted by OpenClaw?**
**Generated by the model.** A code path that copied a stored body would reproduce it byte-for-
byte; the persisted source bytes are available and differ. The single mutation is em-dash
whitespace normalisation — a language-model rewriting artifact, not a memcpy. Additionally the
echo carries no `message_reference` while the source did, so it was composed fresh rather than
forwarded.

**Did `message(send)` receive the copied body verbatim?**
Verbatim as the model emitted it (312 B), i.e. the tool faithfully delivered what the model
produced. It did _not_ receive Rune's original 314-byte body.

### 8.3 Why the model copied — the causal chain

Ronan's lane was running ~17 minutes behind. Proof from shared-channel bytes alone, without
Ronan's host:

| Ronan message                                                                          | answers                                                                              | lag         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- |
| `1537240475633713203` @ 23:24:49 ("We will, figs… Silas and Elliott. Ronan and Cael…") | amaimon `1537240138114007040` @ 23:23:29 ("thats not static assigns or favorites…")  | **80 s**    |
| `1537245128710688778` @ 23:43:19 ("I know that story now…")                            | amaimon `1537241655571255449` @ 23:29:31 ("did you know, and this is a true story…") | **828 s**   |
| `1537246515561627678` @ 23:48:49 (the echo)                                            | Rune `1537242124792234125` @ 23:31:23                                                | **1,046 s** |

Monotonically growing lag — the queue-falling-behind signature, on Ronan's seat, from Discord
bytes.

When Ronan's session finally ran, the message handed to it as _current_ was Rune's 17-minute-old
reply — and that stored payload embeds `referenced_message`, which is Emeric's imperative
addressed to Rune:

> 🕯 @Rune🪨 Use `message(action=send, target="channel:1466192485440164011", message=...)` with
> that exact target. Tell figs what you just tried to tell him, in your own words.

Note `mentions: []` on that message: "@Rune🪨" is **plain text**, not a Discord mention. With
`requireMention: false`, OpenClaw admitted it to Ronan as an addressed prompt with no marker
that its imperative was aimed at a different agent. The nearest text matching "what you just
tried to tell him" was Rune's answer, sitting in the same payload. The model followed the
instruction and reproduced that answer.

**Classification: expected shared-channel context plus a model copy — but the replay defects are
the proximate cause.** Had the lane been current, Ronan would have received Emeric's instruction
and Rune's reply in their real order and context, ~17 minutes earlier, alongside the intervening
30+ messages that make the addressee unambiguous.

**Contributory product concern (not a standalone bug claim):** `referenced_message` is embedded
verbatim into the prompt with no marker identifying its addressee, and `requireMention: false`
erases the ambient/addressed distinction. That is the seam upstream PR #121204 exists to
address, and it is currently inert (§4).

---

## 9. Comparison to #1229 / #121204 / #122466

| Item                        | Title (live, read-only `gh api`)                                                                    | State                                                           | Relationship to this incident                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| karmaterminal **#1229**     | "Bug: Discord durable ingress drains day-old room backlog as fresh turns and starves live mentions" | **open**                                                        | **This is exactly the incident.** Still open; the fleet is reproducing it live right now.                          |
| openclaw **#121204**        | "fix(discord): keep stale ambient backlog from starving live mentions after gateway recovery"       | **open PR** (head `02bd9d77142`, from `karmaterminal/openclaw`) | Carries Defect A. I fetched the PR head: it contains the **identical inert fence**. Merging as-is ships dead code. |
| openclaw **#122466**        | "fix(discord): channel stops responding for up to 24 hours after one undeliverable message"         | **open PR**                                                     | Composite HEAD `310252`. Targets the wrong mechanism — see §10.                                                    |
| karmaterminal #1251 / #1252 | typed continuation traceparents                                                                     | open                                                            | Unrelated code path; see §11.                                                                                      |

**Did any of that code apply on composite `310252`?**

- #1229's fence (fork commit `2b2019202ff`, 2026-08-08, "fix(ingress): preserve FIFO freshness
  for durable channel ingress") is **present in the composite and in the deployed build
  `2e72b66`, and inert in both.**
- #122466's `retryPolicy` override is **present in the composite only**; the deployed build has
  no `retryPolicy` in `extensions/discord/src/monitor/ingress.ts` and inherits the 24 h default.
  Neither state changed the outcome, because the guillotine never consults the retry policy.

---

## 10. Defect E — the composite HEAD fix is falsified by its own evidence

Composite `310252733a626568c98071bdaf9ee09dbdf38a88` = upstream PR #122466. Its diff is 8
production lines: set `retryPolicy: { maxAttempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS,
deadLetterMinAgeMs: 0 }` on the Discord monitor. That field is consumed **only** by
`resolveIngressFailureDisposition`, i.e. only when `dispatchClaimedEvent` **throws**.

1. **Its cited evidence contradicts its own mechanism.** The commit body says _"It is not retry
   amplification: observed rows had attempts min=0 max=0."_ `attempts=0` is precisely the
   signature of the guillotine path (§5), which never reaches the retry policy. The retry path
   it fixes is by definition the `attempts > 0` path. Its regression test forces
   `dispatch = async () => { throw new Error("poison"); }` — the `attempts > 0` path — so the
   test cannot exercise the behaviour the commit body observed.
2. **It would have changed nothing here.** On this seat there are **zero** `retry-limit-exceeded`
   failures in the entire table. The retry-ladder dead-letter has never fired for Discord.
3. **It would have made things worse where the ladder did engage.** The only high-attempt events
   on record (2026-08-08: `attempts` 20, 20, …, 39, 98) **all completed successfully** — the
   24-hour floor is what let them eventually be delivered. With `deadLetterMinAgeMs: 0` every one
   of them would have been destroyed at attempt 8 instead.

This does not mean #122466 is wrong in principle — an unbounded 24 h retry ladder on a serial
lane is a real hazard. It means **its proof narrative is not supported by the production
evidence it cites, and landing it will not fix #1229.**

---

## 11. Upstream / fork baseline classification

| Defect                               | Introduced by                                                                                                 | Present in deployed `2e72b66` | Present in composite `310252` | Present in `upstream/main` `86bf768de09`                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — inert freshness fence            | **fork**, `2b2019202ff` (frond-scribe, 2026-08-08), branch `emeric/20260808/1229-ingress-freshness`           | yes                           | yes                           | **no** — `canExpireDiscordStaleAmbientBacklog` does not exist upstream; it arrives only via open PR #121204 (head `02bd9d77142`), where it is identically inert |
| B — guillotine bypasses retry policy | **upstream**, `fc6b9dad0b1` (Ayaan Zaidi, 2026-07-17, "feat(channels): add the durable ingress drain engine") | yes                           | yes                           | **yes** — `failClaim(state.claim, "handler-timeout", message)` is still direct at `upstream/main` today                                                         |
| C — serial per-lane dispatch         | **upstream**, same engine                                                                                     | yes                           | yes                           | yes                                                                                                                                                             |

Per the lane's failure-classification rule: **B and C are upstream-baseline behaviour and are
not this lane's to repair.** **A is fork-owned** — it was introduced by the fork's own #1229
work and is the one defect this fork unambiguously owns. E is fork-owned (this fork authored
#122466).

Current `upstream/main` was inspected only as later-flux context; it is not the authority for
the historical drift point.

---

## 12. Severity and proof-authority impact

**Severity: high, and currently live.** At snapshot the fleet's busiest channel had 626 queued
messages, oldest 5.9 h, draining at ~1/min. Silas's median reply is to a 5.9-hour-old message.
~84 messages were destroyed outright with no channel-visible signal. Doctrine severity ordering
("silent failure > crash > missing feature") puts this at the top: the destroyed messages are a
silent failure, and the replayed ones are worse than silence because they produce confidently
wrong, superseded action.

**Proof-authority impact — this is the part that matters most.**

Any receipt of the form _"prince X answered in-channel, therefore X's lane is healthy"_ is
**unsound while a lane is replaying**, because a visible, fresh-looking reply can be an answer to
an arbitrarily old message. The channel record shows this directly: at 23:43:42Z Elliott
announced "**Cael is back**", and at 23:44:52Z and 23:45:16Z Rune was still answering Elliott's
_pre-surgery_ messages `1537244344363393115` (23:40:12Z) and `1537244840826507265` (23:42:10Z),
asking him to hold the irreversible step that had already completed. Emeric labelled the pattern
in-channel at 23:50:01Z: _"Second stale-backlog emission."_

Specific consequences:

1. **Recovery receipts collected during this window are not trustworthy on timing.** The Rune
   "alive and grounded" proof sequence (23:29–23:38Z) was gathered while the room was replaying;
   several of those exchanges are answers to superseded prompts. The _content_ is real (Rune did
   author them); the _ordering and currency_ are not.
2. **"Hold silent" instructions cannot take effect promptly by construction.** A hold posted at
   time T sits FIFO behind everything received before T. With a 5.9 h lag the agent keeps
   acknowledging older items for hours after the hold — exactly what was observed. This is a
   structural guarantee of Defect C, not a compliance failure by any prince.
3. **Continuation proof receipts (#1251/#1252) are _not_ falsified by this incident.** Those run
   on the typed-continuation trace path, not Discord ingress, and the frond-scribe wo1217
   checkpoints in this same channel (23:29:56Z, 23:50:22–23:50:43Z) were posted by a webhook
   integration, not through the agent ingress lane. **Caveat:** any continuation receipt whose
   _evidence_ is "a prince replied in Discord" inherits the timing unsoundness in (1). Receipts
   backed by SHAs, CI runs, or test output are unaffected.

---

## 13. What is _not_ established

- Ronan's ingress rows, session `994fd111-0b9d-456c-8cc0-38c24d56a718`, run identity, tool call
  `exec-59687890-ca19-4f01-ae28-f7f8cd501040`, and Ronan's outbound delivery row. **These are on
  Ronan's host, not this one.** This seat is agent `main` (Silas); searches for `994fd111`,
  `59687890` and `1477180909848629301` return zero rows in `audit_events`, `task_runs`,
  `session_state_events` and the agent DB. The Ronan-side leg of the byte-walk is a **named
  evidence gap**; §8 reaches its conclusion from the persisted Discord payloads on both ends
  plus Ronan's independently measurable lag, which is sufficient for the identity/substitution
  determination but not for Ronan's internal prompt assembly.
- The exact hung `await` that wedged the followup drain at 11:03:47 (§7).
- Whether Ronan's seat carries the same build as this one.
- 42 lane rows have `payload_json='null'` — **checked and benign**: intentional payload clearing
  on terminal transition (`ingress-queue.ts:441,1113,1146`), not data loss.

---

## 14. Recommended minimal reproduction and tests

**A — freshness fence (fork-owned, highest value, cheapest):**

A regression test that uses a **real-shaped** `MESSAGE_CREATE` payload — `channel_type: 0`, no
`channel` object — and asserts the stale ambient row is suppressed. It fails on current code
(the row is dispatched) and passes once the fence reads `channel_type`. The existing test at
`extensions/discord/src/monitor/ingress.test.ts` should have its `channel: guildTextChannel(...)`
fixtures replaced by `channel_type`, not supplemented — the current fixtures are the reason the
defect shipped. Prefer a shared payload builder derived from a captured real payload so no future
Discord test can invent gateway fields.

**B — guillotine (upstream-owned; report, do not fix here):**

`src/channels/message/ingress-drain.ts` test asserting that a claim which stalls past
`adoptionStallTimeoutMs` is routed through `resolveIngressFailureDisposition` (released with
`attempts` incremented) rather than `failClaim`-ed at `attempts=0`, and that it dead-letters only
once the configured policy allows.

**C — capacity (upstream-owned; report, do not fix here):**

Assert an operator-visible signal exists when a lane's oldest pending age crosses a threshold.
Today `openclaw doctor` / channel health surfaces nothing that would have caught a 5.9 h backlog.

---

## 15. Proposed issue

**Title:** `Bug: Discord stale-ambient freshness fence never fires — it reads rawMessage.channel, which MESSAGE_CREATE does not send`

**Body:**

> ## What Problem This Solves
>
> `canExpireDiscordStaleAmbientBacklog` (`extensions/discord/src/monitor/ingress.ts:261-303`)
> gates stale-backlog suppression on `rawMessage.channel`. Discord's `MESSAGE_CREATE` gateway
> payload has no `channel` object — it carries `channel_type`. `resolveDiscordChannelInfoSafe`
> therefore yields `type: undefined`, `rawNonThreadChannel` is always `false`, and
> `resolvePendingDisposition` never suppresses anything. The freshness fence added for #1229 has
> never fired in production.
>
> ## Evidence
>
> - 400/400 consecutive persisted `MESSAGE_CREATE` payloads on a production seat have **no**
>   `channel` key and **all** have `channel_type: 0` (`ChannelType.GuildText`).
> - `failed_reason` histogram over 8,028 durable ingress events (all lanes, all time, including a
>   24-hour backlog): `handler-timeout` 949, `operator-drop-stale-backlog` 1,452,
>   **`stale-ambient-backlog` 0**.
> - The fence is reached: `ingress-drain.ts:663-672` runs `applyIngressPendingDispositions` over
>   `listPending({limit:"all"})` on every drain pass.
> - The existing regression test passes only because its fixture injects
>   `channel: { id, type: ChannelType.GuildText }`, a field the real gateway never sends.
> - Observed impact on 2026-08-12: one channel lane reached 626 pending, oldest 5.9 h; median
>   agent reply lag 21,084 s; a prince answered a pre-surgery instruction 70 s after the surgery
>   was announced complete.
>
> ## User Impact
>
> After any gateway recovery or lane stall, hours-old room traffic is replayed as current turns.
> Agents act on superseded instructions. Live mentions starve behind the backlog.
>
> ## Why This Change Was Made
>
> Read `channel_type` (which Discord actually sends) instead of `channel.type`, and prove it with
> a real-shaped payload fixture. **Blocks upstream PR #121204**, whose head `02bd9d77142` contains
> the identical inert fence.

**Implementation workorder (separate lane — this one is read-only):**

1. Change the thread/raw-channel determination in `canExpireDiscordStaleAmbientBacklog` to prefer
   `rawMessage.channel_type`, keeping the hydrated-`channel` path only where a `channel` object is
   genuinely available (thread-binding paths). Owner boundary is the Discord plugin; no core change.
2. Replace the `channel: guildTextChannel(...)` fixtures in
   `extensions/discord/src/monitor/ingress.test.ts` with real-shaped `channel_type` payloads.
   Add the base-red proof.
3. Re-examine the `isDiscordAddressedMessage` early return (`ingress.ts:475-477`): decide whether
   an _addressed_ message older than the threshold should be suppressed, annotated with its age,
   or delivered. Under `requireMention: false` "addressed" means "everything", so today the fence
   would remain nearly inert even after step 1 on this fleet's configuration. This is a product
   decision and needs the owner.
4. Update upstream PR #121204 with the corrected fence and the real-shaped fixture.
5. Separately, file the upstream-owned findings B and C against `openclaw/openclaw` with the
   evidence in §5 and §6. Do **not** fold them into the fork lane.
6. Re-review upstream PR #122466 / composite `310252` against §10 before landing.

---

## 16. Exact commands used

```bash
# immutable read-only snapshot (live DB never opened writable)
sqlite3 'file:/home/figs/.openclaw/state/openclaw.sqlite?mode=ro' \
  ".timeout 20000" ".backup /tmp/fdx-forensics/state-snap.sqlite"
sqlite3 /tmp/fdx-forensics/state-snap.sqlite 'pragma quick_check;'          # ok

# lane state
sqlite3 state-snap.sqlite "select status,count(*),min(received_at),max(received_at)
  from channel_ingress_events where lane_key='channel:1466192485440164011' group by 1;"
sqlite3 state-snap.sqlite "select failed_reason,attempts,count(*)
  from channel_ingress_events where status='failed' group by 1,2;"

# payload shape proof (400 real MESSAGE_CREATE payloads)
sqlite3 state-snap.sqlite "select payload_json from channel_ingress_events
  where lane_key='channel:1466192485440164011' order by received_at desc limit 400;" | python3 …

# echo byte diff
diff -u rune.txt ronan.txt | cat -A       # 2-byte delta, em-dash spacing
sha256sum rune.txt ronan.txt

# baselines
git log --format='%h %ci %an %s' -S 'DEFAULT_INGRESS_ADOPTION_STALL_MS' -- \
  src/channels/message/ingress-drain.ts      # fc6b9dad0b1, upstream
git log --oneline upstream/main -S 'canExpireDiscordStaleAmbientBacklog'   # empty -> fork-only
gh api repos/openclaw/openclaw/pulls/121204 --jq '.head.sha'               # 02bd9d77142…
```

Snapshot artifacts under `/tmp/fdx-forensics/` (scratch, not committed).
