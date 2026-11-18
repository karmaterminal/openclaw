---
summary: "CLI reference for `openclaw sovereign` (locate and check an agent's sovereign prompt files without printing them)"
read_when:
  - Placing or deploying an agent's sovereign prompt files
  - Checking a sovereign prompt generation before publishing it
  - Reading a sovereign prompt refusal code
title: "Sovereign prompts CLI"
---

# `openclaw sovereign`

Locate and check an agent's sovereign prompt files: the agent's own prompt text,
kept as files OpenClaw loads at start instead of built-in prompt text. The
commands read only mechanics (bytes, structure, filesystem metadata, digests) and
print codes, names, sizes, digests and paths. They never print file content.

The switch is `agents.entries.<agentId>.sovereignPrompts.mode`: `"off"` (the
default) or `"enforce"`. See [What `enforce` does](#what-enforce-does).

| Command | Role                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------- |
| `paths` | Resolves the agent's sovereign root and switch from config; reads no file                             |
| `check` | Loads a generation (the one `CURRENT` names, or `--generation <dir>`) and runs every mechanical check |
| `slots` | Lists the slots, file names and reserved tokens this build declares and which it renders; no file     |

`paths` and `check` take `--agent <id>` (required); every command takes `--json`.
They run read-only beside a live Gateway, so a deploy can call them before its
restart, and `slots --json` lets a deploy validate a tree against the exact build
it deploys.

```bash
openclaw sovereign paths --agent main --json
openclaw sovereign check --agent main --json
openclaw sovereign check --agent main --generation ~/.openclaw/agents/main/agent/sovereign/systemprompts/generations/.staging-1 --json
openclaw sovereign slots --json
```

Exit codes: `0` when the agent resolves (`paths`), the generation loads (`check`)
or the registry prints (`slots`); `1` on any refusal, with the refusal code in the
output. An invalid config exits `1` with the config error before a command runs.

## Layout

The root is `<agentDir>/sovereign/systemprompts`, where `agentDir` is the agent's
configured `agentDir` or `<state-dir>/agents/<agentId>/agent`. There are no search
paths and no environment override.

```text
<root>/                          directory 0700 (or 0500), owned by the Gateway user
  CURRENT                        file 0600: one line, the generation id
  generations/
    <generation-id>/             directory 0500 once written
      MANIFEST.json              0400, written last
      identity-section.md        required, non-empty
      safety-section.md          required, non-empty
      tool-section.md            required, non-empty
      execution-section.md       optional
      tool-section.d/<name>.md   optional fragments
```

A generation id is `<UTC yyyymmddThhmmssZ>-<first 12 hex of the source commit>`.
`CURRENT` is a regular file replaced by rename, never a symlink.

`MANIFEST.json` holds no content:

```json
{
  "schema": "openclaw.sovereign-prompts/1",
  "agentId": "main",
  "generation": "20261107T120000Z-0123456789ab",
  "source": {
    "repo": "example/sovereign",
    "commit": "0123456789abcccccccccccccccccccccccccccc",
    "path": "sovereign/systemprompts"
  },
  "files": [{ "path": "identity-section.md", "bytes": 1024, "sha256": "<64 hex>" }],
  "setDigest": "<64 hex>"
}
```

`setDigest` is the sha256 of the RFC 8785 (JCS) JSON of the `files` array, sorted
by `path`: each entry as `{"bytes":…,"path":"…","sha256":"…"}` with no
whitespace.

File names come from a code-owned slot registry that declares the whole
main-assembly namespace, so files can be placed before the code renders them. A
name outside the registry is refused.

## Checks and codes

Every check is mechanical; nothing reads or judges the text.

| Code                                               | Refused when                                                                                                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root_missing`                                     | The root does not exist                                                                                                                                                                                                            |
| `root_unsafe`                                      | A path component is a symlink or not a directory, the path is not canonical, an ancestor is not owned by root or the Gateway user, or a directory is group- or other-writable (a sticky shared ancestor such as `/tmp` is allowed) |
| `pointer_missing`, `pointer_invalid`               | `CURRENT` is absent, or is not a regular single-link file of at most 128 bytes holding a valid generation id                                                                                                                       |
| `generation_missing`                               | The generation directory (or `generations/`) does not exist                                                                                                                                                                        |
| `manifest_invalid`, `manifest_digest_mismatch`     | The manifest is absent, unbounded or malformed, names another agent or generation, or its `setDigest` does not recompute                                                                                                           |
| `unknown_slot`                                     | The manifest lists a name outside the registry                                                                                                                                                                                     |
| `unexpected_file`                                  | The directory holds an entry the manifest does not list                                                                                                                                                                            |
| `required_missing`, `required_empty`               | A required file is not listed, has zero bytes, or is empty after line-ending and whitespace normalization                                                                                                                          |
| `symlink`, `not_regular`, `hardlink`               | A file or fragment directory is a symlink, a file is not a regular file, or a file has more than one link                                                                                                                          |
| `owner_mismatch`, `mode_unsafe`                    | A file or directory at or below the root is not owned by the Gateway user, or has group or other permissions (files `0400`/`0600`, directories `0500`/`0700`)                                                                      |
| `size_exceeded`                                    | A file exceeds 64 KiB or the set exceeds 256 KiB; never truncated                                                                                                                                                                  |
| `partial_read`, `digest_mismatch`                  | The bytes read differ from the manifest's count, the file changed during the read, or the sha256 differs                                                                                                                           |
| `encoding_invalid`, `encoding_bom`, `control_char` | A body is not strict UTF-8, starts with a BOM, or holds a C0 control other than tab, line feed or carriage return                                                                                                                  |
| `reserved_token`                                   | A body holds an OpenClaw prompt marker, or a line equal to a heading OpenClaw matches                                                                                                                                              |
| `placeholder_invalid`, `placeholder_unknown`       | A `{{oc:…}}` token is malformed or names a fact its slot does not provide                                                                                                                                                          |
| `generation_changed`                               | `CURRENT` changed during the load twice in a row                                                                                                                                                                                   |
| `io_error`                                         | Any other read failure, or an unexpected error while loading; the output carries the errno name only                                                                                                                               |
| `agent_unknown`                                    | `--agent` names no configured agent                                                                                                                                                                                                |

An empty optional file counts as absent. Refusal output names the code and, where
known, the slot, the registry file name, the generation id, byte counts and
limits, the uid, the octal mode or the errno name. It never includes content,
native error text, or names outside the registry.

## What `enforce` does

- **Load once.** The Gateway loads each `enforce` agent's current generation when
  it starts, before agent work is admitted; any other process that renders
  prompts loads at its first render. Files are never reread: a new generation
  takes effect at the next start, and changing `sovereignPrompts` plans a Gateway
  restart. An agent added as `enforce` by hot reload fails `not_loaded` until then.
- **Fail closed, per agent.** A refused generation fails every run of that agent
  with its code, before any model call. The Gateway, status, other agents and
  rollback keep working. Nothing falls back to built-in text.
- **What renders.** `openclaw sovereign slots` marks the converted slots. In this
  build they are the identity line (`identity-section.md`, in the main prompt and
  the Codex base), Execution Bias (`execution-section.md`), Runtime Context
  (`runtime-context-section.md`), the media-generation lines
  (`tool-section.d/media-dedupe.md`, with `{{oc:tool:current}}`), Tool Call Style
  (`tool-section.md`), Care with its credential lines (`safety-section.md`,
  `safety-section.d/credentials.{control-tools,no-control-tools}.md`) and the
  workspace-file framing (`project-context-section.md` and
  `project-context-section.d/*`). Headings stay OpenClaw's; an absent optional file
  omits its section. On Codex, workspace files keep the harness's own framing; only
  the personal `USER.md` line there comes from `project-context-section.d/personal-user.md`.
  Other declared files are checked and listed in receipts while their positions still
  render built-in text. Provider overrides of these sections are ignored for the agent.
- **Routes.** Only the embedded OpenClaw runtime and ordinary Codex threads carry
  the files (Codex as `baseInstructions`, or as developer text behind an authored
  Codex base). CLI backends, worker and node placements, other harnesses, Codex
  ring-zero and `none` threads, harness side questions (`/btw` on Codex), and
  `openclaw infer model run --local` on the ChatGPT Responses API (it sends the
  built-in identity line there) refuse with `route_unconverted`.
- **Which agent.** An agent's files render only for a call that names that agent.
  A render or check that names no agent uses built-in text when the agent OpenClaw
  resolves for it without a selection is `off` (an explicit fleet's
  `agents.defaults.systemAgent.agentId`, the legacy default agent, or the sole
  agent). Otherwise, while any agent is `enforce`, that call alone is refused, as is
  a call with an invalid agent id: a render with `agent_unknown`, a route or
  replacement check with `route_unconverted` or `sovereign_override_denied`.
- **No replacement.** A plugin hook that replaces the whole prompt fails the run
  with `sovereign_override_denied`; prepend and append still apply. A provider
  transform that alters a sovereign span fails with `transform_altered`.
- **Never echoed.** Plugin hook payloads (`llm_input`, `before_agent_run`), session
  extension `before_agent_start` payloads and `getSystemPrompt()`, trajectory
  records, diagnostics, model-call content capture, debug proxy capture and
  `/export-session` carry `<!-- openclaw:sovereign <slot> sha256:<12 hex> bytes:<n> -->`
  in place of each sovereign span. The session prompt pin and fork checkpoints are
  not used for the agent.
- **Receipts.** The Gateway logs `[SOVEREIGN_PROMPTS_LOADED]` or
  `[SOVEREIGN_PROMPTS_REFUSED]` per agent at start, the `status` method reports each
  agent's generation and digest or refusal code, and each session's prompt report
  carries the generation, set digest and per-file digests. None holds content.

| Run-time code               | Raised when                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `not_loaded`                | An `enforce` agent this process did not load at start (added by hot reload)                                |
| `agent_unknown`             | A render names no agent, or an invalid one, and no `off` agent resolves for it while an agent is `enforce` |
| `route_unconverted`         | A run is routed where the files cannot reach the model; the output names the route                         |
| `transform_altered`         | A provider transform changed a sovereign span                                                              |
| `sovereign_override_denied` | A plugin hook returned a whole-prompt replacement; the output names the hook site                          |
