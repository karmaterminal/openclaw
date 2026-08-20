# output.md — upstream Project 87 pathogen scan

Lane: `codeagent/upstream-project87-pathogen-scan`  
Head at write: `eed64163b629600d7de248dc2589380e3ab0b4ee`  
Date: 2026-08-20

## What changed

Read-only crosswalk of karmaterminal Project 87 (`#1246`–`#1265`) against live `openclaw/openclaw` issues/PRs.

Artifacts only:

- `REPORTS/upstream-project87-pathogen-scan.md`
- `REPORTS/upstream-project87-pathogen-scan.json`

No product source, GitHub items, SQLite, gateways, or proofs were mutated.

## Validation

Report-only lane. `package.json#scripts.test` is `node --import tsx scripts/test-projects.mts`. Full suite was **not** run (no runtime change). Checks: live REST state for cited numbers; current-main `onAbandoned` / missing `ANALYZE` source read; `gitcrawl doctor` freshness `2026-08-20T03:24:45Z`.

full-suite: n/a-report-only

## Exact commands

```bash
gitcrawl doctor --json
gitcrawl threads karmaterminal/openclaw --numbers 1246,1247,1254,1255,1256,1257,1258,1259,1260,1261,1263,1265 --include-closed --json
gitcrawl threads openclaw/openclaw --numbers 113530,113972,119884,124337,124454,125316,125605 --include-closed --json
gitcrawl search openclaw/openclaw --query "<family>" --mode hybrid --json
gitcrawl search openclaw/openclaw --query "<term>" --mode keyword --json
gh api repos/openclaw/openclaw/issues/<n>
gh api repos/openclaw/openclaw/pulls/<n>
gh api repos/openclaw/openclaw/issues/<n>/comments --paginate
gh api -X GET search/issues -f q='repo:openclaw/openclaw <query>' -f per_page=30
```

No GraphQL project-card queries.

## Result counts (selected)

### gitcrawl hybrid

| query | hits |
|---|---|
| stale ingress replay day-old channel_ingress_events obsolete reply | 0 |
| ingress abandonment retry budget onAbandoned dead letter | 2 |
| visible channel turn dispatched with no queued reply payloads | 20 |
| settled-turn finalization context is unavailable | 8 |
| slow SQLite transaction hold ANALYZE planner stats large agent database | 1 |
| sqlite corruption integrity_check overflow list freelist gateway healthy | 0 |
| heap OOM memory leak transcript replay delivery recovery | 0 |
| admitReplyTurn lifecycle invalidated expected-session-mismatch | 0 |
| materializePreparedRuntimeModel fallback reason route materialization | 1 |
| ingress completion terminal outcome lineage no visible reply | 0 |
| ambient expiry requireMention backlog oldest-first replay | 0 |
| duplicate discord reply two agent turns no payload | 6 |

Hybrid miss ≠ absence. Keyword + REST recovered `#97320`, `#121204`, `#125744`, `#126231`, `#123327`.

### gitcrawl keyword (capped ~20)

Notable: `no queued reply payloads` 20; `ANALYZE` 20 including `#119884`/`#119720`/`#119901`/`#119739`; `channel_ingress` 20 including `#90945`; `onAbandoned` 12 including `#124337`; `handler-timeout` 20 including `#126231`/`#126358`; `freelist` 8 including `#125744`; `admitReplyTurn` 14; `materializePreparedRuntimeModel` 3 (`#124466`).

### GitHub REST search totals

| q | total_count |
|---|---|
| sqlite ANALYZE planner | 10 |
| "no queued reply payloads" | 96 |
| "channel_ingress_events" | 76 |
| "handler-timeout" | 774 (noisy) |
| "settled-turn finalization" | 50 |
| "database is locked" | 54 |
| SQLITE_BUSY | 91 |
| "integrity_check" sqlite | 79 |
| stale backlog ambient ingress | 1 (`#121204`) |
| "heap out of memory" | 134 |
| "memory leak" gateway | 637 (noisy) |
| freelist ptrmap corruption | 1 (`#125744`; `#126356` via later query) |
| admitReplyTurn | 30 |
| "recovery-owner-invalidated" | 3 |
| materializePreparedRuntimeModel | 4 |
| "stale ambient" | 27 |
| "visible channel turn dispatched" | 91 |
| "loadTranscriptEventsSync" | 7 |
| "slow SQLite transaction hold" | 13 |
| "attempts=0" ingress | 58 |
| dead-letter ingress claim | 112 |
| "requireMention" stale | 572 (noisy) |
| ptrmap / Bad ptr map / Freelist: size is | 2 (`#125744`, `#126356`) |

~50 live issue/PR metadata fetches; comments read on `#97320`, `#121204`, `#125744`, `#126231`, `#119884`, `#119720`, `#112259`, `#115424`, `#124337`, `#124454`, `#124466`, `#125316`, `#113530`, `#97435`, `#114278`, `#62761`, `#114137`, `#112042`, `#126356`, and all listed karmaterminal P87 issues.

## Limitations

- Popular-token REST totals are not unique-item counts.
- `gitcrawl neighbors` returned empty non-JSON here; unused.
- Closed-as-completed is not treated as merged-fixed without a merge SHA or reporter close that reclassifies the bug.
- Current upstream `main` may move after this checkout; merge flags were live 2026-08-20.
- No private payloads, transcripts, or credentials.

## Verdict

Most Project 87 owners are **already known upstream and still open**. High-confidence causal PRs (`#121204`, `#124337`, `#124454`, `#124466`, `#119901`/`#119739`, `#126358`, `#125316`) are **unmerged**. `#1258` and `#1260` have **no upstream issue/PR**. Merged `#118271`, `#114278`, and `#114531` do not close the cluster.

Elliott’s 794-row always-on oldest-first replay, Rune’s `handler-timeout` + 930 MiB agent DB, and Ronan’s 3.9 GiB holds map onto those open seams.

https://github.com/karmaterminal/openclaw/blob/codeagent/upstream-project87-pathogen-scan/REPORTS/upstream-project87-pathogen-scan.md
