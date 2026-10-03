// Shared fixtures for the spawn-init continue_work suites (opts and races).
import type { ContinuationRecord } from "../../auto-reply/continuation/custody/custody-store.types.js";
import {
  custodyStateForTest,
  listCustodyRecordsForTest,
} from "../../auto-reply/continuation/custody/custody.test-support.js";
import { decodeWorkState } from "../../auto-reply/continuation/work-flow-state.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { EmbeddedAgentRunResult } from "../embedded-agent.js";

export type OwnerRecord = ContinuationRecord & { state: Record<string, unknown> };

export function findFlowByReason(
  records: readonly OwnerRecord[],
  reason: string,
): OwnerRecord | undefined {
  return records.find((record) => decodeWorkState(record)?.reason === reason);
}

/** Every custody record the owner holds, FIFO, with its state parsed. */
export async function listOwnerRecords(ownerKey: string): Promise<OwnerRecord[]> {
  return (await listCustodyRecordsForTest({ ownerSessionKey: ownerKey })).map((record) =>
    Object.assign(record, { state: custodyStateForTest(record) }),
  );
}

export function makeEmbeddedResult(): EmbeddedAgentRunResult {
  return {
    payloads: [{ text: "ok" }],
    meta: {
      durationMs: 1,
      finalAssistantVisibleText: "ok",
      agentMeta: {
        sessionId: "session-embedded",
        provider: "anthropic",
        model: "claude-sonnet-4.7",
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          total: 2,
        },
      },
    },
  };
}

export function requestContinueWork(
  callArgs: unknown,
  request: { reason: string; delaySeconds: number },
): void {
  const opts = callArgs as {
    continueWorkOpts?: { requestContinuation: (value: typeof request) => void };
  };
  opts.continueWorkOpts?.requestContinuation(request);
}

export function makeContinuationEnabledConfig(): OpenClawConfig {
  return {
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          maxChainLength: 200,
          defaultDelayMs: 15000,
          minDelayMs: 5000,
          maxDelayMs: 86400000,
          costCapTokens: 50000000,
          maxDelegatesPerTurn: 500,
        },
      },
    },
  } as unknown as OpenClawConfig;
}

export function makeContinuationDisabledConfig(): OpenClawConfig {
  return {
    agents: {
      defaults: {},
    },
  } as unknown as OpenClawConfig;
}

// Continuation enabled but pinned at the chain cap (maxChainLength:1): a session
// already at currentChainCount:1 trips checkContinuationBudget on the FIRST
// election, so scheduleContinuationWorkBatch returns scheduledCount:0.
export function makeAtCapContinuationConfig(): OpenClawConfig {
  return {
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          maxChainLength: 1,
          defaultDelayMs: 15000,
          minDelayMs: 5000,
          maxDelayMs: 86400000,
          costCapTokens: 50000000,
          maxDelegatesPerTurn: 500,
        },
      },
    },
  } as unknown as OpenClawConfig;
}
