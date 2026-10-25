// The check of a lap's way on its circuit (src/trajeto.js, its tables in src/pistas.js): the tables as gerar_pistas.mjs
// writes them from today's track files; every lap the game counts goes through (its own driver round every circuit, from
// the grid and flying, a rival's refuelling stop through the pit lane, Pampulha by its branch road, the driver pushed into
// mistakes until it runs off, each also thinned to 4 samples a second as a long lap is kept, a detour into a city's zone
// by its gap, and the pilots' own laps when their file is on this machine); and the laps the server must refuse (the ring
// the records' tests drive, a lap moved 40 m aside or across, its lap distance away from where the car is, the infield and
// a corner cut, a way into a city's zone through its wall), with the time it takes.
// The pilots' laps (a file named by FANTASMAS_REAIS) are not in the repository: without it those cases are skipped.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestCar,roamZoneAt} from '../../pista_interlagos/teste/physics.js';
import {RaceField} from '../../pista_interlagos/teste/race-field.js';
import {RIVAL_ROSTER} from '../../pista_interlagos/teste/race-roster.js';
import {GhostRecorder,encodeGhost} from '../../pista_interlagos/teste/ghost-lap.js';
import {trackFall} from '../../pista_interlagos/teste/cliff-fall.js';
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {readGhost} from '../src/recordes.js';
import {trackProblem,trackMargins} from '../src/trajeto.js';
import {PISTAS} from '../src/pistas.js';
import {buildCircuit,load} from '../gerar_pistas.mjs';

const REAL=process.env.FANTASMAS_REAIS??null;
const DT=1/120,IDS=Object.keys(CIRCUITS);
let passed=0;
const check=(name,fn)=>{const t0=Date.now();fn();passed++;console.log('ok',name,`(${((Date.now()-t0)/1000).toFixed(1)} s)`);};
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}

// A lap as the server reads it: the game's encoding (ghost-lap.js), through JSON, read back (recordes.js readGhost).
const served=entry=>readGhost(JSON.parse(JSON.stringify(entry)));
const ghostOf=lap=>served(encodeGhost(lap));
// Thinned to 4 samples a second, as the game keeps a long lap.
const thin=lap=>{const n=lap.values.length/7,g=served(encodeGhost(lap,Math.floor((n-2)/5)+2));assert.equal(g.rate,4);return g;};
// A ghost changed by edit (its values, in place; n samples), packed and read back.
const forged=(g,edit)=>{const values=Float64Array.from(g.values);edit(values,g.n);return served(encodeGhost({time:g.time,rate:g.rate,values,brakes:[]}));};

// The game's own driver round a circuit (race-field.js heroInput, the recon lap's racecraft), recorded as the game records
// its pilot's laps: the laps it counts. mistakes: every so many seconds on average, for up to two, it steers hard one way or
// forgets to brake (seeded dice): it runs off, spins, comes back. branch: by Pampulha's avenue.
function drive(data,{laps=2,seed=3,mistakes=0,branch=false}={}){
 const car=new TestCar(data);car.resetGrid();const field=new RaceField(data,{seed});field.reset(car.surface.s,{grid:true,entrants:[]});
 const rec=new GhostRecorder(),out=[],dice=random(seed*7919+1);rec.step(car,true);let wrong=null;out.onBranch=0;
 for(let step=0;step<120*1800&&out.length<laps&&car.laps<laps+4;step++){
  let cmd=field.heroInput(car,DT);if(branch)field.hero.routes??=[true];
  const t=step*DT;
  if(mistakes&&!wrong&&t>3&&dice()<DT/mistakes)wrong={until:t+.5+dice()*1.4,steer:dice()<.6,dir:dice()<.5?1:-1};
  if(wrong){if(t>wrong.until)wrong=null;else cmd=wrong.steer?{...cmd,left:wrong.dir>0?1:0,right:wrong.dir<0?1:0}:{...cmd,brake:0,throttle:1};}
  car.step(cmd,DT);if(car.cliff)trackFall(car,DT);field.step(car,DT,0);
  if(car.surface.branch!=null)out.onBranch+=DT;
  const lap=rec.step(car,true,cmd.brake);if(lap)out.push(lap);
 }
 return out;
}
// The game's own cut rule (physics.js trackLap: off the asphalt by more than a metre, past 40 m of track gained, 18 m more
// than the ground driven) on a ghost's samples, its lap distance from the game's own sample() followed as the car's is:
// the lap had a cut by the game's rule. (The game lets some through: off the road its lap distance can slide on to another
// stretch over a few physics steps, and the slide made in race-field.js's own sampling of each car after its step never
// reaches trackLap's count; the check counts all of it.)
function gameCut(id,g){
 const data=load(id),car=new TestCar(data),L=data.meta.reconstructed_xy_m,v=g.values,out=p=>!p.pit&&Math.abs(p.d)>p.width/2+1;
 car.index=car.nearest(v[0],v[1],true).i;let prev=null,cut=null;
 for(let k=0;k<g.n;k++){
  let q;for(let i=0;i<6;i++){q=car.sample(v[k*7],v[k*7+1]);car.index=q.i;}
  if(prev){
   if(!cut&&(out(prev)||out(q)))cut={gained:0,driven:0};
   if(cut){cut.gained+=((q.s-prev.s)%L+1.5*L)%L-L/2;cut.driven+=Math.hypot(v[k*7]-v[k*7-7],v[k*7+1]-v[k*7-6]);if(!out(q)||k===g.n-1){if(cut.gained>40&&cut.gained-cut.driven>18)return true;cut=null;}}
  }
  prev=q;
 }
 return false;
}
// A rival's laps (the same racecraft) stopping to refuel at its team's garage every time by (race-field.js wantStop): in
// the pit lane, to the garage and out. (The player's car is parked high over the grid, out of reach.)
function pitStops(data,laps){
 const player=new TestCar(data);player.resetGrid();const field=new RaceField(data,{seed:5});field.reset(player.surface.s,{grid:true,entrants:[RIVAL_ROSTER[3].number]});
 field.wantStop=()=>true;const r=field.rivals[0],car=r.car,rec=new GhostRecorder(),out=[];rec.step(car,true);
 for(let step=0;step<120*1800&&out.length<laps;step++){player.z=1e6;field.step(player,DT,30);if(car.cliff)trackFall(car,DT);const lap=rec.step(car,true,0);if(lap)out.push(lap);}
 assert.ok(r.stops>=laps,`${data.meta.id}: ${r.stops} stops`);
 return out;
}

// The worst of each measure over a circuit's laps that went through (trackMargins), for the report.
const worst={};
function through(id,g,what){
 const m=trackMargins(g,id);assert.equal(m.problem,null,`${id} ${what}: ${m.problem} ${JSON.stringify(m.off??m.miss??'')}`);
 const w=worst[id]??={laps:0,sMiss:0,sShare:0,edge:-Infinity,reach:0,cut:-Infinity,far:0,snaps:0};
 w.laps++;w.sMiss=Math.max(w.sMiss,m.sMiss);w.sShare=Math.max(w.sShare,m.sShare);w.edge=Math.max(w.edge,m.edge);w.reach=Math.max(w.reach,m.reach);w.cut=Math.max(w.cut,m.cut);w.far=Math.max(w.far,m.far);w.snaps+=m.snaps.length;
}
const refusals={};
function refused(id,g,what,expect=null){
 const why=trackProblem(g,id);assert.ok(why,`${id} ${what} went through`);if(expect)assert.match(why,expect,`${id} ${what}`);
 (refusals[what]??={})[why]=(refusals[what][why]??0)+1;
}

check('the tables are today\'s track files, for every circuit',()=>{
 for(const id of IDS){
  assert.ok(Object.hasOwn(PISTAS,id),`${id}: not in pistas.js (node gerar_pistas.mjs)`);
  assert.deepEqual(PISTAS[id],JSON.parse(JSON.stringify(buildCircuit(id))),`${id}: pistas.js is out of date (node gerar_pistas.mjs)`);
 }
 assert.equal(trackProblem(ghostOf(drive(load('curvelo'),{laps:1})[0]),'nada'),null,'a circuit with no table is not checked');
 assert.equal(trackProblem(null,'interlagos'),'o fantasma da volta não pôde ser lido');
});

const flying={},real=[];
check('the game\'s own driver, from the grid and flying, every circuit (and thinned to 4 a second)',()=>{
 for(const id of IDS){
  const data=load(id),laps=drive(data,{laps:id==='pampulha'?1:2});assert.ok(laps.length>=1,id);
  for(const [i,lap] of laps.entries()){through(id,ghostOf(lap),`lap ${i}`);through(id,thin(lap),`lap ${i} at 4/s`);}
  flying[id]=ghostOf(laps.at(-1));
 }
});
check('through the pit lane: a refuelling stop at the team\'s garage, every circuit',()=>{
 for(const id of IDS){const laps=pitStops(load(id),id==='pampulha'?1:2);for(const [i,lap] of laps.entries()){through(id,ghostOf(lap),`pit lap ${i}`);through(id,thin(lap),`pit lap ${i} at 4/s`);}}
});
check('Pampulha by its branch road, the avenue',()=>{
 const laps=drive(load('pampulha'),{laps:1,branch:true});assert.ok(laps.onBranch>3,`${laps.onBranch.toFixed(1)} s on the avenue`);
 through('pampulha',ghostOf(laps[0]),'by the avenue');through('pampulha',thin(laps[0]),'by the avenue at 4/s');
});
// Refused only for a cut the game's own rule has too. (A lap the game cannot pack, its lap distance jumping more than the
// format holds when the car is past 100 m off and the game looks over the whole lap, is never sent.)
const lapsLetThrough=[];let unsent=0;
check('the driver pushed into mistakes: off the road, spins, back on (every lap the game counts and can send)',()=>{
 const seed=11;
 for(const id of IDS){
  for(const [i,lap] of drive(load(id),{laps:id==='pampulha'?1:2,seed,mistakes:9}).entries()){
   const e=encodeGhost(lap);if(!e){unsent++;continue;}
   const g=served(e),why=trackProblem(g,id);
   if(why==='o carro cortou caminho por fora da pista'&&gameCut(id,g)){lapsLetThrough.push(`${id} (seed ${seed}, lap ${i})`);continue;}
   through(id,g,`messy lap ${i} (seed ${seed})`);
  }
 }
 if(lapsLetThrough.length)console.log(`  refused as cuts, as the game's own rule has them (the game let them through): ${lapsLetThrough.join(', ')}`);
 if(unsent)console.log(`  ${unsent} lap(s) the game cannot pack, never sent`);
});
// A city's zones open to roam (Floripa's streets, the Mineirão): their cells cover every spot the game has on the zone's
// ground (physics.js roamZoneAt), and a lap that leaves through a zone's gap, drives in and comes back goes through; one
// that goes straight through a wall that holds, onto the zone's ground right behind it, is refused (only gaps lead in).
check('a city\'s zones: their cells, and a lap into one through its gap and back',()=>{
 for(const id of IDS.filter(id=>PISTAS[id].zones.length)){
  const data=load(id),dice=random(7),L=data.meta.reconstructed_xy_m,zones=data.meta.roam.zones;
  PISTAS[id].zones.forEach((Z,z)=>{
   const bits=Buffer.from(Z.bits,'base64'),on=(x,y)=>{const i=Math.floor((x-Z.x0)/Z.cell),j=Math.floor((y-Z.y0)/Z.cell),k=j*Z.nx+i;return i>=0&&j>=0&&i<Z.nx&&j<Z.ny&&!!(bits[k>>3]&128>>(k&7));};
   let inside=0;for(let t=0;t<4000;t++){const x=Z.x0+dice()*Z.nx*Z.cell,y=Z.y0+dice()*Z.ny*Z.cell;if(roamZoneAt(data,x,y)?.name===zones[z].name){inside++;assert.ok(on(x,y),`${id} ${zones[z].name}: (${x.toFixed(1)}, ${y.toFixed(1)}) not in its cells`);}}
   assert.ok(inside>50,`${id} ${zones[z].name}: ${inside} spots`);
  });
  // (On a side whose walls run whole round the zone alone has the car past them; on an open side the lap's reach has it.)
  let held=0;
  for(const zone of zones){
   const gap=zone.gaps[0],detour=into(id,flying[id],(gap.s0+gap.s1)/2,gap.side,zone.name);
   assert.ok(detour!==null,`${id}: no way into ${zone.name}`);
   if(!detour){console.log(`  ${id}: into ${zone.name} and back, the game's lap distance jumps more than its format carries: never sent`);continue;}
   through(id,detour,`into ${zone.name} and back`);
   const z=trackMargins(detour,id).zone;held=Math.max(held,z);console.log(`  ${id}: into ${zone.name} and back, ${z} samples where only the zone holds the car`);
  }
  assert.ok(held>0,`${id}: no detour went past walls that hold`);
  // Through a wall that holds onto the zone's ground right behind it, 150 m and more from every gap: refused for the way in.
  const zone=zones.find(z=>{const g=z.gaps[0];return into(id,flying[id],(g.s0+g.s1)/2,g.side,z.name)&&trackMargins(into(id,flying[id],(g.s0+g.s1)/2,g.side,z.name),id).zone>0;});
  const side=zone.gaps[0].side,away=s=>zones.every(z=>z.gaps.every(g=>Math.abs(((s-(g.s0+g.s1)/2)%L+1.5*L)%L-L/2)>150));
  const s=data.samples.filter((p,j)=>j%5===0&&away(p[0])).map(p=>p[0]).find(s=>{const d=into(id,flying[id],s,side,zone.name);return d&&trackMargins(d,id).off?.through!==undefined;});
  assert.ok(s!==undefined,`${id}: no wall with ${zone.name} behind it`);
  refused(id,into(id,flying[id],s,side,zone.name),`through a city's wall into ${zone.name}`,/saiu do traçado/);
  refused(id,into(id,flying[id],s,side,null),'out through a city\'s wall',/saiu do traçado/);
 }
});
// The flying lap with a detour at lap distance s: straight out to that side (1 left), 10 m into the zone, then up to 80 m
// along the lap behind its wall while on the zone's ground (or 30 m out when zone is null), and back the same way; its lap
// distance the game's for each spot (physics.js sample, followed from the spot before). null: no way in; undefined: the
// game's format cannot carry it (its lap distance jumping more than 327 m between two samples).
function into(id,g,s,side,zone){
 const data=load(id),a=data.samples,L=data.meta.reconstructed_xy_m,v=g.values;
 let k=0;for(let j=0;j<g.n;j++)if(Math.abs(((v[j*7+6]-s)%L+1.5*L)%L-L/2)<Math.abs(((v[k*7+6]-s)%L+1.5*L)%L-L/2))k=j;
 let lo=0,hi=a.length-1;const t=((s%L)+L)%L;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][0]<=t)lo=m;else hi=m-1;}
 const p=a[lo],n=Math.hypot(p[7],p[8]),tx=p[7]/n,ty=p[8]/n,on=(x,y)=>roamZoneAt(data,x,y)?.name===zone;
 // (Out along the normal, or turned up to 60 degrees from it, the first way that gets 10 m into the zone.)
 let way=[],lx=0,ly=0;
 for(const turn of [0,15,-15,30,-30,45,-45,60,-60]){
  const c=Math.cos(turn*Math.PI/180),r=Math.sin(turn*Math.PI/180),nx=-ty*side,ny=tx*side;lx=nx*c-ny*r;ly=nx*r+ny*c;way=[];let deep=0;
  for(let d=0;d<=120&&deep<(zone?10:30);d+=2){const x=p[1]+lx*d,y=p[2]+ly*d;if(zone?on(x,y):d>p[4]/2)deep+=2;else if(zone&&deep)break;way.push([x,y]);}
  if(!zone||deep>=10)break;way=null;
 }
 if(!way)return null;
 if(zone){
  const [x0,y0]=way.at(-1),run=dir=>{const w=[];for(let e=2;e<=80;e+=2){const x=x0+tx*dir*e,y=y0+ty*dir*e;if(!on(x,y))break;w.push([x,y]);}return w;};
  const ahead=run(1),back=run(-1);way.push(...(ahead.length>=back.length?ahead:back));
 }
 const rows=[];for(let j=0;j<=k;j++)rows.push([...v.subarray(j*7,j*7+7)]);
 const car=new TestCar(data);car.index=car.nearest(v[k*7],v[k*7+1],true).i;
 for(const [x,y] of [...way,...way.slice().reverse()]){let q;for(let i=0;i<6;i++){q=car.sample(x,y);car.index=q.i;}const last=rows.at(-1)[6];rows.push([x,y,...v.subarray(k*7+2,k*7+6),last+((q.s-last)%L+1.5*L)%L-L/2]);}
 for(let j=k+1;j<g.n;j++)rows.push([...v.subarray(j*7,j*7+7)]);
 const e=encodeGhost({time:g.time+2*way.length/g.rate,rate:g.rate,values:Float64Array.from(rows.flat()),brakes:[]});
 return e?served(e):undefined;
}
check('the pilots\' own laps',()=>{
 if(!fs.existsSync(REAL)){console.log('  (skipped: no file of the pilots\' laps at',REAL+')');return;}
 for(const r of JSON.parse(fs.readFileSync(REAL,'utf8'))){const g=served(r.fantasma);assert.ok(g,r.circuito);through(r.circuito,g,`${r.circuito} ${r.volta_ms} ms`);real.push({id:r.circuito,g});}
 assert.ok(real.length>0);
});

// Laps no car drove there.
function ring(id,time,flat=false){
 const L=CIRCUITS[id].length,R=L/(2*Math.PI),rate=20,n=Math.floor(time*rate)+1+(time*rate%1?1:0),values=new Float64Array(n*7),[cx,cy]=centre(id);
 for(let k=0;k<n;k++){const t=k===n-1?time:k/rate,u=t/time,i=k*7;if(flat){values[i]=cx+R*Math.cos(2*Math.PI*u);values[i+1]=cy+R*Math.sin(2*Math.PI*u);}else{values[i]=R*Math.cos(2*Math.PI*u);values[i+2]=R*Math.sin(2*Math.PI*u);}values[i+6]=L*u;}
 return served(encodeGhost({time,rate,values,brakes:[]}));
}
function centre(id){const a=load(id).samples;return [a.reduce((s,p)=>s+p[1],0)/a.length,a.reduce((s,p)=>s+p[2],0)/a.length];}
const aside=(g,by)=>forged(g,(v,n)=>{for(let k=0;k<n;k++){const h=v[k*7+3];v[k*7]-=Math.sin(h)*by;v[k*7+1]+=Math.cos(h)*by;}});
const across=(g,by)=>forged(g,(v,n)=>{for(let k=0;k<n;k++)v[k*7]+=by;});
// Its lap distance a smooth way off where the car is (up to `by` m mid-lap), or growing evenly with the clock.
const sOff=(g,by)=>forged(g,(v,n)=>{for(let k=0;k<n;k++)v[k*7+6]+=by*Math.sin(Math.PI*k/(n-1));});
const sClock=g=>forged(g,(v,n)=>{const a=v[6],b=v[(n-1)*7+6];for(let k=0;k<n;k++)v[k*7+6]=a+(b-a)*k/(n-1);});
// A stretch of the lap driven straight across instead (from sample a to b), at the pace it had: the lap that much quicker.
// Its lap distance claimed along the chord, or the game's own for each spot on it (physics.js sample, its window walked on
// from the spot before, as a forger with the track files would give it). null when the game's format cannot carry it (the
// lap distance jumping more than 327 m between two samples).
function shortcut(id,g,a,b,gameS){
 const v=g.values,L=load(id).meta.reconstructed_xy_m,P=k=>[v[k*7],v[k*7+1]],chord=Math.hypot(v[b*7]-v[a*7],v[b*7+1]-v[a*7+1]),m=Math.max(1,Math.round((b-a)*chord/(v[b*7+6]-v[a*7+6])));
 const rows=[];for(let k=0;k<=a;k++)rows.push([...v.subarray(k*7,k*7+7)]);
 const car=gameS?new TestCar(load(id)):null;if(car){car.index=car.nearest(...P(a),true).i;}
 for(let j=1;j<m;j++){const u=j/m,r=[...v.subarray(a*7,a*7+7)].map((x,f)=>x+(v[b*7+f]-x)*u);
  if(car){let q;for(let i=0;i<6;i++){q=car.sample(r[0],r[1]);car.index=q.i;}const last=rows.at(-1)[6];r[6]=last+((q.s-last)%L+1.5*L)%L-L/2;}
  rows.push(r);}
 for(let k=b;k<g.n;k++)rows.push([...v.subarray(k*7,k*7+7)]);
 const values=Float64Array.from(rows.flat()),time=g.time-(b-a-m)/g.rate,e=encodeGhost({time,rate:g.rate,values,brakes:[]});
 return e&&served(e);
}
// Stretches to cut (a, b samples): the one with most track for the ground across it (the infield), a shorter one gaining
// 100 to 200 m, and a corner gaining 50 to 80 m.
function cuts(g){
 const v=g.values,n=g.n;let best=null,mid=null,corner=null;
 for(let a=0;a<n;a+=3)for(let b=a+6;b<n;b+=3){
  const ds=v[b*7+6]-v[a*7+6];if(ds>700)break;if(ds<60)continue;
  const gain=ds-Math.hypot(v[b*7]-v[a*7],v[b*7+1]-v[a*7+1]);
  if(!best||gain>best.gain)best={a,b,gain};
  if(gain>=100&&gain<=200&&(!mid||ds<mid.ds))mid={a,b,gain,ds};
  if(gain>=50&&gain<=80&&(!corner||ds<corner.ds))corner={a,b,gain,ds};
 }
 return {best,mid,corner};
}

check('the ring the records\' tests drive, on every circuit (and one round the circuit, flat)',()=>{
 for(const id of IDS){refused(id,ring(id,Math.max(60,CIRCUITS[id].length/45)),'ring');refused(id,ring(id,Math.max(60,CIRCUITS[id].length/45),true),'flat ring');}
});
check('a lap moved 40 m aside (to the car\'s left and right) or 40 m across, every circuit',()=>{
 for(const [id,g] of [...Object.entries(flying),...real.map(r=>[r.id,r.g])]){refused(id,aside(g,40),'40 m to the left');refused(id,aside(g,-40),'40 m to the right');refused(id,across(g,40),'40 m across');}
});
check('a lap whose lap distance is not where the car was',()=>{
 for(const [id,g] of [...Object.entries(flying),...real.map(r=>[r.id,r.g])]){refused(id,sOff(g,40),'lap distance 40 m off',/distância na pista/);refused(id,sClock(g),'lap distance by the clock');}
});
check('the infield and a corner cut: the lap distance along the chord, or the game\'s own on it',()=>{
 let unpacked=0;
 for(const [id,g] of [...Object.entries(flying),...real.map(r=>[r.id,r.g])]){
  const {best,mid,corner}=cuts(g);assert.ok(best&&best.gain>100&&corner,`${id}: no stretch to cut`);
  for(const [what,c] of [['infield cut',best],['cut of 100-200 m',mid],['corner cut',corner]])if(c){
   refused(id,shortcut(id,g,c.a,c.b,false),`${what}, claimed`);
   const game=shortcut(id,g,c.a,c.b,true);if(game)refused(id,game,`${what}, the game's lap distance`);else{assert.notEqual(what,'corner cut',id);unpacked++;}
  }
 }
 console.log(`  ${unpacked} cut(s) with the game's lap distance jump more than its format carries: never sent`);
});

check('time: a few tenths of a millisecond for a lap of 3600 samples',()=>{
 const laps=[...Object.entries(flying),...real.map(r=>[r.id,r.g])].map(([id,g])=>({id,g}));
 const long=pitStops(load('interlagos'),2).map(l=>({id:'interlagos',g:ghostOf(l)})).sort((a,b)=>b.g.n-a.g.n)[0];
 for(let w=0;w<20;w++)for(const l of laps)trackProblem(l.g,l.id);
 const runs=200,t0=performance.now();for(let r=0;r<runs;r++)trackProblem(long.g,long.id);
 const ms=(performance.now()-t0)/runs,per=ms/long.g.n*3600;let all=0,samples=0;
 const t1=performance.now();for(let r=0;r<20;r++)for(const l of laps){trackProblem(l.g,l.id);samples+=l.g.n;}all=performance.now()-t1;
 console.log(`  ${ms.toFixed(3)} ms for the ${long.g.n} samples of an Interlagos lap with a pit stop (${per.toFixed(3)} ms per 3600); ${(all/samples*3600).toFixed(3)} ms per 3600 over every flying lap`);
 assert.ok(per<5,'well inside the Worker\'s 10 ms');
});

console.log('\nWorst of the laps that went through, per circuit (limits: lap distance room 10 m and more off the asphalt; reach 1; cut 38 m; far off 1500 m or 3/4 of the lap):');
for(const [id,w] of Object.entries(worst))console.log(`  ${id.padEnd(11)} ${String(w.laps).padStart(2)} laps  lap distance ${w.sMiss.toFixed(2)} m (${(w.sShare*100).toFixed(0)}% of its room)  past the asphalt ${w.edge.toFixed(1)} m  reach ${(w.reach*100).toFixed(0)}%  cut ${Number.isFinite(w.cut)?w.cut.toFixed(1)+' m':'-'}  far off ${w.far.toFixed(0)} m  ghost's own stretch ${w.snaps}x`);
console.log('Refused:');
for(const [what,r] of Object.entries(refusals))console.log(`  ${what}: ${Object.entries(r).map(([why,c])=>`${why} (${c})`).join('; ')}`);
console.log(`\nsrc/pistas.js ${(fs.statSync(new URL('../src/pistas.js',import.meta.url)).size/1000).toFixed(1)} kB. ${passed} checks passed.`);
