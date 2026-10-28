import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {unzipSync,Unzip,UnzipInflate} from './public/vendor/fflate.js';
import {Box3,Vector3,Matrix4,Quaternion} from './public/vendor/three/three.module.js';
import {convertLocalModel} from './model-convert.mjs';
import {inspectGLB,hash} from './store.mjs';
import {PREFAB_MODEL_MAX_BYTES} from './public/modules/prefabs/limits.js';

export const MODEL_FORMATS=['glb','gltf','fbx','obj','stl','ply','blend'];
export function safePrefabPath(name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes('\0')||path.posix.isAbsolute(name)||name.split('/').some(p=>p==='..'||p==='.'||!p))throw Error('模型包包含无效路径');
 return name;
}
// Measure actual POSITION values with scene transforms, independent of textures.
export function modelDimensions(bytes){
 inspectGLB(bytes);const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),buffers=[];
 let offset=20+length;while(offset<bytes.length){const n=bytes.readUInt32LE(offset);if(bytes.readUInt32LE(offset+4)===0x004e4942)buffers[0]=bytes.subarray(offset+8,offset+8+n);offset+=8+n;}
 for(let i=0;i<(doc.buffers||[]).length;i++)if(doc.buffers[i].uri)buffers[i]=Buffer.from(doc.buffers[i].uri.split(',')[1],'base64');
 const types={5120:[1,'readInt8'],5121:[1,'readUInt8'],5122:[2,'readInt16LE'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']},meshBoxes=[];
 for(const mesh of doc.meshes){const box=new Box3();for(const p of mesh.primitives){const a=doc.accessors[p.attributes.POSITION],v=doc.bufferViews?.[a?.bufferView],type=types[a?.componentType];if(!a||a.type!=='VEC3'||!type||a.sparse||!v)throw Error('请先转换为普通静态网格后导入');const b=buffers[v.buffer],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||type[0]*3;if(!b||start+(a.count-1)*stride+type[0]*3>Math.min(b.length,(v.byteOffset||0)+v.byteLength))throw Error('模型坐标数据不完整');for(let i=0;i<a.count;i++){const xyz=[0,1,2].map(k=>{let n=b[type[1]](start+i*stride+k*type[0]);if(a.normalized&&a.componentType!==5126)n=a.componentType===5120?Math.max(n/127,-1):a.componentType===5122?Math.max(n/32767,-1):n/(2**(type[0]*8)-1);return n;});if(!xyz.every(Number.isFinite))throw Error('模型坐标无效');box.expandByPoint(new Vector3(...xyz));}}meshBoxes.push(box);}
 const result=new Box3(),walk=(id,parent)=>{const n=doc.nodes[id],m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1]))),world=parent.clone().multiply(m);if(n.mesh!==undefined)result.union(meshBoxes[n.mesh].clone().applyMatrix4(world));for(const child of n.children||[])walk(child,world);};
 const roots=doc.scenes?.[doc.scene||0]?.nodes||[];if(roots.length)roots.forEach(id=>walk(id,new Matrix4()));else meshBoxes.forEach(b=>result.union(b));
 if(result.isEmpty())throw Error('模型没有可用几何');const size=result.getSize(new Vector3()).toArray();if(size.some(n=>!Number.isFinite(n)||n>1e6))throw Error('模型尺寸超出范围');return size.map(n=>Math.max(n,0.000001));
}
export function distinctGLB(bytes){
 const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n));doc.extras={...(doc.extras||{}),orbigenPrefabImport:randomUUID()};const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),header=Buffer.from(bytes.subarray(0,20));header.writeUInt32LE(20+json.length+bytes.length-20-n,8);header.writeUInt32LE(json.length,12);return Buffer.concat([header,json,bytes.subarray(20+n)]);
}
export async function importPrefabFiles(prefabs,input,options={}){
 if(!Array.isArray(input.files)||!input.files.length||input.files.length>512)throw Error('请选择模型及贴图文件（最多 512 个文件）');
 prefabs.validateInfo(input);const entries=new Map();
 for(const f of input.files){safePrefabPath(f.name);if(typeof f.data!=='string'||f.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.data))throw Error('文件数据无效');const bytes=Buffer.from(f.data,'base64');if(entries.has(f.name))throw Error('存在重复文件路径');entries.set(f.name,bytes);}
 if(entries.size===1&&[...entries.keys()][0].toLowerCase().endsWith('.zip')){const archive=[...entries.values()][0];entries.clear();const unzipped=unzipSync(new Uint8Array(archive));for(const [name,data] of Object.entries(unzipped)){if(name.endsWith('/')){safePrefabPath(name.slice(0,-1));continue;}safePrefabPath(name);if(!name.startsWith('__MACOSX/')&&!path.basename(name).startsWith('.'))entries.set(name,Buffer.from(data));}}
 if(entries.size>512)throw Error('模型包最多 512 个文件');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orbigen-prefab-'));
 try{for(const [name,bytes] of entries){const target=path.join(temp,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 return await importPrefabDirectory(prefabs,input,temp,[...entries.keys()],options);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}

export async function importPrefabDirectory(prefabs,input,temp,names,options={}){
 prefabs.validateInfo(input);for(const n of names)safePrefabPath(n);
 if(names.length===1&&names[0].toLowerCase().endsWith('.zip')){
  const expanded=path.join(temp,'.expanded');fs.mkdirSync(expanded);names=await unpackPrefabZip(path.join(temp,names[0]),expanded);temp=expanded;
 }
 if(!names.length||names.length>512)throw Error('模型包最多 512 个文件');
 const models=names.filter(n=>MODEL_FORMATS.includes(path.extname(n).slice(1).toLowerCase()));
 if(models.length!==1)throw Error('每次请导入一个模型；可同时选择它的 BIN、MTL、贴图，或包含一个模型的文件夹 / ZIP');
 for(const name of names)if(name.toLowerCase().endsWith('.obj'))for(const line of fs.readFileSync(path.join(temp,name),'utf8').split(/\r?\n/)){const m=/^\s*mtllib\s+(.+)$/i.exec(line);if(m){const ref=m[1].trim().replace(/^"|"$/g,'');if(!names.includes(path.posix.normalize(path.posix.join(path.posix.dirname(name),ref))))throw Error('缺少材质依赖：'+ref);}}
 const file=models[0],format=path.extname(file).slice(1).toLowerCase();const h=createHash('sha256');for await(const b of fs.createReadStream(path.join(temp,file)))h.update(b);const sourceHash=h.digest('hex');
 // A dependency path must never read outside the user-selected package.
 for(const name of names){const b=/\.(gltf|obj|mtl)$/i.test(name)?fs.readFileSync(path.join(temp,name)):null;if(name.toLowerCase().endsWith('.gltf')){const d=JSON.parse(b);for(const e of [...(d.buffers||[]),...(d.images||[])])if(e.uri&&!e.uri.startsWith('data:')){const uri=decodeURIComponent(e.uri);if(/^[a-z]+:/i.test(uri)||path.isAbsolute(uri)||!path.resolve(temp,path.dirname(name),uri).startsWith(temp+path.sep))throw Error('模型依赖路径超出导入包');}}if(/\.(obj|mtl)$/i.test(name)){for(const line of b.toString().split(/\r?\n/)){const match=/^\s*(?:mtllib|map_\w+|bump|disp|decal)\s+(.+)$/i.exec(line);if(match&&(/(?:^|\s)(?:\/|[A-Za-z]:|\.\.\/)/.test(match[1])||match[1].includes('\\')))throw Error('贴图或材质依赖需要使用包内相对路径');}}}
 let conversion=null;let bytes=format==='glb'?fs.readFileSync(path.join(temp,file)):await (options.convert||convertLocalModel)(path.join(temp,file),{...options,maxBytes:PREFAB_MODEL_MAX_BYTES,timeout:600000,onReport:report=>{conversion=report;options.onReport?.(report);}});inspectGLB(bytes);
 const dimensions=modelDimensions(bytes),convertedHash=hash(bytes),existing=prefabs.list({includeTrash:true}).find(p=>p.source?.convertedSHA===convertedHash);
 if(existing){if(existing.asset.deletedAt)throw Error('该半成品在回收站，请先恢复');return {prefab:existing,duplicate:true};}
 const record=prefabs.importModel(distinctGLB(bytes),{...input,dimensions,format,file,sourceHash,convertedHash,conversion});return {prefab:record,duplicate:false};
}
export async function unpackPrefabZip(archive,temp){
 const names=[],opened=new Map(),pending=new Set();
 const unzip=new Unzip(file=>{
  const folder=file.name.endsWith('/'),name=safePrefabPath(folder?file.name.slice(0,-1):file.name);
  if(folder||name.startsWith('__MACOSX/')||path.basename(name).startsWith('.'))return;
  if(names.includes(name))throw Error('存在重复文件路径');if(names.length>=512)throw Error('模型包最多 512 个文件');names.push(name);
  const target=path.join(temp,name);fs.mkdirSync(path.dirname(target),{recursive:true});const fd=fs.openSync(target,'wx');opened.set(name,fd);pending.add(name);
  file.ondata=(error,data,final)=>{if(error)throw error;let n=0;while(n<data.length)n+=fs.writeSync(fd,data,n,data.length-n);if(final){fs.closeSync(fd);opened.delete(name);pending.delete(name);}};file.start();
 });unzip.register(UnzipInflate);
 try{for await(const chunk of fs.createReadStream(archive,{highWaterMark:65536}))unzip.push(chunk,false);unzip.push(new Uint8Array(),true);if(pending.size)throw Error('ZIP 数据不完整');return names;}
 finally{for(const fd of opened.values())fs.closeSync(fd);}
}
