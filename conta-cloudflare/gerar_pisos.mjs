// The quickest lap the Opala can do on each circuit, for the online records' floor (src/recordes.js): the driving
// line's own lap time (driving-line.js, Linha ideal: laid for the lap time with the Opala's engine, ace tyres and
// brakes, every corner at the grip's limit), worked out by the game's code. A lap well under it was not driven.
// Run after a circuit is added or the line's model changes: node gerar_pisos.mjs (writes src/pisos.js).
import fs from 'node:fs';
import {drivingLine} from '../pista_interlagos/teste/driving-line.js';
import {CIRCUITS} from '../pista_interlagos/teste/circuits.js';
import {createCurveloData} from '../pista_interlagos/teste/curvelo-data.js';

const load=id=>{const data=id==='curvelo'?createCurveloData():JSON.parse(fs.readFileSync(new URL(`../pista_interlagos/dados/${CIRCUITS[id].data??'pista.json'}`,import.meta.url)));data.meta.id=id;return data;};
const out={};
for(const id of Object.keys(CIRCUITS)){
 const started=Date.now(),line=drivingLine(load(id));
 out[id]=Math.round(line.time*1000)/1000;
 console.log(id.padEnd(12),out[id].toFixed(1),'s',`(${Date.now()-started} ms)`);
}
const header="// Written by gerar_pisos.mjs: the driving line's lap time on each circuit (s), the Opala at the grip's limit.";
fs.writeFileSync(new URL('./src/pisos.js',import.meta.url),`${header}\nexport const LINE_TIMES=${JSON.stringify(out)};\n`);
