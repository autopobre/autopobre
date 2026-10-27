// The most each car of the online records can do, for their dynamics check (src/dinamica.js): its engine's push at
// each speed, its top speed, its brakes and its tyres, worked out by the game's own code. The engine comes from the
// exported curves; everything else from runs of the game's own car (TestCar, with the car's body and mechanics) on a
// flat endless plane, at the best a legit player's car can be: dry asphalt (rain only lowers the grip), the parts as
// new (wear only lowers them), a rival's tow, and for the Opala the story's new engine parts (the only upgrade that
// touches the physics; the Fusca never races in the story: main.js races the story in the Opala). The garage has no
// tyres or setups to choose and the kerbs grip as the asphalt does, so each car's own tyres are the best there are.
// Run after a car's physics, the slipstream or a circuit's relief changes: node gerar_envelope.mjs (writes
// src/envelope.js; it stops when a run of a car goes past what it writes).
import fs from 'node:fs';
import {TestCar,engineTorque,OPALA_BODY,FUSCA_BODY,IDLE_RPM,REDLINE_RPM,CG_HEIGHT} from '../pista_interlagos/teste/physics.js';
import {RaceField} from '../pista_interlagos/teste/race-field.js';
import {fieldRoster} from '../pista_interlagos/teste/race-roster.js';
import {ENGINE_PARTS} from '../pista_interlagos/teste/story-career.js';
import {CIRCUITS} from '../pista_interlagos/teste/circuits.js';
import {createCurveloData} from '../pista_interlagos/teste/curvelo-data.js';
import {smoothVerges} from '../pista_interlagos/teste/track-verge.js';

const G=9.81,DT=1/120,STEP=.25,NONE={left:0,right:0,throttle:0,brake:0,reverse:0,handbrake:0};
// The track as the game races it (track-verge.js smoothVerges, main.js).
const load=id=>{const data=id==='curvelo'?createCurveloData():JSON.parse(fs.readFileSync(new URL(`../pista_interlagos/dados/${CIRCUITS[id].data??'pista.json'}`,import.meta.url)));data.meta.id=id;smoothVerges(data);return data;};
const interlagos=load('interlagos'),profiles=Object.keys(CIRCUITS).map(id=>[id,load(id).samples]);
const check=(ok,what)=>{if(!ok)throw new Error('gerar_envelope: '+what);};
const forward=c=>c.vx*Math.cos(c.heading)+c.vy*Math.sin(c.heading);
// The cars: their body (with its mechanics), and the engine scales a legit player's car can have (the story's parts).
const CARS={opala:{body:OPALA_BODY,powers:[1,ENGINE_PARTS]},fusca:{body:FUSCA_BODY,powers:[1]}};

function envelope(name,{body,powers}){
 const M=body.mechanics,parts=Math.max(...powers);
 // The car alone on a flat plane as wide as a field (no walls, no pit lane), heading +x, as testar_adversarios.mjs
 // does for the tow.
 const FLAT={i:0,u:0,s:500,d:0,z:0,width:1e4,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true,pit:false,pitS:null,pitD:null,abyss:false};
 const plane=({speed=0,power=1}={})=>{
  const c=new TestCar(interlagos).setBody(body);c.pitGeo=null;c.sample=()=>FLAT;c.reset();c.x=c.y=c.heading=0;c.engineScale=power;c.settle();
  if(speed){c.vx=speed;for(let k=0;k<240;k++)c.step({...NONE,throttle:.4},DT);}   // up to speed in its own gear
  return c;
 };
 // --- The engine: the best gear's push at each speed (physics.js engineTorque × rpm per km/h × torqueToAccel, the
 // clutch slipping at IDLE_RPM + 2600 in first, no drive at the rev limiter), with the parts.
 const top=REDLINE_RPM/M.gears[M.gears.length-1]/3.6;
 const engine=v=>{
  const kmh=v*3.6;let best=0;
  for(let g=1;g<M.gears.length;g++){const wheel=kmh*M.gears[g];if(wheel<REDLINE_RPM)best=Math.max(best,engineTorque(Math.max(wheel,g===1?IDLE_RPM+2600:IDLE_RPM),M.torque)*M.gears[g]*M.torqueToAccel);}
  return best;
 };
 const push=[];for(let v=0;v<top+STEP;v+=STEP)push.push(+(parts*engine(Math.min(v,top-1e-6))).toFixed(3));
 // Launches from rest, with each legit engine, the pedal anywhere from half to full: the push each gets (its speed
 // gained plus the air and the road) never passes the table; at low speed the rear tyres hold it to `traction` instead
 // (they hold less the harder they are pushed: a lighter pedal can put down more). Alone on the flat the car tops out
 // at `alone`: the limiter, or short of it where the air holds it back (the Fusca).
 const engineAt=v=>{const f=Math.min(v/STEP,push.length-1.001),j=Math.floor(f);return push[j]+(push[j+1]-push[j])*(f-j);};
 let traction=0,alone=0;
 for(const power of powers)for(const throttle of [.5,.6,.7,.8,.9,1]){
  const c=plane({power});
  for(let k=0;k<120*(throttle===1?60:6);k++){
   const v=forward(c);c.step({...NONE,throttle},DT);const p=(forward(c)-v)/DT+M.drag*v*v;
   check(p-.16<=engineAt(v)+.01,`${name}: a launch pushed ${p.toFixed(2)} m/s² at ${v.toFixed(1)} m/s, past the engine table`);
   if(v<15)traction=Math.max(traction,p-.16);
   alone=Math.max(alone,Math.hypot(c.vx,c.vy));
  }
 }
 check(alone<top+.02,`${name}: alone it reached ${alone} m/s, past the limiter's ${top}`);
 // --- The tow: the most a car right behind another of its kind gets off its drag (race-field.js slipstream, measured:
 // the player's car 4 m and a hair behind a rival, nose to tail, on Interlagos' main straight). In it the car tops out
 // at the limiter, no faster (the Fusca gets there only in a tow).
 let tow=0;
 {
  const roster=fieldRoster('99',name),f=new RaceField(interlagos,{seed:1,body,roster});f.reset(0,{entrants:[roster[0].number]});
  const r=f.rivals[0].car,c=new TestCar(interlagos).setBody(body);r.reset(400);c.reset(400);
  for(const gap of [4.001,4.5,6,10,20]){
   c.x=r.x-gap*Math.cos(r.heading);c.y=r.y-gap*Math.sin(r.heading);c.heading=r.heading;c.settle();
   for(const q of [r,c]){q.vx=30*Math.cos(q.heading);q.vy=30*Math.sin(q.heading);}
   f.step(c,DT,3);tow=Math.max(tow,c.draft);
  }
 }
 check(tow>.2&&tow<=.5,`${name}: the tow measured ${tow}`);
 {const c=plane({speed:top-2,power:parts});let v=0;for(let k=0;k<120*40;k++){c.draft=tow;c.step({...NONE,throttle:1},DT);v=Math.max(v,Math.hypot(c.vx,c.vy));}check(v<top+.02,`${name}: in a tow it reached ${v} m/s`);}
 // --- The road and the air: coasting in neutral (no engine braking) from near the top, the drag the mechanics give
 // and the rolling resistance left over.
 let rolling=0;
 {const c=plane({speed:top-10});for(let k=0;k<120*3;k++){const v=forward(c);c.step({...NONE,gear:0},DT);if(k>12)rolling=Math.max(rolling,(v-forward(c))/DT-M.drag*v*v);}}
 check(rolling>0&&rolling<.5,`${name}: rolling ${rolling}`);
 // --- The brakes: full pedal from near the limiter in fifth, the most it slows less the air (brakes, the road and the
 // engine holding it at high revs).
 let brake=0;
 {const c=plane({speed:top-.5});for(let k=0;k<120*6&&forward(c)>3;k++){const v=forward(c);c.step({...NONE,brake:1},DT);brake=Math.max(brake,(v-forward(c))/DT-M.drag*v*v);}}
 check(brake>8&&brake<14,`${name}: brake ${brake}`);
 // --- The tyres: a skidpad at full lock, the throttle holding each speed the car makes, on dry asphalt and new parts:
 // the steadiest sideways acceleration over the last seconds (in g: the friction the tyres give for the load on them),
 // and how far the body leans out for each m/s² of it (the ghost's roll is the road's bank less that lean).
 let grip=0,lean=0;
 for(const speed of [12,18,25,32,40,48,55].filter(s=>s<alone-2)){
  const c=plane({speed});let lat=0,roll=0,count=0;
  for(let k=0;k<120*8;k++){
   const v=Math.hypot(c.vx,c.vy),err=speed-v;
   c.step({...NONE,left:1,throttle:Math.max(0,Math.min(1,err*.8+.3)),brake:Math.max(0,Math.min(1,-err*.5))},DT);
   if(k>=120*5){lat+=Math.abs(c.latAccel);roll+=Math.abs(c.roll);count++;}
  }
  grip=Math.max(grip,lat/count/G);lean=Math.max(lean,roll/lat);
 }
 check(grip>.9&&grip<1.5,`${name}: grip ${grip}`);
 // --- Past the limiter only a descent takes the car, coasting (no drive past the rev limit), in a tow: on each circuit,
 // every stretch of its centre line entered at the limiter, the speed the slope gives against the air and the road.
 // The steepest of them sets that circuit's top.
 const tops={};
 for(const [id,a] of profiles){
  const n=a.length;let v=top,best=top;
  for(let pass=0;pass<2;pass++)for(let i=0;i<n;i++){
   const p=a[i],q=a[(i+1)%n],ds=Math.hypot(q[1]-p[1],q[2]-p[2]),slope=(q[3]-p[3])/Math.max(ds,1e-6);
   v=Math.max(top,Math.sqrt(Math.max(0,v*v+2*ds*(-G*slope-M.drag*(1-tow)*v*v-rolling))));best=Math.max(best,v);
  }
  tops[id]=+best.toFixed(3);
 }
 const r3=x=>+x.toFixed(3),r5=x=>+x.toPrecision(4);
 return {g:G,cg:CG_HEIGHT,step:STEP,push,parts,traction:r3(traction),top:r3(top),alone:r3(alone),tops,tow:r5(tow),drag:r5(M.drag),rolling:r3(rolling),brake:r3(brake),grip:r3(grip),lean:r5(lean)};
}

const ENVELOPES=Object.fromEntries(Object.entries(CARS).map(([name,car])=>[name,envelope(name,car)]));
const text=`// Written by gerar_envelope.mjs: the most a legit player's car can do, per car (src/dinamica.js holds the margins).
// g, cg: gravity and the centre of mass's height over the model's origin (physics.js CG_HEIGHT: one rigid body for both
//   cars, the Fusca's lightness is in its mechanics' numbers per kilogram), m.
// push: m/s² the engine gives at each \`step\` m/s of speed, from 0 to the limiter: the best gear's torque (physics.js
//   engineTorque with the car's mechanics, OPALA_MECHANICS or FUSCA_MECHANICS: gears, torque curve and torqueToAccel,
//   the clutch slipping in first), times \`parts\`: the Opala's story engine parts (story-career.js ENGINE_PARTS,
//   ${ENGINE_PARTS}), 1 for the Fusca (never in the story). A full-throttle launch of the game's car never passes it.
// traction: m/s² the rear tyres put down from rest, below the engine's push there (launches, measured).
// top: m/s at the rev limiter in fifth (REDLINE_RPM over the car's rpm per km/h); alone: m/s it tops out at on the flat
//   with no tow (measured: the Opala at the limiter, the Fusca where its air holds it back); in a tow both reach the
//   limiter and no more (measured).
// tops: m/s on each circuit, past the limiter coasting down its steepest stretches in a tow (its centre line's relief).
// tow: the share of its drag a car right behind another loses (race-field.js slipstream, measured nose to tail).
// drag: m/s² per (m/s)² of the air (the mechanics' drag); rolling: m/s² of the road (coasting in neutral, measured).
// brake: m/s² the brakes, the road and the engine take off at most, less the air (full pedal from the limiter).
// grip: the tyres' sideways force over the load on them, steady at full lock on a skidpad (dry, new parts), in g
//   (the Fusca's tyres grip 5% more: FUSCA_MECHANICS grip).
// lean: rad the body leans out per m/s² of sideways acceleration on that skidpad.
export const ENVELOPES=${JSON.stringify(ENVELOPES)};
`;
fs.writeFileSync(new URL('./src/envelope.js',import.meta.url),text);
for(const [name,e] of Object.entries(ENVELOPES))console.log(name,{...e,push:`${e.push.length} values, ${e.push[0]} … ${e.push.at(-1)} m/s²`});
