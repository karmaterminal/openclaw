import { expect, it } from "vitest";
import { OpenClawSchema } from "./zod-schema.js";

it("accepts the host-level child memory scope with systemd sizes, off when omitted", () => {
  expect(OpenClawSchema.parse({}).process).toBeUndefined();
  for (const childScope of [
    { enabled: true },
    { enabled: true, memoryMax: "1.5G", memorySwapMax: "0" },
    { enabled: true, memoryMax: "64M", memorySwapMax: "infinity" },
  ]) {
    expect(OpenClawSchema.parse({ process: { childScope } }).process).toStrictEqual({
      childScope,
    });
  }
});

it.each([
  // systemd rejects lowercase and non-binary suffixes, and padded values.
  { memoryMax: "5g" },
  { memoryMax: "5Gi" },
  { memoryMax: " 5G" },
  // Tinier caps OOM-kill systemd-run itself before the command starts.
  { memoryMax: "0" },
  { memoryMax: "63M" },
  { memorySwapMax: "2g" },
  { memorySwapMax: "-1" },
])("refuses an invalid child scope size: %o", (sizes) => {
  expect(
    OpenClawSchema.safeParse({ process: { childScope: { enabled: true, ...sizes } } }).success,
  ).toBe(false);
});
