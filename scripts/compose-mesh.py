# Derived mesh for repeated construction. Preserve source textures and UVs.
import bpy, sys
source, target = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
triangles = sum(sum(max(0, len(p.vertices)-2) for p in o.data.polygons) for o in meshes)
ratio = min(1.0, 18000 / max(1, triangles))
for obj in meshes:
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Construction mesh', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.export_scene.gltf(filepath=target, export_format='GLB', export_animations=False, export_skins=False, export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=False)
