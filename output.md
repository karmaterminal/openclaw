# Review handoff: openclaw/openclaw#121204

Verdict: **REQUEST_CHANGES**.

The final product repair at `c4df84d74085e4bde804f16a234e9953a06811da` preserves upstream drain ownership and correctly narrows Discord `stale-ambient-backlog` terminalization. Direct-open `requireMention: false` delivery, gateway-owned channel-kind provenance, malformed pending-row safety, restart/re-enqueue behavior, and bounded pre-claim disposition all passed deterministic rejected/final controls.

Acceptance is blocked by a candidate-attributed regression: `extensions/discord/src/monitor.test.ts` passes 45/45 on exact component `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9` and pinned upstream `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`, but final fails four tests because the unchanged client double lacks successor-required `getGatewayChannelType`. The merge and six successor commits also parse with zero Git trailers because their body newlines are literal `\n`.

Focused final proof used `node scripts/run-vitest.mjs run --config <owner-shard> --maxWorkers=1 <paths>`:

- core channel owner: 4 files / 44 tests passed;
- Discord owner: 8 files / 139 tests passed;
- Telegram sibling: 1 file / 5 tests passed;
- upstream lifecycle/monitor/watchdog set: 4 files / 48 tests passed;
- unchanged Discord monitor test: 41 passed / 4 failed on final; 45 passed on each exact parent.

Broad acceptance path: Mode-B `33323875597`.

- product SHA: `c4df84d74085e4bde804f16a234e9953a06811da`;
- workflow SHA: `d05778e6a96dd9a96946eff483e80c4d9ff9575e`;
- terminal conclusion: **FAIL**.

The aggregate recorded 173,470 passes, 19 failures, 4 load flakes greened, and 15 deterministic failures. Routing proof was also incomplete: 66/69 valid receipts and 164/167 shard summaries, with one hosted batch cancelled and both self-hosted-dist variants skipped.

No Mode-B red was called green. Upstream-identical and runner-state reds are classified in `REVIEW-121204-C4DF84D.md`; the Discord red is candidate-attributed and requires repair plus an exact-SHA refire with complete routing receipts.

GitNexus used approved fork `1.6.5` at `3c1e686edfc1acaac882927cada121ddd7c47bcc`. The repository had no exact index, so no graph result was credited and no substitute index/tool was used.
