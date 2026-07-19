/** Resolves and selects workspace plus operator-configured apply_patch roots. */
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
  // Prefer the lexical boundary when the caller addressed a configured root
  // through that spelling. This preserves relative patches when cwd itself is
  // a symlink and lets the normal alias guard treat the root symlink as the
  // trusted boundary rather than as an escape below it.
  const lexicalRoot = [options.cwd, ...(options.allowedRoots ?? [])]
    .map((rootPath) => path.resolve(rootPath))
    .toSorted((left, right) => right.length - left.length)
    .find((candidate) => !relativePathEscapesRoot(path.relative(candidate, absolutePath)));
  if (lexicalRoot) {
    return lexicalRoot;
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

export function relativePathEscapesRoot(relativePath: string): boolean {
  return (
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\") ||
    path.isAbsolute(relativePath)
  );
}
