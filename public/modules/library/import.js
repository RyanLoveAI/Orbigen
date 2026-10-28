// Shared local GLB limit for the file picker, folder scanner, HTTP and storage.
export const ASSET_IMPORT_MAX_BYTES=256*1048576;
export function checkAssetSize(size,maxBytes=ASSET_IMPORT_MAX_BYTES){
 if(size>maxBytes)throw Error('单件 GLB 上限 '+Math.floor(maxBytes/1048576)+' MB（当前 '+(size/1048576).toFixed(1)+' MB），请先压缩贴图或优化模型');
}
export async function validateAssetFile(file){
 checkAssetSize(file.size);
 // Upload the original Blob directly; validation only needs the GLB header.
 const bytes=await file.slice(0,20).arrayBuffer(),view=new DataView(bytes);
 if(bytes.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==file.size)throw Error('需要完整的 GLB 2.0 文件');
}
