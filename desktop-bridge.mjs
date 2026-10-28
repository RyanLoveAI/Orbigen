import path from 'node:path';
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const windowsHelper=fileURLToPath(new URL('./desktop/windows/native.ps1',import.meta.url));
export function windowsCommand(action,value,helper=windowsHelper) {
  return new Promise((resolve,reject)=>{
    const child=execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',helper,'-Action',action],{windowsHide:true,timeout:action==='choose'?300000:15000,maxBuffer:1048576},(error,stdout)=>{
      if(error)return reject(Error('Windows 本地操作失败，请查看便携版日志或重试'));
      try{resolve(stdout.trim()?JSON.parse(stdout.replace(/^\uFEFF/,'')):null);}catch{reject(Error('Windows 本地操作返回数据无效'));}
    });
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(value??{}));
  });
}
export async function folderCommand(input) {
  if(!input||!['choose','open'].includes(input.action))throw Error('文件夹操作无效');
  const target=input.path||'';
  if(typeof target!=='string'||target.length>4096||/[\x00-\x1f]/.test(target))throw Error('文件夹路径无效');
  if(input.action==='open'&&(!path.isAbsolute(target)||!fs.existsSync(target)||!fs.statSync(target).isDirectory()))throw Error('本地文件夹不存在');
  return windowsCommand(input.action,{path:target});
}
