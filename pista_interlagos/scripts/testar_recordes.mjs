import assert from 'node:assert/strict';
import {readRecords,saveRecord,trackRecords,bestPerPilot,readRecordView,RECORD_VIEW_KEY} from '../teste/lap-records.js';
import {resultRows,formatTime} from '../teste/race-results.js';
const memory=()=>{const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
const storage=memory(),candidate={name:'Stevan',mode:'normal',bestLap:150.25};
// One record a circuit per pilot, whichever mode drove it: the best lap stays, whatever the name's case.
saveRecord(storage,candidate);saveRecord(storage,{...candidate,name:'STEVAN',bestLap:155});
let records=readRecords(storage);assert.equal(records.length,1);assert.equal(records[0].bestLap,150.25);assert.equal(records[0].bestRace,null,'race times are no records any more');
saveRecord(storage,{...candidate,mode:'immersive',bestLap:151});assert.equal(readRecords(storage).length,1,'a slower story lap leaves the one record');
saveRecord(storage,{...candidate,mode:'immersive',bestLap:149.5});
assert.deepEqual(readRecords(storage).map(r=>[r.mode,r.bestLap]),[['immersive',149.5]],'a quicker story lap is the circuit\'s record, saying where it was driven');
saveRecord(storage,{...candidate,circuit:'curvelo',bestLap:40});
assert.equal(readRecords(storage).length,2,'same player can record both circuits');
assert.equal(readRecords({getItem:()=>JSON.stringify([candidate])})[0].circuit,'interlagos','legacy records migrate to original circuit');
assert.throws(()=>saveRecord(storage,{...candidate,bestLap:NaN}));assert.throws(()=>saveRecord(storage,{...candidate,name:'  '}));assert.throws(()=>saveRecord(storage,{...candidate,circuit:'../../private'}));
for(let i=0;i<55;i++)saveRecord(storage,{...candidate,circuit:'curvelo',name:'Curvelo '+i,bestLap:35-i*.01});
assert.equal(readRecords(storage).filter(r=>r.circuit==='curvelo').length,50);
assert.equal(readRecords(storage).filter(r=>r.circuit==='interlagos').length,1,'short oval times never evict Interlagos records');
assert.throws(()=>saveRecord({getItem:()=>null,setItem(){throw Error('quota')}},candidate),/Não foi possível salvar/);
assert.deepEqual(readRecords({getItem:()=>'{broken'}),[]);assert.deepEqual(readRecords({getItem:()=>JSON.stringify([{...candidate,name:{}}])}),[]);
// The Opala's rows keep the format older versions of the game read: each with its mode, no car, the race time empty.
assert.ok(JSON.parse(storage.values.get('autopobre-records-v1')).every(r=>['normal','immersive'].includes(r.mode)&&!('car' in r)&&r.bestRace===null&&r.raceLaps));

// Rows of both modes saved before they were one: the pilot once, at the best; the next best leaves one row.
const both=memory();
both.setItem('autopobre-records-v1',JSON.stringify([{circuit:'interlagos',name:'Ana',mode:'normal',bestLap:140,bestRace:420,raceLaps:3,date:''},{circuit:'interlagos',name:'ana',mode:'immersive',bestLap:139,bestRace:null,raceLaps:3,date:''}]));
assert.deepEqual(bestPerPilot(readRecords(both).map(r=>({...r,source:'human'}))).map(r=>[r.name,r.bestLap]),[['ana',139]]);
saveRecord(both,{name:'Ana',mode:'normal',circuit:'interlagos',bestLap:138});assert.deepEqual(readRecords(both).map(r=>[r.name,r.bestLap,r.mode]),[['Ana',138,'normal']]);
// The Fusca's board is its own, under a key of its own (older versions read the Opala's key alone).
saveRecord(both,{name:'Ana',mode:'normal',circuit:'interlagos',car:'fusca',bestLap:170});
assert.deepEqual(readRecords(both,'fusca').map(r=>[r.name,r.bestLap,r.car]),[['Ana',170,'fusca']]);
assert.deepEqual(readRecords(both).map(r=>r.bestLap),[138],'the Opala\'s board does not see it');
assert.ok(both.values.has('autopobre-records-fusca-v1')&&!both.values.get('autopobre-records-v1').includes('170'));

const mode={freeOrder:[{number:'70',name:'Kleber Eletric',bestLap:149,totalTime:460,finished:true},{number:'73',name:'Konrad Viehmann',bestLap:null,totalTime:null,finished:false}],finishPosition:2,finishTime:470,finishBest:150};
const rows=resultRows(mode);assert.deepEqual(rows.map(r=>r.number),['70','99','73']);assert.equal(rows[1].bestLap,150);assert.equal(rows[2].totalTime,null);assert.equal(formatTime(150.25),'02:30.250');assert.equal(formatTime(null),'—');

// The garage TVs and the track cards: this track's best laps in one car, both modes together, people and the AI,
// fastest first; the pilot playing is marked and keeps the last line with his own place when below the top rows.
const tv=trackRecords(storage,'interlagos','opala','stevan');
assert.equal(tv.lap.length,8);assert.ok(tv.lap.every((r,i)=>i===7||r.ai&&r.place===i+1),'AI references lead the lap list');assert.ok(tv.lap.slice(0,7).every((r,i,a)=>!i||r.time>=a[i-1].time));
assert.deepEqual([tv.lap[7].me,tv.lap[7].number,tv.lap[7].time,tv.lap[7].place>8],[true,'99','02:29.500',true],'the pilot keeps the last line, with the story lap');
assert.equal(new Set(tv.lap.filter(r=>r.ai).map(r=>r.number)).size,tv.lap.filter(r=>r.ai).length,'each AI car once, at its best of both modes');
assert.equal(trackRecords(storage,'interlagos','opala','outro').lap[7].me,false);
assert.ok(!('race' in tv),'no race times on the TVs either');
const oval=trackRecords(storage,'curvelo','opala','Curvelo 54');assert.ok(oval.lap[0].me&&oval.lap[0].name==='Curvelo 54'&&oval.lap[0].place===1,'a fast pilot leads the oval board');
assert.deepEqual(trackRecords(both,'interlagos','fusca','ana').lap.map(r=>[r.name,r.ai,r.me]),[['Ana',false,true]],'the Fusca\'s board: people only so far');
assert.deepEqual(trackRecords(both,'interlagos','opala','',8,{ai:false}).lap.map(r=>r.name),['Ana'],'people alone, when asked');

// The dialog's last view: circuit, car and who drove; one saved with a mode (before the modes were one) is the Opala's.
const view=memory();
view.setItem(RECORD_VIEW_KEY,JSON.stringify({circuit:'brasilia',mode:'immersive',source:'online'}));assert.deepEqual(readRecordView(view),{circuit:'brasilia',car:'opala',source:'online'});
view.setItem(RECORD_VIEW_KEY,JSON.stringify({circuit:'curvelo',car:'fusca',source:'human'}));assert.deepEqual(readRecordView(view),{circuit:'curvelo',car:'fusca',source:'human'});
console.log('Records: one per circuit whichever mode, a board per car (the Fusca under its own key), the best kept, invalid data refused, race times only on the result screens.');
