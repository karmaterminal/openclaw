# Continuation OTel evidence regeneration report

Workorder: `karmaterminal/openclaw-bootstrap#972`
Base carrier PR: `karmaterminal/openclaw#627`
Generated: `2026-05-10T16:53:05.277Z`
Collector: `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`, Jaeger query `http://127.0.0.1:16686`
Service: `openclaw-continuation-otel-evidence-mp00hi7x`

This is evidence-only; no SWIM-44 row verdicts are closed here.

## Artifact index

| Row                   | Evidence                                                                             | Raw spans                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| A1                    | `swims/swim-44/rows/A1/evidence/otel-trace-20260510T165305Z.json`                    | `swims/swim-44/rows/A1/evidence/otel-trace-20260510T165305Z.jsonl`                    |
| A0.2                  | `swims/swim-44/rows/A0.2/evidence/otel-trace-20260510T165305Z.json`                  | `swims/swim-44/rows/A0.2/evidence/otel-trace-20260510T165305Z.jsonl`                  |
| B3                    | `swims/swim-44/rows/B3/evidence/otel-trace-20260510T165305Z.json`                    | `swims/swim-44/rows/B3/evidence/otel-trace-20260510T165305Z.jsonl`                    |
| post-compaction-shard | `swims/swim-44/rows/post-compaction-shard/evidence/otel-trace-20260510T165305Z.json` | `swims/swim-44/rows/post-compaction-shard/evidence/otel-trace-20260510T165305Z.jsonl` |
| negative-control      | `swims/swim-44/rows/negative-control/evidence/otel-trace-20260510T165305Z.json`      | `swims/swim-44/rows/negative-control/evidence/otel-trace-20260510T165305Z.jsonl`      |

## Span count and continuity

| Row                   | Span count | Continuation spans on supplied trace                                                             | Continuation spans off supplied trace                 | Continuity finding                                                                                                                                            |
| --------------------- | ---------: | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1                    |          4 | `continuation.delegate.dispatch`, `continuation.queue.drain`                                     | `continuation.delegate.fire`                          | Supplied `traceparent` stitches dispatch + restart-side drain; timer fire currently starts a separate trace because the fire helper has no traceparent input. |
| A0.2                  |          4 | `continuation.work`, `continuation.queue.drain`                                                  | `continuation.work.fire`                              | Supplied `traceparent` stitches continue_work + drain; work fire currently starts a separate trace because the fire helper has no traceparent input.          |
| B3                    |          4 | `continuation.queue.fanout`, `continuation.queue.drain`, `continuation.delegate.dispatch`        | none                                                  | Delegate dispatch, fanout, and drain all share the supplied trace-id.                                                                                         |
| post-compaction-shard |          4 | `continuation.compaction.released`, `continuation.delegate.dispatch`, `continuation.queue.drain` | none                                                  | request_compaction release, post-compaction delegate dispatch, and wake-side drain all share the supplied trace-id.                                           |
| negative-control      |          2 | none                                                                                             | `continuation.delegate.dispatch`, `continuation.work` | Without a carrier, continuation spans do not join a common supplied trace; the two helper calls emitted separate trace IDs.                                   |

## Latency distribution by stage

The row stimuli were synthetic local emissions into Jaeger, so wall-clock deltas are collector/local-runtime deltas rather than live gateway latency. The useful timing attributes for delayed stages are `delay.ms` and `fire.deferred_ms`.

| Row                   | Stage deltas                                                         | Timing attributes                                                              |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A1                    | dispatch -> drain: 1ms; drain -> fire orphan: 0ms                    | `delay.ms=3600000`, `fire.deferred_ms=3600019` on `continuation.delegate.fire` |
| A0.2                  | work -> drain: 0ms; drain -> fire orphan: 0ms                        | `delay.ms=0`, `fire.deferred_ms=7` on `continuation.work.fire`                 |
| B3                    | fanout -> drain: 0ms; drain -> dispatch: 0ms                         | immediate delegate/fanout path                                                 |
| post-compaction-shard | compaction release -> delegate dispatch: 0ms; dispatch -> drain: 0ms | immediate post-compaction release path                                         |
| negative-control      | delegate dispatch -> work: 0ms                                       | no supplied traceparent; timing only proves absence of linkage                 |

## Anomalies found

1. `continuation.delegate.fire` does not accept `traceparent`; in the carrier-only A1 proof it emits on a separate trace even though dispatch and drain are correctly stitched.
2. `continuation.work.fire` does not accept `traceparent`; in the carrier-only A0.2 proof it emits on a separate trace even though continue_work and drain are correctly stitched.
3. Queue-drain spans do not carry `chain.id`, so continuity verification must key them by the supplied trace-id rather than by chain id.

## Negative-control comparison

The negative-control row omitted `traceparent` entirely. Jaeger recorded `continuation.delegate.dispatch` and `continuation.work` under two independent trace IDs (`a23458c8660a058c153e23a2a9a8abb5`, `b28a29d5cca4c1796f33282203aa1740`) with no common supplied parent. That contrasts with B3 and post-compaction-shard, where every continuation span joined the supplied trace-id.
