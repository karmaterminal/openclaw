# Independent hostile review of final return-covenant driver `154b225d`

## Verdict

`REQUEST_CHANGES`

---

# Additive terminal review of successor `ca05127a`

This section records the independent hostile re-review of exact successor
`ca05127afb6e125201ff4e8e940a7355fc731a2d`. It preserves the original
`154b225d` report retained below as the rejected-boundary record and supersedes
that earlier verdict only for the exact successor reviewed here.

## Successor conclusion

The exact successor satisfies the `CONFIRMED_PRODUCT_COVENANT_DRIVER`
acceptance standard.

Exact successor `ca05127a` closes all three original P0 proof defects through
the real product-owned boundaries:

1. every phase is admitted by the authenticated current real Gateway
   generation, with stale, stopped, replaced, and restart-generation controls;
2. every case/form activates and uses its assigned retained or reopened
   canonical migrated SQLite store;
3. every unpredictable marker is part of the exact queued result and is
   observed as exactly one accepted adoption or zero forbidden adoption, with
   drop, duplicate, and cross-case leak rejection.

The exact accepted-harness receipt is bound to this successor and its tree,
reports 24/24 observations and phase chains, three real Gateway generations,
canonical live/final stores, zero retained resources, and k6 exit 0. No credit
was inherited from `6041df38`.

This review remains bound to openclaw/openclaw#129388. It authorizes this exact
product byte to proceed to fresh Mode-B only after the separately reviewed
bootstrap routing cure is accepted. This lane did not dispatch Mode-B and did
not alter product, harness, docs, presentation, proof-corpus, or fleet bytes.

## Exact reference contract

All evidence below was credited only after resolving the applicable named refs.

| Category                 | Named ref                                                           | Full SHA / tree                                                                                                                                | Local / tracking / server                                                             |
| ------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Product/base             | accepted bounded parent                                             | `75c2e64c0b30f63010922b747093f855319cf919`                                                                                                     | exact local object; ancestor of candidate                                             |
| Original rejected review | safe review report anchor                                           | `a2065e1f746372f558da9f54ceaee16eefa501ad`                                                                                                     | local / tracking / origin server exact before this additive report                    |
| Product candidate        | `codeagent/129388-product-covenant-driver-on-75c2e64c-20260831`     | `ca05127afb6e125201ff4e8e940a7355fc731a2d`; tree `eb55e56113e91a8fca4a06bb8c6334996ae0e908`; parent `08b3d3b34f7ef3480ef457b97fe6fe2fa389aef4` | detached local review and exact normal checkout; origin server exact                  |
| Product savegame         | `savegame/129388-product-covenant-driver-ca05127a-20260901T045425Z` | `ca05127afb6e125201ff4e8e940a7355fc731a2d`                                                                                                     | origin server exact                                                                   |
| CI/workflow              | bootstrap routing successor                                         | `2a86caa5102b44a92356886cdc4db65bd637632b`                                                                                                     | separately under repair/review; Mode-B not dispatched                                 |
| Gate routing             | reviewed bootstrap gate implementation                              | `0a360664cf8bca8d2cc5250f7b1ee124fd00287e`                                                                                                     | exact local object                                                                    |
| Barnacle source          | product automation source                                           | `494f86248e70c46d28d3f1e0e3273450458f9c26`; tree `681be87ae191d4d6b1902b2358568fa0fae57e2c`                                                    | live GitHub commit API exact; immutable receipt records exact workflow/script blobs   |
| Presentation             | protected PR head                                                   | `00c7f721a55554d0b9228337cc8bc6bec88f9e9f`                                                                                                     | upstream `refs/pull/129388/head` exact and unchanged                                  |
| Docs/proof               | accepted harness                                                    | `5384acb5a137fdcfe30f1742bdc6af86ef8899d1`                                                                                                     | exact receipt binding                                                                 |
| GitNexus index           | N/A                                                                 | installed `karmaterminal/GitNexus` fork `3c1e686edfc1acaac882927cada121ddd7c47bcc`, CLI `1.6.5`; no exact candidate index                      | direct source, call-site, test, and receipt evidence used; stock GitNexus not invoked |

The candidate is an additive descendant of both `154b225d` and accepted parent
`75c2e64c`. Candidate branch and savegame resolved to the same exact server
byte. The protected presentation remained unchanged throughout the review.

## Receipt integrity and exact harness result

The supplied directory
`files/exact-ca05127a-receipts/` contains 14 evidence files plus
`SHA256SUMS`. Its manifest retained absolute producer paths under `/tmp`, so a
literal `sha256sum -c` could not resolve those expired producer locations.
Without rewriting the manifest or any evidence, this review resolved each
recorded basename in the supplied immutable directory and matched all 14
recorded SHA-256 digests.

The candidate-bound attestation and receipts establish:

| Evidence                  | Exact result                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Candidate                 | `ca05127afb6e125201ff4e8e940a7355fc731a2d`                                                                          |
| Product tree              | `eb55e56113e91a8fca4a06bb8c6334996ae0e908`                                                                          |
| Runtime build             | `ca05127afb6e125201ff4e8e940a7355fc731a2d`                                                                          |
| Accepted harness          | `5384acb5a137fdcfe30f1742bdc6af86ef8899d1`                                                                          |
| Runtime artifact manifest | `80a7d8bac2fe874fb359f15ad9112650f62ecfffc14e23203c0fed6bdd5be033`                                                  |
| Tracked command digest    | `f05803047bd479e18390b9240b10399287f395e5cc0a34f35131a516c1188f14`                                                  |
| Matrix                    | 12 cases, two forms each, 24 expected and 24 observed                                                               |
| Phase chains              | 24/24 valid                                                                                                         |
| Profiles                  | `fresh-v19`, `covenant-v18-upgrade`, `participant-v18-upgrade`, and `idempotent-v19-reopen`, six executions each    |
| Gateway lifecycle         | three distinct real Gateway generations with distinct start fingerprints                                            |
| Durable stores            | canonical live and final SQLite observations stable and candidate-bound                                             |
| Cleanup                   | every case handle closed; zero delegates, queue items, temporary sessions, Gateways, and fixture processes retained |
| Process/artifact cleanup  | process group empty; runtime artifact and run root removed                                                          |
| Exit                      | driver 0; k6 0                                                                                                      |

The launcher receipt also binds the runtime, dependency, and build mounts as
read-only and records expected `EROFS` mutation-probe failures. The candidate
snapshot still matched after execution.

## Closure of the three original P0 findings

### 1. Real Gateway causality

The driver no longer invokes `ReturnCovenantFixtureRun.handle` directly.
`driver.ts:352-360` waits for `gateway.invokePhase(...)` before signing a
successful phase result. `gateway.ts:150-341` uses authenticated Gateway
WebSocket RPC, requires the fixture method and admin scope, disables stored
device fallback, validates the hello boot ID and response binding, and rejects
a stopped or replaced managed generation.

The run is created and owned inside the real Gateway process at
`gateway-rpc.ts:84-146`. Before every operation, that owner verifies that the
service remains active and that the request targets its exact endpoint, PID,
boot ID, and process-start fingerprint. The private process-local attachment in
`server-extra-handlers.ts` is the narrowest correct seam: it preserves the real
Gateway composition owner without expanding public protocol/config surface,
copying continuation owners, or restoring the rejected direct-call path.

The real-Gateway boundary test at
`src/gateway/return-covenant-fixture.gateway.test.ts` proves:

- authenticated prepare through cleanup;
- bad-token and unauthenticated HTTP rejection;
- stale expected-generation rejection;
- stopped-endpoint rejection;
- snapshot after held-result acceptance;
- replacement initialization from that snapshot;
- rejection of the original binding at the live replacement;
- rejection of the stopped original endpoint;
- release and durable observation only through the replacement generation.

The accepted harness then extends that owner proof across the full 24-execution
matrix and three separate child-process Gateway generations.

An independent reviewer initially questioned the lack of an in-flight
`beginClose` phase injection. Direct reinspection established that admission is
shared by ping and phase, restart is serialized as snapshot, stop, spawn, and
initialize, and no supported concurrent replacement path can execute a
forbidden phase or mint a signed success. The reviewer revised this P0 to pass;
the suggested in-flight test is defense-in-depth, not missing closure evidence.

### 2. Canonical migrated-store ownership

`database.ts:301-318` builds a closed `(caseId, form)` assignment map with one
physical database bundle per execution. `database.ts:354-395` selects that
exact assignment, closes cached handles, atomically moves the prepared bundle
to the canonical `proof` database path, records its active execution key,
reopens it, and validates schema and integrity before returning a receipt.

Every case/session operation receives that canonical path. Every later phase
must match the exact case handle, case ID, form, lifecycle metadata, and active
assignment. Restart snapshots retain the active assignment; restoration at
`database.ts:606-653` requires every parked database and the exact active
canonical database to exist, reopens the active store, and revalidates it.
`run-snapshot.ts:88-129` then rereads the durable delegate flow, held queue row,
and child session from that canonical store.

The deterministic negative in `run.test.ts:533-571` locks the canonical
database immediately after profile activation. The first real prepare
operation must fail as busy/locked. The rejected design, which executed against
an unrelated fresh or parked store, would incorrectly succeed. The full matrix
then executes all four profile labels through the same active-owner contract,
and the accepted receipt records six executions of each profile.

The migration sibling suite covers fresh v19, v17/v18 upgrades, rollback,
unknown columns, marker disagreement, stopped-writer requirements, both
physical v18 lineages, and idempotent reopen behavior.

An independent reviewer initially requested per-case inode/hash receipts and
injected sidecar-rename rollback failures. Direct reinspection established no
reachable success-shaped false receipt in the trusted isolated launcher path:
the code checkpoints WAL with `TRUNCATE`, closes handles, preflights target
absence, renames within one state filesystem, validates the reopened canonical
database before receipt emission, and returns `ok:false` on failure. Cleanup
suppression preserves the original phase error, while launcher-owned isolated
run-root removal prevents failed-run persistence. The reviewer revised the P0
to pass and classified physical fingerprints and rename-fault injection as
non-blocking defense-in-depth.

### 3. Exact result-marker delivery and observation

`result-marker.ts:13-15` generates an unpredictable 16-byte marker. The marker
is created before result construction, embedded in the exact
`state.resultText`, and passed unchanged to
`enqueueContinuationReturnDeliveries` at `case-dispatch.ts:154-177`.
Production queue persistence stores that text; Gateway replay reads the same
durable row.

Prompt observation requires exactly one own marker for allowed paths and zero
for forbidden paths, and rejects any foreign marker. Durable observation counts
the reopened transcript plus trusted system-event occurrences, applies the
same one/zero contract, rejects foreign markers, and requires zero residual
system-event copies.

The deterministic controls at `run.test.ts:573-697` operate through the real
system-event and transcript owners:

- `drop` removes the exact real system event and must fail;
- `duplicate` appends the exact marker to the durable transcript and must fail;
- `cross-case-leak` appends another canonical marker and must fail.

The candidate-bound observer receipt records a unique marker fingerprint for
every execution. All allowed rows report exactly one adoption; all forbidden
rows report zero; all residual counts are zero. An independent marker review
found no remaining P0 or owner-boundary substitution.

## Authority, protocol, lifecycle, and cleanup

The fixed launcher owns the Gateway executable path and digest; neither the
plan nor inherited environment can select execution. Child environment is
rebuilt from the accepted launch authority plus isolated HOME, config, state,
and port values. Ambient credentials and arbitrary launcher state do not cross
the process boundary.

The accepted harness-minted token, phase key, product/tree identity, runtime
artifact identity, and isolated paths are built once, validated before use,
and remain visible in the attestation chain. No synthetic token or copied
authority bypasses the tracked launcher.

The closed protocol binds run identity, case/form, phase ordering, request
nonce, challenge, response receipt, phase-chain predecessor, Gateway
generation, runtime artifact, command digest, and driver attestation. Nonce
replay, challenge substitution, malformed requests, cross-form reuse,
pre-observation cleanup, request-supplied cleanup hashes, stale authority,
revocation, and replacement generation are rejected.

The fixture reuses production migration, validation, queue, session,
continuation, transcript-adoption, system-event, and recipient-authority owners.
It does not emulate or copy those owners. Cleanup computes its own observation
and phase-chain hashes, requires all planned observations and closed case
handles, aggregates retained-resource state, and preserves the original
operation error when best-effort cleanup also fails.

## Focused owner and sibling proof

All credited local tests ran on exact candidate `ca05127a` with Node
`v24.17.0`, the repository runner, and one worker.

| Shard / path                                                                       | Result     |
| ---------------------------------------------------------------------------------- | ---------- |
| `vitest.auto-reply.config.ts`: `return-covenant-fixture/run.test.ts`               | 7/7 pass   |
| `vitest.gateway.config.ts`: `return-covenant-fixture.gateway.test.ts`              | 2/2 pass   |
| `vitest.unit-fast.config.ts`: protocol, Gateway config, runtime config             | 7/7 pass   |
| `vitest.infra.config.ts`: `src/infra/system-events.test.ts`                        | 67/67 pass |
| `vitest.unit.config.ts`: `src/state/openclaw-agent-participants-migration.test.ts` | 18/18 pass |

The real-Gateway tests were also rerun individually in the exact built normal
checkout: authenticated current/stale/stopped controls passed, followed by the
replacement/restart/durable-reread case. A first linked-worktree combined run
timed out during cold all-plugin source startup, and its still-running cleanup
contaminated the next test process. That layout artifact was not credited.
The exact normal candidate checkout completed both owner tests in 29.48
seconds, and the routed run owner shard completed in 65.22 seconds.

## Static, build, Knip, and gate evidence

The exact normal candidate checkout used Node `v24.17.0` and pnpm `12.1.0`.
No dependency install or reconciliation ran in the linked review worktree.

| Gate                                                       | Result                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                               | pass: preflight/policy guards, max-lines, production and test typechecks, lint, format, import cycles, and related repository guards                                                                    |
| `pnpm build`                                               | pass                                                                                                                                                                                                    |
| Knip `6.32.2`, production scan                             | pass; no reported unused files or exports                                                                                                                                                               |
| Knip `6.32.2`, all-export scan                             | pass; no reported unused files or exports                                                                                                                                                               |
| Gate 2                                                     | pass: all 36 primitive-core invariants, seven exact-upstream projections, three tombstones, zero failures                                                                                               |
| Gate 2.5                                                   | pass: 1,896 semantic surfaces, 172 support surfaces, 2,516 routed tests, three scripts, zero unmapped support                                                                                           |
| Gate 2.7, frozen floor                                     | pass: upstream `9ee4987810c3268c5db92cd8eca604289ddefe99`, base/creation `8e32494fcf839181a5f02a1f0649068cd91d2b14`, 997 files, 550 `GENUINE`, 103 `MIXED-CLOBBER`, 344 `SAFE-NEW`, zero `FROZEN-STALE` |
| Barnacle                                                   | pass                                                                                                                                                                                                    |
| Supplied exact-candidate autoreview                        | scoped-clean, confidence 0.95                                                                                                                                                                           |
| Fresh exact-candidate autoreview over `154b225d..ca05127a` | scoped-clean, no accepted/actionable findings, patch correct confidence 0.96                                                                                                                            |

The credited Knip invocation used fresh lane-local stable `XDG_CACHE_HOME` and
`npm_config_store_dir` paths, proved exact version `6.32.2`, parsed scanner
output rather than process exit alone, and left a complete 1,770-file local
tool store.

The moving-upstream Gate 2.7 attempt is preserved separately in
`gate2.7-ca05127a-hung-receipt.txt` and
`gate2.7-ca05127a.log`. Its receipt classifies the attempt as
`HUNG_INFRASTRUCTURE` and invalid for closure because the upstream input moved;
the eventual log ended exit 1 with seven `FROZEN-STALE` paths against that
moving input. It was not laundered into a pass and was not used as closure
evidence. The successful frozen-floor rerun above is the only credited Gate
2.7 result.

## Scope, production delta, and presentation safety

`75c2e64c..ca05127a` changes 41 files, `+7242/-82`. Judged production delta is
`+95/-11`, net `+84`; private fixture, test, test-support, and tooling delta is
`+7147/-71`.

The positive production delta is necessary and bounded. It adds a generic
process-local Gateway extra-handler/HTTP attachment seam, threads that seam
through Gateway kernel/runtime startup, preserves the explicit startup runtime
overlay, and normalizes the durable-delivery state directory. Those changes
establish the missing real Gateway and durable-event owner boundaries. They do
not add product policy, public protocol, config, fallback, or a duplicate
execution path. A net-neutral repair could only return to direct fixture
invocation or copy production owners, both of which would recreate the rejected
proof defect.

The complete candidate scope contains zero:

- `src/skills/**`;
- bundled skill additions;
- `.github/labeler.yml` changes;
- generated reports or backups;
- unrelated docs, assets, or product files.

Barnacle found no forbidden classification. Every candidate successor commit
contains parsed `Refs: openclaw/openclaw#129388` and the required Copilot
trailer. The report lane changed only `output.md`.

## Independent best-fix judgment

Three independent hostile review lanes separately audited Gateway causality,
profile-store ownership, and result-marker truth. The marker lane passed
directly. The Gateway and profile lanes each raised a stronger
defense-in-depth test request, then revised to pass after source reinspection
found no deterministic forbidden phase, profile misbinding, false success
receipt, or surviving failed run in the exact workorder path.

The successor uses one canonical owner path at each boundary and removes the
three false-proof mechanisms identified in the original report. The accepted
receipt, focused owner tests, sibling tests, static/build scans, frozen drift
gate, and independent reviews all bind to the exact successor under judgment.

Mode-B remains intentionally undispatched. Acceptance path for this read-only
review is `focused-only`.

The terminal publication verdict appears after the preserved historical report.

The three historical P0 defects reported at `a931316a` are repaired and have
credible rejected-byte negative controls. The successor still cannot be
accepted as the product covenant driver, however, because its 24-case execution
does not pass through the real Gateway, its database-profile labels are not
bound to the stores used by the cases, and its result marker cannot observe the
result it claims to track. There is also no accepted-harness receipt bound to
this candidate. These are truthfulness defects in the proof boundary, not
missing polish.

This review is bound to openclaw/openclaw#129388. The live item is
openclaw/openclaw#129388, opened by `@karmafeast`.

## Findings

### 1. P0: covenant phases bypass the real Gateway

**Location:** `src/auto-reply/continuation/return-covenant-fixture/driver.ts:345-394`
and `src/auto-reply/continuation/return-covenant-fixture/run.test.ts:38-72`

**Violated invariant:** the accepted product composition boundary must make
each continuation, restart, recovery, and observation causally dependent on the
authenticated real Gateway generation whose endpoint, PID, and start
fingerprint appear in the receipt.

The driver starts the real Gateway at `driver.ts:350`, but the driver's own HTTP
server authorizes every phase and invokes `fixtureRun.handle(...)` directly at
`driver.ts:382`. The Gateway endpoint is never used for a covenant phase.
`ReturnCovenantFixtureRun` and its helpers independently perform the queue,
session, continuation, transcript-adoption, and cleanup operations in the
driver process.

**Deterministic negative:** the complete 24-execution matrix passes with
`TestGateway`, whose only behavior is to mint synthetic endpoint/PID/fingerprint
values and increment a restart counter (`run.test.ts:38-72`). No Gateway
process, authentication, listener, protocol path, or Gateway-owned lifecycle
transition exists in that test. Replacing or disconnecting the real Gateway
therefore cannot make the case corpus fail. This proves that the claimed
Gateway composition is not an owner-boundary dependency.

**Nearest sibling/alternate path:** `fixture-gateway.ts:31-42` does call the
production `startGatewayServer`, and `gateway.ts` owns real process lifecycle.
Those paths establish that a Gateway exists; they do not route the covenant
operation through it.

**Smallest bounded repair:** add or reuse an authenticated, product-owned
Gateway test seam for the relevant continuation flow and send all phase-driving
operations through that seam. Bind requests and observations to the current
Gateway generation. Add a boundary regression that fails when the endpoint is
stopped, replaced, or stale across restart. If this integration is intentionally
out of scope, reduce the artifact's claim to a leaf-helper composition fixture
and do not present Gateway generations as execution evidence.

### 2. P0: case database-profile receipts describe deleted, unused stores

**Location:** `src/auto-reply/continuation/return-covenant-fixture/database.ts:54-185`,
`src/auto-reply/continuation/return-covenant-fixture/database.ts:188-224`,
`src/auto-reply/continuation/return-covenant-fixture/database.ts:247-257`, and
`src/auto-reply/continuation/return-covenant-fixture/run.ts:72-84`

**Violated invariant:** a case receipt labeled with a migration/reopen profile
must execute its continuation, authority transition, observation, and cleanup
against the migrated and reopened canonical store represented by that profile.

`prepareProfile` creates and validates each profile, then disposes its database
and recursively deletes the profile root at `database.ts:182-185`.
`prepareReturnCovenantDatabaseProfiles` returns only descriptive receipt
metadata and removes the shared fixture root in its `finally` block. The run
then opens one unrelated fresh `agentId: "proof"` store at
`database.ts:247-257`; all cases use that store while attaching metadata for
one of the deleted profiles.

**Deterministic negative:** profile preparation and the complete case corpus
pass after every profile database has been deleted. A defect that occurs only
when a migrated v18 database performs the first real continuation operation
cannot affect any case result. Conversely, corrupting or replacing the fresh
`proof` store would affect all profile-labeled cases identically. The current
receipt therefore cannot distinguish fresh, migrated, participant-migrated, or
idempotent-reopen runtime behavior.

**Nearest sibling/alternate path:** the migration setup itself uses the
production schema, maintenance lease, recipient-authority migration, health
check, reopen, and disposal owners. The disconnect occurs after that valid
preflight, when the case owner selects a different store.

**Smallest bounded repair:** retain the prepared databases until their assigned
cases finish, reopen the assigned profile's canonical store for the case, and
perform cleanup only after its durable observation. Alternatively, separate
migration into an explicitly independent preflight receipt and remove
database-profile claims from case receipts. Add a regression that injects a
post-migration operational defect and demonstrates that the assigned case
fails.

### 3. P0: the result marker cannot discriminate delivery, duplication, or leak

**Location:** `src/auto-reply/continuation/return-covenant-fixture/case-setup.ts:153`,
`src/auto-reply/continuation/return-covenant-fixture/case-dispatch.ts:232-243`,
`src/auto-reply/continuation/return-covenant-fixture/case-lifecycle.ts:338-395`,
and `src/auto-reply/continuation/return-covenant-fixture/run.test.ts:282-285`

**Violated invariant:** the observation marker must be part of the exact held
result so durable scans can prove the expected one-time adoption or prove its
absence after an authority rejection.

`resultText` is created without a marker. `resultMarker` is generated later in
the acceptance receipt, but the queued delivery contains only `resultText`.
Observation detects prompt adoption with one Boolean `includes(resultText)`
test, then scans transcript and system-event state for the marker. The test
explicitly expects both marker scans to be zero for every allowed and forbidden
case.

**Deterministic negative:** drop, duplicate, or leak the delivered result text
without inserting the separately generated marker. Both marker scans remain
zero. Duplicate result text also collapses to the same
`promptAdoptions === 1` Boolean as a single result. The observation cannot
distinguish the behaviors it is intended to attest.

**Nearest sibling/alternate path:** queue acknowledgement/removal assertions
cover queue lifecycle, and prompt adoption covers presence of result text.
Neither provides a unique end-to-end delivery identity.

**Smallest bounded repair:** include the unpredictable marker in the exact
queued result before dispatch and count exact marker occurrences in the
reopened durable owners. Assert one occurrence for the accepted path and zero
for forbidden/silent paths. Add drop, duplicate, and cross-case leak negative
controls.

## Exact reference contract

All applicable identities were resolved before evidence was credited.

| Category                            | Named ref                                                       | Full SHA / tree                                                                                                                                | Local / tracking / server                                        |
| ----------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Product/base                        | accepted bounded parent                                         | `75c2e64c0b30f63010922b747093f855319cf919`                                                                                                     | exact local object; ancestor of candidate                        |
| Product candidate                   | `codeagent/129388-product-covenant-driver-on-75c2e64c-20260831` | `154b225d4cff1db59db5ec3b4e8a9b6d1f2327e9`; tree `995ef3f6e194eccf06d9628999f3da74d0641718`; parent `6041df38a16aeac612a0c846290dffd79f42e3c8` | local / origin server exact                                      |
| Safe review lane, pre-report anchor | `codeagent/129388-154b225d-product-driver-independent-review`   | `154b225d4cff1db59db5ec3b4e8a9b6d1f2327e9`                                                                                                     | local / tracking / origin server exact                           |
| CI/workflow                         | bootstrap routing successor                                     | `2a86caa5102b44a92356886cdc4db65bd637632b`; tree `25ce3d76d9f2fc317499cd009f964e5df6d88d0a`                                                    | exact local object; Mode-B not dispatched                        |
| Presentation                        | protected PR head                                               | `00c7f721a55554d0b9228337cc8bc6bec88f9e9f`                                                                                                     | exact local object / upstream `refs/pull/129388/head`; unchanged |
| Docs/proof                          | accepted harness / independent harness review                   | `5384acb5a137fdcfe30f1742bdc6af86ef8899d1` / `35798b5223f29ebc19924c1014929696c5585731`                                                        | exact objects in the named docs repository                       |
| Exact candidate receipt             | N/A                                                             | no receipt bound to `154b225d` / `995ef3f6` found                                                                                              | unavailable                                                      |
| GitNexus index                      | N/A                                                             | installed fork `karmaterminal/GitNexus` `3c1e686edfc1acaac882927cada121ddd7c47bcc`, CLI `1.6.5`; no exact candidate index                      | direct source evidence used                                      |

The candidate is additively descended from `75c2e64c`. No reviewed,
presentation, harness, bootstrap, proof-corpus, or fleet byte was changed by
this lane.

## Candidate scope and history

`75c2e64c..154b225d` changes 25 files, `+4701/-71`. Judged production behavior
delta is `+0/-0`; all changes are test, private test-support, or test tooling.
There are 21 new paths and four registration/test modifications.

The complete scope contains zero:

- `src/skills/**`;
- bundled `skills/**/SKILL.md`;
- `.github/labeler.yml`;
- generated report or backup paths;
- unrelated docs, assets, production config, or runtime source.

The review followed repairs through `a931316a`, `8607d247`, `c12abb3f`,
`6041df38`, and `154b225d`. The final launcher fixes the tracked Gateway
command and digest. It constructs the accepted harness token, phase key,
product tree, and runtime artifact authority once. The driver validates those
four fields, and the Gateway child adds only isolated HOME/config/state/port
state. No ambient environment spread or plan-selected executable remains.
Every candidate commit has parsed `Refs: openclaw/openclaw#129388` and Copilot
trailers.

## Historical P0 negative controls

The successor regression assertions were run against a disposable detached
checkout of exact rejected SHA
`a931316a3c11f8008d681731fa03a6ea06d01bf1`, with only the successor test
hunks applied and the rejected byte's compatible plan support retained.

| Invariant                            | Rejected `a931316a` negative                                                                 | Candidate `154b225d`                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Product-owned Gateway command/digest | failed because a plan-substituted executable was accepted; expected rejection, received none | protocol regression passes                                   |
| Observe before normal cleanup        | failed because cleanup before observe resolved successfully                                  | run regression passes and rejects with `observed`            |
| Product-owned cleanup evidence       | failed because request-supplied forged observation hash resolved successfully                | run regression passes; product recomputes and binds evidence |

These controls establish the repairs they target. They do not repair the
independent composition findings above.

## Protocol, authority, lifecycle, and cleanup audit

The closed protocol validates phase/path agreement, run and launch identity,
request nonce uniqueness, signed challenge/phase-chain transitions, and
attestation binding. Endpoint generations, captured authority generations, and
cross-form case handles are distinct. Cleanup rejects pre-observation attempts,
recomputes the observation set, binds the driver attestation, and aggregates
cleanup failures without replacing the first recorded failure.

The driver reuses production migration, validation, queue, delegate, session,
continuation, system-event, transcript, and recipient-authority owners at the
leaf level. It does not, however, reuse the Gateway as their composition owner;
the private fixture orchestrates them directly. Its retained-resource count
also covers active delegates, queue items, and spawned temporary sessions, not
every fixture-created session/root. This is supporting risk for Finding 1,
not a separately sufficient verdict.

Gateway readiness currently accepts any listener on the selected loopback port
(`gateway.ts:63-94`) after checking that the child has not exited. It is not a
child-originated readiness assertion bound to the spawned PID/start
fingerprint. The accepted repair should bind readiness to the actual child
while establishing the Gateway-owned phase path.

## Accepted-harness receipt audit

The accepted harness report at `5384acb5` and its independent review at
`35798b52` are exact and internally consistent, but both are bound to product
`0ed59cb64f31971e8659b417fe3fd2ba6a1730c3`, tree
`52b6141c80e575813f94241635ce02007b50d140`. Both explicitly state that the
product-driver command remained unavailable at that byte.

No tracked proof or named report was found for candidate `154b225d`, tree
`995ef3f6`. Therefore this review cannot credit an exact-candidate receipt for
the runtime artifact/command digests, three real Gateway generations, 24/24
observations and phase chains, canonical live/final stores, zero retained
resources, or k6 exit 0. Credit from `6041df38` was not inherited.

Because Findings 1-3 are deterministic source defects, the absence of the
final receipt produces `REQUEST_CHANGES`, not `BLOCKED`. A new receipt is
necessary only after the composition repairs.

## Focused and static evidence

All focused tests ran serially with Node `v24.17.0` and the repository runner:

| Proof                                                     | Result     |
| --------------------------------------------------------- | ---------- |
| `return-covenant-fixture/run.test.ts`                     | 2/2 pass   |
| `return-covenant-fixture/protocol.test.ts`                | 3/3 pass   |
| `return-covenant-fixture/gateway-config.test.ts`          | 2/2 pass   |
| `return-covenant-fixture/runtime-config.test.ts`          | 2/2 pass   |
| `src/state/openclaw-agent-participants-migration.test.ts` | 18/18 pass |

Command shape:

```text
node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.unit-fast.config.ts \
  --maxWorkers=1 <focused-path>
```

An exact-SHA normal checkout with the candidate lockfile was used for
dependency-sensitive gates; no install or reconciliation ran in the linked
worktree.

| Gate                                             | Result                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `pnpm check`                                     | pass: policy/preflight, max-lines, production/test-root types, lint, and format |
| `pnpm build`                                     | pass                                                                            |
| Knip `6.32.2`, production scan                   | pass, no reported findings                                                      |
| Knip `6.32.2`, all-export scan                   | pass, no reported findings                                                      |
| Autoreview, branch base `75c2e64c`, P0 threshold | scoped-clean; no accepted/actionable P0 finding                                 |

The credited Knip run used lane-local stable `XDG_CACHE_HOME` and
`npm_config_store_dir` paths and proved exact Knip `6.32.2`. Earlier inherited
cache links into an absent Actions runner store were discarded as
infrastructure evidence.

The linked-layout `pako` declaration error and workspace-link postbuild error
were reproduced as dependency-symlink-layout artifacts rather than candidate
regressions. The exact normal checkout passed both authoritative commands.

## Drift and Barnacle gates

Exact bootstrap successor `2a86caa` supplied the gate implementations.

- Gate 2 passed in the topology appropriate to this additive successor:
  all 36 primitive-core invariants are byte-identical from accepted parent
  `75c2e64c` to candidate `154b225d` (33 present, three tombstones, zero
  failures).
- The Gate 2 form that requires a new upstream merge parent correctly rejected
  the pinned-upstream argument: `8e32494f` is not an exact merge parent on this
  candidate's first-parent path.
- Gate 2.5's semantic inventory is structurally N/A to this successor: its
  contract requires independent PR-head and upstream histories, while
  `75c2e64c` already contains the pinned floor. It exited with
  `PR_HEAD and UPSTREAM must be independent histories`. The serial focused owner
  tests above cover the newly added test driver without falsifying topology.
- Gate 2.7 completed against pinned upstream `8e32494f`, candidate `154b225d`,
  and creation point `75c2e64c`: 983 paths, 219 `GENUINE`, 429
  `MIXED-CLOBBER`, 335 `SAFE-NEW`, and zero `FROZEN-STALE`.
- Final-delta Barnacle classification passed: all 25 paths are the private
  return-covenant driver or its direct test/tool registration; forbidden skill,
  labeler, docs/assets, generated report/backup, and unrelated-file counts are
  zero.

No baseline was raised. Mode-B and Gate 3g were not run or dispatched.
Acceptance path for this review is `focused-only`.

## Required successor evidence

Before this byte can become the product driver:

1. route covenant execution through the authenticated real Gateway generation;
2. execute profile-labeled cases against their actual migrated/reopened stores;
3. make the unique result marker part of the delivered result and add
   drop/duplicate/leak controls;
4. rerun the rejected/successor controls and focused owner/sibling tests;
5. produce an accepted-harness receipt bound to the repaired product commit and
   tree, exact runtime/command digests, all real Gateway generations and phase
   chains, canonical stores, resource cleanup, and k6 exit status;
6. obtain independent review before fresh Mode-B.

Historical verdict for exact `154b225d`: `REQUEST_CHANGES`.

---

## Terminal publication verdict for exact `ca05127a`

`CONFIRMED_PRODUCT_COVENANT_DRIVER`
