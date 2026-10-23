// Depois da bandeirada: volta de desaceleração (dando passagem a quem ainda corre), entrada no
// pit lane e fila na faixa de trabalho, com o Box 99 livre. Interlagos, Curvelo, Brasília, Goiânia, Minhocão e Pampulha
// (boxes à direita dos carros: o bloco do pit vem da saída para a entrada, pit.reversed; na Pampulha a corrida é de uma
// volta de 20 km e a volta de desaceleração, inteira, leva uns 14 minutos).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar} from '../teste/physics.js';
import {RaceField,pitRoute,racingLine,bodyContact} from '../teste/race-field.js';
import {pitGeometry,wallContact,serviceSpot,curveloPitFrame} from '../teste/pit-lane.js';
import {RIVAL_ROSTER} from '../teste/race-roster.js';
import {createCurveloData} from '../teste/curvelo-data.js';
const interlagos=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));interlagos.meta.id='interlagos';
const curvelo=createCurveloData();curvelo.meta.id='curvelo';
const brasilia=JSON.parse(fs.readFileSync(new URL('../dados/pista_brasilia.json',import.meta.url)));brasilia.meta.id='brasilia';
const goiania=JSON.parse(fs.readFileSync(new URL('../dados/pista_goiania.json',import.meta.url)));goiania.meta.id='goiania';
const guaratiba=JSON.parse(fs.readFileSync(new URL('../dados/pista_guaratiba.json',import.meta.url)));guaratiba.meta.id='guaratiba';
const velocitta=JSON.parse(fs.readFileSync(new URL('../dados/pista_velocitta.json',import.meta.url)));velocitta.meta.id='velocitta';
const minhocao=JSON.parse(fs.readFileSync(new URL('../dados/pista_minhocao.json',import.meta.url)));minhocao.meta.id='minhocao';
const pampulha=JSON.parse(fs.readFileSync(new URL('../dados/pista_pampulha.json',import.meta.url)));pampulha.meta.id='pampulha';
const report={};
for(const [name,data] of [['interlagos',interlagos],['curvelo',curvelo],['brasilia',brasilia],['goiania',goiania],['guaratiba',guaratiba],['velocitta',velocitta],['minhocao',minhocao],['pampulha',pampulha]]){
 const R=pitRoute(data),geo=pitGeometry(data),frame=data.pit??curveloPitFrame(data),u0=data.pit?0:150,b=frame.box99;
 // Box 99 service box (lane distance u, offset d to the cars' left) and its car pose; on a reversed
 // block the stations run against the cars, so u counts from the lane's far end and d turns round.
 const rev=!!frame.reversed,U=s=>rev?frame.length_m-s:s;
 const spot=data.pit?serviceSpot(data.pit):{s:b.s,d:R.at(b.s+u0).work},box={u:U(spot.s)+u0,d:rev?-spot.d:spot.d};
 // Box 99 and the café beside it (before it in the cars' order, after it on a reversed block).
 const zone=[Math.min(U(b.s),U(b.cafe_s))+u0-b.bay/2,Math.max(U(b.s),U(b.cafe_s))+u0+b.bay/2];
 const pose=({u,d})=>{const p=R.at(u);return {x:p.x-p.ty*d,y:p.y+p.tx*d,heading:Math.atan2(p.ty,p.tx)};};
 // Enough slots for the whole field, a car length apart, on the pit surface, clear of the walls,
 // of the café bay and Box 99, and of the way out of the box.
 assert(R.slots.length>=RIVAL_ROSTER.length,`${name}: a slot for every rival (${R.slots.length})`);
 const probe=new TestCar(data);
 R.slots.forEach((slot,i)=>{
  const q=pose(slot);probe.index=probe.nearest(q.x,q.y,true).i;const surface=probe.sample(q.x,q.y);
  assert(surface.pit,`${name}: slot ${i} is on the pit lane`);
  assert(!wallContact(geo,q.x,q.y,q.heading),`${name}: slot ${i} clear of the walls`);
  assert(slot.u-2.4>zone[1]+5||slot.u+2.4<zone[0]-3,`${name}: slot ${i} leaves the café bay, Box 99 and its way out free`);
  if(i)assert(Math.abs(slot.u-R.slots[i-1].u)>=6.5,`${name}: slots a car length apart`);
 });
 // Three-lap race with the Opala parked in the Box 99 service box, then the in-laps (a circuit that fixes its race
 // length, meta.laps: its own, with the time its laps and in-lap take).
 const laps=data.meta.laps??3,budget=data.meta.laps?(laps+1)*data.meta.reconstructed_xy_m/12:1500;
 const player=new TestCar(data);player.resetGrid();const field=new RaceField(data,{seed:1});field.reset(player.surface.s,{grid:true});
 const park=pose(box);Object.assign(player,{x:park.x,y:park.y,heading:park.heading,vx:0,vy:0,yaw:0});player.surface=player.sample(player.x,player.y);player.index=player.surface.i;
 const line=racingLine(data),order=[],arrival=[],yields=[],watch=new Map();
 let steps=0,flagCollisions=null,playerHits=0,wallHits=0,limitSpeed=0,offRoad=0;
 while(steps<120*budget&&!field.rivals.every(r=>r.pit?.parked)){
  playerHits+=field.step(player,1/120,laps).filter(h=>h.player).length;steps++;
  for(const r of field.rivals){
   if(!r.finished)continue;
   if(!order.includes(r)){order.push(r);flagCollisions??=field.collisions;}
   if(r.pit&&!arrival.includes(r))arrival.push(r);
   if(r.car.wallImpactSpeed>1)wallHits++;
   if(!r.car.surface.onRoad)offRoad++;
   if(r.pit&&r.car.surface.pit&&r.pit.u>R.limit.from+5&&r.pit.u<R.limit.to)limitSpeed=Math.max(limitSpeed,Math.hypot(r.car.vx,r.car.vy)*3.6);
   // Blue flag: two seconds after a car still racing shows up behind, the finished car is off the line.
   if(!r.pit&&r.yieldSide&&!watch.has(r))watch.set(r,{steps,side:r.yieldSide});
   const w=watch.get(r);if(w&&steps-w.steps===240)yields.push((r.car.surface.d-line.off[r.car.index])*w.side);
   if(w&&!r.yieldSide)watch.delete(r);
  }
 }
 const parked=field.rivals.filter(r=>r.pit?.parked);
 assert.equal(parked.length,RIVAL_ROSTER.length,`${name}: every rival ends parked in the pits`);
 assert(parked.every(r=>r.car.surface.pit&&Math.abs(r.pit.slot.u-r.pit.u)<1.5),`${name}: each car stops in its slot`);
 assert(parked.every(r=>!wallContact(geo,r.car.x,r.car.y,r.car.heading)),`${name}: parked cars clear of the walls`);
 for(let i=0;i<parked.length;i++)for(let j=i+1;j<parked.length;j++)assert(!bodyContact(parked[i].car,parked[j].car),`${name}: parked cars do not touch`);
 // First into the lane, furthest down the row: the queue never pulls over beside a parked car.
 for(let i=1;i<arrival.length;i++)assert(arrival[i].pit.slot.u<arrival[i-1].pit.slot.u,`${name}: slots taken in arrival order`);
 assert.equal(playerHits,0,`${name}: the Opala in Box 99 is never touched`);
 assert(Math.hypot(player.x-park.x,player.y-park.y)<.01,`${name}: the Opala in Box 99 is not pushed`);
 assert.equal(wallHits,0,`${name}: no wall contact after the flag`);
 assert.equal(offRoad,0,`${name}: in-laps stay on the asphalt and the pit lane`);
 assert(limitSpeed>45&&limitSpeed<60,`${name}: pit lane limit respected (${limitSpeed.toFixed(1)} km/h)`);
 // (A circuit that fixes its race length, meta.laps: Pampulha's in-lap to the pits on the north shore runs 12 km among the
 // cars still finishing; a couple of light touches on the way are no pile-up.)
 assert(field.collisions-flagCollisions<(data.meta.laps?4:2),`${name}: no pile-up behind the flag (${field.collisions-flagCollisions})`);
 // (On a fixed-laps circuit the in-lap is long, Pampulha's 12 km of 10 m streets: now and then a finished car finds no room
 // to step aside; most must.)
 assert(yields.length>=3&&yields.filter(v=>v>1.2).length>=(data.meta.laps?.8:1)*yields.length,`${name}: finished cars move off the racing line for cars still racing (${yields.map(v=>v.toFixed(1))})`);
 report[name]={seconds:steps/120,firstFlag:order[0].finishTime,lastParked:steps/120,limitSpeed:+limitSpeed.toFixed(1),yields:yields.length,flagCollisions:field.collisions-flagCollisions};
}
console.log(JSON.stringify({passed:true,report},null,1));
