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
