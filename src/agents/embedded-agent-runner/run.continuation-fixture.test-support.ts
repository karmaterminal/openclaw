import { expect } from "vitest";

type MockWithCalls = {
  mock: {
    calls: ReadonlyArray<ReadonlyArray<unknown>>;
  };
};

function mockCall(mock: MockWithCalls, callIndex = 0): ReadonlyArray<unknown> {
  const call = mock.mock.calls[callIndex];
  if (!call) {
    throw new Error(`Expected mock call ${callIndex}`);
  }
  return call;
}

function mockCallArg(mock: MockWithCalls, callIndex = 0, argIndex = 0): unknown {
  const call = mockCall(mock, callIndex);
  if (argIndex >= call.length) {
    throw new Error(`Expected mock call ${callIndex} argument ${argIndex}`);
  }
  return call[argIndex];
}

export function expectRecordFields(
  record: unknown,
  expected: Record<string, unknown>,
): Record<string, unknown> {
  if (!record || typeof record !== "object") {
    throw new Error("Expected record");
  }
  const actual = record as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    expect(actual[key]).toEqual(value);
  }
  return actual;
}

export function expectMockCallFields(
  mock: MockWithCalls,
  expected: Record<string, unknown>,
  callIndex = 0,
): Record<string, unknown> {
  return expectRecordFields(mockCallArg(mock, callIndex), expected);
}

export function expectLogExcludes(mock: { mock: { calls: unknown[][] } }, fragment: string): void {
  expect(mock.mock.calls.map((call) => String(call[0])).join("\n")).not.toContain(fragment);
}
