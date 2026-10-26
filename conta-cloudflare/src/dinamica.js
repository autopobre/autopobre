// Whether a lap's ghost is one the game's car (the Opala, the Fusca) can drive, beside recordes.js ghostProblem: what
// the car needed along the lap against its engine, its brakes and its tyres (src/envelope.js, per car: the game's own
// physics at the best a legit player's car can be: dry, new parts, a tow, the Opala's story engine). A real lap sped
// up, or one driven with more grip or power than the car has, needs a little more at every corner and straight; a
// contact with a rival or a wall needs a lot more, but only for a moment.
// Per sample, from the way of the centre of mass (the ghost's model origin raised along the body's up), differenced over
// ±WINDOW s at any of the game's rates (its centimetres stay under 0.03 m/s² there):
// - the speed, and the push along the way less gravity along the slope (the way's own climb, from z);
// - the tyres' sideways force against the load on them. The game's tyres push level and the road along its normal, so
//   the load comes from the vertical balance (gravity and z's acceleration), and a banked road takes its share of the
//   turn: the bank is the body's roll less its lean out of the turn (envelope lean).
// Each check's excess over the envelope adds up over the lap as speed the car cannot account for (m/s). The biggest
// short runs of excess (contacts) are set aside, a few per check; more than BUDGET left, or the top speed passed for
// longer than a contact, and the lap is not one that car drove. A lap from the grid starts at rest: below SLOW nothing is
// checked, and the launch is held to the tyres' traction.
import {ENVELOPES} from './envelope.js';

const FIELDS=7;
const WINDOW=.5;       // s: speeds and accelerations over a second (shorter shakes with the centimetres, longer blurs the corners)
const GRIP=1.03;       // × the skidpad's steady grip: a turn-in or a crest lends a little more for a moment
const LAG=.1;          // s: the tyres feel a change of load late (physics.js TYRE_RELAXATION, 0.08 s): the load then counts too
const TRACTION=1.05;   // × the launch's traction: a climb out of a hairpin loads the rear tyres a little more
const PUSH_SLACK=.1;   // m/s² over the engine (the window's average across a gear change)
const BRAKE_SLACK=.2;  // m/s² over the brakes
const SPEED_SLACK=.3;  // m/s over the circuit's top
const SLOW=5;          // m/s: slower than this nothing is checked (a spin, backing off a wall: no lap time is made there)
const CAP=2;           // m/s²: the most one sample's excess adds
const SPIKE=1;         // s: a contact's excess is over within the window; a longer run is the car itself
const SPIKES=3;        // short runs set aside per check and per two minutes of lap (a rival, a wall)
const SHOVE=4;         // m/s of speed a short run of push may hide: a rival's shove from behind (the hardest seen: 2.4), not a boost
export const BUDGET=2; // m/s the car cannot account for over the lap, the spikes set aside
const NAMES={opala:'Opala',fusca:'Fusca'};
const reasons=name=>[`o carro acelerou mais do que o motor do ${name} permite`,`o carro fez curva com mais aderência do que um ${name} tem`,`o carro freou mais do que os freios do ${name} permitem`,`o carro passou da velocidade máxima do ${name}`];
const REASONS=Object.fromEntries(Object.keys(ENVELOPES).map(car=>[car,reasons(NAMES[car]??car)]));
const ANY_TOP=Object.fromEntries(Object.entries(ENVELOPES).map(([car,E])=>[car,Math.max(...Object.values(E.tops))]));
// The engine's push at speed v (m/s²): the table up to the limiter, none past it (the window's average of a car held
// at the limiter reads a little over it).
const engine=(E,v)=>{if(v>=E.top+.5)return 0;const f=Math.min(v,E.top)/E.step,j=Math.min(Math.floor(f),E.push.length-2);return E.push[j]+(E.push[j+1]-E.push[j])*(f-j);};

// What a ghost (recordes.js readGhost) asks of the car (ENVELOPES' name) on this circuit: push, turn, brake (m/s each
// check leaves once its spikes are set aside), peaks (each check's worst sample, m/s² over the envelope and its margins:
// under 0 is room left), the fastest it went (m/s), and whether it stayed past the top speed (fast). null: too short to
// measure, or a car with no envelope.
export function dynamicsScore(ghost,circuit,car='opala'){
 if(!Object.hasOwn(ENVELOPES,car))return null;
 const E=ENVELOPES[car],{n,rate,time,values:v}=ghost,m=Math.max(1,Math.round(WINDOW*rate)),lag=Math.max(1,Math.round(LAG*rate)),dt=1/rate;
 if(n<2*m+1)return null;
 const at=k=>k>=n-1?time:k/rate,top=(Object.hasOwn(E.tops,circuit)?E.tops[circuit]:ANY_TOP[car])+SPEED_SLACK,keep=SPIKES*Math.max(1,Math.ceil(time/120));
 // The centre of mass and the body's up at each sample.
 const X=new Float64Array(n),Y=new Float64Array(n),Z=new Float64Array(n),UX=new Float64Array(n),UY=new Float64Array(n),UZ=new Float64Array(n),N=new Float64Array(n);
 for(let k=0,i=0;k<n;k++,i+=FIELDS){
  const ch=Math.cos(v[i+3]),sh=Math.sin(v[i+3]),cp=Math.cos(v[i+4]),sp=Math.sin(v[i+4]),cr=Math.cos(v[i+5]),sr=Math.sin(v[i+5]);
  UX[k]=ch*cr*sp+sh*sr;UY[k]=sh*cr*sp-ch*sr;UZ[k]=cr*cp;X[k]=v[i]+UX[k]*E.cg;Y[k]=v[i+1]+UY[k]*E.cg;Z[k]=v[i+2]+UZ[k]*E.cg;
 }
 // Per check (push, turn, brake): the run of excess under way (its length, what it adds, the speed it gave whole), the
 // lap's sum, the short runs (what each adds, and what it still adds set aside). A push past a shove's is no contact:
 // that much always counts, whatever the cap.
 const len=[0,0,0],imp=[0,0,0],raw=[0,0,0],sum=[0,0,0],short=[[],[],[]],e=[0,0,0],peaks=[-Infinity,-Infinity,-Infinity];let fastest=0,over=0,overs=0,fast=false;
 const close=c=>{
  const boost=c?0:Math.max(0,raw[c]-SHOVE),all=Math.max(imp[c],boost);
  if(len[c]>0&&len[c]<=SPIKE)short[c].push([all,boost]);else sum[c]+=all;len[c]=imp[c]=raw[c]=0;
 };
 for(let k=m;k+m<n;k++){
  const a=k-m,b=k+m,ta=at(a),tk=at(k),tb=at(b),T=tb-ta,d1=tk-ta,d2=tb-tk;
  const vx=(X[b]-X[a])/T,vy=(Y[b]-Y[a])/T,vz=(Z[b]-Z[a])/T,vh=Math.hypot(vx,vy);
  const ax=2*((X[b]-X[k])/d2-(X[k]-X[a])/d1)/T,ay=2*((Y[b]-Y[k])/d2-(Y[k]-Y[a])/d1)/T,az=2*((Z[b]-Z[k])/d2-(Z[k]-Z[a])/d1)/T;
  if(vh<SLOW){N[k]=az+E.g;for(let c=0;c<3;c++)close(c);over=0;continue;}
  // Along the way and across it (to the left), the way's climb, the road's bank, the load, and the tyres' force.
  const fx=vx/vh,fy=vy/vh,along=ax*fx+ay*fy,across=ay*fx-ax*fy,grade=vz/vh,bank=(UY[k]*fx-UX[k]*fy)/UZ[k]+E.lean*across;
  const nn=Math.hypot(grade,bank,1),load=N[k]=(az+E.g)*nn,felt=Math.max(load,N[k-lag]),tyreAlong=along+load*grade/nn,tyreAcross=across-load*bank/nn;
  e[0]=tyreAlong+E.drag*(1-E.tow)*vh*vh+E.rolling*Math.min(1,load/E.g)-Math.min(engine(E,vh),E.traction*TRACTION*Math.max(1,felt/E.g))-PUSH_SLACK;
  e[1]=Math.abs(tyreAcross)-E.grip*GRIP*felt;
  e[2]=-tyreAlong-E.drag*vh*vh-E.brake-BRAKE_SLACK;
  for(let c=0;c<3;c++){if(e[c]>peaks[c])peaks[c]=e[c];if(e[c]>0){len[c]+=dt;imp[c]+=Math.min(e[c],CAP)*dt;raw[c]+=e[c]*dt;}else close(c);}
  // Past the top speed: as long as a contact's shove at most, and only a few times.
  fastest=Math.max(fastest,vh);
  if(vh>top){if(over===0)overs++;over+=dt;if(over>SPIKE||overs>keep)fast=true;}else over=0;
 }
 // The short runs that spare the most are set aside.
 for(let c=0;c<3;c++){close(c);short[c].sort((x,y)=>y[0]-y[1]-x[0]+x[1]);short[c].forEach(([all,aside],j)=>{sum[c]+=j<keep?aside:all;});}
 return {push:sum[0],turn:sum[1],brake:sum[2],peaks,fastest,fast};
}
// Why a ghost cannot be a lap of the game's car (opala, fusca) on this circuit, or null when it can.
export function dynamicsProblem(ghost,circuit,car='opala'){
 if(!Object.hasOwn(ENVELOPES,car))return 'carro desconhecido';
 if(!ghost)return 'o fantasma da volta não pôde ser lido';
 const s=dynamicsScore(ghost,circuit,car);if(!s)return null;
 if(s.fast)return REASONS[car][3];
 const sums=[s.push,s.turn,s.brake];
 return sums[0]+sums[1]+sums[2]>BUDGET?REASONS[car][sums.indexOf(Math.max(...sums))]:null;
}
