// CAND2 backward-compat rehearsal, READ phase (karmaterminal/openclaw#1415). Runs on each reader
// checkout: CAND2 itself (same-build control), then 22f49a43 and 3d3364dd. Each reader opens a
// private byte-identical copy of what write.rehearsal.ts stored with CAND2, through the reader's
// own production readers, and records the outcome in results/<reader>.json. Every surface has a
// deliberately corrupted control that must FAIL, so a pass proves the reader actually ran.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareCodexAppServerProcessRegistration } from "../../extensions/codex/src/app-server/transport-process-registration.js";
import { createDiscordIngressMonitor } from "../../extensions/discord/src/monitor/ingress.js";
import { installDiscordIngressTestRuntime } from "../../extensions/discord/src/test-support/ingress-runtime.js";
import { resolveRequesterPrincipalKey } from "../../src/agents/requester-origin.js";
import {
  readSessionPendingInputRequesterOrigin,
  readSessionSubmittedInput,
  stageSessionPendingInput,
} from "../../src/config/sessions/session-accessor.pending-inputs.js";
import { listSessionPendingInputs } from "../../src/config/sessions/session-pending-input-history.js";
import {
  closeOpenClawStateDatabaseForTest,
  createChannelIngressQueueForTests,
} from "../../src/plugin-sdk/channel-ingress-test-runtime.js";
import { createPluginStateKeyedStore } from "../../src/plugin-sdk/plugin-state-store-runtime.js";
import { closeOpenClawAgentDatabasesAsync } from "../../src/state/openclaw-agent-db.js";
import {
  copyFixture,
  errorText,
  PRODUCT_SHAS,
  productSha,
  readerDir,
  readManifest,
  READERS,
  recordResult,
  requireRoot,
  SURFACES,
  type ReaderLabel,
} from "./shared.js";

const root = requireRoot();
const reader = process.env.CAND2_COMPAT_READER as ReaderLabel;
const manifest = readManifest(root);

installDiscordIngressTestRuntime();
afterEach(async () => {
  closeOpenClawStateDatabaseForTest();
  await closeOpenClawAgentDatabasesAsync();
  vi.unstubAllEnvs();
});

/** A reader's copy must match the bytes the stopped CAND2 writer left on disk. */
function copySealed(source: string, destination: string): void {
  const sealed = (manifest as { sealed?: Record<string, Record<string, string>> }).sealed?.[source];
  if (!sealed) {
    throw new Error(`no sealed hashes for ${source}; run seal-fixtures.mjs after the write phase`);
  }
  expect(copyFixture(source, destination)).toEqual(sealed);
}

function surface<T>(name: string): T {
  const value = manifest.surfaces[name];
  if (!value) {
    throw new Error(`manifest has no ${name} surface; run the write phase first`);
  }
  return value as T;
}

const record = (surfaceName: string, test: string, outcome: Record<string, unknown>) =>
  recordResult(root, reader, surfaceName, test, { writeSha: manifest.writeSha, ...outcome });

it("reads with the checkout its label names, from fixtures CAND2 wrote", () => {
  expect(READERS).toContain(reader);
  expect(productSha()).toBe(PRODUCT_SHAS[reader]);
  expect(manifest.writeSha).toBe("15aa7e9333a242debb32586afacd09a3bad816ce");
});

// --- Discord durable ingress -------------------------------------------------------------
type DiscordFixture = {
  stateDir: string;
  validIds: string[];
  pendingIds: string[];
  claimedIds: string[];
  corruptId: string;
  botUserId: string;
};

describe("discord durable ingress rows", () => {
  it("recovers, decodes, delivers and settles CAND2's rows; dead-letters the corrupt control", async () => {
    const fixture = surface<DiscordFixture>(SURFACES.discordIngress);
    const stateDir = path.join(readerDir(root, reader, SURFACES.discordIngress), "state");
    copySealed(fixture.stateDir, stateDir);
    const queue = createChannelIngressQueueForTests({
      channelId: "discord",
      accountId: "default",
      stateDir,
    });
    const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id).toSorted();
    expect(ids(await queue.listPending({ limit: "all" }))).toEqual(fixture.pendingIds.toSorted());
    expect(ids(await queue.listClaims())).toEqual(fixture.claimedIds.toSorted());
    const delivered: Array<Record<string, unknown>> = [];
    const errors: string[] = [];
    const monitor = createDiscordIngressMonitor({
      accountId: "default",
      client: {} as never,
      runtime: { error: (message: unknown) => errors.push(String(message)), log: () => {} },
      queue,
      botUserId: fixture.botUserId,
      dispatch: async (event) => {
        const raw = event as unknown as {
          id: string;
          channel_id: string;
          guild_id?: string;
          webhook_id?: string;
          author?: { bot?: boolean } | null;
          member?: { roles?: string[] };
          mentions?: Array<{ id: string }>;
          message?: { content?: string };
        };
        delivered.push({
          id: raw.id,
          channelId: raw.channel_id,
          guildId: raw.guild_id,
          webhookId: raw.webhook_id,
          authorBot: raw.author?.bot,
          memberRoles: raw.member?.roles,
          mentionIds: raw.mentions?.map((user) => user.id),
          content: raw.message?.content,
        });
      },
    });
    let outcome: Record<string, unknown> = {};
    try {
      monitor.start();
      await vi.waitFor(
        async () => {
          expect(delivered.map((row) => row.id).toSorted()).toEqual(fixture.validIds.toSorted());
          expect(ids((await queue.listFailed?.({ limit: "all" })) ?? [])).toEqual([
            fixture.corruptId,
          ]);
          expect(await queue.listPending({ limit: "all" })).toEqual([]);
          expect(await queue.listClaims()).toEqual([]);
        },
        { timeout: 30_000, interval: 250 },
      );
      const failed = (await queue.listFailed?.({ limit: "all" })) ?? [];
      outcome = {
        outcome: "decoded-and-delivered",
        delivered: delivered.toSorted((a, b) => String(a.id).localeCompare(String(b.id))),
        control: failed.map((row) => ({ id: row.id, reason: row.reason, message: row.message })),
        drainErrors: errors,
      };
      expect(failed).toEqual([expect.objectContaining({ reason: "invalid-event" })]);
    } catch (error) {
      record(SURFACES.discordIngress, expect.getState().currentTestName!, {
        outcome: "FAILED",
        error: errorText(error),
        delivered,
        drainErrors: errors,
      });
      throw error;
    } finally {
      await monitor.stop();
    }
    record(SURFACES.discordIngress, expect.getState().currentTestName!, outcome);
  });
});

// --- Session pending input of an ambient owner aggregate ------------------------------------
type PendingFixture = {
  stateDir: string;
  scope: { agentId: string; sessionKey: string; sessionId: string };
  staged: Array<{
    runId: string;
    idempotencyKey: string;
    message: { content: unknown; __openclaw?: { requesterOrigin?: Record<string, unknown> } };
  }>;
  aggregateRequesterOrigin: Record<string, unknown>;
};

function pendingScope(fixture: PendingFixture, stateDir: string) {
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  return {
    ...fixture.scope,
    storePath: path.join(stateDir, "agents", "main", "sessions", "sessions.json"),
  };
}

describe("session pending input of an ambient owner aggregate", () => {
  it("lists, reads and replays CAND2's interrupted aggregate turn; refuses a changed replay", async () => {
    const fixture = surface<PendingFixture>(SURFACES.pendingInput);
    const stateDir = path.join(readerDir(root, reader, SURFACES.pendingInput), "state");
    copySealed(fixture.stateDir, stateDir);
    const scope = pendingScope(fixture, stateDir);
    const [aggregate, member] = fixture.staged;
    const name = expect.getState().currentTestName!;
    try {
      // Chat history / prompt context read.
      const page = await listSessionPendingInputs(scope);
      const listed = page.items
        .map((item) => ({ runId: item.runId, state: item.state }))
        .toSorted((a, b) => a.runId.localeCompare(b.runId));
      expect(listed).toEqual(
        [aggregate!, member!]
          .map((row) => ({ runId: row.runId, state: "interrupted" }))
          .toSorted((a, b) => a.runId.localeCompare(b.runId)),
      );
      expect(page.items.find((item) => item.runId === aggregate!.runId)?.message).toEqual(
        aggregate!.message,
      );
      // Retry comparison read.
      const submitted = await readSessionSubmittedInput(scope, aggregate!.idempotencyKey, {
        includeSource: true,
      });
      expect(submitted).toMatchObject({ source: "pending", message: aggregate!.message });
      // A restart's replay of the same accepted input: the old writer accepts CAND2's stored hash.
      const receipt = await stageSessionPendingInput(scope, {
        runId: aggregate!.runId,
        message: aggregate!.message as never,
        trackCompletion: true,
        assertCurrent: () => {},
      });
      expect(receipt).toBeDefined();
      const origin = readSessionPendingInputRequesterOrigin(receipt!);
      expect(origin).toEqual(fixture.aggregateRequesterOrigin);
      const principal = resolveRequesterPrincipalKey({
        ...origin,
        messageChannel: "discord",
      } as never);
      expect(principal).toBeUndefined();
      receipt!.finish("interrupted");
      await receipt!.settled?.();
      // Control: a changed message under CAND2's accepted key is refused, so the replay above
      // really compared the stored CAND2 bytes.
      let conflict = "";
      await expect(
        stageSessionPendingInput(scope, {
          runId: aggregate!.runId,
          message: { ...aggregate!.message, content: "changed by the reader" } as never,
          trackCompletion: true,
          assertCurrent: () => {},
        }).catch((error: unknown) => {
          conflict = errorText(error);
          throw error;
        }),
      ).rejects.toThrow(/conflicts with the accepted input/);
      record(SURFACES.pendingInput, name, {
        outcome: "listed-read-replayed",
        listed,
        submittedSource: submitted?.source,
        replayRequesterOrigin: origin,
        replayPrincipalKey: principal ?? null,
        control: conflict,
      });
    } catch (error) {
      record(SURFACES.pendingInput, name, { outcome: "FAILED", error: errorText(error) });
      throw error;
    }
  });

  it("refuses a corrupted pending user turn (control)", async () => {
    const fixture = surface<PendingFixture>(SURFACES.pendingInput);
    const stateDir = path.join(readerDir(root, reader, SURFACES.pendingInput), "state-corrupt");
    copySealed(fixture.stateDir, stateDir);
    const [aggregate] = fixture.staged;
    const database = new DatabaseSync(
      path.join(stateDir, "agents", "main", "agent", "openclaw-agent.sqlite"),
    );
    const changed = database
      .prepare("UPDATE session_pending_inputs SET message_json = ? WHERE run_id = ?")
      .run(JSON.stringify({ role: "assistant", content: "corrupt control" }), aggregate!.runId);
    database.close();
    expect(changed.changes).toBe(1);
    const scope = pendingScope(fixture, stateDir);
    let refusal = "";
    await expect(
      readSessionSubmittedInput(scope, aggregate!.idempotencyKey).catch((error: unknown) => {
        refusal = errorText(error);
        throw error;
      }),
    ).rejects.toThrow(/invalid persisted user message/);
    record(SURFACES.pendingInput, expect.getState().currentTestName!, {
      outcome: "control-refused",
      error: refusal,
    });
  });
});

// --- Codex app-server process registrations --------------------------------------------------
type CodexFixture = {
  perReader: Record<
    string,
    {
      stateDir: string;
      pid: number;
      startedAt: string;
      commandFingerprint: string;
    }
  >;
  controlStateDir: string;
};

function openRegistrationStore(stateDir: string) {
  return createPluginStateKeyedStore<{ child: { pid: number } }>("codex", {
    namespace: "app-server-processes",
    maxEntries: 512,
    overflowPolicy: "reject-new",
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
  });
}

/** Live and not a zombie: the subreaper collects the orphan once it is killed. */
function isAlive(pid: number): boolean {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) !== "Z";
  } catch {
    return false;
  }
}

function cmdlineFingerprint(pid: number): string {
  const command = fs
    .readFileSync(`/proc/${pid}/cmdline`)
    .toString("utf8")
    .split("\0")
    .join(" ")
    .trim();
  return createHash("sha256").update(command).digest("hex");
}

describe.skipIf(process.platform !== "linux")("codex app-server process registrations", () => {
  it("reaps this reader's live CAND2-registered scoped Codex orphan", async () => {
    const fixture = surface<CodexFixture>(SURFACES.codexRegistration).perReader[reader]!;
    // Precondition: the stopped CAND2 gateway's orphan is still the registered Codex.
    expect(isAlive(fixture.pid)).toBe(true);
    expect(cmdlineFingerprint(fixture.pid)).toBe(fixture.commandFingerprint);
    const stateDir = path.join(readerDir(root, reader, SURFACES.codexRegistration), "state");
    copySealed(fixture.stateDir, stateDir);
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    const name = expect.getState().currentTestName!;
    try {
      const before = await openRegistrationStore(stateDir).entries();
      expect(before.map((entry) => entry.value.child.pid)).toEqual([fixture.pid]);
      // The reader's authoritative before-spawn sweep (also its boot reaper service).
      await prepareCodexAppServerProcessRegistration();
      await vi.waitFor(() => expect(isAlive(fixture.pid)).toBe(false), {
        timeout: 15_000,
        interval: 100,
      });
      const after = await openRegistrationStore(stateDir).entries();
      expect(after).toEqual([]);
      record(SURFACES.codexRegistration, name, {
        outcome: "decoded-and-reaped",
        pid: fixture.pid,
        entriesBefore: before.length,
        entriesAfter: after.length,
        orphanAliveAfter: isAlive(fixture.pid),
      });
    } catch (error) {
      record(SURFACES.codexRegistration, name, {
        outcome: "FAILED",
        error: errorText(error),
        orphanAlive: isAlive(fixture.pid),
      });
      throw error;
    }
  });

  it("refuses a registration its strict schema rejects (control)", async () => {
    const fixture = surface<CodexFixture>(SURFACES.codexRegistration);
    const stateDir = path.join(readerDir(root, reader, SURFACES.codexRegistration), "control");
    copySealed(fixture.controlStateDir, stateDir);
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    let refusal = "";
    await expect(
      prepareCodexAppServerProcessRegistration().catch((error: unknown) => {
        refusal = errorText(error);
        throw error;
      }),
    ).rejects.toThrow(/unexpected|Unrecognized/);
    record(SURFACES.codexRegistration, expect.getState().currentTestName!, {
      outcome: "control-refused",
      error: refusal.slice(0, 400),
    });
  });
});
