import * as THREE from 'three';
import {numberSticker,bodyTriangles,bendOnBody} from './immersive-visuals.js';
import {BRAKE_ON,TAIL_LIGHTS} from './brake-lights.js';
import {FuscaCockpit} from './fusca-cockpit.js';
import {finishCar,finishMaterial} from './car-finish.js';
import {prepareWheels} from './car-wheels.js';
// The Fusca (Modo Corrida's car screen, its Fusca tab): modelo_3d/fusca_v2, modelled from the Type 1's
// measurements and exported by modelo_3d/scripts/exportar_fusca_jogo.py in the Opala's frame (+X forward, -Z the
// driver's side, tyres on y=0, its 2.40 m wheelbase centred on the Opala's). In a Fusca race the whole field races
// one (immersive-visuals.js fuscaRival), with its own mechanics (physics.js FUSCA_MECHANICS). A Fusca prepared to
// race, as a Copa Fusca photo shows one: no bumpers nor running boards, small black wheels, the body 19 cm lower than
// the street car's (the sills 7 cm off the ground, the arches just over the tyres), the engine lid propped open. Each is
// a Copa Fusca car (race-roster.js FUSCA_CHOICES) in its colours, as the cup's liveries go: the body paint and the
// dash in the first, the four fenders in the second (the Opala's stripe), the number on both doors and on the roof.
export const FUSCA_URL='./assets/fusca_v2.glb?v=fusca-v2-corrida-5';
// The driver (driver.js and rival-driver.js, with the race wheel he turns) moves this much from the Opala's
// seat: onto the Fusca's steering wheel, 26 cm further forward, 8 cm lower and 6 cm inboard (the Fusca is
// narrower: from the Opala's seat his left elbow came out through the door). The exporter builds the cabin round
// this place (modelo_3d/scripts/fusca_cabine.py SEAT, LOWER): change both together.
export const FUSCA_SEAT=Object.freeze([.257,-.077,.06]);
// The cockpit camera (the Opala's is an onboard camera on the car's centre line, cockpit.js eye) moves up with the
// seat and 7 cm higher still (over the dash top the road shows from about 8 m ahead), and 5 cm less forward: from
// the centre line the door mirrors (only whole in sight behind the A-pillars) then sit about 50 degrees out, inside
// a 16:9 screen. The exporter aims the mirrors and the tachometer at this eye (fusca_cabine.py EYE).
export const FUSCA_EYE=Object.freeze([.207,-.01,0]);
// cockpit.js's eye in its V06 view, which main.js keeps in a Fusca (the classic interior is the Opala's only).
const CABIN_EYE=new THREE.Vector3(-.15,1.02,.015);
// The hood camera: the Opala's (main.js hoodEye, 1.1 m forward, 1.25 m up) would see past the Fusca's lower,
// rounder front lid; this one sits 13 cm over the lid, just ahead of the windscreen.
export const FUSCA_HOOD_EYE=Object.freeze([.92,1.03,0]);
// The side view (car-select.js card icons; the distant rivals' model, immersive-visuals.js farProxy, as
// FAR_PROFILE for the Opala): metres in the car frame, nose to +x, read off the GLB's silhouette. fenders: the
// front and rear fenders' sides, in the second colour. width, track, tail, head and bumpers (none) shape the
// distant model; lamps moves the distant Opala's brake lights onto its tail.
export const FUSCA_PROFILE=Object.freeze({
 body:[[-1.73,.09],[2,.09],[2.016,.19],[2.016,.36],[2,.407],[1.9,.506],[1.8,.617],[1.7,.695],[1.6,.755],[1.4,.826],[1.2,.868],[1,.893],[.8,.917],[.6,1.24],[.5,1.275],[.3,1.316],[.1,1.338],[-.1,1.345],[-.3,1.343],[-.5,1.33],[-.7,1.299],[-.9,1.224],[-1.1,1.1],[-1.3,.957],[-1.4,.89],[-1.5,.8],[-1.6,.72],[-1.7,.62],[-1.79,.52],[-1.79,.38],[-1.73,.3]],
 glass:[[.73,.83],[.65,.98],[.5,1.13],[.3,1.155],[0,1.165],[-.4,1.155],[-.6,1.1],[-.74,1.03],[-.81,.94],[-.81,.83]],
 fenders:[[[.81,.09],[.85,.26],[.9,.37],[.95,.45],[1.05,.55],[1.15,.61],[1.25,.67],[1.4,.69],[1.6,.67],[1.7,.62],[1.8,.59],[1.9,.51],[1.98,.42],[1.98,.09]],
  [[-.39,.09],[-.45,.19],[-.5,.28],[-.55,.4],[-.6,.48],[-.7,.59],[-.8,.66],[-1,.71],[-1.1,.71],[-1.2,.68],[-1.3,.63],[-1.4,.55],[-1.5,.5],[-1.6,.41],[-1.7,.31],[-1.71,.09]]],
 number:[.33,.37],axles:[1.417,-.983],wheel:.27,
 width:1.5,track:.666,tail:{x:-1.71,y:.45,z:.545,w:.08,h:.12},head:{x:1.99,y:.47,z:.505,w:.17,h:.17},bumpers:[],lamps:[.45,-.24,0]});
// The wheels' travel shown on the player's car (main.js): half the suspension's (physics.js, the Opala's), and at
// most WHEEL_BUMP up: the arches sit just over the tyres.
export const FUSCA_WHEEL_TRAVEL=.5,FUSCA_WHEEL_BUMP=.012;
// Where the numbers go (car frame): on each door, and on the roof, read from the driver's side as the Opalas' are.
const DOOR={x:.33,y:.37,w:.46,h:.34},ROOF={x:-.1,y:1.11,w:.66,h:.52},SIDE=.72;
// The lightning bolt (fuscaCar, graphic 'raio'): between the arches (the rear one ends near x -.67, the front one
// starts near 1.1), through the door number's height.
export const BOLT=Object.freeze({x:.24,y:.41,w:1.52,h:.38});
// Its outline, tail to point (u along, v down, 0-1).
export const BOLT_SHAPE=Object.freeze([[.02,.3],[.5,.42],[.45,.13],[.98,.58],[.55,.5],[.6,.82],[.02,.64]]);
// The bolt drawn tail to point along the canvas, yellow to orange, black edged; flip: drawn the other way (the
// left side's sticker runs from the nose to the tail).
function boltSticker(flip){
 const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');
 if(flip){ctx.translate(1024,0);ctx.scale(-1,1);}
 ctx.beginPath();BOLT_SHAPE.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x*1024,y*256));ctx.closePath();
 const g=ctx.createLinearGradient(0,0,1024,0);g.addColorStop(0,'#f2601c');g.addColorStop(.55,'#ffb21a');g.addColorStop(1,'#ffe03a');
 ctx.lineJoin='miter';ctx.lineWidth=14;ctx.strokeStyle='#121314';ctx.stroke();ctx.fillStyle=g;ctx.fill();
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
 return finishMaterial(new THREE.MeshPhysicalMaterial({name:'Raio_colado',map,transparent:true,depthWrite:false,roughness:.35,clearcoat:.8,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
}
// Painted like the body: the paint, the dash (a Fusca's is the body's sheet metal) and the bare metal inside; in
// the second colour, the fenders (the exporter's Paralama_fusca).
const PAINTED=['Pintura_fusca','Fusca_painel','Pintura_interna_fusca'],FENDERS='Paralama_fusca';
// The cabin's materials (fusca_cabine.py) that the sun only reaches through the windows: a rival's cast no shadow.
const CABIN=new Set(['Pintura_interna_fusca','Forro_teto','Vinil_preto','Gaiola','Banco_concha','Banco_tecido','Fusca_painel','Aco_escuro','Volante_baquelite']);
// The loaded GLB made ready to clone: shadows, and glass as plain see-through materials (Blender's
// transmission would make three.js draw the scene twice a frame; main.js does the same to the Opala's).
export function prepareFusca(scene){
 scene.traverse(o=>{
  if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
  for(const m of [o.material].flat()){
   if(m.name==='Vidro_fusca'){m.color.setHex(0x1b252b);m.transmission=0;m.transparent=true;m.opacity=.42;m.roughness=.04;m.depthWrite=false;o.castShadow=false;}
   else if(m.transmission>0){m.transparent=true;m.opacity=Math.min(m.opacity,1-.65*m.transmission);m.transmission=0;m.depthWrite=false;}
  }
 });
 // Its tyres lettered as the Opala's (car-wheels.js), shared by every Fusca cloned from here; before
 // the finish, so the lettered tyre is the one car-finish.js registers for the reflection levels.
 prepareWheels(scene,'fusca');
 // Clear coat, glass and chrome as the Opala's (car-finish.js).
 finishCar(scene);
 scene.name='Fusca_V2';return scene;
}
// A Fusca in a team's colours (entry: race-roster.js): a clone of the template sharing its geometries and
// textures; what is made for it is listed in userData.own (fuscaDispose). userData.wheels: the four pivots;
// userData.brake(v) lights the tail lamps.
export function fuscaCar(template,entry){
 const root=template.clone(true),own=[],swap=new Map(),wheels=[];root.name='Fusca_'+entry.number;
 let lamp=null;
 const recolor=m=>{
  if(!swap.has(m)){
   let c=m;
   if(PAINTED.includes(m.name)||m.name===FENDERS){c=m.clone();c.color.setHex(m.name===FENDERS?entry.stripe:entry.color);if(entry.finish)Object.assign(c,entry.finish);}
   else if(m.name==='Lanterna_fusca'){c=lamp=m.clone();c.emissive.setRGB(1,.05,.02);c.emissiveIntensity=0;}
   else if(m.name==='Placa'&&m.map===null){c=m.clone();c.map=plateTexture(entry.number);c.color.setHex(0xffffff);}
   // A clone loses its shader patch: the coat goes on again, the team's finish over it (car-finish.js).
   if(c!==m){finishMaterial(c,{rosterFinish:entry.finish});own.push(c);}swap.set(m,c);
  }
  return swap.get(m);
 };
 root.traverse(o=>{
  if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(recolor):recolor(o.material);
  else if(o.name.startsWith('Roda_')&&o.name.includes('PIVO'))wheels.push(o);
 });
 // The numbers are bent onto the paint (immersive-visuals.js), 6 mm off it.
 root.updateMatrixWorld(true);const paint=[];root.traverse(o=>{if(o.isMesh&&[o.material].flat().some(m=>m.name==='Pintura_fusca'))paint.push(o);});
 const body=bodyTriangles(root,paint),V=(x,y,z)=>new THREE.Vector3(x,y,z),stuck=[];
 const sticker=numberSticker(entry.number);own.push(sticker);
 for(const side of [-1,1])stuck.push([bendOnBody(body,V(DOOR.x,DOOR.y,side*SIDE),V(side,0,0),V(0,1,0),DOOR.w,DOOR.h,16,8),'Numero_porta_'+entry.number]);
 stuck.push([bendOnBody(body,V(ROOF.x,ROOF.y,0),V(-1,0,0),V(0,0,1),ROOF.w,ROOF.h),'Numero_teto_'+entry.number]);
 for(const [geometry,name] of stuck){const decal=new THREE.Mesh(geometry,sticker);decal.name=name;decal.renderOrder=2;decal.receiveShadow=true;root.add(decal);own.push(geometry);}
 // A livery's drawing (race-roster.js graphic) along both sides, under the door numbers: Benício's lightning bolt,
 // between the wheel arches, pointing to the nose on either side.
 if(entry.graphic==='raio')for(const side of [-1,1]){
  const art=boltSticker(side<0),geometry=bendOnBody(body,V(BOLT.x,BOLT.y,side*SIDE),V(side,0,0),V(0,1,0),BOLT.w,BOLT.h,40,10);
  const decal=new THREE.Mesh(geometry,art);decal.name='Raio_'+(side<0?'esquerdo':'direito');decal.renderOrder=1;decal.receiveShadow=true;root.add(decal);own.push(art,geometry);
 }
 root.userData.own=own;root.userData.wheels=wheels;root.userData.entry=entry;root.userData.lamp=lamp;
 // Dim while the tail lights are on (dusk, night, rain: brake-lights.js TAIL_LIGHTS, or lit for the player's own switch).
 root.userData.brake=(v,lit=TAIL_LIGHTS.on)=>{if(lamp)lamp.emissiveIntensity=v>BRAKE_ON?7:lit?1.5:0;};
 return root;
}
// A rival's Fusca keeps the cabin seen through its windows (dash, seat, cage, door cards, lining) without what only
// the player sees (the exporter's "interno" parts: dials, switches, cranks, harness, mirror glass...), and its
// cabin throws no shadow (the sun reaches it only through the glass).
export function rivalCabin(car){
 const inside=[];car.traverse(o=>{if(o.userData.interno)inside.push(o);});inside.forEach(o=>o.removeFromParent());
 car.traverse(o=>{if(o.isMesh&&[o.material].flat().every(m=>CABIN.has(m.name)))o.castShadow=false;});
 return car;
}
// A 1970s Brazilian plate: black on yellow, the city on top, FUS-K and the car's number (the user's FUS-K99 on the
// 99; the exporter's UVs: u to the right seen from behind, v up).
export function plateTexture(number){
 const c=document.createElement('canvas');c.width=512;c.height=196;const ctx=c.getContext('2d');
 ctx.fillStyle='#d9ae2c';ctx.fillRect(0,0,512,196);ctx.strokeStyle='#1a1a16';ctx.lineWidth=8;ctx.strokeRect(10,10,492,176);
 ctx.fillStyle='#1a1a16';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 30px Arial,sans-serif';ctx.fillText('SÃO PAULO',256,40);
 const text=`FUS-K${number}`;let px=104;do{ctx.font=`700 ${px}px "Arial Narrow",Arial,sans-serif`;px-=4;}while(ctx.measureText(text).width>440&&px>40);ctx.fillText(text,256,122);
 for(const x of [44,468]){ctx.beginPath();ctx.arc(x,40,9,0,Math.PI*2);ctx.fill();}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.flipY=false;return t;
}
// Frees what fuscaCar made for one car (its materials, their number textures, the stickers' geometries).
export function fuscaDispose(root){
 for(const r of root.userData.own??[]){if(r.map?.isCanvasTexture)r.map.dispose();r.dispose();}
 root.userData.own=[];
}
// The player's Fusca, on the car's sprung body (main.js holds the Opala's body, cockpit and brake lamps
// aside meanwhile): the race wheel the driver turns stands for its own, so that one hides. wheels as main.js
// keeps the Opala's (front, index 0-3 front left first, rest pose) for it to turn, spin and drop them.
// mirror: the rear camera's picture (cockpit.js mirrorTarget) for the rear-view mirror (fusca-cockpit.js).
export class FuscaBody {
 constructor(holder,mirror=null){this.holder=holder;this.mirror=mirror;this.car=null;this.cockpit=null;this.wheels=[];}
 get active(){return !!this.car;}
 apply(template,entry){
  this.clear();if(!template||!entry)return false;
  const car=this.car=fuscaCar(template,entry);car.name='Fusca_do_jogador';
  const own=car.getObjectByName('Volante_Fusca');if(own)own.visible=false;
  this.wheels=car.userData.wheels.map(obj=>{const front=obj.name.includes('Dianteira');return {obj,front,index:(front?0:2)+(obj.position.z>0?1:0),base:obj.quaternion.clone(),basePosition:obj.position.clone()};});
  this.cockpit=new FuscaCockpit(car,new THREE.Vector3(...FUSCA_EYE).add(CABIN_EYE),this.mirror);
  this.holder.add(car);return true;
 }
 brake(v,lit){this.car?.userData.brake(v,lit);}
 // The dials (fusca-cockpit.js): speed in km/h, rpm, the fuel left (0-1).
 update(speed,rpm,fuel){this.cockpit?.update(speed,rpm,fuel);}
 clear(){if(!this.car)return;this.cockpit?.dispose();this.cockpit=null;this.car.removeFromParent();fuscaDispose(this.car);this.car=null;this.wheels=[];}
 info(){let fenders=null;this.car?.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())if(m.name===FENDERS)fenders=m.color.getHex();});
  return this.car?{number:this.car.userData.entry.number,wheels:this.wheels.length,decals:this.car.children.filter(o=>o.name.startsWith('Numero_')).length,fenders,stripe:new THREE.Color(this.car.userData.entry.stripe).getHex(),braking:!!this.car.userData.lamp?.emissiveIntensity,ownWheelShown:!!this.car.getObjectByName('Volante_Fusca')?.visible,
  cabin:this.cockpit?.info()??null}:null;}
}
