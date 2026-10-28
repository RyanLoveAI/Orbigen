"""Orbigen's local Blender worker. Model replies are data, never Python source."""
import bpy, sys, os, json, math, hashlib, struct
from pathlib import Path
from mathutils import Matrix, Vector, Euler
MODE, DIRECTORY = sys.argv[sys.argv.index('--') + 1:][:2]
ROOT = Path(DIRECTORY).resolve()
MANIFEST = json.loads((ROOT / 'manifest.json').read_text())
C = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
CI = C.inverted()
LOCKS = {i['id'] for i in MANIFEST['project']['instances'] if i['locked']}
def write(name, value):
    file = ROOT / name
    temp = ROOT / (name + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False))
    os.replace(temp, file)
def key(obj): return obj.get('orbigen_id', obj.get('instanceId'))
def scene_file(file):
    # Three.js displays the GLB's default scene. Blender imports every scene;
    # narrow only the session copy's scene list without touching source data.
    data=file.read_bytes()
    size,kind=struct.unpack_from('<II',data,12)
    if kind!=0x4e4f534a: raise ValueError('GLB 缺少模型描述')
    doc=json.loads(data[20:20+size])
    scene=doc['scenes'][doc.get('scene',0)]
    reached=set()
    def visit(index):
        if index in reached: return
        reached.add(index)
        for child in doc['nodes'][index].get('children',[]): visit(child)
    for index in scene.get('nodes',[]): visit(index)
    # Importer node creation includes unreferenced nodes too. Retain only this
    # scene's hierarchy and any joints required by its meshes.
    used_skins={doc['nodes'][i]['skin'] for i in reached if 'skin' in doc['nodes'][i]}
    for index in used_skins:
        skin=doc['skins'][index]
        for joint in skin['joints']: visit(joint)
        if 'skeleton' in skin: visit(skin['skeleton'])
    if len(doc.get('scenes',[]))==1 and len(reached)==len(doc['nodes']): return file
    order=sorted(reached); mapping={old:new for new,old in enumerate(order)}
    skin_map={old:new for new,old in enumerate(sorted(used_skins))}
    nodes=[]
    for index in order:
        node=doc['nodes'][index]
        if 'children' in node: node['children']=[mapping[i] for i in node['children']]
        if 'skin' in node: node['skin']=skin_map[node['skin']]
        nodes.append(node)
    skins=[]
    for index in sorted(used_skins):
        skin=doc['skins'][index]; skin['joints']=[mapping[i] for i in skin['joints']]
        if 'skeleton' in skin: skin['skeleton']=mapping[skin['skeleton']]
        skins.append(skin)
    if 'skins' in doc: doc['skins']=skins
    for animation in doc.get('animations',[]):
        channels=[]
        for channel in animation.get('channels',[]):
            target=channel.get('target',{})
            if target.get('node') in mapping:
                target['node']=mapping[target['node']]; channels.append(channel)
        animation['channels']=channels
    doc['nodes']=nodes; doc['scenes']=[{**scene,'nodes':[mapping[i] for i in scene.get('nodes',[])]}]; doc['scene']=0
    encoded=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode()
    encoded+=b' '*((-len(encoded))%4)
    rest=data[20+size:]
    target=file.with_name(file.stem+'-default-scene.glb')
    target.write_bytes(struct.pack('<IIIII',0x46546c67,2,20+len(encoded)+len(rest),len(encoded),0x4e4f534a)+encoded+rest)
    return target
def roots(): return {key(o):o for o in bpy.context.scene.objects if key(o)}
def meshes(obj): return [o for o in [obj, *obj.children_recursive] if o.type == 'MESH']
def bounds(objects):
    points = [CI @ (o.matrix_world @ Vector(p)) for o in objects for p in o.bound_box]
    if not points: raise ValueError('模型没有可用网格')
    return [[min(p[k] for p in points) for k in range(3)], [max(p[k] for p in points) for k in range(3)]]
def inventory():
    bpy.context.view_layer.update()
    result=[]
    for id,o in roots().items():
        ms=meshes(o)
        if not ms: continue
        b=bounds(ms); loc,rot,scale=(CI @ o.matrix_world @ C).decompose()
        result.append(dict(id=id,name=o.name,assetId=o.get('assetId'),locked=id in LOCKS,position=list(loc),rotation=list(rot.to_euler('XYZ')),scale=list(scale),bounds=b,dimensions=[b[1][k]-b[0][k] for k in range(3)],vertices=sum(len(m.data.vertices) for m in ms),materials=list({slot.material.name for m in ms for slot in m.material_slots if slot.material})))
    write('inventory.json', result)
def obj(id):
    o=roots().get(id)
    if o is None: raise ValueError('组件不存在：'+id)
    if id in LOCKS: raise ValueError('组件已锁定：'+id)
    return o
def clone(source, id, offset, independent_data=True):
    if id in roots(): raise ValueError('组件 ID 已存在：'+id)
    def copy(o,parent=None):
        n=o.copy()
        if o.data and independent_data: n.data=o.data.copy()
        bpy.context.scene.collection.objects.link(n)
        n.parent=parent
        n.matrix_basis=o.matrix_basis.copy()
        for child in o.children: copy(child,n)
        return n
    n=copy(source); n.matrix_world=source.matrix_world.copy()
    n.location += (C @ Vector(offset)).to_3d()
    n['orbigen_id']=id; n['instanceId']=id; n.name=id
    return n
def apply(operations):
    for op in operations:
        kind=op['kind']; id=op['id']
        if kind=='add_asset':
            if id in roots(): raise ValueError('组件 ID 已存在：'+id)
            asset=next((a for a in MANIFEST['assets'] if a['id']==op['assetId']),None)
            if asset is None: raise ValueError('素材未准备，请在工作台更新素材')
            before=set(bpy.context.scene.objects)
            bpy.ops.import_scene.gltf(filepath=str(scene_file(ROOT/asset['file'])))
            imported=set(bpy.context.scene.objects)-before
            b=bounds([o for o in imported if o.type=='MESH'])
            root=bpy.data.objects.new(id,None); bpy.context.scene.collection.objects.link(root)
            root['orbigen_id']=id; root['assetId']=asset['id']
            inner=bpy.data.objects.new(id+' normalized',None); bpy.context.scene.collection.objects.link(inner); inner.parent=root
            anchor=Vector(((b[0][0]+b[1][0])/2,b[0][1],(b[0][2]+b[1][2])/2))
            inner.matrix_basis=C @ Matrix.Translation(-anchor) @ CI
            for item in imported:
                for k in ('instanceId','orbigen_id'):
                    if k in item: del item[k]
                if item.parent not in imported:
                    world=item.matrix_world.copy(); item.parent=inner; item.matrix_basis=world
            root.matrix_world=C @ Matrix.LocRotScale(Vector(op['position']),Euler(op['rotation'],'XYZ'),Vector([v*asset['unitScale'] for v in op['scale']])) @ CI
        elif kind in ('duplicate','array'):
            source=obj(op['sourceId'])
            for n in range(op.get('count',1)):
                clone(source, id if kind=='duplicate' else id+'-'+str(n+1), [v*(n+1) for v in op['offset']])
        elif kind=='mesh':
            if id in roots(): raise ValueError('组件 ID 已存在：'+id)
            source=obj(op['materialFrom']); data=bpy.data.meshes.new(id)
            data.from_pydata([tuple(C @ Vector(v)) for v in op['vertices']], [], op['faces']); data.update()
            o=bpy.data.objects.new(id,data); bpy.context.scene.collection.objects.link(o); o['orbigen_id']=id
            for m in meshes(source):
                if m.data.materials:
                    for mat in m.data.materials: data.materials.append(mat)
                    break
        else:
            o=obj(id)
            if kind=='remove':
                for item in [*o.children_recursive,o]: bpy.data.objects.remove(item,do_unlink=True)
            elif kind=='transform':
                p,r,s=(CI @ o.matrix_world @ C).decompose()
                p=Vector(op.get('position',p)); r=Euler(op.get('rotation',r.to_euler('XYZ')), 'XYZ'); s=Vector(op.get('scale',s))
                o.matrix_world=C @ Matrix.LocRotScale(p,r,s) @ CI
            elif kind in ('deform','bevel'):
                for m in meshes(o):
                    m.data=m.data.copy()
                    if kind=='deform':
                        mod=m.modifiers.new('Orbigen local shaping','SIMPLE_DEFORM'); mod.deform_method=op['mode']; mod.deform_axis={'X':'X','Y':'Z','Z':'Y'}[op['axis']]; mod.factor=op['amount']
                    else:
                        mod=m.modifiers.new('Orbigen bevel','BEVEL'); mod.width=op['width']; mod.segments=op['segments']
        bpy.context.view_layer.update()
    ms=[o for o in bpy.context.scene.objects if o.type=='MESH']
    if not ms or len(roots())>200 or sum(len(o.data.polygons) for o in ms)>6000000: raise ValueError('结果为空或超过制作上限')
def export_result():
    bpy.context.view_layer.update()
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    if not objects: raise ValueError('场景没有网格')
    # Evaluated bounds include modifiers and match the GLB actually exported.
    deps=bpy.context.evaluated_depsgraph_get(); b=bounds([o.evaluated_get(deps) for o in objects])
    target=ROOT/'result-next.glb'
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    if target.stat().st_size>256*1024*1024: raise ValueError('回传超过 256 MB，请先减面或压缩贴图')
    inventory()
    sha=hashlib.sha256(target.read_bytes()).hexdigest()
    os.replace(target,ROOT/'result.glb')
    write('ready.json',dict(sha=sha,bounds=b))
if MODE=='prepare':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if MANIFEST.get('sceneSource')=='assets':
        sources={a['instanceId']:a for a in MANIFEST['instanceAssets']}
        templates={}
        for instance in MANIFEST['project']['instances']:
            id=instance['id']; asset=sources[id]
            signature=(asset['sha'],tuple(asset.get('dimensions') or []))
            if signature in templates:
                root=clone(templates[signature],id,[0,0,0],independent_data=False)
            else:
                before=set(bpy.context.scene.objects)
                bpy.ops.import_scene.gltf(filepath=str(scene_file(ROOT/asset['file'])))
                imported=set(bpy.context.scene.objects)-before
                bpy.context.view_layer.update()
                b=bounds([o for o in imported if o.type=='MESH'])
                anchor=Vector(((b[0][0]+b[1][0])/2,b[0][1],(b[0][2]+b[1][2])/2))
                root=bpy.data.objects.new(id,None); bpy.context.scene.collection.objects.link(root)
                inner=bpy.data.objects.new(id+' normalized',None); bpy.context.scene.collection.objects.link(inner); inner.parent=root
                ratios=[asset['dimensions'][k]/max(b[1][k]-b[0][k],.00001) for k in range(3)] if asset.get('dimensions') else [1,1,1]
                inner.matrix_basis=C @ Matrix.Translation(-anchor) @ Matrix.Diagonal(Vector([*ratios,1])) @ CI
                for item in imported:
                    for prop in ('instanceId','orbigen_id'):
                        if prop in item: del item[prop]
                    if item.parent not in imported:
                        world=item.matrix_world.copy(); item.parent=inner; item.matrix_basis=world
                templates[signature]=root
            root['orbigen_id']=id; root['instanceId']=id; root['assetId']=instance['assetId']
            root.name=instance.get('name') or id
            root.matrix_world=C @ Matrix.LocRotScale(Vector(instance['position']),Euler(instance['rotation'],'XYZ'),Vector([v*instance['unitScale'] for v in instance['scale']])) @ CI
            bpy.context.view_layer.update()
    else:
        bpy.ops.import_scene.gltf(filepath=str(ROOT/'scene.glb'))
    # Library GLBs can contain old assembly IDs in nested meshes. Only the
    # current instance wrappers are editable components in this session.
    expected={i['id'] for i in MANIFEST['project']['instances']}
    accepted=[]
    for o in bpy.context.scene.objects:
        parent=o.parent; nested=False
        while parent:
            if key(parent) in expected: nested=True; break
            parent=parent.parent
        if key(o) in expected and not nested: accepted.append(o)
    if len(accepted)!=len(expected) or {key(o) for o in accepted}!=expected:
        raise ValueError('导出的组件记录与预选素材不匹配')
    for o in bpy.context.scene.objects:
        if o not in accepted:
            for prop in ('orbigen_id','instanceId'):
                if prop in o: del o[prop]
    for id,o in roots().items(): o['orbigen_id']=id
    # The reference is a non-exported image empty; assets remain separate files in the session.
    if (ROOT/'reference.png').exists():
        image=bpy.data.images.load(str(ROOT/'reference.png')); image.pack()
        ref=bpy.data.objects.new('Orbigen 参考渲染图',None); ref.empty_display_type='IMAGE'; ref.data=image; ref.hide_render=True
        ref.empty_display_size=5; ref.location=(8,0,3); bpy.context.scene.collection.objects.link(ref)
    inventory(); bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'scene.blend'))
elif MODE=='edit':
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'scene.blend'),load_ui=False)
    apply(json.loads((ROOT/'operations.json').read_text())['operations'])
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'scene-next.blend'))
    # Publish only after both the blend and export succeeded.
    export_result(); os.replace(ROOT/'scene-next.blend',ROOT/'scene.blend')
elif MODE=='open':
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'scene.blend'))
    class ORBIGEN_OT_return(bpy.types.Operator):
        bl_idname='orbigen.return_model'; bl_label='保存并回传工作台'
        def execute(self,context):
            try: bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'scene.blend')); self.report({'INFO'},'已回传 Orbigen 查验')
            except Exception as e: self.report({'ERROR'},str(e)); return {'CANCELLED'}
            return {'FINISHED'}
    class ORBIGEN_PT_bridge(bpy.types.Panel):
        bl_label='Orbigen 工作台'; bl_idname='ORBIGEN_PT_bridge'; bl_space_type='VIEW_3D'; bl_region_type='UI'; bl_category='Orbigen'
        def draw(self,context):
            self.layout.label(text='保存此工程时自动回传')
            self.layout.operator('orbigen.return_model')
    for cls in (ORBIGEN_OT_return,ORBIGEN_PT_bridge): bpy.utils.register_class(cls)
    from bpy.app.handlers import persistent
    @persistent
    def saved(_):
        if Path(bpy.data.filepath).resolve()!=ROOT/'scene.blend': return
        try: export_result()
        except Exception as e: write('export-error.json',dict(error=str(e)))
    bpy.app.handlers.save_post.append(saved)
    for area in (bpy.context.screen.areas if bpy.context.screen else []):
        if area.type=='VIEW_3D':
            area.spaces.active.show_region_ui=True
            area.spaces.active.shading.type='MATERIAL'
else: raise ValueError('不支持的 Blender 模式')
