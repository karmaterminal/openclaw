# Successor draft — do not file until an operator snapshot exists

This is **not** a C2 predicate-repair issue. #1262 did not observe a closed M2 reason. Filing a Codex attestation repair now would invent an owner.

Suggested title:

`Collect an incident-bound immutable Cael/Ronan/Emeric agent-store snapshot for M2 copied-store replay`

Parent: karmaterminal/openclaw#1262 (selector), #1256 (M2 instrumentation), #1254 (Project 87).

## What Problem This Solves

M2 (`d74c71c0a3e`, openclaw/openclaw#124454) can emit one closed rejection reason, but the selector could not run it against a store that contains the 2026-08-15 failing-turn morphology. Existing backups predate the traces or are the wrong database role. Live agent DBs are still owned by running gateways.

## Required artifact

One operator-owned, gateway-stopped (or filesystem-snapshot) copy of **one** affected seat's:

- `agents/main/agent/openclaw-agent.sqlite`
- matching `-wal` / `-shm` if present at freeze
- SHA256 of each file
- freeze time
- seat name
- relation to a recorded trace (`818314b2…` / `39bb0342…` / `9af101e0…`)

Do **not** copy while the Gateway has the file open. Do **not** run `integrity_check` / `ANALYZE` / `VACUUM` on the live file. Do **not** include transcript/message dumps in the issue.

Closest rejected copies (hashes only; not incident-bound):

- Cael `cael-main-pre-surgery-20260812T163601-0700` sha256 `ce0f49564769d009c23427fc33008898381994240769c684868d6bf2b31b6edc` (4,472,635,392 B, 2026-08-12)
- Emeric `openclaw-agent.sqlite.pre-nomic` sha256 `543ecc9a17ea17f94b2267f1b871754ba4ec7be59cfbf2949717166a41f05824` (6,206,427,136 B, 2026-08-06)
- Ronan: no agent-store backup

## After the snapshot exists

Re-run the #1262 procedure on exact M2 with provider/channel adapters disabled. Emit exactly one of:

`missing-history` | `missing-boundary-identity` | `required-identity-shape` | `duplicate-history-identity` | `duplicate-mirror-identity` | `mirror-boundary-order` | `history-boundary` | `history-boundary-order` | `source-evidence-mismatch` | `capture-error`

Only then open the owner-specific C2 repair. Replay also needs the in-memory `mirroredMessages` / `settledMessages` / `turnId` from the failing attempt, or an equivalent structural reconstruction that does not print payloads. A DB copy alone is necessary but may not be sufficient if those attempt-local arrays were never persisted.

## Coordination

- Do not fold into openclaw/openclaw#124176 (`sessions_yield` skip; traces had zero yield markers).
- Do not fold into openclaw/openclaw#119901 / karmaterminal/openclaw#1257 (copied-store SQLite plan).
- Do not weaken attestation.

## Mutation gate

No live DB access, no provider credentials, no channel sends, no fleet restart/deploy.
