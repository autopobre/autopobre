import * as THREE from 'three';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Metres in the car's physics frame: +X forward, +Y left.
const WHEELS=[{x:1.55,y:.804,front:true},{x:1.55,y:-.804,front:true},
 {x:-1.117,y:.804,front:false},{x:-1.117,y:-.804,front:false}];

export class SkidMarks {
 constructor(capacity=8192){
  this.capacity=capacity;this.count=0;this.total=0;this.cursor=0;this.dirty=false;
  // The track's wetness (weather.js, main.js applyWeather): a wet tyre lays no rubber, in a drizzle or the rain (the
  // pilots, 30/10). The slip is still measured: the tyres' sound and smoke follow it.
  this.wet=0;
  this.wheels=WHEELS.map(w=>({...w,last:null,strength:0,segments:0}));
  this.previous=null;
  this.geometry=new THREE.BufferGeometry();
  for(const [name,size] of [['position',3],['skidUv',2],['strength',1]])
   this.geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(capacity*4*size),size).setUsage(THREE.DynamicDrawUsage));
  const IndexArray=capacity*4>65535?Uint32Array:Uint16Array,indices=new IndexArray(capacity*6);
  for(let i=0;i<capacity;i++)indices.set([i*4,i*4+1,i*4+2,i*4+2,i*4+1,i*4+3],i*6);
  this.geometry.setIndex(new THREE.BufferAttribute(indices,1));this.geometry.setDrawRange(0,0);
  this.material=new THREE.MeshBasicMaterial({color:0x100e0c,transparent:true,depthWrite:false,
   polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:THREE.DoubleSide});
  this.material.name='Borracha_dinamica_pneus';
  this.material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
    attribute vec2 skidUv; attribute float strength;
    varying vec2 vSkidUv; varying float vStrength;`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
     vSkidUv=skidUv; vStrength=strength;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec2 vSkidUv; varying float vStrength;`)
    .replace('#include <color_fragment>',`#include <color_fragment>
     float edge=smoothstep(0.0,0.14,vSkidUv.x)*smoothstep(0.0,0.14,1.0-vSkidUv.x);
     float grooves=0.78+0.22*smoothstep(0.08,0.25,abs(sin(vSkidUv.x*12.56637)));
     float grain=0.90+0.10*sin(vSkidUv.y*83.0+sin(vSkidUv.x*53.0));
     diffuseColor.a*=edge*grooves*grain*vStrength;`);
  };
  this.material.customProgramCacheKey=()=> 'opala-skid-marks-v1';
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.name='Marcas_de_derrapagem';
  this.mesh.frustumCulled=false;this.mesh.renderOrder=1;
 }
 breakTrails(){
  for(const w of this.wheels){w.last=null;w.strength=0;w.stamp=0;}
  this.previous=null;
 }
 createTrail(){
  // Each car owns its wheel history; all trails share this one bounded mesh.
  return {wheels:WHEELS.map(w=>({...w,last:null,strength:0,segments:0})),previous:null,
   breakTrails:SkidMarks.prototype.breakTrails,update:SkidMarks.prototype.update,
   addSegment:(a,b)=>this.addSegment(a,b)};
 }
 update(car,input,dt){
  const speed=Math.hypot(car.vx,car.vy);
  // Reset, relocation or wall correction must never draw a line across the circuit.
  if(this.previous&&Math.hypot(car.x-this.previous.x,car.y-this.previous.y)>Math.max(1,speed*dt*3))this.breakTrails();
  this.previous={x:car.x,y:car.y};
  const c=Math.cos(car.heading),s=Math.sin(car.heading);
  const longitudinal=car.vx*c+car.vy*s,lateral=-car.vx*s+car.vy*c;
  for(const [i,w] of this.wheels.entries()){
   // A wheel in the air, or on a car lying on its side or roof, leaves no rubber.
   if(car.wheelLoad&&!(car.wheelLoad[i]>0)){w.last=null;w.strength=0;continue;}
   const x=car.x+c*w.x-s*w.y,y=car.y+s*w.x+c*w.y;
   const angle=car.heading+(w.front?car.steer:0),nx=-Math.sin(angle),ny=Math.cos(angle);
   const surface=car.sample(x,y);
   // Body sideslip gates the effect: normal bicycle-model cornering alone is not a skid.
   const pointLat=lateral+car.yaw*w.x,pointLong=longitudinal-car.yaw*w.y;
   const wheelSlip=Math.abs(pointLat*Math.cos(w.front?car.steer:0)-pointLong*Math.sin(w.front?car.steer:0));
   const rearSlip=Math.abs(lateral-car.yaw*1.117);
   const drift=clamp((rearSlip-1.5)/3,0,1)*clamp((wheelSlip-.7)/2,0,1);
   const braking=clamp(((input.brake??0)-.3)/.7,0,1)*clamp((speed-8)/7,0,1)*.72;
   const handbrake=input.handbrake&&!w.front?clamp((speed-2)/5,0,1)*.86:0;
   const wheelspin=w.front?0:clamp(((car.rearSlipSpeed??0)-1)/12,0,1);
   const target=surface.onRoad?Math.max(wheelspin,speed>2?Math.max(drift*.82,braking,handbrake):0):0;
   w.strength+=(target-w.strength)*(1-Math.exp(-dt*20));
   if(!surface.onRoad||Math.abs(surface.d)>surface.width/2-.14||w.strength<.025){w.last=null;continue;}
   if(speed<1){
    w.last=null;w.stamp=(w.stamp??0)+dt;
    if(wheelspin>.1&&w.stamp>.4){
     const patch=offset=>({v:offset,strength:w.strength,edges:[-1,1].map(side=>{
      const ex=x+nx*.105*side+Math.cos(angle)*offset,ey=y+ny*.105*side+Math.sin(angle)*offset;
      return [ex,car.sample(ex,ey).z+.001,-ey];
     })});
     if(this.addSegment(patch(-.13),patch(.13)))w.segments++;w.stamp=0;
    }
    continue;
   }
   const distance=w.last?Math.hypot(x-w.last.x,y-w.last.y):0;
   if(w.last&&distance<.16)continue;
   const edges=[];
   for(const side of [-1,1]){
    const ex=x+nx*.105*side,ey=y+ny*.105*side,p=car.sample(ex,ey);
    if(!p.onRoad){edges.length=0;break;}
    // sample.z is 15 mm above the road mesh. A small lift avoids depth flicker.
    edges.push([ex,p.z+.001,-ey]);
   }
   if(!edges.length){w.last=null;continue;}
   const point={x,y,edges,strength:w.strength,v:(w.last?.v??0)+distance};
   if(w.last&&distance<2){if(this.addSegment(w.last,point))w.segments++;}
   else point.strength=0; // Feather the start of each new trail.
   w.last=point;
  }
 }
 addSegment(a,b){
  if(this.wet>0)return false;
  const i=this.cursor*4,attrs=this.geometry.attributes;
  const vertices=[a.edges[0],a.edges[1],b.edges[0],b.edges[1]];
  for(let j=0;j<4;j++){
   attrs.position.setXYZ(i+j,...vertices[j]);
   attrs.skidUv.setXY(i+j,j%2,j<2?a.v:b.v);
   attrs.strength.setX(i+j,j<2?a.strength:b.strength);
  }
  this.cursor=(this.cursor+1)%this.capacity;this.count=Math.min(this.count+1,this.capacity);this.total++;this.dirty=true;
  return true;
 }
 flush(){
  if(!this.dirty)return;
  for(const a of Object.values(this.geometry.attributes))a.needsUpdate=true;
  this.geometry.setDrawRange(0,this.count*6);this.dirty=false;
 }
 info(){return {segments:this.count,totalSegments:this.total,capacity:this.capacity,
  activeWheels:this.wheels.filter(w=>w.last).length,perWheel:this.wheels.map(w=>({front:w.front,left:w.y>0,segments:w.segments})),
  drawCalls:this.count?1:0,tyreWidth:.21};}
 dispose(){this.geometry.dispose();this.material.dispose();}
}
