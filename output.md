# Independent hostile review of final return-covenant driver `154b225d`

## Verdict

`REQUEST_CHANGES`

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

`REQUEST_CHANGES`
