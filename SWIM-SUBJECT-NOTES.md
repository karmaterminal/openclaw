# SWIM Subject Notes — The Canary Perspective

_Adapted into this branch from `silas/p1p2-fixes` at `455eded46`, with minor wording updates to match the current continuation tool/result shapes._

## 1. The subject does not know when silent enrichment lands

The canary cannot reliably tell when silent enrichment arrived.

Silent-wake delegate returns show up as injected context in a later turn. From inside the session, there is usually no separate "delivery happened" signal the subject can trust.

What this means:

- the subject cannot prove the shard returned
- logs and session evidence are the proof
- the probe result is often the first moment the subject discovers whether enrichment landed

## 2. After dispatch, the subject mostly sees only scheduling success

What the subject usually sees after calling `continue_delegate` is something like:

```json
{
  "status": "scheduled",
  "mode": "silent-wake",
  "delaySeconds": 15,
  "delegateIndex": 1
}
```

That does not prove:

- the timer survived
- the shard spawned
- the shard completed
- the return landed

It only proves the tool accepted the request.

## 2.1 Current branch continuity note

On this branch, delayed `CONTINUE_WORK` and delayed delegates share the same live-read `generationGuardTolerance` behavior.

What that means to the subject:

- in a noisy shared channel, raised tolerance may let either path survive chatter
- from inside the session, the subject still cannot tell whether the timer survived until a later wake or probe
- if someone says delayed WORK always hard-cancels on any drift regardless of tolerance, that guidance has drifted from this branch

## 3. Confabulation is the real failure mode

If enrichment did not land, the subject may still answer confidently and incorrectly.

That means the bad result is often not silence. It is a plausible answer that happens to be false.

A useful canary behavior is:

- say "I don't know" or indicate low confidence when specific knowledge is absent

A dangerous canary behavior is:

- fill the gap with a smooth invention

## 4. Blind tests are easy to contaminate from the subject side

The subject can burn a blind test by mentioning the enrichment before the official probe.

Examples:

- narrating what the shard found
- casually referencing the topic in an unrelated reply
- talking about the shard return instead of simply waiting

Subject rule:

1. after dispatch, say only that the work was dispatched
2. do not mention returned content until after the probe
3. answer the probe directly, not with shard meta-commentary

## 5. Quiet sessions help

Blind enrichment works better on a quiet session than in a noisy group chat.

Too much competing context makes it harder for the subject to recall planted details cleanly. DM is usually better than a busy shared channel.

## 6. Negative probes are necessary

A good blind-enrichment test should include:

- one positive probe for planted content
- one negative probe for unplanted content

The negative probe helps distinguish:

- actual recall
- plausible inference
- outright confabulation

## 7. `/new` and gateway restart are different

From the subject perspective:

- `/new` wipes conversational memory, but already-scheduled gateway timers can still return later
- gateway restart kills pending delegate timers

So a subject may receive a post-`/new` enrichment it does not remember scheduling, but it should not expect pre-restart pending delegates to survive a hard gateway bounce.

## 8. Context-pressure is partly a behavioral test

The gateway can inject a context-pressure event reliably and the subject can still miss it.

When testing context-pressure, separate:

1. whether the event fired
2. whether the subject noticed
3. whether the subject acted correctly

Those are not the same measurement.

## 9. What helps the subject

Before the test:

- start from a clean session when possible
- tell the subject a swim is happening without revealing the planted content
- verify the canary build is actually deployed

During the test:

- minimize noise
- do not hint the answer
- use specific probes
- include a negative probe

After the test:

- tell the subject what the planted material actually was
- note whether the subject recalled, missed, or confabulated
- capture subject-side notes while the experience is fresh
