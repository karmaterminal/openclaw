export * from "../../../dist/extensions/slack/replies-B0-hdWXs.js";
import * as module from "../../../dist/extensions/slack/replies-B0-hdWXs.js";
let defaultExport = "default" in module ? module.default : module;
for (let index = 0; index < 4 && defaultExport && typeof defaultExport === "object" && "default" in defaultExport; index += 1) {
  defaultExport = defaultExport.default;
}
export { defaultExport as default };
