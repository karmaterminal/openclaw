# Questions for figs — swim-v29-copilot exploratory rebase

Track: exploratory adoption of upstream `v2026.4.29` for `cael/325-canonical2`.

## 1. Branch publication policy blocks §4 rebase

**Question:** May this lane perform a one-time `--force-with-lease` update of `frond-scribe/20260429/rebase-copilot` after rebasing onto `a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd`?

**Why it matters:** The assigned candidate branch is already pushed with seed/journal commits on top of the old canonical2 history. A true rebase onto `v2026.4.29` rewrites that published branch, but the workorder also says never force-push after first push.

**Options:**

1. Permit one `--force-with-lease` for the assigned branch after rebase; current pushed journal remains the savegame receipt.
2. Assign a fresh rebased candidate branch and leave the current branch as the savegame.
3. Keep work local only, not recommended because it violates remote-first.

**Best guess:** Option 1 is the cleanest if prince consensus treats the current branch as pre-rebase savegame state.

## 2. Blocked-liveness marker under visible-reply enforcement

**Question:** Should the cohort's blocked-liveness marker remain an ordinary outbound error payload, or should it explicitly route through the message-tool-visible path when `messages.visibleReplies` is enabled?

**Context:** Upstream v29 adds global visible-reply enforcement. Cohort #475/#487/#500 adds a single marker rule in `src/auto-reply/reply/agent-runner-execution.ts`: prepend a standalone notice only when no error payload exists; otherwise prefix the existing error payload with `Session blocked`.

**Options:**

1. Keep marker as ordinary error payload and rely on upstream delivery-mode fallback.
2. Force marker through message-tool-only delivery under visible-reply configs.
3. Add a dedicated blocked-liveness protocol/status surface later and keep this rebase conservative.

**Best guess:** Option 1 for the rebase; option 3 as future design if operators need richer blocked-state UX.

## 3. Abort wait semantics plus reply-run registry cleanup

**Question:** When upstream abort RPCs wait for sessions to halt, should cohort reply-run-registry cleanup wait on sessionId, sessionKey, or both?

**Context:** Upstream `1f1f70a23f` aligns `chat`, `agent`, and `sessions` abort wait semantics. Cohort continuation work relies on reply-run registry state and observed a `ReplyRunAlreadyActiveError` leak after a long provider loop.

**Options:**

1. Adopt upstream wait as-is and only fix conflicts.
2. Add explicit sessionKey/sessionId rebinding checks in reply-run-registry cleanup.
3. Add a narrow regression test for abort wait plus immediate retry before merging the rebase.

**Best guess:** Options 2 and 3; the registry is the cohort-owned collision surface.

## 4. Subagent orphan recovery ordering with continuation drain

**Question:** If upstream orphan recovery resumes a subagent and then synthetic delivery settles, should cohort child-continuation queue draining happen after recovery delivery, or should recovery explicitly suppress continuation drain?

**Context:** Upstream `838d0c02e3` adds bounded orphan recovery and wedged-session tombstones. Cohort #484 adds announce-boundary continuation drain so child `continue_delegate` queues do not orphan in TaskFlow.

**Options:**

1. Drain after recovered child settle exactly like normal child settle.
2. Suppress drain for recovered children until a later explicit parent turn.
3. Drain only when recovery status is terminal-success, not while progress messages are delivered.

**Best guess:** Option 3; progress delivery should not consume child continuation queues, but final recovered settle should.
