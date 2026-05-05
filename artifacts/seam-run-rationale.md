# Seam rationale: src/agents/pi-embedded-runner/run.ts

Three-way basis:

- Base: v2026.5.3 embedded run loop.
- v2026.5.4 side: post-compaction loop guard, abort relay, and guard arming around timeout/overflow/compacted-transcript continuation retry paths.
- Feature side: continuation context-pressure wiring, continuation delegate draining flags, and request-compaction threading.

Resolution:

- Kept v2026.5.4 `createPostCompactionLoopGuard` / persisted-error handling and the abort-controller relay around attempts.
- Kept feature attempt threading for `drainsContinuationDelegateQueue`, `continueWorkOpts`, and `requestCompactionOpts`.
- Preserved v2026.5.4 local `suppressNextUserMessagePersistence` / `onUserMessagePersisted` flow so transcript-continuation retry behavior survives.
- Left the loop guard and continuation paths orthogonal: continuation can evacuate work across compaction, while the guard still detects repeated post-compaction outcomes.
