// Circuito da Pampulha: the fork by the Igrejinha (data.branches, gerar_pampulha.py ramal_da_avenida). Between the branch's
// entry and exit on the lap a car may stay on the lap round the Igrejinha's square or take the branch along the Av. Otacílio Negrão de
// Lima: both ways are the lap. Checks the physics (physics.js: the branch's surface, its frame and the lap distance its
// stations stand for, its walls and the noses, the lap's wall open square at the branch's mouths, R on the branch), the
// lap's book (a lap either way is valid, the same lap count), the host's check of a guest's R (net-verify.js), the AI
// (race-field.js: each rival's way on its own dice, both ways driven at race pace, everyone finishes the one-lap race, no
// one stuck or thrown) and that every other circuit runs exactly the old code (no branches there).
//   node scripts/testar_ramal.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestCar,steerLimit,wrap,clamp,guardrailClearance,guardrailPresent} from '../teste/physics.js';
import {RaceField,forkRoutes} from '../teste/race-field.js';
import {branchGeometries,locateBranch,branchPoint,branchSpan,branchS} from '../teste/branch-lane.js';
import {ACE_NUMBER} from '../teste/race-roster.js';
import {GuestRaceState} from '../teste/net-verify.js';
import {packCar,readCar} from '../teste/net-cars.js';

const load=id=>{const data=JSON.parse(readFileSync(new URL(id==='interlagos'?'../dados/pista.json':`../dados/pista_${id}.json`,import.meta.url)));data.meta.id=id;return data;};
const data=load('pampulha'),a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m,report={};
const geo=branchGeometries(data)[0],[from,to]=branchSpan(geo),B=data.branches[0];
const NONE=Object.freeze({left:0,right:0,throttle:0,brake:0,reverse:0,handbrake:0});
const lapAt=s=>{s=((s%L)+L)%L;let lo=0,hi=n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][0]<=s)lo=m;else hi=m-1;}const p=a[lo],q=a[(lo+1)%n],u=(s-p[0])/((lo===n-1?L:q[0])-p[0]);return p.map((v,k)=>v+(q[k]-v)*u);};

// --- The data and the lap's wall: the branch block, its span, and the left wall open there with square ends.
assert.equal(data.branches.length,1);assert.equal(geo.side,1,'the branch leaves on the left');
const [m0,m1]=[Math.min(...geo.mainGaps.map(g=>g[0])),Math.max(...geo.mainGaps.map(g=>g[1]))];
assert(from===m0&&to===m1&&from>geo.entryMainS&&to<geo.exitMainS&&geo.mainGaps.length===2,`the branch's own stretch ${from}-${to}, between its mouths`);
// (Where it all happens, read off the block: the fork's stretch of the lap with a margin, the noses' gaps, the box round it.)
const FORK0=geo.entryMainS-60,FORK1=geo.exitMainS+70,[[,g0end],[g1start]]=[...geo.mainGaps].sort((p,q)=>p[0]-q[0]);
const box=(()=>{const xs=geo.a.map(p=>p[geo.c.x]),ys=geo.a.map(p=>p[geo.c.y]);return [Math.floor(Math.min(...xs))-30,Math.ceil(Math.max(...xs))+30,Math.floor(Math.min(...ys))-30,Math.ceil(Math.max(...ys))+30];})();
for(const [g0,g1] of geo.mainGaps){
 assert(!guardrailPresent(data,(g0+g1)/2,1)&&guardrailPresent(data,(g0+g1)/2,-1),`the lap's left wall open at ${g0}-${g1}, the right one not`);
 // Square ends: the clearance just outside the gap is the street's own (the wall_left_m column), no 5 m flare.
 for(const s of [g0-.5,g1+.5]){const p=lapAt(s);assert(Math.abs(guardrailClearance(data,s,1)-p[16])<.02,`square wall end at s=${s} (${guardrailClearance(data,s,1).toFixed(2)} vs ${p[16].toFixed(2)})`);}
}
report.data={length:geo.length,entry:geo.entryMainS,exit:geo.exitMainS,span:[from,to],gaps:geo.mainGaps,rails:B.rails};

// --- The surface: on the branch's own asphalt the branch (its frame, the lap distance of its station, on the road); on the
// lap's asphalt the lap. Walking across the fork every 25 cm, the road under the wheels never steps but at the noses'
// tips (the drawn surfaces meet there: branch-layout.js), and the lap distance moves on smoothly.
const probe=new TestCar(data);let ownStations=0;
for(let s=geo.length*.15;s<geo.length*.85;s+=5){
 const c=branchPoint(geo,s);
 for(const d of [-c.width/2+.4,0,c.width/2-.4]){
  const p=branchPoint(geo,s,d);probe.index=probe.lapStation(c.mainS);const q=probe.sample(p.x,p.y),lap=probe.sample(p.x,p.y,probe.index,true);
  // (Where the two still run together the branch is wider than the lap: its far side is past the lap's right wall.)
  if(Math.abs(lap.d)<lap.width/2||lap.d<0||c.mainS<from||c.mainS>to)continue;
  ownStations++;assert(q.branch===0&&q.onRoad&&!q.pit&&Math.abs(q.d-d)<.05&&Math.abs(q.width-c.width)<.05&&Math.abs(q.branchS-s)<.05,`on the branch at b=${s.toFixed(0)} d=${d.toFixed(1)}`);
  assert(Math.abs(q.s-c.mainS)<.6,`the lap distance there is its station's (${q.s.toFixed(1)} vs ${c.mainS.toFixed(1)})`);
 }
}
assert(ownStations>60,`the branch's own asphalt found (${ownStations} points)`);
// (Across the seam, where the road under a point turns from one to the other, the step is measured a hair either side
// of it, found by halving; on one road, pairs 5 cm apart: the weld leans the branch's surface up to about 25% across
// near the merge's nose, 1.3 cm in 5. Within NOSE metres of a nose's tip the two drawn surfaces part: reported.)
const NOSE=10,noses=B.noses;let pairs=0,seams=0,seam=0,slope=0,atNose=0;
for(const [ddx,ddy] of [[.25,0],[0,.25]])for(let x=box[0];x<=box[1];x+=ddx||1)for(let y=box[2];y<=box[3];y+=ddy||1){
 const b=locateBranch(geo,x,y);if(!b)continue;probe.index=probe.lapStation(b.mainS);const p=probe.sample(x,y),q=probe.sample(x+ddx,y+ddy),r=probe.sample(x+ddx/5,y+ddy/5);
 if(!p.onRoad||!q.onRoad)continue;pairs++;const nose=noses.some(o=>Math.hypot(o.x-x,o.y-y)<NOSE);
 if(p.branch===r.branch&&!nose)slope=Math.max(slope,Math.abs(p.z-r.z));
 if(p.branch===q.branch)continue;
 let lo=0,hi=1;for(let k=0;k<14;k++){const m=(lo+hi)/2;if(probe.sample(x+ddx*m,y+ddy*m).branch===p.branch)lo=m;else hi=m;}
 const dz=Math.abs(probe.sample(x+ddx*lo,y+ddy*lo).z-probe.sample(x+ddx*hi,y+ddy*hi).z);seams++;
 if(nose)atNose=Math.max(atNose,dz);else seam=Math.max(seam,dz);
}
assert(seams>100&&seam<.012,`no step across the seam between the two roads (${seam.toFixed(3)} m at most, ${seams} crossings)`);
assert(slope<.02,`no step on either road (${slope.toFixed(3)} m in 5 cm at most)`);
report.surface={ownAsphaltPoints:ownStations,pairs,seamCrossings:seams,maxSeamStep:+seam.toFixed(3),maxSlopeIn5cm:+slope.toFixed(3),maxSeamStepNearNoses:+atNose.toFixed(2)};

// --- A scripted car (pure pursuit on a fixed path, no assists in the physics) drives a whole lap from the grid by the
// branch, and another by the lap round the Igrejinha: both laps count, the same lap count, s goes on (a few metres
// where the car crosses from one road's asphalt to the other's: main_s is linear where the two part), no wall touched.
function path(viaBranch){
 const pts=[];for(const p of a){if(viaBranch&&p[0]>=geo.entryMainS&&p[0]<=geo.exitMainS)continue;pts.push({s:p[0],x:p[1],y:p[2]});}
 if(viaBranch){const k=pts.findIndex(p=>p.s>geo.exitMainS),br=[];for(let b=0;b<=geo.length;b+=2){const q=branchPoint(geo,b);br.push({s:q.mainS,x:q.x,y:q.y});}pts.splice(k,0,...br);}
 return pts;
}
function scripted(viaBranch){
 const car=new TestCar(data),pts=path(viaBranch),N=pts.length;car.resetGrid();
 let k=0,jump=0,last=car.surface.s,walls=0,branchSteps=0,off=0,dz=0,lastZ=car.z,t=0;
 for(;t<120*1100&&!(car.laps>=1);t++){
  let best=Infinity;for(let j=k-5;j<k+40;j++){const p=pts[(j+N)%N],d2=(p.x-car.x)**2+(p.y-car.y)**2;if(d2<best){best=d2;k=(j+N)%N;}}
  const speed=Math.hypot(car.vx,car.vy),T=pts[(k+Math.round((8+speed*.5)/2))%N],alpha=wrap(Math.atan2(T.y-car.y,T.x-car.x)-car.heading),steer=Math.atan2(2*2.667*Math.sin(alpha),Math.hypot(T.x-car.x,T.y-car.y));
  let v=40;for(let j=2;j<60;j+=2){const p=pts[(k+j-3+N)%N],q=pts[(k+j)%N],r=pts[(k+j+3)%N],kap=Math.abs(wrap(Math.atan2(r.y-q.y,r.x-q.x)-Math.atan2(q.y-p.y,q.x-p.x)))/Math.max(1,Math.hypot(r.x-p.x,r.y-p.y)/2);v=Math.min(v,Math.sqrt(6/Math.max(kap,1e-4)+20*j));}
  const cmd=clamp(steer/steerLimit(speed),-1,1);car.step({...NONE,left:Math.max(0,cmd),right:Math.max(0,-cmd),throttle:clamp((v-speed)*.5,0,1),brake:clamp((speed-v)*.6,0,1)},1/120);
  if(!car.awaitingStart)jump=Math.max(jump,Math.abs(((car.surface.s-last+L*1.5)%L)-L/2));last=car.surface.s;
  if(car.wallImpactSpeed>.5)walls++;if(car.surface.branch!=null)branchSteps++;if(!car.surface.onRoad)off++;dz=Math.max(dz,Math.abs(car.z-lastZ));lastZ=car.z;
 }
 return {car,seconds:t/120,jump,walls,branchSeconds:branchSteps/120,off,dz};
}
for(const via of [true,false]){
 const r=scripted(via),name=via?'avenida':'igrejinha';
 assert(r.car.laps===1&&r.car.lastLapValid===true,`${name}: the lap counts (${r.car.laps}, ${r.car.lastInvalidReason})`);
 assert(r.jump<15,`${name}: the lap distance goes on (${r.jump.toFixed(1)} m in one step at most)`);
 assert.equal(r.walls,0,`${name}: no wall touched`);assert.equal(r.off,0,`${name}: always on the asphalt`);
 assert(via?r.branchSeconds>5:r.branchSeconds===0,`${name}: ${r.branchSeconds.toFixed(1)} s on the branch`);
 assert(r.dz<.05,`${name}: the body never jumps (${r.dz.toFixed(3)} m in one step at most)`);
 report[name]={lap:+r.car.lastLap.toFixed(2),branchSeconds:+r.branchSeconds.toFixed(1),maxSJump:+r.jump.toFixed(1)};
}

// --- Walls: a car thrown at them, nobody at the wheel, stays on its road: the branch's left and right walls, the noses
// from both roads and the lap's left wall round the square (a car there feels it, not the branch's beyond). Its
// centre never gets past a wall's face (where its own road's corridor ends), a hit is felt, it never jumps.
const corridor=(car,road)=>{
 if(road==='branch'){const b=locateBranch(geo,car.x,car.y);if(!b)return Infinity;return Math.abs(b.d)-b.width/2-(b.d>0?b.wallLeft:b.wallRight);}
 const q=car.sample(car.x,car.y,car.index,true);return Math.abs(q.d)-q.width/2-guardrailClearance(data,q.s,Math.sign(q.d)||1);
};
function throwCar(x,y,heading,speed,seconds=3){
 const car=new TestCar(data);car.relocate(x,y,NaN,heading);car.vx=speed*Math.cos(heading);car.vy=speed*Math.sin(heading);car.stepX=car.x;car.stepY=car.y;
 const out={car,impact:0,jump:0,over:-Infinity,roads:new Set()};let px=car.x,py=car.y,pz=car.z;
 for(let k=0;k<120*seconds;k++){
  car.step(NONE,1/120);out.impact=Math.max(out.impact,car.wallImpactSpeed);out.jump=Math.max(out.jump,Math.hypot(car.x-px,car.y-py)-Math.hypot(car.vx,car.vy)/120,Math.abs(car.z-pz));px=car.x;py=car.y;pz=car.z;
  // (Where the two roads are apart: the lap round the square, the avenue; a car must stay on the road it was thrown on.)
  const apart=car.surface.s>g0end+10&&car.surface.s<g1start-10;out.roads.add(car.surface.branch===0?apart?'avenue':'branch':apart?'square':'lap');
  // How far past the face of its road's walls the centre is (the nearer road's corridor: in the square, past both).
  const over=Math.min(corridor(car,'branch'),corridor(car,'lap'));out.over=Math.max(out.over,over);
 }
 return out;
}
const walls=[];
// The branch's own walls, along the avenue, both sides, glancing and steep.
for(const side of [1,-1])for(const t of [.1,.3,.5,.7,.9])for(const [ahead,angle,speed] of [[24,0,40],[12,.3,25]]){
 const [r0,r1]=B.rails[side>0?'1':'-1'][0],bs=Math.round(r0+(r1-r0)*t);if(bs+ahead>r1-3)continue;
 // Aimed at the wall's face `ahead` metres on, plus `angle` into it.
 const p=branchPoint(geo,bs,side*1.5),w=branchPoint(geo,bs+ahead),f=branchPoint(geo,bs+ahead,side*(w.width/2+.6)),r=throwCar(p.x,p.y,Math.atan2(f.y-p.y,f.x-p.x)+side*angle,speed);
 assert(r.impact>1,`branch wall b=${bs} side ${side}: the hit is felt (${r.impact.toFixed(1)} m/s)`);
 assert(r.over<-.5,`branch wall b=${bs} side ${side}: the car stays inside (${r.over.toFixed(2)} m past the face)`);
 assert(r.jump<.3,`branch wall b=${bs} side ${side}: no jump (${r.jump.toFixed(2)} m)`);
 assert(!r.roads.has('square'),`branch wall b=${bs} side ${side}: never on the lap round the square`);
 walls.push({at:`b${bs}`,side,angle,impact:+r.impact.toFixed(1),over:+r.over.toFixed(2)});
}
// The noses, head on and glancing, from each road; and the lap's left wall round the square, from the lap.
const noseRuns=[];
for(const [k,nose] of noses.entries()){
 // (Each nose stands at the inner end of a gap the branch opens in the lap's wall: the one at the split, or at the merge.)
 const at=locateBranch(geo,nose.x,nose.y).mainS,split=Math.abs(at-g0end)<Math.abs(at-g1start),gs=split?g0end:g1start;
 const fromLap=lapAt(gs-30),fromBranch=branchPoint(geo,branchS(geo,gs)-(split?22:25),split?-3:-4);
 for(const [label,start] of [['lap',fromLap],['branch',[0,fromBranch.x,fromBranch.y]]])for(const skew of [0,.15,-.15]){
  const x=start[1],y=start[2],heading=Math.atan2(nose.y-y,nose.x-x)+skew,r=throwCar(x,y,heading,22,3);
  assert(r.over<-.5,`nose ${k} from the ${label} (${skew}): no car in the square (${r.over.toFixed(2)} m)`);
  // (Head on into the wedge of the V both walls take the car at once: one correction of up to half a metre.)
  assert(r.jump<.6,`nose ${k} from the ${label}: no jump (${r.jump.toFixed(2)} m)`);
  noseRuns.push({nose:k,from:label,skew,impact:+r.impact.toFixed(1),over:+r.over.toFixed(2)});
 }
}
for(const s of [g0end+6,g0end+(g1start-g0end)*.3,g0end+(g1start-g0end)*.6,g1start-20].map(Math.round)){
 const p=lapAt(s),l=Math.hypot(p[9],p[10]),x=p[1]+p[9]/l*2,y=p[2]+p[10]/l*2,r=throwCar(x,y,Math.atan2(p[8],p[7])+.5,25);
 assert(r.impact>1&&r.over<-.5,`the lap's left wall round the square at s=${s} holds (${r.impact.toFixed(1)} m/s, ${r.over.toFixed(2)} m)`);
 assert(!r.roads.has('avenue'),`the lap's left wall at s=${s}: the car never reaches the avenue`);
 walls.push({at:`lap ${s}`,side:1,impact:+r.impact.toFixed(1),over:+r.over.toFixed(2)});
}
report.walls={runs:walls.length+noseRuns.length,deepest:+Math.max(...walls.map(w=>w.over),...noseRuns.map(w=>w.over)).toFixed(2)};

// --- R on the branch: back on the branch's centre line at its nearest station, heading its way, the lap's books kept;
// the host (net-verify.js) takes the guest's R there too.
{
 const car=new TestCar(data);car.resetGrid();car.awaitingStart=false;const p=branchPoint(geo,geo.length/2,4);car.relocate(p.x,p.y,NaN,p.heading+2.5);car.lapValid=true;
 assert.equal(car.surface.branch,0,'R test: the car is on the branch');
 const before=car.surface.branchS;car.recover();const q=branchPoint(geo,before);
 assert(Math.hypot(car.x-q.x,car.y-q.y)<.01&&Math.abs(wrap(car.heading-q.heading))<1e-6&&car.surface.branch===0&&car.surface.onRoad,'R: back on the branch, at its nearest station');
 assert(car.lapValid,'R: the lap goes on');
 const rival={car:new TestCar(data),finished:false};rival.car.resetGrid();rival.car.awaitingStart=false;rival.car.relocate(p.x,p.y,NaN,p.heading);
 const host=new GuestRaceState(rival,{time:0,laps:1});const sent=readCar(packCar(car));
 const got=host.receive({...sent,vx:0,vy:0,vz:0},.5);
 assert(got&&host.probe.surface.branch===0&&host.probe.lapValid,'the host takes a guest\'s R on the branch');
 report.recover={branchS:+before.toFixed(1)};
}

// --- The AI. Each rival's way past the fork is its own dice (the race's seed and its number): the same every time for a
// seed, about half by the avenue, no lean by skill.
const field=new RaceField(data,{seed:1});
{
 let avenue=0,total=0;const perRace=[],bySkill={};
 for(let seed=1;seed<=20;seed++){field.reset(0,{grid:true,seed});const k=field.rivals.filter(r=>r.routes[0]).length;perRace.push(k);avenue+=k;total+=field.rivals.length;for(const r of field.rivals)(bySkill[r.entry.skill]??=[0,0])[r.routes[0]?0:1]++;}
 assert(perRace.every(k=>k>=2&&k<=12),`both ways taken in every race (${perRace})`);
 assert(avenue/total>.35&&avenue/total<.65,`about half by the avenue (${(avenue/total*100).toFixed(0)}%)`);
 field.reset(0,{grid:true,seed:4242});const one=field.rivals.map(r=>r.routes[0]);field.reset(0,{grid:true,seed:4242});
 assert.deepEqual(field.rivals.map(r=>r.routes[0]),one,'the same ways for the same seed');
 report.routes={avenueShare:+(avenue/total).toFixed(3),perRace,bySkill};
}
// The ace alone, sent each way: through the fork at race pace, its lap valid, no wall, never off the asphalt (the time it
// takes from 60 m before the entry to 70 m past the exit each way, the race's first 60 s).
const forkTime={};
for(const via of [true,false]){
 const f=new RaceField(data,{seed:7,ace:true,level:'impossivel',forkChoice:()=>via}),parked=new TestCar(data);parked.resetGrid();f.reset(parked.surface.s,{grid:true,entrants:[ACE_NUMBER]});
 parked.x=data.terrain.x0+5;parked.y=data.terrain.y0+5;parked.surface=parked.sample(parked.x,parked.y);
 const r=f.rivals[0];let t0=null,t1=null,walls=0,off=0,onBranch=0;
 for(let k=0;k<120*90&&t1===null;k++){f.step(parked,1/120,1);const s=r.car.surface.s;if(t0===null&&s>FORK0&&s<FORK0+10)t0=f.time;if(t0!==null&&s>FORK1&&s<FORK1+10)t1=f.time;if(r.car.wallImpactSpeed>1)walls++;if(!r.car.surface.onRoad)off++;if(r.car.surface.branch!=null)onBranch++;}
 const name=via?'avenida':'igrejinha';
 assert(t1!==null&&r.car.lapValid&&walls===0&&off===0,`the ace by the ${name}: through the fork clean (${t1-t0} s, ${walls} walls, ${off} off)`);
 assert(via?onBranch>120*5:onBranch===0,`the ace by the ${name}: ${onBranch/120} s on the branch`);
 forkTime[name]=+(t1-t0).toFixed(2);
}
report.aceForkSeconds=forkTime;
// Full fields through the fork (several seeds, the race's first 75 s: every car is past it): no one stuck or thrown,
// nobody airborne for long, every lap still good, everyone on its own way and clear of the walls there, but for a car
// knocked off its line by another (a contact in the CONTACT seconds before: two abreast into the lap's kink at the
// split, the one outside is pushed wide onto the avenue and races on that way, sometimes into its wall).
const CONTACT=4;
const watch=(f,seconds,onStep)=>{const parked=new TestCar(data);parked.resetGrid();f.reset(parked.surface.s,{grid:true});parked.x=data.terrain.x0+5;parked.y=data.terrain.y0+5;parked.surface=parked.sample(parked.x,parked.y);
 const last=new Map(f.rivals.map(r=>[r,{x:r.car.x,y:r.car.y,slow:0}]));let k=0;
 for(;k<120*seconds&&(onStep?.(f,k)!==false);k++){f.step(parked,1/120,1);
  for(const r of f.rivals){const c=r.car,w=last.get(r),v=Math.hypot(c.vx,c.vy);
   assert(Math.hypot(c.x-w.x,c.y-w.y)<v/120+1,`seed ${f.raceSeed}: ${r.entry.number} never jumps`);w.x=c.x;w.y=c.y;
   w.slow=f.time>8&&v<3&&!r.finished?w.slow+1/120:0;assert(w.slow<8,`seed ${f.raceSeed}: ${r.entry.number} not stuck (s=${c.surface.s.toFixed(0)})`);}}
 return k;};
const forkStats=[];
for(const seed of [2,3,5,8,13]){
 const f=new RaceField(data,{seed}),way=new Map(),knocked=new Map(),air=new Map();let walls=0,off=0;const incidents=[];
 const hit=r=>f.time-(knocked.get(r)??-Infinity)<CONTACT;
 watch(f,75,F=>{for(const r of F.rivals){const c=r.car,s=c.surface.s;if(r.stun>0)knocked.set(r,F.time);if(s<FORK0||s>FORK1)continue;
  // (Its way: which road it is on where the two are apart, the lap's distance halfway between the noses.)
  if(Math.abs(s-(g0end+g1start)/2)<40&&!way.has(r))way.set(r,c.surface.branch===0);
  if(c.wallImpactSpeed>1){walls++;if(!hit(r))assert.fail(`seed ${seed}: ${r.entry.number} into a wall in the fork untouched (s=${s.toFixed(0)}, ${c.wallImpactSpeed.toFixed(1)} m/s)`);}
  if(!c.surface.onRoad)off++;if(c.wheelsDown===0)air.set(r,(air.get(r)??0)+1/120);}});
 const byWay={avenida:0,igrejinha:0};
 for(const r of f.rivals){
  assert(r.car.surface.s>FORK1&&r.car.lapValid,`seed ${seed}: ${r.entry.number} past the fork, its lap good`);
  assert((air.get(r)??0)<.5,`seed ${seed}: ${r.entry.number} never thrown in the fork (${(air.get(r)??0).toFixed(2)} s in the air)`);
  if(way.get(r)!==r.routes[0]){incidents.push(r.entry.number);assert(knocked.has(r),`seed ${seed}: ${r.entry.number} kept to its own way unless knocked off it`);}
  byWay[way.get(r)?'avenida':'igrejinha']++;
 }
 assert(incidents.length<=2,`seed ${seed}: few knocked onto the other way (${incidents})`);
 assert(off<120,`seed ${seed}: the field stays on the asphalt in the fork (${off} steps off)`);
 forkStats.push({seed,...byWay,knockedOntoTheOtherWay:incidents.length,wallHits:walls,off});
}
report.fork=forkStats;
// One whole race (one lap of 20 km): everyone finishes, with a lap that counts, either way.
{
 const f=new RaceField(data,{seed:11});let k=0;
 k=watch(f,L/12,F=>!F.rivals.every(r=>r.finished));
 const done=f.rivals.filter(r=>r.finished&&r.car.laps===1&&r.car.lastLapValid);
 assert.equal(done.length,f.rivals.length,`every rival finishes the race with a good lap (${done.length}/${f.rivals.length})`);
 const time=way=>{const t=f.rivals.filter(r=>r.routes[0]===way).map(r=>r.finishTime);return t.length?+Math.min(...t).toFixed(1):null;};
 report.race={seconds:+(k/120).toFixed(0),winner:f.classification(1)[0].number,bestByAvenue:time(true),bestByIgrejinha:time(false),collisions:f.collisions};
}

// --- Every other circuit runs the old code: no branches, no branch fields, the plain view; and on the Pampulha itself,
// away from the fork, the lap is exactly what it was without the branch.
for(const id of ['interlagos','floripa']){
 const d=load(id),car=new TestCar(d),q=car.sample(d.samples[100][1],d.samples[100][2]),f=new RaceField(d,{seed:1});
 assert(car.forks===null&&!('branch' in q)&&f.forks===null&&f.view(f.rivals[0])===f.plain,`${id}: no branch code at all`);
}
{
 const bare=JSON.parse(JSON.stringify({...data,branches:undefined,terrain:undefined,scenery:undefined}));bare.terrain=data.terrain;bare.meta.id='pampulha';
 const with_=new TestCar(data),without=new TestCar(bare);let compared=0;
 for(let i=0;i<n;i+=11){const p=a[i];if(p[0]>geo.entryMainS-80&&p[0]<geo.exitMainS+80)continue;
  for(const d of [-9,-4,0,4,9]){with_.index=without.index=i;const x=p[1]+p[9]*d,y=p[2]+p[10]*d,q=with_.sample(x,y),r=without.sample(x,y);
   const {branch,branchS,branchD,...rest}=q;assert.deepEqual(rest,r,`pampulha s=${p[0].toFixed(0)}: the lap as it was`);assert(branch===null&&branchS===null&&branchD===null);compared++;}}
 report.unchanged={pampulhaPoints:compared};
}
const routes=forkRoutes(data)[0];report.ai={stations:routes.n,branchStations:routes.m,saves:+routes.delta.toFixed(1)};
console.log(JSON.stringify({passed:true,report},null,1));
