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

<Note>
This build ships the loader, its checks and these commands. Prompt assembly does
not read sovereign files yet, so `agents.entries.<agentId>.sovereignPrompts.mode`
accepts only `"off"` until the phase A wiring slice lands. Config validation
refuses `"enforce"`, so `openclaw config validate` rejects a config that sets it.
</Note>

| Command | Role                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------- |
| `paths` | Resolves the agent's sovereign root and switch state from config; reads no file                       |
| `check` | Loads a generation (the one `CURRENT` names, or `--generation <dir>`) and runs every mechanical check |

Both commands take `--agent <id>` (required) and `--json`. They run read-only
beside a live Gateway, so a deploy can call them before its restart.

```bash
openclaw sovereign paths --agent main --json
openclaw sovereign check --agent main --json
openclaw sovereign check --agent main --generation ~/.openclaw/agents/main/agent/sovereign/systemprompts/generations/.staging-1 --json
```

Exit codes: `0` when the agent resolves (`paths`) or the generation loads
(`check`); `1` on any refusal, with the refusal code in the output. An invalid
config, such as one that sets `"enforce"` on this build, exits `1` with the config
error before either command runs.

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
| `io_error`                                         | Any other read failure; the output carries the errno name only                                                                                                                                                                     |
| `enforce_unwired`                                  | `paths`: the loader was given mode `"enforce"`, which this build does not apply. Config validation refuses `"enforce"` first                                                                                                       |
| `agent_unknown`                                    | `--agent` names no configured agent                                                                                                                                                                                                |

An empty optional file counts as absent. Refusal output names the code and, where
known, the slot, the registry file name, the generation id, byte counts and
limits, the uid, the octal mode or the errno name. It never includes content,
native error text, or names outside the registry.
