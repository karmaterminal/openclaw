import { r as createLegacyPrivateNetworkDoctorContract } from "./ssrf-policy--Df98exY.js";
import "./ssrf-runtime-Bl9JVaAD.js";
//#region extensions/nextcloud-talk/src/doctor-contract.ts
const contract = createLegacyPrivateNetworkDoctorContract({ channelKey: "nextcloud-talk" });
const legacyConfigRules = contract.legacyConfigRules;
const normalizeCompatibilityConfig = contract.normalizeCompatibilityConfig;
//#endregion
export { normalizeCompatibilityConfig as n, legacyConfigRules as t };
