# Fleet standardization onto composite `8be71fe5` — deploy log

Target composite branch: `frond-build/20260809/assembly-ca5a25af-emeric-1229`

## Immutable SHAs (re-resolved live)

- **approved_ref (composite head)**: `8be71fe59c742bdcb5f797fc70ddb0178799ccd8`
- **approved_base (assembly base of composite)**: `37d0fc70e1bb682c5184c7219f80935bdfdfcb97`

### Design-fork: why base = 37d0, not the assembly branch head

- Composite `8be71fe5` parent = `37d0fc70e1b` ("Merge upstream/main into 1172 continuation assembly").
- Assembly branch head has **advanced** to `77c7bb1b` (adds `fix(transcript): unexport resolveTranscriptMediaPath`), which the composite does NOT contain.
- So the assembly HEAD is **not** an ancestor of the composite → would FAIL the release-selection gate
  (`deploy-gateway.yml` L424: `git merge-base --is-ancestor BASE_SHA TARGET_SHA`).
- `37d0fc70e1b` (composite's real assembly base) IS an ancestor of the composite; `git fetch` of the raw SHA
  from a fresh clone succeeds (GitHub reachable-SHA). distance = 1.
- Prior emeric deploy (run 31332376474) independently used the same `37d0` base — confirmation.
- Composite is 1 commit behind the assembly head (FYI for the composite owner; not touched per WO).

## Deploy mechanism (deploy-gateway.yml in karmaterminal/openclaw-bootstrap)

- Job `runs-on: [self-hosted, <seat>]` — runs on the target seat's own runner.
- Two ancestry gates: (1) release-selection base⊂ref (L424); (2) installed-baseline forward ancestry (L477),
  relaxed by `allow_non_forward_cutover=true` + reason.
- `migrate_config=true` stages candidate doctor migration, coupled to deploy rollback. Required for seats
  carrying the retired `agents.defaults.compaction.truncateAfterCompaction` key.
- Path-B (build-once-deploy-many): silas is `configured_unbuildable` (raptor-lake) → always Path-B from
  donor `elliott-legion`. Others source-first (build themselves), Path-B donor only on build failure.

## Retired-key (migrate_config) — verified live, corrects the WO

| seat    | retired key present         | migrate_config |
| ------- | --------------------------- | -------------- |
| cael    | no                          | false          |
| ronan   | no                          | false          |
| silas   | yes (L250)                  | true           |
| elliott | yes (L321)                  | true           |
| emeric  | **yes (L299)** — WO said no | true           |
| rune    | unknown (offline)           | —              |

## Runner map (org-level self-hosted)

| seat    | runner status           | note                                                      |
| ------- | ----------------------- | --------------------------------------------------------- |
| cael    | online, busy (CI)       | deploy queues                                             |
| ronan   | online, busy (CI)       | deploy queues                                             |
| silas   | 2 free (silas, lothric) | deploys immediately; but Path-B via elliott donor         |
| elliott | online, busy (CI)       | deploy queues; is silas's donor                           |
| emeric  | online, busy (CI)       | deploy queues                                             |
| rune    | **OFFLINE**             | No route to host 10.0.0.250; CANNOT deploy — hard blocker |

## Restore points (pre-standardization installed SHAs)

cael `bab9ee56696` · ronan `03939273216` · silas `f01e2fbf091` · elliott `7e0b29299b7` · emeric `55b6176d430` · rune `55b6176d430`

## Actions taken

- Terminated ronan's hung manual rebuild (PIDs 3361799/3362658/3362670, 1h12m stuck in pnpm install,
  0 dists, building the wrong/old SHA). Declared.
- Cancelled stale queued elliott run 31332367872 (unknown base/migrate params).
- Dispatched ronan (run 31333781784, migrate_config=false) and silas (run 31333912458, migrate_config=true)
  as canaries validating both config paths.

## Emeric prior-failure root cause (run 31332376474)

deploy.sh: `interrupted cutover detected` → `prior runtime artifact restore failed; runtime remains stopped`.
Stale Aug-8 cutover journals (`~/.openclaw/openclaw.json.deploy-cutover-journal` +
`~/.local/state/openclaw-deploy-recovery/journals/3f2d0569...`) trip the recovery path on every deploy.
Config bytes were restored to original; only the dist artifact restore failed (fresh build fixes it).
Fix: back up + clear stale journals + stale cutover lock, then redeploy composite (migrate_config=true).

## Status (live)

See the per-seat table at the end of the run.
