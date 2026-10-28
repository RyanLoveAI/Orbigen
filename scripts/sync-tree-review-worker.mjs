import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for(const name of ['generator.js','components.js','inspect.js']){
 const source=path.join(root,'public/modules/tree',name),target=path.join(root,'public/modules/tree/worker-runtime/modules/tree',name);
 let code=fs.readFileSync(source,'utf8').replaceAll("from 'three'","from '/vendor/three/three.module.js'").replaceAll("from 'three/addons/","from '../../vendor/three/addons/");fs.writeFileSync(target,code);
}
console.log('Tree worker modules synchronized');
