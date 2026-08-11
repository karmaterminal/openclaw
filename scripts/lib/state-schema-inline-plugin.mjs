import crypto from "node:crypto";
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

function contentDigest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/** Inline canonical schema bytes so bundled consumers need no SQL asset. */
export function createStateSchemaInlinePlugin(rootDir = process.cwd()) {
  const schemasByModulePath = new Map(
    STATE_SCHEMA_MODULES.map((schema) => [path.resolve(rootDir, schema.modulePath), schema]),
  );

  /** Map a resolved .ts or emitted .js path onto a known schema module. */
  function schemaForResolvedPath(resolvedPath) {
    const direct = schemasByModulePath.get(resolvedPath);
    if (direct) {
      return { resolvedId: resolvedPath, schema: direct };
    }
    if (resolvedPath.endsWith(".js")) {
      const asTs = `${resolvedPath.slice(0, -3)}.ts`;
      const fromJs = schemasByModulePath.get(asTs);
      if (fromJs) {
        return { resolvedId: asTs, schema: fromJs };
      }
    }
    return { resolvedId: resolvedPath, schema: undefined };
  }

  function matchSchemaModule(id, importer) {
    const bareId = String(id).split("?")[0] ?? id;
    let candidate = bareId;
    // Production imports use relative `.js` specifiers. Resolve them against the
    // importer so the plugin catches the real module graph, not only absolute
    // `.ts` paths handed in by unit tests.
    if (
      importer &&
      (bareId.startsWith("./") ||
        bareId.startsWith("../") ||
        bareId.startsWith(".\\") ||
        bareId.startsWith("..\\"))
    ) {
      const importerPath = String(importer).split("?")[0] ?? importer;
      candidate = path.resolve(path.dirname(importerPath), bareId);
    } else if (!path.isAbsolute(bareId)) {
      candidate = path.resolve(rootDir, bareId);
    } else {
      candidate = path.resolve(bareId);
    }
    return schemaForResolvedPath(candidate);
  }

  return {
    name: STATE_SCHEMA_INLINE_PLUGIN_NAME,
    resolveId(id, importer) {
      const { resolvedId, schema } = matchSchemaModule(id, importer);
      if (!schema) {
        return null;
      }
      // Bust Vitest/Vite module cache when only the .sql asset bytes change —
      // including same-mtime rewrites — by stamping a content digest, not mtime.
      // load() already re-reads SQL, but cached load output otherwise stays sticky
      // across process restarts when the .ts module bytes are unchanged.
      const schemaPath = path.resolve(rootDir, schema.schemaPath);
      const digest = contentDigest(fs.readFileSync(schemaPath));
      return `${resolvedId}?${SCHEMA_QUERY_PREFIX}${digest}`;
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
