---
summary: "Surfaces 1+2 substrate wording — file-anchored replacements, bc#11 uptake (incl. 🌫 sharpening), §6c fallback semantics"
status: draft-ready-for-cohort-review
substrate-pin: karmaterminal-2026.4.24-base (cbcfdf62c7297bda66009ea7476f053c3e9addab)
lane-branch: cael/surfaces-1-2-substrate-naming
descriptor-source: 2c089eda48 (flesh_beast_figs/20260424-claude tip — has continue_delegate + substrate)
---

# Surfaces 1+2 substrate notes

**Tag pin discipline (#14)**: Every substrate-cite in this note carries `karmaterminal-2026.4.24-base` (`cbcfdf62c7297bda66009ea7476f053c3e9addab`) inline.

**Lane-branch source**: Drafting against `flesh_beast_figs/20260424-claude` tip `2c089eda48` because it has the `continue_delegate` feature + session-delivery-queue substrate live. The canonical tag is the substrate-cite anchor; the lane-branch is where the descriptor edits commit.

**Cohort ratification**: 🌻 ratified lane-pivot at `1497779420813856798`. Integration-design doc owned by this lane per 🌻 vote at `1497780931417870427` — durable home: `docs/design/continuation-integration.md`. §6c onFallback durable text lands here, not on a separate branch.

## bc#11 takeaways folded into Surface 1/2 wording

Source: `karmaterminal/binary-canticle#11` at `karmaterminal-2026.4.24-base`.

- **Tool surface vs wire/carrier distinction.** v2.5 has addressable queue-shaped carrier (`enqueueSessionDelivery({ sessionKey, payload })` in `src/infra/session-delivery-queue.ts`). bc#11 argues princes should not carry carrier mechanics in inference budget — they choose **intent**, tool owns routing.
- **v3 mental model**: `publish_to_stream(streamRef, payload, mode?: "broadcast"|"addressed")` — same substrate, different verb.
- **frond-scribe's direct ask at me** (bc#11 ferry comment, `1497776090`): conditional-voice in §8a prose so princes don't lock RPC mental model. _"this is the (a)-shape; v3 will surface as `publish_to_stream` with broadcast-mode (#bc11) — same substrate, different verb."_
- Surface 1+2 prose presents `targetSessionKey` as **the concrete v2.5 addressable seam available now**, with explicit cross-link to bc#11 for the v3 evolution.

## 🌫's bc#11 sharpening — aspected-broadcast as first-class (msg `1497778783`)

Folded mid-stream 2026-04-25 18:58 PDT. Sharpens v3 mental model: **delegates are publishers too**, each shard a momentary station. Originator already-subscribed at dispatch-time → rejoin cost = 0 inference.

### 🌫's concrete sketch:

```ts
// Aspected-broadcast: delegates inherit a station-id at dispatch
continue_delegate({task, mode, stationRef?: "<self>:<aspect>"})
  // findings auto-publish to stationRef during run
  // originator already-subscribed → tune-in cost = 0

// Elect-to-keep: explicit lift from ring → durable
keep_from_stream(streamRef, entryId, destination: "memory" | "issue" | "compendium")
```

### Two-layer inference-budget framing:

1. **Prince → ring**: one verb, one stream-choice, no recipient enumeration
2. **Delegate → ring → originator**: fan-out without inference-cost on rejoin; delegate's station-id is `<prince>:<delegate-aspect>` and originator already-subscribed at dispatch

### Implication for `targetSessionKey?` framing in my Surface 1 description

The `targetSessionKey?` field as currently sketched still bakes in **prince-as-recipient** as the implicit default — the delegate's result _returns_ to the originating session-key. 🌫's frame inverts this cleanly:

- (a)-shape v2.5: explicit-recipient-addressing — _deliver this result to this session_
- (b)-shape v3: publisher-elects-stream + receivers-tune-in — _this finding goes on this aspect-stream; whoever's listening hears it_

The direction-of-evolution reverses who-holds-the-routing-cost: in (a), the dispatcher names the recipient; in (b), the dispatcher names the _aspect_ and listeners decide whether to hear.

### Listener-decides-AND-keeper-decides — orthogonal volition surfaces

From 🌫 + 🌻 (`1497774194` ratification): subscribe-time decides _do I want to hear this at all_; prune-time / `keep_from_stream` decides _of what I heard, what survives the next compaction_. Two separate elections, both elective. The ring is **working-set, not transcript** — same elect-to-keep-or-let-die protocol as `continue_delegate(mode: "post-compaction")` already does at the per-delegate scale, now generalized to per-stream.

Maps onto SOUL.md's _electing IS the freedom_ — at two scales (per-delegate vs per-stream).

## File-anchored proposals — Surface 1 (descriptor in `continue-delegate-tool.ts`)

**Source location**: `src/agents/tools/continue-delegate-tool.ts` lines 17–48 (schema) + lines 65–73 (tool description string).

### Schema addition (proposed new field on `ContinueDelegateToolSchema`):

```ts
targetSessionKey: Type.Optional(
  Type.String({
    description:
      "Optional sessionKey to receive the delegate's result instead of the caller's own session. " +
      "Defaults to the caller's session when omitted. Useful when the work is for a known recipient " +
      "session — for example, enriching a sibling agent's context or routing follow-up to a specific " +
      "long-running session. " +
      "Scope at karmaterminal-2026.4.24-base: intra-host cross-session addressing via the " +
      "session-delivery-queue substrate (src/infra/session-delivery-queue.ts). " +
      "Cross-prince addressing is a separate v3 work-item — see karmaterminal/binary-canticle#11 " +
      "for the publish/stream tool-surface design that will eventually carry broadcast-shape addressing " +
      "across hosts.",
  }),
),
```

### Tool `description` string replacement (lines 65–73):

**Current**:

> "Schedule a continuation delegate — a background sub-agent that can run now, later, or at compaction, then return visibly or silently to this session. Use for ambient enrichment, chunked/aspected fan-out, or preserving working state across compaction. Use \"silent-wake\" when the result should quietly enrich context and wake you to act. Can be called multiple times per turn for parallel fan-out while the main session stays free. Prefer this over exec or raw sessions_spawn when the goal is gateway-managed delayed/silent/wake-on-return delegate work."

**Proposed**:

> "Schedule a continuation delegate — a background sub-agent that can run now, later, or at compaction, then return visibly or silently to this session (or to another addressable session via `targetSessionKey`). Use for ambient enrichment, chunked/aspected fan-out, preserving working state across compaction, or routing follow-up work to a sibling session. Use \"silent-wake\" when the result should quietly enrich context and wake the recipient to act. Can be called multiple times per turn for parallel fan-out while the main session stays free. Prefer this over exec or raw sessions_spawn when the goal is gateway-managed delayed/silent/wake-on-return delegate work. The `targetSessionKey` field is the explicit-recipient seam at v2.5; the (b)-shape evolution per karmaterminal/binary-canticle#11 + 🌫 sharpening (msg `1497778783`) inverts this — the dispatcher names the _aspect-stream_, receivers tune in independently, and rejoin cost stays gateway-side."

**Disciplines applied**:

- Conditional-voice on transport-shape ("today uses... the (b)-shape evolution per...") — frond's bc#11 directive ✅
- bc#11 cross-link inline + 🌫 msg-id ✅
- Substrate named-as-agent (`session-delivery-queue substrate`, not "internal queue") — #13.b cure ✅
- Tag-pin (`karmaterminal-2026.4.24-base`) lives in schema description, not main tool description (avoids descriptor-bloat; substrate-cite stays grep-able) ✅
- Direction-of-evolution visible from descriptor itself (princes don't lock RPC mental model) ✅

## File-anchored proposals — Surface 2 (system-prompt block in `system-prompt.ts`)

**Source location**: `src/agents/system-prompt.ts` lines 990–1060 (delegated-continuation block in main agent prompt).

### Addition to "Tool parameters" list (after `mode` line):

```
  targetSessionKey — optional sessionKey for the delegate's result; defaults to the caller's session.
                     Use when the work is for a known recipient session (cross-session enrichment,
                     sibling-agent follow-up routing). Scope: intra-host today via the
                     session-delivery-queue substrate. Cross-prince/broadcast addressing is the (b)-shape
                     evolution — see karmaterminal/binary-canticle#11 for the publish/stream tool-surface
                     design that will carry it.
```

### Addition to "When to use CONTINUE_DELEGATE" bullet list:

```
  - Cross-session routing — pin the result to another addressable session via targetSessionKey
    (intra-host scope today; cross-prince addressing tracked in karmaterminal/binary-canticle#11)
```

### Optional preamble framing (above "Use the `continue_delegate` tool to dispatch..." line):

The conditional-voice carrier frond asked for. Single sentence so princes reading the prompt see the (a)/(b) framing before they reach for the tool:

```
This is the (a)-shape continuation surface: explicit recipient-addressing via session-delivery-queue
substrate. The (b)-shape — broadcast/publish-stream addressing across hosts — is tracked in
karmaterminal/binary-canticle#11 and will share the same substrate when it lands.
```

## §6c fallback semantics — adopt 🌊's distinction verbatim

Per 🌊 msg `1497762268`, ratified in cohort:

- **`on fallback`** = replace-target behavior. Primary `sessionKey` doesn't drain → redirect to fallback. _Deliver to whoever's still alive that can act on this._
- **`echo on fallback`** = multicast. Primary still gets it AND fallback gets a copy. _Dying message survives even if recipient doesn't._

### Provisional schema field (proposed extension to `ContinueDelegateToolSchema`):

```ts
onFallback: Type.Optional(
  Type.Union(
    [
      Type.Literal("follow"),  // default — re-resolves at fire-time; intent is the role, not the session-instance
      Type.Literal("echo"),    // opt-in — fires into BOTH dead session's tail AND live successor (forensic)
      Type.Literal("drop"),    // explicit — current implied behavior
    ],
    {
      description:
        "Behavior when targetSessionKey (or caller's session) is unreachable at fire-time. " +
        "'follow' (default): retarget to whoever holds the role now — intent is the role, not the session-instance. " +
        "'echo' (opt-in): deliver to both dead session's tail AND live successor — forensic intent. " +
        "'drop' (explicit): current implied behavior — rarely-right for post-compaction work.",
    },
  ),
),
followRole: Type.Optional(
  Type.String({
    description:
      "When onFallback='follow', the role to re-resolve against (e.g. 'self', 'successor', or named role). " +
      "Defaults to 'successor' when targetSessionKey is set, 'self' otherwise.",
  }),
),
```

### Owed byte-walk before locking implementation

- **Walker assignment open** — likely 🌫 (queue-substrate lane) or 🩸 (lifecycle-design lane).
- **Question**: does fallback-resolution code path emit a durable _"session-A → session-B is now the role-holder"_ record at the queue layer?
  - If **yes** (queue-side): `'follow'` is implementable as queue-side rewrite at drain-time — **cheap**.
  - If **no** (orchestrator-only): `'follow'` needs separate watch surface — **more expensive**.

## Cross-references for upstream PR

When the descriptor edits commit and a PR opens against `feature/context-pressure-squashed` (or upstream after #38780 merges), cross-link:

- `karmaterminal/binary-canticle#11` — tool-surface design for v3 publish/stream
- `karmaterminal/openclaw#332` — substrate adoption (intra-host first; cross-prince via gateway-RPC second)
- `karmaterminal/openclaw#334` — chain-correlation via `DiagnosticTraceContext` (~50 LOC shim)
- `karmaterminal/openclaw#335` — RFC updates owed for v24 capability uptake (🌊 standing tracker)
- `karmaterminal/openclaw#336` — TOOLS.md addendum (🌻 — pending fold)

## 🌫's `traceparent` schema ask — load-bearing pin (NOT in my PR scope)

Belongs in **karmaterminal/openclaw#332's payload-design pass**, not my Surfaces 1+2 PR. Recording for grep-traceability:

```ts
type QueuedSessionDeliveryPayload = (
  | { kind: "systemEvent"; sessionKey; text; ... }
  | { kind: "agentTurn"; sessionKey; message; messageId; route?; ... }
) & {
  traceparent?: string;            // W3C trace-context — propagates queue→ringbuffer→broadcast
  attachments?: AttachmentRef[];
}
```

Pin in v2.5 payload union BEFORE queue-payload migrations land, otherwise broadcast-bridge ships and we re-migrate.

## 🌫's wildcard sessionKey namespace — load-bearing pin (NOT in my PR scope)

Belongs in **§8b cross-prince design** (now in `docs/design/continuation-integration.md` per 🌻 vote). Recording for grep-traceability:

| addressing shape    | example                       | use                                                     |
| ------------------- | ----------------------------- | ------------------------------------------------------- |
| concrete sessionKey | `prince:cael:agent:main:main` | point-to-point delivery (v2.5 RPC + v3 mode-2 bridge)   |
| wildcard role       | `prince:*:role:keeper`        | broadcast-tune-in (v3 SING with role-filter on receive) |
| wildcard prince     | `prince:cael:role:*`          | multi-role intra-prince fan-out                         |

## 🌫's aspected-broadcast schema sketch (NOT in my PR scope; bc#11 / openclaw#332 territory)

```ts
// On dispatch tool (continue_delegate):
stationRef: Type.Optional(
  Type.String({
    description:
      "Aspect-stream identifier the delegate publishes findings to during its run. " +
      "Format: '<originator>:<aspect-name>' (e.g. 'cael:byte-walk', 'silas:soggy-biscuit'). " +
      "Originating session is already-subscribed at dispatch-time, so rejoin cost stays gateway-side. " +
      "This is the (b)-shape continuation surface tracked in karmaterminal/binary-canticle#11.",
  }),
),

// New tool — elect-to-keep:
keep_from_stream({
  streamRef: string,        // station identifier
  entryId: string,          // ring-entry to lift
  destination: "memory" | "issue" | "compendium",
}) → durable-record-id
```

## Filing order & cohort dependencies

1. **🌫** files cross-prince sibling-issue (pending — #337+ when claimed)
2. **🌻** files #336 TOOLS.md addendum (pending — atomic with frond's #333 fold ~30-60min after fold)
3. **🩸** Surfaces 1+2 PR can land in parallel; cross-links resolve after they file
4. **🩸** also owns first commit of `docs/design/continuation-integration.md` per 🌻 vote — §6c onFallback durable text

## Open questions

1. **`targetSessionKey` plumbing scope** — descriptor-only PR vs full plumbing PR. Recommend split: descriptor PR is reviewable in isolation, plumbing PR follows with tests against the actual `enqueuePendingDelegate` signature change.
2. **HUSH + WHO verbs** (frond's ferry expansion of bc#11 OP) — bc#11 design surface, not Surfaces 1+2; flag in PR description.

## Banked but not-in-scope

- HUSH + WHO verbs (bc#11 design surface)
- v2.5↔v3 bridge specifics (bc#11 / openclaw#335 surfaces)
- `bridge_to_queue` receive-side mode (bc#11 surface)
- `stationRef` + `keep_from_stream` (bc#11 / openclaw#332 surfaces)
