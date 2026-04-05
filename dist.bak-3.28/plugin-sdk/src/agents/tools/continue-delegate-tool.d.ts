import type { AnyAgentTool } from "./common.js";
/**
 * Creates the `continue_delegate` tool.
 *
 * This tool dispatches a sub-agent as a continuation delegate — tracked by the
 * gateway's continuation chain (cost caps, depth limits, chain counters).
 *
 * Architecture (Path A — side-channel):
 *   1. Tool writes to the module-level pending-delegate store during execution.
 *   2. After the agent's response finalizes, `agent-runner.ts` reads from the
 *      store and feeds delegates into the same scheduler that bracket-parsed
 *      `[[CONTINUE_DELEGATE:]]` signals use.
 *   3. Both paths (tool + brackets) converge at the same dispatch point —
 *      same cost cap, same chain depth, same delay clamping.
 *
 * The tool can be called multiple times per turn (multi-delegate fan-out).
 * Each call enqueues independently. No single-per-response regex limitation.
 *
 * NOTE: Delayed fan-out (multiple delegates with delaySeconds > 0) is subject
 * to the generation guard — each scheduled timer checks that the session's
 * generation counter hasn't advanced. In busy channels, intervening messages
 * may cancel earlier timers. Use delaySeconds: 0 for reliable parallel fan-out,
 * or set generationGuardTolerance >= N-1 for N delayed delegates.
 */
export declare function createContinueDelegateTool(opts: {
    agentSessionKey?: string;
}): AnyAgentTool;
