import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DecodeQueue} from './model-cache.js';
const loader=new GLTFLoader();
loader.register(parser=>{
 const images=parser.textureLoader,queue=new DecodeQueue(2),load=images.load.bind(images);
 // Resize during decode so a material-heavy model never retains dozens of
 // full-size bitmaps. UVs remain normalized and source materials are intact.
 if(images.isImageBitmapLoader)images.setOptions({...images.options,resizeWidth:512,resizeHeight:512,resizeQuality:'high'});
 images.load=(url,onLoad,onProgress,onError)=>{queue.run(()=>new Promise((resolve,reject)=>load(url,image=>{onLoad(image);resolve();},onProgress,error=>{onError?.(error);reject(error);}))).catch(()=>{});};
 return {name:'ORBIGEN_preview_images'};
});
export function modelTextures(root){const set=new Set();root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const v of Object.values(m))if(v?.isTexture)set.add(v);});return set;}
export function releasePreview(root){
 const images=new Set(),geometry=new Set(),materials=new Set();
 for(const texture of modelTextures(root)){if(texture.image)images.add(texture.image);texture.dispose();texture.image=null;}
 for(const image of images){image.close?.();if(image instanceof HTMLCanvasElement){image.width=image.height=1;}}
 root.traverse(o=>{if(o.isMesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
 geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();
}
export async function loadPreview(asset){
 const {scene:raw}=await loader.loadAsync('/blobs/'+asset.sha+'.glb');
 try {
  const replacements=new Map(),originals=new Set();
  for(const texture of modelTextures(raw)) {
   const image=texture.image;if(!image||Array.isArray(image)||texture.isDataTexture||texture.isCompressedTexture)continue;
   const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
   if(Math.max(width,height)<=512)continue;
   if(!replacements.has(image)){const ratio=512/Math.max(width,height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);replacements.set(image,canvas);originals.add(image);}
   // Each preview owns its loader resources. Full-resolution Stage models use
   // a separate loader/cache and are never modified by this thumbnail path.
   texture.image=replacements.get(image);texture.needsUpdate=true;
  }
  for(const image of originals)image.close?.();
  raw.updateMatrixWorld(true);const box=new T.Box3().setFromObject(raw),size=box.getSize(new T.Vector3());
  if(box.isEmpty()||!size.toArray().every(Number.isFinite))throw Error('模型没有可显示的几何');
  const root=new T.Group(),inner=new T.Group();inner.add(raw);inner.position.set(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);root.add(inner);root.updateMatrixWorld(true);return root;
 }catch(e){releasePreview(raw);throw e;}
}
