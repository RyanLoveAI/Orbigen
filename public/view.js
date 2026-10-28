import {thumbnailCache} from './modules/library/thumbnail-cache.js';
import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';import {TransformControls} from 'three/addons/controls/TransformControls.js';import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {MeasurementOverlay} from './modules/measurements/overlay.js';
import {collectMeasurements} from './modules/measurements/geometry.js';
import {loadPreview,releasePreview,modelTextures} from './modules/library/preview-model.js';
import {ModelCache,DecodeQueue} from './modules/library/model-cache.js';
import {previewDistance} from './modules/library/preview-fit.js';
const loader=new GLTFLoader(),decodeQueue=new DecodeQueue(2);
const cache=new ModelCache({onEvict:m=>{disposeGeometry(m.root);for(const texture of modelTextures(m.root))texture.dispose();}});
export function modelCacheStats(){return {...cache.stats(),decoding:decodeQueue.active,queued:decodeQueue.jobs.length};}
function resourceBytes(root){let bytes=0;const geometry=new Set(),images=new Set();root.traverse(o=>{if(o.isMesh)geometry.add(o.geometry);});for(const g of geometry){for(const a of Object.values(g.attributes))bytes+=a.array?.byteLength||0;bytes+=g.index?.array?.byteLength||0;}for(const texture of modelTextures(root))if(texture.image&&!images.has(texture.image)){const image=texture.image;images.add(image);bytes+=(image.width||0)*(image.height||0)*4;}return bytes;}
export async function model(asset){
 const existing=cache.get(asset.sha);if(existing)return existing.promise;
 let entry;const pending=decodeQueue.run(async()=>{const g=await loader.loadAsync('/blobs/'+asset.sha+'.glb'),raw=g.scene;raw.updateMatrixWorld(true);const box=new T.Box3().setFromObject(raw),size=box.getSize(new T.Vector3());if(box.isEmpty()||!size.toArray().every(Number.isFinite))throw Error('模型没有可显示的几何');const wrapper=new T.Group(),inner=new T.Group();inner.add(raw);inner.position.set(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);wrapper.add(inner);wrapper.updateMatrixWorld(true);const result={root:wrapper,dimensions:size.toArray()};cache.settle(asset.sha,entry,result,resourceBytes(wrapper));return result;}).catch(e=>{cache.delete(asset.sha);throw e;});
 entry=cache.set(asset.sha,pending);return pending;
}
function lights(scene){scene.add(new T.HemisphereLight(0xf1f4ff,0xaab0bf,2.4));const key=new T.DirectionalLight(0xfff7ea,3.1);key.position.set(4,8,6);scene.add(key);const fill=new T.DirectionalLight(0xd5e2ff,1.1);fill.position.set(-5,3,-4);scene.add(fill);}
export function disposeGeometry(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.isMesh){gs.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))ms.add(m);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
const clay=new T.MeshStandardMaterial({color:0xc7cddc,roughness:.6}),wire=new T.MeshBasicMaterial({color:0x68789f,wireframe:true});
function setMode(root,mode){root.traverse(o=>{if(!o.isMesh)return;if(!o.userData.originalMaterial)o.userData.originalMaterial=o.material;o.material=mode==='wire'?wire:mode==='clay'?clay:o.userData.originalMaterial;});}
export class Gallery {
 constructor() {
  this.renderer = new T.WebGLRenderer({antialias:true, alpha:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  this.renderer.outputColorSpace = T.SRGBColorSpace;
  this.renderer.toneMapping = T.ACESFilmicToneMapping;
  this.renderer.toneMappingExposure = 1.2;
  this.renderer.setClearColor(0xf0f2f6, 0);
  this.renderer.autoClear = false;
  this.surface = this.renderer.domElement;
  this.surface.className = 'gallery-surface';
  this.surface.setAttribute('aria-hidden', 'true');
  this.surface.dataset.renderPath = 'gpu-scissor-scroll';
  this.tiles = [];
  this.tileByCanvas=new Map();
  this.previewLoading=0;
  this.running = true;
  this.auto = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.speed = .28;
  this.last = 0;
  this.frames = 0;
  this.layoutDirty = true;
  this.intervals = [];
  this.costs = [];
  this.lastDraw = 0;
  this.lastReport = 0;
  this.orbitOffset = new T.Vector3();
  this.renderSize = new T.Vector2();
  this.invalidate = () => { this.layoutDirty = true; this.last = 0; };
  addEventListener('scroll', this.invalidate, {capture:true, passive:true});
  addEventListener('resize', this.invalidate);
  document.addEventListener('visibilitychange', this.invalidate);
  this.observer = new IntersectionObserver(entries => {
   for (const e of entries) {
    const tile = this.tileByCanvas.get(e.target);
    if (tile) tile.dirty = true;
   }
   this.layoutDirty = true;
  });
  this.resizeObserver = new ResizeObserver(this.invalidate);
  this.tick = this.tick.bind(this);
  requestAnimationFrame(this.tick);
 }
 clear() {
  this.observer.disconnect();
  this.resizeObserver.disconnect();
  for (const tile of this.tiles) if(tile.root){if(tile.preview)releasePreview(tile.root);else if(tile.owned)disposeGeometry(tile.root);}
  this.tiles = [];
  this.tileByCanvas.clear();
  this.surface.remove();
  this.host = null;
  this.last = this.lastDraw = 0;
  this.intervals = [];
  this.costs = [];
  this.layoutDirty = true;
 }
 prepare(canvas,asset,onError) {
  const tile=this.add(canvas,null);Object.assign(tile,{asset,preview:true,onError,cacheChecked:false});
  canvas.dataset.previewState='waiting';canvas.dataset.mountedAt=String(performance.now());return tile;
 }
 add(canvas, root, {owned=false, update=null}={}) {
  const host = canvas.closest('.asset-grid');
  if (host && host !== this.host) {
   this.host = host;
   host.append(this.surface);
   this.resizeObserver.observe(host);
  }
  const tile = {canvas,root:null,visible:false,dirty:true,owned,update,angle:0,draws:0,rect:null};
  canvas.width=400;canvas.height=300;this.tiles.push(tile);this.tileByCanvas.set(canvas,tile);this.observer.observe(canvas);this.layoutDirty=true;
  if(root)this.fill(tile,root);return tile;
 }
 fill(tile,root) {
  const scene = new T.Scene();
  lights(scene);
  const pivot = new T.Group();
  pivot.add(root);
  scene.add(pivot);
  root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(root);
  const center = box.getCenter(new T.Vector3());
  const size = box.getSize(new T.Vector3());
  const s = Math.max(size.x, size.y, size.z, .1);
  const camera = new T.PerspectiveCamera(37, 4/3, .001, s*100);
  Object.assign(tile,{scene,pivot,root,camera,center,s,dimensions:size.toArray(),dirty:true});
  tile.canvas.dataset.previewState='ready';
  tile.canvas.closest('.thumb-wrap')?.querySelector('.thumb-state')?.remove();
  this.layoutDirty = true;
 }
 async pumpPreviews() {
  // Only one GLB/image decode at a time, including when a page is changed
  // during a pending request. Hidden cards do not retain model/GPU resources.
  for(const tile of this.tiles)if(tile.preview&&!tile.visible&&(tile.root||tile.snapshotReady)){
   if(tile.root)releasePreview(tile.root);Object.assign(tile,{root:null,scene:null,camera:null,drawn:false,draws:0,snapshotReady:false});tile.canvas.width=400;tile.canvas.style.opacity='1';tile.canvas.dataset.draws='0';tile.canvas.dataset.previewState='waiting';tile.cacheChecked=false;
  }
  for(const tile of this.tiles)if(tile.preview&&tile.visible&&!tile.cacheChecked&&!tile.cacheChecking)this.restoreThumbnail(tile);
  if(this.previewLoading>=2)return;
  const tile=this.tiles.find(t=>t.preview&&t.visible&&t.cacheChecked&&!t.loading&&!t.root&&!t.failed&&(t.live||!t.snapshotReady));
  if(!tile)return;
  this.previewLoading++;tile.loading=true;tile.canvas.dataset.previewState=tile.snapshotReady?'cached':'loading';
  try{
   const root=await loadPreview(tile.asset);
   if(!this.running||!this.tiles.includes(tile)||!tile.visible){releasePreview(root);if(this.tiles.includes(tile))tile.canvas.dataset.previewState='waiting';return;}
   this.fill(tile,root);
  }catch(e){if(this.tiles.includes(tile)){tile.failed=true;tile.canvas.dataset.previewState='failed';const label=document.createElement('span');label.className='thumb-state';label.textContent='预览读取失败 · 点击查看详情';tile.canvas.closest('.thumb-wrap')?.append(label);tile.onError?.(e);}}
  finally{this.previewLoading--;tile.loading=false;this.layoutDirty=true;}
 }
 updateCamera(tile, width, height) {
  const aspect = width / Math.max(1, height);
  if (tile.camera.aspect !== aspect) {
   tile.camera.aspect = aspect;
   tile.camera.updateProjectionMatrix();
  }
  const base = tile.s * (tile.owned&&!tile.preview ? 2.25 : 1.8) / Math.min(1, aspect);
  const distance = tile.preview?Math.max(base,previewDistance(tile.dimensions,aspect,tile.camera.fov)):base;
  this.orbitOffset.set(Math.sin(tile.angle+.66), .52, Math.cos(tile.angle+.66))
   .normalize().multiplyScalar(distance);
  tile.camera.position.copy(tile.center).add(this.orbitOffset);
  tile.camera.lookAt(tile.center);
 }
 refreshLayout() {
  this.gridRect = this.host.getBoundingClientRect();
  // Keep the GPU layer in the grid's scrolling content. WebKit can scroll the
  // compositor before delivering scroll events or running our next frame.
  // An absolute layer moves with its cards even while model uploads block JS.
  this.width = Math.max(1, this.gridRect.width);
  this.height = Math.max(1, Math.min(this.gridRect.height, innerHeight + 512));
  this.surfaceTop = Math.max(0, Math.min(-this.gridRect.top - 256,
   this.gridRect.height - this.height));
  this.surface.style.top = this.surfaceTop + 'px';
  this.restoreSurface();
  this.surface.style.width = this.width + 'px';
  this.surface.style.height = this.height + 'px';
  for (const tile of this.tiles) {
   const r = tile.rect = tile.canvas.getBoundingClientRect();
   // Do not wait for a delayed IntersectionObserver entry after the first load,
   // a filter change, or a fast scroll to newly loaded thumbnails.
   tile.visible = r.width>0 && r.height>0 && r.bottom>0 && r.top<innerHeight &&
    r.right>0 && r.left<document.documentElement.clientWidth;
  }
  let live=0;for(const tile of this.tiles){tile.live=tile.visible&&live++<12;const label=tile.canvas.closest('.thumb-wrap')?.querySelector('.rotate-label'),text=tile.visible&&!tile.live&&tile.preview?'静态预览':'↻ 360°';if(label&&label.textContent!==text)label.textContent=text;}
  this.layoutDirty = false;
 }
 restoreSurface() {
  const ratio = Math.min(devicePixelRatio, 1.5);
  if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
  this.renderer.getSize(this.renderSize);
  const width = Math.max(1, this.width), height = Math.max(1, this.height);
  if (this.renderSize.x !== width || this.renderSize.y !== height)
   this.renderer.setSize(width, height, false);
 }
 // Read back only for a requested PNG or the overflow static tiles, never per animation frame.
 snapshot(tile) {
  const rect = tile.rect || tile.canvas.getBoundingClientRect();
  const width = rect.width || 240, height = rect.height || 205;
  const scale = Math.min(1.25, 480/width, 400/height);
  tile.canvas.width = Math.max(1, Math.round(width*scale));
  tile.canvas.height = Math.max(1, Math.round(height*scale));
  this.renderer.setPixelRatio(1);
  this.renderer.setSize(tile.canvas.width, tile.canvas.height, false);
  this.renderer.setScissorTest(false);
  this.renderer.setViewport(0, 0, tile.canvas.width, tile.canvas.height);
  this.renderer.clear();
  this.updateCamera(tile, width, height);
  this.renderer.render(tile.scene, tile.camera);
  const ctx = tile.canvas.getContext('2d');
  ctx.clearRect(0, 0, tile.canvas.width, tile.canvas.height);
  ctx.drawImage(this.surface, 0, 0);
  tile.snapshotReady = true;
  tile.canvas.dataset.draws = String(Math.max(1, tile.draws));
 }
 async restoreThumbnail(tile){
  tile.cacheChecking=true;
  try{const url=await thumbnailCache.get(tile.asset.sha);if(!url||!this.tiles.includes(tile)||!tile.visible)return;
   const img=new Image();img.src=url;await img.decode();if(!this.tiles.includes(tile)||!tile.visible||tile.root)return;
   tile.canvas.width=img.naturalWidth;tile.canvas.height=img.naturalHeight;tile.canvas.getContext('2d').drawImage(img,0,0);tile.canvas.style.opacity='1';tile.snapshotReady=true;tile.canvas.dataset.previewState='cached';tile.canvas.dataset.cached='true';tile.canvas.dataset.readyAt=String(performance.now());
  }catch{}finally{tile.cacheChecked=true;tile.cacheChecking=false;}
 }
 cacheThumbnail(tile){
  if(!tile.asset||tile.cachedOnce)return;tile.cachedOnce=true;
  const small=document.createElement('canvas');small.width=256;small.height=192;small.getContext('2d').drawImage(tile.canvas,0,0,256,192);thumbnailCache.put(tile.asset.sha,small.toDataURL('image/png'));
 }
 async miniature(asset) {
  const cached=await thumbnailCache.get(asset.sha);if(cached)return cached;this.miniQueue??=new DecodeQueue(1);
  return this.miniQueue.run(async()=>{
   let tile=this.tiles.find(t=>t.asset?.id===asset.id&&t.root),root;
   const canvas=document.createElement('canvas');canvas.width=canvas.height=80;
   try {
    if(!tile){root=await loadPreview(asset);tile={canvas,angle:0,preview:true,rect:{width:80,height:80}};this.fill(tile,root);}
    this.snapshot(tile);canvas.getContext('2d').drawImage(tile.canvas,0,0,80,80);
    return canvas.toDataURL('image/png');
   }finally{if(root)releasePreview(root);this.layoutDirty=true;if(this.running&&this.host)this.draw();}
  });
 }
 captureTiles() {
  if (!this.host || !this.tiles.length) return;
  for (const tile of this.tiles) if (tile.root&&tile.drawn) this.snapshot(tile);
  this.layoutDirty = true;
  // Restore live drawing synchronously so saving a PNG cannot flash or blank the gallery.
  this.draw();
 }
 draw() {
  if (this.layoutDirty) this.refreshLayout();
  const visible = this.tiles.filter(tile => {
   const r = tile.rect;
   return tile.root && tile.visible && r;
  });
  const live = visible.filter(tile=>tile.live);
  for (const tile of visible.filter(tile=>!tile.live)) {
   if (tile.dirty || !tile.snapshotReady) this.snapshot(tile);
   tile.canvas.style.opacity = '1';
   tile.dirty = false;
   tile.drawn = true;
   // Overflow cards retain only a small still image, not another GLB/GPU scene.
   if(tile.preview){this.cacheThumbnail(tile);releasePreview(tile.root);Object.assign(tile,{root:null,scene:null,camera:null});}
  }
  for(const tile of live)if(tile.preview&&!tile.cachedOnce){this.snapshot(tile);this.cacheThumbnail(tile);}
  // Dimensions remain unchanged throughout normal animation.
  this.restoreSurface();
  this.renderer.setScissorTest(false);
  this.renderer.setViewport(0, 0, this.width, this.height);
  this.renderer.clear();
  this.renderer.setScissorTest(true);
  const grid = this.gridRect;
  const surfaceY = grid.top + this.surfaceTop;
  for (const tile of live) {
   const r = tile.rect;
   const left = Math.max(r.left, grid.left), right = Math.min(r.right, grid.right);
   const top = Math.max(r.top, surfaceY), bottom = Math.min(r.bottom, surfaceY+this.height, grid.bottom);
   if (right<=left || bottom<=top) continue;
   this.updateCamera(tile, r.width, r.height);
   this.renderer.setViewport(r.left-grid.left, this.height-(r.bottom-surfaceY), r.width, r.height);
   this.renderer.setScissor(left-grid.left, this.height-(bottom-surfaceY), right-left, bottom-top);
   this.renderer.render(tile.scene, tile.camera);
   if (tile.canvas.style.opacity !== '0') tile.canvas.style.opacity = '0';
   tile.dirty = false;
   tile.drawn = true;
   tile.draws++;if(!tile.canvas.dataset.readyAt)tile.canvas.dataset.readyAt=String(performance.now());
  }
  this.renderer.setScissorTest(false);
  if (this.surface.dataset.visibleTiles !== String(live.length))
   this.surface.dataset.visibleTiles = String(live.length);
  this.frames++;
 }
 tick(now) {
  requestAnimationFrame(this.tick);
  if (!this.running || document.hidden || !this.host?.isConnected) {
   this.last = this.lastDraw = 0;
   return;
  }
  // Poll one rect so paused previews also recover when WebKit coalesces a
  // scroll event. Full per-card layout is read only when the grid has moved.
  const grid = this.host.getBoundingClientRect();
  if (!this.gridRect || grid.top!==this.gridRect.top || grid.left!==this.gridRect.left ||
   grid.width!==this.gridRect.width || grid.height!==this.gridRect.height)
   this.layoutDirty = true;
  if(this.layoutDirty)this.refreshLayout();
  this.pumpPreviews();
  const dt = this.last ? Math.min((now-this.last)/1000, .05) : 0;
  this.last = now;
  let animated = 0;
  for (const tile of this.tiles) {
   if (!tile.root || !tile.visible || !tile.live || animated>=12) continue;
   animated++;
   if (this.auto) {
    tile.angle = (tile.angle+dt*this.speed) % (Math.PI*2);
    tile.update?.(tile, now/1000);
    tile.dirty = true;
   }
  }
  if (!this.layoutDirty && !this.tiles.some(tile=>tile.visible && tile.dirty)) {
   this.lastDraw = 0;
   return;
  }
  const start = performance.now();
  this.draw();
  if (this.lastDraw && this.auto) {
   this.intervals.push(now-this.lastDraw);
   if (this.intervals.length>240) this.intervals.shift();
  }
  this.costs.push(performance.now()-start);
  if (this.costs.length>240) this.costs.shift();
  this.lastDraw = now;
  // Keep diagnostics out of the frame's DOM hot path; retain bounded samples for QA.
  if (now-this.lastReport>1000) {
   this.lastReport = now;
   const intervals = [...this.intervals].sort((a,b)=>a-b);
   const costs = [...this.costs].sort((a,b)=>a-b);
   const percentile = (a,p) => a.length ? a[Math.floor((a.length-1)*p)].toFixed(2) : '0';
   Object.assign(this.surface.dataset, {frames:String(this.frames), samples:String(intervals.length),loadedPreviews:String(this.tiles.filter(t=>t.preview&&t.root).length),
    frameP50:percentile(intervals,.5), frameP95:percentile(intervals,.95),
    drawP95:percentile(costs,.95), fps:intervals.length ?
     (1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length)).toFixed(1) : '0'});
   for (const tile of this.tiles) {
    tile.canvas.dataset.angle = tile.angle.toFixed(4);
    tile.canvas.dataset.draws = String(Math.max(tile.draws,tile.snapshotReady?1:0));
   }
  }
 }
 reset() {
  for (const tile of this.tiles) {tile.angle=0;tile.dirty=true;}
  this.last = 0;
 }
}
export class Stage{
 constructor(onSelect,onCommit){this.onSelect=onSelect;this.onCommit=onCommit;this.measurements=new MeasurementOverlay(this);this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(0xeef0f5);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('aria-label','三维视窗，左键拖动旋转，滚轮缩放，点击选择组件');this.scene=new T.Scene();lights(this.scene);this.content=new T.Group();this.scene.add(this.content);this.grid=new T.GridHelper(40,40,0xc3cada,0xdadfea);this.scene.add(this.grid);this.camera=new T.PerspectiveCamera(40,1,.01,100000);this.camera.position.set(8,6,9);this.orbit=new OrbitControls(this.camera,this.renderer.domElement);this.orbit.enableDamping=true;this.orbit.addEventListener('change',()=>this.dirty=true);this.orbit.addEventListener('start',()=>{this.resumeAuto=this.auto;this.auto=false;});this.orbit.addEventListener('end',()=>{this.auto=this.resumeAuto;this.dirty=true;});this.transform=new TransformControls(this.camera,this.renderer.domElement);this.scene.add(this.transform.getHelper());this.transform.setSize(.75);this.transform.addEventListener('dragging-changed',e=>{this.orbit.enabled=!e.value;if(!e.value&&this.transform.object){const o=this.transform.object;this.onCommit?.(o.userData.instanceId,{position:o.position.toArray(),rotation:o.rotation.toArray().slice(0,3),scale:o.scale.toArray().map(v=>v/(o.userData.unitScale||1))});}this.dirty=true;});this.transform.addEventListener('change',()=>this.dirty=true);this.box=new T.Box3Helper(new T.Box3(),0x5263d8);this.box.visible=false;this.scene.add(this.box);this.dirty=true;this.auto=false;this.mode='material';this.split=.5;this.explode=0;this.tick=this.tick.bind(this);this.last=0;this.frames=0;requestAnimationFrame(this.tick);const c=this.renderer.domElement;c.addEventListener('pointerdown',e=>{this.down=[e.clientX,e.clientY];});c.addEventListener('pointerup',e=>{if(!this.selectable||this.transform.axis||Math.hypot(e.clientX-this.down?.[0],e.clientY-this.down?.[1])>5)return;const r=c.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);const hit=ray.intersectObjects(this.content.children,true)[0];let o=hit?.object;while(o&&o.parent!==this.content)o=o.parent;if(o?.userData.instanceId)this.onSelect(o.userData.instanceId);});}
 mount(host){this.host=host;host.append(this.renderer.domElement);this.measurements.mount(host);this.resizeObserver?.disconnect();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.active=true;this.resize();}
 pause(){this.active=false;this.transform.detach();}
 resize(){if(!this.host)return;const r=this.host.getBoundingClientRect();this.renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);this.measurements.resize(r.width,r.height);this.camera.aspect=r.width/Math.max(1,r.height);this.camera.updateProjectionMatrix();this.dirty=true;}
 show(group,{selectable=false,grid=false,fit=true}={}){this.transform.detach();this.selected=null;this.box.visible=false;this.content.clear();if(group.children.length)this.content.add(...group.children.slice());this.selectable=selectable;this.grid.visible=grid;if(fit)this.fit();this.dirty=true;}
 fit(){const b=new T.Box3().setFromObject(this.content);if(b.isEmpty()){this.orbit.target.set(0,0,0);this.camera.position.set(8,6,9);}else{const s=b.getSize(new T.Vector3()),center=b.getCenter(new T.Vector3()),d=Math.max(s.x/Math.min(this.camera.aspect,1),s.y,s.z,.1)*1.8;this.orbit.target.copy(center);this.camera.position.copy(center).add(new T.Vector3(.9,.7,1.2).normalize().multiplyScalar(d));}this.orbit.update();this.dirty=true;}
 select(id,locked=false){this.selected=id;const o=this.content.children.find(o=>o.userData.instanceId===id);if(o){this.box.box.setFromObject(o);this.box.visible=true;if(!locked&&!this.explode)this.transform.attach(o);else this.transform.detach();}else{this.transform.detach();this.box.visible=false;}this.dirty=true;}
 setMode(mode){this.mode=mode;this.dirty=true;}
 reset(){this.explode=0;this.content.children.forEach(o=>{if(o.userData.basePosition)o.position.fromArray(o.userData.basePosition);});this.auto=false;this.fit();}
 tick(now){requestAnimationFrame(this.tick);if(!this.active||document.hidden)return;const dt=Math.min((now-this.last)/1000,.1);this.last=now;this.orbit.autoRotate=this.auto;this.orbit.autoRotateSpeed=1.1;const moving=this.orbit.update(dt);if(this.auto)this.dirty=true;if(!this.dirty&&!moving)return;
 for(const o of this.content.children){const base=o.userData.basePosition;if(base&&this.explode){const i=this.content.children.indexOf(o),v=new T.Vector3(...base).sub(this.orbit.target);if(v.length()<.1)v.set(Math.cos(i*2),.5,Math.sin(i*2));o.position.fromArray(base).add(v.normalize().multiplyScalar(this.explode));}}
 if(this.box.visible){const o=this.content.children.find(o=>o.userData.instanceId===this.selected);if(o)this.box.box.setFromObject(o);}
 const width=this.renderer.domElement.width,height=this.renderer.domElement.height,ratio=this.renderer.getPixelRatio();if(this.mode==='split'){this.renderer.setScissorTest(true);const cut=width*this.split/ratio;setMode(this.content,'wire');this.renderer.setScissor(0,0,cut,height/ratio);this.renderer.render(this.scene,this.camera);setMode(this.content,'material');this.renderer.setScissor(cut,0,width/ratio-cut,height/ratio);this.renderer.render(this.scene,this.camera);this.renderer.setScissorTest(false);}else{setMode(this.content,this.mode);this.renderer.render(this.scene,this.camera);}this.measurements.draw();this.dirty=false;this.frames++;}
 measurementContext(){return collectMeasurements(this);}
 previewDataURL(){return this.measurements.capture();}
}
export async function projectGroup(project,assets,{cancelled=()=>false}={}){const group=new T.Group();for(const i of project.instances){if(cancelled())return group;const a=assets.find(x=>x.id===i.assetId);if(!a)throw Error('素材引用丢失：'+i.assetId);const m=await model(i.geometry?{...a,sha:i.geometry.sha}:a);if(cancelled())return group;const o=m.root.clone(true);if(i.geometry){o.children[0].scale.set(...i.geometry.dimensions.map((d,k)=>d/Math.max(m.dimensions[k],.00001)));}o.position.fromArray(i.position);o.rotation.set(...i.rotation);o.scale.fromArray(i.scale).multiplyScalar(i.unitScale);o.name=i.name||a.name;o.userData={geometryMesh:Boolean(i.geometry),instanceId:i.id,assetId:i.assetId,assetVersion:i.version,unitScale:i.unitScale,basePosition:i.position.slice(),measurementCalibrated:Boolean(a.dimensions)&&Math.abs(i.unitScale-a.unitScale)<Math.max(1e-9,a.unitScale*1e-6)};group.add(o);}return group;}
export async function exportGLB(group){setMode(group,'material');group.traverse(o=>{if(o.userData.originalMaterial){o.material=o.userData.originalMaterial;delete o.userData.originalMaterial;}});return new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true,trs:true,...(group.children.some(o=>o.userData.geometryMesh)?{maxTextureSize:1024}:{})});}
