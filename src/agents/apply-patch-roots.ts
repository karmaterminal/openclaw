/** Resolves and selects workspace plus operator-configured apply_patch roots. */
import fs from "node:fs";
import path from "node:path";
import { resolvePathFromInput } from "./path-policy.js";
import { resolveSandboxHostPathViaExistingAncestor } from "./sandbox/host-paths.js";

type PatchRootOptions = {
  cwd: string;
  allowedRoots?: string[];
};

export function resolvePatchRoots(options: PatchRootOptions): string[] {
  return Array.from(
    new Set(
      [options.cwd, ...(options.allowedRoots ?? [])].map((rootPath) =>
        resolveSandboxHostPathViaExistingAncestor(path.resolve(rootPath)),
      ),
    ),
  ).toSorted((left, right) => right.length - left.length);
}

export function selectPatchRoot(
  filePath: string,
  options: PatchRootOptions,
  roots = resolvePatchRoots(options),
): string {
  if (!options.allowedRoots?.length) {
    return path.resolve(options.cwd);
  }
  const absolutePath = resolvePathFromInput(filePath, options.cwd);
  // Prefer explicitly configured lexical roots before cwd so a workspace alias
  // into an allowed root can use that alias as its trusted boundary.
  const lexicalAllowedRoot = (options.allowedRoots ?? [])
    .map((rootPath) => path.resolve(rootPath))
    .toSorted((left, right) => right.length - left.length)
    .find((candidate) => !relativePathEscapesRoot(path.relative(candidate, absolutePath)));
  if (lexicalAllowedRoot) {
    return lexicalAllowedRoot;
  }
  const workspaceAliasRoot = findAllowedWorkspaceAliasRoot(absolutePath, options);
  if (workspaceAliasRoot) {
    return workspaceAliasRoot;
  }
  const lexicalWorkspaceRoot = path.resolve(options.cwd);
  if (!relativePathEscapesRoot(path.relative(lexicalWorkspaceRoot, absolutePath))) {
    return lexicalWorkspaceRoot;
  }
  // Canonicalize the parent boundary, but leave the final path component
  // lexical. The normal alias guard still validates that component and may
  // intentionally permit unlinking a final symlink without following it.
  const resolvedParent = resolveSandboxHostPathViaExistingAncestor(path.dirname(absolutePath));
  const resolved = path.join(resolvedParent, path.basename(absolutePath));
  const rootPath = roots.find((candidate) => {
    const relative = path.relative(candidate, resolved);
    return !relativePathEscapesRoot(relative);
  });
  if (!rootPath) {
    throw new Error(`Path escapes allowed patch roots: ${filePath}`);
  }
  return rootPath;
}

function findAllowedWorkspaceAliasRoot(
  absolutePath: string,
  options: PatchRootOptions,
): string | undefined {
  const workspaceRoot = path.resolve(options.cwd);
  if (relativePathEscapesRoot(path.relative(workspaceRoot, absolutePath))) {
    return undefined;
  }
  const allowedRoots = (options.allowedRoots ?? []).map((rootPath) =>
    resolveSandboxHostPathViaExistingAncestor(path.resolve(rootPath)),
  );
  const relativeSegments = path
    .relative(workspaceRoot, absolutePath)
    .split(path.sep)
    .filter(Boolean);
  let candidate = workspaceRoot;
  for (const segment of ["", ...relativeSegments]) {
    if (segment) {
      candidate = path.join(candidate, segment);
    }
    const resolvedCandidate = resolveSandboxHostPathViaExistingAncestor(candidate);
    if (
      allowedRoots.some(
        (allowedRoot) => !relativePathEscapesRoot(path.relative(allowedRoot, resolvedCandidate)),
      ) &&
      isDirectoryBoundary(candidate)
    ) {
      return candidate;
    }
  }
  return undefined;
}

function isDirectoryBoundary(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return false;
    }
    throw error;
  }
}

export function relativePathEscapesRoot(relativePath: string): boolean {
  return (
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\") ||
    path.isAbsolute(relativePath)
  );
}
