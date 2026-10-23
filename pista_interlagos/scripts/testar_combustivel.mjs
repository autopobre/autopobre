// Fuel by circuit (Central #11, fuel.js): Stevan's 8-lap table, more litres for a longer race, the
// tanks, the Box 99's refuel up to the tank, and a whole 8-lap race driven by the recon driver
// (heroInput) ending with about 1 L in the tank.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CIRCUITS} from '../teste/circuits.js';
import {TANKS,tankFor,burnRate,eightLapFuel,lapFuel,recommendedFuel,fuelScale,FUEL_LAPS,FUEL_SPARE} from '../teste/fuel.js';
import {LAPS} from '../teste/player-preferences.js';
import {CarCondition,PitService} from '../teste/car-condition.js';
import {ImmersiveState,COSTS} from '../teste/immersive-state.js';
import {newCareer} from '../teste/story-career.js';
import {createCurveloData} from '../teste/curvelo-data.js';
import {TestCar} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
const checks={},check=(name,value)=>{checks[name]=!!value;assert(value,name);};

const TABLE={interlagos:10,cascavel:8,piracicaba:6,chapeco:9,brasilia:12,goiania:9,guaratiba:10,velocitta:9,chapada:11,floripa:10,minhocao:9,pampulha:40,curvelo:6};
check('every_circuit_has_its_litres',Object.keys(CIRCUITS).every(id=>TABLE[id]===eightLapFuel(id))&&Object.keys(TABLE).length===Object.keys(CIRCUITS).length);
check('table_up_to_eight_laps',Object.keys(TABLE).every(id=>[1,3,8,Infinity].every(n=>recommendedFuel(id,n)===TABLE[id])));
check('more_laps_in_proportion',recommendedFuel('interlagos',16)===20&&recommendedFuel('interlagos',12)===15&&recommendedFuel('chapada',20)===28&&recommendedFuel('brasilia',20)===30);
check('one_litre_left_after_eight',Object.keys(TABLE).every(id=>Math.abs(lapFuel(id)*FUEL_LAPS+FUEL_SPARE-TABLE[id])<1e-9));
check('tanks',TANKS.opala===80&&TANKS.fusca===40&&tankFor('fusca')===40&&tankFor('opala')===80&&tankFor(undefined)===80);
check('longest_race_fits_the_tanks',Object.keys(TABLE).every(id=>recommendedFuel(id,CIRCUITS[id].laps??LAPS.max)<=TANKS.fusca));

// The Box 99 fills up to the tank, never past it.
let fuel=75,wallet=1000;const pit=new PitService({condition:new CarCondition(),getFuel:()=>fuel,setFuel:v=>fuel=v,getTank:()=>TANKS.opala,pay:v=>{wallet-=v;return true;},refund:v=>{wallet+=v;}});
pit.startFuel(20);pit.step(60);check('refuel_stops_at_the_tank',Math.abs(fuel-80)<1e-9&&wallet===1000-Math.ceil(5*COSTS.litre));
// The team's desk sells up to a full tank, as the money pays.
const rich=new ImmersiveState({fund:2000,career:{...newCareer(),intro:true}});rich.start();rich.openDesk();check('desk_sells_up_to_the_tank',rich.buy(95,false)&&rich.fuel===TANKS.opala);

// Eight laps by the recon driver at the circuit's scale, from the grid: about 1 L left (the rivals'
// pace; a slower lap burns a little more), as many litres as the table started with.
for(const id of ['curvelo','piracicaba']){
 const data=id==='curvelo'?createCurveloData():JSON.parse(readFileSync(new URL(`../dados/pista_${id}.json`,import.meta.url)));data.meta.id=id;
 const car=new TestCar(data);car.resetGrid();const field=new RaceField(data,{seed:1});field.reset(car.surface.s,{grid:true});
 const scale=fuelScale(id,data.meta.reconstructed_xy_m),start=car.laps??0;let tank=recommendedFuel(id,FUEL_LAPS),steps=0;
 for(;steps<120*60*20&&(car.laps??0)<start+FUEL_LAPS;steps++){const cmd=field.heroInput(car,1/120);car.step(cmd,1/120);field.step(car,1/120,FUEL_LAPS+1);tank-=burnRate(Math.hypot(car.vx,car.vy),cmd.throttle||0,car.rearSlipSpeed||0)*scale/120;}
 checks[id+'_left']=+tank.toFixed(2);
 check(id+'_eight_laps_leave_about_a_litre',(car.laps??0)>=start+FUEL_LAPS&&tank>.4&&tank<1.6);
}
console.log(JSON.stringify({passed:true,checks},null,1));
