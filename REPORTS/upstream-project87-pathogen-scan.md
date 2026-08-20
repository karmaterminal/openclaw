# Upstream Project 87 pathogen scan

Scan date: 2026-08-20 (America/Los_Angeles).  
Checkout: `karmaterminal/openclaw` `eed64163b62` (`origin/main`).  
Live verification: GitHub REST via `gh api` as `@scribe-dandelion-cult`.  
Gitcrawl archive freshness: last_sync `2026-08-20T03:24:45Z`, 38,065 threads.  
Lane constraint: read-only on GitHub and product source. No issues/PRs were opened, edited, labeled, or commented.

## Executive findings

Project 87 is **not a single upstream bug**. It is a cluster of distinct lifecycle/ownership seams that independently produce the same operator picture: a green Gateway with stale, silent, duplicate, or missing channel speech, plus multi-second SQLite holds and heap growth.

1. **The strongest exact upstream matches are open, not shipped.** The karmaterminal-authored repair PRs (`#124337`, `#124454`, `#124466`) and the stale-ambient PR (`#121204`) are still open on `openclaw/openclaw`. Current `origin/main` still has `onAbandoned` release-without-budget and no doctor `ANALYZE` after agent-DB rewrite.

2. **Stale visible replay is a known upstream product defect, not a fleet-only incident.** `#97320` describes the same Discord sprites lane (`channel:1466192485440164011`) answering 19–20 minute-old events as current. `#121204` documents 13h–30h oldest-first ambient drain after a healthy restart. LINE `#97435` is the same delayed-then-drained class.

3. **The remaining 1246 gap is the expiry predicate, not “does backlog exist.”** Current and proposed Discord stale-ambient expiry still requires `requireMention=true`. Elliott’s live room is `Activation: always`. Day-old rows with `attempts=0` are therefore claimed and answered. Settlement is still conflated with emission.

4. **Zero-payload / no-visible-reply is a family, not one owner.** `#112259` (generic silent dispatch), `#113530` (Codex final persisted, queue empty), `#116486` (warning attribution), and `#120142` (opaque Discord empty warning) remain open. Some older “no queued reply payloads” issues were closed as implemented (`#112042`) or misfiled (`#114137`). Do not treat those closes as a 1254 cure.

5. **Large-agent-DB liveness is independently diagnosed upstream and still unfixed.** `#119884` / `#119720` match `#1257` causally (no `ANALYZE` after migration/prune; synchronous `agent.write` / transcript reads starve the event loop). Fix PRs `#119901` and `#119739` are open. `ANALYZE` is absent from current `src/commands` / `src/infra`.

6. **Physical state-DB corruption with HTTP-green Gateway is an active upstream class.** `#125744` (ptrmap/freelist, deleted `-shm`, subsystems failing while process stays up) and `#123327` (WAL checkpoint copies an index page over page 1) are open. `#114278` merged in-place recovery; field reports say it does not fire. `#126356` was closed `not_planned` as a duplicate of `#123327`, not as repaired.

7. **Heap OOM is independently reported and not closed by the 2026-08-02 ambient-drain refactor.** `#118271` merged; karmaterminal already carried it and still leaked. `#120394` and `#91588` remain open. Closed `#121202`/`#121203`/`#121214` were superseded on static analysis, not a live heap artifact.

8. **Two Project 87 owners have no upstream issue/PR.** `#1258` (payload-free ingress completion lineage) and `#1260` (typed `admitReplyTurn` rejection reasons) exist only on fork branches. Adjacent upstream items (`#122855`, `#118879`) do not own those seams.

9. **Fleet-only confounders must stay separate.** `#1265` repaired allowlist omission, archived-session reuse, and a bot-to-bot `allowBots=true` feedback loop. Those are operator/config incidents. They do not retire `#1246`/`#1254`/`#1257`.

10. **Fresh 2026-08-20 local reproductions (Elliott 794-row oldest-first drain; Rune 863-row `handler-timeout` + 930 MiB agent DB; Ronan 3.9 GiB agent DB + stalled claim) map onto open upstream seams, not onto merged fixes.**

## Per-Project-87 crosswalk

| P87                                                              | Title (short)                                     | Classification               | Best upstream refs                                                                                                                                                                                                                                     | Fix on current main?                               | Remaining gap                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------- |
| [kt#1246](https://github.com/karmaterminal/openclaw/issues/1246) | Day-old ingress adopted; obsolete visible replies | `exact-match-open`           | [#97320](https://github.com/openclaw/openclaw/issues/97320), [#121204](https://github.com/openclaw/openclaw/pull/121204), [#97435](https://github.com/openclaw/openclaw/issues/97435)                                                                  | No                                                 | Expiry still mention-gated; settlement still emits             |
| [kt#1247](https://github.com/karmaterminal/openclaw/issues/1247) | Fleet heap leak to OOM                            | `partial-shared-cause`       | [#120394](https://github.com/openclaw/openclaw/issues/120394), [#91588](https://github.com/openclaw/openclaw/issues/91588), [#115424](https://github.com/openclaw/openclaw/issues/115424), [#118271](https://github.com/openclaw/openclaw/pull/118271) | Partial / insufficient                             | Residual retainer unproven; leak continues after #118271       |
| [kt#1254](https://github.com/karmaterminal/openclaw/issues/1254) | Duplicate / no-payload / no-visible Discord turns | `partial-shared-cause`       | [#112259](https://github.com/openclaw/openclaw/issues/112259), [#113530](https://github.com/openclaw/openclaw/issues/113530), [#116486](https://github.com/openclaw/openclaw/pull/116486)                                                              | No single owner                                    | Multiple independent drop seams still open                     |
| [kt#1255](https://github.com/karmaterminal/openclaw/issues/1255) | Ingress abandonment bypasses retry budget         | `exact-match-open`           | [#124337](https://github.com/openclaw/openclaw/pull/124337)                                                                                                                                                                                            | No. Current `onAbandoned` still `releaseUnadopted` | PR unmerged; live handler-timeout sibling still open           |
| [kt#1256](https://github.com/karmaterminal/openclaw/issues/1256) | Settled-turn finalization erases reason           | `exact-match-open`           | [#124454](https://github.com/openclaw/openclaw/pull/124454); yield sibling [#122076](https://github.com/openclaw/openclaw/issues/122076)/[#124176](https://github.com/openclaw/openclaw/pull/124176)                                                   | No                                                 | PR is instrumentation only; zero-payload unrepaired            |
| [kt#1257](https://github.com/karmaterminal/openclaw/issues/1257) | Multi-GB agent SQLite sync reads block turns      | `exact-match-open`           | [#119884](https://github.com/openclaw/openclaw/issues/119884), [#119720](https://github.com/openclaw/openclaw/issues/119720), [#119901](https://github.com/openclaw/openclaw/pull/119901), [#119739](https://github.com/openclaw/openclaw/pull/119739) | No                                                 | ANALYZE PRs unmerged; sync write/read path remains             |
| [kt#1258](https://github.com/karmaterminal/openclaw/issues/1258) | Ingress completion clears terminal lineage        | `no-upstream-match-found`    | Adjacent only: [#122855](https://github.com/openclaw/openclaw/pull/122855), [#112259](https://github.com/openclaw/openclaw/issues/112259)                                                                                                              | No                                                 | Fork branch only; no upstream issue/PR                         |
| [kt#1259](https://github.com/karmaterminal/openclaw/issues/1259) | Route materialization collapses reasons           | `exact-match-open`           | [#124466](https://github.com/openclaw/openclaw/pull/124466)                                                                                                                                                                                            | No                                                 | Instrumentation PR unmerged                                    |
| [kt#1260](https://github.com/karmaterminal/openclaw/issues/1260) | Reply-turn admission collapses 3 reasons          | `no-upstream-match-found`    | Adjacent: [#118873](https://github.com/openclaw/openclaw/issues/118873)/[#118879](https://github.com/openclaw/openclaw/pull/118879)                                                                                                                    | No                                                 | Fork branch only; #118879 is recovery-residue, not reason enum |
| [kt#1261](https://github.com/karmaterminal/openclaw/issues/1261) | HTTP-green Gateway + corrupt state DB             | `exact-match-open`           | [#125744](https://github.com/openclaw/openclaw/issues/125744), [#123327](https://github.com/openclaw/openclaw/issues/123327), [#117262](https://github.com/openclaw/openclaw/issues/117262)                                                            | No                                                 | Health stays success-shaped; recovery #114278 insufficient     |
| [kt#1263](https://github.com/karmaterminal/openclaw/issues/1263) | Heap OOM then inconsistent state DB               | `partial-shared-cause`       | [#115424](https://github.com/openclaw/openclaw/issues/115424) + [#125744](https://github.com/openclaw/openclaw/issues/125744)/[#123327](https://github.com/openclaw/openclaw/issues/123327)                                                            | No                                                 | Combined OOM→freelist fail-closed loop is incident-shaped      |
| [kt#1265](https://github.com/karmaterminal/openclaw/issues/1265) | Sick-ward rollup / post-recovery speech           | `symptom-only-or-confounded` | Uses [#121204](https://github.com/openclaw/openclaw/pull/121204) as related; rest is fleet config                                                                                                                                                      | N/A                                                | Allowlist / `allowBots` / archived session are local           |

Closed without a merged fix is **not** classified `exact-match-fixed-or-merged`.

## Shared causal clusters

### A. Durable ingress drain: stale ambient answered as current

- **Seam:** `channel_ingress_events` FIFO / oldest-first claim → agent turn → visible reply.
- **Invariant:** a stale pending row may be settled for accounting but must not emit a new reply from obsolete context.
- **Upstream:** `#97320` (same sprites channel), `#121204` (always-on Discord, 13h lag, `attempts=496` head after healthy restart), `#97435` (LINE delayed ~2h then drained).
- **Why `#121204` is not yet a 1246 cure:** it still expires stale ambient only when mention is required. Elliott `Activation: always` never expires. Missing `channel.type` also historically failed the fence (`undefined !== "thread"` plus `requireMention`).
- **Current main:** stale-ambient commits exist on other karmaterminal branches (`ebd44c4d30a` and relatives) and are **not** ancestors of `eed64163b62`.

### B. Pre-adoption abandonment / handler-timeout / retry budget

- **Seam:** claim → adoption watchdog / abandon → `onAbandoned` vs `applyFailureDisposition`.
- **`#1255` / `#124337`:** `onAbandoned` releases unconditionally; poison head retries forever. Observed 42 Discord retries / ~1h46m.
- **Current main evidence** (`src/channels/message/ingress-drain.ts`):

```ts
onAbandoned: async () => {
  await releaseUnadopted(state, { lastError: "turn-abandoned" });
},
```

- **Sibling, not duplicate:** `#126231` / `#126358` — `handler-timeout` marks `failed` with `attempts=0` (Rune/Elliott five-minute claim→adoption). `#120419` requeues pre-adoption stalls instead of immediate dead-letter. Same neighborhood, different disposition owner.

### C. Visible dispatch with empty payload / lost final

- **Seam:** run completed → payload projection → outbound queue.
- **`#113530`:** Codex `final_answer` and transcript exist; Telegram documents sent; `visible channel turn dispatched with no queued reply payloads`; correlated 3.2s SQLite write + memory pressure.
- **`#112259`:** zero-payload dispatch, no run, no transcript, no retry/dead-letter. Confirmed later on WhatsApp and Telegram.
- **`#116486`:** stop treating every zero-count warning as a silent drop (attribution, not delivery repair).
- **Merged mitigations that do not close 1254:** `#114531` (core fallback), `#100474` (empty-reply hardening). `#112042` closed as implemented; `#114137` closed as misfiled agent-side silence.

### D. Codex settled-turn finalization

- **`#1256` / `#124454`:** unlabeled `undefined` exits erase the attestation failure; warning is undifferentiated; empty preparation preserved.
- **`#122076` / `#124176`:** `sessions_yield` should skip capture. P87 traces had no yield marker. Do not merge these into one fix.

### E. Large agent SQLite on the Gateway event loop

- **`#119884`:** post-migration 2.58 GB agent DB; `chat.history` 15,084 ms → 64 ms after `ANALYZE`; liveness 31–57 s.
- **`#119720`:** 16.7 GB → 970 MB prune without ANALYZE; 36.7 s session-catalog; sync `agent.write` 1–2 s holds; event-loop utilization 1.
- **`#1257`:** 3.8–6.6 GB stores; `loadTranscriptEventsSync` 2.3–5.4 s holds during finalization.
- **Adjacent amplifiers:** `#112423` (archive materializes full transcript on the loop), `#115908` (projection reconcile livelock), `#112758` (missing mmap/cache pragmas), `#123143`/`#123144` (suspected sync stalls).
- **Rune/Ronan 2026-08-20:** 930 MiB and 3.9 GiB agent DBs with integrity `ok` and repeated slow transaction holds — same class as `#119720`/`#119884`, not `#1261` corruption.

### F. Shared-state writer ownership and physical corruption

- **`#117262`:** three write handles on `openclaw.sqlite`; WAL stuck at 4 MB; ~33 s stalls.
- **`#125316`:** audit worker opens a second writable connection (remaining gap after merged `#123674`).
- **`#123327`:** WAL checkpoint copies an index leaf over page 1 (`file is not a database`); Telegram delivery, tasks, plugin state, device-pair fail.
- **`#125744`:** recurring ptrmap/freelist corruption on 2026.8.1; process holds unlinked `-shm`; cron/telegram/delivery/exec-approvals fail while Gateway stays up. Reproduced on WSL2 as well as KVM ext4.
- **`#1261`/`#1263`:** Cael overflow-list / Ronan `Freelist: size is 267 but should be 274` after 32 GiB heap death. Product gap: HTTP/systemd stay healthy until integrity fail-closed, or stay healthy while owners fail every second.
- **`#114278` merged** “recover without restart”; `#125744` says it never fired. `#101290` (CLI preflight corrupt live DB) is closed completed — a _cause_ candidate, not the HTTP-green detection gap.

### G. Memory / restart-recovery coupling

- Independent leak reports: `#120394`, `#91588`, `#119578` (Control UI `chat.history` poll).
- `#115424`: one turn OOMs; restart-recovery hot-resumes the same session → 7 core dumps.
- `#118271` merged 2026-08-03; insufficient for the residual leak (karmaterminal already had `357087b9c78` on the leaking composite).
- Joint hypothesis from kt#1246 comment: stale-ingress admit → no-payload turn → re-claim loop retains heap. Plausible, not proven.

### H. Missing typed lineage / reasons (fork-only)

- **`#1258`:** `completed` clears payload/metadata; policy-gate vs adopted-run vs delivered vs intentional-silence vs error are indistinguishable. Fork `codeagent/ward-1258-m3-lineage` only.
- **`#1259` / `#124466`:** prepared-route materialization reasons (open PR).
- **`#1260`:** `admitReplyTurn` collapses `expected-session-mismatch` / `recovery-owner-invalidated` / `pre-operation-interrupted`. Fork only. Evaluate `#118879` only if the selected reason is recovery-owner.

## Merged / fixed versus open gaps

### Merged on upstream `main` (adjacent, not a P87 close)

| PR                                                          | Merged     | Why it does not retire P87                                                              |
| ----------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| [#118271](https://github.com/openclaw/openclaw/pull/118271) | 2026-08-03 | Ambient-state drains; leak continued on builds that already contained it                |
| [#114278](https://github.com/openclaw/openclaw/pull/114278) | 2026-07-29 | In-place corruption recovery; `#125744` says it never runs                              |
| [#123674](https://github.com/openclaw/openclaw/pull/123674) | 2026-08-17 | Stops node/device RPCs from being a second writer; audit-worker gap remains (`#125316`) |
| [#114531](https://github.com/openclaw/openclaw/pull/114531) | 2026-07-27 | Fallback text when a visible turn has no reply; does not restore lost finals or lineage |
| [#100474](https://github.com/openclaw/openclaw/pull/100474) | 2026-07-06 | Empty-reply delivery hardening                                                          |
| [#125188](https://github.com/openclaw/openclaw/pull/125188) | 2026-08-17 | Reports session changes during deletion; not `admitReplyTurn` reason enum               |

### Open high-confidence repair PRs (not shipped)

| PR                                                                                                                        | Maps to             | Status 2026-08-20                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------ |
| [#121204](https://github.com/openclaw/openclaw/pull/121204)                                                               | 1246 / 1265         | Open; mention-gated expiry remains               |
| [#124337](https://github.com/openclaw/openclaw/pull/124337)                                                               | 1255                | Open; ClawSweeper asked for live proof           |
| [#124454](https://github.com/openclaw/openclaw/pull/124454)                                                               | 1256                | Open; instrumentation only                       |
| [#124466](https://github.com/openclaw/openclaw/pull/124466)                                                               | 1259                | Open; instrumentation only                       |
| [#119901](https://github.com/openclaw/openclaw/pull/119901) / [#119739](https://github.com/openclaw/openclaw/pull/119739) | 1257                | Open; overlapping ANALYZE-after-compact          |
| [#120419](https://github.com/openclaw/openclaw/pull/120419)                                                               | 1255 sibling        | Open; handler-timeout requeue                    |
| [#126358](https://github.com/openclaw/openclaw/pull/126358)                                                               | 1255 sibling / Rune | Open; retries `handler-timeout` `attempts=0`     |
| [#125316](https://github.com/openclaw/openclaw/pull/125316)                                                               | 1261 / 117262       | Open; single writer for audit                    |
| [#116486](https://github.com/openclaw/openclaw/pull/116486)                                                               | 1254                | Open; warning attribution                        |
| [#118879](https://github.com/openclaw/openclaw/pull/118879)                                                               | 1260 maybe          | Open; recovery residue, not reason enum          |
| [#124176](https://github.com/openclaw/openclaw/pull/124176)                                                               | 1256 sibling        | Open; yield-only                                 |
| [#125605](https://github.com/openclaw/openclaw/pull/125605)                                                               | delivery recovery   | Open; AbortError should not consume retry budget |

### Closed issues that are not “fixed”

- `#114137` closed `completed` after the reporter reclassified incidents as **agent-side silence**. Not a gateway repair.
- `#121202`/`#121203`/`#121214` closed as superseded **without a live heap artifact**.
- `#126356` closed `not_planned` as duplicate of `#123327`. Corruption class remains open.
- `#116855` / `#118832` closed **unmerged**.

## Fresh local reproductions as discriminators

Used only to test whether upstream text matches the live seam. No private payloads.

| Seat / runtime      | Observation                                                                                                                      | Upstream mapping                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Elliott `46f4d211…` | 794 sprites ingress rows from 2026-08-18 drained oldest-first after `/new`, ~30–50s, stale visible replies; `Activation: always` | Exact `#1246` / `#97320` / `#121204` predicate gap (`requireMention` false → no expiry)    |
| Rune same runtime   | 863 sprites rows; 5-minute claim→adoption `handler-timeout`; slow SQLite holds; rising RSS; 930 MiB agent DB; integrity ok       | `#126231`/`#126358` + `#119720`/`#1257`; not `#1261`                                       |
| Ronan after reboot  | integrity ok; 3.9 GiB agent DB; slow holds; RSS above 4 GiB; stalled sprites claim                                               | `#119720`/`#119884` + `#1246` drain; `#115424` if restart-recovery re-enters the same turn |

Offline compact reclaiming ~23.5 MiB shared-state + WAL clear is operator hygiene, not an upstream fix.

## Fleet-only versus upstream product

| Observation                                                 | Class                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Rune sprites channel omitted from guild allowlist (`#1265`) | Fleet config                                                             |
| Cael archived session + 1.0 GB / 306k-token reuse           | Mixed: local state + missing “archived + over-budget” fail-closed speech |
| `allowBots=true` + unset `requireMention` bot-to-bot loop   | Fleet config; mention-skip still recorded in channel history is product  |
| `requireMention=true` palliative then revert                | Fleet policy, not accepted remedy                                        |
| Day-old `attempts=0` FIFO visible replay                    | **Product** (`#97320`, `#121204`)                                        |
| `onAbandoned` without retry budget                          | **Product** (`#124337`, still on main)                                   |
| No ANALYZE after migration/prune                            | **Product** (`#119884`, still on main)                                   |
| HTTP 200 while state DB integrity fails every second        | **Product** (`#125744`, `#123327`)                                       |

## Recommended next read-only / linking actions

Do not open or comment unless a later workorder authorizes GitHub writes.

1. **Treat `#121204` + `#97320` as the 1246 review pair.** Read the exact `#121204` head for `canExpireDiscordStaleAmbientBacklog` / `requireMention`. If expiry is still mention-gated, 1246 is not cured by landing that PR as-is.
2. **Keep `#124337` and `#126358` as siblings, not duplicates.** Abandonment-without-budget ≠ handler-timeout-with-`attempts=0`. Both can starve the same Discord lane.
3. **Do not land `#124454` as a 1254/1256 speech cure.** It only names the rejection. Need a later owner-branch repair plus a visible-payload path.
4. **Prefer `#119884`/`#119720` over a new 1257 issue.** The ANALYZE + sync-write pair is already specified. Check whether `#119901` and `#119739` should be one PR.
5. **File or link `#1258` and `#1260` upstream only if the frond wants those instrumentation seams public.** They currently have no upstream number.
6. **Corruption: follow `#125744` and `#123327`, not `#126356`.** Ask whether health/ready should fail-closed when `integrity_check` fails — that is the 1261 product ask, and it is still missing.
7. **Memory: do not absorb `#118271` again.** Next evidence is a heap snapshot under live ingress-replay + large agent DB, compared to `#120394`.
8. **Ignore textual Discord/SQLite lookalikes** unless the lifecycle owner matches (claim/adoption/finalization/ANALYZE/WAL writer). `#120142` is a slash-command warning string, not 1254.

## Method limits

- GitHub issue search totals are noisy (OR queries and popular tokens inflate counts). Classification used full bodies + comments + merge state, not snippet hits.
- GraphQL project cards were not used.
- Neighbors embeddings were attempted; `gitcrawl neighbors` produced empty non-JSON on this host. Hybrid + keyword + REST search covered the same space.
- Current `openclaw/openclaw` `main` may have moved after this checkout; merge status was live-checked 2026-08-20 via REST.
- No claim that every low-confidence memory-leak issue is the same retainer as `#1247`.
