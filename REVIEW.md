# Independent review: #1415 rulings head

## Named refs

| ref              | value                                                                 | local SHA | tracking SHA | server SHA |
| ---------------- | --------------------------------------------------------------------- | --------- | ------------ | ---------- |
| product/base     | prior ruler head `ce383fa05467ba989871d3e8344fa8e837d5f4e8`           | equal     | equal        | equal      |
| fleet/base       | `ab5a30ea79b776f149e24b1fccab9e79b0a5d299`                            | equal     | equal        | equal      |
| lane/safe branch | `codeagent/1415-review3` @ `6ca8fd57210df273bd06049600ad8ccaa6628051` | equal     | equal        | equal      |
| CI/workflow      | N/A; focused-only; no Mode-B                                          | N/A       | N/A          | N/A        |
| presentation     | N/A                                                                   | N/A       | N/A          | N/A        |
| docs/proof       | this `REVIEW.md`                                                      | N/A       | N/A          | N/A        |

The ruling report and issue comment were read. The ruling candidate was
`6ca8fd57210df273bd06049600ad8ccaa6628051`; local, lane-tracking, and server
branch refs all resolve to that SHA. `src/skills/**` has no diff from the
fleet base.

## Findings

### Blocking: shed previews cross senders and quoted batches without opt-in

`src/auto-reply/reply/queue/ambient-context.ts:30-52` transfers a shed source's
text to the first pending turn in the same Gateway scope and room key. That
recipient match does not require the sender to match the recipient, and
`roomKey` intentionally omits the reply target. The same implementation adds
the sender and approved text as model-visible conversation data in
`src/auto-reply/reply/queue/ambient-context.ts:127-170`.

The drain executes this handoff in
`src/auto-reply/reply/queue/enqueue.ts:356-357`, and the summary prompt
renders the result under the surviving recipient in
`src/auto-reply/reply/queue/drain.ts:228-259`.
`src/auto-reply/reply/queue.room-shed-accounting.test.ts:163-168` explicitly
pins a no-opt-in case with shed `alice` and `bob` previews being handed to
`carol`'s turn; the candidate therefore knowingly carries two senders' text
into one turn without `ambientOwnerAggregate`, `ambientOwnerAggregatePeers`,
bot verification, or aggregate eligibility.

At the fleet base, `ab5a30ea79b776f149e24b1fccab9e79b0a5d299`,
`src/auto-reply/reply/queue/ambient-context.ts:28-70` already transferred a
single shed preview within the room key, but the ruling is strict about
cross-sender widening versus `ab5a`. Candidate behavior expands the preview set
and its sender attribution: `drop:summarize` can carry previews for at least
the newest cap in a turn whose sender remains the recipient. This is prompt
content, not background-only accounting: `attachAmbientOverflowContext`
appends it with `kind: "conversation-data"` and the text is delivered to the
model.

This is **blocking**. Ruling 1 requires that cross-sender aggregation happen
only behind the explicit opt-in and verified peer allowlist. It also forbids
ambiguous or weak sender provenance. The shed transfer should accept only
recipients that share the configured aggregate batch/delivery key, or retain
only counts with no sender/text content outside that batch.

### Ruling 2 verdict: pass

`src/auto-reply/reply/queue/listed-account.ts:26-55` protects a room event only
when account provenance is true, the channel is Discord/Slack/Telegram, and the
sender matches `ownerQueueProtectionAccounts`. It does not derive
protection from `senderIsOwner`, `commands.ownerAllowFrom`, operator profiles,
or bot status. `isSenderInOwnerAllowFromList` at
`src/auto-reply/command-auth.ts:584-598` only matches the explicitly supplied
list.

The prior-head overflow implementation is where the implicit principal
exception lived: `ce383fa05467ba989871d3e8344fa8e837d5f4e8`
`src/auto-reply/reply/queue/enqueue.ts` held principal account lines outside
the general protection list. The candidate removes that exception and marks
only listed room events protected in `src/auto-reply/reply/queue/enqueue.ts:122`
and `:315-346`.

The test file `src/auto-reply/reply/queue.room-owner-overflow.test.ts` is
ab5a's file with only added lines; `git diff
ab5a30ea79b776f149e24b1fccab9e79b0a5d299..6ca8fd57210df273bd06049600ad8ccaa6628051
-- src/auto-reply/reply/queue.room-owner-overflow.test.ts` contains no
removed lines.

### Ruling 3 verdict: pass

Protection and precedence are read from the same
`isListedAccountRoomEvent` predicate:

- collect: `src/auto-reply/reply/queue/envelope.ts:296-310`
- followup and steer queue admission:
  `src/auto-reply/reply/queue/enqueue.ts:122-123`,
  `:308-346`
- dispatch reservation:
  `src/auto-reply/reply/reply-source-binding.ts:75-99`
- mailbox head:
  `src/sessions/session-controller.room-precedence.ts:23-49`

Host-generated/internal turns return no room precedence and are not promoted.
The listed-account predicate requires `room_event` plus channel verification
and an explicit list entry, so command-owner status does not confer precedence
or protection. The candidate's tests cover collect/followup/steer and
listed/unlisted, verified/unverified controls.

## Ruling 1 related path checks

- `src/auto-reply/reply/queue/delivery-context.ts:179-209`: aggregation is
  gated on opt-in, bot status, peer allowlist match, no ambient authority
  grants, and audited plugin surface. Humans and unreported bots do not fold.
- `src/auto-reply/reply/queue/delivery-context.ts:247-257`: aggregate batch key
  exists only for eligible room aggregate sources.
- `src/auto-reply/reply/queue/envelope.ts:266-278`: quote routing is removed
  for aggregate context, while the collect/key logic otherwise retains source
  routing.
- `src/auto-reply/reply/queue/drain.ts:228-259`: mixed sender claims become
  cross-sender aggregate turns only when
  `isRoomAggregateBatch(sources)` is true.
- `src/auto-reply/reply/queue/ambient-context.ts:30-52`: the found blocking
  shed-preview exception does not perform this aggregate eligibility check.

At `ab5a30ea79b776f149e24b1fccab9e79b0a5d299`,
`src/auto-reply/reply/queue/delivery-context.ts:179-203` used
`ambientOwnerAggregate` plus a peer allowlist, and the old aggregate source
allowed only owner facts under that gate
(`delivery-context.ts:213-241`). The candidate narrows the fold to listed bots
with no sender authority lift. It does not widen the batch key without opt-in,
except through the separately identified shed-preview path.

## Proof status

The independent structured review helper ran against the exact branch against
`ab5a30ea79b776f149e24b1fccab9e79b0a5d299` and returned one P1 accepted finding.
Revert-proof commands were attempted for one ruling-1 claim and one rulings
2/3 claim, but neither reached a Vitest summary:
`@openclaw/fs-safe/file-lock` in the lane dependency set does not export
`acquireFileLockSync`, so the candidate runner failed at startup. Accordingly,
the mandated revert proofs are **not** accepted as `PROVEN`; no completion
claim is warranted from that infrastructure state.

The report in
`~/.local/state/frond-scribe/receipts/1415-rulings-6ca8fd57/REPORT.md`
has been read, including item 4. Item 4 is verified as real prompt content,
but the candidate's explicit classification of it as "background" does not
remove the sender/context widening: the text is appended to the model turn
with `kind: "conversation-data"`.

## Verdict

**BLOCKED — request cannot be considered within the three rulings as
reviewed.**

Ruling 1 is violated by the shed-preview cross-sender transfer. Rulings 2 and
3 pass their direct code and test checks. Revert-proof and focused local proof
remain blocked by the lane dependency/runner mismatch.
