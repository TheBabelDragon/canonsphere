import hashlib
import pathlib
import struct
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from canonical import HEADER_SIZE, decode, encode, state_hash


def test_header_size():
    assert struct.calcsize("<4sHHHH f q d BBBB I") == HEADER_SIZE


def test_roundtrip_and_known_vector():
    ch = np.zeros((4, 2, 2), np.float32)
    ch[0, 0, 0] = 1.0
    ch[1, 0, 1] = -0.5
    ch[2, 1, 0] = 0.25
    ch[3, 1, 1] = 2.0
    blob = encode(ch, width=2, height=2, sequence=42, time=42.0, dt=1.0)
    assert blob[:4] == b"CNS1"
    assert len(blob) == 40 + 4 * 2 * 2 * 4
    got = decode(blob)
    assert got["sequence"] == 42
    assert got["array"][0, 0, 0] == 1.0
    digest = state_hash(blob)
    expected = "7ee2b772f1c6c7bf4b643e41c6dff0d3225f18202ef59c1a1a2d0dd465eb7a2c"
    assert digest == expected
    hex_path = ROOT / "tests" / "vectors" / "canonical-2x2.hex"
    assert hex_path.read_text().strip() == blob.hex()


def test_nan_normalized():
    ch = np.zeros((4, 1, 1), np.float32)
    ch[0, 0, 0] = np.nan
    blob = encode(ch, width=1, height=1)
    assert decode(blob)["array"][0, 0, 0] == 0.0


def test_tamper_changes_hash():
    ch = np.zeros((4, 2, 2), np.float32)
    a = encode(ch, width=2, height=2, sequence=1)
    ch[0, 0, 0] += 0.001
    b = encode(ch, width=2, height=2, sequence=1)
    assert hashlib.sha256(a).digest() != hashlib.sha256(b).digest()
