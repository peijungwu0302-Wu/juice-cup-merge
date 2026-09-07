"""Headless geometry assertions for V5 GLB exports."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default="public/models")
    return parser.parse_args(raw)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def close(value, expected, tolerance=0.035):
    return abs(value - expected) <= tolerance


def main():
    root = Path(parse_args().models).resolve()
    cup_asset = root / "cups-v5.glb"
    lane_asset = root / "lane-v5.glb"
    assert cup_asset.stat().st_size < 1_000_000, "cup GLB exceeds the mobile transfer budget"
    assert lane_asset.stat().st_size < 1_000_000, "lane GLB exceeds the mobile transfer budget"
    clear()
    bpy.ops.import_scene.gltf(filepath=str(cup_asset))
    expected_cups = {"JuiceShell": 2.22, "SundaeShell": 1.98, "WineShell": 2.14}
    cup_triangles = 0
    for name, expected_height in expected_cups.items():
        cup = bpy.data.objects.get(name)
        assert cup is not None, f"missing {name}"
        assert close(cup.dimensions.z, expected_height), f"{name} is not upright: {tuple(cup.dimensions)}"
        assert cup.dimensions.z > cup.dimensions.x, f"{name} vertical dimension must exceed width"
        assert len(cup.data.vertices) > 600, f"{name} mesh is unexpectedly coarse"
        cup_triangles += sum(max(0, len(polygon.vertices) - 2) for polygon in cup.data.polygons)
    assert cup_triangles < 15_000, f"cup shells exceed the mobile triangle budget: {cup_triangles}"

    clear()
    bpy.ops.import_scene.gltf(filepath=str(lane_asset))
    lane = bpy.data.objects.get("LaneSurface")
    left = bpy.data.objects.get("LeftRail")
    right = bpy.data.objects.get("RightRail")
    wall = bpy.data.objects.get("FrontWall")
    assert all((lane, left, right, wall)), "lane GLB is missing a collision-aligned visual"
    assert close(lane.dimensions.x, 5.6) and close(lane.dimensions.y, 19.6), tuple(lane.dimensions)
    assert close(lane.dimensions.z, 0.24), tuple(lane.dimensions)
    assert close(abs(left.location.x), 2.98) and close(abs(right.location.x), 2.98)
    assert close(wall.location.y, 9.98), f"front wall was exported to the wrong lane end: {wall.location.y}"
    total_kib = (cup_asset.stat().st_size + lane_asset.stat().st_size) / 1024
    print(
        "V5 Blender asset checks passed: 3 upright cup shells, "
        f"{cup_triangles} shell triangles, collision-aligned lane geometry, {total_kib:.1f} KiB total."
    )


if __name__ == "__main__":
    main()
