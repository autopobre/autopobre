// A lap that passes over itself and runs under its own ground (the Minhocão circuit's two firsts), on a synthetic
// circuit so the checks run before that track's data exists: a figure of eight whose first diagonal is a viaduct 6.5 m
// over the second at a right angle (meta.decks), and on the right loop a 500 m tunnel 6.5 m under a plaza, open
// trenches at both ends (meta.tunnels), the terrain grid cut down to the road only in a narrow corridor over it.
// Driving over and under the crossing, a teleport onto either level (TestCar.relocate, a remote car's first state),
// the rivals' last-moment brake and slipstream across levels, the road plane in the tunnel, the ground fit (the plaza
// beside the tunnel kept, the street under the viaduct fitted), the viaduct's own scenery band, no catch fence in
// the tunnel, and a full race.
//   node scripts/testar_cruzamento.mjs
import assert from 'node:assert/strict';
import {TestCar,recognitionInput,onDeck,inTunnel,sameLevel} from '../teste/physics.js';
import {RaceField,lapTravel} from '../teste/race-field.js';
import {RemoteCar,packCar,readCar} from '../teste/net-cars.js';
import {fitGround,sceneryBands,groundHeight} from '../teste/track-clearance.js';
import {createStreetWalls} from '../teste/street-walls.js';

// --- The circuit. Two loops of radius R joined by two diagonals that cross at the origin at 90°: half the left loop,
// diagonal 1 (the viaduct), the right loop (the tunnel in its far half), diagonal 2 (the street under the viaduct),
// the other half of the left loop. x east, y north, z up; stations every 2 m.
const R=179,C=R*Math.SQRT2,H=6.5,WIDTH=12,GAP=.6,CORRIDOR=WIDTH/2+GAP+1.5,STEP=4;
const pieces=[{arc:[-C,0],from:Math.PI,sweep:3*Math.PI/4,dir:1},{line:[[-C/2,-C/2],[C/2,C/2]]},{arc:[C,0],from:3*Math.PI/4,sweep:3*Math.PI/2,dir:-1},{line:[[C/2,-C/2],[-C/2,C/2]]},{arc:[-C,0],from:Math.PI/4,sweep:3*Math.PI/4,dir:1}];
for(const p of pieces)p.length=p.arc?R*p.sweep:Math.hypot(p.line[1][0]-p.line[0][0],p.line[1][1]-p.line[0][1]);
const L=pieces.reduce((sum,p)=>sum+p.length,0);
function plan(s){
 s=((s%L)+L)%L;for(const p of pieces){if(s>p.length+1e-9){s-=p.length;continue;}
  if(p.line){const [[x0,y0],[x1,y1]]=p.line,u=s/p.length;return {x:x0+(x1-x0)*u,y:y0+(y1-y0)*u,tx:(x1-x0)/p.length,ty:(y1-y0)/p.length};}
  const t=p.from+p.dir*s/R;return {x:p.arc[0]+R*Math.cos(t),y:p.arc[1]+R*Math.sin(t),tx:-p.dir*Math.sin(t),ty:p.dir*Math.cos(t)};}
 return plan(0);
}
const S_DECK=R*(3*Math.PI/4+1),S_TUNNEL=R*(3*Math.PI/2+2),S_STREET=R*(9*Math.PI/4+3);
// Profile: the viaduct flat 50 m either side of the crossing, 140 m ramps; the tunnel flat for 260 m, 120 m trenches.
const ease=u=>(1-Math.cos(Math.PI*Math.min(1,Math.max(0,u))))/2;
const height=s=>H*ease((s-(S_DECK-190))/140)*(1-ease((s-(S_DECK+50))/140))-H*ease((s-(S_TUNNEL-250))/120)*(1-ease((s-(S_TUNNEL+130))/120));
const DECKS=[[S_DECK-190,S_DECK+190]],TUNNELS=[[S_TUNNEL-250,S_TUNNEL+250]];
const n=Math.round(L/2),ds=L/n,samples=[];
for(let k=0;k<n;k++){const s=k*ds,p=plan(s),grade=(height(s+.01)-height(s-.01))/.02;samples.push([s,p.x,p.y,height(s),WIDTH,0,grade,p.tx,p.ty,-p.ty,p.tx,0,0,0,0,GAP,GAP]);}
// Terrain: flat at 0 with a 0.4 m mound under the crossing (the street there must be fitted to its own level, not the
// deck's), the tunnel's corridor cut down to the road, the plaza beside it untouched. fitGround works the ground out
// to CORRIDOR (half width + wall gap + 1.5 m) and keeps the rest as the data has it; the data's cut (GLUE) must reach
// a grid diagonal past the wall face (+6 m on a 4 m grid), or the 4 m triangles from the plaza reach down into the
// trench in front of its walls (with the cut at CORRIDOR: 1.7 m of ground at the wall's foot, the asphalt dug 11 m).
const GLUE=WIDTH/2+GAP+6;
const x0=Math.floor((-C-R-60)/STEP)*STEP,y0=Math.floor((-R-60)/STEP)*STEP,nx=Math.ceil((C+R+60-x0)/STEP)+1,ny=Math.ceil((R+60-y0)/STEP)+1;
const tunnelSpot=(x,y)=>{const r=Math.hypot(x-C,y),t=Math.atan2(y,x-C),s=R*(3*Math.PI/4+2)+(3*Math.PI/4-t)*R;return {s,lateral:Math.abs(r-R)};};
const terrain=glue=>{const z=new Array(nx*ny);for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
 const x=x0+i*STEP,y=y0+j*STEP,q=tunnelSpot(x,y);
 z[j*nx+i]=q.s>=TUNNELS[0][0]&&q.s<=TUNNELS[0][1]&&q.lateral<=glue?+height(q.s).toFixed(3):+(.4*Math.max(0,1-Math.hypot(x,y)/30)).toFixed(3);
}return {x0,y0,step:STEP,nx,ny,z};};
const data={meta:{id:'cruzamento',name:'Cruzamento sintético',reconstructed_xy_m:L,reconstructed_3d_m:L,direction:'anti-horario',decks:DECKS,tunnels:TUNNELS,deck_band_m:2.5,
  rails:{'1':[[0,L]],'-1':[[0,L]]},barrier:'street',street:true,imaginary:true},
 columns:['s_xy_m','x_east_m','y_north_m','z_local_m','width_m','crossfall_left','grade','tx','ty','left_x','left_y','fit_rmse_m','ground_points','kerb_right','kerb_left','wall_right_m','wall_left_m'],
 samples,terrain:terrain(GLUE),scenery:{}};
const at=s=>Math.round((((s%L)+L)%L)/ds)%n;
const report={length:+L.toFixed(1),stations:n,crossing:{deck:+S_DECK.toFixed(1),street:+S_STREET.toFixed(1)}};
// The two passes meet at the origin, 6.5 m apart, the upper one on the deck; the tunnel is not on a deck.
{const up=samples[at(S_DECK)],low=samples[at(S_STREET)];assert(Math.hypot(up[1],up[2])<1.5&&Math.hypot(low[1],low[2])<1.5,'both passes through the origin');
 assert(Math.abs(up[3]-H)<1e-9&&Math.abs(low[3])<1e-9&&onDeck(data,S_DECK)&&!onDeck(data,S_STREET),'viaduct 6.5 m over the street');
 assert(inTunnel(data,S_TUNNEL)&&!inTunnel(data,S_DECK)&&!inTunnel(data,S_STREET)&&Math.abs(samples[at(S_TUNNEL)][3]+H)<1e-9,'tunnel 6.5 m down');
 assert(Math.max(...samples.map(p=>Math.abs(p[6])))<.09,'ramps a car can climb');}

// --- A car driven round the lap goes over the crossing on the deck and under it on the street: its height never
// jumps between steps, its lap distance never runs back.
{
 const car=new TestCar(data);car.resetGrid();car.awaitingStart=false;const start=car.laps;
 let lastZ=car.z,lastS=car.surface.s,jump=0,back=0,progress=0,steps=0,off=0,deck=null,street=null,tunnelLow=Infinity,tunnelHigh=-Infinity;
 while(car.laps<start+2&&steps<120*600){
  car.step(recognitionInput(car),1/120);steps++;
  jump=Math.max(jump,Math.abs(car.z-lastZ));lastZ=car.z;
  const d=lapTravel(lastS,car.surface.s,L);back=Math.min(back,d);progress+=d;lastS=car.surface.s;
  const r=Math.hypot(car.x,car.y);
  if(r<4&&Math.abs(car.surface.s-S_DECK)<10)deck=Math.max(deck??-Infinity,car.surface.z);
  if(r<4&&Math.abs(car.surface.s-S_STREET)<10)street=Math.max(street??-Infinity,car.surface.z);
  if(Math.abs(car.surface.s-S_TUNNEL)<100){tunnelLow=Math.min(tunnelLow,car.surface.z);tunnelHigh=Math.max(tunnelHigh,car.surface.z);}
  if(!car.surface.onRoad)off++;
 }
 assert(car.laps>=start+2,`two laps (${car.laps-start} in ${(steps/120).toFixed(0)} s)`);
 assert(jump<.5,`height continuous over and under the crossing (largest step ${jump.toFixed(3)} m)`);
 assert(back>-.05&&progress>2*L-50,`lap distance keeps increasing (worst ${back.toFixed(3)} m, ${progress.toFixed(0)} m run)`);
 assert(deck!==null&&Math.abs(deck-.055-H)<.05,`over the crossing on the deck (${deck})`);
 assert(street!==null&&Math.abs(street-.055)<.05,`under it on the street (${street})`);
 assert(Math.abs(tunnelLow+H-.055)<.05&&Math.abs(tunnelHigh+H-.055)<.05,`through the tunnel on its road (${tunnelLow.toFixed(3)}..${tunnelHigh.toFixed(3)})`);
 assert(off/steps<.02,`on the asphalt (${(off/steps*100).toFixed(2)}% off)`);
 report.lap={best:car.best===null?null:+car.best.toFixed(2),largestHeightStep:+jump.toFixed(3),offPct:+(off/steps*100).toFixed(2)};
}

// --- A teleport at the crossing: at the street's height onto the street, at the deck's onto the deck, whichever
// stretch the car's own search window was on (relocate: the global search at that height). The same through the
// window's fall-back (a car placed more than 100 m from its stretch, with its height). Without a height the nearest
// in plan, as before.
{
 const car=new TestCar(data),onStreet=q=>Math.abs(q.z-.055)<.05&&Math.abs(lapTravel(q.s,S_STREET,L))<12,onDeckLevel=q=>Math.abs(q.z-.055-H)<.05&&Math.abs(lapTravel(q.s,S_DECK,L))<12;
 for(const from of [S_TUNNEL,S_DECK,S_STREET])for(const [x,y] of [[0,0],[3,-2],[-4,5],[1.5,4]]){
  car.reset(at(from));car.relocate(x,y,.5);assert(onStreet(car.surface),`relocate (${x},${y}) at street height from s=${from.toFixed(0)}: s=${car.surface.s.toFixed(0)} z=${car.surface.z.toFixed(2)}`);
  assert(Math.abs(car.z-car.surface.z-.5)<.5,'seated on its wheels there');
  car.reset(at(from));car.relocate(x,y,H+.5);assert(onDeckLevel(car.surface),`relocate (${x},${y}) at deck height from s=${from.toFixed(0)}: s=${car.surface.s.toFixed(0)} z=${car.surface.z.toFixed(2)}`);
 }
 car.reset(at(S_TUNNEL));Object.assign(car,{x:2,y:-1,z:.6});assert(onStreet(car.sample(2,-1)),'window fall-back at street height');
 car.reset(at(S_TUNNEL));Object.assign(car,{x:2,y:-1,z:H+.6});assert(onDeckLevel(car.sample(2,-1)),'window fall-back at deck height');
 const plain=car.nearest(3,-2,true),q=data.samples[plain.i],other=car.nearest(3,-2,true,null,q[3]>3?.5:H+.5);
 assert(plain.i!==other.i&&Math.abs(data.samples[other.i][3]-q[3])>6,'without a height the nearest in plan, with one the level');
 // Elsewhere (one level) the height changes nothing, even a wrong one.
 for(let k=0;k<300;k++){const p=samples[(k*37)%n];if(Math.hypot(p[1],p[2])<40)continue;const x=p[1]+p[9]*((k%13)-6),y=p[2]+p[10]*((k%11)-5);
  assert.deepEqual(car.nearest(x,y,true,null,p[3]+((k%5)-2)*9),car.nearest(x,y,true),'one level: the nearest in plan');}
 // A remote car (multiplayer): its owner's first state under the viaduct lands on the street, though the TestCar's
 // window starts on the deck right above.
 const shown=new TestCar(data);shown.reset(at(S_DECK));const owner=new TestCar(data);owner.reset(at(S_STREET));
 const remote=new RemoteCar(shown);remote.receive(readCar(packCar(owner)),{seq:1});remote.drive(shown,1/120);
 assert(onStreet(shown.surface),`remote car's first state at the street's height (s=${shown.surface.s.toFixed(0)}, z=${shown.surface.z.toFixed(2)})`);
 const owner2=new TestCar(data);owner2.reset(at(S_DECK-60));remote.receive(readCar(packCar(owner2)),{seq:2,age:0});remote.drive(shown,1/120);
 assert(Math.abs(lapTravel(shown.surface.s,S_DECK-60,L))<5&&Math.abs(shown.surface.z-owner2.surface.z)<.05,'a jump back onto the deck');
}

// --- Rivals: a car on the street right under the deck is no reason to brake on the deck, nor a wake to tow in; a car
// on the deck ahead is both.
{
 const scene=where=>{
  const f=new RaceField(data,{seed:1}),[A,B,...rest]=f.rivals,player=new TestCar(data);player.reset(at(S_TUNNEL));
  rest.forEach((r,k)=>r.car.reset(at(S_STREET+250+12*k)));
  A.car.reset(at(S_DECK-10));const c=A.car;c.vx=30*c.surface.tx;c.vy=30*c.surface.ty;c.stepX=c.x;c.stepY=c.y;
  B.car.reset(at(where==='below'?S_STREET:where==='deck'?S_DECK:S_TUNNEL+300));
  return {f,A,B,player,bodies:[player,...f.rivals.map(r=>r.car)],driverOf:new Map(f.rivals.map(r=>[r.car,r]))};
 };
 const input=where=>{const q=scene(where);return q.f.decide(q.A,q.bodies,q.driverOf,q.player,1/120,0);};
 const below=scene('below'),deck=scene('deck');
 assert(!sameLevel(below.A.car,below.B.car)&&!sameLevel(below.B.car,below.A.car),'deck and street: two levels');
 assert(sameLevel(deck.A.car,deck.B.car)&&sameLevel(deck.B.car,deck.A.car),'two cars on the deck: one level');
 const fx=Math.cos(below.A.car.heading),fy=Math.sin(below.A.car.heading),forward=below.B.car.x*fx+below.B.car.y*fy-(below.A.car.x*fx+below.A.car.y*fy);
 assert(forward>8&&forward<12,`the street car is ${forward.toFixed(1)} m ahead in plan`);
 const free=input('far'),under=input('below'),blocked=input('deck');
 assert.deepEqual(under,free,'a car under the deck changes nothing (no last-moment brake)');
 assert(blocked.brake>=.2&&blocked.throttle===0,`a car ahead on the deck: brakes (${JSON.stringify(blocked)})`);
 below.f.step(below.player,1/120,0);deck.f.step(deck.player,1/120,0);
 assert.equal(below.A.tow,0,'no slipstream from the car under the deck');
 assert(deck.A.tow>.1,`slipstream behind the car on the deck (${deck.A.tow})`);
 report.rivals={brakeForDeckCar:blocked.brake,towOnDeck:+deck.A.tow.toFixed(3)};
}

// --- The tunnel: the road plane runs out to the walls and beyond, never up into the plaza 6.5 m above (the corridor
// cut in the grid is narrow); without meta.tunnels the same spot would blend up into it.
{
 const probe=new TestCar(data),bare=new TestCar({...data,meta:{...data.meta,tunnels:undefined}});
 for(const s of [S_TUNNEL,S_TUNNEL-100,S_TUNNEL+180,S_TUNNEL-220]){
  const k=at(s),p=samples[k];
  for(const side of [-1,1])for(const out of [.3,GAP,2,4,8,20]){
   const d=side*(WIDTH/2+out),x=p[1]+p[9]*d,y=p[2]+p[10]*d;probe.index=k;const q=probe.sample(x,y,k);
   assert(Math.abs(q.z-.055-p[3])<1e-6,`tunnel road plane at s=${s.toFixed(0)}, ${out} m past the edge (${(q.z-.055).toFixed(3)} vs ${p[3].toFixed(3)})`);
  }
 }
 {const k=at(S_TUNNEL),p=samples[k],d=GLUE+8,x=p[1]+p[9]*d,y=p[2]+p[10]*d;bare.index=k;assert(bare.sample(x,y,k).z-p[3]>3,'without meta.tunnels the plaza pulls the ground up');}
}

// --- Ground fit: past the tunnel's corridor the grid stays exactly as the data has it (the cut, then the plaza: neither
// driven nor lowered); the corridor and everything under the asphalt keep below the road; under the viaduct the
// ground is fitted to the street below, never raised toward the deck. With the data cut only to CORRIDOR (the plaza
// in the asphalt's own triangles) the plaza still stays, the corridor is dug instead.
report.ground={};
for(const [name,glue] of [['narrow',CORRIDOR],['recommended',GLUE]]){
 const d=glue===GLUE?data:{...data,terrain:terrain(glue)},z=d.terrain.z,{heights,start,lock,stats}=fitGround(d);
 assert(stats.residual<.01,`${name}: ground fit converges (${stats.residual})`);
 let kept=0,corridor=0,deepest=0,wallFoot=-Infinity;
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const g=j*nx+i,x=x0+i*STEP,y=y0+j*STEP,q=tunnelSpot(x,y);if(Math.abs(q.s-S_TUNNEL)>230)continue;
  if(q.lateral>CORRIDOR+.05&&q.lateral<40){kept++;assert(heights[g]===z[g]&&start[g]===z[g]&&(q.lateral>20||lock[g]===1),`${name}: grid beside the tunnel kept at (${x},${y})`);}
  if(q.lateral<=CORRIDOR){corridor++;const road=height(q.s);assert(heights[g]<=road+.01,`${name}: corridor at road level or below (${heights[g].toFixed(2)} vs ${road.toFixed(2)})`);deepest=Math.max(deepest,road-heights[g]);}
 }
 // The ground at the wall's foot (half width + gap) against the road: in front of the trench walls.
 for(let s=S_TUNNEL-120;s<=S_TUNNEL+120;s+=7)for(const side of [-1,1]){const p=plan(s),e=side*(WIDTH/2+GAP);wallFoot=Math.max(wallFoot,groundHeight(d.terrain,heights,p.x-p.ty*e,p.y+p.tx*e)-height(s));}
 assert(kept>200&&corridor>100,`${name}: ${kept} kept and ${corridor} corridor nodes checked`);
 if(glue===GLUE)assert(wallFoot<.1&&deepest<1,`the recommended cut keeps the trench clear: ground ${wallFoot.toFixed(2)} m over the road at the walls' foot, dug ${deepest.toFixed(2)} m`);
 report.ground[name]={glue:+glue.toFixed(1),...stats,kept,corridor,deepestUnderRoad:+deepest.toFixed(2),groundAtWallFootAboveRoad:+wallFoot.toFixed(2)};
}
{
 const {heights,start}=fitGround(data),probe=new TestCar(data);
 // Under the viaduct: nodes within 20 m of the street's centre line (the fit's reach is 16 m past its asphalt) and 24 m
 // of the crossing, many of them nearer the deck's centre line in plan. Each fitted to the street's surface (sampled from the street's own stations).
 let under=0,nearerDeck=0;
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const g=j*nx+i,x=x0+i*STEP,y=y0+j*STEP;if(Math.hypot(x,y)>24)continue;
  const toStreet=Math.abs(x+y)/Math.SQRT2,toDeck=Math.abs(x-y)/Math.SQRT2;if(toStreet>20)continue;
  under++;if(toDeck<toStreet)nearerDeck++;
  let best=Infinity,k=-1;for(let m=at(S_STREET-40);m<=at(S_STREET+40);m++){const p=samples[m],d=Math.hypot(x-p[1],y-p[2]);if(d<best){best=d;k=m;}}
  probe.index=k;const want=probe.sample(x,y,k).z-.055;
  assert(Math.abs(start[g]-want)<1e-9,`ground under the viaduct fitted to the street at (${x},${y}): ${start[g].toFixed(3)} vs ${want.toFixed(3)}`);
  assert(heights[g]<.5,`never raised toward the deck at (${x},${y}): ${heights[g].toFixed(2)}`);
 }
 assert(under>40&&nearerDeck>10,`nodes under the viaduct (${under}, ${nearerDeck} nearer the deck in plan)`);
 report.ground.underViaduct={nodes:under,nearerDeckInPlan:nearerDeck};
}

// --- Scenery: the viaduct's band is meta.deck_band_m past each edge of its asphalt, all along the deck.
{
 const bands=sceneryBands(data).filter(b=>b.name==='ponte'),deckStations=samples.filter(p=>onDeck(data,p[0])).length;
 assert.equal(bands.length,1);assert.equal(bands[0].points.length,deckStations);
 assert(bands[0].points.every(p=>Math.abs(p[4]+WIDTH/2+2.5)<1e-9&&Math.abs(p[5]-WIDTH/2-2.5)<1e-9),'2.5 m band beside the deck');
 const wide=sceneryBands({...data,meta:{...data.meta,deck_band_m:undefined}}).find(b=>b.name==='ponte');
 assert(wide.points.some(p=>p[5]>WIDTH/2+30),'without it the 36 m bridge band over high decks');
}

// --- Street walls: no catch fence over the walls of the tunnel and its trenches (nor on the deck).
{
 const ctx=new Proxy({},{get:()=>()=>{}});globalThis.document={createElement:()=>({getContext:()=>ctx})};
 const walls=createStreetWalls(data),open=createStreetWalls({...data,meta:{...data.meta,tunnels:undefined}});delete globalThis.document;
 const probe=new TestCar(data),posts=walls.root.getObjectByName('Postes_alambrado'),m=posts.instanceMatrix.array;let inside=0;
 for(let i=0;i<posts.count;i++){const [x,y]=[m[i*16+12],-m[i*16+14]],q=probe.nearest(x,y,true,null,m[i*16+13]);const s=samples[q.i][0]+q.u*ds;if(inTunnel(data,s)||onDeck(data,s))inside++;}
 assert.equal(inside,0,'no fence post in the tunnel or on the deck');
 const lost=open.stats.fencePosts-walls.stats.fencePosts;assert(lost>200,`the tunnel's 2 x 500 m lose their fence (${lost} posts)`);
 report.fence={posts:walls.stats.fencePosts,withoutTunnelRanges:open.stats.fencePosts};
}

// --- A full race: the 14 rivals over and under the crossing for three laps, no car's height ever jumping.
{
 const field=new RaceField(data,{seed:1}),parked=new TestCar(data);parked.resetGrid();field.reset(parked.surface.s,{grid:true});
 parked.x=x0+5;parked.y=y0+5;parked.surface=parked.sample(parked.x,parked.y);
 const last=field.rivals.map(r=>r.car.z),levels=field.rivals.map(()=>new Set());let steps=0,off=0,jump=0,collisions=0;
 while(field.rivals.some(r=>!r.finished)&&steps<120*600){
  collisions+=field.step(parked,1/120,3).length;steps++;
  field.rivals.forEach((r,k)=>{const c=r.car;if(!c.surface.onRoad)off++;jump=Math.max(jump,Math.abs(c.z-last[k]));last[k]=c.z;if(Math.hypot(c.x,c.y)<7)levels[k].add(c.surface.z>3?'deck':'street');});
 }
 const finished=field.rivals.filter(r=>r.finished);
 assert(finished.length>=13,`rivals finish three laps (${finished.length}/14)`);
 assert(off/(steps*14)<.03,`rivals stay on the asphalt (${(off/(steps*14)*100).toFixed(2)}% off)`);
 assert(jump<.6,`no rival's height jumps (${jump.toFixed(3)} m)`);
 assert(levels.every(l=>l.has('deck')&&l.has('street')),'every rival over and under the crossing');
 const best=Math.min(...field.rivals.map(r=>r.car.best??Infinity));
 report.race={finished:finished.length,bestLap:+best.toFixed(2),offPct:+(off/(steps*14)*100).toFixed(2),largestHeightStep:+jump.toFixed(3),collisions};
}
console.log(JSON.stringify({passed:true,report},null,1));
