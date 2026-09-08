# CANONSPHERE

**Field state → canonical bytes → state hash → deterministic sigil → stereographic system glyph.**

Live: [https://thebabeldragon.github.io/canonsphere/](https://thebabeldragon.github.io/canonsphere/)

CANONSPHERE is a small experimental architecture for turning a living multi-channel field into a *replayable identity*. Same field state always yields the same hash, the same seed, and the same stereographic sigil. The glyph is not decoration; it is a projection of state.

This repo is a standalone sample originally written for Pythonista / iOS, with a headless fallback for ordinary CPython and a browser witness on GitHub Pages.

## Launch from YAML

```bash
pip install -r requirements.txt
python launch.py
python launch.py launch.yaml --render
```

`launch.yaml` is the boot surface: seed, grid, ticks, impinges, verify, render, RMEME.

```yaml
engine:
  size: 48
  seed: 1337
run:
  ticks: 8
  verify: true
  rmeme: true
impinge:
  - strength: 2.0
    channel: 0
```

## RMEME

RMEME is the replay-identity card. It is not a joke file. It is the last committed tick compressed into a shareable block: sequence, hash prefix, sigil seed, symmetry, layers, channel metrics.

Same YAML + same seed + same impinges ⇒ same card. If the card changes, the field changed.

```
python launch.py launch.yaml --rmeme
```

The `.io` page is the same card next to a live stereograph. Browser field init uses a JS PRNG, so hashes are self-consistent in the page, not bit-identical with CPython / NumPy.

## Architecture

```
launch.yaml
    |
    v
FieldState (matter, energy, temperature, information)
        |
        |  evolve / impinge
        v
canonical header + float32 payload
        |
        |  SHA-256
        v
state hash  ──►  Sigil (seed, symmetry, layers, points)
                        |
                        +── RMEME card
                        |
                        |  inverse stereographic map
                        v
                 unit-sphere glyph
```

### Why this shape

1. **Canonicalization first.** NaN/Inf are normalized, arrays are contiguous float32, and a sorted JSON header is prepended. Hashing is well-defined.
2. **Identity is the hash.** The sigil seed is the first 64 bits of SHA-256. Verification is just: re-derive the sigil from `(state_hash, metrics)` and compare seeds.
3. **Geometry is a witness.** Points live on the plane, then ride the Riemann / stereographic map onto the sphere so the glyph has a north-pole topology instead of a flat doodle.
4. **History is a ring.** The last 128 ticks are kept so a sequence can be replayed and checked.
5. **YAML is the launch.** The engine is not configured in code for a run. The run is a document.

Channels:

| index | name          | role                                      |
|------:|---------------|-------------------------------------------|
| 0     | matter        | mass-like density, initial noise          |
| 1     | energy        | couples into temperature and reaction     |
| 2     | temperature   | damped accumulation of |energy|           |
| 3     | information   | written by injections and field mismatch  |

## Run without YAML

```bash
python sigil_engine.py
```

Headless mode prints tick sequence, truncated hash, and sigil seed, then verifies the last tick.

On [Pythonista](http://omz-software.com/pythonista/) the same file opens a dark UI:

- Advance field tick
- Impinge system (random injection)
- 10-tick evolution burst
- Render stereograph sigil (matplotlib 3D)
- Verify sigil / replay identity

## Core objects

| class                 | job                                              |
|-----------------------|--------------------------------------------------|
| `FieldState`          | grid, coupling, inject, canonical bytes, hash    |
| `Sigil`               | hash → seed → rotation / symmetry / points       |
| `Stereograph`         | plane → unit sphere, optional Z rotation         |
| `FieldTick`           | immutable snapshot of one committed step         |
| `SystemsSigilEngine`  | evolve, impinge, history, verify                 |
| `SigilRenderer`       | 3D matplotlib glyph + sphere wireframe           |

Babel contract lives in `.babel/`.

## Verify identity

```python
from sigil_engine import SystemsSigilEngine

engine = SystemsSigilEngine(seed=1337)
engine.impinge(strength=2.0, channel=0)
engine.tick()
assert engine.verify_tick(engine.last_tick)
```

If this assertion fails, the hash→sigil map is broken. That is the whole contract.

## License

MIT. Experimental. Not a production crypto primitive — SHA-256 is used as a *deterministic identity function* for field snapshots, not as a security boundary.
