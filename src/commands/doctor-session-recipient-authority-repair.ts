import {
  getSessionRecipientAuthorityKysely,
  markSessionRecipientAuthorityMutation,
} from "../config/sessions/session-accessor.sqlite-recipient-authority.js";
import {
  createSessionRecipientAuthorityEpoch,
  readSessionRecipientAuthorityEpoch,
} from "../config/sessions/session-recipient-authority-types.js";
import { executeSqliteQuerySync } from "../infra/kysely-sync.js";
import type { OpenClawAgentDatabase } from "../state/openclaw-agent-db.js";

type CanonicalRepairAuthoritySource = {
  database: OpenClawAgentDatabase;
  sessionKeys: readonly string[];
  winnerSessionKey?: string;
};

export function reconcileSessionRecipientAuthorityForCanonicalRepair(params: {
  canonicalKey: string;
  destination: OpenClawAgentDatabase;
  ownerChanged: boolean;
  sources: readonly CanonicalRepairAuthoritySource[];
}): void {
  const hasForeignSource = params.sources.some(
    (source) => source.database.db !== params.destination.db,
  );
  const destinationSource = params.sources.find(
    (source) => source.database.db === params.destination.db,
  );
  const sources = destinationSource
    ? params.sources
    : [...params.sources, { database: params.destination, sessionKeys: [params.canonicalKey] }];
  const rows = sources.flatMap((source) => {
    const sessionKeys = [
      ...new Set([
        ...source.sessionKeys,
        ...(source.database.db === params.destination.db ? [params.canonicalKey] : []),
      ]),
    ];
    if (sessionKeys.length === 0) {
      return [];
    }
    return executeSqliteQuerySync(
      source.database.db,
      getSessionRecipientAuthorityKysely(source.database)
        .selectFrom("session_recipient_authority")
        .select(["epoch", "session_key"])
        .where("session_key", "in", sessionKeys),
    ).rows.map((row) => ({
      epoch: readSessionRecipientAuthorityEpoch(row.epoch),
      winner: source.winnerSessionKey !== undefined && row.session_key === source.winnerSessionKey,
    }));
  });
  const epochs = new Set(
    rows.flatMap((row) => (row.epoch.state === "present" ? [row.epoch.epoch] : [])),
  );
  const winner = rows.find((row) => row.winner);
  const winnerEpoch = winner?.epoch;
  const malformed = rows.some((row) => row.epoch.state === "malformed");
  const needsFreshEpoch =
    hasForeignSource ||
    params.ownerChanged ||
    malformed ||
    epochs.size > 1 ||
    (rows.length > 0 && winnerEpoch?.state !== "present");
  const epoch = needsFreshEpoch
    ? createSessionRecipientAuthorityEpoch()
    : winnerEpoch?.state === "present"
      ? winnerEpoch.epoch
      : undefined;
  const destinationDb = getSessionRecipientAuthorityKysely(params.destination);
  if (epoch) {
    markSessionRecipientAuthorityMutation(params.destination.db, params.canonicalKey);
    const now = Date.now();
    executeSqliteQuerySync(
      params.destination.db,
      destinationDb
        .insertInto("session_recipient_authority")
        .values({
          session_key: params.canonicalKey,
          epoch,
          created_at: now,
          updated_at: now,
        })
        .onConflict((conflict) =>
          conflict.column("session_key").doUpdateSet({ epoch, updated_at: now }),
        ),
    );
  }
  const obsoleteDestinationKeys = [
    ...new Set(
      params.sources
        .filter((source) => source.database.db === params.destination.db)
        .flatMap((source) => source.sessionKeys)
        .filter((sessionKey) => sessionKey !== params.canonicalKey),
    ),
  ];
  if (obsoleteDestinationKeys.length > 0) {
    for (const sessionKey of obsoleteDestinationKeys) {
      markSessionRecipientAuthorityMutation(params.destination.db, sessionKey);
    }
    executeSqliteQuerySync(
      params.destination.db,
      destinationDb
        .deleteFrom("session_recipient_authority")
        .where("session_key", "in", obsoleteDestinationKeys),
    );
  }
}

export function deleteSessionRecipientAuthoritiesForCanonicalRepair(
  database: OpenClawAgentDatabase,
  sessionKeys: readonly string[],
): void {
  const keys = [...new Set(sessionKeys)];
  if (keys.length === 0) {
    return;
  }
  for (const sessionKey of keys) {
    markSessionRecipientAuthorityMutation(database.db, sessionKey);
  }
  executeSqliteQuerySync(
    database.db,
    getSessionRecipientAuthorityKysely(database)
      .deleteFrom("session_recipient_authority")
      .where("session_key", "in", keys),
  );
}
