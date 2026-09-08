(() => {
  const { GRID, Engine, sampleImage, project } = window.Canonsphere;
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const file = document.getElementById("file");
  const drop = document.getElementById("drop");
  const progress = document.getElementById("progress");
  const progLabel = document.getElementById("prog-label");
  const progBar = document.getElementById("prog-bar");
  const card = document.getElementById("card");
  const statusEl = document.getElementById("status");
  const engine = new Engine();
  let mode = "sphere";
  let morph = 3;
  let spin = 0.35;
  let dragging = false;
  let lastX = 0;
  let imageBitmap = null;
  const view = { rotation: 0, symmetry: 4, layers: 4, imprint: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
  }
  function setStatus(text, kind = "") {
    statusEl.textContent = text;
    statusEl.className = kind;
  }
  function rmeme(extra = "") {
    const tick = engine.lastTick;
    if (!tick) return "Drop an image to commit a sigil.";
    const m = tick.metrics;
    const s = tick.sigil;
    return [
      "SIGIL COMMITTED",
      "SEQ       " + String(tick.sequence).padStart(3, "0"),
      "SHA256    " + tick.stateHash.slice(0, 16) + "...",
      "SEED      " + s.seed,
      "SYMMETRY  " + s.symmetry,
      "LAYERS    " + s.layers,
      "POINTS    " + s.points.length,
      "",
      "MATTER    " + m.matter.toFixed(5),
      "ENERGY    " + m.energy.toFixed(5),
      "TEMP      " + m.temperature.toFixed(5),
      "INFO      " + m.information.toFixed(5),
      extra,
    ].join("\n");
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function stage(label, pct) {
    progress.hidden = false;
    progLabel.textContent = label;
    progBar.style.width = pct + "%";
    await sleep(90);
  }
  function hideDrop() { drop.classList.add("hidden"); }

  async function ingestFile(blob) {
    await stage("LOADING", 20);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    imageBitmap = img;
    await stage("SAMPLING", 45);
    engine.setImage(img, sampleImage(img, GRID));
    await generate(true);
    URL.revokeObjectURL(url);
  }

  async function generate(fromImage) {
    hideDrop();
    await stage("CANONICALIZING", 70);
    if (fromImage && engine.maps) {
      engine.field.channels.fill(0);
      engine.field.sequence = 0;
      engine.field.time = 0;
      engine.field.imprint(engine.maps, view.imprint);
    }
    await stage("HASHING", 88);
    const tick = await engine.commit({}, fromImage ? 6 : 1);
    view.rotation = tick.sigil.committed.rotation;
    view.symmetry = tick.sigil.committed.symmetry;
    view.layers = tick.sigil.committed.layers;
    syncSliders();
    applyView();
    await stage("SIGIL COMMITTED", 100);
    await sleep(180);
    progress.hidden = true;
    card.textContent = rmeme();
    setStatus("HASH " + tick.stateHash.slice(0, 8) + "\u2026");
  }

  function applyView() {
    if (!engine.lastTick) return;
    const tick = engine.lastTick;
    tick.sigil = new window.Canonsphere.Sigil(tick.stateHash, tick.metrics, view);
    tick.stereograph = tick.sigil.points.map(([x, y]) => project(x, y, tick.sigil.rotation));
    card.textContent = rmeme();
  }
  function syncSliders() {
    document.getElementById("rotation").value = Math.round(view.rotation * 100);
    document.getElementById("symmetry").value = view.symmetry;
    document.getElementById("layers").value = view.layers;
    document.getElementById("imprint").value = Math.round(view.imprint * 100);
  }
  function heat(v) {
    const t = Math.max(0, Math.min(1, (v + 1.2) / 2.8));
    return [Math.round(40 + t * 180), Math.round(50 + t * 80), Math.round(90 + (1 - t) * 140)];
  }
  function drawImageCover(img, x, y, w, h, alpha) {
    if (!img) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const side = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, x, y, w, h);
    ctx.restore();
  }
  function drawField(w, h, alpha) {
    const n = GRID;
    const cell = Math.max(1, Math.floor(Math.min(w, h) / (n * 2)));
    const tile = n * cell;
    const ox = (w - tile * 2) / 2;
    const oy = (h - tile * 2) / 2;
    ctx.globalAlpha = alpha;
    for (let c = 0; c < 4; c++) {
      const plane = engine.field.channelPlane(c);
      const imgd = ctx.createImageData(n, n);
      for (let i = 0; i < n * n; i++) {
        const [r, g, b] = heat(plane[i]);
        imgd.data.set([r, g, b, 255], i * 4);
      }
      const tmp = document.createElement("canvas");
      tmp.width = n; tmp.height = n;
      tmp.getContext("2d").putImageData(imgd, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, ox + (c % 2) * tile, oy + Math.floor(c / 2) * tile, tile, tile);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#8b8ba8";
    ctx.font = "10px ui-monospace, monospace";
    ["MATTER", "ENERGY", "TEMP", "INFO"].forEach((name, c) => {
      ctx.fillText(name, ox + (c % 2) * tile + 6, oy + Math.floor(c / 2) * tile + 14);
    });
  }
  function drawPlane(cx, cy, scale, alpha) {
    const tick = engine.lastTick;
    if (!tick) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(201,184,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    tick.sigil.points.forEach(([x, y], i) => {
      const px = cx + x * scale, py = cy + y * scale;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
  }
  function drawSphere(cx, cy, scale, alpha) {
    const tick = engine.lastTick;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + spin * 0.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(Math.cos(a)) * scale, scale * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (tick) {
      for (let layer = 0; layer < tick.sigil.layers; layer++) {
        const sc = 1 + layer * 0.1;
        const a = Math.max(0.12, 0.9 - layer * 0.12);
        ctx.beginPath();
        tick.stereograph.forEach((p, i) => {
          const x = p[0] * Math.cos(spin) - p[1] * Math.sin(spin);
          const y = p[0] * Math.sin(spin) + p[1] * Math.cos(spin);
          const px = cx + x * scale * sc;
          const py = cy - (y * 0.32 + p[2] * 0.86) * scale * sc;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        });
        ctx.strokeStyle = layer === 0 ? `rgba(201,184,255,${a})` : `rgba(126,231,255,${a * 0.7})`;
        ctx.lineWidth = layer === 0 ? 2.2 : 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function draw() {
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = "#080812";
    ctx.fillRect(0, 0, w, h);
    spin += dragging ? 0 : 0.0035;
    const cx = w * 0.5, cy = h * 0.5, scale = Math.min(w, h) * 0.26;
    if (mode === "compare") {
      drawImageCover(imageBitmap, w * 0.06, h * 0.22, w * 0.38, h * 0.52, 1);
      drawSphere(w * 0.72, cy, scale * 0.9, 1);
    } else if (mode === "image") drawImageCover(imageBitmap, w * 0.22, h * 0.18, w * 0.56, h * 0.56, 1);
    else if (mode === "field") drawField(w, h, 1);
    else if (mode === "plane") drawPlane(cx, cy, scale * 1.3, 1);
    else if (mode === "sphere") drawSphere(cx, cy, scale, 1);
    else {
      const t = morph;
      if (t < 1) { drawImageCover(imageBitmap, w * 0.22, h * 0.18, w * 0.56, h * 0.56, 1 - t); drawField(w, h, t); }
      else if (t < 2) { drawField(w, h, 2 - t); drawPlane(cx, cy, scale * 1.3, t - 1); }
      else { drawPlane(cx, cy, scale * 1.3, 3 - t); drawSphere(cx, cy, scale, t - 2); }
    }
    requestAnimationFrame(draw);
  }
  function setMode(next) {
    mode = next;
    document.querySelectorAll("#modes button").forEach((b) => b.classList.toggle("on", b.dataset.mode === next));
    if (next === "image") morph = 0;
    if (next === "field") morph = 1;
    if (next === "plane") morph = 2;
    if (next === "sphere") morph = 3;
    document.getElementById("morph").value = Math.round(morph * 100);
  }
  document.querySelectorAll("#modes button").forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
  document.getElementById("morph").oninput = (e) => {
    morph = Number(e.target.value) / 100;
    mode = "flow";
    document.querySelectorAll("#modes button").forEach((b) => b.classList.remove("on"));
  };
  document.getElementById("rotation").oninput = (e) => { view.rotation = Number(e.target.value) / 100; applyView(); };
  document.getElementById("symmetry").oninput = (e) => { view.symmetry = Number(e.target.value); applyView(); };
  document.getElementById("layers").oninput = (e) => { view.layers = Number(e.target.value); applyView(); };
  document.getElementById("imprint").oninput = (e) => { view.imprint = Number(e.target.value) / 100; };
  const openFile = () => file.click();
  document.getElementById("load").onclick = openFile;
  document.getElementById("load-empty").onclick = openFile;
  file.onchange = () => { if (file.files[0]) ingestFile(file.files[0]); };
  document.getElementById("generate").onclick = () => generate(Boolean(engine.maps));
  document.getElementById("verify").onclick = () => {
    const ok = engine.verify();
    if (ok == null) return setStatus("NO TICK TO VERIFY", "bad");
    setStatus("VERIFY " + (ok ? "PASS" : "FAIL"), ok ? "ok" : "bad");
    card.textContent = rmeme("\nVERIFICATION  " + (ok ? "PASS" : "FAIL"));
  };
  document.getElementById("export").onclick = () => {
    if (!engine.lastTick) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rmeme("\nARCH  CANONSPHERE")], { type: "text/plain" }));
    a.download = "rmeme-" + engine.lastTick.stateHash.slice(0, 12) + ".txt";
    a.click();
    const shot = document.createElement("a");
    shot.href = canvas.toDataURL("image/png");
    shot.download = "canonsphere-" + engine.lastTick.stateHash.slice(0, 12) + ".png";
    shot.click();
    setStatus("exported RMEME + glyph");
  };
  async function snap() {
    await engine.snapshot(view);
    card.textContent = rmeme();
    setStatus("SEQ " + engine.lastTick.sequence);
  }
  document.getElementById("tick").onclick = async () => { engine.field.evolve(); await snap(); };
  document.getElementById("impinge").onclick = async () => {
    engine.field.inject((Math.random() * GRID) | 0, (Math.random() * GRID) | 0, 1.5, (Math.random() * 4) | 0);
    await snap();
    setStatus("impinged");
  };
  document.getElementById("burst").onclick = async () => {
    for (let i = 0; i < 10; i++) engine.field.evolve();
    await snap();
  };
  document.getElementById("randomize").onclick = async () => {
    if (imageBitmap) {
      engine.setImage(imageBitmap, sampleImage(imageBitmap, GRID, Math.random(), Math.random()));
      await generate(true);
    } else {
      engine.field.noise((Math.random() * 1e9) | 0);
      engine.field.sequence = 0;
      await generate(false);
    }
  };
  document.getElementById("random-empty").onclick = async () => {
    hideDrop();
    engine.field.noise((Math.random() * 1e9) | 0);
    await generate(false);
  };
  window.addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("drag"); drop.classList.remove("hidden"); });
  window.addEventListener("dragleave", () => document.body.classList.remove("drag"));
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    document.body.classList.remove("drag");
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) ingestFile(f);
  });
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (dragging) { spin += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  window.addEventListener("resize", resize);
  resize();
  syncSliders();
  requestAnimationFrame(draw);
})();
