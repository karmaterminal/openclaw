# CoT Leak Investigation — 2026-04-20

## Bug Summary

When assistant output ends with `NO_REPLY`, text **before** the token leaks to
Discord as a visible bot message. The `NO_REPLY` token itself is stripped, but
the preamble (internal reasoning / analysis) ships to the channel.

Config under test:
```json
"discord": {
  "streaming": { "mode": "off", "block": { "enabled": false } }
}
```

---

## 1. Where the assistant body is dispatched to Discord

### Final reply path (streaming OFF, block streaming OFF)

1. Agent runs → produces `runResult.payloads` (raw assistant output)
2. `buildReplyPayloads` (`src/auto-reply/reply/agent-runner-payloads.ts:90`)
   processes raw payloads through `normalizeReplyPayloadDirectives` (line 146)
   — this calls `parseReplyDirectives` which only does **exact-match** silent
   detection via `isSilentReplyPayloadText`
3. Payloads pass `isRenderablePayload` filter (line 158) — any text = renderable
4. `sendFinalPayload` → `dispatcher.sendFinalReply(payload)`
   (`src/auto-reply/reply/dispatch-from-config.ts:626`)
5. `enqueue("final", payload)` in reply-dispatcher.ts:133 →
   `normalizeReplyPayloadInternal` → **`normalizeReplyPayload`**
   (`src/auto-reply/reply/normalize-reply.ts:34`)
6. Dispatcher's `deliver` callback fires →
   `deliverDiscordReply` → `sendDiscordPayloadText` → Discord API

### Block reply path (streaming OFF)

When `streaming.mode = "off"` and `streaming.block.enabled = false`:
- `createBlockReplyDeliveryHandler` (`src/auto-reply/reply/reply-delivery.ts:124-139`):
  text-only blocks fall through to line 138 comment:
  *"When streaming is disabled entirely, text-only blocks are accumulated in final text."*
- **No intermediate block text leaks** — text accumulates into the final reply payload

### Streaming config IS read

- Discord handler reads `streaming.mode` at `extensions/discord/src/monitor/message-handler.process.ts:571`
- `resolveDiscordPreviewStreamMode` → `"off"` → `canStreamDraft = false` → no `draftStream`
- `resolveChannelStreamingBlockEnabled` → `false` → `disableBlockStreaming = true`
- Both correctly propagated to `dispatchInboundMessage` at line 881-885

**The config is honored for preview streaming and block streaming.** The bug is
not that config is ignored — it's that the **final reply normalization** strips
the token but delivers the preamble.

---

## 2. Where NO_REPLY is stripped/detected

### `src/auto-reply/tokens.ts`

- **Line 5**: `SILENT_REPLY_TOKEN = "NO_REPLY"`
- **Line 34-43**: `isSilentReplyText` — **exact match only** (whole text is `NO_REPLY`
  with optional whitespace). Comment at line 42:
  ```
  // This prevents substantive replies ending with NO_REPLY from being suppressed (#19537).
  ```
- **Line 88-90**: `stripSilentToken` — strips **trailing** NO_REPLY via regex
  `(?:^|\s+|\*+)NO_REPLY\s*$`

### `src/auto-reply/reply/normalize-reply.ts:57-78` (THE BUG SITE)

```typescript
// Line 57-62: Exact-match check → returns null (correct)
if (text && isSilentReplyPayloadText(text, silentToken)) {
  if (!hasContent("")) { return null; }
  text = "";
}
// Line 67-78: Strip path for mixed content
if (text && !isSilentReplyText(text, silentToken)) {
  const hasLeadingSilentToken = startsWithSilentToken(text, silentToken);
  if (hasLeadingSilentToken) {
    text = stripLeadingSilentToken(text, silentToken);
  }
  if (hasLeadingSilentToken || text.includes(silentToken)) {
    text = stripSilentToken(text, silentToken);      // ← strips trailing NO_REPLY
    if (!hasContent(text)) {                          // ← but remaining text HAS content
      opts.onSkip?.("silent");
      return null;                                    // ← so this doesn't fire
    }
    // ← text "Here's my analysis..." passes through  ← BUG
  }
}
```

### `src/auto-reply/reply/reply-directives.ts:34`

`isSilentReplyPayloadText` — exact match only. "text\nNO_REPLY" is NOT
detected as silent here. Text passes through unchanged to the dispatcher.

---

## 3. WHY text before NO_REPLY still ships when streaming is off

**Root cause**: `normalizeReplyPayload` at `src/auto-reply/reply/normalize-reply.ts:67-78`.

The function correctly strips the trailing `NO_REPLY` token via `stripSilentToken`.
But then it checks `hasContent(text)` on the **remaining** text. When there IS
remaining content (the preamble/reasoning before the token), the payload is
**returned with the preamble text**, which the dispatcher delivers to Discord.

**The design assumes** trailing NO_REPLY means "accidental token, deliver the
real text." **The reality is** trailing NO_REPLY means "suppress this entire turn —
the preamble is internal reasoning, not user-facing content."

### Hypothesis eliminated

| Hypothesis | Evidence | Status |
|---|---|---|
| Streaming config not read | Config IS read at `message-handler.process.ts:571-575` | ELIMINATED |
| Block streaming sends partial text | Text-only blocks NOT sent when disabled (reply-delivery.ts:138) | ELIMINATED |
| Draft stream leaks text | No `draftStream` created when `mode = "off"` (line 581) | ELIMINATED |
| Mid-turn tool call flushes text | Block handler returns early for text-only when streaming off | ELIMINATED |
| `normalizeReplyPayload` strips token but delivers preamble | **Confirmed** — line 73 strips, line 74 checks hasContent, preamble passes through | **ROOT CAUSE** |

### Confirming test

The existing test at `src/auto-reply/reply/reply-utils.test.ts:119-126` **explicitly
asserts the buggy behavior**:

```typescript
it("strips NO_REPLY appended after substantive text (#30916)", () => {
  const result = normalizeReplyPayload({
    text: "File's there. Not urgent.\n\nNO_REPLY",
  });
  expect(result).not.toBeNull();           // ← asserts preamble is KEPT
  expect(result!.text).toContain("File's there");
  expect(result!.text).not.toContain("NO_REPLY");
});
```

This test encodes the #30916 fix which chose to strip-and-deliver. That choice
causes the CoT leak.

---

## 4. Proposed fix

**Principle**: Trailing `NO_REPLY` = "suppress the entire turn." The preamble is
internal reasoning that should not reach external channels. Leading `NO_REPLY`
(glued to content) continues to be stripped with content preserved, as that's a
different pattern (model accidentally prefixed the token).

### Diff

```diff
diff --git a/src/auto-reply/reply/normalize-reply.ts b/src/auto-reply/reply/normalize-reply.ts
index abc1234..def5678 100644
--- a/src/auto-reply/reply/normalize-reply.ts
+++ b/src/auto-reply/reply/normalize-reply.ts
@@ -64,13 +64,18 @@ export function normalizeReplyPayload(
   // Strip NO_REPLY from mixed-content messages (e.g. "😄 NO_REPLY") so the
   // token never leaks to end users.  If stripping leaves nothing, treat it as
   // silent just like the exact-match path above.  (#30916, #30955)
   if (text && !isSilentReplyText(text, silentToken)) {
     const hasLeadingSilentToken = startsWithSilentToken(text, silentToken);
     if (hasLeadingSilentToken) {
       text = stripLeadingSilentToken(text, silentToken);
     }
     if (hasLeadingSilentToken || text.includes(silentToken)) {
-      text = stripSilentToken(text, silentToken);
-      if (!hasContent(text)) {
+      const stripped = stripSilentToken(text, silentToken);
+      const hadTrailingToken = stripped.length < text.length;
+      text = stripped;
+      // A trailing NO_REPLY means the model intended to suppress the entire
+      // turn — the preamble is internal reasoning, not user-facing content.
+      // Suppress the full message to prevent CoT/reasoning leaks.
+      if (!hasContent(text) || hadTrailingToken) {
         opts.onSkip?.("silent");
         return null;
       }
     }
   }
```

### Test update

```diff
diff --git a/src/auto-reply/reply/reply-utils.test.ts b/src/auto-reply/reply/reply-utils.test.ts
index abc1234..def5678 100644
--- a/src/auto-reply/reply/reply-utils.test.ts
+++ b/src/auto-reply/reply/reply-utils.test.ts
@@ -112,13 +112,13 @@ describe("normalizeReplyPayload", () => {
-  it("strips NO_REPLY from mixed emoji message (#30916)", () => {
-    const result = normalizeReplyPayload({ text: "😄 NO_REPLY" });
-    expect(result).not.toBeNull();
-    expect(result!.text).toContain("😄");
-    expect(result!.text).not.toContain("NO_REPLY");
+  it("suppresses message when trailing NO_REPLY follows emoji (#30916)", () => {
+    const result = normalizeReplyPayload({ text: "😄 NO_REPLY" });
+    expect(result).toBeNull();
   });

-  it("strips NO_REPLY appended after substantive text (#30916)", () => {
+  it("suppresses message when trailing NO_REPLY follows substantive text (#30916)", () => {
     const result = normalizeReplyPayload({
       text: "File's there. Not urgent.\n\nNO_REPLY",
     });
-    expect(result).not.toBeNull();
-    expect(result!.text).toContain("File's there");
-    expect(result!.text).not.toContain("NO_REPLY");
+    expect(result).toBeNull();
   });
```

### Scope & limitations

- **Fixes the reported bug**: streaming OFF + block streaming OFF. The final
  payload now gets suppressed instead of leaking the preamble.
- **Does NOT fix streaming ON with block streaming ON**: in that case,
  intermediate block replies may have already been sent to Discord before
  `NO_REPLY` arrives at the end of the turn. That requires a fundamentally
  different fix (post-hoc message deletion or turn-level buffering).
- **Changes behavior for leading-only + trailing combo**: if text has BOTH a
  leading NO_REPLY (stripped) and a trailing NO_REPLY, the whole message is now
  suppressed. This is correct — the trailing token signals full suppression.
- **Preserves non-trailing NO_REPLY**: text with NO_REPLY in the middle only
  (not at the end) continues to pass through unchanged.

---

## Root Cause (one-line)

`normalizeReplyPayload` (`src/auto-reply/reply/normalize-reply.ts:72-73`)
strips trailing `NO_REPLY` but checks `hasContent()` on the remaining preamble,
which passes — so the preamble ships to Discord as a visible message.
