// Modo Corrida's solo practice and 1x1: the short grid, the endless practice, the duel's race and
// its records, and the whole field left exactly as it was.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar,recognitionInput} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
import {RIVAL_ROSTER,GRID_START_BACK,GRID_ROW_SPACING,gridSlot,playerGridSlot,rivalEntry,DUEL_DEFAULT} from '../teste/race-roster.js';
import {ImmersiveMode} from '../teste/immersive-mode.js';
import {TANKS,recommendedFuel} from '../teste/fuel.js';
import {ImmersiveState} from '../teste/immersive-state.js';
import {AutomaticRecords,readRecords} from '../teste/lap-records.js';
import {AutomaticAIRecords,readAIRecords} from '../teste/ai-records.js';
import {createCurveloData} from '../teste/curvelo-data.js';
const interlagos=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));interlagos.meta.id='interlagos';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const across=(car,x,y)=>(x-car.x)*car.surface.lx+(y-car.y)*car.surface.ly;

// The whole field: the grid is the one it always was (the old formula), each car in its roster place.
{
 const data=interlagos,L=data.meta.reconstructed_xy_m,player=new TestCar(data);player.resetGrid(playerGridSlot());
 const back=new TestCar(data);back.resetGrid();assert.equal(player.x,back.x);assert.equal(player.y,back.y);
 const field=new RaceField(data,{seed:3});field.reset(player.surface.s,{grid:true});
 assert.equal(field.rivals.length,RIVAL_ROSTER.length);
 for(const [i,r] of field.rivals.entries()){
  assert.equal(r.entry,RIVAL_ROSTER[i]);assert.equal(r.rosterIndex,i);
  assert.equal(r.progress,(Math.ceil(RIVAL_ROSTER.length/2)-Math.floor(r.slot/2))*GRID_ROW_SPACING+8-(r.slot%2)*2,'full grid unchanged');
 }
 assert.equal(playerGridSlot().back,GRID_START_BACK);assert.equal(playerGridSlot().lane,0);
 assert.equal(gridSlot(0).back,12);assert.equal(gridSlot(1).back,14);assert.equal(gridSlot(1).lane,-gridSlot(0).lane);
 assert.equal(rivalEntry(DUEL_DEFAULT).number,'73');assert.equal(rivalEntry('99'),null);
 // Same seed, same race: the entrants option left out or null changes nothing.
 const again=new RaceField(data,{seed:3});again.reset(player.surface.s,{grid:true,entrants:null});
 assert.deepEqual(again.rivals.map(r=>[r.car.x,r.car.y,r.slot,r.reaction]),field.rivals.map(r=>[r.car.x,r.car.y,r.slot,r.reaction]));
}

const report={};
for(const [name,data] of [['interlagos',interlagos],['curvelo',createCurveloData()]]){
 data.meta.id??=name;const L=data.meta.reconstructed_xy_m;
 // Solo practice: the Opala 99 alone on the pole box.
 {
  const car=new TestCar(data);car.resetGrid(playerGridSlot(0));
  assert(Math.abs(((L-car.surface.s)%L)-12)<2.5,'practice starts on the pole');assert(Math.abs(car.surface.d-gridSlot(0).lane)<.2);assert(car.awaitingStart&&car.surface.onRoad);
  const field=new RaceField(data,{seed:1});field.reset(car.surface.s,{grid:true,entrants:[]});assert.equal(field.rivals.length,0);
  assert.deepEqual(field.step(car,1/120,Infinity),[]);
 }
 // 1x1: the chosen rival on pole, the player beside him on the front row, 2 m back.
 {
  const number='19',car=new TestCar(data);car.resetGrid(playerGridSlot(1));
  const field=new RaceField(data,{seed:2});field.reset(car.surface.s,{grid:true,entrants:[number]});
  assert.equal(field.rivals.length,1);const [r]=field.rivals;
  assert.equal(r.entry.number,number);assert.equal(r.rosterIndex,RIVAL_ROSTER.findIndex(e=>e.number===number));assert.equal(r.slot,0);
  assert(Math.abs(r.progress-2)<1e-9,'rival 2 m ahead');assert(Math.abs(((L-r.car.surface.s)%L)-12)<2.5,'rival on the pole');
  const side=across(car,r.car.x,r.car.y);assert(Math.abs(Math.abs(side)-4.4)<.3,`side by side, a lane apart (${side.toFixed(2)} m)`);
  assert(Math.abs(car.surface.d-gridSlot(1).lane)<.2&&car.surface.onRoad&&r.car.surface.onRoad);
  // Koyzinho Indestrutível races the 1x1 as the ace when the option is on.
  const ace=new RaceField(data,{seed:2,ace:true});ace.reset(car.surface.s,{grid:true,entrants:['2']});assert(ace.rivals[0].style.ace);
 }
 // The free race through ImmersiveMode (no DOM): a practice never ends and burns no fuel; a 1x1 is a
 // two-car race to the flag whose race times stay off the boards.
 const mode=(lineup,laps=3)=>{
  const m=Object.create(ImmersiveMode.prototype);
  Object.assign(m,{data,car:new TestCar(data),state:new ImmersiveState(),field:new RaceField(data,{seed:4}),parts:{reset(){}},contacts(){},sync(){},wallImpact(){},laps,storyLaps:3,lineup,tank:TANKS.opala});
  m.car.resetGrid(playerGridSlot(lineup?.length));m.resetField();return m;
 };
 {
  // Set to one lap: a race would take the flag there, the practice goes on.
  const m=mode([],1);assert(m.practice&&!m.fullGrid);assert.equal(m.fieldSize,1);assert.equal(m.freePosition,1);assert.equal(m.freeTotalLaps,Infinity);
  let steps=0,after=0;while(after<120*20&&steps<120*400){const input=recognitionInput(m.car);m.car.step(input,1/120);m.stepFree(1/120,input);steps++;if(m.car.laps>=1)after++;}
  assert.equal(m.car.laps,1,'a full practice lap');assert(!m.freeFinished&&!m.finishing,'no flag in a practice');assert.equal(m.freeFuel,recommendedFuel(name,Infinity),'the tank keeps the litres of the circuit table (fuel.js)');
  // Practice laps go on the lap board (there is no race time).
  const storage=memory(),records=new AutomaticRecords(storage);records.start('Treino');records.update(m);
  const [row]=readRecords(storage);assert.equal(row.bestLap,m.car.best);assert.equal(row.bestRace,null);
  report[name]={practiceLaps:m.car.laps,practiceBest:m.car.best};
 }
 {
  const m=mode([DUEL_DEFAULT]);assert(!m.practice&&!m.fullGrid);assert.equal(m.fieldSize,2);assert.equal(m.freePosition,2);assert.equal(m.freeTotalLaps,3);
  assert.equal(m.rivals[0].entry.number,DUEL_DEFAULT);
  let steps=0;while(!m.finishing&&steps<120*900){const input=recognitionInput(m.car);m.car.step(input,1/120);m.stepFree(1/120,input);steps++;}
  assert(m.finishing,'the 1x1 reaches the flag');assert.equal(m.car.laps,3);assert.equal(m.freeOrder.length,1);assert([1,2].includes(m.finishPosition));
  // The duel's lap counts on the boards; its race time (from the front row, no traffic) does not.
  const storage=memory(),people=new AutomaticRecords(storage),ai=new AutomaticAIRecords(storage);people.start('Duelista');
  for(let j=0;j<120*200&&!m.rivals[0].finished&&!m.rivals[0].retired;j++)m.field.step(m.car,1/120,3);
  people.update(m);ai.update(m);
  assert(m.rivals[0].finished||m.rivals[0].retired,'the rival takes the flag too (or retired with a breakdown)');
  const [mine]=readRecords(storage);assert.equal(mine.bestLap,m.finishBest);assert.equal(mine.bestRace,null,'no race record from a 1x1');
  const theirs=readAIRecords(storage).find(r=>r.circuit===name&&r.mode==='normal'&&r.number===DUEL_DEFAULT),reference=readAIRecords(memory()).find(r=>r.circuit===name&&r.mode==='normal'&&r.number===DUEL_DEFAULT);
  assert.equal(theirs.bestRace,reference.bestRace,"the rival's race time stays off the AI board");assert.equal(theirs.bestLap,Math.min(reference.bestLap,m.rivals[0].car.best));
  report[name].duel={position:m.finishPosition,time:m.finishTime,rival:m.rivals[0].finishTime};
  const full=mode(null);assert(full.fullGrid&&!full.practice);assert.equal(full.fieldSize,RIVAL_ROSTER.length+1);assert.equal(full.freeTotalLaps,3);
 }
}
console.log(JSON.stringify({passed:true,report},null,1));
