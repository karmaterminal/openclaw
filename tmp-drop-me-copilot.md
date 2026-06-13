# wo999-cleanse journal (drop-me)

Branch: ronan/999/forcesenderisownerfalse-cleanse
Base: frond-scribe/20260613/assembly-drift-cure @ 599f7ba0
upstream/main a1814586c62: forceSenderIsOwnerFalse=0 (verified)

## Resolution: DROP-AND-RELY (byte-converged, do not re-decide)

Drop forceSenderIsOwnerFalse + resolveEventOwnerDowngrade; rely on upstream's
UNCONDITIONAL sanitizeInboundSystemTags(text).trim() at queue boundary.
`trusted` field becomes dead once resolver removed -> remove it too (matches
upstream SystemEventOptions exactly). Migrate all bundled callers same change.

## Progress

- [x] Reads done, scope understood (issue #999 + 14 comments read)
- [x] src/infra/system-events.ts cleansed (fields + unconditional sanitize + resolver removed)
- [x] src/auto-reply/reply/session-system-events.ts cleansed (block wrapper dropped, drain->string)
- [x] 23 extension prod callsites: dropped forceSenderIsOwnerFalse:true
- [x] ~28 src continuation/agent-runner callsites: dropped trusted:true
- [ ] core tests (system-events.test, session-system-events.test, get-reply-run.media-only.test)
- [ ] continuation tests (delegate-dispatch\*, post-compaction-release)
- [ ] extension monitor tests
- [ ] grep gate = 0
- [ ] tsgo / lint / package-boundary:compile
- [ ] full pnpm test
- [ ] PR + close #999

## Notes

- Unrelated `trusted` usages left alone: diagnostics-otel/prometheus, matrix device-trust
  (cli/verification/legacy-crypto/sdk), searxng, qa-matrix, diagnostic-events, talk/diagnostics.
