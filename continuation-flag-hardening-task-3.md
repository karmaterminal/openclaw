# Task 3 Design: Centralize Embedded Attempt Params

## Status

Implementation is deferred in this branch because the required call-site change lives in `src/agents/pi-embedded-runner/run.ts`, and this workorder explicitly forbids editing that hotfix-touched file.

## Problem

`runEmbeddedPiAgent` accepts `RunEmbeddedPiAgentParams`, but `run.ts` rebuilds the `runEmbeddedAttempt(...)` input field-by-field. Optional fields added to `RunEmbeddedPiAgentParams` can silently disappear unless someone remembers to thread them through the reconstruction.

Confirmed examples already at risk today:

- `requireExplicitMessageTarget`
- `disableMessageTool`
- `bootstrapContextMode`
- `bootstrapContextRunKind`

`run/attempt.ts` reads those fields, but the `runEmbeddedAttempt(...)` call in `run.ts` does not currently forward them.

## Recommended Fix

Use a shared builder with a type-safe spread as the default propagation path.

1. Add `buildEmbeddedRunAttemptParams(params, overrides)` in `src/agents/pi-embedded-runner/run/`.
2. Inside the builder, start from a single spread of the outer params object:

```ts
const {
  lane,
  enqueue,
  suppressToolErrorWarnings,
  provider: _provider,
  model: _model,
  authProfileId: _authProfileId,
  authProfileIdSource: _authProfileIdSource,
  thinkLevel: _thinkLevel,
  ...attemptBase
} = params;

return {
  ...attemptBase,
  ...overrides,
} satisfies EmbeddedRunAttemptParams;
```

3. Keep only the true attempt-local overrides in `overrides`:
   - `contextEngine`
   - `contextTokenBudget`
   - `workspaceDir`
   - `agentDir`
   - `prompt`
   - `provider`
   - `modelId`
   - `model`
   - `authProfileId`
   - `authProfileIdSource`
   - `authStorage`
   - `modelRegistry`
   - `agentId`
   - `legacyBeforeAgentStartResult`
   - `thinkLevel`
   - `toolResultFormat`
   - bootstrap warning fields

## Why This Option

- Lowest drift risk: new `RunEmbeddedPiAgentParams` fields propagate automatically unless they are explicitly outer-only.
- Lowest review risk: the intentional omission list is short and obvious.
- Type-checked: the builder returns `EmbeddedRunAttemptParams`, so override mistakes still fail compilation.
- Compatible with the current split: `suppressToolErrorWarnings`, `lane`, and `enqueue` remain outer-run concerns.

## Follow-up Validation Once Unblocked

- `pnpm build`
- `pnpm test -- src/agents/system-prompt.test.ts`
- Add a focused unit test for the new builder that proves a newly added pass-through field reaches `runEmbeddedAttempt` by default.
