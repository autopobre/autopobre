// The driving line (Linha ideal, key O): the way round a circuit the player is shown on the asphalt, and what to do
// with the pedals along it (driving-line-view.js draws it). The racing schools' rules, worked out for the car instead of
// written in: use the whole road, outside-inside-outside (the rivals' racing line, race-field.js racingLine, the bends
// as open as the asphalt allows); then the lap time, with the car's own engine, tyres and brakes, moves it wherever that
// pays (laying): at Interlagos the slow corners come out on wider arcs, faster at their slowest point and out onto the
// straights, every corner quicker; brake in a straight line and trail off as the wheel goes in (the friction ellipse),
// back on the throttle as the wheel unwinds. Pure: no three.js, checked in Node (testar_linha_ideal.mjs).
import {racingLine,forkRoutes} from './race-field.js';
import {OPALA_MECHANICS,engineTorque,IDLE_RPM,REDLINE_RPM,clamp} from './physics.js';
const G=9.81,ROLLING=.16,TOP=95;
// The tyres the line is laid for (m/s², an Opala on dry asphalt): about what the ace corners and brakes with
// (race-field.js ACE_STYLE). A car's own tyres (mechanics.grip) scale them.
export const LINE_GRIP=11,LINE_BRAKING=10.2;
// What the colours ask of the player: a little under the line's limit, the brakes a little early (a foot takes a
// moment to get to the full pedal; the keyboard's brake is all or nothing). Rain scales both (weatherGrip).
export const GUIDE_GRIP=.95*LINE_GRIP,GUIDE_BRAKING=.88*LINE_BRAKING;
// The engine's push at a speed (m/s): its best gear's torque, a little lost to the shifts.
function engineAccel(m){
 const step=.25,count=Math.ceil(TOP/step)+1,table=new Float64Array(count+1);
 for(let j=0;j<=count;j++){const kmh=j*step*3.6;let best=0;for(let g=1;g<m.gears.length;g++){const rpm=Math.max(kmh*m.gears[g],g===1?IDLE_RPM+2600:IDLE_RPM);if(rpm<=REDLINE_RPM)best=Math.max(best,engineTorque(rpm,m.torque)*m.gears[g]*m.torqueToAccel);}table[j]=best*.97;}
 return v=>{const f=clamp(v/step,0,count-1e-9),j=f|0;return table[j]+(table[j+1]-table[j])*(f-j);};
}
// A lap's speeds on a line (quasi-steady: each station at the speed its bend allows, braking for the ones ahead and
// accelerating out of the ones behind, the tyres shared between the two on the friction ellipse). The arrays live in
// a state (track) so a change round a few stations can be tried in place and taken back (laying's trials).
// Per station k: the line's point (px, py), its bend (kap: 20 m chords, lightly averaged, as racingLine's), the
// way to the next station (len), the tyres' sideways grip there with the banking (lat), the bend's speed (vc), the
// fastest speed that still makes every bend ahead (vb) and the lap's speed (v); seg: the time from k to k+1.
function track(data,off,{grip,braking,mechanics}){
 const a=data.samples,n=a.length,f=()=>new Float64Array(n),T={n,a,off:Float64Array.from(off),px:f(),py:f(),raw:f(),kap:f(),len:f(),lat:f(),vc:f(),vb:f(),v:f(),seg:f(),grip,braking,
  drag:mechanics.drag,engine:engineAccel(mechanics),traction:1.24*G*(mechanics.rearShare+.04)*1.04*grip/LINE_GRIP,time:0};
 T.arrays=[T.off,T.px,T.py,T.raw,T.kap,T.len,T.lat,T.vc,T.vb,T.v,T.seg];
 return T;
}
const at=(T,k)=>(k%T.n+T.n)%T.n;
function point(T,i,set){const p=T.a[i];set(1,i,p[1]+p[9]*T.off[i]);set(2,i,p[2]+p[10]*T.off[i]);}
function bend(T,i,set){
 const m=at(T,i-5),p=at(T,i+5),X=T.px,Y=T.py,ax=X[i]-X[m],ay=Y[i]-Y[m],bx=X[p]-X[i],by=Y[p]-Y[i];
 set(3,i,2*(ax*by-ay*bx)/(Math.hypot(ax,ay)*Math.hypot(bx,by)*Math.hypot(X[p]-X[m],Y[p]-Y[m])));
}
function corner(T,i,set){
 let sum=0;for(let j=-3;j<=3;j++)sum+=T.raw[at(T,i+j)];const kap=sum/7;set(4,i,kap);
 const lat=Math.max(2,T.grip-G*Math.sign(kap)*T.a[i][5]);set(6,i,lat);set(7,i,Math.min(TOP,Math.sqrt(lat/Math.max(Math.abs(kap),1e-5))));
}
function stretch(T,i,set){const j=at(T,i+1);set(5,i,Math.hypot(T.px[j]-T.px[i],T.py[j]-T.py[i]));}
// The speed at k from which the brakes still make vb at k+1; the speed at k+1 from v at k under full throttle.
function braked(T,k,next){const use=Math.min(1,next*next*Math.abs(T.kap[k])/T.lat[k]),dec=T.braking*Math.sqrt(1-use*use)+T.drag*next*next+ROLLING+G*T.a[k][6];return Math.min(T.vc[k],Math.sqrt(Math.max(0,next*next+2*T.len[k]*dec)));}
function driven(T,k,u){const use=Math.min(1,u*u*Math.abs(T.kap[k])/T.lat[k]),acc=Math.min(T.engine(u),T.traction)*Math.sqrt(1-use*use)-T.drag*u*u-ROLLING-G*T.a[k][6];return Math.min(T.vb[at(T,k+1)],Math.sqrt(Math.max(1,u*u+2*T.len[k]*acc)));}
// The whole lap: the bends, then twice round backwards (the brakes) and forwards from the slowest point (the engine).
function solve(T){
 const n=T.n,put=(k,i,v)=>{T.arrays[k][i]=v;};
 for(let i=0;i<n;i++)point(T,i,put);for(let i=0;i<n;i++)bend(T,i,put);for(let i=0;i<n;i++){corner(T,i,put);stretch(T,i,put);}
 T.vb.set(T.vc);for(let r=0;r<2;r++)for(let k=n-1;k>=0;k--)T.vb[k]=braked(T,k,T.vb[at(T,k+1)]);
 let slow=0;for(let k=1;k<n;k++)if(T.vb[k]<T.vb[slow])slow=k;
 T.v.set(T.vb);for(let r=0;r<2;r++)for(let t=0;t<n;t++){const k=at(T,slow+t);T.v[at(T,k+1)]=driven(T,k,T.v[k]);}
 T.time=0;for(let k=0;k<n;k++){T.seg[k]=2*T.len[k]/(T.v[k]+T.v[at(T,k+1)]);T.time+=T.seg[k];}
 return T.time;
}
// One trial: the line moved by amp metres round station c (a raised cosine w stations either side, kept within lo..hi),
// the bends, brakes and speeds worked out again only as far as they change. Returns the lap time it gains (negative:
// faster); log keeps the old values to take it back (undo).
function trial(T,c,w,amp,lo,hi,log){
 log.length=0;const set=(k,i,v)=>{const A=T.arrays[k];if(A[i]!==v){log.push(k,i,A[i]);A[i]=v;}};
 let moved=false;
 for(let j=-w;j<=w;j++){const i=at(T,c+j),o=clamp(T.off[i]+amp*.5*(1+Math.cos(Math.PI*j/w)),lo[i],hi[i]);if(o!==T.off[i]){set(0,i,o);moved=true;}}
 if(!moved)return 0;
 for(let j=-w;j<=w;j++)point(T,at(T,c+j),set);
 for(let j=-w-5;j<=w+5;j++)bend(T,at(T,c+j),set);
 for(let j=-w-8;j<=w+8;j++)corner(T,at(T,c+j),set);
 for(let j=-w-1;j<=w;j++)stretch(T,at(T,c+j),set);
 // Brakes: back from past the change until a station's speed is as it was; then the engine from there on.
 const R0=c-w-9,R1=c+w+8,near=(x,y)=>Math.abs(x-y)<=1e-9*Math.max(1,y);let k=R1;
 for(let count=0;count<T.n;count++,k--){const i=at(T,k),vb=braked(T,i,T.vb[at(T,i+1)]);if(k<R0&&near(vb,T.vb[i]))break;set(8,i,vb);}
 const F=Math.min(k+1,R0);k=F;
 for(let count=0;count<T.n;count++,k++){const i=at(T,k),v=driven(T,at(T,k-1),T.v[at(T,k-1)]);if(k>R1&&near(v,T.v[i]))break;set(9,i,v);}
 let gain=0;for(let s=F-1;s<k;s++){const i=at(T,s),t=2*T.len[i]/(T.v[i]+T.v[at(T,i+1)]);gain+=t-T.seg[i];set(10,i,t);}
 return gain;
}
function undo(T,log){for(let j=log.length-3;j>=0;j-=3)T.arrays[log[j]][log[j+1]]=log[j+2];log.length=0;}
// Bumps from 60 m long down to 16 m, each a little smaller, every station a third of a bump apart, twice over (about
// nine tenths of what finer and longer passes gain, for two thirds of the work).
const PASSES=Object.freeze([[30,.8],[15,.4],[8,.2]]);
// A circuit's driving line for a car (mechanics): the rivals' racing line (on a track with branch roads the lap's own
// way, forkRoutes) laid again for the lap time, its offsets kept within the line's bounds (the car body on the asphalt,
// off the pit wall). Once per circuit and car. off: offsets to the left of the centre line per station; x, y: the line;
// time: the lap the line's own model gives (minCurvature: on the rivals' line). A few tenths of a second's work on a
// PC, over a second at Pampulha: the game lays it a slice at a time between frames (drivingLineSoon).
const lines=new WeakMap();
function* laying(data,mechanics){
 const base=data.branches?.length?forkRoutes(data).mainLine:racingLine(data),tyres=mechanics.grip??1;
 const T=track(data,base.off,{grip:LINE_GRIP*tyres,braking:LINE_BRAKING*tyres,mechanics}),minCurvature=solve(T),log=[];
 for(const [w,amp] of PASSES)for(let pass=0;pass<2;pass++)for(let c=0;c<T.n;c+=Math.max(3,w/3|0)){
  for(const sign of [1,-1]){if(trial(T,c,w,sign*amp,base.lo,base.hi,log)<-1e-6)break;undo(T,log);}
  yield;
 }
 return {n:T.n,ds:data.meta.reconstructed_xy_m/T.n,samples:data.samples,off:T.off,x:T.px,y:T.py,kap:T.kap,lo:base.lo,hi:base.hi,mechanics,minCurvature,time:solve(T)};
}
function cached(data){let byCar=lines.get(data);if(!byCar)lines.set(data,byCar=new Map());return byCar;}
export function drivingLine(data,mechanics=OPALA_MECHANICS){
 const byCar=cached(data),known=byCar.get(mechanics.name);
 if(known&&!(known instanceof Promise))return known;
 const work=laying(data,mechanics);let step;while(!(step=work.next()).done);
 byCar.set(mechanics.name,step.value);return step.value;
}
// The same, slice ms of work at a time with the browser free in between (a promise of the line).
export function drivingLineSoon(data,mechanics=OPALA_MECHANICS,slice=5){
 const byCar=cached(data),known=byCar.get(mechanics.name);
 if(known)return known instanceof Promise?known:Promise.resolve(known);
 const work=laying(data,mechanics),promise=new Promise((resolve,reject)=>{
  const run=()=>{try{const end=performance.now()+slice;let step;while(!(step=work.next()).done)if(performance.now()>end)return void setTimeout(run,0);byCar.set(mechanics.name,step.value);resolve(step.value);}catch(error){byCar.delete(mechanics.name);reject(error);}};
  setTimeout(run,0);
 });
 byCar.set(mechanics.name,promise);return promise;
}
// --- What to do along the line. The colours run from accelerate (effort -1, green) through hold or lift (0, yellow)
// to brake hard (1, red). GuidePlan holds the line's speeds for the player's car in today's weather; effort() works
// out the stretch ahead of the car from the speed it has now: where the red begins is where, at this speed, the
// brakes must go on for the bend ahead (it comes closer as the car goes faster), and a car already too fast for it
// sees red right in front. Along a bend at its limit the line is yellow (hold the speed, a steady throttle), and it
// turns green as the car may accelerate. LEAD: the seconds of green going yellow before a braking point.
export const LEAD=.7;
const BRAKE_ZONE=.12,HOLD=.08;
export class GuidePlan {
 constructor(line,weatherGrip=1){this.line=line;this.speeds=new Float32Array(line.n+1);this.setGrip(weatherGrip);}
 // The plan for the tyres today (rain: weatherGrip under 1); false when it had them already.
 setGrip(weatherGrip){
  if(this.weatherGrip===weatherGrip)return false;this.weatherGrip=weatherGrip;
  const m=this.line.mechanics,tyres=(m.grip??1)*weatherGrip,T=this.T=track(this.line,this.line.off,{grip:GUIDE_GRIP*tyres,braking:GUIDE_BRAKING*tyres,mechanics:m});
  solve(T);this.time=T.time;
  // The plan's own effort per station (the line seen from a car that drives it): the colours away from the car.
  let slow=0;for(let k=1;k<T.n;k++)if(T.v[k]<T.v[slow])slow=k;
  const lap=this.effort(slow,T.v[slow],T.n);this.still=new Float32Array(T.n);for(let j=0;j<T.n;j++)this.still[at(T,slow+j)]=lap[j];
  return true;
 }
 // The plan's speed at station k (m/s), and the fastest the car may be there and still make the bends ahead.
 speed(k){return this.T.v[at(this.T,k)];}
 limit(k){return this.T.vb[at(this.T,k)];}
 // Effort per station from station i0 on (count stations), the car at speed (m/s) there; out[j] for station i0+j.
 effort(i0,speed,count,out=new Float32Array(count)){
  const T=this.T,b=T.braking,u=this.speeds.length>count?this.speeds:new Float32Array(count+1);u[0]=speed;
  for(let j=0;j<count;j++){
   const k=at(T,i0+j),next=at(T,k+1),v=u[j];let to;
   // Slowing by more than the air, the road and the slope take off a car with its foot up: the brakes. Less: a lift.
   if(v<=T.vb[k]+.3){to=driven(T,k,v);const dec=(v*v-to*to)/(2*T.len[k]),brake=dec-T.drag*v*v-ROLLING-G*T.a[k][6];out[j]=dec>.3?brake>0?clamp(brake/(.6*b),BRAKE_ZONE,1):0:-clamp((T.vc[k]-v)/(HOLD*T.vc[k]),0,1);}
   // Faster than this stretch allows: the brakes, hard, until the car is down to it.
   else{to=Math.max(T.vb[next],Math.sqrt(Math.max(0,v*v-2*T.len[k]*b)));out[j]=1;}
   u[j+1]=to;
  }
  // Before each braking point: the green fades to yellow over the LEAD seconds before it.
  for(let j=1;j<count;j++){
   if(!(out[j]>=BRAKE_ZONE&&out[j-1]<BRAKE_ZONE))continue;
   const reach=LEAD*u[j];let dist=0;
   for(let q=j-1;q>=0;q--){dist+=T.len[at(T,i0+q)];if(dist>=reach||out[q]>=BRAKE_ZONE)break;out[q]=Math.max(out[q],-dist/reach);}
  }
  // Averaged over 10 m, so a long bend's colour does not flicker with each station's bend.
  const raw=this.raw?.length>=count?this.raw:this.raw=new Float32Array(count);raw.set(out.subarray(0,count));
  for(let j=0;j<count;j++){let sum=0,w=0;for(let q=Math.max(0,j-2);q<=Math.min(count-1,j+2);q++){sum+=raw[q];w++;}out[j]=sum/w;}
  return out;
 }
}
// An effort's colour (linear RGB, 0..1): green, yellow, red.
const GREEN=[.08,.75,.22],YELLOW=[1,.72,.05],RED=[1,.07,.04];
export function effortColor(e,out=[0,0,0]){
 const [p,q,t]=e<0?[YELLOW,GREEN,-e]:[YELLOW,RED,e];
 for(let c=0;c<3;c++)out[c]=p[c]+(q[c]-p[c])*t;
 return out;
}
