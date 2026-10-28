import {findBlender} from './platform.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectGLB,hash} from './store.mjs';
export function meshTable(db){db.exec('CREATE TABLE IF NOT EXISTS compose_meshes(source_sha TEXT PRIMARY KEY,json TEXT NOT NULL)');}
export function verifyComposeMesh(db,sourceSha,g){if(!g)return;meshTable(db);const r=db.prepare('SELECT json FROM compose_meshes WHERE source_sha=?').get(sourceSha),saved=r&&JSON.parse(r.json);if(!saved||saved.sha!==g.sha||saved.triangles!==g.triangles)throw Error('组建网格与原素材不匹配');}
export class ComposeMeshes{
 constructor(store){this.store=store;this.pending=new Map();meshTable(store.db);}
 async get(id){const a=this.store.asset(id);if(a.deletedAt)throw Error('素材在回收站');const saved=this.store.db.prepare('SELECT json FROM compose_meshes WHERE source_sha=?').get(a.sha);if(saved){const g=JSON.parse(saved.json);if(fs.existsSync(path.join(this.store.dir,'blobs',g.sha+'.glb')))return g;}if(this.pending.has(a.sha))return this.pending.get(a.sha);const job=this.make(a).finally(()=>this.pending.delete(a.sha));this.pending.set(a.sha,job);return job;}
 async make(a){const blender=findBlender();if(!fs.existsSync(blender))throw Error('木构重复铺设需要本机 Blender 生成轻量网格，请安装 Blender 后重试');const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orbigen-compose-mesh-'));try{const output=path.join(temp,'mesh.glb'),input=path.join(this.store.dir,'blobs',a.sha+'.glb'),script=fileURLToPath(new URL('./scripts/compose-mesh.py',import.meta.url));await new Promise((resolve,reject)=>execFile(blender,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',script,'--',input,output],{timeout:180000,maxBuffer:1048576},e=>e?reject(Error('生成轻量组建网格失败；原素材和原工程已保留')):resolve()));const bytes=fs.readFileSync(output),stats=inspectGLB(bytes);if(stats.triangles>35000)throw Error('轻量网格超过面数预算');const g={sha:hash(bytes),triangles:stats.triangles};fs.writeFileSync(path.join(this.store.dir,'blobs',g.sha+'.glb'),bytes);this.store.db.prepare('INSERT OR REPLACE INTO compose_meshes VALUES(?,?)').run(a.sha,JSON.stringify(g));return g;}finally{fs.rmSync(temp,{recursive:true,force:true});}}
}
