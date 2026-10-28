import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const blenderGPUArgs = platform => (platform ?? process.platform) === 'darwin' ? ['--gpu-backend','metal'] : [];
function executableOnPath(name, env=process.env) {
  return (env.PATH||env.Path||'').split(path.delimiter).map(dir=>path.join(dir,name)).find(file=>fs.existsSync(file));
}
export function findBlender({platform=process.platform,env=process.env,exists=fs.existsSync}={}) {
  if(env.ORBIGEN_BLENDER_BIN||env.ORBIGEN_BLENDER)return env.ORBIGEN_BLENDER_BIN||env.ORBIGEN_BLENDER;
  if(platform==='darwin')return '/Applications/Blender.app/Contents/MacOS/Blender';
  const portable=env.ORBIGEN_PORTABLE_ROOT;
  const candidates=portable?[path.join(portable,'Blender','blender.exe'),path.join(portable,'Runtime','Blender','blender.exe')]:[];
  if(platform==='win32'){
    for(const base of [env.ProgramW6432,env.ProgramFiles,env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs')].filter(Boolean)){
      const foundation=path.join(base,'Blender Foundation');
      try{for(const name of fs.readdirSync(foundation).filter(n=>/^Blender /i.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})))candidates.push(path.join(foundation,name,'blender.exe'));}catch{}
    }
  }
  return candidates.find(exists)||executableOnPath(platform==='win32'?'blender.exe':'blender',env)||(platform==='win32'?'blender.exe':'blender');
}
export function findCodexBinary() {
  if(process.env.ORBIGEN_CODEX_BIN)return process.env.ORBIGEN_CODEX_BIN;
  if(process.platform!=='win32')return ['/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex','/Applications/Codex.app/Contents/Resources/codex','/opt/homebrew/bin/codex','/usr/local/bin/codex'].find(fs.existsSync)||'codex';
  const env=process.env,root=env.ORBIGEN_PORTABLE_ROOT;
  const candidates=[root&&path.join(root,'Codex','codex.exe'),root&&path.join(root,'Runtime','Codex','codex.exe'),executableOnPath('codex.exe'),path.join(os.homedir(),'.cargo','bin','codex.exe')].filter(Boolean);
  // Resolve npm's actual executable instead of running a .cmd through a shell.
  for(const base of [env.APPDATA&&path.join(env.APPDATA,'npm'),...(env.PATH||'').split(path.delimiter)].filter(Boolean)){
    const scope=path.join(base,'node_modules','@openai');
    for(const pkg of ['codex','codex-win32-x64','codex-win32-arm64']){
      const vendor=path.join(scope,pkg,'vendor');
      for(const arch of ['x86_64-pc-windows-msvc','aarch64-pc-windows-msvc'])candidates.push(path.join(vendor,arch,'codex','codex.exe'));
      candidates.push(path.join(scope,pkg,'bin','codex.exe'));
      for(const dependency of ['codex-win32-x64','codex-win32-arm64'])for(const arch of ['x86_64-pc-windows-msvc','aarch64-pc-windows-msvc'])candidates.push(path.join(scope,pkg,'node_modules','@openai',dependency,'vendor',arch,'codex','codex.exe'));
    }
  }
  return candidates.find(fs.existsSync)||'codex.exe';
}
