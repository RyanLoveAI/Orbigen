export const LIBRARY_PAGE_SIZES=[60,120,240,0];
export const normalizeLibraryPageSize=value=>LIBRARY_PAGE_SIZES.includes(Number(value))&&value!==null&&value!==''?Number(value):120;
export function libraryPageInfo(count,page,pageSize){
 const size=normalizeLibraryPageSize(pageSize)||Math.max(1,count),pages=Math.max(1,Math.ceil(count/size));
 page=Math.max(0,Math.min(Number.isInteger(page)?page:0,pages-1));
 return {page,pages,size,start:page*size,end:Math.min(count,(page+1)*size)};
}
