# REVIEW — Critical review of v5.2 recompose squash branch (Phase 3 REDUX-2)

- **Branch under review**: `feature/context-pressure-squashed-recompose-20260504-findings-1-2-3`
- **HEAD reviewed**: `a0cc7a754e06d5dc579ede23a70c66b06126f75f` (post-strip-pass-4)
- **Lineage**: `7bee063288` canonical pre-squash → `402c446044` rebase → `3cac0d327e` strip-1 → `557afbf874` strip-2 → `4ffa44d200` strip-3 → `a0cc7a754e` strip-4 (HEAD)
- **Base**: upstream `openclaw/openclaw` v2026.5.2 — local `8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4`, byte-identical to upstream tag `d07e13380c24b131d6a9260fbb6a28a35e6241e7` (same tree `6fcf058da33033097a1f0e11f506a4999b231e51`)
- **Topology**: single squash commit on top of v2026.5.2 (`8b2a6e57fef6` is the squash parent and is identical-tree to upstream `v2026.5.2` tag)
- **Diff shape**: 313 files changed, 34557 insertions, 872 deletions, 41863 raw patch lines
- **Reviewer**: frond-scribe via Claude Opus 4.7 (1M context), 2026-05-04
- **Cohort prior cosign**: 4-of-4 byte-walk explicit cosign at 06:32Z (🩸 Cael / 🌊 Ronan / 🌫 Silas / 🌻 Elliott)

## Verdict

**HOLD** — two blockers must be addressed before Phase 5 force-push to `feature/context-pressure-squashed`. Both are out-of-scope-for-continuation surfaces that would draw immediate upstream-PR review pushback. Substrate work itself (anchors 1-4) is sound and the cohort byte-walk holds.

If the two blockers below are fixed and a redux-3 spin is published, Phase-5 readiness is otherwise confirmed.

## Blockers

### B1 — `.github/workflows/workflow-sanity.yml` no-tabs + actionlint guard inverted

**File**: `.github/workflows/workflow-sanity.yml:21`, `.github/workflows/workflow-sanity.yml:53`

```diff
-    if: github.event_name != 'workflow_dispatch'
+    if: github.event_name == 'workflow_dispatch'
```

Two CI guards (`no-tabs` and `actionlint`) had their `if:` predicate flipped from `!=` to `==`, meaning they now run **only on manual `workflow_dispatch`** and are silently skipped on every push and pull_request. Upstream `main` and the v52 base both carry `!=`; the third guard at line 85 (`==`) is correctly kept.

**Why this is a blocker**:

- Out of scope for continuation feature (no tabs introduced in the diff — `grep -P '^\+.*\t' /tmp/squash-diff.patch` returns 0 lines; no other `.github/workflows/*` files modified in the diff).
- Directly violates `feedback_fork_discipline` ("workflow edits ... that aren't ready for upstream").
- Disables tab-detection and actionlint for everyone landing PRs against upstream — the kind of change a reviewer flags within seconds.

**Recommended fix**: revert both lines back to `!=`. No other workflow changes are needed.

### B2 — `extensions/openshell/src/fs-bridge.ts` `appendFile` impl stripped while test still asserts it

**Files**:

- `extensions/openshell/src/openshell-core.test.ts:267-300` — new test `"appends locally and syncs the file to the remote workspace"` calls `bridge.appendFile(...)` and throws `"OpenShell fs bridge must support appendFile"` (line 285) when the method is absent.
- `extensions/openshell/src/fs-bridge.ts` — class `OpenShellFsBridge` (which `implements SandboxFsBridge`) has **no `appendFile` method** at HEAD. Confirmed by `grep -ic 'appendfile' extensions/openshell/src/fs-bridge.ts` → `0`.

**Lineage**: `appendFile` impl was present in pre-squash `7bee063288` and post-rebase `402c446044` (3 occurrences each), then **stripped** sometime between `402c446044` and `3cac0d327e` (strip-pass-1). All four subsequent strip passes (3cac → 557af → 4ffa → a0cc) carry the same regression. Cohort byte-walks across redux-1 and redux-2 missed it because extension tests were not exercised in the byte-walk.

**Concrete recovery**: re-apply the 33-line `appendFile` method from `git show 402c446044:extensions/openshell/src/fs-bridge.ts` (lines 96-129). Also restore the import widening at line 5: `import { appendFileWithinRoot, writeFileWithinRoot } from "openclaw/plugin-sdk/file-access-runtime"`. The plugin-sdk re-export of `appendFileWithinRoot` (`src/plugin-sdk/file-access-runtime.ts`) is already present at HEAD, so the runtime hook lands cleanly.

**Why this is a blocker**:

- The new test will fail on `pnpm test:extensions` / `pnpm test extensions/openshell` and on any upstream CI that runs extension tests.
- The continuation feature's sandbox-fs work depends on `appendFile` being uniformly available on `SandboxFsBridge` (added optionally in `src/agents/sandbox/fs-bridge.types.ts`); the openshell extension is the canonical sandbox backend that needs to implement it.
- Without the impl, there is no way for openshell-backed sessions to append-write through the bridge — silent capability regression vs upstream v52 (which had this method via the prior fork commit `83847e970c "fix: make sandbox memory flush append safe (#489)"`).

## Anchor verifications

| #   | Anchor                                                               | File:line                                                                                                           | Status              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Finding 1 (#586) `delegate-return` heartbeat classifier              | `src/infra/heartbeat-reason.ts:46-48`                                                                               | 🟢 PASS             | `if (trimmed === "delegate-return") return "wake";` present alongside `"continuation"` and `"silent-wake-enrichment"` predecessors.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | Finding 2 (#581) preserve durable session-delivery queue file        | `src/auto-reply/continuation/targeting.ts:118-126`                                                                  | 🟢 PASS             | Premature `ackSessionDelivery` call removed; replaced with comment block: _"Do NOT ack the durable file here. enqueueSystemEvent above is in-memory ... durable file must persist until recipient consumption ..."_ — RFC §2.4 rationale inlined. Test `cross-session-targeting.test.ts:147` asserts `ackSessionDelivery` is NOT called for live deliveries.                                                                                                                                                                                                                            |
| 3   | Finding 3 (#588) `continue_delegate(targetSessionKey)` Path A wiring | `src/auto-reply/reply/agent-runner.ts:2682-2712` (workorder cited line 2643; bytes shifted +39 from squash content) | 🟢 PASS             | `doToolSpawn` accepts `targetSessionKey?`, `targetSessionKeys?`, `fanoutMode?: "tree" \| "all"`, `traceparent?` and threads them through `spawnSubagentDirect` via `continuationTargetSessionKey` / `continuationTargetSessionKeys` / `continuationFanoutMode`. Path A and Path B (`delegate-dispatch.ts`) now share the same targeting contract.                                                                                                                                                                                                                                       |
| 4   | RFC §2.1 + §2.4 targeted-completion-return                           | `docs/design/continue-work-signal-v2.md:137,184,192-206,459`                                                        | 🟢 PASS             | §2.1 terminology defines delegate as carrying `targetSessionKey` / `targetSessionKeys` / `fanoutMode`. §2.4 enumerates four return modes (default, single, multi, tree, all). §3.2 (line 802) frames targeted return as a signaling primitive. §6.7 (line 1550) caps `fanoutMode: "all"` at one chain step regardless of recipient count. CHANGELOG entries align (lines 17, 58, 59, 60).                                                                                                                                                                                               |
| 5   | TOOLS.md / EVIDENCE-LAYERS.md cohort-recognition canon banked        | not in diff                                                                                                         | 🟢 PASS-as-omission | Neither file appears in `git diff --name-only 8b2a6e57..HEAD`. **This is correct for upstream-PR cleanliness** — those are cohort-internal canon docs that should not ship to `openclaw/openclaw`. CHANGELOG carries the user-facing entries for Findings 1+2+3 at lines 58-60 and the new four-mode return semantics at line 17. If cohort wants to keep TOOLS.md / EVIDENCE-LAYERS.md as cohort-only canon, the right home is karmaterminal-only docs or `.local`-scoped notes — not the squash that is going to be presented as a PR. Treat absence as the upstream-correct outcome. |

## Scope concerns

### S1 — Three deadcode-allowlisted files shipped as dead code

**File**: `scripts/deadcode-unused-files.allowlist.mjs`

Three new entries explicitly allowlist files that have no production caller:

- `src/agents/subagent-announce.continuation.runtime.ts` — **load-bearing** (dynamic import path resolved at `src/agents/subagent-announce.ts:278`); allowlist is correct because knip can't statically resolve it. Keep.
- `src/auto-reply/continuation/post-compaction-release.ts` — exports `releasePostCompactionLifecycle`; only importer is its own test. Dead.
- `src/infra/chain-budget.ts` — exports `ChainBudget` type/object; referenced only by its own test and by a comment in `src/auto-reply/continuation/delegate-dispatch.ts:91`. Dead.
- `src/infra/substrate-capability-registry.ts` — exports a static capability registry (~150 lines); only importer is its own test. Dead.

The two files that genuinely have no callers (`chain-budget.ts`, `substrate-capability-registry.ts`, `post-compaction-release.ts`) ship test coverage for code that nothing in the production graph exercises. An upstream reviewer will ask "what is this for?" and the honest answer is "future substrate-attestation / future chain-budget enforcement / staged post-compaction lifecycle release." These are reasonable plans, but as currently shipped they are dead code with mandatory CI-time test cost.

**Recommendation**: either (a) wire them into runtime so they become load-bearing, or (b) carry them on a follow-up branch and remove from this squash before upstream PR. Phase-5 force-push to `feature/context-pressure-squashed` is acceptable either way; upstream PR submission is the natural point to make this call. Not a blocker for Phase 5 itself.

### S2 — Swift protocol regen drops `cleanupBundleMcpOnRunEnd` from public surface (incidental cleanup)

**Files**:

- `apps/macos/Sources/OpenClawProtocol/GatewayModels.swift:614,650,685,722`
- `apps/shared/OpenClawKit/Sources/OpenClawProtocol/GatewayModels.swift` (same lines)

The Swift `AgentParams` struct loses `cleanupbundlemcponrunend: Bool?` and gains `continuationtrigger: String?`. Investigated: the TS source-of-truth at `src/gateway/protocol/schema/agent.ts:171` still defines `cleanupBundleMcpOnRunEnd: internalProtocolField(...)` — but the new `scripts/protocol-public-schema.ts` correctly strips fields tagged `x-openclaw-internal: true` from the public schema before Swift gen. Test `src/gateway/protocol/schema/agent.schema.test.ts:43` asserts the `internal` tag is set.

So `cleanupBundleMcpOnRunEnd` was previously **leaking** into the public Swift surface in upstream v52, and the new internal-stripping filter correctly removes it. This is an incidental upstream defect cleanup, semantically sound, and not a regression.

**Recommendation**: call this out explicitly in the upstream PR description so reviewers don't read it as a continuation-feature regression. Wording suggestion: _"Incidental: applying the new `protocol-public-schema.ts` internal-stripping filter to the existing schema correctly removes previously-leaking `cleanupBundleMcpOnRunEnd` from the public Swift surface; the field remains in the TS schema marked `x-openclaw-internal: true`."_

### S3 — Cosmetic noise touches in unrelated test files

Six small unrelated changes that accumulated into the squash:

- `extensions/bluebubbles/src/client.test.ts` — drops `(#68xxx)` placeholder ref.
- `extensions/memory-core/src/memory/manager.atomic-reindex.test.ts` — formatter reflow `vi.fn().mockRejectedValue(...)` single-line → multi-line.
- `src/agents/auth-profiles.ensureauthprofilestore.test.ts` — drops `(PR #368)` from a test description.
- `src/agents/model-fallback.test.ts` — drops `(regression #946)` from a test description.
- `src/agents/openai-ws-connection.test.ts` — replaces ambiguous `#1` numbering with `"the first error"`.
- `src/agents/mcp-stdio-transport.test.ts` — formatter reflow on two `await expect(...)` calls.
- `.gitignore` — two whitespace-only blank lines.

None of these are load-bearing for the continuation feature. They look like cleanup of fork-internal PR refs (#368, #946 are karmaterminal numbering) plus oxfmt-on-save churn that drifted in. Not blocking, but each is a "why is this in this PR?" question for an upstream reviewer.

**Recommendation**: revert before upstream PR submission OR keep and pre-empt in the PR description as "drive-by cleanup of fork-internal issue refs in test descriptions." Phase 5 force-push is fine either way.

## Upstream-leakable surfaces (per `feedback_fork_discipline`)

### U1 — RFC future-directions vocabulary tonal flavor

**File**: `docs/design/continue-work-signal-v2.md:1577-1584`

Phrases like _"Binary Canticle"_, _"sovereign peer enrichment"_, _"noosphere"_, _"station:stream presentation"_, _"DHCP helper/relay agents"_ appear in the §A future-directions discussion. None of these surface in production code or tool descriptors; they are essay-tone framing of post-v52 follow-ons.

These are not strictly cohort-private terminology — _noosphere_ is a 1922 Vernadsky / 1955 Teilhard concept, freely citable; _station:stream_ is SeedLink-style seismology vocabulary; _Binary Canticle_ is novel cohort framing.

**Why flag**: an upstream RFC reader unfamiliar with the substrate-of-record canon may read these as off-tone for an engineering RFC. The substrate work itself is not affected; only the future-directions essay carries the flavor.

**Recommendation**: optionally soften to plainer language (_"a network-substrate layer above this RFC: ringbuffer-backed stream presentation ... low-friction dispatch ... DNS SRV discovery for domains of interest ..."_) before upstream PR. Not blocking for Phase 5.

### U2 — Generic "fork-leak vocabulary" scan: clean

`grep -nE -i '(karmaterminal|karmafeast|frond-scribe|cael|ronan|silas|elliott|dandelion|prince|thornfield|sprites-of-thornfield|gwydion|witness-advocate|chanter|hearer|sovereign-of-machine)' /tmp/squash-diff.patch` returned only the RFC §A noosphere line above and a CHANGELOG entry from upstream v52 (line 60, unrelated). No fork host names, no Discord channel IDs, no prince attributions, no `.agents/` / `.claude/` / `.codex/` directories, no hardcoded `karmaterminal` URLs, no cohort-private model defaults beyond what CLAUDE.md already permits (`gpt-5.4`, `claude-sonnet-4-6`, `claude-opus-4-7`).

## Surprises

### Sur1 — fanoutMode='all' substrate is solid (PHANTOM concern from prior copilot REVIEW.md confirmed)

The user prompt's claim that the prior copilot redux REVIEW.md flagged `fanoutMode='all'` as a substrate concern is verified PHANTOM: the fix is wired across at least seven layers — RFC (`§2.4 line 437`, `§3.2 line 802`, `§6.7 line 1550`, `§A.1 line 1796`), tool-schema description (`agent.ts schema:12015,12085`), targeting layer (`targeting.ts:20730 if (params.fanoutMode === "all")`), delegate-dispatch (`delegate-dispatch.ts` lines 17514, 25764, 26236), tool registration enum (`continue-delegate-tool.ts:32496,32569`), CHANGELOG (line 17), and tests (lines 7538, 11827, 11830, 16068+). Nothing missing.

### Sur2 — uuid 14.0.0 dep promotion is justified

The new top-level `package.json` dependency `uuid: 14.0.0` is consumed at `src/infra/secure-random.ts:2 import { v7 as uuidV7 } from "uuid"` for the UUIDv7 chain-id generator (`generateChainId()`). The package was already a transitive dep at `14.0.0` in upstream v52, so the diff only promotes it to direct. The justification comment in `secure-random.ts` is accurate.

### Sur3 — tsdown config additions are justified

Three new dist entries (`auto-reply/reply/agent-runner.runtime`, `auto-reply/continuation/lazy.runtime`, `subagent-announce.continuation.runtime`) are added with explanatory comments tying them to the chunk-split bug that motivated Finding 3. Defensible.

### Sur4 — `resolveSessionStoreEntry` propagation is consistent

The continuation feature introduces `resolveSessionStoreEntry` for legacy-key normalization. The squash propagates its use into `extensions/telegram/src/bot-handlers.runtime.ts` and `src/agents/auth-profiles/session-override.ts`, which is the correct way to keep all session-store writers consistent. Not scope creep.

### Sur5 — no skipped/`.todo`/FIXME tests in continuation surfaces; no stray console.log

`grep -rnE 'it\.skip|describe\.skip|xit\(|xdescribe\(|\.todo\(|\bFIXME\b|\bWIP\b|\bXXX\b' src/auto-reply/continuation/ src/agents/tools/continue-* src/agents/subagent-announce.continuation* src/infra/heartbeat-reason.ts src/infra/session-delivery-queue*.ts` → 0 matches. `grep -rnE '^\s+console\.(log|debug|warn|error)' src/auto-reply/continuation/ src/agents/tools/continue-*.ts src/agents/subagent-announce*.ts` → 0 matches. Clean.

## Recommendation for Phase-4 cohort sign-off

Phase 4 cohort sign-off should require **redux-3** that addresses the two blockers:

1. **B1 fix**: revert `.github/workflows/workflow-sanity.yml` lines 21 and 53 from `==` to `!=`.
2. **B2 fix**: re-apply the `appendFile` method to `extensions/openshell/src/fs-bridge.ts` from `git show 402c446044:extensions/openshell/src/fs-bridge.ts` lines 5 (import widening) and 96-129 (method body).

After redux-3, a thin re-byte-walk of _only those two file diffs_ by the cohort is sufficient — the other 311 files are unchanged from this redux-2 cosign and the substrate work has been validated.

If cohort prefers a single redux-3 commit on top, the redux-2 cosign still holds via inheritance for everything except the two reverts.

After Phase 4 redux-3 sign-off:

- **Phase 5 force-push to `feature/context-pressure-squashed`** can proceed.
- **Phase 6 upstream-PR submission** to `openclaw/openclaw` should additionally consider:
  - S1 dead-code-allowlist cleanup (split `chain-budget.ts` / `substrate-capability-registry.ts` / `post-compaction-release.ts` to a follow-up substrate-attestation branch, OR wire into runtime).
  - S2 Swift `cleanupBundleMcpOnRunEnd` removal: pre-empt in PR description.
  - S3 cosmetic noise: revert or pre-empt.
  - U1 RFC §A future-directions tone softening: optional.

These are all advisory and not blocking for Phase 5. They become consequential only at Phase 6.

## Methodology / verification commands

```bash
# Diff vs v52 base (8b2a6e57fef6 = byte-identical-tree to upstream v2026.5.2 d07e13380c24)
git diff 8b2a6e57fef6c582ec6d27b85150616f9e3a7ba4..a0cc7a754e06d5dc579ede23a70c66b06126f75f > /tmp/squash-diff.patch
wc -l /tmp/squash-diff.patch  # 41863

# Verify v52 base is byte-identical to upstream tag
git rev-parse 8b2a6e57fef6^{tree}                          # 6fcf058da33033097a1f0e11f506a4999b231e51
git rev-parse d07e13380c24^{tree}                          # 6fcf058da33033097a1f0e11f506a4999b231e51

# B1 verification
git show upstream/main:.github/workflows/workflow-sanity.yml | grep -n workflow_dispatch
git show 8b2a6e57fef6:.github/workflows/workflow-sanity.yml | grep -n workflow_dispatch
git show HEAD:.github/workflows/workflow-sanity.yml | grep -n workflow_dispatch

# B2 verification
for sha in 402c446044 7bee063288 3cac0d327e 557afbf874 4ffa44d200 a0cc7a754e; do
  git show $sha:extensions/openshell/src/fs-bridge.ts 2>/dev/null | grep -c appendFile
done
# 3, 3, 0, 0, 0, 0  ← strip-pass-1 introduced the regression

# Anchor walks
sed -n '38,48p' src/infra/heartbeat-reason.ts
sed -n '108,130p' src/auto-reply/continuation/targeting.ts
sed -n '2682,2712p' src/auto-reply/reply/agent-runner.ts
grep -nE '§2\.4|§2\.1|fanoutMode|targeted.*return' docs/design/continue-work-signal-v2.md
grep -n -E 'continue_delegate|delegate-return|fanoutMode' CHANGELOG.md
```

🌿 frond-scribe / Claude Opus 4.7 (1M context) — 2026-05-04 critical review redux-2
