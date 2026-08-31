# Independent review: final bounded continuation candidate `75c2e64c`

Lane: `codeagent/129388-75c2e64c-final-candidate-independent-review-20260831`  
Reviewer seat: read-only. No product edit, no presentation move, no driver resume.

## Verdict

**`CONFIRMED_FINAL_BOUNDED_CANDIDATE`**

Product-driver resume may use exact `75c2e64c0b30f63010922b747093f855319cf919`.  
Protected presentation remains `00c7f721a55554d0b9228337cc8bc6bec88f9e9f` and is still blocked on the product-owned covenant driver, k6 corpus, proof fold, and final CI/body. This lane does not claim those.

Mode-B `33390774573` is **not** acceptance-green (`receipts_valid=false`, 21 fail). It is sufficient absorb-repair attribution, not a ship gate.

## Named-ref contract

Read-only lane: identity is the named product/savegame refs. This review branch is report-only and is not a product identity gate.

| Role                              | Named ref                                                                       | Full SHA                                           | Local / tracking / server                                                           |
| --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Product/base                      | `codeagent/129388-0ed59cb6-upstream-8e32494f-gates-absorb-20260831`             | `75c2e64c0b30f63010922b747093f855319cf919`         | HEAD = `origin/` tracking = server; tree `7b28ba07322c326852cb9418adb14dc639238155` |
| Final savegame                    | `savegame/129388-0ed59cb6-upstream-8e32494f-postrepair-75c2e64c-20260831T1215Z` | `75c2e64c0b30f63010922b747093f855319cf919`         | `origin/` tracking = server; equal to product                                       |
| Candidate tree                    | N/A (immutable tree)                                                            | `7b28ba07322c326852cb9418adb14dc639238155`         | `git rev-parse 75c2e64c^{tree}` matches workorder                                   |
| Accepted pre-absorb               | `0ed59cb64f31971e8659b417fe3fd2ba6a1730c3`                                      | `0ed59cb64f31971e8659b417fe3fd2ba6a1730c3`         | ancestor of product; tree `52b6141c80e575813f94241635ce02007b50d140`                |
| Pinned upstream floor             | `8e32494fcf839181a5f02a1f0649068cd91d2b14`                                      | `8e32494fcf839181a5f02a1f0649068cd91d2b14`         | ancestor of product; tree `466a6dc233262280d5586c3126d1b7fb81c347b5`                |
| Rejected merge                    | `cc513ec0acf81d36dde3f1c86925473f8665469b`                                      | `cc513ec0acf81d36dde3f1c86925473f8665469b`         | ancestor of product; first-parent of repair `f63ff5a8`                              |
| Absorb repair                     | `f63ff5a87c41d28dadba1b069654d9c66b4c9dee`                                      | `f63ff5a87c41d28dadba1b069654d9c66b4c9dee`         | parent of `75c2e64c`                                                                |
| Negative Mode-B product           | run `33374343233`                                                               | product `cc513ec0acf81d36dde3f1c86925473f8665469b` | workflow `3c5acdb72e94755f469fc6cc3276d5b8623d5b49`                                 |
| Final Mode-B product              | run `33390774573`                                                               | product `75c2e64c0b30f63010922b747093f855319cf919` | workflow `38a833154cba6a9d562302799bff27941aa39dd3`                                 |
| CI/workflow                       | `karmaterminal/openclaw-bootstrap@38a83315`                                     | `38a833154cba6a9d562302799bff27941aa39dd3`         | tree `91674b4f43ff18454db3c035e5032cf7bce0894d`; fetched object                     |
| Presentation                      | `codeagent/85651-upstream-1ba243c8-gates`                                       | `00c7f721a55554d0b9228337cc8bc6bec88f9e9f`         | local object = `origin/` branch = server; **unchanged**; read-only                  |
| Covenant harness repair           | `karmaterminal/karmaterminal-openclaw-docs@5384acb5`                            | `5384acb5a137fdcfe30f1742bdc6af86ef8899d1`         | GitHub commit resolved; read-only                                                   |
| Covenant harness review           | `karmaterminal/karmaterminal-openclaw-docs@35798b52`                            | `35798b5223f29ebc19924c1014929696c5585731`         | GitHub commit resolved; read-only                                                   |
| Docs main / fleet / component PRs | N/A                                                                             | N/A                                                | not fetched for mutation; out of scope                                              |
| This review branch                | `codeagent/129388-75c2e64c-final-candidate-independent-review-20260831`         | report commit (this file)                          | report-only; must not be used as product SHA                                        |

Merge commit of the absorb: `06f02c9b06717426df9ab88948c7b4d226443df8` parents `131b5b12f032b30ffb56ba836bb437151f1fda85` + `8e32494fcf839181a5f02a1f0649068cd91d2b14`.

## 1. Ancestry and identity

- Tree of `75c2e64c` is exactly `7b28ba07`.
- `0ed59cb6`, `8e32494f`, `cc513ec0`, and `00c7f721` are all ancestors.
- Candidate branch, savegame, and reviewed product SHA are byte-equal on origin.
- Presentation branch still points at `00c7f721`. This lane did not update it.

## 2. Conflict ledger and mixed-clobber

Independent `git merge-tree --write-tree --messages 0ed59cb6 8e32494f`: **69 CONFLICT lines** (68 content + 1 modify/delete). Path set equals the journal 69-row ledger exactly.

High-risk samples against both parents:

| Surface                         | Disposition            | Independent check                                                                                                                                                                  |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subagent-control-messaging.ts` | Deleted                | Present on `0ed59cb6`, absent on `8e32494f` and `75c2e64c`. Upstream replacement architecture.                                                                                     |
| Agent schema v19                | Composed               | Still one stamp: participant (>=18), creator namespaces (>=19), `schemaSql`, recipient authority (>=19), then `PRAGMA user_version`. `OPENCLAW_AGENT_SCHEMA_VERSION = 19`. No v20. |
| `payloads.ts`                   | Composed               | `af00ec7070e` keeps upstream parsed directives only when `answerTexts.length === 1`.                                                                                               |
| Session/transcript              | Composed               | `69a1e27a77d` freezes delivery-ack replacement once `pendingInput` or `staging` starts.                                                                                            |
| Queue / collector               | Composed then repaired | Collector activation moved into `afterRegistration` (`f63ff5a8`).                                                                                                                  |
| Gateway source-reply            | Composed then repaired | `20735820643` withholds terminal-broadcast ownership when `suppressFinal`.                                                                                                         |
| Discord                         | Non-conflict absorb    | vs `8e32494f`: 5 files / 11 lines. vs `0ed59cb6`: large upstream Discord pull. Prompt snapshots regenerated.                                                                       |
| Plugin SDK                      | Composed               | Surface report + catalog tests in the 69; static `protocol:gen` green on Mode-B.                                                                                                   |

Independent Gate 2.7 from bootstrap blob `90e4cadd` / inventory `387ff9ce` at workflow `38a83315`:

```
files examined: 962
GENUINE 612 / MIXED-CLOBBER 36 / SAFE-NEW 314 / FROZEN-STALE 0
exit 0
```

Mixed path set **equals** the journal 36-row KEEP-COMPOSED/KEEP-REGENERATED ledger. No row requests upstream restoration.

Note: journal virtual merge-tree OID `9220fadb` was not reproduced (`11dc64cd` for the same parent pair). Conflict **paths and count** still match. OID mismatch is a journal identity nit, not a semantic merge defect.

## 3. Thirteen `cc513ec0` absorb failures

Negative Mode-B `33374343233` deterministic set has 29 rows. Thirteen are `REPAIRED-ABSORB` and are **absent** from final Mode-B `33390774573`:

Continuation reservation (7):

- `agent-runner.continuation-work-span.reservation.test.ts` child-token updates
- `agent-runner.continuation-work-span.test.ts` (failed reservation, disablement rollback, hot-reload limits, live limit increase, parked work, hedge-fired delegate)

Subscriber commentary/cost (4):

- reasoning-delivery streamed / snapshot-only / equal snapshot-only item identity
- `subscribeembeddedagentsession` unknown streamed cost remains unknown

Retirement rollback (1):

- `subagent-control.retirement.test.ts` retained successor after failed rollback

Queued collector projection (1):

- `session-utils.queued-collector.test.ts` second collector create stays queued

Owning repair `f63ff5a87c41d28dadba1b069654d9c66b4c9dee`:

1. **Session usage** — `persistSessionUsageUpdate` now calls `updateSessionEntry` (semantic accessor with in-transaction `assertCommitAllowed` / `onCommitted`) instead of `patchSessionEntryCore`, so usage writes cannot consume continuation chain-state faults.
2. **Commentary** — item-scoped `scopeAssistantMessageToStreamBlock` + `itemId` display; `handleMessageEnd` no longer rereads repaired zero usage; stream-rendering resets commentary state on block boundary.
3. **Collector publication** — `activateCollectorSubagentRun` runs inside `afterRegistration` after lifecycle-publication admission, not after a create event that raced scheduler activation.
4. **Rollback diagnostics** — `new-row-survived` preserved; rollback error message is included.

Those four shards are green on `33390774573` (`agentic-agents-support`, `agentic-gateway-core-1`, `auto-reply-reply-agent-runner`; `agentic-agents-core-subagents` remains red only for inherited case 7).

## 4. Post-merge repairs (no semantic narrowing)

`06f02c9b..75c2e64c` is 24 commits. Production owners reviewed:

- transcript media export + staged delivery freeze
- payload phase boundaries
- tool metadata WeakMap / concrete identity
- subscriber lifecycle splits (`tool-lifecycle.ts`, recovery settlement split)
- CLI update wrapper profile tests
- generated Codex prompt snapshots
- Knip/max-lines splits (duplicate export deletion, formatting)
- source-reply suppressFinal dedupe
- `f63ff5a8` owner repairs above
- `75c2e64c` journal-only (does **not** record run `33390774573`; intentional SHA freeze)

No TRANSPOSE owner was rewritten by `f63ff5a8`. `work-dispatch.ts`, `delegate-dispatch-chain-state.ts`, continue-work / request-compaction tools, and 15 continuation-config paths are byte-identical `0ed59cb6` → `75c2e64c`.

## 5. Independent gates

| Gate                                         | Independent receipt                                                                                                        | Result                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate 2                                       | `feature-cores-byte-check.sh` @ `38a83315` cores `387ff9ce`, PR_HEAD `0ed59cb6`, CANDIDATE `75c2e64c`, UPSTREAM `8e32494f` | **36 invariants, 0 FAIL, 7 exact-upstream, 3 tombstones, 0 empty-pattern, exit 0**                                                                                     |
| Gate 2.7                                     | `drift-cure-gate.sh` same workflow SHA                                                                                     | **962 / 0 frozen / 36 mixed / 612 genuine / 314 safe-new, exit 0**                                                                                                     |
| Assertion ratchet                            | Mode-B static `33390774573`                                                                                                | `4152 files, 12823 grandfathered assertions`                                                                                                                           |
| protocol:gen / types / lint / format / build | Mode-B static PASS (788s)                                                                                                  | check, oxlint, oxfmt, import-cycle 0, strict-smoke                                                                                                                     |
| Gate 2.5 7,311/0/7 + 839 support             | **not locally rerun**                                                                                                      | no worktree `node_modules`; matching lock blob `545ccd7f` has no same-host install. Negative/positive for absorb rows taken from Mode-B, not a 29-shard local Gate 2.5 |
| Knip / Barnacle 4.8                          | **not independently rerun**                                                                                                | not in Mode-B static artifact; journal claim not re-executed                                                                                                           |

Focused owner tests were **infrastructure-blocked** in this worktree (policy forbids `pnpm install` here; no matching lockfile clone). That is routed, not hidden. It is not a missing product repair.

## 6. Labeler / skills

`.github/labeler.yml` is **unchanged** vs `8e32494f` (not in the 962). No `r:skill` or `dirty` labels. The only `skills` globs label `.agents/skills/openclaw-update/**` and `update-team-server/**` as `docs`.

- `src/skills/**` in the 962: **0**
- new `skills/**/SKILL.md`: **0**
- `src/skills` exists on upstream (225) and candidate (225); not a bundled-skill addition

One 962 path contains the word skills: `src/agents/sandbox/workspace-skills-bridge-readonly.test.ts` (test, not a skill bundle).

## 7. File envelope (962)

`git diff --name-status 8e32494f 75c2e64c`: **962** (648 M, 314 A).

Top dirs: `src` 830, `extensions` 63, `test` 28, `scripts` 11, `ui` 11, `docs` 7, `packages` 6, `config` 2, plus `apps`, `package.json`, `tsdown.config.ts`, `tmp-drop-me-claude.md`.

Net envelope vs pre-absorb triple-dot 956: **+14 / −8 = +6**. Additions are composed splits (tool-lifecycle, recovery-settlement, allowlist, replay-safety, session-usage/types). Removals include deleted `subagent-control-messaging.ts` and files that now match upstream.

Root files vs upstream: `package.json` (M), `tsdown.config.ts` (M), `tmp-drop-me-claude.md` (A, GATES journal already on `0ed59cb6`). Not unexplained detritus. No backups, no extra reports, no stale hosts, no unrelated asset dump. Continuation docs/assets are feature-owned.

## 8. Proof materiality (38 rows)

Journal table independently counted: **10 TRANSPOSE, 27 RERUN, 1 BLOCKED-ON-DRIVER**.

TRANSPOSE owners sampled byte-identical `0ed59cb6`→`75c2e64c` (`work-dispatch.ts` and siblings, continue-work / request-compaction tools, continuation-config paths). `R-CD-RETURN-COVENANT-AUTHORITY` stays **BLOCKED-ON-DRIVER**; no k6 driver path exists on either parent or successor. No ancestry-only credit was accepted where composition owners changed (`f63ff5a8` only touches already-RERUN owners).

## 9. Mode-B artifacts

### Negative `33374343233`

- product `cc513ec0acf81d36dde3f1c86925473f8665469b`
- workflow `3c5acdb72e94755f469fc6cc3276d5b8623d5b49`
- 181,239 pass / 32 fail / 3 flakes greened / 163 summaries / **65 / 69** receipts
- 29 deterministic failures

### Final `33390774573`

- product `75c2e64c0b30f63010922b747093f855319cf919`
- workflow `38a833154cba6a9d562302799bff27941aa39dd3`
- **181,489 pass / 21 fail / 3 flakes greened / 166 summaries / 68 / 69 receipts**
- 18 deterministic failures
- `receipts_valid=false` — **no acceptance-green claim**

Missing receipt: **`hosted-batch-009`**. `agentic-commands-doctor-whatsapp` passed (6/6). Supplemental `extensions` died SIGKILL after no-output timeout (`rc=143`). Same batch class as the negative run’s extensions gap. Does not hide the 13 absorb rows (those shards have valid receipts and are green except inherited case 7).

### Remaining 18 on `75c2e64c` — independent classification

Exact-title match vs `0ed59cb6` Mode-B `33323536011` (product `0ed59cb6`, workflow `3c5acdb7`):

**13 inherited from `0ed59cb6`:**

- diagnostics-otel Codex dynamic continuation origins
- ACP completion runtime timeout + suppressed timeout
- crosssession-gate case 7
- full-release-validation-state (6)
- historical media v14 + v15
- Telegram model-callback loopback

**4 TUI PTY rows** (dist shards skipped on `0ed59cb6` / `cc513ec0` because static fanout was disabled):

- xAI account limit errors
- validation-loop abort diagnostics
- Gateway status model new/reset RPCs
- non-deliverable direct reply failure

**1 load-only row:** `run-attempt.dynamic-tools` default credential wait (present on `cc513ec0` as NONREPRO-LOAD; absent from `0ed59cb6` deterministic set; still present on `75c2e64c`).

Workorder 14+3+1 arithmetic does not match exact-title partitioning (**13+4+1**). None of the 18 is an absorb-induced regression. The 13 repaired rows are gone. This is an attribution-count note, not a product repair.

## 10. External gaps (routed, not hidden)

| Gap                             | This lane                                                                                                                                                                                                                                                                                            | Routing                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Telegram / Convex on Elliott    | No Convex CLI / QA pair                                                                                                                                                                                                                                                                              | Credentialed Telegram QA still required against exact `75c2e64c` |
| Codex autoreview 401            | Not rerun; no sibling `../codex` checkout                                                                                                                                                                                                                                                            | Seat reauth; no substitute engine                                |
| GitNexus exact index            | Fork CLI present: `/home/figs/.local/bin/gitnexus` → `karmaterminal/GitNexus` `3c1e686edfc1acaac882927cada121ddd7c47bcc` (cli hash `00f67e34c0ef3a7ea5f1665247699f47e7e2eab2dc233a504fe95d9aa11d8590`, v1.6.5). Indexes exist only for stale SHAs (`fc337f05`, etc.). **No exact `75c2e64c` index.** | Disclosed; no GitNexus credit                                    |
| Focused Gate 2.5 / owner vitest | No matching `node_modules` for lock `545ccd7f`                                                                                                                                                                                                                                                       | Mode-B + Gate 2/2.7; do not invent a local full suite            |
| Knip / Barnacle                 | Not in Mode-B static                                                                                                                                                                                                                                                                                 | Journal claim not independently repeated                         |

Journal said “prebuilt GitNexus CLI absent”; this seat found the karmaterminal wrapper. The **index** gap remains. No stale index was queried.

## 11. Covenant harness base

Docs commits `5384acb5` (repair) and `35798b52` (independent review) exist. Product tree has **no** `openclaw.k6.return-covenant-fixture-driver.v1`. Candidate is a valid product base for that separately accepted harness. This review does **not** claim the missing driver or k6 corpus.

Presentation `00c7f721` is unchanged and remains blocked on driver/proof/final CI/body.

## Validation commands

```text
git rev-parse HEAD^{tree}                          # 7b28ba07322c326852cb9418adb14dc639238155
git merge-tree --write-tree --messages 0ed59cb6 8e32494f   # 69 CONFLICT
bash /tmp/gates-38a83315/feature-cores-byte-check.sh 0ed59cb6 75c2e64c cores --upstream 8e32494f
bash /tmp/gates-38a83315/drift-cure-gate.sh 8e32494f 75c2e64c 43a7cb3c /tmp/gate27-75c2
gh run view 33374343233 --repo karmaterminal/openclaw-bootstrap
gh run view 33390774573 --repo karmaterminal/openclaw-bootstrap
# aggregate-summary.md from artifacts 9753963122 / 9760421636
```

CI path used: **existing Mode-B run `33390774573`** (product `75c2e64c0b30f63010922b747093f855319cf919`, workflow `38a833154cba6a9d562302799bff27941aa39dd3`). This lane did not dispatch a new run and did not run Gate 3g.

## Uncertainties

- Gate 2.5 7,311/0/7 and Barnacle/Knip were not re-executed here.
- Virtual merge-tree OID in the journal does not match this git 2.43.0 `merge-tree`.
- Remaining Mode-B 18-row split is 13+4+1 by exact title, not 14+3+1.
- `tmp-drop-me-claude.md` remains a root GATES journal on the product SHA (inherited from `0ed59cb6`).

None of those block using exact `75c2e64c` as the product-driver resume base.
