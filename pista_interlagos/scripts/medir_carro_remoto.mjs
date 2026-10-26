// How well a remote car (net-cars.js RemoteCar) follows its owner on Interlagos under real-world delays: the owner's car
// on the automatic pilot, 30 states a second through a line with a base delay, some jitter and now and then a stall (a
// TCP resend holds every state behind a lost one, then they all arrive at once). Per scenario: the gap between where the
// remote car is drawn and where the owner really is (metres), its height off the true car (sinking or floating), how
// many times it jumped, and how long it stood still. Usage: node medir_carro_remoto.mjs [another net-cars.js to
// compare] (the netcode study of 10-07, reports/Netcode em jogos de corrida.md).
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {TestCar,recognitionInput} from '../teste/physics.js';
import * as current from '../teste/net-cars.js';

const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const other=process.argv[2]?await import(pathToFileURL(process.argv[2]).href):null;
// base: one-way age (s); jitter: random extra (s); stall: every this many seconds a hold of hold seconds.
const SCENARIOS=[
 {name:'perto (30 ms)',base:.03,jitter:.005,stall:0,hold:0},
 {name:'convidado via EUA (280 ms)',base:.28,jitter:.03,stall:0,hold:0},
 {name:'via EUA + travadas TCP',base:.28,jitter:.04,stall:4,hold:.3},
 {name:'conexão ruim (450 ms, travando)',base:.45,jitter:.08,stall:2.5,hold:.45},
];
let seed=7;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
const stats=list=>{const l=[...list].sort((a,b)=>a-b);return {media:+(l.reduce((a,b)=>a+b,0)/l.length).toFixed(2),p95:+l[Math.floor(l.length*.95)].toFixed(2),max:+l.at(-1).toFixed(2)};};
function run({RemoteCar,packCar,readCar},sc){
 seed=7;
 const truth=new TestCar(data),shadow=new TestCar(data);truth.reset(40);shadow.reset(40);const remote=new RemoteCar(truth);
 const dt=1/120,queue=[],gaps=[],heights=[];let t=0,seq=0,held=0,stallUntil=-1,nextStall=sc.stall||Infinity,still=0,prev=null;
 for(let step=0;step<120*60;step++){
  while(queue.length&&queue[0].at<=t+1e-9){const m=queue.shift();remote.receive(m.state,{age:t-m.sent,seq:m.seq});}
  remote.drive(shadow,dt);truth.step(recognitionInput(truth,{maxSpeed:48,cornerGrip:9,braking:9}),dt);t+=dt;
  if(step%4===0){
   if(t>=nextStall){stallUntil=t+sc.hold;nextStall=t+sc.stall;}
   const arrive=Math.max(t+sc.base+random()*sc.jitter,stallUntil>t?stallUntil+sc.base:0,queue.at(-1)?.at??0);
   queue.push({sent:t,at:arrive,seq:++seq,state:readCar(packCar(truth))});
  }
  if(t>5){
   gaps.push(Math.hypot(shadow.x-truth.x,shadow.y-truth.y));heights.push(Math.abs(shadow.z-truth.z));
   if(prev&&Math.hypot(shadow.x-prev[0],shadow.y-prev[1])<1e-4&&Math.hypot(truth.vx,truth.vy)>5)still+=dt;
  }
  prev=[shadow.x,shadow.y];
 }
 return {distancia_m:stats(gaps),altura_m:stats(heights),saltos:remote.snaps??null,parado_s:+still.toFixed(2)};
}
const report={};
for(const sc of SCENARIOS){report[sc.name]={novo:run(current,sc),...(other&&{antigo:run(other,sc)})};}
console.log(JSON.stringify(report,null,1));
