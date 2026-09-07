"""Calibrate the selected ImageGen lane to the V5.3 physics camera frame."""

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "art-source" / "lane-premium-v54-source.png"
OUTPUT = ROOT / "public" / "assets" / "lane-premium-v54.png"

# The source edit already contains a seamless empty lane. This crop expands the
# rail perspective and moves the cabinet bumper onto the fixed physics guide.
CROP = (63, 0, 817, 1450)
OUTPUT_SIZE = (862, 1658)


def main() -> None:
    with Image.open(SOURCE) as image:
        calibrated = image.convert("RGB").crop(CROP).resize(OUTPUT_SIZE, Image.Resampling.LANCZOS)
        calibrated.save(OUTPUT, format="PNG", optimize=True)
    print(f"V5.4 lane written: {OUTPUT} ({OUTPUT_SIZE[0]}x{OUTPUT_SIZE[1]})")


if __name__ == "__main__":
    main()
