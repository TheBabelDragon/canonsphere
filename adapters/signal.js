/* Map a 1D sample stream onto the four-channel grid. */
(function (root) {
  const C = root.Canonsphere;
  if (!C) throw new Error("Canonsphere core must load first");

  function rasterize(samples, size) {
    const plane = size * size;
    const matter = new Float32Array(plane);
    const energy = new Float32Array(plane);
    const temperature = new Float32Array(plane);
    const information = new Float32Array(plane);
    const src = Float32Array.from(samples);
    for (let i = 0; i < plane; i++) {
      const a = src[i % src.length] || 0;
      const b = src[(i + 1) % src.length] || 0;
      matter[i] = a;
      energy[i] = Math.abs(a);
      temperature[i] = Math.abs(a - b);
      information[i] = Math.abs(a) > 0.05 ? 1 : 0;
    }
    return { matter, energy, temperature, information };
  }

  async function fromSignal(samples, opts = {}) {
    const size = opts.size || C.GRID;
    const raw =
      samples instanceof Float32Array
        ? new Uint8Array(samples.buffer.slice(0))
        : new TextEncoder().encode(String(samples.length));
    const engine = await C.fromState({
      version: C.STATE_VERSION,
      source: { kind: "signal", id: opts.id || "samples" },
      shape: { width: size, height: size, channels: 4 },
      channels: rasterize(samples, size),
      sequence: opts.sequence || 0,
      time: opts.time || 0,
      dt: opts.dt || 1,
    });
    engine.sourceKind = "signal";
    engine.sourceHash = await C.sourceHash("signal", raw);
    if (engine.lastTick) {
      engine.lastTick.sourceHash = engine.sourceHash;
      engine.lastTick.rmeme = C.rmemeObject(engine.lastTick);
    }
    return engine;
  }

  C.adapters.signal = { fromSignal };
  C.fromSignal = fromSignal;
})(typeof window !== "undefined" ? window : globalThis);
