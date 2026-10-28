import {findBlender,blenderGPUArgs} from './platform.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unzipSync } from './public/vendor/fflate.js';
import { inspectGLB } from './store.mjs';

const script = fileURLToPath(new URL('./scripts/convert-model.py', import.meta.url));
export function checkLocalDependencies(source) {
 if(path.extname(source).toLowerCase()!=='.gltf')return;
 const document=JSON.parse(fs.readFileSync(source,'utf8'));
 const missing=[];
 for(const entry of [...(document.buffers||[]),...(document.images||[])])if(entry.uri&&!entry.uri.startsWith('data:')){
  const uri=decodeURIComponent(entry.uri);
  if(/^[a-z]+:/i.test(uri)||!fs.existsSync(path.resolve(path.dirname(source),uri)))missing.push(uri);
 }
 if(missing.length)throw Error('缺少模型依赖：'+missing.slice(0,6).join('、')+(missing.length>6?' 等':''));
}
export async function convertLocalModel(source, {blender=findBlender(),signal,maxBytes=Infinity,timeout=180000,onReport}={}) {
 checkLocalDependencies(source);
 if(!fs.existsSync(blender))throw Error('转换此格式需要本机 Blender；GLB 可直接入库');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'orbigen-local-model-'));
 try {
  const output=path.join(temp,'preview.glb');
  await new Promise((resolve,reject)=>execFile(blender,['--background',...blenderGPUArgs(),'--factory-startup','--disable-autoexec','--python-exit-code','1','--python',script,'--',source,output],{timeout,maxBuffer:1048576,signal},err=>err?reject(Error(signal?.aborted?'已停止扫描':'转换失败，请检查静态模型及贴图依赖是否完整')):resolve()));
  if(fs.statSync(output).size>maxBytes)throw Error('转换后模型超过 '+Math.floor(maxBytes/1048576)+' MB，请先压缩贴图或减面');
  const bytes=fs.readFileSync(output);inspectGLB(bytes);if(onReport&&fs.existsSync(output+'.conversion.json'))onReport(JSON.parse(fs.readFileSync(output+'.conversion.json','utf8')));return bytes;
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
export async function convertNative(bytes, format, { blender = findBlender() } = {}) {
  if (format === 'glb') {
    try { inspectGLB(bytes); return bytes; }
    catch (e) { if (!e.message.includes('KHR_draco_mesh_compression')) throw e; }
  }
  if (!fs.existsSync(blender)) throw Error('原件已保存；本地预览转换需要安装 Blender，或设置 ORBIGEN_BLENDER 后重试下载入库');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbigen-model-'));
  try {
    let input = path.join(temp, 'source.' + format);
    if (bytes.subarray(0,4).toString('hex') === '504b0304') {
      let expanded = 0;
      const entries = unzipSync(new Uint8Array(bytes), { filter: entry => {
        expanded += entry.originalSize;
        if (expanded > 256*1048576) throw Error('原件压缩包展开超过 256 MB');
        return true;
      }});
      const models = [];
      for (const [name, value] of Object.entries(entries)) {
        const target = path.resolve(temp, name);
        if (!target.startsWith(temp + path.sep) || name.includes('\\') || path.isAbsolute(name)) throw Error('原件压缩包包含无效路径');
        if (name.endsWith('/')) continue;
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value);
        if (path.extname(name).toLowerCase() === '.' + format) models.push(target);
      }
      if (models.length !== 1) throw Error('原件压缩包需要包含一个模型');
      input = models[0];
    } else fs.writeFileSync(input, bytes);
    const output = path.join(temp, 'preview.glb');
    await new Promise((resolve,reject) => execFile(blender, ['--background',...blenderGPUArgs(),'--factory-startup','--python-exit-code','1','--python',script,'--',input,output], { timeout:180000, maxBuffer:1048576 }, err => err ? reject(Error('原件已保存；本地模型转换失败，请检查模型及贴图后重试')) : resolve()));
    const result = fs.readFileSync(output); inspectGLB(result); return result;
  } finally { fs.rmSync(temp, { recursive:true, force:true }); }
}
