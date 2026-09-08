window.Canonsphere = (() => {
  const GRID = 48;
  const CHANNELS = 4;
  const CHANNEL_NAMES = ["matter", "energy", "temperature", "information"];
  const SIGIL_VERSION = "stereograph-sigil-v0.1";
  const STATE_VERSION = "canonical-state-v0.1";
  const RMEME_SCHEMA = "rmeme-v0.2";
  const MAGIC = [0x43, 0x4e, 0x53, 0x31];
  const HEADER_SIZE = 40;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rng) {
    const u = Math.max(rng(), 1e-12); const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function finite32(v) { if (!Number.isFinite(v)) return v > 0 ? 1 : v < 0 ? -1 : 0; return v; }
  function encodeCanonical(field) {
    const width = field.size, height = field.size;
    const n = CHANNELS * height * width;
    const payloadBytes = n * 4;
    const out = new ArrayBuffer(HEADER_SIZE + payloadBytes);
    const view = new DataView(out);
    MAGIC.forEach((b, i) => view.setUint8(i, b));
    view.setUint16(4, 1, true); view.setUint16(6, CHANNELS, true);
    view.setUint16(8, width, true); view.setUint16(10, height, true);
    view.setFloat32(12, field.dt, true);
    view.setBigInt64(16, BigInt(field.sequence), true);
    view.setFloat64(24, field.time, true);
    view.setUint8(32, 0); view.setUint8(33, 0); view.setUint8(34, 0); view.setUint8(35, 0);
    view.setUint32(36, payloadBytes, true);
    for (let i = 0; i < n; i++) view.setFloat32(HEADER_SIZE + i * 4, finite32(field.channels[i]), true);
    return new Uint8Array(out);
  }
  function decodeCanonical(bytes) {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (buf.length < HEADER_SIZE || buf[0] !== 0x43 || buf[1] !== 0x4e || buf[2] !== 0x53 || buf[3] !== 0x31) throw new Error("not a CANONSPHERE canonical blob");
    if (view.getUint16(4, true) !== 1) throw new Error("unsupported version");
    const channels = view.getUint16(6, true), width = view.getUint16(8, true), height = view.getUint16(10, true);
    const dt = view.getFloat32(12, true), sequence = Number(view.getBigInt64(16, true)), time = view.getFloat64(24, true);
    const arr = new Float32Array(channels * height * width);
    for (let i = 0; i < arr.length; i++) arr[i] = view.getFloat32(HEADER_SIZE + i * 4, true);
    return { version: STATE_VERSION, shape: { width, height, channels }, sequence, time, dt, array: arr };
  }
  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function sourceHash(kind, payload) {
    const prefix = new TextEncoder().encode("CNS1SRC\x00" + kind + "\x00");
    const body = payload instanceof Uint8Array ? payload : new TextEncoder().encode(String(payload));
    const out = new Uint8Array(prefix.length + body.length);
    out.set(prefix, 0); out.set(body, prefix.length);
    return sha256Hex(out);
  }
  function near(a, b, eps) { return Math.abs(a - b) <= eps; }
  function stereoEqual(a, b, eps) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((p, i) => near(p[0], b[i][0], eps) && near(p[1], b[i][1], eps) && near(p[2], b[i][2], eps));
  }
  class FieldState {
    constructor(size = GRID, seed = 1337) {
      this.size = size; this.seed = seed; this.channels = new Float32Array(CHANNELS * size * size);
      this.sequence = 0; this.time = 0; this.dt = 1; this.noise(seed);
    }
    noise(seed) {
      const rng = mulberry32(seed >>> 0); const plane = this.size * this.size; this.channels.fill(0);
      for (let i = 0; i < plane; i++) this.channels[i] = gaussian(rng) * 0.08;
      for (let i = 0; i < plane; i++) this.channels[plane + i] = gaussian(rng) * 0.04;
    }
    idx(c, y, x) { return (c * this.size + y) * this.size + x; }
    inject(x, y, strength = 1, channel = 0) {
      if (x == null) x = (this.size / 2) | 0; if (y == null) y = (this.size / 2) | 0;
      const r2 = Math.max(1, (2 + Math.abs(strength) * 2) | 0) ** 2;
      for (let yy = 0; yy < this.size; yy++) for (let xx = 0; xx < this.size; xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 <= r2) {
          this.channels[this.idx(channel, yy, xx)] += strength;
          this.channels[this.idx(3, yy, xx)] += Math.abs(strength) * 0.12;
        }
      }
    }
    imprint(maps, strength = 1) {
      const plane = this.size * this.size;
      for (let c = 0; c < CHANNELS; c++) {
        const src = maps[CHANNEL_NAMES[c]]; if (!src) continue;
        for (let i = 0; i < plane; i++) this.channels[c * plane + i] = src[i] * strength;
      }
    }
    evolve() {
      const n = this.size; const old = this.channels.slice(); const neu = old.slice();
      const at = (src, c, y, x) => src[(c * n + ((y + n) % n)) * n + ((x + n) % n)];
      for (let c = 0; c < CHANNELS; c++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const center = at(old, c, y, x);
        neu[this.idx(c, y, x)] = center + 0.08 * (at(old, c, y - 1, x) + at(old, c, y + 1, x) + at(old, c, y, x - 1) + at(old, c, y, x + 1) - 4 * center);
      }
      const plane = n * n;
      for (let i = 0; i < plane; i++) {
        let matter = neu[i], energy = neu[plane + i], temperature = neu[2 * plane + i], information = neu[3 * plane + i];
        temperature += Math.abs(energy) * 0.015 - temperature * 0.025;
        energy += Math.abs(matter) * 0.008 - energy * 0.012;
        information += Math.abs(matter - energy) * 0.004 - information * 0.008;
        matter += Math.tanh(energy * 0.35) * 0.01; energy += Math.tanh(temperature * 0.25) * 0.01;
        neu[i] = clamp(matter, -4, 4); neu[plane + i] = clamp(energy, -4, 4);
        neu[2 * plane + i] = clamp(temperature, -4, 4); neu[3 * plane + i] = clamp(information, -4, 4);
      }
      this.channels = neu; this.sequence += 1; this.time += this.dt;
    }
    metrics() {
      const x = this.channels, plane = this.size * this.size;
      const meanAbs = (off) => { let s = 0; for (let i = 0; i < plane; i++) s += Math.abs(x[off + i]); return s / plane; };
      let sum = 0, sum2 = 0; for (let i = 0; i < x.length; i++) { sum += x[i]; sum2 += x[i] * x[i]; }
      let act = 0, count = 0;
      for (let c = 0; c < CHANNELS - 1; c++) for (let i = 0; i < plane; i++) { act += Math.abs(x[(c + 1) * plane + i] - x[c * plane + i]); count += 1; }
      const mean = sum / x.length;
      return { matter: meanAbs(0), energy: meanAbs(plane), temperature: meanAbs(2 * plane), information: meanAbs(3 * plane), variance: sum2 / x.length - mean * mean, activity: act / Math.max(1, count) };
    }
    canonicalBytes() { return encodeCanonical(this); }
    channelPlane(c) { const n = this.size; return this.channels.subarray(c * n * n, (c + 1) * n * n); }
  }
  class Sigil {
    constructor(stateHash, metrics, view = {}) {
      this.stateHash = stateHash; this.metrics = metrics;
      this.seed = Number(BigInt("0x" + stateHash.slice(0, 16)));
      const rng = mulberry32(Number(BigInt(this.seed) % 4294967296n));
      this.committed = { rotation: rng() * Math.PI * 2, layers: 3 + ((rng() * 5) | 0), symmetry: 2 + ((rng() * 7) | 0) };
      this.rotation = view.rotation != null ? view.rotation : this.committed.rotation;
      this.layers = view.layers != null ? view.layers : this.committed.layers;
      this.symmetry = view.symmetry != null ? view.symmetry : this.committed.symmetry;
      this.radius = 0.55 + metrics.activity * 3; this.points = this.derivePoints();
    }
    derivePoints() {
      const n = 24 + Math.min(60, (this.metrics.variance * 300) | 0); const pts = [];
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n - 1);
        const angle = t * Math.PI * 2 * this.symmetry + this.rotation;
        const wave = Math.sin(angle * this.symmetry + (this.seed % 997));
        const radius = this.radius * (0.55 + 0.45 * t) * (1 + wave * 0.18);
        pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
      }
      return pts;
    }
  }
  function project(x, y, rotation) {
    const r2 = x * x + y * y, denom = r2 + 1;
    const sx = (2 * x) / denom, sy = (2 * y) / denom, sz = (r2 - 1) / denom;
    const c = Math.cos(rotation), s = Math.sin(rotation);
    return [c * sx - s * sy, s * sx + c * sy, sz];
  }
  function sampleImage(img, size, offsetX = 0.5, offsetY = 0.5) {
    const c = document.createElement("canvas"); c.width = size; c.height = size;
    const g = c.getContext("2d"); const side = Math.min(img.width, img.height);
    g.drawImage(img, clamp(img.width * offsetX - side / 2, 0, img.width - side), clamp(img.height * offsetY - side / 2, 0, img.height - side), side, side, 0, 0, size, size);
    const pix = g.getImageData(0, 0, size, size).data;
    const luma = new Float32Array(size * size), energy = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) {
      const r = pix[i * 4] / 255, gg = pix[i * 4 + 1] / 255, b = pix[i * 4 + 2] / 255;
      luma[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
      energy[i] = Math.sqrt((r - gg) ** 2 + (gg - b) ** 2 + (b - r) ** 2) * (0.35 + luma[i]);
    }
    const temperature = new Float32Array(size * size), information = new Float32Array(size * size);
    const at = (x, y) => luma[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      temperature[i] = Math.abs(luma[i] - (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 4) * 8;
      const gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1);
      information[i] = Math.sqrt(gx * gx + gy * gy) * 6;
    }
    return { preview: c, matter: luma.map((v) => (v - 0.5) * 2.4), energy: energy.map((v) => v * 2.2), temperature, information };
  }
  function committedGeometry(sigil) {
    const committed = new Sigil(sigil.stateHash, sigil.metrics, sigil.committed);
    return { sigil: committed, stereograph: committed.points.map(([x, y]) => project(x, y, committed.rotation)) };
  }
  function rmemeObject(tick) {
    return {
      schema: RMEME_SCHEMA, source_hash: tick.sourceHash || null, state_hash: tick.stateHash,
      sequence: tick.sequence, time: tick.time, field: { size: tick.size || GRID, channels: CHANNELS },
      metrics: tick.metrics,
      sigil: { version: SIGIL_VERSION, seed: String(tick.sigil.seed), symmetry: tick.sigil.committed.symmetry, layers: tick.sigil.committed.layers, rotation: tick.sigil.committed.rotation },
      stereograph: tick.committedStereograph,
    };
  }
  function rmemeText(obj, extra = "") {
    if (!obj) return "Drop an image to commit a sigil.";
    return ["SIGIL COMMITTED", "SOURCE    " + (obj.source_hash ? obj.source_hash.slice(0, 16) + "..." : "\u2014"), "STATE     " + obj.state_hash.slice(0, 16) + "...", "TICK      " + String(obj.sequence).padStart(3, "0"), "SIGIL     " + obj.sigil.seed, "SYMMETRY  " + obj.sigil.symmetry, "LAYERS    " + obj.sigil.layers, extra].join("\n");
  }
  function rmemeSVG(obj) {
    const pts = (obj.stereograph || []).map((p) => (160 + p[0] * 110).toFixed(2) + "," + (160 - (p[1] * 0.35 + p[2] * 0.85) * 110).toFixed(2));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><rect width="320" height="320" fill="#080812"/><circle cx="160" cy="160" r="118" fill="none" stroke="#2a2a4a"/><polyline fill="none" stroke="#c9b8ff" stroke-width="1.6" points="' + pts.join(" ") + '"/><text x="16" y="304" fill="#8b8ba8" font-size="9" font-family="monospace">' + (obj.state_hash || "").slice(0, 16) + "</text></svg>";
  }
  class Engine {
    constructor() { this.field = new FieldState(); this.lastTick = null; this.source = null; this.maps = null; this.sourceKind = null; this.sourceBytes = null; this.sourceHash = null; }
    setImage(img, maps, rawBytes) { this.source = img; this.maps = maps; this.sourceKind = "image"; this.sourceBytes = rawBytes || null; }
    async commit(view = {}, settle = 6) { for (let i = 0; i < settle; i++) this.field.evolve(); return this.snapshot(view); }
    async snapshot(view = {}) {
      if (this.sourceKind && !this.sourceHash) this.sourceHash = await sourceHash(this.sourceKind, this.sourceBytes || new TextEncoder().encode(this.sourceKind));
      const bytes = this.field.canonicalBytes(); const hash = await sha256Hex(bytes);
      const metrics = this.field.metrics(); const sigil = new Sigil(hash, metrics, view);
      const committed = committedGeometry(sigil);
      this.lastTick = { sequence: this.field.sequence, time: this.field.time, dt: this.field.dt, size: this.field.size, stateHash: hash, sourceHash: this.sourceHash, sourceKind: this.sourceKind, metrics, sigil, canonicalBytes: bytes, stereograph: sigil.points.map(([x, y]) => project(x, y, sigil.rotation)), committedStereograph: committed.stereograph, rmeme: null };
      this.lastTick.rmeme = rmemeObject(this.lastTick); return this.lastTick;
    }
    async verify() {
      if (!this.lastTick) return null;
      const bytes = this.field.canonicalBytes(); const hash = await sha256Hex(bytes);
      const bytesPass = bytes.length === this.lastTick.canonicalBytes.length && bytes.every((b, i) => b === this.lastTick.canonicalBytes[i]);
      const hashPass = hash === this.lastTick.stateHash;
      const derived = new Sigil(hash, this.field.metrics());
      const sigilPass = derived.seed === this.lastTick.sigil.seed && derived.committed.symmetry === this.lastTick.sigil.committed.symmetry && derived.committed.layers === this.lastTick.sigil.committed.layers;
      const stereoPass = stereoEqual(derived.points.map(([x, y]) => project(x, y, derived.rotation)), this.lastTick.committedStereograph, 1e-6);
      return { pass: bytesPass && hashPass && sigilPass && stereoPass, canonical_bytes: bytesPass, state_hash: hashPass, sigil: sigilPass, stereograph: stereoPass };
    }
    tamper() { this.field.channels[0] += 0.001; }
  }
  function planeFromUnknown(src, size) { if (!src) return new Float32Array(size * size); if (src instanceof Float32Array) return src; return Float32Array.from(src); }
  async function fromState(state) {
    const width = state.shape?.width || state.size || GRID;
    const engine = new Engine(); engine.field = new FieldState(width, 0); engine.field.channels.fill(0);
    engine.field.sequence = state.sequence || 0; engine.field.time = state.time || 0; engine.field.dt = state.dt || 1;
    if (state.channels) CHANNEL_NAMES.forEach((name, c) => engine.field.channels.set(planeFromUnknown(state.channels[name], width), c * width * width));
    engine.sourceKind = state.source?.kind || "field";
    engine.sourceHash = state.source?.hash || await sourceHash(engine.sourceKind, new TextEncoder().encode(state.source?.id || "field"));
    await engine.snapshot(); return engine;
  }
  async function fromField(state) { return fromState(state); }
  async function fromImage(image, opts = {}) {
    const engine = new Engine(); const maps = sampleImage(image, opts.size || GRID, opts.offsetX, opts.offsetY);
    engine.setImage(image, maps, opts.bytes); engine.field.channels.fill(0); engine.field.sequence = 0; engine.field.time = 0;
    engine.field.imprint(maps, opts.imprint == null ? 1 : opts.imprint);
    if (opts.bytes) engine.sourceHash = await sourceHash("image", opts.bytes);
    await engine.commit({}, opts.settle == null ? 6 : opts.settle); return engine;
  }
  async function fromBytes(bytes) {
    const decoded = decodeCanonical(bytes); const plane = decoded.shape.width * decoded.shape.height;
    return fromState({ source: { kind: "canonical-bytes", id: "blob" }, shape: decoded.shape, channels: { matter: decoded.array.subarray(0, plane), energy: decoded.array.subarray(plane, 2 * plane), temperature: decoded.array.subarray(2 * plane, 3 * plane), information: decoded.array.subarray(3 * plane) }, sequence: decoded.sequence, time: decoded.time, dt: decoded.dt });
  }
  return { GRID, CHANNELS, CHANNEL_NAMES, STATE_VERSION, RMEME_SCHEMA, SIGIL_VERSION, FieldState, Sigil, Engine, sampleImage, project, sha256Hex, encodeCanonical, decodeCanonical, sourceHash, fromState, fromField, fromImage, fromBytes, rmemeObject, rmemeText, rmemeSVG, adapters: {} };
})();
