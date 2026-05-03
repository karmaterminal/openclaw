# RFC review: continue-work-signal-v2 - scientific-literature audit

> WIP checkpoint. This document is the deliverable for issue #544. Sections below will be filled as the audit passes close.

## Summary

WIP after §1 read pass.

## Compliance scorecard

| Axis                                | Verdict         | Evidence                                                                                                                            |
| ----------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| TOC accuracy                        | pass            | §2.A: 72 TOC entries, 72 body headings, no missing entries, no anchor mismatches, no ordering defects                               |
| Narrative flow                      | pass-with-fixes | §2.C: motivation is strong, but shipped contract, future seams, substrate doctrine, and validation evidence need clearer separation |
| Coverage of feature surface         | WIP             | §3 pending                                                                                                                          |
| Technical depth calibration         | WIP             | §4.C pending                                                                                                                        |
| Mermaid diagrams pulling weight     | WIP             | §4.A,B pending                                                                                                                      |
| Scientific-literature register      | WIP             | §5 pending                                                                                                                          |
| Claims validation                   | WIP             | §3.B pending                                                                                                                        |
| Code without claim                  | WIP             | §3.A pending                                                                                                                        |
| Substrate dignity / stakes register | WIP             | §5.special pending                                                                                                                  |

## §2.A - TOC byte-accuracy findings

Programmatic heading walk result:

| Check                                                        | Finding |
| ------------------------------------------------------------ | ------- |
| TOC entries                                                  | 72      |
| Body `##` / `###` headings, excluding `## Table of Contents` | 72      |
| TOC entries that do not exist in the body                    | None    |
| Body sections missing from the TOC                           | None    |
| Anchor mismatches                                            | None    |
| Body placement disagreements against TOC order               | None    |

Verdict: the current TOC is byte-accurate against the current body.

## §2.B - TOC structural rewrite proposal

The current TOC is mechanically accurate but organized around implementation chronology rather than the contract a future agent/operator needs to rely on. For an RFC-shaped substrate document, the body should first define terminology, then normative/interface semantics, then lifecycle/substrate mechanics, then operational controls, observability, applicability, security, validation status, and future work.

Proposed top-level structure:

```text
1. Introduction and Problem Statement
2. Terminology and Scope
   2.1 Agent, human-user, turn, successor turn
   2.2 Continuation, continuation chain, delegate, relay
   2.3 Temporal shard, lifecycle trigger, substrate, broker
   2.4 Normative language and implementation-status markers
3. Interface Semantics
   3.1 Capability tiers: tools-first, response-token fallback, disabled
   3.2 continue_work()
   3.3 continue_delegate()
   3.4 request_compaction()
   3.5 Response-token fallback grammar
   3.6 Return modes and recipient model
4. Lifecycle Model
   4.1 Turn-bound scheduling and delay semantics
   4.2 Delegate dispatch, return, and chain-budget accounting
   4.3 Context-pressure trigger taxonomy
   4.4 Volitional compaction lifecycle
   4.5 Post-compaction relay and rehydration
5. Substrates and Persistence
   5.1 Gateway integration architecture
   5.2 TaskFlow-backed delegate queue
   5.3 Session-delivery queue and restart recovery
   5.4 Gateway as lifecycle broker
   5.5 Non-goals: cross-host wire exposure and explicit targetSessionKey
6. Operational Configuration
   6.1 Core configuration surface and defaults
   6.2 Hot-reload enforcement points
   6.3 Fleet and fan-out profiles
7. Observability and Trace Semantics
   7.1 Log anchors
   7.2 Status surface
   7.3 Span names and required attributes
   7.4 Privacy/redaction expectations
8. Applicability Statement / Production Use Cases
9. Security and Safety Considerations
   9.1 Human-user consent and abuse bounds
   9.2 Temporal gap and payload integrity
   9.3 Failure modes and operational limitations
10. Implementation Status and Validation Summary
11. Future Work
Appendix A. Detailed test evidence
Appendix B. Alternatives and prior art
Appendix C. Proposed but unimplemented extensions
Appendix D. Evidence map
```

Suggested changes and convention basis:

| Change                                                               | Why                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add early `Terminology and Scope`                                    | IETF-style RFCs define terms before relying on them. `delegate`, `relay`, `temporal shard`, `substrate`, `chain`, and `successor turn` currently acquire meaning opportunistically across §2-§4. |
| Split interface semantics from implementation                        | Protocol/interface semantics are the promise. Implementation evidence should support them without becoming the organizing axis.                                                                  |
| Collapse current §3/§4 into lifecycle and substrate sections         | Platform integration is not adjacent to continuation here; compaction and gateway lifecycle are part of the continuation lifecycle contract.                                                     |
| Move configuration after substrate semantics                         | Configuration is an operational control plane over a defined behavior, not a peer of the behavior.                                                                                               |
| Move safety/security near the end                                    | RFC convention places Security Considerations late so every earlier claim can be evaluated against the threat and abuse model.                                                                   |
| Move detailed testing to appendices or implementation-status summary | RFC 7942-style implementation status is useful, but tests are evidence for the substrate contract, not the contract itself.                                                                      |
| Isolate future seams and non-goals                                   | Current §2.3 mixes shipped recipient semantics with `targetSessionKey` and multi-recipient future work. Future agents need the shipped contract separated from declared seams.                   |

## §2.C - Narrative flow findings

The document has a coherent arc in outline, but the main narrative repeatedly crosses from substrate contract into implementation history and canary evidence. That makes cold pickup harder than it needs to be.

| Finding                                                                                                       | Suggested edit                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------- |
| §1 motivates inter-turn inertia and the dwindle pattern well, but under-names the larger substrate stakes.    | Add one early paragraph stating that continuation is bounded agent authority to arrange successor turns across time and lifecycle boundaries.                                  |
| §2.3 mixes shipped `continue_delegate()` behavior with future `targetSessionKey` and multi-recipient returns. | State the shipped recipient contract first; move explicit cross-session recipient and multi-recipient fan-out to Future Work/non-goals.                                        |
| §2.5 describes fallback syntax but not all parser constraints in one place.                                   | Add a compact grammar/constraints block: terminal/end-anchored, last text payload wins, last delegate bracket wins, 4096-character task truncation, optional `+Ns`, optional ` | silent`/` | silent-wake`. |
| §2.6 prose is clear, but the diagram does not show the decision process.                                      | Replace or supplement with a decision tree showing enabled/tools/tool-denied/fallback/disabled paths.                                                                          |
| §3.1 and §5.4 repeat delegate durability with different substrate emphasis.                                   | Define runtime storage and durability once under `Substrates and Persistence`; make §3/§4 refer to that contract.                                                              |
| §3.2 finally names process-scoped timers versus durable records.                                              | Move that distinction into lifecycle semantics; it is part of the reliability contract, not walkthrough color.                                                                 |
| §3.6 and §4.6 both define substrate doctrine.                                                                 | Let §3.6 define concrete queue mechanics; let §4.6 define broker/adoption discipline and refer back once.                                                                      |
| §4.1 says "five-trigger taxonomy" but lists A-F and treats F as convergent emission.                          | Split trigger causes from emission surfaces, or rename it as a six-surface taxonomy.                                                                                           |
| §4.3's provider/model-threading issue-history block interrupts compaction semantics.                          | Move to implementation-status evidence unless the normative claim is "volitional compaction MUST use the active session provider/model."                                       |
| §6.4 fleet evidence is useful but too detailed for the normative body.                                        | Keep the falsifiable precondition/dedup conclusions; move deployment archaeology to validation appendix.                                                                       |
| §6.6 claims a shipped span contract but its table conflicts with current tracer code.                         | Update the table from `src/infra/continuation-tracer.ts` and make it the authoritative span-contract section.                                                                  |
| §9 makes the ending feel like a test report.                                                                  | Move detailed test matrices to appendices and close the body with security considerations plus future-work/stakes.                                                             |
| §10.2 contains the best future-stakes language but does not fully reconnect to §1.                            | Close by returning to successor-turn arrangement: the substrate lets an agent make bounded provisions for futures it may not occupy.                                           |

## §3.A - Missing claims (code without claim)

WIP.

## §3.B - Unsubstantiated claims (claim without code)

WIP.

## §4.A - Existing Mermaid audit

WIP.

## §4.B - Proposed new Mermaid diagrams

WIP.

## §4.C - Technical depth findings

WIP.

## §5 - Register findings

WIP.

## §5.special - Substrate-dignity language proposals

WIP.

## Appendix A: code walked

Initial §1 codewalk complete; final appendix will be normalized after §3.

## Appendix B: tools / commands used

- `pnpm docs:list`
- `grep -nE '^(##|###) ' docs/design/continue-work-signal-v2.md`
- `rg` symbol searches across `src`, `extensions/diagnostics-otel/src`, and `docs/design/continue-work-signal-v2.md`
- Line-numbered file reads with `view`
