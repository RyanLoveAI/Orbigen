export const TREE_FLOW_VERSION='tree-review-1';
export const TREE_STAGES=[
 {id:'leaf',title:'叶片制作',mode:'LEAF',checks:[['leaf-shape','叶片或针叶束形状、尺寸正常'],['leaf-facing','正反面与法线显示正常'],['leaf-material','叶片颜色、贴图与透明边缘正常']]},
 {id:'trunk',title:'树干制作',mode:'TRUNK',checks:[['trunk-shape','树干曲线、粗细与根领位置正常'],['bark-scale','树皮贴图尺度正常，没有明显拉伸'],['bark-relief','树皮起伏与高光表现符合当前用途'],['root-seam','树干与根盘接缝已检查']]},
 {id:'branch',title:'枝条单元',mode:'BRANCH',checks:[['branch-leaves','枝条上的叶片朝向、分布与尺度正常'],['branch-bark','粗枝与细枝的树皮已检查'],['branch-joints','粗细枝连接没有明显断裂或生硬端面'],['branch-tips','细枝与枝尖完整，没有异常短梢']]},
 {id:'assembly',title:'整树组装',mode:'TREE',checks:[['crown','整树轮廓与枝层布局符合用途'],['canopy','完整叶冠没有异常缺失或扎堆'],['trunk-texture','整树树干贴图已再次检查'],['assembly-joints','主干、主枝和细枝接缝已逐层查看']]},
 {id:'quality',title:'质量与优化',mode:'TREE',checks:[['geometry','当前精度的几何检查已核对'],['fine-joints','隐藏叶片后复查粗细枝接缝'],['leaves-final','恢复完整叶片后确认显示正常'],['budget','模型预算与用途限制已核对']]},
 {id:'output',title:'输出资产',mode:'TREE',checks:[['current-version','输出的是当前已复核的参数与精度'],['delivery-look','实际交付模型的叶片、树皮与接缝显示正常'],['provenance','素材来源及使用说明已核对'],['scope','已了解静态制作复核与引擎验收的范围']]},
];
export const TREE_REVIEW_LIMITS='本记录为当前精度的人工静态制作复核。UE 导入、近景写实、根部贴地、风动、碰撞和场景性能仍需分别验收。';
export function stageDefinition(id){const s=TREE_STAGES.find(s=>s.id===id);if(!s)throw Error('未知树木制作步骤');return s;}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export function stagePayload(recipe,id,quality){
 const s=stageDefinition(id);let input=recipe;
 if(s.id==='leaf')input={leaf:Object.fromEntries(['kind','aspect','bend','curl','petiole','mesh'].map(k=>[k,recipe.leaf[k]])),leafSize:recipe.leafSize,needleWidth:recipe.needleWidth,leafColor:recipe.leafColor,seed:recipe.leaf.kind==='NEEDLE'?recipe.seed:null};
 if(s.id==='trunk')input=Object.fromEntries(['trunk','height','radius','roughness','barkColor','rootCount','seed'].map(k=>[k,recipe[k]]));
 return JSON.stringify(canonical({version:TREE_FLOW_VERSION,stage:id,quality,input}));
}
export function numericReview(report,stage){
 const s=stageDefinition(stage),issues=[];
 if(!report||report.ok!==true||report.mode!==s.mode)issues.push('需要生成当前步骤的模型');
 for(const k of ['invalid_vertices','degenerate_faces','missing_uv','missing_normals'])if((report?.[k]??0)!==0)issues.push('几何异常：'+k);
 if(!Number.isFinite(report?.triangles)||report.triangles<1)issues.push('没有有效三角面');
 if(report?.review?.issues?.length)issues.push(...report.review.issues);
 if(['LEAF','BRANCH','TREE'].includes(s.mode)&&!(report?.review?.leafVertices>0))issues.push('没有可见叶片网格');
 if(s.mode!=='LEAF'&&!(report?.review?.barkVertices>0))issues.push('没有树干或枝条网格');
 return {ok:issues.length===0,issues};
}
export function reviewSummary(report){
 const allowed=['ok','mode','quality','triangles','branches','sprays','height','draw_calls','invalid_vertices','degenerate_faces','missing_uv','missing_normals','attachment_overlap_ratio','attachment_overlap_limit'];
 const r=Object.fromEntries(allowed.filter(k=>report[k]!==undefined).map(k=>[k,report[k]]));
 r.review=report.review?{leafVertices:report.review.leafVertices,barkVertices:report.review.barkVertices,issues:report.review.issues,junctions:report.review.junctions,surfaceUnion:'not-performed'}:null;return r;
}
