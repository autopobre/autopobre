// Rebuild AI reference times from the game's current physics and driver styles.
import {readFileSync,writeFileSync} from 'node:fs';
import {createCurveloData} from '../teste/curvelo-data.js';
import {TestCar} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
import {CIRCUITS} from '../teste/circuits.js';
const rows=[];
// Cascavel, ECPA, Chapecó, Brasília and Goiânia come from the open-data track files (scripts/circuitos/), the
// imaginary Chapada dos Sonhos from gerar_chapada.py.
for(const id of ['interlagos','curvelo','cascavel','piracicaba','chapeco','brasilia','goiania','chapada','floripa','minhocao','pampulha']){
 const data=id==='curvelo'?createCurveloData():JSON.parse(readFileSync(new URL(id==='interlagos'?'../dados/pista.json':`../dados/pista_${id}.json`,import.meta.url)));data.meta.id=id;
 // Both modes race the standard distance (LAPS.standard in player-preferences.js): 3 laps; a circuit that fixes its race
 // length (circuits.js laps: Pampulha's one lap of 20 km) its own, with the time it takes.
 const standard=CIRCUITS[id].laps??3,budget=CIRCUITS[id].laps?standard*data.meta.reconstructed_xy_m/15:900;
 for(const [mode,laps] of [['normal',standard],['immersive',standard]]){
  const player=new TestCar(data);player.resetGrid();const field=new RaceField(data,{seed:1});field.reset(player.surface.s,{grid:true});player.x=10000;player.y=10000;player.surface=player.sample(player.x,player.y);
  for(let i=0;i<120*budget&&field.rivals.some(r=>!r.finished);i++)field.step(player,1/120,laps);
  for(const r of field.rivals){if(!r.finished||!r.car.best)throw Error('Missing valid AI finish: '+id+' '+r.entry.number);rows.push({circuit:id,mode,number:r.entry.number,bestLap:Math.round(r.car.best*1000)/1000,bestRace:Math.round(r.finishTime*1000)/1000});}
  console.log(id,mode,Math.min(...field.rivals.map(r=>r.car.best)),Math.max(...field.rivals.map(r=>r.finishTime)));
 }
}
writeFileSync(new URL('../teste/ai-record-references.js',import.meta.url),'// Simulated in-game times, not real-world driver records. Rebuild with gerar_referencias_ia.mjs.\nexport const AI_REFERENCE_TIMES='+JSON.stringify(rows,null,1)+';\n');
