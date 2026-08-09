# WO-1229 — deploy composite, capture proof, open Emeric's upstream PR

Lane: `frond-scribe` / `codeagent/wo1229-deploy-proof`
Working SHA: `02bd9d77142` (standalone #1229 bytes; this branch adds only `output.md`)
Composite under test: `739e038651b20ffda9416674f80ffe38b2d92cb8`
Silas baseline: `f01e2fbf09130103592c948ef7eef6b39a1e5a88`

## Outcome (TL;DR)

- **Composite is GOOD.** `739e038651b` builds cleanly (`--version: OpenClaw 2026.8.1
  (739e038)`, `dist_sha256=06b01321…`) and carries the #1229 owner surface. The
  delivery-context continuation imports are fixed. This is verified.
- **Deploy to silas is BLOCKED by a pre-existing Path-B staging bug**, NOT by the
  composite, #1229, or config: the Path-B candidate import-closure check cannot resolve
  `@openclaw/gateway-protocol` (declared `workspace:*`) from
  `packages/gateway-client/dist/{browser,index,session-subscriptions}.mjs`. This is the
  **exact blocker the first lane already flagged**, and it is deterministic (it hit two
  different composites). I must not force it (Repair Doctrine / "report trouble rather
  than forcing a gate"; it is deploy-lane tooling, "someone else's assembly").
- **Silas outage caused and fully repaired.** The `config_stage_key` attempt got past
  config-validate INTO the rsync/swap, hit the import-closure failure, and the Path-B
  **rollback stranded the seat** (restored HEAD/config but not per-package dists →
  0 dists → `start-limit-hit`). I repaired silas to its exact pre-deploy state.
- **Proof (tasks 2–3) is OWED**, blocked on a running composite.
- **Upstream PR (task 4) is HELD, not opened** — see rationale below. It is one command
  from ready.
- **Incident:** a diagnostic `doctor --fix` I ran on the builder (elliott) applied
  elliott's own forward workspace migration; elliott self-healed and is healthy.

## Preflight (all GREEN)

- Composite `739e038651b` exists (`karmaterminal/openclaw`, branch
  `frond-build/20260809/assembly-ca5a25af-emeric-1229`). Both stale continuation imports
  are fixed: `delegate-dispatch-recovery.ts:12 → ../../utils/delivery-context.shared.js`;
  `subagent-announce.continuation.runtime.ts:25 → ../utils/delivery-context.types.js`.
- Forward guard: `f01e2fbf091` is an ancestor of `739e038651b` (`behind_by: 0`).
- Silas pre-deploy: active @ `f01e2fbf091`, build-info matches, 18 `packages/*/dist`.

## The three deploy attempts and their root causes

The composite builds every time. Each failure was downstream of the build.

### Attempt 1 — run `31326628644` (no migrate_config) → config-validate rejects a retired key
```
openclaw.json:243 — agents.defaults.compaction: Unrecognized key: "truncateAfterCompaction"
```
The 2026.8.1 runtime retired `agents.defaults.compaction.truncateAfterCompaction`;
silas's live config still carries it (`= true`). Hook failed **closed pre-swap** — silas
untouched.

### Attempt 2 — run `31327835778` (migrate_config=true) → candidate `doctor --fix` exits nonzero
```
config migration: candidate doctor failed against the staged copy; live config is unchanged
```
`migrate_config` runs `openclaw doctor --fix --non-interactive --yes` on a staged copy
(`deploy/lib/runtime-config-migration.sh:1231`). I reproduced against the real composite
artifact on the builder (elliott), isolated: the **pure config migration is clean** —
`Removed retired agents.defaults.compaction.truncateAfterCompaction.`, `Doctor complete.`
(exit 0), and the migrated config passes `config validate` (`Config valid`). The deploy's
nonzero exit is doctor `--fix` **over-reaching** (it also runs workspace/memory/state
migrations + a health check) and tripping on silas-specific live state — it fails EARLY
(silas workspace verified untouched). Hook failed **closed pre-swap** — silas untouched.

### Attempt 3 — run `31328932929` (config_stage_key) → hits the Path-B blocker + strands silas
Sanctioned sidestep: staged a reviewed minimal migrated config (silas live minus the one
retired key; validated against the candidate runtime, `Config valid`) at
`~/.openclaw/deploy-config-staging/wo1229-compaction-migrated.json`
(sha256 `0c78b83e…`, 0700/0600). The hook accepted it (config-validate passed, live config
untouched), copied 16 package dists, then:
```
candidate import closure failed:
packages/gateway-client/dist/browser.mjs -> @openclaw/gateway-protocol/connect-error-details:
  Cannot find package '@openclaw/gateway-protocol'
  (…index.mjs, session-subscriptions-*.mjs, many symbols…)
[path-b-rsync-hook] ERROR: candidate imports: emitted runtime import closure is unresolved
[path-b-rsync-hook] cutover journal: phase=rollback-started
[path-b-rsync-hook] config rollback: original bytes restored and verified
[path-b-rsync-hook] rollback: prior runtime restart failed; cutover journal retained
[path-b-rsync-hook] rollback: restoration validation failed; refusing to restart the prior runtime
```
This is the **pre-existing Path-B `@openclaw/gateway-protocol` import-closure bug** the
first lane documented, hit again on this composite. Two failures compounded:
1. The import-closure check blocks the deploy (staging materialization: the `workspace:*`
   package is not linked for the emitted `gateway-client` dist closure).
2. The **rollback itself is buggy** — after restoring config + HEAD, it could not restore
   the per-package dists or restart the prior runtime, stranding silas.

## Silas outage — caused by attempt 3, fully repaired

Post-rollback silas was `failed (start-limit-hit)`, HEAD `f01e2` but **0 package dists**,
`dist/index.js` present but top-level runtime incomplete, live config correctly rolled back
to original (`c25a3650`, `truncateAfterCompaction` present), ExecStartPre auto-recovery
exited 1. Repair (mirrors the first lane's playbook):

1. `systemctl --user stop` + `reset-failed` (clear start-limit-hit).
2. Backed up + cleared BOTH cutover journals: `~/.openclaw/openclaw.json.deploy-cutover-journal`
   and `~/.local/state/openclaw-deploy-recovery/journals/3f2d05….deploy-cutover-journal`.
3. Restored 18 package dists + top-level `dist/` from the seat's retained
   `payload-f01e2fbf091…-1784830372` (verified `build-info.commit == f01e2` and
   `packages/ai/dist/transports.mjs` present — NOT the `dist.pathb-pre-*` backups, which
   are a different head's dists).
4. `node dist/index.js config validate` → `Config valid`.
5. `reset-failed` + `start` → **active**, v2026.7.2, 19 plugins incl. discord, Discord
   client reconnected as `@Silas🌫` (`1474269301715501178`), zero errors.

Final silas state = exact pre-deploy state. My moot staged config was removed; repair
backups retained as safety (`~/.openclaw/wo1229-repair-backup-*`,
`~/.openclaw/wo1229-repair-topdist-bak-*`).

## Incident — elliott builder workspace forward-migration (self-inflicted, recovered)

To read attempt 2's swallowed doctor error I ran `openclaw doctor --fix …` against the
composite artifact on elliott. **I should have used `--lint` (read-only).** `--fix` applied
elliott's OWN forward workspace migration (merged `workspace/TOOLS.md` into `AGENTS.md`,
migrated `HEARTBEAT.md`, recovered Memory Core rows) — the same idempotent forward
migration elliott gets on its own upgrade; originals archived, not deleted. elliott's
gateway stayed `active`/healthy; `TOOLS.md` was subsequently re-created by elliott's own
runtime (present, 876 B). No silas workspace was ever touched (failed deploys stop before
workspace migrations; config_stage_key runs no doctor). Lesson recorded: diagnose with
`--lint`, never `--fix`, against a live seat.

## Why the upstream PR is HELD (design fork, surfaced)

The workorder is a pipeline: **deploy → observe the composite runtime → publish a manifest
that MUST cite the OBSERVED composite runtime (task 3) → open the PR (task 4)**. The proof
is the PR's evidentiary basis. The deploy is blocked by a Path-B tooling bug (the
orchestrator's own domain), so the composite runtime cannot be observed, and the required
task-3 manifest cannot be produced. Opening Emeric's **upstream** PR (public, under his
identity, on `openclaw/openclaw`) past a blocked proof gate that stranded the seat is
"forcing a gate"; the first lane held on exactly this basis, and nothing that unblocks it
(the Path-B staging fix) has landed. I am therefore holding the PR and surfacing the fork
rather than opening without the intended proof.

The PR is **one command from ready** the moment the deploy/proof gap closes:
- Branch `codeagent/wo1229-upstream-pr` @ `02bd9d77142` (pristine 17-file #1229 surface),
  intact on `karmaterminal/openclaw`.
- Body staged: `~/.copilot/session-state/7a3d9035…/files/pr-body.md` (honest: it already
  states live-gateway proof is not attached and reviewers may request it).
- Attribution `emeric-dandelion-cult` via `ssh emeric` (holds his gh auth, per first lane).
- Open with: `ssh emeric` → `gh pr create --repo openclaw/openclaw --base main
  --head karmaterminal:codeagent/wo1229-upstream-pr
  --title "fix(discord): stop draining day-old room backlog as fresh turns"
  --body-file <pr-body.md>`.

## Proof mechanism (task 2) — analysis for whoever captures it post-deploy

Silas is configured for the exact bug: `channels.discord.groupChat.unmentionedInbound =
room_event`, guild `1235610176883523614` with 3 monitored channels `requireMention:false`,
`allowBots:true`, `allowFrom:["*"]`. Suppression (`extensions/discord/src/monitor/ingress.ts`,
`resolvePendingDisposition`) fires when a **pending ambient row whose Discord message
timestamp is >15 min old** is claimed → `discord ingress stale ambient backlog suppressed`.
Before-state (bug live under old code, captured read-only): 260 completed rows drained
>15 min late, max lag 17.5 h, 92 `handler-timeout` failures, **0** `stale-ambient-backlog`
rows. Silas is usually caught up (0 pending) and the fix is self-limiting, so the receipt
fires naturally only during a genuine >15-min ambient backlog. Post-deploy capture plan:
watch `journalctl --user -u openclaw-gateway` for the receipt + a promptly-admitted direct
mention (`<@1474269301715501178>`); if none organically, induce a bounded ambient backlog
on the private `figs.bot` ops guild (10 members) only.

## Validation

This lane changed **no** openclaw runtime/test code — `git diff 02bd9d77142 HEAD --stat`
is `output.md` only (+142). A fresh full suite is therefore not a meaningful completion
signal here; the identical standalone #1229 code at `02bd9d77142` was full-suite validated
by the prior session (`node scripts/test-projects.mjs`: 321 shards, 0 attributable to
#1229). The composite `739e038651b` itself built green end-to-end on the builder three
times (dist emitted, `--version` OK). The deploy blocker is infra/Path-B, not test-covered
product code.

## Exact commands

```bash
# preflight
gh api "repos/karmaterminal/openclaw/compare/f01e2fbf091...739e038651b" --jq '{status,ahead_by,behind_by}'  # ahead, behind_by:0

# deploy dispatches (all as karmafeast; Self-target guard allows <target>-dandelion-cult or karmafeast only)
gh workflow run deploy-gateway.yml --repo karmaterminal/openclaw-bootstrap -f target_prince=silas \
  -f approved_ref=739e038651b20ffda9416674f80ffe38b2d92cb8 -f approved_base=f01e2fbf09130103592c948ef7eef6b39a1e5a88 \
  -f reason=...                                   # run 31326628644 → retired-key validate fail
# + -f migrate_config=true                        # run 31327835778 → candidate doctor over-reach fail
# + -f config_stage_key=... -f config_stage_sha256=...  # run 31328932929 → Path-B import-closure fail → silas strand

# isolated doctor/validate repro on builder (READ paths only; use --lint next time, not --fix)
OPENCLAW_CONFIG_PATH=<silas cfg copy> OPENCLAW_STATE_DIR=<empty> node <artifact>/openclaw.mjs config validate

# silas repair
systemctl --user stop openclaw-gateway; systemctl --user reset-failed openclaw-gateway
#  clear both cutover journals; restore packages/*/dist + dist/ from payload-f01e2…-1784830372
node ~/flesh_beast_tmp/openclaw/dist/index.js config validate   # Config valid
systemctl --user reset-failed openclaw-gateway; systemctl --user start openclaw-gateway   # active
```

## Remaining steps (for the Path-B / deploy-lane owner)

1. Fix the Path-B candidate import-closure staging so `@openclaw/gateway-protocol`
   (`workspace:*`) resolves for the emitted `packages/gateway-client/dist/*.mjs` closure.
2. Harden the Path-B **rollback** to restore per-package dists + top-level `dist/` and
   restart the prior runtime (it currently strands the seat — hit here and by the first lane).
3. Re-dispatch silas with `config_stage_key=wo1229-compaction-migrated.json`
   (regenerate + re-stage; I removed mine) OR fix `migrate_config` to run a config-only
   migration instead of full `doctor --fix`.
4. Post-deploy: verify non-zero `packages/*/dist` + `build-info.commit == 739e038651b`,
   capture the suppression receipt + mention admission, publish to
   `karmaterminal-openclaw-docs` `PR-NNNN/PROOFS/<sha>/`, then open Emeric's PR.

## Citation traps honored

- `karmaterminal/openclaw#1229` → full URL only (bare upstream `#1229` is an unrelated
  merged PR). `openclaw/openclaw#97435` may be cited bare. `karmaterminal/openclaw#1230`
  is review-only-no-merge (review locus, never the artifact).

## Uncertainties

- The Path-B import-closure failure is deterministic/structural (two composites), but the
  precise staging fix (link `@openclaw/gateway-protocol` into the closure vs adjust the
  emitted `gateway-client` imports) is the deploy-lane owner's call.
- Whether the orchestrator wants the PR opened WITHOUT live proof: I held it and surfaced
  the fork. One command opens it if they decide otherwise.
