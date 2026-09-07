"""Generate the modular V5 cup and lane GLB assets.

Run with Blender 5.2+:
  blender --background --python tools/blender/generate_v5_assets.py -- --output public/models

The exported cup shells deliberately share the same unit envelope. Theme changes
therefore replace only visible geometry/materials while Rapier keeps one stable,
level-based compound collider.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy


ASSET_VERSION = "5.0.0"


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="public/models")
    return parser.parse_args(raw)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def material(name: str, color: tuple[float, float, float, float], metallic=0.0, roughness=0.35):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


def glass_material():
    mat = material("V5_ClearGlass", (0.91, 0.98, 1.0, 0.42), roughness=0.08)
    mat.surface_render_method = "DITHERED"
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Transmission Weight"].default_value = 0.55
    shader.inputs["Coat Weight"].default_value = 0.32
    shader.inputs["IOR"].default_value = 1.45
    shader.inputs["Alpha"].default_value = 0.42
    return mat


def lathe(name: str, profile: list[tuple[float, float]], segments=72):
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for segment in range(segments):
        angle = math.tau * segment / segments
        cosine, sine = math.cos(angle), math.sin(angle)
        vertices.extend((radius * cosine, y, radius * sine) for radius, y in profile)
    count = len(profile)
    for segment in range(segments):
        next_segment = (segment + 1) % segments
        for row in range(count - 1):
            a = segment * count + row
            b = next_segment * count + row
            faces.append((a, b, b + 1, a + 1))
    mesh = bpy.data.meshes.new(f"{name}Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj["asset_version"] = ASSET_VERSION
    obj["shared_physics_envelope"] = True
    return obj


def beveled_box(name: str, location, dimensions, bevel: float, mat):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("SoftEdges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    obj["asset_version"] = ASSET_VERSION
    return obj


def export_selected(path: Path, objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )


def build_cups(output: Path) -> None:
    clear_glass = glass_material()

    # Tumbler: broad contact lip, subtly heavy base and a real hollow rim.
    juice = lathe("JuiceShell", [
        (0.62, 0.02), (0.70, 0.10), (0.73, 0.22), (0.91, 2.08),
        (0.96, 2.16), (0.96, 2.24), (0.85, 2.24), (0.85, 2.15),
        (0.65, 0.25), (0.57, 0.13),
    ])
    juice.data.materials.append(clear_glass)

    # Sundae glass: compact bowl, shortened stem and broad base to prevent
    # high-level cups from hiding the entire rear row.
    sundae = lathe("SundaeShell", [
        (0.10, 0.04), (0.58, 0.04), (0.68, 0.10), (0.65, 0.18),
        (0.19, 0.23), (0.14, 0.58), (0.33, 0.66), (0.70, 0.96),
        (0.94, 1.55), (0.98, 1.91), (0.93, 2.02), (0.82, 1.93),
        (0.80, 1.60), (0.60, 1.10), (0.26, 0.73), (0.09, 0.63),
        (0.09, 0.29), (0.55, 0.18), (0.56, 0.11), (0.10, 0.10),
    ])
    sundae.data.materials.append(clear_glass)

    # Wine glass: full stem silhouette but with the bowl kept low and wide.
    wine = lathe("WineShell", [
        (0.08, 0.03), (0.62, 0.03), (0.70, 0.09), (0.65, 0.16),
        (0.16, 0.21), (0.12, 0.66), (0.28, 0.72), (0.66, 0.91),
        (0.90, 1.33), (0.98, 1.87), (0.95, 2.14), (0.85, 2.17),
        (0.85, 1.89), (0.79, 1.43), (0.58, 1.02), (0.22, 0.79),
        (0.08, 0.70), (0.08, 0.27), (0.54, 0.16), (0.55, 0.10),
        (0.08, 0.09),
    ])
    wine.data.materials.append(clear_glass)

    export_selected(output / "cups-v5.glb", [juice, sundae, wine])


def build_lane(output: Path) -> None:
    marble = material("V5_WarmMarble", (0.88, 0.70, 0.43, 1.0), roughness=0.24)
    wood = material("V5_HoneyWood", (0.35, 0.105, 0.035, 1.0), roughness=0.26)
    wood_dark = material("V5_Walnut", (0.12, 0.033, 0.012, 1.0), roughness=0.3)
    brass = material("V5_Brass", (0.88, 0.48, 0.12, 1.0), metallic=0.72, roughness=0.2)
    cream = material("V5_CreamWall", (0.93, 0.76, 0.52, 1.0), roughness=0.3)

    objects = [
        beveled_box("LaneSurface", (0, -0.13, 0), (5.6, 0.24, 19.6), 0.08, marble),
        beveled_box("LeftRail", (-2.98, 0.25, 0), (0.36, 0.68, 19.9), 0.11, wood),
        beveled_box("RightRail", (2.98, 0.25, 0), (0.36, 0.68, 19.9), 0.11, wood),
        beveled_box("LeftTrim", (-2.77, 0.12, 0), (0.055, 0.13, 19.6), 0.025, brass),
        beveled_box("RightTrim", (2.77, 0.12, 0), (0.055, 0.13, 19.6), 0.025, brass),
        beveled_box("FrontWall", (0, 0.64, -9.98), (6.3, 1.52, 0.34), 0.12, wood),
        beveled_box("FrontInset", (0, 0.65, -9.78), (4.85, 0.68, 0.08), 0.04, cream),
        beveled_box("Apron", (0, -0.05, 10.12), (6.25, 0.34, 0.62), 0.12, wood_dark),
    ]
    export_selected(output / "lane-v5.glb", objects)


def main() -> None:
    args = parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    reset_scene()
    build_cups(output)
    reset_scene()
    build_lane(output)
    print(f"V5 assets written to {output}")


if __name__ == "__main__":
    main()

