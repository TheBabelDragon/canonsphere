/* Overlay: keep core visuals, fix the identity contract. */
(function (C) {
  if (!C) throw new Error("Canonsphere core must load first");

  function concatBytes(parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  C.sourceHash = async function sourceHash(kind, payload) {
    const enc = new TextEncoder();
    const body = payload instanceof Uint8Array ? payload : enc.encode(String(payload));
    const framed = concatBytes([
      enc.encode("CNS1SRC"),
      new Uint8Array([0]),
      enc.encode(String(kind)),
      new Uint8Array([0]),
      body,
    ]);
    return C.sha256Hex(framed);
  };

  C.formatVerify = function formatVerify(report) {
    if (!report) return "NO TICK TO VERIFY";
    const line = (name, ok) => name.padEnd(17) + (ok ? "PASS" : "FAIL");
    return [
      line("CANONICAL BYTES", report.canonical_bytes),
      line("STATE HASH", report.state_hash),
      line("SIGIL", report.sigil),
      line("STEREOGRAPH", report.stereograph),
    ].join("\n");
  };

  const proto = C.Engine.prototype;
  const setImage = proto.setImage;
  proto.setImage = function (img, maps, rawBytes) {
    setImage.call(this, img, maps, rawBytes);
    this.sourceHash = null;
  };

  const snapshot = proto.snapshot;
  proto.snapshot = async function (view) {
    if (this.sourceKind && !this.sourceHash) {
      this.sourceHash = await C.sourceHash(
        this.sourceKind,
        this.sourceBytes || new TextEncoder().encode(this.sourceKind)
      );
    }
    return snapshot.call(this, view);
  };
})(window.Canonsphere);
