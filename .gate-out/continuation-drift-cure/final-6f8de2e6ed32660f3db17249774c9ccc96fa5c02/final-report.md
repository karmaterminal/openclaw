# Continuation drift-cure Gate 5 report

## A. Lane identity

- Seat: Ronan
- Tmux: `oc-85651-continuation-cure-20260823`
- Agent/model: GitHub Copilot CLI, GPT-5.6 Sol, max effort
- Workorder:
  `/home/figs/flesh_beast_best_beast/WORKTREES/frond-scribe-continuation-gates-workorder/dispatch-substrate/20260823/openclaw-85651-continuation-drift-cure/continuation-drift-cure-lane-workorder-v1.md`
- Workorder SHA-256:
  `babe8b9d69e26e8be65f1f2104eb00895e288cd61668c8a3681feedbcbadb69b`
- Candidate branch:
  `frond-scribe/20260823/assembly-85651-continuation-drift-cure`
- Candidate worktree:
  `/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-85651-continuation-drift-cure-candidate-20260823`
- Credentials: `ronan-dandelion-cult` for candidate/proof writes;
  `scribe-dandelion-cult` for Mode-B. `ronan-auth` was not used.

## B. Authority

- Bootstrap commit:
  `6dd6c3a7712c8ae02937a29054525b2ddacb89c1`
- Drift runbook blob:
  `e42d5eedbf52cb1d0fa307749b83c8625899c26e`
- Gate 2 walker/inventory:
  `4e86ba83621cec98573c5173d91e426f72e1d321` /
  `8e475b7a1a2bf14a0dda4640bd221fff867f4c1b`
- Gate 2.7 classifier:
  `90e4caddbe9f40248510d376bc00558ec75bcdcb`
- Mode-B workflow:
  `a66cf30c9e7a0cc44438feba884129ccc0706a47`
- Frond-scribe commit:
  `49b50571d16704c2ac6017404cecb27ee5bc8b80`
- Drift-cure/GitNexus skill blobs:
  `5adbf9ab956adf258ac72b992beda5bd42090692` /
  `cc6059aebe81a98b5226b7a1c9675a609ceeffab`
- Exact authority refs and all 12 relevant blobs are reachable and verified
  under `authority/`.
- Local pre-existing authority checkouts were stale and excluded; an exact
  detached bootstrap checkout owned every invocation.
- Fork has zero rulesets. Upstream active rulesets require non-fast-forward
  protection, `clownfish/exact-merge`, and `openclaw/ci-gate`.

## C. Immutable refs

- Presentation and live PR head:
  `c3a0e5a314ecbf572911d4b2e84595bd06f64d69`
- Savegame:
  `savegame/20260823-0902Z/pr-85651-pre-continuation-drift-cure` →
  `c3a0e5a314ecbf572911d4b2e84595bd06f64d69`
- Accepted source:
  `codeagent/continuation-current-upstream-absorb` →
  `09b553e5fc7c2b3a26954046c1d9f52c55af4b40`
- Deployed composite, context only:
  `6e6da7bba079b0fc50d134b96657cda683985837`
- Frozen upstream:
  `ab7d5c92ace7029727d9bacb537b069be9c32f03`
- Old merge base:
  `23854c39fc7d87b659d5ae1ab86a97880f2fd210`
- Final merge/final candidate:
  `6f8de2e6ed32660f3db17249774c9ccc96fa5c02`
- Final merge parents:
  `27ea47beb47de8a953366575a1bb7e7210a7096f` and
  `ab7d5c92ace7029727d9bacb537b069be9c32f03`
- Remote candidate:
  `6f8de2e6ed32660f3db17249774c9ccc96fa5c02`

## D. Geometry

| Surface | Count |
| --- | ---: |
| Accepted feature paths | 929 |
| Snapshot comparison | exact 929 |
| Frozen-upstream drift paths | 687 |
| Shared paths | 37 |
| Reviewer-visible three-dot | 1,071 |
| Tip-to-tip two-dot | 1,071 |
| Accepted absent from reviewer | 0 |
| Reviewer absent from accepted | 142 |
| Three-dot absent from two-dot | 0 |
| Two-dot absent from three-dot | 0 |

The 142 reviewer-only paths are exactly 140 evidence paths, one extracted cure
owner, and one upstream test adaptation. Full identities and path sets are in
`geometry/`.

## E. Conflict and preservation ledger

- First frozen merge: four textual conflicts, resolved by semantic union:
  client tool trust/read entitlement; async generation-fenced completion;
  unified targeted heartbeat wake; and trusted continuation routing outside the
  transcript-write owner.
- Four later frozen merges were conflict-free.
- Primary four-way audits found two integrated-contract defects:
  implicit stale completion was dereferenced as execution-start truth, and one
  continuation fixture omitted required `runLane`.
- Canonical repair: closed `stale | completed` result, lifecycle extraction to
  its existing handler owner, required `runLane`, three-cast baseline shrink,
  and behavior-neutral lifecycle E2E line cleanup.
- Final shared-genuine server-cron union retains raw heartbeat ownership and
  upstream delivery-retry fencing.
- Gate 2 manual rows: 10/10; Gate 2.5 semantic rows: 16/16; Gate 2.7 mixed rows:
  317/317. Unresolved rows: zero.

## F. Named gate receipts

- Gate 1: **PASS** — immutable remote savegame verified.
- Gate 2: **PASS** — 40/40 primitive invariants; 919 automatic broader rows;
  ten independently dispositioned manual rows.
- Gate 2.5: **PASS** — 267 test-substrate paths; 251 exact upstream; 16
  semantic; all 13 canonical owner groups green.
- Gate 2.7: **PASS** — 429 safe-new, 325 genuine, 317 mixed, zero frozen-stale;
  319 total shared/mixed dispositions.
- Gate 3: **PASS with classified infrastructure red** — exact local static and
  focused checks green; Mode-B complete with both red families baseline-proven.
- Gate 4: **PASS** — preservation cosign, Mode-B review, mandatory autoreview,
  GitNexus, and target-policy review; open P0/P1 zero.
- Gate 4.5: **PASS** — independent fork-side readiness, with presentation-shape
  and raw-artifact-retention findings disclosed.

## G. Mode-B

- Run: `32642373348`
- Product:
  `6f8de2e6ed32660f3db17249774c9ccc96fa5c02`
- Workflow:
  `6dd6c3a7712c8ae02937a29054525b2ddacb89c1`
- Ref/run `headSha`: `main` /
  `6dd6c3a7712c8ae02937a29054525b2ddacb89c1`
- Routes: 143 hosted, 18 self-hosted, two self-hosted-dist; zero unrouted.
- Receipts: 69/69 exact, 163/163 shards, no validation error or missing batch.
- Static: all five owners green.
- Aggregate: 163,370 passed, 37 initial failed, 24 flakes greened, 13
  deterministic.
- Final workflow conclusion: `failure`, retained honestly.
- Baseline classification:
  - one hosted doctor timeout; byte-identical owner/test and exact two-CPU
    candidate file pass;
  - 12 TUI startup failures from missing preinstalled `@openclaw/ai` dist output;
    package manifest/source byte-identical across source/upstream/candidate and
    correct isolated output present.
- Acceptance: complete baseline-classified broad receipt; zero candidate
  finding. The workflow is not represented as green.

## H. Reviews

- Preservation/byte walk: final independent PASS after two evidence-correction
  rounds.
- Semantic tests: 16/16 exact rows reviewed and canonical owners green.
- Gate 2.7: 317/317 mixed plus two shared-genuine rows reviewed.
- Autoreview: Codex `gpt-5.6-sol`, max effort, no P0/P1, patch-correct 0.93.
- GitNexus: exact index at candidate; 1,067 files, 5,393 symbols, 21 processes,
  `CRITICAL` breadth; no P0/P1 graph finding.
- Mode-B: independent PASS as honestly-red baseline-classified receipt.
- Target policy: intent preparation only; no presentation authority.
- Readiness: independent PASS; open P0/P1 zero.

## I. Durable journal

Verified candidate checkpoints:

| SHA | Receipt |
| --- | --- |
| `3c97e98ccb2785ef49acc2bc86f7acffc02f4a44` | Phase 0–2 evidence |
| `41be231735237cbc2d21560860e8cc6ce07638a9` | first freeze |
| `de1fce0188450e7aaa3488c40f4c300cc60f54da` | first upstream merge |
| `3330ac1c5bfc4a6ada3491251ca0568c11f5ac2c` | integrated repair/evidence |
| `7fb527865993af33068d12de8e99efbe4d87d60b` | second freeze |
| `1193406c2291a7c15eefaed37749366ffc5186b9` | second upstream merge |
| `b79eca0f0c729e8aac57d9c6e95ac3a7f7ab7986` | second gate target |
| `1159baf13615d92640acff32504016dae51b6517` | third freeze |
| `11a7532d2ed4b95f0847ccf3a8e2946bb3bc3cf5` | third upstream merge |
| `9c3a225f86d0ec21d4d10b1b69cd273298e128e3` | third gate target |
| `1f15ce92f08f9d93a72a7623b9e8f5b436ef3076` | assertion shrink |
| `27ea47beb47de8a953366575a1bb7e7210a7096f` | fourth upstream merge |
| `6f8de2e6ed32660f3db17249774c9ccc96fa5c02` | fifth merge/final candidate |

Gate 4 proof checkpoint:
`f902e51b589f88845bbb1867172b67c75e81e746` on
`evidence/20260823/pr-85651-continuation-drift-cure-6f8de2e6`.

The proof ref commits all contractual gate tables, authority, GitNexus,
aggregate 69/69 receipt, failed raw artifacts, reviews, and baseline proof.
Successful raw per-batch logs remain local and in the 14-day GitHub artifact;
the merged all-batch receipt is durable. No claimed required receipt exists
only locally.

## J. Gate 5 intent packet

Presentation remained untouched and is an ancestor of the proposed exact target
`6f8de2e6ed32660f3db17249774c9ccc96fa5c02`. A plain fast-forward is
structurally possible but not presentation-clean: it retains 140 `.gate-out/`
paths and `tmp-drop-me-claude.md`.

Later figs shape review must explicitly accept those bytes or require a new
candidate and complete reproof. Then: announce exact intent, observe one frond
tick, obtain a new explicit go, load the authorized presentation identity,
reverify, plain-fast-forward only, and verify exact equality.

`ronan-auth` was not used. No presentation push occurred.

## K. Proof-fire embargo

No deploy, runtime smoke, feature proof, or behavioral proof fired. No proof
command is authorized. Proof can be considered only after a later ceremony
makes presentation equal the accepted exact candidate. The deployed composite
was context only and never a source.

## L. Honest-nos and interventions

- Locale-mismatched geometry stopped and reran under `LC_ALL=C`.
- Stale local authority checkouts were replaced by exact remote-current
  authority.
- One oversized Discord status message returned HTTP 400; a compact receipt
  succeeded.
- A stale shared `node_modules` symlink blocked lifecycle E2E; the candidate
  received an isolated frozen install.
- Upstream moved five times; each prior candidate/gate target was invalidated
  and absorbed by another exact two-parent merge.
- Gate audits found and repaired stale completion truth, required lane
  threading, line ceilings, and shrink-only baseline debt.
- The broad Gate 2.5 umbrella reproduced inherited duplicate isolated-project
  routing; canonical once-per-owner runs passed.
- GitNexus MCP could not read the newer LadybugDB format; exact GitNexus 1.6.9
  CLI performed the required analysis, and generated AGENTS text was removed.
- Mode-B remained red for two baseline-proven infrastructure families; receipts
  are complete and the red remains visible.
- Three initial background reviewers produced no turns and were superseded by
  fresh synchronous independent reviewers.
- Independent evidence review found arithmetic, authority-path, wording, and
  continuity defects; all were corrected and independently rechecked.
- The in-agent and dispatcher watchdogs observed `active=0` and stopped cleanly
  at Gate 5; their final receipts are committed under `watchdogs/`.

**Mandatory stop:** Gate 5 packet prepared. Gate 6 and presentation movement are
not authorized.
