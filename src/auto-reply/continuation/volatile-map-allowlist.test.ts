import { readFileSync, readdirSync } from "node:fs";
import { basename, join, posix } from "node:path";
import * as ts from "typescript/ast";
import { afterAll, describe, expect, it } from "vitest";
import { createNativeTypeScriptParser } from "../../../scripts/lib/native-typescript.mts";

const sourceParser = createNativeTypeScriptParser();
afterAll(() => sourceParser.close());

type CollectionKind = "Map" | "Set" | "WeakMap";

type AllowlistEntry = {
  file: string;
  symbol: string;
  owner: string;
  purpose: string;
  safeVolatileClassification: string;
  restartContract: string;
};

type Finding = {
  file: string;
  symbol: string;
  line: number;
  collectionKind: CollectionKind;
};

type Candidate = Finding & {
  expression: ts.NewExpression;
  typeArguments: readonly string[];
};

const SOURCE_ROOT = process.cwd();

// Reply-run registry and finalization-lease state moved into the session controller
// (src/sessions, upstream #175837), which is outside this continuation surface.
const ALLOWLIST = [
  {
    file: "src/auto-reply/continuation/state.ts",
    symbol: "continuationTimerHandles",
    owner: "continuation timer registry",
    purpose: "Tracks the live setTimeout handles owned by each continuation sessionKey.",
    safeVolatileClassification:
      "Timer handles are Node process objects; persisting them would not make a restarted process able to clear or fire the old timeout.",
    restartContract:
      "Lost on process restart; durable delayed delegate intent stays in continuation custody and is reloaded by the next continuation scheduling pass.",
  },
  {
    file: "src/auto-reply/continuation/state.ts",
    symbol: "continuationTimerRefs",
    owner: "continuation timer registry",
    purpose:
      "Counts currently live continuation timers per sessionKey for process-liveness checks.",
    safeVolatileClassification:
      "The ref count mirrors in-process timeout handles only and has no durable meaning without those handles.",
    restartContract:
      "Reset to empty on process restart; pending delegate records remain in continuation custody and rebuild timer state when scheduling resumes.",
  },
  {
    file: "src/auto-reply/continuation/delegate-dispatch-hedge.ts",
    symbol: "hedgeTimers",
    owner: "continuation delegate dispatcher",
    purpose:
      "Keeps one hedge setTimeout per sessionKey so quiet channels re-check unmatured pending delegates.",
    safeVolatileClassification:
      "The map stores timeout handles for the current Node process; the underlying pending delegates are persisted in continuation custody.",
    restartContract:
      "Lost on process restart; the custody queue remains and the next dispatch/finalize cycle can arm a fresh hedge.",
  },
  {
    file: "src/auto-reply/continuation/work-dispatch.ts",
    symbol: "workTimers",
    owner: "continuation work dispatcher",
    purpose:
      "Keeps one setTimeout handle per sessionKey for scheduled continue_work follow-through on the main lane.",
    safeVolatileClassification:
      "The map stores timeout handles for the current Node process; the underlying continue_work intent is persisted in continuation custody.",
    restartContract:
      "Lost on process restart; the custody queue remains and the next continuation scheduling pass can arm a fresh work timer.",
  },
  {
    file: "src/auto-reply/continuation/work-dispatch.ts",
    symbol: "idleRetryControllers",
    owner: "continuation work dispatcher",
    purpose:
      "Dedupes the live AbortController waiting for a reply-run end or command-lane idle event before retrying a busy continue_work row.",
    safeVolatileClassification:
      "The map stores AbortControllers and in-process waiter closures; the durable retry intent and slow hedge dueAt are persisted in continuation custody.",
    restartContract:
      "Lost on process restart; pending continuation work remains in continuation custody and recovery re-arms the hedge timer so the row is not stranded.",
  },
  {
    file: "src/auto-reply/continuation/work-dispatch.ts",
    symbol: "idleRetryFailureTimers",
    owner: "continuation work dispatcher",
    purpose:
      "Keeps a short recovery setTimeout per sessionKey when idle-event waiter registration fails, so queued idle-retry rows are retried without waiting for the slow hedge.",
    safeVolatileClassification:
      "The map stores timeout handles for the current Node process; the queued idle-retry intent remains persisted in continuation custody.",
    restartContract:
      "Lost on process restart; pending continuation work remains in continuation custody and restart recovery/normal scheduling can re-arm recovery or hedge timers from durable records.",
  },
  {
    file: "src/auto-reply/continuation/continuation-dispatch-claims.ts",
    symbol: "activeDispatchClaims",
    owner: "continuation dispatch claim registry",
    purpose:
      "Tracks live AbortControllers for claimed continue_work and delegate callbacks so explicit reset can close them before provider admission.",
    safeVolatileClassification:
      "The map contains only current-process execution controllers; durable continuation custody records remain the restart and recovery authority.",
    restartContract:
      "Lost on process restart; running custody records are resolved by boot recovery after the stale-running cutoff and are never re-driven by a fresh controller.",
  },
  {
    file: "src/auto-reply/continuation/delegate-turn-admission.ts",
    symbol: "delegatesScheduledThisTurn",
    owner: "continue_delegate per-turn admission",
    purpose:
      "Counts how many continue_delegate calls a session has scheduled in the current assistant turn so the maxDelegatesPerTurn cap resets at each assistant-turn boundary (the tool list is built once per run).",
    safeVolatileClassification:
      "The count is turn-scoped rate state, not durable delegate substrate; the delegates themselves are persisted in the continuation custody delegate store, and the cap is also enforced by the post-response dispatcher.",
    restartContract:
      "Lost on process restart, which is the correct post-restart state: the next turn starts at a zero admission count and the durable delegate queue is unaffected.",
  },
  {
    file: "src/auto-reply/continuation/work-operator-continuation.ts",
    symbol: "retained",
    owner: "continuation work operator custody",
    purpose:
      "Holds the live operator policy custody captured when continue_work was accepted, per work flow, until that flow's wake re-enters it.",
    safeVolatileClassification:
      "The custody is a live Gateway operator authority with a release handle; persisting it would let a restarted process claim authority it no longer holds.",
    restartContract:
      "Lost on process restart; the flow's durable operatorAuthorityRequired marker makes its wake fail ('Retained operator authority unavailable; wake refused.') instead of running as system work.",
  },
  {
    file: "src/auto-reply/continuation/work-dispatch-flow-mock.test-support.ts",
    symbol: "custodyCommandNamesInFlight",
    owner: "continuation work-dispatch test support",
    purpose:
      "Counts in-flight custody worker commands by name so work-dispatch suites can wait for background custody replies that fake timers cannot advance, and name the stuck command when a settle times out.",
    safeVolatileClassification:
      "Test-support-only instrumentation; it never runs in production and holds no delegate or work state, only command-name counters.",
    restartContract:
      "Not applicable to production restarts; each test starts with no command in flight and the durable custody store is untouched.",
  },
  {
    file: "src/auto-reply/continuation/targeting.ts",
    symbol: "unarmedHeldReturnWarnedAt",
    owner: "continuation targeted-return reporter",
    purpose:
      "Rate-limits the warning for a held return whose retry could not be armed to once per state database and session per window.",
    safeVolatileClassification:
      "Map of state-database/session keys to the last warning time; log throttling only, the held return itself is a durable queue row.",
    restartContract:
      "Lost on process restart; the next unarmed held return warns again, and the durable row is recovered by the startup scan or periodic sweep.",
  },
  {
    file: "src/auto-reply/continuation/work-terminal-notice.ts",
    symbol: "retryTimers",
    owner: "continuation terminal-notice retrier",
    purpose:
      "Keeps one live retry setTimeout per terminal-notice key while a failed durable handoff notice is re-attempted.",
    safeVolatileClassification:
      "The map stores Node timeout handles for the current process; the terminal-notice intent itself is persisted durably.",
    restartContract:
      "Lost on process restart; the durable terminal notice remains and the next delivery pass can arm a fresh retry timer.",
  },
  {
    file: "src/auto-reply/continuation/continuation-wake.ts",
    symbol: "pendingWakes",
    owner: "continuation wake coalescer",
    purpose:
      "Buffers wake requests for one session and delivery class over the 250 ms coalescing window, with the durable return rows each wake names and its live timer.",
    safeVolatileClassification:
      "Holds a Node timeout handle and the ack ids of durable session-delivery rows; those rows own delivery and are acknowledged only after the woken turn is adopted.",
    restartContract:
      "Lost on process restart; the named rows stay pending, and restart replay (recoverPendingRestartContinuationDeliveries) re-queues their events and requests the wake again.",
  },
  {
    file: "src/auto-reply/continuation/continuation-wake.ts",
    symbol: "inFlightWakes",
    owner: "continuation wake coalescer",
    purpose: "Tracks the handoff promises of running wakes so test settlement can await them.",
    safeVolatileClassification:
      "Set of live promises for in-process handoffs; a promise has no meaning in another process.",
    restartContract:
      "Lost on process restart; a handoff that never reached adoption leaves its rows pending for restart replay, and an adopted one has already acknowledged them.",
  },
  {
    file: "src/auto-reply/reply/reply-run-typing.ts",
    symbol: "typingByReplyOperation",
    owner: "reply run typing binder",
    purpose:
      "Keeps one typing/feedback controller attached to the live ReplyOperation that owns a reply run.",
    safeVolatileClassification:
      "WeakMap of live ReplyOperations to transport-bound typing controllers; both are process objects.",
    restartContract:
      "Lost on process restart; typing indicators stop with the process and are re-established by the next run.",
  },
] as const satisfies readonly AllowlistEntry[];

const MUTATING_COLLECTION_METHODS = new Set(["add", "clear", "delete", "set"]);
const STATE_KEYWORD_PATTERN = /\b(session|run|task|chain|delegate|queue|operation)\b/i;

function collectContinuationSurfaceFiles(): string[] {
  const continuationFiles = collectTypeScriptFiles("src/auto-reply/continuation", {
    recursive: true,
  });
  const replyFiles = collectTypeScriptFiles("src/auto-reply/reply", {
    recursive: false,
  }).filter((file) => {
    const name = basename(file);
    return (
      name.startsWith("continuation-") ||
      name.startsWith("post-compaction-") ||
      name.startsWith("reply-run-")
    );
  });
  const agentFiles = [
    "src/agents/subagents/announce/subagent-announce.ts",
    "src/agents/subagents/spawn/subagent-spawn.ts",
  ];

  return [...new Set([...continuationFiles, ...replyFiles, ...agentFiles])].toSorted();
}

function collectTypeScriptFiles(relativeDir: string, options: { recursive: boolean }): string[] {
  const absoluteDir = join(SOURCE_ROOT, relativeDir);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (options.recursive) {
        files.push(...collectTypeScriptFiles(relativePath, options));
      }
      continue;
    }
    if (entry.isFile() && isProductionTypeScriptFile(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

function isProductionTypeScriptFile(name: string): boolean {
  return name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts");
}

function scanContinuationSurface(): Finding[] {
  return collectContinuationSurfaceFiles().flatMap(scanFileForVolatileCollections);
}

function scanFileForVolatileCollections(file: string): Finding[] {
  const sourceText = readFileSync(join(SOURCE_ROOT, file), "utf8");
  const sourceFile = sourceParser.parseSourceFile(file, sourceText);
  const mutatedSymbols = collectMutatedCollectionSymbols(sourceFile);
  const findings: Finding[] = [];

  function visit(node: ts.Node): void {
    const candidate = candidateFromNode(file, sourceFile, node);
    if (candidate && isStateBearingCandidate(candidate, mutatedSymbols)) {
      findings.push({
        file: candidate.file,
        symbol: candidate.symbol,
        line: candidate.line,
        collectionKind: candidate.collectionKind,
      });
    }
    node.forEachChild(visit);
  }

  visit(sourceFile);
  // A singleton field may be both declared in its initializer and lazily re-initialized; report it once.
  const seen = new Set<string>();
  return findings.toSorted(compareFindings).filter((finding) => {
    const key = findingKey(finding);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function collectMutatedCollectionSymbols(sourceFile: ts.SourceFile): Set<string> {
  const symbols = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      if (MUTATING_COLLECTION_METHODS.has(methodName)) {
        const receiverName = collectionReceiverName(node.expression.expression);
        if (receiverName) {
          symbols.add(receiverName);
        }
      }
    }
    node.forEachChild(visit);
  }

  visit(sourceFile);
  return symbols;
}

function collectionReceiverName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return undefined;
}

function candidateFromNode(
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
): Candidate | undefined {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    isModuleLevelVariableDeclaration(node)
  ) {
    return candidateFromInitializer(file, sourceFile, node.name.text, node, node.initializer);
  }

  if (ts.isPropertyAssignment(node) && hasResolveGlobalSingletonAncestor(node, sourceFile)) {
    const symbol = propertyNameText(node.name);
    if (symbol) {
      return candidateFromInitializer(file, sourceFile, symbol, node, node.initializer);
    }
  }

  // Lazily initialized singleton fields: `state.field ??= new Map()` at module level.
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    isModuleLevelExpression(node)
  ) {
    return candidateFromInitializer(file, sourceFile, node.left.name.text, node, node.right);
  }

  if (
    ts.isPropertyDeclaration(node) &&
    node.initializer &&
    isModuleLevelClassPropertyDeclaration(node)
  ) {
    const symbol = propertyNameText(node.name);
    if (symbol) {
      return candidateFromInitializer(file, sourceFile, symbol, node, node.initializer);
    }
  }

  return undefined;
}

function candidateFromInitializer(
  file: string,
  sourceFile: ts.SourceFile,
  symbol: string,
  node: ts.Node,
  initializer: ts.Expression,
): Candidate | undefined {
  const collectionKind = collectionConstructorName(initializer);
  if (!collectionKind || !ts.isNewExpression(initializer)) {
    return undefined;
  }
  return {
    file,
    symbol,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    collectionKind,
    expression: initializer,
    typeArguments:
      initializer.typeArguments?.map((typeArgument) => typeArgument.getText(sourceFile)) ?? [],
  };
}

function collectionConstructorName(expression: ts.Expression): CollectionKind | undefined {
  if (!ts.isNewExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return undefined;
  }
  const constructorName = expression.expression.text;
  return constructorName === "Map" || constructorName === "Set" || constructorName === "WeakMap"
    ? constructorName
    : undefined;
}

function isModuleLevelVariableDeclaration(node: ts.VariableDeclaration): boolean {
  return (
    ts.isVariableDeclarationList(node.parent) &&
    ts.isVariableStatement(node.parent.parent) &&
    ts.isSourceFile(node.parent.parent.parent)
  );
}

function isModuleLevelExpression(node: ts.Expression): boolean {
  let current: ts.Node = node;
  while (ts.isParenthesizedExpression(current.parent)) {
    current = current.parent;
  }
  const parent = current.parent;
  if (ts.isExpressionStatement(parent)) {
    return ts.isSourceFile(parent.parent);
  }
  return (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === current &&
    isModuleLevelVariableDeclaration(parent)
  );
}

function isModuleLevelClassPropertyDeclaration(node: ts.PropertyDeclaration): boolean {
  return ts.isClassDeclaration(node.parent) && ts.isSourceFile(node.parent.parent);
}

function hasResolveGlobalSingletonAncestor(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current && current !== sourceFile) {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === "resolveGlobalSingleton"
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function isStateBearingCandidate(
  candidate: Candidate,
  mutatedSymbols: ReadonlySet<string>,
): boolean {
  if (
    ALLOWLIST.some((entry) => entry.file === candidate.file && entry.symbol === candidate.symbol)
  ) {
    return true;
  }
  if (candidate.collectionKind === "WeakMap") {
    return true;
  }
  if (
    hasStateKeyword(candidate.symbol) ||
    candidate.typeArguments.some(hasStateKeyword) ||
    mutatedSymbols.has(candidate.symbol)
  ) {
    return true;
  }
  if (candidate.collectionKind === "Map" && isStringKeyedEmptyMap(candidate)) {
    return true;
  }
  return candidate.collectionKind === "Set" && isEmptyConstructor(candidate.expression);
}

function hasStateKeyword(value: string): boolean {
  return STATE_KEYWORD_PATTERN.test(value);
}

function isStringKeyedEmptyMap(candidate: Candidate): boolean {
  return (
    candidate.typeArguments[0]?.replaceAll(/\s+/g, "") === "string" &&
    isEmptyConstructor(candidate.expression)
  );
}

function isEmptyConstructor(expression: ts.NewExpression): boolean {
  return expression.arguments === undefined || expression.arguments.length === 0;
}

function findingKey(finding: Pick<Finding, "file" | "symbol">): string {
  return `${finding.file}:${finding.symbol}`;
}

function compareFindings(left: Finding, right: Finding): number {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.symbol.localeCompare(right.symbol)
  );
}

describe("volatile-map allowlist (continuation surface guard-test)", () => {
  it("rejects new session-keyed volatile Maps outside the reviewed allowlist", () => {
    const findings = scanContinuationSurface();
    const allowlistKeys = new Set(ALLOWLIST.map(findingKey));
    const findingKeys = new Set(findings.map(findingKey));
    const unjustified = findings.filter((finding) => !allowlistKeys.has(findingKey(finding)));
    const missing = ALLOWLIST.filter((entry) => !findingKeys.has(findingKey(entry)));

    for (const entry of ALLOWLIST) {
      expect(entry.owner).not.toBe("");
      expect(entry.purpose).not.toBe("");
      expect(entry.safeVolatileClassification).not.toBe("");
      expect(entry.restartContract).not.toBe("");
    }

    expect(
      { unjustified, missing },
      JSON.stringify({ unjustified, missing, findings }, null, 2),
    ).toEqual({
      unjustified: [],
      missing: [],
    });
    expect(findings, JSON.stringify(findings, null, 2)).toHaveLength(ALLOWLIST.length);
  });
});
