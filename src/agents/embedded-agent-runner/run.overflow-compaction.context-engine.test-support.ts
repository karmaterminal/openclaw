import { type Mock, vi } from "vitest";
import type { ContextEngine, ContextEngineSessionTarget } from "../../context-engine/types.js";

// Context-engine mock shared by the overflow compaction harness; the harness resets it per test.
type MockCompactionResult =
  | {
      ok: true;
      compacted: true;
      result: {
        summary: string;
        firstKeptEntryId?: string;
        tokensBefore?: number;
        tokensAfter?: number;
        sessionId?: string;
        sessionFile?: string;
        sessionTarget?: ContextEngineSessionTarget;
      };
      reason?: string;
    }
  | {
      ok: false;
      compacted: false;
      reason: string;
      result?: undefined;
    }
  | {
      ok: true;
      compacted: false;
      reason: string;
      result?: undefined;
    };

type MockContextEngine = {
  info: { ownsCompaction: boolean };
  compact: Mock<(params: unknown) => Promise<MockCompactionResult>>;
  maintain: ContextEngine["maintain"];
};

export const mockedContextEngine: MockContextEngine = {
  info: { ownsCompaction: false as boolean },
  compact: vi.fn<(params: unknown) => Promise<MockCompactionResult>>(async () => ({
    ok: false as const,
    compacted: false as const,
    reason: "nothing to compact",
  })),
  maintain: undefined,
};
