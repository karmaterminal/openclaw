import os from "node:os";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import { CONFIG_DIR, resolveUserPath } from "../../utils.js";
import { resolvePluginSkillDirs } from "./plugin-skills.js";
import {
  bumpSkillsSnapshotVersion,
  resetSkillsRefreshStateForTest,
  setSkillsChangeListenerErrorHandler,
} from "./refresh-state.js";
export {
  bumpSkillsSnapshotVersion,
  getSkillsSnapshotVersion,
  registerSkillsChangeListener,
  shouldRefreshSnapshotForVersion,
  type SkillsChangeEvent,
} from "./refresh-state.js";

type SkillsWatchState = {
  watcher: FSWatcher;
  pathsKey: string;
  debounceMs: number;
  timer?: ReturnType<typeof setTimeout>;
  pendingPath?: string;
};

const log = createSubsystemLogger("gateway/skills");
const watchers = new Map<string, SkillsWatchState>();

setSkillsChangeListenerErrorHandler((err) => {
  log.warn(`skills change listener failed: ${String(err)}`);
});

export const DEFAULT_SKILLS_WATCH_IGNORED: RegExp[] = [
  /(^|[\\/])\.git([\\/]|$)/,
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])dist([\\/]|$)/,
  // Python virtual environments and caches
  /(^|[\\/])\.venv([\\/]|$)/,
  /(^|[\\/])venv([\\/]|$)/,
  /(^|[\\/])__pycache__([\\/]|$)/,
  /(^|[\\/])\.mypy_cache([\\/]|$)/,
  /(^|[\\/])\.pytest_cache([\\/]|$)/,
  // Build artifacts and caches
  /(^|[\\/])build([\\/]|$)/,
  /(^|[\\/])\.cache([\\/]|$)/,
];

function resolveWatchPaths(workspaceDir: string, config?: OpenClawConfig): string[] {
  const paths: string[] = [];
  if (workspaceDir.trim()) {
    paths.push(path.join(workspaceDir, "skills"));
    paths.push(path.join(workspaceDir, ".agents", "skills"));
  }
  paths.push(path.join(CONFIG_DIR, "skills"));
  paths.push(path.join(os.homedir(), ".agents", "skills"));
  const extraDirsRaw = config?.skills?.load?.extraDirs ?? [];
  const extraDirs = extraDirsRaw
    .map((d) => normalizeOptionalString(d) ?? "")
    .filter(Boolean)
    .map((dir) => resolveUserPath(dir));
  paths.push(...extraDirs);
  const pluginSkillDirs = resolvePluginSkillDirs({ workspaceDir, config });
  paths.push(...pluginSkillDirs);
  return paths;
}

function toWatchRoot(raw: string): string {
  const normalized = raw.replaceAll("\\", "/");
  return normalized.replace(/\/+$/, "") || normalized;
}

function resolveWatchTargets(workspaceDir: string, config?: OpenClawConfig): string[] {
  const targets = new Set<string>();
  for (const root of resolveWatchPaths(workspaceDir, config)) {
    targets.add(toWatchRoot(root));
  }
  return Array.from(targets).toSorted();
}

export function shouldIgnoreSkillsWatchPath(
  watchPath: string,
  stats?: { isDirectory?: () => boolean },
): boolean {
  if (DEFAULT_SKILLS_WATCH_IGNORED.some((re) => re.test(watchPath))) {
    return true;
  }
  if (stats?.isDirectory?.()) {
    return false;
  }
  if (!stats) {
    return false;
  }
  const normalized = watchPath.replaceAll("\\", "/");
  return path.posix.basename(normalized) !== "SKILL.md";
}

export function ensureSkillsWatcher(params: { workspaceDir: string; config?: OpenClawConfig }) {
  const workspaceDir = params.workspaceDir.trim();
  if (!workspaceDir) {
    return;
  }
  const watchEnabled = params.config?.skills?.load?.watch !== false;
  const debounceMsRaw = params.config?.skills?.load?.watchDebounceMs;
  const debounceMs =
    typeof debounceMsRaw === "number" && Number.isFinite(debounceMsRaw)
      ? Math.max(0, debounceMsRaw)
      : 250;

  const existing = watchers.get(workspaceDir);
  if (!watchEnabled) {
    if (existing) {
      watchers.delete(workspaceDir);
      if (existing.timer) {
        clearTimeout(existing.timer);
      }
      void existing.watcher.close().catch(() => {});
    }
    return;
  }

  const watchTargets = resolveWatchTargets(workspaceDir, params.config);
  const pathsKey = watchTargets.join("|");
  if (existing && existing.pathsKey === pathsKey && existing.debounceMs === debounceMs) {
    return;
  }
  if (existing) {
    watchers.delete(workspaceDir);
    if (existing.timer) {
      clearTimeout(existing.timer);
    }
    void existing.watcher.close().catch(() => {});
  }

  const watcher = chokidar.watch(watchTargets, {
    ignoreInitial: true,
    // Skill discovery reads root skills, direct child skills, and one grouped skill level.
    depth: 2,
    awaitWriteFinish: {
      stabilityThreshold: debounceMs,
      pollInterval: 100,
    },
    ignored: shouldIgnoreSkillsWatchPath,
  });

  const state: SkillsWatchState = { watcher, pathsKey, debounceMs };

  const schedule = (changedPath?: string) => {
    state.pendingPath = changedPath ?? state.pendingPath;
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = setTimeout(() => {
      const pendingPath = state.pendingPath;
      state.pendingPath = undefined;
      state.timer = undefined;
      bumpSkillsSnapshotVersion({
        workspaceDir,
        reason: "watch",
        changedPath: pendingPath,
      });
    }, debounceMs);
  };

  const isSkillFile = (changedPath: string): boolean => {
    if (!changedPath) return false;
    const normalized = changedPath.replaceAll("\\", "/");
    return path.posix.basename(normalized) === "SKILL.md";
  };

  const scheduleIfSkill = (changedPath?: string) => {
    // #646 cure: filter watcher-change-events by filename before bumping snapshot version.
    // Without this, agent self-edits to MEMORY.md / TOOLS.md / daily-files trigger
    // skill-snapshot cache invalidation, which feeds producer-2 (formatSkillsForPrompt)
    // re-allocation. Perverse feedback loop: agent banking-discipline feeds the leak
    // that pressures compaction.
    //
    // shouldIgnoreSkillsWatchPath already filters in chokidar's ignored callback, but only
    // for paths with stat-info attached (see line 91-95). Event handlers receive the path
    // string without stats, so the filter must be re-applied here for correctness.
    if (changedPath !== undefined && !isSkillFile(changedPath)) {
      return;
    }
    schedule(changedPath);
  };

  watcher.on("add", (p) => scheduleIfSkill(p));
  watcher.on("change", (p) => scheduleIfSkill(p));
  watcher.on("unlink", (p) => scheduleIfSkill(p));
  // Directory unlinks always bump (SKILL.md cannot survive its parent directory removal).
  watcher.on("unlinkDir", (p) => schedule(p));
  watcher.on("error", (err) => {
    log.warn(`skills watcher error (${workspaceDir}): ${String(err)}`);
  });

  watchers.set(workspaceDir, state);
}

export async function resetSkillsRefreshForTest(): Promise<void> {
  resetSkillsRefreshStateForTest();

  const active = Array.from(watchers.values());
  watchers.clear();
  await Promise.all(
    active.map(async (state) => {
      if (state.timer) {
        clearTimeout(state.timer);
      }
      try {
        await state.watcher.close();
      } catch {
        // Best-effort test cleanup.
      }
    }),
  );
}
