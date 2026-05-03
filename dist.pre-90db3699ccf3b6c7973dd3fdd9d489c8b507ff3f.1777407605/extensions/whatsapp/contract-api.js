import { o as normalizeWhatsAppTarget$1, t as isWhatsAppGroupJid$1 } from "./normalize-target-786yB1mC.js";
import { t as whatsappCommandPolicy$1 } from "./command-policy-BFYuIAgc.js";
import { t as resolveLegacyGroupSessionKey$1 } from "./group-session-contract-CEWIFNj6.js";
import { n as unsupportedSecretRefSurfacePatterns, t as collectUnsupportedSecretRefConfigCandidates } from "./security-contract-C0AQPJg9.js";
import { r as isLegacyGroupSessionKey$1, t as canonicalizeLegacySessionKey$1 } from "./session-contract-CRhQMCzf.js";
import { n as listWhatsAppDirectoryGroupsFromConfig, r as listWhatsAppDirectoryPeersFromConfig } from "./directory-config-D-47LxeO.js";
import { t as resolveWhatsAppRuntimeGroupPolicy$1 } from "./runtime-group-policy-D0FoIsVg.js";
import { t as __testing } from "./access-control-CNmzwKT9.js";
//#region extensions/whatsapp/contract-api.ts
const canonicalizeLegacySessionKey = canonicalizeLegacySessionKey$1;
const isLegacyGroupSessionKey = isLegacyGroupSessionKey$1;
const isWhatsAppGroupJid = isWhatsAppGroupJid$1;
const normalizeWhatsAppTarget = normalizeWhatsAppTarget$1;
const resolveLegacyGroupSessionKey = resolveLegacyGroupSessionKey$1;
const resolveWhatsAppRuntimeGroupPolicy = resolveWhatsAppRuntimeGroupPolicy$1;
const whatsappAccessControlTesting = __testing;
const whatsappCommandPolicy = whatsappCommandPolicy$1;
//#endregion
export { canonicalizeLegacySessionKey, collectUnsupportedSecretRefConfigCandidates, isLegacyGroupSessionKey, isWhatsAppGroupJid, listWhatsAppDirectoryGroupsFromConfig, listWhatsAppDirectoryPeersFromConfig, normalizeWhatsAppTarget, resolveLegacyGroupSessionKey, resolveWhatsAppRuntimeGroupPolicy, unsupportedSecretRefSurfacePatterns, whatsappAccessControlTesting, whatsappCommandPolicy };
