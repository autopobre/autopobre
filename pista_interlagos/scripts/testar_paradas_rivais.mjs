// Refuelling stops of the rivals (race-field.js, user 10-24): in a race longer than the tank holds every rival burns
// as the player does and stops once at its team's garage (pit-lane.js teamBoxes: never Box 99 nor the Tia's café), on a
// lap of its own within the window one stop works for; the crew's time follows the litres; back out, it races on to
// the flag. A race the tank covers keeps the endless tank. Interlagos (a garage for every team) and Cascavel (shared
// garages), with the tank cut to a few litres so the stops come in the first laps; the window by Stevan's table too.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar} from '../teste/physics.js';
import {RaceField,pitRoute,FUEL_RESERVE,REFUEL_TIME,REFUEL_RATE} from '../teste/race-field.js';
import {teamBoxes,garageBays} from '../teste/pit-lane.js';
import {lapFuel,fuelScale,recommendedFuel,tankFor} from '../teste/fuel.js';
import {RIVAL_ROSTER} from '../teste/race-roster.js';
const load=(file,id)=>{const d=JSON.parse(fs.readFileSync(new URL('../dados/'+file,import.meta.url)));d.meta.id=id;return d;};
const report={};
// The plan: only a race longer than the tank (Interlagos: 10 L for 8 laps, 25 L for 20) fills the tanks and stops.
{const data=load('pista.json','interlagos'),field=new RaceField(data,{seed:2});field.reset(0,{grid:true});
 field.planFuel(8);assert.equal(field.refuel,null,'8 laps at Interlagos fit the 15 L tank: no stops');assert(field.rivals.every(r=>r.fuel===undefined));
 field.planFuel(20);assert(field.refuel&&field.refuel.tank===tankFor('interlagos')&&recommendedFuel('interlagos',20)>15,'20 laps need a stop');assert(field.rivals.every(r=>r.fuel===15));
 field.planFuel(Infinity);assert.equal(field.refuel,null,'practice keeps the endless tank');}
// Every team has a garage, its own or shared, never Box 99 nor the café; two spots a car length apart where shared.
for(const [file,id] of [['pista.json','interlagos'],['pista_cascavel.json','cascavel'],['pista_brasilia.json','brasilia'],['pista_piracicaba.json','piracicaba']]){
 const data=load(file,id),R=pitRoute(data),{open,team}=garageBays(data.pit,RIVAL_ROSTER.length),boxes=teamBoxes(data.pit,RIVAL_ROSTER.length);
 assert.equal(R.boxes.length,RIVAL_ROSTER.length,id+': a garage for every team');
 for(const [k,b] of boxes.entries()){assert(!open.has(b.bay)&&team.has(b.bay),`${id}: team ${k} in a team garage, not Box 99 or the café`);assert.equal(R.boxes[k].spots.length,b.share>1?2:1);}
 report[id]={garages:team.size,shared:boxes.filter(b=>b.share>1).length};
}
// A race: the rivals at full pace, the player's car parked out of the way.
function race(file,id,laps,tank,seed){
 const data=load(file,id),L=data.meta.reconstructed_xy_m,field=new RaceField(data,{seed}),player=new TestCar(data);
 player.reset(0);player.x+=5000;player.y+=5000;player.surface=player.sample(player.x,player.y);
 field.reset(0,{grid:true});field.planFuel(laps);field.refuel={tank,perMetre:lapFuel(id)/L,scale:fuelScale(id,L)};for(const r of field.rivals)r.fuel=tank;
 const log=new Map(field.rivals.map(r=>[r.entry.number,{stops:[],parked:null}])),dt=1/120;let t=0,collisions=0;
 for(let i=0;i<120*60*20;i++){
  collisions+=field.step(player,dt,laps).length;t+=dt;
  for(const s of field.pitStops()){const e=log.get(s.number);if(s.phase==='abastecendo'&&!e.parked){e.parked={bay:s.bay,t,fuel:field.rivals.find(r=>r.entry.number===s.number).fuel};e.stops.push(s.bay);}
   if(s.phase==='saindo'&&e.parked&&!e.parked.out)Object.assign(e.parked,{out:t,litres:s.litres,time:s.time});}
  if(field.rivals.every(r=>r.finished||r.retired))break;
 }
 return {field,log,collisions,t,L};
}
for(const [file,id,laps,tank,seed] of [['pista.json','interlagos',4,4,1],['pista_cascavel.json','cascavel',4,3,5]]){
 const {field,log,collisions,t}=race(file,id,laps,tank,seed),boxes=pitRoute(field.data).boxes,stopped=[...log.values()];
 assert(field.rivals.every(r=>r.finished),`${id}: every rival reaches the flag (${field.rivals.filter(r=>!r.finished).map(r=>r.entry.number+':'+r.broken?.kind)})`);
 assert(field.rivals.every(r=>r.stops>=1),`${id}: every rival stopped`);
 for(const r of field.rivals){const e=log.get(r.entry.number);assert(e.stops.length>=1&&e.parked.out,`${id} #${r.entry.number}: parked at a garage and back out`);
  // Its own garage (with a shared one taken, the nearest free one).
  if(boxes[r.rosterIndex].share===1)assert.equal(e.stops[0],boxes[r.rosterIndex].bay,`${id} #${r.entry.number}: at its own garage`);
  assert(Math.abs(e.parked.time-(REFUEL_TIME+e.parked.litres*REFUEL_RATE))<1e-6&&e.parked.out-e.parked.t>=e.parked.time-.05,`${id} #${r.entry.number}: the crew's time follows the litres`);
  assert(r.fuel>FUEL_RESERVE*.3,`${id} #${r.entry.number}: fuel to spare at the flag (${r.fuel.toFixed(2)} L)`);}
 assert(collisions<=12,`${id}: the pit lane stays clean (${collisions} contacts)`);
 report[id]={...report[id],seconds:+t.toFixed(0),collisions,stops:Object.fromEntries([...log].map(([n,e])=>[n,e.stops.join('+')]))};
}
// The lap a rival comes in on: none while the fuel reaches the flag, at once when it would not last another lap, and
// evenly over the laps where one tank then reaches the flag (a 20-lap race at Cascavel: laps 4 to 16).
{const data=load('pista_cascavel.json','cascavel'),L=data.meta.reconstructed_xy_m,field=new RaceField(data,{seed:7});field.reset(0,{grid:true});field.planFuel(20);
 const r=field.rivals[0],q=field.refuel.perMetre,laps=[];
 for(let k=0;k<400;k++){r.fuelDice=Math.random;let stop=null;for(let lap=1;lap<20&&stop===null;lap++){r.progress=field.gridLeadIn+lap*L-50;r.fuel=15-q*(lap*L-50);if(field.wantStop(r,50,20))stop=lap;}laps.push(stop);}
 const lo=Math.min(...laps),hi=Math.max(...laps);assert(laps.every(l=>l!==null)&&lo>=3&&hi<=17&&hi-lo>=8,`the stop laps spread over the window (${lo}-${hi})`);
 r.progress=field.gridLeadIn+19*L;r.fuel=3;assert(!field.wantStop(r,50,20),'enough for the last lap: no stop');
 r.progress=field.gridLeadIn+10*L;r.fuel=1.2;r.fuelDice=()=>.99;assert(field.wantStop(r,50,20),'short of a lap: in at once');
 report.window={lo,hi};}
console.log(JSON.stringify(report,null,1));
console.log('Rival refuelling stops passed: the plan, every team its garage (none at Box 99 or the café), the stop, the crew\'s time, back out to the flag, the window.');
