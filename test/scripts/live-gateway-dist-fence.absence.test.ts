import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLiveManagedGatewayDistFence } from "../../scripts/lib/live-gateway-dist-fence.mts";
import * as inventory from "../../src/daemon/inspect.js";
import * as launchdExec from "../../src/daemon/launchd-exec.js";
import { ServiceInspectionError } from "../../src/daemon/service-inspection-error.js";
import type { GatewayServiceState } from "../../src/daemon/service-types.ts";
import * as gatewayService from "../../src/daemon/service.js";
import * as systemdFiles from "../../src/daemon/systemd-service-files.js";
import { withMockedPlatform } from "../../src/test-utils/vitest-spies.js";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);
afterEach(() => vi.restoreAllMocks());

it.each([
  { defaultState: "absent", overlap: false, refuse: false },
  { defaultState: "unreadable", overlap: false, refuse: true },
  { defaultState: "absent", overlap: true, refuse: true },
])(
  "checks native absence before building: default=$defaultState siblingOverlap=$overlap",
  async ({ defaultState, overlap, refuse }) => {
    const directory = tempDirs.make("openclaw-fence-native-absence-");
    const checkout = path.join(directory, "checkout");
    const other = path.join(directory, "other");
    const home = path.join(directory, "home");
    for (const root of [checkout, other]) {
      await fs.mkdir(path.join(root, "dist"), { recursive: true });
      await fs.writeFile(path.join(root, "package.json"), '{"name":"openclaw"}\n');
      await fs.writeFile(path.join(root, "dist", "index.js"), "// synthetic Gateway\n");
    }
    const label = "org.example.fence-sibling";
    const plist = path.join(home, "Library", "LaunchAgents", `${label}.plist`);
    vi.spyOn(inventory, "listManagedOpenClawGatewayServices").mockResolvedValue({
      services: [{ platform: "darwin", scope: "user", label, detail: `plist: ${plist}` }],
      errors: [],
    });
    const native = vi.spyOn(launchdExec, "execLaunchctl").mockImplementation(async (args) => {
      const target = args[1] ?? "";
      if (!target.endsWith(`/${label}`)) {
        return {
          code: 113,
          termination: "exit",
          stdout: "",
          stderr: defaultState === "absent" ? "Could not find service" : "Operation not permitted",
        };
      }
      return {
        code: 0,
        termination: "exit",
        stderr: "",
        stdout: [
          `${target} = {`,
          `\tpath = ${plist}`,
          `\tprogram = ${process.execPath}`,
          "\targuments = {",
          `\t\t${process.execPath}`,
          `\t\t${path.join(overlap ? checkout : other, "dist", "index.js")}`,
          "\t\tgateway",
          "\t}",
          "\tstate = running",
          `\tpid = ${process.pid}`,
          "}",
        ].join("\n"),
      };
    });
    const result = await withMockedPlatform("darwin", () =>
      resolveLiveManagedGatewayDistFence(checkout, { env: { HOME: home }, requireVerified: true }),
    );
    expect(result.refuse).toBe(refuse);
    if (result.refuse) {
      expect(result.message).toContain(overlap ? label : "Cannot verify");
    }
    expect(native.mock.calls.every(([args]) => args[0] === "print")).toBe(true);
  },
);

describe("service manager proven absent (Linux containers and CI pods without systemd)", () => {
  function simulateNoServiceManager(params: {
    services?: Awaited<ReturnType<typeof inventory.listManagedOpenClawGatewayServices>>["services"];
    errors?: Awaited<ReturnType<typeof inventory.listManagedOpenClawGatewayServices>>["errors"];
    failure?: () => unknown;
    state?: GatewayServiceState;
  }) {
    vi.spyOn(inventory, "listManagedOpenClawGatewayServices").mockResolvedValue({
      services: params.services ?? [],
      errors: params.errors ?? [],
    });
    const failure =
      params.failure ?? (() => new ServiceInspectionError("service-manager-unavailable"));
    vi.spyOn(systemdFiles, "readSystemdServiceCommandLocation").mockImplementation(async () => {
      throw failure();
    });
    return vi.spyOn(gatewayService, "readGatewayServiceState").mockImplementation(async () => {
      if (params.state) {
        return params.state;
      }
      throw failure();
    });
  }

  async function runFence() {
    const checkout = tempDirs.make("openclaw-fence-no-manager-");
    await fs.mkdir(path.join(checkout, "dist"), { recursive: true });
    return withMockedPlatform("linux", () =>
      resolveLiveManagedGatewayDistFence(checkout, { env: {}, requireVerified: true }),
    );
  }

  it("allows preparation when the invoking binding proves no service manager exists", async () => {
    const read = simulateNoServiceManager({});
    expect(await runFence()).toEqual({ refuse: false });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("allows preparation when the state reader reports the manager-absent state", async () => {
    simulateNoServiceManager({
      state: {
        inspectionReason: "service-manager-unavailable",
        installed: false,
        loadState: { status: "not-loaded" },
        running: false,
        env: {},
        command: null,
        runtime: {
          status: "stopped",
          missingUnit: true,
          inspectionReason: "service-manager-unavailable",
        },
      },
    });
    expect(await runFence()).toEqual({ refuse: false });
  });

  it("still refuses when discovery is incomplete on a host with no service manager", async () => {
    simulateNoServiceManager({
      errors: [{ source: "/etc/systemd/system", message: "Unit directory could not be read." }],
    });
    const result = await runFence();
    expect(result.refuse).toBe(true);
    if (result.refuse) {
      expect(result.message).toContain("Cannot verify");
    }
  });

  it("still refuses when a discovered service cannot be inspected without a service manager", async () => {
    simulateNoServiceManager({
      services: [
        {
          platform: "linux",
          scope: "user",
          label: "openclaw-gateway.service",
          detail: "unit: /home/test/.config/systemd/user/openclaw-gateway.service",
        },
      ],
    });
    expect((await runFence()).refuse).toBe(true);
  });

  it.each([
    "systemd-inspection-deadline-exceeded",
    "systemd-user-bus-unavailable",
    "systemd-busctl-unavailable",
    "service-manager-access-denied",
  ] as const)("still refuses an unproven manager (%s)", async (reason) => {
    simulateNoServiceManager({ failure: () => new ServiceInspectionError(reason) });
    expect((await runFence()).refuse).toBe(true);
  });

  it("still refuses an untyped failure that only mentions the manager", async () => {
    simulateNoServiceManager({
      failure: () => new Error("No supported service manager detected."),
    });
    expect((await runFence()).refuse).toBe(true);
  });
});
