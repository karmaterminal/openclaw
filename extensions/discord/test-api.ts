// Discord test API exposes transcript-provider fixtures without deep extension imports.
export const loadDiscordDraftPreview = () =>
  import("./src/monitor/message-handler.draft-preview.js");
export { RequestClient } from "./src/internal/discord.js";
// Core queue fixtures drive the per-agent room-history watermark the Discord monitor owns.
export { createDiscordRoomHistoryWatermarks } from "./src/monitor/room-history-watermark.js";
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
