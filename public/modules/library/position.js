import {isAssetDate} from './dates.js';
import {normalizeLibraryPageSize} from './pagination.js';
// Keep the user's place through detail views, filtering and native Back navigation.
export class LibraryPosition {
 constructor(storage){this.storage=storage;this.key='orbigen-library-position-v1';this.state={page:0,category:'全部',search:'',scrollY:0,date:'',dateFrom:'',dateTo:'',pageSize:120};try{const s=JSON.parse(storage?.getItem(this.key)||'null');if(s&&Number.isInteger(s.page)&&s.page>=0&&typeof s.category==='string'&&typeof s.search==='string'&&Number.isFinite(s.scrollY)&&s.scrollY>=0)this.state={...this.state,...s,pageSize:normalizeLibraryPageSize(s.pageSize),...Object.fromEntries(['date','dateFrom','dateTo'].map(k=>[k,isAssetDate(s[k])?s[k]:'']))};}catch{}}
 save(patch){Object.assign(this.state,patch);try{this.storage?.setItem(this.key,JSON.stringify(this.state));}catch{}return this.state;}
}
