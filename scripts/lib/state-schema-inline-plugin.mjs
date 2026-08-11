import fs from "node:fs";
import path from "node:path";

export const STATE_SCHEMA_INLINE_PLUGIN_NAME = "openclaw:inline-state-schemas";

const STATE_SCHEMA_MODULES = [
  {
    modulePath: "src/state/openclaw-state-schema.ts",
    schemaPath: "src/state/openclaw-state-schema.sql",
    exportName: "OPENCLAW_STATE_SCHEMA_SQL",
  },
  {
    modulePath: "src/state/openclaw-agent-schema.ts",
    schemaPath: "src/state/openclaw-agent-schema.sql",
    exportName: "OPENCLAW_AGENT_SCHEMA_SQL",
  },
];

const SCHEMA_QUERY_PREFIX = "openclaw-schema=";

/** Inline canonical schema bytes so bundled consumers need no SQL asset. */
export function createStateSchemaInlinePlugin(rootDir = process.cwd()) {
  const schemasByModulePath = new Map(
    STATE_SCHEMA_MODULES.map((schema) => [path.resolve(rootDir, schema.modulePath), schema]),
  );

  function matchSchemaModule(id) {
    const bareId = String(id).split("?")[0] ?? id;
    const resolvedId = path.isAbsolute(bareId)
      ? path.resolve(bareId)
      : path.resolve(rootDir, bareId);
    return { resolvedId, schema: schemasByModulePath.get(resolvedId) };
  }

  return {
    name: STATE_SCHEMA_INLINE_PLUGIN_NAME,
    resolveId(id) {
      const { resolvedId, schema } = matchSchemaModule(id);
      if (!schema) {
        return null;
      }
      // Bust Vitest/Vite module cache when only the .sql asset changes. load()
      // already re-reads SQL, but cached load output otherwise stays sticky across
      // process restarts when the .ts module bytes are unchanged.
      const schemaPath = path.resolve(rootDir, schema.schemaPath);
      const stamp = fs.statSync(schemaPath).mtimeMs;
      return `${resolvedId}?${SCHEMA_QUERY_PREFIX}${stamp}`;
    },
    load(id) {
      // Vitest may append query suffixes (e.g. ?v=...); strip before lookup.
      const { resolvedId, schema } = matchSchemaModule(id);
      if (!schema) {
        return null;
      }
      const schemaPath = path.resolve(rootDir, schema.schemaPath);
      this.addWatchFile(schemaPath);
      return {
        code: `export const ${schema.exportName} = ${JSON.stringify(fs.readFileSync(schemaPath, "utf8"))};\n`,
        moduleType: "js",
      };
    },
  };
}
