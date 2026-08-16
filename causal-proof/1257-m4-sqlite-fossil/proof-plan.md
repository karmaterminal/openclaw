# Non-continuation proof plan

Corpus target (later): `karmaterminal-openclaw-docs:main:PR-NNNNNN/PROOFS/<FULL_SHA>/`.

| Row                    | Title                                                                   | Status now                                                         | Pass rule                                                        |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `R-NC-SQLITE-SNAPSHOT` | Immutable agent DB + WAL/SHM after Gateway release or verified snapshot | **BLOCKED** — no acceptable specimen                               | Exact seat bytes + sidecar inventory + copy hash                 |
| `FENCED-READ-RED`      | Timed `loadTranscriptEventsSync` / exact EXPLAIN QUERY PLAN on copy     | **BLOCKED** on snapshot                                            | Wall/CPU split: SQL materialize vs JSON decode; fence preserved  |
| `ANALYZE`              | Second clone only; never original or live                               | **BLOCKED** on snapshot; small-control ran ANALYZE on clone B only | `sqlite_stat1` before/after + timing delta; rows/bytes identical |
| `RUN-ORDER`            | A then B then A'                                                        | Small-control **PASS**; incident **BLOCKED**                       | A' matches A; B may differ in plan/stat1 only                    |
| `SMALL-CONTROL`        | Tiny healthy store, same query shape                                    | **PASS**                                                           | 80/39 rows, identical payload hashes, original hash unchanged    |
| `NO-MUTATION`          | Original bytes unchanged                                                | Small-control **PASS**; live/original incident files never opened  | Pre/post SHA-256 of the frozen original                          |

Also keep the architecture rows, still blocked on snapshot:

- `W87-1257-COPY-INTEGRITY`
- `W87-1257-STAT1-BEFORE`
- `W87-1257-PLAN-BEFORE`
- `W87-1257-ANALYZE-COPY`
- `W87-1257-SEMANTICS`
- `W87-1257-SMALL-SESSION` (satisfied by SMALL-CONTROL only)
- `W87-1257-119901` = `not-applicable` until STAT1 + timing on an incident copy
- `W87-1257-NOT-INGRESS` = recorded: owner is agent transcript store, not state-DB ingress
