"""
CANONSPHERE canonical-state-v0.1 binary contract.

Layout (little-endian):

  0-3    MAGIC            b"CNS1"
  4-5    VERSION          u16 = 1
  6-7    CHANNELS         u16
  8-9    WIDTH            u16
  10-11  HEIGHT           u16
  12-15  DT               f32
  16-23  SEQUENCE         i64
  24-31  TIME             f64
  32     CHANNEL_ORDER    u8  0 = matter,energy,temperature,information
  33     FLOAT_FORMAT     u8  0 = IEEE-754 float32
  34     ENDIANNESS       u8  0 = little
  35     CELL_ORDER       u8  0 = y-major, x-minor
  36-39  PAYLOAD_BYTES    u32
  40+    PAYLOAD          C*H*W float32 LE, channel-major

NaN -> 0, +Inf -> 1, -Inf -> -1 before packing.
"""

from __future__ import annotations

import hashlib
import struct
from typing import Any

import numpy as np

MAGIC = b"CNS1"
VERSION = 1
HEADER_SIZE = 40
CHANNEL_NAMES = ("matter", "energy", "temperature", "information")
CHANNEL_ORDER = 0
FLOAT_FORMAT = 0
ENDIANNESS = 0
CELL_ORDER = 0


def normalize_f32(a: np.ndarray) -> np.ndarray:
    x = np.asarray(a, dtype=np.float32)
    x = np.nan_to_num(x, nan=0.0, posinf=1.0, neginf=-1.0)
    return np.ascontiguousarray(x)


def encode(
    channels: np.ndarray,
    *,
    width: int,
    height: int,
    sequence: int = 0,
    time: float = 0.0,
    dt: float = 1.0,
    n_channels: int = 4,
) -> bytes:
    payload = normalize_f32(channels).reshape(n_channels, height, width).tobytes()
    header = struct.pack(
        "<4sHHHH f q d BBBB I",
        MAGIC,
        VERSION,
        n_channels,
        width,
        height,
        float(dt),
        int(sequence),
        float(time),
        CHANNEL_ORDER,
        FLOAT_FORMAT,
        ENDIANNESS,
        CELL_ORDER,
        len(payload),
    )
    if len(header) != HEADER_SIZE:
        raise RuntimeError("header size drifted: %d" % len(header))
    return header + payload


def decode(blob: bytes) -> dict[str, Any]:
    if len(blob) < HEADER_SIZE or blob[:4] != MAGIC:
        raise ValueError("not a CANONSPHERE canonical blob")
    (
        _magic,
        version,
        n_channels,
        width,
        height,
        dt,
        sequence,
        time,
        channel_order,
        float_format,
        endianness,
        cell_order,
        payload_bytes,
    ) = struct.unpack("<4sHHHH f q d BBBB I", blob[:HEADER_SIZE])
    if version != VERSION:
        raise ValueError("unsupported version %s" % version)
    if (channel_order, float_format, endianness, cell_order) != (
        CHANNEL_ORDER,
        FLOAT_FORMAT,
        ENDIANNESS,
        CELL_ORDER,
    ):
        raise ValueError("unsupported layout flags")
    payload = blob[HEADER_SIZE : HEADER_SIZE + payload_bytes]
    arr = np.frombuffer(payload, dtype="<f4").reshape(n_channels, height, width).copy()
    return {
        "version": "canonical-state-v0.1",
        "shape": {"width": width, "height": height, "channels": n_channels},
        "channels": {CHANNEL_NAMES[i]: arr[i] for i in range(n_channels)},
        "sequence": sequence,
        "time": time,
        "dt": dt,
        "array": arr,
    }


def state_hash(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def source_hash(kind: str, payload: bytes) -> str:
    h = hashlib.sha256()
    h.update(b"CNS1SRC\x00")
    h.update(kind.encode("utf-8"))
    h.update(b"\x00")
    h.update(payload)
    return h.hexdigest()
