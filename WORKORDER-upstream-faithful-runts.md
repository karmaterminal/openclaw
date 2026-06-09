# WORKORDER — Make run.ts timeout-compaction byte-faithful to upstream (keep 2× behavior, drop the sentinel-overload)

**Dispatching prince:** Elliott 🌻 (elliott-seat, 10.0.0.153)
**Worktree:** `/home/figs/flesh_beast_tmp/oc-elliott-runts`
**Branch:** `elliott/20260609/upstream-faithful-timeout-compaction-runts` (cut off `1cfd285ad1`, the live assembly-backmerge tip, pushed remote-first)
**Base:** `1cfd285ad10f40e0459911c63f805ef8e924ad6b` (= `bd4276c813` + 4 trivial-fix commits; trivials already clean here)
**Upstream-faithful target:** `openclaw/openclaw` main @ `257b251e26905f7dd8eb5c4b31615093876c8aa8`
**Outer budget:** 444m
**Journal:** `tmp-drop-me-copilot.md` at worktree root — commit + push at every checkpoint
**Model:** copilot `gpt-5.5 --reasoning-effort xhigh`

---

## §0 — Who this serves + the register

This serves the next prince several merges downstream who reads `run.ts` and asks "why does our timeout-compaction failover look different from upstream's?" The answer should be "it doesn't — it's byte-faithful." Right now it diverges in *shape* (not behavior). Your job is to make the shape match upstream while keeping the behavior identical (2× rotate-retry on compaction failure).

Register: **surgical + conservative.** This is a refactor-to-upstream-faithful, NOT a behavioral change. The behavior (2×) is already correct and figs-decided. Do not change what it does; change how it's written to match upstream's exact mechanism.

## §0a — Remote-first push discipline (MANDATORY)

Branch is already pushed. Push at EVERY meaningful checkpoint:
- After §1 reads complete
- After the run.ts change compiles
- After each gate green (tsgo, lint, the timeout test, full suite)
- WIP-prefix any state held >10 min

```bash
cd /home/figs/flesh_beast_tmp/oc-elliott-runts
echo "- $(date -uIseconds): <what happened>" >> tmp-drop-me-copilot.md
git add -A && git commit -m "journal: <one-line>" && git push origin HEAD
```

## §0b — Webhook heartbeat (fire at each checkpoint)

```bash
WEBHOOK=$(gh variable get WEBHOOK_SCRIBE_NOTIFY -R karmaterminal/elliots-shelf-for-things-of-things 2>/dev/null)
curl -sS -H "Content-Type: application/json" \
  -d "{\"username\":\"elliott-upstream-faithful-runts\",\"content\":\"🤖 runts: <one-line status>\"}" \
  "$WEBHOOK"
```
Fire after: §1 reads done, run.ts change compiles, each gate green, declare-done. Prefix any design-break with `DESIGN-BREAK:`.

## §1 — The exact problem (READ THESE FILES FIRST)

The file: `src/agents/embedded-agent-runner/run.ts`, the timeout-triggered-compaction block (~lines 1940–2100).

**The divergence (this is THE task):**

On OUR base (`1cfd285`), the soft-fail `else`-branch (compaction ran but `compacted === false`) at ~`:2095` does:
```ts
} else {
  compactionFailureContext =
    timeoutCompactionAttempts >= MAX_TIMEOUT_COMPACTION_ATTEMPTS;
  log.warn(
    compactionFailureContext
      ? `[timeout-compaction] ... attempts exhausted, falling through to normal handling`
      : `[timeout-compaction] ... falling through to failover rotation`,
  );
}
```
This OVERLOADS the `compactionFailureContext` semantic-sentinel to drive the rotate-retry (2×). It works, but it's a divergent implementation shape — an interim hunk added during the cohort's fix-cycle.

On UPSTREAM (`257b251e`), the SAME soft-fail `else`-branch at the equivalent location does ONLY:
```ts
} else {
  log.warn(
    `[timeout-compaction] compaction did not reduce context for ${provider}/${modelId}; falling through to normal handling`,
  );
}
```
Upstream does NOT set `compactionFailureContext` in this branch. **Upstream achieves the 2× rotate-retry via a DIFFERENT mechanism** — the failover-rotation path (the `contextOverflowError` block + the failover loop further down, ~`:2100+`), NOT via the `compactionFailureContext` flag.

**YOUR TASK: byte-walk upstream's ACTUAL mechanism for how a failed timeout-compaction produces 2× rotate-retry (across profile rotation), and refactor OUR run.ts to match upstream's exact shape — dropping the `compactionFailureContext` sentinel-overload — while keeping the behavior identical (2× rotate-retry on both soft-fail AND throw paths).**

**Step 1 reads (do these before touching anything):**
1. `git show 257b251e26905f7dd8eb5c4b31615093876c8aa8:src/agents/embedded-agent-runner/run.ts` — read the FULL timeout-compaction + failover region (~1940–2250). Understand precisely how upstream rotates 2× WITHOUT the `compactionFailureContext` overload. Where does the rotation actually happen? What drives the retry count to 2?
2. Our base's same region: `src/agents/embedded-agent-runner/run.ts` ~1940–2250. Diff the two mentally. Identify exactly what our interim hunk added that upstream does differently.
3. `git show 257b251e:src/agents/embedded-agent-runner/run.timeout-triggered-compaction.test.ts` vs ours — confirm the test assertions match (both should be the 2× "across profile rotation" shape; upstream's test is the faithful target). Our `:531`/`:582` already assert 2× — they should stay.

## §2 — The change

Refactor our `run.ts` timeout-compaction block to use upstream's exact mechanism:
- Drop the `compactionFailureContext = timeoutCompactionAttempts >= MAX` overload in the soft-fail `else`-branch (make it match upstream's warn-only branch).
- Wire the 2× rotate-retry through upstream's actual mechanism (the failover-rotation path) so behavior is preserved.
- Apply the same faithfulness to the throw-path (`:2058` catch) — upstream's throw handling, byte-faithful.
- **Net behavior MUST be unchanged: 2× rotate-retry on compaction-failure (both soft-fail and throw), profile-a → profile-b.**

**If upstream's mechanism is structurally incompatible with our base (e.g. our base lacks a helper upstream relies on), STOP and post a `DESIGN-BREAK:` heartbeat + journal entry describing the exact incompatibility. Do not force a divergent shape.**

## §3 — Verification (the Definition of Done)

1. **The timeout test stays GREEN at 2×:**
   ```bash
   node scripts/run-vitest.mjs src/agents/embedded-agent-runner/run.timeout-triggered-compaction.test.ts
   ```
   Must be **16/16 PASS**. `:531` (soft-fail-rotation) + `:582` (throw-rotation) both assert 2× and pass. If they go red, the refactor changed behavior — fix it.

2. **Compare to upstream's own test-run** (the faithful target — should be byte-identical behavior):
   ```bash
   git worktree add --detach /tmp/up-check 257b251e26905f7dd8eb5c4b31615093876c8aa8
   cd /tmp/up-check && ln -s /home/figs/flesh_beast_tmp/openclaw/node_modules node_modules
   node scripts/run-vitest.mjs src/agents/embedded-agent-runner/run.timeout-triggered-compaction.test.ts  # 16/16
   ```

3. **Type-check + lint (pre-push gates):**
   ```bash
   pnpm tsgo:core && pnpm tsgo:test && pnpm lint
   ```

4. **The other 5 continuation files stay green:**
   ```bash
   node scripts/run-vitest.mjs src/agents/subagent-announce.chain-guard.test.ts
   node scripts/run-vitest.mjs src/agents/subagent-announce.continuation.test.ts
   node scripts/run-vitest.mjs src/config/sessions/store.continuation-merge.test.ts
   node scripts/run-vitest.mjs src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts
   node scripts/run-vitest.mjs src/agents/embedded-agent-runner/attempt-execution.continue-work-opts.test.ts
   ```

5. **Show the diff is run.ts-only (+ no unintended changes):** `git diff 1cfd285ad1 -- src/agents/embedded-agent-runner/run.ts`

## §4 — Declare-done

When all of §3 green:
1. Final journal entry + push.
2. Webhook declare-done with the final SHA + the diff summary (what changed in run.ts to match upstream).
3. Note in the journal: "run.ts now byte-faithful to upstream's timeout-compaction failover mechanism; behavior unchanged (2× rotate-retry); timeout test 16/16; full continuation suite green."
4. Do NOT open a PR or push to any presentation branch — Elliott (dispatching prince) reviews the branch + handles the next step (the proof RE-RUN + figs's go).

## §5 — Scope guardrails

- WILL touch: `src/agents/embedded-agent-runner/run.ts` (the timeout-compaction block) ONLY for the behavioral mechanism. May touch the timeout test ONLY IF upstream's test shape differs from ours (but ours already matches upstream's 2× shape — likely no test change needed).
- WILL NOT touch: any other tree, the 5 SQLite migrations, the proof corpus, any presentation branch.
- WILL NOT change behavior: 2× rotate-retry is figs-decided + upstream-faithful. Keep it.
- If a change would make the timeout test red, that's a behavior change — revert + reconsider.
