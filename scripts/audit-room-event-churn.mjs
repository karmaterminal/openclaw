#!/usr/bin/env node

// Offline detector for #1135/#1138 room-event parking/no-op replay churn.
// Reads only local artifacts: flow_runs SQLite backups, session/reset JSONL,
// trajectory JSONL, and optional journald/provider exports. It never calls the
// gateway, provider, scheduler, messaging, or continuation APIs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MIN_NOOP_TURNS = 5;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_STALE_REPEAT_MIN = 3;

function usageText() {
  return `Usage: node scripts/audit-room-event-churn.mjs [options]

Offline inputs (repeatable):
  --db <path>             SQLite state DB / backup with flow_runs
  --session <path>        Session or reset JSONL file
  --session-dir <path>    Directory containing *.jsonl* session files
  --trajectory <path>     Trajectory JSONL file or directory
  --journal <path>        Journald/provider export text or JSONL file
  --since <iso>           Include events at/after timestamp
  --until <iso>           Include events before/at timestamp

Detection knobs:
  --min-noop-turns <n>    Minimum no-op/parking assistant turns in a cluster (default ${DEFAULT_MIN_NOOP_TURNS})
  --window-ms <ms>        Burst window for compact clusters (default ${DEFAULT_WINDOW_MS})
  --json                  Emit JSON only
  --help                  Show this help

No live probing is performed. The detector correlates by sessionKey/runId/flowId/time when those fields exist.
`;
}

export function parseArgs(argv) {
  const args = {
    db: [],
    session: [],
    sessionDir: [],
    trajectory: [],
    journal: [],
    since: undefined,
    until: undefined,
    minNoopTurns: DEFAULT_MIN_NOOP_TURNS,
    windowMs: DEFAULT_WINDOW_MS,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => {
      i += 1;
      if (i >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[i];
    };
    switch (arg) {
      case "--db":
        args.db.push(take());
        break;
      case "--session":
        args.session.push(take());
        break;
      case "--session-dir":
        args.sessionDir.push(take());
        break;
      case "--trajectory":
        args.trajectory.push(take());
        break;
      case "--journal":
        args.journal.push(take());
        break;
      case "--since":
        args.since = take();
        break;
      case "--until":
        args.until = take();
        break;
      case "--min-noop-turns":
        args.minNoopTurns = Number(take());
        break;
      case "--window-ms":
        args.windowMs = Number(take());
        break;
      case "--json":
        args.json = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.minNoopTurns) || args.minNoopTurns < 1) {
    throw new Error("--min-noop-turns must be a positive number");
  }
  if (!Number.isFinite(args.windowMs) || args.windowMs < 1) {
    throw new Error("--window-ms must be a positive number");
  }
  return args;
}

function toMs(value) {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function iso(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function stableString(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseJsonMaybe(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function getPath(value, keys) {
  let current = value;
  for (const key of keys) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function lineJsonObjects(filePath) {
  const rows = [];
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    const parsed = parseJsonMaybe(line);
    if (parsed !== undefined) {
      rows.push({ row: parsed, line: i + 1, raw: line });
    }
  }
  return rows;
}

function walkFiles(start, predicate, out = []) {
  if (!fs.existsSync(start)) {
    return out;
  }
  const stat = fs.statSync(start);
  if (stat.isFile()) {
    if (predicate(start)) {
      out.push(start);
    }
    return out;
  }
  if (!stat.isDirectory()) {
    return out;
  }
  for (const entry of fs.readdirSync(start)) {
    walkFiles(path.join(start, entry), predicate, out);
  }
  return out;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].toSorted((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

function extractTimestamp(row) {
  return (
    toMs(row.timestamp) ??
    toMs(row.createdAt) ??
    toMs(row.time) ??
    toMs(getPath(row, ["message", "timestamp"])) ??
    toMs(getPath(row, ["message", "createdAt"])) ??
    toMs(getPath(row, ["data", "timestamp"]))
  );
}

function extractSessionKey(row) {
  return (
    row.sessionKey ??
    row.session_key ??
    getPath(row, ["session", "sessionKey"]) ??
    getPath(row, ["message", "sessionKey"]) ??
    getPath(row, ["metadata", "sessionKey"]) ??
    getPath(row, ["data", "sessionKey"])
  );
}

function extractRunId(row) {
  return (
    row.runId ??
    row.run_id ??
    getPath(row, ["message", "runId"]) ??
    getPath(row, ["data", "runId"]) ??
    getPath(row, ["agent", "runId"])
  );
}

function parseToolInput(call) {
  const candidates = [call.input, call.arguments, call.args, call.params, call.fields];
  for (const candidate of candidates) {
    if (candidate == null) {
      continue;
    }
    if (typeof candidate === "string") {
      const parsed = parseJsonMaybe(candidate);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
      return { raw: candidate };
    }
    if (typeof candidate === "object") {
      return candidate;
    }
  }
  return {};
}

function extractMessageParts(row) {
  const message = row.message && typeof row.message === "object" ? row.message : row;
  const content = message.content ?? row.content ?? getPath(row, ["data", "content"]);
  if (Array.isArray(content)) {
    return content;
  }
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  const text = message.text ?? row.text ?? getPath(row, ["data", "text"]);
  return typeof text === "string" ? [{ type: "text", text }] : [];
}

function partToolName(part) {
  return part.name ?? part.toolName ?? part.tool_name ?? part.function?.name;
}

function normalizeToolCall(part) {
  const name = partToolName(part);
  if (!name) {
    return undefined;
  }
  return {
    name,
    input: parseToolInput(part),
  };
}

function extractToolCalls(parts) {
  const calls = [];
  for (const part of parts) {
    const type = String(part?.type ?? "").toLowerCase();
    if (type.includes("tool") && !type.includes("result")) {
      const call = normalizeToolCall(part);
      if (call) {
        calls.push(call);
      }
    }
    if (part?.toolCall && typeof part.toolCall === "object") {
      const call = normalizeToolCall(part.toolCall);
      if (call) {
        calls.push(call);
      }
    }
  }
  return calls;
}

function extractToolResults(parts) {
  const results = [];
  for (const part of parts) {
    const type = String(part?.type ?? "").toLowerCase();
    if (type.includes("tool") && type.includes("result")) {
      results.push(part);
    }
  }
  return results;
}

function extractText(parts) {
  return parts
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (typeof part?.text === "string") {
        return part.text;
      }
      if (typeof part?.content === "string") {
        return part.content;
      }
      return "";
    })
    .join(" ")
    .replace(/[\r\n\t]+/gu, " ")
    .trim();
}

function isNoReplyText(text) {
  const normalized = text.trim().toUpperCase();
  return normalized === "NO_REPLY" || normalized === "[[NO_REPLY]]";
}

function isRoomEventRow(row, text) {
  return (
    row.inbound_event_kind === "room_event" ||
    getPath(row, ["metadata", "inbound_event_kind"]) === "room_event" ||
    getPath(row, ["data", "inbound_event_kind"]) === "room_event" ||
    /\[OpenClaw room event\]|inbound_event_kind:\s*room_event/u.test(text)
  );
}

function classifyAssistantTurn(toolCalls, toolResults, text) {
  const names = toolCalls.map((call) => call.name);
  const reasons = [];
  const zeroDelayContinueReasons = [];
  const signals = [];
  let hasContinueWork = false;
  let hasYield = false;
  let hasOnlyLowValueTools = toolCalls.length > 0;

  for (const call of toolCalls) {
    const input = call.input ?? {};
    if (call.name === "continue_work") {
      hasContinueWork = true;
      const delay = Number(input.delaySeconds ?? input.delay_seconds ?? input.delay ?? 0);
      const reason = stableString(input.reason ?? input.message ?? input.text ?? "").trim();
      if (reason) {
        reasons.push(reason);
      }
      if (!Number.isFinite(delay) || delay <= 0) {
        zeroDelayContinueReasons.push(reason || "<empty>");
        signals.push("zero-delay-continue_work");
      } else {
        signals.push("delayed-continue_work");
      }
      continue;
    }
    if (call.name === "sessions_yield") {
      hasYield = true;
      signals.push("sessions_yield");
      continue;
    }
    if (call.name === "message") {
      const action = String(input.action ?? input.kind ?? "").toLowerCase();
      const message = stableString(input.message ?? input.text ?? input.caption ?? "").trim();
      if (["react", "read"].includes(action)) {
        signals.push(`message.${action}`);
        continue;
      }
      if (action === "send" && isNoReplyText(message)) {
        signals.push("message.send.NO_REPLY");
        continue;
      }
      if (action === "send" && message.length <= 160) {
        signals.push("message.send.short");
        continue;
      }
    }
    if (call.name === "exec" || call.name === "process") {
      signals.push(`${call.name}.tiny-or-unknown`);
      continue;
    }
    hasOnlyLowValueTools = false;
  }

  const textNoReply = isNoReplyText(text);
  const blank = text.length === 0;
  const toolErrors = toolResults
    .map((result) =>
      stableString(result.error ?? result.content ?? result.result ?? result.text ?? ""),
    )
    .filter((value) => /error|requires a target|suppressed|no output/iu.test(value));
  if (toolErrors.length > 0) {
    signals.push("tool-error-or-suppressed");
  }

  const noOp =
    blank ||
    textNoReply ||
    hasYield ||
    zeroDelayContinueReasons.length > 0 ||
    (hasOnlyLowValueTools && (toolCalls.length > 0 || toolErrors.length > 0));

  const substantive =
    !noOp && (text.length > 0 || toolCalls.some((call) => call.name !== "continue_work"));

  return {
    noOp,
    substantive,
    toolNames: names,
    signals: uniqueSorted(signals),
    reasons,
    zeroDelayContinueReasons,
    hasContinueWork,
    hasYield,
  };
}

function sessionKeyFromFile(filePath) {
  const base = path.basename(filePath);
  return `file:${base.replace(/\.jsonl.*$/u, "")}`;
}

export function readSessionJsonl(filePath, filters = {}) {
  const events = [];
  const since = toMs(filters.since);
  const until = toMs(filters.until);
  for (const { row, line, raw } of lineJsonObjects(filePath)) {
    const timestampMs = extractTimestamp(row);
    if (timestampMs != null && since != null && timestampMs < since) {
      continue;
    }
    if (timestampMs != null && until != null && timestampMs > until) {
      continue;
    }
    const message = row.message && typeof row.message === "object" ? row.message : row;
    const role = message.role ?? row.role ?? getPath(row, ["data", "role"]);
    const parts = extractMessageParts(row);
    const text = extractText(parts);
    const sessionKey = extractSessionKey(row) ?? sessionKeyFromFile(filePath);
    const base = {
      filePath,
      line,
      timestampMs,
      timestamp: iso(timestampMs),
      sessionKey,
      runId: extractRunId(row),
      textPreview: text.slice(0, 240),
    };
    if (role === "user") {
      events.push({
        ...base,
        kind: "user",
        roomEvent: isRoomEventRow(row, `${text} ${raw}`),
      });
      continue;
    }
    if (role === "assistant") {
      const toolCalls = extractToolCalls(parts);
      const toolResults = extractToolResults(parts);
      const classification = classifyAssistantTurn(toolCalls, toolResults, text);
      events.push({
        ...base,
        kind: "assistant",
        ...classification,
      });
      continue;
    }
    if (role === "tool") {
      events.push({ ...base, kind: "tool" });
    }
  }
  return events;
}

function inferSessionKeyFromTrajectory(row, filePath) {
  return (
    extractSessionKey(row) ?? getPath(row, ["data", "sessionKey"]) ?? sessionKeyFromFile(filePath)
  );
}

export function readTrajectoryJsonl(filePath, filters = {}) {
  const events = [];
  const since = toMs(filters.since);
  const until = toMs(filters.until);
  for (const { row, line } of lineJsonObjects(filePath)) {
    const timestampMs = extractTimestamp(row);
    if (timestampMs != null && since != null && timestampMs < since) {
      continue;
    }
    if (timestampMs != null && until != null && timestampMs > until) {
      continue;
    }
    const name = row.name ?? row.event ?? row.type ?? getPath(row, ["data", "name"]);
    const data = row.data && typeof row.data === "object" ? row.data : row;
    const model = data.model ?? data.modelId ?? data.model_id ?? getPath(data, ["model", "id"]);
    const provider = data.provider ?? data.providerId ?? data.provider_id;
    const tokenUsage = data.usage ?? data.tokens ?? data;
    events.push({
      filePath,
      line,
      timestampMs,
      timestamp: iso(timestampMs),
      sessionKey: inferSessionKeyFromTrajectory(row, filePath),
      runId: extractRunId(row),
      name: String(name ?? "unknown"),
      model,
      provider,
      inputTokens:
        Number(
          tokenUsage.inputTokens ??
            tokenUsage.input_tokens ??
            tokenUsage.promptTokens ??
            tokenUsage.input ??
            0,
        ) || 0,
      outputTokens:
        Number(
          tokenUsage.outputTokens ??
            tokenUsage.output_tokens ??
            tokenUsage.completionTokens ??
            tokenUsage.output ??
            0,
        ) || 0,
      totalTokens:
        Number(tokenUsage.totalTokens ?? tokenUsage.total_tokens ?? tokenUsage.total ?? 0) || 0,
      cacheReadTokens:
        Number(
          tokenUsage.cacheReadTokens ?? tokenUsage.cache_read_tokens ?? tokenUsage.cacheRead ?? 0,
        ) || 0,
    });
  }
  return events;
}

export function readJournalFile(filePath, filters = {}) {
  const events = [];
  const since = toMs(filters.since);
  const until = toMs(filters.until);
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) {
      continue;
    }
    const parsed = parseJsonMaybe(raw);
    const text = parsed ? stableString(parsed) : raw;
    if (
      !/model|provider|fetch|completed|completion|runId|toolCallId|continuation|room_event/iu.test(
        text,
      )
    ) {
      continue;
    }
    const timestampMs = parsed
      ? extractTimestamp(parsed)
      : toMs(raw.match(/\d{4}-\d{2}-\d{2}T[^\s]+/u)?.[0]);
    if (timestampMs != null && since != null && timestampMs < since) {
      continue;
    }
    if (timestampMs != null && until != null && timestampMs > until) {
      continue;
    }
    events.push({
      filePath,
      line: i + 1,
      timestampMs,
      timestamp: iso(timestampMs),
      sessionKey: parsed ? extractSessionKey(parsed) : undefined,
      runId: parsed ? extractRunId(parsed) : raw.match(/runId[=:]\s*([\w:-]+)/u)?.[1],
      model: parsed?.model ?? parsed?.modelId ?? raw.match(/model(?:Id)?[=:]\s*([^\s,]+)/u)?.[1],
      provider: parsed?.provider ?? raw.match(/provider[=:]\s*([^\s,]+)/u)?.[1],
      textPreview: text.slice(0, 300),
    });
  }
  return events;
}

async function readFlowRowsFromSqlite(filePath) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch (error) {
    return {
      filePath,
      error: `node:sqlite unavailable: ${error instanceof Error ? error.message : String(error)}`,
      rows: [],
    };
  }
  const rows = [];
  let db;
  try {
    db = new DatabaseSync(filePath, { readOnly: true });
    const hasTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'flow_runs'")
      .get();
    if (!hasTable) {
      return { filePath, rows, warning: "No flow_runs table" };
    }
    const stmt = db.prepare(`
      SELECT flow_id, owner_key, status, goal, current_step, state_json,
             wait_json, created_at, updated_at, ended_at
      FROM flow_runs
      ORDER BY created_at ASC, flow_id ASC
    `);
    for (const row of stmt.all()) {
      const stateJson = parseJsonMaybe(row.state_json) ?? {};
      const waitJson = parseJsonMaybe(row.wait_json) ?? {};
      rows.push({
        filePath,
        flowId: row.flow_id,
        ownerKey: row.owner_key,
        status: row.status,
        goal: row.goal,
        currentStep: row.current_step,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        endedAt: row.ended_at == null ? undefined : Number(row.ended_at),
        stateJson,
        waitJson,
        stateSessionKey: stateJson.sessionKey,
        parentRunId: stateJson.parentRunId,
        chainId: stateJson.chainId,
        reason: stateJson.reason,
        delayMs: stateJson.delayMs,
        dueAt: stateJson.dueAt,
      });
    }
  } catch (error) {
    return {
      filePath,
      error: error instanceof Error ? error.message : String(error),
      rows,
    };
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close failures in read-only audit tool
    }
  }
  return { filePath, rows };
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}

function dominantModel(trajectoryEvents, journalEvents) {
  const counts = new Map();
  for (const event of [...trajectoryEvents, ...journalEvents]) {
    const model = event.model;
    if (!model) {
      continue;
    }
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  return [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0];
}

function summarizeReasons(events) {
  const counts = new Map();
  for (const event of events) {
    for (const reason of event.zeroDelayContinueReasons ?? []) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));
}

function countSignals(events) {
  const counts = new Map();
  for (const event of events) {
    for (const signal of event.signals ?? []) {
      counts.set(signal, (counts.get(signal) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].toSorted((a, b) => b[1] - a[1]));
}

function findNoopClustersForSession(sessionKey, events, trajectoryEvents, journalEvents, options) {
  const sorted = [...events].toSorted(
    (a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0) || a.line - b.line,
  );
  const clusters = [];
  let current = [];
  let lastUser = undefined;

  const flush = () => {
    if (current.length < options.minNoopTurns) {
      current = [];
      return;
    }
    const first = current[0];
    const last = current[current.length - 1];
    const startMs = first.timestampMs;
    const endMs = last.timestampMs;
    const durationMs = startMs != null && endMs != null ? Math.max(0, endMs - startMs) : undefined;
    const compactBurst =
      durationMs == null ||
      durationMs <= options.windowMs ||
      current.length >= options.minNoopTurns * 3;
    const repeatedReasons = summarizeReasons(current).filter(
      (entry) => entry.count >= DEFAULT_STALE_REPEAT_MIN,
    );
    if (!compactBurst && repeatedReasons.length === 0) {
      current = [];
      return;
    }
    const relevantTrajectory = trajectoryEvents.filter(
      (event) =>
        event.sessionKey === sessionKey &&
        event.timestampMs != null &&
        startMs != null &&
        endMs != null &&
        event.timestampMs >= startMs &&
        event.timestampMs <= endMs,
    );
    const relevantJournal = journalEvents.filter(
      (event) =>
        (!event.sessionKey || event.sessionKey === sessionKey) &&
        event.timestampMs != null &&
        startMs != null &&
        endMs != null &&
        event.timestampMs >= startMs &&
        event.timestampMs <= endMs,
    );
    clusters.push({
      sessionKey,
      start: iso(startMs),
      end: iso(endMs),
      durationMs,
      noOpTurns: current.length,
      compactBurst,
      lastUserBeforeCluster: lastUser?.timestamp,
      signals: countSignals(current),
      repeatedZeroDelayReasons: repeatedReasons,
      toolPattern: uniqueSorted(current.flatMap((event) => event.toolNames ?? [])),
      model: dominantModel(relevantTrajectory, relevantJournal),
      trajectoryModelEvents: relevantTrajectory.length,
      journalProviderEvents: relevantJournal.length,
      totalTokensMax: Math.max(0, ...relevantTrajectory.map((event) => event.totalTokens ?? 0)),
      cacheReadTokensMax: Math.max(
        0,
        ...relevantTrajectory.map((event) => event.cacheReadTokens ?? 0),
      ),
      sample: current.slice(0, 5).map((event) => ({
        timestamp: event.timestamp,
        line: event.line,
        filePath: event.filePath,
        signals: event.signals,
        tools: event.toolNames,
        text: event.textPreview,
      })),
    });
    current = [];
  };

  for (const event of sorted) {
    if (event.kind === "user") {
      flush();
      lastUser = event;
      continue;
    }
    if (event.kind !== "assistant") {
      continue;
    }
    if (event.noOp) {
      current.push(event);
      continue;
    }
    if (event.substantive) {
      flush();
    }
  }
  flush();
  return clusters;
}

export function detectNoopClusters(sessionEvents, trajectoryEvents, journalEvents, options) {
  const grouped = groupBy(sessionEvents, (event) => event.sessionKey);
  const clusters = [];
  for (const [sessionKey, events] of grouped.entries()) {
    clusters.push(
      ...findNoopClustersForSession(sessionKey, events, trajectoryEvents, journalEvents, options),
    );
  }
  return clusters.toSorted((a, b) => (b.noOpTurns ?? 0) - (a.noOpTurns ?? 0));
}

export function analyzeRouting(flowRows, sessionEvents) {
  const roomEventSessions = new Map();
  for (const event of sessionEvents) {
    if (event.kind === "user" && event.roomEvent) {
      const entry = roomEventSessions.get(event.sessionKey) ?? {
        sessionKey: event.sessionKey,
        files: new Set(),
        count: 0,
      };
      entry.count += 1;
      entry.files.add(event.filePath);
      roomEventSessions.set(event.sessionKey, entry);
    }
  }
  const childRoomEventSessions = [...roomEventSessions.values()]
    .filter((entry) => /subagent|child/iu.test(entry.sessionKey))
    .map((entry) => ({
      sessionKey: entry.sessionKey,
      count: entry.count,
      files: [...entry.files].toSorted((a, b) => a.localeCompare(b)),
    }));

  const mismatches = [];
  for (const flow of flowRows) {
    const stateSessionKey = flow.stateSessionKey;
    if (stateSessionKey && flow.ownerKey && stateSessionKey !== flow.ownerKey) {
      mismatches.push({
        flowId: flow.flowId,
        ownerKey: flow.ownerKey,
        stateSessionKey,
        parentRunId: flow.parentRunId,
        goal: flow.goal,
        status: flow.status,
        classification: "owner-state-session-mismatch",
      });
    }
    if (flow.parentRunId && stateSessionKey && roomEventSessions.has(stateSessionKey)) {
      mismatches.push({
        flowId: flow.flowId,
        ownerKey: flow.ownerKey,
        stateSessionKey,
        parentRunId: flow.parentRunId,
        goal: flow.goal,
        status: flow.status,
        classification: "parent-run-flow-targets-room-event-session",
      });
    }
  }
  return {
    roomEventSessions: [...roomEventSessions.values()].map((entry) => ({
      sessionKey: entry.sessionKey,
      count: entry.count,
      files: [...entry.files].toSorted((a, b) => a.localeCompare(b)),
    })),
    childRoomEventSessions,
    flowRoutingMismatches: mismatches,
    disposition:
      childRoomEventSessions.length > 0 || mismatches.length > 0
        ? "split-child-parent-binding-after-byte-review"
        : "keep-in-room-event-self-rearm-family",
  };
}

function collectSessionFiles(args) {
  return uniqueSorted([
    ...args.session,
    ...args.sessionDir.flatMap((dir) =>
      walkFiles(dir, (file) => /\.jsonl(?:\.|$)/u.test(path.basename(file))),
    ),
  ]);
}

function collectTrajectoryFiles(args) {
  return uniqueSorted(
    args.trajectory.flatMap((entry) =>
      walkFiles(entry, (file) =>
        /(?:\.trajectory\.jsonl|events\.jsonl|\.jsonl)$/u.test(path.basename(file)),
      ),
    ),
  );
}

async function buildReport(args) {
  const sessionFiles = collectSessionFiles(args);
  const trajectoryFiles = collectTrajectoryFiles(args);
  const sessionEvents = sessionFiles.flatMap((file) => readSessionJsonl(file, args));
  const trajectoryEvents = trajectoryFiles.flatMap((file) => readTrajectoryJsonl(file, args));
  const journalEvents = args.journal.flatMap((file) => readJournalFile(file, args));
  const flowResults = [];
  for (const dbPath of args.db) {
    flowResults.push(await readFlowRowsFromSqlite(dbPath));
  }
  const flowRows = flowResults.flatMap((result) => result.rows ?? []);
  const clusters = detectNoopClusters(sessionEvents, trajectoryEvents, journalEvents, args);
  const routing = analyzeRouting(flowRows, sessionEvents);

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      db: args.db,
      sessionFiles,
      trajectoryFiles,
      journal: args.journal,
      since: args.since,
      until: args.until,
    },
    thresholds: {
      minNoopTurns: args.minNoopTurns,
      windowMs: args.windowMs,
    },
    counts: {
      flowRows: flowRows.length,
      sessionEvents: sessionEvents.length,
      trajectoryEvents: trajectoryEvents.length,
      journalEvents: journalEvents.length,
      clusters: clusters.length,
    },
    flowReadErrors: flowResults
      .filter((result) => result.error || result.warning)
      .map((result) => ({
        filePath: result.filePath,
        error: result.error,
        warning: result.warning,
      })),
    clusters,
    routing,
  };
}

function printTextReport(report) {
  console.log("# Room-event parking/no-op churn offline audit");
  console.log(`generatedAt: ${report.generatedAt}`);
  console.log(
    `inputs: ${report.counts.flowRows} flow rows, ${report.counts.sessionEvents} session events, ${report.counts.trajectoryEvents} trajectory events, ${report.counts.journalEvents} journal events`,
  );
  console.log(`clusters: ${report.clusters.length}`);
  if (report.flowReadErrors.length > 0) {
    console.log("\n## Flow DB notes");
    for (const entry of report.flowReadErrors) {
      console.log(`- ${entry.filePath}: ${entry.error ?? entry.warning}`);
    }
  }
  console.log("\n## Routing disposition");
  console.log(`- ${report.routing.disposition}`);
  if (report.routing.flowRoutingMismatches.length > 0) {
    for (const mismatch of report.routing.flowRoutingMismatches.slice(0, 12)) {
      console.log(
        `- ${mismatch.classification}: flow=${mismatch.flowId} owner=${mismatch.ownerKey} stateSession=${mismatch.stateSessionKey} parent=${mismatch.parentRunId ?? ""}`,
      );
    }
  }
  if (report.routing.childRoomEventSessions.length > 0) {
    for (const session of report.routing.childRoomEventSessions) {
      console.log(
        `- child/subagent room-event session: ${session.sessionKey} events=${session.count}`,
      );
    }
  }
  console.log("\n## Candidate clusters");
  if (report.clusters.length === 0) {
    console.log("- none found at configured thresholds");
    return;
  }
  for (const cluster of report.clusters.slice(0, 20)) {
    console.log(
      `- ${cluster.sessionKey} ${cluster.start ?? "unknown"}..${cluster.end ?? "unknown"}: ${cluster.noOpTurns} no-op/parking turns, model=${cluster.model ?? "unknown"}, trajectoryEvents=${cluster.trajectoryModelEvents}, journalEvents=${cluster.journalProviderEvents}`,
    );
    const reasons = cluster.repeatedZeroDelayReasons
      .map((entry) => `${entry.count}× ${JSON.stringify(entry.reason).slice(0, 120)}`)
      .join("; ");
    if (reasons) {
      console.log(`  repeated zero-delay reasons: ${reasons}`);
    }
    console.log(
      `  signals: ${Object.entries(cluster.signals)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
    );
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usageText());
    return;
  }
  const report = await buildReport(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printTextReport(report);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(
    /** @param {unknown} error */ (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
