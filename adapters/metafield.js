/* adapter → CANONSPHERE core. Witness only. */
(function (root) {
  const C = root.Canonsphere;
  if (!C) throw new Error("Canonsphere core must load first");

  async function fromWorldState(world) {
    const tick = world.fieldTick || world.tick || world;
    const adapter = C.adapters.fieldOs;
    if (!adapter) throw new Error("field_os adapter must load before metafield");
    return adapter.fromFieldTick({
      id: world.id || "metafield",
      sequence: tick.sequence,
      time: tick.time,
      dt: tick.dt,
      size: world.size || tick.size,
      channels: tick.channels || world.channels,
      source_hash: world.source_hash || tick.source_hash,
    });
  }

  C.adapters.metafield = { fromWorldState };
  C.fromWorldState = fromWorldState;
})(typeof window !== "undefined" ? window : globalThis);
