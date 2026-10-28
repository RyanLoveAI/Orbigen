import {ASSET_CATEGORIES} from '../asset-folder/classify.js';
import {ROLES} from './schema.js';
export {ASSET_CATEGORIES};
export const categoryOf=part=>ASSET_CATEGORIES.includes(part.category)?part.category:ROLES[part.role]?.category||'其他';
export const roleForCategory=category=>Object.keys(ROLES).find(role=>ROLES[role].category===category)||'other';
export function componentStock(record,assets){
 if(!record||record.deletedAt||record.archived)return [];
 const active=new Map(assets.filter(a=>!a.deletedAt).map(a=>[a.id,a]));
 return record.parts.filter(p=>!p.archived&&!p.deletedAt).map(p=>{const asset=active.get(p.generation?.assetId);return {...p,asset:asset||null,category:asset?.category||p.category,available:!!asset};});
}
export function extensionAssets(category,assets,stock=[],search=''){
 if(!ASSET_CATEGORIES.includes(category))return [];
 const excluded=new Set(stock.filter(p=>p.available).map(p=>p.asset.id)),needle=search.trim().toLowerCase();
 return assets.filter(a=>!a.deletedAt&&a.category===category&&!excluded.has(a.id)&&(!needle||[a.name,...(a.tags||[])].join(' ').toLowerCase().includes(needle))).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));
}
// Vision suggestions are an extension to a manually authored list. They cannot reset it.
export function applyAnalysis(project,analysis,suggestions){
 const next=structuredClone(project);next.analysis=analysis;
 if(!project.breakdown){next.parts=suggestions;next.instances=[];next.marks=[];}
 return next;
}
