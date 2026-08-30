# Independent review: openclaw/openclaw#121204 final bounded absorb

## Verdict

**REQUEST_CHANGES**

The product repair is focused and source-correct: direct-open Discord delivery is preserved, only proven stale mention-required ambient guild rows terminalize, uncertain rows fail closed, malformed pending rows reach the canonical `invalid-event` path, and upstream remains the sole owner of generic drain lifecycle behavior.

The reviewed successor is not acceptance-ready for two independently confirmed reasons:

1. `extensions/discord/src/monitor.test.ts` deterministically fails four tests on the final SHA because its unchanged Discord client double lacks the new required `getGatewayChannelType` method. The exact component and pinned-upstream parents both pass all 45 tests.
2. The merge and all six successor commits encode body line breaks as literal `\n`. `git interpret-trailers --parse` returns zero trailers, so the intended issue and Copilot attribution lines are not Git trailers.

Mode-B run `33323875597` is red. Its candidate-attributed Discord failure requires a successor and exact-SHA refire; no red run is credited as green.

## Named refs and immutable identity

| Category         | Named ref                                                          | Full SHA                                                      | Equality before evidence                                                     |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Product/base     | Final product                                                      | `c4df84d74085e4bde804f16a234e9953a06811da`                    | `HEAD` matched the workorder byte                                            |
| Component parent | Original component                                                 | `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`                    | Merge parent 1 matched                                                       |
| Upstream parent  | Pinned upstream                                                    | `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`                    | Merge parent 2 matched                                                       |
| Safe review lane | `codeagent/121204-c4df84d-independent-review-20260830`             | `c4df84d74085e4bde804f16a234e9953a06811da` before this report | Local, tracking, and server refs matched after publishing the unchanged lane |
| Savegame         | `origin/savegame/20260830-0914PDT/121204-post-43a7-absorb-c4df84d` | `c4df84d74085e4bde804f16a234e9953a06811da`                    | Tracking ref matched product                                                 |
| CI/workflow      | `openclaw-local-ci.yml` workflow ref                               | `d05778e6a96dd9a96946eff483e80c4d9ff9575e`                    | Mode-B `headSha` matched                                                     |
| Presentation     | N/A                                                                | N/A                                                           | Out of scope                                                                 |
| Docs/proof       | N/A                                                                | N/A                                                           | Existing corpus was read-only                                                |

The final commit has tree `35b7cc11730fb7bd966e814689efdab9ac9a993d` and parent `ded688230f7a1e28ebde5fdd8f1e914e6478ced2`. Its worktree was clean before review infrastructure was attached. The final differs from pinned upstream in 26 paths. The merge is `96ce75cc34b956c8d0b4eabf27f175cd9fbdccc7`, with parents component `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9` and upstream `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`.

The live PR remains open at original component SHA `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`; this review is explicitly of the immutable successor, not the live PR head.

## Complete delta and conflict review

The upstream-to-final delta was reviewed across all 26 paths. The remerge conflict set was limited to:

- `extensions/discord/src/monitor/message-handler.queue.test.ts`
- deleted `src/channels/message/ingress-drain-retry-delay.test.ts`
- `src/channels/message/ingress-drain-state.ts`
- `src/channels/message/ingress-drain.freshness.test.ts`
- `src/channels/message/ingress-drain.ts`

The resolution correctly retained the component's pre-claim disposition seam while taking upstream's generic lane ordering, settlement, claim-write extraction, heartbeat, and shutdown/restart implementations. The obsolete duplicate generic ordering test was removed. No second generic owner survived.

Successor sequence:

| Commit                                     | Purpose                                                 | Review result |
| ------------------------------------------ | ------------------------------------------------------- | ------------- |
| `263340483114c2cce5150a27d92f9d4061163d32` | Preserve direct-open stale ingress                      | Correct       |
| `c875412342b02ad9eec66a2745ee29feefb4e549` | Preserve gateway channel facts and malformed-row safety | Correct       |
| `46297e54970ce597686865f91b7914ecf702b31b` | Narrow channel metadata input                           | Correct       |
| `cb4b2bbd4c4d486eca01ccf9f3610daee9c118df` | Narrow pending-message records                          | Correct       |
| `ded688230f7a1e28ebde5fdd8f1e914e6478ced2` | Preserve unresolved named-channel rows                  | Correct       |
| `c4df84d74085e4bde804f16a234e9953a06811da` | Bound pre-claim disposition work                        | Correct       |

Production delta against pinned upstream is `+806/-67`, net `+739`; tests, docs, and support are `+3122/-6`, net `+3116`. The production growth represents the new Discord-owned policy/provenance boundary plus the generic optional disposition seam. The implementation can be simplified further, but no safe simplification should precede restoring the red unchanged test surface.

## Ownership map

| Invariant                                 | Canonical owner                                                                                     | Evidence                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Generic delayed-lane ordering             | `src/channels/message/ingress-drain.ts`                                                             | Upstream lane scheduling and `src/channels/message/ingress-drain-lanes.test.ts` remain canonical |
| Settlement after durable write            | `createIngressSettleOwner` in `src/channels/message/ingress-drain-state.ts`                         | Final takes upstream behavior                                                                    |
| Claim writes and retry                    | `createIngressWriter` in `src/channels/message/ingress-claim-writes.ts`                             | Final blob is upstream-identical                                                                 |
| Deferred heartbeat                        | `src/channels/message/ingress-drain-lifecycle.ts`                                                   | Final blob is upstream-identical; watchdog coverage passed                                       |
| Shutdown/restart fencing                  | Core drain and monitor lifecycle                                                                    | Upstream abort, replacement, and restart tests passed                                            |
| Optional pre-claim terminalization        | `src/channels/message/ingress-drain-pending-disposition.ts`                                         | Component-only seam, bounded by the existing scan window                                         |
| Discord stale policy                      | `extensions/discord/src/monitor/ingress.ts`                                                         | Channel-owned policy decides only with authoritative Discord facts                               |
| Discord gateway channel kind              | `extensions/discord/src/internal/entity-cache.ts` and `extensions/discord/src/monitor/listeners.ts` | Gateway lifecycle metadata enriches raw durable admission                                        |
| Malformed Discord payload terminalization | Discord decode plus canonical claim failure                                                         | Nonretryable `DiscordIngressPayloadError` maps to `invalid-event`                                |

## Delivery and stale-backlog behavior

The final terminalizes a pending row as `stale-ambient-backlog` only when all required facts are established:

- it is a guild message;
- channel kind is authoritative `non-thread`;
- its age is strictly beyond the 15-minute boundary;
- it is not a direct bot mention, bot reply, `@everyone`, potential control command, configured mention-pattern match, audio mention candidate, bound/cached thread, or hydratable reply;
- guild and named-channel policy resolution is authoritative; and
- canonical Discord policy resolves to `requireMention: true`.

Resolved `requireMention: false` rooms remain ordinary delivery, including stale and restart/re-enqueue cases. DMs, group DMs, threads, unknown channel kinds, unresolved guilds, unresolved name-configured channels, and malformed/partial rows are not terminalized by this policy.

Component-only pre-claim disposition remains before claim. It examines only `slice(0, scanLimit)`, checks shutdown between rows, uses compare-and-set terminalization, isolates observer failures, and leaves uninspected rows for a later pass.

## Follow-up repairs

### Gateway-owned channel provenance

`GatewayMessageCreateDispatchData.channel_type` is optional in installed `discord-api-types@0.38.53`. The final first uses that authoritative frame fact and otherwise consults a bounded client cache populated from gateway-owned `GUILD_CREATE`, channel, and thread lifecycle events. READY clears the cache; create/update/delete lifecycle events maintain it. The closed `thread`/`non-thread` projection covers every `TextChannelType` variant in the directly inspected dependency contract.

### Structurally partial pending rows

The pending reader validates the record, message identity, content/timestamp, mentions, attachments, `mention_everyone`, and reply structures before policy access. Invalid rows return no pre-claim decision instead of throwing across the pump. Claim-time decode then rejects them through `DiscordIngressPayloadError`, which settles as `invalid-event`; a following fresh same-lane row continues.

## Deterministic rejected/final controls

| Rejected SHA                               | Negative control on rejected SHA | Expected failure                                                        | Final result | Nearest sibling/recovery coverage                      |
| ------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| `96ce75cc34b956c8d0b4eabf27f175cd9fbdccc7` | Direct-open fossil matrix        | Stale direct-open and restart rows terminalized instead of dispatched   | Pass         | DM, group DM, thread, unknown policy, retry/re-enqueue |
| `263340483114c2cce5150a27d92f9d4061163d32` | Gateway channel-kind tests       | Channel-kind lifecycle owner absent                                     | Pass         | Frame field, cache fallback, unknown kind              |
| `263340483114c2cce5150a27d92f9d4061163d32` | Corrupt pending-row test         | Corrupt row aborts progression or dispatches instead of `invalid-event` | Pass         | Following same-lane fresh row                          |
| `cb4b2bbd4c4d486eca01ccf9f3610daee9c118df` | Named-channel test               | Unresolved name-configured direct-open row terminalized                 | Pass         | Exact ID and wildcard policy                           |
| `ded688230f7a1e28ebde5fdd8f1e914e6478ced2` | Bounded-disposition test         | One pass inspects beyond `scanLimit`                                    | Pass         | Shutdown and later-pass behavior                       |

All final controls used the repository Vitest wrapper with one worker. Final focused totals:

- Core channel owner: 4 files, 44 tests passed.
- Discord owner: 8 files, 139 tests passed.
- Telegram nearest channel sibling: 1 file, 5 tests passed.
- Upstream lifecycle, monitor, watchdog, cancellation, and debounce: 4 files, 48 tests passed.

The broad run exposed a separate missing regression in unchanged `extensions/discord/src/monitor.test.ts`; see Findings.

## Gate 2.5 and Gate 2.7

Gate 2.5 enumerated 3,477 tests changed by pinned upstream. Their intersection with the 26 paths differing between final and pinned upstream is zero. The complete final-different path set and the remerge diff were reviewed; no generic ownership clobber was found.

Gate 2.7's historical frozen-stale row was checked against current bytes. The apparent conflict was a relocation of `hasRawDiscordUserMention`, not dropped behavior. Upstream's generic owners remain preserved.

## Findings

### 1. Candidate-attributed deterministic Discord test regression

**Severity:** merge-blocking acceptance failure

`extensions/discord/src/monitor/listeners.ts` now calls `client.getGatewayChannelType`, but the unchanged client double in `extensions/discord/src/monitor.test.ts` does not implement it. Four listener tests therefore terminate before the intended handler boundary:

- waits for durable handler handoff;
- dispatches subsequent events concurrently;
- logs handler failures; and
- does not apply its own slow-listener logging.

Exact comparison:

| Ref                                                        | `extensions/discord/src/monitor.test.ts` |
| ---------------------------------------------------------- | ---------------------------------------- |
| Component `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`       | 45/45 pass                               |
| Pinned upstream `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5` | 45/45 pass                               |
| Final `c4df84d74085e4bde804f16a234e9953a06811da`           | 41 pass, 4 fail                          |

The test blob is identical at all three refs; the final alone changes the listener blob. Mode-B reproduced the same `TypeError: client.getGatewayChannelType is not a function` twice, and the required local repository command reproduced it exactly. This is candidate-attributed, not an upstream or runner red.

Required change: update the existing Discord client test double at the owning listener boundary, rerun the focused extension test, and refire Mode-B at the exact successor SHA.

### 2. Successor metadata does not contain parsed trailers

**Severity:** provenance/commit-contract failure

The merge and each of the six successor commits contain literal backslash-n text in the commit body. For every successor commit, `git show -s --format=%B | git interpret-trailers --parse` emits zero lines. The visible `Refs openclaw/openclaw#121204` and `Co-authored-by: Copilot ...` strings are therefore not trailers.

Required change: recreate the successor commit metadata with real line breaks and valid parsed trailers without changing reviewed product bytes, then re-establish exact identities and CI attribution.

## Mode-B `33323875597`

| Receipt                   | Value                                            |
| ------------------------- | ------------------------------------------------ |
| Product input SHA         | `c4df84d74085e4bde804f16a234e9953a06811da`       |
| Workflow SHA (`headSha`)  | `d05778e6a96dd9a96946eff483e80c4d9ff9575e`       |
| Conclusion                | **FAIL**                                         |
| Full-suite tally          | 173,470 passed; 19 failed; 4 load flakes greened |
| Deterministic failures    | 15                                               |
| Routed receipt validation | **FAIL**: 66/69 receipts; 3 missing              |
| Shard summaries           | 164/167                                          |

Every failure is retained; none is described as green:

| Failed job/surface             | Exact-parent attribution                                                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static lint                    | Exact-final local `scripts/run-lint.mts` completed successfully; Mode-B artifact contains no diagnostic, only shard exit 1. Nonreproduced runner/gate failure, not evidence of candidate behavior. Refire required.                                 |
| `agentic-gateway-core-runtime` | Two tests could not read `dist/build-info.json`. Test blobs are upstream-identical and absent from component. Mode-B artifact-precondition failure outside this candidate.                                                                          |
| `core-tooling-5`               | Six full-release-validation assertions failed. Test and policy/state implementation blobs are upstream-identical; component carries older versions. Pinned-upstream baseline, outside this candidate.                                               |
| Local gateway/Telegram batch   | Gateway usage test and implementation are upstream-identical. Telegram test and `bot.ts` are byte-identical across component, upstream, and final; its `/tmp` database had stale schema 17. Baseline/runner-state failures, outside this candidate. |
| Agentic plugins                | Security scan reports two Codex process-execution hits. Scan and hit-source blobs are upstream-identical; the hit sources are absent from component. Pinned-upstream baseline, outside this candidate.                                              |
| Discord batch                  | The four unchanged listener tests pass on exact component and upstream and fail only on final. **Candidate-attributed.**                                                                                                                            |

The aggregate also failed routing completeness: the hosted `extensions`/doctor-WhatsApp batch was cancelled, three routed jobs produced no valid receipt, only 164 of 167 planned shard summaries arrived, receipt validation was false, and both self-hosted-dist variants were skipped. The terminal summary remains red even where a failure is upstream-identical or environmental. The candidate-attributed Discord row and incomplete routing proof independently prevent acceptance.

## GitNexus

The approved fork was used exclusively:

- version `1.6.5`;
- fork checkout SHA `3c1e686edfc1acaac882927cada121ddd7c47bcc`;
- launcher SHA-256 `8309aeb6858023f5cb3ff4ae8416b64c1989e4fe04d82dd822964127ed1355ca`;
- remote `https://github.com/karmaterminal/GitNexus.git`.

`gitnexus status` reported that this repository is not indexed. No stock package and no other worktree's index was substituted. Source, Git history, tests, dependency declarations, and direct dependency types supplied the explicit fallback evidence.

## Simplification assessment

The architectural split is appropriate: generic core exposes one optional bounded disposition seam, while Discord owns all channel policy and gateway metadata interpretation. Moving Discord conditions into core or duplicating generic ordering would be a regression.

The best immediate simplification is not a production rewrite. Restore the existing listener test boundary by giving its canonical client double the newly required capability, then recreate the malformed successor metadata. After those repairs, any reduction should target repeated Discord pending-row field validation only if it preserves the current closed fail-safe policy and the rejected/final controls.

## Proof rows requiring refire

1. Repaired `extensions/discord/src/monitor.test.ts`: exact focused pass with one worker.
2. Exact successor identity after valid trailer reconstruction: tree, parents, local/tracking/server equality, and parsed trailers.
3. New exact-product Mode-B run on workflow `d05778e6a96dd9a96946eff483e80c4d9ff9575e`; every terminal red must again be classified.
4. Complete Mode-B routing proof: 69/69 valid receipts, 167/167 shard summaries, and executed self-hosted-dist variants.
