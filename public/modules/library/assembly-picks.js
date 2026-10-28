const KEY='orbigen-assembly-picks-v1';
export class AssemblyPicks {
 constructor(storage){this.storage=storage;this.ids=[];this.open=false;this.busy=false;try{const s=JSON.parse(storage?.getItem(KEY)||'null');if(Array.isArray(s?.ids)){this.ids=[...new Set(s.ids.filter(id=>typeof id==='string'))].slice(0,500);this.open=Boolean(s.open);}}catch{}}
 persist(){try{this.storage?.setItem(KEY,JSON.stringify({ids:this.ids,open:this.open}));}catch{}}
 add(id){if(this.busy)throw Error('正在导入，请稍候');if(this.ids.includes(id)){this.open=true;this.persist();return false;}if(this.ids.length>=500)throw Error('装配列表最多 500 件');this.ids.push(id);this.open=true;this.persist();return true;}
 remove(id){if(this.busy)return;this.ids=this.ids.filter(x=>x!==id);this.persist();}
 show(value=true){if(this.busy)return;this.open=value;this.persist();}
 async start(importBatch){if(this.busy)return false;if(!this.ids.length)throw Error('请先挑选素材');this.busy=true;try{await importBatch([...this.ids]);this.ids=[];this.open=false;this.persist();return true;}finally{this.busy=false;}}
}
// Validate and decode every source before the caller changes the project.
export async function prepareAssemblyBatch(ids,assets,instances,load,uuid){
 if(!ids.length)throw Error('请先挑选素材');if(instances.length+ids.length>500)throw Error('工程最多 500 个实例，请减少列表中的素材');
 const picked=ids.map(id=>{const a=assets.find(x=>x.id===id);if(!a||a.deletedAt)throw Error('列表中有素材已删除，请移除后重试');return a;});
 const sizes=[];for(const a of picked){try{const m=await load(a);sizes.push(m.dimensions.map(v=>v*a.unitScale));}catch(e){throw Error(a.name+' 无法读取：'+e.message);}}
 const widest=Math.max(.1,...sizes.map(s=>s[0])),deepest=Math.max(.1,...sizes.map(s=>s[2])),columns=Math.ceil(Math.sqrt(picked.length)),gap=Math.max(.2,widest*.15);
 const start=instances.length?Math.max(...instances.map(i=>i.position[0]))+widest+gap:0;
 return picked.map((a,n)=>({id:uuid(),assetId:a.id,version:a.version,name:a.name,unitScale:a.unitScale,position:[start+(n%columns)*(widest+gap),0,Math.floor(n/columns)*(deepest+gap)],rotation:[0,0,0],scale:[1,1,1],locked:false}));
}
