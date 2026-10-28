import { createTreeSpeciesShape, normalizeSpeciesStructure } from './tree-species-shape.js';
import { BATCH2_SPECIES } from './plant-species-batch2.js';
import { ROAD_SPECIES } from './plant-species-road.js';
import { PENDING_BATCH2_SPECIES } from './plant-species-pending.js';
import { createShrubFormShape, normalizeShrubForm } from './shrub-form-shape.js';
import { createPottedPlantShape } from './potted-plant-shape.js';
import { DEFAULT_SETTINGS, normalizeSettings } from './branch-kernel.js';
import { normalizeAuthoring } from './authoring-state.js';
import { normalizeBranchShape } from './branch-workbench-data.js';
import { PLANT_GROWTH_PROFILES, GROWTH_PRESET_VERSION } from './plant-growth-profiles.js';

// Botanical traits guide these editable art presets; dimensions are asset defaults.
export const TREE_SPECIES = {
  ...BATCH2_SPECIES,
  ...ROAD_SPECIES,
  ...PENDING_BATCH2_SPECIES,
  CAMPHOR:{name:'香樟',folder:'01_香樟',latin:'Cinnamomum camphora',arrangement:'ALTERNATE',leaf:.09,aspect:.5,length:2.2,spread:.64,rise:.32,drop:.16,branchCount:7,shoots:3,note:'互生常绿叶；外展弧枝，细梢疏密错落。',source:'https://efloras.org/florataxon.aspx?flora_id=1&taxon_id=200008697'},
  WILLOW:{name:'垂柳',folder:'02_垂柳',latin:'Salix babylonica',arrangement:'ALTERNATE',leaf:.11,aspect:.13,length:2.7,spread:.32,rise:.18,drop:1.35,branchCount:8,shoots:2,note:'狭长互生叶；侧枝先向外延伸，柔软细梢下垂。',source:'https://plants.ces.ncsu.edu/plants/salix-babylonica/'},
  GINKGO:{name:'银杏',folder:'03_银杏',latin:'Ginkgo biloba',arrangement:'CLUSTERED',leaf:.08,aspect:1,length:2,spread:.48,rise:.3,drop:.04,branchCount:5,shoots:5,note:'长枝与短枝分开；短枝顶端簇生扇形叶，长短枝疏密错落。',source:'https://landscapeplants.oregonstate.edu/plants/ginkgo-biloba'},
  MAPLE:{name:'鸡爪槭',folder:'04_鸡爪槭',latin:'Acer palmatum',arrangement:'OPPOSITE',leaf:.085,aspect:.95,length:1.7,spread:.7,rise:.13,drop:.12,branchCount:6,shoots:2,note:'掌状裂叶对生；较舒展的成对侧枝。本批使用绿叶型。',source:'https://landscapeplants.oregonstate.edu/plants/acer-palmatum'},
  ELM:{name:'榔榆',folder:'05_榔榆',latin:'Ulmus parvifolia',arrangement:'ALTERNATE',leaf:.045,aspect:.56,length:1.8,spread:.53,rise:.2,drop:.09,branchCount:9,shoots:4,note:'小型锯齿叶互生；细密分枝，轻微曲折、偏平展。',source:'https://plants.ces.ncsu.edu/plants/ulmus-parvifolia/'},
  OSMANTHUS:{name:'桂花',folder:'06_桂花',latin:'Osmanthus fragrans',arrangement:'OPPOSITE',leaf:.10,aspect:.4,length:1.5,spread:.46,rise:.42,drop:.06,branchCount:6,shoots:2,note:'革质叶对生；节间较紧、末梢上扬。本批只做绿叶枝，不含花。',source:'https://plants.ces.ncsu.edu/plants/osmanthus-fragrans/'},
  CELTIS:{name:'朴树',folder:'07_朴树',latin:'Celtis sinensis',arrangement:'ALTERNATE',leaf:.08,aspect:.60,length:2.0,spread:.65,rise:.23,drop:.10,branchCount:8,shoots:4,leafCount:6,organMode:'FRUIT',organHabit:'AXILLARY',note:'互生叶、细梢曲折；6 片叶、小花与青熟果共用一张 4K 图集。',source:'https://plants.ces.ncsu.edu/plants/celtis-sinensis/'},
  PLATANUS:{name:'二球悬铃木',folder:'08_二球悬铃木',latin:'Platanus × acerifolia',arrangement:'ALTERNATE',leaf:.18,aspect:.90,length:2.5,spread:.75,rise:.32,drop:.10,branchCount:6,shoots:3,leafCount:6,organMode:'FRUIT',organHabit:'PENDANT',note:'掌状大叶互生，枝条舒展；6 片叶、花球和下垂双果球共用一张 4K 图集。',source:'https://plants.ces.ncsu.edu/plants/platanus-x-acerifolia/'},
  MAGNOLIA:{name:'广玉兰',folder:'09_广玉兰',latin:'Magnolia grandiflora',arrangement:'ALTERNATE',leaf:.20,aspect:.55,length:1.8,spread:.55,rise:.45,drop:.06,branchCount:6,shoots:2,leafCount:6,organMode:'FLOWER',organHabit:'TERMINAL',note:'革质叶螺旋互生；白花与花苞生在枝梢，6 片叶与花共用一张 4K 图集。',source:'https://plants.ces.ncsu.edu/plants/magnolia-grandiflora/'},
};
export const TREE_BRANCH_STYLES={MAIN:'主枝段',SIDE:'侧枝',TIP:'末端细梢'};
for(const [id,spec] of Object.entries(TREE_SPECIES)) spec.growth=PLANT_GROWTH_PROFILES[id];
export function treeSpeciesStyles(spec) {
  return spec.category === 'SHRUB' && spec.clippedForms !== false ? { ...(spec.styles || TREE_BRANCH_STYLES), BALL:'修剪球', HEDGE:'连续绿篱' } : spec.styles || TREE_BRANCH_STYLES;
}
function random(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}

export function createTreeSpeciesDocument(id,style='SIDE',seed=12037,options={}){
  const spec=TREE_SPECIES[id];if(!spec)throw Error('未知树种');if(!treeSpeciesStyles(spec)[style])throw Error('未知枝型');
  seed=Math.max(1,Math.min(2147483646,Math.trunc(Number(seed)||12037)));
  const shaped = style==='BALL'||style==='HEDGE';
  if(options.structure&&(shaped||spec.category==='POTTED'))throw Error('结构再生成仅支持乔木或灌木的主枝段、侧枝和末端细梢');
  const plantForm = shaped ? {...normalizeShrubForm(options.plant_form),style} : null;
  const {branches,root,L}=shaped ? createShrubFormShape(id,style,spec,random(seed),plantForm) : (spec.category==='POTTED'?createPottedPlantShape:createTreeSpeciesShape)(id,style,spec,random(seed),options.structure);
  const name=`${spec.name}_${treeSpeciesStyles(spec)[style]}_占位叶`;
  const crownDensity = style === 'BALL' ? Math.max(1, Math.sqrt(plantForm.height * plantForm.width / (.8 * .9))) : 1;
  const isTip=style==='TIP',spurLevel=isTip?1:2;
  const settings=normalizeSettings({...DEFAULT_SETTINGS,object_name:name,species_profile:id==='WILLOW'?'WILLOW':'BROADLEAF',architecture:'HORIZONTAL',seed,length:L,base_radius:root.start_radius,tip_radius:root.end_radius,child_count:0,branch_levels:4,radial_segments:9,junction_collar:false,junction_flare:.20,radius_bias:.18,leaf_scale:spec.leaf,leaf_aspect:spec.aspect,leaf_density:crownDensity*(shaped?1.8:1)*(spec.leafDensity??(id==='GINKGO'?90:id==='ELM'?42:30)),leaf_zone_start:spec.leafZoneStart??(id==='GINKGO'?.4:.12),tip_cluster:0,leaf_arrangement:spec.arrangement,phyllotaxis_angle:spec.phyllotaxis??(spec.arrangement==='OPPOSITE'?90:id==='ELM'?180:137.5),petiole_length:.004,branch_clearance:.001,leaf_min_spacing:.006,leaf_twist:14,leaf_scale_variation:.2,leaf_droop:spec.leafDroop??(id==='WILLOW'?.55:.12),season_progress:0,wind_strength:.15,max_triangles:shaped?1500000:180000,max_leaves:shaped?9000:3000,export_lods:false});
  const authoring=normalizeAuthoring({foliage_unit:{...spec.foliageUnit,...options.foliage_unit},plant_form:plantForm,branch_shape:normalizeBranchShape({branches,connector:{position:root.points[0],direction:root.points[1].map((v,i)=>v-root.points[0][i]),locked:true}}),recipe:{name,tags:['CN_TREE_STARTER',id,style,'NATURAL_BRANCH_V2',GROWTH_PRESET_VERSION,'PLACEHOLDER_LEAVES',...((shaped||spec.category==='POTTED'||spec.category==='SHRUB'&&style==='MAIN')?['WHOLE_PLANT']:[])]},workbench:{name},profiles:{leaf_density:[1,1,1]},level_rules:[0,1,2,3].map(()=>({leaves:1})),attachment_layers:[{id:'ATTACH_LEAVES',name:'待替换树种叶片',type:'LEAF',enabled:true,order_min:style==='HEDGE'?2:spec.category==='POTTED'?0:id==='GINKGO'?spurLevel:isTip?0:1,order_max:3,start:shaped?.20:0,end:1,density:1,scale:1}]},seed);
  if(!shaped&&spec.category!=='POTTED'){
    authoring.species_structure={species:id,style,seed,structure:normalizeSpeciesStructure(options.structure,spec,style)};
    authoring.recipe.tags.push('WOODY_TAPER_V2');
  }
  if(spec.plantSupport){
    // Each leaf support carries one blade/frond, not a woody branch covered
    // with additional leaves. Its imported unit can be replaced later.
    settings.bark_color='#496638';settings.leaf_outward=0;settings.leaf_droop=0;settings.collision_avoidance=false;
    authoring.attachment_layers.forEach(layer=>layer.enabled=false);
    authoring.leaf_edits.added=branches.filter(b=>b.parent).map((b,i)=>({id:`SUPPORT_LEAF_${i}`,parent:b.id,t:.98,azimuth:0,scale:1,source:i%(spec.leafCount||8)}));
  }
  return {format:'ProceduralBranchProject',version:4,generator_version:'4.0.0',settings,authoring,leaf_meshes:[],leaf_mesh:null,protectTrunk:false};
}


