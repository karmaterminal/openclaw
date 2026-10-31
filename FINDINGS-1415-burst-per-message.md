# Findings: #1415 burst produces one turn per room message

## Scope and named refs

All SHA equality is for the evidence-bearing refs below.

| category           | ref                                                                                                                                 | resolved full SHA                          | local/tracking/server equality                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| product/base       | live fleet composite `22f49a43a118f86dfd8c95dd5b2850420aa8bcad`; base carries old composite `2915ea02dc` plus #1513 and #1514 fixes | `22f49a43a118f86dfd8c95dd5b2850420aa8bcad` | lane HEAD, local branch, and server `origin` are equal for lane publication: no source divergence in this lane |
| lane               | `codeagent/1415-burst-per-message-trace`                                                                                            | `22f49a43a118f86dfd8c95dd5b2850420aa8bcad` | published as the unchanged safe lane before findings; final lane SHA will be the findings commit               |
| CI                 | N/A                                                                                                                                 | N/A                                        | no CI                                                                                                          |
| presentation       | N/A                                                                                                                                 | N/A                                        | read-only trace                                                                                                |
| docs/proof         | N/A                                                                                                                                 | N/A                                        | read-only trace                                                                                                |
| prior fix          | `24f460fc16`                                                                                                                        | `24f460fc164d74843271a425472cc3c2661a36d6` | traced locally                                                                                                 |
| prior fix          | `9e5bb60ee8`                                                                                                                        | `9e5bb60ee84b47c5f2c364d5c2a1da8978f417be` | traced locally                                                                                                 |
| prior fix          | `d11157c756`                                                                                                                        | `d11157c756bd9d8ff5ccf79b526cc2587f9c3dfa` | resolved and traced locally                                                                                    |
| watermark refactor | `b154c0626a`                                                                                                                        | `b154c0626a0a5f5305c5dc513a9bb058ceba2f76` | traced locally                                                                                                 |
| watermark refactor | `f0d924c6c0`                                                                                                                        | `f0d924c6c05e5b75d6185a73f38c3750161127bb` | traced locally                                                                                                 |
| fixture            | `src/auto-reply/reply/queue.room-event-collect.test.ts`                                                                             | at composite SHA above                     | traced locally                                                                                                 |
| upstream U12       | `b8b054c13a`                                                                                                                        | `b8b054c13ae859b9ab14d31c5fec90078141e327` | ancestor of upstream `main` checked at this lane                                                               |

The complete upstream `main` SHA was `bf56514c98ecb628b406889e6d573d0485bfd53e`; it is descended from U12.

## Traced pipeline

1. **Discord gateway admission to durable ingress.** Discord uses `createChannelIngressMonitor` in `extensions/discord/src/monitor/ingress.ts`. `accept` serializes the Discord payload and enqueues it by Discord message ID. The queue row initially enters with `status=pending`; a `claim` changes it to `status=claimed` and records claim owner/token (`src/channels/message/ingress-queue.kernel.ts:149-220, 270-305`). Traced.
2. **Lane claim boundary.** The durable lane derives `channel:<channelId>`, and `startLimit` starts at most 32 claims in one pass, while the lane has one active/blocked lane owner. Discord config uses `deferredLaneOccupancy:"release"`, so a deferred/queued source does not hold the ingress lane (`extensions/discord/src/monitor/ingress.ts:186-188`; `src/channels/message/ingress-drain.ts:591-710`). Therefore eligible followers can reach the session mailbox while a room turn remains active. Traced.
3. **Completion boundary.** A row becomes `status=completed` in `onAdopted`, not at enqueue, claim, deferred queueing, or generic turn settlement. `src/channels/message/ingress-drain.ts:248-269` clears the stall timer and calls `completeClaimWithRetry`; the SQL tombstone writes `status=completed`, `completed_at`, clears the claim, and retains the row (`src/channels/message/ingress-queue.kernel.ts:402-439`). Traced.
4. **Queueing under an active turn.** Discord dispatch hands `ChannelIngressDispatchLifecycle` to the reply source. `prepareReplyRunAdmission` resolves room events through the shared rule `resolveRoomEventQueueMode`: only `collect` config produces collect; all steer/interrupt/followup variants become followup (`src/auto-reply/reply/queue/settings.ts:10-13`, `src/auto-reply/reply/get-reply-run-admission.ts:151-156`). The sourced run is then submitted to the session controller mailbox. Traced.
5. **Batch selection.** The mailbox selection gathers consecutive waiting sources only when the first is eligible and every candidate has the same queue policy and `resolveFollowupDeliveryStorageKey` (`src/sessions/session-controller.mailbox-dispatch.ts:100-140`; the storage key is in `src/auto-reply/reply/queue/delivery-context.ts:110-180`). The aggregate source carries each ingress lifecycle; adoption calls `admitFollowupRunLifecycle` for every source and settles every member (`src/auto-reply/reply/queue/drain.ts:145-190`, `src/auto-reply/reply/queue/drain.ts:224-236`). Traced.
6. **Debounce.** Mailbox selection applies `mailbox.lastEnqueuedAt + mailbox.debounceMs - performance.now()` before claiming. The setting is populated by `resolveQueueSettingsCore` from `debounceMsByChannel.discord`, including 45,000 ms (`src/auto-reply/reply/queue/settings.ts:27-44`; `src/sessions/session-controller.mailbox-dispatch.ts:150-160`). Thus room-event collect does apply the 45 s debounce in the session mailbox. 14:05:24 through 14:05:52 is within one 28-second arrival window, but only if those rows are simultaneously eligible entries with a shared batch key by the selection wake. Traced.

## Timeline reconciliation

The timestamps below reconcile adoption/settlement with the trace; exact model-turn durations are evidence, not source-traced.

| evidence time                                    | traced trigger                                                                                                                     | likely/known turn consequence                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14:00:07                                         | Discord ingress row claimed/admitted, starts long turn 0 for each seat                                                             | `14:00:14` turn 0 begins on the image; ingress adoption not complete until this source is adopted.                                                                                                                                                                                                                          |
| 14:00:42, 14:00:55, 14:02:03, 14:02:08, 14:04:05 | Discord ingress rows enqueued during active run                                                                                    | Each Discord row remains claimed while deferred or enters the room mailbox; no ingress row completes merely because it was queued.                                                                                                                                                                                          |
| ronan 14:05:24                                   | `turn a9cac5d2` reaches turn adoption                                                                                              | At adoption, the single queued mailbox claim selected there completes only the source(s) in that claim. This is consistent with the row completion observed at 14:05:24/25 for the first source or own ronan message.                                                                                                       |
| caél 14:05:27 own                                | Own/initial Discord ingress adoption by caél                                                                                       | Own row completes directly at 14:05:30 on its host; completion timestamp is adoption-dependent, not receipt-dependent.                                                                                                                                                                                                      |
| 14:05:37–14:05:52 onward                         | Each follower is released from ingress custody and becomes waiting mailbox work, then mailbox selection/turn adoption completes it | One row can complete per adopted claim; later duplicate-looking turns do not prove replay because the evidence has no ingress replay marker beyond the code paths.                                                                                                                                                          |
| 14:06:16 on both ronan and caél                  | Independent adoption of the same Discord message row (`14:02:03`) by each host's own lane/ingress monitor                          | Exact second is explained by same gateway `MessageCreate` / same receive clock on both hosts, but source evidence does not contain a host log event proving whether gateway delivery, typing keepalive, or mailbox wake won first; the exact cross-host event trigger is **inferred**, not traced.                          |
| 14:07:01 on both hosts                           | Independent adoption of `14:02:08` for each host                                                                                   | Same shared-message pattern and same exact timestamp across hosts; trigger identity is inferred from independent delivery clocks, not proven from journal evidence.                                                                                                                                                         |
| 14:07:06 on both hosts                           | Independent adoption of `14:04:05` for each host                                                                                   | Same pattern; this row's completion is adoption, not receive or turn-end settlement in the durable owner.                                                                                                                                                                                                                   |
| later ronan/caél completion times                | Mailbox claims become adoptable and each selected claim calls `onAdopted`                                                          | Their stagger reflects a new ingress claim/queue mailbox selection per row or a separate one-row mailbox claim, not one batch adoption. A replay would require the same ingress lifecycle to be selected and completed twice; no such replay is established by the durable rows, which are terminal `completed` tombstones. |

The durable row status is the stronger evidence. It is **not** a record of turn count, batch size, or replay. Completion times equal adoption times only when the source reaches the turn-adoption callback. The evidence shows each row completed once but cannot, by itself, show whether it was in a multi-source collected claim.

## Root cause

**The FIX has an unproved multi-sender cutover.** The traced storage-grouping boundary separates collect candidates using `resolveFollowupDeliveryStorageKey`. That key includes:

- route, chat type and reply anchor;
- `resolveFollowupAuthorizationKey`;
- `execution.senderId`, owner/authority fields and provenance;
- room-event kind and ingress `ownerKey`.

See `src/auto-reply/reply/queue/delivery-context.ts:110-180`, especially the authorization key's sender/participant fields.

The existing fixture creates every burst row as `{id, kind}` and dispatches it with a single constant sender `peer`. It therefore proves homogeneous-sender collection, not the live multi-sender room. It does not vary `senderId`, sender name, principal, owner, or transport provenance. The fixture assertion proves one collect turn and exactly one ingress completion write per member, but it does **not** prove that `figs`, `caél`, `ronan`, UUID synthetic input, and room event sources share one storage-group identity. That is a missing deterministic negative control at the actual mailbox selection boundary.

The live pattern is consistent with one sender group per turn: ronan has answer turns at ~14:05:37, 14:07:02, 14:07:06-18, 14:07:19-23, 14:07:24-28 and 14:07:46-48; caél follows a similar one-row cadence. Because candidate delivery keys include sender/principal fields, different senders can split a would-be collect claim. The exact live runtime sender/principal values were not included in the evidence, so the remaining unproved condition is:

> multi-sender entries from the same Discord room were/weren't contiguous with identical queue policy and delivery-storage keys at selection time.

If that condition held at runtime, the exact remaining bug would be elsewhere (timer wake/admission), and no replay is inferred from SQL completions alone. On the traced composite, however, this is the strongest concrete root-cause candidate. It is also the exact owner mismatch the fixture misses.

## Disposition of replay/per-message/release

- **Replay is not established by the evidence.** Each ingress row is `status=completed`; the row completion API is a tombstone transition with a claim token, not a duplicate turn counter. Replay requires the same row to dispatch twice and is contradicted by the durable row model unless another producer re-enqueued the same event ID.
- **True per-message turns are consistent with live turn counts and would explain the stagger, but the evidence proves no complete turn decomposition.**
- The staggered completion seconds cannot be explained by one collected claim adopting all followers: an aggregate adoption calls `admitFollowupRunLifecycle` for every source, and SQLite completion happens once per lifecycle in `Promise.all` adoption work. A truly shared batch should show the same adoption completion window, not row-by-row spread.
- Exact shared-second triggers on separate hosts remain **inferred cross-host gateway delivery/admission**, not a shared session-state trigger proven by local source or journals.

## The UUID message

`31eed7d3-7df3-4f7c-95c9-598f2e8cc546` is a UUID-style synthetic Gateway `chat.send` identity, not a Discord snowflake. The traced producer is the Gateway chat-send user-turn assembly: `MessageSid` is set to `session.clientRunId`, which is the chat-send `idempotencyKey`; absent an explicit key it is minted by `randomUUID()` in `src/gateway/server-methods/sessions-messaging.ts:153` and forwarded to `handleDirectExternalChatSend`. The definitive context assignment is `src/gateway/server-methods/chat-send-user-turn.ts:286`. This is traced code; the evidence does not identify the specific client/tool call that supplied this UUID in the live burst, so the exact producer (operator UI, `chat.send`, `sessions.send`, bridge, or another chat-send caller) is not identified.

## Fixture gap in `24f460fc16`

`24f460fc16` deliberately changed room event admission and delivery identity. Its fixture uses an in-memory SQLite row, a real ingress drain, and real mailbox. The existing `burst` test is only homogeneous:

- `Row` has `id` and optional `kind`; it has no `senderId`, principal, or provenance field.
- every synthetic run sets `senderId: "peer"` and the same `peer` principal.
- no test has multiple sender IDs in the burst.
- ingress settlement is checked, but without the sender split that the live room has.

The follow-up fixture (`9e5bb60ee8`) also groups only same-principal synthetic rows. Therefore the fix is not proven for the multi-sender owner composition requested by #1513/#1514.

## Fix proposal

Put the room's batching identity at the **reply mailbox/durable-ingress ownership composition boundary**, not inside Discord:

1. Preserve a single room ingress lane and ingress lifecycle ownership.
2. Define a collect-compatible key that includes transport route/session/room/reply anchor and room-event kind, but explicitly removes sender-display fields which must not split a room batch unless authorization actually differs.
3. Keep `resolveCollectedRun`/authorization policy separate: mixed senders can share prompt context while an aggregated turn still must use the least-authoritative safe execution context or preserve explicit per-source authorization.
4. Create the aggregate claim before delivery-key selection, so all eligible source lifecycles are adopted together.
5. Call ingress `onAdopted` once per member after aggregate adoption succeeds; never complete a follower in `enqueue`, claim, transcript preparation, or generic settle.
6. Preserve the ingress watchdog claim heartbeats and retry/release behavior through deferred adoption.

Owning boundary: `src/auto-reply/reply/queue/delivery-context.ts` owns batch storage identity and must be corrected, while `src/sessions/session-controller.mailbox-dispatch.ts` owns the selection/claim and `src/channels/message/ingress-drain.ts` owns `onAdopted` completion. These owners must agree on the same room-event batch partition.

## RED test

Add this deterministic test in `src/auto-reply/reply/queue.room-event-collect.test.ts` (or a focused sibling that uses the real durable ingress-to-mailbox composition):

```ts
it("collects a multi-sender burst during a long run into one turn and settles every ingress row once", async () => {
  // Start a real active run, then enqueue:
  // figs message, cael message, ronan message, uuid/chat.send synthetic message, then another.
  // Each row has a real ingress lifecycle and a different sender/principal.
  // End the active run.

  expect(harness.calls).toHaveLength(1);
  expect(harness.calls[0].currentInboundEventKind).toBe("room_event");
  expect(harness.calls[0].prompt).toContain("figs");
  expect(harness.calls[0].prompt).toContain("cael");
  expect(harness.calls[0].prompt).toContain("ronan");
  await expectSettledOnce(harness, ["figs-1", "cael-1", "ronan-1", "synthetic-uuid", "figs-2"]);
  // Every row must show status=completed exactly once; no row remains pending/claimed/failed/replayed.
});
```

The regression is red on the rejected SHA when sender/principal differences split the mailbox selection into separate claims; the successor is green when exactly one aggregate turn adopts every row and every ingress lifecycle reaches `completed` exactly once. Adjacent sibling checks must cover homogeneous room collection, addressed/user-request isolation, cap/drop, adoption refusal/retry, restart recovery, supersede loss, and deferred ingress heartbeats.

## Upstream delta

At checked upstream `main` (`bf56514c98ecb628b406889e6d573d0485bfd53e`), the only later `main` scheduling change relevant to this area is `6684699129`, `fix(discord): serve live mentions ahead of recovery backlog (#189420)`. It supersedes carried #121204 and adds ingress pending prioritization for live Discord native mentions while preserving FIFO, active claims, retry-delayed lanes and recovery backlog. It does **not** change `resolveRoomEventQueueMode`, the collect mailbox sender/storage key, ingress adoption-time completion, or the `room-event` fixture.

Upstream already has a generic priority hook in durable ingress, but priority does not establish room-event multi-sender collection. No upstream change traced here adds multi-sender collect semantics beyond the fork composite. The U12/subsequent drift therefore leaves the #1415 missing regression/cutover as an upstream+fork question rather than proving upstream has a conflicting implementation.
