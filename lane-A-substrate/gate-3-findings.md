# Gate-3 emergent findings — Lane A (PR #85651 cure-n8)

Gate-3 execution (tsgo + lint + build + vitest) surfaced a test-failure surface that is **not** a Lane-A-introduced regression but is **emergent** in ce144d00c2 — visible only when running the full test suite against ce144's blob inventory at current upstream. Lane-A made zero code mutations; this finding is inherent to alt-path's existing reconstruction.

## Gate-3 summary

| Gate                 | Command                                                            | Duration | Result                                          |
| -------------------- | ------------------------------------------------------------------ | -------- | ----------------------------------------------- |
| pnpm install         | `pnpm install --frozen-lockfile`                                   | 3.4s     | **PASS** ✓                                      |
| 3a tsgo core         | `pnpm tsgo`                                                        | 4s       | **PASS** ✓                                      |
| 3a.2 tsgo:test       | `pnpm tsgo:test`                                                   | 21s      | **PASS** ✓                                      |
| 3a.3 tsgo:extensions | `pnpm tsgo:extensions`                                             | 6s       | **PASS** ✓                                      |
| 3b lint              | `pnpm lint` (oxlint shards)                                        | 67s      | **PASS** ✓                                      |
| 3d build             | `pnpm build` (tsdown + UI + plugin-sdk dts + cli-startup-metadata) | 110s     | **PASS** ✓                                      |
| 3c vitest            | `pnpm test`                                                        | 5min 31s | **19 of 81 shards FAILED** — see analysis below |

All static-analysis + build gates PASS. The runtime test surface has 19 failing shards (≈ 23% shard failure rate, individual test pass-rate is much higher — e.g., `unit-fast` shard: 9986/9987 = 99.99%).

## Test-failure pattern analysis (sample 5/19 failing shards)

### Pattern A — "ce144 kept PRH-test, UPS evolved impl independently → mismatch"

**Example**: `src/auto-reply/reply/inbound-meta.test.ts` (in `auto-reply-reply` shard)

| ref            | blob                                                                 |
| -------------- | -------------------------------------------------------------------- |
| ANC b474f429ee | `a72fe1820b`                                                         |
| PRH fc337f05d6 | `477df43141` (PRH modified it)                                       |
| ce144          | `477df43141` (kept PRH's mod)                                        |
| UPS 6399b6a4   | `a72fe1820b` (UPS did NOT modify the test — but DID modify the impl) |

ce144 carries PRH's test asserting "Delivery: to send a message, use the …" pattern. Upstream's impl evolution changed the delivery-guidance string to "Delivery: Final assistant text is not …". ce144's test (= PRH's test) doesn't match UPS's impl (= ce144's impl). Failure.

### Pattern B — "alt-path PUNTED to ancestor for the test file when both PRH and UPS modified it orthogonally"

**Example**: `src/auto-reply/reply/prompt-prelude.test.ts` (in `unit-fast` shard)

| ref            | blob                  | what they added                                                                                              |
| -------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| ANC b474f429ee | `737cd85562`          | (baseline)                                                                                                   |
| PRH fc337f05d6 | `4a59ff2d31`          | +1 line: assertion that `visible_reply_contract: message_tool_only` appears in `currentInboundContext?.text` |
| ce144          | `737cd85562` (== ANC) | nothing (alt-path PUNTED to ANC instead of choosing PRH or UPS)                                              |
| UPS 6399b6a4   | `a35ea38a43`          | +14 lines: orthogonal assertions on `currentInboundContext?.resumableText` (new property!)                   |

PRH and UPS added ORTHOGONAL test expectations. Alt-path's reconstruction did not carry either side's mod, leaving ce144 with the ANCESTOR blob. Now ce144's impl includes both PRH's intent (`visible_reply_contract`) and UPS's evolution (`resumableText` property), but the ANC test asserts on neither. Failure.

**Cure-direction for Pattern B**: UNION of PRH's 1-line addition + UPS's 14-line addition. Both are non-overlapping; both encode valid assertions. Neither side alone is sufficient.

### Other failing shards (uncharacterized in detail; sampling indicates same patterns)

```
19 failing shards (rerun digest from full vitest run):
  test/vitest/vitest.gateway-server.config.ts
  test/vitest/vitest.gateway-core.config.ts
  test/vitest/vitest.commands.config.ts                    (1 file fail / 202 total)
  test/vitest/vitest.agents-core.config.ts
  test/vitest/vitest.agents-support.config.ts
  test/vitest/vitest.extension-codex.config.ts
  test/vitest/vitest.extension-browser.config.ts
  test/vitest/vitest.unit-fast.config.ts                   (1 file fail / 1053 total = 99.91%)
  test/vitest/vitest.auto-reply-reply.config.ts            (1 file fail / 129 total = 99.22%)
  test/vitest/vitest.secrets.config.ts                     (4 files fail / 58 total = 93.10%)
  test/vitest/vitest.extension-imessage.config.ts
  test/vitest/vitest.extension-providers.config.ts
  (... 7 more shards omitted from rerun-digest)
```

## Disclosure for cohort decision

**ce144d00c2 is the LANE-A candidate-SHA inherited from cael-overnight's DECLARE-DONE.** Lane-A made zero code mutations on top of ce144. The test-failure surface above is a property of ce144 itself; it was not introduced by Lane-A. Cael-overnight's STATUS does not document vitest results (analysis-only ANALYSIS-COMPLETE state).

**Three possible cohort dispositions:**

| Disposition                                                                           | Description                                                                                                               | Cost                                                                                                                 | Risk                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| (i) Accept ce144 as candidate-SHA, queue test-cure as downstream cycle                | Treat Gate-3c as "snapshot quality not yet established"; downstream cycle = final upstream rebase + test-cure pass        | Low for Lane-A; defers cost to next cycle                                                                            | Cohort cosign at Gate-4 has incomplete signal on runtime correctness    |
| (ii) Expand Lane-A scope to (β+) — fix the test surface inline                        | Lane-A executor restores PRH-test-mods, unions with UPS-test-mods, achieves green test surface, then DECLARE-DONE         | Medium-high (5-15 fixes; need surgical care to preserve both PRH-intent + UPS-evolution); risk of compounding errors | Cleanest signal at Gate-4 but scope-creep from user-directive (β)-tight |
| (iii) Reject ce144 as candidate-SHA, escalate to figs for path-reconstruction restart | Treat 19-shard failure surface as cure-incomplete; restart from alt-path or path-d with different careful-apply heuristic | High; effectively redoes cael-overnight's work                                                                       | Most defensive but most expensive                                       |

**Lane-A executor recommendation**: (i) — accept ce144 with disclosure. Rationale:

- All 4 cohort-action-items resolved without Lane-A code-mutation (clean alt-path inheritance)
- Static-analysis gates (tsgo + lint + build) all PASS
- FROZEN-STALE = 0 at both cael-pin and current upstream (load-bearing Gate-2.7 invariant satisfied)
- Test failures are drift-class (not feature-regression-class); they will need a test-cure pass regardless of which lane wins cohort-cosign
- The final upstream rebase (required before force-push regardless) will re-flow test files anyway; doing test-cure now is wasted effort if the rebase changes them

## Recommended downstream cycle

If cohort accepts disposition (i), the downstream cycle should:

1. Rebase ce144 against current `upstream/main` (`git rebase upstream/main`), absorbing the 90 post-pin drift items as MIXED-CLOBBER resolutions
2. Run vitest on the rebased candidate
3. For each failing test file: apply UNION cure-direction (restore PRH-test-mod + preserve UPS-test-mod)
4. Iterate until green
5. Force-push to PR branch with cohort-cosign

This is the canonical Lane-B-class follow-on cycle. Lane-A's deliverable enables that cycle by establishing: alt-path reconstruction is feature-complete, cure-direction is correct on all 7 contested files, and the remaining work is test-cure + final rebase.
