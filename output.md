# Corrected detached review: openclaw/openclaw#121204 surviving subset

## Verdict

`REQUEST_CHANGES_121204_SURVIVING_SUBSET_818ABEC1`

The two-commit additive repair at `818abec1be83da037d19b6d1fe972bf058becba0`
resolves all three correctness defects recorded in the prior detached review
`89b08a7b4a75bd3f28fbed6ccfddba8835c054a6`. The repaired candidate obtains
Discord channel facts from authoritative gateway inventory, retains every ordinary
reply, and requires positively resolved allowed-channel membership before disposing
configured-guild backlog. Unknown or malformed work continues to fail open to the
canonical claim-time path. There is no remaining candidate correctness defect or
scope-reduction request.

The requested terminal invariant is nevertheless false: immediately before report
publication, both `gh pr view` and the GitHub REST API reported the original PR head
as `818abec1be83da037d19b6d1fe972bf058becba0`, not
`4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`. The review did not move that branch.
Because the task requires the original PR head to remain at `4435e132`, the final
verdict must remain request-changes until the lock owner restores that presenting
branch without altering the reviewed candidate.

## Frozen identity and additive provenance

- Repaired candidate: `818abec1be83da037d19b6d1fe972bf058becba0`
- Repaired tree: `77c8422bb4ed223e2d7968f6bf2335b122bb9206`
- Prior candidate: `a1be254a3f0d2659b30abb2402636d4bd99e001f`
- Frozen base: `b057266d78d0c6a829029484b0006acc121127f9`
- Prior review report: `89b08a7b4a75bd3f28fbed6ccfddba8835c054a6`
- Pinned current-upstream audit byte:
  `450cc016dd92c09035afadb1eaefd3fc7be70f4a`
- The repair is exactly two commits after the prior candidate:
  1. `a3666768ee5e084b43974a98c293c86af6a62e4e`
  2. `818abec1be83da037d19b6d1fe972bf058becba0`
- Both repair commits are authored and committed by
  `emeric-dandelion-cult <287618920+emeric-dandelion-cult@users.noreply.github.com>`.
- Both repair commits contain
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- The safe candidate branch resolves to the repaired candidate:
  `karmaterminal/openclaw:reauthor/121204-surviving-detached-review` ->
  `818abec1be83da037d19b6d1fe972bf058becba0`.
- Immutable tag `savegame/121204-three-defects-818abec1be8` resolves to
  `818abec1be83da037d19b6d1fe972bf058becba0`.
- The original PR remains open, but its externally moved head is
  `818abec1be83da037d19b6d1fe972bf058becba0` on
  `karmaterminal/openclaw:codeagent/wo1229-upstream-pr`.
- GitHub reported the PR update time as `2026-09-02T16:31:23Z`.
- This detached review made no PR-head or candidate-branch update.

## Terminal blocker

**Correctness defects:** none in `a1be254a..818abec1`.

**Scope-reduction requests:** none.

**Presentation-state blocker:** openclaw/openclaw#121204 no longer has the required
original head `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`.

**Smallest repair:** the branch owner or zookeeper lock holder restores only
`karmaterminal/openclaw:codeagent/wo1229-upstream-pr` to `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`.
No candidate, continuation, composite, proof, deployment, or presentation changes
are needed.

## Additive repair scope

The repair-only range `a1be254a..818abec1` changes seven Discord-owned files,
`+477/-64`:

| File                                                                | Role                                                                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `extensions/discord/src/internal/client.ts`                         | Maintains synchronous authoritative gateway channel inventory before listener dispatch |
| `extensions/discord/src/internal/gateway-channel-inventory.test.ts` | Exercises real gateway envelopes and inventory-before-listener ordering                |
| `extensions/discord/src/internal/listeners.ts`                      | Restores canonical `APIMessage` typing and removes the synthetic message shape         |
| `extensions/discord/src/monitor/ingress-stale-policy.ts`            | Retains ordinary replies and requires positive configured-channel resolution           |
| `extensions/discord/src/monitor/ingress.ts`                         | Persists channel kind/name facts resolved from the client inventory                    |
| `extensions/discord/src/monitor/ingress.test.ts`                    | Covers the repaired policy and persistence matrix                                      |
| `extensions/discord/src/monitor/message-handler.queue.test.ts`      | Supplies the concrete inventory method on the queue test client                        |

No shared generic ingress-hook production byte changed after the accepted prior
candidate. The additive range contains no core framework expansion, methodology
work, or unrelated feature.

Obsolete production paths are removed rather than hidden:

- no `MESSAGE_CREATE.channel_type` extension;
- no production read of `rawMessage.channel_type`;
- no production read of a synthetic `rawMessage.channel`;
- no cached raw-channel helper retained for stale policy.

## Resolution of the three prior findings

### 1. Authoritative gateway channel facts

The Discord client now records the minimum facts needed by durable ingress:
`type`, optional `name`, optional `parentId`, and optional `guildId`.

`Client.dispatchGatewayEvent` updates the inventory synchronously before listeners
run or are queued. Consequently, a preceding `GUILD_CREATE` snapshot is visible
when the following `MESSAGE_CREATE` reaches durable admission. READY resets the
inventory; guild deletion removes guild-owned entries; channel and thread
create/update/delete events maintain individual entries.

The real-envelope regression test drives `GatewayPlugin.handleDispatch` through
`GUILD_CREATE` and `MESSAGE_CREATE`, verifies the message has no synthetic
`channel_type`, and observes the authoritative `{ guildId, name, type }` inventory
entry from the listener. A separate ingress test proves the resolved gateway type
is persisted as durable `channelKind`.

The inventory stores facts needed for kind persistence, configured channel-name
resolution, parent lookup, and guild cleanup. It stores no message content or
broader gateway state. Missing lifecycle facts, unsupported events, and absent
parent-category names conservatively leave identity unresolved and therefore
retain the row rather than causing message loss.

### 2. Ordinary reply retention

The stale policy now treats every ordinary Discord reply as solicited work before
considering backlog disposal. Retention no longer depends on whether the referenced
message has already been hydrated or whether its author is known to be a non-bot.
Malformed and non-default references remain ambiguous and fail open.

The repaired matrix covers both unresolved and fully hydrated ordinary replies.
Bot replies remain retained through the same conservative rule.

### 3. Positive configured-channel membership

When a guild has configured channels, stale disposition is permitted only when
resolution positively returns `channelConfig.allowed === true`. Missing inventory,
unknown channel facts, unmatched names, unresolved parent membership, and malformed
payloads remain ambiguous and are retained.

The repaired tests distinguish a positively allowed configured channel from
unresolved configured membership and verify only the former can be disposed.

## Preserved generic-hook invariants

The accepted generic pre-claim hook and its consumers are byte-identical to the
prior candidate.

- Discord stale ambient backlog is evaluated before canonical claim.
- Successful disposition uses the durable queue `fail(id, ...)` compare-and-set
  with reason `stale-ambient-backlog`.
- A lost disposition CAS cannot fail another lane's row. The row is retained and
  its lane is blocked for that drain pass so same-lane work cannot overtake the
  winning claimant.
- Failed disposition survives restart and replay in durable failed state.
- Channels that do not opt into `resolvePendingDisposition` retain their existing
  behavior; Discord policy does not leak to other channels.
- Current work, DMs, explicit mentions, configured mentions, threads, bound
  threads, replies, command-like messages, and ambiguous work remain claimable.
- Malformed mention data and corrupt payloads cannot throw in pre-claim policy.
  They fall through to canonical claim-time validation, fail as `invalid-event`,
  and do not stall unrelated lanes.

The shared hook remains necessary at the drain ownership boundary: that boundary
alone can combine fail-only durable CAS with same-pass lane fencing. Moving it into
Discord admission would either dispose too early or lose the queue race guarantee.
Its type remains narrow and opt-in; the repair adds no new generic behavior.

## Matrix and gate results

All commands used Node `v24.17.0`.

- The exact original 26 behavioral addressability/stale-policy cases passed using
  an inventory-backed fixture adapter. The two intentionally excluded structured
  debug-receipt presentation assertions were not part of the 26-case result.
- Repaired committed owner suites passed 52/52 tests across gateway inventory,
  Discord client/ingress, and generic pending disposition.
- Real gateway-envelope inventory ordering passed.
- Durable kind, restart, malformed payload, corrupt claim-time validation,
  disposition CAS, lane fencing, fully hydrated reply, bound thread, unknown
  inventory, configured mention, and positive/unresolved configured-membership
  cases passed.
- Production and test TypeScript checks passed:
  `pnpm tsgo:prod` and `pnpm tsgo:test`.
- `pnpm build` passed with no ineffective dynamic-import warning.
- Full `pnpm check` passed.
- Knip production scan passed: `pnpm deadcode:knip`.
- Barnacle/labeler safety passed: 47/47 Barnacle tests; labeler YAML parsed with
  170 labels and is untouched.
- Repair-only scoped Autoreview reported no accepted/actionable finding through P2
  and assessed the patch correct at confidence `0.91`.

The gateway inventory split is behaviorally meaningful rather than line-budget
theater: it exercises the real gateway-to-client ordering that caused the original
production defect, while the ingress suite separately verifies durable
serialization and stale-policy outcomes. Additional direct tests for every
inventory lifecycle event could improve local fault isolation, but absent facts
fail open and this is not a correctness blocker.

## Pinned upstream compatibility

The one requested read-only audit used exact upstream byte
`450cc016dd92c09035afadb1eaefd3fc7be70f4a`.

- Zero exact changed-path intersection.
- Zero relevant rename intersection.
- Clean merge tree:
  `af4c147910b30550fffc8ffc28f1a85d8385b545`.
- No later upstream semantic at that pinned byte supersedes the surviving durable
  channel-kind, generic pre-claim disposition, or Discord stale-ambient behavior.

No newer upstream byte was fetched or chased.

## Exclusion check

The repaired additive range contains no `src/skills/**`, FIFO/freshness/window
logic, openclaw/openclaw#124337 abandonment/cancellation behavior, continuation,
composite, proof, deployment, report, or presentation content. This review did not
modify the repaired candidate branch, original PR branch, PR-presenting branch,
#124337, continuation, composite, proof, deployment, presentation, or original PR
head. The original PR-head movement recorded above occurred externally.
