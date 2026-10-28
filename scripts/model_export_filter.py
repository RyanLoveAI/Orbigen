"""Export surface geometry; Blender atmosphere volumes have no GLB surface."""

def volume_only_material(material):
    if not material or not material.use_nodes or not material.node_tree:
        return False
    outputs = [n for n in material.node_tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output]
    return bool(outputs) and all(n.inputs['Volume'].is_linked and not n.inputs['Surface'].is_linked for n in outputs)

def volume_only_mesh(obj):
    if obj.type != 'MESH' or not obj.data.polygons:
        return False
    used = {p.material_index for p in obj.data.polygons}
    return all(i < len(obj.material_slots) and volume_only_material(obj.material_slots[i].material) for i in used)

def prepare_surface_export(scene):
    excluded = []
    for obj in scene.objects:
        if volume_only_mesh(obj):
            # In-memory visibility only. Never save over the source .blend.
            obj.hide_render = True
            excluded.append({'name': obj.name, 'reason': 'volume-only'})
        elif obj.type == 'MESH' and obj.hide_render:
            excluded.append({'name': obj.name, 'reason': 'render-hidden'})
    return {'version': 1, 'policy': 'active-scene-renderable-surfaces', 'excluded': excluded}
