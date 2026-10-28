export class AssetSync {
 constructor({api,onSnapshot}){Object.assign(this,{api,onSnapshot});this.revision=null;}
 async refresh(){
  if(this.refreshing)return this.refreshing;
  this.refreshing=(async()=>{const snapshot=await this.api('/api/assets/snapshot');await this.onSnapshot(snapshot);this.revision=snapshot.revision;return snapshot;})();
  try{return await this.refreshing;}finally{this.refreshing=null;}
 }
 async check(){
  if(this.checking)return this.checking;
  this.checking=(async()=>{const {revision}=await this.api('/api/assets/revision');if(revision===this.revision)return false;const old=this.revision;await this.refresh();return this.revision!==old;})();
  try{return await this.checking;}finally{this.checking=null;}
 }
}
