/* adapter → CANONSPHERE core. Witness only. */
(function (root) {
  const C = root.Canonsphere;
  if (!C) throw new Error("Canonsphere core must load first");

  async function fromWorldState(world) {
    const tick = world.fieldTick || world.tick || world;
    return C.adapters.fieldOs.fromFieldTick({
      id: world.id || "metafield",
      sequence: tick.sequence,
      time: tick.time,
      dt: tick.dt,
      size: world.size || tick.size,
      channels: tick.channels || world.channels,
    });
  }

  C.adapters.metafield = { fromWorldState };
})(typeof window !== "undefined" ? window : globalThis);
