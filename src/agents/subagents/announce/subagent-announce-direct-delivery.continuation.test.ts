import { expect, it } from "vitest";
import type { SourceReplyDeliveryMode } from "../../../auto-reply/source-reply-delivery-mode.types.js";
import { withDirectAnnounceContinuationFields } from "./subagent-announce-direct-delivery.continuation.js";

// Upstream's direct agent request spread, which the helper replaced at its call site.
const upstreamFields = (mode: SourceReplyDeliveryMode | undefined) =>
  mode ? { sourceReplyDeliveryMode: mode } : {};
const modes = ["automatic", "message_tool_only", undefined] as const;
const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

it("returns upstream's source-reply fields unchanged without continuation facts", () => {
  for (const mode of modes) {
    expect(withDirectAnnounceContinuationFields(mode, {})).toStrictEqual(upstreamFields(mode));
  }
});

it("adds the continuation trigger and trace after upstream's fields, each only when present", () => {
  for (const mode of modes) {
    expect(
      withDirectAnnounceContinuationFields(mode, {
        continuationTriggerOverride: "delegate-return",
        traceparent,
      }),
    ).toStrictEqual({
      ...upstreamFields(mode),
      continuationTrigger: "delegate-return",
      traceparent,
    });
    expect(
      withDirectAnnounceContinuationFields(mode, { continuationTriggerOverride: "work-wake" }),
    ).toStrictEqual({ ...upstreamFields(mode), continuationTrigger: "work-wake" });
    expect(withDirectAnnounceContinuationFields(mode, { traceparent })).toStrictEqual({
      ...upstreamFields(mode),
      traceparent,
    });
  }
  expect(
    Object.keys(
      withDirectAnnounceContinuationFields("message_tool_only", {
        continuationTriggerOverride: "subagent-return",
        traceparent,
      }),
    ),
  ).toEqual(["sourceReplyDeliveryMode", "continuationTrigger", "traceparent"]);
});
