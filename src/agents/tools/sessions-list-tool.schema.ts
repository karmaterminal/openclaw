import { Type } from "typebox";
import { SessionsListParamsSchema } from "../../../packages/gateway-protocol/src/schema/sessions-list.js";
import { requesterProfileSchema, stringEnum } from "../schema/typebox.js";
import { SESSION_LINK_RULE_DESCRIPTION } from "../tool-description-presets.js";
import { SESSION_LIST_KINDS, SessionListRowSchema } from "./sessions-helpers.js";

export const SessionsListToolSchema = Type.Object({
  user: requesterProfileSchema(),
  kinds: Type.Optional(Type.Array(stringEnum(SESSION_LIST_KINDS))),
  limit: SessionsListParamsSchema.properties.limit,
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
  activeMinutes: SessionsListParamsSchema.properties.activeMinutes,
  activeOnly: SessionsListParamsSchema.properties.activeOnly,
  excludeSubagents: SessionsListParamsSchema.properties.excludeSubagents,
  relationship: Type.Optional(
    stringEnum(["owned", "created", "involving"], {
      description:
        "Relation to the authenticated requesting user; unavailable without a trusted user identity.",
    }),
  ),
  ownerId: SessionsListParamsSchema.properties.ownerId,
  creatorId: SessionsListParamsSchema.properties.creatorId,
  projectId: SessionsListParamsSchema.properties.projectId,
  workspaceDir: SessionsListParamsSchema.properties.workspaceDir,
  group: SessionsListParamsSchema.properties.group,
  pinned: SessionsListParamsSchema.properties.pinned,
  messageLimit: Type.Optional(Type.Integer({ minimum: 0 })),
  label: Type.Optional(Type.String({ minLength: 1 })),
  agentId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  search: Type.Optional(Type.String({ minLength: 1 })),
  archived: SessionsListParamsSchema.properties.archived,
  includeDerivedTitles: SessionsListParamsSchema.properties.includeDerivedTitles,
  includeLastMessage: SessionsListParamsSchema.properties.includeLastMessage,
});

export const SessionsListOutputSchema = Type.Object(
  {
    count: Type.Number(),
    sessions: Type.Array(SessionListRowSchema),
    hasMore: Type.Boolean(),
    nextOffset: Type.Optional(Type.Integer({ minimum: 0 })),
    limitApplied: Type.Integer({ minimum: 1, maximum: 200 }),
    truncationReason: Type.Optional(stringEnum(["scan-limit", "byte-limit"])),
    enrichmentOmitted: Type.Optional(
      Type.Boolean({
        description:
          "Inline messages and transcript previews were omitted to fit the byte budget; read session history separately.",
      }),
    ),
    warning: Type.Optional(
      Type.String({
        description:
          "Names owners the Gateway refused as unknown agent ids; their rows are listed without the named enrichment.",
      }),
    ),
    sessionLinkRule: Type.Optional(Type.String({ description: SESSION_LINK_RULE_DESCRIPTION })),
    visibility: Type.Optional(
      Type.Object(
        {
          mode: Type.Union([Type.Literal("self"), Type.Literal("tree"), Type.Literal("agent")]),
          restricted: Type.Literal(true),
          warning: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
