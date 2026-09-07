"""Headless geometry and icon assertions for the V5.1 asset package."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "app" / "game" / "v51-asset-spec.json"


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default="public/models")
    parser.add_argument("--icons", default="public/icons/v51")
    return parser.parse_args(raw)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def close(value, expected, tolerance=0.04):
    return abs(value - expected) <= tolerance


def descendants(root):
    result = []
    stack = list(root.children)
    while stack:
        obj = stack.pop()
        result.append(obj)
        stack.extend(obj.children)
    return result


def main():
    args = parse_args()
    models = Path(args.models).resolve()
    icons = Path(args.icons).resolve()
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    cups_asset = models / "cups-v51.glb"
    lane_asset = models / "lane-v51.glb"
    assert cups_asset.exists() and lane_asset.exists(), "missing V5.1 GLB output"
    assert cups_asset.stat().st_size < 3_500_000, "cup GLB exceeds the mobile transfer budget"
    assert lane_asset.stat().st_size < 750_000, "lane GLB exceeds the mobile transfer budget"

    clear()
    bpy.ops.import_scene.gltf(filepath=str(cups_asset))
    roots = {
        obj.name: obj for obj in bpy.context.scene.objects
        if obj.parent is None and obj.name.startswith("Cup_")
    }
    assert len(roots) == 21, f"expected 21 premium variants, found {len(roots)}"
    triangle_count = 0
    for kind in ("juice", "sundae", "wine"):
        for level in range(7):
            root = roots.get(f"Cup_{kind}_{level}")
            assert root is not None, f"missing Cup_{kind}_{level}"
            children = descendants(root)
            roles = {child.get("role") for child in children}
            assert "glass" in roles and "liquid" in roles and "detail" in roles
            glass = next(child for child in children if child.get("role") == "glass")
            assert close(glass.dimensions.x / 2, float(spec["cup"]["modelRadius"])), tuple(glass.dimensions)
            assert close(glass.dimensions.z, float(spec["cup"]["modelHeight"])), tuple(glass.dimensions)
            for child in children:
                if child.type == "MESH":
                    triangle_count += sum(max(0, len(poly.vertices) - 2) for poly in child.data.polygons)
    assert triangle_count < 180_000, f"cup library exceeds triangle budget: {triangle_count}"

    slices = spec["cup"]["colliderSlices"]
    assert len(slices) == 5, "V5.1 must use the approved five-slice envelope"
    assert slices[-1]["radius"] == 0.985 and slices[-1]["centerY"] + slices[-1]["halfHeight"] == 1.0
    assert all(float(item["radius"]) > 0 and float(item["halfHeight"]) > 0 for item in slices)

    clear()
    bpy.ops.import_scene.gltf(filepath=str(lane_asset))
    lane_spec = spec["lane"]
    lane = bpy.data.objects.get("LaneSurface")
    left = bpy.data.objects.get("LeftRail")
    right = bpy.data.objects.get("RightRail")
    wall = bpy.data.objects.get("FrontWall")
    assert all((lane, left, right, wall)), "lane is missing a collision-aligned visual"
    assert close(lane.dimensions.x, float(lane_spec["width"]))
    assert close(lane.dimensions.y, float(lane_spec["length"]))
    assert close(lane.dimensions.z, float(lane_spec["surfaceThickness"]))
    assert close(abs(left.location.x), float(lane_spec["railCenterX"]))
    assert close(abs(right.location.x), float(lane_spec["railCenterX"]))
    assert close(wall.location.y, -float(lane_spec["frontWallCenterZ"]))

    expected_icons = [icons / f"{kind}-{level}.png" for kind in ("juice", "sundae", "wine") for level in range(1, 8)]
    missing = [path.name for path in expected_icons if not path.exists() or path.stat().st_size < 1_000]
    assert not missing, f"missing or empty isolated icons: {missing}"
    for path in expected_icons:
        image = bpy.data.images.load(str(path), check_existing=False)
        assert image.size[0] == 180 and image.size[1] == 230, f"bad icon canvas: {path.name} {tuple(image.size)}"
        assert image.channels == 4, f"icon lacks alpha: {path.name}"
        bpy.data.images.remove(image)

    total_kib = (cups_asset.stat().st_size + lane_asset.stat().st_size) / 1024
    print(
        f"V5.1 checks passed: 21 variants, 5 collider slices, {triangle_count} triangles, "
        f"21 isolated RGBA icons, shared lane geometry, {total_kib:.1f} KiB total."
    )


if __name__ == "__main__":
    main()
