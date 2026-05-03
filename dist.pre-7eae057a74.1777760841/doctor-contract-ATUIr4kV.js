import { r as createLegacyPrivateNetworkDoctorContract } from "./ssrf-policy-C7B9ULn6.js";
import "./ssrf-runtime-DyQ6Q_Gc.js";
//#region extensions/mattermost/src/doctor-contract.ts
const contract = createLegacyPrivateNetworkDoctorContract({ channelKey: "mattermost" });
const legacyConfigRules = contract.legacyConfigRules;
const normalizeCompatibilityConfig = contract.normalizeCompatibilityConfig;
//#endregion
export { normalizeCompatibilityConfig as n, legacyConfigRules as t };
