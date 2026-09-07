from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "app" / "game" / "v52-art-spec.json"
OUTPUT = ROOT / "public" / "art-v52"


def main() -> None:
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    padding = int(spec["sprite"]["padding"])
    OUTPUT.mkdir(parents=True, exist_ok=True)

    written = []
    for kind, theme in spec["sprite"]["themes"].items():
        source_path = ROOT / theme["source"]
        atlas = Image.open(source_path).convert("RGBA")
        expected = (theme["sourceWidth"], theme["sourceHeight"])
        if atlas.size != expected:
            raise ValueError(f"{source_path} is {atlas.size}, expected {expected}")

        for level, bounds in enumerate(theme["bounds"], start=1):
            sprite = atlas.crop(tuple(bounds))
            alpha_bounds = sprite.getchannel("A").getbbox()
            if alpha_bounds:
                sprite = sprite.crop(alpha_bounds)
            framed = Image.new(
                "RGBA",
                (sprite.width + padding * 2, sprite.height + padding * 2),
                (0, 0, 0, 0),
            )
            framed.alpha_composite(sprite, (padding, padding))
            destination = OUTPUT / f"{kind}-{level}.png"
            framed.save(destination, optimize=True)
            written.append(destination)

    if len(written) != 21:
        raise RuntimeError(f"Expected 21 sprites, wrote {len(written)}")
    total = sum(path.stat().st_size for path in written)
    print(f"V5.2 art extracted: {len(written)} isolated sprites, {total / 1024:.1f} KiB")


if __name__ == "__main__":
    main()
