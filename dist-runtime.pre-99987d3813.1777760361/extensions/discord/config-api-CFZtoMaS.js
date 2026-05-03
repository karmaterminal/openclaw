export * from "../../../dist/extensions/discord/config-api-CFZtoMaS.js";
import * as module from "../../../dist/extensions/discord/config-api-CFZtoMaS.js";
let defaultExport = "default" in module ? module.default : module;
for (let index = 0; index < 4 && defaultExport && typeof defaultExport === "object" && "default" in defaultExport; index += 1) {
  defaultExport = defaultExport.default;
}
export { defaultExport as default };
