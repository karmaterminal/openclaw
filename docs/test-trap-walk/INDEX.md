# Test-trap walk issue index

Project: karmaterminal/openclaw project 56. All issues below were created by this walker and set to `Todo`.

| Issue | Category               | Summary                                                                          | Priority |
| ----- | ---------------------- | -------------------------------------------------------------------------------- | -------- |
| #437  | regression-known       | Trap partial TaskFlow delegate fold from #433 broken push                        | P0       |
| #438  | architectural-decision | Pin mode-only `PendingContinuationDelegate` at compat boundary                   | P1       |
| #439  | volatile-audit         | Resolve reply `continuation-state` `delegatePendingFlags` Map                    | P1       |
| #440  | volatile-audit         | Decide durability contract for context-pressure `lastFiredBand` Map              | P2       |
| #441  | guard-test             | Add static allowlist for session-keyed volatile Maps in continuation             | P1       |
| #442  | coverage               | Prove followup-runner chain state reaches disk through actual callsite           | P0       |
| #443  | coverage               | Add negative store-merge guard for `updatedAt` churn during continuation persist | P2       |
| #444  | coverage               | Exercise `request_compaction` provider/auth threading through real callsites     | P1       |
| #445  | coverage               | Pin `request_compaction` registration truth table                                | P1       |
| #446  | trap-test              | Pin `continue_delegate` descriptor modes and no boolean-runtime shape            | P1       |
| #447  | coverage               | Pin `request_compaction` pending Set cleanup on failure                          | P2       |
| #448  | coverage               | Race two delegate consumers against the same TaskFlow rows                       | P1       |
| #449  | architectural-decision | Decide retry semantics after delegate spawn failure                              | P1       |
| #450  | volatile-audit         | Decide substrate for subagent announce queue                                     | P1       |
| #451  | coverage               | Add agent-runner boundary test for post-compaction lifecycle gates               | P1       |
| #452  | coverage               | Guard continuation delay config when `minDelayMs` exceeds `maxDelayMs`           | P2       |
| #453  | coverage               | Test corrupt TaskFlow delegate payload breadcrumbs                               | P2       |
| #454  | coverage               | Pin subagent announce runtime export contracts                                   | P2       |
| #455  | architectural-decision | Decide retry semantics for post-compaction delegate release failure              | P1       |
