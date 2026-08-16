# Upstream release/instability scan — Project 87 ward families

Scan date: 2026-08-16 (PDT 2026-08-15 evening).  
Authority: `openclaw/openclaw` `upstream/main` `eb13f5719f0` (375 commits after absorbed base `530b33e4e37264c89ecd5abdd06279dd23d5c867`, 2026-08-14).  
Method: live `gh` search + body/PR inspection; git history on `upstream/main`; GitNexus discovery only.  
No code, GitHub, or fleet mutations.

## Sources and freshness

| Source | Freshness | Use |
| --- | --- | --- |
| Live `gh` (scribe-dandelion-cult) | 2026-08-16 | Last 7/30d counts, issue/PR bodies, releases, `beta-blocker` labels |
| gitcrawl `openclaw/openclaw` | last_sync **2026-08-06T10:41:32Z** (~9d stale) | Pre-window archive; titles only until live body check |
| GitNexus `openclaw` @ `530b33e` | indexed 2026-08-14; **375 commits behind current main** | Owner-file/symbol discovery only |
| Local `upstream/main` | fetched this session | Owner-file churn |

Gitcrawl cannot answer last-7d prevalence. Live search raw hits are inflated by “retry budget”, generic “401”, and “session mismatch”. Counts below are **judged relevant after title+body**, not raw search cardinality.

Complaint prevalence ≠ unique installations. Almost every cited issue is one reporter. Repeat comments on one ticket are not extra installs.

## Project 87 map (fork, not upstream)

Parent `karmaterminal/openclaw#1254`. Serialized micro-items:

| Micro | Fork issue | Family |
| --- | --- | --- |
| M1 | #1255 | Ingress abandonment bypasses retry budget / stuck lane |
| M2 | #1256 | Codex settled-turn finalization erases reason → zero payload |
| M3 | #1258 | Ingress `completed` clears terminal-outcome lineage |
| M4 | #1257 | Multi-GB agent SQLite sync reads / event-loop stalls |
| M5 | #1260 | `admitReplyTurn` collapses three lifecycle reasons |
| M6 | #1259 | Prepared-route materialization collapses exactness failures → 401 fallback |

Treatment serialization ≠ shared-cause. None belongs in upstream #121204.

---

## 1. Do upstream users report the same six families?

**Yes for four families as recurring user-visible classes. Partial for two.**

| Family | Same class upstream? | Exact P87 owner match? |
| --- | --- | --- |
| F1 abandonment / retry / stuck channel | **Yes**, durable-ingress abandon/retry/stuck-lane is an active 30d class | **Partial.** Upstream fixed Discord *failed* poison + Telegram *deduped abandon retry*. Current `onAbandoned` still **releases** instead of `applyFailureDisposition` (`src/channels/message/ingress-drain.ts:497-498`). #122878 text: existing `onAbandoned` callers unchanged. |
| F2 Codex settled-turn / empty reply | **Yes**, same log line and empty-reply class | **Partial.** Closed beta-blocker #116851 was canonical-SQLite history load. Open #122076/#124176 are **yield-specific** skip-capture. P87 M2 is unlabeled `undefined` exits in `buildCodexSettledTurnFinalizationContext`, not the yield predicate. |
| F3 large SQLite / lock / event-loop | **Yes**, highest independent-operator density | **Adjacent, not identical.** Field reports are ANALYZE/planner, multi-handle state-DB, sync `agent.write`, archive-on-cleanup. P87 M4 is `loadTranscriptEventsSync` on 3.8–6.6 GB agent DBs. Same amplifier class; different owner function. |
| F4 ingress completed / no visible reply / missing lineage | **Yes**, “zero queued reply payloads” / “No reply was generated” is endemic | **Closest product ask is diagnostic, not Rune-specific.** #120142 + PR #120150 want a reason enum on empty Discord replies. No open issue asks to persist payload-free ingress terminal lineage. |
| F5 reply-turn session-changed / admission | **Yes**, restart-recovery / “Session changed while starting work” | **Partial.** #118873/#118879 are behavioral unblock after settled recovery. P87 M5 is reason-only instrumentation of `expected-session-mismatch` / `recovery-owner-invalidated` / `pre-operation-interrupted`. |
| F6 route materialization / auth fallback / 401 | **Weak exact match** | Many 401s are Copilot OAuth, Control UI, compaction model-id, WhatsApp pairing. **Zero** last-30d hits for `materializePreparedRuntimeModel`. Closest historical: #105207 rematerialize-same-route (closed, latency). |

---

## 2. Prevalence (last 7d / 30d)

Windows: 7d = created ≥ 2026-08-08; 30d = created ≥ 2026-07-16.  
**Judged** = body/title overlap with the P87 owner, not keyword soup.

| Family | 7d issues (open/closed) | 7d PRs (open/merged/closed) | 30d issues judged | 30d PRs judged | Symptom overlap |
| --- | --- | --- | --- | --- | --- |
| F1 abandon/retry/stuck | ~5 (2 open / 3 closed) | ~6 (2 open / 4 merged) | ~12 | ~10 | Abandoned claim retried then tombstoned `completed`; poison event blocks lane after retry exhaustion; durable claim held across long worker; WhatsApp append-fail loss |
| F2 Codex settled-turn | 2 open high-signal + several zero-payload siblings | 1 open exact (#124176); several merged adjacent | ~8 high-signal | ~6 | Log: `codex settled-turn finalization context is unavailable`; tool settled, channel empty / generic fallback |
| F3 SQLite/event-loop | ~8 open (mixed owners) | few exact; #119901 open doctor ANALYZE | ~12 high-signal | ~4 | 15–57s liveness, `slow SQLite transaction`, `database is locked`, sync writes, stale planner after migrate/prune |
| F4 no visible reply / lineage | ~6 (mix) | 1 open Discord reason (#120150, created 2026-08-07 → 30d) | ~15 | ~4 | `no queued reply payloads`; opaque empty-reply warning; ingress `completed` hiding loss (#115888 body) |
| F5 admission / session changed | ~3 judged | 1 open (#118879, created 2026-08-03 → 30d) | ~6 | ~2 | `Session changed while starting work`; `restart recovery claim changed before agent adoption` |
| F6 materialize / 401 fallback | 0 exact materialize; several unrelated 401 | 0 exact | 0 exact M6; ~8 generic 401 | 0 exact | Elliott-shaped “prepared route fail then Copilot 401” **not found** as a public issue |

### High-overlap references (inspected bodies, not titles)

**F1**

- https://github.com/openclaw/openclaw/issues/115888 (closed 2026-07-30) — abandon → retry → 5m dedupe → tombstone `completed`; only generic zero-payload warning. Fix merged #115891.
- https://github.com/openclaw/openclaw/issues/123519 (closed 2026-08-14) + PR #123528 — Telegram abandoned durable-ingress retry falsely completed.
- https://github.com/openclaw/openclaw/pull/122878 (merged 2026-08-13) — Discord retry-exhaustion poison blocked the lane. **Explicitly left `onAbandoned` unchanged.**
- https://github.com/openclaw/openclaw/pull/124016 (merged 2026-08-15) + #124096 + #120104 — settlement/fan-out/bound-error; not pre-adoption budget.
- https://github.com/openclaw/openclaw/issues/124193 (open 2026-08-15) — WhatsApp inbound permanently lost when durable queue cannot append.
- https://github.com/openclaw/openclaw/issues/111566 (closed Jul) — drain holds lane when dead-letter write fails.

**F2**

- https://github.com/openclaw/openclaw/issues/116851 (closed 2026-07-31, label `beta-blocker`) — same warning + lost final reply on canonical SQLite; fixed via #116944 (merged). **Does not add rejection-reason enum.**
- https://github.com/openclaw/openclaw/issues/122076 (open 2026-08-11) + PR #124176 (open, `behind`) — yield path false warning. P87 traces had **no yield marker**.
- https://github.com/openclaw/openclaw/issues/119725 (closed 2026-08-05) — settled-turn drops completed action evidence.
- https://github.com/openclaw/openclaw/issues/118274 / #118489 — settled failed-tool → no assistant payload.
- https://github.com/openclaw/openclaw/issues/122690 (open 2026-08-12) — Codex terminal message-tool failure settles as successful zero-payload.
- https://github.com/openclaw/openclaw/issues/123117 (closed 2026-08-13) — output exists, **zero queued reply payloads**.

**F3**

- https://github.com/openclaw/openclaw/issues/119884 (open, P1) + PR #119901 (open) — post-migration no ANALYZE; 2.58 GB agent DB; 15s session ops / 31–57s liveness. **This is the PR P87 #1257 already flags as adjacent.**
- https://github.com/openclaw/openclaw/issues/119720 (open, P1) — 16.7 GB → 970 MB prune without ANALYZE (36.7s → 809ms) **and** sync `agent.write` 1–2.1s holds. Closest to P87 “large store + sync loop”.
- https://github.com/openclaw/openclaw/issues/117262 (open, P1) — 3 write handles on `state/openclaw.sqlite`, ~33s stalls.
- https://github.com/openclaw/openclaw/issues/112423 (open, P1) — large transcript cleanup blocks event loop; #112424 is phase-1 worker, issue stays open.
- https://github.com/openclaw/openclaw/issues/118719 (closed) — slow lock wait on 1.2 GB agent DB, `busy_timeout=0`.
- https://github.com/openclaw/openclaw/issues/113622 (open) — persistent `database is locked` on session/cron start.

**F4**

- https://github.com/openclaw/openclaw/issues/120142 (open) + PR #120150 — Discord empty-reply warning needs a **reason enum**. Same product hole as M3, Discord-slash scoped.
- https://github.com/openclaw/openclaw/issues/112259 (open) — zero-payload dispatch has no retry/dead-letter/user-visible failure.
- https://github.com/openclaw/openclaw/pull/116486 (open) — attribute zero-payload warnings; stop false silent-drop alarms.
- https://github.com/openclaw/openclaw/issues/121058 (closed 2026-08-09) — silent reply still recurring after #116277.

**F5**

- https://github.com/openclaw/openclaw/issues/118873 + PR #118879 (open, P1, `status: needs proof`) — healthy session blocked by `Session changed while starting work` after recovery settled. **P87 #1260 says: if Silas reason is `recovery-owner-invalidated`, evaluate #118879 instead of duplicating.**
- https://github.com/openclaw/openclaw/issues/118839 (open, P1) — `restart recovery claim changed before agent adoption` on 2026.7.2-beta.7 WebChat→Telegram-bound session; five silent drops.
- https://github.com/openclaw/openclaw/issues/101909 (closed 2026-08-11) — Codex **reply-session-init conflict**; tool results empty. Closed by maintainer; linked self-heal PRs closed unmerged. Long-lived class, not last-7d new breakage.

**F6**

- No live 30d issue/PR names `materializePreparedRuntimeModel` or prepared-route exactness reasons.
- https://github.com/openclaw/openclaw/issues/105207 (closed 2026-07-12, maintainer) — double materialize of same auth route (latency).
- https://github.com/openclaw/openclaw/issues/114603 — proxy token cannot materialize subscription routes.
- Generic 401s (#121825 onboarding, #119584 WhatsApp pairing, #119949 compaction model-id) are **not** M6.

---

## 3. Owner-file churn since `530b33e` (2026-08-14)

Main moved **375 commits** in ~2 days. That is high **repo** flux, not high **these-owner** flux.

| Path / symbol | Commits on `upstream/main` since 530b33e | Notes |
| --- | --- | --- |
| `src/channels/message/ingress-drain.ts` | **0** | `onAbandoned` still `releaseUnadopted(..., { lastError: "turn-abandoned" })` not `applyFailureDisposition` |
| `ingress-drain-lifecycle.ts`, `ingress-monitor.ts` | **0** | |
| `src/plugin-sdk/channel-ingress-runtime.ts` | **3** | #124096 fan-out; #124016 legacy failure settlement; #120104 bound errored settlements |
| `extensions/codex/.../settled-turn-context.ts` | **0** | M2 owner untouched |
| `settled-turn-projection.ts` | 1 | #124079 type-assert cleanup only |
| `settled-turn-finalization-result.ts` | **0** | |
| `buildCodexSettledTurnFinalizationContext` `-S` | **0** | |
| `session-accessor*.ts` / `loadTranscriptEventsSync` | 1–3 | #123495 cleanup-deletes-readable-transcripts; #121332 follow-ups after bg transcript; not sync-read offload |
| `reply-turn-admission.ts`, `followup-turn-admission.ts`, `get-reply-run-admission.ts` | **0** | `admitReplyTurn` / `rejectLifecycleInvalidatedWork` unchanged |
| `materialize-model.ts`, `credential-scoped-model.ts` | **0** | `materializePreparedRuntimeModel` `-S` empty |
| `dispatch-result.ts` | **0** | |

Neighborhood (not the P87 functions): session catalog/transcript fuse/maintenance (#123987, #124126, #123081, #123896); Codex replay-path refactor #123762; token-limited partial replies #123546.

**Read:** current main is a high-churn release week around UI/gateway/plugins. The six P87 owner functions are **mostly frozen** since 530b33e. Instability in these wards is **long-lived architecture debt becoming visible under persistent/large-store/Codex-harness load**, plus a few adjacent ingress settlement patches that do not close M1.

`530b33e` itself (`#123608`) is “keep gateway control traffic responsive under concurrent turns” — same *liveness* theme as F3, different owner.

---

## 4. Instability period vs long-lived debt

Verdict: **both, stacked.**

- **Release-week flux (now):** 375 commits / ~48h on main; 2026.8.1-beta.2 cut 2026-08-15; ingress settlement PRs landing same day as this scan. Easy to misread as “these owners are on fire.” File-level proof says they are not.
- **Long-lived, now load-visible:**
  - Durable ingress abandon/complete confusion documented since at least #115888 (2026-07-29) and #111566 (2026-07-19).
  - Codex settled-turn empty reply was a **7.2-beta blocker** (#116851, 2026-07-31); warning string still appears on current main (#122076).
  - Multi-GB SQLite + sync event-loop is a 2026.7 SQLite-session-migration debt (#118719, #119720, #119884, #112423). Independent operators, GB-scale stores, same ANALYZE/sync-write story.
  - Admission “session changed” / recovery-owner residue: closed once (#114255, #117096), **regressed** on 7.2-beta.7 (#118839), still open with #118879.
- **Not current-main unique breakage:** P87 fossils were RED on deployed `6b09`, absorbed `530b33e`, and current main. That matches “debt visible under persistent fleet load,” not a 8.1-beta regression.

Do not treat UI/CI commit storm as evidence the six owners just broke.

---

## 5. Release status (evidence only)

**Published**

| Tag | When | Role |
| --- | --- | --- |
| `v2026.8.1-beta.2` | 2026-08-15T05:36:23Z | Current pre-release train |
| `v2026.7.1-2` | 2026-08-04 | Latest **non-prerelease** (`latest`) |
| `v2026.6.34` | 2026-08-08 | Extended-stable line still publishing |
| `v2026.7.2-beta.7` | 2026-08-02 | Last 7.2 pre-release |

No GitHub milestones. No `v2026.7.2` GA tag exists.

**Authoritative statements**

- Release notes for `2026.8.1-beta.2` highlight secret-host binding, GPT-5.6 Ultra/Sol/Terra/Luna + atomic `/model` fallback, **shared channel ingress monitors**, **SQLite snapshot backup**, macOS profiles, plugin provenance. They do **not** list P87 M1–M6 as blockers or shipped fixes.
- Open issues labeled `beta-blocker` now: #124133 (snowluma `formatInboundEnvelope` on 8.1-beta.2), #123136 (7.2-beta plugin version drift). **Neither is a P87 family.**
- Closed 30d `beta-blocker` that *is* a family: #116851 (Codex SQLite final replies) — closed 2026-07-31 via #116944.

**What is not evidenced**

- No maintainer comment found that *delays* 2026.7.2 *because of* these six families. Absence of a 7.2 GA is a fact; cause is not inferred.
- 8.1-beta is **imminent as a beta**, not shown as delayed. Stable `latest` remains 2026.7.1-2.

Ingress-monitor work in 8.1 notes is **adjacent to F1** (shared admission/polling/adoption). SQLite snapshots are **operator recovery**, not the sync-read/ANALYZE fix.

---

## 6. Implications for Project 87 ordering and outreach

Keep the serialized DAG (M1 → M2 → M3 → M4 → M5 → M6) unless coordination blocks a later item.

| Micro | Upstream welcome? | Duplicate / coordinate | Outreach note |
| --- | --- | --- | --- |
| **M1 #1255** budget on pre-adoption abandon | **Likely welcome** if tiny, tests show 8× abandon → `retry-limit-exceeded`, next row progresses, cancel stays budget-free | Do **not** restage #122878 / #123528 / #124016. Cite them as sibling settlement, not this owner | PR body must quote #122878 “onAbandoned unchanged” and show `ingress-drain.ts:497-498` still releases |
| **M2 #1256** settled-turn **reason codes** | Welcome as **instrumentation-first** | **Must coordinate #124176** (open, yield skip). Do not land a capture-skip that fights yield exclusion. #116851 already shipped SQLite-target load | Lead with “reason enum, no attestation weaken”; mention #122076 is a different predicate |
| **M3 #1258** ingress terminal lineage | Welcome if additive nullable metadata, no schema bump | Coordinate #120142/#120150 (Discord warning reasons) and #116486 (zero-payload attribution). Different storage vs user-visible string | Frame as discriminator so `completed` ≠ delivery. #115888 is the user-visible “completed but lost” story |
| **M4 #1257** sync transcript read | Welcome **only** with copied-store proof | **#119901 is doctor ANALYZE after compact — not a substitute.** #119720/#119884/#112423/#117262 are competing large PRs / product decisions | Do not claim to fix ANALYZE, WAL, or state-DB multi-handle. Stay on `loadTranscriptEventsSync` + fencing |
| **M5 #1260** admission reason | Welcome if **behavior-identical** | If fossil selects `recovery-owner-invalidated`, **prefer #118879** (open, needs proof) over a second behavioral PR. #118839 is the live regression narrative | Instrumentation PR should name #118879 as the behavioral successor, not compete |
| **M6 #1259** materialize reasons | Welcome as typed redacted reasons | No live duplicate PR. Do not reorder fallback or touch Copilot expiry | Weakest public-demand signal. Still justified as fleet discriminator; do not oversell “users are filing this” |

**Ordering implication:** M1 remains the only fully proven behavioral defect with a clean upstream hole. M2/M5 should stay reason-first so they do not collide with #124176 / #118879. M4 should not jump the queue: upstream already has P1 SQLite product threads; a third overlapping “make SQLite fast” PR will be read as duplicate unless the copied-store fossil names `loadTranscriptEventsSync` exclusively. M3 is the best *shared* product language (empty reply / completed-but-lost). M6 last; no public twin.

---

## Uncertainty

- gitcrawl stale 9d; last-7d is live-`gh` only. Search API rate-limited once; later batches used simple queries. Some relevant items may exist under unrelated titles.
- Judged 7d/30d counts are conservative. Raw search was 20-hit capped per query and polluted by homonyms.
- Unique-install count is not knowable from GitHub. SQLite has ≥3 independent large-store reporters; other families look like 1-install tickets plus the P87 fleet.
- #101909 closed “completed” while self-heal PRs are closed unmerged — shipped-vs-closed ambiguity.
- #124176 `mergeable_state: behind`; may move before M2 outreach.
- GitNexus processes pointed at Feishu/MS Teams ingress tests more than Discord drain; verified against current files, not the index.
- No Discord/maintainer chat was used. Release conclusions are GitHub releases + `beta-blocker` labels only.
- This checkout is report-only; full test suite was not run (`full-suite: n/a`).

## Commands

```text
git fetch upstream main
git rev-parse upstream/main   # eb13f5719f028c49c94ea80faecd8b0b44ea401e
git rev-list --count 530b33e4e37264c89ecd5abdd06279dd23d5c867..upstream/main  # 375
gitcrawl doctor --json        # last_sync 2026-08-06
gh release list -R openclaw/openclaw
gh release view v2026.8.1-beta.2 -R openclaw/openclaw
gh search issues --repo openclaw/openclaw --label beta-blocker --state open
# plus per-family gh search issues/prs --created '>=2026-07-16' and body reads via issue_read
git log --oneline 530b33e4e37264c89ecd5abdd06279dd23d5c867..upstream/main -- <owner files>
git log --oneline 530b33e4e37264c89ecd5abdd06279dd23d5c867..upstream/main -S <symbol>
```
