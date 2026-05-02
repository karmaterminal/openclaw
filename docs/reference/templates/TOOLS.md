---
summary: "Workspace template for TOOLS.md"
title: "TOOLS.md template"
read_when:
  - Bootstrapping a workspace manually
---

# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## Descriptor-evolution convention for new tool descriptors

Use this when adding a new optional field to a tool descriptor whose runtime is split across two phases: an address-recipient form that ships now, and a broadcast/publish form that ships later under a host substrate.

### Conditional descriptor block

Quote this block on the new field. The address/publish framing tells a future reader the field has an evolution path and which substrate carries the broader shape:

```ts
  targetSessionKey: Type.Optional(
    Type.String({
      description:
        "Address a sibling session for cross-session enrichment. " +
        "This version supports direct addressing; broadcast-mode lands " +
        "through the same substrate in <runtime-issue>.",
    }),
  ),
```

For richer descriptors, extend with the address format and the runtime-issue cite:

- Concrete sessions: `agent:<agent-id>:<channel>`
- Role-aliased delivery: `role:<role-name>`
- `DESCRIPTOR-ONLY` in this version; runtime lands in `#<runtime-issue>`; calling it now fails loudly.

### Descriptor-only loud-failure

When the field exists in the schema but the runtime hasn't landed, fail at `execute()` with `ToolInputError` (not plain `Error`) — matches the line-80 pattern at `src/agents/tools/continue-delegate-tool.ts:80`:

> this field exists in the schema; runtime lands in `#N`; calling it now fails immediately and points at the runtime issue.

### Doctrine

- **Ride upstream substrate for free wins.** Drain ordering, idempotency, route resolution, W3C trace-context (`traceparent`), sha256 content-addressing - if the host already grants it, do not re-implement. Reusing host-provided substrate mechanisms reduces the bespoke surface that maintainers must own across releases.
- **Add verbs over the substrate-noun.** The queue is the noun; `address`, `publish`, `broadcast` are verbs that evolve over it. Never add a parallel mechanism that bypasses the substrate.
- **Cite-pin the address-to-publish path.** Before adding a descriptor, ask at design time whether a substrate already grants this capability and whether the descriptor has a broader form arriving later. Pin the runtime issue and substrate-tracking link so the convergence stays legible across releases.

### One-source-of-truth examples

- `<commit-a>`: `targetSessionKey?` descriptor shape and loud-failure handling.
- `<commit-b>`: queued-delivery metadata shape, including `traceparent?` and `attachments?`.

## Related

- [Agent workspace](/concepts/agent-workspace)
