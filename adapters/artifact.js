/* Artifact bytes stay content-addressed. The sigil is a witness, not a substitute. */
(function (root) {
  const C = root.Canonsphere;
  if (!C) throw new Error("Canonsphere core must load first");

  function bytesToField(bytes, size) {
    const plane = size * size;
    const matter = new Float32Array(plane);
    const energy = new Float32Array(plane);
    const temperature = new Float32Array(plane);
    const information = new Float32Array(plane);
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < plane; i++) {
      const a = src[i % src.length] / 255;
      const b = src[(i + 1) % src.length] / 255;
      matter[i] = a * 2 - 1;
      energy[i] = a;
      temperature[i] = Math.abs(a - b);
      information[i] = ((src[i % src.length] ^ src[(i * 7) % src.length]) & 255) / 255;
    }
    return { matter, energy, temperature, information };
  }

  async function fromArtifact(bytes, opts = {}) {
    const size = opts.size || C.GRID;
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const artifactHash = await C.sha256Hex(raw);
    const engine = await C.fromState({
      version: C.STATE_VERSION,
      source: { kind: opts.kind || "artifact", id: artifactHash, hash: artifactHash },
      shape: { width: size, height: size, channels: 4 },
      channels: bytesToField(raw, size),
      sequence: 0,
      time: 0,
      dt: 1,
    });
    engine.sourceKind = opts.kind || "artifact";
    engine.sourceHash = artifactHash;
    if (engine.lastTick) {
      engine.lastTick.sourceHash = artifactHash;
      engine.lastTick.rmeme = C.rmemeObject(engine.lastTick);
    }
    return engine;
  }

  C.adapters.artifact = { fromArtifact };
  C.fromArtifact = fromArtifact;
})(typeof window !== "undefined" ? window : globalThis);
