import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
export function validateModelOptions(model='',reasoning='high'){
 if(typeof model!=='string'||model.length>120||model&&(!/^[a-zA-Z0-9][a-zA-Z0-9_./:-]*$/.test(model)))throw Error('模型 ID 无效');
 if(!['low','medium','high','xhigh','max'].includes(reasoning))throw Error('思考强度无效');return {model,reasoning};
}
export function localModels(cache=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'models_cache.json')){
 try{return (JSON.parse(fs.readFileSync(cache,'utf8')).models||[]).filter(m=>m.slug&&m.visibility!=='hidden'&&!m.slug.includes('auto-review')).map(m=>({id:m.slug,name:m.display_name||m.slug,efforts:(m.supported_reasoning_levels||[]).map(r=>r.effort).filter(r=>['low','medium','high','xhigh','max'].includes(r))}));}catch{return [];}
}
