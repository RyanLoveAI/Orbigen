import * as THREE from 'three';
import { branchRadiusAt } from './branch-shaping.js';
import { PLANT_GROWTH_PROFILES } from './plant-growth-profiles.js';

// Art-directed growth habits. Randomness acts on internodes and whole shoots,
// not individual mesh vertices, so the silhouette remains smooth and editable.
const HABITS = {
  CAMPHOR: { bend:.17, arch:.15, spread:.85, lift:.32, node:.07 },
  WILLOW: { bend:.10, arch:.14, spread:.48, lift:.16, node:.025 },
  GINKGO: { bend:.075, arch:.09, spread:.64, lift:.48, node:.035 },
  MAPLE: { bend:.20, arch:.09, spread:1.05, lift:.12, node:.08 },
  ELM: { bend:.18, arch:.10, spread:.88, lift:.24, node:.12 },
  OSMANTHUS: { bend:.11, arch:.12, spread:.63, lift:.65, node:.045 },
  CELTIS: { bend:.21, arch:.10, spread:.95, lift:.24, node:.16 },
  PLATANUS: { bend:.15, arch:.17, spread:1.05, lift:.40, node:.09 },
  MAGNOLIA: { bend:.12, arch:.14, spread:.65, lift:.72, node:.04 },
};
const V = a => new THREE.Vector3(...a);
const up = new THREE.Vector3(0,0,1);
const sample = (b,t) => {
  const x=t*(b.points.length-1),i=Math.min(b.points.length-2,Math.floor(x));
  return V(b.points[i]).lerp(V(b.points[i+1]),x-i);
};
const tangent = (b,t) => {
  const i=Math.min(b.points.length-2,Math.floor(t*(b.points.length-1)));
  return V(b.points[i+1]).sub(V(b.points[i])).normalize();
};

export function normalizeSpeciesStructure(raw={},spec={},style='SIDE') {
  const bounded=(value,fallback,lo,hi)=>Math.max(lo,Math.min(hi,value!=null&&Number.isFinite(Number(value))?Number(value):fallback));
  const isTip=style==='TIP',paired=spec.arrangement==='OPPOSITE',whorled=spec.growth?.layout==='WHORLED';
  return {
    branch_count:Math.round(bounded(raw?.branch_count,isTip?(spec.arrangement==='CLUSTERED'?5:paired?4:3):whorled?Math.ceil(((spec.branchCount??7)+2)/3)*3:(spec.branchCount??7)+2,2,18)),
    shoot_count:Math.round(bounded(raw?.shoot_count,isTip?0:(spec.shoots??3)*(whorled?3:paired?2:1),0,6)),
    branch_start:bounded(raw?.branch_start,style==='TIP'?.28:.15,0,.9),branch_end:bounded(raw?.branch_end,.92,.1,1),
    length_curve:[0,1,2,3,4].map(i=>bounded(raw?.length_curve?.[i],1,.05,3)),
    angle_curve:[0,1,2,3,4].map(i=>bounded(raw?.angle_curve?.[i],1,.2,2)),
    thickness:bounded(raw?.thickness,1,.2,3),tip_ratio:raw?.tip_ratio==null?null:bounded(raw.tip_ratio,.24,.05,.9),
    axis_bend:bounded(raw?.axis_bend,1,0,3),axis_arch:bounded(raw?.axis_arch,1,0,3),
    angle:bounded(raw?.angle,spec.growth?.forkAngle??45,10,85),variation:bounded(raw?.variation,.5,0,1),
  };
}

export function createTreeSpeciesShape(id,style,spec,rng,structure=null) {
  const growth=spec.growth||PLANT_GROWTH_PROFILES[id];
  if(!growth)throw Error(`Missing growth profile: ${id}`);
  const controls=structure?normalizeSpeciesStructure(structure,spec,style):null;
  const profile=(v,t)=>{const x=t*4,i=Math.min(3,Math.floor(x));return v[i]+(v[i+1]-v[i])*(x-i);};
  const baseHabit={...(spec.habit||HABITS[id]),...growth.habit},habit=controls?{...baseHabit,bend:baseHabit.bend*(.3+1.4*controls.variation)*controls.axis_bend,arch:baseHabit.arch*controls.axis_arch,node:baseHabit.node*(controls.variation*2)}:baseHabit,factor=style==='MAIN'?1.35:style==='TIP'?.4:1;
  const L=spec.length*factor,branches=[],paired=['DECUSSATE','PAIRED_FLAT'].includes(growth.layout),groupSize=paired?2:growth.layout==='WHORLED'?3:1;
  const rand=(a,b)=>controls?(a+b)/2+(b-a)*(rng()-.5)*controls.variation*2:a+(b-a)*rng();
  const sign=controls?.variation===0?1:rng()<.5?-1:1;
  function record(parent,attach,knots,radius,spur=false) {
    const curve=new THREE.CatmullRomCurve3(knots,false,'centripetal');
    const points=curve.getPoints(spur?12:32).map(p=>p.toArray());
    // The editor's base-radius floor is 1.2 mm. A profile carries finer twig
    // radii through that floor, rather than swelling a twig at its junction.
    const storedRadius=Math.max(.0012,radius),radiusScale=radius/storedRadius;
    const b={id:branches.length?`B${branches.length}`:'R1',parent:parent?.id||'',attach,
      order:parent?parent.order+1:0,points,knots:knots.map(p=>p.toArray()),length:curve.getLength(),
      // Preserve a woody terminal diameter. The old 2.5–5.5% end radius
      // compounded with a .70 profile turned every species into needle tips.
      start_radius:storedRadius,end_radius:storedRadius*(spur?.38:(controls?.tip_ratio??growth.woodTipRatio??.24)*rand(.9,1.1)),
      radius_profile:[1,rand(.96,1.04),rand(.92,1),.96].map(v=>v*radiusScale),
      sections:spur?[]:[{t:0,radius:1,oval:rand(.95,1.12),roll:rand(-20,20)},
        {t:.42,radius:rand(.93,1.04),oval:rand(.90,1.10),roll:rand(-35,35)},
        {t:1,radius:1,oval:1,roll:0}]};
    branches.push(b);return b;
  }
  // Unequal growth segments give the main axis a sweep, a change of heading,
  // and a fine turned-up tip instead of a straight pole with a uniform bow.
  const widths=[0,.02,.65,1,.48,.75,1.3];
  const rootZ=id==='WILLOW'?L*.95:.4;
  const wholeShrub=spec.category==='SHRUB'&&style==='MAIN';
  const rootKnots=wholeShrub?[0,.10,.27,.46,.65,.83,1].map(t=>new THREE.Vector3(L*.025*Math.sin(t*5),L*.02*Math.sin(t*4)*sign,.025+L*growth.basalHeight*t)):[0,.10,.27,.46,.65,.83,1].map((t,i)=>new THREE.Vector3(
    L*t,sign*L*habit.bend*growth.sweep*(widths[i]+(i>1?rand(-.22,.22):0)),
    rootZ+L*(growth.rise*t+habit.arch*Math.sin(Math.PI*t)-growth.sag*t*t*t+(i>1?rand(-.02,.02):0))));
  const root=record(null,0,rootKnots,growth.radius*(style==='MAIN'?1:(growth.twigThickness??1.2))*(spec.category==='SHRUB'?(style==='MAIN'?.012:style==='TIP'?.0025:.007):(style==='MAIN'?.030:style==='TIP'?.004:.017)));
  // A shared basal stool supports all the canes; it must not taper like a
  // terminal branch and starve the later canes of attachment thickness.
  if(wholeShrub){root.end_radius=root.start_radius*.45;root.radius_profile=[1,.97,.88,.8];}

  function shoot(parent,t,len,side,phi,spur=false,vigor=1) {
    if(controls)len*=profile(controls.length_curve,t);
    const parentRadius=branchRadiusAt({startRadius:parent.start_radius,endRadius:parent.end_radius,
      radiusProfile:parent.radius_profile,sections:parent.sections,order:parent.order},
      {radius_bias:.18,junction_flare:.20},t);
    // An already needle-thin end cannot carry another woody fork.
    if(parentRadius<.0005&&!controls)return null;
    const start=sample(parent,t),forward=tangent(parent,t);
    let across=new THREE.Vector3().crossVectors(up,forward);
    if(across.lengthSq()<.01) across.set(0,1,0);else across.normalize();
    const above=new THREE.Vector3().crossVectors(forward,across).normalize();
    const radial=across.clone().multiplyScalar(side*Math.cos(phi)).addScaledVector(above,(paired?side:1)*Math.sin(phi));
    const basal=wholeShrub&&parent.order===0;
    let direction;
    {
      const angle=THREE.MathUtils.degToRad(controls?Math.min(100,controls.angle*profile(controls.angle_curve,t)):growth.forkAngle);
      const outward=radial.clone().addScaledVector(above,habit.lift*.3).normalize();
      direction=forward.clone().multiplyScalar(Math.cos(angle)).addScaledVector(outward,Math.sin(angle)).normalize();
      if(basal)direction=radial.clone().multiplyScalar(growth.basalSpread*Math.sin(angle)*1.4).addScaledVector(up,growth.basalLift).normalize();
      if(spur)direction.addScaledVector(up,.25).normalize();
    }
    const entry=controls?direction.clone():forward.clone().multiplyScalar(.6).addScaledVector(direction,.85).normalize();
    const end=start.clone().addScaledVector(direction,len);
    const droop=!spur?len*(growth.drop||0)*(parent.order===0?.85:1.08):0;
    end.z-=droop;
    const c1=start.clone().addScaledVector(entry,len*.30);
    const c2=start.clone().addScaledVector(direction,len*.68).addScaledVector(up,spur?0:len*habit.arch);
    c2.z-=droop*.18;
    const curve=new THREE.CubicBezierCurve3(start,c1,c2,end);
    const bow=rand(-1,1)*habit.bend*len;
    const knots=[0,.18,.39,.62,.82,1].map((u,i)=>{
      const p=curve.getPoint(u);
      if(i>0&&i<5){p.addScaledVector(across,bow*Math.sin(Math.PI*u));
        p.addScaledVector(above,(i%2?1:-1)*habit.node*len*.22*Math.sin(Math.PI*u));}
      return p;
    });
    return record(parent,t,knots,Math.min(parentRadius*.60,parentRadius*(spur?.28:rand(.38,.54))*vigor*(controls?.thickness??1)),spur);
  }
  function nodes(count,lo,hi){
    // Keep a common site for opposite pairs, but vary the internode spacing.
    const weights=Array.from({length:count+1},()=>Math.max(.1,rand(.45,1.5)));
    const total=weights.reduce((a,b)=>a+b,0);let sum=0;
    return weights.slice(0,count).map(w=>{sum+=w;return lo+(hi-lo)*sum/total;});
  }
  const isTip=style==='TIP';
  const count=controls?controls.branch_count:normalizeSpeciesStructure({},spec,style).branch_count;
  const sites=nodes(Math.ceil(count/groupSize),controls&&!wholeShrub?Math.min(controls.branch_start,controls.branch_end):isTip?.28:wholeShrub?.08:.15,controls&&!wholeShrub?Math.max(controls.branch_start,controls.branch_end):wholeShrub?.85:.92);
  const layout=(index,primary=false)=>{
    const node=Math.floor(index/groupSize);
    if(growth.layout==='WHORLED')return {side:1,phi:index%3*Math.PI*2/3+node*.4};
    if(paired)return {side:index%2?1:-1,phi:growth.layout==='DECUSSATE'?node*Math.PI/2:rand(-.06,.06)};
    if((wholeShrub&&primary)||growth.layout==='SPIRAL')return {side:1,phi:node*2.39996};
    return {side:index%2?1:-1,phi:rand(-.20,.20)};
  };
  for(let i=0;i<count;i++){
    const node=Math.floor(i/groupSize),t=sites[node],{side,phi}=layout(i,true);
    const spur=id==='GINKGO'&&isTip;
    // One early lateral carries more of the crown, so the main fork reads
    // clearly. Other laterals are subordinate, rather than identical rungs.
    const dominant=!isTip&&i===1;
    const len=wholeShrub?L*rand(.7,1.02)*(1-.18*t):spur?rand(.045,.080):L*growth.reach*(isTip?rand(.16,.31):.59*(1-growth.tipTaper*t)*rand(.8,1.16))*(dominant?1.2:1);
    const primary=shoot(root,t,len,side,phi,spur,dominant?1.18:1);
    if(!primary||(isTip&&!controls))continue;
    if(controls){
      const secondarySites=nodes(Math.ceil(controls.shoot_count/groupSize),id==='NERIUM'?.58:.22,.86);
      for(let j=0;j<controls.shoot_count;j++){
        const u=secondarySites[Math.floor(j/groupSize)],orientation=layout(j),isSpur=growth.spurs>0&&rng()<growth.spurs;
        const length=isSpur?rand(.035,.08):len*growth.secondary*rand(.75,1.25)*(1-.27*u);
        shoot(primary,u,Math.max(.018,length),orientation.side,orientation.phi,isSpur);
      }
      continue;
    }
    const secondarySites=nodes(spec.shoots+(id==='MAPLE'?1:0),id==='NERIUM'?.58:.22,.9);
    secondarySites.forEach((u,j)=>{
      for(let pair=0;pair<groupSize;pair++){
        const orientation=layout(j*groupSize+pair),q=orientation.side,isSpur=growth.spurs>0&&rng()<growth.spurs;
        const length=isSpur?rand(.035,.08):len*growth.secondary*rand(.75,1.25)*(1-.27*u);
        const child=shoot(primary,u,length,q,orientation.phi,isSpur);
        // Sparse third-order tips enrich the outline without turning every
        // node into an identical fan. Ginkgo retains its distinct short shoots.
        if(child&&!isSpur&&length>.12&&rng()<growth.twigChance)
          shoot(child,rand(.52,.78),length*rand(.30,.48),-q,rand(-.4,.4));
      }
    });
  }
  // Lift the complete asset together if a broad lateral dips below the floor.
  const low=Math.min(...branches.flatMap(b=>b.points.map(p=>p[2]))),lift=Math.max(0,.08-low);
  if(lift) for(const b of branches) for(const p of [...b.points,...b.knots]) p[2]+=lift;
  return {branches,root,L};
}
