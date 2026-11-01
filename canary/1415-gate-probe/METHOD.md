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
- Mailbox selection, the drain, source adoption, and ingress completion.

The drain's execution-time re-check (`drain.ts:300`) is not exercised here, because the probe
always loads before a burst. The existing unit case "falls back to per-sender turns when an
unaudited plugin activates after the claim formed" in
`src/auto-reply/reply/queue/room-aggregate-plugin-gate.test.ts` covers it.

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
- In both cases, the stand-in's plugin record and hook are the same objects before and after the
  probe reloads, including the `plugins.allow` writes, so an unchanged plugin is not
  re-registered.
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
  toggle. Leave `plugins.allow` alone. Setting it would disable every unlisted plugin, bundled
  ones included, except slot-selected plugins and bundled channels enabled through channel
  config (`src/plugins/config-activation-shared.ts:110-131`).

For `plugins.load.paths`:

- **Exit 1 (unset):** step 3a creates it and step 5b unsets it. Unsetting leaves an empty
  `plugins.load: {}` object, which has no effect.
- **Exit 0, authored `[]`:** the key is authored and empty. This is emeric's case: 🕯 read it
  live on 2026-10-31, and `jq -c '.plugins.load.paths' "$(openclaw config file)"` prints `[]`.
  Take neither the unset branch nor the append branch. Step 3a sets `["$PROBE_DIR"]`, and step 5b
  sets `[]` back. **Never `unset`**: that would leave the key absent, where the seat authored it.
  The file readback after step 5b must print `[]`. `config set` replaces an array value whole
  (`collectReplacePaths`, `src/cli/config-cli-owner-patch.ts:18-32`), so setting `[]` restores
  exactly.
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
- The room's agent workspace differs from the workspace the Gateway inventory was built for. That
  is the first configured agent's workspace (`:111-115`; `src/config/io.plugin-metadata.ts:149-152`).
- `unmentionedInbound` is not `room_event`.

The audited bundled ids are `discord`, `active-memory`, `codex`, `memory-core`, `talk-voice`,
`acpx`, `browser`, `canvas`, `diagnostics-otel`, `file-transfer`, `github`, `google-meet`,
`llama-cpp`, `memory-lancedb`, `memory-wiki`, `ollama`, `teams-meetings`, `xai` and
`zoom-meetings` (`:23-54`). The fleet's reference allowlist
(openclaw-bootstrap `fleet-config/PLUGIN-DENY-LIST.md`) also names `openclaw-claude-code`, a
non-bundled plugin, and the bundled `github-copilot`, `openai`, `voice-call` and `device-pair`.
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
# plugins.load.paths was unset (exit=1 in step 0), or authored as [] (emeric):
openclaw config set plugins.load.paths "[\"$PROBE_DIR\"]" --strict-json
# plugins.load.paths had entries: append to the AUTHORED array (plain-JSON config file)
#   openclaw config set plugins.load.paths "$(jq -c --arg p "$PROBE_DIR" '.plugins.load.paths + [$p]' "$(openclaw config file)")" --strict-json
openclaw gateway call plugins.list --json | jq -c "$PROBE_ROW"
# expect, open branch:      {"id":"frond-1415-gate-probe","origin":"config","enabled":true,"runtime":{"state":"unloaded"}}
# expect, allowlist branch: {"id":"frond-1415-gate-probe","origin":"config","enabled":false,"runtime":{"state":"unloaded"}}
```

**3b. Enable it.** It loads on the hot reload, and the gate closes. Use one of these:

```bash
# open branch:
openclaw config set "plugins.entries.$PROBE_ID.enabled" true --strict-json
# allowlist branch (membership alone loads it; no entry needed):
#   openclaw config set plugins.allow "$(jq -c --arg id "$PROBE_ID" '.plugins.allow + [$id]' "$(openclaw config file)")" --strict-json
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
# plugins.load.paths was authored as [] in step 0 (emeric): set it back, never unset
openclaw config set plugins.load.paths '[]' --strict-json
jq -c '.plugins.load.paths' "$(openclaw config file)"
# expect: []
# plugins.load.paths was unset in step 0:
#   openclaw config unset plugins.load.paths
# otherwise restore the authored array from step 0:
#   openclaw config set plugins.load.paths '<authored array>' --strict-json
openclaw gateway call plugins.list --json | jq -c '[.plugins[] | select(.id=="frond-1415-gate-probe")] | length'
# expect: 0
openclaw config get "plugins.entries.$PROBE_ID" --json; echo "entry exit=$?"   # expect exit=1, as in step 0
```

**Send no restore burst until both readbacks pass:** `plugins.list` shows 0 probe rows, and
`plugins.load.paths` reads back as recorded in step 0. A restore burst taken while the probe is
still loaded would prove nothing. Then, optionally, remove the staged files:
`rm -r "$PROBE_DIR"`. Finally, repeat the direction A burst. It must aggregate again; in the
off-seat proof, the turn is byte-identical to the baseline turn.

## Canary cut on emeric: prechecks, backup, deploy, failure rollback

This is the order for the single-seat canary. 🌊 and 🕯 approve the canary for emeric only, not
for the fleet. Steps 0–5 above run between C3 and C5. Every seat command runs over
`ssh emeric bash -s` as the seat's user, in the Gateway service's environment (see "Live seat
method"). Nothing read here leaves the seat except SHAs, digests, counts and statuses.

### C0. Fresh prechecks, immediately before dispatching (🌊)

Don't reuse an earlier reading. 🌊's condition: do not assume `22f49a43a1` is still live.

```bash
B=$HOME/flesh_beast_tmp/openclaw
ROLLBACK_SHA=$(jq -r .commit "$B/dist/build-info.json"); echo "ROLLBACK_SHA=$ROLLBACK_SHA"   # the actual live SHA: the rollback target
git -C "$B" merge-base --is-ancestor "$ROLLBACK_SHA" 3d3364ddc5a88282b9d1cc71d8a529e83c18f0b0; echo "forward exit=$?"   # must be 0
git -C "$B" status --porcelain | grep -v '^??' | wc -l     # must be 0 (deploy failure 7)
systemctl --user show openclaw-gateway -p ActiveState -p SubState -p MainPID -p NRestarts -p ActiveEnterTimestamp
openclaw gateway call health --json | jq -c '{ok}'
openclaw gateway call sessions.describe --params '{"key":"agent:main:discord:channel:1466192485440164011"}' \
  | jq -c '{status: .session.status, restartRecoveryStatus: .session.restartRecoveryStatus}'   # not tombstoned, no recovery status
# plugin surfaces: no enabled unaudited plugin may own a turn-time surface (step 1's list)
openclaw gateway call plugins.list --json | jq -c '[.plugins[] | select(.enabled)] | length'
```

**Stop and repost** if any of these hold:

- `ROLLBACK_SHA` is not a 40-character SHA.
- The forward check exits non-zero. Never use `allow_non_forward_cutover` on the forward cut.
- The install directory has tracked changes.
- The unit is not `active/running`.
- The room session is tombstoned.
- An enabled plugin outside the audited set has gained a turn-time surface since the
  2026-10-31 reading: 47 loaded unaudited plugins, each with 0 typed hooks, custom hooks, tools
  and MCP servers (`openclaw plugins inspect <id> --runtime --json`).

**Idle:** 🕯 says in the room that he is idle and ready. A journal check is not enough. Dispatch
only after he says so.

### C1. Pre-cut backup (private, on the seat)

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
E=$HOME/.openclaw/evidence/1415-canary-$TS; install -d -m 0700 "$E"
CFG=$(openclaw config file)
install -m 0600 "$CFG" "$E/openclaw.json.pre-cut"
# the same bytes as a deploy config stage, for C5 step 3 (deploy.sh requires dir 0700, file 0600)
install -d -m 0700 "$HOME/.openclaw/deploy-config-staging"
install -m 0600 "$CFG" "$HOME/.openclaw/deploy-config-staging/1415-canary-precut-$TS.json"
sha256sum "$CFG" "$E/openclaw.json.pre-cut" "$HOME/.openclaw/deploy-config-staging/1415-canary-precut-$TS.json"   # all equal: PRECUT_CFG_SHA256
S=$HOME/.openclaw/state/openclaw.sqlite; A=$HOME/.openclaw/agents/main/agent/openclaw-agent.sqlite
sqlite3 "$S" ".backup '$E/openclaw.sqlite.pre-cut'"
sqlite3 "$A" ".backup '$E/openclaw-agent.sqlite.pre-cut'"   # copied, never read
sqlite3 -readonly "$E/openclaw.sqlite.pre-cut" 'PRAGMA quick_check'; sqlite3 -readonly "$E/openclaw-agent.sqlite.pre-cut" 'PRAGMA quick_check'
# pending work, as counts only
sqlite3 -readonly "$S" "SELECT status, count(*) FROM channel_ingress_events WHERE status IN ('pending','claimed') GROUP BY status"
sqlite3 -readonly "$A" 'SELECT count(*) FROM session_pending_inputs'
```

Record `ROLLBACK_SHA`, `TS`, `PRECUT_CFG_SHA256`, the C0 unit line, the room session status and
the pending counts on #1415. The config and databases stay on the seat, and only their digests
are posted. deploy-gateway's own state-database snapshot (the #1585 `--undo` hook) comes on top
of this backup; it does not replace it.

### C2. Deploy the composite

The composite is `22f49a43a1` plus #1517, so its `approved_base` is the composite it branched
from. Dispatch a dry run first, then the real run, as `karmafeast` from the scribe seat:

```bash
GH_CONFIG_DIR=~/.config/gh-karmafeast gh workflow run deploy-gateway.yml --repo karmaterminal/openclaw-bootstrap \
  -f target_prince=emeric \
  -f approved_ref=3d3364ddc5a88282b9d1cc71d8a529e83c18f0b0 \
  -f approved_base=22f49a43a118f86dfd8c95dd5b2850420aa8bcad \
  -f dry_run_only=true \
  -f reason='dry-run: #1415 single-seat canary, composite 3d3364ddc5 over live <ROLLBACK_SHA>'
# then the same without dry_run_only, reason '#1415 single-seat canary (🌊+🕯 go); rollback target <ROLLBACK_SHA>'
```

Never cancel the run. If the deploy's own health gate rolls back, the Lifecycle line says
`rollback invoked`. Then verify by receipt (`frond-fleet:seat-recovery-and-deploy-verify`), stop
the canary and report. The config was not touched.

### C3. Restart receipt

```bash
jq -r .commit "$B/dist/build-info.json"                          # 3d3364ddc5a88282b9d1cc71d8a529e83c18f0b0
systemctl --user show openclaw-gateway -p ActiveState -p MainPID -p NRestarts -p ActiveEnterTimestamp
openclaw gateway call health --json | jq -c '{ok}'
openclaw gateway call sessions.describe --params '{"key":"agent:main:discord:channel:1466192485440164011"}' \
  | jq -c '{status: .session.status, restartRecoveryStatus: .session.restartRecoveryStatus}'
sqlite3 -readonly "$S" "SELECT status, count(*) FROM channel_ingress_events WHERE status IN ('pending','claimed') GROUP BY status"
sqlite3 -readonly "$A" 'SELECT count(*) FROM session_pending_inputs'
```

Then the ordinary receipts: one normal delivered room turn from 🕯, one image turn and one
heartbeat. A seat counts as up only after a delivered room turn. Health 200 is not enough.
Pending work must be no larger than at C1, apart from messages that arrived since. A tombstoned
room session, or pending work that vanished without being delivered, is a regression: go to C5.

Then run steps 0–5 above. Step 1, direction A, comes first, and **if A fails, stop**: run no
probe, and record what holds the gate closed.

### O. Owner-list toggle for directions A and B (emeric only; 🕯's option a)

This step exists because the first burst could not form A (see "Burst shape"). 🕯 chose
(2026-10-31, msg 1566239971252371478) to remove **only frond-scribe** (`1495281313526059018`)
from his `commands.ownerAllowFrom` for the bursts, and then to restore the exact authored array.
With frond-scribe out, frond-scribe and 🍃 are two non-owner senders. `commands.allowFrom.discord`
(command access) stays as it is.

**What the write does.** `senderIsOwner` comes from the global owner list
(`src/auto-reply/command-auth.ts:247`, `:419-429`), read from the live config for each message.
`commands` is a shared channel prefix (`src/gateway/config-reload-plan.ts:91-97`). A change to it
is a **hot** reload that also **restarts the Discord channel** on this seat, because Discord does
not declare it a no-op (`:351-361`, `:578-585`; `extensions/discord/src/shared.ts:162-163`). The
write reports `requiresRestart: false`, but each owner-list write reconnects Discord briefly.
Make each write at a quiet moment, and confirm Discord reconnects before any burst.

**O1. Record the authored array**, privately, beside the C1 evidence:

```bash
E=$HOME/.openclaw/evidence/1415-canary-<TS>; CFG=$(openclaw config file)
jq -c '.commands.ownerAllowFrom' "$CFG" > "$E/ownerAllowFrom.authored.json"; chmod 0600 "$E/ownerAllowFrom.authored.json"
jq 'length' "$E/ownerAllowFrom.authored.json"                                                  # expect 8
jq --arg id 1495281313526059018 '[.[] | tostring | contains($id)] | index(true)' "$E/ownerAllowFrom.authored.json"   # 🌿's position
sha256sum "$E/ownerAllowFrom.authored.json"                                                    # OWNERS_SHA256
```

**O2. Remove frond-scribe only:**

```bash
openclaw config set commands.ownerAllowFrom \
  "$(jq -c --arg id 1495281313526059018 'map(select((tostring|contains($id))|not))' "$E/ownerAllowFrom.authored.json")" --strict-json
jq -c --arg id 1495281313526059018 '.commands.ownerAllowFrom | {n: length, scribe: any(.[]; tostring|contains($id))}' "$CFG"   # expect {"n":7,"scribe":false}
diff <(jq -c --arg id 1495281313526059018 'map(select((tostring|contains($id))|not))' "$E/ownerAllowFrom.authored.json") \
     <(jq -c '.commands.ownerAllowFrom' "$CFG") && echo "others unchanged, order kept"
journalctl --user -u openclaw-gateway --since -2min -o cat | grep -E 'config hot reload applied|\[discord\].*starting'
```

Expect `config hot reload applied (commands.ownerAllowFrom)` and a Discord account start after
it. **Stop**, and take C5's branch, if any of these holds:

- the write reports `requiresRestart: true`;
- there is no hot-reload line;
- Discord does not come back;
- any other entry changed.

Then get one delivered room turn from 🕯 before the burst.

**O3. Direction A:** frond-scribe and 🍃 each post two unaddressed lines while 🕯 is mid-turn.
A passes only if all of these hold:

- the four rows share **one** adoption (their `completed_at` values are milliseconds apart);
- the journal shows one new run;
- 🕯 reports one input headed `[Queued messages while agent was busy]`, with members from both
  senders.

**If A fails, stop.** Skip the probe and go to O5.

**O4. Direction B and the probe:** steps 2–5 above. Stage, load, run the B burst with the same two
senders, then unload, and verify 5a and 5b. Then run the restore A burst, still with frond-scribe
as a non-owner, after the probe has unloaded.

**O5. Restore the authored array**, after the probe is unloaded (or right away if A failed):

```bash
openclaw config set commands.ownerAllowFrom "$(cat "$E/ownerAllowFrom.authored.json")" --strict-json
jq -c '.commands.ownerAllowFrom' "$CFG" | sha256sum                                            # == OWNERS_SHA256
journalctl --user -u openclaw-gateway --since -2min -o cat | grep -E 'config hot reload applied|\[discord\].*starting'
sha256sum "$CFG"                                                                               # compare with PRECUT_CFG_SHA256 (C4)
```

frond-scribe is an owner again once the array digest matches and Discord has reconnected. If the
restore write fails, or needs a restart, use C5 step 3: the C1 stage holds the authored array.
Make no improvised live edit.

### C4. Normal close

Steps 5a and 5b leave the probe config as C1 found it: `plugins.entries.frond-1415-gate-probe`
absent, and `plugins.load.paths` reading back `[]`. Compare `sha256sum "$CFG"` to
`PRECUT_CFG_SHA256`. The two may differ in formatting only. If anything else differs, report
which paths differ, not their values. The seat stays on `3d3364ddc5`; no fleet cut follows
without a further go.

### C5. Failure rollback, in this order

Use this on any regression after the cut: normal, image or heartbeat turns, the room session, a
lost Discord connection, MCP reconnect storms, or anything 🕯 reports.

1. **Clear the probe config first, where the Gateway answers:**
   - `openclaw config unset "plugins.entries.$PROBE_ID"`, or on the allowlist branch restore the
     recorded `plugins.allow`;
   - `openclaw config set plugins.load.paths '[]' --strict-json`;
   - verify: `plugins.list` shows 0 probe rows, the file reads back `[]`, and the entry lookup
     exits 1.

   This keeps the probe from riding into the rolled-back runtime. **A write that reports success
   while any of the three readbacks is still wrong is a failed clearing** (🕯, 2026-10-31). Never
   roll back with the probe still configured. Take step 3's staged-config branch instead.

   Choose between step 2 alone and steps 2+3 **before** dispatching the rollback. Step 3 is a
   branch of step 2's dispatch, not a later action.

2. **Roll the code back** to the actual pre-cut SHA recorded at C0. It is an ancestor of the
   installed composite, so this is an audited non-forward cutover on this one seat. The reason
   names the installed SHA:

   ```bash
   GH_CONFIG_DIR=~/.config/gh-karmafeast gh workflow run deploy-gateway.yml --repo karmaterminal/openclaw-bootstrap \
     -f target_prince=emeric -f approved_ref=<ROLLBACK_SHA> -f approved_base=<ROLLBACK_SHA> \
     -f allow_non_forward_cutover=true \
     -f reason='#1415 canary rollback: replaces installed 3d3364ddc5a88282b9d1cc71d8a529e83c18f0b0 with recorded pre-cut <ROLLBACK_SHA>'
   ```

3. **If step 1 is impossible or failed**, carry the saved config with the old artifact in the
   same dispatch. This applies when:
   - the Gateway does not answer `config.patch` (refused, timed out, or not listening);
   - a write reports `requiresRestart: true`;
   - reload mode is `off` or `restart`;
   - a write reported success but a readback stayed wrong.

   Do not hand-edit the live file under a running Gateway. Add the C1 stage to the step 2
   dispatch:

   ```bash
   -f config_stage_key=1415-canary-precut-<TS>.json -f config_stage_sha256=<PRECUT_CFG_SHA256>
   ```

   deploy.sh checks the stage's owner, mode and digest, validates it against the old artifact
   **before** stopping the Gateway, and promotes it only together with the runtime cutover. Its
   config rollback is coupled to its runtime rollback (`deploy/lib/runtime-config-migration.sh`,
   `deploy_config_prepare_private_stage`). The pre-cut config has no probe entries.

   Before using the stage, compare the live config's digest with `PRECUT_CFG_SHA256` and the
   probe paths. If the seat wrote another config change during the canary, the stage would undo
   it. In that case stop, and ask 🕯 which config should stand.

4. **Rollback receipt:** the C3 block again, with build-info expected to equal `<ROLLBACK_SHA>`.
   The room session must not be tombstoned. If it is, recover it in place with `sessions.recover`
   (mode `in-place`, with `sessionId` and `restartRecoveryCycleId` from `sessions.describe`).
   Never use `sessions.reset`. Pending work is compared with C1, then a delivered room turn
   follows. Post on #1415.

The C1 database backups are restored only by a separately reviewed procedure. The composite
changes no SQLite schema, so the code rollback alone does not need them.

## Evidence for each direction

**Burst shape.** Send at least two unaddressed room messages (not @-mentions of the agent, not
commands) from at least two distinct non-owner senders, while the agent is mid-turn in that
room. `unmentionedInbound` must be `room_event`, and the room queue must be in collect mode.
Peer agents count as senders. Owner messages, mentions and senders with elevated grants do not
join an aggregate (`delivery-context.ts:176-203`).

**Check the senders' owner status on the seat first.** A sender in the seat's
`commands.ownerAllowFrom` has `senderIsOwner` and never joins (`delivery-context.ts:183`). Find
the paths that name each sender's Discord id, without printing values:

```bash
jq -c --arg id "<discord user id>" '[paths(type=="string" and (tostring|contains($id))) | map(tostring) | join(".")]' "$(openclaw config file)"
```

On emeric (2026-10-31), every prince, figs and frond-scribe are owners. 🍃 frond-gloss is the
only non-owner in the room, so direction A cannot form there with the room's own members. The
first burst ran two per-sender collects instead: frond-scribe's two lines in one adoption at
23:55:40.402/.407Z, and 🍃's two at 23:56:44.524/.527Z. The canary stopped before the probe.

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

**What a direction receipt needs (🌊, 2026-10-31).** Equal `completed_at` values alone prove
nothing. Each direction's receipt joins three things over the same burst window:

1. **Turn count.** Count the journal's agent-run starts in the window. A gets exactly one new run
   after the running turn ends. B gets one run per member.
2. **Turn input.** 🕯 reports the shape of each new turn's input from his own session. A has one
   turn headed `[Queued messages while agent was busy]`, with one `Queued #N (from <sender>)` per
   member. B has one turn per member, each with that member's own text. Turn input is 🕯's
   session, so 🕯 reads and reports it. frond-scribe does not read his transcripts.
3. **Ingress adoption.** The `channel_ingress_events` rows above: statuses, and `completed_at`
   grouped one adoption per turn.

If the three disagree, there is no receipt for that direction. Report the disagreement as found.

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
