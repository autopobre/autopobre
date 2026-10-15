// Bandeiras, varetas e placas de frenagem (trackside-flags.js): em cada circuito, quantas voam por
// nível de Sensação de velocidade, onde ficam (fora do asfalto, dos boxes e das arquibancadas, longe de
// outdoors, torres e câmeras de TV) e a contabilidade do vento dos carros (passagem, carro longe,
// volta, teletransporte, pausa, taxa de quadros).
//   node scripts/testar_bandeiras.mjs [circuito]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {CIRCUITS} from '../teste/circuits.js';
import {createCurveloData} from '../teste/curvelo-data.js';
import {guardrailPresent,guardrailClearance} from '../teste/physics.js';
import {sceneryBands,bandClearance} from '../teste/track-clearance.js';
import {billboardSpots} from '../teste/track-surface.js';
import {marshalSpots,towerSpots,bend} from '../teste/trackside.js';
import {TvCamera} from '../teste/tv-camera.js';
import {pitGeometry,pitLane,wallsNear} from '../teste/pit-lane.js';
import {GRAPHICS_OPTIONS,GRAPHICS_PRESETS} from '../teste/graphics-settings.js';
import {FLAG_LEVELS,flagPlan,flagSpots,lowCameraSpots,FlagGusts,flagGust,clothPoint,flagSweep,sweepHits} from '../teste/trackside-flags.js';

const LEVELS=['off','leve','media','completa'];
assert.deepEqual(Object.keys(FLAG_LEVELS),GRAPHICS_OPTIONS.speedEffects.choices.map(([v])=>v),'one flag profile per Sensação de velocidade choice');
for(const level of ['baixo','medio','alto','ultra'])assert(FLAG_LEVELS[GRAPHICS_PRESETS[level].speedEffects],`${level} has a flag profile`);
assert(!FLAG_LEVELS.media.shadow&&!FLAG_LEVELS.media.fine&&FLAG_LEVELS.media.reach<FLAG_LEVELS.completa.reach,'Médio (phones): coarse cloth, no shadows, shorter reach');
// The cloth the board check shakes (clothPoint, flagSweep) is the vertex shader's own: every term of its flagCloth and of
// the lift, droop, ripple and pennant taper the shader feeds it, term for term in both sources. A change to one side
// alone (the shader's cloth flying further than the check believes) fails here.
{
 const glsl=readFileSync(new URL('../teste/trackside-flags.js',import.meta.url),'utf8'),js=clothPoint.toString(),sweep=flagSweep.toString();
 const pairs=[
  ['float a0=lift*1.5707963,k=max(a0*droop,1e-3);','const a0=lift*Math.PI/2,k=Math.max(a0*droop,1e-3);',js],
  ['float along=size.x*(cos(a0*(1.0-droop*u))-cos(a0))/k,down=size.x*(sin(a0)-sin(a0*(1.0-droop*u)))/k;','const along=w*(Math.cos(a0*(1-droop*u))-Math.cos(a0))/k,down=w*(Math.sin(a0)-Math.sin(a0*(1-droop*u)))/k;',js],
  ['float ripple=amp*size.x*pow(u,1.15)*(sin(7.0*u-wave+v*1.4)+.35*sin(17.0*u-wave*1.8-v*2.3));','const ripple=amp*w*u**1.15*(Math.sin(7*u-wave+v*1.4)+.35*Math.sin(17*u-wave*1.8-v*2.3));',js],
  ['float y=-size.y*(.5+(v-.5)*(1.0-taper*u))-down+.25*ripple*sin(3.0*u+wave*.3);','-h*(.5+(v-.5)*(1-taper*u))-down+.25*ripple*Math.sin(3*u+wave*.3)',js],
  ['return vec3(dir.x*along,y,dir.y*along)+vec3(-dir.y,0.0,dir.x)*ripple;','return [dir[0]*along-dir[1]*ripple,',js],
  ['float droop=(1.0-lift)*mix(.3,.7,heavy)*(1.0-still)+.02;','droop=(1-lift)*(.3+.4*heavy)+.02',sweep],
  ['float amp=((.05+.07*lift)+.2*g)*(.85+.3*light)','amp=((.05+.07*lift)+.2*g)*1.15',sweep],
  ['+g*1.1,.1,1.0),1.0,still);','for(let lift=.1;lift<=1.0001;lift+=.05)',sweep],
  ['float taper=abs(flagPattern-5.0)<.5?.92:0.0;','taper=t.pattern===PATTERN.pennant?.92:0',sweep]];
 for(const [shader,port,source] of pairs)assert(glsl.includes(shader)&&source.includes(port),`cloth term out of step: ${shader}`);
 assert(/const PATTERN=\{[^}]*pennant:5[,}]/.test(glsl),'the shader\'s pattern 5 is the pennant');
}

const only=process.argv[2],report={};
for(const id of ['interlagos','curvelo','cascavel','piracicaba','chapeco','brasilia','goiania','chapada','floripa','minhocao']){
 if(only&&only!==id)continue;
 const data=id==='curvelo'?createCurveloData():JSON.parse(readFileSync(new URL(`../dados/${id==='interlagos'?'pista':'pista_'+id}.json`,import.meta.url)));
 data.meta.id=id;data.meta.name=CIRCUITS[id].name;
 const L=data.meta.reconstructed_xy_m,plan=flagPlan(data),{items,counts,boards}=plan,bands=sceneryBands(data),roads=bands.map(b=>({...b,margin:0})),geo=pitGeometry(data);
 assert.equal(flagPlan(data),plan,`${id}: found once per track data`);
 // --- Counts grow with the level; Médio stays a phone's budget.
 const marshals=marshalSpots(data);
 for(let k=1;k<LEVELS.length;k++)assert(counts[LEVELS[k]]>=counts[LEVELS[k-1]],`${id}: ${LEVELS[k]} flies at least as many as ${LEVELS[k-1]}`);
 assert.equal(counts.off,marshals.length,`${id}: off keeps only the marshals' flags`);
 assert.equal(counts.leve,marshals.length+4,`${id}: leve adds the start gantry's four`);
 assert(counts.media>=15&&counts.media<=FLAG_LEVELS.media.cap,`${id}: Médio ${counts.media}`);
 assert(counts.completa>=60&&counts.completa<=FLAG_LEVELS.completa.cap,`${id}: Completa ${counts.completa}`);
 for(let i=1;i<items.length;i++)assert(items[i].tier>=items[i-1].tier,`${id}: instances ordered by tier, so a level is a prefix`);
 for(const level of LEVELS){
  const spots=flagSpots(data,{level});assert.equal(spots.length,counts[level]);
  for(let i=1;i<spots.length;i++)assert(spots[i].s>=spots[i-1].s,`${id} ${level}: sorted by lap distance`);
  for(const t of spots)assert(t.s>=0&&t.s<L&&[t.x,t.y,t.z,t.d].every(Number.isFinite),`${id}: finite spot`);
 }
 // --- Placement.
 const towers=towerSpots(data),billboards=billboardSpots(data);
 const tv=new TvCamera(data,towers.map(t=>({s:t.s,position:new THREE.Vector3(t.x,0,-t.y)})),()=>0,[]);
 const cams=tv.cameras.filter(c=>!c.tower).map(c=>({x:c.position.x,y:-c.position.z}));
 const mine=lowCameraSpots(data);assert.equal(mine.length,cams.length,`${id}: the low TV cameras are where tv-camera.js puts them`);
 mine.forEach((c,i)=>assert(Math.hypot(c.x-cams[i].x,c.y-cams[i].y)<1e-6,`${id}: low TV camera ${i}`));
 const nearest=(t,list)=>Math.min(Infinity,...list.map(q=>Math.hypot(q.x-t.x,q.y-t.y)));
 const kinds={};
 for(const t of items){
  kinds[t.kind]=(kinds[t.kind]??0)+1;
  if(t.kind==='pennant'){
   assert(bandClearance(bands,t.x,t.y).distance>=2.5,`${id}: pennant at ${t.s.toFixed(0)} off roads, pit lane and the stands' view`);
   assert(!geo||!wallsNear(geo,t.x,t.y,1.5).length,`${id}: pennant clear of pit walls`);
   for(const [name,list] of [['billboards',billboards],['TV towers',towers],['marshal posts',marshals],['low TV cameras',cams]])assert(nearest(t,list)>=20,`${id}: pennant at ${t.s.toFixed(0)} 20 m from ${name}`);
   assert(Math.abs(bend(data,t.s))<1/250||guardrailPresent(data,t.s,Math.sign(t.d)),`${id}: a corner-exit pennant stands behind a rail, not in a run-off`);
   // (Behind the rail line: 4 m past the asphalt, or on a street circuit just behind its concrete wall.)
   const w=data.samples.reduce((b,q)=>Math.abs(q[0]-t.s)<Math.abs(b[0]-t.s)?q:b)[4];assert(Math.abs(t.d)>w/2+(data.meta.barrier==='street'?guardrailClearance(data,t.s,Math.sign(t.d))+.4:4),`${id}: pennant behind the rail line`);
  }
  if(t.kind==='rod'){
   assert(bandClearance(roads,t.x,t.y).distance>=1.2,`${id}: rod at ${t.s.toFixed(0)} just off the asphalt`);
   const p=data.samples.reduce((b,q)=>Math.abs(q[0]-t.s)<Math.abs(b[0]-t.s)?q:b);
   assert(Math.abs(Math.abs(t.d)-p[4]/2-1.45)<.6,`${id}: rod just past the kerb (${(Math.abs(t.d)-p[4]/2).toFixed(2)} m)`);
  }
  if(['pennant','rod'].includes(t.kind)){const lane=pitLane(data,t.s);assert(!lane||t.d<0||t.d>lane.reach+4,`${id}: clear of Curvelo's service lane`);}
  if(['roof','billboard','start'].includes(t.kind))assert(t.up>4,`${id}: ${t.kind} flag high above the road (${t.up.toFixed(1)} m)`);
  assert(t.pole>=0&&t.w>=0&&t.h>=0,`${id}: sizes`);
 }
 assert.equal(kinds.marshal,marshals.length);assert.equal(kinds.start,4);
 assert(kinds.pennant>=20,`${id}: edge pennants (${kinds.pennant})`);assert(kinds.rod>=4,`${id}: corner rods (${kinds.rod})`);
 assert.equal(kinds.billboard,billboards.length*2,`${id}: two flags per billboard`);
 if(id!=='curvelo')assert(kinds.roof>=10,`${id}: grandstand roof flags`);else assert(!kinds.roof,'Curvelo has no surveyed stands');
 // --- No cloth through a board (round 2: a flag cut through a billboard on every lap): every flag near a billboard
 // (its backing, legs, catwalk, lamps) or a brake board is shaken through random states of the shader's own cloth
 // (any heading, calm to flying straight out, gusts, ripple, the pole's lean); not one point, nor its pole, inside one.
 {
  const boxes=plan.boxes;assert(boxes.length>=billboards.length,`${id}: board boxes`);
  const inside=(b,x,y,z)=>{if(z<b.z0||z>b.z1)return false;if(b.r!==undefined)return Math.hypot(x-b.x,y-b.y)<b.r;const dx=x-b.x,dy=y-b.y,u=dx*b.ax+dy*b.ay,v=-dx*b.ay+dy*b.ax;return Math.abs(u)<b.hu&&v>b.v0&&v<b.v1;};
  let seed=11;const rnd=()=>(seed=seed*16807%2147483647)/2147483647;let shaken=0;
  for(const t of items){
   const near=boxes.filter(b=>Math.hypot(t.x-b.x,t.y-b.y)<(b.r??b.hu+1.2)+t.w*1.6+t.pole+.5);if(!near.length)continue;shaken++;
   // (the lean: instanceMatrix turns the flag by Euler x=tilt[0], z=tilt[1]; the pole's top in track x/y and height)
   const taper=t.pattern===5?.92:0,[al,be]=t.tilt,top=h=>[-h*t.pole*Math.sin(be),-h*t.pole*Math.cos(be)*Math.sin(al),h*t.pole*Math.cos(be)*Math.cos(al)],[lx,ly,lz]=top(1);
   for(let k=0;k<300;k++){
    const lift=.1+.9*rnd(),heavy=rnd(),droop=(1-lift)*(.3+.4*heavy)+.02,g=lift>.999?1.3:(lift-.1)/1.1*rnd(),amp=((.05+.07*lift)+.2*g)*(.85+.3*rnd()),a=rnd()*6.283,wave=rnd()*60;
    for(let u=0;u<=1.0001;u+=.125)for(const v of [0,.5,1]){
     const c=clothPoint(u,v,[Math.cos(a),Math.sin(a)],lift,droop,amp,wave,t.w,t.h,taper),x=t.x+lx+c[0],y=t.y+ly-c[2],z=t.z+lz+c[1];
     if(t.kind!=='rod')for(const b of near)assert(!inside(b,x,y,z),`${id}: ${t.kind} at ${t.s.toFixed(0)} sweeps into a ${b.part} (${b.slot??'brake'})`);
    }
   }
   for(let h=0;h<=1;h+=.1){const [px,py,pz]=top(h);for(const b of near)assert(!inside(b,t.x+px,t.y+py,t.z+pz+.001),`${id}: ${t.kind} pole at ${t.s.toFixed(0)} through a ${b.part}`);}
  }
  assert(shaken>=billboards.length*2,`${id}: the boards' own corner flags shaken (${shaken})`);
  // The check bites: the old 1.4 m corner pole let a calm, hanging cloth dip into the board's top.
  const corner=items.find(t=>t.kind==='billboard'),old={...corner,pole:1.4,w:1.1,h:.72};
  assert(sweepHits(old,flagSweep(old),boxes.find(b=>b.part==='backing'&&Math.hypot(b.x-corner.x,b.y-corner.y)<9)),`${id}: a short corner pole is caught`);
  report[id]={...report[id],swept:shaken,rejected:plan.rejected};
 }
 // --- Brake boards: 300/200/100 counting down to a corner, outside its approach when clear.
 assert(boards.length>=3,`${id}: brake boards (${boards.length})`);
 for(const b of boards){
  assert([100,200,300].includes(b.metres));
  let gap=b.corner-b.s;if(gap<0)gap+=L;assert(Math.abs(gap-b.metres)<=12.5,`${id}: ${b.metres} board ${gap.toFixed(0)} m before its corner`);
  assert(bandClearance(roads,b.x,b.y).distance>=1.8,`${id}: board off every road and pit lane`);
  assert(!geo||!wallsNear(geo,b.x,b.y,1.5).length,`${id}: board clear of pit walls`);
  assert(nearest(b,billboards)>=12&&nearest(b,cams)>=8,`${id}: board clear of billboards and TV cameras`);
 }
 for(const corner of new Set(boards.map(b=>b.corner))){
  const mine=boards.filter(b=>b.corner===corner),m=mine.map(b=>b.metres);assert(m.includes(100)||!m.length,`${id}: a corner's countdown ends at 100`);
  assert(!m.includes(300)||m.includes(200),`${id}: no gap in the countdown`);assert.equal(new Set(mine.map(b=>b.side)).size,1,`${id}: a countdown on one side of the track`);
 }
 assert(plan.targets.every((t,i,a)=>!i||a[i-1].s<=t.s),`${id}: crossing targets by lap distance`);
 report[id]={...counts,kinds,boards:boards.length,...report[id]};
}

// --- The cars' wake: gust bookkeeping on a 1000 m lap. Cars run along s at vx m/s (negative: backwards).
const T=[{s:100,d:-8,kind:'pennant',index:0,up:3},{s:100,d:40,kind:'pennant',index:1,up:3},{s:300,d:-5,kind:'rod',index:2,up:0},
 {s:500,d:4,kind:'board',index:-1,up:0},{s:5,d:-8,kind:'pennant',index:3,up:3},{s:650,d:-8,kind:'pennant',index:4,up:3},{s:800,d:-9,kind:'roof',index:5,up:14}];
const fresh=()=>{const pass=new Float32Array(24),phase=new Float32Array(24);for(let i=0;i<6;i++)pass[i*4]=-100;return {pass,phase,gusts:new FlagGusts(1000,T,pass,phase)};};
const car=(s,d,vx=50)=>({surface:{s,d},vx,vy:0});
// Steps every car for `seconds`; the first is the player unless player is false. Logs where it was.
function run(g,cars,seconds,dt=1/60,player=true){
 const log=[],me=player?cars[0]:null,rivals=player?cars.slice(1):cars;g.step(dt,me,rivals);
 for(let t=0;t<seconds-1e-9;t+=dt){
  for(const c of cars)c.surface.s=((c.surface.s+c.vx*dt)%1000+1000)%1000;
  const changed=[...g.step(dt,me,rivals)];log.push({s:cars[0].surface.s,changed,events:[...g.events]});
 }
 return log;
}
{
 const {pass,gusts}=fresh(),log=run(gusts,[car(50,-2)],1.6);
 const hit=log.find(f=>f.changed.includes(0));
 assert(hit,'a car passing a flag writes a gust');assert(hit.s>84&&hit.s<92,`the wake reaches the flag a little ahead of the car (${hit.s.toFixed(1)})`);
 assert(pass[1]>.3&&pass[1]<=1.3,`gust strength ${pass[1]}`);
 // The car runs east (three.js +x), the flag on its right (+z): thrown out to the right and along.
 assert(Math.abs(pass[2]-.6)<1e-6&&Math.abs(pass[3]-.8)<1e-6,`gust out from the car's path and along it (${pass[2]}, ${pass[3]})`);
 assert(Math.abs(pass[0]-(gusts.time-(log.length-1-log.indexOf(hit))/60))<1e-4,'pass time on the shared clock');
 assert.equal(pass[5],0,'a car 42 m away stirs nothing');
 assert.equal(gusts.stats.playerPasses,1);
 // Flags fly a car's wake more the closer and faster it goes.
 const near=fresh(),far=fresh(),slow=fresh();run(near.gusts,[car(50,-6)],1.6);run(far.gusts,[car(50,4)],1.6);run(slow.gusts,[car(80,-6,15)],2);
 assert(near.pass[1]>far.pass[1]&&far.pass[1]>0,'closer car, stronger gust');assert(slow.pass[1]>0&&slow.pass[1]<near.pass[1],'slower car, weaker gust');
}
{
 // Run over a rod: flattened (strength > 1) along the car; a near miss only shakes it; 10 m away it stays.
 const hit=fresh(),miss=fresh(),clear=fresh();run(hit.gusts,[car(250,-5.4)],1.4);run(miss.gusts,[car(250,-2)],1.4);run(clear.gusts,[car(250,5)],1.4);
 assert(hit.pass[2*4+1]>1&&hit.gusts.stats.knocks===1,'a rod under the car is knocked flat');
 assert(Math.abs(hit.pass[2*4+2]-1)<1e-6&&Math.abs(hit.pass[2*4+3])<1e-6,'a knocked rod folds along the car\'s path');
 // Backwards on the left of the flag: still thrown away from the car (three.js -z is the car's right going west).
 const back=fresh();run(back.gusts,[car(700,-4,-50)],1.4);assert(back.pass[4*4+1]>0&&Math.abs(back.pass[4*4+2]+.6)<1e-6&&Math.abs(back.pass[4*4+3]-.8)<1e-6,`wrong-way car throws the flag out too (${back.pass[4*4+2]}, ${back.pass[4*4+3]})`);
 assert(miss.pass[2*4+1]>0&&miss.pass[2*4+1]<.4&&miss.gusts.stats.knocks===0,'a near miss only shakes the rod');
 assert.equal(clear.pass[2*4+1],0,'a car 10 m away leaves it');
}
{
 // Whoosh: only the player's car, close and fast, panned to the side the board is on.
 const a=fresh(),log=run(a.gusts,[car(450,-1)],1.4),ev=log.flatMap(f=>f.events);
 assert.equal(ev.length,1,'one whoosh at the board');assert(ev[0].pan<0&&ev[0].strength>0,'board on the left, heard on the left');
 const right=fresh(),evr=run(right.gusts,[car(450,7)],1.4).flatMap(f=>f.events);assert(evr.length===1&&evr[0].pan>0,'board on the right, heard on the right');
 const b=fresh();run(b.gusts,[car(450,-1)],1.4,1/60,false);assert.equal(b.gusts.stats.whooshes,0,'rivals make no whoosh');assert.equal(b.gusts.stats.playerPasses,0,'rivals\' gusts are not the player\'s');
 const c=fresh();run(c.gusts,[car(480,-1,15)],2);assert.equal(c.gusts.stats.whooshes,0,'no whoosh at low speed');
 // Sensação de velocidade off (setQuality: whoosh false): the boards and gantry posts stay silent too.
 const off=fresh();off.gusts.setCount(0);off.gusts.whoosh=false;run(off.gusts,[car(450,-1)],1.4);assert.equal(off.gusts.stats.whooshes,0,'no whoosh with speed effects off');
}
{
 // Lap wrap: from 980 through the line the flag at s = 5 flies.
 const w=fresh();run(w.gusts,[car(980,-7)],1);assert(w.pass[3*4+1]>0,'gust across the lap line');
 // Teleport (reset, reposition): a jump over 40 m sweeps no flags.
 const t=fresh(),c=car(600,-7);t.gusts.step(1/60,c);c.surface.s=700;t.gusts.step(1/60,c);assert.equal(t.pass[4*4+1],0,'teleports skip the flags between');
 // Paused: no time passes, nothing is written.
 const p=fresh(),c2=car(600,-7);p.gusts.step(1/60,c2);const time=p.gusts.time;c2.surface.s=652;p.gusts.step(0,c2);
 assert.equal(p.gusts.time,time,'paused flags are frozen');assert.equal(p.pass[4*4+1],0,'paused: no gust');
 // Driving backwards past a flag stirs it too.
 const b=fresh();run(b.gusts,[car(700,-7,-50)],1.4);assert(b.pass[4*4+1]>0,'a car going the wrong way stirs the flag');
 // A roof flag 14 m above the road is out of the cars' wake.
 const r=fresh();run(r.gusts,[car(760,-7)],1.4);assert.equal(r.pass[5*4+1],0,'roof flags fly the breeze only');
}
{
 // Frame-rate independent: 30 and 144 fps write the same strength at about the same moment.
 const a=fresh(),b=fresh();run(a.gusts,[car(50,-4)],1.6,1/30);run(b.gusts,[car(50,-4)],1.6,1/144);
 assert(Math.abs(a.pass[1]-b.pass[1])<1e-6,'same strength at any frame rate');assert(Math.abs(a.pass[0]-b.pass[0])<2/30,'same moment within a frame or two');
 // Only the instances drawn at a level take gusts.
 const c=fresh();c.gusts.setCount(0);run(c.gusts,[car(50,-4)],1.6);assert.equal(c.pass[1],0,'undrawn flags stay still');
 // A closer car behind takes the flag over from a far one ahead; the wave phase carries on (no jump in the cloth).
 const d=fresh(),pa=d.phase[3];run(d.gusts,[car(70,6),car(45,-7)],1.4);
 assert(d.gusts.stats.passes>=2&&d.phase[3]>pa,'the wave phase carries the first gust over');
 assert(flagGust(0)===0&&flagGust(.3)>.5&&flagGust(3)<.06&&flagGust(7)===0,'gust envelope: quick rise, a few seconds of decay');
}
console.log(JSON.stringify(report));
console.log('testar_bandeiras: ok');

