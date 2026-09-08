# CANONSPHERE

**image → field → canonical identity → stereograph**

Live: [https://thebabeldragon.github.io/canonsphere/](https://thebabeldragon.github.io/canonsphere/)

Drop an image. It is sampled onto a four-channel field, canonicalized, hashed, and projected as a stereographic sigil. One pixel changes the identity.

```
IMAGE
  ↓
sample / normalize
  ↓
FIELD
  ├─ luminance → matter
  ├─ color energy → energy
  ├─ local contrast → temperature
  └─ edges / structure → information
  ↓
SHA-256 → deterministic sigil → stereograph
```

The public page is **LOAD → GENERATE → INTERACT → VERIFY → EXPORT**.
Modes: IMAGE, FIELD, PLANE, SPHERE, COMPARE, plus a morph slider across the four stages.
Tick / impinge / burst stay under Field Controls.

Same image + same FIELD imprint + same settle ticks ⇒ same hash in the browser.
Rotation / symmetry / layers sliders are view overrides after commit; VERIFY still checks hash → seed.
EXPORT writes an RMEME card and a PNG of the current glyph.

Python / YAML / Pythonista remain the local engine. The `.io` page is the public witness, not a bit-identical CPython replica (JS PRNG ≠ NumPy).

## Launch from YAML

```bash
pip install -r requirements.txt
python launch.py launch.yaml --rmeme
```

## License

MIT. Experimental. SHA-256 here is a deterministic identity function for field snapshots, not a security boundary.
