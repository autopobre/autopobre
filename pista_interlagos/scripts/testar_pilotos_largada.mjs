import {CIRCUITS} from '../teste/circuits.js';
import assert from 'node:assert/strict';
import {readAIRecords,AutomaticAIRecords} from '../teste/ai-records.js';
import {AutomaticRecords,readRecords,readRecordView,RECORD_VIEW_KEY} from '../teste/lap-records.js';
import {PilotProfiles,PILOTS_KEY} from '../teste/pilot-profile.js';
import {ImmersiveMode} from '../teste/immersive-mode.js';
import {ImmersiveState} from '../teste/immersive-state.js';
import {TestCar} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
import {createCurveloData} from '../teste/curvelo-data.js';
const saved=new Map();let writes=0;const storage={getItem:k=>saved.get(k),setItem:(k,v)=>{writes++;saved.set(k,v);}};
const profiles=new PilotProfiles(storage);assert.equal(profiles.selected,'');assert.equal(profiles.remember('   '),'');
assert.equal(profiles.remember(' Ana '),'Ana');assert.equal(profiles.remember('ANA'),'Ana');assert.deepEqual(profiles.names,['Ana']);profiles.remember('Bruno');assert.equal(new PilotProfiles(storage).selected,'Bruno');assert.equal(JSON.parse(saved.get(PILOTS_KEY)).names.length,2);
const recorder=new AutomaticRecords(storage),mode={car:{best:null,laps:0},data:{meta:{id:'curvelo'}},active:false,freeTotalLaps:3,finishTime:null};
recorder.start('Ana');recorder.update(mode);assert.equal(readRecords(storage).length,0);
mode.car.best=42;mode.car.laps=1;recorder.update(mode);assert.equal(readRecords(storage)[0].bestRace,null,'a valid lap is saved before completing the race');
const count=writes;recorder.update(mode);assert.equal(writes,count,'no write on every frame');
mode.car.best=44;mode.car.laps=2;recorder.update(mode);assert.equal(writes,count,'slower times never replace a personal best');
mode.car.best=40;recorder.update(mode);assert.equal(readRecords(storage)[0].bestLap,40);
mode.car.laps=3;mode.finishTime=129;recorder.update(mode);assert.equal(readRecords(storage)[0].bestRace,null,'race times are no records: the result screens show them');
mode.car.best=null;mode.car.laps=0;mode.finishTime=null;recorder.update(mode);assert.equal(readRecords(storage)[0].bestLap,40,'abandoning or restarting keeps recorded laps');
mode.car.best=30;mode.car.laps=1;mode.recordAssisted=true;recorder.update(mode);assert.equal(readRecords(storage)[0].bestLap,40,'recognition tours are excluded');
mode.recordAssisted=false;recorder.start('Bruno');recorder.update(mode);assert.equal(readRecords(storage).length,2,'pilot records are independent');
mode.active=true;mode.finishTime=32;recorder.update(mode);assert.equal(readRecords(storage).length,2,'one record a circuit, whichever mode drove it');
mode.car.best=29;recorder.update(mode);assert.deepEqual(readRecords(storage).filter(r=>r.name==='Bruno').map(r=>[r.bestLap,r.mode]),[[29,'immersive']],'a quicker story lap is the record');
mode.car.mechanics={name:'fusca'};mode.car.best=45;recorder.update(mode);assert.deepEqual(readRecords(storage,'fusca').map(r=>[r.name,r.bestLap]),[['Bruno',45]],'a Fusca lap goes to the Fusca board');delete mode.car.mechanics;
mode.data.meta.id='interlagos';mode.car.best=150;mode.finishTime=152;recorder.update(mode);assert.equal(readRecords(storage).length,3,'circuits remain independent');
assert(new PilotProfiles(storage).names.includes('Ana'));
const legacy=new PilotProfiles({getItem:k=>k==='autopobre-record-name'?'Old Pilot':null});assert.equal(legacy.selected,'Old Pilot');
let available=false;const recovery=new AutomaticRecords({getItem:storage.getItem,setItem(k,v){if(!available)throw Error('quota');storage.setItem(k,v);}});recovery.start('Retry');recovery.update(mode,100);assert(mode.recordSaveError);available=true;recovery.update(mode,5100);assert.equal(mode.recordSaveError,'');assert(readRecords(storage).some(r=>r.name==='Retry'));

const humanCount=readRecords(storage).length,aiBefore=readAIRecords(storage);const circuits=Object.keys(CIRCUITS).length;assert.equal(aiBefore.length,circuits*2*14);assert.equal(aiBefore.filter(r=>r.number==='70').length,circuits*2);
const ai=new AutomaticAIRecords(storage);ai.update({data:{meta:{id:'curvelo'}},active:false,rivals:[{entry:{number:'70'},car:{best:37},finished:true,finishTime:120}]});
assert.equal(readRecords(storage).length,humanCount,'AI never enters human storage');assert.equal(readAIRecords(storage).find(r=>r.circuit==='curvelo'&&r.mode==='normal'&&r.number==='70').bestLap,37);
assert(!new PilotProfiles(storage).names.some(n=>n.includes('Kleber')),'AI is not a saved human pilot');
// Koyzinho Indestrutível is a test setting: his laps never reach the AI board.
const koy=()=>readAIRecords(storage).find(r=>r.circuit==='curvelo'&&r.mode==='normal'&&r.number==='2').bestLap,koyBefore=koy();
ai.update({data:{meta:{id:'curvelo'}},active:false,rivals:[{entry:{number:'2'},style:{ace:true},car:{best:20},finished:true,finishTime:70}]});
assert.equal(koy(),koyBefore,'the indestructible Koyzinho leaves the AI board alone');

storage.setItem(RECORD_VIEW_KEY,JSON.stringify({circuit:'interlagos',car:'fusca',source:'ai'}));assert.deepEqual(readRecordView(storage),{circuit:'interlagos',car:'fusca',source:'ai'});storage.setItem(RECORD_VIEW_KEY,JSON.stringify({circuit:'curvelo',mode:'normal',source:'invalid'}));assert.equal(readRecordView(storage),null);

const data=createCurveloData(),car=new TestCar(data),state=new ImmersiveState(),field=new RaceField(data),race=Object.create(ImmersiveMode.prototype);
Object.assign(race,{car,state,data,field,rivals:field.rivals,sync(){},freeTotalLaps:3});car.resetGrid();field.reset(car.surface.s,{grid:true});race.beginCountdown();
const grid=[car.x,car.y,...field.rivals.flatMap(r=>[r.car.x,r.car.y])],heard=[],seen=[3];
for(let i=0;i<360;i++){heard.push(...state.takeSounds().map(e=>e.name));assert.equal(race.step({throttle:1,left:1,right:0,brake:0},1/120),true);const label=Math.ceil(race.freeCountdown);if(!seen.includes(label))seen.push(label);}
assert.equal(car.clock,0);assert.deepEqual([car.x,car.y,...field.rivals.flatMap(r=>[r.car.x,r.car.y])],grid,'all cars stay on the grid during the countdown');
for(let i=0;i<2&&race.freeCountdown>0;i++)race.step({},1/120);heard.push(...state.takeSounds().map(e=>e.name));
assert(seen.includes(2)&&seen.includes(1));assert.equal(heard.filter(n=>n==='countdown').length,3);assert.equal(heard.filter(n=>n==='raceGo').length,1);assert(race.goTime>0);assert.equal(race.step({},1/120),false,'normal physics starts only after go');
state.start();state.phase='grid';state.countdown=3;race.goTime=0;car.resetGrid();const before=car.clock;
for(let i=0;i<359;i++)race.step({},1/120);assert.equal(state.phase,'grid');assert.equal(car.clock,before);
for(let i=0;i<2&&state.phase==='grid';i++)race.step({},1/120);assert.equal(state.phase,'race');assert.equal(state.raceTime,0);assert(race.goTime>0);
console.log('Pilots, automatic lap/race records, storage recovery, and both countdowns passed.');
