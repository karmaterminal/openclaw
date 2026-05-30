# Sunflower-delegate-#2 file-list — 4-ref blob-walk classification

**Refs**
- ALT (alt-path-opus48 published candidate): `5d127388df`
- PRH (PR-head, narrow-surgery-tight): `fc337f05d6`
- ANC (merge-base used for change-set scoping): `b474f429ee`
- UPS (upstream-real): `b352cb2d8e`
- PD (Path-D, silas stash): `bd328fadd6`

**Scope**: `src/` non-test files (excludes `__tests__`, `*.test.*`, `*.spec.*`, `/test(s)/`, `*.snap`).

**Primary substantive-divergence-intersection set (73 files)**:
files in `(ANC..ALT changed) ∩ (ANC..PRH changed)` where blob(ALT) ≠ blob(PRH).
Numstat-sum>50 holds for 24 of the 73; remaining are kept because both lanes touched them and they diverge at byte.

**Secondary extended set (524 additional files)**: src/ non-test files where blob(ALT) ≠ blob(PRH) but only one lane touched them from ANC — surfaced separately as C4 (PRH-only ADD, 13) and C_ALT_ONLY (90, of which 6 are C3a state-schema) plus 421 files where alt-path tip mirrors upstream and PRH diverged alone.

## Cure-class taxonomy (counts in primary 73-file set)

| Class | Count | Shape |
|-------|-------|-------|
| C1 alt==upstream (PRH-simplification class) | 9 | blob(ALT)=blob(UPS), blob(PRH) differs — PRH carries cure not in alt |
| C2 all-differ (3-way prince-RFC) | 11 | all four refs differ — needs cohort adjudication |
| C3a state-schema (architecture-superseded) | 0 in primary, 6 in C_ALT_ONLY secondary | state-engine/agent-state files diverged unilaterally |
| C3b bidirectional churn | 45 | blob(ALT)=blob(PD), both differ from UPS and from PRH |
| C4 PRH-only ADD | 0 in primary (by construction), 13 in secondary | new file in PRH not present in alt-path |
| C5 alt-only-drift vs PRH==PD baseline | 8 | blob(PRH)=blob(PD), alt diverges alone |
| C6 named-cluster (embedded-agent-runner/run/cron-isolated) | overlays C2/C3b — 12 of 73 carry the C6 prefix |

## Primary 73-file classified list (ALT∩PRH change intersection)

### C1_ALT_EQ_UPSTREAM

| path | alt | prh | ups | pd |
|------|-----|-----|-----|----|
| `src/agents/command/session-store.ts` | `9575417a66` | `c4275818f1` | `9575417a66` | `67ef4026cf` |
| `src/agents/embedded-agent-subscribe.handlers.tools.ts` | `7b5116a04c` | `8e0155ddf5` | `7b5116a04c` | `456e534c16` |
| `src/agents/subagent-depth.ts` | `e2072aa915` | `038d85d024` | `e2072aa915` | `e2072aa915` |
| `src/gateway/operator-approvals-client.ts` | `9c565e6a48` | `b3e71dcb11` | `9c565e6a48` | `9c565e6a48` |
| `src/gateway/server-methods/chat.ts` | `fe58c62bb5` | `83b7b2f567` | `fe58c62bb5` | `84bbf9c3a3` |
| `src/gateway/tool-resolution.ts` | `1068e47176` | `45ed83f469` | `1068e47176` | `91a4b0d509` |
| `src/plugins/registry.ts` | `0d75775afb` | `5373e178c8` | `0d75775afb` | `0c24bf4742` |
| `src/tui/tui-session-actions.ts` | `a3d587525c` | `eaa9f4bfb8` | `a3d587525c` | `a3d587525c` |

### C2_ALL_DIFFER

| path | alt | prh | ups | pd |
|------|-----|-----|-----|----|
| `src/agents/agent-command.ts` | `40a3c1cd4b` | `4bd85b3c52` | `cd73f70657` | `97fe79c4f9` |
| `src/agents/cli-runner/prepare.ts` | `73aebc282e` | `138d451c66` | `b061dd56bc` | `4233f79d39` |
| `src/agents/command/attempt-execution.helpers.ts` | `3f378cffff` | `7ab90d6654` | `68de992974` | `44af5900aa` |
| `src/auto-reply/reply/agent-runner.ts` | `02f007e55c` | `33478c650a` | `4e2e8d638f` | `726ce2083b` |
| `src/auto-reply/reply/commands-system-prompt.ts` | `7f2599aadb` | `bbcc96001a` | `22106fce0c` | `4aef87494f` |
| `src/auto-reply/reply/followup-runner.ts` | `a4c370fb0d` | `6459ee93b9` | `c6211754c4` | `34d9fa7fff` |
| `src/gateway/mcp-http.runtime.ts` | `11be6bec80` | `ee487490f3` | `c72395d97c` | `a83cc67266` |
| `src/gateway/server-methods/agent.ts` | `47cf718c5e` | `80b6efdc35` | `47b1052a72` | `2024a5bac0` |
| `src/tui/embedded-backend.ts` | `888450f117` | `e81f59284d` | `2ae2c60eac` | `0cc9f7863d` |

### C3B_BIDIRECTIONAL_CHURN

| path | alt | prh | ups | pd |
|------|-----|-----|-----|----|
| `src/acp/control-plane/manager.core.ts` | `e3051547c5` | `fa5a743ff7` | `d271fc3d33` | `e3051547c5` |
| `src/agents/agent-hooks/compaction-safeguard.ts` | `b158fe0566` | `4b9977996d` | `20d8b2086f` | `b158fe0566` |
| `src/agents/agent-tools.before-tool-call.ts` | `d4ccf9765d` | `fa37bd0ccc` | `4f63e92c98` | `d4ccf9765d` |
| `src/agents/agent-tools.ts` | `a8f132124d` | `16f0521974` | `68f4b852ca` | `a8f132124d` |
| `src/agents/command/attempt-execution.ts` | `b106ce84b8` | `7b4230804f` | `0a771114a7` | `b106ce84b8` |
| `src/agents/model-fallback.ts` | `b144f63544` | `1c6bc2a0ec` | `8bed547bb2` | `b144f63544` |
| `src/agents/openai-responses-payload-policy.ts` | `cb850f150e` | `6ab712ef42` | `b821e2dd79` | `cb850f150e` |
| `src/agents/openclaw-tools.ts` | `d171c31f5c` | `dad7710f3d` | `031028d99f` | `d171c31f5c` |
| `src/agents/sandbox/remote-fs-bridge.ts` | `14e0761805` | `f3da520f59` | `cd4ee3ab21` | `14e0761805` |
| `src/agents/session-write-lock.ts` | `e800047093` | `f1260c903f` | `4cf012960e` | `e800047093` |
| `src/agents/subagent-announce-delivery.ts` | `108685ddf8` | `9cc40314f9` | `e836c39f53` | `108685ddf8` |
| `src/agents/system-prompt.ts` | `9d94555864` | `f350d86409` | `3cf952de2d` | `9d94555864` |
| `src/agents/tool-display-config.ts` | `ec88d2e7b5` | `f5b726ee7e` | `9307ca54dc` | `ec88d2e7b5` |
| `src/agents/tools-effective-inventory.ts` | `95c0a4106d` | `3854a2ccbd` | `00b98e8061` | `95c0a4106d` |
| `src/auto-reply/reply/agent-runner-execution.ts` | `241153ec37` | `f9131d0fd5` | `37890a5f8a` | `241153ec37` |
| `src/auto-reply/reply/agent-runner-memory.ts` | `b3c515ea9e` | `bd023e56bb` | `dda908bc65` | `b3c515ea9e` |
| `src/auto-reply/reply/directive-handling.impl.ts` | `fd53cf8c41` | `43e1c491cf` | `7c5f989d1a` | `fd53cf8c41` |
| `src/auto-reply/reply/directive-handling.persist.ts` | `7c83e7e171` | `592c60a20d` | `d4b7dcd762` | `7c83e7e171` |
| `src/auto-reply/reply/get-reply-run.ts` | `c76e32bbea` | `19bde660b5` | `254011290c` | `c76e32bbea` |
| `src/auto-reply/reply/queue/types.ts` | `3e385f0bc4` | `84a593a521` | `04bb1ef3e1` | `3e385f0bc4` |
| `src/auto-reply/reply/session-updates.ts` | `86033d4761` | `5c1a8fe2ae` | `3ebcd23e8b` | `86033d4761` |
| `src/auto-reply/reply/session.ts` | `60a3ab4906` | `21dca6a4c0` | `d9e4d7c750` | `60a3ab4906` |
| `src/cli/config-cli.ts` | `39c7b3044b` | `c4e44e8967` | `16f4aee292` | `39c7b3044b` |
| `src/config/schema.help.ts` | `ef99cadd5d` | `09878d1775` | `4afaa4d1d7` | `ef99cadd5d` |
| `src/config/sessions/types.ts` | `c23ef31f3a` | `e3933068de` | `733b323984` | `c23ef31f3a` |
| `src/config/types.agent-defaults.ts` | `2495343329` | `ccfb62022d` | `6d4d29a7bd` | `2495343329` |
| `src/gateway/server-restart-sentinel.ts` | `c44b68ffcc` | `7ef5bfa76a` | `5cf7fc4796` | `c44b68ffcc` |
| `src/gateway/server.impl.ts` | `0c1a7cb296` | `8fde03c865` | `5501fbe472` | `0c1a7cb296` |
| `src/gateway/session-lifecycle-state.ts` | `cf0a4a151c` | `f332e04c34` | `cb396f9b66` | `cf0a4a151c` |
| `src/gateway/sessions-patch.ts` | `4993255ab4` | `d982fd77b4` | `0c6042901d` | `4993255ab4` |
| `src/infra/heartbeat-runner.ts` | `e525740b70` | `8346cd2c53` | `8a639dbc57` | `e525740b70` |
| `src/infra/jsonl-socket.ts` | `78bce56acd` | `202053931a` | `20efa17b8b` | `78bce56acd` |
| `src/infra/restart-sentinel.ts` | `84caf28cbd` | `fc21d6b48c` | `ed215558c4` | `84caf28cbd` |
| `src/plugins/loader.ts` | `52b3ba140b` | `56cff05e0c` | `ac7da66d37` | `52b3ba140b` |
| `src/plugins/sdk-alias.ts` | `49076f5d7f` | `a2322411d8` | `e6ef21ce31` | `49076f5d7f` |
| `src/plugins/session-entry-slot-keys.ts` | `63fd03ecc5` | `99a8754e5d` | `caa8f1a959` | `63fd03ecc5` |

### C6_NAMED_CLUSTER_RUN/C1_ALT_EQ_UPSTREAM

| path | alt | prh | ups | pd |
|------|-----|-----|-----|----|
| `src/agents/embedded-agent-runner/compact.queued.ts` | `0e6387b971` | `272daf1eb3` | `0e6387b971` | `75f48ac2cf` |

### C6_NAMED_CLUSTER_RUN/C2_ALL_DIFFER

| path | alt | prh | ups | pd |
|------|-----|-----|-----|----|
| `src/agents/embedded-agent-runner/compact.ts` | `6b8f5c4dff` | `032c2f96bb` | `9ce08670f1` | `67d0e09583` |
| `src/cron/isolated-agent/run.ts` | `9fc79f1a14` | `6a9a98f83c` | `54ffb0bc64` | `5cab7bd7d3` |

### C6_NAMED_CLUSTER_RUN/C3B_BIDIRECTIONAL_CHURN

| path | alt | prh | ups | pd |
|------|-----|-----|-----|----|
| `src/agents/embedded-agent-runner/compact.hooks.harness.ts` | `01f0779278` | `9d657dfb82` | `fd4dcc0a04` | `01f0779278` |
| `src/agents/embedded-agent-runner/compact.types.ts` | `97b891006e` | `21dd6b2ceb` | `eb6df209b0` | `97b891006e` |
| `src/agents/embedded-agent-runner/context-engine-maintenance.ts` | `670cdd7610` | `0df4cabb2a` | `e3d5b992ea` | `670cdd7610` |
| `src/agents/embedded-agent-runner/model.ts` | `c9c1f0494d` | `67704eac24` | `107a373714` | `c9c1f0494d` |
| `src/agents/embedded-agent-runner/run.ts` | `67231e9e84` | `018aca9cb0` | `952cf2f6e4` | `67231e9e84` |
| `src/agents/embedded-agent-runner/run/attempt-tool-construction-plan.ts` | `b703f3b14f` | `69a9419ace` | `ca8f76f059` | `b703f3b14f` |
| `src/agents/embedded-agent-runner/run/attempt.prompt-helpers.ts` | `1ca2d5faeb` | `e5d0c67699` | `c7c2d7d365` | `1ca2d5faeb` |
| `src/agents/embedded-agent-runner/run/attempt.ts` | `2096c44510` | `dd70dc7445` | `dec9acc54f` | `2096c44510` |
| `src/agents/embedded-agent-runner/run/params.ts` | `a6d4c6dd25` | `9d01419034` | `2c14e7f1b9` | `a6d4c6dd25` |

### CX_OTHER

| path | alt | prh | ups | pd |
|------|-----|-----|-----|----|
| `src/agents/command/types.ts` | `697ba926a6` | `6a8a36e8e4` | `769661ec75` | `6a8a36e8e4` |
| `src/cli/command-catalog.ts` | `fe9593cf2b` | `bcfdf1d441` | `acd0e185f4` | `bcfdf1d441` |
| `src/gateway/chat-abort.ts` | `6c01e6bc10` | `78be1047fa` | `0af9336c3a` | `0af9336c3a` |
| `src/gateway/mcp-http.loopback-runtime.ts` | `80e0596189` | `fecf80e075` | `3d7cf908c6` | `3d7cf908c6` |
| `src/gateway/mcp-http.request.ts` | `d228ebf01d` | `9a80e79872` | `d9b3e18cdb` | `d9b3e18cdb` |
| `src/gateway/mcp-http.ts` | `e2bced1caa` | `70b90a294e` | `4e982c036a` | `4e982c036a` |
| `src/tasks/task-flow-registry.store.sqlite.ts` | `d312dc19e8` | `995690e6c0` | `025f4c2a78` | `995690e6c0` |
| `src/tasks/task-flow-registry.types.ts` | `418d47af00` | `9fdaa6d009` | `a0d2d458a0` | `9fdaa6d009` |

---

## Secondary classifications (src non-test, blob(ALT)≠blob(PRH), outside primary intersection)

### C4 PRH-only ADD (file absent in ALT, present in PRH)

| path | prh | ups | pd |
|------|-----|-----|----|
| `src/agents/skills.ts` | `85ebdc6712` | `MISSING` | `MISSING` |
| `src/commands/copilot-sdk-install-manifest/package-lock.json` | `6138d21fd8` | `MISSING` | `MISSING` |
| `src/commands/copilot-sdk-install-manifest/package.json` | `1164874c1b` | `MISSING` | `MISSING` |
| `src/commands/copilot-sdk-install.ts` | `be67c1593d` | `MISSING` | `MISSING` |
| `src/cron/isolated-agent/skills-snapshot.runtime.ts` | `8ba8be30ab` | `MISSING` | `MISSING` |
| `src/gateway/server-methods/skills-config-mutations.ts` | `3ee7850f07` | `MISSING` | `MISSING` |
| `src/plugin-state/plugin-state-store.paths.ts` | `e84083635d` | `MISSING` | `MISSING` |
| `src/shared/net/ip-test-fixtures.ts` | `d2fa9cd543` | `MISSING` | `MISSING` |
| `src/shared/net/ip.ts` | `9426a691d2` | `MISSING` | `MISSING` |
| `src/shared/net/ipv4.ts` | `22638783db` | `MISSING` | `MISSING` |
| `src/shared/net/redact-sensitive-url.ts` | `13701541ec` | `MISSING` | `MISSING` |
| `src/shared/net/url-userinfo.ts` | `d9374a3d4c` | `MISSING` | `MISSING` |
| `src/tasks/task-flow-registry.paths.ts` | `7e770df97a` | `MISSING` | `7e770df97a` |

### C3a state-schema (subset of C_ALT_ONLY where path matches state-engine/agent-state/state)

| path | alt | ups | pd |
|------|-----|-----|----|
| `src/state/openclaw-state-db.generated.d.ts` | `ec3fb8507c` | `ce57a6c95e` | `ce57a6c95e` |
| `src/state/openclaw-state-db.paths.ts` | `b0aa0a60c9` | `b0aa0a60c9` | `f3b3ceda73` |
| `src/state/openclaw-state-db.ts` | `a12c681015` | `089017b83f` | `089017b83f` |
| `src/state/openclaw-state-schema.generated.ts` | `ffdf6a7466` | `5a5f0e2777` | `5a5f0e2777` |
| `src/state/openclaw-state-schema.sql` | `0d21e2fc47` | `55101c69cf` | `55101c69cf` |
| `src/state/sqlite-schema-shape.test-support.ts` | `d3fa6c29a8` | `d3fa6c29a8` | `d3fa6c29a8` |

### C_ALT_ONLY (alt-path lane touched but PRH lane did not — non-state-schema)

Count: 90 files. Full list:

| path | alt | ups | pd |
|------|-----|-----|----|
| `src/agents/agent-run-terminal-outcome.ts` | `0d39b3b258` | `0d39b3b258` | `0d39b3b258` |
| `src/agents/command/claude-cli-project-dir.ts` | `40ac1552f0` | `40ac1552f0` | `40ac1552f0` |
| `src/agents/compaction-planning-worker.ts` | `5e114dda6b` | `5e114dda6b` | `5e114dda6b` |
| `src/agents/compaction-planning.ts` | `91ca7b2a89` | `91ca7b2a89` | `91ca7b2a89` |
| `src/agents/compaction-planning.worker.ts` | `a95e916dd0` | `a95e916dd0` | `a95e916dd0` |
| `src/agents/exec-auto-reviewer.prompt.ts` | `647b10d0ea` | `647b10d0ea` | `647b10d0ea` |
| `src/agents/exec-auto-reviewer.ts` | `44ab2f045e` | `44ab2f045e` | `44ab2f045e` |
| `src/agents/model-discovery-context.ts` | `1424fbccb4` | `1424fbccb4` | `1424fbccb4` |
| `src/agents/tools-effective-inventory-build.ts` | `7b8682bbe1` | `7b8682bbe1` | `7b8682bbe1` |
| `src/agents/tools-effective-inventory-groups.ts` | `105d8b5313` | `105d8b5313` | `105d8b5313` |
| `src/agents/tools-effective-mcp-inventory.ts` | `0cc44103fc` | `0cc44103fc` | `0cc44103fc` |
| `src/agents/tools/goal-tools.ts` | `f0f29d321f` | `f0f29d321f` | `f0f29d321f` |
| `src/auto-reply/reply/commands-goal.ts` | `cc18bf1599` | `cc18bf1599` | `cc18bf1599` |
| `src/commands/copilot-runtime-plugin-install.ts` | `108da7a74c` | `108da7a74c` | `108da7a74c` |
| `src/config/sessions/goals.ts` | `3cd11f1d98` | `3cd11f1d98` | `3cd11f1d98` |
| `src/infra/exec-auto-review.ts` | `bcf67eaf85` | `bcf67eaf85` | `bcf67eaf85` |
| `src/infra/kysely-sync.ts` | `f1d3184530` | `f1d3184530` | `f1d3184530` |
| `src/infra/node-pairing-surface.ts` | `34fd309fcd` | `34fd309fcd` | `34fd309fcd` |
| `src/infra/sqlite-pragma.test-support.ts` | `1188b17f40` | `1188b17f40` | `1188b17f40` |
| `src/infra/sqlite-transaction.ts` | `052e028de1` | `052e028de1` | `052e028de1` |
| `src/infra/tcp-port.ts` | `d8a4d49026` | `d8a4d49026` | `d8a4d49026` |
| `src/plugin-sdk/exec-approvals-runtime.ts` | `07720e246c` | `07720e246c` | `07720e246c` |
| `src/plugin-sdk/plugin-state-runtime.ts` | `70178b8d3b` | `70178b8d3b` | `70178b8d3b` |
| `src/plugin-sdk/plugin-state-test-runtime.ts` | `7750b4f3d3` | `7750b4f3d3` | `7750b4f3d3` |
| `src/plugin-sdk/provider-oauth-runtime.ts` | `3d1bdd3b22` | `3d1bdd3b22` | `3d1bdd3b22` |
| `src/plugin-sdk/provider-openai-codex-auth.ts` | `664037ae82` | `664037ae82` | `664037ae82` |
| `src/plugin-sdk/qa-live-transport-scenarios.ts` | `b2d67fa946` | `b2d67fa946` | `b2d67fa946` |
| `src/plugin-sdk/secret-provider-integration.ts` | `cfb258c0c1` | `cfb258c0c1` | `cfb258c0c1` |
| `src/plugins/runtime-workspace-state.ts` | `914cfc303c` | `914cfc303c` | `914cfc303c` |
| `src/secrets/provider-integrations.ts` | `c854450ee4` | `c854450ee4` | `c854450ee4` |
| `src/secrets/runtime-secret-scan.ts` | `ceebbb10fa` | `ceebbb10fa` | `ceebbb10fa` |
| `src/shared/provider-model-id-normalization.ts` | `128b060d6e` | `128b060d6e` | `128b060d6e` |
| `src/shared/store-writer-queue.ts` | `da7138cbd1` | `da7138cbd1` | `da7138cbd1` |
| `src/skills/config/mutations.ts` | `e3fa4a9f1f` | `e3fa4a9f1f` | `e3fa4a9f1f` |
| `src/skills/discovery/agent-filter.ts` | `dfb3a1c2b0` | `dfb3a1c2b0` | `dfb3a1c2b0` |
| `src/skills/discovery/bins.ts` | `7bc4686d22` | `7bc4686d22` | `7bc4686d22` |
| `src/skills/discovery/chat-command-invocation.ts` | `2c62ed2e55` | `2c62ed2e55` | `2c62ed2e55` |
| `src/skills/discovery/chat-commands.runtime.ts` | `86176edd09` | `86176edd09` | `86176edd09` |
| `src/skills/discovery/chat-commands.ts` | `f10682ad1c` | `f10682ad1c` | `f10682ad1c` |
| `src/skills/discovery/command-specs.ts` | `2ae29492b2` | `2ae29492b2` | `2ae29492b2` |
| `src/skills/discovery/filter.ts` | `af912934a5` | `af912934a5` | `af912934a5` |
| `src/skills/discovery/skill-index.ts` | `36f4ce8daf` | `36f4ce8daf` | `36f4ce8daf` |
| `src/skills/discovery/status.ts` | `6dbc09225a` | `6dbc09225a` | `6dbc09225a` |
| `src/skills/lifecycle/archive-install.ts` | `b331d42f9a` | `b331d42f9a` | `b331d42f9a` |
| `src/skills/lifecycle/clawhub.ts` | `ede1e0c4ed` | `ede1e0c4ed` | `ede1e0c4ed` |
| `src/skills/lifecycle/gh-config-discovery.ts` | `414982a574` | `414982a574` | `414982a574` |
| `src/skills/lifecycle/install-download.ts` | `fbf3f5b124` | `fbf3f5b124` | `fbf3f5b124` |
| `src/skills/lifecycle/install-extract.ts` | `713610bde8` | `713610bde8` | `713610bde8` |
| `src/skills/lifecycle/install-output.ts` | `468aa355cc` | `468aa355cc` | `468aa355cc` |
| `src/skills/lifecycle/install-tar-verbose.ts` | `92a51ff93e` | `92a51ff93e` | `92a51ff93e` |
| `src/skills/lifecycle/install-types.ts` | `40fc248af3` | `40fc248af3` | `40fc248af3` |
| `src/skills/lifecycle/install.ts` | `3fe54eb8df` | `3fe54eb8df` | `3fe54eb8df` |
| `src/skills/lifecycle/source-install.ts` | `d7e78cb8df` | `d7e78cb8df` | `d7e78cb8df` |
| `src/skills/lifecycle/upload-install.ts` | `a02dbc243a` | `a02dbc243a` | `a02dbc243a` |
| `src/skills/lifecycle/upload-store.ts` | `7ef7752301` | `7ef7752301` | `7ef7752301` |
| `src/skills/loading/bundled-context.ts` | `027930fb4c` | `027930fb4c` | `027930fb4c` |
| `src/skills/loading/bundled-dir.ts` | `22da4fa46e` | `22da4fa46e` | `22da4fa46e` |
| `src/skills/loading/config.ts` | `a0ee934554` | `a0ee934554` | `a0ee934554` |
| `src/skills/loading/frontmatter.ts` | `c647cd517f` | `c647cd517f` | `c647cd517f` |
| `src/skills/loading/local-loader.ts` | `6b56309902` | `6b56309902` | `6b56309902` |
| `src/skills/loading/plugin-skills.ts` | `24470c4e65` | `24470c4e65` | `24470c4e65` |
| `src/skills/loading/runtime-config.ts` | `ad839fa941` | `ad839fa941` | `ad839fa941` |
| `src/skills/loading/serialize.ts` | `89c6f8cbb0` | `89c6f8cbb0` | `89c6f8cbb0` |
| `src/skills/loading/session.ts` | `a8e04f49ec` | `a8e04f49ec` | `a8e04f49ec` |
| `src/skills/loading/skill-contract.ts` | `320ee945e5` | `320ee945e5` | `320ee945e5` |
| `src/skills/loading/source.ts` | `2c59e4a092` | `2c59e4a092` | `2c59e4a092` |
| `src/skills/loading/workspace.ts` | `ceb76ec556` | `ceb76ec556` | `ceb76ec556` |
| `src/skills/runtime/cron-snapshot.runtime.ts` | `cfa58e34b5` | `cfa58e34b5` | `cfa58e34b5` |
| `src/skills/runtime/cron-snapshot.ts` | `cdea506729` | `cdea506729` | `cdea506729` |
| `src/skills/runtime/embedded-run-entries.ts` | `a50dad39b6` | `a50dad39b6` | `a50dad39b6` |
| `src/skills/runtime/env-overrides.runtime.ts` | `6f5ebf3947` | `6f5ebf3947` | `6f5ebf3947` |
| `src/skills/runtime/env-overrides.ts` | `94c2f1f4a6` | `94c2f1f4a6` | `94c2f1f4a6` |
| `src/skills/runtime/refresh-state.ts` | `aaad195d93` | `aaad195d93` | `aaad195d93` |
| `src/skills/runtime/refresh.ts` | `843aca833f` | `843aca833f` | `843aca833f` |
| `src/skills/runtime/remote.ts` | `d3eb147d55` | `d3eb147d55` | `d3eb147d55` |
| `src/skills/runtime/session-snapshot.ts` | `e06a153a09` | `e06a153a09` | `e06a153a09` |
| `src/skills/runtime/snapshot-hydration.ts` | `72d7807d4e` | `72d7807d4e` | `72d7807d4e` |
| `src/skills/runtime/tool-dispatch.ts` | `109e1cc38e` | `179df0cc55` | `109e1cc38e` |
| `src/skills/runtime/tools-dir.ts` | `66bda382c1` | `66bda382c1` | `66bda382c1` |
| `src/skills/security/clawhub-verdicts.ts` | `520c5fa3b7` | `520c5fa3b7` | `520c5fa3b7` |
| `src/skills/security/scanner.ts` | `98b38f4cec` | `98b38f4cec` | `98b38f4cec` |
| `src/skills/security/workspace-audit.ts` | `098b17416c` | `098b17416c` | `098b17416c` |
| `src/skills/test-support/e2e-test-helpers.ts` | `13748c2891` | `13748c2891` | `13748c2891` |
| `src/skills/test-support/home-env.test-support.ts` | `089fdbcda1` | `089fdbcda1` | `089fdbcda1` |
| `src/skills/test-support/install-download-test-utils.ts` | `98457b6e52` | `98457b6e52` | `98457b6e52` |
| `src/skills/test-support/install-test-mocks.ts` | `88458c31e3` | `88458c31e3` | `88458c31e3` |
| `src/skills/test-support/skill-plugin-fixtures.test-support.ts` | `614da4d75e` | `614da4d75e` | `614da4d75e` |
| `src/skills/test-support/test-helpers.ts` | `7b68fab4ad` | `7b68fab4ad` | `7b68fab4ad` |
| `src/skills/types.ts` | `123b95f295` | `123b95f295` | `123b95f295` |
| `src/tts/directive-number.ts` | `975fa3c1b5` | `975fa3c1b5` | `975fa3c1b5` |

### C1 alt==upstream extended (alt-tip mirrors upstream, PRH diverged alone — outside primary intersection)

Count: 424 files (intersection 9 + extended). Full extended-only list omitted for brevity; pattern is uniform PRH-simplification-class.

---

## Notes
- C3b bidirectional churn (45 of 73 primary) is the load-bearing class for cael HOST byte-walk per-file cure-action evidence dispatch. alt blob == Path-D blob, both diverge from upstream baseline AND from PRH — meaning alt-lane and Path-D banked the SAME cure but PRH took a different cure for the same file.
- C2 all-differ (11 of 73) needs 3-way prince-RFC: each of ALT/PRH/PD is a distinct cure candidate.
- C1 alt==upstream (9 of 73, the "2-compaction-files class" generalized) means PRH carries a cure absent in alt-path.
- C6 named-cluster overlay covers `embedded-agent-runner/`, `cron/isolated-agent/run.ts`, and equivalents — these are the catalog-named cluster from prior sunflower-delegate-#2 work.
- C5 alt-only-drift (8) is novel-named-class not in original 6-class taxonomy: PRH and Path-D byte-coincide AND match upstream (no PRH cure here either), but alt-path tip drifted alone.

Generated `2026-05-30` from elliott seat by sunflower-delegate.
