-- Generated runtime DDL; the owner supplies search_path and the transaction.

CREATE TABLE "continuation_records" (
  "record_id" text COLLATE "C" NOT NULL,
  "kind" text COLLATE "C" NOT NULL,
  "owner_session_key" text COLLATE "C" NOT NULL,
  "chain_id" text COLLATE "C",
  "revision" bigint NOT NULL,
  "status" text COLLATE "C" NOT NULL,
  "phase" text COLLATE "C",
  "failure_reason" text COLLATE "C",
  "cancel_requested_at" bigint,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  "ended_at" bigint,
  "due_at" bigint,
  "state_json" text COLLATE "C" NOT NULL,
  "spawn_attempts_json" text COLLATE "C" NOT NULL DEFAULT '[]',
  "handoff_json" text COLLATE "C",
  "rollback_of" text COLLATE "C",
  "attachment_id" text COLLATE "C",
  "terminal_notice_pending" text COLLATE "C",
  PRIMARY KEY ("record_id"),
  CHECK ((char_length("record_id") > 0)),
  CHECK (("kind" IN ('work', 'delegate', 'post_compaction'))),
  CHECK ((char_length("owner_session_key") > 0)),
  CHECK ("chain_id" IS NULL OR ("kind" = 'work')),
  CHECK (("revision" >= 0)),
  CHECK (("status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))),
  CHECK ("terminal_notice_pending" IS NULL OR ("terminal_notice_pending" IN ('retry-exhausted', 'delegate-spawn-interrupted'))),
  CHECK (((("status" IN ('succeeded', 'failed', 'cancelled'))) = ("ended_at" IS NOT NULL))),
  CHECK ("attachment_id" IS NULL OR ("status" IN ('queued', 'running')))
);

CREATE INDEX "idx_continuation_records_due" ON "continuation_records" (("status") ASC, ("kind") ASC, ("due_at") ASC NULLS FIRST);

CREATE INDEX "idx_continuation_records_owner" ON "continuation_records" (("owner_session_key") ASC, ("kind") ASC, ("status") ASC);
