# WORKORDER: cure-(8) 3-way-merge of upstream-feature-drops

## Context

PR #79925 cure-(7) at `92c36a73a9` is live on PR head. Vitest shows 74 fails matching upstream baseline.
However, 4 files have upstream-feature-evolution our take-ours missed during conflict-resolution:

## Files requiring 3-way merge

### 1. src/auto-reply/reply/get-reply.ts (-56 lines from upstream)

- Upstream added: `autoFallbackPrimaryProbe` model-fallback-probing feature
- Our additions: `cancelContinuationTimer` (3 refs) — MUST preserve
- Merge: graft upstream's autoFallbackPrimaryProbe onto our continuation-feature additions

### 2. src/auto-reply/reply/get-reply-run.ts (-7 lines from upstream)

- Upstream added: `autoFallbackPrimaryProbe` threading + `clearAutoFallbackPrimaryProbeSelection`
- Our additions: `continuationTrigger` + `isContinuationWake` + `isDelegateWake` — MUST preserve
- Merge: graft upstream's autoFallbackPrimaryProbe onto our continuation-feature additions

### 3. src/auto-reply/reply/commands-compact.ts (-10 lines from upstream)

- Upstream added: `isCompactionSkipReason` helper + `normalizeOptionalLowercaseString`
- Our additions: NONE in this file — safe to take-upstream-clean
- Action: `git checkout upstream/main -- src/auto-reply/reply/commands-compact.ts`

### 4. src/infra/diagnostic-trace-context.ts (-35 lines from upstream)

- Upstream added: traceparent validation constants + `DiagnosticTraceContext` type + stricter parsing
- Our additions: 35 lines of continuation-feature traceparent wiring
- Merge: CAREFUL — upstream restructured the parsing; our additions may need relocation

### 5. src/auto-reply/reply/agent-runner.ts (previewStreamedText drop)

- Upstream commit `bd51d8f2dd` added `previewStreamedText` field
- Our take-ours didn't graft it
- Action: locate the field in upstream version + graft surgically

## Gates

- pnpm tsgo:core after each file-merge
- Targeted vitest on affected test files after all merges
- Full vitest at cure-(8) tip
- Class A 6-symbol retention check in agent.ts (MUST NOT regress)

## Constraints

- Single-squash on upstream parent (amend, not new commit)
- DO NOT touch agent.ts (Class A restoration already correct)
- DO NOT touch install-security-scan.runtime.ts (already byte-identical to upstream)
- DO NOT touch fs-bridge.shell.test.ts (trivial fix already applied)
