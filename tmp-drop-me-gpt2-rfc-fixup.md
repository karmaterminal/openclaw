## v3.2 Lane gpt2-rfc-fixup - 2026-04-26T22:57:20+00:00

- 2026-04-26T22:57:20+00:00: Preflight started on `frond-scribe/20260424/candidate-gpt2-rfc-fixup`; confirmed HEAD `b04484465a650202ac6e604b18106414b277daf1` and model smoke-test returned `ok`.

## §1 pre-read notes - 2026-04-26T23:08:00+00:00

- Read `docs/design/continue-work-signal-v2.md` end-to-end before edits.
- ToC audit shape: current ToC omits actual headings `3.6 Persistence and restart-survival`, `4.6 Gateway as lifecycle broker`, and `6.6 Chain-correlation via diagnostics-otel`.
- Dev-state/process hotspots: §3.6 has `LOCKED ... figs to 🩸`, `open question ... owner: 🌫`, issuecomment IDs, "Cross-prince", concrete named gateways, and stale open-question wording for idempotency/retry/cleanup; §4.6 still says #347 lint mechanization is open/review-only; §6.4/§6.6 retain cohort names/emojis and "cohort princes" language.
- Narrative-flow hotspots: §3.6 mixes shipped substrate behavior, local-only scope, fan-out, cleanup, idempotency, retry budget, and cross-host future work in one long block; §2.3 and §10.2 need a clean placement for single-recipient shipped return versus multi-recipient `targetSessionKeys` design-locked future shape (#355).
- Source read: #335 tracker/comments, #338 body/comment plus `docs/design/continuation-integration.md` from PR #338, #355 body, PRs #342/#345/#346/#347/#348/#350/#351/#354, local `src/infra/substrate-capability-registry.ts`, and PR #354 head files for queue-drain chain-budget extraction.
- PR pins recorded: #342 merge `cc08bbc9fef`, #345 merge `8338d37bda9`, #346 merge `c96e2d7955`, #347 merge `96d1304d47`, #348 merge `b0bc4b4ee2`, #350 merge `25ff4f0138`, #351 merge `b04484465a`; #354 open at head `f883d87fe3`.
- Editing plan: (1) regenerate ToC from actual `##`/`###` headings; (2) strip dev-state labels, cohort nicknames, Discord/process cite-pins, and named fleet/person markers while preserving technical decisions; (3) incorporate locked/current capability prose for idempotency B-shape, retry-cost/chain-budget-at-spawn, cleanup TTL/soft-cap, #347 registry/lint discipline, PR #354 queue-drain extraction, and #355 multi-recipient future shape; (4) final read/check for heading/ToC match, cite accuracy, and smooth upstream tone.

## §2a ToC regeneration - 2026-04-26T23:00:19+00:00

- Regenerated the visible ToC against the actual heading walk by adding missing entries for §3.6, §4.6, and §6.6.
- No prose semantics changed in this checkpoint.

## §2b dev-state strip - 2026-04-26T23:00:42+00:00

- Stripped explicit dev-state/process labels from §3.6, replacing `LOCKED`, owner markers, issuecomment IDs, and open-question prose with standalone technical statements.
- Replaced cohort/role names and emoji markers in the fleet evidence table and chain-correlation worked example with generic instance/deployment language.
- Updated §4.6 enforcement prose from "open review discipline" to current #347 registry/lint mechanization, with #354 noted as the `chain-budget-at-spawn` registry extension lane.
- Removed stale canonical2 and auto-review process pins from hot-reload/diagnostics-otel prose where they were not load-bearing for upstream readers.

## §2c implementation-state note - 2026-04-26T23:03:14+00:00

- Verified `targetSessionKey` state before narrative edit: `src/auto-reply/continuation-delegate.types.ts:11` and `src/agents/tools/continue-delegate-tool.ts:40` expose the descriptor/type, but `src/agents/tools/continue-delegate-tool.ts:91-94` still throws `targetSessionKey is descriptor-only in v2.5; runtime in #332`.
- Therefore the RFC should not claim single-recipient explicit `targetSessionKey` runtime support is shipped on canonical2/PR #354. Honest wording: default single-recipient return-to-caller is shipped; explicit cross-session `targetSessionKey` is descriptor-shipped with runtime wiring pending; multi-recipient `targetSessionKeys: string[]` is #355 design-locked/plumbing-active future shape.

## §2c narrative/current capability pass - 2026-04-26T23:03:14+00:00

- Reworked §2.3 to distinguish default single-recipient return-to-caller, descriptor-only explicit `targetSessionKey`, and #355 multi-recipient `targetSessionKeys: string[]` fanout with per-recipient fallback resolution.
- Smoothed §3.2/§3.3 restart and chain-budget wording: timer handles are process-scoped, but recoverable records are durable; accepted hop state is persisted after accepted spawn.
- Made §3.6's substrate claim explicit: post-compaction survival is a substrate property backed by idempotency, retry, atomic persistence, and restart recovery.
- Added the retry-budget-exhausted anchor to §6.1, fixed the configuration examples by removing retired/duplicated keys, and updated §10/C.2 to reflect the durable substrate and remaining timer-handle volatility.

## §2d final consistency pass - 2026-04-26T23:12:00+00:00

- Re-read `docs/design/continue-work-signal-v2.md` end-to-end after §2a-§2c edits.
- Verified ToC count/order/text/anchors against all 72 `##`/`###` headings.
- Verified markdown table column counts and ran `pnpm format docs/design/continue-work-signal-v2.md tmp-drop-me-gpt2-rfc-fixup.md`.
- Spot-checked cite-pins for queue storage/recovery, post-compaction delegate symbols, session field, zod schema, and restart sentinel imports/use.
- Final cleanup removed non-load-bearing hidden historical log-comment syntax and visible internal branch/person markers from Appendix D link text.
