import * as THREE from 'three';

// Crisp car shadows on the ground (Alto and Ultra). The sun's own map covers ±85 m round the car
// in 4 cm texels softened over some 20 cm: the car sat on a grey smudge, light leaking under the
// tyres. A second, small depth map along the sun holds only the cars, a few metres round each in
// texels under 1 cm, and the asphalt, kerbs and terrain look it up (carShadowPatch): the tyres,
// sills and the gap under the bumpers come out sharp, as in a photograph. Ultra gives the three
// nearest rivals a tile of their own in the same texture. Not three's CSM addon: that one rewrites
// every material's onBeforeCompile and the light chunks for the whole page.
// Only meshes that cast the sun's shadow are drawn (they get this layer); the camera of each tile
// sees nothing else, so glass, name tags and smoke stay out. The soft contact shadow under every
// car on every level is contact-shadows.js; this map only sharpens the sun's.
export const CAR_SHADOW_LAYER=7;
const SLOTS=4;
// wide/sharpen: metres round a car's shadow where the sun's soft map is sharpened to meet this one
// (past the sun map's blur, so the change cannot show), and its contrast there. smallest: parts
// under this radius (m) are left out; lift/depth: tile centre above the car's origin and the
// camera's distance up the sun. soft/gap: contact hardening, the penumbra (texels) where the part
// casting the shadow stands more than gap metres up the sun from the ground (roof, mirrors, bumpers),
// as a photograph's shadow softens away from the tyres; 0 keeps it crisp everywhere.
export const CAR_SHADOW_LOOK={wide:.2,sharpen:[.3,.7],bias:.0005,smallest:.12,lift:.7,depth:15,soft:3.2,gap:.4};
const uniforms={carShadowMap:{value:null},carShadowMatrix:{value:Array.from({length:SLOTS},()=>new THREE.Matrix4())},
 carShadowRect:{value:Array.from({length:SLOTS},()=>new THREE.Vector4(0,0,1,1))},carShadowCount:{value:0},
 carShadowTexel:{value:new THREE.Vector2(1,1)},carShadowWide:{value:new THREE.Vector2()},carShadowSharpen:{value:new THREE.Vector2(...CAR_SHADOW_LOOK.sharpen)},carShadowBias:{value:CAR_SHADOW_LOOK.bias},
 carShadowSoft:{value:new THREE.Vector2(CAR_SHADOW_LOOK.soft,0)}};

const pars=`
#ifdef USE_SHADOWMAP
varying vec3 vCarShadowWorld;
uniform sampler2DShadow carShadowMap;uniform mat4 carShadowMatrix[${SLOTS}];uniform vec4 carShadowRect[${SLOTS}];uniform int carShadowCount;
uniform vec2 carShadowTexel,carShadowWide,carShadowSharpen,carShadowSoft;uniform float carShadowBias;
// No derivatives (lod 0): the taps sit in a loop and branches, which D3D refuses for gradient fetches.
float carShadowTap(vec2 uv,vec4 rect,float z){return textureLod(carShadowMap,vec3(clamp(uv,rect.xy+carShadowTexel*.5,rect.xy+rect.zw-carShadowTexel*.5),z),0.0);}
// One car's tile: x, the sun it leaves (1 lit); y, 1 next to its shadow, where the sun's map is sharpened.
void carShadowSlot(vec3 p,mat4 m,vec4 rect,inout vec2 r){
 vec3 c=(m*vec4(p,1.0)).xyz;
 float edge=max(abs(c.x-.5),abs(c.y-.5))*2.0;
 if(edge<1.0&&c.z<1.0&&c.z>0.0){
  vec2 uv=rect.xy+c.xy*rect.zw,t=carShadowTexel*.9,w=carShadowWide;float z=c.z-carShadowBias;
  float centre=carShadowTap(uv,rect,z),lit=(centre*2.0+carShadowTap(uv+t,rect,z)+carShadowTap(uv-t,rect,z)+carShadowTap(uv+vec2(t.x,-t.y),rect,z)+carShadowTap(uv-vec2(t.x,-t.y),rect,z))/6.0;
  float wide=min(min(carShadowTap(uv+vec2(w.x,0.0),rect,z),carShadowTap(uv-vec2(w.x,0.0),rect,z)),min(carShadowTap(uv+vec2(0.0,w.y),rect,z),carShadowTap(uv-vec2(0.0,w.y),rect,z)));
  // Contact hardening, only near a shadow: of the taps round the point that are shadowed, the share still
  // shadowed when compared gap metres up the sun is the share cast from high up; the taps spread with it.
  if(carShadowSoft.x>1.0&&min(wide,lit)<1.0){
   vec2 o=carShadowTexel*carShadowSoft.x,q=vec2(o.x,-o.y);float g=z-carShadowSoft.y;
   float n=(1.0-centre)*2.0+4.0-carShadowTap(uv+o,rect,z)-carShadowTap(uv-o,rect,z)-carShadowTap(uv+q,rect,z)-carShadowTap(uv-q,rect,z);
   float f=(1.0-carShadowTap(uv,rect,g))*2.0+4.0-carShadowTap(uv+o,rect,g)-carShadowTap(uv-o,rect,g)-carShadowTap(uv+q,rect,g)-carShadowTap(uv-q,rect,g);
   float spread=n>.001?clamp(f/n,0.0,1.0):0.0;
   if(spread>0.0){vec2 s=carShadowTexel*mix(.9,carShadowSoft.x,spread),k=vec2(s.x,-s.y);
    lit=(centre*2.0+carShadowTap(uv+s,rect,z)+carShadowTap(uv-s,rect,z)+carShadowTap(uv+k,rect,z)+carShadowTap(uv-k,rect,z))/6.0;}
  }
  float fade=1.0-smoothstep(.8,.97,edge);
  r.x=min(r.x,mix(1.0,lit,fade));r.y=max(r.y,(1.0-min(wide,lit))*fade);
 }
}
// Spelt out, no loop: HLSL treats a loop that ends on a uniform as varying and warns on every fetch.
vec2 carShadowAt(vec3 p){
 vec2 r=vec2(1.0,0.0);
 if(carShadowCount>0)carShadowSlot(p,carShadowMatrix[0],carShadowRect[0],r);
 if(carShadowCount>1)carShadowSlot(p,carShadowMatrix[1],carShadowRect[1],r);
 if(carShadowCount>2)carShadowSlot(p,carShadowMatrix[2],carShadowRect[2],r);
 if(carShadowCount>3)carShadowSlot(p,carShadowMatrix[3],carShadowRect[3],r);
 return r;
}
// The sun's own (soft) shadow, sharpened next to the cars, then the cars' crisp one: min, not a
// product, so the two never darken the same shadow twice.
float carShadowMix(float sun,vec2 car){return min(mix(sun,smoothstep(carShadowSharpen.x,carShadowSharpen.y,sun),car.y),car.x);}
#endif
`;
const sunShadowCall=/getShadow\( directionalShadowMap\[ i \],[^;]*?vDirectionalShadowCoord\[ i \] \)/;
// The ground shaders' hook (asphalt, kerbs, terrain): call it at the end of their onBeforeCompile.
// The lookups are compiled in wherever there are sun shadows; levels only change uniforms, so a
// switch between Médio, Alto and Ultra never recompiles (Baixo has no shadow map at all).
export function carShadowPatch(shader){
 const lights=THREE.ShaderChunk.lights_fragment_begin;
 if(!sunShadowCall.test(lights))return false;
 Object.assign(shader.uniforms,uniforms);
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n#ifdef USE_SHADOWMAP\nvarying vec3 vCarShadowWorld;\n#endif')
  .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
#ifdef USE_SHADOWMAP
vec4 carShadowP=vec4(transformed,1.0);
#ifdef USE_INSTANCING
carShadowP=instanceMatrix*carShadowP;
#endif
vCarShadowWorld=(modelMatrix*carShadowP).xyz;
#endif`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+pars)
  .replace('#include <lights_fragment_begin>',`#ifdef USE_SHADOWMAP
vec2 carShadowCS=carShadowAt(vCarShadowWorld);
#endif
${lights.replace(sunShadowCall,m=>`carShadowMix(${m},carShadowCS)`)}`);
 return true;
}

const seeThrough=m=>m.transparent||m.alphaTest>0||m.alphaToCoverage;
export class CarShadow{
 constructor(direction){
  this.direction=direction.clone().normalize();
  // Its own scene: the cars are lent to it for the pass (children only, never re-parented).
  this.scene=new THREE.Scene();this.scene.matrixWorldAutoUpdate=false;
  this.scene.overrideMaterial=new THREE.MeshBasicMaterial({name:'Sombra_carros',colorWrite:false,side:THREE.DoubleSide});
  this.cameras=Array.from({length:SLOTS},()=>{const c=new THREE.OrthographicCamera(-1,1,1,-1,1,30);c.layers.set(CAR_SHADOW_LAYER);return c;});
  this.config=null;this.target=null;this.columns=1;this.count=0;this.calls=0;this.casters=0;this.centre=new THREE.Vector3();this.small=new WeakMap();
  this.bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  // With the map off the ground shaders still sample a shadow texture (D3D refuses an empty one):
  // one texel cleared to 'lit'.
  this.idle=this.depthTarget(1,1);this.idleCleared=false;uniforms.carShadowMap.value=this.idle.depthTexture;
 }
 depthTarget(w,h){
  // Depth is all that is read; the colour buffer has to exist, so one byte.
  const target=new THREE.WebGLRenderTarget(w,h,{format:THREE.RedFormat,type:THREE.UnsignedByteType,depthBuffer:true,depthTexture:new THREE.DepthTexture(w,h,THREE.UnsignedIntType)});
  const depth=target.depthTexture;depth.compareFunction=THREE.LessEqualCompare;depth.minFilter=depth.magFilter=THREE.LinearFilter;target.texture.generateMipmaps=false;
  return target;
 }
 clearDepth(renderer,target){renderer.setRenderTarget(target);renderer.state.buffers.depth.setMask(true);renderer.clear(false,true,false);}
 // {size: tile pixels, reach: metres either side of the car, cars: tiles} or null (off).
 configure(config){
  this.config=config&&config.size>0?config:null;uniforms.carShadowCount.value=0;this.count=0;
  if(!this.config){this.release();return;}
  const {size,reach,cars}=this.config,columns=cars>1?2:1,rows=cars>2?2:1,w=size*columns,h=size*rows;
  if(!this.target||this.target.width!==w||this.target.height!==h){this.release();this.target=this.depthTarget(w,h);}
  this.columns=columns;uniforms.carShadowMap.value=this.target.depthTexture;
  uniforms.carShadowTexel.value.set(1/w,1/h);
  for(let i=0;i<SLOTS;i++)uniforms.carShadowRect.value[i].set((i%columns)*size/w,Math.floor(i/columns)%rows*size/h,size/w,size/h);
  uniforms.carShadowWide.value.set(CAR_SHADOW_LOOK.wide/(2*reach)*size/w,CAR_SHADOW_LOOK.wide/(2*reach)*size/h);
  // The gap in the tiles' depth units (linear, near 1 m to far 2·depth).
  uniforms.carShadowSoft.value.set(CAR_SHADOW_LOOK.soft,CAR_SHADOW_LOOK.gap/(CAR_SHADOW_LOOK.depth*2-1));
  for(const c of this.cameras){Object.assign(c,{left:-reach,right:reach,top:reach,bottom:-reach,near:1,far:CAR_SHADOW_LOOK.depth*2});c.updateProjectionMatrix();}
 }
 release(){if(this.target){this.target.depthTexture?.dispose();this.target.dispose();this.target=null;}uniforms.carShadowMap.value=this.idle.depthTexture;uniforms.carShadowCount.value=0;this.count=0;}
 // The meshes that cast the sun's shadow get the layer (a new livery or sticker is picked up too),
 // except parts too small to draw a shadow worth a draw call (bolts, switches, pedals) and the
 // see-through ones: stickers lying on a panel (their shadow is the panel's), lenses, smoked plastic
 // and cut-out nets (drawn solid here; the sun's map keeps their pattern, softly).
 mark(root){
  let casters=0;
  root.traverse(o=>{
   if(!o.isMesh)return;
   let small=this.small.get(o.geometry);
   if(small===undefined){if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();small=!o.isSkinnedMesh&&!o.isInstancedMesh&&o.geometry.boundingSphere.radius*o.matrixWorld.getMaxScaleOnAxis()<CAR_SHADOW_LOOK.smallest;this.small.set(o.geometry,small);}
   const clear=Array.isArray(o.material)?o.material.every(seeThrough):seeThrough(o.material);
   if(o.castShadow&&!small&&!clear){o.layers.enable(CAR_SHADOW_LAYER);if(o.visible)casters++;}else o.layers.disable(CAR_SHADOW_LAYER);
  });
  return casters;
 }
 // Draws the tiles for these car roots (the followed car first); called before the frame's passes.
 update(renderer,roots){
  this.calls=0;
  if(!this.idleCleared){const previous=renderer.getRenderTarget();this.clearDepth(renderer,this.idle);renderer.setRenderTarget(previous);this.idleCleared=true;}
  if(!this.config||!renderer.shadowMap.enabled||CAR_SHADOW_LOOK.off){this.count=uniforms.carShadowCount.value=0;return;}
  const {size,cars}=this.config,n=Math.min(roots.length,cars,SLOTS);
  if(!n){this.count=uniforms.carShadowCount.value=0;return;}
  const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear,info=renderer.info,reset=info.autoReset,calls=info.render.calls,triangles=info.render.triangles;
  info.autoReset=false;renderer.autoClear=false;
  // The last pass of a frame may leave depth writes off, and the clear obeys that mask.
  this.target.viewport.set(0,0,this.target.width,this.target.height);this.clearDepth(renderer,this.target);
  const before=info.render.calls;this.casters=0;
  try{
   for(let i=0;i<n;i++){
    const root=roots[i],camera=this.cameras[i];
    // The scene's matrices were just brought up to date (main.js runFrame, once a frame): the car is not walked again.
    this.casters+=this.mark(root);
    // The tile centres on the car's middle, the camera up the sun from it.
    root.getWorldPosition(this.centre).y+=CAR_SHADOW_LOOK.lift;
    camera.position.copy(this.centre).addScaledVector(this.direction,CAR_SHADOW_LOOK.depth);camera.lookAt(this.centre);camera.updateMatrixWorld();
    uniforms.carShadowMatrix.value[i].multiplyMatrices(this.bias,camera.projectionMatrix).multiply(camera.matrixWorldInverse);
    this.target.viewport.set((i%this.columns)*size,Math.floor(i/this.columns)*size,size,size);renderer.setRenderTarget(this.target);
    // root's matrices are fresh (just above): the tile's scene must not walk the car again.
    this.scene.matrixWorldAutoUpdate=false;this.scene.children.length=0;this.scene.children.push(root);
    try{renderer.render(this.scene,camera);}finally{this.scene.children.length=0;}
   }
  }finally{
   this.calls=info.render.calls-before;this.count=uniforms.carShadowCount.value=n;
   this.target.viewport.set(0,0,this.target.width,this.target.height);
   renderer.setRenderTarget(previous);renderer.autoClear=autoClear;info.render.calls=calls;info.render.triangles=triangles;info.autoReset=reset;
  }
 }
 // At load: the depth programs (plain and skinned) compile with the circuit, whatever the level, so
 // a later switch to Alto does not hitch. A tiny map stands in when the level has none.
 compile(renderer,roots){
  const config=this.config;if(!config)this.configure({size:16,reach:4,cars:1});
  const enabled=renderer.shadowMap.enabled;renderer.shadowMap.enabled=true;
  try{for(const root of roots)if(root)this.update(renderer,[root]);}finally{renderer.shadowMap.enabled=enabled;if(!config)this.configure(null);}
 }
 // Tuning: CAR_SHADOW_LOOK values, live.
 look(patch={}){Object.assign(CAR_SHADOW_LOOK,patch);this.small=new WeakMap();uniforms.carShadowSharpen.value.set(...CAR_SHADOW_LOOK.sharpen);uniforms.carShadowBias.value=CAR_SHADOW_LOOK.bias;if(this.config)this.configure(this.config);return {...CAR_SHADOW_LOOK};}
 info(){return {active:this.count>0,cars:this.count,size:this.target?[this.target.width,this.target.height]:null,tile:this.config?.size??0,reach:this.config?.reach??0,texelCm:this.config?+(200*this.config.reach/this.config.size).toFixed(2):0,casters:this.casters,drawCalls:this.calls};}
 dispose(){this.release();this.idle.depthTexture.dispose();this.idle.dispose();this.idleCleared=false;this.scene.overrideMaterial.dispose();}
}
