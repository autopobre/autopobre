import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Brake lights (players asked for them, to tell when the car ahead is braking). The V06
// Opala's four round tail lamps (material Lanterna_vermelha; car frame, +X forward, -Z the
// driver's side, rear faces measured in the model) get a bright red lens and a soft halo
// while the brake is on. One geometry and two materials serve every car; a hidden group
// costs nothing, so a car only draws them while braking.
export const TAIL_LAMPS=Object.freeze([[-2.17,-.66],[-2.187,-.47],[-2.187,.47],[-2.17,.66]].map(([x,z])=>Object.freeze({x,z})));
export const LAMP_Y=.6835;
// The distant rival (immersive-visuals farProxy) carries its lamps higher and further back.
const FAR_OFFSET=Object.freeze([-.215,.27,0]);
export const BRAKE_ON=.05;
// Tail lights (weather.js: night, rain): the lamps glow dimly all the time and brighten under braking. on: the
// rivals' (main.js applyWeather); the player's car follows its own light switch (headlights.js), set(brake, lit).
export const TAIL_LIGHTS={on:false};
// The lamps' lens (car-finish.js 'lens': ring normals) needs each lamp mapped on its own: the GLB's lamp mesh holds
// all four with no usable UVs. On the template as loaded (main.js setLivery), so every clone shares them: each
// vertex, in the car frame, takes the nearest lamp's box (u across the car, v up).
export function lampUVs(root,material='Lanterna_vermelha'){
 root.updateMatrixWorld(true);const toCar=root.matrixWorld.clone().invert(),q=new THREE.Vector3(),m=new THREE.Matrix4();
 root.traverse(o=>{
  if(!o.isMesh||o.geometry.userData.lampUV||![o.material].flat().some(x=>x?.name===material))return;
  const p=o.geometry.attributes.position,n=p.count,near=new Uint8Array(n),at=new Float32Array(n*2),box=TAIL_LAMPS.map(()=>[Infinity,-Infinity,Infinity,-Infinity]);
  m.multiplyMatrices(toCar,o.matrixWorld);
  for(let i=0;i<n;i++){q.fromBufferAttribute(p,i).applyMatrix4(m);let k=0;for(let j=1;j<TAIL_LAMPS.length;j++)if(Math.abs(q.z-TAIL_LAMPS[j].z)<Math.abs(q.z-TAIL_LAMPS[k].z))k=j;
   near[i]=k;at[i*2]=q.z;at[i*2+1]=q.y;const b=box[k];b[0]=Math.min(b[0],q.z);b[1]=Math.max(b[1],q.z);b[2]=Math.min(b[2],q.y);b[3]=Math.max(b[3],q.y);}
  // u runs the same way seen from behind on both sides (toward +z), so the rings' light comes from one side.
  const uv=new Float32Array(n*2);for(let i=0;i<n;i++){const b=box[near[i]];uv[i*2]=(at[i*2]-b[0])/Math.max(1e-4,b[1]-b[0]);uv[i*2+1]=(at[i*2+1]-b[2])/Math.max(1e-4,b[3]-b[2]);}
  o.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));o.geometry.deleteAttribute('tangent');o.geometry.userData.lampUV=true;
 });
}
let shared=null;
function parts(){
 if(shared)return shared;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
 g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
 const glow=new THREE.CanvasTexture(canvas);
 // The lit lens: brightest round the bulb, the reflector's rings a little darker between (not a flat disc).
 const lit=document.createElement('canvas');lit.width=lit.height=64;const lc=lit.getContext('2d'),r=lc.createRadialGradient(32,32,0,32,32,32);
 r.addColorStop(0,'#fff');r.addColorStop(.2,'#fff');r.addColorStop(.26,'#9a9a9a');for(let k=0;k<6;k++){const a=.3+k*.11;r.addColorStop(a,'#dcdcdc');r.addColorStop(Math.min(1,a+.09),'#8a8a8a');}r.addColorStop(1,'#b0b0b0');
 lc.fillStyle=r;lc.fillRect(0,0,64,64);const lensMap=new THREE.CanvasTexture(lit);lensMap.colorSpace=THREE.SRGBColorSpace;
 // Facing back: the discs' +Z turns to -X and their width runs across the car.
 const lens=TAIL_LAMPS.map(l=>new THREE.CircleGeometry(1,24).scale(.066,.047,1).rotateY(-Math.PI/2).translate(l.x-.006,LAMP_Y,l.z));
 const halo=TAIL_LAMPS.map(l=>new THREE.PlaneGeometry(.34,.24).rotateY(-Math.PI/2).translate(l.x-.02,LAMP_Y,l.z));
 const merge=list=>{const out=mergeGeometries(list,false);list.forEach(q=>q.dispose());return out;};
 shared={lens:merge(lens),halo:merge(halo),
  // Brighter than white on purpose: the film look's bloom (cinematic.js) makes them glow.
  lensMaterial:new THREE.MeshBasicMaterial({name:'Luz_de_freio',map:lensMap,color:new THREE.Color().setRGB(6,.16,.07)}),
  haloMaterial:new THREE.MeshBasicMaterial({name:'Luz_de_freio_halo',map:glow,color:new THREE.Color().setRGB(1.6,.06,.03),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}),
  // The tail lights alone: the same lamps about a fifth as bright.
  tailMaterial:new THREE.MeshBasicMaterial({name:'Lanterna_acesa',map:lensMap,color:new THREE.Color().setRGB(1.3,.035,.016)}),
  tailHaloMaterial:new THREE.MeshBasicMaterial({name:'Lanterna_acesa_halo',map:glow,color:new THREE.Color().setRGB(.32,.012,.006),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})};
 return shared;
}
// The geometries and materials every car's lamps share (kept when one car is thrown away).
export const sharedBrakeLights=()=>shared?[shared.lens,shared.halo,shared.lensMaterial,shared.haloMaterial,shared.tailMaterial,shared.tailHaloMaterial]:[];
// A car's brake lights; far: placed for the distant rival's simple body (true: the Opala's, or the
// offset from the Opala's lamps for another body, fusca.js FUSCA_PROFILE.lamps). set(brake, lit) shows them: bright
// while braking, dim while the tail lights are on (lit, the rivals' TAIL_LIGHTS.on unless given).
export function createBrakeLights({far=false}={}){
 const {lens,halo,lensMaterial,haloMaterial,tailMaterial,tailHaloMaterial}=parts(),group=new THREE.Group();group.name='Luz_de_freio';
 const a=new THREE.Mesh(lens,lensMaterial),b=new THREE.Mesh(halo,haloMaterial);b.renderOrder=3;
 for(const m of [a,b]){m.castShadow=m.receiveShadow=false;group.add(m);}
 if(far)group.position.set(...(far===true?FAR_OFFSET:far));
 group.visible=false;group.userData.set=(brake,lit=TAIL_LIGHTS.on)=>{const braking=brake>BRAKE_ON;group.visible=braking||lit;a.material=braking?lensMaterial:tailMaterial;b.material=braking?haloMaterial:tailHaloMaterial;};
 return group;
}
