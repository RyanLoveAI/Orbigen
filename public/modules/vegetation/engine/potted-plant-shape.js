import * as THREE from 'three';
import {branchRadiusAt} from './branch-shaping.js';

export function createPottedPlantShape(id,style,spec,rng){
 const factor=style==='MAIN'?1.35:style==='TIP'?.5:1,L=spec.length*factor,branches=[];
 const rand=(a,b)=>a+(b-a)*rng();
 function record(parent,attach,knots,radius){
  const curve=new THREE.CatmullRomCurve3(knots,false,'centripetal'),stored=Math.max(.0012,radius);
  const b={id:branches.length?`B${branches.length}`:'R1',parent:parent?.id||'',attach,order:parent?1:0,
   knots:knots.map(p=>p.toArray()),points:curve.getPoints(32).map(p=>p.toArray()),length:curve.getLength(),start_radius:stored,
   end_radius:Math.max(.00015,stored*.1),radius_profile:[1,.9,.8,.7].map(v=>v*radius/stored),sections:[]};
  branches.push(b);return b;
 }
 if(spec.plantSupport){
  const form=spec.plantSupport,climber=form==='CLIMBER';
  const root=record(null,0,[new THREE.Vector3(0,0,.01),new THREE.Vector3(.006,0,climber?L*.2:.02),new THREE.Vector3(climber?L*.16:.009,.012,climber?L*.58:.045)],climber?.018:.006);
  root.end_radius=root.start_radius*.75;
  const count=style==='MAIN'?12:style==='SIDE'?8:5;
  for(let i=0;i<count;i++){
   const at=climber?.18+.74*i/(count-1):.10+.65*i/(count-1),x=at*(root.points.length-1),j=Math.floor(x);
   const start=new THREE.Vector3(...root.points[j]).lerp(new THREE.Vector3(...root.points[j+1]),x-j);
   const angle=form==='FAN'?(i%2?0:Math.PI)+rand(-.10,.10):i*2.39996+rand(-.12,.12);
   const stub=['UPRIGHT','ARCHING'].includes(form),len=stub?Math.max(.025,L*rand(.08,.16)):L*rand(.25,.58);
   const outward=form==='UPRIGHT'?.4:form==='ARCHING'?.8:form==='FROND'?1:.55;
   const lift=form==='UPRIGHT'?1:form==='ARCHING'?.25:form==='FROND'?.4:rand(.7,1.1);
   const knots=[0,.25,.55,.8,1].map(t=>start.clone().add(new THREE.Vector3(Math.cos(angle)*len*outward*t,Math.sin(angle)*len*outward*t,len*(lift*t+.12*Math.sin(Math.PI*t)-(form==='FROND'?.25:0)*t*t))));
   record(root,at,knots,Math.min(root.start_radius*.38,.004));
  }
  return {branches,root,L};
 }
 const sign=rng()<.5?-1:1;
 const lean=rand(.8,1.25),sway=rand(.75,1.2);
 const rootKnots=id==='POTHOS'
  ?[0,.12,.26,.43,.61,.8,1].map(t=>new THREE.Vector3(L*(.36*lean*Math.sin(t*Math.PI/2)+.035*Math.sin(t*11)),sign*L*.08*sway*Math.sin(t*5),L*(1.05+.10*Math.sin(t*Math.PI)-t)))
  :[0,.16,.36,.58,.8,1].map(t=>new THREE.Vector3(L*.05*lean*Math.sin(t*5),sign*L*.045*sway*Math.sin(t*3.7),L*t+.02));
 const root=record(null,0,rootKnots,id==='POTHOS'?.0035:.014*factor);
 const sites=id==='POTHOS'?(style==='MAIN'?[.14,.29,.42]:style==='TIP'?[.25]:[.20,.38]):style==='MAIN'?[.54,.66,.78]:[];
 sites.forEach((t,i)=>{
  const x=t*(root.points.length-1),index=Math.min(root.points.length-2,Math.floor(x));
  const start=new THREE.Vector3(...root.points[index]).lerp(new THREE.Vector3(...root.points[index+1]),x-index);
  const angle=rand(-.3,.3)+(id==='POTHOS'?(i%2?1:-1)*1.4:i*2.39996),len=L*(id==='POTHOS'?rand(.38,.65):rand(.24,.38));
  const knots=[0,.2,.45,.7,1].map(u=>start.clone().add(new THREE.Vector3(Math.cos(angle)*len*.6*u,Math.sin(angle)*len*.65*u,id==='POTHOS'?len*(.08*Math.sin(Math.PI*u)-u):len*(.55*u+.13*Math.sin(Math.PI*u)))));
  const radius=branchRadiusAt({startRadius:root.start_radius,endRadius:root.end_radius,radiusProfile:root.radius_profile,sections:[],order:0},{radius_bias:.18,junction_flare:0},t)*.45;
  record(root,t,knots,radius);
 });
 return {branches,root,L};
}
