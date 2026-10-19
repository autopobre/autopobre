import {CIRCUITS} from './circuits.js';
import {cleanName} from './lap-records.js';
// Ghost lap ("fantasma", key G): the pilot's best lap on each circuit and mode, recorded while he
// drives and replayed as a see-through Opala over the race (ghost-car.js, main.js), to study the
// lap and try to beat it. A lap is sampled 20 times a second from the physics, between its 1/120 s
// steps: the model's origin, the body's three angles and how far along the track it is (the gap on
// the timing panel). Saved in this browser at about 40 kB a lap: centimetres and 1e-4 rad, stored
// as 16-bit steps from one sample to the next.
export const GHOST_KEY='autopobre-ghosts-v1';
export const GHOST_RATE=20;
// Laps kept in this browser (pilots × circuits × modes, the oldest saved goes first), and the
// longest lap worth a ghost: one left standing in the paddock for minutes is not. On a long circuit
// (Pampulha's 20.5 km take some 9 minutes) the longest grows with it: an average of 12 m/s (43 km/h,
// Interlagos' 4.3 km in 6 minutes), never past GHOST_LONGEST (what a saved lap may say it took).
export const GHOST_LIMIT=24,GHOST_MAX_TIME=360,GHOST_LONGEST=3600;
export const ghostMaxTime=length=>Math.min(GHOST_LONGEST,Math.max(GHOST_MAX_TIME,(length||0)/12));
// The room a lap takes: up to GHOST_SAMPLES samples (3 minutes at 20 a second, ~65 kB as text); a
// longer lap keeps fewer a second (thinGhost: 10, 5 or 4), never under GHOST_MIN_RATE. All the
// ghosts together stay under GHOST_BUDGET characters (the oldest go first): the browser's few MB
// are shared with the saves, the records and the settings.
export const GHOST_SAMPLES=3600,GHOST_MIN_RATE=4,GHOST_BUDGET=1200000;
// x, y, z (m), heading, pitch, roll (rad), track distance from the line (m). BOUND: the farthest a
// sample may be (100 km from the circuit's origin, 10 000 rad of turning); the circuits are a few km.
const FIELDS=7,SCALE=[100,100,100,1e4,1e4,1e4,100],BOUND=[1e5,1e5,1e5,1e4,1e4,1e4,1e5];
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const MODES=['normal','immersive'];

export class GhostRecorder {
 constructor(rate=GHOST_RATE){this.rate=rate;this.reset();}
 reset(){this.lapStart=null;this.values=[];this.last=null;this.next=0;this.clean=false;this.progress=null;this.maxTime=GHOST_MAX_TIME;}
 // The car now, continuous with the state before (angles and track distance unwrapped); the
 // first state of a lap measures from the line, negative still behind it on the grid.
 state(car){
  const p=car.pose(0),L=car.data.meta.reconstructed_xy_m,s=car.surface.s,v=this.last?.v;
  if(!v)return [p.x,p.y,p.z,car.heading,car.pitch,car.roll,s>L/2?s-L:s];
  return [p.x,p.y,p.z,v[3]+wrap(car.heading-v[3]),v[4]+wrap(car.pitch-v[4]),v[5]+wrap(car.roll-v[5]),v[6]+(((s-v[6]+L/2)%L)+L)%L-L/2];
 }
 // After each physics step. driving: the pilot drives this step (not the recon lap's autopilot,
 // nor the coast after the flag). Returns the lap just completed when it counts and the pilot
 // drove all its time ({time, rate, values}), else null: steps with the clock stopped (the 3-2-1,
 // the story's paddock) do not matter, and the step onto the line is his even when the flag it
 // brings ends the driving. A car put back on the grid (clock run back) or a crossing taken back
 // (multiplayer) starts the recording over.
 step(car,driving=true){
  const t=car.clock-car.lapStart;
  if(car.lapStart!==this.lapStart||!this.last||t<this.last.t-1e-9){
   const crossed=!!this.last&&car.lapStart>this.lapStart&&car.lastLapValid===true&&!car.lastLapFell&&Math.abs(car.lastLap-(car.lapStart-this.lapStart))<1e-6;
   const lap=crossed?this.finish(car,car.lastLap):null;
   this.begin(car,t);return lap;
  }
  if(!driving&&t>this.last.t||t>this.maxTime)this.clean=false;
  this.advance(t,this.state(car),t+1e-9);return null;
 }
 // A lap is recorded from its first instant: a crossing starts one at 0; a car put back at rest
 // between two frames is seen one step later, still where it stood. The steps that follow say
 // whether the pilot drove it.
 begin(car,t){
  this.lapStart=car.lapStart;this.values=[];this.last=null;this.next=1;this.maxTime=ghostMaxTime(car.data.meta.reconstructed_xy_m);
  const v=this.state(car);this.clean=t<1/120+1e-6;if(this.clean)this.values.push(...v);
  this.last={t,v};this.progress=v[6];
 }
 // Samples due up to `until`, between the last state and this one.
 advance(t,v,until){
  const a=this.last;
  if(this.clean)for(;this.next/this.rate<until;this.next++){const u=t>a.t?(this.next/this.rate-a.t)/(t-a.t):1;for(let f=0;f<FIELDS;f++)this.values.push(a.v[f]+(v[f]-a.v[f])*u);}
  this.last={t,v};this.progress=v[6];
 }
 // The line: the samples before it, then the state on it, at the lap's own time.
 finish(car,time){
  if(time>this.maxTime)this.clean=false;
  const v=this.state(car);this.advance(time,v,time-1e-9);
  if(!this.clean)return null;
  this.values.push(...v);return {time,rate:this.rate,values:Float64Array.from(this.values)};
 }
}

// Sample k is taken k/rate seconds into the lap; the last one on the line, at the lap's time. Between
// two samples the pose runs on a cubic (Hermite, its slopes from the neighbours either side, by time):
// a long lap kept at 4 or 5 samples a second (8 m apart at speed) still rounds its corners.
export class GhostLap {
 constructor({time,rate,values}){
  this.time=time;this.rate=rate;this.values=values;this.n=values.length/FIELDS;
  // The farthest along the track up to each sample: a spin or a stretch in reverse never takes the gap back.
  this.reach=new Float64Array(this.n);let far=-Infinity;for(let k=0;k<this.n;k++)this.reach[k]=far=Math.max(far,values[k*FIELDS+6]);
 }
 sampleTime(k){return k>=this.n-1?this.time:k/this.rate;}
 // Where the lap was t seconds in: {x, y, z} of the model's origin (physics frame, z up), the body's
 // heading, pitch and roll, and its distance from the line. Before 0 it waits at the start, after
 // the line it stays there.
 poseAt(t,out={}){
  const n=this.n,v=this.values;let k=0,u=0;
  if(t>=this.time){k=n-2;u=1;}
  else if(t>0){k=Math.min(n-2,Math.floor(t*this.rate));const t0=k/this.rate,t1=this.sampleTime(k+1);u=t1>t0?Math.min(1,(t-t0)/(t1-t0)):1;}
  const a=k*FIELDS,b=a+FIELDS,pa=k>0?a-FIELDS:a,pb=k+2<n?b+FIELDS:b,t0=this.sampleTime(k),t1=this.sampleTime(k+1),h=t1-t0;
  const ta=this.sampleTime(Math.max(0,k-1)),tb=this.sampleTime(Math.min(n-1,k+2)),u2=u*u,u3=u2*u;
  const h00=2*u3-3*u2+1,h01=3*u2-2*u3,h10=(u3-2*u2+u)*h,h11=(u3-u2)*h;
  const curve=f=>h00*v[a+f]+h01*v[b+f]+h10*(v[b+f]-v[pa+f])/((t1-ta)||1)+h11*(v[pb+f]-v[a+f])/((tb-t0)||1);
  // (The distance along the track stays straight between samples, as timeAt reads it.)
  out.x=curve(0);out.y=curve(1);out.z=curve(2);out.heading=curve(3);out.pitch=curve(4);out.roll=curve(5);out.progress=v[a+6]+(v[b+6]-v[a+6])*u;return out;
 }
 // When the lap got this far from the line (metres): the gap is the time now minus this.
 timeAt(progress){
  const r=this.reach,n=this.n;if(!(progress>r[0]))return 0;if(progress>=r[n-1])return this.time;
  let lo=0,hi=n-1;while(hi-lo>1){const m=(lo+hi)>>1;if(r[m]>=progress)hi=m;else lo=m;}
  const t0=this.sampleTime(lo),t1=this.sampleTime(hi),span=r[hi]-r[lo];return t0+(t1-t0)*(span>0?(progress-r[lo])/span:1);
 }
}

function toBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=0x8000)text+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(text);}
function fromBase64(text){const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
// A lap with every d-th sample (d divides its rate) and the one on the line: the same lap at rate/d.
export function thinGhost(lap,d){
 const n=lap.values.length/FIELDS;if(!(d>1))return lap;
 const keep=[];for(let k=0;k<=n-2;k+=d)keep.push(k);keep.push(n-1);
 const values=new Float64Array(keep.length*FIELDS);keep.forEach((k,j)=>{for(let f=0;f<FIELDS;f++)values[j*FIELDS+f]=lap.values[k*FIELDS+f];});
 return {time:lap.time,rate:lap.rate/d,values};
}
// The lap as saved: within `samples` (thinned by the smallest divisor of its rate that brings it there,
// none past GHOST_MIN_RATE a second; a short lap as recorded). null when a step does not fit 16 bits
// (the car moved more than 327 m between two samples: never driven), at that rate and every rate over it.
export function encodeGhost(lap,samples=GHOST_SAMPLES){
 const n=lap.values.length/FIELDS;if(!Number.isInteger(n)||n<2||!(lap.time>0)||!Number.isInteger(lap.rate))return null;
 const ds=[1,2,4,5,10].filter(d=>d===1||lap.rate%d===0&&lap.rate/d>=GHOST_MIN_RATE);
 let i=ds.findIndex(d=>Math.floor((n-2)/d)+2<=samples);if(i<0)i=ds.length-1;
 for(;i>=0;i--){const packed=packGhost(thinGhost(lap,ds[i]));if(packed)return packed;}
 return null;
}
function packGhost(lap){
 const n=lap.values.length/FIELDS;
 const q=Array.from(lap.values,(v,i)=>Math.round(v*SCALE[i%FIELDS]));if(!q.every(Number.isSafeInteger))return null;
 const bytes=new Uint8Array((n-1)*FIELDS*2),view=new DataView(bytes.buffer);
 for(let i=FIELDS;i<q.length;i++){const d=q[i]-q[i-FIELDS];if(d<-32768||d>32767)return null;view.setInt16((i-FIELDS)*2,d,true);}
 return {v:1,time:lap.time,rate:lap.rate,n,start:q.slice(0,FIELDS),data:toBase64(bytes)};
}
// A saved lap is read as anyone's (it could come from another browser one day): the sizes are checked
// before the data is unpacked, only numbers within BOUND come out, and anything else is no lap.
export function decodeGhost(entry){
 try{
  const {v,time,rate,n,start,data}=entry??{};
  if(v!==1||!Number.isInteger(rate)||rate<1||rate>120||!Number.isInteger(n)||n<2||!(time>0&&time<=GHOST_LONGEST)||(n-2)/rate>=time+1e-6||time>(n-1)/rate+1e-6)return null;
  if(!Array.isArray(start)||start.length!==FIELDS||!start.every(Number.isSafeInteger)||typeof data!=='string')return null;
  const size=(n-1)*FIELDS*2;if(data.length!==4*Math.ceil(size/3))return null;
  const bytes=fromBase64(data);if(bytes.length!==size)return null;
  const view=new DataView(bytes.buffer),q=[...start],values=new Float64Array(n*FIELDS);
  for(let i=0;i<n*FIELDS;i++){const f=i%FIELDS;if(i>=FIELDS)q[f]+=view.getInt16((i-FIELDS)*2,true);values[i]=q[f]/SCALE[f];if(!(Math.abs(values[i])<=BOUND[f]))return null;}
  return new GhostLap({time,rate,values});
 }catch{return null;}
}

// The saved laps: one per pilot (any case), circuit, mode and car (the Opala's laps were saved before the Fusca
// had mechanics of its own: a lap without a car is an Opala's).
const pilotKey=name=>cleanName(name).toLocaleLowerCase('pt-BR');
export const GHOST_CARS=Object.freeze(['opala','fusca']);
const carOf=g=>g.car??'opala';
const sameGhost=(g,key)=>g.circuit===key.circuit&&g.mode===key.mode&&carOf(g)===carOf(key)&&pilotKey(g.pilot)===pilotKey(key.pilot);
export function readGhosts(storage){
 try{const list=JSON.parse(storage?.getItem(GHOST_KEY)||'[]');return Array.isArray(list)?list.filter(g=>g&&typeof g==='object'&&Object.hasOwn(CIRCUITS,g.circuit)&&MODES.includes(g.mode)&&GHOST_CARS.includes(carOf(g))&&typeof g.pilot==='string'&&!!cleanName(g.pilot)&&Number.isFinite(g.time)&&typeof g.data==='string'):[];}
 catch{return [];}
}
// The pilot's ghost here, ready to replay (null: none saved, or unreadable). Its name comes out
// cleaned and its date a string; both are text, for textContent only.
export function loadGhost(storage,key){
 const entry=readGhosts(storage).find(g=>sameGhost(g,key)),lap=entry?decodeGhost(entry):null;
 return lap?Object.assign(lap,{pilot:cleanName(entry.pilot),date:typeof entry.date==='string'?entry.date:''}):null;
}
// Keeps the lap when it is the pilot's first here or beats his ghost. The newest GHOST_LIMIT laps
// stay, within GHOST_BUDGET characters; when the browser's storage is full the oldest go first, until
// it fits. Returns the saved entry, or null (slower, not storable, or no room even alone).
export function saveGhost(storage,{circuit,mode,car='opala',pilot,lap},now=new Date()){
 const name=cleanName(pilot);if(!storage||!name||!Object.hasOwn(CIRCUITS,circuit)||!MODES.includes(mode)||!GHOST_CARS.includes(car))return null;
 const key={circuit,mode,car,pilot:name},list=readGhosts(storage),old=list.find(g=>sameGhost(g,key));
 if(old&&lap.time>=old.time&&decodeGhost(old))return null;
 const encoded=encodeGhost(lap);if(!encoded)return null;
 const entry={circuit,mode,car,pilot:name,date:now.toISOString(),...encoded};
 let others=list.filter(g=>g!==old).sort((a,b)=>String(b.date??'').localeCompare(String(a.date??''))).slice(0,GHOST_LIMIT-1);
 let size=JSON.stringify(entry).length+2;others=others.filter(g=>(size+=JSON.stringify(g).length+1)<=GHOST_BUDGET);
 for(;;){
  try{storage.setItem(GHOST_KEY,JSON.stringify([entry,...others]));return entry;}
  catch{if(!others.length)return null;others=others.slice(0,-1);}
 }
}
