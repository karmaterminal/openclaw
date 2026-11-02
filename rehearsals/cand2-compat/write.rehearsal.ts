// CAND2 backward-compat rehearsal, WRITE phase (karmaterminal/openclaw#1415). Runs on CAND2
// (15aa7e9333) only. Writes every persisted surface CAND2 writes differently from 22f49a43 through
// CAND2's own production writers into isolated fixture state under CAND2_COMPAT_ROOT, then records
// the bytes in fixtures/manifest.json for read.rehearsal.ts to open with the old builds.
//
// Inputs are synthetic (fake snowflakes, fake bot ids). Only the model turn, the Discord transport
// and systemd-run (a native exec-in-place shim, so /proc cmdline matches production) are replaced.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStdioTransport } from "../../extensions/codex/src/app-server/transport-stdio.js";
import { createDiscordIngressMonitor } from "../../extensions/discord/src/monitor/ingress.js";
import { createDiscordRoomHistoryWatermarks } from "../../extensions/discord/src/monitor/room-history-watermark.js";
import { installDiscordIngressTestRuntime } from "../../extensions/discord/src/test-support/ingress-runtime.js";
import { resolveRequesterPrincipalKey } from "../../src/agents/requester-origin.js";
import {
  aggregated,
  AMBIENT,
  ownerPeer,
  prose,
  withRoomIngress,
  type Row,
} from "../../src/auto-reply/reply/queue.room-event-collect.test-support.js";
import { installQueueRuntimeErrorSilencer } from "../../src/auto-reply/reply/queue.test-helpers.js";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from "../../src/config/runtime-snapshot.js";
import { upsertSessionEntryCore } from "../../src/config/sessions/session-accessor.js";
import { stageSessionPendingInput } from "../../src/config/sessions/session-accessor.pending-inputs.js";
import {
  closeOpenClawStateDatabaseForTest,
  createChannelIngressQueueForTests,
} from "../../src/plugin-sdk/channel-ingress-test-runtime.js";
import { createPluginStateKeyedStore } from "../../src/plugin-sdk/plugin-state-store-runtime.js";
import { testing as controllerTesting } from "../../src/sessions/session-controller.test-support.js";
import { closeOpenClawAgentDatabasesAsync } from "../../src/state/openclaw-agent-db.js";
import {
  fixtureDir,
  hashTree,
  headSha,
  READERS,
  requireRoot,
  SURFACES,
  writeManifestSurface,
} from "./shared.js";

const root = requireRoot();
const CAND2 = "15aa7e9333a242debb32586afacd09a3bad816ce";

installDiscordIngressTestRuntime();
installQueueRuntimeErrorSilencer();
afterEach(async () => {
  controllerTesting.resetSessionControllerForTest();
  clearRuntimeConfigSnapshot();
  closeOpenClawStateDatabaseForTest();
  await closeOpenClawAgentDatabasesAsync();
  vi.unstubAllEnvs();
});

function freshDir(dir: string): string {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

it("runs on CAND2 only", () => {
  expect(headSha()).toBe(CAND2);
});

// --- Discord durable ingress (channel_ingress_events) -------------------------------------
// CAND2 retyped the stored rawMessage as GatewayMessageCreateDispatchData (guild_id, member,
// mentions) and added prioritizePending on the drain. The rows below are what a stopped CAND2
// gateway leaves behind: pending events, an event its drain had claimed (a deferred room event),
// and a corrupt-payload control the old decoder must refuse.
const GUILD = "1100000000000000001";
const CHANNEL = "1200000000000000001";
const BOT = "1400000000000000001";
const PEER_BOT = "1400000000000000002";
const HUMAN = "1400000000000000003";

function gatewayMessage(
  id: string,
  author: { id: string; username: string; bot?: true },
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    channel_id: CHANNEL,
    guild_id: GUILD,
    type: 0,
    content: `synthetic message ${id}`,
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    author: { discriminator: "0", global_name: null, avatar: null, ...author },
    member: {
      roles: [],
      joined_at: "2026-01-01T00:00:00.000Z",
      deaf: false,
      mute: false,
      flags: 0,
    },
    ...extra,
  };
}

describe("discord durable ingress rows", () => {
  it("writes pending, claimed and corrupt rows with the CAND2 ingress monitor", async () => {
    const stateDir = freshDir(fixtureDir(root, SURFACES.discordIngress, "state"));
    const queue = createChannelIngressQueueForTests({
      channelId: "discord",
      accountId: "default",
      stateDir,
    });
    const dispatch = vi.fn();
    const monitor = createDiscordIngressMonitor({
      accountId: "default",
      client: {} as never,
      runtime: { error: vi.fn(), log: vi.fn() },
      queue,
      dispatch,
      botUserId: BOT,
    });
    const rows = {
      // Unaddressed prose from a bot peer: the ambient owner aggregate's input.
      ambientBotProse: gatewayMessage("1300000000000000001", {
        id: PEER_BOT,
        username: "peer-bot",
        bot: true,
      }),
      // A recent native mention of this bot: CAND2's prioritizePending lifts it.
      nativeMention: gatewayMessage(
        "1300000000000000002",
        { id: HUMAN, username: "human" },
        { mentions: [{ id: BOT, username: "this-bot", discriminator: "0", avatar: null }] },
      ),
      // A webhook post: CAND2 no longer reports its author as a bot.
      webhookPost: gatewayMessage(
        "1300000000000000003",
        { id: "1500000000000000001", username: "relay", bot: true },
        { webhook_id: "1500000000000000001" },
      ),
      // Claimed by the stopped CAND2 drain (a deferred room event at gateway stop).
      claimedAtStop: gatewayMessage("1300000000000000004", {
        id: PEER_BOT,
        username: "peer-bot",
        bot: true,
      }),
    };
    for (const raw of Object.values(rows)) {
      await monitor.accept(raw as never);
    }
    const claim = await queue.claim(rows.claimedAtStop.id, { ownerId: "cand2-stopped-drain" });
    expect(claim?.id).toBe(rows.claimedAtStop.id);
    // Control: a payload whose rawMessage lost channel_id, stored through the generic queue.
    const corruptId = "1300000000000000009";
    await queue.enqueue(
      corruptId,
      { version: 1, receivedAt: Date.now(), rawMessage: { id: corruptId } } as never,
      { laneKey: "channel:corrupt-control" },
    );
    expect(dispatch).not.toHaveBeenCalled();
    const pending = await queue.listPending({ limit: "all", orderBy: "id" });
    const claims = await queue.listClaims();
    expect(pending.map((row) => row.id)).toEqual([
      rows.ambientBotProse.id,
      rows.nativeMention.id,
      rows.webhookPost.id,
      corruptId,
    ]);
    expect(claims.map((row) => row.id)).toEqual([rows.claimedAtStop.id]);
    // What CAND2 stored is the gateway dispatch shape, guild facts included.
    expect(pending[0]?.payload).toMatchObject({
      version: 1,
      rawMessage: { id: rows.ambientBotProse.id, guild_id: GUILD, member: { roles: [] } },
    });
    await monitor.stop();
    closeOpenClawStateDatabaseForTest();
    writeManifestSurface(root, SURFACES.discordIngress, {
      stateDir,
      validIds: Object.values(rows).map((row) => row.id),
      pendingIds: pending.map((row) => row.id),
      claimedIds: claims.map((row) => row.id),
      corruptId,
      botUserId: BOT,
      storedPayloadShape: Object.keys(pending[0]?.payload ?? {}),
      storedRawMessageKeys: Object.keys(
        (pending[0]?.payload as { rawMessage?: object }).rawMessage ?? {},
      ).toSorted(),
      files: hashTree(stateDir),
    });
  });
});

// --- Session pending input for an ambient owner room aggregate --------------------------
// The aggregate's collected user turn is the CAND2-only persisted value: senderIsOwner false and a
// senderless room requesterOrigin, with member text attributed per sender. CAND2's real mailbox
// builds it (real durable ingress, real session mailbox, real adoption); CAND2's real pending-input
// writer stores it in a real agent database, and the stop leaves it interrupted.
const SESSION = {
  agentId: "main",
  sessionKey: "agent:main:discord:channel:cand2-compat-room",
  sessionId: "cand2-compat-room-session",
};

describe("session pending input of an ambient owner aggregate", () => {
  it("stages the aggregate's collected user turn and leaves it interrupted", async () => {
    const rows: Row[] = [
      { id: "a1", from: ownerPeer("peer-a", AMBIENT), source: prose },
      { id: "a2", from: ownerPeer("peer-b", AMBIENT), source: prose },
      { id: "a3", from: ownerPeer("peer-c", AMBIENT), source: prose },
    ];
    let aggregate: unknown;
    let member: unknown;
    await withRoomIngress(
      rows,
      async (harness) => {
        await harness.dispatchRows();
        await harness.endActiveTurn();
        expect(harness.calls).toHaveLength(1);
        const [call] = harness.calls;
        aggregated(call, rows);
        expect(call?.ambientRoomProse).toBe(true);
        aggregate = await call!.userTurnTranscriptRecorder!.resolveMessage();
        member = await harness.runs.get("a1")!.userTurnTranscriptRecorder!.resolveMessage();
      },
      { transcripts: true },
    );
    const message = aggregate as unknown as {
      idempotencyKey: string;
      __openclaw?: { requesterOrigin?: Record<string, unknown> };
    };
    const memberMessage = member as typeof message;
    expect(message.idempotencyKey).toMatch(/^followup-collect:/);
    const origin = message.__openclaw?.requesterOrigin;
    expect(origin?.senderId).toBeUndefined();
    expect(
      resolveRequesterPrincipalKey({ ...origin, messageChannel: "discord" } as never),
    ).toBeUndefined();
    // Runtime-only mailbox facts never reach the persisted user turn.
    const json = JSON.stringify(message);
    expect(json).not.toMatch(/ambientRoomProse|senderIsBot/);

    const stateDir = freshDir(fixtureDir(root, SURFACES.pendingInput, "state"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    const sessionsDir = path.join(stateDir, "agents", "main", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    const scope = { ...SESSION, storePath: path.join(sessionsDir, "sessions.json") };
    await upsertSessionEntryCore(scope, { sessionId: SESSION.sessionId, updatedAt: 1 });
    const staged: Array<{ runId: string; idempotencyKey: string; message: unknown }> = [];
    for (const [runId, input] of [
      ["cand2-compat-aggregate-run", message],
      ["cand2-compat-member-run", memberMessage],
    ] as const) {
      const receipt = await stageSessionPendingInput(scope, {
        runId,
        message: input as never,
        trackCompletion: true,
        assertCurrent: () => {},
      });
      expect(receipt).toBeDefined();
      receipt!.finish("interrupted");
      await receipt!.settled?.();
      staged.push({ runId, idempotencyKey: input.idempotencyKey, message: input });
    }
    await closeOpenClawAgentDatabasesAsync();
    writeManifestSurface(root, SURFACES.pendingInput, {
      stateDir,
      scope: SESSION,
      staged,
      aggregateRequesterOrigin: origin,
      memberRequesterOriginSenderId: memberMessage.__openclaw?.requesterOrigin?.senderId,
      files: hashTree(stateDir),
    });
  });
});

// --- Codex app-server process registration (plugin state, codex/app-server-processes) ---------
// With process.childScope on, CAND2 launches Codex through systemd-run --scope and fingerprints the
// command after the launcher execs it. A stopped CAND2 gateway whose owning unit was unverified
// leaves a live scoped Codex registered; the old reaper must still recognize and reap it. Each
// reader gets its own live orphan, plus a corrupt registration control.
const SHIM_C = `#include <stdio.h>
#include <string.h>
#include <unistd.h>
/* Stands in for systemd-run --scope: logs its arguments, then execs the command after "--" in place. */
int main(int argc, char **argv) {
  FILE *log = fopen(LOG_PATH, "a");
  if (log) {
    for (int i = 1; i < argc; i++) fprintf(log, i == 1 ? "%s" : " %s", argv[i]);
    fputc('\\n', log);
    fclose(log);
  }
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--") == 0 && i + 1 < argc) {
      execvp(argv[i + 1], &argv[i + 1]);
      perror("execvp");
      return 127;
    }
  }
  return 1;
}
`;

function readCmdline(pid: number): string {
  return fs.readFileSync(`/proc/${pid}/cmdline`).toString("utf8").split("\0").join(" ").trim();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function openRegistrationStore(stateDir: string) {
  return createPluginStateKeyedStore<unknown>("codex", {
    namespace: "app-server-processes",
    maxEntries: 512,
    overflowPolicy: "reject-new",
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
  });
}

describe.skipIf(process.platform !== "linux")("codex app-server process registrations", () => {
  it("registers a live scoped Codex orphan for each reader, and a corrupt control", async () => {
    const surface = fixtureDir(root, SURFACES.codexRegistration);
    const bin = freshDir(path.join(surface, "bin"));
    fs.writeFileSync(path.join(bin, "shim.c"), SHIM_C);
    const invocationLog = path.join(bin, "invocations.log");
    execFileSync("gcc", [
      "-O2",
      `-DLOG_PATH=${JSON.stringify(invocationLog)}`,
      "-o",
      path.join(bin, "systemd-run"),
      path.join(bin, "shim.c"),
    ]);
    const shim = path.join(bin, "systemd-run");
    const launches = () =>
      fs.existsSync(invocationLog)
        ? fs
            .readFileSync(invocationLog, "utf8")
            .trim()
            .split("\n")
            .filter((line) => !line.endsWith(" -- true"))
        : [];
    // A failing systemctl leaves the scope unbound, as in the repository's own scope tests.
    fs.writeFileSync(path.join(bin, "systemctl"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    // Codex stand-in: one native process (absolute interpreter, no re-exec) that outlives its
    // parent for at most 30 minutes.
    const codex = path.join(bin, "codex");
    fs.writeFileSync(
      codex,
      `#!${process.execPath}\nprocess.on("SIGPIPE", () => {});\nfor (const s of [process.stdin, process.stdout, process.stderr]) s.on("error", () => {});\nprocess.stdin.resume();\nsetTimeout(() => process.exit(0), 1_800_000);\n`,
      { mode: 0o755 },
    );
    vi.stubEnv("PATH", `${bin}${path.delimiter}${process.env.PATH ?? ""}`);
    vi.stubEnv("XDG_RUNTIME_DIR", "/run/user/openclaw-cand2-compat");
    setRuntimeConfigSnapshot({ process: { childScope: { enabled: true } } });

    const perReader: Record<string, unknown> = {};
    for (const reader of READERS) {
      const stateDir = freshDir(path.join(surface, reader, "state"));
      vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
      const launchesBefore = launches().length;
      const child = await createStdioTransport({
        transport: "stdio",
        commandSource: "config",
        command: codex,
        args: ["app-server"],
        headers: {},
      } as never);
      // CAND2 launched Codex through the scope launcher, with the scope's memory caps.
      const launch = launches().slice(launchesBefore);
      expect(launch).toEqual([
        expect.stringMatching(
          new RegExp(
            `^--user --scope --quiet --collect --description=OpenClaw heavy child -p MemoryMax=5G -p MemorySwapMax=2G -- ${codex} app-server`,
          ),
        ),
      ]);
      const pid = child.pid!;
      const entries = await openRegistrationStore(stateDir).entries();
      expect(entries).toHaveLength(1);
      const value = entries[0]!.value as {
        parent: { pid: number };
        child: { pid: number; startedAt: string; commandFingerprint?: string };
      };
      expect(value.child.pid).toBe(pid);
      expect(value.parent.pid).toBe(process.pid);
      const codexCommand = readCmdline(pid);
      const launcherCommand = `${shim} ${launch[0]}`.trim();
      // The fingerprint names Codex's own command, never the launcher's.
      expect(codexCommand).toContain(codex);
      expect(value.child.commandFingerprint).toBe(sha256(codexCommand));
      expect(value.child.commandFingerprint).not.toBe(sha256(launcherCommand));
      // Leave the child running past this worker: the stopped gateway's orphan.
      for (const stream of [child.stdin, child.stdout, child.stderr]) {
        (stream as unknown as { unref?: () => void }).unref?.();
      }
      child.unref();
      closeOpenClawStateDatabaseForTest();
      perReader[reader] = {
        stateDir,
        pid,
        startedAt: value.child.startedAt,
        commandFingerprint: value.child.commandFingerprint,
        codexCommand,
        entryKeys: Object.keys(value).toSorted(),
        childKeys: Object.keys(value.child).toSorted(),
        files: hashTree(stateDir),
      };
    }

    // Control: a registration the strict schema refuses (unknown key) must fail the old sweep.
    const controlDir = freshDir(path.join(surface, "control-corrupt", "state"));
    vi.stubEnv("OPENCLAW_STATE_DIR", controlDir);
    await openRegistrationStore(controlDir).register("corrupt-control", {
      parent: { pid: 1, pgid: 1, startedAt: "corrupt-parent" },
      child: { pid: 2, pgid: 2, startedAt: "corrupt-child" },
      unexpected: true,
    });
    closeOpenClawStateDatabaseForTest();
    writeManifestSurface(root, SURFACES.codexRegistration, {
      bin,
      perReader,
      controlStateDir: controlDir,
      controlFiles: hashTree(controlDir),
    });
  });
});

// --- Discord room-history watermark ---------------------------------------------------------
// #1534 moved the watermark set from the provider to the dispatcher. It is in memory; a full
// begin -> completed -> markHistory cycle under an isolated state dir must write nothing.
describe("discord room-history watermark", () => {
  it("keeps the watermark in memory: a full turn cycle writes no state", () => {
    const stateDir = freshDir(fixtureDir(root, SURFACES.watermark, "state"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    const watermarks = createDiscordRoomHistoryWatermarks();
    const scope = { sessionKey: SESSION.sessionKey, channelId: CHANNEL };
    const turn = watermarks.beginTurn(scope, "1300000000000000002");
    turn.replyOptions.onAgentRunTerminalOutcome?.("completed" as never);
    const marked = watermarks.markHistory(scope, [
      { sender: "peer", body: "seen", messageId: "1300000000000000001" },
      { sender: "peer", body: "new", messageId: "1300000000000000003" },
    ] as never);
    expect(marked.map((entry) => entry.sender)).toEqual(["[already seen] peer", "[new] peer"]);
    expect(hashTree(stateDir)).toEqual({});
    writeManifestSurface(root, SURFACES.watermark, {
      stateDir,
      filesAfterTurn: hashTree(stateDir),
    });
  });
});
