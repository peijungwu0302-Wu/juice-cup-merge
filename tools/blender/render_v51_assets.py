"""Render the V5.1 approval sheets and isolated HUD icons from exported GLBs."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default="public/models")
    parser.add_argument("--output", default="outputs")
    parser.add_argument("--icons", default="public/icons/v51")
    parser.add_argument("--mode", choices=("all", "cups", "lane", "icons"), default="all")
    return parser.parse_args(raw)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name, color, metallic=0.0, roughness=0.3, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = emission
        shader.inputs["Emission Strength"].default_value = strength
    return mat


def setup_render(width, height, *, transparent=False, samples=64):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 48
    scene.render.use_file_extension = True
    scene.render.film_transparent = transparent
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_percentage = 100
    # Blender 5.2 keeps TAA settings on the scene; use a moderate sample count.
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = samples
    world = scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.055, 0.022, 0.012, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.24


def add_lights(scale=1.0):
    specs = [
        ("Key", "AREA", (-5, -5, 9), 1200 * scale, (1.0, 0.78, 0.48), 5.5),
        ("Fill", "AREA", (5, -3, 5), 850 * scale, (0.58, 0.78, 1.0), 4.0),
        ("Rim", "AREA", (0, 5, 7), 1050 * scale, (1.0, 0.38, 0.12), 3.0),
    ]
    for name, kind, location, energy, color, size in specs:
        bpy.ops.object.light_add(type=kind, location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, 0, 2.5))


def descendants(root):
    result = []
    stack = list(root.children)
    while stack:
        obj = stack.pop()
        result.append(obj)
        stack.extend(obj.children)
    return result


def cup_roots():
    return [obj for obj in bpy.context.scene.objects if obj.parent is None and obj.name.startswith("Cup_")]


def set_root_visible(root, visible):
    root.hide_render = not visible
    root.hide_viewport = not visible
    for child in descendants(root):
        child.hide_render = not visible
        child.hide_viewport = not visible


def add_text(body, location, size, color, align="CENTER"):
    bpy.ops.object.text_add(location=location, rotation=(math.pi / 2, 0, 0))
    text = bpy.context.object
    text.data.body = body
    text.data.align_x = align
    text.data.size = size
    text.data.extrude = 0.01
    text.data.bevel_depth = 0.006
    text.data.materials.append(material(f"Text_{body}_{location}", color, roughness=0.35))
    return text


def render_cup_pack(models: Path, output: Path):
    clear()
    bpy.ops.import_scene.gltf(filepath=str(models / "cups-v51.glb"))
    roots = {obj.name: obj for obj in cup_roots()}
    for root in roots.values():
        set_root_visible(root, False)
    selected = []
    for row, kind in enumerate(("juice", "sundae", "wine")):
        for column, level in enumerate((0, 3, 6)):
            root = roots[f"Cup_{kind}_{level}"]
            set_root_visible(root, True)
            root.location = ((column - 1) * 2.85, 0, (2 - row) * 3.05)
            selected.append(root)
    setup_render(1700, 1100, samples=96)
    backdrop = material("PackBackdrop", (0.12, 0.035, 0.017, 1), roughness=0.42)
    gold = material("PackGold", (0.91, 0.48, 0.10, 1), metallic=0.35, roughness=0.25)
    bpy.ops.mesh.primitive_plane_add(size=26, location=(0, 1.1, 4.1), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(backdrop)
    for z in (0, 3.05, 6.10):
        bpy.ops.mesh.primitive_cube_add(location=(0, 0.35, z - 0.05))
        shelf = bpy.context.object
        shelf.dimensions = (9.4, 1.15, 0.10)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        shelf.data.materials.append(gold)
    for row, label in enumerate(("JUICE BAR", "SUNDAE ATELIER", "CRYSTAL CELLAR")):
        add_text(label, (-6.25, -0.08, (2 - row) * 3.05 + 1.0), 0.23, (1.0, 0.69, 0.27, 1), "LEFT")
    for column, label in enumerate(("LEVEL 01", "LEVEL 04", "LEVEL 07")):
        add_text(label, ((column - 1) * 2.85, -0.08, 8.83), 0.24, (1.0, 0.83, 0.58, 1))
    add_lights()
    bpy.ops.object.camera_add(location=(0, -18, 5.0))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 12.2
    look_at(camera, (0, 0, 4.35))
    bpy.context.scene.camera = camera
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def add_preview_environment():
    walnut = material("PreviewWalnut", (0.16, 0.028, 0.009, 1), roughness=0.28)
    cream = material("PreviewCream", (0.77, 0.45, 0.21, 1), roughness=0.44)
    teal = material("PreviewGlass", (0.19, 0.46, 0.52, 1), metallic=0.08, roughness=0.18)
    green = material("PreviewGreen", (0.08, 0.33, 0.12, 1), roughness=0.58)
    bpy.ops.mesh.primitive_cube_add(location=(0, 12.6, 3.2))
    wall = bpy.context.object
    wall.dimensions = (17, 0.5, 7.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    wall.data.materials.append(walnut)
    bpy.ops.mesh.primitive_cube_add(location=(0, 12.25, 3.5))
    inset = bpy.context.object
    inset.dimensions = (7.6, 0.18, 4.7)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    inset.data.materials.append(teal)
    for x in (-3.8, 3.8):
        bpy.ops.mesh.primitive_cube_add(location=(x, 5.0, 0.10))
        counter = bpy.context.object
        counter.dimensions = (2.4, 15.0, 0.8)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        counter.data.materials.append(cream)
        for y in (-4.5, 0.5, 5.5):
            bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.72, depth=0.72, location=(x, y, 0.75))
            pot = bpy.context.object
            pot.data.materials.append(walnut)
            for index in range(7):
                angle = index * math.tau / 7
                bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=9, location=(x + math.cos(angle) * 0.40, y + math.sin(angle) * 0.30, 1.55 + (index % 3) * 0.14))
                leaf = bpy.context.object
                leaf.scale = (0.30, 0.10, 0.72)
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                leaf.data.materials.append(green)


def render_lane_pack(models: Path, output: Path):
    clear()
    bpy.ops.import_scene.gltf(filepath=str(models / "lane-v51.glb"))
    bpy.ops.import_scene.gltf(filepath=str(models / "cups-v51.glb"))
    roots = {obj.name: obj for obj in cup_roots()}
    for root in roots.values():
        set_root_visible(root, False)
    placements = [
        ("Cup_juice_0", -0.9, -7.8, 1.0),
        ("Cup_juice_2", 1.1, -3.3, 1.12),
        ("Cup_sundae_3", -1.2, 0.6, 1.25),
        ("Cup_wine_5", 1.2, 4.4, 1.36),
        ("Cup_juice_6", 0.0, 7.2, 1.50),
    ]
    for name, x, y, scale in placements:
        root = roots[name]
        set_root_visible(root, True)
        root.location = (x, y, 0.02)
        root.scale = (scale, scale, scale)
        root.rotation_euler.z = (x + y) * 0.08
    setup_render(1000, 1500, samples=96)
    add_preview_environment()
    add_lights(1.35)
    bpy.ops.object.light_add(type="AREA", location=(0, 10.5, 5.4))
    far_light = bpy.context.object
    far_light.data.energy = 1250
    far_light.data.color = (1.0, 0.42, 0.08)
    far_light.data.shape = "RECTANGLE"
    far_light.data.size = 5.0
    look_at(far_light, (0, 3.5, 0.4))
    bpy.ops.object.camera_add(location=(7.2, -15.8, 13.4))
    camera = bpy.context.object
    camera.data.lens = 56
    look_at(camera, (0, 0.9, 0.45))
    bpy.context.scene.camera = camera
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def render_icons(models: Path, icons_dir: Path):
    clear()
    bpy.ops.import_scene.gltf(filepath=str(models / "cups-v51.glb"))
    roots = {obj.name: obj for obj in cup_roots()}
    for root in roots.values():
        set_root_visible(root, False)
    setup_render(180, 230, transparent=True, samples=48)
    add_lights(0.75)
    bpy.ops.object.camera_add(location=(4.8, -7.2, 3.8))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.15
    look_at(camera, (0, 0, 1.18))
    bpy.context.scene.camera = camera
    icons_dir.mkdir(parents=True, exist_ok=True)
    for kind in ("juice", "sundae", "wine"):
        for level in range(7):
            root = roots[f"Cup_{kind}_{level}"]
            set_root_visible(root, True)
            scene = bpy.context.scene
            scene.render.filepath = str(icons_dir / f"{kind}-{level + 1}.png")
            bpy.ops.render.render(write_still=True)
            set_root_visible(root, False)


def main():
    options = parse_args()
    models = Path(options.models).resolve()
    output = Path(options.output).resolve()
    if options.mode in ("all", "cups"):
        render_cup_pack(models, output / "v51-cup-art-pack.png")
    if options.mode in ("all", "lane"):
        render_lane_pack(models, output / "v51-lane-art-pack.png")
    if options.mode in ("all", "icons"):
        render_icons(models, Path(options.icons).resolve())
    print(f"V5.1 art pack and 21 isolated HUD icons written to {output}")


if __name__ == "__main__":
    main()
