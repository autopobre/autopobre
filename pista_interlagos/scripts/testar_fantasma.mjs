// Ghost lap (G): the recorder keeps whole laps that count, the replay follows the car on them, the
// saved laps stay small, one per pilot, circuit and mode, and the ghost's shell sits where the car does.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {TestCar,steerLimit,wrap,clamp} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
import {branchGeometries,branchPoint} from '../teste/branch-lane.js';
import {GhostRecorder,GhostLap,encodeGhost,decodeGhost,saveGhost,loadGhost,readGhosts,ghostMaxTime,inferBrakes,thinGhost,GHOST_KEY,GHOST_LIMIT,GHOST_RATE,GHOST_MAX_TIME,GHOST_LONGEST,GHOST_SAMPLES,GHOST_MIN_RATE,GHOST_BUDGET} from '../teste/ghost-lap.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url))),L=data.meta.reconstructed_xy_m;
const memory=(limit=Infinity)=>{const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem(k,v){if(v.length>limit)throw new Error('QuotaExceededError');values.set(k,v);}};};

// Two laps alone on track with the recon lap's racecraft: the first from the grid, the second flying.
// Every step's real pose is kept to check the replay against it, and its brake (the pedal past .05, as the lamps).
const car=new TestCar(data);car.resetGrid();const field=new RaceField(data,{seed:3});field.reset(car.surface.s,{grid:true,entrants:[]});
// The game asks the recorder at every step, the countdown's too: the grid lap is seen from its first instant.
const recorder=new GhostRecorder(),laps=[],truth=[];recorder.step(car,true);
for(let step=0;step<120*400&&laps.length<2;step++){
 const command=field.heroInput(car,1/120);car.step(command,1/120);field.step(car,1/120,3);
 const lap=recorder.step(car,true,command.brake);if(lap)laps.push(lap);
 const p=car.pose(0);truth.push({lapStart:car.lapStart,t:car.clock-car.lapStart,x:p.x,y:p.y,z:p.z,heading:car.heading,pitch:car.pitch,roll:car.roll,brake:command.brake>.05});
}
assert.equal(laps.length,2,'both laps that counted were recorded');assert.equal(car.laps,2);
const [first,second]=laps;
assert.ok(Math.abs(first.time-(truth.find(s=>s.lapStart>0).lapStart))<1e-9,'the first lap is timed from the grid, as the game times it');
assert.ok(second.time<first.time&&Math.abs(second.time-car.lastLap)<1e-9,'the flying lap is the faster one');
for(const lap of laps){
 const n=lap.values.length/7;assert.equal(n,Math.ceil(lap.time*GHOST_RATE-1e-9)+1,'20 samples a second plus the one on the line');
 assert.ok(lap.values[(n-1)*7+6]>L-20&&lap.values[(n-1)*7+6]<L+20,'the track distance runs one lap');
}
assert.ok(first.values[6]<0&&second.values[6]>=0&&second.values[6]<16,'the grid lap starts behind the line, the flying one on it');

// The replay follows the car within a couple of centimetres between its 20 Hz samples.
const replay=new GhostLap(second),flying=truth.filter(s=>Math.abs(s.lapStart-(car.lapStart-second.time))<1e-9);
let worst=0,worstAngle=0;
for(const s of flying){const p=replay.poseAt(s.t);worst=Math.max(worst,Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z));worstAngle=Math.max(worstAngle,...['heading','pitch','roll'].map(k=>Math.abs(Math.atan2(Math.sin(p[k]-s[k]),Math.cos(p[k]-s[k])))));}
assert.ok(flying.length>second.time*119,'the flying lap was kept step by step');
assert.ok(worst<.03&&worstAngle<.01,`replay off by ${worst.toFixed(3)} m and ${worstAngle.toFixed(4)} rad`);
const end=replay.poseAt(second.time+5);assert.ok(Math.hypot(end.x-car.pose(0).x,end.y-car.pose(0).y)<1e-6,'after its line the ghost stays there');
assert.ok(Math.hypot(replay.poseAt(-2).x-flying[0].x,replay.poseAt(-2).y-flying[0].y)<.6,'before the clock runs it waits at its start');
// The gap: the lap against itself is level all the way round; ahead of it, negative.
let level=0;for(const s of flying.filter((_,i)=>i%240===0)){const k=Math.floor(s.t*GHOST_RATE),at=replay.poseAt(k/GHOST_RATE).progress;level=Math.max(level,Math.abs(replay.timeAt(at)-k/GHOST_RATE));}
assert.ok(level<1e-6,'the lap is level with itself');
assert.ok(replay.timeAt(L/2)-replay.timeAt(L/4)>0&&replay.timeAt(-50)===0&&replay.timeAt(L*2)===second.time);
// The brake lights: the lap keeps the instants the pedal went on and off, and the replay is braking exactly when the
// car was; dark before the clock runs and after the line.
assert.ok(second.brakes.length>=20&&second.brakes.every((b,i)=>b>=0&&b<second.time&&(!i||b>second.brakes[i-1])),`${second.brakes.length} brake switches kept`);
assert.ok(!replay.brakesInferred&&flying.every(s=>replay.brakeAt(s.t)===s.brake),'the replay brakes when the car braked');
assert.ok(flying.some(s=>s.brake)&&flying.some(s=>!s.brake)&&!replay.brakeAt(-1)&&!replay.brakeAt(second.time+1));

// Stored as 16-bit steps: ~40 kB a lap, back within 6 mm and 1e-4 rad.
const encoded=encodeGhost(second),text=JSON.stringify(encoded),decoded=decodeGhost(JSON.parse(text));
assert.ok(text.length<60000,`saved lap is ${text.length} characters`);
assert.equal(decoded.n,replay.n);assert.equal(decoded.time,second.time);
let drift=0;for(let i=0;i<decoded.values.length;i++){const f=i%7;drift=Math.max(drift,Math.abs(decoded.values[i]-second.values[i])*(f>=3&&f<=5?100:1));}
assert.ok(drift<.006,`quantization drift ${drift}`);
for(const broken of [{...encoded,v:2},{...encoded,n:encoded.n+1},{...encoded,data:encoded.data.slice(8)},{...encoded,time:-1},{...encoded,start:[1,2]},{...encoded,data:'@@@'},null,'x'])assert.equal(decodeGhost(broken),null);
// The brake's switches go along in hundredths (b): back within 5 ms; a b that is not whole hundredths within the lap,
// rising, makes it no lap.
assert.ok(Array.isArray(encoded.b)&&encoded.b.length===second.brakes.length&&!decoded.brakesInferred&&decoded.brakes.every((b,i)=>Math.abs(b-second.brakes[i])<=.005+1e-9),'brake switches saved');
assert.ok(flying.filter(s=>second.brakes.every(b=>Math.abs(b-s.t)>.01)).every(s=>decoded.brakeAt(s.t)===s.brake),'saved, the replay still brakes when the car braked');
for(const b of [[1,-5],[20,10],[1.5],'10',[0,Math.round(second.time*100)+50],Array(5000).fill(0)])assert.equal(decodeGhost({...encoded,b}),null,`b ${JSON.stringify(b).slice(0,30)} is no lap`);
// A lap saved before the brake was kept (no b, as every ghost until now): it still loads and replays, its brake read back
// from its speed and slope (inferBrakes): it agrees with the car's pedal nearly all the time and lights nearly every
// braking zone, at 20 samples a second and thinned to 5 (there a tap shorter than 0.6 s may fall between samples).
const before={...encoded};delete before.b;const old=decodeGhost(JSON.parse(JSON.stringify(before)));
assert.ok(old&&old.brakesInferred&&old.n===decoded.n&&old.time===second.time,'an old lap still loads');
const zones=[];for(const s of flying){if(s.brake&&!(zones.at(-1)?.open))zones.push({a:s.t,b:s.t,open:true});else if(s.brake)zones.at(-1).b=s.t;else if(zones.at(-1)?.open)zones.at(-1).open=false;}
const inferred={};
for(const [name,lap] of [['20',old],['5',new GhostLap({...thinGhost(second,4),brakes:null})]]){
 const agree=flying.filter(s=>lap.brakeAt(s.t)===s.brake).length/flying.length,big=zones.filter(z=>z.b-z.a>=(name==='5'?.6:.3)),found=big.filter(z=>flying.some(s=>s.t>=z.a&&s.t<=z.b&&lap.brakeAt(s.t)));
 inferred[name]={agree,found:found.length,zones:big.length};
 assert.ok(lap.brakesInferred&&agree>.93&&found.length>=big.length-2,`inferred brake at ${name}/s: agrees ${(agree*100).toFixed(1)}%, ${found.length}/${big.length} zones`);
}
assert.deepEqual(inferBrakes(Float64Array.from([0,0,0,0,0,0,0,10,0,0,0,0,0,10]),20,.05),[],'a car at a steady speed never brakes');
// A lap from elsewhere: data longer than its samples, or a car 10 000 km away or turned 1e6 rad, is no lap.
for(const broken of [{...encoded,data:encoded.data+'AAAA'},{...encoded,data:encoded.data+'A'.repeat(1e6)},{...encoded,start:[1e9,...encoded.start.slice(1)]},{...encoded,start:[...encoded.start.slice(0,3),1e10,...encoded.start.slice(4)]}])assert.equal(decodeGhost(broken),null);
const jump={...second,values:Float64Array.from(second.values)};jump.values[7*10]+=400;assert.equal(encodeGhost(jump),null,'a 400 m jump in 1/20 s is no lap');

// The recorder keeps only laps the pilot drove whole, and starts over when the car goes back to the grid.
function drive(options){
 const c=new TestCar(data);c.resetGrid();const f=new RaceField(data,{seed:3});f.reset(c.surface.s,{grid:true,entrants:[]});
 const r=new GhostRecorder(),got=[];let seen=c.lapStart;if(options.paddock)for(let i=0;i<240;i++)r.step(c,false);else if(!options.lateStart)r.step(c,true);else for(let i=0;i<600;i++){c.step(f.heroInput(c,1/120),1/120);f.step(c,1/120,3);}
 for(let step=0;step<120*400&&c.laps<2;step++){
  c.step(f.heroInput(c,1/120),1/120);f.step(c,1/120,3);
  // flagged: the step onto the line ends the driving (the flag), as the race's last lap does.
  const crossing=c.lapStart!==seen;seen=c.lapStart;
  const lap=r.step(c,!(options.helped&&c.laps===1&&c.clock-c.lapStart>30&&c.clock-c.lapStart<31)&&!(options.flagged&&crossing));if(lap)got.push(lap.time);
  if(options.restart&&step===120*20){c.resetGrid();f.reset(c.surface.s,{grid:true,entrants:[]});r.step(c,true);}
 }
 return {got,best:c.best,laps:c.lastLap};
}
assert.equal(drive({helped:true}).got.length,1,'a second of autopilot leaves that lap out');
assert.equal(drive({lateStart:true}).got.length,1,'a lap the recorder joined late is left out');
assert.equal(drive({flagged:true}).got.length,2,'the last lap counts though its flag ends the driving');
assert.equal(drive({paddock:true}).got.length,2,'steps with the clock stopped (the story paddock, the 3-2-1) leave the grid lap in');
{const run=drive({restart:true});assert.equal(run.got.length,2,'back on the grid, the recording starts over');}

// Saved laps: one per pilot (any case), circuit and mode; only a faster lap replaces it.
const storage=memory(),key={circuit:'interlagos',mode:'normal',pilot:'Stevan'};
assert.equal(loadGhost(storage,key),null);
assert.ok(saveGhost(storage,{...key,lap:first}),'the first lap is saved');
assert.equal(saveGhost(storage,{...key,pilot:'STEVAN',lap:{...first,time:first.time+1}}),null,'a slower lap keeps the ghost');
assert.ok(saveGhost(storage,{...key,pilot:'  stevan ',lap:second}),'a faster lap replaces it');
assert.equal(readGhosts(storage).length,1);assert.equal(loadGhost(storage,{...key,pilot:'STEVAN'}).time,second.time);
assert.ok(saveGhost(storage,{...key,mode:'immersive',lap:first})&&saveGhost(storage,{...key,pilot:'Outra',lap:first})&&saveGhost(storage,{...key,circuit:'curvelo',lap:first}));
assert.equal(readGhosts(storage).length,4,'modes, pilots and circuits stay apart');
assert.equal(loadGhost(storage,{...key,mode:'immersive'}).time,first.time);
// The Fusca (its own mechanics) keeps its own lap: a slower one beside the Opala's, which laps without a car are.
assert.ok(first.time>second.time&&saveGhost(storage,{...key,car:'fusca',lap:first}),'a Fusca lap is not measured against the Opala ghost');
assert.equal(readGhosts(storage).length,5);assert.equal(loadGhost(storage,{...key,car:'fusca'}).time,first.time);
assert.equal(loadGhost(storage,key).time,second.time);assert.equal(loadGhost(storage,{...key,car:'opala'}).time,second.time);
for(const bad of [{...key,circuit:'../x'},{...key,mode:'tour'},{...key,pilot:'  '},{...key,car:'kombi'}])assert.equal(saveGhost(storage,{...bad,lap:first}),null);
assert.equal(saveGhost(null,{...key,lap:first}),null);
// The newest GHOST_LIMIT laps stay; a full browser drops the oldest until the new one fits.
const many=memory();for(let i=0;i<GHOST_LIMIT+6;i++)saveGhost(many,{...key,pilot:`Piloto ${i}`,lap:second},new Date(Date.UTC(2026,9,1,0,i)));
const kept=readGhosts(many);assert.equal(kept.length,GHOST_LIMIT);assert.ok(kept.some(g=>g.pilot===`Piloto ${GHOST_LIMIT+5}`)&&!kept.some(g=>g.pilot==='Piloto 0'),'the oldest went first');
const size=JSON.stringify(readGhosts(many).slice(0,3)).length,small=memory(size+100);for(let i=0;i<3;i++)saveGhost(small,{...key,pilot:`P${i}`,lap:second},new Date(Date.UTC(2026,9,1,0,i)));
assert.ok(saveGhost(small,{...key,pilot:'Nova',lap:second},new Date(Date.UTC(2026,9,2))),'room made for the new lap');
assert.ok(readGhosts(small).some(g=>g.pilot==='Nova')&&!readGhosts(small).some(g=>g.pilot==='P0'));
assert.equal(saveGhost(memory(100),{...key,lap:second}),null,'no room even alone: not saved');
assert.deepEqual(readGhosts({getItem:()=>'{broken'}),[]);assert.deepEqual(readGhosts({getItem:()=>JSON.stringify([{circuit:'interlagos',mode:'normal',pilot:{},time:1,data:''}])}),[]);
{const s=memory();s.setItem(GHOST_KEY,JSON.stringify([{...encodeGhost(second),circuit:'interlagos',mode:'normal',pilot:'Stevan',data:'AAAA'}]));assert.ok(saveGhost(s,{...key,lap:{...second,time:second.time+9}}),'an unreadable ghost is replaced');}
// The name and date come out as plain text: the name cleaned, a date that is not a string empty.
{const s=memory();s.setItem(GHOST_KEY,JSON.stringify([{...encodeGhost(second),circuit:'interlagos',mode:'normal',pilot:' Stevan\u0000\u001b ',date:{toString:'x'}}]));
 const got=loadGhost(s,key);assert.equal(got.pilot,'Stevan');assert.equal(got.date,'');}

// A long lap: the Circuito da Pampulha (20.5 km, one lap a race) driven whole from the grid by a scripted car (pure pursuit
// on the lap with the fork's avenue branch in it, as testar_ramal.mjs) takes far past GHOST_MAX_TIME and is still a ghost.
// Its track distance is the car's surface.s (on the branch, the lap's s its station stands for): it runs on with no jump.
// Saved thinned within GHOST_SAMPLES (4 or 5 a second), it replays within centimetres, on the branch too.
assert.equal(ghostMaxTime(L),GHOST_MAX_TIME,'a few-km circuit keeps the 6 minutes');
let longLap=null,longReport=null;
{
 const pdata=JSON.parse(fs.readFileSync(new URL('../dados/pista_pampulha.json',import.meta.url))),PL=pdata.meta.reconstructed_xy_m,geo=branchGeometries(pdata)[0];
 assert.ok(geo&&ghostMaxTime(PL)>1000,'Pampulha: a branch, and room for a slow lap');
 const pts=[];for(const p of pdata.samples)if(p[0]<geo.entryMainS||p[0]>geo.exitMainS)pts.push({x:p[1],y:p[2],s:p[0]});
 {const k=pts.findIndex(p=>p.s>geo.exitMainS),way=[];for(let b=0;b<=geo.length;b+=2){const q=branchPoint(geo,b);way.push({x:q.x,y:q.y});}pts.splice(k,0,...way);}
 const N=pts.length,c=new TestCar(pdata),r=new GhostRecorder(),seen=[],NONE={left:0,right:0,throttle:0,brake:0,reverse:0,handbrake:0};
 c.resetGrid();r.step(c,true);let k=0;
 for(let step=0;step<120*1500&&!longLap;step++){
  let best=Infinity;for(let j=k-5;j<k+40;j++){const p=pts[(j+N)%N],d2=(p.x-c.x)**2+(p.y-c.y)**2;if(d2<best){best=d2;k=(j+N)%N;}}
  const speed=Math.hypot(c.vx,c.vy),T=pts[(k+Math.round((8+speed*.5)/2))%N],alpha=wrap(Math.atan2(T.y-c.y,T.x-c.x)-c.heading),steer=Math.atan2(2*2.667*Math.sin(alpha),Math.hypot(T.x-c.x,T.y-c.y));
  let v=40;for(let j=2;j<60;j+=2){const p=pts[(k+j-3+N)%N],q=pts[(k+j)%N],o=pts[(k+j+3)%N],kap=Math.abs(wrap(Math.atan2(o.y-q.y,o.x-q.x)-Math.atan2(q.y-p.y,q.x-p.x)))/Math.max(1,Math.hypot(o.x-p.x,o.y-p.y)/2);v=Math.min(v,Math.sqrt(6/Math.max(kap,1e-4)+20*j));}
  const cmd=clamp(steer/steerLimit(speed),-1,1);c.step({...NONE,left:Math.max(0,cmd),right:Math.max(0,-cmd),throttle:clamp((v-speed)*.5,0,1),brake:clamp((speed-v)*.6,0,1)},1/120);
  longLap=r.step(c,true);const p=c.pose(0);if(!longLap&&c.lapStart===0)seen.push({t:c.clock,x:p.x,y:p.y,z:p.z,heading:c.heading,branch:c.surface.branch!=null});
 }
 assert.ok(longLap&&c.lastLapValid===true,'the long lap counts and is recorded');
 assert.ok(longLap.time>GHOST_MAX_TIME&&longLap.time<ghostMaxTime(PL),`a ${longLap.time.toFixed(0)} s lap`);
 const onBranch=seen.filter(s=>s.branch).length/120;assert.ok(onBranch>5,`by the avenue branch (${onBranch.toFixed(1)} s on it)`);
 const n=longLap.values.length/7;let jump=0;for(let i=1;i<n;i++)jump=Math.max(jump,Math.abs(longLap.values[i*7+6]-longLap.values[i*7-1]));
 assert.ok(jump<5&&Math.abs(longLap.values[n*7-1]-PL)<20,`the track distance runs one lap with no jump (${jump.toFixed(2)} m between samples at most)`);
 const saved=encodeGhost(longLap),text=JSON.stringify(saved),back=decodeGhost(JSON.parse(text));
 assert.ok(saved.rate>=GHOST_MIN_RATE&&saved.rate<GHOST_RATE&&saved.n<=GHOST_SAMPLES&&text.length<70000,`saved at ${saved.rate} a second, ${saved.n} samples, ${text.length} characters`);
 assert.ok(back&&back.time===longLap.time&&back.rate===saved.rate);
 let worst=0,worstBranch=0,worstHeading=0;
 for(const s of seen){const q=back.poseAt(s.t),e=Math.hypot(q.x-s.x,q.y-s.y,q.z-s.z);worst=Math.max(worst,e);if(s.branch)worstBranch=Math.max(worstBranch,e);worstHeading=Math.max(worstHeading,Math.abs(wrap(q.heading-s.heading)));}
 assert.ok(worst<.15&&worstHeading<.03,`the thinned lap replays within ${(worst*100).toFixed(1)} cm and ${worstHeading.toFixed(3)} rad`);
 assert.ok(worstBranch<.15,`on the branch within ${(worstBranch*100).toFixed(1)} cm`);
 assert.ok(back.timeAt(PL/2)>back.timeAt(PL/4)&&back.timeAt(PL*2)===back.time);
 longReport={time:longLap.time,rate:saved.rate,kB:text.length/1000,worst,onBranch};
 const s=memory(),key={circuit:'pampulha',mode:'normal',pilot:'Stevan'};
 assert.ok(saveGhost(s,{...key,lap:longLap})&&loadGhost(s,key).time===longLap.time,'saved and loaded');
 assert.equal(decodeGhost({...saved,time:GHOST_LONGEST+1}),null,'no lap longer than GHOST_LONGEST');
}
// All the ghosts together stay within GHOST_BUDGET: long laps push the oldest out (short ones too), the newest stay.
{
 const s=memory();for(let i=0;i<6;i++)saveGhost(s,{circuit:'interlagos',mode:'normal',pilot:`Curta ${i}`,lap:second},new Date(Date.UTC(2026,9,1,0,i)));
 for(let i=0;i<GHOST_LIMIT;i++)saveGhost(s,{circuit:'pampulha',mode:'normal',pilot:`Longa ${i}`,lap:longLap},new Date(Date.UTC(2026,9,2,0,i)));
 const kept=readGhosts(s),size=s.getItem(GHOST_KEY).length;
 assert.ok(size<=GHOST_BUDGET&&kept.length<GHOST_LIMIT&&kept.some(g=>g.pilot===`Longa ${GHOST_LIMIT-1}`)&&!kept.some(g=>g.pilot.startsWith('Curta')),`${kept.length} ghosts in ${size} characters`);
 assert.ok(kept.every(g=>decodeGhost(g)),'every one kept still loads');
}

// The shell: a pose of the replay places it as main.js places the player's car from TestCar.pose.
// (A canvas whose 2D context does nothing: the plate and the brake lights' maps draw into it.)
const noop=new Proxy(function(){},{get:(target,key)=>key==='createRadialGradient'||key==='createLinearGradient'?()=>({addColorStop(){}}):noop,apply:()=>undefined});
globalThis.document??={createElement:()=>({width:0,height:0,getContext:()=>noop})};
const {GhostCar}=await import('../teste/ghost-car.js');
const template=new THREE.Group(),box=new THREE.Mesh(new THREE.BoxGeometry(4.6,1.4,1.8)),hidden=new THREE.Mesh(new THREE.BoxGeometry(1,1,1)),inner=new THREE.Mesh(new THREE.BoxGeometry(1,1,1).toNonIndexed());
box.position.y=.7;hidden.visible=false;inner.userData.interno=true;template.add(box,hidden,inner,new THREE.Mesh(new THREE.PlaneGeometry(1,1).toNonIndexed()));
const ghost=new GhostCar();assert.ok(ghost.build(template));assert.equal(ghost.triangles,12+2,'hidden and inside parts are left out');
car.heading=.7;car.pitch=.08;car.roll=-.12;car.z+=.3;
const pose=car.pose(0),forward=new THREE.Vector3(pose.forward[0],pose.forward[2],-pose.forward[1]),up=new THREE.Vector3(pose.up[0],pose.up[2],-pose.up[1]),side=new THREE.Vector3().crossVectors(forward,up).normalize();
const expected=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward,up,side));
ghost.place({x:pose.x,y:pose.y,z:pose.z,heading:car.heading,pitch:car.pitch,roll:car.roll});
assert.ok(ghost.body.quaternion.angleTo(expected)<1e-6&&ghost.body.position.distanceTo(new THREE.Vector3(pose.x,pose.z,-pose.y))<1e-9,'the ghost sits where the car would');
ghost.setOpacity(0);assert.equal(ghost.root.visible,false);ghost.setOpacity(.5);assert.equal(ghost.root.visible,true);
ghost.detail(200);assert.ok(ghost.near.visible&&!ghost.far,'with no distant profile the shell always shows');
const detailed=new GhostCar();detailed.build(template,new THREE.BoxGeometry(4.6,1.4,1.8).toNonIndexed());
detailed.detail(20);assert.ok(detailed.near.visible&&!detailed.far.visible);detailed.detail(80);assert.ok(!detailed.near.visible&&detailed.far.visible,'far away the distant profile takes over');
// One shell per car model: the one raced shows (the Fusca has no distant profile: always its shell).
const fusca=new THREE.Group();fusca.add(new THREE.Mesh(new THREE.BoxGeometry(4,1.5,1.6)));detailed.build(fusca,null,'fusca');
assert.equal(detailed.model,'opala','building another model keeps the one shown');detailed.use('fusca');detailed.detail(80);
assert.ok(detailed.has('fusca')&&detailed.model==='fusca'&&detailed.near.visible&&detailed.triangles===12&&!detailed.shells.get('opala').near.visible&&!detailed.shells.get('opala').far.visible);
detailed.use('kombi');assert.equal(detailed.model,'fusca','a model never built keeps the one shown');detailed.use('opala');assert.equal(detailed.triangles,14);
// Brake lights: the Opala's lenses and halos (on its distant profile too), another model's own tail lamps lit (a halo per
// side), all dark until the lap brakes, faded with the ghost; each rides its shell (shown and hidden with it).
{
 const lamps=new GhostCar(),opala=new THREE.Group(),fusca=new THREE.Group(),red=new THREE.MeshStandardMaterial({name:'Lanterna_fusca'});
 opala.add(new THREE.Mesh(new THREE.BoxGeometry(4.6,1.4,1.8)));fusca.add(new THREE.Mesh(new THREE.BoxGeometry(3.8,1.3,1.5)));
 for(const z of [-.55,.55]){const lamp=new THREE.Mesh(new THREE.SphereGeometry(.05),red);lamp.position.set(-1.72,.45,z);fusca.add(lamp);}
 lamps.build(opala,new THREE.BoxGeometry(4.6,1.4,1.8).toNonIndexed(),'opala');lamps.build(fusca,null,'fusca');
 const o=lamps.shells.get('opala').lights,f=lamps.shells.get('fusca').lights;
 assert.ok(o.length===2&&o[0].parent===lamps.shells.get('opala').near&&o[1].parent===lamps.shells.get('opala').far&&o[1].position.length()>.3,'the Opala lights on its shell and its distant profile');
 assert.ok(f.length===1&&f[0].children.length===2&&f[0].parent===lamps.shells.get('fusca').near,'the Fusca lights its own lamps');
 const halo=f[0].children[1].geometry;halo.computeBoundingBox();assert.ok(halo.boundingBox.max.x<-1.7&&halo.boundingBox.min.z<-.4&&halo.boundingBox.max.z>.4,'a halo behind each Fusca lamp');
 assert.ok([...o,...f].every(g=>!g.visible),'dark until the lap brakes');
 lamps.setBrake(true);assert.ok(lamps.braking&&[...o,...f].every(g=>g.visible));lamps.setOpacity(.5);
 assert.ok(lamps.lensMaterial.opacity===.8&&lamps.haloMaterial.opacity===.5&&lamps.lampMaterial.opacity===.8,'faded with the ghost');
 lamps.setBrake(false);assert.ok([...o,...f].every(g=>!g.visible));
 const order=[...o[0].children,...f[0].children].map(m=>m.renderOrder);assert.ok(order.every(r=>r>21),'drawn after the shell (its depth pass hides them from ahead)');
}

console.log(`Ghost lap passed: brake lights replay ${second.brakes.length} switches (old laps read back from the speed: ${(inferred['20'].agree*100).toFixed(1)}% at 20/s, ${(inferred['5'].agree*100).toFixed(1)}% at 5/s, ${inferred['20'].found}/${inferred['20'].zones} zones); laps ${first.time.toFixed(2)} s (grid) and ${second.time.toFixed(2)} s recorded whole, replay within ${(worst*100).toFixed(1)} cm, ${(text.length/1000).toFixed(1)} kB a lap, one per pilot/circuit/mode/car, faster replaces, oldest out, autopilot and late laps left out, shell placed as the car; a Pampulha lap of ${longReport.time.toFixed(0)} s (${longReport.onBranch.toFixed(1)} s on the avenue branch) saved at ${longReport.rate} a second in ${longReport.kB.toFixed(1)} kB, replay within ${(longReport.worst*100).toFixed(1)} cm, all ghosts within ${GHOST_BUDGET/1e6} M characters.`);
