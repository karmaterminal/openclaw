# #1257 M4 copied-agent-SQLite causal fossil

Bound issue: [karmaterminal/openclaw#1257](https://github.com/karmaterminal/openclaw/issues/1257).
Parent: #1254. Evidence source: `cfbb29bfd3e751e718fda44649b690268621f13f`.
Base SHA: `a4407f638af0d0147e3712eb6202ba7bf5d3d7fc`.

**PROOF/TEST ONLY.** No product repair. No live Gateway DB copy/open/check/ANALYZE/VACUUM.

## Verdict

Incident-shaped copied-store measurements are **blocked**. No acceptable immutable offline specimen exists on this host.

- ANALYZE vs query/decode is **undecided**.
- Do **not** open a duplicate product PR for [openclaw/openclaw#119901](https://github.com/openclaw/openclaw/pull/119901).
- If a later incident copy shows query/JSON decode dominates, the minimal future C4 owner is `loadTranscriptEventsSync` / `loadTranscriptEventsFromDatabase` in `src/config/sessions/session-accessor.sqlite-read.ts`. Do not implement it here.

## What this fossil did prove

- Owner path and fence contract from source on exact `a4407f638af`.
- Exact incident byte sizes from the #1257 architecture note, and a host search that found no matching offline copies plus sidecars.
- Rejection of the only multi-GB offline agent files present (Aug 7 recovery copies, 3,190,161,408 B, no WAL/SHM, taken while `gateway=active`).
- Live `~/.openclaw/agents/main/agent/openclaw-agent.sqlite` excluded by policy (stat-only; never hashed or opened).
- Small healthy-store control: clones A/B/A', ANALYZE only on B, identical selected rows/bytes, original hash unchanged.
- Non-continuation proof plan rows R-NC-SQLITE-SNAPSHOT through NO-MUTATION.

## Do not misread

The small control is **not** incident-shaped. File size is not a freelist proxy. Integrity failure would divert to #1261, never a performance win.
