// A lap's controls (the game's comandos-volta.js), read beside its ghost (recordes.js readGhost): what the physics got
// each step, the keys as the keyboard sent them, and the devices that drove. Two uses:
// - inputsProblem: the controls must explain the lap. They cover its whole time, and the car never gains energy (speed
//   and height) with nothing to push it: no throttle, no reverse. A lap made up without the game has to make these up
//   too, and make them agree.
// - inputSignals: what a person's hands look like, for the admin panel to judge (never a refusal by itself): keys a
//   page's script made, a car moved by no device, a keyboard's lap without its keys, half pedals from a keyboard alone,
//   taps too short or too much at once for fingers, and brakes at the very same metres as another lap (a replay).
const STEP_RATE=120,MAX_STEPS=3600*STEP_RATE,STRIDES=[1,2,4,8];
export const INPUT_CHARS=80000;
const RANGES=[[0,100],[0,100],[-100,100],[0,3],[-2,9],[0,100]],SIGNED=[false,false,true,false,true,false];

// The controls as sent, read with every size and value checked first: per kept step (one in s), the six channels;
// the keys as {t (tenths of a ms into the lap), a (0 throttle, 1 brake, 2 left, 3 right, 4 handbrake, 5 reverse),
// down, trusted}. null for anything else.
export function readInputs(entry){
 try{
  const {v,n,s,data,keys,r,dev}=entry??{};
  if(v!==1||!Number.isInteger(n)||n<1||n>MAX_STEPS||!STRIDES.includes(s)||typeof data!=='string'||typeof keys!=='string'||data.length+keys.length>INPUT_CHARS)return null;
  if(!Number.isInteger(r)||r<0||r>1e6||!Array.isArray(dev)||dev.length!==5||!dev.every(x=>Number.isInteger(x)&&x>=0&&x<=n))return null;
  const units=Math.ceil(n/s),ch=[Uint8Array,Uint8Array,Int8Array,Uint8Array,Int8Array,Uint8Array].map(T=>new T(units)),state=[0,0,0,0,-2,0];
  const bytes=atob(data);let i=0,u=-1;
  const byte=()=>{if(i>=bytes.length)throw 0;return bytes.charCodeAt(i++);};
  const varint=()=>{let x=0,m=1;for(let k=0;k<5;k++){const b=byte();x+=(b&127)*m;if(b<128)return x;m*=128;}throw 0;};
  const fill=(from,to)=>{if(to>from)for(let c=0;c<6;c++)ch[c].fill(state[c],from,to);};
  while(i<bytes.length){
   const at=u+varint()+1,mask=byte();if(at>=units||!mask||mask>63)return null;
   fill(u+1,at);
   for(let c=0;c<6;c++){if(mask&1<<c){let x=byte();if(SIGNED[c]&&x>127)x-=256;if(x<RANGES[c][0]||x>RANGES[c][1])return null;state[c]=x;}ch[c][at]=state[c];}
   u=at;
  }
  fill(u+1,units);
  const raw=atob(keys),list=[];let j=0,t=0;
  while(j<raw.length){
   let d=0,m=1,k=0;for(;k<5;k++){const b=raw.charCodeAt(j++);d+=(b&127)*m;if(b<128)break;m*=128;}if(k===5||j>=raw.length)return null;
   const b=raw.charCodeAt(j++);if((b&7)>5||b>31)return null;
   t+=d;list.push({t,a:b&7,down:!!(b&8),trusted:!!(b&16)});
  }
  return {n,s,units,ch,keys:list,repeats:r,dev};
 }catch{return null;}
}

const FIELDS=7,G=9.81;
const at=(ghost,k)=>k>=ghost.n-1?ghost.time:k/ghost.rate;
// The car's speed at sample k (m/s, over the samples either side) and its height.
function speedAt(ghost,k){
 const v=ghost.values,a=Math.max(0,k-1),b=Math.min(ghost.n-1,k+1),dt=at(ghost,b)-at(ghost,a);
 return dt>0?Math.hypot(v[b*FIELDS]-v[a*FIELDS],v[b*FIELDS+1]-v[a*FIELDS+1],v[b*FIELDS+2]-v[a*FIELDS+2])/dt:0;
}
// Energy the car may gain over a second with nothing pushing it (J/kg: the measure's noise, a kerb's bounce), how
// fast it must be going for the check (a car at rest wobbles), how long before a gain the push may have stopped (the
// engine's own inertia), and how many such seconds a lap may have (a rival's shove).
const FREE_ENERGY=20,MOVING=4,POWER_BEFORE=.4,UNPUSHED=3;
// Why these controls cannot be this lap's, or null.
export function inputsProblem(inputs,ghost){
 if(!inputs)return 'a volta veio sem os comandos do piloto';
 if(Math.abs(inputs.n/STEP_RATE-ghost.time)>3/STEP_RATE)return 'os comandos não cobrem a volta inteira';
 const powered=(t0,t1)=>{
  const a=Math.max(0,Math.floor(t0*STEP_RATE/inputs.s)),b=Math.min(inputs.units-1,Math.ceil(t1*STEP_RATE/inputs.s));
  for(let u=a;u<=b;u++)if(inputs.ch[0][u]>0||inputs.ch[3][u]&2)return true;
  return false;
 };
 const w=ghost.rate;let unpushed=0;
 for(let k=0;k+w<ghost.n;){
  const s0=speedAt(ghost,k),s1=speedAt(ghost,k+w),z0=ghost.values[k*FIELDS+2],z1=ghost.values[(k+w)*FIELDS+2];
  const gain=(s1*s1-s0*s0)/2+G*(z1-z0);
  if(gain>FREE_ENERGY&&Math.min(s0,s1)>MOVING&&!powered(at(ghost,k)-POWER_BEFORE,at(ghost,k+w))){if(++unpushed>UNPUSHED)return 'o carro ganhou velocidade sem acelerar';k+=w;}
  else k+=Math.max(1,w>>2);
 }
 return null;
}

// Where the brake went on (metres along the track, in tenths), from the controls and the ghost's distance.
function brakePoints(inputs,ghost){
 const out=[],b=inputs.ch[1],v=ghost.values;
 for(let u=1;u<inputs.units&&out.length<300;u++){
  if(!(b[u]>5&&b[u-1]<=5))continue;
  const t=u*inputs.s/STEP_RATE,k=Math.min(ghost.n-2,Math.floor(t*ghost.rate)),t0=at(ghost,k),t1=at(ghost,k+1),f=t1>t0?Math.min(1,(t-t0)/(t1-t0)):0;
  out.push(Math.round(10*(v[k*FIELDS+6]+(v[(k+1)*FIELDS+6]-v[k*FIELDS+6])*f)));
 }
 return out;
}
// How alike two laps' brake points are: the median distance (m) from each of this lap's to the other's nearest within
// 30 m, over at least 6 of them; Infinity when there are too few to tell.
function sameBrakes(mine,other){
 if(mine.length<6||other.length<6)return Infinity;
 const d=[];let j=0;
 for(const x of mine){while(j+1<other.length&&Math.abs(other[j+1]-x)<=Math.abs(other[j]-x))j++;const gap=Math.abs(other[j]-x)/10;if(gap<=30)d.push(gap);}
 if(d.length<6)return Infinity;
 d.sort((a,b)=>a-b);return d[d.length>>1];
}
const DEVICES=['teclado','toque','controle','volante'];
// The thresholds of the signals (see the top): a key held under SHORT_TAP ms, two keys within TOGETHER ms of each other,
// brakes within SAME_BRAKES m of another lap's.
const SHORT_TAP=25,TOGETHER=2,SAME_BRAKES=.5;
// What the controls say about the hands that made them: {aparelho, sinais: the codes raised, medidas: the numbers behind
// them, freios: the brake points to compare the next laps with}. previous: earlier laps' brake points (same pilot,
// circuit and mode).
export function inputSignals(inputs,ghost,previous=[]){
 const {n,dev,keys}=inputs,flags=[],m={};
 const driven=dev.slice(0,4),top=Math.max(...driven);
 const device=top>0?DEVICES[driven.indexOf(top)]:'nenhum',keyboardOnly=dev[0]>0&&!dev[1]&&!dev[2]&&!dev[3];
 m.sem_aparelho=+(dev[4]/n).toFixed(3);if(m.sem_aparelho>.02)flags.push('sem_aparelho');
 m.teclas=keys.length;m.sinteticas=keys.filter(k=>!k.trusted).length;if(m.sinteticas)flags.push('sinteticas');
 // A keyboard's pedals go all or nothing: its lap has a press for each time they went on.
 let pedalOn=0,half=0;
 for(let u=1;u<inputs.units;u++){for(const c of [0,1])if(inputs.ch[c][u]>0&&!inputs.ch[c][u-1])pedalOn++;if(inputs.ch[0][u]%100||inputs.ch[1][u]%100)half++;}
 m.pedal_meio=+(half/inputs.units).toFixed(3);
 if(keyboardOnly){
  const presses=keys.filter(k=>k.down&&k.a<2).length;
  if(pedalOn>=10&&presses<pedalOn*.3)flags.push('sem_teclas');
  if(m.pedal_meio>.05)flags.push('pedal_meio');
 }
 // Fingers: how long keys stay down, and how often two change in the same instant.
 const since=new Map(),holds=[];let together=0;
 keys.forEach((k,i)=>{
  if(k.down)since.set(k.a,k.t);else if(since.has(k.a)){holds.push((k.t-since.get(k.a))/10);since.delete(k.a);}
  for(let j=Math.max(0,i-3);j<=Math.min(keys.length-1,i+3);j++)if(j!==i&&keys[j].a!==k.a&&Math.abs(keys[j].t-k.t)<=TOGETHER*10){together++;break;}
 });
 if(holds.length>=20){m.toques_curtos=+(holds.filter(h=>h<SHORT_TAP).length/holds.length).toFixed(3);if(m.toques_curtos>.3)flags.push('curtas');}
 if(keys.length>=20){m.juntas=+(together/keys.length).toFixed(3);if(m.juntas>.4)flags.push('simultaneas');}
 const freios=brakePoints(inputs,ghost);
 const same=Math.min(Infinity,...previous.map(p=>sameBrakes(freios,p)));
 if(Number.isFinite(same)){m.freio_igual_m=+same.toFixed(2);if(same<SAME_BRAKES)flags.push('repetida');}
 return {aparelho:device,sinais:flags,medidas:m,freios};
}
