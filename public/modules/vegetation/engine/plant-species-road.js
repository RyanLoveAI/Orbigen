// Reference sheets are ready; real textured units await the user's Blender files.
const tree={category:'TREE',batch:3,pending:true,leafCount:6,organCount:3,arrangement:'ALTERNATE',aspect:.55,length:1.8,branchCount:7,shoots:3,habit:{bend:.17,arch:.15,spread:.85,lift:.35,node:.08}};
const shrub={...tree,category:'SHRUB',length:.8,styles:{MAIN:'整丛',SIDE:'侧枝',TIP:'末端花枝'},habit:{bend:.13,arch:.12,spread:.8,lift:.6,node:.06}};
const pinnate=(pairs,terminal,spread=55)=>({mode:'PINNATE',pairs,terminal,spread,leaflet_ratio:.28,bend:.08});
export const ROAD_SPECIES={
 KOELREUTERIA:{...tree,name:'栾树',folder:'37_栾树',latin:'Koelreuteria paniculata',leaf:.30,leafDensity:10,foliageUnit:pinnate(5,true),note:'单片小叶沿叶轴组合成奇数羽状复叶；黄花与蒴果等待单元模型。'},
 SAPINDUS:{...tree,name:'无患子',folder:'38_无患子',latin:'Sapindus mukorossi',leaf:.32,leafDensity:9,foliageUnit:pinnate(5,false,62),note:'偶数羽状复叶，无顶端小叶；花序与青熟果等待单元模型。'},
 STYPHNOLOBIUM:{...tree,name:'国槐',folder:'39_国槐',latin:'Styphnolobium japonicum',leaf:.25,leafDensity:12,foliageUnit:pinnate(5,true,60),note:'奇数羽状复叶；花序与串珠状荚果等待单元模型。'},
 FRAXINUS:{...tree,name:'白蜡',folder:'40_白蜡',latin:'Fraxinus chinensis',arrangement:'OPPOSITE',leaf:.24,leafDensity:10,foliageUnit:pinnate(3,true),note:'整片复叶对生，每片由成对小叶及顶端小叶组成。'},
 METASEQUOIA:{...tree,name:'水杉',folder:'41_水杉',latin:'Metasequoia glyptostroboides',arrangement:'OPPOSITE',phyllotaxis:180,leaf:.13,leafDensity:18,foliageUnit:{mode:'SPRIG'},habit:{bend:.09,arch:.09,spread:.95,lift:.15,node:.04},note:'以一整段扁平羽状叶枝为单元，成对排列；球果等待单元模型。'},
 CEDRUS:{...tree,name:'雪松',folder:'42_雪松',latin:'Cedrus deodara',arrangement:'ALTERNATE',leaf:.055,leafDensity:36,foliageUnit:{mode:'TUFT'},habit:{bend:.15,arch:.2,spread:1,lift:.10,node:.04},note:'以一簇短枝针叶为单元，沿长枝错落排列；球果等待单元模型。'},
 LOROPETALUM:{...shrub,name:'红花檵木',folder:'43_红花檵木',latin:'Loropetalum chinense var. rubrum',leaf:.045,note:'紫红叶互生，花瓣细长带状；可制作自然丛、修剪球和绿篱。'},
 EUONYMUS:{...shrub,name:'大叶黄杨',folder:'44_大叶黄杨',latin:'Euonymus japonicus',arrangement:'OPPOSITE',leaf:.065,note:'厚叶对生、边缘细锯齿；适合修剪球与连续绿篱。'},
 LIGUSTRUM_QUIHOUI:{...shrub,name:'小叶女贞',folder:'45_小叶女贞',latin:'Ligustrum quihoui',arrangement:'OPPOSITE',leaf:.035,leafDensity:42,note:'小叶对生、细密枝丛；花序和黑果等待单元模型。'},
 NERIUM:{...shrub,name:'夹竹桃',folder:'46_夹竹桃',latin:'Nerium oleander',arrangement:'WHORLED',leaf:.14,aspect:.18,length:1.1,note:'狭长革质叶轮生或对生，粉花集中在枝梢。'},
 HIBISCUS:{...shrub,name:'木槿',folder:'47_木槿',latin:'Hibiscus syriacus',leaf:.075,length:1.0,note:'互生浅裂锯齿叶，单花沿上部枝条错落分布。'},
 PYRACANTHA:{...shrub,name:'火棘',folder:'48_火棘',latin:'Pyracantha fortuneana',leaf:.04,leafDensity:38,note:'小叶互生、枝条紧密，白花和红果簇等待单元模型。'},
};
