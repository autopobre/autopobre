import assert from 'node:assert/strict';
import {CarAudio,heardRevs,freeRevFall} from '../teste/car-audio.js';
import {soundDefaults} from '../teste/sound-tuning.js';
const audio=new CarAudio(),car={vx:0,vy:0,surface:{onRoad:true}};
function update(speed,command={},skid=0,paused=false){car.vx=speed/3.6;return audio.update(car,command,skid,paused,'chase');}
update(30);assert.equal(audio.shifts,0);assert.equal(audio.state.gear,1);
update(44);assert.equal(audio.shifts,1);assert.equal(audio.state.gear,2);
for(let i=0;i<100;i++)update(i%2?41:43);
assert.equal(audio.shifts,1,'Threshold jitter must not cause repeated shift sounds');
update(39);assert.equal(audio.shifts,2);assert.equal(audio.state.gear,1);
update(0,{},1);assert.equal(audio.state.skid,0,'No tyre squeal while parked');
car.surface.onRoad=false;update(60,{},1);assert.equal(audio.state.skid,0,'No asphalt squeal on grass');
car.surface.onRoad=true;update(60,{},.8);assert.equal(audio.state.skid,.8);
const rpm=audio.state.rpm,shifts=audio.shifts;update(150,{},0,true);assert.equal(audio.state.rpm,rpm);assert.equal(audio.shifts,shifts);
audio.reset();update(120);assert.equal(audio.shifts,shifts,'Reset must not produce a phantom shift');
update(10,{reverse:1});assert.equal(audio.state.gear,'R');assert(Number.isFinite(audio.state.rpm));
update(0,{throttle:1});assert.equal(audio.state.gear,'N');assert(audio.state.rpm>3000);
// Held at the start (user, 10-24): the throttle revs it in neutral, not first gear's launch, the manual gearbox too.
const held=new CarAudio(),grid={vx:0,vy:0,gear:1,rpm:950,surface:{onRoad:true}};
held.update(grid,{throttle:1,held:true},0,false,'chase');assert.equal(held.state.gear,'N');assert.equal(held.state.rpm,4150);
held.update({...grid,manualGear:true},{throttle:.5,held:true},0,false,'chase');assert.equal(held.state.gear,'N');assert.equal(held.state.rpm,2550);
held.update(grid,{throttle:1},0,false,'chase');assert.equal(held.state.gear,1,'Off the grid the throttle pulls in first');
// Revving free, the flywheel winds it down slowly, gentler toward idle: about 1-1.6 s from 4150 rpm, against the
// quick fall of a gear change (revFall).
const k=soundDefaults(),settle=fall=>{let rpm=4150,t=0;while(rpm>950&&t<5){rpm=heardRevs(rpm,950,1/60,k.revRise,fall(rpm));t+=1/60;}return t;};
const free=settle(rpm=>freeRevFall(rpm,k.freeFall)),geared=settle(()=>k.revFall);
assert(free>1&&free<1.6,`free rev settles in ${free.toFixed(2)} s`);assert(geared<.25);
assert(freeRevFall(4150,k.freeFall)===k.freeFall&&freeRevFall(950,k.freeFall)===.35*k.freeFall);
console.log(`Audio state passed: shifts, hysteresis, stationary/grass tyres, pause, reset, reverse and revving; held on the grid it revs free and winds down in ${free.toFixed(2)} s (a gear change: ${geared.toFixed(2)} s).`);
