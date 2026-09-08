#!/usr/bin/env python3
"""
Launch CANONSPHERE from YAML.

    python launch.py
    python launch.py launch.yaml
    python launch.py launch.yaml --render
    python launch.py launch.yaml --no-rmeme

RMEME is the replay-identity card: hash, seed, symmetry, layers.
Same YAML + same seed + same impinges => same card.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError as exc:
    raise SystemExit("PyYAML is required: pip install -r requirements.txt") from exc

from sigil_engine import CHANNEL_NAMES, SigilRenderer, SystemsSigilEngine


def load_launch(path: Path) -> dict:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit("launch file must be a mapping")
    return data


def rmeme_card(tick) -> str:
    m = tick.metrics
    s = tick.sigil
    lines = [
        "┌────────────── RMEME ──────────────┐",
        "│ CANONSPHERE replay identity      │",
        "├──────────────────────────────────┤",
        "│ SEQ      {:>24} │".format(tick.sequence),
        "│ TIME     {:>24.2f} │".format(tick.time),
        "│ HASH     {:>24} │".format(tick.state_hash[:24]),
        "│ SEED     {:>24} │".format(s.seed),
        "│ SYM      {:>24} │".format(s.symmetry),
        "│ LAYERS   {:>24} │".format(s.layers),
        "│ POINTS   {:>24} │".format(len(s.points)),
        "├──────────────────────────────────┤",
        "│ matter        {:>19.5f} │".format(m["matter"]),
        "│ energy        {:>19.5f} │".format(m["energy"]),
        "│ temperature   {:>19.5f} │".format(m["temperature"]),
        "│ information   {:>19.5f} │".format(m["information"]),
        "│ variance      {:>19.5f} │".format(m["variance"]),
        "│ activity      {:>19.5f} │".format(m["activity"]),
        "└──────────────────────────────────┘",
    ]
    return "\n".join(lines)


def apply_impinges(engine: SystemsSigilEngine, spec) -> None:
    if not spec:
        return
    if isinstance(spec, dict):
        spec = [spec]
    for hit in spec:
        channel = hit.get("channel", 0)
        if isinstance(channel, str):
            channel = CHANNEL_NAMES.index(channel)
        engine.impinge(
            x=hit.get("x"),
            y=hit.get("y"),
            strength=float(hit.get("strength", 1.0)),
            channel=int(channel),
        )


def launch(cfg: dict, render: bool | None, show_rmeme: bool | None) -> int:
    engine_cfg = cfg.get("engine") or {}
    run_cfg = cfg.get("run") or {}

    engine = SystemsSigilEngine(
        size=int(engine_cfg.get("size", 48)),
        seed=int(engine_cfg.get("seed", 1337)),
    )
    engine.field.dt = float(engine_cfg.get("dt", 1.0))

    apply_impinges(engine, cfg.get("impinge"))

    ticks = int(run_cfg.get("ticks", 0))
    burst = int(run_cfg.get("burst", 0))
    for _ in range(ticks + burst):
        tick = engine.tick()
        print(
            "TICK %d | HASH %s | SIGIL %d"
            % (tick.sequence, tick.state_hash[:16], tick.sigil.seed)
        )

    if engine.last_tick is None:
        print("no committed field tick")
        return 1

    if run_cfg.get("verify", True):
        ok = engine.verify_tick(engine.last_tick)
        print("Verification:", ok)
        if not ok:
            return 2

    emit_rmeme = run_cfg.get("rmeme", True) if show_rmeme is None else show_rmeme
    if emit_rmeme:
        print()
        print(rmeme_card(engine.last_tick))

    do_render = run_cfg.get("render", False) if render is None else render
    if do_render:
        SigilRenderer(engine).render_matplotlib()

    identity = cfg.get("identity") or {}
    summary = {
        "arch": identity.get("arch", "CANONSPHERE"),
        "sequence": engine.last_tick.sequence,
        "state_hash": engine.last_tick.state_hash,
        "sigil": engine.last_tick.sigil.as_dict(),
        "metrics": engine.last_tick.metrics,
    }
    print()
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Launch CANONSPHERE from YAML")
    parser.add_argument(
        "config",
        nargs="?",
        default="launch.yaml",
        help="path to launch YAML (default: launch.yaml)",
    )
    parser.add_argument("--render", action="store_true", help="force matplotlib render")
    parser.add_argument("--no-render", action="store_true")
    parser.add_argument("--rmeme", action="store_true", help="force RMEME card")
    parser.add_argument("--no-rmeme", action="store_true")
    args = parser.parse_args(argv)

    path = Path(args.config)
    if not path.exists():
        raise SystemExit("missing launch file: %s" % path)

    render = True if args.render else (False if args.no_render else None)
    show_rmeme = True if args.rmeme else (False if args.no_rmeme else None)
    return launch(load_launch(path), render, show_rmeme)


if __name__ == "__main__":
    sys.exit(main())
