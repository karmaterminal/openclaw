import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let configOverride: ReturnType<(typeof import("../../config/config.js"))["loadConfig"]> = {};

vi.mock("../../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => configOverride,
  };
});

import {
  invalidateContinuationGeneration,
  isContinuationGenerationCurrent,
  resetContinuationGenerationsForTests,
  scheduleContinuationGeneration,
} from "./continuation-generation.js";

describe("continuation generation guard", () => {
  beforeEach(() => {
    configOverride = {};
    resetContinuationGenerationsForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetContinuationGenerationsForTests();
  });

  it("reads generationGuardTolerance at fire time for scheduled timers", async () => {
    configOverride = {
      agents: {
        defaults: {
          continuation: {
            generationGuardTolerance: 300,
          },
        },
      },
    };

    const sessionKey = "agent:main:test:guard-hot-reload";
    const scheduledGeneration = scheduleContinuationGeneration(sessionKey);
    const fired = vi.fn();

    setTimeout(() => {
      if (isContinuationGenerationCurrent(sessionKey, scheduledGeneration)) {
        fired();
      }
    }, 1_000);

    configOverride = {
      agents: {
        defaults: {
          continuation: {
            generationGuardTolerance: 500,
          },
        },
      },
    };

    for (let i = 0; i < 400; i += 1) {
      scheduleContinuationGeneration(sessionKey);
    }

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it("invalidates in-flight timers by jumping past the live tolerance window", () => {
    configOverride = {
      agents: {
        defaults: {
          continuation: {
            generationGuardTolerance: 5,
          },
        },
      },
    };

    const sessionKey = "agent:main:test:guard-invalidate";
    const scheduledGeneration = scheduleContinuationGeneration(sessionKey);

    invalidateContinuationGeneration(sessionKey);

    expect(isContinuationGenerationCurrent(sessionKey, scheduledGeneration)).toBe(false);
  });
});
