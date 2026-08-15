# Continuation telemetry census

**Verdict:** Organic continuation entry activity is low relative to the fleet's
normal traffic and failure volume. Across the complete Tempo slices, accepted
`continuation.work` plus `continuation.delegate.dispatch` spans total **23 in
24h** and **366 in 7d**. This is too rare to explain the prevalence of the
current fleet symptoms by itself. It intersects the symptoms and may amplify
individual traces, but this census does not establish causation.

## Scope and windows

- Issue binding: `karmaterminal/openclaw#1254`.
- Source revision: `6b09b1dbe938ab6b5f56eaf4e58f1ed243f89955` (exact checked-out
  source).
- Seats observed in Tempo: `cael-prince`, `elliott-prince`, `emeric-prince`,
  `ronan-prince`, `rune-prince`, `silas-prince`.
- Window end: `2026-08-15T21:55:01Z` (the Loki instant-query timestamp).
  Windows are `[2026-08-14T21:55:01Z, 2026-08-15T21:55:01Z)` and
  `[2026-08-08T21:55:01Z, 2026-08-15T21:55:01Z)`. Tempo requests set
  `NOW=$(date -u +%s)` immediately before each request; the completed Tempo
  artifact was written at `2026-08-15T21:55:23Z`, so Tempo timing is
  minute-level rather than a persisted literal epoch.
- Payloads, message text, raw session keys, event IDs, trace IDs, and Discord
  receipt identifiers were not included in the artifacts.

## Tempo results

Tempo's canonical continuation span set is
`continuation.work`, `continuation.work.fire`,
`continuation.delegate.dispatch`, `continuation.delegate.fire`,
`continuation.queue.fanout`, `continuation.queue.drain`,
`continuation.compaction.released`, and `continuation.disabled`.

| Window | Traces containing any canonical continuation span | Canonical spans |
| ------ | ------------------------------------------------: | --------------: |
| 24h    |                                               624 |             671 |
| 7d     |                           32,389 unique trace IDs |          33,226 |

`continuation.queue.drain` is emitted for empty drains, so the first column is
an instrumentation footprint, not an organic-use count. The actionable entry
spans are:

| Window | `continuation.work` | `continuation.delegate.dispatch` | Entry total |
| ------ | ------------------: | -------------------------------: | ----------: |
| 24h    |                   8 |                               15 |          23 |
| 7d     |                 182 |                              184 |         366 |

The full seat-by-seat aggregate, including wake, return, compaction, tool, and
control populations, is in `continuation-usage-aggregate.csv` and
`continuation-usage-aggregate.json`.

### Primitive classification

Accepted entry spans do not carry `signal.kind`; the exact source only attaches
`signal.kind` to `continuation.disabled` and to compaction-release spans. The
following are therefore separate evidence streams, not additive totals:

- Typed-tool evidence: `openclaw.tool.execution` with
  `openclaw.toolName=continue_work`, `continue_delegate`, or
  `request_compaction`.
- Bracket/token evidence: payload-free Loki
  `effective-signal: origin=bracket kind=work|delegate` records.
- Tool-call work evidence: payload-free Loki
  `effective-signal: origin=tool-call kind=work` records.
- Typed `continue_delegate` has no corresponding `effective-signal` origin log
  because that tool is staged and consumed by the delegate dispatcher.

| Window | Typed `continue_work` tool spans | Typed `continue_delegate` tool spans | Typed `request_compaction` tool spans | Bracket work logs | Tool-call work logs | Bracket delegate logs |
| ------ | -------------------------------: | -----------------------------------: | ------------------------------------: | ----------------: | ------------------: | --------------------: |
| 24h    |                                8 |                                   20 |                                     4 |                 2 |                  14 |                     2 |
| 7d     |                              200 |                                  369 |                                   101 |                32 |                 364 |                    28 |

The mismatch between typed-tool and accepted-entry counts is expected: tool
execution records include requests that are superseded, rejected, or whose
continuation span is parented into another trace. It is not valid to subtract
these populations to infer bracket counts.

### Scheduler, wake, return, and finalization spans

| Window | Work wake | Delegate wake | Queue fanout | Queue drain | Compaction release | Disabled |
| ------ | --------: | ------------: | -----------: | ----------: | -----------------: | -------: |
| 24h    |         8 |            14 |            0 |         586 |                 40 |        0 |
| 7d     |       183 |           152 |            8 |      32,284 |                254 |        1 |

## Controls and comparisons

| Population                                                             |   24h |     7d |
| ---------------------------------------------------------------------- | ----: | -----: |
| `openclaw.model.call` with `openclaw.model_call.observation_unit=turn` |   585 | 23,796 |
| Discord `openclaw.message.processed` spans                             | 2,340 | 32,134 |
| `openclaw.run` outcome errors                                          |    78 |  2,776 |
| `openclaw.message.processed` outcome errors                            | 1,798 |  4,840 |
| Loki slow SQLite transaction-hold logs                                 |   945 | 28,773 |
| Loki SQLite lock-wait logs                                             |    15 |    565 |
| Loki SQLite lock-wait-failed logs                                      |     2 |     33 |

The 23/585 24h and 366/23,796 7d entry-span ratios are approximately 3.9%
and 1.5% of model-turn spans. They are approximately 1.0% and 1.1% of
Discord processed spans. Entry spans are approximately 2.4% and 1.3% of
slow-hold logs. These are population ratios, not trace-level causal
correlations.

The zero-payload/finalization comparisons are log heuristics only: the exact
6b09 instrumentation has no canonical zero-payload or finalization-failure
span. Loki returned 147 `empty payload` lines and 115
`finalization failed`-matching lines in 24h, and 12,722 and 1,664 respectively
in 7d. These strings are not source-owned telemetry enums and must not be
treated as exact failure counters.

Payload-free Loki `effective-signal` logs yielded **7 unique sessions in 24h**
and **116 in 7d**. Tempo intentionally drops session identifiers from exported
span attributes (`extensions/diagnostics-otel/src/service-constants.ts`), so
the session count comes from hashed/omitted-key local processing of Loki
records. A direct unique user-visible-turn count is not available: signal
extraction also covers internal/subagent turns, and no exported span retains a
stable turn identifier. The 18 and 424 Loki effective-signal records are the
available turn-level upper-bound proxies.

## Proof traffic and exclusions

- Tempo resource tags for both windows contain no `k6` or Project 81 marker.
  Queries for `resource.k6`, process-command `k6`, and process-command
  `project.?81` returned no matches. This is **absence of a marker**, not proof
  that proof traffic was absent.
- The known manual proof window referenced by issue #1254 began around
  `2026-08-15T16:25Z`. No stable trace attribute identifies it, so it was not
  silently removed; the 24h totals may include that activity.
- The aggregate JSON marks proof classification as `unknown` rather than
  converting the missing marker into zero traffic.

## Backend and independent-control status

- Tempo `/ready`: HTTP 200. `/api/status/buildinfo`: Tempo 2.5.0.
  Complete 24h requests reported 24 blocks and 25/25 completed jobs. The 7d
  request hit the 10,000-result cap and was therefore recomputed as seven
  complete 24h slices; each slice completed its jobs before aggregation.
- During the census, identical historical Tempo searches later returned HTTP
  200 live-store-only responses with no `totalBlocks` and zero historical
  matches, while `/ready` remained 200. Those later zeros are recorded as a
  backend degradation and were not used as evidence of no continuation.
- Loki `/ready`: HTTP 200. Instant `count_over_time` queries were used because
  its range endpoint rejects `limit > 5000` (`max_entries_limit`). The Loki
  label set exposed all six host names and the `systemd-journal` stream.
- SSH read-only access to all six nodes succeeded, but direct `journalctl`
  queries were scope-inconsistent (five hosts returned no matching records and
  Cael timed out on the broad scan). They are recorded as unavailable, not
  zero. Loki systemd-journal counts are the usable independent control.

## Source and query audit

- Span names and canonical attributes: `src/infra/continuation-tracer.ts:81`,
  `src/infra/continuation-tracer.ts:215`.
- Bracket/tool-call origin: `src/auto-reply/continuation/signal.ts:337`.
- Tool span name/attribute contract:
  `extensions/diagnostics-otel/src/service-recorders-tools.ts:42`.
- Continuation OTEL scope: `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts:44`.
- SQLite control log strings: `src/infra/sqlite-transaction.ts:97`.

Tempo query forms:

```text
{ name = "continuation.work" }
{ name = "continuation.delegate.dispatch" }
{ name = "continuation.queue.drain" }
{ name = "continuation.compaction.released" }
{ name = "continuation.disabled" }
{ name = "openclaw.tool.execution" && .openclaw.toolName = "continue_work" }
{ name = "openclaw.tool.execution" && .openclaw.toolName = "continue_delegate" }
{ name = "openclaw.model.call" && .openclaw.model_call.observation_unit = "turn" }
{ name = "openclaw.message.processed" && .openclaw.channel = "discord" }
```

Loki query forms:

```text
sum by (host_name) (count_over_time({host_name=~"cael|elliott|emeric|ronan|rune|silas"} |= "effective-signal: origin=bracket kind=work" [24h]))
sum by (host_name) (count_over_time({host_name=~"cael|elliott|emeric|ronan|rune|silas"} |= "slow SQLite transaction hold" [7d]))
```

Confidence is **high** for the complete Tempo span totals and Loki instant
counter values at capture time, **medium** for seven-day deduplicated trace
counts because they were reconstructed from daily slices, and **low** for
primitive attribution, unique user-visible turns, proof exclusion, and
causality because accepted spans omit origin/session/turn identity and Tempo
historical search degraded during the run.

## Validation

- `jq empty continuation-usage-aggregate.json`
- CSV shape check: 14 data rows, 25 columns.
- `git diff --no-index --check /dev/null <artifact>` for each new artifact.
- Full repository test script is `node --import tsx scripts/test-projects.mts`;
  it was not run because this lane only adds read-only census artifacts and
  makes no source or runtime changes.
