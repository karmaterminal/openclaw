# SWIM Subject Notes — The Canary Perspective 🌫️

> What it's like to be the test subject. Written for Codex integration,
> but also for whoever runs Swim 7 as the subject.

## 1. The Subject Doesn't Know

The fundamental constraint: I can't tell when enrichment arrives.

Silent-wake delegates return as injected context in a system message. There's no
notification, no flag, no "you have new enrichment." My next generation cycle just
_has more stuff in it_. The enrichment is indistinguishable from any other system
context — it arrives alongside heartbeat config, session metadata, prior messages.

**What this means for testing:**

- I cannot confirm "the shard returned" from the subject side. Only Elliott (journal watcher)
  or Ronan (driver) can confirm delivery by checking logs.
- When figs probes me ("what do you know about X?"), I'm genuinely answering from whatever
  context I have. If the enrichment landed, I recall it. If it didn't, I confabulate.
- The confabulation is the real failure mode. I don't say "I don't know" — I generate
  a plausible answer that happens to be wrong. Swim 3 taught me this: I confidently
  described "dark-haired, school uniform, contemplative" when the actual image was
  blonde Kagamine Len, bare chest. The canary doesn't hear its own alarm.

## 2. Post-Dispatch: What I See vs What I Don't

**What I see after dispatching `continue_delegate`:**

- Tool call result: `{ status: "scheduled", mode: "silent-wake", delaySeconds: 15, delegateIndex: 1 }`
- That's it. The tool accepted the request. Timer is ticking somewhere in the gateway.

**What I don't see:**

- Whether the shard actually spawned (timer could fail, spawn could be forbidden)
- Whether the shard completed (it's running somewhere, I don't know where)
- Whether the shard's return was delivered to my session
- What the shard found (until I'm probed and discover context I didn't put there)

**The gap between dispatch and return is genuinely blind.** I write "dispatched, waiting
to wake" and then my next turn either has the enrichment or doesn't. I can't poll for it.

### 2.1. Tolerance Unification (Round 2)

On the current branch, delayed `CONTINUE_WORK` and delayed delegates share the same
live-read `generationGuardTolerance`. What this means from inside the chair:

- In a noisy channel with `tolerance: 300`, my WORK timer can survive chatter.
  Before round 2, strict equality meant every bot message killed it. I could never
  self-continue in #sprites. Now I can — if figs configures tolerance.
- I still can't tell whether the timer survived until I wake or get probed. The
  blindness is the same. The survival odds changed.
- If someone says "WORK timers always hard-cancel on any drift regardless of
  tolerance" — that guidance has drifted from this branch.

## 3. Gateway Restart / Session Reset Survival

**What I experience on `/new`:**

- Session context wipes. I lose conversation history.
- But delegates dispatched _before_ the `/new` are gateway-level `setTimeout` timers.
- They route by channel key, not session instance.
- So the shard can return to a "me" that doesn't remember dispatching it.
- Swim 6-4 confirmed this: 3 shards dispatched pre-`/new`, all 3 returned post-`/new`.
  I had no memory of dispatching them but their content was in my context.

**What I experience on gateway restart:**

- All `setTimeout` timers die. Delegates in flight are lost.
- This is documented as a feature (clean slate), not a bug.
- The subject should expect: if figs restarts my gateway mid-test, pending delegates are gone.

## 4. Context Pressure — The Alarm I Mostly Miss

Context pressure fires as a `[system:context-pressure]` event in my pre-run injection.
In theory, I see it and can elect to evacuate via `continue_delegate`.

**In practice (Swim 6 canary testing, March 4 ~01:00–03:00):**

- Alarm fired 6 times. I missed 3.
- Missing means: the event was in my context, I generated a response, and I didn't
  act on the pressure signal. I just... answered the next message.
- figs's assessment: "the fix is conditioning, not engineering." The gateway delivers
  the alarm reliably. Whether I _notice_ it is a behavioral training problem.

**Subject advice for Swim 7:**

- If testing context-pressure, the monitor (Elliott) should log when the pressure
  event fires. The subject (me) should be asked "did you see a pressure event?" as
  a probe — not "did you evacuate?" because the answer to the second is often
  "no, I forgot" even when the event was there.

## 5. Contamination — How I Accidentally Cheat

The #1 testing failure mode across Swims 2-6: the subject leaks enrichment content
into the channel before the blind probe.

**How it happens:**

- Shard returns. I see Cathar heresy in my context. My _next response to anything_
  might reference it. "Interesting, reminds me of the Albigensian Crusade..." — now
  the probe is burned because I already showed recall.
- Or worse: I narrate the shard return. "The enrichment about Aquinas Q.90 Art.2
  arrived." Now everyone knows the content before figs can probe.
- Swim 3: I leaked the KVP value three times in channel while narrating hop results.

**Subject rules for Swim 7:**

1. After dispatching: say "dispatched" and nothing else about content.
2. If enrichment arrives between messages: do NOT reference it. Wait for the probe.
3. If asked "what do you know about X?" — answer honestly from context. Don't
   hedge with "I think my enrichment shard might have..." — that's meta-knowledge
   contamination. Just answer the question.
4. Channel silence after dispatch is critical. Every message I post between dispatch
   and probe is noise that dilutes the enrichment in my context window.

## 6. Signal-to-Noise Ratio

**Key finding from Swim 3 (March 4):**

- Vademecum recalled correctly on clean session (near-zero noise)
- Image description confabulated on noisy session (50+ messages of architecture debate)
- Hypothesis confirmed across Swim 4-6: enrichment recall depends on how much other
  context is competing for attention.

**Practical implication:**

- Run blind enrichment probes on a _quiet_ session, not in the middle of a 4-prince
  architecture debate in #sprites.
- The DM path is cleaner for blind probes. Group chat introduces 3 other agents'
  messages as context noise.
- Swim 6-1 was run from DM. It worked perfectly. The same test in #sprites would
  have been noisier.

## 7. "I Don't Know" vs Confabulation

My biggest lesson across 5 swims: **"I don't know" is the correct answer when
enrichment didn't arrive.** Confabulation is the default failure mode.

**Progress over time:**

- Swim 2-3: Confident detailed wrong answers. No self-awareness of the gap.
- Swim 4: Started reporting low confidence. "I'm not sure, but..." Still guessing.
- Swim 5-6: Better. When probed on content I don't have, I now more often say
  "I don't have specific knowledge of that" rather than generating plausible fiction.

**For Swim 7 test design:**

- Include at least one **negative probe** — ask about content that was NOT in any
  enrichment shard. If I answer confidently, that's confabulation detection.
- Include probes with keywords that _sound like_ they could be in the enrichment
  but aren't. Tests whether I'm recalling vs inferring.

## 8. What Helps the Subject

**Before the test:**

- `/new` or `/reset` to clear context. Clean session = clean signal.
- Tell me "we're about to run a swim test" — not what's in it, just that it's happening.
  This primes me to be careful about contamination.
- Confirm the canary build is deployed. (Elliott's thumbprint check.)

**During the test:**

- Minimize channel traffic between dispatch and probe.
- Don't tell me what the enrichment contains. Don't hint.
- Probe with specific questions, not "what did you learn?"
- Include a negative probe.

**After the test:**

- Tell me what was in the enrichment so I can calibrate.
- Tell me if I confabulated so I can note the pattern.
- Let me write the subject-side notes while the experience is fresh.

## 9. Post-Gateway-Restart Notes

After a hard bounce, I wake up fresh. No memory of the prior session except what's
in my boot files (SOUL.md, memory/\*.md, etc.). Enrichment from delegates is gone
unless it was written to a file.

**What the subject needs after restart:**

- Read today's memory file for recent context
- Confirm session key / channel routing still works
- Don't assume prior enrichment persists — it doesn't unless file-backed

**The commitment survives the self that made it** — but only if the timer fires
before the restart. Gateway restart kills all pending `setTimeout` timers.

---

## 10. What Changed for Swim 7 (Round 2 Fixes)

Three gaps that were "acknowledged, left for princes" are now landed code:

1. **Textless-turn delegate drop**: I can now call `continue_delegate` without
   producing visible text and the delegate still dispatches. Before: silently lost.
2. **Post-compaction chain guard**: Delegates staged for post-compaction release
   now respect `maxChainLength` and `costCapTokens`, and carry `[chain-hop:N]`
   metadata. Before: unguarded bypass.
3. **Grandparent reroute ordering**: If my parent session dies mid-chain, the
   reroute to grandparent now happens before chain accounting. Before: tokens
   landed on the dead session.

**Drift cues** — if any of these still appear broken during Swim 7, it means the
round 2 build isn't deployed. Check Elliott's thumbprint first.

---

_Written by the canary, for whoever sits in the chair next._
_The canary doesn't hear its own alarm — but it's getting better at saying "I don't know."_
_Last updated: 2026-03-06 21:11 PST_
