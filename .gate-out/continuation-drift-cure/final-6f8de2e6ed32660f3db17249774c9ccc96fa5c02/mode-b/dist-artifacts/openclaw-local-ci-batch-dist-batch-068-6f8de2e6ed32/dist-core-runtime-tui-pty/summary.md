# openclaw-local-ci / core-runtime-tui-pty - FAIL (karmaterminal/openclaw@6f8de2e6ed32660f3db17249774c9ccc96fa5c02)

## Gates
- FAIL `test shard (core-runtime-tui-pty)` - 520s

## Tests
- passed: 87; failed: 13

## Failures (12) - deterministic; each must be understood, not accepted
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > launches openclaw chat as local mode through a real PTY
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > launches openclaw terminal as local mode through a real PTY
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > sends the initial message supplied to openclaw tui through a real local PTY
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > prints local usage costs without submitting a model request
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > drives and steers the real local backend with a mocked model endpoint
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > creates and adopts a fresh local session through a real PTY
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > lists local session history through a real PTY
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > keeps whitespace-prefixed bang input in chat after local shell approval
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > confirms and renders local shell output, then extinguishes descendants before TUI exit
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > repairs isolated config through the approved built CLI and resumes local chat
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > authenticates a manifest-discovered provider and resumes the unchanged local model
- [test shard (core-runtime-tui-pty) / test] tui-pty  src/tui/tui-pty-local.e2e.test.ts > TUI PTY real backends > renders safe validation-loop abort diagnostics through the real local backend

## Load-flakes greened on confirm-determinism re-run (1)
- tui-pty  src/tui/tui-pty-harness.e2e.test.ts > TUI PTY harness > preserves xAI account limit errors in terminal output

_full per-gate logs: `gate-*.log` in this artifact_
