import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RIVAL_ROSTER} from '../teste/race-roster.js';
import {bodyContact,resolveContact,RaceField} from '../teste/race-field.js';
import {TestCar,recognitionInput} from '../teste/physics.js';
const body=(x,y,heading=0,vx=0,vy=0)=>({x,y,heading,vx,vy,yaw:0});
let a=body(0,0,0,30),b=body(4.5,0,0,10);const momentum=a.vx+b.vx;const hit=resolveContact(a,b);assert(hit.speed>19);assert(!bodyContact(a,b));assert(Math.abs(a.vx+b.vx-momentum)<1e-8);assert(a.vx<30&&b.vx>10);
a=body(0,0,0,0,6);b=body(0,1.5);resolveContact(a,b);assert(!bodyContact(a,b));assert(a.vy<6&&b.vy>0);
a=body(0,0,0,25);b=body(3,1.3,Math.PI/5);resolveContact(a,b);assert(!bodyContact(a,b));assert(Math.abs(a.yaw)+Math.abs(b.yaw)>.05);
a=body(0,0);b=body(0,0,Math.PI/2);resolveContact(a,b);assert(!bodyContact(a,b));assert([a.x,a.y,b.x,b.y].every(Number.isFinite));
a=body(0,0);b=body(5,0);assert(!bodyContact(a,b));b=body(0,2);assert(!bodyContact(a,b));
// A car drawn from the network (remote: a guess some tenths old) pushes a car of this window only so hard: 4 m/s a contact,
// a few millimetres a resolution, however deep its correction lands it (the netcode study of 10-07, step 6); between
// two local cars nothing changes.
{const own=body(0,0,0,30),guess=body(4.5,0,0,10);guess.remote=true;const at=[own.x,own.y];resolveContact(own,guess);
 assert(Math.hypot(own.vx-30,own.vy)<=4+1e-9,'pushed at most 4 m/s');assert(Math.hypot(own.x-at[0],own.y-at[1])<=.008+1e-9,'shoved a few millimetres');assert(guess.vx>10,'the guess takes the rest');
 const deep=body(0,0),inside=body(.5,.2,.4);inside.remote=true;resolveContact(deep,inside);assert(Math.hypot(deep.x,deep.y)<=.008+1e-9);
 const free=body(0,0,0,30),other=body(4.5,0,0,10);resolveContact(free,other);assert(Math.abs(free.vx-30)>4,'two local cars: the full contact');}
// A 120 Hz simulation catches a closing speed much higher than race speeds.
a=body(-9,0,0,90);b=body(0,0);let collided=false;for(let i=0;i<30;i++){a.x+=a.vx/120;b.x+=b.vx/120;collided=!!resolveContact(a,b)||collided;}assert(collided);assert(a.x<b.x);assert(!bodyContact(a,b));
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url))),player=new TestCar(data),field=new RaceField(data,{seed:1});
for(let i=0;i<120*25;i++)field.step(player,1/120,false);
assert.equal(field.rivals.length,RIVAL_ROSTER.length);assert(field.rivals.every(r=>r.progress>100&&Number.isFinite(r.car.heading)));assert(field.rivals.every(r=>Math.abs(r.car.surface.d)<r.car.surface.width/2+1));
for(let i=0;i<field.rivals.length;i++)for(let j=i+1;j<field.rivals.length;j++){const hit=bodyContact(field.rivals[i].car,field.rivals[j].car);assert(!hit||hit.depth<.02);}
const challenger=new TestCar(data),fast=new RaceField(data,{seed:1});let maxOffroad=0;
for(let i=0;i<120*180;i++){challenger.step(recognitionInput(challenger),1/120);fast.step(challenger,1/120);for(const r of fast.rivals)maxOffroad=Math.max(maxOffroad,Math.abs(r.car.surface.d)-r.car.surface.width/2);}
assert(fast.rivals.filter(r=>r.progress>challenger.distance+100).length>=3,'most rivals beat the conservative recognition driver');assert(maxOffroad<3,'faster AI stays near the racing surface');
console.log('Collision tests passed: rotated bodies, side/corner/head-on contact, momentum, high closing speed, fourteen AI cars and 25 seconds of traffic.');
