import { r as createLegacyPrivateNetworkDoctorContract } from "./ssrf-policy-DqC2suTV.js";
import "./ssrf-runtime-BMO6XEyq.js";
//#region extensions/mattermost/src/doctor-contract.ts
const contract = createLegacyPrivateNetworkDoctorContract({ channelKey: "mattermost" });
const legacyConfigRules = contract.legacyConfigRules;
const normalizeCompatibilityConfig = contract.normalizeCompatibilityConfig;
//#endregion
export { normalizeCompatibilityConfig as n, legacyConfigRules as t };
