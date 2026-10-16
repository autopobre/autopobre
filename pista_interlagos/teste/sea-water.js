import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {skyMirror} from './sky.js';

// The sea round a coastal circuit (Floripa: the strait between the island and the continent, data.meta.sea_level_m):
// one plane at sea level from the track out past the far rings (far-terrain.js), over a sea bed the track file digs
// below 0 (bathymetry). The water is the bay's: green-grey and murky close to the shore and under the bridges, bluer
// and darker out in the bays; the sky is in it through the sky's own map (fresnel; sky.js skyMirror), a wind chop of three
// octaves of moving ripples breaks it up, the sun leaves a glitter path, and a thin band of churned water marks the
// shore. The shallows come from the terrain grid: a depth map over the grid, deep everywhere beyond it.
const SIZE=90000;
function depthTexture(data,level){
 const t=data.terrain,{nx,ny}=t,out=new Uint8Array(nx*ny*4);
 for(let i=0;i<nx*ny;i++){const d=Math.max(0,Math.min(1,(level-t.z[i])/14));out[i*4]=Math.round(d*255);out[i*4+1]=t.z[i]<level?255:0;out[i*4+2]=0;out[i*4+3]=255;}
 const tex=new THREE.DataTexture(out,nx,ny,THREE.RGBAFormat);tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearFilter;tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;tex.needsUpdate=true;
 return tex;
}
export function createSea(data,{mobile=false}={}){
 const level=data.meta.sea_level_m??0,t=data.terrain,root=new THREE.Group();root.name='Mar';
 const geometry=new THREE.PlaneGeometry(SIZE,SIZE,1,1).rotateX(-Math.PI/2);
 const uniforms={seaTime:{value:0},seaDepth:{value:depthTexture(data,level)},
  seaGrid:{value:new THREE.Vector4(t.x0,t.y0,(t.nx-1)*t.step,(t.ny-1)*t.step)}};
 // (the sky in it at its full colour: sky.js SKY_REFLECTION, the world's lighting map greys it for the shade)
 const material=skyMirror(new THREE.MeshStandardMaterial({name:'Agua_baia',color:0x2f5552,roughness:.07,metalness:0}));
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSeaWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSeaWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform float seaTime;uniform sampler2D seaDepth;uniform vec4 seaGrid;varying vec3 vSeaWorld;
float seaHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float seaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(seaHash(i),seaHash(i+vec2(1,0)),f.x),mix(seaHash(i+vec2(0,1)),seaHash(i+vec2(1,1)),f.x),f.y);}
// Height of the chop at p (metres, x east, y north): three octaves, each drifting downwind (from the south-east) at the
// speed of water waves of its size, turned a little apart so they never line up.
float seaChop(vec2 p){
 float t=seaTime,h=0.;
 h+=seaNoise(mat2(.8,-.6,.6,.8)*p/7.5+vec2(.21,.33)*t)*.5;
 h+=seaNoise(mat2(.96,.28,-.28,.96)*p/2.9+vec2(-.12,.4)*t*1.4)*.3;
 h+=seaNoise(p/1.1+vec2(.3,.1)*t*2.2)*.2;
 return h;
}
// Grid uv of the depth map (clamped outside: deep sea).
vec2 seaUv(vec3 w){return vec2((w.x-seaGrid.x)/seaGrid.z,(-w.z-seaGrid.y)/seaGrid.w);}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 su=seaUv(vSeaWorld);float inGrid=step(0.,su.x)*step(su.x,1.)*step(0.,su.y)*step(su.y,1.);
vec4 sd=texture2D(seaDepth,clamp(su,0.,1.));
float depth=mix(1.,sd.r,inGrid);
// Water takes little light in: dark green-black over the channels (the aerial photos), brownish green over the shallows;
// the sky it reflects gives most of its colour.
vec3 shallow=vec3(.075,.095,.065),deep=vec3(.022,.05,.052);
diffuseColor.rgb=mix(shallow,deep,smoothstep(.05,.7,depth));
// The shore: a strip of churned, lighter water where the bed comes up to the surface.
float shore=inGrid*(1.-smoothstep(.0,.035,depth))*sd.g;
float foam=shore*smoothstep(.45,.75,seaNoise(vec2(vSeaWorld.x,-vSeaWorld.z)/1.8+seaTime*.25));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.57,.53),foam*.7+shore*.06);`);
  // The chop bends the normal; the slope of the height field, by finite differences, fades with distance so far
  // water lies calm and glossy (the sky in it) instead of shimmering.
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
{vec2 p=vec2(vSeaWorld.x,-vSeaWorld.z);float e=.35;float dist=length(vSeaWorld-cameraPosition);
float k=(1.-smoothstep(60.,900.,dist))*.75+.08;
float h0=seaChop(p),hx=seaChop(p+vec2(e,0.)),hy=seaChop(p+vec2(0.,e));
vec3 wn=normalize(vec3(-(hx-h0)/e*k,1.,(hy-h0)/e*k));
normal=normalize((viewMatrix*vec4(wn,0.)).xyz);}`);
  // Rougher (wider sun path, softer sky) over the near chop, mirror-like far off.
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=mix(.16,.05,smoothstep(80.,1500.,length(vSeaWorld-cameraPosition)));`);
 };
 material.customProgramCacheKey=()=>'sea-water-v1';
 // Drawn after the opaque world and the ground (renderOrder: the ground .25, the far rings .27, the sky .5): its costly
 // chop runs only on the water that shows, not under the city, the bridges and the land that cover the plane.
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Mar_superficie';mesh.position.y=level;mesh.receiveShadow=!mobile;mesh.frustumCulled=false;mesh.renderOrder=.3;
 root.add(mesh);
 const boats=createBoats(data,level,{mobile});root.add(boats.root);
 // After dark: the boats' lamps and their streaks on the water, and the seafront's lamps (beira-mar.js) in the bay.
 const night=lightUniforms(),stats={level,size:SIZE,boats:boats.count,night:{level:0,anchorLights:boats.lights.length,glints:0,shoreGlints:0}};
 const boatLights=nightLights(boats.lights,night,{name:'Barcos_luzes',minPx:1.7,floor:.3});root.add(boatLights.mesh);
 const boatGlints=waterGlints(boats.lights,night,{name:'Barcos_reflexos',level,slope:.05});root.add(boatGlints.mesh);stats.night.glints=boats.lights.length;
 boats.attach([boatLights,boatGlints]);
 // The seafront lamps stand in beira-mar.js (created beside this module): found in the scene by their light pools the
 // first night (each pool's radius tells the lamp: beira-mar.js LAMPS), their streaks laid on the water once.
 const LAMP_OF_POOL=[[7.5,5.8,[1,.86,.66]],[9,7.6,[1,.9,.76]],[11,9.5,[1,.92,.8]]];
 let shore=null;
 function findShore(){
  shore=false;const pools=root.parent?.getObjectByName('Beira_mar_luz_chao');if(!pools?.isInstancedMesh)return;
  const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),list=[],r=random(9907);
  for(let k=0;k<pools.count;k++){
   pools.getMatrixAt(k,m);m.decompose(p,q,s);const lamp=LAMP_OF_POOL.reduce((a,b)=>Math.abs(b[0]-s.x)<Math.abs(a[0]-s.x)?b:a),y=-p.z;
   // Only lamps by the water: the bed below sea level within 40 m of the pole.
   if(![[0,0],[30,0],[-30,0],[0,30],[0,-30]].some(([dx,dy])=>{const z=bedAt(data,p.x+dx,y+dy);return z!=null&&z<level-.3;}))continue;
   list.push({p:[p.x,y,p.y-.06+lamp[1]],c:lamp[2],i:1.6+r()*.5,s:.35,g:0,on:.1+r()*.12,ph:r()});
  }
  if(!list.length)return;
  shore=waterGlints(list,night,{name:'Beira_mar_reflexos',level,slope:.05});shore.mesh.visible=lit>0;root.add(shore.mesh);stats.night.shoreGlints=list.length;
 }
 let lit=0;
 return {root,mesh,material,stats,
  update(dt,camera){uniforms.seaTime.value+=dt;boats.update(dt);if(lit>0){night.uTime.value+=dt;night.uScreen.value=screenHalf(mobile);if(shore===null)findShore();}},
  // The boats' lamps come on at dusk (a skipper's habit, not a photocell: each its own moment), the seafront's with it.
  setNight(value){lit=value;boats.light(lit>0);night.uNight.value=lit;stats.night.level=lit;boatLights.mesh.visible=boatGlints.mesh.visible=lit>0;if(shore)shore.mesh.visible=lit>0;}};
}
// The terrain grid's ground (sea bed under the water) at (x, y), nearest node; null outside the grid.
function bedAt(data,x,y){const t=data.terrain,i=Math.round((x-t.x0)/t.step),j=Math.round((y-t.y0)/t.step);return i<0||j<0||i>=t.nx||j>=t.ny?null:t.z[j*t.nx+i];}

// ================================================================ Night lights (shared with floripa-bridges.js and
// floripa-landmarks.js): the lamps a coastal city shows after dark as glowing dots, and their broken streaks on the bay.
// No real lights (each would be a loop step on every lit pixel): emissive sprites the HDR pipeline blooms
// (cinematic.js), one instanced draw per set. A light: p [x, y, z] (track frame: x east, y north, z up), c its linear
// colour, i its strength, s the lamp's radius (m), g its group (a colour and strength set per scene: the bridge's
// scheme, the masts' red), on the night level it comes on at (0.05 an early photocell, 0.9 only in full night), ph a
// phase (0..1), blink [period s, share lit] (a beacon) and tw a twinkle (far lights shimmer through the air).
export function lightUniforms(){
 return {uNight:{value:0},uTime:{value:0},uScreen:{value:360},uGroups:{value:Array.from({length:8},()=>new THREE.Vector4(1,1,1,1))},
  // Hue wave over the groups flagged in x (bit mask as float), speed y, spread z (rad per metre along the span).
  uHue:{value:new THREE.Vector4(0,0,0,0)}};
}
// Half the drawing buffer's height in pixels (the sprites' size floor is in pixels).
export const screenHalf=mobile=>innerHeight*Math.min(globalThis.devicePixelRatio||1,mobile?1.5:2)/2;
// Light per instance: position, colour × strength, [radius, group, switch-on level, phase], [blink period, lit share, twinkle].
function lightBuffers(list){
 const n=list.length,pos=new Float32Array(n*3),col=new Float32Array(n*3),look=new Float32Array(n*4),blink=new Float32Array(n*3);
 list.forEach((l,k)=>{pos.set([l.p[0],l.p[2],-l.p[1]],k*3);col.set(l.c.map(v=>v*(l.i??1)),k*3);look.set([l.s??.2,l.g??0,l.on??0,l.ph??0],k*4);blink.set([l.blink?.[0]??0,l.blink?.[1]??1,l.tw??0],k*3);});
 return {pos,col,look,blink};
}
function instancedQuad(buffers,n){
 const g=new THREE.InstancedBufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));g.setIndex([0,1,2,0,2,3]);
 g.setAttribute('iPos',new THREE.InstancedBufferAttribute(buffers.pos,3));g.setAttribute('iCol',new THREE.InstancedBufferAttribute(buffers.col,3));
 g.setAttribute('iLook',new THREE.InstancedBufferAttribute(buffers.look,4));g.setAttribute('iBlink',new THREE.InstancedBufferAttribute(buffers.blink,3));
 g.instanceCount=n;return g;
}
// What every light shares: its group's colour and strength, coming on as the evening falls, a beacon's blink, a far
// light's shimmer, the festive hue wave (floripa-bridges.js), a share of the fog (lights carry through the night air).
const LIGHT_COMMON=`attribute vec3 iPos,iCol;attribute vec4 iLook;attribute vec3 iBlink;
uniform float uNight,uTime,uFogKeep;uniform vec4 uGroups[8];uniform vec4 uHue;
#ifdef USE_FOG
uniform float fogNear,fogFar;
#endif
vec3 lightHue(float h){return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);}
vec3 lightColour(float dist){
 int gi=int(iLook.y+.5);vec4 g=uGroups[gi];
 float on=smoothstep(iLook.z,iLook.z+.06,uNight);
 float blink=iBlink.x>0.?step(fract(uTime/iBlink.x+iLook.w),iBlink.y):1.;
 float tw=1.+iBlink.z*(sin(uTime*(4.+6.*fract(iLook.w*13.))+iLook.w*40.)*.6+sin(uTime*(9.+5.*fract(iLook.w*7.))+iLook.w*90.)*.4);
 vec3 c=iCol*g.rgb*(g.a*on*blink*tw);
 if(uHue.x>0.&&mod(floor(uHue.x/exp2(float(gi))),2.)>.5)c*=lightHue(fract(uTime*uHue.y+dot(iPos.xz,vec2(.8,-.6))*uHue.z))*1.6+.15;
 #ifdef USE_FOG
 c*=1.-uFogKeep*smoothstep(fogNear,fogFar,dist);
 #endif
 return c;
}`;
// The sprite: a hot core and a faint halo, at least minPx across (a far lamp stays a dot; it gives up brightness as it
// shrinks below that, as a point source does, down to the floor). Pulled toward the eye so its own fixture never hides it.
const GLOW_VERTEX=`${LIGHT_COMMON}
uniform float uScreen,uMinPx,uFloor;uniform vec2 uNear;
varying vec3 vCol;varying vec2 vCorner;varying float vCore;
void main(){
 vec4 view=viewMatrix*vec4(iPos,1.);float dist=max(-view.z,.1);
 vec3 c=lightColour(dist);
 float scale=projectionMatrix[1][1]*uScreen/dist,core=iLook.x*scale,r=max(core*3.,uMinPx),frac=max(core/r,.33);
 c*=clamp(pow(core/(frac*r),2.),uFloor,1.);
 if(uNear.y>0.)c*=smoothstep(uNear.x,uNear.y,dist);
 if(view.z>-.2||max(c.r,max(c.g,c.b))<1e-4){gl_Position=vec4(0.,0.,2.,1.);return;}
 vCol=c;vCorner=position.xy;vCore=frac;
 view.xyz+=normalize(-view.xyz)*min(.6,dist*.25);
 view.xy+=position.xy*r/scale;
 gl_Position=projectionMatrix*view;
}`;
const GLOW_FRAGMENT=`varying vec3 vCol;varying vec2 vCorner;varying float vCore;
void main(){
 float r2=dot(vCorner,vCorner);if(r2>1.)discard;
 gl_FragColor=vec4(vCol*(exp(-r2/(vCore*vCore)*1.6)+.05*exp(-r2*5.)),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
// Additive, and the picture's alpha kept (cinematic.js reads it: the occlusion mask), as the floodlights' glow.
const ADDITIVE={transparent:true,depthWrite:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor};
// A set of glowing lights: {mesh, update()} (update re-sends positions that moved: write them into positions first).
export function nightLights(list,uniforms,{name='Luzes',minPx=1.6,floor=.15,near=null,fogKeep=.65}={}){
 const buffers=lightBuffers(list),g=instancedQuad(buffers,list.length);
 const material=new THREE.ShaderMaterial({name,vertexShader:GLOW_VERTEX,fragmentShader:GLOW_FRAGMENT,fog:true,...ADDITIVE,
  uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),...uniforms,uMinPx:{value:minPx},uFloor:{value:floor},uNear:{value:new THREE.Vector2(...(near??[0,0]))},uFogKeep:{value:fogKeep}}});
 const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.frustumCulled=false;mesh.renderOrder=3;mesh.visible=false;mesh.matrixAutoUpdate=false;
 return {mesh,positions:buffers.pos,count:list.length,update(){g.attributes.iPos.needsUpdate=true;}};
}
// The light's broken streak on the bay: where the water mirrors it to the eye, stretched toward the eye along the
// wavelets that still tilt it there (slope: the chop's typical tilt, rad), narrow across; the ripples break it into
// flickering pieces that drift. Laid on the water each frame from the camera (the vertex shader): one instanced draw.
const GLINT_VERTEX=`${LIGHT_COMMON}
uniform float uLevel,uSlope;
varying vec3 vCol;varying vec2 vUv;varying float vPieces,vSeed;
void main(){
 vec3 C=cameraPosition;float hc=C.y-uLevel,hl=iPos.y-uLevel;
 vec2 d=iPos.xz-C.xz;float D=length(d);
 vec3 c=lightColour(D);
 if(hc<.25||hl<.2||D<1.||max(c.r,max(c.g,c.b))<1e-4){gl_Position=vec4(0.,0.,2.,1.);return;}
 d/=D;
 float x0=D*hc/(hc+hl),dl=D-x0;
 float f=hl/(dl*dl+hl*hl)+hc/(x0*x0+hc*hc);
 float halfLen=clamp(2.*uSlope/f,iLook.x*2.,min(x0,dl)*.9);
 float wide=max(iLook.x*1.2,uSlope*.2*x0*dl/D);
 // The water mirrors more at a glancing angle (Fresnel), and the light spreads over the streak's length.
 float grazing=1.-hc/sqrt(x0*x0+hc*hc);
 c*=(.08+.92*pow(grazing,5.))*.13/sqrt(1.+halfLen/(8.*wide))*smoothstep(3.,20.,x0);
 vec2 side=vec2(-d.y,d.x),P=C.xz+d*(x0+position.y*halfLen)+side*position.x*wide;
 vCol=c;vUv=position.xy;vPieces=clamp(halfLen/.9,3.,60.);vSeed=iLook.w*97.;
 gl_Position=projectionMatrix*viewMatrix*vec4(P.x,uLevel+.05,P.y,1.);
}`;
const GLINT_FRAGMENT=`uniform float uTime;varying vec3 vCol;varying vec2 vUv;varying float vPieces,vSeed;
float glH(float n){return fract(sin(n)*43758.5453);}
float glN(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(glH(i),glH(i+1.),f);}
void main(){
 float s=vUv.y*vPieces;
 float waves=glN(s*1.7+vSeed+uTime*1.1)*glN(s*.63-uTime*.8+vSeed*.37);
 float off=(glN(s*1.3+uTime*1.4+vSeed*1.9)-.5)*.7;
 float across=exp(-pow((vUv.x-off)*2.6,2.)),along=1.-smoothstep(.25,1.,abs(vUv.y));
 gl_FragColor=vec4(vCol*across*along*(.05+smoothstep(.3,.62,waves)*1.8),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
export function waterGlints(list,uniforms,{name='Reflexos',level=0,slope=.06,fogKeep=.65}={}){
 const buffers=lightBuffers(list),g=instancedQuad(buffers,list.length);
 const material=new THREE.ShaderMaterial({name,vertexShader:GLINT_VERTEX,fragmentShader:GLINT_FRAGMENT,fog:true,...ADDITIVE,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
  uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),...uniforms,uLevel:{value:level},uSlope:{value:slope},uFogKeep:{value:fogKeep}}});
 const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.frustumCulled=false;mesh.renderOrder=2;mesh.visible=false;mesh.matrixAutoUpdate=false;
 return {mesh,positions:buffers.pos,count:list.length,update(){g.attributes.iPos.needsUpdate=true;}};
}

// --- Boats on the bay: sailing yachts at anchor, the island's bright wooden fishing boats (baleeiras) and a few
// launches; most ride at anchor, swinging and bobbing each to its own beat, three cross the bay slowly back and
// forth. All on water at least 2.5 m deep inside the terrain grid, clear of the bridges' piers.
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// A hull lying along +x (bow forward), deck at y=0: a box whose ends pinch in (pointed bow, narrower stern). It floats
// with its deck FREEBOARD over the water (with only the box's 15 cm a heave and the chop put the deck under).
const FREEBOARD=.5;
function hull(length,beam,depth,{stern=.55,sheer=.18}={}){
 const g=new THREE.BoxGeometry(length,depth,beam,6,1,2).translate(0,-depth/2+.15,0),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i)/(length/2),y=p.getY(i),z=p.getZ(i),pinch=x>0?1-x*x*x*.94:1-(1-stern)*Math.pow(-x,3),keel=y<-depth/2?.55:1;p.setXYZ(i,p.getX(i),y+(x>.6?sheer*(x-.6)/.4:0),z*pinch*keel);}
 g.computeVertexNormals();return g;
}
function boatKinds(){
 const white=new THREE.MeshStandardMaterial({name:'Barco_branco',color:0xeeeeea,roughness:.5});
 const paint=new THREE.MeshStandardMaterial({name:'Barco_casco',color:0xffffff,roughness:.55});
 const sail=new THREE.MeshStandardMaterial({name:'Barco_vela',color:0xf4f2ea,roughness:.8,side:THREE.DoubleSide});
 const glass=new THREE.MeshStandardMaterial({name:'Barco_vidro',color:0x1d2a30,roughness:.15,metalness:.3});
 const box=(w,h,d,x,y,z=0)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
 const merge=list=>{const g=mergeGeometries(list.map(q=>q.index?q.toNonIndexed():q),false);list.forEach(q=>q.dispose());return g;};
 // Yacht: white or navy hull, cabin, mast and a main and a jib (some furled).
 const mast=new THREE.CylinderGeometry(.06,.08,11,6).translate(.6,5.5,0);
 const main=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.7,1,0),new THREE.Vector3(.7,10.4,0),new THREE.Vector3(-3.1,1.2,0)]);main.computeVertexNormals();
 const jib=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.5,9.6,0),new THREE.Vector3(3.9,.8,0),new THREE.Vector3(.6,1,0)]);jib.computeVertexNormals();
 return [
  {name:'veleiro',weight:.42,hull:hull(9,2.9,1.3),top:merge([box(3.2,.75,1.9,-.6,.38),mast]),sails:merge([main,jib]),glass:box(1.6,.22,1.95,-.2,.62),colors:[[.95,.95,.93],[.95,.95,.93],[.12,.18,.33],[.85,.86,.82]],size:[.8,1.25]},
  // Baleeira: the island's wooden fishing boat, painted bright, a little wheelhouse aft.
  {name:'baleeira',weight:.38,hull:hull(8,2.4,1.1,{stern:.35,sheer:.3}),top:merge([box(1.6,1.5,1.5,-2.2,.75),box(.08,2.6,.08,1.6,1.3)]),glass:box(.1,.4,1.2,-1.38,1.15),colors:[[.1,.35,.75],[.8,.12,.1],[.95,.75,.1],[.1,.55,.35],[.2,.6,.8],[.92,.92,.88]],size:[.75,1.15]},
  // Launch: white, a windscreen and a bimini.
  {name:'lancha',weight:.2,hull:hull(7,2.5,1.0,{stern:.75,sheer:.12}),top:merge([box(1.8,.12,2.1,-1.2,1.55),box(.08,1.3,.08,-.4,.9,.9),box(.08,1.3,.08,-.4,.9,-.9)]),glass:box(.5,.45,2,.6,.42),colors:[[.97,.97,.95],[.93,.93,.9],[.75,.08,.08]],size:[.85,1.3]},
 ].map(k=>({...k,materials:{hull:paint,top:white,sails:sail,glass}}));
}
function createBoats(data,level,{mobile}){
 const root=new THREE.Group();root.name='Barcos';const t=data.terrain,rand=random(4801);
 const depth=(x,y)=>{const fx=(x-t.x0)/t.step,fy=(y-t.y0)/t.step;if(fx<1||fy<1||fx>t.nx-2||fy>t.ny-2)return -1;const i=Math.round(fx),j=Math.round(fy);return level-t.z[j*t.nx+i];};
 // Clear of the decks (and the Pedro Ivo Campos, 30 m south of the Colombo Salles): 70 m from the track over the sea.
 const deckPts=data.samples.filter((p,i)=>i%5===0&&p[3]-(level-depth(p[1],p[2]))>8).map(p=>[p[1],p[2]]);
 const clear=(x,y,r)=>deckPts.every(([px,py])=>Math.hypot(px-x,py-y)>r);
 const open=(x,y)=>depth(x,y)>2.5&&[[18,0],[-18,0],[0,18],[0,-18]].every(([dx,dy])=>depth(x+dx,y+dy)>1.5)&&clear(x,y,70);
 const kinds=boatKinds(),count=mobile?14:34,items=[];
 const x1=t.x0+(t.nx-1)*t.step,y1=t.y0+(t.ny-1)*t.step;
 for(let tries=0;items.length<count&&tries<20000;tries++){
  const x=t.x0+rand()*(x1-t.x0),y=t.y0+rand()*(y1-t.y0);if(!open(x,y)||items.some(b=>Math.hypot(b.x-x,b.y-y)<35))continue;
  let r=rand(),k=0;while(k<kinds.length-1&&r>kinds[k].weight){r-=kinds[k].weight;k++;}
  const kind=kinds[k],s=kind.size[0]+rand()*(kind.size[1]-kind.size[0]);
  items.push({x,y,kind:k,scale:s,heading:rand()*Math.PI*2,phase:rand()*10,rate:.55+rand()*.5,amp:.6+rand()*.8,color:kind.colors[Math.floor(rand()*kind.colors.length)],sails:k===0&&rand()<.55});
 }
 // Three under way: back and forth along a straight run of open water, at 3 to 5 knots.
 let moving=0;
 for(const b of items){if(moving>=3)break;
  for(let tries=0;tries<40;tries++){const a=rand()*Math.PI*2,len=260+rand()*300,ex=b.x+Math.cos(a)*len,ey=b.y+Math.sin(a)*len;let ok=true;for(let u=0;u<=1;u+=.05)if(!open(b.x+(ex-b.x)*u,b.y+(ey-b.y)*u)){ok=false;break;}
   if(ok){b.path={x0:b.x,y0:b.y,dx:ex-b.x,dy:ey-b.y,len,u:rand(),speed:1.6+rand()*1.0,dir:1};b.heading=a;moving++;break;}}
 }
 // Their lamps after dark (boat frame: x to the bow, y up, z to starboard, before the boat's scale): at anchor the white
 // all-round light at the masthead, and a warm cabin now and then; under way the masthead, red to port, green to
 // starboard and the stern light.
 const LAMPS=[{mast:[.6,11.15,0],cabin:[-.6,.95,0],bow:3.6,stern:-4.2,deck:.55},{mast:[1.6,2.66,0],cabin:[-1.38,1.15,0],bow:2.6,stern:-3.7,deck:.6},{mast:[-1.2,1.75,0],cabin:[.3,.55,0],bow:2.8,stern:-3.3,deck:.5}];
 const WHITE=[1,.93,.8],lights=[],glim=random(6067);
 for(const b of items){
  const L=LAMPS[b.kind],add=(local,c,i,s=.12)=>lights.push({boat:b,local,p:[b.x,b.y,level+FREEBOARD+local[1]],c,i,s,g:0,on:.15+glim()*.5,ph:glim()});
  add(L.mast,WHITE,1.5);
  if(b.path){add([L.bow,L.deck,-.85],[1,.06,.04],1.3);add([L.bow,L.deck,.85],[.08,1,.32],1.3);add([L.stern,L.deck,0],WHITE,1.1);}
  else if(glim()<.35)add(L.cabin,[1,.66,.36],.45,.35);
 }
 const meshes=kinds.map((kind,k)=>{
  const mine=items.filter(b=>b.kind===k),parts={};
  for(const part of ['hull','top','glass','sails']){
   if(!kind[part])continue;const n=part==='sails'?mine.filter(b=>b.sails).length:mine.length;if(!n)continue;
   const im=new THREE.InstancedMesh(kind[part],kind.materials[part],n);im.name=`Barco_${kind.name}_${part}`;im.castShadow=!mobile&&part!=='sails';im.receiveShadow=true;im.frustumCulled=false;
   if(part==='hull')mine.forEach((b,i)=>im.setColorAt(i,new THREE.Color(...b.color)));
   root.add(im);parts[part]=im;
  }
  return {mine,parts};
 });
 const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(0,0,0,'YXZ'),v=new THREE.Vector3(),sc=new THREE.Vector3();let time=0;
 function place(){
  for(const {mine,parts} of meshes){let si=0;
   mine.forEach((b,i)=>{
    const w=time*b.rate+b.phase,heave=Math.sin(w)*.08*b.amp,roll=Math.sin(w*.83+1.3)*.045*b.amp,pitch=Math.sin(w*1.21)*.025*b.amp,swing=b.path?0:Math.sin(time*.02+b.phase)*.35;
    // The hull lies along +x; a track heading h (from east, counter-clockwise) is a turn of h about three's y.
    e.set(pitch,b.heading+swing,roll);q.setFromEuler(e);v.set(b.x,level+FREEBOARD+heave,-b.y);sc.setScalar(b.scale);m.compose(v,q,sc);(b.matrix??=new THREE.Matrix4()).copy(m);
    for(const part of ['hull','top','glass'])parts[part]?.setMatrixAt(i,m);
    if(b.sails&&parts.sails)parts.sails.setMatrixAt(si++,m);
   });
   for(const im of Object.values(parts))im.instanceMatrix.needsUpdate=true;
  }
  // The lamps ride with their boats (only while lit: the sets that show them are attached at dusk).
  if(lit)for(const set of attached){lights.forEach((l,k)=>{v.fromArray(l.local).applyMatrix4(l.boat.matrix);set.positions[k*3]=v.x;set.positions[k*3+1]=v.y;set.positions[k*3+2]=v.z;});set.update();}
 }
 const attached=[];let lit=false;
 place();
 return {root,count:items.length,lights,attach(sets){attached.push(...sets);},light(on){lit=on;if(on)place();},update(dt){
  time+=dt;
  for(const b of items){const p=b.path;if(!p)continue;p.u+=p.dir*p.speed*dt/p.len;if(p.u>1||p.u<0){p.dir*=-1;p.u=Math.max(0,Math.min(1,p.u));}
   b.x=p.x0+p.dx*p.u;b.y=p.y0+p.dy*p.u;b.heading=Math.atan2(p.dy*p.dir,p.dx*p.dir);}
  place();
 }};
}
