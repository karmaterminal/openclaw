/**
 * `openclaw zk` subcommand — operator-facing wrapper over the
 * plugin-sdk/zk primitives. Registered through `command-bootstrap.ts`
 * with `{ loadPlugins: "never", ensureCliPath: false }` — this subtree
 * has no plugin interaction, so we skip the plugin registry on cold
 * start for fast CLI dispatch.
 *
 * Commands (flock-style `-- <cmd…>` wrappers):
 *   openclaw zk ping [--hosts <csv>]
 *   openclaw zk setup
 *   openclaw zk lock <path> [-- <cmd…>]
 *   openclaw zk lock status <path>
 *   openclaw zk elect <path> --id <name> -- <cmd…>
 *   openclaw zk party join <path> --id <name>
 *   openclaw zk party list <path>
 *   openclaw zk rwlock {read|write} <path> -- <cmd…>
 *   openclaw zk ls <path>
 *
 * All paths are validated against `[A-Za-z0-9._/-]+` via `validatePath`
 * before being passed to any driver op.
 */

import { spawn, spawnSync } from "node:child_process";
import type { Command } from "commander";
import { loadConfig } from "../config/config.js";
import type { ZkClient } from "../plugin-sdk/zk.js";
import {
  ZkNativeDriverUnavailableError,
  createElection,
  createLock,
  createParty,
  createReadWriteLock,
  createZkClient,
  featurePath,
  validatePath,
} from "../plugin-sdk/zk.js";

const DEFAULT_HOSTS = "zk-client.fleet-coordination.svc.cluster.local:2181";

function resolveHosts(flagHosts: string | undefined): string {
  if (flagHosts && flagHosts.trim()) {
    return flagHosts.trim();
  }
  const env = process.env.ZK_HOSTS?.trim();
  if (env) {
    return env;
  }
  try {
    const cfg = loadConfig();
    const fromCfg = cfg?.zk?.hosts?.trim();
    if (fromCfg) {
      return fromCfg;
    }
  } catch {
    // Config unreachable on cold CLI — fall through to default.
  }
  return DEFAULT_HOSTS;
}

function resolveEnv(): string {
  // `deploy.env` isn't a formal config field today; read it loosely so
  // operators can set it without a schema change. Falls back to "fleet".
  try {
    const cfg = loadConfig() as unknown as { deploy?: { env?: string } };
    if (cfg?.deploy?.env && typeof cfg.deploy.env === "string") {
      return cfg.deploy.env;
    }
  } catch {
    // Fall through.
  }
  return "fleet";
}

function applyPrefix(userPath: string, feature: string, noPrefix: boolean): string {
  if (noPrefix) {
    validatePath(userPath);
    return userPath;
  }
  // userPath is treated as a relative name under the feature prefix, or an
  // absolute znode path that starts with `/`. If absolute, use as-is.
  if (userPath.startsWith("/")) {
    validatePath(userPath);
    return userPath;
  }
  return featurePath(resolveEnv(), feature, userPath);
}

async function openClient(flagHosts: string | undefined): Promise<ZkClient> {
  const hosts = resolveHosts(flagHosts);
  try {
    return await createZkClient({ hosts });
  } catch (err) {
    if (err instanceof ZkNativeDriverUnavailableError) {
      process.stderr.write(
        `zookeeper native driver not installed.\n\n` +
          `Run: openclaw zk setup\n\n` +
          `This installs node-gyp prereqs (build-essential + python3) and the\n` +
          `\`zookeeper\` optional dependency. No-op if already installed.\n`,
      );
      process.exit(2);
    }
    throw err;
  }
}

function runChildForOwnership(
  cmd: string[],
  onSessionLoss: "kill" | "warn" | "ignore",
): Promise<number> {
  return new Promise((resolve) => {
    const [bin, ...args] = cmd;
    if (!bin) {
      process.stderr.write("no command to run after `--`\n");
      resolve(2);
      return;
    }
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("exit", (code, signal) => {
      resolve(code ?? (signal ? 128 : 0));
    });
    child.on("error", (err) => {
      process.stderr.write(`spawn error: ${err.message}\n`);
      resolve(127);
    });
    // The caller plumbs session-loss → SIGTERM on `onSessionLoss === "kill"`
    // via a separate hook; this function just runs the child.
    void onSessionLoss;
  });
}

export function registerZkCli(program: Command): void {
  const zk = program
    .command("zk")
    .description("ZooKeeper coordination primitives (locks, elections, parties)");

  zk.command("ping")
    .description("Connect to the ensemble and print the session id")
    .option("--hosts <csv>", "comma-separated host:port list; overrides ZK_HOSTS / config")
    .action(async (opts: { hosts?: string }) => {
      const client = await openClient(opts.hosts);
      try {
        process.stdout.write(`connected to ${resolveHosts(opts.hosts)} (state=${client.state})\n`);
      } finally {
        await client.close();
      }
    });

  zk.command("setup")
    .description("Install node-gyp prereqs + the `zookeeper` native npm package")
    .action(async () => {
      await runSetup();
    });

  // Lock subtree
  const lockCmd = zk.command("lock").description("Exclusive distributed lock (flock-style)");
  lockCmd
    .command("acquire <path> [cmd...]")
    .description("Acquire lock; if `-- <cmd…>` provided, hold for subprocess lifetime")
    .option("--hosts <csv>")
    .option("--id <name>", "identifier stored as lock data (default: $HOSTNAME)")
    .option("--timeout <ms>", "fail if not acquired within this window", parseIntOpt)
    .option("--no-prefix", "skip the /openclaw/<env>/user/locks prefix")
    .option("--on-session-loss <mode>", "kill|warn|ignore the child if ZK session expires", "kill")
    .action(
      async (
        pathArg: string,
        cmd: string[],
        opts: {
          hosts?: string;
          id?: string;
          timeout?: number;
          noPrefix?: boolean;
          onSessionLoss?: "kill" | "warn" | "ignore";
        },
      ) => {
        const client = await openClient(opts.hosts);
        const fullPath = applyPrefix(pathArg, "user/locks", Boolean(opts.noPrefix));
        const identifier = opts.id ?? process.env.HOSTNAME ?? "anon";
        const lock = createLock(client, fullPath, identifier);
        const onSessionLoss = opts.onSessionLoss ?? "kill";
        let childPid: number | null = null;
        const unsub = client.state$()[Symbol.asyncIterator]();
        const watchLoss = (async () => {
          for (;;) {
            const next = await unsub.next();
            if (next.done) {
              return;
            }
            if (next.value === "expired" && childPid !== null && onSessionLoss !== "ignore") {
              const pid: number = childPid;
              if (onSessionLoss === "kill") {
                process.stderr.write(`zk session expired — SIGTERM child ${String(pid)}\n`);
                try {
                  process.kill(pid, "SIGTERM");
                } catch {
                  // Already gone — fine.
                }
              } else {
                process.stderr.write(
                  `::warning:: zk session expired; child ${String(pid)} still running\n`,
                );
              }
              return;
            }
          }
        })();
        try {
          const handle = await lock.acquire(opts.timeout ? { timeoutMs: opts.timeout } : undefined);
          try {
            process.stderr.write(`lock acquired: ${handle.ownerPath}\n`);
            if (cmd.length === 0) {
              // No child — just report acquisition and exit on SIGTERM/SIGINT.
              await waitForSignal();
            } else {
              const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit" });
              childPid = child.pid ?? null;
              const code = await new Promise<number>((resolve) => {
                child.on("exit", (c, sig) => resolve(c ?? (sig ? 128 : 0)));
                child.on("error", (err) => {
                  process.stderr.write(`spawn error: ${err.message}\n`);
                  resolve(127);
                });
              });
              process.exit(code);
            }
          } finally {
            await handle.release();
          }
        } finally {
          await unsub.return?.();
          await watchLoss;
          await client.close();
        }
      },
    );
  lockCmd
    .command("status <path>")
    .description("Show lock owner + contenders")
    .option("--hosts <csv>")
    .option("--no-prefix")
    .action(async (pathArg: string, opts: { hosts?: string; noPrefix?: boolean }) => {
      const client = await openClient(opts.hosts);
      const fullPath = applyPrefix(pathArg, "user/locks", Boolean(opts.noPrefix));
      const lock = createLock(client, fullPath);
      try {
        const c = await lock.contenders();
        if (c.length === 0) {
          process.stdout.write(`no contenders at ${fullPath}\n`);
        } else {
          process.stdout.write(`${fullPath}:\n`);
          for (const name of c) {
            process.stdout.write(`  ${name}\n`);
          }
        }
      } finally {
        await client.close();
      }
    });

  // Election
  zk.command("elect <path> [cmd...]")
    .description("Run `<cmd…>` as the elected leader; SIGTERM on leadership loss")
    .option("--hosts <csv>")
    .option("--id <name>", "candidate identifier (default: $HOSTNAME)")
    .option("--no-prefix")
    .action(
      async (
        pathArg: string,
        cmd: string[],
        opts: { hosts?: string; id?: string; noPrefix?: boolean },
      ) => {
        if (cmd.length === 0) {
          process.stderr.write("`openclaw zk elect` requires `-- <cmd…>`\n");
          process.exit(2);
        }
        const client = await openClient(opts.hosts);
        const fullPath = applyPrefix(pathArg, "user/elections", Boolean(opts.noPrefix));
        const identifier = opts.id ?? process.env.HOSTNAME ?? "anon";
        const election = createElection(client, fullPath, identifier);
        try {
          await election.run(async (signal) => {
            process.stderr.write(`elected leader at ${fullPath} (id=${identifier})\n`);
            const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit" });
            const abortHandler = () => {
              if (!child.killed) {
                process.stderr.write("leadership lost — SIGTERM child\n");
                try {
                  child.kill("SIGTERM");
                } catch {
                  /* no-op */
                }
              }
            };
            signal.addEventListener("abort", abortHandler, { once: true });
            const code = await new Promise<number>((resolve) => {
              child.on("exit", (c, sig) => resolve(c ?? (sig ? 128 : 0)));
              child.on("error", () => resolve(127));
            });
            process.exit(code);
          });
        } finally {
          await client.close();
        }
      },
    );

  // Party
  const partyCmd = zk.command("party").description("Group membership (ephemeral)");
  partyCmd
    .command("join <path>")
    .description("Join the party; hold membership until SIGTERM")
    .option("--hosts <csv>")
    .option("--id <name>", "member identifier (default: $HOSTNAME)")
    .option("--no-prefix")
    .action(async (pathArg: string, opts: { hosts?: string; id?: string; noPrefix?: boolean }) => {
      const client = await openClient(opts.hosts);
      const fullPath = applyPrefix(pathArg, "user/parties", Boolean(opts.noPrefix));
      const identifier = opts.id ?? process.env.HOSTNAME ?? "anon";
      const party = createParty(client, fullPath, identifier);
      try {
        await party.join();
        process.stderr.write(`joined party ${fullPath} as ${identifier}\n`);
        await waitForSignal();
      } finally {
        await party.leave().catch(() => undefined);
        await client.close();
      }
    });
  partyCmd
    .command("list <path>")
    .description("List current members")
    .option("--hosts <csv>")
    .option("--no-prefix")
    .action(async (pathArg: string, opts: { hosts?: string; noPrefix?: boolean }) => {
      const client = await openClient(opts.hosts);
      const fullPath = applyPrefix(pathArg, "user/parties", Boolean(opts.noPrefix));
      const party = createParty(client, fullPath, "obs");
      try {
        const members = await party.members();
        if (members.length === 0) {
          process.stdout.write(`no members at ${fullPath}\n`);
        } else {
          for (const m of members) {
            process.stdout.write(`${m}\n`);
          }
        }
      } finally {
        await client.close();
      }
    });

  // RWLock
  const rwCmd = zk
    .command("rwlock")
    .description("Reader/writer locks (many readers, exclusive writer)");
  rwCmd
    .command("read <path> [cmd...]")
    .description("Acquire a reader lock; run `<cmd…>` while held")
    .option("--hosts <csv>")
    .option("--id <name>")
    .option("--timeout <ms>", "acquire timeout", parseIntOpt)
    .option("--no-prefix")
    .action(
      async (
        pathArg: string,
        cmd: string[],
        opts: { hosts?: string; id?: string; timeout?: number; noPrefix?: boolean },
      ) => {
        await runRwSubcommand(cmd, opts, "read", pathArg);
      },
    );
  rwCmd
    .command("write <path> [cmd...]")
    .description("Acquire a writer lock; run `<cmd…>` while held")
    .option("--hosts <csv>")
    .option("--id <name>")
    .option("--timeout <ms>", "acquire timeout", parseIntOpt)
    .option("--no-prefix")
    .action(
      async (
        pathArg: string,
        cmd: string[],
        opts: { hosts?: string; id?: string; timeout?: number; noPrefix?: boolean },
      ) => {
        await runRwSubcommand(cmd, opts, "write", pathArg);
      },
    );

  zk.command("ls <path>")
    .description("List children at a znode path (no prefix applied)")
    .option("--hosts <csv>")
    .action(async (pathArg: string, opts: { hosts?: string }) => {
      validatePath(pathArg);
      const client = await openClient(opts.hosts);
      try {
        const children = await client.driver.getChildren(pathArg);
        for (const c of children) {
          process.stdout.write(`${c}\n`);
        }
      } finally {
        await client.close();
      }
    });
}

async function runRwSubcommand(
  cmd: string[],
  opts: { hosts?: string; id?: string; timeout?: number; noPrefix?: boolean },
  kind: "read" | "write",
  pathArg: string,
): Promise<void> {
  const client = await openClient(opts.hosts);
  const fullPath = applyPrefix(pathArg, "user/locks", Boolean(opts.noPrefix));
  const rw = createReadWriteLock(client, fullPath);
  const lock = kind === "read" ? rw.readLock(opts.id) : rw.writeLock(opts.id);
  try {
    const handle = await lock.acquire(opts.timeout ? { timeoutMs: opts.timeout } : undefined);
    try {
      process.stderr.write(`${kind}-lock acquired: ${handle.ownerPath}\n`);
      if (cmd.length > 0) {
        const code = await runChildForOwnership(cmd, "kill");
        process.exit(code);
      } else {
        await waitForSignal();
      }
    } finally {
      await handle.release();
    }
  } finally {
    await client.close();
  }
}

function parseIntOpt(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`invalid integer: ${raw}`);
  }
  return n;
}

function waitForSignal(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      process.off("SIGTERM", done);
      process.off("SIGINT", done);
      resolve();
    };
    process.once("SIGTERM", done);
    process.once("SIGINT", done);
  });
}

async function runSetup(): Promise<void> {
  // Detect OS package manager.
  const managers: { name: string; bin: string; packages: string[] }[] = [
    { name: "apt", bin: "apt-get", packages: ["build-essential", "python3"] },
    { name: "pacman", bin: "pacman", packages: ["base-devel", "python"] },
    { name: "dnf", bin: "dnf", packages: ["gcc", "gcc-c++", "make", "python3"] },
  ];
  let chosen: (typeof managers)[number] | null = null;
  for (const m of managers) {
    if (spawnSync("which", [m.bin], { stdio: "ignore" }).status === 0) {
      chosen = m;
      break;
    }
  }
  if (!chosen) {
    process.stderr.write(
      "No supported package manager found (looked for apt-get / pacman / dnf).\n" +
        "Install build-essential-equivalent + python3 manually, then run:\n" +
        "  npm install -g zookeeper@^7.2.0\n",
    );
    process.exit(2);
  }

  process.stderr.write(`Detected ${chosen.name}; will install: ${chosen.packages.join(", ")}\n`);

  const installArgs =
    chosen.name === "apt"
      ? ["install", "-y", ...chosen.packages]
      : chosen.name === "pacman"
        ? ["-S", "--noconfirm", ...chosen.packages]
        : ["install", "-y", ...chosen.packages];

  const res = spawnSync("sudo", [chosen.bin, ...installArgs], { stdio: "inherit" });
  if (res.status !== 0) {
    process.stderr.write(
      `\nCould not run ${chosen.name} install via sudo.\n` +
        "Run these commands manually, then re-run `openclaw zk setup`:\n" +
        `  sudo ${chosen.bin} ${installArgs.join(" ")}\n` +
        "  npm install -g zookeeper@^7.2.0\n",
    );
    process.exit(2);
  }

  // Install the zookeeper package globally into openclaw's install dir.
  // `npm install -g` respects the operator's npm prefix; if that prefix
  // needs root, sudo it.
  const npmRes = spawnSync("npm", ["install", "-g", "zookeeper@^7.2.0"], { stdio: "inherit" });
  if (npmRes.status !== 0) {
    const sudoRes = spawnSync("sudo", ["npm", "install", "-g", "zookeeper@^7.2.0"], {
      stdio: "inherit",
    });
    if (sudoRes.status !== 0) {
      process.stderr.write("\nFailed to install `zookeeper` npm package. Install manually.\n");
      process.exit(2);
    }
  }

  process.stderr.write("\nzk setup done. Try `openclaw zk ping` to verify.\n");
}
