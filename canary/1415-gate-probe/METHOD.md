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
`undefined`. It has no tools, channels, commands, services or routes. It makes no network calls,
writes no files and logs nothing. `plugins.*` changes are hot (`src/gateway/config-reload-plan.ts:227`
`plugins.load` and `:288` `plugins` both map to `reloadPlugins`), so toggling it never restarts
the Gateway.

## Probe identity

| file                                         | sha256                                                             | git blob                                   |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `frond-1415-gate-probe/index.cjs`            | `daa8116ce4cd05ea935e73b0ee13c7f2b8031187314d94a6c63a4fa855e5ea57` | `89a59b8ab0ea57fe02cc25598869e72e0d19db24` |
| `frond-1415-gate-probe/openclaw.plugin.json` | `29800da35d647ebcb515b1e356e70c5e9661df460ec17e9820e2c75f77f49871` | `2eb9e322d2923b9f02057784516555d666a21ca3` |

**Probe sha256** (sha256 of the two-line `sha256sum index.cjs openclaw.plugin.json` listing, run
inside the probe directory): `fbb216c6125876315ef649e59f0f2757b6240257304e630dcc06516510c80e81`.
Git tree: `3329f590e9d5ff49405f43510bb7948b23eb6258`.

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
  hook registered, and the gate would stay open. B would silently never happen. The off-seat test
  confirms this (negative control 2 below). `model_call_started` needs no grant: it is a void,
  fire-and-forget observer, and its event carries only run/call ids, provider and model
  (`src/agents/embedded-agent-runner/run/attempt.model-diagnostic-lifecycle.ts:149-191`).
- **The manifest needs the hook activation hint.** The Gateway loads a non-bundled hook-only
  plugin only when its manifest declares `activation.onCapabilities: ["hook"]` _and_ the plugin is
  explicitly enabled (`src/plugins/gateway-startup-plugin-activation.ts:213-217`, `:297-302`;
  explicit means `plugins.entries.<id>.enabled === true`, `src/plugins/config-activation-shared.ts:43-44`).
  Without the hint, the probe is discovered but never loaded (negative control 1 below).

## Off-seat proof

Test: `src/gateway/server.room-aggregate-gate-probe.test.ts` (gateway-server shard).

```bash
node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts --maxWorkers=1 \
  src/gateway/server.room-aggregate-gate-probe.test.ts
```

Composition:

- A real in-process Gateway (`startGatewayServer`) on a seat-shaped state layout (`~/.openclaw`).
- The probe is copied from this directory to `<state>/canary/frond-1415-gate-probe`.
- Config changes are applied with `config.patch`: the request `openclaw config set` and
  `openclaw config unset` send to a running Gateway, including their `replacePaths`
  (`src/cli/config-cli-owner-patch.ts:18-31`; docs/cli/config.md "routed write").
- The gate is unmocked and reads the registry and inventory the hot reload publishes.
- A three-sender room burst goes through real durable ingress (`channel_ingress_events` in the
  Gateway's own state database) into the real session mailbox. Only the model turn is replaced.
- An audited bundled plugin (`diagnostics-otel`, discovered from a fixture bundled root, so its
  origin is `"bundled"`) holds a turn-time hook in the baseline. That way the gate is checked
  against a real audited owner, not an empty registry.

| step              | config change                                        | `plugins.list` probe entry                                | registry                                                                                                     | gate      | burst                                                                                                                 |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------- |
| (a) baseline      | none                                                 | absent                                                    | audited stand-in only                                                                                        | **true**  | **1** collect turn, senderless; all 3 `completed_at` equal                                                            |
| (b1) load path    | `plugins.load.paths=[probe]`                         | `origin:"config", enabled:true, runtime.state:"unloaded"` | unchanged                                                                                                    | true      | (not run)                                                                                                             |
| (b2) enable       | `plugins.entries.frond-1415-gate-probe.enabled=true` | `runtime.state:"active"`                                  | +1 plugin record, +1 `model_call_started` hook, +1 provenance warning; every other surface equal to baseline | **false** | **3** turns, each the member's own prompt and senderId; 3 distinct `completed_at`, one per turn; no drain refusal log |
| (c1) unset enable | `plugins.entries.frond-1415-gate-probe` removed      | `runtime.state:"unloaded"`                                | equal to baseline; hook set equal to baseline                                                                | true      | (not run)                                                                                                             |
| (c2) unset path   | `plugins.load.paths` removed                         | absent                                                    | equal to baseline                                                                                            | **true**  | **1** collect turn, byte-identical to (a); all 3 `completed_at` equal                                                 |

Every patch reported `requiresRestart: false`, and the Gateway's recovery restart never fired.

"Changes nothing else", as shown in step (b2):

- The probe owns exactly `{plugins: 1, typedHooks: 1, diagnostics: 1}` across every registry array.
- The global hook set gains only `model_call_started`.
- The inventory lists no `contracts` for the probe, so a turn's lazily loaded tool owners are
  unchanged.
- Running the hook through the real runner resolves `undefined`.
- Prompt-building surfaces are unchanged: no `before_prompt_build`, `agent_turn_prepare` or memory
  prompt registrations.

Negative controls (probe files edited locally, run, then restored):

1. Remove `activation` from the manifest: the test fails at (b2). The probe never reaches
   `runtime.state: "active"`.
2. Register `before_agent_run` instead: the test fails at (b2). The probe owns
   `{plugins: 1, diagnostics: 2}` and no `typedHooks`, because the conversation-access block
   adds a second diagnostic. The gate would have stayed open.

## Live seat method (owner commands)

Run these as the seat's own user on the Gateway host. Every write goes through the running
Gateway's `config.patch` (docs/cli/config.md, lines 16-27), and that Gateway is the only writer.
Each write returns `config hot reload applied (<paths>)` in the Gateway journal
(`src/gateway/server-reload-hot.ts:667`, subsystem `gateway/reload`).

```bash
PROBE_ID=frond-1415-gate-probe
PROBE_DIR="$HOME/.openclaw/canary/$PROBE_ID"
```

### 0. Preconditions (read-only)

```bash
openclaw config get gateway.reload.mode            # must be unset (hybrid) or hybrid/hot; stop if off/restart
openclaw config get plugins.enabled                # must not be false
openclaw config get plugins.deny --json            # must not contain frond-1415-gate-probe
openclaw config get plugins.allow --json; echo "allow exit=$?"
openclaw config get plugins.load.paths --json; echo "paths exit=$?"
openclaw config get "plugins.entries.$PROBE_ID" --json; echo "entry exit=$?"   # must be exit=1 (unset)
```

`config get --json` exits 1 with a JSON failure envelope when a path is unset. Record both of
these outputs verbatim. Rollback restores them exactly:

- `plugins.load.paths`: if it exits 1, it is unset, and step 3a creates it. If it exits 0, its
  array must be preserved.
- `plugins.allow`: if it exits 1 or prints `[]`, it is open; leave it alone. Adding an allowlist
  would disable every other non-bundled plugin. If it prints a non-empty array, the probe must be
  added to it in step 3b, or it will not load.

Confirm the seat runs the canary cut built from `3d3364ddc5` (per its deploy receipt).

### 1. Direction A receipt first (probe absent)

Produce a multi-sender burst (section "Evidence" below) and confirm it aggregates. **If the
baseline burst does not aggregate, stop:** something else already holds the gate closed on this
seat, for example another non-bundled plugin with a turn-time hook, or a non-audited bundled tool
plugin. Then the probe can show no toggle. List what is active:

```bash
openclaw gateway call plugins.list --json \
  | jq -c '.plugins[] | select(.runtime.state=="active") | {id, origin}'
```

### 2. Stage the probe

Stage it under the seat's own `~/.openclaw/`, which is not a sovereign workspace and not an
auto-scanned plugin root. Write the two files verbatim, then verify the hash. Any byte
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

**3a. Add the load path.** The probe is now discovered but not loaded; the gate is unchanged.

```bash
# plugins.load.paths was unset (exit=1 in step 0):
openclaw config set plugins.load.paths "[\"$PROBE_DIR\"]" --strict-json
# plugins.load.paths already had entries: append, preserving them in order:
#   openclaw config set plugins.load.paths "$(openclaw config get plugins.load.paths --json | jq -c --arg p "$PROBE_DIR" '. + [$p]')" --strict-json
```

Verify:

```bash
openclaw gateway call plugins.list --json \
  | jq -c '.plugins[] | select(.id=="frond-1415-gate-probe") | {id, origin, enabled, runtime}'
# expect: {"id":"frond-1415-gate-probe","origin":"config","enabled":true,"runtime":{"state":"unloaded"}}
```

**3b. Enable it explicitly.** This loads it on the hot reload, and the gate closes.

```bash
# only if plugins.allow was a non-empty array in step 0:
#   openclaw config set plugins.allow "$(openclaw config get plugins.allow --json | jq -c --arg id "$PROBE_ID" '. + [$id]')" --strict-json
openclaw config set "plugins.entries.$PROBE_ID.enabled" true --strict-json
```

Verify (this is the live check):

```bash
openclaw gateway call plugins.list --json \
  | jq -c '.plugins[] | select(.id=="frond-1415-gate-probe") | {id, origin, enabled, runtime}'
# expect: {"id":"frond-1415-gate-probe","origin":"config","enabled":true,"runtime":{"state":"active"}}
```

`openclaw plugins list` is **not** a live check. It reads the persisted cold registry, not the
running Gateway (docs/cli/plugins/list.md). `runtime.state` above comes from the Gateway's active
registry (`src/gateway/server-methods/plugins.ts:139-150`). Optionally, run
`openclaw plugins inspect frond-1415-gate-probe --runtime --json`. It shows `model_call_started`
as the only hook, from a non-activating inspection pass.

Expected journal line on load (benign): the loader warns because a path plugin has no install
record (`src/plugins/loader-provenance.ts:243-267`):

```
[plugins] frond-1415-gate-probe: OpenClaw can't verify where this plugin came from. Review it with 'openclaw plugins inspect frond-1415-gate-probe'. …
```

A hot reload replaces a channel only when the changed plugin owns a channel or the plugin
command set changes (`src/gateway/server-plugin-reload-channels.ts:87-101`). The probe has
neither, so Discord should stay connected. Confirm that no Discord channel stop/start appears in
the journal around the reload.

### 4. Direction B receipt (probe active)

Produce the same shape of burst. Each member must run as its own turn (see "Evidence").

### 5. Rollback

**5a. Remove the enable entry.** The probe unloads on the hot reload, and the gate reopens.

```bash
openclaw config unset "plugins.entries.$PROBE_ID"
openclaw gateway call plugins.list --json \
  | jq -c '.plugins[] | select(.id=="frond-1415-gate-probe") | {id, origin, enabled, runtime}'
# expect: {"id":"frond-1415-gate-probe","origin":"config","enabled":true,"runtime":{"state":"unloaded"}}
# if step 3b appended to plugins.allow: restore the exact array recorded in step 0
#   openclaw config set plugins.allow '<recorded array>' --strict-json
```

**5b. Remove the load path.**

```bash
# plugins.load.paths was unset in step 0:
openclaw config unset plugins.load.paths
# otherwise restore the exact array recorded in step 0:
#   openclaw config set plugins.load.paths '<recorded array>' --strict-json
openclaw gateway call plugins.list --json \
  | jq -c '[.plugins[] | select(.id=="frond-1415-gate-probe")] | length'
# expect: 0
```

Then remove the staged files, optionally: `rm -r "$PROBE_DIR"`. Finally, repeat the direction A
burst. It must aggregate again; the off-seat proof shows a byte-identical collect turn.

## Evidence for each direction

**Burst shape.** Send at least two unaddressed room messages (not @-mentions of the agent) from
at least two distinct non-owner senders, while the agent is mid-turn in that room. The room queue
must be in collect mode. Peer agents count as senders. Owner messages, mentions, and senders with
elevated grants do not join an aggregate (`delivery-context.ts:176-203`).

**Ingress rows.** Use the seat state database, `~/.openclaw/state/openclaw.sqlite`
(`src/state/openclaw-state-db.paths.ts:41`). Discord rows have `channel_id='discord'`,
`event_id` = the Discord message id, and `lane_key` = `channel:<discord channel id>`
(`extensions/discord/src/monitor/ingress.ts:53-66`). Times are epoch milliseconds.
`completed_at` is stamped when each member's adoption commits
(`src/channels/message/ingress-queue.kernel.ts:404`).

```bash
sqlite3 -readonly "$HOME/.openclaw/state/openclaw.sqlite" \
  "SELECT event_id, received_at, completed_at, status FROM channel_ingress_events
   WHERE channel_id='discord' AND lane_key='channel:<ROOM_CHANNEL_ID>' AND received_at >= <EPOCH_MS>
   ORDER BY received_at;"
```

- **A (aggregate):** the members share one adoption. The collected claim adopts all sources
  together (`src/auto-reply/reply/queue/drain.ts:175-185`), so their `completed_at` are equal, or
  differ by the milliseconds between the sibling commits of that one adoption. All of them follow
  the end of the turn that was running. The session gets **one** new user turn. Its input starts
  `[Queued messages while agent was busy]` and lists `Queued #N (from <sender>)` for each member.
  The turn runs senderless, as the room baseline.
- **B (gated):** each member completes at its own turn. Consecutive `completed_at` values differ
  by at least a full turn's duration, and the session gets **one user turn per member**, each with
  that member's own text and sender.

**Log lines.**

- The gate and its fallback emit **no** log line. Selection keys each member by its own sender,
  and the drain's execution-time re-check defers silently (`drain.ts:300`). The off-seat proof
  asserts that the drain logs nothing in direction B.
- The drain's only refusal line belongs to the mixed-claim guard, not the plugin gate:
  `mailbox refused a mixed claim for <queue key>: not every member may run as the room baseline;
  <N> members retry alone|released unadopted` (`drain.ts:288-298`). It must appear in **neither**
  direction. If it does, report it as a selection-invariant break, not a gate result.
- On the Gateway side, each config write logs
  `config hot reload applied (plugins.load.paths)` or
  `config hot reload applied (plugins.entries.frond-1415-gate-probe…)`. Loading logs the provenance
  warning above.

## Accepted edges

- **Equal `completed_at` is a property of the off-seat test's turn clock.** On a live clock,
  sibling completions of one adoption can differ by a few milliseconds. The discriminating signal
  is a gap of milliseconds within one adoption versus at least a full turn between per-sender
  members, together with the user-turn count.
- **The test's audited plugin is a stand-in.** It is a fixture under an audited id in a fixture
  bundled root. The gate reads only owner id and loader origin, and discovery assigns that origin
  from containment in the bundled root, so the stand-in exercises the same provenance path as the
  fleet's real bundled plugins. It does not exercise those plugins' own surfaces.
- **The test does not run a live channel.** It runs with `OPENCLAW_SKIP_CHANNELS`, so "Discord
  stays connected across the probe reload" is read from code (cited above) and must be confirmed
  on the seat.
