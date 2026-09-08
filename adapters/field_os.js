/* adapter → CANONSPHERE core. Never the reverse. */
(function (root) {
  const C = root.Canonsphere;
  if (!C) throw new Error("Canonsphere core must load first");

  async function fromFieldTick(tick) {
    const size = tick.size || tick.width || C.GRID;
    const channels = tick.channels || {};
    return C.fromState({
      version: C.STATE_VERSION,
      source: {
        kind: "field-tick",
        id: String(tick.id || tick.sequence || "tick"),
        hash: tick.source_hash || tick.hash,
      },
      shape: { width: size, height: size, channels: 4 },
      channels: {
        matter: channels.matter || channels[0],
        energy: channels.energy || channels[1],
        temperature: channels.temperature || channels[2],
        information: channels.information || channels[3],
      },
      sequence: tick.sequence || 0,
      time: tick.time || 0,
      dt: tick.dt || 1,
    });
  }

  C.adapters.fieldOs = { fromFieldTick };
  C.fromFieldTick = fromFieldTick;
})(typeof window !== "undefined" ? window : globalThis);
