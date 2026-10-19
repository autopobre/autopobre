import * as THREE from 'three';
import {autoMeterFace,canvasTexture} from './cockpit-materials.js';
import {needleAngle} from './cockpit-instruments.js';
import {clamp} from './physics.js';
import {finishMaterial} from './car-finish.js';

// The player's Fusca, seen from the driver's seat (fusca.js FuscaBody): the dials the exporter made in its dash
// (modelo_3d/scripts/fusca_cabine.py, with UVs) get their faces and live needles, the rear-view mirror's glass
// shows the rear camera's picture (cockpit.js mirrorTarget, rendered by main.js), and the shift light on the
// tachometer's cup comes on near the limiter. The door mirrors' glasses are side-mirrors.js's (main.js).
// The Fusca's VDO speedometer: 0 to 140 km/h clockwise from the lower left, angles clockwise from 3 o'clock.
export const VDO=Object.freeze({min:0,max:140,start:135,sweep:270});
export const FUEL=Object.freeze({start:232,sweep:76}); // the fuel gauge's short arc at the top of the dial, empty to full
const vdoAngle=kmh=>-(VDO.start+VDO.sweep*clamp((kmh-VDO.min)/(VDO.max-VDO.min),0,1))*Math.PI/180;
const fuelAngle=f=>-(FUEL.start+FUEL.sweep*clamp(f,0,1))*Math.PI/180;
// A 1970 Fusca's speedometer face: white figures every 20 km/h on black, the fuel gauge's arc (R ... 1/1) at its
// top, odometer, warning lamps and the maker's name.
export function vdoFace(size=512){
 return canvasTexture(size,size,(ctx,w)=>{
  const c=w/2,k=w/512,white='#ecebe4';ctx.translate(c,c);
  const face=ctx.createRadialGradient(0,-50*k,10*k,0,0,c);face.addColorStop(0,'#1d1f21');face.addColorStop(.8,'#0d0e0f');face.addColorStop(1,'#020303');
  ctx.fillStyle=face;ctx.fillRect(-c,-c,w,w);
  const at=(deg,r)=>[Math.cos(deg*Math.PI/180)*r*k,Math.sin(deg*Math.PI/180)*r*k];
  const text=(t,x,y,px,{color=white,weight=700,font='Arial,sans-serif'}={})=>{ctx.font=`${weight} ${px*k}px ${font}`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,x*k,y*k);};
  for(let v=0;v<=140;v+=5){
   const deg=VDO.start+VDO.sweep*v/140,major=v%20===0,mid=v%10===0;
   const [x0,y0]=at(deg,major?205:mid?218:228),[x1,y1]=at(deg,246);ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.lineWidth=(major?9:mid?5:3)*k;ctx.strokeStyle=white;ctx.stroke();
   if(major){const [x,y]=at(deg,166);text(String(v),x/k,y/k,v>=100?50:56,{font:'"Arial Narrow",Arial,sans-serif'});}
  }
  // Fuel: a short arc under the top figures, red reserve at its empty end.
  for(let i=0;i<=8;i++){const deg=FUEL.start+FUEL.sweep*i/8,[x0,y0]=at(deg,i%4===0?96:104),[x1,y1]=at(deg,118);ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.lineWidth=(i%4===0?6:3)*k;ctx.strokeStyle=i<2?'#d23a2a':white;ctx.stroke();}
  const [ex,ey]=at(FUEL.start-8,86),[fx,fy]=at(FUEL.start+FUEL.sweep+8,86);text('R',ex/k,ey/k,22,{color:'#d23a2a'});text('1/1',fx/k,fy/k,20);
  text('km/h',0,-42,26,{weight:400});text('VDO',0,92,30,{weight:900});
  // Odometer window and the four lamps under it: oil, generator, indicators, high beam.
  ctx.fillStyle='#050505';ctx.fillRect(-62*k,30*k,124*k,30*k);ctx.strokeStyle='#5a5c5c';ctx.lineWidth=2*k;ctx.strokeRect(-62*k,30*k,124*k,30*k);
  [...'048217'].forEach((d,i)=>text(d,-52+i*20.8,46,22,{color:i===5?'#111':'#e8e6dc',weight:700}));ctx.fillStyle='#e8e6dc';ctx.fillRect(52*k,32*k,9*k,26*k);text('7',56.5,46,20,{color:'#111'});
  [['#5a0e0a',-48],['#5a0e0a',-16],['#0d4417',16],['#0c2a5c',48]].forEach(([color,x])=>{ctx.beginPath();ctx.arc(x*k,140*k,10*k,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();});
  const rim=ctx.createRadialGradient(0,0,210*k,0,0,c);rim.addColorStop(0,'rgba(0,0,0,0)');rim.addColorStop(1,'rgba(0,0,0,.75)');ctx.fillStyle=rim;ctx.fillRect(-c,-c,w,w);
 },{anisotropy:8});
}
// A dial's place in the car's frame, from its disc: centre, the face's normal toward the cabin, up and right.
function dialFrame(mesh,toward){
 const g=mesh.geometry;g.computeBoundingBox();const center=g.boundingBox.getCenter(new THREE.Vector3());
 const p=g.attributes.position,i=g.index,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
 const n=i?i.count/3:p.count/3;
 for(let t=0;t<n;t++){const k=t*3,ia=i?i.getX(k):k,ib=i?i.getX(k+1):k+1,ic=i?i.getX(k+2):k+2;a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic);normal.add(b.sub(a).cross(c.sub(a)));}
 normal.normalize();if(normal.dot(toward.clone().sub(center))<0)normal.negate();
 const up=new THREE.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize(),right=new THREE.Vector3().crossVectors(up,normal);
 let radius=0;for(let k=0;k<p.count;k++)radius=Math.max(radius,a.fromBufferAttribute(p,k).distanceTo(center));
 return {center,normal,up,right,radius};
}
const needleShape=(length,tail,width)=>{const s=new THREE.Shape();s.moveTo(-tail,-width);s.lineTo(length*.94,-width*.35);s.lineTo(length,0);s.lineTo(length*.94,width*.35);s.lineTo(-tail,width);s.closePath();return new THREE.ShapeGeometry(s);};
export class FuscaCockpit {
 // car: the player's Fusca (fusca.js fuscaCar, on the car's sprung body); eye: the cockpit camera there.
 constructor(car,eye,mirrorTexture){
  this.car=car;this.own=[];this.needles={};this.lamp=null;
  const found={};car.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material))(found[o.material.name]??=[]).push(o);});
  const make=(r)=>{this.own.push(r);return r;};
  // The rear-view mirror: the exporter's UVs already mirror the picture.
  this.mirrors=[];
  for(const glass of found.Espelho_interno_fusca??[])this.mirrors.push(glass.material=make(new THREE.MeshBasicMaterial({name:'Espelho_interno_fusca_vivo',map:mirrorTexture,toneMapped:false})));
  this.mirror=(found.Espelho_interno_fusca??[]).length;
  const red=make(new THREE.MeshBasicMaterial({color:0xf2421c})),white=make(new THREE.MeshBasicMaterial({color:0xf2f0e6}));
  const dial=(name,texture,parts)=>{
   const mesh=found[name]?.[0];if(!mesh)return;
   texture.flipY=false; // glTF UVs, as the loader's own textures
   mesh.material=make(new THREE.MeshBasicMaterial({name:name+'_face',map:make(texture)}));
   const f=dialFrame(mesh,eye),holder=new THREE.Group();holder.name=name+'_ponteiros';
   holder.position.copy(f.center).addScaledVector(f.normal,.0025);holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right,f.up,f.normal));
   mesh.parent.add(holder);
   for(const [key,{length,tail,width,material,offset=[0,0]}] of Object.entries(parts)){
    const pivot=new THREE.Group();pivot.position.set(offset[0]*f.radius,offset[1]*f.radius,0);holder.add(pivot);
    const blade=new THREE.Mesh(make(needleShape(length*f.radius,tail*f.radius,width*f.radius)),material);blade.position.z=key==='fuel'?0:.0006;pivot.add(blade);
    this.needles[key]=pivot;
   }
   const cap=new THREE.Mesh(make(new THREE.CircleGeometry(f.radius*.1,20)),make(new THREE.MeshStandardMaterial({color:0x111214,metalness:.4,roughness:.4})));cap.position.z=.0012;holder.add(cap);
   this.own.push(holder);
  };
  dial('Mostrador_velocimetro',vdoFace(512),{speed:{length:.86,tail:.18,width:.03,material:white},fuel:{length:.44,tail:0,width:.022,material:red}});
  dial('Mostrador_contagiros',autoMeterFace('tach',512),{tach:{length:.86,tail:.2,width:.028,material:red}});
  const lens=found.Luz_troca?.[0];if(lens){this.lamp=lens.material=make(finishMaterial(lens.material.clone()));}
 }
 // Each frame: speed (km/h), rpm and the fuel left (0-1).
 update(speed,rpm,fuel=1){
  const n=this.needles;
  if(n.speed)n.speed.rotation.z=vdoAngle(speed);
  if(n.fuel)n.fuel.rotation.z=fuelAngle(fuel);
  if(n.tach)n.tach.rotation.z=needleAngle('tach',rpm/1000);
  if(this.lamp){this.lamp.emissive.setRGB(1,.45,0);this.lamp.emissiveIntensity=rpm>6700?5:0;}
 }
 // The rear-view mirror's picture: the rear camera's, or main.js's own with the open engine lid in the back window.
 mirrorMap(texture){for(const m of this.mirrors)m.map=texture;}
 dispose(){for(const r of this.own){if(r.isObject3D)r.removeFromParent();else{if(r.map?.isCanvasTexture)r.map.dispose();r.dispose?.();}}this.own=[];this.needles={};}
 info(){return {mirror:this.mirror,needles:Object.fromEntries(Object.entries(this.needles).map(([k,p])=>[k,p.rotation.z])),shiftLight:!!this.lamp?.emissiveIntensity};}
}
