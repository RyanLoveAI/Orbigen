import bpy
import os
import sys
import json
sys.path.insert(0, os.path.dirname(__file__))
from model_export_filter import prepare_surface_export

source, target = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
if source.lower().endswith('.blend'):
    # Load geometry without running embedded scripts or restoring the source UI.
    # Export below writes a separate preview; never save over the .blend source.
    bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
elif source.lower().endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath=source, use_image_search=True)
elif source.lower().endswith('.obj'):
    bpy.ops.wm.obj_import(filepath=source)
elif source.lower().endswith('.stl'):
    bpy.ops.wm.stl_import(filepath=source)
elif source.lower().endswith('.ply'):
    bpy.ops.wm.ply_import(filepath=source)
else:
    bpy.ops.import_scene.gltf(filepath=source)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
if not meshes:
    raise RuntimeError('Model contains no mesh')
# Missing external images must not silently become an untextured preview.
for image in bpy.data.images:
    if image.source == 'FILE' and not image.packed_file and not os.path.isfile(bpy.path.abspath(image.filepath)):
        raise RuntimeError('Missing texture: ' + image.name)
report = prepare_surface_export(bpy.context.scene)
bpy.ops.export_scene.gltf(filepath=target, export_format='GLB', use_active_scene=True, use_renderable=True, export_apply=source.lower().endswith('.blend'), export_animations=False, export_skins=False, export_cameras=False, export_lights=False, export_draco_mesh_compression_enable=False)
with open(target + '.conversion.json', 'w', encoding='utf-8') as stream:
    json.dump(report, stream, ensure_ascii=False, indent=2)
print('ORBIGEN_CONVERSION_REPORT', json.dumps(report, ensure_ascii=False))
