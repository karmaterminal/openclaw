# Independent Review: openclaw/openclaw#121204

## Named-ref contract

| Category             | Named ref                                                                                        | Full SHA                                                                                | Local               | Tracking                                          | Server                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Product/base ref     | candidate `9064175c` over pinned upstream `43a7cb3c`                                             | `9064175c4b795291b336eecea8f964af8f92cb78` / `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5` | resolved / resolved | candidate savegame matches / base object resolved | candidate savegame matches / pinned base is the declared immutable byte |
| Safe lane branch ref | `codeagent/121204-9064175c-independent-review-20260830`                                          | `9064175c4b795291b336eecea8f964af8f92cb78`                                              | matches             | matches                                           | matches                                                                 |
| CI/workflow ref      | `karmaterminal/openclaw-bootstrap:codeagent/124337-feac2430-routing-independent-review-20260829` | `d05778e6a96dd9a96946eff483e80c4d9ff9575e`                                              | N/A                 | N/A                                               | Mode-B run `33330805950` matches                                        |
| Presentation ref     | protected PR `openclaw/openclaw#121204` head `codeagent/wo1229-upstream-pr`                      | `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`                                              | resolved            | savegame matches                                  | live PR head matches                                                    |
| Docs/proof ref       | `savegame/20260830-1225PDT/121204-clean-successor-9064175c`                                      | `9064175c4b795291b336eecea8f964af8f92cb78`                                              | N/A                 | matches                                           | matches                                                                 |

The protected presentation, docs, and fleet refs are read-only. This review does not move them.

## Verdict

**REQUEST_CHANGES**

The clean successor repairs the four-test Discord client-double regression, reconstructs valid additive history, preserves the reviewed owner split, and has no candidate-attributed Mode-B red. It nevertheless violates its own malformed-pending-row invariant: a structurally readable row with an unsupported payload version can be terminalized as `stale-ambient-backlog` before the canonical claim-time codec classifies it as `invalid-event`.

**May `9064175c4b795291b336eecea8f964af8f92cb78` proceed to current-SHA behavioral proof and runtime-composite preparation? No.**

PR: https://github.com/openclaw/openclaw/pull/121204  
By: Emeric🕯️ (@emeric-dandelion-cult, account created 2026-05-25) | OpenClaw last 12 months: 1 PR, 0 issues, 0 default-branch commits | GitHub contribution graph last 12 months: 100 commits, 39 PRs, 31 issues, 35 reviews.

## Findings

### 1. Unsupported-version rows bypass canonical `invalid-event`

**Priority:** blocking

The pre-claim disposition contract explicitly receives unvalidated stored bytes and requires unreadable or invalid rows to remain claimable for the canonical codec. Discord's pending reader validates selected message fields but does not validate `payload.version` (`extensions/discord/src/monitor/ingress.ts:161`). The resolver therefore treats an otherwise readable version-2 row as policy input (`extensions/discord/src/monitor/ingress.ts:611`) and may commit `stale-ambient-backlog` (`extensions/discord/src/monitor/ingress.ts:648`). Claim-time version validation, which would create `invalid-event`, never runs (`src/channels/message/ingress-monitor.ts:294`).

Deterministic owner-boundary control on `9064175c`:

- real SQLite `ChannelIngressQueue`;
- stale, unaddressed guild-text row;
- stored payload version `2`;
- authoritative mention-required policy;
- following fresh addressed row in the same lane.

The fresh row dispatched, but the rejected row was recorded with:

```text
Expected reason: invalid-event
Received reason: stale-ambient-backlog
```

The committed corrupt-row table covers `null`, primitives, missing messages, identity-less messages, and malformed collections, but not valid-looking rows rejected later by version or claim identity (`extensions/discord/src/monitor/ingress-corrupt-pending.test.ts:73`).

**Invariant and owner:** the generic monitor owns codec/version/identity validation at claim time; a channel pre-claim policy may terminalize only a row it has proved admissible under that contract. Discord owns the narrow pre-claim validation needed before applying Discord stale policy.

**Best fix:** share one admissibility predicate between Discord's pending reader and claim decoder, and require the stored version plus record ID/lane identity to match before stale policy may return a disposition. Any invalid or uncertain row must return `null` so the generic claim owner emits `invalid-event`. Extend the existing table-driven SQLite regression with unsupported-version, event-ID mismatch, and lane mismatch cases, each followed by fresh same-lane work.

**Alternatives rejected:** moving Discord policy after claim defeats the bounded pre-claim capability; teaching core about Discord payloads violates ownership; merely special-casing version in the resolver duplicates validation and leaves identity drift exposed.

**Provenance:** the gap was introduced by commit `bd0a6147391200f2eb8e093e9cfc41c2db908174` on 2026-08-20 by `frond-scribe`, which added the partial pending reader while promising canonical claim-time ownership. Commit `63bffaa3bb4d0172d89732e78d7c4dd440137b80` expanded structural checks but still omitted version/identity admissibility.

### 2. Timing documentation overstates the bounded callback window

**Priority:** non-blocking documentation correction

`docs/plugins/sdk-channel-outbound.md:90` says `resolvePendingDisposition` runs once per pending row per pass. The implementation intentionally examines only `pending.slice(0, maxEvents)` and can stop earlier (`src/channels/message/ingress-drain-pending-disposition.ts:92`). The source comment is correct; the public timing text should say “each row in the pass's bounded disposition window.”

## History reconstruction

The clean sequence is additive and does not cherry-pick the malformed objects:

| Boundary                  | Clean commit                               | Parent/result                                                               |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| Component                 | `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9` | exact protected component                                                   |
| Upstream absorb           | `66b10a337a83a533c7457bed30d24efa2bd2a418` | parents are exact component then `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5` |
| Direct-open preservation  | `b6323954f3e7c56b33c4cfee5ad1d36d250729db` | clean equivalent of malformed boundary `263340483114`                       |
| Gateway/pending facts     | `63bffaa3bb4d0172d89732e78d7c4dd440137b80` | clean equivalent of `c875412342b`                                           |
| Metadata narrowing        | `6d459960112c32c8c7719b1b3dbf73f862b41084` | clean equivalent of `46297e54970`                                           |
| Pending-row narrowing     | `039d907ba2fc9edf4e3957748ce17f921f754b74` | clean equivalent of `cb4b2bbd4c4`                                           |
| Named-policy preservation | `6a38da9703a2ff836164ac1d304d32bf4f95c5fd` | clean equivalent of `ded688230f7`                                           |
| Bounded dispositions      | `6c8fc693bbcad62f3b9b1abdbbc7f1ee1813eea3` | clean equivalent of malformed final `c4df84d7408`                           |
| Test-double repair        | `9064175c4b795291b336eecea8f964af8f92cb78` | one test file only                                                          |

The seven reviewed logical boundaries are the absorb plus six production successors. Each clean boundary has the same tree and stable patch as its malformed counterpart. The pre-repair clean tree at `6c8fc693` is exactly `35b7cc11730fb7bd966e814689efdab9ac9a993d`, equal to malformed reviewed tree `c4df84d^{tree}`.

All eight clean authored commits use physical paragraph newlines, contain no literal `\n`, and parse exactly one `Refs: openclaw/openclaw#121204` trailer plus one `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer. The malformed lane and `origin/savegame/20260830-0914PDT/121204-post-43a7-absorb-c4df84d` remain at `c4df84d74085e4bde804f16a234e9953a06811da`.

## Production ownership and behavior

The complete pinned-upstream-to-successor delta is 27 paths. Classified LOC:

- production: +803/-66, net +737;
- tests: +3094/-12, net +3082;
- docs: +38/-0;
- tooling/baseline: +3/-1.

The positive production growth is the optional generic disposition seam and Discord's stale-policy/provenance capability. The ownership split is otherwise coherent:

| Invariant                                         | Owner and result                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Delayed-lane ordering and retry eligibility       | pinned-upstream `src/channels/message/ingress-drain.ts`; preserved                                                      |
| Settlement and claim writes/retry                 | pinned-upstream drain state/writer owners; preserved                                                                    |
| Heartbeat, shutdown, restart, stale-claim fencing | pinned-upstream lifecycle/monitor owners; preserved                                                                     |
| Pre-claim terminal disposition                    | bounded optional generic seam in `src/channels/message/ingress-drain-pending-disposition.ts`; no Discord policy in core |
| Stale ambient classification                      | Discord `extensions/discord/src/monitor/ingress.ts`                                                                     |
| Gateway channel-kind provenance                   | Discord client/entity cache/listener lifecycle                                                                          |
| Terminal stale receipt                            | Discord policy through existing queue `fail` CAS path                                                                   |

The reviewed fail-open matrix remains intact for direct-open `requireMention:false`, DMs, group DMs, threads, unknown channel kinds, unresolved guild/channel policy, named-channel uncertainty, direct mentions/replies, `@everyone`, possible text controls, audio mention candidates, and hydratable replies. Scan bounds, shutdown checks, CAS loss, retry/re-enqueue, and following fresh rows remain correctly owned and covered. The blocking finding is narrower: a row that looks structurally readable but is codec-invalid can enter that policy matrix before codec ownership.

**Best-fix verdict:** correct architecture but incomplete owner-boundary validation; not acceptance-ready.

**Code read:** `extensions/discord/src/monitor/ingress.ts`, `extensions/discord/src/monitor/listeners.ts`, `extensions/discord/src/internal/{client,entity-cache,gateway}.ts`, Discord ingress/listener/gateway tests, `src/channels/message/ingress-{drain,drain-pending-disposition,monitor}.ts`, adjacent core drain tests, public outbound docs, complete 27-path diff, pinned-upstream equivalents, and prior conflict/history reports.

## Test-double repair and focused controls

`9064175c` changes only `extensions/discord/src/monitor.test.ts` over `6c8fc693`: +10/-6. It adds a canonical typed client double whose `getGatewayChannelType` returns `undefined`, preserving the previous no-cached-kind default while satisfying the listener's bounded lookup contract. Production is unchanged.

| Control                                                                             | Result                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Rejected `c4df84d7`, `extensions/discord/src/monitor.test.ts`                       | 41/45; four failures, including the exact `client.getGatewayChannelType is not a function` error |
| Final `9064175c`, same file                                                         | 45/45                                                                                            |
| Final gateway/listener/channel-kind sibling group                                   | 108/108 across four files                                                                        |
| Final committed corrupt-pending suite after removing the temporary negative control | 7/7                                                                                              |
| Added review-only unsupported-version negative control                              | 7 pass, 1 expected failure; actual reason `stale-ambient-backlog`                                |

Focused commands used the repository runner and one worker:

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 extensions/discord/src/monitor.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 extensions/discord/src/monitor.test.ts extensions/discord/src/internal/gateway.test.ts extensions/discord/src/monitor/listeners.test.ts extensions/discord/src/monitor/ingress-channel-kind.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 extensions/discord/src/monitor/ingress-corrupt-pending.test.ts
```

The rejected control ran from the exact `c4df84d74085e4bde804f16a234e9953a06811da` checkout. The final worktree used the same-host dependency tree whose `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` blobs exactly match the candidate; no dependency reconciliation ran in the worktree.

## Mode-B `33330805950`

| Receipt                | Audited value                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Product input          | `9064175c4b795291b336eecea8f964af8f92cb78`                                             |
| Workflow `headSha`     | `d05778e6a96dd9a96946eff483e80c4d9ff9575e`                                             |
| Terminal result        | failure; every red retained                                                            |
| Routing                | 69/69 valid receipts; hosted 55, self-hosted 12, self-hosted-dist 2                    |
| Shards                 | 167 planned, 167 routed, 168 summaries including aggregate                             |
| Dist variants          | both executed; `dist-core-runtime-tui-pty` failed, `dist-core-support-boundary` passed |
| Discord                | 3,107/3,107                                                                            |
| Full tally             | 179,921 passed, 31 failed, 4 load flakes greened                                       |
| Deterministic failures | 27                                                                                     |

All ten deterministic failing test blobs are identical between pinned upstream and candidate. The relevant TUI tree, Codex plugin tree/security scan, gateway tests, Telegram test/implementation, Playwright installer test/implementation, full-release state test/implementation, and macOS package test/implementation are likewise pinned-upstream-identical. None intersects the 27 candidate paths. Therefore all 27 Mode-B deterministic failures are pinned-upstream baseline/environment failures, not candidate-attributed reds.

That classification does not make Mode-B green, and it does not excuse the independently reproduced candidate bug, which the broad run did not cover.

## Static, Knip, and prior gate receipts

- Mode-B static gates passed typecheck, Oxlint, duplicates/guards, UI raw-window guard, protocol generation, plugin asset build, and `build:strict-smoke`.
- Fresh lane-local Knip `6.32.2` attestation passed production/full-tree unused-file scans and script/production/full-tree unused-export scans with zero entries. `XDG_CACHE_HOME` and pnpm store were isolated in the session artifact directory.
- Gate 2.5 previously enumerated 3,477 pinned-upstream-changed tests. Their intersection with the then-26 production successor paths was zero; the 27th final path is the test-double-only repair and was not changed by pinned upstream.
- Gate 2.7's frozen-stale-row conflict was a relocation of `hasRawDiscordUserMention`, not dropped behavior. The clean tree preserves that conclusion byte-for-byte.
- `git diff --check` passed.
- Structured Autoreview over the committed 27-path delta reported no P0 finding; its P0 threshold does not contradict the deterministic narrower acceptance blocker above.

## GitNexus and uncertainty

Only `/home/figs/.local/bin/gitnexus` was used: version `1.6.5`, launcher SHA-256 `8309aeb6858023f5cb3ff4ae8416b64c1989e4fe04d82dd822964127ed1355ca`, fork checkout `3c1e686edfc1acaac882927cada121ddd7c47bcc`, remote `https://github.com/karmaterminal/GitNexus.git`. `gitnexus status` reported this repository is not indexed. No stock package or other graph was substituted; source-byte review is the workorder-authorized fallback.

**Remaining uncertainty:** no live Discord backlog proof was performed, and no exact GitNexus graph was available. Neither gap changes the deterministic `invalid-event` failure.
