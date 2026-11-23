"""Baut das GitHub-Pages-Bundle der Endo-App (PNG-Icons + Spiegelung von docs/ in den Projekt-Root)."""
from __future__ import annotations

import math
import shutil
import struct
import zlib
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT_DIR / "docs"


def _create_app_icon_png(size: int) -> bytes:
    """Erzeugt deterministisch ein abgerundetes Beige/Salbei App-Icon als PNG (reine Python-Stdlib)."""
    bg = (245, 241, 232, 255)       # #F5F1E8 Warm Beige
    border = (223, 215, 200, 255)   # #DFD7C8 Sand Border
    circle_bg = (232, 239, 233, 255)  # #E8EFE9 Soft Sage
    sage = (58, 84, 67, 255)        # #3A5443 Primary Sage
    cream = (252, 251, 247, 255)    # #FCFBF7 Cream Center

    cx = (size - 1) / 2.0
    cy = (size - 1) / 2.0
    outer_r = size * 0.34
    ring_w = max(2.0, size * 0.035)
    inner_dot_r = size * 0.055

    raw_rows = bytearray()
    for y in range(size):
        raw_rows.append(0)  # PNG Filter-Byte 0 (None)
        dy = y - cy
        for x in range(size):
            dx = x - cx
            dist = math.hypot(dx, dy)

            # Standard-Hintergrund
            r, g, b, a = bg

            # Dezenter Rahmen am Rand
            margin = max(2, int(size * 0.03))
            if x < margin or x >= size - margin or y < margin or y >= size - margin:
                r, g, b, a = border

            # Salbei-Kreis in der Mitte
            if dist <= outer_r:
                if dist >= outer_r - ring_w:
                    r, g, b, a = sage
                else:
                    r, g, b, a = circle_bg

            # Tropfen-/Blatt-Symbol in der Mitte
            drop_cy = cy + size * 0.05
            drop_r = size * 0.13
            in_drop_circle = math.hypot(dx, y - drop_cy) <= drop_r
            top_y = cy - size * 0.17
            in_drop_cone = (
                top_y <= y <= drop_cy
                and abs(dx) <= ((y - top_y) / max(1.0, (drop_cy - top_y))) * drop_r
            )
            if in_drop_circle or in_drop_cone:
                r, g, b, a = sage
                if math.hypot(dx, y - drop_cy) <= inner_dot_r:
                    r, g, b, a = cream

            raw_rows.extend((r, g, b, a))

    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_rows), level=9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", idat)
        + png_chunk(b"IEND", b"")
    )


def build_pages_bundle() -> None:
    """Erzeugt PWA-Icons in docs/ und spiegelt alle statischen PWA-Assets in den Repository-Root."""
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    icon_specs = {
        "apple-touch-icon.png": 180,
        "icon-192.png": 192,
        "icon-512.png": 512,
    }
    for filename, px in icon_specs.items():
        (DOCS_DIR / filename).write_bytes(_create_app_icon_png(px))

    files_to_mirror = [
        ".nojekyll",
        "index.html",
        "handbuch.html",
        "manifest.json",
        "icon.svg",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "sw.js",
    ]
    for rel_name in files_to_mirror:
        src = DOCS_DIR / rel_name
        if src.exists():
            shutil.copy2(src, ROOT_DIR / rel_name)

    for folder_name in ("css", "js"):
        src_dir = DOCS_DIR / folder_name
        dst_dir = ROOT_DIR / folder_name
        if src_dir.exists():
            if dst_dir.exists():
                shutil.rmtree(dst_dir)
            shutil.copytree(src_dir, dst_dir)


if __name__ == "__main__":
    build_pages_bundle()
    print("GitHub-Pages-Bundle erfolgreich in docs/ und im Repository-Root aktualisiert.")
