export class ModelCache {
 constructor({maxEntries=8,maxBytes=128*1048576,onEvict=()=>{}}={}){Object.assign(this,{maxEntries,maxBytes,onEvict});this.entries=new Map();}
 get(key){const e=this.entries.get(key);if(e){this.entries.delete(key);this.entries.set(key,e);}return e;}
 set(key,promise){const e={promise,model:null,bytes:0};this.entries.set(key,e);return e;}
 settle(key,entry,model,bytes){if(this.entries.get(key)!==entry)return;Object.assign(entry,{model,bytes});this.trim();}
 trim(){let ready=[...this.entries].filter(([,e])=>e.model),bytes=ready.reduce((n,[,e])=>n+e.bytes,0);
  while(ready.length>1&&(ready.length>this.maxEntries||bytes>this.maxBytes)){const [key,e]=ready.shift();this.entries.delete(key);bytes-=e.bytes;this.onEvict(e.model);}
 }
 delete(key){this.entries.delete(key);}
 stats(){const es=[...this.entries.values()];return {entries:es.filter(e=>e.model).length,pending:es.filter(e=>!e.model).length,bytes:es.reduce((n,e)=>n+e.bytes,0),maxEntries:this.maxEntries,maxBytes:this.maxBytes};}
}
export class DecodeQueue {
 constructor(limit=2){this.limit=limit;this.active=0;this.jobs=[];}
 run(fn){return new Promise((resolve,reject)=>{this.jobs.push({fn,resolve,reject});this.pump();});}
 pump(){while(this.active<this.limit&&this.jobs.length){const job=this.jobs.shift();this.active++;Promise.resolve().then(job.fn).then(job.resolve,job.reject).finally(()=>{this.active--;this.pump();});}}
}
