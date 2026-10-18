import {AI_REFERENCE_TIMES} from './ai-record-references.js';
import {RIVAL_ROSTER} from './race-roster.js';
import {LAPS} from './player-preferences.js';
import {raceLaps} from './circuits.js';
const KEY='autopobre-ai-records-v1',valid=t=>Number.isFinite(t)&&t>0&&t<86400;
const key=r=>`${r.circuit}:${r.mode}:${r.number}`;
const best=(a,b)=>a===null?b:b===null?a:Math.min(a,b);
// The race length whose race times count on a circuit (people's and the AI's): the standard 3 laps, or the one a
// circuit fixes (circuits.js fixedLaps: Pampulha's single lap).
export const standardLaps=circuit=>raceLaps(circuit,LAPS.standard);
// As for the players (lap-records.js): race times only over the standard 3 laps (standardLaps); story race
// times saved before the lap setting (one-lap races, no raceLaps) are left out.
export function readAIRecords(storage){
 const records=new Map(AI_REFERENCE_TIMES.map(r=>[key(r),{...r,source:'ai'}]));
 try{const saved=JSON.parse(storage?.getItem(KEY)||'[]');if(Array.isArray(saved))for(const r of saved){const row=records.get(key(r||{}));if(row&&valid(r.bestLap)&&(r.bestRace===null||valid(r.bestRace)&&r.bestRace>=r.bestLap)){row.bestLap=Math.min(row.bestLap,r.bestLap);row.bestRace=best(row.bestRace,r.mode==='immersive'&&r.raceLaps!==standardLaps(r.circuit)?null:r.bestRace);}}}catch{}
 return [...records.values()].map(r=>({...r,name:RIVAL_ROSTER.find(entry=>entry.number===r.number).name}));
}
export class AutomaticAIRecords {
 constructor(storage){this.storage=storage;this.rows=readAIRecords(storage);this.signature='';this.retryAt=0;}
 update(mode,now=Date.now()){
  if(!mode?.rivals?.length||now<this.retryAt)return;
  // The boards are the Opala's: a field of Fuscas (physics.js FUSCA_MECHANICS) keeps none.
  const model=mode.rivals[0].car?.mechanics?.name;if(model&&model!=='opala')return;
  // A 1x1 rival starts on pole with nobody ahead: its laps count, its race time does not (fullGrid).
  const circuit=mode.data.meta.id,category=mode.active?'immersive':'normal',standard=mode.fullGrid!==false&&(mode.active?mode.storyLaps:mode.freeTotalLaps)===standardLaps(circuit);
  const signature=JSON.stringify([circuit,category,...mode.rivals.map(r=>[r.car.best,r.finished?r.finishTime:null])]);
  if(signature===this.signature)return;
  let changed=false;const rows=this.rows.map(r=>({...r}));
  for(const rival of mode.rivals){
   // Koyzinho Indestrutível is a test setting and the board is the Fácil field's: the ace's times and
   // those of the harder levels stay off it. So do the cars of a multiplayer room that come over the
   // network (car.remote, multiplayer.js): a human in a rival's seat, or times this window never timed.
   const lap=rival.car.best;if(!valid(lap)||rival.car.remote||rival.style?.ace||(rival.level??'facil')!=='facil')continue;
   const row=rows.find(r=>r.circuit===circuit&&r.mode===category&&r.number===rival.entry.number);if(!row)continue;
   const race=standard&&rival.finished&&valid(rival.finishTime)?rival.finishTime:null;
   const bestLap=Math.min(row.bestLap,lap),bestRace=best(row.bestRace,race);
   if(bestLap!==row.bestLap||bestRace!==row.bestRace){row.bestLap=bestLap;row.bestRace=bestRace;changed=true;}
  }
  if(changed){try{this.storage.setItem(KEY,JSON.stringify(rows.map(({circuit,mode,number,bestLap,bestRace})=>({circuit,mode,number,bestLap,bestRace,raceLaps:standardLaps(circuit)}))));this.rows=rows;this.retryAt=0;}catch{this.retryAt=now+5000;return;}}
  this.signature=signature;
 }
}
