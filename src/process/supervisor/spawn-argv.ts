import type { SpawnInput } from "./types.js";

/** Resolve the native argv, refusing input that a native spawn would reject or truncate. */
export function resolveSpawnArgv(input: SpawnInput): string[] {
  if (input.mode !== "anchored-shell" && input.argv.length === 0) {
    throw new Error("spawn argv cannot be empty");
  }
  const resolvedArgs = input.mode === "child" ? input.resolveArgs?.() : undefined;
  const argv =
    input.mode === "anchored-shell"
      ? []
      : resolvedArgs
        ? [...input.argv, ...resolvedArgs]
        : input.argv;
  if (
    argv.some((argument) => argument.includes("\0")) ||
    (input.mode === "child" && input.argv0?.includes("\0")) ||
    (input.mode === "anchored-shell" && input.command.includes("\0"))
  ) {
    throw new Error(
      "Execution command and arguments must not contain NUL bytes. Remove them and retry.",
    );
  }
  return argv;
}
