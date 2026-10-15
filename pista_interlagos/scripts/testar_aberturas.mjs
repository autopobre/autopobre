// Hinged parts of the V06 Opala (teste/car-openings.js), with the hinges read from the game's
// own GLBs: each part must open the right way, shut again, and follow the pit crew.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {CarOpenings,OPENINGS,shutOpenings,carSpot} from '../teste/car-openings.js';
import {PitStop} from '../teste/pitstop.js';
const ASSETS=new URL('../teste/assets/',import.meta.url);
// The GLB's JSON chunk: node names, translations and extras (no textures needed here).
function glbNodes(file){const b=readFileSync(new URL(file,ASSETS)),length=b.readUInt32LE(12);return JSON.parse(b.subarray(20,20+length).toString()).nodes;}
// The car's hinge empties as three.js builds them (extras -> userData), each with a marker
// where its part reaches farthest from the hinge, so the test sees which way it moves.
const REACH={[OPENINGS.hood]:[1.2,0,0],[OPENINGS.trunk]:[-.55,0,0],[OPENINGS.driverDoor]:[-1.1,.4,0],[OPENINGS.passengerDoor]:[-1.1,.4,0],
 [OPENINGS.fuelCaps[0]]:[-.06,0,0],[OPENINGS.fuelCaps[1]]:[-.06,0,0]};
function carFrom(nodes){
 const root=new THREE.Group();root.name='OPALA_99_ROOT';
 for(const n of nodes.filter(n=>n.extras?.peca)){const o=new THREE.Object3D();o.name=n.name;o.position.fromArray(n.translation??[0,0,0]);if(n.rotation)o.quaternion.fromArray(n.rotation);o.userData={...n.extras};
  const tip=new THREE.Object3D();tip.name=n.name+'_ponta';tip.position.fromArray(REACH[n.name]??[0,0,0]);o.add(tip);root.add(o);}
 root.updateMatrixWorld(true);return root;
}
const tip=(root,name)=>{root.updateMatrixWorld(true);return root.getObjectByName(name+'_ponta').getWorldPosition(new THREE.Vector3());};
const run=(openings,seconds)=>{for(let t=0;t<seconds;t+=1/60)openings.update(1/60);};

for(const livery of ['seiva_danilo','assinaturas_omp']){
 const nodes=glbNodes(`opala99_${livery}.glb`),car=carFrom(nodes),openings=new CarOpenings().attach(car);
 // The game GLB leaves the interior out (the cockpit is built at runtime) and keeps every hinge unrotated.
 assert(!nodes.some(n=>n.name==='Interior_do_jogo'),`${livery}: GLB do jogo sem o interior`);
 for(const name of [OPENINGS.hood,OPENINGS.trunk,OPENINGS.driverDoor,OPENINGS.passengerDoor,...OPENINGS.fuelCaps]){assert(openings.has(name),`${livery}: ${name}`);assert(!nodes.find(n=>n.name===name).rotation,`${livery}: ${name} fechado no GLB`);}
 assert(!openings.has('Motor_CONJUNTO')&&!openings.has('Saia_dianteira_PIVO'),'static parts are not hinges');
 const closed=Object.fromEntries([...openings.parts.keys()].map(n=>[n,tip(car,n)]));
 for(const name of openings.parts.keys())openings.hold(name,'teste');run(openings,4);
 const moved=name=>tip(car,name).sub(closed[name]);
 // Hood and lid rise at their free ends; doors swing out on their own side (driver: -Z);
 // the filler caps on the passenger side (+Z) swing out too.
 assert(moved(OPENINGS.hood).y>.8,`${livery}: capô levanta a frente (${moved(OPENINGS.hood).y.toFixed(2)})`);
 assert(moved(OPENINGS.trunk).y>.4,`${livery}: tampa levanta a traseira`);
 assert(moved(OPENINGS.driverDoor).z<-.8&&moved(OPENINGS.passengerDoor).z>.8,`${livery}: portas abrem para fora`);
 for(const cap of OPENINGS.fuelCaps)assert(moved(cap).z>.04,`${livery}: ${cap} abre para fora`);
 assert(Object.values(openings.info()).every(p=>p.open===1),'all fully open');
 openings.release('teste');run(openings,4);
 for(const name of openings.parts.keys())assert(tip(car,name).distanceTo(closed[name])<1e-6,`${livery}: ${name} fecha de novo`);
}

// Timing: a pulse opens the door and shuts it again; the hood takes longer than a door.
{const car=carFrom(glbNodes('opala99_seiva_danilo.glb')),o=new CarOpenings().attach(car);
 o.pulse(OPENINGS.driverDoor,1.6);o.hold(OPENINGS.hood,'teste');run(o,.5);
 const door=o.info()[OPENINGS.driverDoor].open,hood=o.info()[OPENINGS.hood].open;assert(door>hood&&door>.6,`porta abre mais rápido que o capô (${door}, ${hood})`);
 run(o,.9);assert.equal(o.info()[OPENINGS.driverDoor].open,1);assert.deepEqual(o.info()[OPENINGS.driverDoor].reasons,['passagem']);
 run(o,.3);assert.deepEqual(o.info()[OPENINGS.driverDoor].reasons,[],'the pulse ends at 1.6 s');
 run(o,1);assert.equal(o.info()[OPENINGS.driverDoor].open,0,'door shut after the pulse');
 // Manual toggle, and closeAll(true) snaps everything shut at once.
 assert.equal(o.toggle(OPENINGS.trunk),true);assert(o.held(OPENINGS.trunk,'manual'));assert.equal(o.toggle(OPENINGS.trunk),false);
 o.closeAll(true);assert(Object.values(o.info()).every(p=>p.open===0&&!p.reasons.length));
 // A car without hinges (V05) has nothing to open.
 const bare=new CarOpenings().attach(new THREE.Group());assert.equal(bare.parts.size,0);assert.equal(bare.toggle(OPENINGS.hood),false);bare.hold(OPENINGS.hood,'x');bare.update(1);
 // Copies for rivals keep every hinge shut even if the template was open.
 o.hold(OPENINGS.hood,'teste');run(o,2);const copy=car.clone(true);shutOpenings(copy);
 assert(copy.getObjectByName(OPENINGS.hood).quaternion.equals(new THREE.Quaternion()),'rival copy shut');
 assert(!car.getObjectByName(OPENINGS.hood).quaternion.equals(new THREE.Quaternion()),'player car untouched');}

// Pit crew: the hood opens for the engine, the lid for the fuel cell, the caps while refuelling;
// everything the crew or the H/T keys opened shuts when the stop ends.
{const car=carFrom(glbNodes('opala99_seiva_danilo.glb')),o=new CarOpenings().attach(car),pit=Object.create(PitStop.prototype);
 Object.assign(pit,{opened:true,openings:o,service:{jobs:[{id:'motor'},{id:'fuel'}]},render(){}});
 pit.syncOpenings();assert(o.held(OPENINGS.hood,'equipe')&&!o.held(OPENINGS.trunk,'equipe'));assert(OPENINGS.fuelCaps.every(n=>o.held(n,'equipe')));
 pit.service.jobs=[{id:'tanque'}];pit.syncOpenings();assert(!o.held(OPENINGS.hood,'equipe')&&o.held(OPENINGS.trunk,'equipe'));
 assert.equal(pit.toggleOpening('hood'),true);assert(o.held(OPENINGS.hood,'manual'));
 pit.opened=false;assert.equal(pit.toggleOpening('trunk'),false,'no keys once the stop ended');
 o.release('manual');pit.syncOpenings();assert(Object.values(o.info()).every(p=>!p.reasons.length),'all shut after the stop');}

// One action key, GTA style: where the pilot on foot stands says what it does (car frame: +x ahead,
// driver's side -z). The pit works it out from the car's heading.
{const spot=(x,z)=>carSpot({x,z});
 assert.equal(spot(2.8,0),'capo');assert.equal(spot(2.2,-1.1),'capo');assert.equal(spot(-2.8,.4),'porta_malas');assert.equal(spot(.2,-1.6),'porta');
 for(const [x,z] of [[0,1.6],[5,0],[-4,0],[0,-3],[1.6,-1.6],[0,0]])assert.equal(spot(x,z),null,`nothing at ${x},${z}`);
 const car=carFrom(glbNodes('opala99_seiva_danilo.glb')),o=new CarOpenings().attach(car),pit=Object.create(PitStop.prototype),hero=new THREE.Vector3();
 Object.assign(pit,{opened:true,openings:o,coffee:{},hero:{position:hero},service:{jobs:[]},cafeSeat:new THREE.Vector3(99,0,99),render(){},
  car:{x:10,y:-4,heading:Math.PI/2,surface:{z:0}}});
 // Heading 90 degrees: the nose points to -z in the scene (data +y); the driver's side is -x.
 hero.set(10,0,4-2.8);assert.equal(pit.interaction(),'capo');pit.interact();assert(o.held(OPENINGS.hood,'manual'),'E at the nose lifts the hood');
 hero.set(10,0,4+2.8);assert.equal(pit.interaction(),'porta_malas');pit.interact();assert(o.held(OPENINGS.trunk,'manual'));pit.interact();assert(!o.held(OPENINGS.trunk,'manual'),'E again shuts it');
 hero.set(10-1.6,0,4);assert.equal(pit.interaction(),'car','by the driver door: get in');
 // E there shuts or opens the door (user, 2026-10-15); F gets in.
 pit.coffee.held=[];assert.equal(pit.handleKey('KeyE'),true);assert(o.held(OPENINGS.driverDoor,'manual'),'E by the door opens it');
 pit.handleKey('KeyE');assert(!o.held(OPENINGS.driverDoor,'manual'),'E again shuts it');assert.equal(pit.coffee.held.length,0);
 assert.equal(pit.openingLabel('capo'),'Fechar o capô');pit.service.jobs=[{id:'motor'}];assert.match(pit.openingLabel('capo'),/equipe/);}
console.log('aberturas ok');
