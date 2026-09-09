# Mode-B 34395149670 terminal classification

**Verdict: PASS.** All 15 residual rows are classified; `unclassified=0`. This is a read-only product classification: no source changes, workflow dispatch, broad suite, integration, presentation, or deployment occurred.

## Named refs

| Category | Named ref | Full SHA | Equality before evidence |
|---|---|---|---|
| Product/base ref | supplied product commit | `32e89116f2177b6cccd80cc427af85e678921176` | Local commit equals authority; tree equals `bee6e3f415969861dcc34b73b95e33f842a56a5a` |
| Safe lane branch ref | `codeagent/modeb-34395149670-terminal-classifier` | `32e89116f2177b6cccd80cc427af85e678921176` | Local = tracking = server after unchanged branch publication |
| CI/workflow ref | `karmaterminal/openclaw-bootstrap` immutable commit | `b27223f107a7b55dbd5b207ba8d6bd3b426941a1` | Authority = aggregate `workflowSha` = GitHub commit API |
| Presentation ref | N/A | N/A | N/A |
| Docs/proof ref | N/A | N/A | Proof is immutable Actions run `34395149670` and its downloaded aggregate |

Product authority: `karmaterminal/openclaw@32e89116f2177b6cccd80cc427af85e678921176`. Bound work: openclaw/openclaw#129388, “context-pressure-aware continuation,” opened by Gwydion Nanashi Ferrinas Solidor (@karmafeast, account created 2011-06-30).

## Seven failed tests

| ID | Test | Original root | Classification | Isolated confirmation |
|---|---|---|---|---|
| T01 | `src/auto-reply/reply/commands-models.catalog-recovery.test.ts` — config replacement | model name was `undefined` instead of `GPT-5.6 Luna` | load flake | PASS, 1/1 |
| T02 | `extensions/discord/src/voice/realtime-playback-pcm.integration.test.ts` — repeated partial-frame underflows | `ABORT_ERR` while waiting for Idle | load flake | PASS, 1/1 |
| T03 | `extensions/codex/src/app-server/transport.process.test.ts` — `root-resumed` | process inspection deadline | existing issue openclaw/openclaw#138043; repair openclaw/openclaw#138089 | PASS, 1/1 |
| T04 | same file — `uninterruptible` | process inspection deadline | existing issue openclaw/openclaw#138043; repair openclaw/openclaw#138089 | PASS, 1/1 |
| T05 | same file — `snapshot-failure` | process inspection deadline | existing issue openclaw/openclaw#138043; repair openclaw/openclaw#138089 | PASS, 1/1 |
| T06 | same file — `traced` | process inspection deadline | existing issue openclaw/openclaw#138043; repair openclaw/openclaw#138089 | PASS, 1/1 |
| T07 | `extensions/telegram/src/telegram-ingress-drain-factory.test.ts` — duplicate callback before new-row answer consumption | pending answer unexpectedly `undefined` at line 159 | load flake | PASS, 1/1 |

The four Codex rows share only the byte-identical root fingerprint `ProcessInspectionError: Cannot inspect Codex processes. Process inspection exceeded its deadline. Retry when the host is responsive.|reason=deadline`; their individual rows remain enumerated. Direct dependency inspection used `openai/codex@400ee190c30d5e4a88549c070a2335311f0baa91`: stdio is single-client and shuts down when its connection closes (`codex-rs/app-server/src/lib.rs:676-682`), the runtime cancels transports before disconnecting (`codex-rs/app-server/src/lib.rs:879-892`), and the upstream test owner requests graceful shutdown by closing stdin (`codex-rs/app-server/tests/common/test_app_server.rs:190-194`).

## Non-test residuals

| Root | Rows | Classification | Evidence |
|---|---:|---|---|
| `core-tooling-15` docs-i18n toolchain precondition | 1 | new issue karmaterminal/openclaw-bootstrap#1476 | Ronan had Go 1.22.2; `scripts/docs-i18n/go.mod` requires 1.26.0 and the test intentionally sets `GOTOOLCHAIN=local`. No Go partition ran. |
| Static production typecheck | 1 | existing bound work openclaw/openclaw#129388 | `src/gateway/server-runtime-services.test-harness.ts:173` supplies stale top-level `complete`; `src/gateway/server-cron-reconciled.ts:17-22` exposes it only from `arm()`. |
| Runtime pretest build | 1 | existing karmaterminal/openclaw-bootstrap#1472 | Resolved heap 4069MB was below the 4352MB tsdown floor; no test ran and no output was removed. |
| `hosted-batch-011` cancellation synthesis | 3 | blocked under karmaterminal/openclaw-bootstrap#1341 | One cancelled Actions job produced no receipt for `extensions`, `extension-codex-app-server-attempt-support`, or `core-runtime-infra-diagnostics-state`. |
| self-hosted-dist missing-job synthesis | 2 | blocked under karmaterminal/openclaw-bootstrap#1341 | Planned `core-runtime-tui-pty` and `core-support-boundary` jobs produced neither receipts nor exact Actions job records. |

The three cancellation rows and two dist rows are grouped only within their byte-identical synthesized terminal roots. “Blocked” is terminal classification, not acceptance: absent execution evidence was not laundered into a pass.

## Validation receipts

Every failed test was run separately at the exact product SHA with one worker through the repository runner:

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 src/auto-reply/reply/commands-models.catalog-recovery.test.ts -t "rebuilds the whole browse result after config replacement"
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 extensions/discord/src/voice/realtime-playback-pcm.integration.test.ts -t "keeps PCM marks truthful across repeated partial-frame underflows"
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-codex-app-server-support.config.ts --maxWorkers=1 extensions/codex/src/app-server/transport.process.test.ts -t "revalidates identities while quiescing: root-resumed"
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-codex-app-server-support.config.ts --maxWorkers=1 extensions/codex/src/app-server/transport.process.test.ts -t "revalidates identities while quiescing: uninterruptible"
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-codex-app-server-support.config.ts --maxWorkers=1 extensions/codex/src/app-server/transport.process.test.ts -t "revalidates identities while quiescing: snapshot-failure"
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-codex-app-server-support.config.ts --maxWorkers=1 extensions/codex/src/app-server/transport.process.test.ts -t "revalidates identities while quiescing: traced"
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-telegram.config.ts --maxWorkers=1 extensions/telegram/src/telegram-ingress-drain-factory.test.ts -t "before middleware consumes a new-row"
```

Result: seven isolated files passed, seven selected tests passed, and all non-selected cases were skipped. Acceptance path: `focused-only` as required by the workorder; no Mode-B dispatch or broad suite was run.

Machine-readable results are in `classification.json` and `classification.tsv`. New issue filed: https://github.com/karmaterminal/openclaw-bootstrap/issues/1476.
