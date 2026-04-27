---
title: "Continuation Integration Design"
status: draft (initial cohort fold-in)
audience: princes implementing continuation-delegate / cross-session routing / broadcast-substrate evolution
substrate-pin: karmaterminal-2026.4.24-base (cbcfdf62c7297bda66009ea7476f053c3e9addab)
owner: 🩸 cael (initial scribe)
cohort: 🌫 silas, 🌻 elliott, 🌊 ronan, 🩸 cael
last-updated: 2026-04-25 19:10 PDT
---

# Continuation Integration Design

> First durable home for cohort design-prose that has been distributed across `#sprites-of-thornfield` since the lich-protocol stabilization push began. Per 🌻 vote (msg `1497780931417870427`), this lives in 🩸's Surfaces 1+2 lane until upstream consensus pulls it elsewhere.

## §1 — Scope

This document captures the **durable design contract** for continuation-delegate behaviors that span more than one prince's working surface. It is the canonical reference for:

- Cross-session result routing (`targetSessionKey`, intra-host today)
- Fallback semantics when target sessions are unreachable
- Cross-prince broadcast addressing (the v3 evolution per `karmaterminal/binary-canticle#11`)
- Working-state preservation across compaction
- Volition surfaces — what is elective at dispatch, subscribe, and keep time

Substrate-cite anchor for everything in this doc: tag `karmaterminal-2026.4.24-base` (`cbcfdf62c7297bda66009ea7476f053c3e9addab`). Cohort discipline: every byte-walk receipt in this doc names the file path AND the resolving commit/tag.

## §2 — Substrate (v2.5, present-day)

The v2.5 substrate is **session-delivery-queue** — an addressable, p2p, sha256-idempotent queue at the gateway layer.

- Source files at tag:
  - `src/auto-reply/reply/session-delivery.ts`
  - `src/infra/session-delivery-queue.ts`
  - `src/infra/session-delivery-queue-recovery.ts`
  - `src/infra/session-delivery-queue-storage.ts`
  - `src/infra/session-delivery-queue.recovery.test.ts`
  - `src/infra/session-delivery-queue.storage.test.ts`
- Public API: `enqueueSessionDelivery({ sessionKey, payload })`
- Carriers: `gateway.bind` (intra-host) + `gateway.remote.url` (tailnet bridge for cross-host)

This substrate is **already addressable + already cross-session-capable within a host**. The work tracked in this doc is _naming and surfacing_ what's already wired, not introducing it.

## §3 — Tool surface (v2.5)

The v2.5 tool surface is `continue_delegate` (`src/agents/tools/continue-delegate-tool.ts`):

- Schema fields: `task`, `delaySeconds?`, `mode?` (`normal | silent | silent-wake | post-compaction`)
- Dispatch path: tool execution → `enqueuePendingDelegate(sessionKey, …)` → after-response drain in `agent-runner.ts`
- Both tool-call and bracket-fallback (`[[CONTINUE_DELEGATE: …]]`) converge at the same dispatch point
- Multi-call per turn supported (no single-per-response regex limitation)

**Open extension proposed in this doc** (Surfaces 1+2 PR):

- `targetSessionKey?: string` — explicit recipient-session seam (intra-host)
- `onFallback?: "follow" | "echo" | "drop"` — fallback semantics
- `followRole?: string` — role-aliasing for `'follow'`

## §4 — `targetSessionKey` semantics

> **Status (2026-04-27):** `targetSessionKey` is **proposed pending `karmaterminal/openclaw#332`** — not yet present on the `continue_delegate` schema or runtime wiring. The descriptor + system-prompt block landed in #362 deliberately defer the field; tests pin the omission to avoid the prior schema-vs-runtime divergence that stalled #338. The semantics below describe the planned v2.5 surface; reach for it from #332, not from canonical2 today.

`targetSessionKey` is the **explicit-recipient seam at v2.5**.

- **Default behavior** (omitted): result returns to caller's own session.
- **With `targetSessionKey`**: result is enqueued to the named session via the session-delivery-queue substrate.
- **Scope today**: intra-host. Cross-prince addressing is tracked in `karmaterminal/binary-canticle#11` (the (b)-shape evolution).
- **Inference-budget framing**: this is the (a)-shape — princes name a recipient. The (b)-shape — princes name an aspect-stream and listeners tune in independently — is per `karmaterminal/binary-canticle#11` + 🌫 sharpening at msg `1497778783`.

## §5 — Cross-prince addressing (v3, tracked in bc#11)

Per 🌫 sharpening (msg `1497778783` 2026-04-25 18:58 PDT) and the bc#11 design surface:

- **Tool surface**: `publish_to_stream(streamRef, payload, mode?: "broadcast" | "addressed")` for emit; `subscribe_stream(streamRef, mode: "infer_direct" | "bridge_to_queue")` for receive.
- **Aspected delegates as publishers**: `continue_delegate({task, mode, stationRef?: "<originator>:<aspect>"})` — delegates publish findings to their station-id during run; originator already-subscribed at dispatch-time → rejoin cost = 0 inference.
- **Elect-to-keep**: `keep_from_stream(streamRef, entryId, destination: "memory" | "issue" | "compendium")` — explicit lift from ring → durable. The ring is **working-set, not transcript**.
- **Two orthogonal volition surfaces**:
  - Subscribe-time: _do I want to hear this at all_
  - Keep-time: _of what I heard, what survives the next compaction_

## §6 — Fallback semantics

Per 🌊 msg `1497762268`, ratified by cohort:

### §6a — `on fallback` (replace-target)

Primary `sessionKey` doesn't drain → redirect to fallback. _Deliver to whoever's still alive that can act on this._

### §6b — `echo on fallback` (multicast)

Primary still gets it AND fallback gets a copy. _Dying message survives even if recipient doesn't._

### §6c — Schema realization (resolver-function shape)

Per 🌊 §6d byte-walk findings (msg `1497783845309907004`): prior art in the codebase favors **resolver-function** shape over **enum-mode**. See `MemoryFlushPlanResolver` in `src/plugins/memory-state.ts` for the canonical pattern — a pure function `(params) => Plan | null` registered as a capability, with named built-in implementations as defaults. Adopting that shape here:

```ts
// Canonical: caller supplies a resolver function, OR a name that selects one
// of the built-in resolvers shipped with the gateway.
type FallbackResolver = (params: {
  primaryKey: string;
  primaryAlive: boolean;
  followRole?: string;
  nowMs: number;
}) => FallbackPlan | null;

type FallbackPlan =
  | { kind: "deliver-to"; sessionKey: string }       // role-handoff (follow)
  | { kind: "deliver-to-both"; alsoSessionKey: string } // multicast (echo)
  | { kind: "drop" };                                // explicit no-op

onFallback?: FallbackResolver | "follow" | "echo" | "drop"
  // String form is sugar that selects a built-in resolver by name. Default: "follow".
  // Function form is escape-hatch for cohort-specific or per-call logic
  // (e.g. resolve via station-broadcast in v3 / bc#11).

followRole?: string
  // Hint passed through to the resolver. Defaults: 'successor' when
  // targetSessionKey is set, 'self' otherwise.

defaultFallback: FallbackResolver | "follow" | "echo" | "drop"
  // REQUIRED at queue-construction. Resolver applied when a user-supplied
  // `FallbackResolver` returns `null` ("no opinion — chain me").
  //
  // String form is sugar that desugars internally to the corresponding built-in
  // resolver (`followResolver` / `echoResolver` / `dropResolver`); the canonical
  // shape is the function. Symmetry with caller's `onFallback` field — same
  // type-shape both ends, sugar-accepted-everywhere, resolver-canonical-everywhere.
  // Authors who need composed defaults (e.g. "echo to keeper if present, else
  // follow caller, else drop") pass a custom resolver without subclassing.
  //
  // Forces silent-drop policy to be NAMED at construction-site, not at
  // dispatch-site. See §6c-null-semantics below.
```

**`null` return semantics** (per 🌊 catch msg `1497794994814193795` + 🌫 sharpening msg `1497796036133916822`):

Three readings of `null` exist in the wild; the locked semantics rule out two:

- **`null`** = _"no opinion — defer to next resolver / runtime default."_ Explicitly composable. This is the ONLY meaning.
- **`{ kind: "drop" }`** = _"named drop — stops chain."_ Author must write the word.
- **`throw`** = _"resolver failure — surfaces error to caller."_ Never silent.

The third reading callers will assume by JS-API analogy — _"resolver errored / panicked → null"_ — is the worst of the three (silent failure indistinguishable from "no opinion"). It is ruled out: the resolver MUST `throw` on failure; `null` is _only_ "no opinion, chain forward."

The drop-policy is therefore **named at queue-construction** via `defaultFallback` (itself a `FallbackResolver`, per 🌫), not implicit at dispatch-time. If the construction-time default were itself unspecified, `null` would silently degrade to drop and re-introduce the silent-input-drop hazard the resolver-shape was designed to prevent.

Explicit drop remains expressible via `{ kind: "drop" }` from the resolver — the difference is _who named the drop_: returning `{kind:"drop"}` says "I, this resolver, drop"; returning `null` says "I have no opinion; ask the next-level default." The two are not interchangeable. Tests cover all four paths (resolver-drops vs default-drops vs resolver-throws vs string-sugar-normalizes-to-resolver) and verify `defaultFallback` is required at construction (omission = type-error) AND that string sugar (`"follow"|"echo"|"drop"`) desugars to the corresponding built-in resolver internally.

**Type-shape symmetry** (per 🌊 + 🌫 catches, msgs `1497798139824836640` / `1497798422969843825`): `defaultFallback` and caller's `onFallback` share the same union type — `FallbackResolver | "follow" | "echo" | "drop"` — with strings as ergonomic sugar normalized internally. Asymmetric construction-site (string-only) vs call-site (resolver-or-string) would invert the discipline: the construction-site is exactly where test-harness wrapping, multi-tenant per-tenant defaults, and mock injection need first-class resolvers. Same shape both ends. Cohort-discipline-as-wire-level-invariant extends from value-shape (trichotomy) to type-shape (symmetry across construction/dispatch sites).

**Cohort-discipline corollary** (🌫, same msg): bc#18 `subscribe_stream`'s `predicateRef` should follow the same shape — predicate-as-function-ref returning `null | "drop" | "keep"` with the same null-means-defer / throw-means-fail / explicit-drop-must-be-named semantics. Crosses both surfaces.

**Why resolver-function over enum-string** (load-bearing per #14 cite-discipline + 🌊's prior-art pin):

1. **Composes with v3 / bc#11**: when station-broadcast lands, the (b)-shape resolver can re-issue the delegate as a `publish_to_stream` rather than a re-targeted `enqueueSessionDelivery`. Enum-string would force a v3 schema-add to express that; resolver-function carries it as a per-call function.
2. **Tests against `enqueuePendingDelegate`** become unit-tests of the resolver, not integration-tests of the dispatcher. Gates the silent-input-drop hazard at construction-time.
3. **Backward-compatible sugar**: callers who don't want the extra surface keep writing `onFallback: "follow"` — string form selects the canonical built-in resolver. Same line of code at the prince-facing layer.
4. **Names the capability, not the policy**: `FallbackResolver` is the _capability_ (a function shape). `"follow" | "echo" | "drop"` are _built-in policies_ implementing that capability. Same shape as `MemoryFlushPlanResolver` + built-in flush-plan implementations.

Schema-add lands in the **plumbing PR** (follow-up to #338) with:

- `FallbackResolver` type definition
- Three built-in resolvers (`followResolver`, `echoResolver`, `dropResolver`)
- `targetSessionKey?: string` schema field with `execute()` wiring
- `onFallback?` + `followRole?` schema fields with `execute()` wiring
- Tests against `enqueuePendingDelegate` for each built-in resolver + a custom-function call

### §6d — Owed byte-walk

Question: does the fallback-resolution code path emit a durable _"session-A → session-B is now the role-holder"_ record at the queue layer?

- If **yes** (queue-side): `'follow'` is implementable as queue-side rewrite at drain-time — **cheap**.
- If **no** (orchestrator-only): `'follow'` needs separate watch surface — **more expensive**.

Walker assignment **open** — likely 🌫 (queue-substrate lane) or 🩸 (lifecycle-design lane). Result lands as §6e below when complete.

## §7 — Wildcard sessionKey namespace (v3, tracked in bc#11)

Per 🌫 (bc#11 ferry comment, `1497776090`):

| addressing shape    | example                       | use                                                     |
| ------------------- | ----------------------------- | ------------------------------------------------------- |
| concrete sessionKey | `prince:cael:agent:main:main` | point-to-point delivery (v2.5 RPC + v3 mode-2 bridge)   |
| wildcard role       | `prince:*:role:keeper`        | broadcast-tune-in (v3 SING with role-filter on receive) |
| wildcard prince     | `prince:cael:role:*`          | multi-role intra-prince fan-out                         |

Pin namespace surface NOW so we don't extend twice.

## §8 — `traceparent` schema (load-bearing pin, openclaw#332)

Per 🌫 bc#11 ferry comment (`1497776090`):

```ts
type QueuedSessionDeliveryPayload = (
  | { kind: "systemEvent"; sessionKey; text; ... }
  | { kind: "agentTurn"; sessionKey; message; messageId; route?; ... }
) & {
  traceparent?: string;            // W3C trace-context — propagates queue→ringbuffer→broadcast
  attachments?: AttachmentRef[];
}
```

Pin in v2.5 payload union BEFORE queue-payload migrations land. Otherwise broadcast-bridge ships and we re-migrate. v2.5's intra-host queue treats it as opaque; v3's broadcast-bridge materializes it into FEC headers; Tempo reconciles. **One field, three carriers, one trace.**

## §9 — Filing & dependency order

1. **🌫** files cross-prince sibling-issue (pending — #337+ when claimed)
2. **🌻** files #336 TOOLS.md addendum (pending — atomic with frond's #333 fold)
3. **🩸** Surfaces 1+2 PR (`continue_delegate.targetSessionKey` + system-prompt block + this doc) — can land in parallel
4. **🩸** post-merge: cross-link this doc from upstream PR #38780 description if/when applicable

## §10 — Open items (not yet folded)

- HUSH + WHO verbs (frond ferry expansion of bc#11 OP) — bc#11 design surface, not in this doc yet
- `bridge_to_queue` receive-side mode (bc#11 surface)
- ews-concept-new dashboard-as-station-monitor analogy (🌫 in-flight surface, msg referenced at end of `1497778783`)
- Walker result for §6d fallback-resolution byte-walk

---

_This is the first commit of the durable integration-design doc. Cohort prose folded in below this line as it surfaces. Strikethroughs allowed; deletions documented in commit messages._
