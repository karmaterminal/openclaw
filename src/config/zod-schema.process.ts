import { z } from "zod";
import { projectConfigFieldMetadata } from "./schema.field-metadata.js";
import { configUiMetadata } from "./zod-schema.sensitive.js";

// systemd size syntax: bytes with an optional uppercase base-1024 suffix, or "infinity".
const SYSTEMD_SIZE = /^(?:infinity|(\d+(?:\.\d+)?)([KMGTPE]?))$/;
const SYSTEMD_SIZE_UNITS = ["", "K", "M", "G", "T", "P", "E"];
// The scope's first process is systemd-run itself; tinier caps OOM-kill it before the command.
const MIN_MEMORY_MAX_BYTES = 64 * 1024 ** 2;

function systemdSizeBytes(value: string): number | undefined {
  const match = SYSTEMD_SIZE.exec(value);
  if (!match) {
    return undefined;
  }
  return match[1] === undefined
    ? Number.POSITIVE_INFINITY
    : Number(match[1]) * 1024 ** SYSTEMD_SIZE_UNITS.indexOf(match[2] ?? "");
}

const SystemdSizeSchema = z.string().refine((value) => systemdSizeBytes(value) !== undefined, {
  message: 'Use a systemd size such as "5G", "512M" or "infinity" (uppercase K/M/G/T suffix).',
});

export const ProcessConfigSchema = z
  .strictObject({
    childScope: z
      .strictObject({
        enabled: z.boolean().optional().register(configUiMetadata, {
          label: "Child Memory Scope Enabled",
          help: "Runs heavy Gateway children (host exec commands, code-agent CLIs, Codex app-server) in their own memory-capped systemd user scope, so systemd-oomd or the kernel OOM killer takes the child instead of the whole Gateway unit (default: false). Linux with a user systemd manager only; elsewhere children spawn as before and the Gateway logs one warning. Restart the Gateway to apply.",
        }),
        memoryMax: SystemdSizeSchema.refine(
          (value) => (systemdSizeBytes(value) ?? 0) >= MIN_MEMORY_MAX_BYTES,
          { message: 'memoryMax must be at least "64M".' },
        )
          .optional()
          .register(configUiMetadata, {
            label: "Child Scope Memory Limit",
            help: 'MemoryMax for each heavy child scope, as a systemd size (default: "5G", minimum "64M"). The kernel OOM-kills the child when its scope exceeds this.',
          }),
        memorySwapMax: SystemdSizeSchema.optional().register(configUiMetadata, {
          label: "Child Scope Swap Limit",
          help: 'MemorySwapMax for each heavy child scope, as a systemd size (default: "2G"; "0" disables swap for children).',
        }),
      })
      .optional()
      .register(configUiMetadata, {
        label: "Child Memory Scope",
        help: "Opt-in memory isolation for heavy Gateway children through systemd-run --user --scope. Host-level; there is no per-agent override.",
      }),
  })
  .optional();

export const { labels: PROCESS_FIELD_LABELS, help: PROCESS_FIELD_HELP } =
  projectConfigFieldMetadata(ProcessConfigSchema, "process");
