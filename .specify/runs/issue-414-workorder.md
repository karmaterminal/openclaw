# Workorder

Issue: #414
Branch: fix/414-raw-key-sweep-cael
Worktree: /tmp/openclaw-wt-issue-414-cael
Goal: complete the remaining systematic raw session-key normalization sweep so every updateSessionStore callback stops using raw store[sessionKey] access and instead uses the normalized entry helpers.

Context:

- #413 root cause is already fixed in critical paths.
- #414 is the cleanup sweep for the same bug family.
- Existing related commits to study first: 817e892d57, fc64f80ef8, fcd4c36d28, and e4aa9aa73c if available in history or other branches.

Constraints:

- surgical fix only
- keep the #414 lane pure, do not mix in OOM / transport / rebuild work
- prefer failing tests first when practical
- do not refactor unrelated code
- use resolveSessionStoreEntry / updateSessionStoreEntry patterns consistently
- leave clear artifact summary in the final response/log

Suggested audit target:

- search for raw store[sessionKey] inside updateSessionStore callbacks
- verify any sibling raw-key write/read paths in the same bug family

Validation:

- run focused tests covering changed paths
- run typecheck or targeted compile check if touched files warrant it

Deliverable:

- summary of files changed
- exact pattern replaced
- tests run and results
- any remaining follow-up sites, if found
