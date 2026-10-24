// Fuel by circuit (Central #11): circuits.js fuel is the litres an 8-lap race takes there (Stevan's
// table), ending it with about 1 L in the tank. The burn per lap follows from it, a race of more laps
// takes proportionally more and a shorter one ends with fuel to spare. Shared by the story (the team's
// desk, ImmersiveState.raceStep), Modo Corrida (ImmersiveMode.stepFree) and the Box 99 (pitstop.js).
import {CIRCUITS} from './circuits.js';
import {AI_REFERENCE_TIMES} from './ai-record-references.js';
export const FUEL_LAPS=8,FUEL_SPARE=1;
// The tank, in litres: 15 in the Opala and in the Fusca alike (Central #17). A circuit may give it more (circuits.js
// tank): the Pampulha's 20 km lap takes 40 L, a poetic licence.
export const TANK=15;
export const tankFor=circuit=>CIRCUITS[circuit]?.tank??TANK;
// Litres a second before the circuit's scale: the engine running, the speed, the throttle and the
// rear wheels spinning (burnouts burn more).
export const burnRate=(speed,throttle=0,spin=0)=>.002+speed*.00045+throttle*.005+spin*.0023;
// A circuit without its own number (a new track): about what the table gives per kilometre.
export const eightLapFuel=id=>CIRCUITS[id]?.fuel??Math.max(4,Math.round(FUEL_SPARE+(CIRCUITS[id]?.length??4000)/430));
export const lapFuel=id=>(eightLapFuel(id)-FUEL_SPARE)/FUEL_LAPS;
// What the race needs (the team's recommendation, Modo Corrida's start): the table up to 8 laps, more
// in proportion beyond; practice (endless laps) starts with the table's litres.
export const recommendedFuel=(id,laps)=>Math.ceil(eightLapFuel(id)*(Number.isFinite(laps)&&laps>FUEL_LAPS?laps/FUEL_LAPS:1));
// One lap of burnRate as the rivals drive it (gerar_referencias_ia.mjs lap times, their throttle about
// 62% of the lap): the scale fits it to the table, a slower lap burns a little more.
const TYPICAL_THROTTLE=.62;
const referenceLap=id=>{const t=AI_REFERENCE_TIMES.filter(r=>r.circuit===id&&r.mode==='normal').map(r=>r.bestLap).sort((a,b)=>a-b);return t.length?t[t.length>>1]:null;};
export const rawLapFuel=(id,length)=>length*.00045+(.002+.005*TYPICAL_THROTTLE)*(referenceLap(id)??length/35);
export const fuelScale=(id,length)=>lapFuel(id)/rawLapFuel(id,length);
