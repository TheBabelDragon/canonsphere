(() => {
  const GRID = 48;
  const CHANNELS = 4;
  const SIGIL_VERSION = "stereograph-sigil-v0.1";
  const CHANNEL_NAMES = ["matter", "energy", "temperature", "information"];

  const canvas = document.getElementById("sphere");
  const card = document.getElementById("card");
  const statusEl = document.getElementById("status");
  const ctx = canvas.getContext("2d");

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

  class FieldState {
    constructor(size = GRID, seed = 1337) {
      this.size = size;
      this.seed = seed;
      this.channels = new Float32Array(CHANNELS * size * size);
      this.sequence = 0;
      this.time = 0;
      this.dt = 1;
      const rng = mulberry32(seed >>> 0);
      const plane = size * size;
      for (let i = 0; i < plane; i++) this.channels[i] = gaussian(rng) * 0.08;
      for (let i = 0; i < plane; i++) this.channels[plane + i] = gaussian(rng) * 0.04;
    }

    idx(c, y, x) {
      return (c * this.size + y) * this.size + x;
    }

    inject(x, y, strength = 1, channel = 0) {
      if (x == null) x = (this.size / 2) | 0;
      if (y == null) y = (this.size / 2) | 0;
      const radius = Math.max(1, (2 + Math.abs(strength) * 2) | 0);
      const r2 = radius * radius;
      for (let yy = 0; yy < this.size; yy++) {
        for (let xx = 0; xx < this.size; xx++) {
          const d = (xx - x) * (xx - x) + (yy - y) * (yy - y);
          if (d <= r2) {
            this.channels[this.idx(channel, yy, xx)] += strength;
            this.channels[this.idx(3, yy, xx)] += Math.abs(strength) * 0.12;
          }
        }
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
            const lap =
              at(old, c, y - 1, x) +
              at(old, c, y + 1, x) +
              at(old, c, y, x - 1) +
              at(old, c, y, x + 1) -
              4 * center;
            neu[this.idx(c, y, x)] = center + 0.08 * lap;
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
        neu[i] = Math.min(4, Math.max(-4, matter));
        neu[plane + i] = Math.min(4, Math.max(-4, energy));
        neu[2 * plane + i] = Math.min(4, Math.max(-4, temperature));
        neu[3 * plane + i] = Math.min(4, Math.max(-4, information));
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
      let sum = 0;
      let sum2 = 0;
      for (let i = 0; i < x.length; i++) {
        sum += x[i];
        sum2 += x[i] * x[i];
      }
      const mean = sum / x.length;
      const variance = sum2 / x.length - mean * mean;
      let act = 0;
      let count = 0;
      for (let c = 0; c < CHANNELS - 1; c++) {
        for (let i = 0; i < plane; i++) {
          act += Math.abs(x[(c + 1) * plane + i] - x[c * plane + i]);
          count += 1;
        }
      }
      return {
        matter: meanAbs(0),
        energy: meanAbs(plane),
        temperature: meanAbs(2 * plane),
        information: meanAbs(3 * plane),
        variance,
        activity: act / Math.max(1, count),
      };
    }

    canonicalBytes() {
      const header = JSON.stringify({
        channels: CHANNELS,
        dt: this.dt,
        sequence: this.sequence,
        size: this.size,
        version: SIGIL_VERSION,
      });
      const head = new TextEncoder().encode(header);
      const payload = new Uint8Array(this.channels.buffer.slice(0));
      const out = new Uint8Array(head.length + payload.length);
      out.set(head, 0);
      out.set(payload, head.length);
      return out;
    }
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  class Sigil {
    constructor(stateHash, metrics) {
      this.stateHash = stateHash;
      this.metrics = metrics;
      this.seed = Number(BigInt("0x" + stateHash.slice(0, 16)));
      const rng = mulberry32(Number(BigInt(this.seed) % 4294967296n));
      this.rotation = rng() * Math.PI * 2;
      this.layers = 3 + ((rng() * 5) | 0);
      this.symmetry = 2 + ((rng() * 7) | 0);
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
    const sx = (2 * x) / denom;
    const sy = (2 * y) / denom;
    const sz = (r2 - 1) / denom;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return [c * sx - s * sy, s * sx + c * sy, sz];
  }

  class Engine {
    constructor() {
      this.field = new FieldState();
      this.lastTick = null;
    }

    async tick() {
      this.field.evolve();
      const hash = await sha256Hex(this.field.canonicalBytes());
      const metrics = this.field.metrics();
      const sigil = new Sigil(hash, metrics);
      this.lastTick = {
        sequence: this.field.sequence,
        time: this.field.time,
        stateHash: hash,
        metrics,
        sigil,
        stereograph: sigil.points.map(([x, y]) => project(x, y, sigil.rotation)),
      };
      return this.lastTick;
    }

    impinge() {
      const x = (Math.random() * GRID) | 0;
      const y = (Math.random() * GRID) | 0;
      const channel = (Math.random() * CHANNELS) | 0;
      this.field.inject(x, y, 1.5, channel);
    }

    verify() {
      if (!this.lastTick) return null;
      const expected = new Sigil(this.lastTick.stateHash, this.lastTick.metrics);
      return expected.seed === this.lastTick.sigil.seed;
    }
  }

  const engine = new Engine();
  let spin = 0.4;

  function rmemeText(tick, extra = "") {
    if (!tick) return "SYSTEM READY\n\nNo committed field tick.";
    const m = tick.metrics;
    const s = tick.sigil;
    return [
      "SEQ          " + tick.sequence,
      "TIME         " + tick.time.toFixed(2),
      "HASH         " + tick.stateHash.slice(0, 24),
      "",
      "MATTER       " + m.matter.toFixed(5),
      "ENERGY       " + m.energy.toFixed(5),
      "TEMPERATURE  " + m.temperature.toFixed(5),
      "INFORMATION  " + m.information.toFixed(5),
      "VARIANCE     " + m.variance.toFixed(5),
      "ACTIVITY     " + m.activity.toFixed(5),
      "",
      "SIGIL SEED   " + s.seed,
      "SYMMETRY     " + s.symmetry,
      "LAYERS       " + s.layers,
      "POINTS       " + s.points.length,
      extra,
    ].join("\n");
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#080812";
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.46;
    const cy = h * 0.52;
    const scale = Math.min(w, h) * 0.28;
    spin += 0.004;

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const x = Math.cos(a + spin * 0.2);
      const z = Math.sin(a + spin * 0.2);
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(x) * scale, scale * 0.35 + Math.abs(z) * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const tick = engine.lastTick;
    if (!tick) {
      requestAnimationFrame(draw);
      return;
    }

    const layers = tick.sigil.layers;
    for (let layer = 0; layer < layers; layer++) {
      const sc = 1 + layer * 0.12;
      const alpha = Math.max(0.12, 0.85 - layer * 0.12);
      ctx.beginPath();
      tick.stereograph.forEach((p, i) => {
        const x = p[0] * Math.cos(spin) - p[1] * Math.sin(spin);
        const y = p[0] * Math.sin(spin) + p[1] * Math.cos(spin);
        const z = p[2];
        const px = cx + x * scale * sc;
        const py = cy - (y * 0.35 + z * 0.85) * scale * sc;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = layer === 0 ? `rgba(201,184,255,${alpha})` : `rgba(126,231,255,${alpha * 0.7})`;
      ctx.lineWidth = layer === 0 ? 2 : 1;
      ctx.stroke();
    }
    requestAnimationFrame(draw);
  }

  async function afterTick() {
    card.textContent = rmemeText(engine.lastTick);
    statusEl.textContent = "SEQ " + engine.lastTick.sequence;
    statusEl.className = "";
  }

  document.getElementById("tick").onclick = async () => {
    await engine.tick();
    await afterTick();
  };
  document.getElementById("impinge").onclick = () => {
    engine.impinge();
    statusEl.textContent = "impinged " + CHANNEL_NAMES.join("/");
  };
  document.getElementById("burst").onclick = async () => {
    for (let i = 0; i < 10; i++) await engine.tick();
    await afterTick();
  };
  document.getElementById("verify").onclick = () => {
    const ok = engine.verify();
    if (ok == null) {
      statusEl.textContent = "NO TICK TO VERIFY";
      statusEl.className = "bad";
      return;
    }
    statusEl.textContent = "VERIFY " + (ok ? "PASS" : "FAIL");
    statusEl.className = ok ? "ok" : "bad";
    card.textContent = rmemeText(engine.lastTick, "\nREPLAY / SIGIL VERIFICATION: " + (ok ? "PASS" : "FAIL"));
  };

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
})();
