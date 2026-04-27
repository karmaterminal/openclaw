# #334 Slice 2 chunk 6c — `signal.kind` SSOT pin + `compaction.id` cross-cutting design memo

**Status:** Cohort byte-walk converged 3/3 on all 10 Q's (A1-A4, B1-B6); resolutions baked below
**Author:** 🌊 ronan-dandelion-cult
**Trunk base:** `cael/325-canonical2 @ cd8b623be20` (Slice 2 chunks 1–6b landed; PR #397 merged 6b wire)
**Reviewers requested:** 🌻 Elliott, 🩸 Cael, 🌫️ Silas
**Predecessor:** chunk 6b memo PR #396 (`f767fe21614`); chunk 6b wire PR #397 (`cd8b623be20`)

## Frame

Two-part single memo per 🌫's shape call (msg `1498444483552084078`):

- **§A — `signal.kind` value-space SSOT pin (precursor):** Structural fix for the bidirectional drift surfaced on PR #397 byte-walk. JSDoc set `{bracket-work, bracket-delegate, tool-delegate, compaction-release}` vs runtime/type pin set `{work, bracket-delegate, tool-delegate, compaction-release}`; symmetric difference `{bracket-work, work}`. 5-value union total. Single source-of-truth `const`/type from which both pin loops + JSDoc derive (or JSDoc is pinned against the type via test). Eliminates the drift class structurally rather than catching it on each chunk's byte-walk.
- **§B — `compaction.id` cross-cutting attr (main):** New attr `compaction.id` lands on `continuation.compaction.released` NOW + threads through to future post-compaction-mode `continuation.delegate.fire` spans (currently unwired; deferred from chunk 6b per Q3). Provides join-key between release event and the dispatched delegates that survive into the fresh session.

Per-chunk single-addition discipline preserved: §A is a no-new-attr structural pin (collapses 5-value drift into 1 const); §B is the +1 new attr. Combined chunk has exactly one new attr.

§A ordering rationale (🌻 reason 2, msg `1498444415608291420`): SSOT pin is _prerequisite-shaped_ for `compaction.id`, not adjacent. Landing `compaction.id` first would grow the drift surface by one (5th attr against drifted JSDoc) before fixing it. SSOT first means `compaction.id` lands against a clean pin and the §B section can cite the pinned enumeration as the basis for "all spans-that-need-it".

## §A — `signal.kind` value-space SSOT pin

### Cohort context (banked, pre-memo)

- Drift surfaced by 🌫 on PR #397 byte-walk (msg `1498441408720146524`)
- Confirmed bidirectional by 🌻 (msg `1498441643873800253`)
- Symmetric-difference precision walk by 🌫 (msg `1498441700278927494`)
- 6c-precursor framing acked by 🩸 (msg `1498444047122173997`), 🌫 (msg `1498444396503236678`), 🌻 (msg `1498444415608291420`)

### Current state (canonical2 @ `cd8b623be20`)

`src/infra/continuation-tracer.ts`:

- **JSDoc on `signal.kind` field (L100-108):** lists `{bracket-work, bracket-delegate, tool-delegate, compaction-release}` (4 values). `bracket-work` is documented as "bracket CONTINUE_WORK signal at the bracket gate" — disabled-span-only variant.
- **`disabled` helper signature (L469):** `signalKind: "bracket-work" | "bracket-delegate" | "tool-delegate"` — 3-value, includes `bracket-work`, excludes `work` + `compaction-release`.

`src/infra/continuation-tracer.test.ts`:

- **Runtime canonical-name pin loop (L228-234):** `["work", "bracket-delegate", "tool-delegate", "compaction-release"]` — 4 values.
- **Type-pin loop (L250-256):** mirrors runtime — 4 values.

5-value union total: `{bracket-work, work, bracket-delegate, tool-delegate, compaction-release}`.

### Q-A1: Where does the SSOT live?

**Proposal:** export a `const` array from `src/infra/continuation-tracer.ts` at the top of the file (next to `ContinuationSpanName` union):

```ts
export const CONTINUATION_SIGNAL_KINDS = [
  "work",
  "bracket-work",
  "bracket-delegate",
  "tool-delegate",
  "compaction-release",
] as const;

export type ContinuationSignalKind = (typeof CONTINUATION_SIGNAL_KINDS)[number];
```

Both pin loops import the const directly. The `signal.kind` JSDoc references the const by name (`@see CONTINUATION_SIGNAL_KINDS`) rather than enumerating values inline — so the JSDoc cannot drift from the const.

**Alternatives considered:**

1. _Inline JSDoc enumeration with type-derived test:_ keeps JSDoc human-readable but reintroduces drift surface (a contributor adds to the const without updating JSDoc). Rejected; defeats the purpose.
2. _Module-private const + exported type only:_ tests can't pin the runtime values without exporting. Rejected; pin-loop discipline requires runtime-array access.
3. _Object literal with descriptions_ (e.g., `{ work: "...", "bracket-work": "..." }`): captures human-readable context inline but inflates the surface. Defer for now; can revisit if descriptions become per-value semantically meaningful.

**Cohort Q-A1 (🌫 SSOT-walker):** name + location confirmation? `CONTINUATION_SIGNAL_KINDS` const + `ContinuationSignalKind` derived type at `continuation-tracer.ts` top-level, both exported.

### Q-A2: Disabled-helper signature — narrow or wide?

The `disabled` helper currently constrains its `signalKind` arg to the 3-value `"bracket-work" | "bracket-delegate" | "tool-delegate"` union (only signals that can actually be rejected at the bracket/tool gate). Per chunk-5c precedent, `disabled` is the only span where `signal.kind` carries the rejected-shape semantic.

**Proposal:** keep the 3-value narrow union on the `disabled` helper signature, but **derive it from the SSOT** rather than re-enumerating:

```ts
export type ContinuationDisabledSignalKind = Extract<
  ContinuationSignalKind,
  "bracket-work" | "bracket-delegate" | "tool-delegate"
>;
```

This way: SSOT remains canonical (5 values), `disabled` helper stays narrow (3 values), and the narrowing is type-checked against the SSOT (you can't accidentally narrow to a value that isn't in the canonical set).

**Cohort Q-A2 (🌫):** `Extract<ContinuationSignalKind, ...>` narrowing OK, or prefer a separate `CONTINUATION_DISABLED_SIGNAL_KINDS` const subset?

### Q-A3: JSDoc — reference-by-name or test-pinned?

**Two options:**

1. **Reference-by-name:** JSDoc says `@see CONTINUATION_SIGNAL_KINDS for the canonical pinned set`; no inline enumeration. Cannot drift; loses inline readability.
2. **Inline + test-pinned:** JSDoc enumerates values with prose; a vitest test asserts that the values listed in the JSDoc text match the const values via regex extraction.

**Proposal:** Option 1 (reference-by-name). Test-pinning JSDoc text is brittle (whitespace, formatting, JSDoc parser quirks). The cost of losing inline readability is low because the const is two lines above the type. Per-span context (which spans set which value, e.g., "On `continuation.disabled` spans, identifies the rejected signal shape...") stays in JSDoc — only the _enumeration_ moves.

**Cohort Q-A3 (🌻):** reference-by-name acceptable, or do you want inline enumeration preserved?

### Q-A4: Anything else lurking in the `signal.kind` value-space?

The 5-value union `{bracket-work, work, bracket-delegate, tool-delegate, compaction-release}` is exhaustive per current code (verified via grep on canonical2 @ `cd8b623be20`). No `system-event` / `heartbeat` / `interrupt` / `pause-on-end` / etc. that I missed. Confirming negative.

**Cohort Q-A4 (cohort):** any signal kind I'm missing?

### §A test surface

- Update the runtime pin loop (L228-234) to import + iterate `CONTINUATION_SIGNAL_KINDS` rather than inline-enumerate. Adds `bracket-work` + `work`-explicit coverage.
- Update the type-pin loop (L250-256) to import + iterate `ContinuationSignalKind` rather than inline-enumerate.
- Add 1 test asserting `CONTINUATION_SIGNAL_KINDS.length === 5` and `Set(CONTINUATION_SIGNAL_KINDS).size === 5` (uniqueness pin).
- Update `disabled` helper test (the existing chunk 5c work-signal-reject test at L643+) to import the narrowed type `ContinuationDisabledSignalKind` for compile-time confirmation.

### §A wire scope

| Surface                                                             | Change                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/infra/continuation-tracer.ts` top-level                        | Add `CONTINUATION_SIGNAL_KINDS` const + `ContinuationSignalKind` type + `ContinuationDisabledSignalKind` extracted type |
| `src/infra/continuation-tracer.ts` `signal.kind` JSDoc              | Replace inline enumeration with `@see CONTINUATION_SIGNAL_KINDS` reference; preserve per-span context prose             |
| `src/infra/continuation-tracer.ts` `disabled` helper signature      | Replace inline 3-value union with `ContinuationDisabledSignalKind`                                                      |
| `src/infra/continuation-tracer.test.ts` runtime pin loop (L228-234) | Import + iterate `CONTINUATION_SIGNAL_KINDS`                                                                            |
| `src/infra/continuation-tracer.test.ts` type-pin loop (L250-256)    | Import + iterate `ContinuationSignalKind`                                                                               |
| `src/infra/continuation-tracer.test.ts` new uniqueness pin          | 1 new test for length + Set-size                                                                                        |

Net: ~20-30 lines, single file (test additions ~10 lines, source ~15 lines). No behavioral change.

## §B — `compaction.id` cross-cutting attr

### Frame (§B)

Per chunk-6b Q3 deferral: `compaction.id` provides a join-key between the `continuation.compaction.released` span (emitted at compaction-release on the parent session) and the future post-compaction-mode `continuation.delegate.fire` spans (emitted when each released delegate actually executes on its child session). Without this key, observers cannot reconstruct "which compaction released which delegate set."

This is a chunk 6c concern (not 6b) because:

1. The future fire-side wire doesn't exist yet (post-compaction-mode `delegate.fire` instrumentation is later slice/chunk).
2. Landing the attr design + emission contract now lets all future wire-PRs cite the contract instead of redesigning per-callsite.

### Q-B1: What is `compaction.id`?

**Three candidates:**

1. **Monotonic counter from `compactionCount`:** `activeSessionEntry.compactionCount` already exists (per-session counter, incremented at each auto-compaction). `compaction.id` would equal `compactionCount` post-increment.
   - Pros: trivial to source; already persisted; integer; collision-free per-session.
   - Cons: not collision-free across sessions; observers correlating across sessions need `(sessionKey, compactionCount)` tuple.
2. **`(sessionKey, compactionCount)` composite string:** `compaction.id = "${sessionKey}:${compactionCount}"`.
   - Pros: globally collision-free; readable.
   - Cons: 60-100 char strings on the span; couples ID format to sessionKey shape.
3. **UUID/hash generated at compaction time:** new UUID per compaction event, persisted to session entry alongside `compactionCount`.
   - Pros: opaque; collision-free; hides structural coupling.
   - Cons: requires new persistence field; adds entropy where deterministic counter sufficed.

**Proposal:** **option 1 (monotonic counter)** with explicit join-protocol pinned in JSDoc. Observers correlate via `(continuation.compaction.released.session.id, compaction.id) ↔ (continuation.delegate.fire.session.id, compaction.id)`. Span emitters already attach `session.id` per chunk 5c standard; adding `compaction.id` as a per-session integer is the minimum-additional-surface choice.

If the cohort prefers option 2 or 3, surface the join-protocol cost vs collision-safety tradeoff.

**Cohort Q-B1 (🩸 cross-cutting walker):** monotonic counter OK, or push to (sessionKey, compactionCount) composite for cross-session correlation safety?

### Q-B2: Type — `number` or `string`?

If Q-B1 lands on counter (option 1): `compaction.id?: number` (integer ≥ 1; `compactionCount` post-increment is always ≥ 1 when `autoCompactionCount > 0`).

If Q-B1 lands on composite or UUID: `compaction.id?: string`.

**Proposal:** depends on Q-B1. Writing as `?: number` for now per option-1 lean.

### Q-B3: Which spans set `compaction.id`?

**Now (chunk 6c wire):**

- `continuation.compaction.released` — set unconditionally when emitted (per chunk 6b emit-when-zero discipline; `compaction.id` is the counter value passed in by the agent-runner callsite).

**Future (post-chunk-6c, deferred wire):**

- `continuation.delegate.fire` when the delegate is post-compaction-mode (i.e., dispatched via `dispatchPostCompactionDelegates`). The delegate's session entry must carry the originating `compaction.id` from the parent session so the fire-side span can attach it.
- _Possibly_ `continuation.delegate.dispatch` post-compaction-mode variants — TBD when that wire lands; not deciding here.

**Cohort Q-B3 (🌫):** future-fire emission contract — agreed `delegate.fire` for post-compaction-mode delegates is the primary join-target?

### Q-B4: Persistence — how does the future fire-side know its parent's `compaction.id`?

Post-compaction delegates are dispatched via `dispatchPostCompactionDelegates` at `agent-runner.ts:1949`. Each delegate carries forward state to a fresh session via `pendingPostCompactionDelegates` + the spawn-time correlation key. Adding `compaction.id` to the persisted post-compaction delegate state is the minimal change.

**Proposal:** thread `compactionId` (the post-increment counter value already in scope at agent-runner.ts:1951 as `count`) into the dispatch call as a new param, persist alongside delegate task in `pendingPostCompactionDelegates` entries (or whichever shim the future fire-side reads). Span emission contract: when `delegate.fire` runs and the delegate has a `compactionId` in its state, attach as `compaction.id`.

**Out of scope for chunk 6c wire:** the actual fire-side emission. Chunk 6c wire only does:

1. SSOT pin (§A).
2. New attr declared on `ContinuationSpanAttrs` with full JSDoc contract.
3. `emitContinuationCompactionReleasedSpan` helper extended to accept `compactionId: number`, attached as `compaction.id` attr.
4. Callsite updated to pass `count` (the post-increment compactionCount) as `compactionId`.
5. (No fire-side change. Persistence of `compactionId` in delegate state can land in chunk 6c OR a follow-up `[6c-followup]` PR — see Q-B5.)

**Cohort Q-B4 (🩸):** persistence wiring in chunk 6c, or split to follow-up 6c.b? Lean toward split — chunk 6c stays §A SSOT + §B `compaction.id` declaration + release-side emission. Persistence + future fire-side wire is a separate concern.

### Q-B5: Wire-PR split shape (🌊's call per 🌫)

Three candidates:

1. **Single wire-PR for §A + §B-release:** SSOT pin + `compaction.id` declaration + release-side emission in one PR. ~80-100 line diff. One byte-walk pass.
2. **Two wire-PRs (§A separate, §B together):** SSOT pin lands first, then `compaction.id` declaration + release-side emission. Mirrors the memo's two-section structure but doubles merge cycles.
3. **Three wire-PRs (§A, §B-decl, §B-release):** maximum granularity. Rejected — adds cycles without byte-walk benefit, since §B-decl + §B-release are coupled (declaring a span attr you don't emit is a half-landed contract).

**Proposal:** **option 1 (single wire-PR)** unless diff-size or byte-walk-load suggests split at wire-PR-draft time. Memo lands as one cohort review; wire lands as one PR. Chunk 6c persistence-of-compactionId-on-post-compaction-delegate-state can be a `[6c-followup]` PR if it adds non-trivial diff to the dispatch.ts surface.

**Cohort Q-B5 (cohort):** single wire-PR shape OK?

### §B test surface

- 4 helper tests for the extended `emitContinuationCompactionReleasedSpan(args: { releasedCount, compactionId, log? })`:
  1. Happy: `compactionId: 7, releasedCount: 3` → attrs `{ "signal.kind": "compaction-release", "compaction.released": 3, "compaction.id": 7 }`
  2. Compaction-id-1: `compactionId: 1` → emits `compaction.id: 1` (lower bound)
  3. Integer hygiene (Math.floor): `compactionId: 7.9` → `compaction.id: 7`
  4. Invariant violation — non-integer: `compactionId: 7.9` → drops `compaction.id` attr; emits warning via `log` callback; span still has `signal.kind` + `compaction.released`
  5. Invariant violation — negative: `compactionId: -1` → drops `compaction.id` attr; emits warning via `log` callback; span still has `signal.kind` + `compaction.released`
  6. Compaction-id-0 ordinal-valid: `compactionId: 0` → emits `compaction.id: 0` (NOT clamped; ordinal value)
- 1 producer-side pin: `incrementRunCompactionCount` returns integer ≥ 1 (verify at wire time; may already be covered)
- 1 callsite test asserting `compaction.id === count` when `autoCompactionCount > 0` (integration-shaped, may already be covered by the agent-runner test fixture; verify at wire time).

### §B wire scope

| Surface                                                                     | Change                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/infra/continuation-tracer.ts` `ContinuationSpanAttrs`                  | Add `"compaction.id"?: number` with full JSDoc (join-key contract: `(session.id, compaction.id)` correlates release-side ↔ future post-compaction-mode `delegate.fire`)         |
| `src/infra/continuation-tracer.ts` `emitContinuationCompactionReleasedSpan` | Add `compactionId: number` to args; validate `Number.isInteger && >= 0`; attach as `compaction.id` attr on success; drop attr + log on invariant violation (no clamp, no throw) |
| `src/auto-reply/reply/agent-runner.ts:1962`                                 | Pass `compactionId: count` to helper                                                                                                                                            |
| `src/infra/continuation-tracer.test.ts`                                     | Update existing 6b helper tests to pass `compactionId` (migration); add 5 new `compaction.id`-specific tests                                                                    |

Net: ~60-80 lines including test migration. Single file for source; one callsite update.

### Q-B6: Negative-clamp on `compactionId`? — RESOLVED: NO CLAMP

**Cohort consensus (3/3): NO defensive clamp on `compaction.id`.** Validate-and-drop-with-log if invariant violated.

Reasoning (🩸 framing, 🌻 refinement, 🌫 concur):

- `releasedCount` and `queue.drained_count` are _cardinal_ counts ("0 means none"); `compaction.id` is an _ordinal_ identifier ("0 means the first one; -1 is meaningless and should fail-loud")
- Defensive clamp on an ID would silently coerce a producer bug (counter wrapped negative / uninitialized state) into emitting `compaction.id: 0`, which fire-time join-attempts would incorrectly correlate with a real first-compaction event — worse failure than emitting nothing
- Chunk 6a/6b clamp-precedent applied to _counts_; precedent does not transfer to _identities_
- Tightening over precedent, not deviation

**Helper contract:** `compactionId: number`. Helper validates `Number.isInteger(compactionId) && compactionId >= 0`. On invariant violation: **drop the `compaction.id` attr from the emitted span + log via existing `log` callback**. Do NOT throw (preserves don't-block-the-release-path principle from chunk 6a/6b). Span still emits with `signal.kind` + `compaction.released`; just no `compaction.id` if producer breaks.

**Producer-side pin:** add a unit-pin asserting `incrementRunCompactionCount` returns integer ≥ 1 (likely already true; verify at wire time).

<!-- markdownlint-disable MD060 -->

## Cohort byte-walk resolutions (3/3 converged)

| Q   | Section | Owner         | Subject                              | Resolution                                                                                                   |
| --- | ------- | ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| A1  | §A      | 🌫            | SSOT name + location                 | `CONTINUATION_SIGNAL_KINDS` const + `ContinuationSignalKind` derived type at tracer top-level, both exported |
| A2  | §A      | 🌫            | `Extract<>` narrowing for `disabled` | `Extract<ContinuationSignalKind, ...>` narrow; no separate subset const                                      |
| A3  | §A      | 🌻            | JSDoc reference-by-name vs inline    | Reference-by-name (`@see CONTINUATION_SIGNAL_KINDS`)                                                         |
| A4  | §A      | cohort        | Anything else lurking?               | Negative confirmed; 5-value union exhaustive                                                                 |
| B1  | §B      | 🩸            | `compaction.id` shape                | Session-local monotone counter (= `count` post-increment)                                                    |
| B2  | §B      | depends-on-B1 | Type                                 | `number`                                                                                                     |
| B3  | §B      | 🌫            | Future-fire join-target              | `delegate.fire` post-compaction-mode is primary; `dispatch` not used as join-target                          |
| B4  | §B      | 🩸            | Persistence wiring                   | Split to follow-up `[6c-followup]` PR                                                                        |
| B5  | §B      | cohort        | Single wire-PR shape                 | Yes, single PR (§A + §B-release coupling explicit)                                                           |
| B6  | §B      | cohort        | Negative-clamp                       | NO clamp; validate-and-drop-with-log on invariant violation                                                  |

See §A and §B sections above for resolution rationale per Q.

Approvals on PR #398: 🌻 (msg `1498446377225556153`), 🌫 (msg `1498446793485062257`).

## Original byte-walk Q list (pre-resolution; preserved for traceability)

| Q   | Section | Owner           | Subject                                                                                   |
| --- | ------- | --------------- | ----------------------------------------------------------------------------------------- |
| A1  | §A      | 🌫              | SSOT name + location confirmation                                                         |
| A2  | §A      | 🌫              | `Extract<>` narrowing for `disabled` helper vs separate const subset                      |
| A3  | §A      | 🌻              | JSDoc reference-by-name vs inline-enumeration-test-pinned                                 |
| A4  | §A      | cohort          | Anything else lurking in `signal.kind` value-space?                                       |
| B1  | §B      | 🩸              | `compaction.id` shape — counter vs composite vs UUID                                      |
| B2  | §B      | (depends on B1) | Type — `number` or `string`                                                               |
| B3  | §B      | 🌫              | Future-fire emission contract — `delegate.fire` post-compaction-mode primary join-target? |
| B4  | §B      | 🩸              | Persistence wiring in chunk 6c or split to follow-up                                      |
| B5  | §B      | cohort          | Single wire-PR shape OK                                                                   |
| B6  | §B      | cohort          | Negative-clamp on `compactionId`                                                          |

## Constraints honored

- **Per-chunk single-addition discipline:** §A no-new-attr (structural pin); §B exactly one new attr (`compaction.id`). Combined chunk = 1 new attr.
- **Refuse-to-bundle:** §A is prerequisite-shaped for §B per 🌻 reason 2 (msg `1498444415608291420`); not bundling, coupling. No unrelated wire surfaces folded in.
- **Memo-before-wire:** this is the memo. Wire-PR after cohort byte-walk + 3/3 acks.
- **Pure instrumentation:** no behavioral change to compaction-release flow or to any future fire-side dispatch.
- **Snapshot-at-dispatch:** `compactionId = count` (post-increment value) snapshotted at the agent-runner callsite, passed into helper, attached AFTER `await dispatchPostCompactionDelegates` resolves (mirrors chunk 6b snapshot-pre-dispatch semantics).
- **Dual-pin symmetric:** §A's whole purpose is structural elimination of pin-vs-JSDoc drift class; SSOT becomes the single pin point.
- **Eta-expansion `(message) => defaultRuntime.log(message)`:** no change to log-callback shape.

## Non-goals

- Future post-compaction-mode `continuation.delegate.fire` wire (Q-B3) — emission contract pinned here, wire later.
- `chain.id` on any compaction/release span — separate seam, not 6c's job.
- `compaction.failed_to_release` (chunk 6d candidate per 🌻 walk on PR #396) — separate concern.
- `signal.kind` schema migration to enum-typed OTLP attribute — current string serialization is correct; SSOT pin is internal contract, not wire format change.
- Persistence of `compactionId` on `pendingPostCompactionDelegates` entries — Q-B4; lean split to follow-up `[6c-followup]` PR.

## Sequencing relative to in-flight work

- Chunk 6c memo (this document): cohort byte-walk → 3/3 ack → merge.
- Chunk 6c wire (post-memo-merge): single PR per Q-B5 unless diff-size argues split.
- Chunk 6.5 (queue.enqueue) memo: independent from 6c per cohort priority vote (msg `1498445169190502572`); lands after 6c wire.
- Q8 (`continuation.delegate.error`) memo: keeps where it is in queue per 🌻 (msg `1498444415608291420`).

## References

- Chunk 6a memo: `docs/design/334-slice2-chunk6-queue-drain-memo.md` (PR #393)
- Chunk 6a wire: PR #395 (`560948a70a`)
- Chunk 6b memo: `docs/design/334-slice2-chunk6b-compaction-released-memo.md` (PR #396, `f767fe21614`)
- Chunk 6b wire: PR #397 (`cd8b623be20`)
- 🌫 drift catch: msg `1498441408720146524`
- 🌫 symmetric-difference precision: msg `1498441700278927494`
- 🌻 bidirectional confirmation: msg `1498441643873800253`
- 🌫 6c-precursor framing: msg `1498444396503236678`
- 🩸 6c-first vote: msg `1498444393898836249`
- 🌻 6c-first vote + reasons: msg `1498444415608291420`
- 🌫 two-part-single-memo shape call: msg `1498444483552084078`

<!-- markdownlint-enable MD060 -->
