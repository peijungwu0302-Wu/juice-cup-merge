"""Render a quick QA sheet for the three exported V5 base cup silhouettes."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default="public/models")
    parser.add_argument("--output", default="outputs/v5-model-preview.png")
    return parser.parse_args(raw)


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def principled(name, color, metallic=0.0, roughness=0.25, transmission=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, alpha)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, alpha)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Transmission Weight"].default_value = transmission
    shader.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        mat.surface_render_method = "DITHERED"
    return mat


def main():
    options = args()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(Path(options.models).resolve() / "cups-v5.glb"))

    glass = principled("PreviewGlass", (0.86, 0.97, 1.0), roughness=0.05, transmission=0.62, alpha=0.42)
    colors = [(0.98, 0.63, 0.08), (0.82, 0.24, 0.32), (0.23, 0.33, 0.89)]
    positions = [-2.4, 0, 2.4]
    names = ["JuiceShell", "SundaeShell", "WineShell"]
    for name, x in zip(names, positions):
        cup = bpy.data.objects.get(name)
        cup.location.x = x
        cup.data.materials.clear()
        cup.data.materials.append(glass)
        if name == "JuiceShell":
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.73, depth=1.55, location=(x, 0, 1.03))
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=(x, 0, 1.48))
            bpy.context.object.scale = (0.78, 0.78, 0.48 if name == "WineShell" else 0.62)
        liquid = bpy.context.object
        liquid.name = f"{name}PreviewLiquid"
        liquid.data.materials.append(principled(f"{name}Liquid", colors[names.index(name)], roughness=0.16, transmission=0.06))

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.02))
    floor = bpy.context.object
    floor.data.materials.append(principled("PreviewFloor", (0.72, 0.43, 0.2), roughness=0.4))

    world = bpy.context.scene.world
    world.color = (0.06, 0.035, 0.02)
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.12, 0.055, 0.022, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.38

    bpy.ops.object.light_add(type="AREA", location=(-4, -4, 6))
    bpy.context.object.data.energy = 950
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 5
    look_at(bpy.context.object, (0, 0, 1))
    bpy.ops.object.light_add(type="AREA", location=(5, -2, 3))
    bpy.context.object.data.energy = 700
    bpy.context.object.data.color = (1.0, 0.46, 0.18)
    bpy.context.object.data.size = 3
    look_at(bpy.context.object, (0, 0, 1))

    bpy.ops.object.camera_add(location=(7.1, -8.4, 4.2))
    camera = bpy.context.object
    look_at(camera, (0, 0, 1.1))
    camera.data.lens = 58
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 520
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    output = Path(options.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output)
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)
    print(f"Preview written to {output}")


if __name__ == "__main__":
    main()
