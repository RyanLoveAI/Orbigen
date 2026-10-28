import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {hash} from './store.mjs';
import {validPolygon} from './public/modules/compose/selection.js';
import {validRect} from './public/modules/compose/schema.js';
const run=promisify(execFile);
export class ReferenceStore{
 constructor(data){this.dir=path.join(data,'references');fs.mkdirSync(this.dir,{recursive:true});this.running=false;}
 file(sha){if(!/^[a-f0-9]{64}$/.test(sha))throw Error('参考图哈希无效');return path.join(this.dir,sha+'.png');}
 upload(bytes,name){if(bytes.length<33||bytes.length>8*1048576||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.subarray(12,16).toString()!=='IHDR')throw Error('参考图需要有效 PNG，最大 8 MB');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width>4096||height>4096)throw Error('参考图最大 4096 × 4096');const sha=hash(bytes),file=this.file(sha);if(!fs.existsSync(file)){fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);}return {sha,url:'/references/'+sha+'.png',name:String(name||'参考渲染图').slice(0,120),width,height};}
 async analyze(sha,roi,polygon=null){if(!validRect(roi)||polygon!==null&&!validPolygon(polygon,roi))throw Error('识图范围无效');const file=this.file(sha);if(!fs.existsSync(file))throw Error('参考图不存在');if(this.running)throw Error('本地识图正在运行，请稍候');const helper=process.env.ORBIGEN_IMAGE_HELPER;if(!helper||!fs.existsSync(helper))throw Error('此平台尚未提供本地自动识图；可关联已分拆渲染图、圈选构件并手动筛选素材，或使用 Codex 助手');this.running=true;try{const result=await run(helper,[file,roi.join(','),JSON.stringify(polygon)],{timeout:90000,maxBuffer:1048576});return JSON.parse(result.stdout);}catch(e){throw Error('本地识图未完成：'+String(e.stderr||e.message).slice(-400));}finally{this.running=false;}}
}
