// Kerbs as the wheels feel them (kerb-contact.js): on every circuit, both sides, the strips the
// game draws are the strips detected under a wheel; the asphalt inside and the grass beyond are not;
// car.kerbRide rises fast and dies away smoothly, reset and pause behave; the gravel noise and the
// dirt cloud leave kerbs alone.
//   node scripts/testar_zebras.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestCar,SUSPENSION_WHEELS} from '../teste/physics.js';
import {createCurbs} from '../teste/track-surface.js';
import {createCurveloData} from '../teste/curvelo-data.js';
import {kerbSegment,surfaceKind,rideKerbs,kerbSound,KERB_WIDTH,RIDGE_SPACING} from '../teste/kerb-contact.js';
import {SoundEffects} from '../teste/sound-effects.js';

const load=id=>{
 if(id==='curvelo')return createCurveloData();
 const data=JSON.parse(readFileSync(new URL(`../dados/${id==='interlagos'?'pista':'pista_'+id}.json`,import.meta.url)));data.meta.id=id;return data;
};
const report={};
for(const id of ['interlagos','curvelo','cascavel','piracicaba','chapeco','brasilia','goiania','chapada','floripa','minhocao']){
 const data=load(id),a=data.samples,n=a.length,car=new TestCar(data),out={};
 // The detector and the drawn strips agree segment for segment (createCurbs: 6 vertices x 2 faces x 3 per segment).
 const curbs=createCurbs(data);
 for(const side of [-1,1]){
  const mesh=curbs.getObjectByName(side<0?'Zebra_direita':'Zebra_esquerda'),drawn=mesh.geometry.attributes.position.count/12;
  let flagged=0;for(let i=0;i<n;i++)flagged+=kerbSegment(data,i,side);
  assert.equal(flagged,drawn,`${id} ${side}: detected kerb segments match the drawn strips`);
  assert(flagged>0,`${id} ${side}: some kerb on this side`);
  out[side<0?'right':'left']=flagged;
 }
 mesh_dispose(curbs);
 // Mid-segment probes across the edge, every few stations, both sides.
 let probes=0,kerbs=0;
 for(let i=0;i<n;i+=3){
  const p=a[i],q=a[(i+1)%n];
  for(const side of [-1,1]){
   // The segment the point falls on decides (on the inside of a bend it can be the next one).
   const kind=off=>{const w=(p[4]+q[4])/4,mx=(p[1]+q[1])/2,my=(p[2]+q[2])/2,lx=(p[9]+q[9])/2,ly=(p[10]+q[10])/2,d=side*(w+off),s=car.sample(mx+lx*d,my+ly*d,i);return [surfaceKind(data,s),s.i];};
   const [inside]=kind(-.35),[crown,at]=kind(.5),[beyond]=kind(KERB_WIDTH+.6),flag=kerbSegment(data,at,side);
   assert.equal(inside,'road',`${id} s=${p[0]} ${side}: asphalt inside the edge`);
   // The pit lane can sit just past the edge (its own surface counts as road).
   if(crown!=='road')assert.equal(crown,flag?'kerb':'dirt',`${id} s=${p[0]} ${side}: the kerb's crown`);
   if(beyond!=='road')assert.equal(beyond,'dirt',`${id} s=${p[0]} ${side}: grass past the kerb`);
   probes++;kerbs+=crown==='kerb';
  }
 }
 if(id==='curvelo'){
  // No kerb columns: kerbs all round, but not across the pit lane's mouth on the left.
  assert.equal(a[0].length,11);assert.equal(out.right,n);assert(out.left<n&&out.left>n*.8,'Curvelo leaves its pit entry and exit open');
 }
 out.probes=probes;out.kerbProbes=kerbs;report[id]=out;
}
function mesh_dispose(root){root.traverse(o=>{o.geometry?.dispose();});}

// --- The ride: Interlagos, a long kerb run, the car straddling it at 30 m/s.
const data=load('interlagos'),a=data.samples,n=a.length;
let run=null;
for(const side of [1,-1])for(let i=0;i<n&&!run;i++){let k=0;while(k<14&&kerbSegment(data,i+k,side))k++;if(k===14)run={i:i+7,side};}
assert(run,'a 28 m kerb run exists');
const car=new TestCar(data);
const place=(d,speed)=>{const p=a[run.i];car.reset(run.i);car.x=p[1]+p[9]*d;car.y=p[2]+p[10]*d;car.heading=Math.atan2(p[8],p[7]);car.vx=Math.cos(car.heading)*speed;car.vy=Math.sin(car.heading)*speed;car.index=run.i;car.surface=car.sample(car.x,car.y);};
const halfTrack=Math.abs(SUSPENSION_WHEELS[0].y),edge=a[run.i][4]/2;
// One side's wheels on the kerb's crown, the others on the asphalt.
place(run.side*(edge+.5-halfTrack),30);rideKerbs(car,1);
assert.equal(car.kerbRide,0,'a reset starts from rest');assert.equal(car.kerbWheels,2);assert.equal(Math.sign(car.kerbTilt),run.side,'the kerb side sits up');
const rise=[];for(let k=0;k<30;k++){rideKerbs(car,1/60);rise.push(car.kerbRide);}
assert(rise[3]>.5&&rise[14]>.95&&rise.every((v,k)=>!k||v>=rise[k-1]),'the ridges bite within a few frames');
assert(Math.abs(car.kerbHz-30/RIDGE_SPACING)<1e-9&&Math.sign(car.kerbPan)===-run.side,'rumble rate and side');
const sound=kerbSound(car);assert(sound.level>.95&&sound.hz===75&&sound.dirt===0&&!sound.centre,'the rumble loop settings');
const held=car.kerbRide;rideKerbs(car,0);assert.equal(car.kerbRide,held,'paused: nothing moves');
// Back on the asphalt: it fades over a fraction of a second.
place(0,30);const fall=[];for(let k=0;k<60;k++){rideKerbs(car,1/60);fall.push(car.kerbRide);}
assert(fall[0]>.8&&fall[0]<held&&fall[20]<.15&&fall[59]<.002,'fades out smoothly');
// Slowly over the kerb: tilted but barely buzzing; all four wheels: still at most 1.
place(run.side*(edge+.5-halfTrack),.5);for(let k=0;k<60;k++)rideKerbs(car,1/60);
assert(car.kerbRide<.01&&Math.abs(car.kerbTilt)>.9,'at walking pace the kerb tilts the car but does not rumble');
// Body centre over the crown: the kerb (1.05 m) is narrower than the track (1.61 m), so the
// inner wheels stay on the asphalt and the outer ones drop on the grass (dirt share .5, no ridges).
place(run.side*(edge+.5),35);for(let k=0;k<30;k++)rideKerbs(car,1/60);
assert(car.kerbCentre&&car.kerbWheels===0&&car.kerbRide<.01&&car.kerbDirt===.5,'straddling the kerb');
// The outer wheels just past it, the inner ones on its crown.
place(run.side*(edge+.35+halfTrack),35);for(let k=0;k<30;k++)rideKerbs(car,1/60);
assert(car.kerbWheels===2&&car.kerbDirt===.5&&car.kerbRide>.95,'half on the kerb, half on the grass');
// A wheel in the air feels nothing.
place(run.side*(edge+.5-halfTrack),30);car.wheelLoad=[0,0,0,0];rideKerbs(car,1/60);assert.equal(car.kerbWheels,0,'airborne wheels');

// --- The sound rack: kerb loop at the ridge rate on its side; gravel only with wheels on dirt.
const param=()=>({value:0,setTargetAtTime(v){this.value=v;},cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
const node=()=>({connect(){},disconnect(){},start(){},stop(){},gain:param(),frequency:param(),Q:param(),pan:param(),type:''});
const ctx={currentTime:1,createBufferSource:node,createOscillator:node,createBiquadFilter:node,createGain:node,createStereoPanner:node,createWaveShaper:node};
globalThis.fetch??=()=>Promise.reject(new Error('offline'));
const fx=new SoundEffects(ctx,node(),node(),{});
fx.update({driving:true,speed:30,onRoad:false,kerb:{level:1,pan:-.75,hz:75,dirt:0,centre:true},windSweep:true,camera:'chase'});
assert(fx.levels.kerb>.08&&fx.levels.gravel===0,'kerb rumble, no gravel on the kerb');
assert(fx.loops.kerb.source.frequency.value===75&&fx.loops.kerb.pan.pan.value===-.75,'pitch and side');
const wind30=fx.loops.wind.filter.frequency.value;
fx.update({driving:true,speed:55,onRoad:false,kerb:{level:0,pan:0,hz:137,dirt:.75,centre:false},windSweep:true,camera:'chase'});
assert(fx.levels.kerb===0&&fx.levels.gravel>.1,'wheels on the grass: gravel');
assert(fx.loops.wind.filter.frequency.value>wind30&&wind30>1000,'the wind brightens with speed');
fx.update({driving:true,speed:20,onRoad:false,camera:'chase'});assert(fx.levels.gravel>0,'without wheel data the old rule holds');
fx.update({driving:true,speed:0,onRoad:true,windSweep:true,camera:'chase'});assert.equal(fx.loops.wind.filter.frequency.value,650,'standing still: the old 650 Hz hiss');
// 'Sensação de velocidade' Desligada: the old fixed hiss at any speed.
fx.update({driving:true,speed:55,onRoad:true,windSweep:false,camera:'chase'});assert.equal(fx.loops.wind.filter.frequency.value,650,'no sweep when switched off');

console.log(JSON.stringify(report));
console.log('zebras: ok');
