const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
export function isAssetDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function actualAssetDate(now=new Date()){
 const parts=Object.fromEntries(dayFormat.formatToParts(now).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;
}
export function assetDateOf(asset){
 if(isAssetDate(asset.assetDate))return asset.assetDate;
 const created=new Date(asset.createdAt);return Number.isFinite(created.getTime())?actualAssetDate(created):'';
}
export function assetDateLabel(date){return isAssetDate(date)?date.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1年$2月$3日'):'未标注日期';}
export function withAssetDateTag(tags,date){
 if(!isAssetDate(date))throw Error('素材日期需要有效的年月日');
 return [...new Set(tags.filter(t=>!/^\d{4}年\d{2}月\d{2}日$/.test(t)))].slice(0,19).concat(assetDateLabel(date));
}
export function matchesAssetDate(asset,{date='',dateFrom='',dateTo=''}={}){
 const value=assetDateOf(asset);if(!date&&!dateFrom&&!dateTo)return true;
 return Boolean(value&&(!date||value===date)&&(!dateFrom||value>=dateFrom)&&(!dateTo||value<=dateTo));
}
