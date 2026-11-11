import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPENCLAW_AGENT_SCHEMA_VERSION,
  OPENCLAW_STATE_SCHEMA_VERSION,
  parsePackageOpenClawSchemaVersions,
} from "./openclaw-schema-versions.js";

describe("published schema version declaration", () => {
  it("matches the runtime's supported database versions", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    expect(parsePackageOpenClawSchemaVersions(manifest)).toEqual({
      state: OPENCLAW_STATE_SCHEMA_VERSION,
      agent: OPENCLAW_AGENT_SCHEMA_VERSION,
    });
  });
});
