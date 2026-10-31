# #1415 canary: room aggregate gate probe

Bound to karmaterminal/openclaw#1415. Product under test: composite candidate
`3d3364ddc5a88282b9d1cc71d8a529e83c18f0b0` (`frond/1415-room-collect-base`: fleet composite
`22f49a43a1` plus the #1517 bounded room drain, including the #1519/#1520 plugin gate).

The canary needs a two-direction receipt on one seat:

- **A, aggregate:** a multi-sender room burst runs as one senderless collect turn.
- **B, gated:** the plugin gate cannot vouch for the turn's plugins, so the same burst runs as
  one turn per sender.

`frond-1415-gate-probe` is the exact, reversible toggle between A and B. It is a two-file plugin
loaded from `plugins.load.paths`. It registers one `model_call_started` hook that returns
`undefined`. It has no tools, channels, commands, services or routes, and its code makes no
network calls, writes no files and logs nothing. Every config change below is hot: `plugins.load`
maps to `reloadPlugins` (`src/gateway/config-reload-plan.ts:227`), and other `plugins.*` paths
map to `reloadPlugins` plus `disposeMcpRuntimes` (`:288`). Toggling the probe never restarts the
Gateway.

## Probe identity

| file                                         | sha256                                                             | git blob                                   |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `frond-1415-gate-probe/index.cjs`            | `daa8116ce4cd05ea935e73b0ee13c7f2b8031187314d94a6c63a4fa855e5ea57` | `89a59b8ab0ea57fe02cc25598869e72e0d19db24` |
| `frond-1415-gate-probe/openclaw.plugin.json` | `29800da35d647ebcb515b1e356e70c5e9661df460ec17e9820e2c75f77f49871` | `2eb9e322d2923b9f02057784516555d666a21ca3` |

**Probe sha256** (sha256 of the two-line `sha256sum index.cjs openclaw.plugin.json` listing, run
inside the probe directory): `fbb216c6125876315ef649e59f0f2757b6240257304e630dcc06516510c80e81`.
Git tree: `3329f590e9d5ff49405f43510bb7948b23eb6258`. The off-seat test checks this hash on the
staged copy, so a reformat of the probe fails it.

## Why the probe closes the gate

Citations are against `3d3364ddc5`.

1. A `plugins.load.paths` entry is discovered with origin `"config"`
   (`src/plugins/discovery.ts:876`). The only promotion to `"bundled"` is a path inside the host's
   own bundled plugin root (`src/plugins/discovery.ts:816-822`). `~/.openclaw/canary/` is not that root.
2. The probe's `api.on("model_call_started", …)` becomes a `registry.typedHooks` entry owned by
   `frond-1415-gate-probe` (`src/plugins/registry-registrars.ts:674`).
3. The gate collects the owner of every turn-time surface, starting with `registry.typedHooks`
   (`src/auto-reply/reply/queue/room-aggregate-plugin-gate.ts:61-76`). It requires each owner's
   loaded records to pass `isAuditedBundledPlugin` (`:77-83`), which needs both
   `origin === "bundled"` and an id in `AUDITED_BUNDLED_PLUGIN_IDS` (`:56-58`). The probe fails on
   both counts: its origin is `"config"`, and its id is not in the set (`:23-54`). So
   `areTurnSurfacesAudited` is false, and `isRoomAggregatePluginSurfaceAudited` returns `false` at
   `:108-110`.
4. At selection, a member whose gate is false gets no room-aggregate key and keeps its own
   per-sender storage key (`src/auto-reply/reply/queue/delivery-context.ts:194`, `:214`). If the
   probe loads after a claim formed, the drain's execution-time re-check
   (`src/auto-reply/reply/queue/drain.ts:300`) returns the members to re-selection, and each then
   runs as itself.

### Why `model_call_started` and `activation.onCapabilities: ["hook"]`

- **`before_agent_run` would not work.** It is a conversation hook
  (`src/plugins/hook-types.ts:161`, `conversationAccess: true`). A non-bundled
  plugin's conversation hook is dropped unless
  `plugins.entries.<id>.hooks.allowConversationAccess=true` is set
  (`src/plugins/registry-registrars.ts:641-656`). The plugin would then show as active with no
  hook registered, and the gate would stay open. B would silently never happen (negative control
  2 below). `model_call_started` needs no grant. It is a void observer, dispatched
  fire-and-forget. Its event carries run and call ids, session key and id, provider, model, API,
  transport and context budget, but no message content
  (`src/agents/embedded-agent-runner/run/attempt.model-diagnostic-lifecycle.ts:149-191`).
- **The manifest needs the hook activation hint.** The Gateway loads a non-bundled hook-only
  plugin only when its manifest declares `activation.onCapabilities: ["hook"]` _and_ the plugin is
  explicitly enabled (`src/plugins/gateway-startup-plugin-activation.ts:213-217`, `:297-302`).
  For a non-bundled plugin, explicit enablement is either `plugins.entries.<id>.enabled === true`
  or membership in a non-empty `plugins.allow` (`src/plugins/config-activation-shared.ts:43-63`).
  Without the hint, the probe is discovered but never loaded (negative control 1 below).

## Off-seat proof

Test: `src/gateway/server.room-aggregate-gate-probe.test.ts` (gateway-server shard, two cases,
about 14 s of test time).

```bash
node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts --maxWorkers=1 \
  src/gateway/server.room-aggregate-gate-probe.test.ts
```

What is real:

- An in-process Gateway (`startGatewayServer`) on a seat-shaped state layout (`~/.openclaw`).
- Its plugin discovery, loader, registry, Gateway inventory and hot plugin reload.
- `config.patch`, sent exactly as `openclaw config set` and `openclaw config unset` send it to a
  running Gateway, including `replacePaths` (`src/cli/config-cli-owner-patch.ts:18-31`;
  docs/cli/config.md, lines 16-27).
- The `plugins.list` RPC behind `openclaw gateway call plugins.list`.
- The unmocked gate.
- Durable ingress rows in the Gateway's own state database.
- Mailbox selection, the drain and its execution-time re-check, source adoption, and ingress
  completion.

What is replaced:

- The Discord channel handler. The test builds each room event's queued run itself, with
  `currentInboundEventKind: "room_event"`.
- The reply runner. A recording callback adopts each turn's sources and advances a turn clock.

An audited bundled stand-in (`diagnostics-otel`, discovered from a fixture bundled root, so its
origin is `"bundled"`) holds a turn-time hook in the baseline. That way the gate is checked
against a real audited owner, not an empty registry.

Case 1, open allowlist (`plugins.allow` unset):

| step            | config change                                        | `plugins.list` probe entry                                | registry                                                                                                  | gate      | burst                                                                                                                 |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| baseline        | none                                                 | absent                                                    | audited stand-in only                                                                                     | **true**  | **1** collect turn, senderless; all 3 `completed_at` equal                                                            |
| 3a load path    | `plugins.load.paths=[probe]`                         | `origin:"config", enabled:true, runtime.state:"unloaded"` | unchanged                                                                                                 | true      | (not run)                                                                                                             |
| 3b enable       | `plugins.entries.frond-1415-gate-probe.enabled=true` | `runtime.state:"active"`                                  | +1 plugin record, +1 `model_call_started` hook, +1 provenance warning; every other registration unchanged | **false** | **3** turns, each the member's own prompt and senderId; 3 distinct `completed_at`, one per turn; no drain refusal log |
| 5a unset enable | `plugins.entries.frond-1415-gate-probe` removed      | `runtime.state:"unloaded"`                                | equal to baseline; hook set equal to baseline                                                             | true      | (not run)                                                                                                             |
| 5b unset path   | `plugins.load.paths` removed                         | absent                                                    | equal to baseline                                                                                         | **true**  | **1** collect turn, byte-identical to the baseline turn; all 3 `completed_at` equal                                   |

Case 2, seat allowlist (`plugins.allow` names the seat's plugins):

| step                 | config change                    | `plugins.list` probe entry                                 | registry                                             | gate      | burst                  |
| -------------------- | -------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- | --------- | ---------------------- |
| allowlist baseline   | `plugins.allow=[audited]`        | absent                                                     | equal to baseline                                    | true      | (not run)              |
| 3a load path         | `plugins.load.paths=[probe]`     | `origin:"config", enabled:false, runtime.state:"unloaded"` | unchanged                                            | true      | (not run)              |
| 3b allow             | `plugins.allow=[audited, probe]` | `enabled:true, runtime.state:"active"`                     | +1 plugin record, +1 hook; **no** provenance warning | **false** | **3** per-sender turns |
| 5a restore allowlist | `plugins.allow=[audited]`        | `enabled:false, runtime.state:"unloaded"`                  | equal to baseline                                    | true      | (not run)              |
| 5b unset path        | `plugins.load.paths` removed     | absent                                                     | equal to baseline                                    | **true**  | **1** collect turn     |

Every patch reported `requiresRestart: false`, and the Gateway's recovery restart never fired.

"Changes nothing else", as shown in case 1, step 3b:

- Counted over every registry array, map and record whose entries name an owner, the probe owns
  exactly `{plugins: 1, typedHooks: 1, diagnostics: 1}`, and every other owner's count is
  unchanged.
- The global hook set gains only `model_call_started`.
- The stand-in's plugin record and hook are the same objects before and after both probe reloads,
  so an unchanged plugin is not re-registered.
- The inventory lists the probe with no `contracts`, so a turn's lazily loaded tool owners are
  unchanged.
- Dispatching the probe's hook through the real runner completes and returns nothing. That shows
  only that it does not throw; inertness rests on the 9-line source.

Negative controls (probe files edited locally, run, then restored):

1. Remove `activation` from the manifest: case 1 fails at step 3b. The probe never reaches
   `runtime.state: "active"`.
2. Register `before_agent_run` instead: case 1 fails at step 3b. The probe owns
   `{plugins: 1, diagnostics: 2}` and no `typedHooks`, because the conversation-access block adds
   a second diagnostic. The gate would have stayed open.

## Live seat method (owner commands)

Run these as the seat's own user on the Gateway host, in the same environment as the Gateway
service (`OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH` must match). Otherwise the CLI writes a
different config file, which the `plugins.list` checks below would expose. Every write goes
through the running Gateway's `config.patch`, and that Gateway is the only writer. Each write logs
`config hot reload applied (<paths>)` under the `gateway/reload` subsystem
(`src/gateway/server-reload-hot.ts:667`).

```bash
PROBE_ID=frond-1415-gate-probe
PROBE_DIR="$HOME/.openclaw/canary/$PROBE_ID"
PROBE_ROW='.plugins[] | select(.id=="frond-1415-gate-probe") | {id, origin, enabled, runtime}'
```

### 0. Preconditions (read-only)

```bash
openclaw config get gateway.reload.mode            # must be unset (hybrid), hybrid or hot; stop if off or restart
openclaw config get plugins.enabled                # must not be false
openclaw config get plugins.deny --json            # must not contain frond-1415-gate-probe
openclaw config get plugins.allow --json; echo "allow exit=$?"
openclaw config get plugins.load.paths --json; echo "paths exit=$?"
openclaw config get "plugins.entries.$PROBE_ID" --json; echo "entry exit=$?"   # must be exit=1 (unset)
# Room events: unmentioned room messages are room events only when this is "room_event"; the
# default is "user_request", and then nothing aggregates
# (src/channels/inbound-event/classification.ts:18-20, 37-48).
openclaw config get messages.groupChat.unmentionedInbound
openclaw config get agents.entries.<room-agent>.groupChat.unmentionedInbound   # wins when set
```

`config get --json` exits 1 with a JSON failure envelope when a path is unset. Choose the branch
now:

- **Allowlist branch.** `plugins.allow` exits 0 with a non-empty array. Allowlist membership is
  the probe's toggle (steps 3b and 5a below). The probe gets no provenance warning
  (`src/plugins/loader-provenance.ts:226`).
- **Open branch.** `plugins.allow` exits 1 or prints `[]`. `plugins.entries.<id>.enabled` is the
  toggle. Leave `plugins.allow` alone: setting it would disable every unlisted plugin, bundled
  ones included (`src/plugins/config-activation-shared.ts:129-131`).

For `plugins.load.paths`:

- **Exit 1 (unset):** step 3a creates it and step 5b unsets it. Unsetting leaves an empty
  `plugins.load: {}` object, which has no effect.
- **Exit 0 (has entries):** `config get` prints runtime-materialized values: `~` expanded and
  `${VAR}` substituted. Read the authored array from the file instead, for example
  `jq -c '.plugins.load.paths' "$(openclaw config file)"` when the file is plain JSON. Append to
  that authored array and restore exactly that array. The restore is semantic, not byte-exact.

Confirm the seat runs the canary cut built from `3d3364ddc5` (per its deploy receipt).

### 1. Direction A receipt first (probe absent)

Produce a multi-sender burst (see "Evidence" below) and confirm it aggregates. **If the baseline
burst does not aggregate, stop.** Something already holds the gate closed on this seat, and the
probe can show no toggle. The gate closes when any of these hold:

- An enabled plugin that is not an audited bundled plugin owns a turn-time surface: hooks, tools,
  channels, harnesses, trusted tool policies, MCP connection resolvers, or memory surfaces
  (`room-aggregate-plugin-gate.ts:61-84`).
- An enabled plugin that is not an audited bundled plugin declares tools, even if it is not
  loaded yet (`:116-120`).
- The room's agent workspace differs from the Gateway's plugin workspace, which is the default
  agent's (`:111-115`).
- `unmentionedInbound` is not `room_event`.

The audited bundled ids are `discord`, `active-memory`, `codex`, `memory-core`, `talk-voice`,
`acpx`, `browser`, `canvas`, `diagnostics-otel`, `file-transfer`, `github`, `google-meet`,
`llama-cpp`, `memory-lancedb`, `memory-wiki`, `ollama`, `teams-meetings`, `xai` and
`zoom-meetings` (`:23-54`). The fleet's reference allowlist
(openclaw-bootstrap `fleet-config/PLUGIN-DENY-LIST.md`) also names `openclaw-claude-code`, a
path-loaded plugin, and the bundled `github-copilot`, `openai`, `voice-call` and `device-pair`.
None of these is audited. Check each one that is enabled:

```bash
openclaw gateway call plugins.list --json \
  | jq -c '.plugins[] | select(.enabled) | {id, origin, runtime: .runtime.state}'
openclaw plugins inspect <id> --runtime --json   # hooks, tools, channels, … it registers
```

### 2. Stage the probe

Stage it under the seat's own `~/.openclaw/`, which is not a sovereign workspace and not an
auto-scanned plugin root. (The off-seat test shows the probe there is absent from `plugins.list`
until its path is configured.) Write the two files verbatim, then verify the hash. Any byte
difference fails the check.

```bash
install -d -m 0755 "$PROBE_DIR"
cat > "$PROBE_DIR/openclaw.plugin.json" <<'EOF'
{
  "id": "frond-1415-gate-probe",
  "name": "Frond #1415 gate probe",
  "description": "No-op canary probe: one model_call_started hook that does nothing, so the room aggregate plugin gate sees an unaudited turn-time surface.",
  "activation": { "onCapabilities": ["hook"] },
  "configSchema": { "type": "object", "additionalProperties": false, "properties": {} }
}
EOF
cat > "$PROBE_DIR/index.cjs" <<'EOF'
// Frond (karmaterminal, #1415) canary probe. Its only effect is existing: one turn-time hook
// owned by a path-loaded plugin, which the room aggregate plugin gate does not audit. The hook
// reads nothing, returns nothing, and imports nothing.
module.exports = {
  id: "frond-1415-gate-probe",
  register(api) {
    api.on("model_call_started", () => undefined);
  },
};
EOF
chmod 0644 "$PROBE_DIR"/*
(cd "$PROBE_DIR" && sha256sum index.cjs openclaw.plugin.json && sha256sum index.cjs openclaw.plugin.json | sha256sum)
# expect: daa8116c…e5ea57  index.cjs
#         29800da3…f49871  openclaw.plugin.json
#         fbb216c6125876315ef649e59f0f2757b6240257304e630dcc06516510c80e81  -
```

Alternatively, copy the files from a karmaterminal/openclaw clone that has fetched this branch
(`git show <branch-sha>:canary/1415-gate-probe/frond-1415-gate-probe/index.cjs`, and the same
for the manifest), then run the same hash check.

Discovery refuses a world-writable path or one not owned by the seat user or root
(`src/plugins/discovery.ts:158`, `:170`). The modes above satisfy that.

### 3. Load the probe (direction B on)

**3a. Add the load path.** The probe is discovered but not loaded; the gate is unchanged.

```bash
# plugins.load.paths was unset (exit=1 in step 0):
openclaw config set plugins.load.paths "[\"$PROBE_DIR\"]" --strict-json
# plugins.load.paths had entries: append to the AUTHORED array read in step 0
#   openclaw config set plugins.load.paths '<authored array + "'"$PROBE_DIR"'">' --strict-json
openclaw gateway call plugins.list --json | jq -c "$PROBE_ROW"
# expect, open branch:      {"id":"frond-1415-gate-probe","origin":"config","enabled":true,"runtime":{"state":"unloaded"}}
# expect, allowlist branch: {"id":"frond-1415-gate-probe","origin":"config","enabled":false,"runtime":{"state":"unloaded"}}
```

**3b. Enable it.** It loads on the hot reload, and the gate closes. Use one of these:

```bash
# open branch:
openclaw config set "plugins.entries.$PROBE_ID.enabled" true --strict-json
# allowlist branch (membership alone loads it; no entry needed):
#   openclaw config set plugins.allow '<recorded array + "frond-1415-gate-probe">' --strict-json
openclaw gateway call plugins.list --json | jq -c "$PROBE_ROW"
# expect (both branches): {"id":"frond-1415-gate-probe","origin":"config","enabled":true,"runtime":{"state":"active"}}
```

`openclaw plugins list` is **not** a live check. It reads the persisted cold registry, not the
running Gateway (docs/cli/plugins/list.md). `runtime.state` above comes from the Gateway's active
registry (`src/gateway/server-methods/plugins.ts:139-150`). `"active"` means the plugin loaded,
not that its hook registered; negative control 2 was also `"active"`.
`openclaw plugins inspect frond-1415-gate-probe --runtime --json` should list
`model_call_started` as its only hook, from a separate non-activating inspection pass. The
direction-B burst is the deciding check.

Expected journal line on load, open branch only. The loader warns because a path plugin has no
install record and is not allowlisted. It is benign, and it is logged once per process for a
given source (`src/plugins/loader-provenance.ts:243-267`):

```
[plugins] frond-1415-gate-probe: OpenClaw can't verify where this plugin came from. Review it with 'openclaw plugins inspect frond-1415-gate-probe'. …
```

Side effects to watch:

- **Channels.** A hot reload stops and restarts a channel only when the changed plugin owns that
  channel, or when the plugin command set changes (entries compared by identity,
  `src/gateway/server-plugin-reload-channels.ts:87-101`). The probe owns neither, and the
  off-seat test shows an unchanged plugin keeps its registration objects across both probe
  reloads. Discord should stay connected; confirm that no Discord channel stop or start appears
  in the journal around the reload.
- **MCP runtimes.** Step 3b and step 5a match the `plugins` rule, which also reconciles session
  MCP runtimes (`src/gateway/server-reload-hot.ts:598-608`). The off-seat test runs none. If the
  seat runs session MCP servers, watch for their reconnects.

### 4. Direction B receipt (probe active)

Produce the same shape of burst. Each member must run as its own turn (see "Evidence").

### 5. Rollback

**5a. Disable it.** It unloads on the hot reload, and the gate reopens.

```bash
# open branch:
openclaw config unset "plugins.entries.$PROBE_ID"
# allowlist branch: restore the exact array recorded in step 0
#   openclaw config set plugins.allow '<recorded array>' --strict-json
openclaw gateway call plugins.list --json | jq -c "$PROBE_ROW"
# expect, open branch:      {"id":"frond-1415-gate-probe","origin":"config","enabled":true,"runtime":{"state":"unloaded"}}
# expect, allowlist branch: {"id":"frond-1415-gate-probe","origin":"config","enabled":false,"runtime":{"state":"unloaded"}}
```

**5b. Remove the load path.**

```bash
# plugins.load.paths was unset in step 0:
openclaw config unset plugins.load.paths
# otherwise restore the authored array from step 0:
#   openclaw config set plugins.load.paths '<authored array>' --strict-json
openclaw gateway call plugins.list --json | jq -c '[.plugins[] | select(.id=="frond-1415-gate-probe")] | length'
# expect: 0
```

Then, optionally, remove the staged files: `rm -r "$PROBE_DIR"`. Finally, repeat the direction A
burst. It must aggregate again; in the off-seat proof, the turn is byte-identical to the
baseline turn.

## Evidence for each direction

**Burst shape.** Send at least two unaddressed room messages (not @-mentions of the agent, not
commands) from at least two distinct non-owner senders, while the agent is mid-turn in that
room. `unmentionedInbound` must be `room_event`, and the room queue must be in collect mode.
Peer agents count as senders. Owner messages, mentions and senders with elevated grants do not
join an aggregate (`delivery-context.ts:176-203`).

**Ingress rows.** Use the seat state database, `~/.openclaw/state/openclaw.sqlite`
(`src/state/openclaw-state-db.paths.ts:41`). Discord rows have `channel_id='discord'`,
`event_id` = the Discord message id, and `lane_key` = `channel:<discord channel id>`
(`extensions/discord/src/monitor/ingress.ts:53-66`; completion keeps `lane_key`). Times are epoch
milliseconds. `completed_at` is stamped when each member's adoption commits
(`src/channels/message/ingress-queue.kernel.ts:404`).

```bash
sqlite3 -readonly "$HOME/.openclaw/state/openclaw.sqlite" \
  "SELECT event_id, received_at, completed_at, status FROM channel_ingress_events
   WHERE channel_id='discord' AND lane_key='channel:<ROOM_CHANNEL_ID>' AND received_at >= <EPOCH_MS>
   ORDER BY received_at;"
```

- **A (aggregate):** the members share one adoption. The collected claim adopts all sources
  together (`src/auto-reply/reply/queue/drain.ts:175-185`). Their `completed_at` are therefore
  equal, or differ only by the milliseconds between the sibling commits of that one adoption. All
  of them come after the end of the turn that was running. The session gets **one** new user
  turn. Its input starts `[Queued messages while agent was busy]` and lists
  `Queued #N (from <sender>)` for each member. The turn runs senderless, as the room baseline.
- **B (gated):** each member completes at its own turn. Consecutive `completed_at` values differ
  by at least a full turn's duration. The session gets **one user turn per member**, each with
  that member's own text and sender.

**Log lines.**

- The gate and its fallback emit **no** log line. Selection keys each member by its own sender,
  and the drain's execution-time re-check defers silently (`drain.ts:300`). The off-seat proof
  asserts that the drain logs nothing in direction B.
- The drain's only refusal line belongs to the mixed-claim guard, not the plugin gate:
  `mailbox refused a mixed claim for <queue key>: not every member may run as the room baseline;
  <N> members retry alone|released unadopted` (`drain.ts:288-298`). It must appear in **neither**
  direction. If it does, report it as a selection-invariant break, not a gate result.
- On the Gateway side, each config write logs `config hot reload applied (<changed paths>)`.
  Loading in the open branch also logs the provenance warning above.

## Accepted edges

- **Equal `completed_at` comes from the off-seat test's turn clock.** On a live clock, sibling
  completions of one adoption can differ by a few milliseconds. The discriminating signal is a
  gap of milliseconds within one adoption, against at least a full turn between per-sender
  members, together with the user-turn count.
- **The test's audited plugin is a stand-in.** It is a fixture under an audited id, in a fixture
  bundled root. The gate reads only owner id and loader origin, and discovery assigns that origin
  from containment in the bundled root, so the stand-in exercises the same provenance path as the
  fleet's real bundled plugins. It does not exercise those plugins' own surfaces.
- **The test does not run a live channel or MCP runtimes.** It runs with `OPENCLAW_SKIP_CHANNELS`.
  "Discord stays connected" rests on the cited reload code plus the registration-identity check,
  and must be confirmed on the seat, like the MCP reconcile.
- **The test does not run real Discord classification.** It builds room events directly, so the
  `unmentionedInbound` precondition is read from code.
