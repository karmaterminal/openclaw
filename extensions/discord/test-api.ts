// Discord test API exposes transcript-provider fixtures without deep extension imports.
export const loadDiscordDraftPreview = () =>
  import("./src/monitor/message-handler.draft-preview.js");
export { RequestClient } from "./src/internal/discord.js";
// Core queue fixtures drive the per-agent room-history watermark the Discord monitor owns.
export { createDiscordRoomHistoryWatermarks } from "./src/monitor/room-history-watermark.js";
// Core queue fixtures build queued sources from the Discord gateway frames the monitor admits.
export const loadDiscordMessageContextFixture = async () => {
  const [{ mapGatewayDispatchData }, context, harness] = await Promise.all([
    import("./src/internal/gateway-dispatch.js"),
    import("./src/monitor/message-handler.context.js"),
    import("./src/monitor/message-handler.test-harness.js"),
  ]);
  return { mapGatewayDispatchData, ...context, ...harness };
};
export {
  discordVoiceTranscriptsSourceProvider,
  setDiscordTranscriptsVoiceManager,
} from "./src/voice/transcripts-source.js";

// Voice harness mocks must remain opt-in for provider-only integration tests.
export const loadDiscordVoiceTestHarness = () =>
  import("./src/voice/voice-test-harness.test-support.js");

// Gateway capture proof keeps routing/admission real; only transport edges are substituted.
export const loadDiscordGatewayCaptureFixture = () =>
  import("./src/voice/voice-gateway-capture.test-support.js");

export const loadDiscordReadinessFixture = () => import("./src/monitor/readiness.test-support.js");
