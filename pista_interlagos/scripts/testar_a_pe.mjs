// Sair do carro em qualquer ponto da pista (teste/free-walk.js, F como no GTA): o carro freia ate parar e o piloto desce
// pela porta do motorista; a pe anda, corre e pula; o guard-rail so se passa pulando, o muro de um circuito de rua nunca;
// um rival em velocidade atropela (voo de desenho animado) e ele levanta onde caiu; perto do carro F leva ate a porta
// e entra; longe, avisa a distancia; no box, F espera o pit stop abrir.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {TestCar,OPALA_BODY,guardrailPresent,guardrailClearance} from '../teste/physics.js';
import {takePeopleEvents,OUTFITS,STEVAN_OUTFITS} from '../teste/pit-crew.js';

// The pilot's overalls carry the 99 painted on a canvas: a do-nothing canvas is enough here.
const ctx=new Proxy({},{get:(target,key)=>key in target?target[key]:()=>({width:0})});
globalThis.document??={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
const {FreeWalk,pilotOutfit}=await import('../teste/free-walk.js');

const load=id=>{const d=JSON.parse(fs.readFileSync(new URL(`../dados/${id==='interlagos'?'pista':'pista_'+id}.json`,import.meta.url)));d.meta.id=id;return d;};
const DT=1/120,FRAME=1/60;
function setup(id){
 const data=load(id),car=new TestCar(data),scene=new THREE.Scene(),driver={root:{visible:true}},calls={out:0,in:0},sounds=[];
 const parts=new Map(),openings={has:()=>true,toggle:name=>{const on=!parts.get(name);parts.set(name,on);return on;},held:name=>!!parts.get(name),pulse:()=>{}};
 const walk=new FreeWalk({scene,car,driver,openings,hud:false,emit:name=>sounds.push(name),onOut:()=>calls.out++,onIn:()=>calls.in++});
 return {data,car,walk,driver,calls,sounds,parts};
}
// A station on a straight with a guardrail on the left (the driver's side), far from the pit lane.
function railStation(data,car,side=1){
 const a=data.samples;
 for(let i=Math.floor(a.length*.3);i<a.length;i++){
  const p=a[i],q=a[(i+8)%a.length],turn=Math.abs(Math.atan2(p[7]*q[8]-p[8]*q[7],p[7]*q[7]+p[8]*q[8]));
  if(turn>.02||!guardrailPresent(data,p[0],side)||!guardrailPresent(data,p[0]+30,side)||!guardrailPresent(data,p[0]-30,side))continue;
  const reach=p[4]/2+guardrailClearance(data,p[0],side)+2,x=p[1]-p[8]*reach*side,y=p[2]+p[7]*reach*side,s=car.sample(x,y,i);
  if(s.pitS===null&&!s.pit&&!s.abyss)return i;
 }
 throw new Error('no straight with a guardrail');
}
// Physics steps with the walk's command until it says so.
function brakeOut(car,walk,seconds,wait=false){let t=0;for(;t<seconds&&!walk.active;t+=DT){const command={throttle:1,brake:0,left:0,right:0,reverse:0,handbrake:0};walk.drive(command,{wait});car.step(command,DT);}return t;}
const walkFor=(walk,seconds,input,extra={})=>{for(let t=0;t<seconds;t+=FRAME)walk.update(FRAME,null,{input,...extra});};
const outAt=(data,car,walk)=>walk.side(walk.hero.position.x,-walk.hero.position.z);

// 1. Interlagos: F at 110 km/h stops the car and he gets out by the driver's door.
{
 const {data,car,walk,driver,calls,sounds}=setup('interlagos'),i=railStation(data,car);
 car.recover(i);car.vx=Math.cos(car.heading)*30;car.vy=Math.sin(car.heading)*30;
 assert.equal(walk.request(),true,'F asks to get out');assert.equal(walk.stopping,true);
 const took=brakeOut(car,walk,12);
 assert.ok(walk.active,`the car stopped and he got out (${took.toFixed(1)} s)`);
 assert.ok(took>1.5&&took<9,`braking from 108 km/h takes a few seconds, not none (${took.toFixed(1)} s)`);
 assert.ok(Math.hypot(car.vx,car.vy)<.7,'the car is at rest');
 assert.equal(calls.out,1,'main.js hears he is out');assert.ok(sounds.includes('click'),'the door clicks');
 assert.ok(walk.doorDistance()<.6,`he stands at the driver's door (${walk.doorDistance().toFixed(2)} m)`);
 const ground=car.sample(walk.hero.position.x,-walk.hero.position.z).z-.055;
 assert.ok(Math.abs(walk.hero.position.y-ground)<.05,'on the ground beside it');
 walk.update(FRAME,null,{});assert.equal(driver.root.visible,false,'the seat is empty while he walks');
 // Out of the car it waits on its brakes, whatever the keys say.
 const command={throttle:1,brake:0,left:1,right:0,reverse:1,handbrake:0};walk.drive(command);
 assert.deepEqual([command.throttle,command.brake,command.left,command.reverse],[0,1,0,0],'the parked car ignores the pedals');
 for(let t=0;t<2;t+=DT){const c={throttle:1,brake:0,left:0,right:0,reverse:0,handbrake:0};walk.drive(c);car.step(c,DT);}
 assert.ok(Math.hypot(car.vx,car.vy)<.2,'and stays put');

 // 2. He walks (3 m/s) and runs (6.2 m/s) where the camera looks; the car is solid.
 const s=walk.foot,start=walk.hero.position.clone();s.yaw=car.heading;
 walkFor(walk,1,{throttle:1,brake:0,left:0,right:0});const walked=walk.hero.position.distanceTo(start);
 assert.ok(walked>2.4&&walked<3.3,`walking pace (${walked.toFixed(2)} m in 1 s)`);
 const before=walk.hero.position.clone();walkFor(walk,1,{throttle:1,brake:0,left:0,right:0},{shift:true});const ran=walk.hero.position.distanceTo(before);
 assert.ok(ran>5&&ran<6.5,`running pace (${ran.toFixed(2)} m in 1 s)`);
 assert.ok(sounds.includes('footstep'),'footsteps');
 // Back beside the car, walking into its side: he stops at its body.
 walk.hero.position.copy(walk.carPoint(.15,2.2));s.floor=walk.hero.position.y;s.yaw=car.heading-Math.PI/2;
 walkFor(walk,2,{throttle:1,brake:0,left:0,right:0});
 const side=Math.hypot(walk.hero.position.x-car.x,walk.hero.position.z+car.y);
 assert.ok(side>OPALA_BODY.halfWidth+.2,`the car's body stops him (${side.toFixed(2)} m from its middle)`);

 // 3. The guardrail: walking into it he stops at it; a jump takes him over.
 walk.hero.position.copy(walk.carPoint(.15,1.6));s.floor=walk.hero.position.y;s.yaw=car.heading+Math.PI/2;
 walkFor(walk,8,{throttle:1,brake:0,left:0,right:0});
 let at=outAt(data,car,walk);
 assert.ok(at.out<=0&&at.out>-.6,`stopped at the guardrail (${at.out.toFixed(2)} m from its face)`);
 walk.handleKey('Space');walkFor(walk,1.2,{throttle:1,brake:0,left:0,right:0});
 at=outAt(data,car,walk);assert.ok(at.out>.3,`over the guardrail in a jump (${at.out.toFixed(2)} m past it)`);
 // And back over it the same way.
 s.yaw+=Math.PI;walkFor(walk,1.5,{throttle:1,brake:0,left:0,right:0});at=outAt(data,car,walk);assert.ok(at.out>0,'from behind it stops him too');
 walk.handleKey('Space');walkFor(walk,1.2,{throttle:1,brake:0,left:0,right:0});at=outAt(data,car,walk);assert.ok(at.out<0,'and a jump brings him back');

 // 4. A rival through where he stands throws him; he lands, gets up dizzy, shakes his fist, and walks on from there.
 takePeopleEvents();const p=walk.hero.position,h=car.heading;
 const rival={x:p.x-Math.cos(h)*3,y:-p.z-Math.sin(h)*3,z:car.z,vx:Math.cos(h)*25,vy:Math.sin(h)*25,heading:h,body:OPALA_BODY};
 walk.update(FRAME,null,{rivals:[{car:rival}]});assert.equal(walk.tumble,null,'3 m behind him: not yet');
 rival.x+=Math.cos(h)*2.5;rival.y+=Math.sin(h)*2.5;walk.update(FRAME,null,{rivals:[{car:rival}]});
 assert.ok(walk.tumble,'run over');assert.ok(takePeopleEvents().some(e=>e.sound==='bonk'),'bonk');
 rival.vx=rival.vy=0;rival.x+=60;
 const floor=walk.foot.floor,phases=new Set();let high=-Infinity,t=0;
 for(;t<15&&walk.tumble;t+=FRAME){phases.add(walk.tumble.phase);walk.update(FRAME,null,{rivals:[{car:rival}]});high=Math.max(high,walk.hero.position.y);}
 assert.ok(!walk.tumble&&walk.active,`on his feet again after ${t.toFixed(1)} s`);
 for(const phase of ['fly','lie','rise','dizzy','fist'])assert.ok(phases.has(phase),'the cartoon: '+phase);
 assert.ok(high>floor+1.5,`thrown high (${(high-floor).toFixed(1)} m)`);
 assert.ok(Math.abs(walk.hero.rotation.x)<1e-6&&Math.abs(walk.hero.rotation.z)<1e-6,'standing upright');
 const landed=walk.hero.position.clone();walkFor(walk,.5,{throttle:1,brake:0,left:0,right:0});assert.ok(walk.hero.position.distanceTo(landed)>.8,'and walks again');

 // 5. F: far from the car it says where the car is; a few metres off he walks to the door and gets in.
 walk.hero.position.copy(walk.carPoint(-40,1.5));s.floor=walk.hero.position.y;
 assert.equal(walk.getIn(),false,'too far to get in');assert.match(walk.info().message,/\d+ m/,'he is told how far');
 walk.hero.position.copy(walk.carPoint(-4.5,1.4));s.floor=walk.hero.position.y;s.yaw=car.heading+2;
 assert.equal(walk.getIn(),true,'close enough');assert.ok(walk.goingIn,'he walks to the door');
 for(t=0;t<4&&walk.active;t+=FRAME)walk.update(FRAME,null,{});
 assert.ok(!walk.active&&calls.in===1,`in the car again after ${t.toFixed(1)} s`);assert.equal(driver.root.visible,true,'back in his seat');
 const free={throttle:1,brake:0,left:0,right:0,reverse:0,handbrake:0};assert.equal(walk.drive(free),false,'the car is his again');assert.equal(free.throttle,1);

 // 6. E at the nose lifts the hood, at the door gets in.
 car.vx=car.vy=0;walk.request();brakeOut(car,walk,1);assert.ok(walk.active,'at rest he is out at once');
 walk.hero.position.copy(walk.carPoint(3,0));s.floor=walk.hero.position.y;
 assert.equal(walk.spot(),'capo');assert.equal(walk.actionLabel(),'abrir o capô');walk.handleKey('KeyE');assert.equal(walk.actionLabel(),'fechar o capô','E lifts the hood');
 walk.hero.position.copy(walk.carPoint(.15,1.3));walk.handleKey('KeyE');assert.ok(!walk.active,'E at the door gets in');

 // 7. F again while it brakes stays in; reset puts him back at once.
 car.vx=Math.cos(car.heading)*20;car.vy=Math.sin(car.heading)*20;walk.request();walk.request();assert.equal(walk.stopping,false,'changed his mind');
 car.vx=car.vy=0;walk.request();brakeOut(car,walk,1);walk.reset();assert.ok(!walk.active&&!walk.stopping,'reset: back in the car');
 // At the box the stop is the pit's: the car waits there for it to open.
 walk.request();brakeOut(car,walk,2,true);assert.ok(walk.stopping&&!walk.active,'waits for the pit stop to open');walk.cancel();
}

// 8. A street circuit's walls are never climbed, not even in a jump.
{
 const {data,car,walk}=setup('minhocao'),a=data.samples;let i=Math.floor(a.length/3);
 while(!guardrailPresent(data,a[i][0],1)||!guardrailPresent(data,a[i][0]+20,1)||!guardrailPresent(data,a[i][0]-20,1))i=(i+1)%a.length;
 car.recover(i);walk.request();brakeOut(car,walk,1);assert.ok(walk.active);
 const s=walk.foot;s.yaw=car.heading+Math.PI/2;walkFor(walk,6,{throttle:1,brake:0,left:0,right:0});
 let at=outAt(data,car,walk);assert.ok(at.out<=0,'the street wall stops him');
 for(let k=0;k<3;k++){walk.handleKey('Space');walkFor(walk,1.2,{throttle:1,brake:0,left:0,right:0});}
 at=outAt(data,car,walk);assert.ok(at.out<=0,`jumping does not take him over it (${at.out.toFixed(2)})`);
}

// 9. The clothes: the 99's red overalls, another car's team colour, the story's stage.
assert.equal(pilotOutfit(),OUTFITS.driver);
assert.equal(pilotOutfit({entry:{color:0x2266cc}}).top,0x2266cc);assert.equal(pilotOutfit({entry:{color:0x2266cc}}).back,false,'no 99 on another team');
assert.equal(pilotOutfit({career:{intro:false,gear:[]}}),STEVAN_OUTFITS.civil);
assert.equal(pilotOutfit({career:{intro:true,gear:['macacao']}}),STEVAN_OUTFITS.proprio);
console.log('testar_a_pe: ok');
