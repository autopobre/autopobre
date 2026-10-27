// The quickest lap each car can do on each circuit, for the online records' floor (src/recordes.js): the driving
// line's own lap time (driving-line.js, Linha ideal: laid for the lap time with the car's engine, tyres and brakes,
// OPALA_MECHANICS or FUSCA_MECHANICS, the ace's grip scaled by the car's own tyres, every corner at the grip's limit),
// worked out by the game's code. A lap well under it was not driven.
// Run after a circuit is added or the line's model or a car's mechanics change: node gerar_pisos.mjs (writes src/pisos.js).
import fs from 'node:fs';
import {drivingLine} from '../pista_interlagos/teste/driving-line.js';
import {OPALA_MECHANICS,FUSCA_MECHANICS} from '../pista_interlagos/teste/physics.js';
import {CIRCUITS} from '../pista_interlagos/teste/circuits.js';
import {createCurveloData} from '../pista_interlagos/teste/curvelo-data.js';
import {smoothVerges} from '../pista_interlagos/teste/track-verge.js';

// The track as the game races it (track-verge.js smoothVerges, main.js).
const load=id=>{const data=id==='curvelo'?createCurveloData():JSON.parse(fs.readFileSync(new URL(`../pista_interlagos/dados/${CIRCUITS[id].data??'pista.json'}`,import.meta.url)));data.meta.id=id;smoothVerges(data);return data;};
const CARS={opala:OPALA_MECHANICS,fusca:FUSCA_MECHANICS},out=Object.fromEntries(Object.keys(CARS).map(car=>[car,{}]));
for(const id of Object.keys(CIRCUITS)){
 const data=load(id),row=[id.padEnd(12)];
 for(const [car,mechanics] of Object.entries(CARS)){
  const started=Date.now(),line=drivingLine(data,mechanics);
  out[car][id]=Math.round(line.time*1000)/1000;row.push(`${car} ${out[car][id].toFixed(1)} s (${Date.now()-started} ms)`);
 }
 console.log(row.join('  '));
}
const header="// Written by gerar_pisos.mjs: the driving line's lap time on each circuit (s) for each car, at the grip's limit.";
fs.writeFileSync(new URL('./src/pisos.js',import.meta.url),`${header}\nexport const LINE_TIMES=${JSON.stringify(out)};\n`);
