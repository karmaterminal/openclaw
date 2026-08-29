# Lane journal: bounded upstream `43a7cb3c` absorb

## 2026-08-29T23:55Z - Preflight and named refs

Scope is the bounded back-merge for openclaw/openclaw#124337. The protected
presentation branch, external proof corpus, fleet, and deployment remain out of
scope.

| Category         | Named ref                                          | Resolved SHA                               | Identity                                                                  |
| ---------------- | -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Product/base ref | `codeagent/124337-current-drift-6ae89b5a-20260827` | `eee69b3d51c68c76c25c376451c161497e614a2b` | local component HEAD, `origin` tracking ref, and server ref equal         |
| Safe lane ref    | `codeagent/124337-bounded-43a7-absorb-20260829`    | `eee69b3d51c68c76c25c376451c161497e614a2b` | local branch, `origin` tracking ref, and server ref equal before merge    |
| CI/workflow ref  | `savegame/20260821/mode-b-proven-2a853a94`         | `2a853a94dd4ac8c2734091161a89d4f2c4ed17a7` | planned reviewed Mode-B workflow ref; server SHA resolved before evidence |
| Presentation ref | N/A                                                | N/A                                        | explicitly out of scope                                                   |
| Docs/proof ref   | `codeagent/124337-current-drift-6ae89b5a-20260827` | `eee69b3d51c68c76c25c376451c161497e614a2b` | existing exact corpus is read-only; local tracking and server ref equal   |

Pinned upstream is
`43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`; the component/upstream merge
base is `6ae89b5a8ed6a1bdbd0d9b7639fc8162afbb7578`.

Gate 1 savegame
`savegame/20260829-2350Z/pr-124337-pre-43a7-absorb` is published at
`eee69b3d51c68c76c25c376451c161497e614a2b`.

The complete currency report at
`40b0fbebfec50167315298cfb9ef3f287a0671c9` and current drift-cure runbook at
`a8ee8cd4a88e172d20894a98c26f5b2804700fec` were read before editing.
The report establishes two expected content conflicts and requires upstream's
settle owner, extracted claim writer, deferred heartbeat, delayed lane
ordering, and shutdown/restart facts to survive while the component keeps
genuine abandonment on bounded failure disposition and all cancellation paths
budget-free.
