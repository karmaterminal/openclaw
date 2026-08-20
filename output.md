# 1246-direct-open-causal-proof output

Branch: `codeagent/1246-direct-open-causal-proof`
Issue: karmaterminal/openclaw#1246
No PR opened. No issue mutation.

## What changed

- Fossils: `extensions/discord/src/monitor/ingress.direct-open-stale.fossil.test.ts`
- Intervention: stale ambient expiry no longer requires `requireMention`; mismatched nested replies stay hydratable
- Removed obsolete test that encoded the defect
- Proof package: `REPORTS/1246-direct-open-causal-proof.*`
- Production LOC: +12/-8 (net +4). Tests: +559 fossil, −43 obsolete

## Validation

```
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 \
  extensions/discord/src/monitor/ingress.direct-open-stale.fossil.test.ts
```

| Step | Result |
| --- | --- |
| RED on `46f4d211` / patch-only revert | 4 failed / 10 passed; stale rows dispatched |
| GREEN after `7871ecfeacf` | 14 passed |
| Revert-only RED | 4 failed; `['1246-stale-ambient']` dispatched |
| Reapply GREEN | 14 passed |

Sibling: Discord ingress 10/10; preflight 61/61; drain/monitor/freshness 52/52; retry/claim 21/21; queue 38/38.

Full suite: `node --import tsx scripts/test-projects.mts` — 542 shards, 2079.27s, 12 failed shards. Discord queue preflight-order failure reproduces on exact pre-fix `ingress.ts` (baseline). UI browser / tui-pty / unrelated unit-fast / tooling classified out. Verdict: patch-to-fossil coupling for D-policy-direct-open; live proof still owed.

## Uncertainties

- Live-channel proof still owed
- #1237 is source material (still mention-gated), not a supersede
- GitNexus exact index unavailable (closest `530b33e`)
- D-abandonment-budget, D-sqlite-pressure, D-model-amplifier remain separate

## Exact commands

See `REPORTS/1246-direct-open-causal-proof.md`.
