# Journal — frond-scribe-copilot/20260510/573-header-fix

## Genesis

Lane dispatched at 2026-05-10 by frond-scribe seat per figs's directive 1503126579134464000.

- Tracking issue: karmaterminal/openclaw#629
- Workorder: `WORKORDER-573-header-fix.md`
- Engine: copilot CLI gpt-5.5 xhigh yolo

## Pre-dispatch state

- Branch created off PR #79925 head ac59eeb3a7
- Pushed to origin (remote-first canon)
- Tracking issue filed
- Workorder written
- Webhook plumbed

## Lane checkpoints

(Copilot agent will append as it works.)

### 2026-05-10T20:18Z substrate read checkpoint

- Worktree branch: `frond-scribe-copilot/20260510/573-header-fix`, current head at read time `97c3c0d78e366d61e599b9e15e056cbcf81f7290`.
- Required root `report.md` is missing from this branch tip. I posted a DESIGN-BREAK heartbeat/comment and reconstructed the required report from PR #612 head `4d415bba6ebfc942f0c473d1b538e5137481a4cb:report.md` plus tracking issue #629.
- Root cause absorbed: exact configured `github-copilot/claude-opus-4.7` model rows can lack `model.headers`; simple summarization paths that bypass the GitHub Copilot stream wrapper then reach pi-ai without `Editor-Version` and fail with Copilot's missing IDE auth header 400.
- Current compaction safeguard source already merges `{ ...buildCopilotIdeHeaders(), ...requestAuth.headers }` for `github-copilot` in `src/agents/pi-hooks/compaction-safeguard.ts`; this lane will not edit it.
- `extensions/github-copilot/index.ts` currently registers `resolveDynamicModel: (ctx) => resolveCopilotForwardCompatModel(ctx)` but no `normalizeResolvedModel` hook.
- `extensions/github-copilot/models.ts` dynamic resolver builds synthetic/forward-compatible models without static headers; exact configured models bypass that resolver.
- SDK surface already has `ProviderPlugin.normalizeResolvedModel` and `ProviderNormalizeResolvedModelContext`; core calls it for resolved inline/configured, built-in, and dynamic models before runner use.
- Extension boundary prohibits importing from core `src/agents/**`; the same IDE header builder is publicly exported from `openclaw/plugin-sdk/provider-auth`, which `extensions/github-copilot/index.ts` already uses for auth helpers. I will use that SDK path rather than the core-local `../copilot-dynamic-headers.js` path from compaction-safeguard.
- `extensions/github-copilot/models.test.ts` already covers default model metadata, forward-compatible dynamic resolution, usage, token, and catalog mapping. The regression belongs next to `resolveCopilotForwardCompatModel` tests as a new `normalizeCopilotResolvedModelHeaders` suite.

### 2026-05-10T20:18Z implementation plan

- Hook surface chosen: existing `normalizeResolvedModel` provider hook. This is the narrowest candidate #1 implementation because it applies after exact configured model resolution and before downstream runner/simple callers use `model.headers`, without expanding SDK or changing core.
- Files to touch:
  - `extensions/github-copilot/models.ts`: add `normalizeCopilotResolvedModelHeaders(ctx)` that returns `{ ...model, headers: { ...buildCopilotIdeHeaders(), "Copilot-Integration-Id": COPILOT_INTEGRATION_ID, ...model.headers } }` only for GitHub Copilot provider/model.
  - `extensions/github-copilot/index.ts`: register `normalizeResolvedModel: (ctx) => normalizeCopilotResolvedModelHeaders(ctx)`.
  - `extensions/github-copilot/models.test.ts`: add regression tests for exact custom model headers, explicit user header overrides, dynamic path still resolving, and non-Copilot model unaffected.
  - `tmp-drop-me-frond-scribe-copilot.md`: checkpoint journal per workorder.
- Test gates before declare-done: `pnpm test --run extensions/github-copilot/`, `pnpm tsgo:core`, and `pnpm lint`; root-cause any failures instead of papering over them.

### 2026-05-10T20:22Z implementation checkpoint

- Added `normalizeCopilotResolvedModelHeaders` in `extensions/github-copilot/models.ts`, registered it as the provider `normalizeResolvedModel` hook, and guarded it so only `github-copilot` resolved models receive headers.
- Header merge shape is `{ ...buildCopilotIdeHeaders(), "Copilot-Integration-Id": COPILOT_INTEGRATION_ID, ...model.headers }`, so explicit model headers override defaults while missing IDE defaults are filled.
- Added `extensions/github-copilot/models.test.ts` coverage for exact custom `claude-opus-4.7` headers, user override preservation, dynamic model compatibility, and non-Copilot no-op behavior.
- Smoke gate: `pnpm test --run extensions/github-copilot/` passed after `pnpm install` restored missing `node_modules`; 9 test files, 80 tests passed.

### 2026-05-10T20:23Z acceptance gate checkpoint

- `pnpm test --run extensions/github-copilot/` passed: 9 files, 80 tests.
- `pnpm tsgo:core` passed.
- `pnpm lint` passed: oxlint core/extensions/scripts found 0 warnings and 0 errors.

### 2026-05-10T20:31Z declare-done checkpoint

- Draft PR opened: https://github.com/karmaterminal/openclaw/pull/630 targeting `frond-scribe-claude/20260509/narrow-surgery-tight`.
- Cross-repo `openclaw-ci` dispatch was sent once for implementation head `e985336bcd1ddba06532d75cead1d97edabb8cb6`; bootstrap run: https://github.com/karmaterminal/openclaw-bootstrap/actions/runs/25638891220.
- PR body was updated with copied terminal proof after the real-behavior-proof check requested inline after-fix evidence.
- ClawSweeper review requested with `@clawsweeper review`.
- Project metadata check returned no project items for #629, so no `prince_review` project status could be applied.
- This declare-done journal checkpoint will be committed and pushed, then `openclaw-ci` will be re-dispatched for the final branch SHA.
