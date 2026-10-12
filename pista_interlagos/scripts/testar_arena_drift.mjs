// Arena de Drift (drift-arena*.js, drift-score.js, drift-physics.js): the floor's wall, the items the car meets, the
// planters' grass and kerbs, the drift score with its zones and clips, the challenges, the layouts kept by the browser and
// the arena's own drift physics (the race cars' physics.js is never touched by the arena).
import assert from 'node:assert/strict';
import {TestCar,OPALA_BODY,FUSCA_BODY} from '../teste/physics.js';
import {DriftCar} from '../teste/drift-physics.js';
import {ARENA,floorEdge,floorOutline,cleanLayout,cleanItem,presetLayout,PRESETS,PRESET_ORDER,createArenaData,loadArenaSave,storeArenaSave,ITEM_KINDS,ITEM_ORDER} from '../teste/drift-arena.js';
import {ArenaWorld} from '../teste/drift-arena-world.js';
import {DriftScore,ArenaChallenge,CHALLENGES,CHALLENGE_ORDER,slip,driftRate,medalOf} from '../teste/drift-score.js';

const data=createArenaData(),dt=1/120,idle={left:0,right:0,throttle:0,brake:0,reverse:0,handbrake:0};
function carOn(layout,{x=0,y=0,heading=0,body=OPALA_BODY,Car=DriftCar}={}){const c=new Car(data);c.setBody(body);c.world=new ArenaWorld(layout);c.relocate(x,y,NaN,heading);c.awaitingStart=false;return c;}
// As drift-arena-mode.js steps it: the car, then the props it knocked.
const run=(c,input,seconds,each)=>{for(let k=0;k<seconds/dt;k++){c.step({...idle,...input},dt);c.world.step(dt);each?.(c);}};
const report={};

// --- The floor: the outline and the signed distance agree, the track file's stations cover the whole floor.
{
 for(const [x,y] of floorOutline(0,3))assert.ok(Math.abs(floorEdge(x,y).d)<1e-6,`outline off the edge at ${x},${y}`);
 assert.ok(floorEdge(0,0).d<-49&&floorEdge(ARENA.halfLength+1,0).d>0);
 const probe=new DriftCar(data);let worst=0;
 for(let x=-84;x<=84;x+=3)for(let y=-49;y<=49;y+=3){if(floorEdge(x,y).d>-.5)continue;probe.index=probe.nearest(x,y,true).i;const s=probe.sample(x,y);assert.ok(s.onRoad,`floor not road at ${x},${y}`);assert.ok(Math.abs(s.z-.055)<1e-9);worst=Math.max(worst,Math.abs(s.d));}
 assert.ok(worst<26,`a floor point ${worst.toFixed(1)} m from its station`);
 report.floor={stations:data.samples.length,loop_m:+data.meta.reconstructed_xy_m.toFixed(1),farthest_m:+worst.toFixed(1)};
}
// --- Layouts: cleaning, presets, one start gate.
{
 assert.equal(cleanItem({kind:'cone',x:200,y:0}),null,'an item off the floor is dropped');
 assert.equal(cleanItem({kind:'nave',x:0,y:0}),null,'an unknown kind is dropped');
 const big=cleanItem({kind:'ilha',x:0,y:0,size:99});assert.equal(big.size,ITEM_KINDS.ilha.max);
 const two=cleanLayout({items:[{kind:'largada',x:0,y:0,a:0},{kind:'largada',x:10,y:0,a:0}]});assert.equal(two.items.length,1);assert.equal(two.items[0].x,10);
 for(const id of PRESET_ORDER){const l=presetLayout(id);assert.equal(l.items.length,PRESETS[id].items.length,`preset ${id} lost items`);}
 assert.deepEqual(ITEM_ORDER.slice().sort(),Object.keys(ITEM_KINDS).sort());
 // The browser's copy: round trip, and junk in it falls back to Campeonato.
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const save=loadArenaSave(storage);assert.equal(save.layout.name,'Campeonato Auto-Pobre');
 save.layout=presetLayout('oito');save.bests.oito={score:4,pilot:'Ana',at:'2026-10-11'};save.bestDrift=1234;assert.ok(storeArenaSave(storage,save));
 const again=loadArenaSave(storage);assert.equal(again.layout.items.length,2);assert.equal(again.bests.oito.score,4);assert.equal(again.bestDrift,1234);
 store.set('opala99-arena-drift-v1','{oops');assert.equal(loadArenaSave(storage).layout.name,'Campeonato Auto-Pobre');
 assert.equal(loadArenaSave(null).bestDrift,0);
}
// --- The wall: a car driven into it at 80 km/h stops at the floor's edge and is not let through; the impact is told.
{
 const c=carOn(presetLayout('vazia'),{x:40,y:20,heading:Math.PI/2});let impact=0,deepest=-Infinity;
 run(c,{throttle:1},6,c=>{impact=Math.max(impact,c.wallImpactSpeed);const ch=Math.cos(c.heading),sh=Math.sin(c.heading);for(const [u,w] of [[1,1],[1,-1],[-1,1],[-1,-1]]){const fx=u*c.body.halfLength,fy=w*c.body.halfWidth;deepest=Math.max(deepest,floorEdge(c.x+ch*fx-sh*fy,c.y+sh*fx+ch*fy).d);}});
 assert.ok(impact>8,`wall impact ${impact}`);assert.ok(deepest<.05,`body ${deepest} m through the wall`);assert.ok(c.y<50&&c.y>45);
 // Sliding along a straight wall at 60 km/h keeps most of the speed.
 const g=carOn(presetLayout('vazia'),{x:-30,y:47.6,heading:.06});g.vx=16.7*Math.cos(.06);g.vy=16.7*Math.sin(.06);run(g,{},1);assert.ok(Math.hypot(g.vx,g.vy)>11,`scraping the wall lost too much: ${Math.hypot(g.vx,g.vy)}`);assert.ok(floorEdge(g.x,g.y).d<-.5);
 // Into a rounded corner, diagonally.
 const k=carOn(presetLayout('vazia'),{x:50,y:15,heading:Math.atan2(1,1)});run(k,{throttle:1},6);assert.ok(floorEdge(k.x,k.y).d<-.8,'stopped inside the corner');
 report.wall={impact_ms:+impact.toFixed(1),deepest_m:+deepest.toFixed(3),slide_kmh:+(Math.hypot(g.vx,g.vy)*3.6).toFixed(0)};
}
// --- A cone is knocked over and flies off; the car hardly notices. A tyre stack is pushed. A concrete block stops it.
{
 const c=carOn(cleanLayout({items:[{kind:'cone',x:0,y:0,a:0}]}),{x:-25,y:0,heading:0});c.vx=16;const before=16;
 run(c,{throttle:.3},2.4);const cone=c.world.props[0];
 assert.ok(cone.hit&&cone.down,'cone knocked down');assert.ok(cone.moved>3,`cone moved ${cone.moved}`);assert.equal(c.world.knocked,1);
 assert.ok(Math.hypot(c.vx,c.vy)>before*.85,'a cone barely slows the car');
 const s=carOn(cleanLayout({items:[{kind:'pneus',x:0,y:0,a:0}]}),{x:-15,y:0,heading:0});s.vx=8;run(s,{},2.5);
 assert.ok(s.world.props[0].moved>1,'tyre stack pushed');
 const b=carOn(cleanLayout({items:[{kind:'bloco',x:0,y:0,a:Math.PI/2,size:6}]}),{x:-20,y:0,heading:0});b.vx=14;let blockHit=0;run(b,{},2.5,c=>blockHit=Math.max(blockHit,c.wallImpactSpeed));
 assert.ok(b.x<-2.5,`car went through the block: x=${b.x}`);assert.ok(blockHit>8);
 report.props={coneMoved_m:+cone.moved.toFixed(1),carKmhAfterCone:+(Math.hypot(c.vx,c.vy)*3.6).toFixed(0),stackMoved_m:+s.world.props[0].moved.toFixed(1),blockStop_x:+b.x.toFixed(2)};
}
// --- An island: grass in the middle (loose ground), a kerb round it standing proud, its post solid.
{
 const c=carOn(cleanLayout({items:[{kind:'ilha',x:0,y:0,a:0,size:8}]}),{x:-30,y:0});
 assert.equal(c.sample(5,0).onRoad,false,'island grass is off-road');
 const kerb=c.sample(8.45,0);assert.ok(kerb.onRoad&&kerb.z>.055+.01,'kerb lifted');assert.ok(c.sample(12,0).onRoad);
 const w=c.world;assert.ok(w.solids.length===1&&w.surfaces.length===1);
 const m=carOn(cleanLayout({items:[{kind:'meia_lua',x:-20,y:0,a:0,size:20}]}));const ws=m.world;
 // The crescent: grass behind its inner kerb, the zone just inside it.
 assert.equal(m.sample(-21.5,0).onRoad,false,'crescent grass off-road');assert.ok(ws.zoneAt(-18,0),'crescent zone inside the kerb');assert.equal(ws.zoneAt(-18,40),null,'outside the arc');
}
// --- The drift score on a hand-set car: sideways at speed it scores, the combo grows, a zone doubles, a clip pays,
// straightening banks it, a spin loses it.
{
 const world=new ArenaWorld(cleanLayout({items:[{kind:'zona',x:20,y:0,a:0,size:20},{kind:'clip',x:40,y:2,a:0}]}));
 const car={x:-10,y:0,heading:0,vx:0,vy:0,yaw:0,wheelsDown:4,body:OPALA_BODY,impulse(){},inverseMass:()=>1};
 const score=new DriftScore();
 // Travelling east at 60 km/h, nose 35° left of the travel: a drift.
 const set=(speed,angle,x)=>{car.x=x;car.heading=angle*Math.PI/180;car.vx=speed/3.6;car.vy=0;};
 set(60,35,-10);assert.ok(Math.abs(Math.abs(slip(car).angle)-35)<1);
 for(let t=0;t<1;t+=dt){set(60,35,-10+t*16);score.update(car,world,dt);}
 assert.ok(score.drift&&score.drift.points>40,'drifting scores');const outside=score.drift.points;
 for(let t=0;t<1.4;t+=dt){set(60,35,10+t*14);score.update(car,world,dt);}
 assert.ok(score.drift.zoneTime>.3,'rear wheels in the zone');assert.ok(score.drift.points-outside>outside*1.5,'zone pays double');
 for(let t=0;t<1;t+=dt){set(60,35,30+t*12);score.update(car,world,dt);}
 assert.ok(score.drift.clips.size===1,'clip passed');
 const before=score.drift.points;for(let t=0;t<1;t+=dt){set(60,0,42+t*16);score.update(car,world,dt);}
 assert.equal(score.drift,null);assert.ok(score.last.ok&&score.last.points>=Math.floor(before));assert.equal(score.total,score.last.points);
 // A drift ending in a spin scores nothing.
 for(let t=0;t<.8;t+=dt){set(50,40,0);score.update(car,world,dt);}
 for(let t=0;t<.2;t+=dt){set(50,140,0);score.update(car,world,dt);}
 assert.equal(score.drift,null);assert.equal(score.last.ok,false);assert.equal(score.last.reason,'Rodou!');
 // A hard knock mid-drift loses it too.
 for(let t=0;t<.5;t+=dt){set(50,30,0);score.update(car,world,dt);}score.update(car,world,dt,6);assert.equal(score.last.reason,'Bateu!');
 assert.ok(driftRate(40,60)>70&&driftRate(40,60)<110,`rate ${driftRate(40,60)}`);
 report.score={banked:score.total,best:score.best};
}
// --- Challenges on hand-set cars: round the cone, the figure eight, the zone time, the judged run.
{
 const car={x:0,y:0,heading:0,vx:0,vy:0,yaw:0,wheelsDown:4,body:OPALA_BODY};
 // Circling at radius 12 m anticlockwise, 45 km/h, the tail out 30°.
 const circle=(cx,cy,r,a,dir=1)=>{const v=12.5;car.x=cx+Math.cos(a)*r;car.y=cy+Math.sin(a)*r;const travel=a+dir*Math.PI/2;car.vx=Math.cos(travel)*v;car.vy=Math.sin(travel)*v;car.heading=travel+dir*30*Math.PI/180;car.yaw=dir*v/r;};
 {
  const world=new ArenaWorld(presetLayout('um_cone')),score=new DriftScore(),ch=new ArenaChallenge('rosquinha',world);let result=null;
  for(let t=0,a=0;t<12;t+=dt,a+=12.5/12*dt){circle(0,0,12,a);score.update(car,world,dt);result=ch.update(car,score,dt)??result;}
  for(let t=0;t<1.5&&!result;t+=dt){car.heading=Math.atan2(car.vy,car.vx);car.yaw=0;car.x+=car.vx*dt;car.y+=car.vy*dt;score.update(car,world,dt);result=ch.update(car,score,dt)??result;}
  assert.ok(result,'rosquinha ended');assert.ok(result.value>=1.9&&result.value<=2.1,`laps ${result.value}`);assert.equal(result.medal,'bronze');
  report.rosquinha=result.value;
 }
 {
  const world=new ArenaWorld(presetLayout('oito')),score=new DriftScore(),ch=new ArenaChallenge('oito',world);let result=null;
  // Two loops: anticlockwise round the west cone, clockwise round the east one, joined where they touch.
  const r=11,seg=[[-22,1],[22,-1],[-22,1],[22,-1]];
  for(const [cx,dir] of seg){const start=cx<0?0:Math.PI;for(let s=0;s<2*Math.PI*r;s+=12.5*dt){circle(cx,0,r,start+dir*s/r,dir);score.update(car,world,dt);result=ch.update(car,score,dt)??result;}}
  for(let t=0;t<1.5&&!result;t+=dt){car.heading=Math.atan2(car.vy,car.vx);car.yaw=0;car.x+=car.vx*dt;car.y+=car.vy*dt;score.update(car,world,dt);result=ch.update(car,score,dt)??result;}
  assert.ok(result&&result.value>=3,`figure eight loops ${result?.value}`);report.oito=result.value;
 }
 {
  const world=new ArenaWorld(presetLayout('canteiros')),score=new DriftScore(),ch=new ArenaChallenge('canteiro',world);let result=null;
  // Round the west island at 19 m (inside its crescent's band, 17.5-21 m), anticlockwise from its north.
  for(let t=0,a=Math.PI/2;t<4;t+=dt,a+=12.5/19*dt){circle(-42,0,19,a);car.heading=Math.atan2(car.vy,car.vx)+30*Math.PI/180;score.update(car,world,dt);result=ch.update(car,score,dt)??result;}
  for(let t=0;t<1.5&&!result;t+=dt){car.heading=Math.atan2(car.vy,car.vx);car.yaw=0;car.x+=car.vx*dt;car.y+=car.vy*dt;score.update(car,world,dt);result=ch.update(car,score,dt)??result;}
  assert.ok(result&&result.value>1,`zone seconds ${result?.value}`);report.canteiro=result.value;
 }
 {
  const world=new ArenaWorld(presetLayout('campeonato')),score=new DriftScore(),ch=new ArenaChallenge('qualificacao',world);let result=null;
  // Through the gate heading west, then sideways round the west island inside its crescent's band.
  car.x=0;car.y=30;car.heading=Math.PI;car.vx=-14;car.vy=0;car.yaw=0;
  for(let t=0;t<.6;t+=dt){car.prevX=car.x;car.prevY=car.y;car.x+=car.vx*dt;score.update(car,world,dt);ch.update(car,score,dt);}
  assert.equal(ch.state,'running','the run starts at the gate');
  for(let t=0,a=Math.PI/2;t<5;t+=dt,a+=12.5/19*dt){circle(-42,-2,19,a);car.heading=Math.atan2(car.vy,car.vx)+32*Math.PI/180;score.update(car,world,dt);result=ch.update(car,score,dt)??result;}
  assert.ok(ch.run&&ch.run.next>=2,`targets reached ${ch.run?.next}`);
  for(let t=0;t<45&&!result;t+=dt){car.x+=0;car.vx=car.vy=0;score.update(car,world,dt);result=ch.update(car,score,dt)??result;}
  assert.ok(result&&result.sheet,'judged');assert.ok(result.value>5&&result.value<40,`score ${result.value}`);report.qualificacao={value:result.value,sheet:result.sheet};
 }
 for(const id of CHALLENGE_ORDER){assert.ok(PRESETS[CHALLENGES[id].preset],id);assert.equal(medalOf(id,CHALLENGES[id].medals[2]),'ouro');}
}
// --- The drift physics (drift-physics.js, user 10-12): the rear wheels spin on the throttle, lock on the handbrake.
{
 const slideOf=c=>{const ch=Math.cos(c.heading),sh=Math.sin(c.heading),v=c.vx*ch+c.vy*sh,lat=-c.vx*sh+c.vy*ch;return Math.atan2(lat-1.117*c.yaw,v)*180/Math.PI;};
 // Flat out from rest, the rear wheels run past the road and the revs climb with them.
 const launch=carOn(presetLayout('vazia'),{x:-60,y:-30});run(launch,{throttle:1},.6);
 assert.ok(launch.wheelSpeed>Math.hypot(launch.vx,launch.vy)+3,'wheelspin from rest');assert.ok(launch.rearSlipSpeed>3&&launch.rpm>4500);
 // The handbrake locks them.
 const hb=carOn(presetLayout('vazia'),{x:-60,y:-30});run(hb,{throttle:1},2.5);run(hb,{handbrake:1},.3);assert.ok(Math.abs(hb.wheelSpeed)<.5,'handbrake locks the rear wheels');
 // Holding the throttle and the left (↑ + ←, the user's donut): the wheels stay turned left, the car keeps turning left
 // in a small circle, sideways, and stays on its wheels.
 const donut=carOn(presetLayout('vazia'),{x:-40,y:-20});let right=0,sideways=0,yawLeft=0,far=0;
 run(donut,{throttle:1,left:1},12,c=>{if(c.steer<0)right++;if(Math.abs(slideOf(c))>20)sideways++;if(c.yaw>.3)yawLeft++;far=Math.max(far,Math.hypot(c.x+40,c.y+20));});
 const steps=12/dt;assert.equal(right,0,'held left, the wheels never turn right');assert.ok(sideways>steps*.7,`donut sideways ${(sideways/steps).toFixed(2)}`);
 assert.ok(yawLeft>steps*.85,'turning left all along');assert.ok(far<15,`donut drifted ${far.toFixed(1)} m away`);assert.ok(donut.upright>.95);
 // A drift on the arena's physics against the race physics with the same inputs (flat out, a flick of the handbrake
 // into a left turn, throttle and a little steering): the race car straightens, the drift car holds the slide.
 const angleAfter=Car=>{const c=carOn(presetLayout('vazia'),{x:-60,y:-30,heading:0,Car});run(c,{throttle:1},2.6);run(c,{left:1,handbrake:1},.35);let sum=0,n=0;run(c,{left:.25,throttle:1},1.6,c=>{sum+=Math.abs(slideOf(c));n++;});return sum/n;};
 const race=angleAfter(TestCar),drift=angleAfter(DriftCar);assert.ok(drift>race*2&&drift>15,`drift ${drift.toFixed(1)}° vs race ${race.toFixed(1)}°`);
 // A keyboard driver reacting every 0.1 s holds drifts longer on the drift physics.
 const player=Car=>{let total=0;for(const [x,y,h] of [[-75,-35,.25],[-75,35,-.25],[75,-35,Math.PI-.25],[-60,0,0],[0,-40,0]]){const car=carOn(presetLayout('vazia'),{x,y,heading:h,Car});let keys={},next=0,t=0;
  for(let k=0;k<12/dt;k++){const b=slideOf(car),ab=Math.abs(b),kmh=Math.hypot(car.vx,car.vy)*3.6;
   if(t>=next){next=t+.1;if(t<3)keys={throttle:1};else if(t<3.7)keys={throttle:1,left:1};else{const into=b<0?'left':'right',against=b<0?'right':'left';keys={throttle:1};keys[ab<20?into:against]=1;}}
   car.step({...idle,...keys},dt);car.world?.step(dt);t+=dt;if(t>3.7&&ab>15&&ab<100&&kmh>20)total+=dt;}}return total/5;};
 const racePlayer=player(TestCar),driftPlayer=player(DriftCar);assert.ok(driftPlayer>racePlayer*1.5,`keyboard: drift ${driftPlayer.toFixed(2)} s vs race ${racePlayer.toFixed(2)} s`);
 // The Fusca drifts too (its drift setup), and a car the world is not given drives as before.
 const f=carOn(presetLayout('vazia'),{x:-60,y:-30,body:FUSCA_BODY});run(f,{throttle:1,left:1},4,c=>{});assert.ok(Math.abs(slideOf(f))>15||f.yaw>1,'the drift Fusca turns sideways');
 report.drift={donutSideways:+(sideways/steps).toFixed(2),donutRadius_m:+far.toFixed(1),slideRace:+race.toFixed(1),slideDrift:+drift.toFixed(1),keyboardRace_s:+racePlayer.toFixed(2),keyboardDrift_s:+driftPlayer.toFixed(2)};
}
console.log(JSON.stringify({passed:true,...report}));
