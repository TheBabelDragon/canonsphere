import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEADER_SIZE = 40;

function encode({ channels, width, height, sequence, time, dt }) {
  const n = 4 * height * width;
  const out = new ArrayBuffer(HEADER_SIZE + n * 4);
  const view = new DataView(out);
  view.setUint8(0, 0x43);
  view.setUint8(1, 0x4e);
  view.setUint8(2, 0x53);
  view.setUint8(3, 0x31);
  view.setUint16(4, 1, true);
  view.setUint16(6, 4, true);
  view.setUint16(8, width, true);
  view.setUint16(10, height, true);
  view.setFloat32(12, dt, true);
  view.setBigInt64(16, BigInt(sequence), true);
  view.setFloat64(24, time, true);
  view.setUint8(32, 0);
  view.setUint8(33, 0);
  view.setUint8(34, 0);
  view.setUint8(35, 0);
  view.setUint32(36, n * 4, true);
  for (let i = 0; i < n; i++) view.setFloat32(HEADER_SIZE + i * 4, channels[i], true);
  return new Uint8Array(out);
}

function sourceHash(kind, payload) {
  const framed = Buffer.concat([
    Buffer.from("CNS1SRC"),
    Buffer.from([0]),
    Buffer.from(kind),
    Buffer.from([0]),
    Buffer.from(payload),
  ]);
  return createHash("sha256").update(framed).digest("hex");
}

const ch = new Float32Array(16);
ch[0] = 1.0;
ch[5] = -0.5;
ch[10] = 0.25;
ch[15] = 2.0;
const blob = encode({ channels: ch, width: 2, height: 2, sequence: 42, time: 42.0, dt: 1.0 });
const hex = Buffer.from(blob).toString("hex");
const expected = readFileSync(join(ROOT, "tests/vectors/canonical-2x2.hex"), "utf8").trim();
if (hex !== expected) {
  console.error("JS/Python canonical bytes diverge");
  console.error("js ", hex);
  console.error("py ", expected);
  process.exit(1);
}
const digest = createHash("sha256").update(blob).digest("hex");
if (digest !== "7ee2b772f1c6c7bf4b643e41c6dff0d3225f18202ef59c1a1a2d0dd465eb7a2c") {
  console.error("state hash mismatch", digest);
  process.exit(1);
}
const src = sourceHash("image", "hello");
if (src !== "98edacb1641111563119e179840173bc7aaa1e99bf1a1db0a6dc47a916aa50ca") {
  console.error("source hash mismatch", src);
  process.exit(1);
}
console.log("js vector ok", digest.slice(0, 16));
