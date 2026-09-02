# Detached review: openclaw/openclaw#124337 surviving subset

## Verdict

`REQUEST_CHANGES_124337_SURVIVING_SUBSET`

The product implementation at
`51b91e4fef14b3f279afbae48838448d6c9f817f` has the intended lifecycle
behavior, but the candidate is not a complete surviving subset. It omits the
Microsoft Teams aged-abandonment assertion that must change with that behavior,
so one required focused sibling suite fails at the exact candidate.

Do not present or force-push this candidate. Rebuild the test commit with only
the current-context equivalent of the Microsoft Teams hunk from
`a01d78a4b33c155c948eeca283f179ef06fa7e7e`, publish a new immutable
head/tree, and repeat exact-head review.

## Blocking finding

`extensions/msteams/src/monitor-handler/message-handler.ingress-lifecycle.test.ts:170`
still asserts that a two-day-old abandoned row remains pending at and beyond
`DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS`. The candidate intentionally routes that
same event through `applyFailureDisposition`, so the row correctly becomes a
payload-retaining `retry-limit-exceeded` dead letter at the threshold. The
suite fails at the stale pending assertion around line 208:

```text
expected pending attempts: 8
received pending: []
```

This is not unrelated test churn. The original component fixed this exact
assertion in `a01d78a4b33c155c948eeca283f179ef06fa7e7e`
(`test(ingress): retarget aged MS Teams abandonment ceiling`), immediately
after source commit `401dc7a1f5c3445b4ff85de6ac0574f91da2fde9`.
The current PR body also says the Microsoft Teams sibling was retargeted, but
the candidate does not contain that path.

Do not cherry-pick all of `a01d78a4...`: it also carries Feishu/Mattermost
comment changes plus `output.md` and `proof-handoff.json`. Port only the
Microsoft Teams behavioral assertion. Applying that one source path to an
isolated clone of `51b91e4...` makes all four Microsoft Teams lifecycle tests
pass.

## Exact identity and topology

| Surface                          | Exact value                                  | Result                           |
| -------------------------------- | -------------------------------------------- | -------------------------------- |
| Frozen upstream base             | `40a01c9744c29b4232eb9e86b64e67b2db1a3bcd`   | Verified                         |
| Frozen base tree                 | `e1834d3dadd6d7a7f756d6024bbec54bca09a823`   | Verified                         |
| Candidate first commit           | `0ea927a9a3f5170ded32e278d27af9b9caae03e4`   | Parent is frozen base            |
| Candidate first tree             | `44d81daa80dff9922950e654ec15ddbcc5d2a52f`   | Verified                         |
| Candidate head                   | `51b91e4fef14b3f279afbae48838448d6c9f817f`   | Parent is `0ea927a9...`          |
| Candidate tree                   | `9f9e3236b03a1736c0012c62a2b6cdde40e31ae0`   | Verified                         |
| Candidate branch                 | `codeagent/124337-surviving-subset-20260902` | Server ref equals candidate      |
| Original PR head                 | `eee69b3d51c68c76c25c376451c161497e614a2b`   | Live PR and server ref unchanged |
| Original PR tree                 | `857b7f8938581a1d23abdc908242e3bef113a128`   | Verified                         |
| Source fix                       | `401dc7a1f5c3445b4ff85de6ac0574f91da2fde9`   | Verified                         |
| Source cancel compat             | `70d47bec1f93c5f4c7e07eebb84ef9548a480751`   | Verified                         |
| Authoritative attempt accounting | `4151625001a8b83c3a45ace7fcb62e2208c7dbf0`   | Ancestor of frozen base          |

The candidate is exactly two commits ahead and zero behind the frozen base.
GitHub compare reports the same merge base and seven changed paths.

Both candidate commits have:

- author `karmafeast <886771+karmafeast@users.noreply.github.com>`;
- committer `karmafeast <886771+karmafeast@users.noreply.github.com>`;
- GitHub author and committer login `karmafeast`;
- exact trailer
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

The commits are unsigned; signature verification was not part of the requested
identity contract.

## Byte walk and extraction classification

The original head is a merge commit with parents
`d81272c117ef7a2ac765450d682309a941d58463` and
`6ae89b5a8ed6a1bdbd0d9b7639fc8162afbb7578`. Against that upstream parent it
changes 11 files: three channel sibling tests, five shared drain files, one
abandonment regression file, and two Plugin SDK files.

The candidate changes only:

1. `src/channels/message/ingress-drain-lifecycle.test.ts`
2. `src/channels/message/ingress-drain-lifecycle.ts`
3. `src/channels/message/ingress-drain.abandonment.test.ts`
4. `src/channels/message/ingress-drain.cancellation.test.ts`
5. `src/channels/message/ingress-drain.test.ts`
6. `src/channels/message/ingress-drain.ts`
7. `src/plugin-sdk/channel-ingress-runtime.ts`

Source commit `401dc7a1...` introduced bounded abandonment together with its own
attempt-accounting edits. The candidate ports the bounded-disposition semantic
but correctly does not reimplement attempt counting: frozen base
`40a01c9...` already contains `4151625...` from
openclaw/openclaw#130077, where ordinary abandonment increments attempts.

Source commit `70d47bec...` added mixed modern/legacy cancellation
compatibility, `onCancelled` reply binding, and associated tests while also
deleting proof artifacts. The candidate ports the runtime semantics and
targeted tests, preserves the frozen base's newer deferred-heartbeat and
identifier-authentication work, and carries none of those proof artifacts.

The full original-history walk exposes the blocker: `a01d78a4...` is the
behavior-coupled sibling-test follow-up between `401dc7a1...` and
`70d47bec...`. The candidate drops its required Microsoft Teams assertion along
with its unrelated/proof paths. That omission makes the surviving subset
incomplete.

## Lifecycle challenge

### Genuine abandonment

`src/channels/message/ingress-drain.ts:397` sends a genuine
`onAbandoned` call to `applyFailureDisposition` when no cancel-compat context
is active. `settleUnadopted` accepts only dispatching/deferred states, rejects
guillotined or superseded states, and delegates to the canonical
`createIngressSettleOwner`.

`src/channels/message/ingress-drain.abandonment.test.ts:18` invokes
`onAbandoned` twice concurrently on each pass. The candidate makes one release
on attempts 1 and 2, one dead-letter write at attempt 3, no pending row after
the threshold, and exactly one `queue.fail` call. This proves no double
disposition for the challenged race.

### Modern cancellation

The modern callback remains a release with `{ recordAttempt: false }`.
The pre-existing cancellation regression passes unchanged and preserves prior
attempt count, timestamp, and error across three cancel cycles before a later
genuine failure uses the remaining budget.

### Legacy fan-in cancellation

`src/plugin-sdk/channel-ingress-runtime.ts:171` calls `onCancelled` whenever
the source supports it. Only a legacy source's fallback `onAbandoned` call is
wrapped by `runIngressCancelCompat`; ordinary `abandonAll` is not wrapped.
`AsyncLocalStorage` scopes the compatibility fact to that asynchronous
fallback call.

At `src/channels/message/ingress-queue.ts:1295`,
`recordAttempt: false` omits every attempt/error update. It clears claim
ownership and updates only row status/time, so cancellation can neither
consume nor reset the prior retry facts. The queue's existing preservation
test confirms that attempts, last-attempt time, and last error remain intact.

### Reply lifecycle binding

`bindIngressLifecycleToReplyOptions` forwards `onCancelled` only inside
`turnAdoptionLifecycle`, alongside adopt/defer/heartbeat/abandon/abort. It does
not forward drain-only `onFailed` or `onAdoptionFinalizing`. The candidate's
binding test exercises the callback and confirms the outer reply-options shape
has no extra owner methods.

The canonical reply queue still owns adoption versus abandonment; this patch
does not broaden its terminal callback rules. The new property lets channel
debounce/fan-in code retain the stronger cancellation callback when it carries
the bound reply lifecycle.

### Settlement and pending-state safety

`createIngressSettleOwner` serializes concurrent terminal callbacks, marks
settled only after the durable write commits, and removes active/lane state
exactly once. Failed durable writes intentionally retain claim ownership
rather than falsely settling and replaying side effects. Successful
abandonment and cancellation paths clear the claim; threshold abandonment
moves the row from pending to failed. No new normal-path pending-state leak was
found.

**Best-fix judgment:** the runtime change is the best bounded owner-layer fix.
Channel-local retry rules would duplicate policy; treating all abandonment as
cancellation preserves the poison-head defect; charging legacy cancel breaks
the shipped Plugin SDK compatibility path. The candidate still cannot be
accepted until its behavior-owning Microsoft Teams test agrees with that fix.

## Negative and positive reproduction

Candidate regression files were overlaid unchanged onto frozen base
`40a01c9...`:

| Reproduction                     | Frozen base                                                  | Exact candidate                                    |
| -------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| Abandonment after three attempts | Fails: row remains pending at attempts `3`                   | Passes: one dead letter, no pending row            |
| Mixed legacy cancellation budget | Fails: legacy row becomes attempts `1` with `turn-abandoned` | Passes: modern and legacy rows remain attempts `0` |
| Missing `onCancelled` binding    | Fails: property absent                                       | Passes: callback present and invoked               |

The candidate positive command passed all four selected tests across the unit
and channel shards.

## Validation

Environment: Node `v24.20.0`, pnpm `12.1.0`, frozen lockfile install.

| Surface                                           | Exact result                                    |
| ------------------------------------------------- | ----------------------------------------------- |
| Shared drain, cancellation, lifecycle, monitor    | 85 tests passed                                 |
| Plugin SDK ingress runtime                        | 8 tests passed                                  |
| Discord fan-in/cancellation sibling               | 23 tests passed                                 |
| Feishu ingress sibling                            | 10 tests passed                                 |
| Mattermost ingress sibling                        | 42 tests passed                                 |
| Microsoft Teams ingress sibling                   | 3 passed, 1 failed at stale threshold assertion |
| Microsoft Teams with only `a01d78a4...` path hunk | 4 tests passed                                  |
| Node 24 production typecheck (`pnpm tsgo:prod`)   | Passed                                          |
| Node 24 build (`pnpm build`)                      | Passed; no ineffective dynamic-import warning   |
| Node 24 full check (`pnpm check`)                 | Passed                                          |
| Knip (`pnpm deadcode:knip`)                       | Passed                                          |
| Barnacle + labeler safety                         | 49 tests passed                                 |
| Scoped Autoreview against exact frozen base       | Clean, no accepted/actionable diff finding      |

Autoreview was correctly scoped to the seven-path diff and found no defect in
those bytes. It did not inspect the omitted Microsoft Teams sibling. The
broader required suite and original-history walk are therefore the decisive
evidence for this request-changes verdict.

## Scope and mergeability

- Candidate merge base is exactly `40a01c9...`; it is directly based on the
  frozen upstream.
- A conflict-free merge tree was produced against the fetched current
  `upstream/main`.
- Candidate diff contains no `src/skills/**`, continuation, `#121204`,
  deployment, composite, proof, presentation, or unrelated path/text.
- Candidate does not duplicate or replace the attempt-counting implementation
  from openclaw/openclaw#130077.
- No GitHub Actions run is attached to the candidate branch/head. Existing PR
  checks belong to the untouched original head and cannot be credited.
- The original PR remains open at
  `eee69b3d51c68c76c25c376451c161497e614a2b`; this review did not update it.

## Presentation-plan assessment

The proposed sequencing is safe only after a corrected candidate is accepted:

1. **Savegame:** already satisfiable. Server branch
   `savegame/20260829-2350Z/pr-124337-pre-43a7-absorb` points exactly to the
   current original head `eee69b3d...`. Reverify immediately before any later
   presentation action.
2. **Lease:** use
   `--force-with-lease=refs/heads/codeagent/ward-1255-m1-intervention:eee69b3d51c68c76c25c376451c161497e614a2b`;
   never use a lease inferred from a stale local tracking ref. Execute only
   after the new candidate receives acceptance.
3. **Body:** replace stale historical source/proof claims with a narrow body
   anchored to the corrected candidate base/head/tree, bounded disposition,
   budget-free cancellation, reply binding, and exact validation. The current
   body claims the Microsoft Teams retarget that this candidate omits.
4. **CI:** require the complete relevant check rollup to attach to the exact
   post-presentation head. Do not credit checks from `eee69b3d...`, the current
   `51b91e4...`, a merge ref for another head, or prior proof/composite refs.

No merge, PR-head update, deploy, composite, proof, or presentation action was
performed.
