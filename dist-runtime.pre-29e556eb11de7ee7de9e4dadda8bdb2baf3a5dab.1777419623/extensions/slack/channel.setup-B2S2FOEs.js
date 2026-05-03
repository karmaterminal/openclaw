export * from "../../../dist/extensions/slack/channel.setup-B2S2FOEs.js";
import * as module from "../../../dist/extensions/slack/channel.setup-B2S2FOEs.js";
let defaultExport = "default" in module ? module.default : module;
for (let index = 0; index < 4 && defaultExport && typeof defaultExport === "object" && "default" in defaultExport; index += 1) {
  defaultExport = defaultExport.default;
}
export { defaultExport as default };
