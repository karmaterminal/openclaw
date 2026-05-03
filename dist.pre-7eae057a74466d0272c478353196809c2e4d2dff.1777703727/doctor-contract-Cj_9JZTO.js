import { r as createLegacyPrivateNetworkDoctorContract } from "./ssrf-policy-0KQNa5MO.js";
import "./ssrf-runtime-CYyLqpTw.js";
//#region extensions/mattermost/src/doctor-contract.ts
const contract = createLegacyPrivateNetworkDoctorContract({ channelKey: "mattermost" });
const legacyConfigRules = contract.legacyConfigRules;
const normalizeCompatibilityConfig = contract.normalizeCompatibilityConfig;
//#endregion
export { normalizeCompatibilityConfig as n, legacyConfigRules as t };
