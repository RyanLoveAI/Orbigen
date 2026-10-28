export async function resolve(specifier,context,nextResolve){
 if(specifier.startsWith('/vendor/three/'))return {url:new URL('../public'+specifier,import.meta.url).href,shortCircuit:true};
 if(specifier==='three')return {url:new URL('../public/vendor/three/three.module.js',import.meta.url).href,shortCircuit:true};
 if(specifier.startsWith('three/addons/'))return {url:new URL('../public/vendor/three/addons/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
