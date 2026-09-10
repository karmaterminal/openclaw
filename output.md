# Continuation chain-break bundled-plugin A/B

Issue: openclaw/openclaw#129388

## Conclusion

**A/B proves bundled-plugin discovery owns the failure.**

At diagnostic product `0b85aeb4685df7da33259fe3c6a0153dedd85cb8` on Node
24.17.0, three normal runs took 99.50-110.91 seconds wall time. The identical
fixture command with only `OPENCLAW_DISABLE_BUNDLED_PLUGINS=1` took 10.49-12.36
seconds. The exact row that dominated the enabled runs fell from
86.339-87.782 seconds to 0.411-0.499 seconds. All six runs passed with exit 0.

The alternating A/B/A/B/A/B order rules out a one-time warm transform/import
effect: the first enabled transform was 16.61 seconds and later enabled
transforms were 6.60-6.73 seconds, while the exact test row remained
86.339-87.260 seconds. Disabled runs remained 0.411-0.499 seconds for that row.

The supported ownership boundary is bundled-plugin directory resolution and
the downstream discovery/import fanout. At this product SHA,
`OPENCLAW_DISABLE_BUNDLED_PLUGINS=1` makes
`src/plugins/bundled-dir.ts` resolve an empty bundled-plugin directory. This
experiment does not isolate a particular plugin and does not support a
continuation refactor.

## Named refs

The proof snapshot was committed and published before this metadata receipt was
added. The final commit is a metadata-only successor; it does not alter the
measurements or conclusion.

| Category | Named ref | Full SHA | Local/tracking/server equality |
| --- | --- | --- | --- |
| Product/base | diagnostic product | `0b85aeb4685df7da33259fe3c6a0153dedd85cb8` | Clean diagnostic clone `HEAD` equals requested SHA |
| Safe lane | `codeagent/ab-chain-break-bundled-plugins` proof snapshot | `9efc54795d00af252b227ac2c6f753532558563d` | Local = `origin/...` tracking = server after proof publication |
| CI/workflow | N/A | N/A | Workorder prohibited Actions dispatch |
| Presentation | N/A | N/A | Workorder prohibited presentation work |
| Docs/proof | immutable `output.md` proof snapshot | `9efc54795d00af252b227ac2c6f753532558563d` | Commit was pushed to the safe lane before this receipt |

The server `main` ref was observed only as context at
`76db6d1846e54d7f2fe2a1a605f828a1cd4ab84e`; it is not an evidence authority.

## Environment

- Ordinary clone:
  `/home/figs/flesh_beast_best_beast/source/openclaw-ab-chain-break-diagnostic`
- Product SHA: `0b85aeb4685df7da33259fe3c6a0153dedd85cb8`
- Product commit: `test: compose callback and mac fixture repairs`
- Node used for every test: `/home/figs/.nvm/versions/node/v24.17.0/bin/node`,
  reported `v24.17.0`
- pnpm: `12.1.0`, matching the `packageManager` pin
- Test config: `test/vitest/vitest.auto-reply-reply.config.ts`
- Worker count: 1
- Initial and final `OPENCLAW_DISABLE_BUNDLED_PLUGINS`: unset
- Each observation was a fresh Node/Vitest process. No suite process was reused.
- A 150-second outer `timeout` preserved a bounded receipt if the hosted
  120-second symptom recurred. It did not fire in any run.

The clean clone dependencies were installed from the exact manifest and lock
with `pnpm install --frozen-lockfile`. The install shell reported Node 25.9.0
because a user-local Node path shadowed `nvm use`; no test evidence was taken
from that shell. Before testing, `PATH` was explicitly prefixed with the exact
Node 24.17.0 installation, and both `node --version` and the test receipts
confirmed that runtime.

## Commands

Dependency setup in the ordinary clone:

```sh
cd /home/figs/flesh_beast_best_beast/source/openclaw-ab-chain-break-diagnostic
pnpm install --frozen-lockfile
```

Runtime identity before the experiment:

```sh
export PATH=/home/figs/.nvm/versions/node/v24.17.0/bin:$PATH
hash -r
node --version
pnpm --version
git rev-parse HEAD
```

Variant A (normal environment):

```sh
timeout --signal=TERM --kill-after=10s 150s \
  env -u OPENCLAW_DISABLE_BUNDLED_PLUGINS \
  node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.auto-reply-reply.config.ts \
  --maxWorkers=1 \
  src/auto-reply/reply/agent-runner.continuation-chain-break-reset.test.ts
```

Variant B changed only the fixture-scoped environment assignment:

```sh
timeout --signal=TERM --kill-after=10s 150s \
  env OPENCLAW_DISABLE_BUNDLED_PLUGINS=1 \
  node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.auto-reply-reply.config.ts \
  --maxWorkers=1 \
  src/auto-reply/reply/agent-runner.continuation-chain-break-reset.test.ts
```

Both commands were wrapped by:

```sh
/usr/bin/time -f 'TIME wall=%e user=%U sys=%S maxrss_kb=%M exit=%x'
```

## Raw timing table

The exact measured row was:

`runReplyAgent :: continuation chain-break reset > resets the chain budget to 0 on a fresh (non-wake) turn-entry, upstream of inference`

| Run | Variant | Start (local) | Wall | User | Sys | Max RSS KiB | Transform | Setup | Import | Tests | Exact row | Exit |
| ---: | :---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | A, normal | 2026-09-10 08:23:11 | 110.91s | 120.74s | 9.06s | 2,726,188 | 16.61s | 366ms | 17.94s | 90.11s | 87.782s | 0 |
| 2 | B, disabled | 2026-09-10 08:25:02 | 12.36s | 16.58s | 4.95s | 2,591,580 | 7.02s | 176ms | 9.53s | 662ms | 499ms | 0 |
| 3 | A, normal | 2026-09-10 08:25:15 | 99.50s | 109.89s | 7.25s | 2,676,980 | 6.73s | 177ms | 8.36s | 88.58s | 86.339s | 0 |
| 4 | B, disabled | 2026-09-10 08:26:54 | 10.49s | 14.31s | 4.50s | 2,576,980 | 6.45s | 127ms | 7.94s | 579ms | 438ms | 0 |
| 5 | A, normal | 2026-09-10 08:27:05 | 100.78s | 111.19s | 7.04s | 2,544,100 | 6.60s | 136ms | 8.80s | 89.63s | 87.260s | 0 |
| 6 | B, disabled | 2026-09-10 08:28:45 | 11.10s | 15.26s | 4.57s | 2,599,792 | 6.51s | 161ms | 8.43s | 556ms | 411ms | 0 |

Vitest reported one passed file and four passed tests in every run. Approximate
means were 103.73 seconds wall for A and 11.32 seconds for B (9.16x), and
87.127 seconds for the exact row under A versus 0.449 seconds under B
(194x).

## Scope and restoration

Nearest continuation siblings were not run because the alternating owner-file
A/B already produced a deterministic classification; adding siblings would
not isolate the bundled discovery boundary further. No source, timeout,
workflow, presentation, deployment, or PR change was made. Persistence,
rollback, restart/recovery, and partial-failure repair cases are N/A because
this was a read-only experiment and no repair was attempted.

Raw per-run logs and `/usr/bin/time` receipts remain in the session artifact
directory and were not committed.
