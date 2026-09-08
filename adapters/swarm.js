/* Swarm snapshot → canonical field. Witness only; never drives the swarm. */
(function (root) {
  const C = root.Canonsphere;
  if (!C) throw new Error("Canonsphere core must load first");

  function rasterizeAgents(agents, size) {
    const plane = size * size;
    const matter = new Float32Array(plane);
    const energy = new Float32Array(plane);
    const temperature = new Float32Array(plane);
    const information = new Float32Array(plane);
    const list = agents || [];
    for (const agent of list) {
      const x = Math.max(0, Math.min(size - 1, Math.floor((agent.x || 0) * size)));
      const y = Math.max(0, Math.min(size - 1, Math.floor((agent.y || 0) * size)));
      const i = y * size + x;
      const speed = Math.hypot(agent.vx || 0, agent.vy || 0);
      matter[i] += 1;
      energy[i] += speed;
      temperature[i] += Math.abs((agent.heading || 0) - (agent.neighbor_heading || 0));
      information[i] += agent.id != null ? 1 : 0.25;
    }
    const n = Math.max(1, list.length);
    for (let i = 0; i < plane; i++) {
      matter[i] = matter[i] / n;
      energy[i] = energy[i] / n;
      temperature[i] = temperature[i] / n;
      information[i] = information[i] / n;
    }
    return { matter, energy, temperature, information };
  }

  async function fromSwarm(snapshot, opts = {}) {
    if (snapshot && (snapshot.channels || snapshot.fieldTick || snapshot.tick)) {
      const tick = snapshot.fieldTick || snapshot.tick || snapshot;
      if (!C.fromFieldTick) throw new Error("field_os adapter must load before swarm");
      return C.fromFieldTick({
        id: snapshot.id || tick.id || "swarm",
        sequence: tick.sequence,
        time: tick.time,
        dt: tick.dt,
        size: snapshot.size || tick.size,
        channels: tick.channels || snapshot.channels,
        source_hash: snapshot.source_hash,
      });
    }
    const size = opts.size || snapshot.size || C.GRID;
    const agents = snapshot.agents || snapshot.drones || snapshot || [];
    const raw = new TextEncoder().encode(
      JSON.stringify({
        n: agents.length,
        sequence: snapshot.sequence || 0,
      })
    );
    const engine = await C.fromState({
      version: C.STATE_VERSION,
      source: { kind: "swarm", id: String(snapshot.id || opts.id || "swarm") },
      shape: { width: size, height: size, channels: 4 },
      channels: rasterizeAgents(agents, size),
      sequence: snapshot.sequence || 0,
      time: snapshot.time || 0,
      dt: snapshot.dt || 1,
    });
    engine.sourceKind = "swarm";
    engine.sourceHash = await C.sourceHash("swarm", raw);
    if (engine.lastTick) {
      engine.lastTick.sourceHash = engine.sourceHash;
      engine.lastTick.rmeme = C.rmemeObject(engine.lastTick);
    }
    return engine;
  }

  C.adapters.swarm = { fromSwarm };
  C.fromSwarm = fromSwarm;
})(typeof window !== "undefined" ? window : globalThis);
