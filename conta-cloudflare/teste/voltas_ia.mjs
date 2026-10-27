// Real laps for the records' checks: the game's own AI drives the player's Opala in Node (TestCar + the recon lap's
// RaceField.heroInput + GhostRecorder, as testar_fantasma.mjs; the engine held at the player's, since an ace's racecraft
// brings its own), recorded as the game records them: each lap's ghost, its controls (comandos-volta.js, from no
// device) and every step's command. A test wanting a lap of its own time gets one of these on a slower clock (lapAt):
// the same path, every speed and push a little less, which an Opala can always do.
import fs from 'node:fs';
import {TestCar} from '../../pista_interlagos/teste/physics.js';
import {RaceField} from '../../pista_interlagos/teste/race-field.js';
import {CIRCUITS} from '../../pista_interlagos/teste/circuits.js';
import {createCurveloData} from '../../pista_interlagos/teste/curvelo-data.js';
import {GhostRecorder,GhostLap} from '../../pista_interlagos/teste/ghost-lap.js';
import {LapInputs} from '../../pista_interlagos/teste/comandos-volta.js';
import {smoothVerges} from '../../pista_interlagos/teste/track-verge.js';

// The track as the game races it (track-verge.js smoothVerges, main.js).
export const loadCircuit=id=>{const data=id==='curvelo'?createCurveloData():JSON.parse(fs.readFileSync(new URL(`../../pista_interlagos/dados/${CIRCUITS[id].data??'pista.json'}`,import.meta.url)));data.meta.id=id;smoothVerges(data);return data;};
const driven=new Map();
// The first `count` laps from the grid on circuit id: [{lap: {time, rate, values, brakes}, inputs, commands}].
export function aiLaps(id,count=2){
 const key=id+'|'+count;if(driven.has(key))return driven.get(key);
 const data=loadCircuit(id),car=new TestCar(data);car.resetGrid();const field=new RaceField(data,{seed:3});field.reset(car.surface.s,{grid:true,entrants:[]});
 const ghosts=new GhostRecorder(),inputs=new LapInputs({target:null,now:()=>0}),laps=[];let commands=[];
 ghosts.step(car,true);inputs.step(car,{},()=>0);
 for(let step=0;step<120*1500*count&&laps.length<count;step++){
  const command=field.heroInput(car,1/120);car.engineScale=1;car.step(command,1/120);field.step(car,1/120,3);
  commands.push(command);const done=inputs.step(car,command,()=>0),lap=ghosts.step(car,true,command.brake);
  if(done)commands=lap?(laps.push({lap,inputs:done,commands}),[]):[];
 }
 if(laps.length<count)throw new Error(`${id}: the AI completed ${laps.length} of ${count} laps`);
 driven.set(key,laps);return laps;
}
// A lap's path on a slower clock: `time` seconds (no quicker than the lap itself), sampled 20 times a second as the
// game records, its brakes moved with it.
export function lapAt(lap,time){
 if(time<lap.time-1e-9)throw new Error(`a lap of ${lap.time} s cannot be driven in ${time} s`);
 const g=new GhostLap(lap),f=lap.time/time,n=Math.ceil(time*20-1e-9)+1,values=new Float64Array(n*7),p={};
 for(let k=0;k<n;k++){g.poseAt(Math.min(k/20,time)*f,p);values.set([p.x,p.y,p.z,p.heading,p.pitch,p.roll,p.progress],k*7);}
 return {time,rate:20,values,brakes:(lap.brakes??[]).map(b=>b/f)};
}
