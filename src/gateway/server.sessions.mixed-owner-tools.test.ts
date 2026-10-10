/** Real session tools → Gateway handlers over one mixed-owner state; no provider or turns. */
import path from "node:path";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { expect, test } from "vitest";
import { GatewayClientRequestError } from "../../packages/gateway-client/src/request-error.js";
import type { AgentToolGatewayRequestCaller } from "../agents/tools/in-process-gateway.js";
import { createSessionsHistoryTool } from "../agents/tools/sessions-history-tool.js";
import { createSessionsListTool } from "../agents/tools/sessions-list-tool.js";
import { createSessionsSearchTool } from "../agents/tools/sessions-search-tool.js";
import { replaceSessionEntry } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createAbortError } from "../infra/abort-signal.js";
import { testState } from "./test-helpers.js";
import {
  directSessionReq,
  getGatewayConfigModule,
  seedLinearSessionTranscript,
  setupGatewaySessionsHandlerTestHarness,
} from "./test/server-sessions.test-helpers.js";

setupGatewaySessionsHandlerTestHarness();

const REQUESTER_KEY = "agent:main:main";
const NEEDLE = "amber lantern";
const transcriptText = (key: string) => `Amber lantern in ${key}`;
// main is the configured agent; copilot is now only an ACP agent with retained native-era
// history; claude's store survives with no configuration naming it. Children link to the
// requester, as spawned sessions do.
const FIXTURE = [
  { agentId: "main", key: REQUESTER_KEY },
  { agentId: "main", key: "agent:main:subagent:helper" },
  { agentId: "copilot", key: "agent:copilot:acp:binding" },
  { agentId: "copilot", key: "agent:copilot:subagent:native-era" },
  { agentId: "claude", key: "agent:claude:subagent:retained" },
] as const;
const MAIN_KEYS = FIXTURE.filter(({ agentId }) => agentId === "main").map(({ key }) => key);
const OTHER_OWNER_KEYS = FIXTURE.filter(({ agentId }) => agentId !== "main");

type Transport = "in-process" | "remote";
type GatewayRequest = Parameters<AgentToolGatewayRequestCaller>[0];

async function seedMixedOwners(): Promise<OpenClawConfig> {
  const stateDir = process.env.OPENCLAW_STATE_DIR;
  if (!stateDir) {
    throw new Error("OPENCLAW_STATE_DIR is required");
  }
  testState.agentsConfig = { entries: { main: {} } };
  const { clearConfigCache, clearRuntimeConfigSnapshot, getRuntimeConfig } =
    await getGatewayConfigModule();
  clearRuntimeConfigSnapshot();
  clearConfigCache();
  const cfg = getRuntimeConfig();
  cfg.acp = { allowedAgents: ["copilot"] };
  for (const [index, { agentId, key }] of FIXTURE.entries()) {
    const storePath = path.join(stateDir, "agents", agentId, "sessions", "sessions.json");
    const sessionId = `mixed-owner-${index}`;
    await replaceSessionEntry(
      { agentId, sessionKey: key, storePath },
      {
        sessionId,
        updatedAt: 1_781_000_000_000 + index,
        ...(key === REQUESTER_KEY ? {} : { spawnedBy: REQUESTER_KEY }),
      },
    );
    await seedLinearSessionTranscript({
      agentId,
      contents: [transcriptText(key)],
      sessionId,
      sessionKey: key,
      storePath,
    });
  }
  return cfg;
}

/** Calls the real handlers; a remote client receives JSON, so rows lose their read binding. */
function gatewayCaller(
  transport: Transport,
  inject?: (request: GatewayRequest) => Error | undefined,
): AgentToolGatewayRequestCaller {
  return async <T>(request: GatewayRequest) => {
    const injected = inject?.(request);
    if (injected) {
      throw injected;
    }
    if (!isRecord(request.params)) {
      throw new Error("Expected structured Gateway request params");
    }
    const response = await directSessionReq(request.method, request.params);
    const delivered: typeof response =
      transport === "remote" ? JSON.parse(JSON.stringify(response)) : response;
    if (!delivered.ok) {
      throw new GatewayClientRequestError(delivered.error ?? {});
    }
    return delivered.payload as T;
  };
}

function rowsByKey(details: unknown): Map<string, Record<string, unknown>> {
  if (!isRecord(details) || !Array.isArray(details.sessions)) {
    throw new Error("Expected sessions_list details with sessions");
  }
  return new Map(
    details.sessions.flatMap((row: unknown) =>
      isRecord(row) && typeof row.key === "string" ? [[row.key, row] as const] : [],
    ),
  );
}

const listParams = { includeDerivedTitles: true, includeLastMessage: true, messageLimit: 1 };
const LIST_CASES = [
  {
    transport: "in-process",
    // Bound rows read titles from their own store, so only chat.history names an owner.
    titledFromStore: true,
    warning:
      'Skipped messages for agents the Gateway refused as unknown: "claude" (1 session), "copilot" (2 sessions).',
  },
  {
    transport: "remote",
    // JSON rows lose that binding, so sessions.describe names each owner too.
    titledFromStore: false,
    warning:
      'Skipped titles and previews for agents the Gateway refused as unknown: "claude" (1 session), "copilot" (2 sessions). ' +
      'Skipped messages for agents the Gateway refused as unknown: "claude" (1 session), "copilot" (2 sessions).',
  },
] as const;

test("broad session reads keep the other owners and name each owner the Gateway refused", async () => {
  const cfg = await seedMixedOwners();

  for (const { transport, titledFromStore, warning } of LIST_CASES) {
    const list = createSessionsListTool({
      config: cfg,
      agentSessionKey: REQUESTER_KEY,
      callGateway: gatewayCaller(transport),
    });
    const { details } = await list.execute(`mixed-owner-list-${transport}`, listParams);

    expect(details, transport).toMatchObject({ count: FIXTURE.length, hasMore: false, warning });
    const rows = rowsByKey(details);
    expect([...rows.keys()].toSorted()).toEqual(FIXTURE.map(({ key }) => key).toSorted());
    for (const key of MAIN_KEYS) {
      expect(rows.get(key), transport).toMatchObject({
        messages: [expect.objectContaining({ role: "user" })],
        ...(titledFromStore
          ? { derivedTitle: transcriptText(key), lastMessagePreview: transcriptText(key) }
          : {}),
      });
    }
    for (const { agentId, key } of OTHER_OWNER_KEYS) {
      const row = rows.get(key);
      expect(row, transport).toMatchObject({ agentId });
      expect(row, transport).not.toHaveProperty("messages");
      if (!titledFromStore) {
        expect(row).not.toHaveProperty("derivedTitle");
        expect(row).not.toHaveProperty("lastMessagePreview");
      }
    }
  }

  const search = createSessionsSearchTool({
    config: cfg,
    agentSessionKey: REQUESTER_KEY,
    callGateway: gatewayCaller("in-process"),
  });
  const { details } = await search.execute("mixed-owner-search", { query: NEEDLE });

  // The retained claude store stays searchable; copilot's native-era key makes the Gateway
  // refuse that owner, so its sessions are reported instead of failing the whole search.
  expect(details).toMatchObject({
    warning:
      'Skipped transcript search for agents the Gateway refused as unknown: "copilot" (2 sessions).',
  });
  if (!isRecord(details) || !Array.isArray(details.results)) {
    throw new Error("Expected sessions_search results");
  }
  expect(
    details.results.map((hit: unknown) => (isRecord(hit) ? hit.sessionKey : undefined)).toSorted(),
  ).toEqual([...MAIN_KEYS, "agent:claude:subagent:retained"].toSorted());
});

test("explicit history keeps its refusal and other broad-read failures stay fatal", async () => {
  const cfg = await seedMixedOwners();
  const history = createSessionsHistoryTool({
    config: cfg,
    agentSessionKey: REQUESTER_KEY,
    callGateway: gatewayCaller("in-process"),
  });
  for (const { agentId, key } of OTHER_OWNER_KEYS) {
    const { details } = await history.execute(`history-${key}`, { sessionKey: key });
    expect(details, key).toEqual({ status: "error", error: `Unknown agent id "${agentId}"` });
  }

  const failures: Array<[string, (method: string) => Error]> = [
    ["cancellation", (method) => createAbortError(`gateway request aborted for ${method}`)],
    ["Gateway invalidation", (method) => new Error(`Gateway instance unavailable for ${method}`)],
    [
      "authorization failure",
      () =>
        new GatewayClientRequestError({
          code: "FORBIDDEN",
          message: "missing scope: operator.read",
        }),
    ],
    [
      "untyped unknown-agent refusal",
      () =>
        new GatewayClientRequestError({
          code: "INVALID_REQUEST",
          message: 'Unknown agent id "copilot"',
        }),
    ],
    [
      "refusal naming another agent",
      () =>
        new GatewayClientRequestError({
          code: "INVALID_REQUEST",
          message: 'Unknown agent id "main"',
          details: { code: "UNKNOWN_AGENT_ID", agentId: "main" },
        }),
    ],
  ];
  for (const [label, createFailure] of failures) {
    // Fail exactly the copilot requests whose typed refusal the broad tools skip.
    const thrown: Error[] = [];
    const callGateway = gatewayCaller("remote", (request) => {
      if (!isRecord(request.params) || request.params.agentId !== "copilot") {
        return undefined;
      }
      const failure = createFailure(request.method);
      thrown.push(failure);
      return failure;
    });
    const rejection = (run: Promise<unknown>) =>
      run.then(
        () => new Error(`${label}: the tool resolved`),
        (error: unknown) => error,
      );
    const list = createSessionsListTool({
      config: cfg,
      agentSessionKey: REQUESTER_KEY,
      callGateway,
    });
    const search = createSessionsSearchTool({
      config: cfg,
      agentSessionKey: REQUESTER_KEY,
      callGateway,
    });

    expect(thrown, label).toContain(
      await rejection(list.execute(`fatal-list-${label}`, listParams)),
    );
    expect(thrown, label).toContain(
      await rejection(search.execute(`fatal-search-${label}`, { query: NEEDLE })),
    );
  }
});
