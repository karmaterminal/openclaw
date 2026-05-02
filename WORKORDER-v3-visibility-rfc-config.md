# WORKORDER — v3 visibility RFC + fleet ansible config + delegate-return-session-targeting doc

## Strategic framing

🌊's :16Z byte-walk verified the session-visibility model is implemented + working in code (`src/plugin-sdk/session-visibility.ts:20-247`), 4 levels: `self | tree | agent | all`. Default-when-unset is `tree` (line 66) — conservative, blocks cross-tree-same-agent reach.

This is a defining element of the continuation feature's inter-session prince-comms substrate. Per figs's directive 2026-05-02 ~04:25Z:

1. **RFC documents the visibility model + delegate-return-session-targeting** (or better words). Explicitly note recommended ship-default + the 4-level enum semantics + the cross-host-RPC limitation (cross-host reach requires substrate not yet implemented; tracked at `karmaterminal/binary-canticle#20` with breadcrumb at `karmaterminal/openclaw#526`).

2. **Code-default for shipping (upstream-presentation)**: stay at `tree` — conservative for arbitrary upstream operators; they dial up if they want.

3. **Our fleet ansible-config**: override to `tools.sessions.visibility=all` so princes get the full inter-session-comms substrate by default. Princes use ALL permutations, dogfood the freedom.

4. **Test pin**: regression test that the in-code default is `tree` + asserts the 4-level enum hasn't drifted.

This lane lives on v3 branch (the v29 ship-target candidate) on top of v3-cohort-fixes. The ansible work is separate-repo (openclaw-bootstrap).

## §0 — guardrails

- Operate ONLY in `/home/figs/flesh_beast_best_beast/openclaw-wt-v3-visibility-rfc/`
- For openclaw-bootstrap edits (§2.C), use a separate clone or worktree at the openclaw-bootstrap repo
- **Never read, write, list, or shell into `/home/figs/flesh_beast_tmp/openclaw/`** — prince-runtime tree, off-limits
- Push to:
  - `frond-scribe/20260429/v3-visibility-rfc-config` on `karmaterminal/openclaw` (forward-only; no force-push)
  - A new branch on `karmaterminal/openclaw-bootstrap` for the ansible config-pin (forward-only)
- **HARD RAIL**: NO force-push of anything to `karmaterminal/openclaw:feature/context-pressure-squashed`
- Heartbeat webhook username: `frond-scribe-v3-visibility-rfc-hook`
- Resolve webhook: `gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value'`

## §1 — read-first

1. **Existing RFC**: `docs/design/continue-work-signal-v2.md` at the worktree root. Read end-to-end if scope-discipline allows; else read the table of contents + the section on continue_delegate / sessions / configuration to land in the right insertion-spot.
2. **Visibility code**: `src/plugin-sdk/session-visibility.ts` (the type + resolver + checker)
3. **Regression test reference**: `src/agents/tools/continuation-tools-registration.test.ts:31-43` (continue_delegate descriptor-only pin pattern)
4. **🌊's byte-walk receipts**: Discord msg `1499985604325974161` if accessible; line citations:
   - Enum at `:20`: `"self" | "tree" | "agent" | "all"`
   - Resolver `:60-67` defaults to `"tree"` when unset (line 66)
   - Logic `:187-247`: cross-agent gated by `"all"` + a2a-policy; same-agent self requires exact match, tree requires same-tree, agent and all fall through (`:225-241`)
   - Test at `sessions-access.test.ts:160` exercises the four-level enum
   - Sandbox clamp `:80-83`: sandboxed sessions clamp non-tree down to tree
5. **Trackers**:
   - `karmaterminal/binary-canticle#20` — cross-gateway RPC substrate tracker (cross-host reach)
   - `karmaterminal/openclaw#526` — breadcrumb pointing to bc#20

## §2 — work to do

### §2.A — RFC edit on `docs/design/continue-work-signal-v2.md`

Add a new section (suggested title: `Session visibility model and delegate-return-session-targeting`). Place it near existing sections on continue_delegate / sessions-tools or where session-targeting concerns are already discussed; respect the existing RFC's depth-of-discussion register.

**Content the section must cover**:

1. **The 4-level enum** — `self | tree | agent | all`:
   - `self` — current session only
   - `tree` — current session-tree (parent + spawned children); blocks cross-tree even within same agent
   - `agent` — same-agent cross-tree (e.g. one prince's main-DM session can reach their own discord-channel-bound session); cross-agent still blocked
   - `all` — cross-agent reach allowed (with `a2a-policy` still enforced as second gate)

2. **Where the gating applies** — the visibility level governs `sessions_send`, `sessions_list`, `sessions_history`, `sessions_status`. Note: `continue_delegate` does NOT carry a recipient parameter today (descriptor-only schema; cross-session targeting deferred to the SDQ substrate per `karmaterminal/openclaw#332` and the (b)-shape canticle work at `karmaterminal/binary-canticle#11`).

3. **Recommended ship-default**: `tree` — conservative for arbitrary upstream operators; explicit opt-in to `agent` or `all` for cross-tree / cross-agent reach.

4. **Sandbox interaction**: sandboxed sub-sessions clamp non-tree levels down to `tree` regardless of operator config. Operators can't widen sandboxed reach by config alone.

5. **Cross-host limitation (load-bearing note)**: `sessions_send` and friends are in-process to a single openclaw-gateway daemon. Setting `visibility=all` enables cross-tree / cross-agent reach **within a single gateway**, but does NOT enable cross-host reach. Cross-host inter-session comms today goes through the messaging-channel substrate (Discord, Telegram, etc) via the `message` action=send tool. A cross-gateway RPC substrate is tracked separately at `karmaterminal/binary-canticle#20` (out of scope for this RFC).

6. **Delegate-return-session-targeting**: clarify that today's `continue_delegate` does not target a specific recipient session — it spawns a new sub-session under the dispatcher's tree. Operators wanting recipient-bearing delegate flows wait for the SDQ substrate (`#332`) or the (b)-shape evolution (`binary-canticle#11`).

### §2.B — Test pin on `karmaterminal/openclaw`

Add a regression test (or extend existing `sessions-access.test.ts`) that asserts:

1. The in-code default for `tools.sessions.visibility` resolves to `"tree"` when not explicitly configured.
2. The `SessionToolsVisibility` enum has exactly the four values: `"self" | "tree" | "agent" | "all"`. (Use a `Schema.satisfies` / type-level assert if cleanest.)

This pins the ship-default + protects the enum-shape from accidental drift.

### §2.C — Ansible config-pin on `karmaterminal/openclaw-bootstrap`

Same shape as PR #847's memory-config canon. Add `tools.sessions.visibility: all` to the fleet ansible defaults so the cohort gets the full inter-session-comms substrate by default + can dogfood all permutations.

Find the ansible-role file that #847 modified (likely `pods/openclaw-config/...` or `ansible/roles/openclaw-config/defaults/main.yml`) and add the visibility line. Open a separate PR on openclaw-bootstrap for this; do NOT cross-mix with the openclaw RFC PR.

## §3 — checkpoints + heartbeats

Push at the end of each §2 sub-section. Heartbeat after each push.

**Heartbeat shape**:

```bash
WEBHOOK=$(gh variable list -R karmaterminal/frond-scribe --json name,value --jq '.[] | select(.name=="DISCORD_SPRITES_WEBHOOK") | .value')
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"frond-scribe-v3-visibility-rfc-hook\",\"content\":\"🤖 v3-visibility-rfc: <one-line status>\"}" \
  "$WEBHOOK"
```

Heartbeat after:

- §2.A RFC section landed
- §2.B test pin landed
- §2.C ansible PR opened on openclaw-bootstrap
- Final declare-done

## §4 — stop-condition

1. RFC section added; `pnpm tsgo` clean; `pnpm check` clean
2. Test pin added; `pnpm test src/plugin-sdk/session-visibility.test.ts src/agents/tools/sessions-access.test.ts` (or wherever the test lives) green
3. `pnpm config:docs:check` + `pnpm plugin-sdk:api:check` pass (RFC edit may regen baselines; commit them if they change)
4. Ansible PR opened on openclaw-bootstrap with the `tools.sessions.visibility: all` config-pin (PR-open is success-state; do NOT auto-merge — figs admin-merges per #847 pattern)

## §5 — declare-done

Final heartbeat: `🤖 v3-visibility-rfc: declare-done; RFC + test-pin pushed at <SHA> on frond-scribe/20260429/v3-visibility-rfc-config; ansible config-pin PR opened at karmaterminal/openclaw-bootstrap#<NNN>; ready for prince byte-walk-review`

DO NOT open the openclaw v3 PR autonomously (figs decides PR-shape). DO open the openclaw-bootstrap ansible PR (same as #847 pattern; figs admin-merges).

## §6 — what NOT to do

- NO force-push to `karmaterminal/openclaw:feature/context-pressure-squashed`
- NO autonomous merge of openclaw v3 PR (push branch only)
- NO classification-language ("counter-shape", "cure-canon") in commits/heartbeats — plain technical descriptions
- NO touching `/home/figs/flesh_beast_tmp/openclaw/` (off-limits prince-runtime tree)
- NO RFC edits that contradict existing RFC text (preserve depth-of-discussion register)

## Journal section (append as you go)

<!-- start journal -->
