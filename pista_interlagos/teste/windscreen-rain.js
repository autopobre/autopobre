import * as THREE from 'three';
import {EFFECT_LIGHT} from './weather.js';

// Rain on the windscreen and its wipers (weather.js rain; the Opala cockpit's LIMP switch, J), for the Opala and the Fusca.
// Their GLBs bake the parked wipers into a body mesh (exportar_glb_jogo.py and the Fusca's exporter join meshes by
// material), so prepareWipers cuts them out of the template as it loads: the small parts at the windscreen's foot go
// on two pivots that turn in the glass's plane, nothing drawn twice. The drops are a skin just outside the glass's
// outer face (a copy of it), drawn from the cockpit only: beads and drops that gather where the blades last passed
// some seconds ago, all over where they never pass, creeping up the glass at speed. The blades and the drops share
// one clock (wiperAngle), so the swept arc is clear behind each blade.
// Car frame: +X forward, +Y up, +Z right (passenger side).
// WIPER_PROFILES: the mesh holding the wipers and the glass's, the box the wiper parts lie in, the windscreen's
// rough normal (hint), how the pivots are found ('caps': the Opala's pivot caps, cap/arm/blade/holders per wiper;
// 'outer': the Fusca's bare blades, turning about their outer ends), sweep (radians from parked, up the glass) and the
// blades' reach from their pivots (m).
export const WIPER_PROFILES=Object.freeze({
 opala:Object.freeze({wipers:'GLB_OPALA_99_ROOT_Metal_escuro',glass:'GLB_OPALA_99_ROOT_Policarbonato_fume',box:{min:[.85,.88,-.7],max:[.97,.97,.15]},maxTris:700,hint:[.64,.77,0],frontX:.3,
  pivots:'caps',sweep:[1.66,1.78],reach:[.04,.47]}),
 fusca:Object.freeze({wipers:'GLB_FUSCA_ROOT_Borracha',glass:'GLB_FUSCA_ROOT_Vidro_fusca',box:{min:[.72,.86,-.5],max:[.86,.98,.5]},maxTris:300,hint:[.8,.6,0],frontX:-.2,
  pivots:'outer',sweep:[1.32,1.32],reach:[.03,.43]})
});
// The period (s) of a stroke; WIPERS keeps the Opala's numbers for the checks.
export const WIPERS=Object.freeze({sweep:WIPER_PROFILES.opala.sweep,period:1.15,reach:WIPER_PROFILES.opala.reach});
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
// The point of some triangles furthest from p (a blade's or an arm's far end).
function farthest(geometry,index,tris,p){
 const pos=geometry.attributes.position,q=new THREE.Vector3(),best=new THREE.Vector3();let far=-1;
 for(const t of tris)for(let j=0;j<3;j++){q.fromBufferAttribute(pos,index[t+j]);const d=q.distanceTo(p);if(d>far){far=d;best.copy(q);}}
 return best;
}
// What prepareWipers found, per template: {profile, pivots, axis, skin, side, up} or null. Not in userData: three.js
// copies userData through JSON on every clone (each rival would serialise the drops' geometry).
const WIPER_DATA=new WeakMap();
export const wipersOf=model=>model?WIPER_DATA.get(model)??null:null;
// The template's wipers on pivots (once per template, before any car is cloned from it) and the outer face of its
// windscreen for the drops.
export function prepareWipers(model,profile=WIPER_PROFILES.opala){
 if(WIPER_DATA.has(model))return WIPER_DATA.get(model);
 WIPER_DATA.set(model,null);
 const metal=model.getObjectByName(profile.wipers),glassMesh=model.getObjectByName(profile.glass);
 if(!metal?.isMesh||!glassMesh?.isMesh||!metal.geometry.index)return null;
 // The windscreen: the biggest part of the glass ahead of the cabin; its plane's normal (outward and up), from the faces
 // that look roughly the hint's way (not the quarter windows a part may carry along).
 const hint=new THREE.Vector3(...profile.hint).normalize(),glass=parts(glassMesh.geometry),front=glass.groups.filter(g=>g.min[0]>profile.frontX).sort((a,b)=>b.tris.length-a.tris.length)[0];
 if(!front)return null;
 const gp=glassMesh.geometry.attributes.position,A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3(),f=new THREE.Vector3(),axis=new THREE.Vector3();
 const normal=t=>{A.fromBufferAttribute(gp,glass.index[t]);B.fromBufferAttribute(gp,glass.index[t+1]);C.fromBufferAttribute(gp,glass.index[t+2]);return f.subVectors(B,A).cross(C.clone().sub(A));};
 for(const t of front.tris){const n=normal(t),l=n.length();if(l>0&&Math.abs(n.dot(hint))/l>.5)axis.addScaledVector(n,Math.sign(n.dot(hint)));}
 axis.normalize();
 // Outer face only (its normals point the axis's way), a couple of millimetres off the glass.
 const outer=front.tris.filter(t=>normal(t).normalize().dot(axis)>.5);
 const skin=extract(glassMesh.geometry,glass.index,outer.length>front.tris.length*.15?outer:front.tris,new THREE.Vector3());
 skin.deleteAttribute('uv');skin.deleteAttribute('tangent');
 // The glass's own 2D frame: across the car (z) and up its slope.
 const side=new THREE.Vector3(0,0,1),up=new THREE.Vector3().crossVectors(side,axis).normalize();
 const sp=skin.attributes.position,coords=new Float32Array(sp.count*2);
 for(let i=0;i<sp.count;i++){A.fromBufferAttribute(sp,i).addScaledVector(axis,.0025);sp.setXYZ(i,A.x,A.y,A.z);coords[i*2]=A.dot(side);coords[i*2+1]=A.dot(up);}
 skin.setAttribute('glass',new THREE.BufferAttribute(coords,2));skin.computeBoundingSphere();
 // The wipers: small parts inside the box at the windscreen's foot.
 const box=profile.box,metalParts=parts(metal.geometry),inBox=g=>g.tris.length<=profile.maxTris&&g.min.every((v,a)=>v>=box.min[a])&&g.max.every((v,a)=>v<=box.max[a]);
 const small=metalParts.groups.filter(inBox),names=['Limpador_motorista_PIVO','Limpador_passageiro_PIVO'];let pivots;
 if(profile.pivots==='caps'){
  if(small.length<6)return null;
  const size=g=>Math.max(...g.max.map((v,a)=>v-g.min[a]));
  const caps=small.filter(g=>g.tris.length>=30&&g.tris.length<=120&&size(g)<.06).sort((a,b)=>a.centre[2]-b.centre[2]);
  const arms=[...small].sort((a,b)=>b.tris.length-a.tris.length).slice(0,2);
  if(caps.length!==2||arms.some(a=>caps.includes(a)))return null;
  pivots=caps.map((cap,i)=>{
   const p=new THREE.Vector3(...cap.centre),arm=arms.reduce((best,a)=>{const d=Math.min(...[a.min[2],a.max[2]].map(z=>Math.abs(z-p.z)));return d<best.d?{a,d}:best;},{a:null,d:Infinity}).a;
   return {name:names[i],pivot:p,tip:farthest(metal.geometry,metalParts.index,arm.tris,p),tris:[]};
  });
 }else{
  // Bare blades: each turns about its outer end (the one further from the car's middle).
  const blades=[...small].sort((a,b)=>b.tris.length-a.tris.length).slice(0,2).sort((a,b)=>a.centre[2]-b.centre[2]);
  if(blades.length!==2)return null;
  pivots=blades.map((g,i)=>{const end=farthest(metal.geometry,metalParts.index,g.tris,new THREE.Vector3(g.centre[0],g.centre[1],0));return {name:names[i],pivot:end,tip:farthest(metal.geometry,metalParts.index,g.tris,end),tris:[]};});
 }
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
  w.rest=group.quaternion.clone();
  // In the glass's 2D frame: the pivot and the parked blade's direction; turn: which way is up the glass (+1 a blade
  // parked pointing to the driver's side, as the Opala's; -1 to the passenger's, the Fusca's driver-side blade).
  w.pivot2=new THREE.Vector2(w.pivot.dot(side),w.pivot.dot(up));const tipDir=new THREE.Vector2(w.tip.dot(side),w.tip.dot(up)).sub(w.pivot2);w.park=Math.atan2(tipDir.y,tipDir.x);w.turn=tipDir.x<0?1:-1;
 }
 metal.geometry.setIndex(keep);
 const data={profile,pivots,axis,skin,side,up};WIPER_DATA.set(model,data);return data;
}

// The wipers' angle at a time: from parked up the glass and back, over one period.
export function wiperAngle(elapsed,sweep,period=WIPERS.period){return sweep*(1-Math.cos(PI2*elapsed/period))/2;}

const vertexShader=`attribute vec2 glass;varying vec2 vGlass;
void main(){vGlass=glass;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader=`
uniform float time,amount,fill,light,creep,wipeOn,wipeStart,wipeOff,period;
uniform vec4 wiperA,wiperB;uniform vec2 sweep,reach;
varying vec2 vGlass;
float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 h2(vec2 p){return fract(sin(vec2(dot(p,vec2(269.5,183.3)),dot(p,vec2(113.5,271.9))))*43758.5453);}
// Seconds since a wiper's blade last passed g (1e4: it never passes there). w: pivot (xy), parked angle (z) and the
// way up the glass (w: +1 or -1).
float since(vec2 g,vec4 w,float tmax){
 vec2 v=g-w.xy;float r=length(v);if(r<reach.x||r>reach.y)return 1e4;
 float phi=w.w*(w.z-atan(v.y,v.x));phi=phi-6.2831853*floor((phi+3.14159265)/6.2831853);
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

const turnBy=new THREE.Quaternion();
export class WindscreenRain{
 constructor(){
  this.uniforms={time:{value:0},amount:{value:0},fill:{value:2.5},light:{value:1},creep:{value:0},wipeOn:{value:0},wipeStart:{value:0},wipeOff:{value:-100},period:{value:WIPERS.period},
   wiperA:{value:new THREE.Vector4()},wiperB:{value:new THREE.Vector4()},sweep:{value:new THREE.Vector2(...WIPERS.sweep)},reach:{value:new THREE.Vector2(...WIPERS.reach)}};
  // Both sides: the skin's faces look out of the car, the driver sees them from behind.
  this.material=new THREE.ShaderMaterial({name:'Gotas_parabrisa',vertexShader,fragmentShader,uniforms:this.uniforms,transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide,
   blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
  this.mesh=null;this.model=null;this.wipers=null;this.blades=[];this.sweep=WIPERS.sweep;this.on=false;this.stopping=false;this.time=0;this.wipeStart=0;this.angles=[0,0];
 }
 // The player's car (the Opala's template as loaded, or a Fusca cloned from its template after prepareWipers); its
 // pivots are found by name in it. holder: where the drops go, in the car's own frame (the Opala's shell: the
 // template stays clean for the rivals cloned from it; a clone itself).
 attach(model,holder,wipers=wipersOf(model)){
  this.mesh?.removeFromParent();this.mesh=null;this.model=model;this.wipers=wipers??null;this.blades=[];if(!wipers)return;
  this.blades=wipers.pivots.map(p=>model.getObjectByName(p.name)).filter(Boolean);
  this.sweep=wipers.profile.sweep;this.uniforms.sweep.value.set(...this.sweep);this.uniforms.reach.value.set(...wipers.profile.reach);
  this.mesh=new THREE.Mesh(wipers.skin,this.material);this.mesh.name='Gotas_no_parabrisa';this.mesh.renderOrder=5;this.mesh.frustumCulled=false;this.mesh.visible=false;
  holder.add(this.mesh);
  const [a,b]=wipers.pivots;this.uniforms.wiperA.value.set(a.pivot2.x,a.pivot2.y,a.park,a.turn);this.uniforms.wiperB.value.set(b.pivot2.x,b.pivot2.y,b.park,b.turn);
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
  const w=this.wipers;if(!w)return;
  this.blades.forEach((o,i)=>{const p=w.pivots[i];o.quaternion.copy(p.rest).premultiply(turnBy.setFromAxisAngle(w.axis,this.angles[i]*p.turn));});
 }
 // dt: seconds (0 paused); rain: the weather's drops share (0 dry); fill: seconds for the glass to fill again behind a
 // blade; speed: m/s; inside: the cockpit view (the drops draw only there).
 update(dt,{rain=0,speed=0,inside=false}={}){
  this.time+=dt;const u=this.uniforms;u.time.value=this.time;
  if(this.on){
   const el=this.time-this.wipeStart,cycle=Math.floor(el/WIPERS.period);
   // A stop waits for the stroke to end (both blades parked).
   if(this.stopping&&cycle>=(this.stopCycle??=cycle)+1){this.on=false;this.stopping=false;this.stopCycle=undefined;this.angles=[0,0];u.wipeOff.value=this.time;}
   else this.angles=this.sweep.map(s=>wiperAngle(el,s));
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
  return {skin,ready:!!this.mesh,on:this.on,stopping:this.stopping,angles:this.angles.map(a=>+a.toFixed(3)),visible:!!this.mesh?.visible,blades:this.blades.length,pivots:this.wipers?.pivots.map(p=>({name:p.name,tris:p.tris.length,turn:p.turn,at:p.pivot.toArray().map(v=>+v.toFixed(3))}))??null};}
}
