// Covers dangerous config flag detection and reporting.
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { collectEnabledInsecureOrDangerousFlagsFromContracts } from "./dangerous-config-flags-core.js";

function asConfig(value: unknown): OpenClawConfig {
  return value as OpenClawConfig;
}

describe("collectEnabledInsecureOrDangerousFlags", () => {
  it("collects manifest-declared dangerous plugin config values", () => {
    expect(
      collectEnabledInsecureOrDangerousFlagsFromContracts(
        asConfig({
          plugins: {
            entries: {
              acpx: {
                config: {
                  permissionMode: "approve-all",
                },
              },
            },
          },
        }),
        {
          configContractsById: new Map([
            [
              "acpx",
              {
                configContracts: {
                  dangerousFlags: [{ path: "permissionMode", equals: "approve-all" }],
                },
              },
            ],
          ]),
        },
      ),
    ).toContain("plugins.entries.acpx.config.permissionMode=approve-all");
  });

  it("ignores plugin config values that are not declared as dangerous", () => {
    expect(
      collectEnabledInsecureOrDangerousFlagsFromContracts(
        asConfig({
          plugins: {
            entries: {
              other: {
                config: {
                  mode: "safe",
                },
              },
            },
          },
        }),
        {
          configContractsById: new Map([
            [
              "other",
              {
                configContracts: {
                  dangerousFlags: [{ path: "mode", equals: "danger" }],
                },
              },
            ],
          ]),
        },
      ),
    ).toStrictEqual([]);
  });

  it("collects dangerous sandbox, hook, browser, and fs flags", () => {
    const flags = collectEnabledInsecureOrDangerousFlagsFromContracts(
      asConfig({
        agents: {
          defaults: {
            sandbox: {
              docker: {
                dangerouslyAllowReservedContainerTargets: true,
                dangerouslyAllowContainerNamespaceJoin: true,
              },
            },
          },
          list: [
            {
              id: "worker",
              sandbox: {
                docker: {
                  dangerouslyAllowExternalBindSources: true,
                },
              },
            },
          ],
        },
        hooks: {
          allowRequestSessionKey: true,
        },
        browser: {
          ssrfPolicy: {
            dangerouslyAllowPrivateNetwork: true,
          },
        },
        tools: {
          fs: {
            workspaceOnly: false,
          },
        },
      }),
    );

    expect(flags).toStrictEqual([
      "hooks.allowRequestSessionKey=true",
      "browser.ssrfPolicy.dangerouslyAllowPrivateNetwork=true",
      "tools.fs.workspaceOnly=false",
      "agents.defaults.sandbox.docker.dangerouslyAllowReservedContainerTargets=true",
      "agents.defaults.sandbox.docker.dangerouslyAllowContainerNamespaceJoin=true",
      'agents.list[id="worker"].sandbox.docker.dangerouslyAllowExternalBindSources=true',
    ]);
  });

  it("collects configured security audit suppressions as a dangerous flag", () => {
    expect(
      collectEnabledInsecureOrDangerousFlagsFromContracts(
        asConfig({
          security: {
            audit: {
              suppressions: [{ checkId: "plugins.code_safety" }],
            },
          },
        }),
      ),
    ).toContain("security.audit.suppressions configured (1)");
  });

  it("collects apply_patch allowed roots as a dangerous boundary expansion", () => {
    expect(
      collectEnabledInsecureOrDangerousFlagsFromContracts(
        asConfig({
          tools: {
            exec: {
              applyPatch: {
                workspaceOnly: true,
                allowedRoots: ["/tmp/oc-one", "/tmp/oc-two"],
              },
            },
          },
        }),
      ),
    ).toContain("tools.exec.applyPatch.allowedRoots configured (2)");
  });

  it("does not report empty or inactive apply_patch allowed roots", () => {
    const hasAllowedRootsFlag = (config: OpenClawConfig) =>
      collectEnabledInsecureOrDangerousFlagsFromContracts(config).some((flag) =>
        flag.includes("tools.exec.applyPatch.allowedRoots"),
      );

    expect(
      hasAllowedRootsFlag(asConfig({ tools: { exec: { applyPatch: { allowedRoots: [] } } } })),
    ).toBe(false);
    expect(
      hasAllowedRootsFlag(
        asConfig({
          tools: {
            exec: {
              applyPatch: { workspaceOnly: false, allowedRoots: ["/tmp/oc-worktree"] },
            },
          },
        }),
      ),
    ).toBe(false);
  });

  it("uses stable agent ids for per-agent dangerous sandbox flags", () => {
    expect(
      collectEnabledInsecureOrDangerousFlagsFromContracts(
        asConfig({
          agents: {
            list: [
              {
                id: "worker",
                sandbox: {
                  docker: {
                    dangerouslyAllowContainerNamespaceJoin: true,
                  },
                },
              },
              {
                id: "helper",
              },
            ],
          },
        }),
      ),
    ).toContain(
      'agents.list[id="worker"].sandbox.docker.dangerouslyAllowContainerNamespaceJoin=true',
    );

    expect(
      collectEnabledInsecureOrDangerousFlagsFromContracts(
        asConfig({
          agents: {
            list: [
              {
                id: "helper",
              },
              {
                id: "worker",
                sandbox: {
                  docker: {
                    dangerouslyAllowContainerNamespaceJoin: true,
                  },
                },
              },
            ],
          },
        }),
      ),
    ).toContain(
      'agents.list[id="worker"].sandbox.docker.dangerouslyAllowContainerNamespaceJoin=true',
    );
  });
});
