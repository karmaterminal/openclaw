import { expect, it } from "vitest";
import { OpenClawSchema } from "./zod-schema.js";

it("accepts the host-level child memory scope with systemd sizes, off when omitted", () => {
  expect(OpenClawSchema.parse({}).process).toBeUndefined();
  for (const childScope of [
    { enabled: false },
    { enabled: true },
    { enabled: true, memoryMax: "5G", memorySwapMax: "2G" },
    { enabled: true, memoryMax: "1.5G", memorySwapMax: "0" },
    { enabled: true, memoryMax: "64M", memorySwapMax: "infinity" },
  ]) {
    expect(OpenClawSchema.parse({ process: { childScope } }).process).toStrictEqual({
      childScope,
    });
  }
});

it.each([
  { memoryMax: "5g" },
  { memoryMax: "5GB" },
  { memoryMax: "5Gi" },
  { memoryMax: " 5G" },
  { memoryMax: "0" },
  // Tinier caps OOM-kill systemd-run itself before the command starts.
  { memoryMax: "10" },
  { memoryMax: "63M" },
  { memorySwapMax: "2g" },
  { memorySwapMax: "-1" },
  { memorySwapMax: "" },
])("refuses an invalid child scope size: %o", (sizes) => {
  expect(
    OpenClawSchema.safeParse({ process: { childScope: { enabled: true, ...sizes } } }).success,
  ).toBe(false);
});

it("has no per-agent child scope override", () => {
  const agents = (entry: object) => ({ agents: { defaults: {}, entries: { main: entry } } });
  expect(OpenClawSchema.safeParse(agents({})).success).toBe(true);
  expect(
    OpenClawSchema.safeParse(agents({ process: { childScope: { enabled: true } } })).success,
  ).toBe(false);
  expect(
    OpenClawSchema.safeParse({
      agents: { defaults: { process: { childScope: { enabled: true } } } },
    }).success,
  ).toBe(false);
});
