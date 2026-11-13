import { describe, expect, it } from "vitest";
import { computeBaseConfigSchemaResponse } from "./schema-base.js";
import { MarkdownConfigSchema } from "./zod-schema.core.js";
import { OpenClawSchema } from "./zod-schema.js";
import { GroupChatSchema } from "./zod-schema.messages.js";

describe("config schema regressions", () => {
  it("accepts historyLimit: 0", () => {
    expect(GroupChatSchema.unwrap().safeParse({ historyLimit: 0 }).success).toBe(true);
  });

  // Frond (karmaterminal, #1415): the ambient owner peers list, globally and per agent.
  it("accepts ambient owner peer ids and refuses a wildcard or a duplicate", () => {
    const accepts = (peers: unknown[]) =>
      [
        { messages: { groupChat: { ambientOwnerAggregatePeers: peers } } },
        { agents: { entries: { main: { groupChat: { ambientOwnerAggregatePeers: peers } } } } },
      ].map((config) => OpenClawSchema.safeParse(config).success);
    expect(accepts([])).toEqual([true, true]);
    expect(accepts(["123456789012345678", "discord:223456789012345678", 42])).toEqual([true, true]);
    for (const peers of [["*"], ["discord:*"], ["42", " 42 "], ["42", 42]]) {
      expect(accepts(peers)).toEqual([false, false]);
    }
  });

  it("accepts markdown table block mode", () => {
    expect(MarkdownConfigSchema.parse({ tables: "block" })).toEqual({ tables: "block" });
  });

  it("accepts string-array media provider options", () => {
    const providerOptions = { deepgram: { keyterm: ["OpenClaw", "Deepgram"] } };
    const media = {
      audio: { providerOptions },
      models: [{ provider: "deepgram", model: "nova-3", providerOptions }],
    };

    expect(OpenClawSchema.parse({ tools: { media } }).tools?.media).toEqual(media);
  });

  it("rejects invalid cron.sessionRetention durations", () => {
    expect(() => OpenClawSchema.parse({ cron: { sessionRetention: "abc" } })).toThrow(
      /sessionRetention|duration/i,
    );
  });

  it("round-trips desktop host config and rejects unsafe or unknown fields", () => {
    const host = { enabled: true, managed: true, port: 5901, passwordFile: "/run/vnc/passwd" };
    expect(OpenClawSchema.parse({ desktop: { host } }).desktop).toStrictEqual({ host });
    expect(
      OpenClawSchema.safeParse({ desktop: { host: { enabled: true, port: 0 } } }).success,
    ).toBe(false);
    expect(
      OpenClawSchema.safeParse({ desktop: { host: { enabled: true, passwordFile: "relative" } } })
        .success,
    ).toBe(false);
    expect(
      OpenClawSchema.safeParse({ desktop: { host: { enabled: true, manageServer: true } } })
        .success,
    ).toBe(false);
  });

  it("round-trips the Templates Labs visibility setting", () => {
    for (const templates of [true, false]) {
      expect(
        OpenClawSchema.parse({ gateway: { controlUi: { experimental: { templates } } } }).gateway
          ?.controlUi?.experimental?.templates,
      ).toBe(templates);
    }
  });

  it("projects schema-owned field documentation into the public schema and UI hints", () => {
    const response = computeBaseConfigSchemaResponse({ generatedAt: "desktop-metadata" });
    expect(response.schema).toHaveProperty(
      ["properties", "desktop", "properties", "host", "properties", "passwordFile", "title"],
      "Local VNC Password File",
    );
    expect(response.uiHints["desktop.host.passwordFile"]).toMatchObject({
      label: "Local VNC Password File",
      help: "Absolute path to the VNC password file. Omit on macOS to enter account credentials when opening the desktop viewer.",
    });
    expect(response.uiHints["gateway.controlUi.experimental.templates"]).toMatchObject({
      label: "Templates",
      help: expect.stringContaining("default: false"),
    });
  });
});
