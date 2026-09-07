"""Build the V5.1 premium cup library and collision-aligned boutique lane.

The script reads the same JSON specification imported by the game. Every cup
theme shares the exact rim envelope so changing art during a live round never
changes Rapier bodies, positions, or contacts.

Run with Blender 5.2+:
  blender --background --python tools/blender/generate_v51_assets.py -- --output public/models
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "app" / "game" / "v51-asset-spec.json"
SPEC = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
ASSET_VERSION = SPEC["version"]
MODEL_RADIUS = float(SPEC["cup"]["modelRadius"])
MODEL_HEIGHT = float(SPEC["cup"]["modelHeight"])

JUICE_COLORS = [
    (0.96, 0.67, 0.08, 0.94),
    (1.00, 0.30, 0.035, 0.94),
    (0.96, 0.12, 0.26, 0.94),
    (0.34, 0.055, 0.56, 0.94),
    (0.17, 0.72, 0.32, 0.94),
    (0.94, 0.055, 0.13, 0.94),
    (0.22, 0.78, 0.92, 0.94),
]
SUNDAE_COLORS = [
    (1.00, 0.89, 0.65, 1.0),
    (0.76, 0.29, 0.065, 1.0),
    (0.25, 0.58, 0.18, 1.0),
    (0.18, 0.055, 0.028, 1.0),
    (0.26, 0.18, 0.68, 1.0),
    (0.12, 0.018, 0.025, 1.0),
    (0.88, 0.22, 0.66, 1.0),
]
WINE_COLORS = [
    (0.47, 0.88, 1.00, 0.9),
    (0.51, 0.33, 0.80, 0.9),
    (0.95, 0.31, 0.52, 0.9),
    (0.055, 0.12, 0.48, 0.92),
    (0.08, 0.56, 0.30, 0.9),
    (0.66, 0.018, 0.10, 0.92),
    (0.23, 0.18, 0.74, 0.92),
]


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


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.3,
    transmission: float = 0.0,
    coat: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Transmission Weight"].default_value = transmission
    shader.inputs["Coat Weight"].default_value = coat
    shader.inputs["Coat Roughness"].default_value = min(0.2, roughness)
    shader.inputs["IOR"].default_value = 1.45
    shader.inputs["Alpha"].default_value = color[3]
    if emission is not None:
        shader.inputs["Emission Color"].default_value = emission
        shader.inputs["Emission Strength"].default_value = emission_strength
    if color[3] < 1.0 or transmission > 0:
        mat.surface_render_method = "DITHERED"
        mat.use_transparency_overlap = False
    return mat


def glass_material():
    return material(
        "V51_OpticalGlass",
        (0.88, 0.97, 1.0, 0.34),
        roughness=0.055,
        transmission=0.68,
        coat=0.42,
    )


def lathe_mesh(name: str, profile: list[tuple[float, float]], segments: int = 64):
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    count = len(profile)
    for segment in range(segments):
        angle = math.tau * segment / segments
        cosine, sine = math.cos(angle), math.sin(angle)
        vertices.extend((radius * cosine, radius * sine, height) for radius, height in profile)
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
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return mesh


def mesh_object(name: str, mesh, mat, parent=None):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.parent = parent
    obj["asset_version"] = ASSET_VERSION
    return obj


def empty(name: str):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj["asset_version"] = ASSET_VERSION
    obj["shared_physics_envelope"] = True
    return obj


def sphere(name: str, location, scale, mat, parent=None, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def cylinder(name: str, location, radius, depth, mat, parent=None, vertices=32, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation or (0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def cone(name: str, location, radius1, radius2, depth, mat, parent=None, vertices=32, rotation=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location, rotation=rotation or (0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def torus(name: str, location, major_radius, minor_radius, mat, parent=None, rotation=None, major_segments=40, minor_segments=10):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation or (0, 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def beveled_box(name: str, location, dimensions, bevel: float, mat, parent=None, rotation=None):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation or (0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("SoftEdges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def join(name: str, objects: list[bpy.types.Object], parent=None):
    objects = [obj for obj in objects if obj is not None]
    if not objects:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    result.parent = parent
    result["asset_version"] = ASSET_VERSION
    return result


def add_leaf(name: str, location, rotation, scale, mat, parent):
    leaf = sphere(name, location, scale, mat, parent, segments=16, rings=10)
    leaf.rotation_euler = rotation
    return leaf


def add_citrus(name: str, location, color, parent, scale=1.0):
    rind = material(f"{name}_RindMat", (*color, 1.0), roughness=0.42, coat=0.15)
    pith = material(f"{name}_PithMat", (1.0, 0.91, 0.55, 1.0), roughness=0.5)
    flesh = material(f"{name}_FleshMat", (*tuple(min(1.0, c * 1.08) for c in color), 0.96), roughness=0.3, coat=0.25)
    parts = [
        cylinder(f"{name}_Flesh", location, 0.235 * scale, 0.055 * scale, flesh, parent, 36, (math.pi / 2, 0, 0)),
        torus(f"{name}_Rind", location, 0.22 * scale, 0.028 * scale, rind, parent, (math.pi / 2, 0, 0), 36, 8),
        torus(f"{name}_Pith", (location[0], location[1] - 0.031 * scale, location[2]), 0.155 * scale, 0.012 * scale, pith, parent, (math.pi / 2, 0, 0), 30, 7),
    ]
    for index in range(6):
        angle = index * math.pi / 3
        spoke = beveled_box(
            f"{name}_Spoke{index}",
            (location[0] + math.cos(angle) * 0.085 * scale, location[1] - 0.035 * scale, location[2] + math.sin(angle) * 0.085 * scale),
            (0.16 * scale, 0.018 * scale, 0.012 * scale),
            0.004 * scale,
            pith,
            parent,
            (0, -angle, 0),
        )
        parts.append(spoke)
    return parts


def add_straw(name: str, location, parent, accent=(0.92, 0.08, 0.045, 1.0)):
    cream = material("V51_StrawCream", (1.0, 0.94, 0.78, 1.0), roughness=0.38)
    stripe = material(f"{name}_StripeMat", accent, roughness=0.34, coat=0.18)
    parts = [cylinder(f"{name}_Body", location, 0.032, 1.05, cream, parent, 14, (0, -0.22, 0))]
    for index in range(5):
        z = location[2] - 0.41 + index * 0.205
        parts.append(cylinder(f"{name}_Stripe{index}", (location[0] - (z - location[2]) * 0.22, location[1], z), 0.036, 0.085, stripe, parent, 14, (0, -0.22, 0)))
    return parts


def add_berry_cluster(name: str, location, color, parent, count=5, radius=0.115):
    berry = material(f"{name}_BerryMat", (*color, 1.0), roughness=0.2, coat=0.56)
    shine = material(f"{name}_ShineMat", (1.0, 0.72, 0.78, 1.0), roughness=0.16, coat=0.8)
    offsets = [(0, 0, 0), (0.17, 0.015, -0.02), (-0.16, -0.01, -0.035), (0.07, 0.025, 0.13), (-0.06, -0.025, -0.14), (0.0, 0.02, 0.23)]
    parts = []
    for index, offset in enumerate(offsets[:count]):
        point = tuple(location[axis] + offset[axis] for axis in range(3))
        parts.append(sphere(f"{name}_Berry{index}", point, (radius, radius, radius), berry, parent, 18, 12))
        if index < 3:
            parts.append(sphere(f"{name}_Glint{index}", (point[0] - radius * 0.35, point[1] - radius * 0.72, point[2] + radius * 0.38), (0.018, 0.01, 0.018), shine, parent, 10, 6))
    return parts


def add_star(name: str, location, scale, mat, parent):
    vertices = []
    for layer_y in (-0.035 * scale, 0.035 * scale):
        for index in range(10):
            angle = math.pi / 2 + index * math.pi / 5
            radius = scale if index % 2 == 0 else scale * 0.43
            vertices.append((location[0] + math.cos(angle) * radius, location[1] + layer_y, location[2] + math.sin(angle) * radius))
    faces = [tuple(range(10)), tuple(range(19, 9, -1))]
    for index in range(10):
        nxt = (index + 1) % 10
        faces.append((index, nxt, 10 + nxt, 10 + index))
    mesh = bpy.data.meshes.new(f"{name}Geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = mesh_object(name, mesh, mat, parent)
    return obj


def build_shell_meshes():
    h = MODEL_HEIGHT
    r = MODEL_RADIUS
    juice = [
        (r * 0.57, 0.00), (r * 0.61, h * 0.045), (r * 0.66, h * 0.12),
        (r * 0.72, h * 0.38), (r * 0.84, h * 0.69), (r * 0.98, h * 0.94),
        (r, h * 0.98), (r, h), (r * 0.89, h), (r * 0.88, h * 0.955),
        (r * 0.76, h * 0.69), (r * 0.64, h * 0.39), (r * 0.56, h * 0.13),
        (r * 0.51, h * 0.055),
    ]
    sundae = [
        (r * 0.08, 0.00), (r * 0.58, 0.00), (r * 0.62, h * 0.035),
        (r * 0.55, h * 0.075), (r * 0.19, h * 0.105), (r * 0.15, h * 0.27),
        (r * 0.34, h * 0.32), (r * 0.64, h * 0.48), (r * 0.88, h * 0.72),
        (r, h * 0.94), (r, h), (r * 0.89, h), (r * 0.88, h * 0.95),
        (r * 0.76, h * 0.73), (r * 0.55, h * 0.51), (r * 0.26, h * 0.35),
        (r * 0.10, h * 0.29), (r * 0.10, h * 0.12), (r * 0.49, h * 0.08),
        (r * 0.50, h * 0.04), (r * 0.08, h * 0.04),
    ]
    wine = [
        (r * 0.07, 0.00), (r * 0.59, 0.00), (r * 0.64, h * 0.032),
        (r * 0.57, h * 0.075), (r * 0.16, h * 0.10), (r * 0.12, h * 0.31),
        (r * 0.28, h * 0.35), (r * 0.61, h * 0.46), (r * 0.85, h * 0.65),
        (r * 0.99, h * 0.89), (r, h * 0.98), (r, h), (r * 0.90, h),
        (r * 0.89, h * 0.91), (r * 0.77, h * 0.68), (r * 0.53, h * 0.49),
        (r * 0.22, h * 0.37), (r * 0.08, h * 0.33), (r * 0.08, h * 0.12),
        (r * 0.50, h * 0.08), (r * 0.51, h * 0.04), (r * 0.07, h * 0.04),
    ]
    return {
        "juice": lathe_mesh("V51_JuiceShell", juice, 72),
        "sundae": lathe_mesh("V51_SundaeShell", sundae, 72),
        "wine": lathe_mesh("V51_WineShell", wine, 72),
    }


def build_liquid(kind: str, level: int, parent, mat):
    prefix = f"Cup_{kind}_{level}_Liquid"
    if kind == "juice":
        if level == 6:
            rainbow = [(0.39, 0.13, 0.70, 1), (0.12, 0.53, 0.90, 1), (0.14, 0.74, 0.35, 1), (0.98, 0.77, 0.08, 1), (1.0, 0.34, 0.04, 1), (0.96, 0.06, 0.25, 1)]
            layers = []
            for index, color in enumerate(rainbow):
                layer_mat = material(f"V51_Rainbow{index}", color, roughness=0.15, coat=0.42, emission=color, emission_strength=0.025)
                layers.append(cone(f"{prefix}_{index}", (0, 0, 0.39 + index * 0.285), 0.60 + index * 0.032, 0.625 + index * 0.032, 0.30, layer_mat, parent, 48))
            return join(prefix, layers, parent)
        return cone(prefix, (0, 0, 1.09), 0.58, 0.89, 1.77, mat, parent, 56)
    if kind == "sundae":
        parts = [
            sphere(f"{prefix}_Body", (0, 0, 1.48), (0.82, 0.82, 0.49), mat, parent, 40, 24),
            sphere(f"{prefix}_ScoopA", (-0.29, -0.02, 1.91), (0.47, 0.47, 0.35), mat, parent, 32, 20),
            sphere(f"{prefix}_ScoopB", (0.29, 0.02, 1.91), (0.47, 0.47, 0.35), mat, parent, 32, 20),
            sphere(f"{prefix}_Cream", (0, -0.01, 2.16), (0.48, 0.48, 0.31), material("V51_WhippedCream", (1.0, 0.94, 0.84, 1), roughness=0.24, coat=0.25), parent, 32, 20),
        ]
        return join(prefix, parts, parent)
    parts = [
        sphere(f"{prefix}_Bowl", (0, 0, 1.48), (0.82, 0.82, 0.47), mat, parent, 40, 24),
        cylinder(f"{prefix}_Surface", (0, 0, 1.76), 0.66, 0.025, mat, parent, 40),
    ]
    return join(prefix, parts, parent)


def build_micro_details(kind: str, level: int, parent):
    if kind == "sundae":
        return None
    ice_mat = material("V51_Ice", (0.87, 0.98, 1.0, 0.36), roughness=0.08, transmission=0.35, coat=0.45)
    bubble_mat = material("V51_Bubbles", (1.0, 1.0, 1.0, 0.62), roughness=0.06, transmission=0.2)
    prefix = f"Cup_{kind}_{level}_Micro"
    parts = []
    for index, (x, y, z) in enumerate(((-0.26, 0.08, 1.18), (0.24, -0.03, 1.48), (0.08, 0.18, 0.88))):
        parts.append(beveled_box(f"{prefix}_Ice{index}", (x, y, z), (0.36, 0.34, 0.34), 0.065, ice_mat, parent, (0.12 * index, 0.18 * index, 0.24 * index)))
    for index, (x, y, z) in enumerate(((-0.39, -0.22, 1.55), (0.34, -0.18, 1.16), (-0.12, -0.24, 1.78), (0.42, 0.02, 1.67))):
        radius = 0.028 + index * 0.006
        parts.append(sphere(f"{prefix}_Bubble{index}", (x, y, z), (radius, radius, radius), bubble_mat, parent, 10, 7))
    return join(prefix, parts, parent)


def build_juice_details(level: int, parent):
    prefix = f"Cup_juice_{level}_Detail"
    green = material("V51_Mint", (0.08, 0.48, 0.16, 1), roughness=0.48, coat=0.2)
    pale = material("V51_MintLight", (0.24, 0.72, 0.26, 1), roughness=0.48, coat=0.2)
    gold = material("V51_Gold", (0.91, 0.52, 0.08, 1), metallic=0.72, roughness=0.2)
    parts = []
    if level == 0:
        parts += add_citrus(f"{prefix}_Lemon", (0.47, -0.04, 2.16), (0.98, 0.76, 0.05), parent, 1.08)
        parts += [add_leaf(f"{prefix}_Leaf", (-0.18, 0.02, 2.21), (0.2, -0.3, -0.55), (0.30, 0.10, 0.12), pale, parent)]
    elif level == 1:
        parts += add_citrus(f"{prefix}_Orange", (0.48, -0.04, 2.15), (1.0, 0.31, 0.035), parent, 1.08)
        parts += add_straw(f"{prefix}_Straw", (0.33, 0.03, 2.14), parent)
    elif level == 2:
        red = material("V51_Strawberry", (0.96, 0.035, 0.12, 1), roughness=0.28, coat=0.48)
        parts += [sphere(f"{prefix}_Berry", (0.18, -0.02, 2.19), (0.25, 0.22, 0.30), red, parent, 28, 18)]
        parts += [add_leaf(f"{prefix}_Calyx{index}", (0.18 + (index - 1) * 0.08, -0.02, 2.42), (0, index * 0.8, 0.35), (0.13, 0.045, 0.08), green, parent) for index in range(3)]
    elif level == 3:
        parts += add_berry_cluster(f"{prefix}_Grape", (0.03, -0.03, 2.18), (0.31, 0.025, 0.52), parent, 6, 0.125)
        parts += [add_leaf(f"{prefix}_Leaf", (-0.30, 0.01, 2.28), (0.1, 0.4, -0.4), (0.28, 0.10, 0.12), green, parent)]
    elif level == 4:
        parts += add_citrus(f"{prefix}_AppleWheel", (0.46, -0.04, 2.14), (0.24, 0.74, 0.12), parent, 1.04)
        parts += [add_leaf(f"{prefix}_Mint{index}", (-0.20 + index * 0.12, 0.02, 2.19 + index * 0.07), (0.2, index * 0.8, (-1) ** index * 0.45), (0.28, 0.095, 0.12), pale if index % 2 else green, parent) for index in range(3)]
    elif level == 5:
        red = material("V51_Watermelon", (0.96, 0.035, 0.10, 1), roughness=0.35, coat=0.25)
        rind = material("V51_WatermelonRind", (0.04, 0.48, 0.13, 1), roughness=0.5)
        parts += [cylinder(f"{prefix}_Melon", (0.42, -0.04, 2.17), 0.31, 0.075, red, parent, 36, (math.pi / 2, 0, 0)), torus(f"{prefix}_Rind", (0.42, -0.082, 2.17), 0.28, 0.035, rind, parent, (math.pi / 2, 0, 0), 32, 8)]
    else:
        parts += add_berry_cluster(f"{prefix}_Cherry", (0, -0.03, 2.29), (0.86, 0.018, 0.06), parent, 1, 0.14)
        parts += add_citrus(f"{prefix}_CrownCitrus", (0.40, -0.02, 2.18), (1.0, 0.54, 0.04), parent, 0.9)
        parts += [torus(f"{prefix}_Crown", (0, 0, 2.36), 0.28, 0.045, gold, parent, (0, 0, 0), 32, 8)]
        for index in range(5):
            angle = index * math.tau / 5
            parts.append(cone(f"{prefix}_Point{index}", (math.cos(angle) * 0.25, math.sin(angle) * 0.25, 2.49), 0.065, 0, 0.24, gold, parent, 12))
    return join(prefix, parts, parent)


def build_sundae_details(level: int, parent):
    prefix = f"Cup_sundae_{level}_Detail"
    gold = material("V51_Gold", (0.91, 0.52, 0.08, 1), metallic=0.72, roughness=0.2)
    chocolate = material("V51_Chocolate", (0.16, 0.035, 0.018, 1), roughness=0.42, coat=0.16)
    caramel = material("V51_Caramel", (0.82, 0.27, 0.045, 1), roughness=0.27, coat=0.5)
    berry = material("V51_SundaeBerry", (0.78, 0.018, 0.09, 1), roughness=0.21, coat=0.62)
    parts = []
    if level == 0:
        biscuit = material("V51_Biscuit", (0.82, 0.55, 0.23, 1), roughness=0.68)
        parts += [beveled_box(f"{prefix}_Biscuit", (0.28, 0, 2.28), (0.24, 0.09, 0.48), 0.035, biscuit, parent, (0, -0.2, -0.28))]
    elif level == 1:
        parts += [cylinder(f"{prefix}_Flan", (0.08, 0, 2.28), 0.27, 0.20, caramel, parent, 36), cylinder(f"{prefix}_Caramel", (0.08, 0, 2.40), 0.24, 0.035, chocolate, parent, 36)]
    elif level == 2:
        redbean = material("V51_RedBean", (0.36, 0.025, 0.035, 1), roughness=0.31, coat=0.4)
        for index, offset in enumerate(((-0.18, 0, 2.31), (0.02, -0.03, 2.38), (0.20, 0.01, 2.30), (0.10, 0.08, 2.22))):
            parts.append(sphere(f"{prefix}_Bean{index}", offset, (0.105, 0.085, 0.10), redbean, parent, 16, 10))
    elif level == 3:
        cookie = material("V51_Cookie", (0.29, 0.10, 0.055, 1), roughness=0.58)
        parts += [cylinder(f"{prefix}_Cookie", (0.22, -0.02, 2.30), 0.29, 0.09, cookie, parent, 30, (math.pi / 2, 0, 0))]
        for index in range(5):
            angle = index * math.tau / 5
            parts.append(sphere(f"{prefix}_Chip{index}", (0.22 + math.cos(angle) * 0.15, -0.075, 2.30 + math.sin(angle) * 0.15), (0.035, 0.018, 0.035), chocolate, parent, 10, 6))
    elif level == 4:
        parts += add_berry_cluster(f"{prefix}_Blueberry", (0, -0.02, 2.30), (0.12, 0.07, 0.54), parent, 5, 0.12)
        crumb = material("V51_CheeseCrumb", (0.92, 0.67, 0.25, 1), roughness=0.72)
        parts += [beveled_box(f"{prefix}_Crumb", (0.36, 0.02, 2.24), (0.18, 0.11, 0.22), 0.025, crumb, parent, (0.1, -0.3, 0.3))]
    elif level == 5:
        parts += add_berry_cluster(f"{prefix}_Cherry", (0.02, -0.02, 2.34), (0.80, 0.015, 0.07), parent, 1, 0.145)
        parts += [beveled_box(f"{prefix}_ChocolateShard{index}", ((index - 1) * 0.22, 0.04, 2.30 + (index % 2) * 0.08), (0.12, 0.07, 0.42), 0.015, chocolate, parent, (0.1, index * 0.3, (index - 1) * 0.32)) for index in range(3)]
    else:
        pastel = material("V51_RoyalPastel", (0.95, 0.38, 0.76, 1), roughness=0.2, coat=0.62, emission=(0.95, 0.24, 0.68, 1), emission_strength=0.025)
        parts += [torus(f"{prefix}_Halo", (0, 0, 2.34), 0.31, 0.045, pastel, parent, (0, 0, 0), 36, 9), add_star(f"{prefix}_Star", (0, -0.05, 2.55), 0.22, gold, parent)]
    return join(prefix, parts, parent)


def build_wine_details(level: int, parent):
    prefix = f"Cup_wine_{level}_Detail"
    silver = material("V51_Silver", (0.78, 0.90, 0.96, 1), metallic=0.78, roughness=0.16)
    gold = material("V51_Gold", (0.91, 0.52, 0.08, 1), metallic=0.72, roughness=0.2)
    herb = material("V51_Herb", (0.06, 0.43, 0.16, 1), roughness=0.52)
    rose = material("V51_Rose", (0.92, 0.09, 0.30, 1), roughness=0.34, coat=0.26)
    parts = []
    rim_mat = [silver, material("V51_LavenderMetal", (0.46, 0.25, 0.76, 1), metallic=0.42, roughness=0.22), rose, silver, herb, gold, silver][level]
    parts.append(torus(f"{prefix}_Rim", (0, 0, MODEL_HEIGHT + 0.018), MODEL_RADIUS * 0.96, 0.026, rim_mat, parent, (0, 0, 0), 48, 8))
    if level == 0:
        for index in range(8):
            angle = index * math.tau / 8
            parts.append(sphere(f"{prefix}_Crystal{index}", (math.cos(angle) * 0.87, math.sin(angle) * 0.87, 2.22), (0.035, 0.035, 0.05), silver, parent, 10, 7))
    elif level == 1:
        lavender = material("V51_Lavender", (0.39, 0.20, 0.68, 1), roughness=0.52)
        parts.append(cylinder(f"{prefix}_Stem", (-0.23, 0, 2.28), 0.025, 0.53, herb, parent, 10, (0, -0.48, 0)))
        for index in range(5):
            parts.append(sphere(f"{prefix}_Bud{index}", (-0.34 + index * 0.10, -0.01, 2.14 + index * 0.105), (0.05, 0.04, 0.07), lavender, parent, 12, 8))
    elif level == 2:
        lychee = material("V51_Lychee", (1.0, 0.84, 0.83, 1), roughness=0.31, coat=0.34)
        parts += [sphere(f"{prefix}_Lychee{index}", ((index - 1) * 0.18, -0.02, 2.20 + (index % 2) * 0.10), (0.105, 0.10, 0.105), lychee, parent, 18, 12) for index in range(3)]
        parts += [add_leaf(f"{prefix}_Petal{index}", (0.28 + index * 0.06, -0.01, 2.30 + index * 0.04), (0.2, index, 0.5), (0.20, 0.065, 0.09), rose, parent) for index in range(3)]
    elif level == 3:
        star_mat = material("V51_StarGlow", (0.42, 0.68, 1.0, 1), metallic=0.25, roughness=0.16, emission=(0.2, 0.44, 1.0, 1), emission_strength=0.18)
        for index, point in enumerate(((-0.25, -0.03, 2.18), (0.08, -0.04, 2.31), (0.34, -0.02, 2.16))):
            parts.append(add_star(f"{prefix}_Star{index}", point, 0.10 + index * 0.015, star_mat, parent))
    elif level == 4:
        parts.append(cylinder(f"{prefix}_Sprig", (-0.17, 0, 2.28), 0.025, 0.62, herb, parent, 10, (0, -0.52, 0)))
        for index in range(4):
            parts.append(add_leaf(f"{prefix}_Leaf{index}", (-0.34 + index * 0.12, 0, 2.10 + index * 0.12), (0.2, index * 0.6, (-1) ** index * 0.5), (0.17, 0.055, 0.075), herb, parent))
    elif level == 5:
        gem = material("V51_PomegranateGem", (0.82, 0.01, 0.10, 1), roughness=0.12, coat=0.72)
        parts += add_berry_cluster(f"{prefix}_Gems", (0.02, -0.02, 2.24), (0.82, 0.01, 0.10), parent, 6, 0.10)
        parts.append(torus(f"{prefix}_GemHalo", (0, 0, 2.31), 0.25, 0.025, gem, parent, (0, 0, 0), 28, 7))
    else:
        aurora = material("V51_Aurora", (0.18, 0.86, 0.90, 1), metallic=0.42, roughness=0.12, emission=(0.24, 0.68, 1.0, 1), emission_strength=0.14)
        parts += [torus(f"{prefix}_Orbit{index}", (0, 0, 2.28 + index * 0.10), 0.26 + index * 0.06, 0.026, aurora if index % 2 else silver, parent, (0.14 * index, 0.20 * index, 0), 36, 8) for index in range(3)]
        parts.append(add_star(f"{prefix}_Crown", (0, -0.05, 2.55), 0.19, gold, parent))
    return join(prefix, parts, parent)


def build_cups(output: Path) -> None:
    shells = build_shell_meshes()
    glass = glass_material()
    for kind, palette in (("juice", JUICE_COLORS), ("sundae", SUNDAE_COLORS), ("wine", WINE_COLORS)):
        for level, color in enumerate(palette):
            parent = empty(f"Cup_{kind}_{level}")
            shell = mesh_object(f"Cup_{kind}_{level}_Glass", shells[kind], glass, parent)
            shell["role"] = "glass"
            liquid = material(
                f"V51_{kind.title()}Liquid{level + 1}",
                color,
                roughness=0.15 if kind != "sundae" else 0.26,
                transmission=0.07 if kind != "sundae" else 0.0,
                coat=0.46,
                emission=color,
                emission_strength=0.02 if level < 5 else 0.055,
            )
            liquid_object = build_liquid(kind, level, parent, liquid)
            liquid_object["role"] = "liquid"
            micro = build_micro_details(kind, level, parent)
            if micro:
                micro["role"] = "micro"
            if kind == "juice":
                detail = build_juice_details(level, parent)
            elif kind == "sundae":
                detail = build_sundae_details(level, parent)
            else:
                detail = build_wine_details(level, parent)
            if detail:
                detail["role"] = "detail"
            parent["kind"] = kind
            parent["level"] = level
            parent["model_radius"] = MODEL_RADIUS
            parent["model_height"] = MODEL_HEIGHT

    export_glb(output / "cups-v51.glb")


def add_lane_vein(name, points, width, height, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = width
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location.z = height
    obj.data.materials.append(mat)
    return obj


def build_lane(output: Path) -> None:
    lane = SPEC["lane"]
    width = float(lane["width"])
    length = float(lane["length"])
    rail_x = float(lane["railCenterX"])
    marble = material("V51_IvoryQuartz", (0.91, 0.72, 0.43, 1), roughness=0.19, coat=0.32)
    marble_light = material("V51_QuartzVein", (1.0, 0.86, 0.58, 0.68), metallic=0.08, roughness=0.24)
    wood = material("V51_HoneyWalnut", (0.28, 0.055, 0.015, 1), roughness=0.24, coat=0.28)
    wood_light = material("V51_WalnutHighlight", (0.56, 0.18, 0.035, 1), roughness=0.29, coat=0.22)
    wood_dark = material("V51_DarkWalnut", (0.075, 0.012, 0.006, 1), roughness=0.32)
    brass = material("V51_BrushedBrass", (0.88, 0.43, 0.055, 1), metallic=0.82, roughness=0.17)
    brass_glow = material("V51_WarmInlay", (1.0, 0.49, 0.075, 1), metallic=0.38, roughness=0.14, emission=(1.0, 0.24, 0.025, 1), emission_strength=0.16)
    cream = material("V51_PaddedCream", (0.95, 0.78, 0.51, 1), roughness=0.31, coat=0.12)
    objects = [
        beveled_box("LaneSurface", (0, 0, -float(lane["surfaceThickness"]) / 2), (width, length, float(lane["surfaceThickness"])), 0.075, marble),
        beveled_box("LeftRail", (-rail_x, 0, 0.25), (float(lane["railWidth"]), length + 0.30, float(lane["railHeight"])), 0.11, wood),
        beveled_box("RightRail", (rail_x, 0, 0.25), (float(lane["railWidth"]), length + 0.30, float(lane["railHeight"])), 0.11, wood),
        beveled_box("LeftRailCap", (-rail_x, 0, 0.63), (float(lane["railWidth"]) + 0.055, length + 0.30, 0.075), 0.035, wood_light),
        beveled_box("RightRailCap", (rail_x, 0, 0.63), (float(lane["railWidth"]) + 0.055, length + 0.30, 0.075), 0.035, wood_light),
        beveled_box("LeftTrim", (-2.77, 0, 0.115), (0.055, length, 0.13), 0.025, brass),
        beveled_box("RightTrim", (2.77, 0, 0.115), (0.055, length, 0.13), 0.025, brass),
        beveled_box("LeftOuter", (-3.21, 0, 0.12), (0.085, length + 0.42, 0.34), 0.035, wood_dark),
        beveled_box("RightOuter", (3.21, 0, 0.12), (0.085, length + 0.42, 0.34), 0.035, wood_dark),
        beveled_box("FrontWall", (0, -float(lane["frontWallCenterZ"]), float(lane["frontWallCenterY"])), (float(lane["frontWallWidth"]), float(lane["frontWallDepth"]), float(lane["frontWallHeight"])), 0.12, wood),
        beveled_box("FrontInset", (0, -float(lane["frontWallCenterZ"]) - 0.20, 0.65), (4.86, 0.075, 0.72), 0.04, cream),
        beveled_box("FrontGlow", (0, -float(lane["frontWallCenterZ"]) - 0.25, 1.18), (4.10, 0.055, 0.065), 0.025, brass_glow),
        beveled_box("Apron", (0, -float(lane["nearBumperCenterZ"]) - 0.14, -0.05), (6.26, 0.62, 0.34), 0.12, wood_dark),
        beveled_box("LaunchInlay", (0, -8.88, 0.018), (3.72, 0.035, 0.022), 0.01, brass_glow),
    ]
    for index in range(7):
        y = -8.4 + index * 2.85
        objects.append(beveled_box(f"LeftRailBand{index}", (-rail_x, y, 0.64), (0.39, 0.035, 0.025), 0.008, brass))
        objects.append(beveled_box(f"RightRailBand{index}", (rail_x, y, 0.64), (0.39, 0.035, 0.025), 0.008, brass))
    vein_sets = [
        [(-1.9, -8.7, 0), (-0.8, -5.1, 0), (-1.3, -1.0, 0), (0.1, 3.2, 0), (-0.6, 8.4, 0)],
        [(1.7, -9.0, 0), (1.0, -5.8, 0), (1.6, -2.1, 0), (0.7, 1.7, 0), (1.3, 6.8, 0), (0.8, 9.1, 0)],
        [(-0.3, -8.8, 0), (0.3, -4.2, 0), (-0.2, -0.2, 0), (0.35, 4.4, 0), (0.1, 8.9, 0)],
    ]
    for index, points in enumerate(vein_sets):
        objects.append(add_lane_vein(f"LaneVein{index}", points, 0.013 + index * 0.003, 0.016, marble_light))
    for obj in objects:
        obj["asset_version"] = ASSET_VERSION
        obj["collision_aligned"] = obj.name in {"LaneSurface", "LeftRail", "RightRail", "FrontWall", "Apron"}
    export_glb(output / "lane-v51.glb")


def export_glb(path: Path) -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_extras=True,
        export_meshopt_compression_enable=True,
        export_meshopt_extension="EXT_meshopt_compression",
        export_cameras=False,
        export_lights=False,
    )


def main() -> None:
    args = parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    reset_scene()
    build_cups(output)
    reset_scene()
    build_lane(output)
    total = (output / "cups-v51.glb").stat().st_size + (output / "lane-v51.glb").stat().st_size
    print(f"V{ASSET_VERSION} assets written to {output} ({total / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
