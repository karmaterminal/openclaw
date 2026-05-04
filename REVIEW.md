# Critical review — Phase 3 REDUX-3 — feature/context-pressure squash branch

- **Reviewed HEAD**: `5307ecad1687161e12ce148cfbd5b3179e42ae63` (`feat(continuation): context-pressure and targeted returns`)
- **Upstream base**: v2026.5.2 tag `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4`
- **Author / committer**: `cael-dandelion-cult`; co-author trailers `elliott-dandelion-cult`, `ronan-dandelion-cult`, `silas-dandelion-cult`, `Claude Opus 4.7 (1M context)`, `Copilot`
- **Diff size**: 311 files, +34520 / −870 (squash patch 41,795 lines)
- **Strip-pass history**: pass-1 (copilot-lane-initial) → pass-2 (manual author/committer/trailers) → pass-3 (mechanical 7-item from redux-1 REVIEW.md F1–F6+S1) → pass-4 (4 src/test process leaks + 3 RFC Swim N sections) → pass-5 (workflow-sanity over-broad-sed correction + openshell-core test/runtime mismatch from partial revert)
- **Cohort byte-walk**: 4-of-4 substantive (🩸+🌊+🌫+🌻) — B1+B2 fixed, fanoutMode/RFC/strip preserved, no regression

## Verdict

**APPROVE_FOR_PHASE_5** — with two soft notes for cohort sign-off, no review-quality blockers.

The post-strip-pass-5 byte-state is clean enough for force-push to `feature/context-pressure-squashed`. The remaining surfaces below are cohort-shape / surface-tone questions, not correctness blockers. Phase 5 force-push may proceed conditional on cohort sign-off (Phase 4) addressing or explicitly accepting the two soft notes.

## Anchor verifications

| #   | Anchor                                                                                      | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `src/auto-reply/reply/agent-runner.ts:2682 doToolSpawn` (Path A targeting threading, #588)  | ✅ green — `targetSessionKey` / `targetSessionKeys` flow into `doToolSpawn(reservation.plannedHop, …, options)` and through into `spawnSubagentRunWithCleanup` continuation-targeting fields at L2682–L2710                                                                                                                                                                                                                                                                                            |
| 2   | `src/auto-reply/continuation/targeting.ts` (premature-ack removal, #581)                    | ✅ green — durable-file ack is explicitly NOT performed inside the per-recipient loop; comment at the equivalent of L114–L120 cites RFC §2.4 + the durable-vs-in-memory invariant for non-attached recipients                                                                                                                                                                                                                                                                                          |
| 3   | `src/infra/heartbeat-reason.ts:42–44` (delegate-return classifier, #586)                    | ✅ green — `if (trimmed === "delegate-return") return "wake";` lands alongside the existing `wake` / `continuation` / `silent-wake-enrichment` returns                                                                                                                                                                                                                                                                                                                                                 |
| 4   | `docs/design/continue-work-signal-v2.md` §2.1 + §2.4 (targeted-completion-return semantics) | ✅ green — §2.1 terminology row for `delegate` includes `targetSessionKey` / `targetSessionKeys` / `fanoutMode`; §2.4 documents all 5 return modes (default / single / multi / tree / all), the explicit "fresh sub-agent UUID + nonce-probe expectation" disclaimer, and the multi-recipient-vs-multi-delegate distinction                                                                                                                                                                            |
| 5a  | `CHANGELOG.md` 2026.5.2 (Findings 1+2+3 entries)                                            | ✅ green — Changes carries the unified continue_delegate targeting line; Fixes carries three discrete entries for the heartbeat-classifier (Finding 1), durable-queue preservation (Finding 2), and Path A runtime routing (Finding 3)                                                                                                                                                                                                                                                                 |
| 5b  | `TOOLS.md` 10-line cohort-recognition-engine canon                                          | ⚠️ N/A — only `docs/reference/templates/TOOLS.md` exists in HEAD, unchanged in the diff; `EVIDENCE-LAYERS.md` does not exist on this branch. The canon was likely banked on a separate substrate (cohort-canon repo / memory pins) and is not part of this squash. Workorder substrate-context worded this as "banked alongside (TOOLS.md + EVIDENCE-LAYERS.md)" — this lane could not verify the banking on the squash branch itself; recommend cohort confirm the canon's actual home before Phase 5 |

5 of 5 substantive anchors pass; anchor 5b is a worded-acceptance ambiguity, not a missing-substrate finding.

## Scope concerns

The diff is overwhelmingly continuation-feature load-bearing (context-pressure, compaction, `continue_delegate`, session-delivery-queue, heartbeat, subagent-registry, RFC, OTel tracer-adapter, generated baselines, tool-display schemas, dist topology entries). Two surfaces sit at the scope boundary; both are defensible.

- **`tsdown.config.ts`** (+13) — adds three new dist entries: `auto-reply/reply/agent-runner.runtime`, `auto-reply/continuation/lazy.runtime`, and `subagent-announce.continuation.runtime`. Per the inline comments, all three are bundler-dedup boundaries for singleton-bearing modules (delegate-store, state, context-pressure, delegate-dispatch) — load-bearing for `continue_work` / `continue_delegate` not silently dropping under the dual-chunk split. Scope-justified.
- **`extensions/telegram/src/bot-handlers.runtime.ts:1739–1748`** + **`src/agents/auth-profiles/session-override.ts`** — both call sites adopt the pre-existing `resolveSessionStoreEntry({ store, sessionKey })` helper (defined at v5.2 base in `src/config/sessions/store-entry.ts`) to canonicalize session-keys and clear legacy raw-key entries. The helper was already at v5.2 with two existing call sites in `bot-handlers.runtime.ts`; these new sites bring three more locations onto the normalized-storage pattern. Plausibly continuation-targeting consistency (target-key resolution must agree across dispatch + lookup); the change is small, defensive, and follows the established pattern. Marginal but defensible.
- **`extensions/bluebubbles/src/client.test.ts:602`** — single-line comment cleanup (`(#68xxx)` placeholder issue-ref removed). Cosmetic; does not change behavior. Could be reverted to keep the squash strictly on continuation-feature surfaces; not blocker.
- **`extensions/memory-core/src/memory/manager.atomic-reindex.test.ts:115–117`** — multi-line `vi.fn().mockRejectedValue(...)` rewrap (single line → three lines). Cosmetic formatter convergence; suggests an oxfmt sweep happened during squash. Could be reverted; not blocker.
- **`src/process/exec.test.ts:204–214`** — same shape; `runCommandWithTimeout(...)` rewrap from explicit-multi-line to flatter form. Cosmetic; not blocker.
- **`docs/.i18n/glossary.zh-CN.json`** — single new translation row (`Experimental Features → 实验性功能`). i18n-table append; not continuation-feature load-bearing. Could be reverted; cosmetic.
- **`.gitignore`** — two spurious blank-line additions (one mid-file, one trailing). Cosmetic noise.

The five cosmetic items (telegram + auth-profiles excepted as plausibly load-bearing) total under 30 net line changes and could be reverted to harden the squash to "continuation-feature only" if cohort wants strictest scope discipline. None of them risk upstream.

## Upstream-leakable concerns

Strip-passes 1–5 cleared the high-signal leakage: zero `karmaterminal`, zero `karmafeast`, zero prince-account names in source/comments, zero Discord channel IDs, zero `frond-scribe` references, zero `deploy-gateway` / `openclaw-bootstrap` references, zero workflow edits, zero karmaterminal-only test marks (`skipIf`/`fork-only`), zero hardcoded karmaterminal URLs.

Three mild residuals remain.

### ⚠️ MILD — `cross-session-targeting.test.ts:141, :423` issue-ref collision

`src/auto-reply/continuation/cross-session-targeting.test.ts:141` and `:423` carry comments `// Per #578/#580 fix: …`. Verified against upstream openclaw issue tracker:

| Ref    | Upstream openclaw/openclaw                                        | karmaterminal/openclaw                                                                                                                                                            |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#578` | MERGED — `fix(messages): derive messagePrefix from identity.name` | OPEN — `continue_delegate(targetSessionKey=...) silently ignored at runtime spawn-routing layer; falls through to plain subagent spawn owned by dispatcher (swim-42 OV-1 fire-1)` |
| `#580` | MERGED — `feat: add auto-signing detection to restart-mac.sh`     | OPEN — `continue_delegate silently discards targetSessionKey at runtime spawn-routing (swim-42 OV-1 fire-1)`                                                                      |

The comments mean karmaterminal-internal tracker numbers; if this commit lands on upstream, the `#578/#580` will resolve to wholly unrelated upstream PRs (messagePrefix + macOS code-signing). A maintainer reading the comment would be misdirected.

**Recommended fix** (cohort sign-off scope): either (a) replace bare hash refs with absolute karmaterminal URLs (`https://github.com/karmaterminal/openclaw/issues/578`) so they are unambiguous, or (b) deprose to descriptive text (`Per the durable-queue persistence fix: do NOT immediately ack…`) so the comment is self-contained. Option (b) is probably cleanest for upstream-PR presentation.

### ⚠️ MILD — RFC §9 + appendix scorecards use `OV-1 .. OV-4` without glossary

`docs/design/continue-work-signal-v2.md:1797–1800` lists `OV-1 (failover-policy #52147 gate): PASS / OV-2 (incrementCompactionCount canonical primitives): PASS / OV-3 (diagnostic instrumentation): PASS / OV-4 (earlyWarningBand context-pressure)`. The RFC at line 1510 self-discloses: "The RFC intentionally does not link internal trackers; public evidence is summarized in the appendix scorecards below." A reader can follow `#52147` into upstream and verify the failover-policy gate independently, so the OV-rows are de-facto self-contained, but the OV-N nomenclature is opaque cohort vocabulary without expansion.

**Recommended fix** (optional): single sentence in §9 introducing OV-N as "observability/verification rows" the first time the abbreviation appears, or drop OV-N labelling and just enumerate the four rows. Acceptable as-is for upstream PR review.

### ⚠️ MILD — test-fixture cohort vocabulary

Two test-internal vocabulary tells:

- `src/agents/subagent-announce.continuation-drain.test.ts:591` — `task: "[continuation:chain-hop:1] OV-1 fire-1 reproduction"` (test fixture task-string carries cohort vocabulary).
- `src/auto-reply/continuation/volatile-map-allowlist.test.ts:141` — comment text contains `OV-5 guards the TaskFlow…`.

Tests still pass; the vocabulary is opaque to an upstream maintainer reading test code but is not actively misleading. Lowest priority to scrub.

### NIL bucket (verified clean)

- `.github/workflows/` — zero file changes.
- Author/committer + co-author trailer identities (`cael-dandelion-cult` etc.) — these are public GitHub accounts; not anonymized. Per the cohort `feedback_squash_prince_attribution` canon, prince attribution is intentional. Not "leakable" in the leakage sense.
- `pnpm-lock.yaml` — locks reflect `uuid 14.0.0` dev→runtime promotion (justified by `src/infra/secure-random.ts` v7 import). No surprise transitive additions reviewed by sampling; recommend `pnpm dedupe --check` confirmation as part of CI gate.

## Surprises

### Squash shape vs canon

The branch carries a single squash commit. Cohort canon (`feedback_squash_prince_attribution`) calls for feature-scale squashes to be split into four commits with role-aligned attribution: `core=Cael` / `tests=Elliott (gmail)` / `RFC=Ronan` / `other=Silas`, no figs credit, Claude co-author trailer OK. The current shape (single commit, cael author + 3 prince co-authors + Claude + Copilot) deviates.

Per cohort byte-walk 4-of-4 substantive sign-off on the as-shipped single-squash, this is a known-and-accepted shape for the REDUX-3 cycle, but it should be flagged for explicit cohort sign-off in Phase 4 so the deviation is acknowledged-not-accidental. If cohort wants the canonical 4-commit shape, the rebase needs to happen before Phase 5 force-push to `feature/context-pressure-squashed` (the upstream-PR-presenting branch).

This is an attribution-shape question, not a content-correctness question.

### TOOLS.md / EVIDENCE-LAYERS.md "10-line canon banked alongside"

Workorder substrate-context (line 34) says "10-line cohort-recognition-engine canon banked alongside (TOOLS.md + EVIDENCE-LAYERS.md)." On this branch, `EVIDENCE-LAYERS.md` does not exist; `docs/reference/templates/TOOLS.md` exists at v5.2 base unchanged. The canon banking, if it happened, is on a separate substrate (cohort-canon repo / memory pins / different branch). Anchor 5b cannot be verified on this squash; cohort to confirm the canon's actual home if the banking is load-bearing for Phase 5.

### Other surprise checks (NIL)

- No `console.log` debug leftover. Three `console.warn` additions are legitimate operational warnings (`session-delivery-queue` overflow, `subagent-registry-spawn-runtime` configuration-not-loaded). All three are real production-path defensive logging.
- No `process.exit` injection / `setMaxListeners` poison; the only diff hits are within a pre-existing test fixture string (`"-e", "process.exit(0)"`) being reformatted by oxfmt. No new process-leak surfaces.
- No new TODO/FIXME/XXX/HACK markers in code. Three matches in the diff are descriptive uses inside RFC prose ("not a bare TODO" / "byte-anchor for the §3.3 TODO replacement" / "production-gap TODO" comment in code documenting a known gap).
- `uuid` dep promotion (devDependencies → dependencies, pinned at `14.0.0` already in v5.2) — single new runtime import in `src/infra/secure-random.ts` (`import { v7 as uuidV7 } from "uuid"`). Continuation needs runtime UUIDs for delivery IDs and idempotency keys; promotion is necessary, not gratuitous.
- Strip-pass-5's two specific concerns confirmed clean: (a) `.github/workflows/workflow-sanity*` not in the diff; (b) `extensions/openshell/src/openshell-core.test.ts` not in the diff (preserved at upstream baseline).

## Recommendation for Phase 4 cohort sign-off

**APPROVE_FOR_PHASE_5** with two cohort-sign-off items:

1. (correctness, low-cost) Decide on the `#578/#580` issue-ref handling in `src/auto-reply/continuation/cross-session-targeting.test.ts:141, :423`. Recommendation: deprose to self-contained text (e.g., `// Durable-file ack is intentionally NOT performed here. enqueueSystemEvent above is in-memory…`) so the comment carries no upstream-collision risk. Two-line edit; could be made directly on the squash before Phase 5, or filed as a follow-up post-merge cleanup.
2. (attribution-shape, cohort-accord) Decide whether to preserve the single-squash shape or split into the 4-commit canonical attribution form per `feedback_squash_prince_attribution` BEFORE Phase 5 force-push. Either is defensible; the question is cohort-accord, not review-quality.

Optional cleanup items if cohort prefers strictest scope discipline (none are blockers): revert the four cosmetic non-continuation-load-bearing changes (`extensions/bluebubbles/src/client.test.ts`, `extensions/memory-core/.../atomic-reindex.test.ts`, `src/process/exec.test.ts`, `docs/.i18n/glossary.zh-CN.json`, `.gitignore` blank lines). All five total under 30 net lines.

If cohort accepts the two soft notes as-is, the squash is upstream-PR-presentable and Phase 5 force-push to `feature/context-pressure-squashed` may proceed.

## Footer

- Reviewer: frond-scribe (Claude Opus 4.7, 1M context)
- Lane branch: `frond-scribe/20260504/critical-review-recompose-redux-3-review-doc`
- Heartbeats: `🌱 lane start` / `🔍 review converged` / `📝 REVIEW.md pushed` / `🏁 final` via `frond-scribe-critical-review-redux-3-hook` to `#sprites-of-thornfield`
- Verdict gates Phase 5 force-push to `feature/context-pressure-squashed` per `feedback_path_to_real_ship_phases`
