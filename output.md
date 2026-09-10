# Mode-B 34419865749 classification

**Verdict:** **FAIL**, fully classified. Two tests failed deterministic confirmation, three initial failures greened on isolated confirmation, four of six failure-shaped routing receipts are synthetic blocked/cancellation rows, and the static job failed only while uploading the already-validated dist artifact. Unclassified rows: **0**.

## Named refs

| Category | Named ref | Full SHA | Identity receipt |
|---|---|---|---|
| Product/base | `karmaterminal/openclaw@8a4f89c11d3a90768ff6b641a84b77aa7e308820` | `8a4f89c11d3a90768ff6b641a84b77aa7e308820` | Run input and aggregate target agree |
| Safe lane | `refs/heads/codeagent/modeb-34419865749-terminal-classifier` | `8a4f89c11d3a90768ff6b641a84b77aa7e308820` | Local, tracking, and server refs agree |
| CI/workflow | `karmaterminal/openclaw-bootstrap:refs/heads/codeagent/final-workflow-ad2f8d2f` | `ad2f8d2fd5cb6be6775ac8fbd9ffc4e20e3fb816` | Server branch and run `headSha` agree |
| Presentation | N/A | N/A | Read-only classification; no presentation work |
| Docs/proof | N/A | N/A | Proof is the supplied run aggregate, not a Git ref |

Run: [34419865749](https://github.com/karmaterminal/openclaw-bootstrap/actions/runs/34419865749), attempt 1, completed `failure`. The aggregate reports **191,599 passed / 5 failed / 3 load flakes greened**, **171** summaries, and **75/75** valid routing receipts with zero validation errors, exact product/workflow SHA consistency, and both dist variants represented.

## Five failed tests

| Shard | Initial failure | Isolation confirmation | Classification | Tracker |
|---|---|---|---|---|
| `extension-codex-surface` | `session-rollout-snapshot.test.ts`, `compressed=false`, timed out at 120,000 ms | Passed; exact test listed in `flakes_greened` | Load flake | N/A |
| `agentic-control-plane-agent-chat` | `server.sessions.reclamation.test.ts`, gateway gap 1482.827 ms exceeded `<500` ms | Passed; exact test listed in `flakes_greened` | Load flake | N/A |
| `auto-reply-reply-agent-runner` | `agent-runner.continuation-delegate-fire-span.test.ts`, bracket-delayed delegate timed out at 120,000 ms | Failed again at 120,000 ms | Deterministic failure | openclaw/openclaw#129388 |
| `extension-codex-app-server-support` | `transport.process.test.ts`, four Node processes remained instead of `[]` | Passed; exact test listed in `flakes_greened` | Load flake | N/A |
| `extension-telegram` | `telegram-ingress-drain-factory.test.ts`, expected retained admission answer to be defined but received `undefined` | Failed again with the same assertion | Deterministic regression-test failure | openclaw/openclaw#133294; merged fix openclaw/openclaw#133379 |

The continuation failure is intentionally not root-caused here. Rune owns that investigation. No Rune receipt was visible in session artifacts, no collaborating agent was visible, and the local Discrawl CLI plus verified fallback checkout were unavailable. The manifest evidence is therefore limited to two identical 120-second failures and the binding to openclaw/openclaw#129388.

The Telegram failure is in the exact HTTP lifecycle regression added by merge commit `911b8e7dde52c4ab43a46a467681ddcd334e0c04` in openclaw/openclaw#133379. The tested product SHA contains that merge. The test's invariant is the closed canonical callback-acknowledgement issue openclaw/openclaw#133294, so a duplicate tracker was not filed.

## Six failure-shaped routing receipts

| Batch | Classification | Evidence |
|---|---|---|
| `dist-batch-074` (`core-runtime-tui-pty`) | Synthetic blocked | Aggregate synthesized rc 125 because the planned matrix job had no receipt and no exact Actions job record |
| `dist-batch-075` (`core-support-boundary`) | Synthetic blocked | Aggregate synthesized rc 125 because the planned matrix job had no receipt and no exact Actions job record |
| `hosted-batch-011` (`extensions+2more`) | Synthetic cancellation/blocked | Hosted runner received a shutdown signal; the batch step was cancelled and receipt emission was skipped |
| `hosted-batch-033` | Real deterministic test failure | Worker receipt rc 1 for `auto-reply-reply-agent-runner`; sibling shards passed |
| `hosted-batch-039` (`agentic-plugins+2more`) | Synthetic receiptless blocked | Actions recorded a completed failed job with its batch step still `in_progress`; no routing receipt was emitted |
| `local-batch-071` | Real deterministic test failure | Worker receipt rc 1 for `extension-telegram`; sibling shards passed |

The static job's five gates all passed. Its separate `Upload dist runtime artifact` step validated the runtime manifest, then `actions/upload-artifact@v4` exhausted its approximately 4.1 GB Node heap while finding files and terminated with `JavaScript heap out of memory`. This is tracked by [karmaterminal/openclaw-bootstrap#1478](https://github.com/karmaterminal/openclaw-bootstrap/issues/1478), not a product static failure. The aggregate-status failure is expected fallout from the two deterministic tests and routing lane guards.

## Validation and scope

Read-only classification only: no source mutation, test execution, workflow dispatch, integration, presentation, deployment, or broad suite. Evidence commands were read-only `gh api`/`gh run view`, aggregate JSON/log inspection with `jq`/`grep`, Git ref equality checks, current source/history inspection, and live/cached tracker searches. Acceptance path: existing Mode-B run **34419865749** at product SHA `8a4f89c11d3a90768ff6b641a84b77aa7e308820` and workflow SHA `ad2f8d2fd5cb6be6775ac8fbd9ffc4e20e3fb816`.
