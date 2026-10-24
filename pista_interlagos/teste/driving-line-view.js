// The driving line on the asphalt (Linha ideal, key O; driving-line.js lays it): a ribbon of chevrons pointing the way,
// coloured by what the pedals should do there: green accelerate, yellow hold or lift, red brake (the deeper the red,
// the harder). Ahead of the car the colours are worked out each frame from its speed, so the red starts where this
// car must brake (GuidePlan.effort); the rest of the lap shows the plan's own colours. 'curvas' shows only the stretch
// from just before each braking point to where the throttle can go down again. One mesh, one draw call: the colours
// change only round the car (an update range of the colour buffer).
import * as THREE from 'three';
import {drivingLineSoon,GuidePlan,effortColor} from './driving-line.js';
const HALF=.45,LIFT=.03,PERIOD=3,SWEEP=.45,DUTY=.55,OPACITY=.82;
// Round the car: hidden from BEHIND metres back to just ahead of its centre (the body sits on it), then faded in over
// NEAR metres; coloured from its speed over the next AHEAD metres (or seconds at its speed, whichever is longer);
// MARGIN metres either side put back to the plan's colours as the window moves on.
const BEHIND=40,NEAR=8,AHEAD=400,AHEAD_TIME=8,MARGIN=60;
// Colours of efforts -1 (accelerate) to 1 (brake), linear and 8-bit, every hundredth.
const LUT=new Uint8Array(201*3);{const c=[0,0,0],tone=new THREE.Color();for(let j=0;j<=200;j++){effortColor(j/100-1,c);tone.setRGB(c[0],c[1],c[2],THREE.SRGBColorSpace);LUT.set([tone.r,tone.g,tone.b].map(v=>Math.round(v*255)),j*3);}}
// How much of the line a mode shows at an effort: all of it, or (curvas) the braking, holding and lifting.
const shown=(mode,e)=>mode==='curvas'?Math.min(1,Math.max(0,(e+.75)/.35)):1;
export class DrivingLineView {
 constructor(){
  this.root=new THREE.Group();this.root.name='Linha_ideal';this.root.visible=false;
  this.mesh=null;this.line=null;this.plan=null;this.model=null;this.pending=null;this.data=null;
  this.buffer=new Float32Array(1);this.last=-1;this.mode=null;this.dirty=false;
 }
 // Shown for this car on this circuit (heightAt(x, y, station): the road's height there), in a mode ('completa',
 // 'curvas'), the car at station i at speed (m/s, along the road), on tyres at weatherGrip. The line is laid the first
 // time a car of that kind asks (a slice at a time: drivingLineSoon); hidden until then. light: how bright it is drawn
 // (unlit, it would glow in the dark as the eye adapts: dimmer at dusk and at night).
 show(data,car,{mode,heightAt,weatherGrip=1,light=1}){
  const m=car.mechanics;
  if(this.data!==data||this.model!==m.name){
   this.data=data;this.model=m.name;this.dispose();const ask=this.pending=drivingLineSoon(data,m);
   ask.then(line=>{if(this.pending===ask){this.pending=null;this.build(line,heightAt,weatherGrip);}},error=>console.warn('Linha ideal:',error));
  }
  if(!this.mesh){this.root.visible=false;return;}
  this.root.visible=true;this.mesh.material.color.setScalar(light);
  const S=car.surface,speed=Math.max(0,car.vx*S.tx+car.vy*S.ty);
  this.update(S.i,speed,mode,weatherGrip);
 }
 hide(){this.root.visible=false;}
 build(line,heightAt,weatherGrip){
  const n=line.n,rows=n+1,position=new Float32Array(rows*6),uv=new Float32Array(rows*4),index=new Uint32Array(n*6);
  // The chevrons' period fits the lap a whole number of times: no seam at the line.
  let length=0;const along=new Float64Array(rows);
  for(let k=0;k<n;k++){along[k]=length;const j=(k+1)%n;length+=Math.hypot(line.x[j]-line.x[k],line.y[j]-line.y[k]);}along[n]=length;
  this.period=length/Math.max(1,Math.round(length/PERIOD));
  for(let r=0;r<rows;r++){
   const k=r%n,p=(k+n-1)%n,q=(k+1)%n,tx=line.x[q]-line.x[p],ty=line.y[q]-line.y[p],l=Math.hypot(tx,ty)||1,lx=-ty/l,ly=tx/l;
   for(const [side,s] of [[0,1],[1,-1]]){
    const x=line.x[k]+lx*HALF*s,y=line.y[k]+ly*HALF*s,o=(r*2+side)*3;
    position[o]=x;position[o+1]=heightAt(x,y,k)+LIFT;position[o+2]=-y;
    uv[(r*2+side)*2]=s;uv[(r*2+side)*2+1]=along[r];
   }
  }
  for(let k=0;k<n;k++){const a=k*2,b=a+2;index.set([a,a+1,b,b,a+1,b+1],k*6);}
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(position,3));
  geometry.setAttribute('lineUv',new THREE.BufferAttribute(uv,2));
  this.colors=new Uint8Array(rows*8);
  geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,4,true).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(index,1));geometry.computeBoundingSphere();
  const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:OPACITY,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
  material.name='Linha_ideal';const period={value:this.period};
  material.onBeforeCompile=shader=>{
   shader.uniforms.linePeriod=period;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 lineUv;\nvarying vec2 vLineUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLineUv=lineUv;');
   // A chevron a period, its arms swept back to the edges (pointing the way), antialiased; where a period is a few
   // pixels (far off) the stripes blend into an even band instead of shimmering.
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float linePeriod;\nvarying vec2 vLineUv;').replace('#include <color_fragment>',`#include <color_fragment>
    float across=abs(vLineUv.x),phase=(vLineUv.y+${SWEEP.toFixed(2)}*across)/linePeriod,fw=fwidth(phase);
    float t=fract(phase),centre=${(DUTY/2).toFixed(3)},gap=min(abs(t-centre),1.0-abs(t-centre));
    float stripe=1.0-smoothstep(centre-fw,centre+fw,gap);
    stripe=mix(stripe,${DUTY.toFixed(2)},smoothstep(.12,.35,fw));
    diffuseColor.a*=stripe*(1.0-smoothstep(.72,1.0,across));`);
  };
  material.customProgramCacheKey=()=>'linha-ideal-v1';
  this.mesh=new THREE.Mesh(geometry,material);this.mesh.name='Linha_ideal_setas';this.mesh.renderOrder=2;this.mesh.frustumCulled=false;
  this.root.add(this.mesh);
  this.line=line;this.plan=new GuidePlan(line,weatherGrip);this.buffer=new Float32Array(Math.ceil((Math.max(AHEAD,95*AHEAD_TIME)+MARGIN)/line.ds)+2);this.last=-1;this.mode=null;
 }
 // One station's colour: an effort at an alpha (0..1).
 paint(k,e,alpha){
  const j=Math.round((Math.min(1,Math.max(-1,e))+1)*100)*3,a=Math.round(Math.min(1,Math.max(0,alpha))*255),C=this.colors;
  for(const r of k===0?[0,this.line.n]:[k])for(let v=0;v<2;v++){const o=(r*2+v)*4;C[o]=LUT[j];C[o+1]=LUT[j+1];C[o+2]=LUT[j+2];C[o+3]=a;}
 }
 // The whole lap in the plan's colours (a new mode, new tyres, a jump of the car).
 still(mode){const n=this.line.n,e=this.plan.still;for(let k=0;k<n;k++)this.paint(k,e[k],shown(mode,e[k]));this.full=true;}
 update(i,speed,mode,weatherGrip){
  const line=this.line,n=line.n,ds=line.ds,attr=this.mesh.geometry.attributes.color;
  const back=Math.ceil(BEHIND/ds),margin=Math.ceil(MARGIN/ds),ahead=Math.min(n-back-2*margin-2,this.buffer.length,Math.ceil(Math.max(AHEAD,speed*AHEAD_TIME)/ds));
  const jump=this.last<0||Math.min(Math.abs(i-this.last),n-Math.abs(i-this.last))>margin/2;
  if(this.plan.setGrip(weatherGrip)||mode!==this.mode||jump){this.mode=mode;this.still(mode);}
  this.last=i;
  // Behind the car: the plan's colours again past BEHIND, nothing up to it; ahead, its own.
  const e=this.plan.effort(i,speed,ahead,this.buffer),still=this.plan.still,at=j=>((i+j)%n+n)%n;this.ahead=ahead;
  for(let j=-back-margin;j<-back;j++)this.paint(at(j),still[at(j)],shown(mode,still[at(j)]));
  for(let j=-back;j<0;j++)this.paint(at(j),0,0);
  for(let j=0;j<ahead;j++){const d=j*ds;this.paint(at(j),e[j],shown(mode,e[j])*Math.min(1,Math.max(0,(d-1.5)/NEAR)));}
  for(let j=ahead;j<ahead+margin;j++)this.paint(at(j),still[at(j)],shown(mode,still[at(j)]));
  // Upload: the whole buffer after a repaint, else the rows from -back-margin to ahead+margin (in two runs across the line).
  attr.clearUpdateRanges();
  if(this.full){this.full=false;}
  else{
   const from=at(-back-margin),count=back+ahead+2*margin;
   if(from+count<=n)attr.addUpdateRange(from*8,count*8);else{attr.addUpdateRange(from*8,(n-from)*8);attr.addUpdateRange(0,(from+count-n)*8);}
   attr.addUpdateRange(n*8,8);
  }
  attr.needsUpdate=true;
 }
 // For the checks: the line, and from the last frame the metres to the first braking ahead and the share of each colour.
 info(){
  if(!this.line)return {model:this.model,pending:!!this.pending,visible:false};
  const e=this.buffer.subarray(0,this.ahead??0),red=e.findIndex(v=>v>=.12),share=f=>e.length?e.filter(f).length/e.length:0;
  return {model:this.model,weatherGrip:this.plan.weatherGrip,stations:this.line.n,period:this.period,lap:this.line.time,rivalsLine:this.line.minCurvature,guideLap:this.plan.time,visible:this.root.visible,drawn:this.mode,triangles:this.line.n*2,
   station:this.last,ahead:e.length*this.line.ds,brakeIn:red<0?null:red*this.line.ds,green:share(v=>v<-.5),yellow:share(v=>v>=-.5&&v<.12),red:share(v=>v>=.12)};
 }
 dispose(){if(this.mesh){this.root.remove(this.mesh);this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh=null;}this.line=null;this.plan=null;this.pending=null;}
}
