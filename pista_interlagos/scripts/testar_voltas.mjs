import {GRID_START_BACK} from '../teste/race-roster.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestCar,recognitionInput} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url))),L=data.meta.reconstructed_xy_m;
const surface=(s,d=0)=>({s,width:12,d});
let c=new TestCar(data);
c.trackLap(surface(100),surface(140,10),42,20);assert(c.lapValid);
c.trackLap(surface(140,10),surface(190,10),52,20);
c.trackLap(surface(190,10),surface(230),43,20);assert(c.lapValid,'running wide without cutting stays valid');
c.trackLap(surface(230),surface(250,9),22,20);c.trackLap(surface(250,9),surface(275),20,20);assert(c.lapValid,'minor apex excursion tolerated');
c.trackLap(surface(275),surface(300,20),22,20);c.trackLap(surface(300,20),surface(490),75,20);assert(!c.lapValid,'skipping a large part of the route invalidates');
const fullLap=car=>{let previous=surface(0);for(let s=5;s<L;s+=5){const current=surface(s);car.clock+=.1;car.trackLap(previous,current,5,50);previous=current;}car.trackLap(previous,surface(1),L-previous.s+1,50);};
fullLap(c);assert.equal(c.laps,0,'cut lap cannot finish the race');assert.equal(c.lastLapValid,false);assert.equal(c.best,null);
fullLap(c);assert.equal(c.laps,1);assert.equal(c.lastLapValid,true);assert(c.best>0);
fullLap(c);fullLap(c);assert.equal(c.laps,3);
c=new TestCar(data);fullLap(c);assert.equal(c.laps,1);c.trackLap(surface(1),surface(L-5),6,4);assert.equal(c.laps,1,'reversing across finish never counts');
c.trackLap(surface(L-5),surface(3),8,4);assert.equal(c.laps,1,'slipping back over the line, the next time across is the same passage');assert.equal(c.lastLapValid,true,'not an invalid lap');
c=new TestCar(data);c.trackLap(surface(100),surface(550),450,50);c.trackLap(surface(L-5),surface(2),7,50);assert.equal(c.laps,0,'missing checkpoints never finishes');
const field=new RaceField(data);field.rivals[0].progress=L+1;field.step(c,1/120,3);assert(!field.rivals[0].finished,'rivals race past lap one');field.rivals[0].progress=3*L+1;field.step(c,1/120,3);assert(field.rivals[0].finished,'rivals finish after three laps');
const driven=new TestCar(data);for(let i=0;i<120*900&&driven.laps<3;i++)driven.step(recognitionInput(driven),1/120);assert.equal(driven.laps,3,'three actual simulated laps count correctly');
// A handbrake turn over the line: the car crosses sideways or nose last, and the lap still ends.
for(const before of [45,35]){
 const spun=new TestCar(data);let pulled=false,nose=null;
 for(let i=0;i<120*900&&spun.laps<2&&!(pulled&&spun.surface.s>40&&spun.surface.s<L/2);i++){
  const input=recognitionInput(spun),s=spun.surface.s;if(spun.laps>=1&&s>L-before){pulled=true;Object.assign(input,{handbrake:1,throttle:0,brake:0,left:1,right:0});}
  spun.step(input,1/120);if(pulled&&nose===null&&s>L-16&&spun.surface.s<16)nose=spun.vx*Math.cos(spun.heading)+spun.vy*Math.sin(spun.heading);
 }
 assert(nose<1,`the handbrake turn from ${before} m crosses the line nose last (${nose})`);assert.equal(spun.laps,2,`a handbrake turn from ${before} m before the line ends the lap`);
}
const gridCar=new TestCar(data);gridCar.resetGrid();const grid=new RaceField(data);grid.reset(gridCar.surface.s,{grid:true});
assert(gridCar.surface.s>=L-GRID_START_BACK&&gridCar.surface.s<L-GRID_START_BACK+3);
assert(grid.rivals.every(r=>r.car.surface.s>gridCar.surface.s&&r.car.surface.s<L-5),'every rival starts behind the finish line, ahead of player');
gridCar.trackLap(surface(L-4),surface(2),6,10);assert(!gridCar.awaitingStart);assert.equal(gridCar.laps,0);assert.equal(gridCar.lastLapValid,null);assert(gridCar.lapValid,'initial crossing is not an invalid lap');
fullLap(gridCar);fullLap(gridCar);fullLap(gridCar);assert.equal(gridCar.laps,3,'three complete laps after the initial crossing');
grid.rivals[0].progress=3*L+1;grid.step(gridCar,1/120,3);assert(!grid.rivals[0].finished,'AI must reach the actual finish, not the back of the grid');
grid.rivals[0].progress=3*L+grid.gridLeadIn+1;grid.step(gridCar,1/120,3);assert(grid.rivals[0].finished);
const gridDriven=new TestCar(data);gridDriven.resetGrid();let crossed=false;
for(let i=0;i<120*900&&gridDriven.laps<3;i++){gridDriven.step(recognitionInput(gridDriven),1/120);if(!gridDriven.awaitingStart&&!crossed){crossed=true;assert.equal(gridDriven.lastLapValid,null);assert.equal(gridDriven.laps,0);}}
assert.equal(gridDriven.laps,3,'physical start behind the line followed by three valid laps');
const rescued=new TestCar(data);for(let i=0;i<120*900&&(rescued.laps<1||rescued.surface.s<600);i++)rescued.step(recognitionInput(rescued),1/120);
const kept={laps:rescued.laps,best:rescued.best,clock:rescued.clock,lapStart:rescued.lapStart,nextCheckpoint:rescued.nextCheckpoint,s:rescued.surface.s};
rescued.x+=rescued.surface.lx*9;rescued.y+=rescued.surface.ly*9;rescued.vx=rescued.vy=15;rescued.settle();rescued.recover();
assert.deepEqual({laps:rescued.laps,best:rescued.best,clock:rescued.clock,lapStart:rescued.lapStart,nextCheckpoint:rescued.nextCheckpoint},{laps:kept.laps,best:kept.best,clock:kept.clock,lapStart:kept.lapStart,nextCheckpoint:kept.nextCheckpoint},'R keeps the lap count, best lap and race clock');
assert(Math.hypot(rescued.vx,rescued.vy)===0&&Math.abs(rescued.surface.d)<.5&&Math.abs(rescued.surface.s-kept.s)<5,'R puts the car at rest on the centre line where it was');
for(let i=0;i<120*900&&rescued.laps<2;i++)rescued.step(recognitionInput(rescued),1/120);assert.equal(rescued.laps,2,'the recovered lap still counts');
console.log('Laps passed: runoff, small excursions, actual shortcuts, invalid laps, recovery, reverse, slipping back over the line, handbrake turns over the line, checkpoints, three-lap rivals and three complete simulated laps.');
