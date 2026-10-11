import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';

// A car hitting the foot of a plateau's wall (cliff-fall.js) goes up like in the films (the players asked for it:
// "faltou aquela explosão de cinema"): a flash, a fireball rolling up into a mushroom, burning debris thrown about,
// fire on the wreck and a column of black smoke that stays over the valley for a while after the car is back on the
// track. Particles are camera-facing quads drawn by instancing (a point sprite would be clamped by the GPU's point
// size when the fireball fills the screen): one layer adds light (fire), one covers (smoke). Physics frame in,
// three.js frame out: (x, y, z up) -> (x, z, -y).

const FIRE=420,SMOKE=260,DEBRIS=48;
const vertexShader=`
attribute vec3 iPos;attribute vec4 iTint;attribute vec2 iSizeRot;
varying vec2 vUv;varying vec4 vTint;
void main(){
 vec4 mv=modelViewMatrix*vec4(iPos,1.);float c=cos(iSizeRot.y),s=sin(iSizeRot.y);
 mv.xy+=mat2(c,s,-s,c)*position.xy*iSizeRot.x;
 gl_Position=projectionMatrix*mv;vUv=position.xy+.5;vTint=iTint;
}`;
const fragmentShader=`
uniform sampler2D map;varying vec2 vUv;varying vec4 vTint;
void main(){vec4 t=texture2D(map,vUv);gl_FragColor=vec4(t.rgb*vTint.rgb,t.a*vTint.a);if(gl_FragColor.a<.004)discard;}`;
function fireTexture(){
 return canvasTexture((ctx,w,h)=>{
  let seed=5;const r=()=>(seed=seed*16807%2147483647)/2147483647;
  for(let k=0;k<26;k++){const x=w/2+(r()-.5)*w*.36,y=h/2+(r()-.5)*h*.36,rad=w*(.16+r()*.22),g=ctx.createRadialGradient(x,y,0,x,y,rad);
   g.addColorStop(0,'rgba(255,255,235,.55)');g.addColorStop(.35,'rgba(255,200,90,.35)');g.addColorStop(.75,'rgba(255,90,20,.12)');g.addColorStop(1,'rgba(255,40,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
 },128,128);
}
function smokeTexture(){
 return canvasTexture((ctx,w,h)=>{
  let seed=11;const r=()=>(seed=seed*16807%2147483647)/2147483647;
  for(let k=0;k<34;k++){const x=w/2+(r()-.5)*w*.42,y=h/2+(r()-.5)*h*.42,rad=w*(.12+r()*.2),v=150+r()*80|0,g=ctx.createRadialGradient(x,y,0,x,y,rad);
   g.addColorStop(0,`rgba(${v},${v},${v},.32)`);g.addColorStop(.6,`rgba(${v},${v},${v},.14)`);g.addColorStop(1,`rgba(${v},${v},${v},0)`);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
 },128,128);
}
class Layer{
 constructor(count,map,blending){
  const g=new THREE.InstancedBufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));g.setIndex([0,1,2,0,2,3]);
  this.pos=new Float32Array(count*3);this.tint=new Float32Array(count*4);this.sr=new Float32Array(count*2);
  g.setAttribute('iPos',new THREE.InstancedBufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('iTint',new THREE.InstancedBufferAttribute(this.tint,4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('iSizeRot',new THREE.InstancedBufferAttribute(this.sr,2).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount=0;this.geometry=g;this.count=count;this.items=[];
  this.mesh=new THREE.Mesh(g,new THREE.ShaderMaterial({name:'Explosao_'+(blending===THREE.AdditiveBlending?'fogo':'fumaca'),uniforms:{map:{value:map}},vertexShader,fragmentShader,transparent:true,depthWrite:false,blending}));
  this.mesh.frustumCulled=false;this.mesh.renderOrder=blending===THREE.AdditiveBlending?6:5;
 }
 add(p){if(this.items.length<this.count)this.items.push(p);}
 write(){
  const n=this.items.length;
  for(let k=0;k<n;k++){const p=this.items[k];this.pos.set([p.x,p.z,-p.y],k*3);this.tint.set([p.r,p.g,p.b,p.a],k*4);this.sr[k*2]=p.size;this.sr[k*2+1]=p.rot;}
  const g=this.geometry;g.instanceCount=n;for(const name of ['iPos','iTint','iSizeRot']){const a=g.attributes[name];a.needsUpdate=true;a.addUpdateRange?.(0,n*a.itemSize);}
 }
}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export class Explosions{
 constructor(scene,{mobile=false}={}){
  this.root=new THREE.Group();this.root.name='Explosoes';scene.add(this.root);this.mobile=mobile;
  this.fire=new Layer(mobile?220:FIRE,fireTexture(),THREE.AdditiveBlending);this.smoke=new Layer(mobile?140:SMOKE,smokeTexture(),THREE.NormalBlending);
  this.root.add(this.smoke.mesh,this.fire.mesh);
  const box=new THREE.BoxGeometry(1,1,1);
  this.debrisMesh=new THREE.InstancedMesh(box,new THREE.MeshStandardMaterial({name:'Explosao_destrocos',color:0x1c1a18,roughness:.85,metalness:.3}),DEBRIS);
  this.debrisMesh.count=0;this.debrisMesh.frustumCulled=false;this.root.add(this.debrisMesh);
  this.debris=[];this.burning=[];this.seed=1;this.stats={explosions:0};this.matrix=new THREE.Matrix4();this.q=new THREE.Quaternion();this.e=new THREE.Euler();this.v=new THREE.Vector3();this.s=new THREE.Vector3();
 }
 rand(){return (this.seed=this.seed*16807%2147483647)/2147483647;}
 // At (x, y, z) in the physics frame (the car's centre), on ground: the height of the ground under a point (debris lands on it).
 spawn(x,y,z,{power=1,ground=null}={}){
  const r=()=>this.rand();this.stats.explosions++;this.ground=ground??this.ground;
  // The flash: one huge white-hot puff for a few frames.
  this.fire.add({x,y,z:z+1,vx:0,vy:0,vz:0,t:0,life:.22,size0:18*power,size1:30*power,heat:6,rot:r()*6,flash:true});
  // The fireball, rolling out and up from the car.
  for(let k=0;k<(this.mobile?40:70);k++){
   const a=r()*Math.PI*2,up=.15+r()*.85,speed=(5+r()*15)*power,c=Math.sqrt(1-up*up);
   this.fire.add({x:x+(r()-.5)*2,y:y+(r()-.5)*2,z:z+r(),vx:Math.cos(a)*c*speed,vy:Math.sin(a)*c*speed,vz:up*speed*1.1,t:-r()*.12,life:.9+r()*.9,size0:(2+r()*3)*power,size1:(9+r()*9)*power,heat:3.2+r()*1.6,rot:r()*6,drag:2.2,lift:3});
  }
  // The mushroom: a second ball climbing on its own heat.
  for(let k=0;k<(this.mobile?14:24);k++){
   const a=r()*Math.PI*2,out=r()*4;
   this.fire.add({x:x+Math.cos(a)*out,y:y+Math.sin(a)*out,z:z+2+r()*3,vx:Math.cos(a)*2,vy:Math.sin(a)*2,vz:(9+r()*5)*power,t:.1+r()*.35,life:1.6+r()*.8,size0:6*power,size1:(14+r()*10)*power,heat:2.4+r(),rot:r()*6,drag:.9,lift:0});
  }
  // Black smoke: thick at first, then a column that climbs and spreads for several seconds.
  for(let k=0;k<(this.mobile?40:70);k++){
   const a=r()*Math.PI*2,out=r()*7,climb=r();
   this.smoke.add({x:x+Math.cos(a)*out,y:y+Math.sin(a)*out,z:z+2+r()*5,vx:Math.cos(a)*(1+r()*4),vy:Math.sin(a)*(1+r()*4),vz:(5+climb*12)*power,t:.2+r()*2.2,life:6+r()*6,size0:(3+r()*4)*power,size1:(10+r()*14+climb*8)*power,dark:.04+r()*.08,rot:r()*6,drag:.22,alpha:.5+r()*.2});
  }
  // Pieces of the car, some of them burning.
  for(let k=0;k<(this.mobile?18:30)&&this.debris.length<DEBRIS;k++){
   const a=r()*Math.PI*2,up=.3+r()*.7,speed=(8+r()*22)*power,c=Math.sqrt(1-up*up);
   this.debris.push({x,y,z:z+.8,vx:Math.cos(a)*c*speed,vy:Math.sin(a)*c*speed,vz:up*speed,sx:.15+r()*.7,sy:.1+r()*.5,sz:.05+r()*.35,rx:r()*6,ry:r()*6,rz:r()*6,wx:(r()-.5)*14,wy:(r()-.5)*14,wz:(r()-.5)*14,life:7+r()*4,burn:r()<.55?1.2+r()*1.8:0,rest:false});
  }
  // The wreck keeps burning for a while.
  this.burning.push({x,y,z,t:0,life:9});
 }
 update(dt){
  if(!dt)return this.write();
  const r=()=>this.rand(),ground=this.ground;
  for(const f of this.burning){f.t+=dt;if(f.t<f.life&&r()<dt*(f.t<3?40:16)*(this.mobile?.6:1))this.fire.add({x:f.x+(r()-.5)*2.6,y:f.y+(r()-.5)*2.6,z:f.z+.3,vx:(r()-.5),vy:(r()-.5),vz:2+r()*3,t:0,life:.5+r()*.6,size0:1.2+r(),size1:3+r()*3,heat:2.2*(1-f.t/f.life)+.8,rot:r()*6,drag:1,lift:2});
   if(f.t<f.life&&r()<dt*(f.t<3?12:6))this.smoke.add({x:f.x+(r()-.5)*2,y:f.y+(r()-.5)*2,z:f.z+2,vx:(r()-.5)*1.5,vy:(r()-.5)*1.5,vz:5+r()*5,t:0,life:6+r()*5,size0:2+r()*2,size1:9+r()*9,dark:.05+r()*.08,rot:r()*6,drag:.15,alpha:.45+r()*.2});}
  this.burning=this.burning.filter(f=>f.t<f.life);
  for(const d of this.debris){
   d.life-=dt;if(d.rest)continue;
   d.vz-=9.81*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.z+=d.vz*dt;d.rx+=d.wx*dt;d.ry+=d.wy*dt;d.rz+=d.wz*dt;
   const g=ground?ground(d.x,d.y):-Infinity;if(d.z<g+.1){d.z=g+.1;if(Math.abs(d.vz)<3){d.rest=true;}else{d.vz*=-.3;d.vx*=.5;d.vy*=.5;d.wx*=.5;d.wy*=.5;d.wz*=.5;}}
   if(d.burn>0){d.burn-=dt;if(r()<dt*30)this.fire.add({x:d.x,y:d.y,z:d.z,vx:0,vy:0,vz:1,t:0,life:.35+r()*.3,size0:.8,size1:2.2,heat:2.6,rot:r()*6,drag:2,lift:1});}
  }
  this.debris=this.debris.filter(d=>d.life>0);
  for(const layer of [this.fire,this.smoke]){
   for(const p of layer.items){
    p.t+=dt;if(p.t<0)continue;
    const k=Math.exp(-(p.drag??0)*dt);p.vx*=k;p.vy*=k;p.vz=p.vz*k+(p.lift??0)*dt;
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.rot+=dt*.4;
   }
   layer.items=layer.items.filter(p=>p.t<p.life);
  }
  this.write();
 }
 write(){
  for(const p of this.fire.items){
   const u=Math.max(0,p.t)/p.life,born=p.t>=0?1:0;p.size=p.size0+(p.size1-p.size0)*smooth(u*1.4);
   // White-hot to yellow, orange, then a dull red that fades out.
   const heat=p.heat*(1-u)**1.5;p.r=heat*1.2;p.g=heat*(.25+.55*(1-u));p.b=heat*.18*(1-u)**2;p.a=born*(p.flash?(1-u):smooth(u*6)*(1-smooth((u-.45)/.55)));
  }
  for(const p of this.smoke.items){
   const u=Math.max(0,p.t)/p.life,born=p.t>=0?1:0;p.size=p.size0+(p.size1-p.size0)*smooth(u*1.2);
   const v=p.dark+.32*u*u;p.r=v;p.g=v*.97;p.b=v*.95;p.a=born*(p.alpha??.6)*smooth(u*8)*(1-smooth(u))**1.2;
  }
  this.fire.write();this.smoke.write();
  const m=this.debrisMesh;let n=0;
  for(const d of this.debris){this.q.setFromEuler(this.e.set(d.rx,d.ry,d.rz));this.matrix.compose(this.v.set(d.x,d.z,-d.y),this.q,this.s.set(d.sx,d.sz,d.sy));m.setMatrixAt(n++,this.matrix);}
  m.count=n;m.instanceMatrix.needsUpdate=true;
 }
 reset(){this.fire.items.length=0;this.smoke.items.length=0;this.debris.length=0;this.burning.length=0;this.write();}
 info(){return {...this.stats,fire:this.fire.items.length,smoke:this.smoke.items.length,debris:this.debris.length,burning:this.burning.length};}
}
