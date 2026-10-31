# Discord room inline image trace findings

## Boundaries and evidence refs

`CLAIM` means traced directly in the composite source. `INFERRED` means live timing or journal evidence does not prove the exact branch without a transcript or packet capture.

| Category            | Ref                                                 | Full SHA / server state                                      | Equality                                                           |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Product/base        | live fleet composite `frond/1415-room-collect-base` | `22f49a43a118f86dfd8c95dd5b2850420aa8bcad`                   | local HEAD, lane HEAD, origin lane, and base are equal at this SHA |
| Lane                | `codeagent/discord-room-image-inline-trace`         | local and origin: `22f49a43a118f86dfd8c95dd5b2850420aa8bcad` | published unchanged before evidence collection                     |
| CI/workflow         | N/A                                                 | N/A                                                          | read-only lane; no CI dispatch                                     |
| Presentation        | N/A                                                 | N/A                                                          | no UI or PR presentation                                           |
| Docs/proof          | this findings file                                  | N/A until the lane commit                                    | output file is the only deliverable                                |
| Upstream comparison | `openclaw/openclaw main`                            | `d49eb3acca8e222910a69b8be53aaee522926685`                   | fetched for parity comparison; this was not the lane base          |
| Related issue       | `karmaterminal/openclaw#1415`                       | N/A                                                          | binding preserved in every commit                                  |

The upstream SHA in the table is the fetched `upstream/main` SHA recorded while tracing. The base-composite ref is not a merge of upstream main: merge base with upstream main is `7fdf69f5e63d6015070ead83ccfd62304039eb1a`.

## Executive result

**The image bytes and staged paths are real; OpenClaw also has a native inline-image route. The live “attachment unavailable” reports are not evidence that the resize failed or that image viewing is broken. The exact likely failure is presentation projection: the message became a Discord history entry or room/collected event for which the model-side media carrier did not retain a loaded image fact.**

The strongest exact live failure point in source is the Discord history renderer at `extensions/discord/src/monitor/message-handler.recent-history.ts:165`: when the current REST attachment IDs outnumber the cached staged media entries, it rewrites the history body with `[discord historical attachment unavailable]`. There is no later image retry at that projection boundary.

`Image resized to fit limits` is separate from “unavailable.” It runs in `src/agents/tool-images.ts:288` after image sanitization/resize. The same sanitizer is used for native prompt blocks and tool-result images, so the journal line alone does not prove which owner produced the image block (`src/agents/tool-images.ts`, `src/agents/embedded-agent-runner/run/images.ts`, and `src/agents/tools/image-tool.ts` all participate). **INFERRED for this live case:** a resize proves image bytes passed an image sanitizer, but the journal does not identify whether they reached provider input, a tool-result image, or an off-path retry.

## A. Trigger image

1. **CLAIM — Discord fetch and stage.** `resolveMediaList()` downloads triggering-message attachments and forwards a saved `path`, content type, filename, and kind (`extensions/discord/src/monitor/message-media.ts:145-202`, especially `resolveMediaList` at 213). The saved media is an inbound UUID-backed file beneath the media store from `src/media/store.ts:482-520`; `resolveMediaScopedDir`/`getMediaDir` choose the managed inbound directory.
2. **CLAIM — Context facts.** The plugin converts saved entries to canonical media facts with `toInboundMediaFactsWithMetadata()` (`extensions/discord/src/monitor/message-handler.context.ts:530-532`). The normalized context owns `{path, contentType, kind, messageId}` facts and legacy media projections.
3. **CLAIM — Native turn preparation.** `resolveCurrentTurnImages()` sees current undiscribed image attachments, calls `resolveAgentTurnAttachments(... includeRecentHistoryImages:false)`, reads the staged path, and creates `ImageContent` blocks `{type:"image", data:<base64>, mimeType:<...>}` (`src/auto-reply/reply/current-turn-images.ts:122-166`, `src/auto-reply/reply/agent-turn-attachments.ts`).
4. **CLAIM — Native/provider projection.** If the active model advertises image input, `detectAndLoadPromptImages()` hydrates staged facts and returns inline image blocks after sanitization (`src/agents/embedded-agent-runner/run/images.ts:250-360`). The OpenAI Responses replay converts each image block to `input_image` with a `data:image/...;base64,...` URL (`packages/ai/src/transports/openai-responses-replay-messages-internal.ts:428-437`; `packages/ai/src/transports/responses-image-payload-sanitizer.ts:20-29`).
5. **CLAIM — Native codex route.** The primary-route handshake switches the `openai-chatgpt-responses` transport to `openclaw-native-codex-responses` (`src/agents/embedded-agent-runner/stream-resolution.ts:150-168`). Its provider transport also has an `input_image` conversion path; native Responses replay retains image blocks when `model.input.includes("image")` and filters them only for text-only model definitions.
6. **INFERRED — Live trigger classification.** With `requireMention:false`, `allowBots:true`, and a 45-second debounce, an image-only or image-plus-text Discord message may become the debounce trigger or it may be collected/recorded as a room event. The journal timing is not enough to identify this per message. A triggering native image should pass from Discord staging to inline `input_image` when the active model catalog reports vision and no image description handoff has superseded it.

## B. History image

1. **CLAIM — REST history.** Discord `recoverDiscordChannelHistory()` fetches prior REST rows and builds a text history entry. It obtains `mediaIds` from attachment IDs/sticker IDs, then compares them with the cached media projection (`extensions/discord/src/monitor/message-handler.recent-history.ts:132-165`).
2. **CLAIM — Exact unavailable rewrite.** If a row had attachments/stickers but cache entries no longer cover all native IDs, `formatInboundMediaUnavailableText()` appends `[discord historical attachment unavailable]` and the entry carries no matching `media` array. The same projection can retain text/caption while erasing bytes.
3. **CLAIM — No image fetch in this fallback.** The recent-history branch is a cached projection; it does not redownload missing attachment IDs. It is therefore not a transient media-understanding failure: the body is upgraded to an unavailable notice at this boundary.
4. **CLAIM — Native recent-history reattachment.** When cache entries survive unchanged, history media can be converted to `history.media` and then `resolveRecentInboundHistoryImages()` restricts it to local images in the last 30 minutes and four newest images (`src/auto-reply/reply/history-media.ts:30-97`). `resolveAgentTurnAttachments()` can rehydrate the local path into native image blocks, but only if the current turn is not already supplying an image (`src/auto-reply/reply/agent-turn-attachments.ts:83-135`).
5. **INFERRED — Most likely live case.** The explicit first-party notice in the princes’ reports matches the cache-mismatch branch more closely than a provider limitation. This is the exact source point that makes model-facing text say unavailable while direct viewing of saved files remains possible.

## C. Collected-member image

1. **CLAIM — Room event or collected owner.** Under `messages.queue.byChannel.discord=collect`, room events are queued instead of producing individual user turns (`src/auto-reply/reply/queue/envelope.ts:269-274`, `src/auto-reply/reply/queue/delivery-context.ts:336-365`). The renderer labels each member as `Queued #n (from sender)` (`src/auto-reply/reply/queue/envelope.ts:50-76`; collected room test at `src/auto-reply/reply/queue.room-event-collect.test.ts:227-230`).
2. **CLAIM — Media is carried separately.** `collectQueuedPromptMedia()` concatenates member `images`, `imageOrder`, and `media` facts and offsets slot provenance (`src/auto-reply/reply/queue/envelope.ts:83-129`). The media carrier also has an owned regression proving collect carries inline/offloaded images and media facts (`src/auto-reply/reply/queue.media-carrier.test.ts:120-220`, its real `q.calls` result).
3. **CLAIM — Prompt text and bytes have separate representations.** The aggregate prompt contains sender labels and source text; native image bytes come from aggregate `images` or staged `media`, then the runner uses the same image loader as current turns. `reply_media_context` is measured immediately after collection (`src/auto-reply/reply/agent-runner-execution.ts:187-193`).
4. **INFERRED — The live collected-image result.** When all collected members preserve `currentTurnImagesPrepared`, the model should receive their inline/image facts. If a member loses prepared facts or the aggregate owns only text/`media` with a missing path, it becomes a media note or unavailable marker rather than a provider image. The 45-second debounce makes this branch plausible, and the live three-image batches are consistent with two flood-collected groups. A single image message with text can also be a trigger; timing alone does not distinguish those branches.

## Provider route and resize

1. **CLAIM — Codex Responses support.** Native OpenAI/Codex replay emits `input_image` for image-bearing user/tool-result content when `model.input` includes image. The route is therefore capable of inline image input. It is not image-tool-only.
2. **CLAIM — Vision handoff.** Media understanding skips image description when the active primary model supports native vision and no explicit image understanding config is present (`src/media-understanding/runner.ts:712-739`). If native vision is active, the image is handed to `detectAndLoadPromptImages()` for native hydration instead of `imageModel`.
3. **CLAIM — Text-only fallback/description.** If native vision is unavailable, media understanding can run the configured image model and enrich context with its description. Described image facts are suppressed from native hydration; text is the intended presentation (`src/media-understanding/apply.ts:250-290`, `src/auto-reply/reply/get-reply-run-helpers.ts:10-53`).
4. **CLAIM — This configuration.** The evidence names `gpt-6-sol`/`gpt-6.1-sol` as primary and `github-copilot/gemini-3.1-pro-preview` as imageModel. It does not include `tools.media.image`, so native vision is eligible only if the active model catalog marks the Codex route as vision-capable. The evidence also does not give a provider-catalog snapshot, so the effective native-vs-imageModel branch is **INFERRED**, not directly proved.
5. **CLAIM — Unavailability at provider boundary.** If native vision was selected but the prepared message contained neither inline blocks nor usable staged facts, a provider cannot receive the image. The exact producer-side unavailable boundary is either missing history cache media at `message-handler.recent-history.ts:165`, a collected/media ownership loss before `collectQueuedPromptMedia()`, or the runner’s failed hydration count. The resize log does not contradict this: it may belong to a separate `view_image` or tool-result sanitization call.

## Direct viewing

**CLAIM:** `view_image` loads a local path or permitted URL, optimizes/sanitizes it, then returns it in the tool result as image blocks plus text; native results are private model context (`src/agents/tools/image-tool.ts:289-330`, `410-500`, `480-537`). Thus direct viewing works because this tool bypasses the missing room/history projection and reads the staged file directly. The staged file is the managed UUID-backed inbound media file returned by `saveMediaBuffer()` and retained in the media-store fact/`path` chain.

## #1513/#1514 and upstream verdict

**CLAIM — Upstream parity for history.** `extensions/discord/src/monitor/message-handler.recent-history.ts` has no diff between this lane’s base `22f49a...` and fetched upstream `d49eb3...`. The historical unavailable notice and cache-ID mismatch therefore exist upstream too, not only in the fork’s #1513/#1514 changes.

**CLAIM — Fork adds room/collect behavior.** #1514 room-event collection and #1513 room-history watermarks are present at this composite and alter which Discord ingress becomes `room_event` or remains a normal trigger. The relevant queue carrier code combines member images/media and is therefore fork-owned behavior, but the code already demonstrates an intended carrier path rather than deliberately dropping images. Upstream main does not contain the fork’s room-event collect implementation, so no equivalent upstream room-collect negative control exists locally.

**Verdict:** It would be inaccurate to label the unavailable mechanism a #1513/#1514 regression. The exact unavailable notice predates/exists independently in upstream. The fork likely **exposes or changes the frequency** of the upstream history/inline presentation split by routing more same-room traffic into `room_event`/collected/history representations. Any new deficiency after #1513/#1514 must be proved at the collected media carrier or room-history cache recorder, not inferred from upstream parity alone.

## Fix proposal

Own the fix at the **Discord inbound media projection + queue carrier boundary**, with provider routing remaining a consumer.

- In `extensions/discord`, every admitted current/room/history event should preserve one canonical ordered media fact with `messageId`, `path` where staging succeeded, native attachment ID, kind, content type, and `hydrationSuppressed` only when media understanding explicitly describes it.
- `recoverDiscordChannelHistory()` should use `media` cache entries if IDs match; if staging is absent, it may emit the notice. It must not silently replace an available staged image with the notice. Prefer asynchronous/retried cache hydration once per ID, then one check at model-context materialization.
- `collectQueuedPromptMedia()` should remain the single owner for aggregate image ordering/media layout. It already merges `images`, `imageOrder`, and `media`; the fix should strengthen invariants rather than add a second projection. Every room-event member included in a collect turn must carry media facts and image slots, or an explicit failed/unsupported fact. Tests must assert provider-admission bytes, not only prompt text.
- Native image hydration (`detectAndLoadPromptImages`) should remain the runner owner of file-to-base64 conversion and sanitization. It must be the only producer of `input_image` for native models; `imageModel` stays a fallback description owner. Do not route historical image facts through the image tool merely to compensate for a lost carrier.
- Direct `view_image` behavior can remain as the explicit manual inspection path; it should not become the implicit room image presentation mechanism.

## RED test

**Invariants**

- Exact queued image media facts, inline slot provenance, and provider request image blocks are one identity-preserving composition.
- A collected room member’s image may be text-only after an explicit hydration failure, but it must never appear merely as a generic unavailable notice when its staged fact/path still exists.
- The native Codex/Responses path is the same owner for trigger, history-with-cache, and collected-member native input.

**Recommended deterministic regression (red on rejected SHA before fix)**

Add or extend one production-boundary test alongside `queue.room-event-collect.test.ts` and `queue.media-carrier.test.ts`:

```text
one room message with sender A and a staged PNG fact/path
+ one image-less member from sender B collected under Discord collect/45s debounce
-> render both Queued # entries
-> keep the PNG media fact and inline image slot in collectQueuedPromptMedia()
-> submit the aggregate through prepareEmbeddedAttemptPromptExecution()
-> assert the Codex/Responses request contains exactly one valid input_image
   data URL derived from the staged PNG, and no
   "[discord historical attachment unavailable]" or
   "[Attachment images omitted: this model does not support image input]"
```

The pre-fix negative control should fail for the expected reason. A plausible historical negative control is one cached REST history row containing an unchanged PNG media ID and path; the test must assert that native history hydration emits one `input_image`, but the current Discord recovery code incorrectly emits the unavailable notice when cache identity is missing/mismatched. It should also include the nearest sibling: history cache unchanged returns inline bytes, history cache attachment ID edited does not reuse stale caption/media, and collected mixed members retain the exact PNG slot.

This lane cannot execute a RED because the workorder forbids tests. The test is therefore a proposed gate, not a passing receipt. Real persistence/restart proof needs the existing transcript recorder to retain media facts, the runner to rehydrate them, and a restart/recovery replay to retain the same image; rollback is covered by keeping stale-ID history unavailable instead of substituting stale bytes.
