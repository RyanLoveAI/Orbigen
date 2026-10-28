// Previously delivered batch-2 reference sheets with no textured unit pack yet.
const source=slug=>`https://plants.ces.ncsu.edu/plants/${slug}/`;
const tree={category:'TREE',batch:2,pending:true,leafCount:6,organCount:3,arrangement:'ALTERNATE',aspect:.6,length:1.6,branchCount:6,shoots:3,habit:{bend:.15,arch:.14,spread:.8,lift:.4,node:.07}};
const shrub={...tree,category:'SHRUB',clippedForms:false,length:.75,styles:{MAIN:'自然整丛',SIDE:'侧枝',TIP:'末端花枝'}};
const pot={...tree,category:'POTTED',leafCount:8,organCount:0,length:.65,leafDensity:12,styles:{MAIN:'完整株丛',SIDE:'小株丛',TIP:'幼株'},note:'等待真实叶片单元；当前叶形仅为程序示意。'};
export const PENDING_BATCH2_SPECIES={
 MAGNOLIA_DENUDATA:{...tree,name:'白玉兰',folder:'10_白玉兰',latin:'Magnolia denudata',leaf:.16,source:source('magnolia-denudata'),note:'粗壮上扬枝与少量短花枝；等待叶片和花单元。'},
 PRUNUS_SERRULATA:{...tree,name:'樱花',folder:'12_樱花',latin:'Prunus serrulata',leaf:.09,source:source('prunus-serrulata'),note:'采用园林樱花代表性开张枝型，长枝与短花枝混合；具体品种可再调。'},
 HYDRANGEA:{...shrub,name:'绣球',folder:'22_绣球',latin:'Hydrangea macrophylla',leaf:.14,arrangement:'OPPOSITE',shoots:1,source:source('hydrangea-macrophylla'),note:'基部多枝、较少次级木质分叉，枝端预留花球位置。'},
 ROSE:{...shrub,name:'月季',folder:'23_月季',latin:'Rosa hybrids',leaf:.18,leafDensity:14,foliageUnit:{mode:'PINNATE',pairs:2,terminal:true,spread:55},source:source('rosa'),note:'采用直立灌木月季代表枝型；暂不生成皮刺，非藤本月季。'},
 NANDINA:{...shrub,name:'南天竹',folder:'26_南天竹',latin:'Nandina domestica',leaf:.3,leafDensity:8,leafZoneStart:.62,length:1.1,shoots:0,source:source('nandina-domestica'),note:'少分枝的直立丛生茎；二至三回羽状复叶等待完整单元，当前叶片仅标示分布。'},
 MONSTERA:{...pot,name:'龟背竹',folder:'27_龟背竹',latin:'Monstera deliciosa',leaf:.4,length:.8,plantSupport:'CLIMBER',source:source('monstera-deliciosa')},
 FICUS_ELASTICA:{...pot,name:'橡皮树',folder:'30_橡皮树',latin:'Ficus elastica',leaf:.28,length:1.3,styles:{MAIN:'分枝株',SIDE:'直立株',TIP:'幼株'},source:source('ficus-elastica')},
 STRELITZIA:{...pot,name:'鹤望兰',folder:'31_鹤望兰',latin:'Strelitzia reginae',leaf:.45,length:.9,plantSupport:'FAN',source:source('strelitzia-reginae')},
 SPATHIPHYLLUM:{...pot,name:'白鹤芋',folder:'32_白鹤芋',latin:'Spathiphyllum hybrids',leaf:.26,length:.5,plantSupport:'ROSETTE',source:source('spathiphyllum')},
 ANTHURIUM:{...pot,name:'红掌',folder:'33_红掌',latin:'Anthurium andraeanum',leaf:.25,length:.45,plantSupport:'ROSETTE',source:source('anthurium-andraeanum')},
 SANSEVIERIA:{...pot,name:'虎皮兰',folder:'34_虎皮兰',latin:'Dracaena trifasciata',leaf:.6,aspect:.12,length:.55,plantSupport:'UPRIGHT',source:source('dracaena-trifasciata')},
 CHLOROPHYTUM:{...pot,name:'吊兰',folder:'35_吊兰',latin:'Chlorophytum comosum',leaf:.45,aspect:.055,length:.35,plantSupport:'ARCHING',source:source('chlorophytum-comosum')},
 NEPHROLEPIS:{...pot,name:'波士顿蕨',folder:'36_波士顿蕨',latin:'Nephrolepis exaltata',leaf:.45,length:.35,plantSupport:'FROND',foliageUnit:{mode:'PINNATE',pairs:9,terminal:true,spread:68,leaflet_ratio:.18},source:source('nephrolepis-exaltata'),note:'预备由基部向外弯曲的叶柄与羽状叶轴；小叶为结构占位，后续接完整蕨叶单元。'},
};

