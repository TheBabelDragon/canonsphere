window.Canonsphere = (() => {
  const GRID = 48;
  const CHANNELS = 4;
  const SIGIL_VERSION = "stereograph-sigil-v0.1";

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rng) {
    const u = Math.max(rng(), 1e-12);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  class FieldState {
    constructor(size = GRID, seed = 1337) {
      this.size = size;
      this.seed = seed;
      this.channels = new Float32Array(CHANNELS * size * size);
      this.sequence = 0;
      this.time = 0;
      this.dt = 1;
      this.noise(seed);
    }
    noise(seed) {
      const rng = mulberry32(seed >>> 0);
      const plane = this.size * this.size;
      this.channels.fill(0);
      for (let i = 0; i < plane; i++) this.channels[i] = gaussian(rng) * 0.08;
      for (let i = 0; i < plane; i++) this.channels[plane + i] = gaussian(rng) * 0.04;
    }
    idx(c, y, x) { return (c * this.size + y) * this.size + x; }
    inject(x, y, strength = 1, channel = 0) {
      if (x == null) x = (this.size / 2) | 0;
      if (y == null) y = (this.size / 2) | 0;
      const radius = Math.max(1, (2 + Math.abs(strength) * 2) | 0);
      const r2 = radius * radius;
      for (let yy = 0; yy < this.size; yy++) {
        for (let xx = 0; xx < this.size; xx++) {
          if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= r2) {
            this.channels[this.idx(channel, yy, xx)] += strength;
            this.channels[this.idx(3, yy, xx)] += Math.abs(strength) * 0.12;
          }
        }
      }
    }
    imprint(maps, strength = 1) {
      const plane = this.size * this.size;
      const names = ["matter", "energy", "temperature", "information"];
      for (let c = 0; c < CHANNELS; c++) {
        const src = maps[names[c]];
        if (!src) continue;
        for (let i = 0; i < plane; i++) this.channels[c * plane + i] = src[i] * strength;
      }
    }
    evolve() {
      const n = this.size;
      const old = this.channels.slice();
      const neu = old.slice();
      const at = (src, c, y, x) => src[(c * n + ((y + n) % n)) * n + ((x + n) % n)];
      for (let c = 0; c < CHANNELS; c++) {
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const center = at(old, c, y, x);
            neu[this.idx(c, y, x)] = center + 0.08 * (
              at(old, c, y - 1, x) + at(old, c, y + 1, x) + at(old, c, y, x - 1) + at(old, c, y, x + 1) - 4 * center
            );
          }
        }
      }
      const plane = n * n;
      for (let i = 0; i < plane; i++) {
        let matter = neu[i];
        let energy = neu[plane + i];
        let temperature = neu[2 * plane + i];
        let information = neu[3 * plane + i];
        temperature += Math.abs(energy) * 0.015 - temperature * 0.025;
        energy += Math.abs(matter) * 0.008 - energy * 0.012;
        information += Math.abs(matter - energy) * 0.004 - information * 0.008;
        matter += Math.tanh(energy * 0.35) * 0.01;
        energy += Math.tanh(temperature * 0.25) * 0.01;
        neu[i] = clamp(matter, -4, 4);
        neu[plane + i] = clamp(energy, -4, 4);
        neu[2 * plane + i] = clamp(temperature, -4, 4);
        neu[3 * plane + i] = clamp(information, -4, 4);
      }
      this.channels = neu;
      this.sequence += 1;
      this.time += this.dt;
    }
    metrics() {
      const x = this.channels;
      const plane = this.size * this.size;
      const meanAbs = (off) => {
        let s = 0;
        for (let i = 0; i < plane; i++) s += Math.abs(x[off + i]);
        return s / plane;
      };
      let sum = 0, sum2 = 0;
      for (let i = 0; i < x.length; i++) { sum += x[i]; sum2 += x[i] * x[i]; }
      let act = 0, count = 0;
      for (let c = 0; c < CHANNELS - 1; c++) {
        for (let i = 0; i < plane; i++) {
          act += Math.abs(x[(c + 1) * plane + i] - x[c * plane + i]);
          count += 1;
        }
      }
      const mean = sum / x.length;
      return {
        matter: meanAbs(0), energy: meanAbs(plane),
        temperature: meanAbs(2 * plane), information: meanAbs(3 * plane),
        variance: sum2 / x.length - mean * mean,
        activity: act / Math.max(1, count),
      };
    }
    canonicalBytes() {
      const header = JSON.stringify({
        channels: CHANNELS, dt: this.dt, sequence: this.sequence,
        size: this.size, version: SIGIL_VERSION,
      });
      const head = new TextEncoder().encode(header);
      const payload = new Uint8Array(this.channels.buffer.slice(0));
      const out = new Uint8Array(head.length + payload.length);
      out.set(head, 0); out.set(payload, head.length);
      return out;
    }
    channelPlane(c) {
      const n = this.size;
      return this.channels.subarray(c * n * n, (c + 1) * n * n);
    }
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  class Sigil {
    constructor(stateHash, metrics, view = {}) {
      this.stateHash = stateHash;
      this.metrics = metrics;
      this.seed = Number(BigInt("0x" + stateHash.slice(0, 16)));
      const rng = mulberry32(Number(BigInt(this.seed) % 4294967296n));
      this.committed = {
        rotation: rng() * Math.PI * 2,
        layers: 3 + ((rng() * 5) | 0),
        symmetry: 2 + ((rng() * 7) | 0),
      };
      this.rotation = view.rotation != null ? view.rotation : this.committed.rotation;
      this.layers = view.layers != null ? view.layers : this.committed.layers;
      this.symmetry = view.symmetry != null ? view.symmetry : this.committed.symmetry;
      this.radius = 0.55 + metrics.activity * 3;
      this.points = this.derivePoints();
    }
    derivePoints() {
      const n = 24 + Math.min(60, (this.metrics.variance * 300) | 0);
      const pts = [];
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
    const r2 = x * x + y * y;
    const denom = r2 + 1;
    const sx = (2 * x) / denom, sy = (2 * y) / denom, sz = (r2 - 1) / denom;
    const c = Math.cos(rotation), s = Math.sin(rotation);
    return [c * sx - s * sy, s * sx + c * sy, sz];
  }

  function sampleImage(img, size, offsetX = 0.5, offsetY = 0.5) {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const g = c.getContext("2d");
    const side = Math.min(img.width, img.height);
    const sx = clamp(img.width * offsetX - side / 2, 0, img.width - side);
    const sy = clamp(img.height * offsetY - side / 2, 0, img.height - side);
    g.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    const pix = g.getImageData(0, 0, size, size).data;
    const luma = new Float32Array(size * size);
    const energy = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) {
      const r = pix[i * 4] / 255, gg = pix[i * 4 + 1] / 255, b = pix[i * 4 + 2] / 255;
      luma[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
      const chroma = Math.sqrt((r - gg) ** 2 + (gg - b) ** 2 + (b - r) ** 2);
      energy[i] = chroma * (0.35 + luma[i]);
    }
    const temperature = new Float32Array(size * size);
    const information = new Float32Array(size * size);
    const at = (x, y) => luma[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        temperature[i] = Math.abs(luma[i] - (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 4) * 8;
        const gx = at(x + 1, y) - at(x - 1, y);
        const gy = at(x, y + 1) - at(x, y - 1);
        information[i] = Math.sqrt(gx * gx + gy * gy) * 6;
      }
    }
    return {
      preview: c,
      matter: luma.map((v) => (v - 0.5) * 2.4),
      energy: energy.map((v) => v * 2.2),
      temperature,
      information,
    };
  }

  class Engine {
    constructor() {
      this.field = new FieldState();
      this.lastTick = null;
      this.source = null;
      this.maps = null;
    }
    setImage(img, maps) { this.source = img; this.maps = maps; }
    async commit(view = {}, settle = 6) {
      for (let i = 0; i < settle; i++) this.field.evolve();
      return this.snapshot(view);
    }
    async snapshot(view = {}) {
      const hash = await sha256Hex(this.field.canonicalBytes());
      const metrics = this.field.metrics();
      const sigil = new Sigil(hash, metrics, view);
      this.lastTick = {
        sequence: this.field.sequence, time: this.field.time, stateHash: hash,
        metrics, sigil,
        stereograph: sigil.points.map(([x, y]) => project(x, y, sigil.rotation)),
      };
      return this.lastTick;
    }
    verify() {
      if (!this.lastTick) return null;
      return new Sigil(this.lastTick.stateHash, this.lastTick.metrics).seed === this.lastTick.sigil.seed;
    }
  }

  return { GRID, CHANNELS, FieldState, Sigil, Engine, sampleImage, project, sha256Hex };
})();
