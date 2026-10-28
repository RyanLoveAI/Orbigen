// Calibrated art presets; source units are supplied by the user's Blender files.
const tree = {category:'TREE',batch:2,leafCount:6,organCount:3,organMode:'FLOWER',organHabit:'TERMINAL',arrangement:'ALTERNATE',aspect:.6};
const shrub = {...tree,category:'SHRUB',styles:{MAIN:'整丛',SIDE:'侧枝',TIP:'末端花枝'}};
const source = slug => `https://plants.ces.ncsu.edu/plants/${slug}/`;
export const BATCH2_SPECIES = {
 CRAPE_MYRTLE:{...tree,name:'紫薇',folder:'11_紫薇',latin:'Lagerstroemia indica',arrangement:'OPPOSITE',leaf:.055,length:1.35,branchCount:7,shoots:3,
  habit:{bend:.17,arch:.16,spread:.78,lift:.52,node:.07},note:'小叶短节间，末端开放紫红花与花苞，保留单花和小花序变化。',source:source('lagerstroemia-indica')},
 CRABAPPLE:{...tree,name:'垂丝海棠',folder:'13_垂丝海棠',latin:'Malus halliana',leaf:.07,length:1.35,branchCount:6,shoots:3,organHabit:'PENDANT',
  habit:{bend:.20,arch:.14,spread:.95,lift:.25,node:.10},note:'互生锯齿叶、舒展弧枝，花朵与花苞沿细枝向外下垂。',source:source('malus-halliana')},
 FICUS_MICROCARPA:{...tree,name:'小叶榕',folder:'14_小叶榕',latin:'Ficus microcarpa',leaf:.06,length:1.7,branchCount:8,shoots:3,organCount:2,organMode:'FRUIT',organHabit:'AXILLARY',
  habit:{bend:.23,arch:.13,spread:1,lift:.20,node:.12},note:'小型革质叶与曲折外展枝，配青色和红紫色榕果。',source:source('ficus-microcarpa')},
 SWEETGUM:{...tree,name:'枫香',folder:'15_枫香',latin:'Liquidambar formosana',leaf:.12,length:2.1,branchCount:6,shoots:3,organCount:2,organMode:'FRUIT',organHabit:'PENDANT',
  habit:{bend:.14,arch:.14,spread:.88,lift:.48,node:.07},note:'三裂叶互生，疏朗斜升侧枝，配青色与棕色刺状果球。',source:source('liquidambar-formosana')},
 PODOCARPUS:{...tree,name:'罗汉松',folder:'16_罗汉松',latin:'Podocarpus macrophyllus',leaf:.065,length:1.2,branchCount:7,shoots:3,organCount:2,organMode:'FRUIT',organHabit:'AXILLARY',leafDensity:48,phyllotaxis:137.5,
  habit:{bend:.11,arch:.08,spread:.83,lift:.21,node:.04},note:'狭长条形叶，细枝近水平开展；附属单元为种子与肉质种托。',source:source('podocarpus-macrophyllus')},
 PHOTINIA:{...shrub,name:'红叶石楠',folder:'17_红叶石楠',latin:'Photinia × fraseri',leaf:.08,length:.8,branchCount:6,shoots:2,
  habit:{bend:.10,arch:.11,spread:.70,lift:.68,node:.04},note:'绿叶为主，红嫩叶偏向细梢；可选白色花序、花苞或红果串。',source:source('photinia-x-fraseri')},
 PITTOSPORUM:{...shrub,name:'海桐',folder:'18_海桐',latin:'Pittosporum tobira',leaf:.07,length:.65,branchCount:6,shoots:2,arrangement:'CLUSTERED',leafDensity:36,
  habit:{bend:.09,arch:.10,spread:.82,lift:.62,node:.03},note:'圆钝叶偏向枝梢成簇，小白花与小花序混合使用。',source:source('pittosporum-tobira')},
 AZALEA:{...shrub,name:'杜鹃',folder:'19_杜鹃',latin:'Rhododendron simsii',leaf:.045,length:.5,branchCount:8,shoots:3,leafDensity:42,
  habit:{bend:.19,arch:.09,spread:.95,lift:.45,node:.11},note:'小叶细密分枝，粉红漏斗花与花苞位于枝梢。',source:'https://www.rhs.org.uk/plants/15682/rhododendron-simsii-ea/details'},
 GARDENIA:{...shrub,name:'栀子',folder:'20_栀子',latin:'Gardenia jasminoides',arrangement:'OPPOSITE',leaf:.08,length:.6,branchCount:6,shoots:2,
  habit:{bend:.10,arch:.12,spread:.66,lift:.67,node:.05},note:'对生革质叶、较紧凑枝丛，末梢白色重瓣花与花苞。',source:source('gardenia-jasminoides')},
 CAMELLIA:{...shrub,name:'山茶',folder:'21_山茶',latin:'Camellia japonica',leaf:.075,length:.75,branchCount:6,shoots:2,organHabit:'AXILLARY',organAmount:.3,
  habit:{bend:.13,arch:.10,spread:.74,lift:.52,node:.06},note:'厚叶互生，红色半重瓣花沿上部细枝错落分布。',source:source('camellia-japonica')},
 JASMINE:{...shrub,name:'茉莉',folder:'24_茉莉',latin:'Jasminum sambac',arrangement:'OPPOSITE',leaf:.055,length:.55,branchCount:6,shoots:2,
  habit:{bend:.22,arch:.16,spread:.78,lift:.50,node:.09},note:'对生单叶、柔软弧枝，白色重瓣小花和花苞簇位于枝梢。',source:'https://www.efloras.org/florataxon.aspx?flora_id=2&taxon_id=200017788'},
 LIGUSTRUM:{...shrub,name:'金森女贞',folder:'25_金森女贞',latin:"Ligustrum japonicum 'Howardii'",arrangement:'OPPOSITE',leaf:.06,length:.65,branchCount:7,shoots:3,
  habit:{bend:.10,arch:.10,spread:.72,lift:.64,node:.05},note:'金黄嫩叶与绿色成熟叶混合，对生紧凑枝；配白色花序与紫黑果串。',source:"https://www.rhs.org.uk/plants/255035/ligustrum-japonicum-howardii-v/details"},
 POTHOS:{category:'POTTED',batch:2,name:'绿萝',folder:'28_绿萝',latin:'Epipremnum aureum',arrangement:'ALTERNATE',leafCount:8,organCount:0,leaf:.16,aspect:.65,length:1.2,leafDensity:12,leafZoneStart:.03,leafDroop:.55,phyllotaxis:180,
  styles:{MAIN:'长垂藤',SIDE:'垂藤',TIP:'短藤'},note:'互生斑叶沿细藤生长，先外展再垂落；保留每片叶的叶柄与自然色斑。',source:source('epipremnum-aureum')},
 FIDDLE_FIG:{category:'POTTED',batch:2,name:'琴叶榕',folder:'29_琴叶榕',latin:'Ficus lyrata',arrangement:'ALTERNATE',leafCount:8,organCount:0,leaf:.32,aspect:.65,length:1.25,leafDensity:11,leafZoneStart:.38,leafDroop:.08,
  styles:{MAIN:'分枝株',SIDE:'直立株',TIP:'幼株'},note:'直立木质主轴，少量上扬分枝，互生大叶集中在中上部。',source:source('ficus-lyrata')},
};
