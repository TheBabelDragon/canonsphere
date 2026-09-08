# CANONSPHERE

**CANONSPHERE is a witness layer.**
It accepts canonical state from external systems and produces:

canonical bytes → state hash → deterministic sigil → stereographic projection

It does not own or mutate the source system.

Live: [https://thebabeldragon.github.io/canonsphere/](https://thebabeldragon.github.io/canonsphere/)

```
field-os ─────────┐
metafield ────────┤
signal-processor ─┤
by-light ────────┤
swarm ──────────┤
image ──────────┤
artifact ────────┘
          ↓
     CANONSPHERE
          ↓
   identity / sigil
```

Adapters depend on the core. The core never depends on field-os, metafield, or any source repo.

## Public API

```js
Canonsphere.fromState(state)
Canonsphere.fromField(state)
Canonsphere.fromImage(image)
Canonsphere.fromBytes(bytes)
Canonsphere.fromFieldTick(tick)   // adapters/field_os.js
Canonsphere.fromSignal(samples)   // adapters/signal.js
Canonsphere.fromArtifact(bytes)   // adapters/artifact.js
```

Every source reduces to `canonical-state-v0.1` (`schema/canonical-state-v0.1.json`).

## Two hashes

```
SOURCE HASH   artifact / image / tick id
    ↓
FIELD
    ↓
STATE HASH    canonical-state-v0.1 bytes
    ↓
SIGIL
```

RMEME v0.2 carries both. The sigil does not replace the source hash.

## Binary contract

`CNS1` little-endian header + IEEE-754 float32 payload.

- channel order: matter, energy, temperature, information
- cell order: y-major, x-minor
- NaN → 0, +Inf → 1, -Inf → -1

Python: `canonical.py`
JS: `pages/engine.js` (`encodeCanonical` / `decodeCanonical`)

Cross-runtime vector: `tests/vectors/canonical-2x2.hex`

```bash
python -m pytest tests/test_canonical.py
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

Interchange object, not just a card. EXPORT writes `.txt` `.json` `.svg` `.png`.
