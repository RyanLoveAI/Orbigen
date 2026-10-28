// Use the actual import timestamp, independent of editable date tags and later edits.
export function newestAssets(assets){
 const time=a=>{const value=Date.parse(a.createdAt);return Number.isFinite(value)?value:0;};
 // The API lists assets in insertion order; later inserts win timestamp ties.
 return assets.slice().reverse().sort((a,b)=>time(b)-time(a));
}
