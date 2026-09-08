# Stereograph Systems Sigil Engine
# Pythonista / iOS — standalone experimental sample
#
# Architecture: CANONSPHERE
#   Field state -> canonical bytes -> state hash -> deterministic sigil
#   -> stereographic geometry -> rendered system glyph
#
# No external dependencies beyond NumPy + Pythonista's optional ui.

import hashlib
import json
import math
import random
import time
from collections import deque

import numpy as np

try:
    import ui
    PYTHONISTA = True
except ImportError:
    PYTHONISTA = False


# ============================================================
# CONFIG
# ============================================================

GRID = 48
HISTORY = 128
CHANNELS = 4

CHANNEL_NAMES = [
    "matter",
    "energy",
    "temperature",
    "information",
]

SIGIL_VERSION = "stereograph-sigil-v0.1"


# ============================================================
# CANONICAL / HASHING
# ============================================================

def canonical_float_array(a):
    """
    Canonical float32 representation.
    NaN/Inf are normalized so hashing remains well-defined.
    """
    x = np.asarray(a, dtype=np.float32)
    x = np.nan_to_num(x, nan=0.0, posinf=1.0, neginf=-1.0)
    return np.ascontiguousarray(x)


def hash_bytes(*parts):
    h = hashlib.sha256()
    for p in parts:
        if isinstance(p, str):
            p = p.encode("utf-8")
        elif isinstance(p, int):
            p = p.to_bytes(8, "little", signed=True)
        h.update(p)
    return h.digest()


def hex_hash(data):
    return hashlib.sha256(data).hexdigest()


# ============================================================
# FIELD
# ============================================================

class FieldState:

    def __init__(self, size=GRID, seed=1337):
        self.size = size
        self.rng = np.random.default_rng(seed)

        self.channels = np.zeros(
            (CHANNELS, size, size),
            dtype=np.float32
        )

        # Small deterministic initial disturbance.
        self.channels[0] = (
            self.rng.normal(0, 0.08, (size, size))
        ).astype(np.float32)

        self.channels[1] = (
            self.rng.normal(0, 0.04, (size, size))
        ).astype(np.float32)

        self.channels[2] = np.zeros((size, size), dtype=np.float32)
        self.channels[3] = np.zeros((size, size), dtype=np.float32)

        self.sequence = 0
        self.time = 0.0
        self.dt = 1.0

    # --------------------------------------------------------

    def frozen(self):
        return self.channels.copy()

    # --------------------------------------------------------

    def inject(self, x=None, y=None, strength=1.0, channel=0):

        if x is None:
            x = self.size // 2

        if y is None:
            y = self.size // 2

        radius = max(1, int(2 + abs(strength) * 2))

        yy, xx = np.ogrid[:self.size, :self.size]

        mask = (
            (xx - x) ** 2 +
            (yy - y) ** 2
        ) <= radius ** 2

        self.channels[channel, mask] += strength

        # Injection creates information as well.
        self.channels[3, mask] += abs(strength) * 0.12

    # --------------------------------------------------------

    def evolve(self):

        old = self.frozen()

        new = old.copy()

        for c in range(CHANNELS):

            center = old[c]

            north = np.roll(center, 1, axis=0)
            south = np.roll(center, -1, axis=0)
            east = np.roll(center, 1, axis=1)
            west = np.roll(center, -1, axis=1)

            laplacian = (
                north +
                south +
                east +
                west -
                4.0 * center
            )

            # Diffusion.
            new[c] = center + 0.08 * laplacian

        # ----------------------------------------------------
        # Cross-channel coupling.
        # ----------------------------------------------------

        matter = new[0]
        energy = new[1]
        temperature = new[2]
        information = new[3]

        temperature += (
            np.abs(energy) * 0.015
            - temperature * 0.025
        )

        energy += (
            np.abs(matter) * 0.008
            - energy * 0.012
        )

        information += (
            np.abs(matter - energy) * 0.004
            - information * 0.008
        )

        # Soft nonlinear reaction.
        new[0] += np.tanh(energy * 0.35) * 0.01
        new[1] += np.tanh(temperature * 0.25) * 0.01

        self.channels = np.clip(
            new,
            -4.0,
            4.0
        ).astype(np.float32)

        self.sequence += 1
        self.time += self.dt

    # --------------------------------------------------------

    def canonical_bytes(self):

        header = json.dumps(
            {
                "version": SIGIL_VERSION,
                "size": self.size,
                "channels": CHANNELS,
                "sequence": self.sequence,
                "dt": self.dt,
            },
            sort_keys=True,
            separators=(",", ":")
        ).encode("utf-8")

        return (
            header +
            canonical_float_array(
                self.channels
            ).tobytes()
        )

    # --------------------------------------------------------

    def state_hash(self):

        return hex_hash(
            self.canonical_bytes()
        )

    # --------------------------------------------------------

    def metrics(self):

        x = self.channels

        return {
            "energy": float(np.mean(np.abs(x[1]))),
            "matter": float(np.mean(np.abs(x[0]))),
            "temperature": float(np.mean(np.abs(x[2]))),
            "information": float(np.mean(np.abs(x[3]))),
            "variance": float(np.var(x)),
            "activity": float(np.mean(np.abs(np.diff(
                x,
                axis=0
            )))),
        }


# ============================================================
# SIGIL DERIVATION
# ============================================================

class Sigil:

    def __init__(self, state_hash, metrics):
        self.state_hash = state_hash
        self.metrics = metrics

        # First 64 bits of SHA-256 become deterministic seed.
        self.seed = int(
            state_hash[:16],
            16
        )

        self.rng = random.Random(self.seed)

        self.rotation = (
            self.rng.random() *
            math.tau
        )

        self.layers = 3 + self.rng.randrange(5)

        self.symmetry = 2 + self.rng.randrange(7)

        self.radius = (
            0.55 +
            self.metrics["activity"] * 3.0
        )

        self.points = self._derive_points()

    # --------------------------------------------------------

    def _derive_points(self):

        points = []

        n = (
            24 +
            int(
                min(
                    60,
                    self.metrics["variance"] * 300
                )
            )
        )

        for i in range(n):

            t = i / max(1, n - 1)

            angle = (
                t * math.tau * self.symmetry
                + self.rotation
            )

            # State-derived radial deformation.
            wave = math.sin(
                angle * self.symmetry +
                self.seed % 997
            )

            radius = (
                self.radius *
                (0.55 + 0.45 * t) *
                (1.0 + wave * 0.18)
            )

            x = math.cos(angle) * radius
            y = math.sin(angle) * radius

            points.append((x, y))

        return points

    # --------------------------------------------------------

    def as_dict(self):

        return {
            "version": SIGIL_VERSION,
            "state_hash": self.state_hash,
            "seed": self.seed,
            "rotation": self.rotation,
            "layers": self.layers,
            "symmetry": self.symmetry,
            "radius": self.radius,
            "point_count": len(self.points),
        }


# ============================================================
# STEREOGRAPHIC PROJECTION
# ============================================================

class Stereograph:

    @staticmethod
    def sphere_from_plane(x, y):

        """
        Inverse stereographic projection:

                     north pole
                         *
                        / \
                       /   \
                      /     \
                     /       \
                    *---------*
                       plane

        Maps a 2D point onto the unit sphere.
        """

        r2 = x * x + y * y

        denom = r2 + 1.0

        sx = 2.0 * x / denom
        sy = 2.0 * y / denom
        sz = (r2 - 1.0) / denom

        return sx, sy, sz

    # --------------------------------------------------------

    @staticmethod
    def project(x, y, rotation=0.0):

        sx, sy, sz = (
            Stereograph.sphere_from_plane(x, y)
        )

        # Rotate around Z.
        c = math.cos(rotation)
        s = math.sin(rotation)

        rx = c * sx - s * sy
        ry = s * sx + c * sy

        return rx, ry, sz

    # --------------------------------------------------------

    @staticmethod
    def project_sigil(sigil):

        projected = []

        for x, y in sigil.points:

            projected.append(
                Stereograph.project(
                    x,
                    y,
                    sigil.rotation
                )
            )

        return projected


# ============================================================
# TICK
# ============================================================

class FieldTick:

    def __init__(self, field):

        self.sequence = field.sequence
        self.time = field.time
        self.dt = field.dt
        self.state_hash = field.state_hash()

        self.metrics = field.metrics()

        self.sigil = Sigil(
            self.state_hash,
            self.metrics
        )

        self.stereograph = (
            Stereograph.project_sigil(
                self.sigil
            )
        )

    # --------------------------------------------------------

    def summary(self):

        return {
            "sequence": self.sequence,
            "time": self.time,
            "state_hash": self.state_hash,
            "metrics": self.metrics,
            "sigil": self.sigil.as_dict(),
        }


# ============================================================
# SYSTEMS SIGIL ENGINE
# ============================================================

class SystemsSigilEngine:

    def __init__(self, size=GRID, seed=1337):

        self.seed = seed

        self.field = FieldState(
            size=size,
            seed=seed
        )

        self.history = deque(
            maxlen=HISTORY
        )

        self.running = False

        self.last_tick = None

    # --------------------------------------------------------

    def tick(self):

        self.field.evolve()

        tick = FieldTick(
            self.field
        )

        self.history.append(
            tick
        )

        self.last_tick = tick

        return tick

    # --------------------------------------------------------

    def impinge(
        self,
        x=None,
        y=None,
        strength=1.0,
        channel=0
    ):

        self.field.inject(
            x=x,
            y=y,
            strength=strength,
            channel=channel
        )

    # --------------------------------------------------------

    def replay_tick(self, sequence):

        for tick in self.history:

            if tick.sequence == sequence:
                return tick

        return None

    # --------------------------------------------------------

    def verify_tick(self, tick):

        # The important property:
        # sigil identity is derived from state identity.

        expected = Sigil(
            tick.state_hash,
            tick.metrics
        )

        return (
            expected.seed ==
            tick.sigil.seed
        )

    # --------------------------------------------------------

    def current_sigil(self):

        if self.last_tick is None:
            return None

        return self.last_tick.sigil


# ============================================================
# RENDERER
# ============================================================

class SigilRenderer:

    def __init__(self, engine):

        self.engine = engine

    # --------------------------------------------------------

    def render_matplotlib(self):

        import matplotlib.pyplot as plt

        tick = self.engine.last_tick

        if tick is None:
            return

        plt.close("all")

        fig = plt.figure(
            figsize=(8, 8),
            facecolor="black"
        )

        ax = fig.add_subplot(
            111,
            projection="3d"
        )

        pts = tick.stereograph

        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        zs = [p[2] for p in pts]

        # Main stereographic sigil.
        ax.plot(
            xs,
            ys,
            zs,
            linewidth=2
        )

        # Mirror symmetry layers.
        for layer in range(
            1,
            tick.sigil.layers
        ):

            scale = 1.0 + layer * 0.12

            ax.plot(
                [x * scale for x in xs],
                [y * scale for y in ys],
                [z for z in zs],
                alpha=max(
                    0.1,
                    0.5 - layer * 0.05
                )
            )

        # Sphere reference.
        u = np.linspace(
            0,
            math.tau,
            40
        )

        v = np.linspace(
            -math.pi / 2,
            math.pi / 2,
            20
        )

        sphere_x = (
            np.outer(
                np.cos(u),
                np.cos(v)
            )
        )

        sphere_y = (
            np.outer(
                np.sin(u),
                np.cos(v)
            )
        )

        sphere_z = (
            np.outer(
                np.ones_like(u),
                np.sin(v)
            )
        )

        ax.plot_wireframe(
            sphere_x,
            sphere_y,
            sphere_z,
            alpha=0.08
        )

        ax.set_title(
            "SYSTEMS SIGIL — STEREOGRAPH",
            color="white"
        )

        ax.text2D(
            0.02,
            0.02,
            "SEQ %d\nHASH %s\nSYM %d\nLAYERS %d"
            % (
                tick.sequence,
                tick.state_hash[:16],
                tick.sigil.symmetry,
                tick.sigil.layers
            ),
            transform=ax.transAxes,
            color="white"
        )

        ax.set_axis_off()

        plt.show()


# ============================================================
# PYTHONISTA UI
# ============================================================

if PYTHONISTA:

    engine = SystemsSigilEngine(
        size=GRID,
        seed=1337
    )

    renderer = SigilRenderer(
        engine
    )

    view = ui.View()

    view.background_color = (
        "#080812"
    )

    view.frame = (
        0,
        0,
        *ui.get_screen_size()
    )

    # --------------------------------------------------------
    # Title
    # --------------------------------------------------------

    title = ui.Label()

    title.text = (
        "STEREOGRAPH\n"
        "SYSTEMS SIGIL ENGINE"
    )

    title.alignment = ui.ALIGN_CENTER
    title.text_color = "white"
    title.font = (
        "Helvetica-Bold",
        21
    )

    title.frame = (
        20,
        25,
        view.width - 40,
        70
    )

    title.flex = "W"

    view.add_subview(title)

    # --------------------------------------------------------
    # Status
    # --------------------------------------------------------

    status = ui.TextView()

    status.editable = False
    status.font = (
        "Menlo",
        11
    )

    status.text_color = "white"

    status.frame = (
        20,
        110,
        view.width - 40,
        190
    )

    status.flex = "W"

    view.add_subview(status)

    # --------------------------------------------------------
    # Status update
    # --------------------------------------------------------

    def update_status():

        tick = engine.last_tick

        if tick is None:

            status.text = (
                "SYSTEM READY\n\n"
                "No committed field tick."
            )

            return

        m = tick.metrics

        status.text = (
            "SYSTEMS SIGIL ENGINE\n"
            "────────────────────────\n"
            "SEQ          %d\n"
            "TIME         %.2f\n"
            "HASH         %s\n\n"
            "MATTER       %.5f\n"
            "ENERGY       %.5f\n"
            "TEMPERATURE  %.5f\n"
            "INFORMATION  %.5f\n"
            "VARIANCE     %.5f\n"
            "ACTIVITY     %.5f\n\n"
            "SIGIL SEED   %d\n"
            "SYMMETRY     %d\n"
            "LAYERS       %d\n"
            "POINTS       %d"
            % (
                tick.sequence,
                tick.time,
                tick.state_hash[:24],
                m["matter"],
                m["energy"],
                m["temperature"],
                m["information"],
                m["variance"],
                m["activity"],
                tick.sigil.seed,
                tick.sigil.symmetry,
                tick.sigil.layers,
                len(tick.sigil.points)
            )
        )

    # --------------------------------------------------------
    # Buttons
    # --------------------------------------------------------

    def button(
        y,
        title_text,
        action,
        height=48
    ):

        b = ui.Button()

        b.title = title_text

        b.frame = (
            25,
            y,
            view.width - 50,
            height
        )

        b.flex = "W"

        b.background_color = (
            "#222238"
        )

        b.tint_color = "white"

        b.action = action

        view.add_subview(b)

        return b

    # --------------------------------------------------------

    def tick_action(sender):

        engine.tick()

        update_status()

    # --------------------------------------------------------

    def impinge_action(sender):

        # Deterministic-looking user interaction,
        # but the resulting field is still hashed.

        x = random.randrange(
            GRID
        )

        y = random.randrange(
            GRID
        )

        engine.impinge(
            x=x,
            y=y,
            strength=1.5,
            channel=random.randrange(
                CHANNELS
            )
        )

        update_status()

    # --------------------------------------------------------

    def render_action(sender):

        renderer.render_matplotlib()

    # --------------------------------------------------------

    def verify_action(sender):

        if engine.last_tick is None:

            status.text = (
                "NO TICK TO VERIFY"
            )

            return

        ok = engine.verify_tick(
            engine.last_tick
        )

        status.text += (
            "\n\nREPLAY / SIGIL VERIFICATION: "
            + ("PASS" if ok else "FAIL")
        )

    # --------------------------------------------------------

    def burst_action(sender):

        for _ in range(10):

            engine.tick()

        update_status()

    # --------------------------------------------------------

    button(
        320,
        "ADVANCE FIELD TICK",
        tick_action
    )

    button(
        380,
        "IMPINGE SYSTEM",
        impinge_action
    )

    button(
        440,
        "10-TICK EVOLUTION BURST",
        burst_action
    )

    button(
        500,
        "RENDER STEREOGRAPH SIGIL",
        render_action
    )

    button(
        560,
        "VERIFY SIGIL / REPLAY IDENTITY",
        verify_action
    )

    # --------------------------------------------------------
    # Present
    # --------------------------------------------------------

    view.present(
        "sheet"
    )

    update_status()


# ============================================================
# HEADLESS MODE
# ============================================================

else:

    print(
        "STEREOGRAPH SYSTEMS SIGIL ENGINE"
    )

    engine = SystemsSigilEngine()

    engine.impinge(
        strength=2.0,
        channel=0
    )

    for _ in range(8):

        tick = engine.tick()

        print(
            "TICK %d | HASH %s | SIGIL %d"
            % (
                tick.sequence,
                tick.state_hash[:16],
                tick.sigil.seed
            )
        )

    print(
        "Verification:",
        engine.verify_tick(
            engine.last_tick
        )
    )
