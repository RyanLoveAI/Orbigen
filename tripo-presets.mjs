import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {DEFAULT_PRESETS} from './public/modules/tripo/presets.js';
import {DEFAULT_GENERATION_SETTINGS} from './public/modules/tripo/defaults.js';
import {ASSET_CATEGORIES} from './public/modules/asset-folder/classify.js';
const fail=message=>{throw Error(message);};
export class TripoPresetStore{
 constructor(db,references){
  Object.assign(this,{db,references});const existing=db.prepare("SELECT name FROM sqlite_master WHERE name='generation_presets'").get();
  db.exec('CREATE TABLE IF NOT EXISTS generation_presets(id TEXT PRIMARY KEY,json TEXT NOT NULL)');
  if(!existing)for(const p of DEFAULT_PRESETS)this.save({config:{...p,mode:'text',...DEFAULT_GENERATION_SETTINGS}});
  // Update only untouched legacy examples; saved custom configurations keep their parameters.
  else for(const preset of this.list()){
   const c=preset.config,original=DEFAULT_PRESETS.find(p=>p.name===c.name&&p.category===c.category&&p.prompt===c.prompt);
   if(original&&c.mode==='text'&&!c.model&&c.geometryQuality==='detailed'&&c.textureQuality==='detailed'&&c.faceLimit===100000&&c.quad===false&&!preset.notes&&!preset.source&&!preset.imageRef&&!preset.viewRefs.some(Boolean))this.save({...preset,config:{...c,...DEFAULT_GENERATION_SETTINGS}},preset.id);
  }

 }
 list(){return this.db.prepare('SELECT json FROM generation_presets ORDER BY rowid DESC').all().map(r=>JSON.parse(r.json));}
 ref(value){if(!value)return null;if(typeof value.sha!=='string'||!fs.existsSync(this.references.file(value.sha)))fail('方案参考图不存在，请重新选择');return {sha:value.sha,url:'/references/'+value.sha+'.png',name:String(value.name||'参考图.png').slice(0,120)};}
 save(input,id=null){
  if(id&&!this.db.prepare('SELECT id FROM generation_presets WHERE id=?').get(id))fail('生成方案已删除，请另存为新方案');
  if(!id&&this.list().length>=100)fail('最多保存100个生成方案');
  const c=input.config||{},name=String(c.name||'').trim(),prompt=String(c.prompt||''),notes=String(input.notes||'');
  if(!name||name.length>120||prompt.length>4000||notes.length>4000)fail('填写方案名称，描述和备注最多4000字');
  if(!ASSET_CATEGORIES.includes(c.category)||!['text','image','multiview'].includes(c.mode)||!['standard','detailed'].includes(c.geometryQuality)||!['standard','detailed'].includes(c.textureQuality)||typeof c.quad!=='boolean'||!Number.isInteger(c.faceLimit)||c.faceLimit<500||c.faceLimit>300000)fail('方案生成设置无效');
  if(input.viewRefs!==undefined&&(!Array.isArray(input.viewRefs)||input.viewRefs.length>4))fail('方案最多保存四张视图');
  const source=input.source?Object.fromEntries(['projectId','partId','projectName','partName'].map(key=>[key,String(input.source[key]||'').slice(0,120)])):null;
  const preset={id:id||randomUUID(),config:{name,prompt,category:c.category,mode:c.mode,model:String(c.model||'').slice(0,120),geometryQuality:c.geometryQuality,textureQuality:c.textureQuality,quad:c.quad,faceLimit:c.faceLimit},notes,source,imageRef:this.ref(input.imageRef),viewRefs:Array.from({length:4},(_,i)=>this.ref(input.viewRefs?.[i])),updatedAt:new Date().toISOString()};
  this.db.prepare('INSERT INTO generation_presets VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(preset.id,JSON.stringify(preset));return preset;
 }
 delete(id){if(!this.db.prepare('DELETE FROM generation_presets WHERE id=?').run(id).changes)fail('生成方案不存在');return {deleted:true};}
}
