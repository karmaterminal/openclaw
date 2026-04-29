#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ts from "typescript";
import {
  getSubstrateCapabilityEntry,
  listSubstrateCapabilityEntries,
  listSubstrateRegistrySymbols,
} from "../src/infra/substrate-capability-registry.js";
import {
  collectTypeScriptFilesFromRoots,
  isTestLikeTypeScriptFile,
  resolveRepoRoot,
  resolveSourceRoots,
  runAsScript,
  toLine,
  unwrapExpression,
} from "./lib/ts-guard-utils.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);
const defaultSourceRoots = resolveSourceRoots(repoRoot, ["src", "extensions", "packages"]);
const execFileAsync = promisify(execFile);

const EXEMPTION_PATTERN = /SUBSTRATE-EXEMPT:\s*\S+/;
const REGISTERED_DIRECTIVE_PATTERN = /SUBSTRATE-REGISTERED:\s*([A-Za-z0-9._-]+)/;
const TRANSPORT_CONCERN_PATTERN =
  /(backoff|broadcast|cross[-_]?host|cross[-_]?session|delegate|deliver(?:y|ies)?|drain|fan[-_]?out|in[-_]?flight|inbox|outbox|pending|poll(?:ing)?|queue|recover(?:y)?|relay|reservation|retry|session|task[-_]?flow|transport|wake)/i;
const FILE_RELAY_CONCERN_PATTERN =
  /(deliver(?:y|ies)?|delegate|inbox|outbox|payload|queue|relay|session|task[-_]?flow|transport)/i;
const FS_MODULE_SPECIFIERS = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"]);
const FS_RELAY_METHODS = new Set([
  "appendFile",
  "copyFile",
  "createReadStream",
  "createWriteStream",
  "mkdir",
  "rename",
  "writeFile",
]);

function readStringLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function readPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return "";
}

function readDeclarationName(node) {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isPropertyAssignment(node)) &&
    node.name
  ) {
    return readPropertyName(node.name);
  }
  return "";
}

function getPropertyAccessParts(node) {
  const parts = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = unwrapExpression(current.expression);
  }
  if (ts.isIdentifier(current)) {
    parts.unshift(current.text);
  }
  return parts;
}

function collectFsImports(sourceFile) {
  const namespaceNames = new Set();
  const namedMethods = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    const specifier = readStringLiteral(statement.moduleSpecifier);
    if (!specifier || !FS_MODULE_SPECIFIERS.has(specifier) || !statement.importClause) {
      continue;
    }
    if (statement.importClause.name) {
      namespaceNames.add(statement.importClause.name.text);
    }
    const bindings = statement.importClause.namedBindings;
    if (!bindings) {
      continue;
    }
    if (ts.isNamespaceImport(bindings)) {
      namespaceNames.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (FS_RELAY_METHODS.has(imported)) {
        namedMethods.add(element.name.text);
      }
    }
  }
  return { namespaceNames, namedMethods };
}

function lineText(lines, line) {
  return lines[line - 1] ?? "";
}

function hasFileExemption(lines) {
  return lines.slice(0, 12).some((line) => EXEMPTION_PATTERN.test(line));
}

function hasLineExemption(lines, line) {
  return [line - 1, line, line + 1].some((candidate) =>
    EXEMPTION_PATTERN.test(lineText(lines, candidate)),
  );
}

function readRegisteredDirective(lines) {
  for (const line of lines.slice(0, 12)) {
    const match = line.match(REGISTERED_DIRECTIVE_PATTERN);
    if (match && getSubstrateCapabilityEntry(match[1])) {
      return match[1];
    }
  }
  return null;
}

function hasRegisteredSubstrateReference(content) {
  const symbols = listSubstrateRegistrySymbols();
  return symbols.some((symbol) => new RegExp(`\\b${symbol}\\b`).test(content));
}

function contextText(sourceFile, node, declarationStack) {
  const radius = 240;
  const source = sourceFile.text;
  return [
    ...declarationStack,
    source.slice(Math.max(0, node.pos - radius), Math.min(source.length, node.end + radius)),
  ].join(" ");
}

function getAssignedName(node) {
  const parent = node.parent;
  if (!parent) {
    return "";
  }
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent)) {
    return readPropertyName(parent.name);
  }
  if (ts.isPropertyDeclaration(parent) && parent.name) {
    return readPropertyName(parent.name);
  }
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const left = unwrapExpression(parent.left);
    if (ts.isIdentifier(left)) {
      return left.text;
    }
    if (ts.isPropertyAccessExpression(left)) {
      return left.name.text;
    }
  }
  return "";
}

function readCallName(node) {
  const expression = unwrapExpression(node.expression);
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return "";
}

function isTimerCall(node) {
  const callName = readCallName(node);
  return callName === "setInterval" || callName === "setTimeout";
}

function isPollingTimerCall(node, sourceFile, declarationStack) {
  const callName = readCallName(node);
  if (callName === "setInterval") {
    return true;
  }
  return (
    callName === "setTimeout" &&
    TRANSPORT_CONCERN_PATTERN.test(contextText(sourceFile, node, declarationStack))
  );
}

function isQueueCollection(node, sourceFile, declarationStack) {
  if (!ts.isNewExpression(node) || !ts.isIdentifier(node.expression)) {
    return false;
  }
  const collectionName = node.expression.text;
  if (collectionName !== "Map" && collectionName !== "Set") {
    return false;
  }
  const assignedName = getAssignedName(node);
  return TRANSPORT_CONCERN_PATTERN.test(
    `${assignedName} ${contextText(sourceFile, node, declarationStack)}`,
  );
}

function isFsRelayCall(node, sourceFile, fsImports, declarationStack) {
  const expression = unwrapExpression(node.expression);
  let method = "";
  let rootName = "";
  if (ts.isIdentifier(expression)) {
    method = expression.text;
    rootName = expression.text;
    if (!fsImports.namedMethods.has(method)) {
      return false;
    }
  } else if (ts.isPropertyAccessExpression(expression)) {
    const parts = getPropertyAccessParts(expression);
    method = parts.at(-1) ?? "";
    rootName = parts[0] ?? "";
    if (!fsImports.namespaceNames.has(rootName) || !FS_RELAY_METHODS.has(method)) {
      return false;
    }
  } else {
    return false;
  }
  return FILE_RELAY_CONCERN_PATTERN.test(
    `${rootName} ${method} ${contextText(sourceFile, node, declarationStack)}`,
  );
}

function chooseSuggestedSubstrate(kind, sourceText) {
  const normalized = sourceText.toLowerCase();
  if (/(delegate|compaction|silent[-_]?wake)/.test(normalized)) {
    return getSubstrateCapabilityEntry("continuation-delegate-store");
  }
  if (kind === "in-process-queue" && /(task[-_]?flow|flow|lifecycle|cancel)/.test(normalized)) {
    return getSubstrateCapabilityEntry("TaskFlow");
  }
  if (kind === "in-process-queue" && /(queue|pending|session|owner|task)/.test(normalized)) {
    return getSubstrateCapabilityEntry("TaskFlow");
  }
  return getSubstrateCapabilityEntry("session-delivery-queue");
}

function createAdvisory(params) {
  const substrate = chooseSuggestedSubstrate(params.kind, params.context);
  if (!substrate) {
    throw new Error(`No substrate suggestion available for ${params.kind}`);
  }
  return {
    path: params.path,
    line: params.line,
    kind: params.kind,
    suggestedSubstrate: substrate.name,
    transportClass: substrate["transport-class"],
  };
}

export function findSubstrateAdoptionAdvisories(content, fileName = "source.ts") {
  const lines = content.split(/\r?\n/);
  if (
    hasFileExemption(lines) ||
    readRegisteredDirective(lines) ||
    hasRegisteredSubstrateReference(content)
  ) {
    return [];
  }

  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  const fsImports = collectFsImports(sourceFile);
  const advisories = [];
  const declarationStack = [];

  const visit = (node) => {
    const declarationName = readDeclarationName(node);
    if (declarationName) {
      declarationStack.push(declarationName);
    }

    const line = toLine(sourceFile, node);
    if (!hasLineExemption(lines, line)) {
      if (
        ts.isCallExpression(node) &&
        isTimerCall(node) &&
        isPollingTimerCall(node, sourceFile, declarationStack)
      ) {
        advisories.push(
          createAdvisory({
            path: fileName,
            line,
            kind: "timer-polling",
            context: contextText(sourceFile, node, declarationStack),
          }),
        );
      } else if (isQueueCollection(node, sourceFile, declarationStack)) {
        advisories.push(
          createAdvisory({
            path: fileName,
            line,
            kind: "in-process-queue",
            context: contextText(sourceFile, node, declarationStack),
          }),
        );
      } else if (
        ts.isCallExpression(node) &&
        isFsRelayCall(node, sourceFile, fsImports, declarationStack)
      ) {
        advisories.push(
          createAdvisory({
            path: fileName,
            line,
            kind: "filesystem-relay",
            context: contextText(sourceFile, node, declarationStack),
          }),
        );
      }
    }

    ts.forEachChild(node, visit);
    if (declarationName) {
      declarationStack.pop();
    }
  };

  visit(sourceFile);
  return advisories;
}

export function formatSubstrateAdoptionAdvisory(advisory) {
  return `Bespoke transport detected at ${advisory.path}:${advisory.line}. Registered substrate \`${advisory.suggestedSubstrate}\` may carry this concern; if you have a named functional reason for bespoke, add a // SUBSTRATE-EXEMPT: <reason> comment naming it. Otherwise consider adopting \`${advisory.suggestedSubstrate}\`.`;
}

export function formatSubstrateAdoptionAdvisories(advisories) {
  return advisories.map((advisory) => formatSubstrateAdoptionAdvisory(advisory)).join("\n");
}

function normalizeRoot(root) {
  return path.isAbsolute(root) ? root : path.join(repoRoot, root);
}

export async function collectSubstrateAdoptionAdvisories(options = {}) {
  const roots = (options.roots ?? defaultSourceRoots).map(normalizeRoot);
  const rootForRelativePaths = options.repoRoot ?? repoRoot;
  const files = options.files ?? (await collectTypeScriptFilesFromRoots(roots));
  const advisories = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const relativePath = path.relative(rootForRelativePaths, filePath).replaceAll(path.sep, "/");
    for (const advisory of findSubstrateAdoptionAdvisories(content, relativePath)) {
      advisories.push(advisory);
    }
  }
  return advisories.toSorted((left, right) =>
    left.path === right.path ? left.line - right.line : left.path.localeCompare(right.path),
  );
}

function isSourceFilePath(relativePath) {
  return (
    relativePath.endsWith(".ts") &&
    !relativePath.endsWith(".d.ts") &&
    !isTestLikeTypeScriptFile(relativePath)
  );
}

function isUnderRoot(filePath, roots) {
  return roots.some((root) => {
    const relative = path.relative(root, filePath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

async function runGit(args) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    });
    return result.stdout.trim();
  } catch {
    return "";
  }
}

async function collectChangedRelativePaths() {
  const staged = await runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  const unstaged = await runGit(["diff", "--name-only", "--diff-filter=ACMR"]);
  const changed = new Set(
    [...staged.split(/\r?\n/), ...unstaged.split(/\r?\n/)].filter((line) => line.length > 0),
  );
  if (changed.size > 0) {
    return [...changed];
  }

  for (const candidateBase of ["origin/cael/325-canonical2", "origin/main"]) {
    const mergeBase = await runGit(["merge-base", "HEAD", candidateBase]);
    if (!mergeBase) {
      continue;
    }
    const diff = await runGit(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...HEAD`]);
    if (diff) {
      return diff.split(/\r?\n/).filter((line) => line.length > 0);
    }
  }

  const headFiles = await runGit([
    "show",
    "--name-only",
    "--pretty=format:",
    "--diff-filter=ACMR",
    "HEAD",
  ]);
  return headFiles.split(/\r?\n/).filter((line) => line.length > 0);
}

export async function collectChangedSubstrateAdoptionAdvisories(options = {}) {
  const roots = (options.roots ?? defaultSourceRoots).map(normalizeRoot);
  const rootForRelativePaths = options.repoRoot ?? repoRoot;
  const files = [];
  for (const relativePath of await collectChangedRelativePaths()) {
    if (!isSourceFilePath(relativePath)) {
      continue;
    }
    const absolutePath = path.join(repoRoot, relativePath);
    if (!isUnderRoot(absolutePath, roots)) {
      continue;
    }
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isFile()) {
        files.push(absolutePath);
      }
    } catch {
      continue;
    }
  }
  return collectSubstrateAdoptionAdvisories({
    files,
    repoRoot: rootForRelativePaths,
    roots,
  });
}

function parseArgs(argv) {
  const roots = [];
  let all = false;
  let changed = false;
  let fail = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--all") {
      all = true;
    } else if (arg === "--changed") {
      changed = true;
    } else if (arg === "--fail") {
      fail = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--root") {
      const root = argv[index + 1];
      if (!root) {
        throw new Error("--root requires a path");
      }
      roots.push(root);
      index += 1;
    } else if (arg.startsWith("--root=")) {
      roots.push(arg.slice("--root=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { all, changed, fail, json, roots };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const scanAll = args.all || (args.roots.length > 0 && !args.changed);
  const advisories = scanAll
    ? await collectSubstrateAdoptionAdvisories({
        roots: args.roots.length > 0 ? args.roots : undefined,
      })
    : await collectChangedSubstrateAdoptionAdvisories();

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          advisories,
          registeredSubstrates: listSubstrateCapabilityEntries().map((entry) => entry.name),
        },
        null,
        2,
      ),
    );
  } else if (advisories.length === 0) {
    console.log(
      `No substrate-adoption advisories found in ${scanAll ? "selected roots" : "changed files"}.`,
    );
  } else {
    console.log(`Substrate-adoption advisories (${advisories.length}):`);
    console.log(formatSubstrateAdoptionAdvisories(advisories));
    console.log("Advisory only. Use --fail when ratcheting this into a hard check.");
  }

  if (args.fail && advisories.length > 0) {
    process.exit(1);
  }
}

runAsScript(import.meta.url, main);
