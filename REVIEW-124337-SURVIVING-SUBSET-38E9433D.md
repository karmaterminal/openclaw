# Corrected detached review: openclaw/openclaw#124337 surviving subset

## Verdict

`CONFIRMED_124337_SURVIVING_SUBSET_38E9433D`

The repaired candidate
`38e9433da46b785a58f1d6a10161c348741af08e` closes the only finding in prior
request-changes report
`c59465671922c18578222b5647e922aa86448eb9`.

The additive commit changes only the Microsoft Teams aged-abandonment
assertion. Its behavior-bearing hunk matches source commit
`a01d78a4b33c155c948eeca283f179ef06fa7e7e`, the required focused suites and
Node 24 gates pass, and no new product or unrelated content is present.

## Exact identity

| Surface                 | Exact value                                | Result                              |
| ----------------------- | ------------------------------------------ | ----------------------------------- |
| Frozen upstream base    | `40a01c9744c29b4232eb9e86b64e67b2db1a3bcd` | Verified                            |
| Prior candidate         | `51b91e4fef14b3f279afbae48838448d6c9f817f` | Direct parent                       |
| Repaired candidate      | `38e9433da46b785a58f1d6a10161c348741af08e` | Verified                            |
| Repaired tree           | `fa31e12e5c14c00f6c7fa8aae4f84a7e7cd449a3` | Verified locally and through GitHub |
| Source assertion commit | `a01d78a4b33c155c948eeca283f179ef06fa7e7e` | Verified                            |
| Prior review report     | `c59465671922c18578222b5647e922aa86448eb9` | Finding resolved                    |
| Original PR head        | `eee69b3d51c68c76c25c376451c161497e614a2b` | Live PR unchanged                   |

GitHub compare reports the repaired candidate one commit ahead and zero behind
`51b91e4...`, with only:

`extensions/msteams/src/monitor-handler/message-handler.ingress-lifecycle.test.ts`

The full repaired candidate is three commits ahead and zero behind frozen base
`40a01c9...`, with that base as its exact merge base.

## Assertion-hunk verification

The source commit contains two Microsoft Teams hunks:

1. a test-title and explanatory-comment hunk;
2. the behavior-bearing threshold and restart assertion hunk.

The repaired candidate intentionally ports only the second hunk. After removing
the source and candidate hunk-coordinate lines, every context, deletion, and
addition line in that assertion hunk compares byte-for-byte equal.

The exact repaired GitHub file blob is
`97e53d52895443d2497b77d16543a7bac112812a`. Installing that blob over the
prior-candidate index produces tree
`fa31e12e5c14c00f6c7fa8aae4f84a7e7cd449a3`, exactly matching the supplied
candidate tree.

The separate source title/comment hunk is not required for behavior and is not
present. No Feishu, Mattermost, `output.md`, or `proof-handoff.json` content
from `a01d78a4...` was imported.

## Accepted semantics

The Microsoft Teams test starts with a claim received two days earlier, beyond
the default 24-hour dead-letter age floor. It then drives and seeds the retry
budget to the attempt ceiling.

The repaired assertion now requires:

- no pending row at the threshold;
- one failed row with reason `retry-limit-exceeded`;
- message `turn-abandoned`;
- retained attempts
  `DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS - 1`, because `fail()` does not add
  another release attempt;
- no fourth dispatch when the same activity is accepted after terminalization;
- the failed row remains stable across that later restart.

This matches the accepted production behavior reviewed at `51b91e4...`:
genuine pre-adoption abandonment enters the existing
`applyFailureDisposition`, while modern and legacy cancellation remain
budget-free.

## Tests

Environment: Node `v24.20.0`, pnpm `12.1.0`, frozen-lockfile install.

| Suite                                   | Result       |
| --------------------------------------- | ------------ |
| Microsoft Teams ingress lifecycle alone | 4/4 passed   |
| Prior focused matrix                    | 39/39 passed |

The 39-test matrix was:

- shared lifecycle binding: 1;
- abandonment disposition: 1;
- cancellation compatibility: 2;
- Plugin SDK ingress runtime: 8;
- Discord ingress fan-in and cancellation: 23;
- Microsoft Teams ingress lifecycle: 4.

## Validation gates

| Gate                             | Result                                 |
| -------------------------------- | -------------------------------------- |
| `pnpm tsgo:prod` under Node 24   | Passed                                 |
| `pnpm build` under Node 24       | Passed                                 |
| `pnpm check` under Node 24       | Passed                                 |
| `pnpm deadcode:knip`             | Passed                                 |
| Barnacle safety suite            | Passed                                 |
| Labeler extension-coverage suite | Passed                                 |
| Barnacle + labeler total         | 49/49 passed                           |
| Scoped Autoreview                | Clean; no accepted/actionable findings |

The first `pnpm check` invocation in the reconstruction clone stopped because
that local clone lacked the repository-expected `origin/main` baseline ref.
After pointing the read-only local baseline ref at the already-fetched
upstream `1e08882a41049ea33f969f08605405d92723c6f8`, the unchanged command
passed. This was clone setup, not a candidate-byte failure.

Scoped Autoreview examined only the staged one-file delta reconstructing exact
tree `fa31e12...`. It confirmed that the test correctly expects
`retry-limit-exceeded`, preserves the claim-time attempt count, and verifies no
later redispatch.

## Scope audit

The repaired additive delta is exactly `+20/-12` in one test file.

It contains:

- no production changes;
- no other test changes;
- no `src/skills/**`;
- no continuation or openclaw/openclaw#121204 content;
- no deployment or composite content;
- no proof content;
- no presentation content.

The full candidate remains the previously reviewed seven-path product/test
subset plus this one Microsoft Teams assertion file. It remains directly based
on the frozen upstream and does not alter the authoritative attempt-accounting
implementation from openclaw/openclaw#130077.

The original PR remains open with head branch
`codeagent/ward-1255-m1-intervention` at exact SHA
`eee69b3d51c68c76c25c376451c161497e614a2b`.

No candidate update, PR-head update, merge, deploy, composite, proof, or
presentation action was performed by this review.
