// Cascavel, ECPA Piracicaba, Chapecó, Brasília and Goiânia, rebuilt from open data (scripts/circuitos/), and the
// imaginary Chapada dos Sonhos on the real relief (gerar_chapada.py): geometry, relief, pit lane, scenery
// clearances and a full AI race on each; on the Chapada also the rim with no guardrail and a fall off it.
//   node scripts/testar_circuitos_abertos.mjs [cascavel|piracicaba|chapeco|brasilia|goiania|chapada]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CIRCUITS} from '../teste/circuits.js';
import {TestCar,recognitionInput,guardrailSections} from '../teste/physics.js';
import {RaceField,pitRoute} from '../teste/race-field.js';
import {pitGeometry,locatePit,serviceSpot,garageBays,wallsNear} from '../teste/pit-lane.js';
import {standLayout,fitGround,sceneryBands,bandClearance,gantryPosts,wallUnderPost,POST_CLEARANCE} from '../teste/track-clearance.js';
import {billboardSpots,BOARD_CLEARANCE} from '../teste/track-surface.js';
import {trackFall} from '../teste/cliff-fall.js';

const only=process.argv[2];
const report={};
for(const id of ['cascavel','piracicaba','chapeco','brasilia','goiania','chapada']){
 if(only&&only!==id)continue;
 const circuit=CIRCUITS[id],data=JSON.parse(readFileSync(new URL(`../dados/pista_${id}.json`,import.meta.url)));
 data.meta.id=id;data.meta.name=circuit.name;
 const a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m,out={};
 // --- Closed centre line, 2 m stations, the published sense of travel.
 let length=0,turn=0;
 for(let i=0;i<n;i++){
  const p=a[i],q=a[(i+1)%n];assert(p.every(Number.isFinite),`${id}: finite samples`);
  const span=Math.hypot(q[1]-p[1],q[2]-p[2]);assert(span>1.8&&span<2.2,`${id}: station spacing ${span}`);length+=span;
  turn+=Math.atan2(p[7]*q[8]-p[8]*q[7],p[7]*q[7]+p[8]*q[8]);
  assert(Math.abs(p[7]*p[9]+p[8]*p[10])<1e-3,'left vector is normal to the tangent');
  assert(p[4]>=8.9&&p[4]<=16.2,`${id}: width ${p[4]}`);
 }
 assert(Math.abs(length-L)<1,`${id}: lap length`);
 assert(Math.abs(Math.abs(turn)-2*Math.PI)<.05,`${id}: closed loop`);
 assert.equal(Math.sign(turn),data.meta.direction==='horario'?-1:1,`${id}: sense of travel`);
 if(id==='piracicaba')assert(Math.abs(L-circuit.length)<15,'ECPA shows its measured length');
 else assert(Math.abs(data.meta.reconstructed_3d_m-circuit.length)<.5,`${id} matches the published length`);
 assert.equal(circuit.length,{cascavel:3058,piracicaba:1930,chapeco:4004,brasilia:5384,goiania:3835,chapada:5153}[id]);
 // Chapecó (opened 08/2026): the earthworks profile is calibrated to the published 18.5 m, and the
 // sections carry the official numbering (12 curves, curve 7 the long constant-radius sweep).
 if(id==='chapeco'){
  assert(Math.abs(data.meta.elevation_range_m-18.5)<.01,'Chapecó: published 18.5 m of relief');
  const names=new Set(data.meta.sections.map(([,name])=>name.split(' · ')[0]));
  for(let k=1;k<=12;k++)assert(names.has(`Curva ${k}`),`Chapecó: curve ${k} named`);
  assert(!names.has('Curva'),'Chapecó: every detected curve has its official number');
 }
 // Brasília (reopened 11/2025): 16 curves, the published widths (15 m on the start straight, 14 m
 // elsewhere), curve 1 banked at 5°, relief from the DF's 1 m terrain model.
 if(id==='brasilia'){
  const numbers=new Set(data.meta.sections.flatMap(([,name])=>[...name.split(' · ')[0].matchAll(/\d+/g)].map(m=>+m[0])));
  for(let k=1;k<=16;k++)assert(numbers.has(k),`Brasília: curve ${k} named`);
  assert(!data.meta.sections.some(([,name])=>name==='Curva'),'Brasília: every detected curve has its number');
  const widths=a.map(p=>p[4]);assert(Math.min(...widths)>=13.9&&Math.max(...widths)<=15.01,'Brasília: published widths');
  assert(Math.abs(a[0][4]-15)<.01,'Brasília: 15 m at the timing line');
  const c1=data.meta.sections.find(([,name])=>name.startsWith('Curva 1 '))[0],turn1=a.filter(p=>p[0]>c1&&p[0]<c1+150).map(p=>p[5]);
  assert(Math.abs(Math.max(...turn1)-Math.tan(5*Math.PI/180))<.002,'Brasília: curve 1 banked at 5°');
  assert(data.meta.elevation_check.mdt_local_menos_anadem_p95_abs_m<3,'Brasília: the DF terrain model agrees with ANADEM');
  assert.equal(data.meta.direction,'horario');
 }
 // Goiânia (MotoGP 2026): 14 curves (9 right, 5 left), the widths of the 2025-26 renovation (15 m on the
 // main straight, 14 m elsewhere), the banked 13-14 before the 994 m straight, relief from the city's 5 m
 // contours, and the city's towers and the neighbourhoods' houses on the horizon.
 if(id==='goiania'){
  const numbers=new Set(data.meta.sections.flatMap(([,name])=>[...name.split(' · ')[0].matchAll(/\d+/g)].map(m=>+m[0])));
  for(let k=1;k<=14;k++)assert(numbers.has(k),`Goiânia: curve ${k} named`);
  assert(!data.meta.sections.some(([,name])=>name==='Curva'),'Goiânia: every detected curve has its number');
  const widths=a.map(p=>p[4]);assert(Math.min(...widths)>=13.9&&Math.max(...widths)<=15.01,'Goiânia: published widths');
  assert(Math.abs(a[0][4]-15)<.01,'Goiânia: 15 m at the timing line');
  const c13=data.meta.sections.find(([,name])=>name.startsWith('Curvas 13 e 14'))[0],banked=a.filter(p=>p[0]>c13+20&&p[0]<c13+120).map(p=>Math.abs(p[5]));
  assert(Math.max(...banked)>.055,'Goiânia: curves 13-14 banked');
  assert(data.meta.elevation_check.mdt_local_menos_anadem_p95_abs_m<3,'Goiânia: the contour model agrees with ANADEM');
  const kinds=data.scenery.skyline.items.reduce((m,it)=>(m[it[6]]=(m[it[6]]??0)+1,m),{});
  assert(kinds.predio>1000&&kinds.casa>3000,`Goiânia: city towers and houses on the horizon (${JSON.stringify(kinds)})`);
  assert(data.pit.reversed,'Goiânia: boxes on the right');
 }
 // Chapada dos Sonhos (imaginary, pedido #5): no guardrail anywhere; from curve 1 to the Curva da Volta the rim of the
 // wall runs 2 to 7 m off the left edge of the asphalt; a car driven over it falls, and is back at rest on the track
 // a few metres short of where it left, its lap out of the records.
 if(id==='chapada'){
  assert.deepEqual(data.meta.rails,{'-1':[],'1':[]},'Chapada: no guardrail');
  const probe=new TestCar(data),{track_from,track_to}=data.scenery.cliff;let near=0,minGap=Infinity,maxGap=0;
  for(let i=0;i<n;i++){
   const p=a[i];if(!(p[0]>=track_from+20&&p[0]<=track_to-20))continue;
   let gap=null;for(let d=0;d<12;d+=.1){const x=p[1]+p[9]*(p[4]/2+d),y=p[2]+p[10]*(p[4]/2+d);if(probe.cliff.query(x,y).d>0){gap=d;break;}}
   assert(gap!==null,`Chapada: rim beside s=${p[0]}`);minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);near++;
  }
  assert(minGap>=1.9&&maxGap<=7.5,`Chapada: rim ${minGap.toFixed(1)}-${maxGap.toFixed(1)} m off the asphalt`);
  const k=Math.round(2200/(L/n));probe.reset(k);probe.heading+=.45;probe.vx=25*Math.cos(probe.heading);probe.vy=25*Math.sin(probe.heading);probe.stepX=probe.x;probe.stepY=probe.y;
  let fell=false,back=null,top=-Infinity;
  for(let s=0;s<120*12&&back===null;s++){probe.step({throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0},1/120);const e=trackFall(probe,1/120);if(e==='fall')fell=true;if(e==='back')back=s/120;top=Math.max(top,probe.z-a[probe.index][3]);}
  assert(fell&&back!==null&&back<10,`Chapada: the car falls and is back on the track (${back})`);
  assert(probe.lapFell&&!probe.surface.abyss&&probe.surface.onRoad&&top<3,'Chapada: back at rest on the asphalt, the lap out of the records');
  out.rim={stations:near,gap:[+minGap.toFixed(1),+maxGap.toFixed(1)],fallBack:+back.toFixed(1)};
 }
 // --- Relief: real circuits, not a flat plate; grades a car can climb.
 const grades=a.map(p=>p[6]);out.grade=[Math.min(...grades),Math.max(...grades)].map(g=>+(g*100).toFixed(1));
 // The Chapada's profile is game earthworks on a plateau with valleys (up to 8%), not the relief under the line: no DEM check.
 assert(data.meta.elevation_range_m>10&&data.meta.elevation_range_m<(data.meta.imaginary?70:60),`${id}: relief range`);
 assert(Math.max(...grades.map(Math.abs))<(data.meta.imaginary?.081:.15),`${id}: grade under ${data.meta.imaginary?8:15}%`);
 if(!data.meta.imaginary)assert(Math.abs(data.meta.elevation_check.anadem_menos_copernicus_mediana_m)<1,'ANADEM and Copernicus agree along the track');
 // Terrain next to the asphalt meets the road plane (no step at the edge; between two
 // stretches of the lap that run side by side it becomes a bank).
 // (On a plateau's rim the plateau's ground: the grid itself drops past the line, 2 m or more beyond the edge.)
 const car=new TestCar(data);let edgeStep=0;
 for(let i=0;i<n;i+=2){const p=a[i];car.index=i;for(const side of [-1,1]){const d=side*(p[4]/2+1),x=p[1]+p[9]*d,y=p[2]+p[10]*d,road=p[3]+p[5]*d;edgeStep=Math.max(edgeStep,Math.abs(car.terrain(x,y,car.cliff?.plateauZ)-road));}}
 assert(edgeStep<.5,`${id}: terrain meets the road (max step ${edgeStep})`);out.edgeStep=+edgeStep.toFixed(3);
 // --- Pit lane: surveyed format, Box 99, AI in-lap route.
 const geo=pitGeometry(data);assert(geo,'pit geometry');
 const pc=Object.fromEntries(data.pit.columns.map((k,i)=>[k,i])),mid=data.pit.samples[Math.floor(data.pit.samples.length/2)];
 const at=locatePit(geo,mid[pc.x],mid[pc.y]);assert(at&&Math.abs(at.d)<.5,'lane centre found');
 const spot=serviceSpot(data.pit);assert(spot&&spot.d>0&&spot.d<data.pit.box99.front,'service spot on the working lane');
 const bays=garageBays(data.pit,14);assert(bays.bays>=3,'garage row');
 const route=pitRoute(data);assert(route&&route.slots.length>=5,`${id}: in-lap parking slots (${route?.slots.length})`);
 // The in-lap route runs the way the cars do (Brasília's block is written exit to entry): its first
 // station by the entry, each step forward along the lap, the slots on the garage side of the lane.
 {const st=route.stations,e=a[Math.round(((route.entryS%L)+L)%L/(L/n))%n];
  assert(Math.hypot(st[0].x-e[1],st[0].y-e[2])<40,`${id}: in-lap route starts at the entry (${Math.hypot(st[0].x-e[1],st[0].y-e[2]).toFixed(1)} m)`);
  for(let k=1;k<st.length;k++)assert(st[k].u>st[k-1].u&&(st[k].x-st[k-1].x)*st[k-1].tx+(st[k].y-st[k-1].y)*st[k-1].ty>0,`${id}: in-lap route goes forward`);
  for(const slot of route.slots){const q=route.at(slot.u),x=q.x-q.ty*slot.d,y=q.y+q.tx*slot.d,lane=locatePit(geo,x,y);assert(lane&&lane.d>0,`${id}: parking slot on the garage side`);}
  out.pitReversed=!!data.pit.reversed;}
 // Box 99 stands on the pit lane, clear of the track asphalt.
 const s99=car.sample(...(()=>{const p=data.pit.samples.find(r=>r[pc.s]>=data.pit.box99.s);return [p[pc.x]+p[pc.lx]*(data.pit.box99.front+8),p[pc.y]+p[pc.ly]*(data.pit.box99.front+8)];})());
 assert(Math.abs(s99.d)>s99.width/2+3,'Box 99 is off the racing surface');
 // The team stand (registration, story mode) is built on the pit wall under it, from its nearest
 // point on any stretch: a 0.6 m wall (Cascavel's rule where lane and track are far apart) left
 // the stand and its sign behind the fence, out of reach. The wall there must hold its 2.2 m
 // floor and still keep its track face off the asphalt (ECPA's wall runs 0.6 m from it by design).
 {const p=data.pit.samples.find(r=>r[pc.s]>=data.pit.box99.s),near=data.pit.walls.filter(w=>w.name==='Muro_boxes').flatMap(w=>w.points).map(q=>({q,dist:Math.hypot(q[0]-p[pc.x],q[1]-p[pc.y])})).sort((u,v)=>u.dist-v.dist);
  assert(near[0].dist<12,`${id}: pit wall by Box 99 (${near[0].dist.toFixed(1)} m)`);
  for(const {q} of near.slice(0,3))assert(q[3]>=3.2,`${id}: pit wall under the team stand ${q[3]} m thick`);
  const q=near[0].q,lat=(q[0]-p[pc.x])*p[pc.lx]+(q[1]-p[pc.y])*p[pc.ly]-q[3]/2,face=[p[pc.x]+p[pc.lx]*lat,p[pc.y]+p[pc.ly]*lat];
  car.index=car.nearest(...face,true).i;const edge=car.sample(...face);assert(Math.abs(edge.d)>edge.width/2+.5,`${id}: stand wall ${(Math.abs(edge.d)-edge.width/2).toFixed(1)} m from the asphalt`);
  out.standWall={thick:+near[0].q[3].toFixed(1),clear:+(Math.abs(edge.d)-edge.width/2).toFixed(1)};}
 out.pit={length:Math.round(data.pit.length_m),entry:Math.round(data.pit.entry_main_s),exit:Math.round(data.pit.exit_main_s),garages:data.pit.garages,slots:route.slots.length};
 // No guardrail across the pit side while the lane runs along the track.
 const pitSide=data.pit.reversed?-1:1,railPit=guardrailSections(data,pitSide);
 assert(!railPit.some(([f,t])=>0>=f&&0<=t),'no rail on the pit side at the timing line');
 // --- Stands and buildings keep off the roads.
 const stands=standLayout(data);assert(stands.length>=3,'grandstand blocks');
 for(const b of stands){const [x,y]=[b.x+b.rx*b.front,b.y+b.ry*b.front];car.index=car.nearest(x,y,true).i;const s=car.sample(x,y);assert(Math.abs(s.d)>s.width/2+6,'stand front clear of the asphalt');}
 const bands=sceneryBands(data),cols=Object.fromEntries(data.scenery.buildings.columns.map((k,i)=>[k,i]));
 // Each footprint (an oriented rectangle: corners, edge midpoints, centre) stays off every band; a
 // bounding circle was too coarse for Brasília's long, thin stands beside its 803 m straight.
 for(const b of data.scenery.buildings.items){const x=b[cols.x],y=b[cols.y],w=b[cols.w],d=b[cols.d],c=Math.cos(b[cols.heading]),sn=Math.sin(b[cols.heading]);
  for(const [u,v] of [[0,0],[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[1,0],[0,1],[-1,0]]){const px=x+c*u*w/2-sn*v*d/2,py=y+sn*u*w/2+c*v*d/2,clear=bandClearance(bands,px,py);
   assert(clear.distance>0,`${id}: building ${x},${y} too close to ${clear.band}`);}}
 out.buildings=data.scenery.buildings.items.length;out.stands=stands.length;
 // Billboards: all sixteen placed, off every road (ECPA's side-by-side straights, the pit
 // entry) and apart from each other; none is left where its search failed.
 const boards=billboardSpots(data);assert.equal(boards.length,16,`${id}: sixteen billboards`);
 for(const b of boards){const c=bandClearance(bands,b.x,b.y);assert(c.distance>BOARD_CLEARANCE,`${id}: billboard ${b.slot} ${c.distance.toFixed(1)} m from ${c.band}`);}
 assert(boards.every(b=>boards.every(o=>o===b||Math.hypot(o.x-b.x,o.y-b.y)>25)),`${id}: billboards apart`);
 out.billboards=+Math.min(...boards.map(b=>b.clearance)).toFixed(1);
 // Start gantry: neither post on the track or pit lane asphalt nor against a pit wall
 // (ECPA's pit lane is still opening at the timing line).
 const posts=gantryPosts(data);
 for(const post of posts){
  car.index=car.nearest(post.x,post.y,true).i;const onTrack=car.sample(post.x,post.y),lane=locatePit(geo,post.x,post.y);
  assert(Math.abs(onTrack.d)>onTrack.width/2+POST_CLEARANCE,`${id}: gantry post ${post.side} off the track`);
  assert(!lane||lane.d<lane.lo-POST_CLEARANCE||lane.d>lane.hi+POST_CLEARANCE,`${id}: gantry post ${post.side} on the pit lane (d ${lane?.d.toFixed(1)})`);
  // Clear of the pit walls, or (Chapecó, Brasília, Goiânia, Chapada: the line facing the garages) mounted on the pit wall's platform.
  if(post.onWall)assert(wallUnderPost(geo,post.x,post.y)&&['chapeco','brasilia','goiania','chapada'].includes(id),`${id}: gantry post ${post.side} on the pit wall top`);
  else assert.equal(wallsNear(geo,post.x,post.y,POST_CLEARANCE).length,0,`${id}: gantry post ${post.side} against a pit wall`);
 }
 out.gantry=posts.map(p=>+p.d.toFixed(1));
 // --- Ground fitting under asphalt, kerbs, pit and stands converges.
 const fit=fitGround(data);assert(fit.stats.residual<.01,`${id}: ground fit residual ${fit.stats.residual}`);out.groundFit=fit.stats;
 // --- The recognition driver and the 14 rivals race three laps on the real geometry.
 const field=new RaceField(data,{seed:1}),parked=new TestCar(data);parked.resetGrid();field.reset(parked.surface.s,{grid:true});
 const far=data.terrain;parked.x=far.x0+5;parked.y=far.y0+5;parked.surface=parked.sample(parked.x,parked.y);
 let steps=0,offroad=0,crashes=0;
 while(field.rivals.some(r=>!r.finished)&&steps<120*600){field.step(parked,1/120,3);for(const r of field.rivals){if(!r.car.surface.onRoad)offroad++;}steps++;}
 const finished=field.rivals.filter(r=>r.finished);
 assert(finished.length>=13,`${id}: rivals finish three laps (${finished.length}/14)`);
 assert(offroad/(steps*14)<.03,`${id}: rivals stay on the asphalt (${(offroad/(steps*14)*100).toFixed(2)}% off)`);
 const best=Math.min(...field.rivals.map(r=>r.car.best??Infinity));
 out.rivals={finished:finished.length,bestLap:+best.toFixed(2),avgSpeedKmh:+(L/best*3.6).toFixed(1),offroadPct:+(offroad/(steps*14)*100).toFixed(2),falls:field.rivals.reduce((sum,r)=>sum+(r.car.falls??0),0)};
 const solo=new TestCar(data);solo.resetGrid();solo.awaitingStart=false;let t=0,soloOff=0;const startLaps=solo.laps;
 // Two laps at the tour's pace (it averages ~75 km/h): 400 s, more for Brasília's 5.4 km.
 const budget=120*Math.max(400,L/15*2.4);
 while(solo.laps<startLaps+2&&t<budget){solo.step(recognitionInput(solo),1/120);if(!solo.surface.onRoad)soloOff++;t++;}
 assert(solo.laps>=startLaps+2,`${id}: recognition driver laps (${solo.laps-startLaps} in ${(t/120).toFixed(0)} s, at s=${solo.surface.s.toFixed(0)})`);out.recognition={best:+solo.best.toFixed(2),offroadPct:+(soloOff/t*100).toFixed(2)};
 report[id]=out;
}
console.log(JSON.stringify({passed:true,report},null,1));
