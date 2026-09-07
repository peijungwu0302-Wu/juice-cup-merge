"""Resize the selected ImageGen rail-alignment edit for the shared V5.7 art camera."""

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "art-source" / "lane-premium-v57-source.png"
OUTPUT = ROOT / "public" / "assets" / "lane-premium-v57.png"
OUTPUT_SIZE = (862, 1658)


def main() -> None:
    with Image.open(SOURCE) as image:
        calibrated = image.convert("RGB").resize(OUTPUT_SIZE, Image.Resampling.LANCZOS)
        calibrated.save(OUTPUT, format="PNG", optimize=True)
    print(f"V5.7 lane written: {OUTPUT} ({OUTPUT_SIZE[0]}x{OUTPUT_SIZE[1]})")


if __name__ == "__main__":
    main()
