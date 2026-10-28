import {buildTree} from './generator.js';
self.onmessage=e=>{const {id,recipe,quality,pack,mode}=e.data;try{const result=buildTree(recipe,quality,pack,mode);const transfer=result.meshes.flatMap(m=>[m.index.buffer,...Object.values(m.attributes).map(a=>a.array.buffer)]);self.postMessage({id,result},transfer);}catch(error){self.postMessage({id,error:error.message});}};
