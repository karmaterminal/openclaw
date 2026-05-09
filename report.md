# #573 Downstream-Leak Investigation on canonical 4c2a69b

## Executive summary

Root cause is not a GitHub Copilot provider-side flake and not header overflow. The leak is a conditional OpenClaw/model-shape path: `github-copilot/claude-opus-4.7` can be resolved from an explicit OpenClaw provider model config that lacks `model.headers`, while `@mariozechner/pi-ai@0.73.0`'s Copilot Anthropic dynamic helper does not add IDE auth headers. Any summarization path that reaches `@mariozechner/pi-coding-agent` / `@mariozechner/pi-ai` simple Anthropic generation without OpenClaw's compaction safeguard header merge sends no `Editor-Version` and deterministically gets:

`400 bad request: missing Editor-Version header for IDE auth`

Canonical `4c2a69b3d5` source and `dist/` do have the April safeguard fix: `src/agents/pi-hooks/compaction-safeguard.ts` adds `buildCopilotIdeHeaders()` in `resolveModelAuth()` and again in `buildCompactionSummaryHeaders()`. The current safeguard LLM path sends `Editor-Version` and succeeds in live capture. The remaining leak point is the unguarded dependency path (for example pi-coding-agent core compaction fallback/direct `generateSummary`) combined with custom/forward-compatible Copilot model definitions that do not carry IDE headers.

## Substrate verification

| Check                           | Result                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| Git SHA                         | `4c2a69b3d5d0414e57098393067d66f98d66ee0c`                      |
| Branch                          | `frond-scribe/20260509/573-downstream-investigation`            |
| `pnpm docs:list`                | Passed                                                          |
| `gitcrawl`                      | Not installed in this worktree; used live `gh` issue fallback   |
| `@mariozechner/pi-coding-agent` | `0.73.0`                                                        |
| `@mariozechner/pi-ai`           | `0.73.0`                                                        |
| `pi-coding-agent` summary ABI   | 8-argument `generateSummary(..., headers, signal, ...)` present |
| `openclaw-bootstrap#573`        | Open at investigation time                                      |

Prior journal `journal-20260509T024119Z.log` verified the same substrate but stopped on the now-removed dispatch gate. This run resumed in `journal-20260509T024700Z.log`.

## Evidence

### 1. Current OpenClaw safeguard path is correctly wired

Verified source and built artifacts:

- `src/agents/pi-hooks/compaction-safeguard.ts:270-274` merges `buildCopilotIdeHeaders()` into request auth for `github-copilot`.
- `src/agents/pi-hooks/compaction-safeguard.ts:277-295` builds compaction summary headers with `buildCopilotDynamicHeaders(...)` then auth headers.
- `src/agents/compaction.ts:353-384` passes headers through the 8-argument `piGenerateSummary` compatibility path.
- `dist/compaction-successor-transcript-CwAUbJxG.js:3281-3300` contains the same header merge in the built artifact.

### 2. The dependency dynamic helper does not add IDE headers

`node_modules/@mariozechner/pi-ai/dist/providers/github-copilot-headers.js` only returns:

- `X-Initiator`
- `Openai-Intent`
- `Copilot-Vision-Request` when images are present

It does not return `Editor-Version`, `Editor-Plugin-Version`, `User-Agent`, or `Copilot-Integration-Id`. Those IDE headers exist in pi-ai's built-in GitHub Copilot model entries, but not in OpenClaw's synthetic/custom Copilot model definitions.

### 3. Local/default `claude-opus-4.7` model shape lacks static headers

Live registry inspection on this worktree showed:

- `github-copilot/claude-opus-4.7`
  - `api: "anthropic-messages"`
  - enterprise Copilot base URL
  - `model.headers` absent
  - `contextWindow: 1000000`
  - `maxTokens: 8192`
- `github-copilot/gpt-5.5`
  - keeps static IDE headers from pi-ai built-ins

The non-secret config shape explains why: the active config has an exact `models.providers.github-copilot.models[]` entry for `claude-opus-4.7` with API/base/context metadata but no headers. Exact configured models bypass the GitHub Copilot plugin's `resolveDynamicModel` catch-all, and the plugin currently has no `normalizeResolvedModel` hook to attach Copilot IDE headers to exact custom models.

### 4. Wire capture reproduced the failure and success split

Temporary trace-only instrumentation was added to vendored `node_modules/@mariozechner/pi-ai/dist/providers/{anthropic,openai-responses,openai-completions}.js` and not committed. It logged the actual `defaultHeaders` passed into the SDK client.

Final controlled live run artifacts:

- Headers: `/tmp/copilot-headers-trace-573-final-20260509T025731Z.jsonl`
- Results: `/tmp/copilot-results-573-final-20260509T025731Z.jsonl`

| Case                          | Attempts | Wire `Editor-Version`              | Result                    |
| ----------------------------- | -------: | ---------------------------------- | ------------------------- |
| `negative-no-options-headers` |        5 | Missing in 5/5                     | 5/5 failed with exact 400 |
| `compaction-merged-headers`   |       10 | Present in 10/10 (`vscode/1.96.2`) | 10/10 succeeded           |

Failure wire-state sample:

```json
{
  "stage": "anthropic.createClient",
  "provider": "github-copilot",
  "model": "claude-opus-4.7",
  "api": "anthropic-messages",
  "hasEditorVersion": false,
  "headerKeys": [
    "Openai-Intent",
    "X-Initiator",
    "accept",
    "anthropic-dangerous-direct-browser-access"
  ]
}
```

Success wire-state sample:

```json
{
  "stage": "anthropic.createClient",
  "provider": "github-copilot",
  "model": "claude-opus-4.7",
  "api": "anthropic-messages",
  "hasEditorVersion": true,
  "editorVersion": "vscode/1.96.2",
  "headerKeys": [
    "Copilot-Integration-Id",
    "Editor-Plugin-Version",
    "Editor-Version",
    "Openai-Intent",
    "Openai-Organization",
    "User-Agent",
    "X-Initiator",
    "accept",
    "anthropic-dangerous-direct-browser-access",
    "x-initiator"
  ]
}
```

### 5. pi-coding-agent `generateSummary` reproduces the exact compaction error

Additional controlled live run:

- Headers: `/tmp/copilot-headers-trace-573-pica-20260509T025850Z.jsonl`
- Results: `/tmp/copilot-results-573-pica-20260509T025850Z.jsonl`

| Case                                                          | Result                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `generateSummary(..., headers: undefined, ...)`               | Failed: `Summarization failed: 400 bad request: missing Editor-Version header for IDE auth` |
| `generateSummary(..., headers: OpenClaw merged headers, ...)` | Succeeded                                                                                   |

This proves the exact #573 error is caused by missing request headers on the simple summarization path, not by response flakiness.

## Root cause

The leak point is the boundary between OpenClaw's provider/model normalization and pi-ai's Copilot Anthropic simple client:

1. The active model can be an exact custom/configured `github-copilot/claude-opus-4.7` definition without `model.headers`.
2. The GitHub Copilot plugin's normal chat `wrapStreamFn` injects OpenClaw Copilot dynamic/IDE headers, but compaction/summarization uses `completeSimple`/`generateSummary`, not the provider stream wrapper.
3. `@mariozechner/pi-ai@0.73.0`'s Anthropic Copilot dynamic helper adds `X-Initiator` and `Openai-Intent`, but not IDE auth headers.
4. Therefore any unguarded `completeSimple` / pi-coding-agent core compaction fallback for that model sends no `Editor-Version` and Copilot rejects it.

The April OpenClaw safeguard fix covers the current safeguard LLM path. It does not make the model definition itself safe, and it does not patch pi-ai's built-in Copilot dynamic helper. That leaves non-safeguard/fallback/direct summarization paths vulnerable.

## Why it looked intermittent

The failure is conditional, not random:

- Built-in pi-ai GitHub Copilot models such as `gpt-5.5` include static IDE headers, so they can work even when no OpenClaw wrapper runs.
- Normal OpenClaw chat runs through the GitHub Copilot plugin stream wrapper, so it gets headers even for headerless configured models.
- The current OpenClaw compaction safeguard LLM path explicitly merges IDE headers, so it succeeds.
- pi-coding-agent core compaction fallback/direct simple summarization bypasses the plugin wrapper and fails when the model definition has no headers.

This matches the historical "only sometimes" reports: different binary/config/model/path combinations can produce different outcomes without provider-side nondeterminism.

## Hypotheses disposition

| Hypothesis                                         | Disposition                                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Provider-side flake despite valid `Editor-Version` | Falsified by controlled run: 10/10 valid-header requests succeeded; 5/5 missing-header requests failed with the exact error.  |
| Message-shape branch bypasses merge                | Not the main cause. The branch is request-path/model-shape: unwrapped simple generation plus headerless custom Copilot model. |
| `Copilot-Vision-Request` / `X-Initiator` race      | Not supported. Failure reproduced on a one-message text-only request; wire-state difference was IDE headers.                  |
| Header overflow/truncation                         | Falsified in the captured cases. Success header set was only 10 headers / 127 value chars.                                    |
| Something else                                     | The actual leak is the headerless exact configured Copilot model plus unguarded pi-ai simple Anthropic path.                  |

## Fix candidates

### 1. Recommended: normalize all GitHub Copilot resolved models to include IDE headers

Add a GitHub Copilot provider hook that applies to exact configured models, not only unknown dynamic models. The likely home is the bundled `github-copilot` plugin via `normalizeResolvedModel`, merging:

```ts
headers: {
  ...buildCopilotIdeHeaders(),
  ...model.headers,
}
```

This is the best cost/benefit fix because it makes the model object safe for every downstream caller, including pi-coding-agent fallback paths that only know about `model.headers`.

Expected tests:

- `extensions/github-copilot/models.test.ts`: exact custom `claude-opus-4.7` resolved model receives IDE headers.
- A focused compaction/model-registry test proving `getApiKeyAndHeaders()` for an exact configured Copilot model returns `Editor-Version`.

### 2. Add a compaction fallback hardening seam

Ensure the pi-coding-agent fallback/default compaction path also receives Copilot IDE headers before it can call dependency `compact(...)`. This is defense-in-depth for cases where the safeguard extension is disabled, not registered, or cancels before producing a compaction object.

This is less complete than candidate 1 because it only protects compaction. Other future `completeSimple` Copilot uses would remain dependent on callers remembering to merge headers.

### 3. Upstream/dependency fix in `@mariozechner/pi-ai`

Patch pi-ai's `github-copilot-headers` helper or Copilot client builders so all GitHub Copilot dynamic headers include IDE auth headers. This would protect all consumers at the dependency layer.

This is the broadest fix but has higher coordination cost because it requires upstream change and dependency bump/patch policy. It should still be proposed upstream because the current helper name implies complete Copilot request headers but omits mandatory IDE auth headers.

## Recommended next workorder

Open a fix-implementation lane for candidate 1, with candidate 2 as defense-in-depth if the implementation reveals that pi-coding-agent fallback compaction can still run with a headerless model. Do not escalate to GitHub Copilot support for #573 unless a future capture shows a request with valid `Editor-Version` still receiving the missing-header 400.

## Cleanup notes

Trace-only vendored changes were made under `node_modules/@mariozechner/pi-ai/dist/providers/` for capture and must not be committed. The report commit should include only `report.md`; journals remain local investigation artifacts.
