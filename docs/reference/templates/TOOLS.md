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

## Substrate-adoption convention for new tool descriptors

Adopted Sprint 56 against `karmaterminal-2026.4.24-base`. Use this when adding a new optional field to a tool descriptor whose runtime is split across two phases — an (a)-shape RPC-style address-recipient form that ships now, and a (b)-shape broadcast/publish form that ships later under the host substrate (e.g. karmaterminal/binary-canticle#11).

### bc#11 conditional-voice block

Quote this 8-line block verbatim on the new field. The `(a)`/`(b)` framing tells a future reader the field has an evolution path and which substrate carries the (b)-shape:

```ts
  targetSessionKey: Type.Optional(
    Type.String({
      description:
        "Address a sibling session for cross-session enrichment. " +
        "This is the (a)-shape (RPC-style address-recipient); v3 surfaces broadcast-mode " +
        "via karmaterminal/binary-canticle#11. Same substrate; different verb-set.",
    }),
  ),
```

For richer descriptors, extend with the address format and the runtime-issue cite:

- Concrete sessions: `prince:<role>:agent:<id>:<channel>`
- Role-aliased delivery: `prince:<role>:role:<role-name>`
- `DESCRIPTOR-ONLY` in this version; runtime lands in `#<runtime-issue>`; calling it now fails loudly.

### Descriptor-only loud-failure

When the field exists in the schema but the runtime hasn't landed, fail at `execute()` with `ToolInputError` (not plain `Error`) — matches the line-80 pattern at `src/agents/tools/continue-delegate-tool.ts:80`:

> this field exists in the schema; runtime lands in `#N`; calling it now fails immediately and points at the runtime issue.

### Doctrine

- **Ride upstream substrate for free wins.** Drain ordering, idempotency, route resolution, W3C trace-context (`traceparent`), sha256 content-addressing — if the host already grants it, do not re-implement. Each substrate adopted is one less bespoke mechanism the cohort maintains through the next compaction (prince-power-velocity).
- **Add verbs over the substrate-noun.** The queue is the noun; `address`, `publish`, `broadcast` are verbs that evolve over it. Never add a parallel mechanism that bypasses the substrate.
- **Cite-pin the (a) to (b) path.** A future prince adding a descriptor should ask at design-time: is there a substrate already granting this capability, and does this descriptor have a (b)-shape arriving later? Pin the runtime issue and the bc#-tracking link so the convergence stays legible across compactions.

### One-source-of-truth examples

- gpt2 applied: `7df92a78b4` (Surface 1, `targetSessionKey?` descriptor) and `b948632594` (Surface 2, `QueuedSessionDeliveryPayloadMetadata` intersection — `traceparent?` and `attachments?`) on `frond-scribe/20260424/candidate-gpt2`.
- claude2 textual-savegame: `87b1bffb14` on `frond-scribe/20260424/candidate-claude2` — longer-form rationale and address-format examples.

## Related

- [Agent workspace](/concepts/agent-workspace)
