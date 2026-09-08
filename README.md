# CANONSPHERE

**CANONSPHERE is a witness layer.**
It accepts canonical state from external systems and produces:

canonical bytes → state hash → deterministic sigil → stereographic projection

It does not own or mutate the source system.

Live: [https://thebabeldragon.github.io/canonsphere/](https://thebabeldragon.github.io/canonsphere/)

```
field-os ─────────┐
metafield ────────├
signal-processor ─├
by-light ─────────├
swarm ────────────├
image ────────────├
artifact ─────────┘
          ↓
     CANONSPHERE
          ↓
   identity / sigil
```

Adapters depend on the core. The core never depends on field-os, metafield, swarm, or any source repo.

## Public API

Everything enters through the same door:

```js
Canonsphere.fromState(state)
Canonsphere.fromField(state)
Canonsphere.fromImage(image)
Canonsphere.fromBytes(bytes)
Canonsphere.fromFieldTick(tick)     // adapters/field_os.js
Canonsphere.fromWorldState(world)   // adapters/metafield.js
Canonsphere.fromSignal(samples)     // adapters/signal.js
Canonsphere.fromArtifact(bytes)     // adapters/artifact.js
Canonsphere.fromSwarm(snapshot)     // adapters/swarm.js
```

Every source reduces to `canonical-state-v0.1` (`schema/canonical-state-v0.1.json`).

```js
{
  version: "canonical-state-v0.1",
  source: { kind: "field-tick", id: "..." },
  shape: { width: 48, height: 48, channels: 4 },
  channels: { matter, energy, temperature, information },
  sequence: 42,
  time: 42,
  dt: 1
}
```

## Two hashes

```
SOURCE HASH   artifact / image / tick id
    ↓
FIELD INITIALIZATION
    ↓
STATE HASH    canonical-state-v0.1 bytes
    ↓
SIGIL
```

That distinction is the point:

- “this image produced this field”
- “this field at tick 42 has this identity”

RMEME v0.2 carries both. The sigil does not replace the source hash.

```
SOURCE    sha256:abcd...
STATE     sha256:91ef...
SIGIL     seed:...
TICK      042
```

## Binary contract

`CNS1` little-endian header + IEEE-754 float32 payload.

- channel order: matter, energy, temperature, information
- cell order: y-major, x-minor
- NaN → 0, +Inf → 1, -Inf → -1
- header is exactly 40 bytes

Python: `canonical.py`
JS: `pages/engine.js` (`encodeCanonical` / `decodeCanonical`)

Cross-runtime vectors:

- `tests/vectors/canonical-2x2.hex`
- `tests/vectors/swarm-2x2.hex`

```bash
python -m pytest tests/test_canonical.py
node tests/test_js_vector.mjs
```

## VERIFY

Recanonicalize current field, rehash, re-derive sigil, reproject geometry.

```
CANONICAL BYTES   PASS
STATE HASH        PASS
SIGIL             PASS
STEREOGRAPH       PASS
```

TAMPER flips one float and expects STATE HASH / SIGIL to fail.

## RMEME v0.2

Interchange object, not just a card.

```js
{
  schema: "rmeme-v0.2",
  source_hash, state_hash, sequence, time,
  field, metrics, sigil, stereograph
}
```

EXPORT writes `.txt` `.json` `.svg` `.png`.

## Adapters

| source | adapter | entry |
|---|---|---|
| field-os FieldTick | `adapters/field_os.js` | `fromFieldTick` |
| metafield world | `adapters/metafield.js` | `fromWorldState` |
| signal / sensors | `adapters/signal.js` | `fromSignal` |
| content-addressed bytes | `adapters/artifact.js` | `fromArtifact` |
| swarm snapshot | `adapters/swarm.js` | `fromSwarm` |
| image | core | `fromImage` |

CANONSPHERE witnesses. It does not mutate the source system.
