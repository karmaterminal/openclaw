import type { EmbeddedAgentRunResult } from "../../agents/embedded-agent-runner/types.js";

type TestFallbackResult = {
  outcome?: "completed" | "exhausted";
  result: EmbeddedAgentRunResult;
  provider: string;
  model: string;
  attempts: unknown[];
};

type TestFallbackRunner = (params: {
  provider: string;
  model: string;
  runCandidate: (provider: string, model: string) => Promise<EmbeddedAgentRunResult>;
}) => Promise<TestFallbackResult>;

type TestRunEntryParams = {
  selection: { provider: string; model: string };
  onAcceptedTerminal?: () => void | (() => void) | Promise<void | (() => void)>;
  runCandidate: (
    provider: string,
    model: string,
    options: {
      isFallbackRetry: boolean;
      modelRoutingProvenance: {
        requestedProvider: string;
        requestedModel: string;
        stage: "initial";
      };
      contextEngineLogicalTurnLease: object;
      onContextEngineTurnCandidate: () => void;
    },
  ) => Promise<EmbeddedAgentRunResult>;
};

export function createSuccessfulEmbeddedAgentEntryMock(
  getRunWithModelFallback: () => TestFallbackRunner,
) {
  return async (params: TestRunEntryParams) => {
    const { provider, model } = params.selection;
    const fallback = await getRunWithModelFallback()({
      provider,
      model,
      runCandidate: (nextProvider, nextModel) =>
        params.runCandidate(nextProvider, nextModel, {
          isFallbackRetry: false,
          modelRoutingProvenance: {
            requestedProvider: provider,
            requestedModel: model,
            stage: "initial",
          },
          contextEngineLogicalTurnLease: {},
          onContextEngineTurnCandidate: () => {},
        }),
    });
    const releaseAcceptedTerminalWork = await params.onAcceptedTerminal?.();
    try {
      return {
        ...fallback,
        outcome: "completed" as const,
        terminal: {
          outcome: { reason: "completed" as const, status: "ok" as const },
          metadata: {},
        },
        settleSessionOverride: async () => {},
      };
    } finally {
      releaseAcceptedTerminalWork?.();
    }
  };
}
