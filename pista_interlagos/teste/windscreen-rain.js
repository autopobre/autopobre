import * as THREE from 'three';
import {EFFECT_LIGHT} from './weather.js';

// Rain on the Opala's windscreen and its wipers (weather.js rain; the cockpit's LIMP switch, J).
// The V06 GLB bakes the two parked wipers into the body's Metal_escuro mesh (exportar_glb_jogo.py joins meshes by
// material), so prepareWipers cuts them out of the template as it loads: the small parts at the windscreen's foot
// (cap, arm, blade, two holders each) go on two pivots that turn in the glass's plane, nothing drawn twice. The
// drops are a skin just outside the glass's outer face (a copy of it), drawn from the cockpit only: beads and drops
// that gather where the blades last passed some seconds ago, all over where they never pass, creeping up the glass
// at speed. The blades and the drops share one clock (wiperAngle), so the swept arc is clear behind each blade.
// Car frame: +X forward, +Y up, +Z right (passenger side).
const WIPER_BOX=Object.freeze({min:[.85,.88,-.7],max:[.97,.97,.15]});
// Sweep (radians from parked, up the glass), period (s) and the blades' reach from their pivots (m).
export const WIPERS=Object.freeze({sweep:[1.66,1.78],period:1.15,reach:[.04,.47]});
const PI2=Math.PI*2;

// Triangles grouped by the parts they make (vertices at the same place join), with their boxes.
function parts(geometry){
 const pos=geometry.attributes.position,n=pos.count,index=geometry.index?geometry.index.array:Uint32Array.from({length:n},(_,i)=>i);
 const keys=new Map(),canon=new Int32Array(n),parent=new Int32Array(n);
 for(let i=0;i<n;i++){const k=`${Math.round(pos.getX(i)*1e4)},${Math.round(pos.getY(i)*1e4)},${Math.round(pos.getZ(i)*1e4)}`;let c=keys.get(k);if(c===undefined){c=i;keys.set(k,i);}canon[i]=c;parent[i]=i;}
 const find=a=>{while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;};
 for(let t=0;t<index.length;t+=3){const a=find(canon[index[t]]),b=find(canon[index[t+1]]);if(a!==b)parent[b]=a;const c=find(canon[index[t+2]]),r=find(a);if(c!==r)parent[c]=r;}
 const groups=new Map();
 for(let t=0;t<index.length;t+=3){const r=find(canon[index[t]]);let g=groups.get(r);if(!g){g={tris:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};groups.set(r,g);}g.tris.push(t);
  for(let k=0;k<3;k++){const v=index[t+k];for(let a=0;a<3;a++){const x=pos.getComponent(v,a);if(x<g.min[a])g.min[a]=x;if(x>g.max[a])g.max[a]=x;}}}
 for(const g of groups.values())g.centre=g.min.map((v,a)=>(v+g.max[a])/2);
 return {groups:[...groups.values()],index};
}
// A new geometry holding some triangles of another (all its attributes), positions shifted by -origin.
function extract(geometry,index,tris,origin){
 const out=new THREE.BufferGeometry(),n=tris.length*3;
 for(const [name,a] of Object.entries(geometry.attributes)){const arr=new Float32Array(n*a.itemSize);let k=0;for(const t of tris)for(let j=0;j<3;j++){const v=index[t+j];for(let c=0;c<a.itemSize;c++)arr[k++]=a.getComponent(v,c);}out.setAttribute(name,new THREE.BufferAttribute(arr,a.itemSize,a.normalized));}
 // Indexed like the body's meshes, so a rival cloned from the template merges them into its batches (car-finish rivals).
 out.setIndex(Array.from({length:n},(_,i)=>i));out.translate(-origin.x,-origin.y,-origin.z);return out;
}
// The template's wipers on pivots (once per template, before any rival is cloned from it) and the outer face of its
// windscreen for the drops. model.userData.wipers: {pivots, axis, glass (outer face geometry, model frame), basis} or null.
export function prepareWipers(model){
 if(model.userData.wipers!==undefined)return model.userData.wipers;
 model.userData.wipers=null;
 const metal=model.getObjectByName('GLB_OPALA_99_ROOT_Metal_escuro'),glassMesh=model.getObjectByName('GLB_OPALA_99_ROOT_Policarbonato_fume');
 if(!metal?.isMesh||!glassMesh?.isMesh||!metal.geometry.index)return null;
 // The windscreen: the biggest part of the glass ahead of the cabin; its plane's normal (outward and up).
 const glass=parts(glassMesh.geometry),front=glass.groups.filter(g=>g.min[0]>.3).sort((a,b)=>b.tris.length-a.tris.length)[0];
 if(!front)return null;
 const gp=glassMesh.geometry.attributes.position,A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3(),f=new THREE.Vector3(),axis=new THREE.Vector3(),hint=new THREE.Vector3(.64,.77,0);
 for(const t of front.tris){A.fromBufferAttribute(gp,glass.index[t]);B.fromBufferAttribute(gp,glass.index[t+1]);C.fromBufferAttribute(gp,glass.index[t+2]);f.subVectors(B,A).cross(C.clone().sub(A));if(f.dot(hint)<0)f.negate();axis.add(f);}
 axis.normalize();
 // Outer face only (its normals point the axis's way), a couple of millimetres off the glass.
 const outer=front.tris.filter(t=>{A.fromBufferAttribute(gp,glass.index[t]);B.fromBufferAttribute(gp,glass.index[t+1]);C.fromBufferAttribute(gp,glass.index[t+2]);return f.subVectors(B,A).cross(C.clone().sub(A)).normalize().dot(axis)>.3;});
 const skin=extract(glassMesh.geometry,glass.index,outer.length>front.tris.length*.25?outer:front.tris,new THREE.Vector3());
 skin.deleteAttribute('uv');skin.deleteAttribute('tangent');
 // The glass's own 2D frame: across the car (z) and up its slope.
 const side=new THREE.Vector3(0,0,1),up=new THREE.Vector3().crossVectors(side,axis).normalize();
 const sp=skin.attributes.position,coords=new Float32Array(sp.count*2);
 for(let i=0;i<sp.count;i++){A.fromBufferAttribute(sp,i).addScaledVector(axis,.0025);sp.setXYZ(i,A.x,A.y,A.z);coords[i*2]=A.dot(side);coords[i*2+1]=A.dot(up);}
 skin.setAttribute('glass',new THREE.BufferAttribute(coords,2));skin.computeBoundingSphere();
 // The wipers: small parts inside the box at the windscreen's foot.
 const metalParts=parts(metal.geometry),inBox=g=>g.tris.length<=700&&g.min.every((v,a)=>v>=WIPER_BOX.min[a])&&g.max.every((v,a)=>v<=WIPER_BOX.max[a]);
 const small=metalParts.groups.filter(inBox);if(small.length<6)return null;
 const size=g=>Math.max(...g.max.map((v,a)=>v-g.min[a]));
 const caps=small.filter(g=>g.tris.length>=30&&g.tris.length<=120&&size(g)<.06).sort((a,b)=>a.centre[2]-b.centre[2]);
 const arms=[...small].sort((a,b)=>b.tris.length-a.tris.length).slice(0,2);
 if(caps.length!==2||arms.some(a=>caps.includes(a)))return null;
 const pivots=caps.map((cap,i)=>{
  const p=new THREE.Vector3(...cap.centre),arm=arms.reduce((best,a)=>{const d=Math.min(...[a.min[2],a.max[2]].map(z=>Math.abs(z-p.z)));return d<best.d?{a,d}:best;},{a:null,d:Infinity}).a;
  // The arm's far end: its point furthest from the pivot.
  const mp=metal.geometry.attributes.position,tip=new THREE.Vector3(),q=new THREE.Vector3();let far=0;
  for(const t of arm.tris)for(let j=0;j<3;j++){q.fromBufferAttribute(mp,metalParts.index[t+j]);const d=q.distanceTo(p);if(d>far){far=d;tip.copy(q);}}
  return {name:i===0?'Limpador_motorista_PIVO':'Limpador_passageiro_PIVO',pivot:p,tip,tris:[]};
 });
 // Each part to the wiper whose pivot-to-tip line passes nearest.
 const line=new THREE.Line3(),c=new THREE.Vector3(),onLine=new THREE.Vector3();
 for(const g of small){
  c.set(...g.centre);let best=null,dist=Infinity;
  for(const w of pivots){line.set(w.pivot,w.tip);line.closestPointToPoint(c,true,onLine);const d=onLine.distanceTo(c);if(d<dist){dist=d;best=w;}}
  if(dist<.04)best.tris.push(...g.tris);
 }
 // Out of the body's mesh, onto the pivots (the parent's frame: the body's ROOT meshes carry no transform of their own).
 const taken=new Set(pivots.flatMap(w=>w.tris)),keep=[];for(let t=0;t<metalParts.index.length;t+=3)if(!taken.has(t))keep.push(metalParts.index[t],metalParts.index[t+1],metalParts.index[t+2]);
 for(const w of pivots){
  const group=new THREE.Group();group.name=w.name;group.position.copy(w.pivot).applyMatrix4(metal.matrix);metal.parent.add(group);
  const mesh=new THREE.Mesh(extract(metal.geometry,metalParts.index,w.tris,w.pivot),metal.material);mesh.name=w.name.replace('_PIVO','');mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  w.object=group;w.rest=group.quaternion.clone();
  // In the glass's 2D frame: the pivot, and the parked blade's direction there.
  w.pivot2=new THREE.Vector2(w.pivot.dot(side),w.pivot.dot(up));const tipDir=new THREE.Vector2(w.tip.dot(side),w.tip.dot(up)).sub(w.pivot2);w.park=Math.atan2(tipDir.y,tipDir.x);
 }
 metal.geometry.setIndex(keep);
 return model.userData.wipers={pivots,axis,skin,side,up};
}

// The wipers' angle at a time: from parked up the glass and back, over one period.
export function wiperAngle(elapsed,sweep,period=WIPERS.period){return sweep*(1-Math.cos(PI2*elapsed/period))/2;}

const vertexShader=`attribute vec2 glass;varying vec2 vGlass;
void main(){vGlass=glass;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader=`
uniform float time,amount,fill,light,creep,wipeOn,wipeStart,wipeOff,period;
uniform vec4 wiperA,wiperB;uniform vec2 sweep;
varying vec2 vGlass;
float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 h2(vec2 p){return fract(sin(vec2(dot(p,vec2(269.5,183.3)),dot(p,vec2(113.5,271.9))))*43758.5453);}
// Seconds since a wiper's blade last passed g (1e4: it never passes there).
float since(vec2 g,vec4 w,float tmax){
 vec2 v=g-w.xy;float r=length(v);if(r<${WIPERS.reach[0].toFixed(3)}||r>${WIPERS.reach[1].toFixed(3)})return 1e4;
 float phi=w.z-atan(v.y,v.x);phi=phi-6.2831853*floor((phi+3.14159265)/6.2831853);
 if(phi<0.0||phi>tmax)return 1e4;
 if(wipeOn<.5)return time-wipeOff;
 float el=time-wipeStart,s=acos(clamp(1.0-2.0*phi/tmax,-1.0,1.0))/6.2831853,p=fract(el/period);
 if(el<s*period)return time-wipeOff;
 float last=p>=1.0-s?p-(1.0-s):(p>=s?p-s:p+s);
 return last*period;
}
// One layer of drops: cells of 'cell' metres, a drop in a share 'occupancy' of them, of radii r.x..r.y.
vec4 drops(vec2 g,float cell,float occupancy,vec2 r,float seed,float age0){
 vec2 id=floor(g/cell),f=g/cell-id;float rnd=h1(id+seed);
 if(rnd>occupancy)return vec4(0.0);
 vec2 at=g;
 float t=min(since(at,wiperA,sweep.x),since(at,wiperB,sweep.y)),delay=h1(id+seed+7.1)*fill;
 float shown=smoothstep(delay,delay+.12,t)*amount;if(shown<=0.0)return vec4(0.0);
 float rad=mix(r.x,r.y,pow(h1(id+seed+3.3),2.0))/cell;vec2 c=rad+(1.0-2.0*rad)*h2(id+seed);
 // At speed the air pushes the drops up the glass (the older ones further): they leave their cell and go.
 c.y+=creep*clamp(t-delay,0.0,3.0)*(.5+h1(id+seed+5.7))/cell;
 vec2 q=(f-c)/rad;q.y*=1.0-.35*clamp(creep*20.0,0.0,1.0);float d=length(q);if(d>1.0)return vec4(0.0);
 return vec4(q,d,shown);
}
// The thin film of water left between the drops where the blades have not passed for a while.
float film(vec2 g){float t=min(since(g,wiperA,sweep.x),since(g,wiperB,sweep.y));return amount*smoothstep(.2,fill*1.2,t);}
void main(){
 vec4 a=drops(vGlass,.009,.6,vec2(.0012,.0026),1.7,0.0),b=drops(vGlass,.024,.5,vec2(.003,.0068),9.3,0.0),k=b.w>0.0?b:a;
 float wet=film(vGlass)*.07;
 if(k.w<=0.0){if(wet<.004)discard;gl_FragColor=vec4(vec3(.55,.58,.62)*light,wet);return;}
 vec2 q=k.xy;float d=k.z;
 // A drop is a little lens: the dark ground turned over in its upper half, the bright sky in its lower, a dark rim
 // and one highlight.
 float body=1.0-smoothstep(.82,1.0,d),rim=smoothstep(.5,.95,d)*body,spec=smoothstep(.28,0.0,length(q-vec2(-.32,.38)));
 vec3 col=light*mix(vec3(.92,.93,.95),vec3(.2,.21,.23),smoothstep(-.35,.55,q.y))*(1.0-.6*rim)+light*spec*1.6;
 float alpha=max(wet,k.w*(body*(.38+.45*rim)+spec*.5));
 if(alpha<.01)discard;
 gl_FragColor=vec4(col,alpha);
}`;

export class WindscreenRain{
 constructor(){
  this.uniforms={time:{value:0},amount:{value:0},fill:{value:2.5},light:{value:1},creep:{value:0},wipeOn:{value:0},wipeStart:{value:0},wipeOff:{value:-100},period:{value:WIPERS.period},
   wiperA:{value:new THREE.Vector4()},wiperB:{value:new THREE.Vector4()},sweep:{value:new THREE.Vector2(...WIPERS.sweep)}};
  // Both sides: the skin's faces look out of the car, the driver sees them from behind.
  this.material=new THREE.ShaderMaterial({name:'Gotas_parabrisa',vertexShader,fragmentShader,uniforms:this.uniforms,transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide,
   blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
  this.mesh=null;this.model=null;this.on=false;this.stopping=false;this.time=0;this.wipeStart=0;this.angles=[0,0];
 }
 // The player's car as loaded (its template after prepareWipers); holder: the group the body sits in, in the same
 // frame (the drops are not part of the template: rivals cloned from it carry none).
 attach(model,holder){
  this.mesh?.removeFromParent();this.mesh=null;this.model=model;const w=model?.userData.wipers;if(!w)return;
  this.mesh=new THREE.Mesh(w.skin,this.material);this.mesh.name='Gotas_no_parabrisa';this.mesh.renderOrder=5;this.mesh.frustumCulled=false;this.mesh.visible=false;
  holder.add(this.mesh);
  const [a,b]=w.pivots;this.uniforms.wiperA.value.set(a.pivot2.x,a.pivot2.y,a.park,0);this.uniforms.wiperB.value.set(b.pivot2.x,b.pivot2.y,b.park,0);
  this.place();
 }
 // On (true) the blades start from parked; off, they finish their stroke and park.
 setWipers(on){
  if(on===this.on&&!this.stopping)return this.on;
  if(on){if(!this.on){this.on=true;this.stopping=false;this.wipeStart=this.time;}else this.stopping=false;}
  else if(this.on)this.stopping=true;
  return this.on&&!this.stopping;
 }
 get wiping(){return this.on&&!this.stopping;}
 place(){
  const w=this.model?.userData.wipers;if(!w)return;
  w.pivots.forEach((p,i)=>{p.object.quaternion.copy(p.rest).premultiply(new THREE.Quaternion().setFromAxisAngle(w.axis,this.angles[i]));});
 }
 // dt: seconds (0 paused); rain: the weather's drops share (0 dry); fill: seconds for the glass to fill again behind a
 // blade; speed: m/s; inside: the cockpit view (the drops draw only there).
 update(dt,{rain=0,speed=0,inside=false}={}){
  this.time+=dt;const u=this.uniforms;u.time.value=this.time;
  if(this.on){
   const el=this.time-this.wipeStart,cycle=Math.floor(el/WIPERS.period);
   // A stop waits for the stroke to end (both blades parked).
   if(this.stopping&&cycle>=(this.stopCycle??=cycle)+1){this.on=false;this.stopping=false;this.stopCycle=undefined;this.angles=[0,0];u.wipeOff.value=this.time;}
   else this.angles=WIPERS.sweep.map(s=>wiperAngle(el,s));
  }
  if(!this.stopping)this.stopCycle=undefined;
  this.place();
  u.wipeOn.value=this.on?1:0;u.wipeStart.value=this.wipeStart;
  u.amount.value=Math.min(1,rain*1.4);u.fill.value=rain>0?2.2/Math.max(.25,rain):1e3;
  u.creep.value=Math.max(0,speed-22)*.0009;u.light.value=Math.max(.05,EFFECT_LIGHT.value*.95);
  if(this.mesh)this.mesh.visible=inside&&rain>0&&!!this.model?.visible;
 }
 info(){
  const m=this.mesh;let skin=null;
  if(m){const box=new THREE.Box3().setFromObject(m),chain=[];for(let o=m;o;o=o.parent)chain.push(`${o.name||o.type}:${o.visible?1:0}`);skin={verts:m.geometry.attributes.position.count,box:[box.min.toArray(),box.max.toArray()].map(v=>v.map(x=>+x.toFixed(2))),chain:chain.join('<')};}
  return {skin,ready:!!this.mesh,on:this.on,stopping:this.stopping,angles:this.angles.map(a=>+a.toFixed(3)),visible:!!this.mesh?.visible,pivots:this.model?.userData.wipers?.pivots.map(p=>({name:p.name,tris:p.tris.length,at:p.pivot.toArray().map(v=>+v.toFixed(3))}))??null};}
}
