// The online records' dynamics check (src/dinamica.js) against laps the game drives itself and laps forged from them,
// for each car of the records (the Opala; the Fusca, its own body and mechanics and the Copa Fusca's field).
// Pass: on every circuit the recon lap's racecraft and the ace's alone (the Opala with the story's new engine parts) and
// asking more than the tyres have, each from the grid (the race's first lap, from rest behind the line) and flying, a
// full field of rivals with contacts, the same laps thinned to 10, 5 and 4 samples a second, and the pilots' own real
// laps when their file is on this machine (FANTASMAS_REAIS: it never goes in the repo; without it those cases are
// skipped).
// Refused: a real or AI lap sped up (re-sampled from its own curve), its corners taken with more grip, the game's car
// with more grip or more power than it has, a boost, an Opala's lap sent as a Fusca's, the smooth ring of
// testar_recordes.mjs at 0.85 of the driving line, and laps at a constant top speed. Then the check's time on a
// 3600-sample lap.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestCar,OPALA_BODY,FUSCA_BODY} from '../../pista_interlagos/teste/physics.js';
import {RaceField,ACE_STYLE,HERO_STYLE} from '../../pista_interlagos/teste/race-field.js';
import {fieldRoster} from '../../pista_interlagos/teste/race-roster.js';
import {GhostRecorder,encodeGhost,decodeGhost,thinGhost} from '../../pista_interlagos/teste/ghost-lap.js';
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {createCurveloData} from '../../pista_interlagos/teste/curvelo-data.js';
import {ENGINE_PARTS} from '../../pista_interlagos/teste/story-career.js';
import {readGhost} from '../src/recordes.js';
import {LINE_TIMES} from '../src/pisos.js';
import {ENVELOPES} from '../src/envelope.js';
import {dynamicsProblem,dynamicsScore,BUDGET} from '../src/dinamica.js';

const REAL=process.env.FANTASMAS_REAIS??null;
const DT=1/120,FIELDS=7,PUSH=/motor/,TURN=/aderência/,FAST=/velocidade máxima/;
const BODIES={opala:OPALA_BODY,fusca:FUSCA_BODY},NAMES={opala:'Opala',fusca:'Fusca'};
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('ok',name);};
const tracks=new Map(),track=id=>{
 if(!tracks.has(id)){const data=id==='curvelo'?createCurveloData():JSON.parse(fs.readFileSync(new URL(`../../pista_interlagos/dados/${CIRCUITS[id].data??'pista.json'}`,import.meta.url)));data.meta.id=id;tracks.set(id,data);}
 return tracks.get(id);
};
const served=lap=>readGhost(encodeGhost(lap));               // as the game sends it (a long lap thinned) and the server reads it
const thinned=(lap,d)=>readGhost(encodeGhost(thinGhost(lap,d)));
const fmt=s=>`motor ${s.push.toFixed(2)} curva ${s.turn.toFixed(2)} freio ${s.brake.toFixed(2)} m/s, ${s.fastest.toFixed(2)} m/s no máximo`;
const worst=Object.fromEntries(Object.keys(BODIES).map(car=>[car,{push:[0,''],turn:[0,''],brake:[0,''],total:[0,''],fastest:[0,'']}]));
// A lap the car can drive: no reason, and its scores kept for the summary.
function passes(ghost,circuit,name,car='opala'){
 const why=dynamicsProblem(ghost,circuit,car),s=dynamicsScore(ghost,circuit,car),w=worst[car];
 assert.equal(why,null,`${car} ${name}: ${why} (${fmt(s)})`);
 for(const [k,x] of [['push',s.push],['turn',s.turn],['brake',s.brake],['total',s.push+s.turn+s.brake],['fastest',s.fastest]])if(x>w[k][0])w[k]=[x,name];
 return s;
}
const refused=(ghost,circuit,why,name,car='opala')=>{const got=dynamicsProblem(ghost,circuit,car);assert.match(got??'',why,`${car} ${name}: ${got} (${fmt(dynamicsScore(ghost,circuit,car))})`);return got;};

// The game's AI in the car from the grid (TestCar with the car's body + RaceField.heroInput + GhostRecorder, as the recon
// lap): style its racecraft; power the engine held there (the ace's racecraft brings his own 1.13, and every rival of
// either field its style's: the player's car has 1, the Opala's story parts ENGINE_PARTS); grip the tyres (weatherGrip:
// past 1 a hacked car); field a full Impossível grid of the car's own field ahead of it (the Copa Fusca's for the
// Fusca, with its body). The laps it completes, each with the contacts it had with rivals (hits) and walls.
function drive(id,{car='opala',style=HERO_STYLE,power=1,grip=1,field=false,seed=7}={}){
 const data=track(id),body=BODIES[car],c=new TestCar(data).setBody(body);c.resetGrid();c.weatherGrip=grip;
 const f=new RaceField(data,{seed,level:field?'impossivel':'facil',body,roster:fieldRoster('99',car)});f.reset(c.surface.s,{grid:true,entrants:field?null:[]});
 const rec=new GhostRecorder(),laps=[],want=CIRCUITS[id].laps??(field?3:2);let hits=0,walls=0;rec.step(c,true);
 for(let k=0;k<120*1500*want&&laps.length<want;k++){
  const cmd=f.heroInput(c,DT,style);c.engineScale=power;c.step(cmd,DT);if(c.wallImpactSpeed>2)walls++;
  hits+=f.step(c,DT,want).filter(x=>x.player).length;
  const lap=rec.step(c,true,cmd.brake);if(lap){laps.push({...lap,hits,walls});hits=walls=0;}
 }
 assert.equal(laps.length,want,`${car} ${id}: the AI completed its laps`);
 return laps;
}
// The ace's racecraft, and the same asking more of the tyres and brakes than they have (the physics decides what it gets).
const ACE={...ACE_STYLE,name:'Ás no carro do jogador'},PAST={...ACE,name:'Ás além dos pneus',cornerGrip:12,braking:11};
// A lap from the grid: behind the line at its first sample, at rest for its first half second.
const fromGrid=lap=>{const v=lap.values;return v[6]<-1&&Math.hypot(v[70]-v[0],v[71]-v[1])<1;};

// Forged laps: a lap's own path (GhostLap's curve between its samples) on a new clock. warp: the original's time at the
// forged lap's t; the forgery is sampled at 20 a second as the game records.
function retime(entry,time,warp){
 const lap=decodeGhost(entry),n=Math.ceil(time*20-1e-9)+1,values=new Float64Array(n*FIELDS),p={};
 for(let k=0;k<n;k++){lap.poseAt(warp(Math.min(k/20,time)),p);values.set([p.x,p.y,p.z,p.heading,p.pitch,p.roll,p.progress],k*FIELDS);}
 return readGhost(encodeGhost({time,rate:20,values,brakes:[]}));
}
const sped=(entry,share)=>retime(entry,entry.time*(1-share),t=>t/(1-share));
// The lap's path with its speed at each sample times the factor factors(lap, speeds, sideways accelerations) gives
// (both over ±0.5 s from the samples).
function warped(entry,factors){
 const lap=decodeGhost(entry),v=lap.values,n=lap.n,m=Math.max(1,Math.round(lap.rate/2)),at=i=>lap.sampleTime(i),speed=new Float64Array(n),across=new Float64Array(n);
 for(let i=m;i+m<n;i++){
  const a=i-m,b=i+m,T=at(b)-at(a),vx=(v[b*7]-v[a*7])/T,vy=(v[b*7+1]-v[a*7+1])/T,s=Math.hypot(vx,vy)||1;
  const ax=2*((v[b*7]-v[i*7])/(at(b)-at(i))-(v[i*7]-v[a*7])/(at(i)-at(a)))/T,ay=2*((v[b*7+1]-v[i*7+1])/(at(b)-at(i))-(v[i*7+1]-v[a*7+1])/(at(i)-at(a)))/T;
  speed[i]=s;across[i]=Math.abs(ay*vx-ax*vy)/s;
 }
 const f=factors(lap,speed,across),T=new Float64Array(n);for(let i=1;i<n;i++)T[i]=T[i-1]+(at(i)-at(i-1))*2/(f[i]+f[i-1]);
 return retime(entry,T[n-1],t=>{let lo=0,hi=n-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(T[mid]<=t)lo=mid;else hi=mid;}return at(lo)+(at(hi)-at(lo))*(t-T[lo])/((T[hi]-T[lo])||1);});
}
// The corners taken k times harder (the speed × √k where the car turns at 4 m/s² and more, blended in up to 8 m/s²,
// eased in over ±0.5 s), the straights as driven: a pilot with super grip.
const gripped=(entry,k)=>warped(entry,(lap,speed,across)=>{
 const n=lap.n,m=Math.max(1,Math.round(lap.rate/2)),f=across.map(x=>1+(Math.sqrt(k)-1)*Math.max(0,Math.min(1,(x-4)/4)));
 return f.map((_,i)=>{let sum=0,count=0;for(let j=Math.max(0,i-m);j<=Math.min(n-1,i+m);j++){sum+=f[j];count++;}return sum/count;});
});
// A hacked boost: dv m/s more for `hold` s, eased in and out over half a second, from the first moment the lap
// accelerates through 35 to 45 m/s.
const boosted=(entry,dv,hold=2)=>warped(entry,(lap,speed)=>{
 const i0=speed.findIndex((s,i)=>s>35&&s<45&&speed[i+lap.rate]>s+1),t0=lap.sampleTime(i0),ease=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
 return speed.map((_,i)=>{const u=lap.sampleTime(i)-t0;return 1+dv/speed[i0]*ease(u/.5)*(1-ease((u-hold-.5)/.5));});
});
// The lap's path at one speed all the way round.
function steady(entry,speed){
 const lap=decodeGhost(entry),v=lap.values,n=lap.n,d=new Float64Array(n);
 for(let i=1;i<n;i++)d[i]=d[i-1]+Math.hypot(v[i*7]-v[i*7-7],v[i*7+1]-v[i*7-6],v[i*7+2]-v[i*7-5]);
 return retime(entry,d[n-1]/speed,t=>{const x=speed*t;let lo=0,hi=n-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(d[mid]<=x)lo=mid;else hi=mid;}return lap.sampleTime(lo)+(lap.sampleTime(hi)-lap.sampleTime(lo))*(x-d[lo])/((d[hi]-d[lo])||1);});
}
// testar_recordes.mjs ghost(): once round a ring as long as the track at an even speed (x and z: a ring standing up).
function ring(circuit,time){
 const L=CIRCUITS[circuit].length,R=L/(2*Math.PI),rate=20,n=Math.floor(time*rate)+1+(time*rate%1?1:0),values=new Float64Array(n*7);
 for(let k=0;k<n;k++){const t=k===n-1?time:k/rate,u=t/time,i=k*7;values[i]=R*Math.cos(2*Math.PI*u);values[i+2]=R*Math.sin(2*Math.PI*u);values[i+6]=L*u;}
 return readGhost(encodeGhost({time,rate,values,brakes:[]}));
}
// The smallest share of time (0.25% steps, up to 10%) or grip (1% steps) that a forgery of this lap is refused at.
const smallest=(steps,make,circuit,car='opala')=>steps.find(x=>dynamicsProblem(make(x),circuit,car)!==null)??null;
const shares=Array.from({length:40},(_,i)=>(i+1)/400),grips=Array.from({length:30},(_,i)=>1+(i+1)/100);
const pct=s=>s===null?'mais de 10%':`${(s*100).toFixed(2)}%`;
const found={};

// The laps each car's AI drove alone on each circuit: [who, lap] (the first from the grid, then flying).
const ai={opala:{},fusca:{}};
for(const car of Object.keys(BODIES))check(`${NAMES[car]}: AI laps on every circuit pass, the recon racecraft, the ace's${car==='opala'?' with the story\'s engine':''} and past the tyres, at 20, 10, 5 and 4 samples a second`,()=>{
 for(const id of Object.keys(CIRCUITS)){
  const laps=[...drive(id,{car}).map(l=>['recon',l]),...drive(id,{car,style:ACE,power:car==='opala'?ENGINE_PARTS:1}).map(l=>['ás',l]),...drive(id,{car,style:PAST}).map(l=>['além',l])];ai[car][id]=laps;
  for(const [who,lap] of laps){
   const name=`${id} ${who} ${lap.time.toFixed(2)} s`;passes(served(lap),id,name,car);
   if(lap.rate===20)for(const d of [2,4,5])passes(thinned(lap,d),id,`${name} a ${20/d}/s`,car);
  }
  const [,best]=laps.reduce((b,l)=>l[1].time<b[1].time?l:b);console.log(`   ${id.padEnd(10)} ${best.time.toFixed(2)} s: ${fmt(dynamicsScore(served(best),id,car))}`);
 }
});
check('a lap from the grid (the race\'s first, from rest behind the line) passes, in either car, alone and in a field',()=>{
 let count=0;
 for(const car of Object.keys(BODIES))for(const id of Object.keys(CIRCUITS))for(const [who,lap] of ai[car][id].filter(([,l])=>fromGrid(l))){passes(served(lap),id,`${id} ${who} da largada`,car);count++;}
 assert.ok(count>=Object.keys(CIRCUITS).length*2*3,`${count} laps from the grid`);
 console.log(`   ${count} voltas saindo do grid, paradas atrás da linha`);
});
for(const car of Object.keys(BODIES))check(`${NAMES[car]}: laps with contact among rivals pass, from the back of a full field (the first from the grid)`,()=>{
 let hits=0,walls=0,grid=0;
 for(const id of ['curvelo','piracicaba'])for(const style of [HERO_STYLE,ACE])for(const lap of drive(id,{car,style,power:style===ACE&&car==='opala'?ENGINE_PARTS:1,field:true})){
  hits+=lap.hits;walls+=lap.walls;if(fromGrid(lap))grid++;const s=passes(served(lap),id,`${id} no pelotão ${lap.time.toFixed(2)} s (${lap.hits} toques)`,car);
  if(lap.hits)console.log(`   ${id.padEnd(10)} ${lap.time.toFixed(2)} s com ${lap.hits} toque(s) em rivais: ${fmt(s)}`);
 }
 assert.ok(hits>=2&&grid===4,`the laps had contact with rivals (${hits} hits, ${walls} wall hits; ${grid} from the grid)`);
});

const real=REAL&&fs.existsSync(REAL)?JSON.parse(fs.readFileSync(REAL,'utf8').replace(/^﻿/,'')).map(r=>({...r,carro:r.carro??'opala'})):null;
if(!real)console.log(`-- sem as voltas reais (FANTASMAS_REAIS ${REAL??'não definido'}): os casos delas ficam de fora`);
else{
 check('the pilots\' real laps pass, at 20, 10, 5 and 4 samples a second',()=>{
  for(const r of real){
   const g=readGhost(r.fantasma),name=`${r.circuito} real ${r.volta_ms/1000} s`;passes(g,r.circuito,name,r.carro);
   for(const d of [2,4,5])passes(thinned(decodeGhost(r.fantasma),d),r.circuito,`${name} a ${20/d}/s`,r.carro);
   console.log(`   ${r.carro} ${name}: ${fmt(dynamicsScore(g,r.circuito,r.carro))}`);
  }
 });
 check('the real laps sped up by 5% are refused, and by the least share tried',()=>{
  for(const x of real){
   refused(sped(x.fantasma,.05),x.circuito,/./,`real ${x.circuito} -5%`,x.carro);
   const s=found[`real ${x.carro} ${x.circuito}`]=smallest(shares,p=>sped(x.fantasma,p),x.circuito,x.carro);
   console.log(`   ${x.carro} real ${x.circuito}: recusada a partir de ${pct(s)} mais rápida: ${dynamicsProblem(sped(x.fantasma,s),x.circuito,x.carro)}`);
  }
  if(found['real opala interlagos']!==undefined)assert.ok(found['real opala interlagos']<=.04,'refused at 4% or less');
 });
 check('the real laps with super grip are refused',()=>{
  for(const x of real){const k=smallest(grips,k=>gripped(x.fantasma,k),x.circuito,x.carro);console.log(`   ${x.carro} real ${x.circuito}: recusada a partir de ${k} vez(es) a aceleração lateral: ${dynamicsProblem(gripped(x.fantasma,k),x.circuito,x.carro)}`);}
  const r=real.find(x=>x.circuito==='interlagos'&&x.carro==='opala');if(r)refused(gripped(r.fantasma,1.1),'interlagos',TURN,'real Interlagos x1.1 lateral');
 });
 const r=real.find(x=>x.circuito==='interlagos'&&x.carro==='opala');
 if(r)check('the real Interlagos path at the top speed all the way is refused',()=>{
  console.log(`   ${refused(steady(r.fantasma,ENVELOPES.opala.top),'interlagos',TURN,'real Interlagos at top speed')}`);
 });
}

check('AI laps sped up are refused (the least share on a few circuits)',()=>{
 for(const car of Object.keys(BODIES))for(const id of ['interlagos','curvelo','cascavel','goiania','piracicaba']){
  const [,lap]=ai[car][id].filter(([who])=>who==='além').at(-1),entry=encodeGhost(lap);
  const s=smallest(shares,p=>sped(entry,p),id,car);
  console.log(`   ${NAMES[car]} ${id.padEnd(10)} além dos pneus: recusada a partir de ${pct(s)} mais rápida; a 5%: ${dynamicsProblem(sped(entry,.05),id,car)??'aceita'}`);
 }
 for(const car of Object.keys(BODIES))refused(sped(encodeGhost(ai[car].interlagos.at(-1)[1]),.05),'interlagos',/./,'Interlagos AI -5%',car);
});
for(const car of Object.keys(BODIES))check(`the game's ${NAMES[car]} with more grip or more power than it has is refused`,()=>{
 const [grip]=drive('interlagos',{car,style:PAST,grip:1.1}).slice(-1),[power]=drive('interlagos',{car,style:PAST,power:1.3}).slice(-1);
 console.log(`   aderência x1.1 (${grip.time.toFixed(2)} s): ${refused(served(grip),'interlagos',TURN,'grip x1.1',car)}`);
 console.log(`   motor x1.3 (${power.time.toFixed(2)} s): ${refused(served(power),'interlagos',PUSH,'power x1.3',car)}`);
 // A boost in one burst is no rival's shove, however short.
 const [,ace]=ai[car].interlagos.filter(([who])=>who==='ás').at(-1),entry=encodeGhost(ace);
 console.log(`   impulso de 8 m/s por 1 s: ${refused(boosted(entry,8,1),'interlagos',PUSH,'boost 8 m/s',car)}`);
 for(const dv of [2,4,6])console.log(`   impulso de ${dv} m/s por 1 s: ${dynamicsProblem(boosted(entry,dv,1),'interlagos',car)??'aceita'}`);
});
check('an Opala\'s lap sent as a Fusca\'s is refused (its speeds are far past a Fusca\'s); an unknown car is refused',()=>{
 for(const id of Object.keys(CIRCUITS)){const [,lap]=ai.opala[id].filter(([who])=>who==='recon').at(-1);refused(served(lap),id,/Fusca/,`${id} Opala lap as a Fusca`,'fusca');}
 const [,lap]=ai.opala.interlagos.at(-1);console.log(`   Interlagos: ${dynamicsProblem(served(lap),'interlagos','fusca')}`);
 assert.equal(dynamicsProblem(served(lap),'interlagos','kombi'),'carro desconhecido');assert.equal(dynamicsScore(served(lap),'interlagos','kombi'),null);
});
check('the smooth ring at 0.85 of the driving line, and laps at a constant top speed, are refused',()=>{
 for(const car of Object.keys(BODIES)){
  const time=LINE_TIMES[car].interlagos*.85,top=ENVELOPES[car].top,[,lap]=ai[car].interlagos.at(-1);
  console.log(`   ${NAMES[car]}: anel a 0,85 da linha (${time.toFixed(1)} s): ${refused(ring('interlagos',time),'interlagos',PUSH,'ring',car)}`);
  console.log(`   ${NAMES[car]}: anel na velocidade máxima: ${refused(ring('interlagos',CIRCUITS.interlagos.length/top),'interlagos',/./,'ring at top speed',car)}`);
  console.log(`   ${NAMES[car]}: traçado da IA na velocidade máxima: ${refused(steady(encodeGhost(lap),top),'interlagos',TURN,'AI path at top speed',car)}`);
  console.log(`   ${NAMES[car]}: traçado da IA 1 m/s acima da máxima: ${refused(steady(encodeGhost(lap),top+1),'interlagos',/./,'AI path past top speed',car)}`);
 }
 assert.equal(dynamicsProblem(null,'interlagos'),'o fantasma da volta não pôde ser lido');
});
check('the check takes well under its share of a Worker\'s 10 ms on a 3600-sample lap',()=>{
 // The first three minutes of the AI's Pampulha lap at 20 samples a second: 3600 samples, the most the game keeps at 20.
 for(const car of Object.keys(BODIES)){
  const [,lap]=ai[car].pampulha.at(-1),values=lap.values.slice(0,3600*FIELDS),g=readGhost(encodeGhost({time:3599/20,rate:20,values,brakes:[]}));
  assert.equal(g.n,3600);
  for(let i=0;i<50;i++)dynamicsProblem(g,'pampulha',car);
  const times=[];for(let i=0;i<200;i++){const t=performance.now();dynamicsProblem(g,'pampulha',car);times.push(performance.now()-t);}
  times.sort((a,b)=>a-b);const median=times[100];found.cpu=median;
  console.log(`   ${NAMES[car]}: ${median.toFixed(3)} ms por volta (mediana; ${times[0].toFixed(3)} a ${times[199].toFixed(3)} ms)`);
  assert.ok(median<1.5,`${median} ms`);
 }
});

for(const [car,w] of Object.entries(worst))console.log(`   ${NAMES[car]}: pior volta legítima (limite ${BUDGET} m/s somados): ${w.total[0].toFixed(2)} m/s (${w.total[1]}); motor ${w.push[0].toFixed(2)} (${w.push[1]}), curva ${w.turn[0].toFixed(2)} (${w.turn[1]}), freio ${w.brake[0].toFixed(2)}; mais rápida ${w.fastest[0].toFixed(2)} m/s (${w.fastest[1]}), máxima ${ENVELOPES[car].top} m/s`);
console.log(`${passed} grupos de verificações da dinâmica passaram.`);
