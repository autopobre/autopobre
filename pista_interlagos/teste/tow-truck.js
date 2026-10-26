import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// The rescue that tows a broken car on its strap (the story's tow, immersive-visuals.js truckModel; multiplayer.js's
// trucks at the cars stopped on the road), signed by the game's joke sponsor GUINCHO QUEBROU-LIGOU, REBOQUE · SEM PRESSA
// facing the towed car. Two models, built in Blender by script:
// - caminhonete: the 4x4 double-cab pickup of the rescue (modelo_3d/caminhonete_v1, Central de Projetos #24), the one
//   the game uses;
// - guincho: the flatbed tow truck (modelo_3d/guincho_v1), kept for later; ?reboque=guincho shows it instead.
// Each faces +x with its wheels on y=0; the four wheels hang from unrotated pivots (Roda_*_PIVO) and roll as it moves.
// hook: where the strap hooks on, 2.45 m behind its centre for both (immersive-mode.js places the towed car by those
// 2.45 m); seat: where its driver (pit-crew.js person, seated: hips 47 cm over it) sits, on the left as in Brazil;
// wheel: the tyres' radius. The GLB comes in once, in the background, when the first truck is asked for (a circuit's
// load builds the story's), long before any breakdown: until then that truck is an empty group, the model cloned into
// it on arrival.
export const TOW_VEHICLES=Object.freeze({
 caminhonete:Object.freeze({url:'./assets/caminhonete_v1.glb?v=caminhonete-v1-1',hook:Object.freeze([-2.45,.43,0]),seat:Object.freeze([.30,.51,-.42]),wheel:.40}),
 guincho:Object.freeze({url:'./assets/guincho_v1.glb?v=guincho-v1-1',hook:Object.freeze([-2.45,.42,0]),seat:Object.freeze([1.80,.75,-.47]),wheel:.39}),
});
const asked=/[?&]reboque=([a-z]+)/.exec(globalThis.location?.search??'')?.[1];
export const TOW_VEHICLE=asked in TOW_VEHICLES?asked:'caminhonete';
export const TOW_HOOK=TOW_VEHICLES[TOW_VEHICLE].hook;
const SPIN_AXIS=new THREE.Vector3(0,0,1);
// Its lamps, each truck its own copy so that two trucks never flash together: the light bar's two halves (A and B
// take turns, two quick flashes each), the hazards (front corners, side repeaters, rear clusters).
const OWN_LAMPS=['Giroflex_A','Giroflex_B','Pisca_ambar'];
const BEACON_ON=7,BEACON_IDLE=.2,HAZARD_ON=4;

const models=new Map();let made=0;
export function loadTowTruck(kind=TOW_VEHICLE){
 let m=models.get(kind);if(!m)models.set(kind,m={template:null,loading:null});
 return m.loading??=new GLTFLoader().loadAsync(TOW_VEHICLES[kind].url).then(gltf=>m.template=prepare(gltf.scene)).catch(err=>{console.error(err);m.loading=null;return null;});
}
// Once for every truck: shadows, see-through glass, the stickers cut out of their atlas and drawn over the paint.
function prepare(scene){
 scene.traverse(o=>{
  if(!o.isMesh)return;const m=o.material;o.castShadow=!m.transparent;o.receiveShadow=true;
  if(m.name==='Vidro'){m.transparent=true;m.depthWrite=false;}
  if(m.name==='Adesivos'){m.transparent=false;m.alphaTest=.5;m.polygonOffset=true;m.polygonOffsetFactor=-2;m.polygonOffsetUnits=-2;o.castShadow=false;}
 });
 return scene;
}

export function towTruck(kind=TOW_VEHICLE){
 const spec=TOW_VEHICLES[kind],root=new THREE.Group();root.name=kind==='guincho'?'Guincho':'Caminhonete_resgate';
 const u=root.userData;Object.assign(u,{kind,hook:spec.hook,seat:spec.seat,wheelRadius:spec.wheel,lamps:{},wheels:[],spin:0,phase:(made++*.37)%1,dispose:()=>disposeTowTruck(root)});
 const fill=t=>{
  if(!t||u.gone)return;const model=t.clone(true),own=new Map();
  model.traverse(o=>{
   if(o.isMesh&&OWN_LAMPS.includes(o.material.name)){if(!own.has(o.material))own.set(o.material,o.material.clone());o.material=own.get(o.material);u.lamps[o.material.name]=o.material;}
   if(o.name.startsWith('Roda_')&&o.name.endsWith('_PIVO'))u.wheels.push({obj:o,base:o.quaternion.clone()});
  });
  root.add(model);
 };
 const ready=models.get(kind)?.template;
 if(ready)fill(ready);else loadTowTruck(kind).then(fill);
 return root;
}

// Each frame it shows (now: seconds): the light bar's halves in turn, the hazards, and the wheels rolled by how far
// it went along its own nose since the last frame.
const spinTurn=new THREE.Quaternion(),here=new THREE.Vector3(),nose=new THREE.Vector3(),moved=new THREE.Vector3();
export function driveTowTruck(truck,now){
 const u=truck.userData,t=(now+u.phase)%1,flash=k=>k<.1||k>.18&&k<.28;
 if(u.lamps.Giroflex_A)u.lamps.Giroflex_A.emissiveIntensity=t<.5&&flash(t*2)?BEACON_ON:BEACON_IDLE;
 if(u.lamps.Giroflex_B)u.lamps.Giroflex_B.emissiveIntensity=t>=.5&&flash(t*2-1)?BEACON_ON:BEACON_IDLE;
 if(u.lamps.Pisca_ambar)u.lamps.Pisca_ambar.emissiveIntensity=(now*1.5+u.phase)%1<.5?HAZARD_ON:0;
 truck.updateWorldMatrix(true,false);truck.getWorldPosition(here);
 if(u.last){nose.set(1,0,0).transformDirection(truck.matrixWorld);const d=moved.subVectors(here,u.last).dot(nose);if(Math.abs(d)<5)u.spin-=d/u.wheelRadius;}
 u.last=(u.last??new THREE.Vector3()).copy(here);
 for(const w of u.wheels)w.obj.quaternion.copy(w.base).multiply(spinTurn.setFromAxisAngle(SPIN_AXIS,u.spin));
}

// A truck let go: its own lamp materials (the model's shapes and other materials belong to every truck), and the
// body of its driver (person() builds one for each; his material is the crowd's).
export function disposeTowTruck(root){
 root.userData.gone=true;for(const m of Object.values(root.userData.lamps))m.dispose();
 root.userData.driver?.getObjectByName('Corpo')?.geometry.dispose();
}
