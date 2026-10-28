import {verifyComposeMesh} from './compose-meshes.mjs';
import { randomUUID } from 'node:crypto';
import { validateInstances } from './public/modules/vegetation/schema.js';
import { recipe, validateRegion } from './public/modules/region/schema.js';
import {config,validateCompose} from './public/modules/compose/schema.js';
import {treeRecipe,validateTreeProject} from './public/modules/tree/schema.js';
export class ModuleStore {
  constructor(db) { this.db = db; db.exec('CREATE TABLE IF NOT EXISTS module_projects(id TEXT PRIMARY KEY, module TEXT NOT NULL, revision INTEGER NOT NULL, json TEXT NOT NULL)'); }
  module(id) { if (!['vegetation','region','compose','tree'].includes(id)) throw Error('模块暂未开放'); return id; }
  list(module) { this.module(module); return this.db.prepare('SELECT json FROM module_projects WHERE module=? ORDER BY rowid DESC').all(module).map(row => JSON.parse(row.json)); }
  project(module, id) { this.module(module); const row = this.db.prepare('SELECT json FROM module_projects WHERE module=? AND id=?').get(module, id); if (!row) throw Error('模块工程不存在'); return JSON.parse(row.json); }
  create(module, name) {
    this.module(module);
    const p = { schemaVersion: 1, module, id: randomUUID(), name: String(name || (module==='region'?'我的石头区域':'我的植被搭配')).slice(0, 120), revision: 0, instances: [], updatedAt: new Date().toISOString(), ...(module==='region'?{recipe:recipe(),sources:[]}: {}) };
    if(module==='compose')Object.assign(p,{name:String(name||'我的渲染图组建').slice(0,120),reference:null,breakdown:null,roiPolygon:null,roi:[0,0,1,1],config:config(),parts:[],sources:[],marks:[],analysis:null});
    if(module==='tree')Object.assign(p,{name:String(name||'我的参考松树').slice(0,120),recipe:treeRecipe(),reference:null,notes:'弯曲老干、根盘、横展分层枝冠、枝梢针叶簇。'});
    this.db.prepare('INSERT INTO module_projects VALUES(?,?,?,?)').run(p.id, module, 0, JSON.stringify(p)); return p;
  }
  save(module, id, patch) {
    const previous = this.project(module, id);
    if (previous.revision !== patch.baseRevision) throw Object.assign(Error('模块工程已被其他窗口修改，请另存副本以保留本地修改。'), { status: 409 });
    let region={};
    if(module==='region'||module==='compose'){
      const checked=module==='region'?validateRegion(patch):validateCompose(patch);region=module==='region'?{recipe:checked.recipe,sources:checked.sources}:checked;
      for(const s of checked.sources){const row=this.db.prepare('SELECT json FROM assets WHERE id=?').get(s.id),a=row&&JSON.parse(row.json);if(!a||a.sha!==s.sha||a.version!==s.version||a.triangles!==s.triangles)throw Error('区域引用的素材版本或哈希不匹配');if(s.geometry)verifyComposeMesh(this.db,s.sha,s.geometry);}
    }else if(module==='tree')region=validateTreeProject(patch);
    else validateInstances(patch.instances);
    const p = { ...previous, ...region, name: String(patch.name || previous.name).slice(0, 120), instances: patch.instances, revision: previous.revision + 1, updatedAt: new Date().toISOString() };
    const result = this.db.prepare('UPDATE module_projects SET revision=?,json=? WHERE module=? AND id=? AND revision=?').run(p.revision, JSON.stringify(p), module, id, previous.revision);
    if (result.changes !== 1) throw Object.assign(Error('工程版本冲突'), { status: 409 }); return p;
  }
}
