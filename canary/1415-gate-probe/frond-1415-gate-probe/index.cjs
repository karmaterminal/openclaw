// Frond (karmaterminal, #1415) canary probe. Its only effect is existing: one turn-time hook
// owned by a path-loaded plugin, which the room aggregate plugin gate does not audit. The hook
// reads nothing, returns nothing, and imports nothing.
module.exports = {
  id: "frond-1415-gate-probe",
  register(api) {
    api.on("model_call_started", () => undefined);
  },
};
