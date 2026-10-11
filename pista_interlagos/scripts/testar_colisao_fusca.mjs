// The Fusca's own contact body (physics.js FUSCA_BODY) beside the Opala's, which keeps its old numbers: its plan
// against the game model, cars touching bumper to bumper and side to side, the guardrail and the pit walls, its
// shell upside down on its round roof, and a field of Fuscas racing without overlapping.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bodyContact,resolveContact,RaceField} from '../teste/race-field.js';
import {TestCar,HULL,FUSCA_HULL,OPALA_BODY,FUSCA_BODY,CG_HEIGHT,guardrailPresent,guardrailClearance,recognitionInput,wrap} from '../teste/physics.js';
import {pitGeometry,wallContact} from '../teste/pit-lane.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const near=(a,b,tolerance,name)=>assert(Math.abs(a-b)<=tolerance,`${name}: ${a} vs ${b}`);
const metrics={};

// --- The Opala's body is the one its contacts always used.
assert.deepEqual({...OPALA_BODY,hull:undefined,mechanics:undefined},{name:'opala',halfLength:2.38,halfWidth:.93,ahead:.08,wallAhead:0,front:2.42,rear:2.35,hull:undefined,mechanics:undefined});
assert.equal(OPALA_BODY.hull,HULL);assert.equal(HULL.length,23);assert.deepEqual(HULL[0],[2.25,.75,-.28]);assert.deepEqual(HULL[8],[-1.4,0,-.41]);
assert.equal(new TestCar(data).body.name,'opala','a car is an Opala unless given another body');

// --- The Fusca's plan and shell against its game model (accessors' bounds, every node but the wheels, its
// steering wheel and the door mirrors, which stand out of the body as a car's do). glTF: +x forward, +y up, -z the left; the physics' y is the left, z up from the centre of mass.
function modelBounds(file){
 const glb=fs.readFileSync(new URL(file,import.meta.url)),length=glb.readUInt32LE(12),json=JSON.parse(glb.toString('utf8',20,20+length));
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const rotate=(q,v)=>{const u=q.slice(0,3),t=cross(u,v).map(x=>2*x),c=cross(u,t);return v.map((x,i)=>x+q[3]*t[i]+c[i]);};
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 const walk=(index,chain)=>{const node=json.nodes[index];if(/^Roda_.*_PIVO|^Volante_Fusca|_Retrovisores$/.test(node.name??''))return;const here=[...chain,node];
  if(node.mesh!==undefined)for(const primitive of json.meshes[node.mesh].primitives){const a=json.accessors[primitive.attributes.POSITION];
   for(const corner of [0,1,2,3,4,5,6,7].map(k=>[k&1?a.max[0]:a.min[0],k&2?a.max[1]:a.min[1],k&4?a.max[2]:a.min[2]])){
    let p=corner;for(const n of [...here].reverse()){p=p.map((v,i)=>v*(n.scale?.[i]??1));if(n.rotation)p=rotate(n.rotation,p);p=p.map((v,i)=>v+(n.translation?.[i]??0));}
    for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}}}
  for(const child of node.children??[])walk(child,here);};
 for(const root of json.scenes[json.scene??0].nodes)walk(root,[]);
 return {front:hi[0],rear:-lo[0],halfWidth:Math.max(hi[2],-lo[2]),top:hi[1]};
}
const model=metrics.model=modelBounds('../teste/assets/fusca_v2.glb');
near(FUSCA_BODY.front,model.front,.01,'Fusca nose');near(FUSCA_BODY.rear,model.rear,.01,'Fusca rear: the foot of its open engine lid');
assert(FUSCA_BODY.halfWidth>=model.halfWidth&&FUSCA_BODY.halfWidth-model.halfWidth<.01,`Fusca fenders ${model.halfWidth}`);
near(FUSCA_BODY.halfLength,(FUSCA_BODY.front+FUSCA_BODY.rear)/2,.002,'Fusca box length');near(FUSCA_BODY.ahead,(FUSCA_BODY.front-FUSCA_BODY.rear)/2,.002,'Fusca box centre');
assert.equal(FUSCA_BODY.wallAhead,FUSCA_BODY.ahead);assert.equal(FUSCA_BODY.hull,FUSCA_HULL);
for(const [x,y,z] of FUSCA_HULL)assert(x<=FUSCA_BODY.front+.001&&x>=-FUSCA_BODY.rear-.001&&Math.abs(y)<=FUSCA_BODY.halfWidth&&z+CG_HEIGHT>.05&&z+CG_HEIGHT<=model.top+.01,`shell point ${[x,y,z]}`);
near(Math.max(...FUSCA_HULL.map(p=>p[2]))+CG_HEIGHT,model.top,.02,'the shell reaches the top of the roof');
assert(FUSCA_HULL.slice(0,9).every(p=>p[2]+CG_HEIGHT>.06&&p[2]+CG_HEIGHT<.14),'lowered as a Copa Fusca: its low points 6 to 14 cm off the ground (the Opala: 11 to 24 cm)');

// --- Cars touching: bumper to bumper, side by side, a Fusca behind an Opala.
const car=(x,y,body,heading=0,vx=0,vy=0)=>({x,y,heading,vx,vy,yaw:0,body});
const touch=(gap,a,b,across=false)=>[gap-.01,gap+.01].map(d=>!!bodyContact(car(0,0,a),across?car(0,d,b):car(d,0,b)));
const touching=metrics.touching={fuscas:FUSCA_BODY.front+FUSCA_BODY.rear,opalas:2*OPALA_BODY.halfLength,fuscaBehindOpala:FUSCA_BODY.front+OPALA_BODY.halfLength-OPALA_BODY.ahead,
 fuscasSide:2*FUSCA_BODY.halfWidth,opalasSide:2*OPALA_BODY.halfWidth};
assert.deepEqual(touch(touching.fuscas,FUSCA_BODY,FUSCA_BODY),[true,false],'two Fuscas meet nose to tail');
assert.deepEqual(touch(touching.opalas,OPALA_BODY,OPALA_BODY),[true,false],'two Opalas as before');
assert.deepEqual(touch(touching.fuscaBehindOpala,FUSCA_BODY,OPALA_BODY),[true,false],'a Fusca nose into an Opala tail');
assert.deepEqual(touch(touching.fuscasSide,FUSCA_BODY,FUSCA_BODY,true),[true,false],'two Fuscas side by side');
assert.deepEqual(touch(touching.opalasSide,OPALA_BODY,OPALA_BODY,true),[true,false],'two Opalas side by side');
assert.deepEqual(touch(touching.opalas,OPALA_BODY,undefined),[true,false],'a car without a body (a remote car) is an Opala');
{const a=car(0,0,FUSCA_BODY,0,30),b=car(touching.fuscas-.024,0,FUSCA_BODY,0,10),momentum=a.vx+b.vx,hit=resolveContact(a,b);
 assert(hit&&hit.speed>19&&!bodyContact(a,b)&&Math.abs(a.vx+b.vx-momentum)<1e-8&&a.vx<30&&b.vx>10,'a Fusca rear-ending another trades momentum and separates');}
{const a=car(0,0,FUSCA_BODY,0,25),b=car(2.9,1.1,FUSCA_BODY,Math.PI/5);resolveContact(a,b);assert(!bodyContact(a,b)&&Math.abs(a.yaw)+Math.abs(b.yaw)>.05,'a glancing blow spins them');}

// --- On flat ground, as testar_capotagem's cars: the guardrail and the pit walls, and upside down.
const idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};
function flat(body){const c=new TestCar(data).setBody(body);c.sample=(x=0,y=0)=>({i:0,u:0,s:500,d:y,z:0,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true});c.reset();c.x=c.y=c.heading=0;c.settle();return c;}
for(const body of [OPALA_BODY,FUSCA_BODY])near(flat(body).z,CG_HEIGHT,.001,`${body.name} rests on its wheels`);
// Upside down on its roof, before the marshals come: the race Fusca, 19 cm lower than the street car, rests on its
// dome (82 cm over its centre of mass) lower than the Opala on its flat roof.
const roofRest=body=>{const c=flat(body);c.roll=Math.PI;c.z=2.2;for(let i=0;i<240;i++)c.step(idle,1/120);return {height:c.z,upright:c.upright,rightings:c.rightings};};
const rest=metrics.upsideDown={opala:roofRest(OPALA_BODY),fusca:roofRest(FUSCA_BODY)};
assert(rest.opala.upright<-.9&&rest.fusca.upright<-.9&&!rest.opala.rightings&&!rest.fusca.rightings,'both still on their roofs');
near(rest.opala.height,.86,.05,'the Opala on its roof');assert(rest.fusca.height>.7&&rest.fusca.height<.84,`the Fusca on its dome: ${rest.fusca.height}`);
// The guardrail: pushed sideways into it, held at an angle to the road, the centre of mass stops where the body's
// plan meets the rail: halfWidth alongside, plus halfLength and wallAhead as the nose turns in. Where the rail runs
// parallel to the car: straight, and the road's width and the rail's clearance steady along the car. Elsewhere
// physics.js meets the rail point by point (BODY_POINTS): a rail closing in as the road narrows (1 cm a metre at
// Interlagos' 926 m) stops the car on its nose's corner, its middle 1.5 to 2 cm off the rail.
function railStop(body,angle){
 const n=data.samples.length,head=k=>Math.atan2(data.samples[k][8],data.samples[k][7]),line=k=>data.samples[k][4]/2+guardrailClearance(data,data.samples[k][0],1);
 const parallel=k=>k>=6&&k<n-6&&Math.abs(wrap(head(k+6)-head(k-6)))<.004&&Math.abs(line(k+3)-line(k-3))<.003;
 const i=data.samples.findIndex((p,k)=>guardrailPresent(data,p[0],1)&&guardrailPresent(data,p[0]+40,1)&&guardrailPresent(data,p[0]-40,1)&&parallel(k));assert(i>=0,'a parallel stretch of rail');
 const c=new TestCar(data).setBody(body);c.reset(i);const r=c.surface,wall=s=>s.width/2+guardrailClearance(data,s.s,1)-.12;
 c.x+=r.lx*(wall(r)-2.6);c.y+=r.ly*(wall(r)-2.6);c.heading=Math.atan2(r.ty,r.tx)+angle;c.settle();
 for(let k=0;k<240;k++){const q=c.surface;c.heading=Math.atan2(q.ty,q.tx)+angle;c.yaw=0;c.vx=q.lx*4;c.vy=q.ly*4;c.step(idle,1/120);}
 const f=c.surface,a=wrap(c.heading-Math.atan2(f.ty,f.tx));
 return {gap:+(wall(f)-f.d).toFixed(4),expected:+(body.halfWidth*Math.abs(Math.cos(a))+body.halfLength*Math.abs(Math.sin(a))+body.wallAhead*Math.sin(a)).toFixed(4)};
}
const rail=metrics.guardrail={opala:railStop(OPALA_BODY,0),fusca:railStop(FUSCA_BODY,0),opalaNoseIn:railStop(OPALA_BODY,.3),fuscaNoseIn:railStop(FUSCA_BODY,.3)};
for(const [name,stop] of Object.entries(rail))near(stop.gap,stop.expected,.005,`${name} against the rail`);
near(rail.opala.gap,OPALA_BODY.halfWidth,.005,'Opala alongside the rail');near(rail.fusca.gap,FUSCA_BODY.halfWidth,.005,'Fusca alongside the rail');
assert(rail.fusca.gap<rail.opala.gap-.12,'the Fusca gets 16 cm closer to the rail');
// The pit walls: a wall segment of the surveyed pit lane, the car parallel to it and then nose first.
const geo=pitGeometry(data),segment=[...geo.wallGrid.values()].flat().find(w=>Math.hypot(w.x2-w.x1,w.y2-w.y1)>3);
const ux=(segment.x2-segment.x1)/Math.hypot(segment.x2-segment.x1,segment.y2-segment.y1),uy=(segment.y2-segment.y1)/Math.hypot(segment.x2-segment.x1,segment.y2-segment.y1),mx=(segment.x1+segment.x2)/2,my=(segment.y1+segment.y2)/2;
// Coming in from the side of the segment where no other wall is met first; facing it, or along it.
const reachAt=(body,facing)=>{for(const side of [1,-1]){const nx=-uy*side,ny=ux*side,heading=facing?Math.atan2(-ny,-nx):Math.atan2(uy,ux);
 for(let d=4;d>0;d-=.005){const hit=wallContact(geo,mx+nx*d,my+ny*d,heading,body);if(!hit)continue;if(hit.name===segment.name&&Math.abs(hit.nx*nx+hit.ny*ny)>.99)return +(d-segment.half).toFixed(3);break;}}
 throw new Error('pit wall: no clear side');};
const pit=metrics.pitWall={opala:reachAt(undefined,false),fusca:reachAt(FUSCA_BODY,false),opalaNose:reachAt(undefined,true),fuscaNose:reachAt(FUSCA_BODY,true)};
near(pit.opala,OPALA_BODY.halfWidth,.01,'Opala alongside the pit wall');near(pit.fusca,FUSCA_BODY.halfWidth,.01,'Fusca alongside the pit wall');
near(pit.opalaNose,OPALA_BODY.halfLength,.01,'Opala nose to the pit wall (box round the centre of mass, as before)');near(pit.fuscaNose,FUSCA_BODY.front,.01,'Fusca nose to the pit wall: its nose');

// --- A field of Fuscas behind a Fusca: every rival takes the body at the reset, none overlaps another.
const player=new TestCar(data).setBody(FUSCA_BODY),field=new RaceField(data,{seed:1,body:FUSCA_BODY});player.resetGrid();field.reset(player.surface.s,{grid:true});
assert(field.rivals.every(r=>r.car.body===FUSCA_BODY&&Math.abs(r.car.z-r.car.surface.z-CG_HEIGHT)<.12),'the grid in Fuscas, settled on their wheels');
let deepest=0,contacts=0;const before=field.collisions;
for(let i=0;i<120*25;i++){player.step(recognitionInput(player),1/120);field.step(player,1/120,3);
 for(let a=0;a<field.rivals.length;a++)for(let b=a+1;b<field.rivals.length;b++){const hit=bodyContact(field.rivals[a].car,field.rivals[b].car);if(hit){contacts++;deepest=Math.max(deepest,hit.depth);}}}
metrics.fuscaField={rivals:field.rivals.length,collisions:field.collisions-before,overlapsSeen:contacts,deepest:+deepest.toFixed(3),leaderProgress:Math.round(Math.max(...field.rivals.map(r=>r.progress)))};
assert(field.rivals.every(r=>Number.isFinite(r.car.x+r.car.y+r.car.z)&&r.progress>100),'every Fusca races off the grid');assert(deepest<.05,`no Fusca sinks into another: ${deepest}`);
// Without a body the field races Opalas (race-field.js loads physics.js under its own URL: compared by name).
const opala=new RaceField(data,{seed:1});opala.reset(new TestCar(data).surface.s,{grid:true});assert(opala.rivals.every(r=>r.car.body.name==='opala'&&r.car.body.halfLength===2.38));
console.log(JSON.stringify(metrics,null,1));
console.log('Fusca collision passed: Opala body unchanged, Fusca plan and shell from its model, nose-to-tail and side contacts, guardrail, pit wall, roof and a racing field.');
