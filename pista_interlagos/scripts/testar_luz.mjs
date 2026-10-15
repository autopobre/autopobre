import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {SUN_DIRECTION,WORLD_FILL_SATURATION,SKY_REFLECTION,skyMirror} from '../teste/sky.js';
import {SunPlacement,lightBasis,shadowLean,snapToTexels,SHADOW_LEAN,SHADOW_MARGIN} from '../teste/sun-light.js';
import {carShadowPatch,CAR_SHADOW_LAYER} from '../teste/car-shadow.js';
import {SHADOW_LEVELS} from '../teste/graphics-settings.js';
import {LOOK} from '../teste/cinematic.js';
import {CAR_SHADOW_LOOK} from '../teste/car-shadow.js';
import {CONTACT_PULL,CONTACT_LIFT,CONTACT_SHAPES} from '../teste/contact-shadows.js';
import {FAR_PROFILE} from '../teste/immersive-visuals.js';
import {readFileSync} from 'node:fs';

// The light's frame is the one three builds for the shadow camera (lookAt from the sun, up +Y).
const basis=lightBasis(SUN_DIRECTION),axes=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
const camera=new THREE.OrthographicCamera();camera.position.copy(SUN_DIRECTION).multiplyScalar(140);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.matrixWorld.extractBasis(...axes);
for(const [mine,three] of [[basis.x,axes[0]],[basis.y,axes[1]],[basis.z,axes[2]]])assert.ok(mine.distanceTo(three)<1e-9,'light basis matches the shadow camera');
assert.ok(Math.abs(basis.x.dot(basis.y))<1e-12&&Math.abs(basis.x.dot(basis.z))<1e-12&&Math.abs(basis.y.dot(basis.z))<1e-12,'orthonormal');

// The lean: none without a view; along the view, never closer than the margin to the box edge.
assert.equal(shadowLean(null,basis,85).length(),0);
assert.equal(shadowLean(new THREE.Vector3(0,1,0),basis,85).length(),0,'looking straight down: centred');
for(const [reach,expected] of [[55,Math.min(SHADOW_LEAN*55,55-SHADOW_MARGIN)],[85,SHADOW_LEAN*85],[120,SHADOW_LEAN*120],[10,0]])
 assert.ok(Math.abs(shadowLean(new THREE.Vector3(1,0,.3),basis,reach).length()-expected)<1e-9,`lean for ±${reach} m`);
// What lies ahead of the car moves toward the middle of the map, what lies behind away from it.
{
 const placement=new SunPlacement(SUN_DIRECTION),p=new THREE.Vector3(120,4,-300);
 for(const heading of [0,.7,1.6,2.9,4.2,5.5]){
  const forward=new THREE.Vector3(Math.cos(heading),-.15,Math.sin(heading));
  placement.place(p,forward,{reach:85,size:4096,dt:1});
  const ahead=placement.offset(p.clone().addScaledVector(forward.clone().setY(0).normalize(),35)).length(),here=placement.offset(p).length();
  assert.ok(ahead<here,`heading ${heading}: the road ahead is nearer the middle of the map (${ahead.toFixed(1)} < ${here.toFixed(1)})`);
 }
}

// The car stays inside the box with the margin, whatever the view, size and easing.
{
 const random=(()=>{let s=7;return ()=>(s=(s*16807)%2147483647)/2147483647;})();
 for(const [level,shadow] of Object.entries(SHADOW_LEVELS)){
  if(!shadow)continue;
  const placement=new SunPlacement(SUN_DIRECTION),p=new THREE.Vector3(),texel=2*shadow.reach/shadow.size;
  for(let i=0;i<400;i++){
   p.set((random()-.5)*4000,random()*60,(random()-.5)*4000);
   const view=random()<.15?null:new THREE.Vector3(random()-.5,random()-.6,random()-.5);
   placement.place(p,view,{reach:shadow.reach,size:shadow.size,dt:random()<.3?1:random()*.05});
   const o=placement.offset(p);
   assert.ok(Math.max(Math.abs(o.x),Math.abs(o.y))<=shadow.reach-SHADOW_MARGIN+texel+1e-6,`${level}: car inside the box with ${SHADOW_MARGIN} m to spare`);
  }
 }
}

// Snapping: the centre sits on whole texels across the map, and a still object lands on the same
// spot of a texel however the car moves, so its shadow edge cannot crawl. Checked through three's
// own shadow matrix, as the renderer computes it.
{
 const reach=85,size=4096,texel=2*reach/size,placement=new SunPlacement(SUN_DIRECTION);
 const light=new THREE.DirectionalLight();Object.assign(light.shadow.camera,{left:-reach,right:reach,top:reach,bottom:-reach,near:1,far:340});light.shadow.camera.updateProjectionMatrix();light.shadow.mapSize.set(size,size);
 const post=new THREE.Vector3(431.7,12.3,-873.2),start=new THREE.Vector3(400,10,-860),step=new THREE.Vector3(.0137,.0011,-.0291),forward=new THREE.Vector3(.4,-.2,-.9);
 let first=null,moves=0,last=null;
 for(let i=0;i<600;i++){
  const p=start.clone().addScaledVector(step,i),c=placement.place(p,forward,{reach,size,dt:1/60});
  for(const axis of [basis.x,basis.y]){const t=c.dot(axis)/texel;assert.ok(Math.abs(t-Math.round(t))<1e-6,'centre on a whole texel');}
  assert.ok(Math.abs(c.dot(basis.z)-p.clone().add(placement.lean).dot(basis.z))<1e-6,'depth along the sun kept');
  if(last){const d=placement.offset(last);const dx=d.x/texel,dy=d.y/texel;assert.ok(Math.abs(dx-Math.round(dx))<1e-6&&Math.abs(dy-Math.round(dy))<1e-6,'moves in whole texels');if(d.lengthSq()>0)moves++;}
  last=c.clone();
  light.position.copy(c).addScaledVector(SUN_DIRECTION,140);light.target.position.copy(c);light.updateMatrixWorld();light.target.updateMatrixWorld();light.shadow.updateMatrices(light);
  const uv=post.clone().applyMatrix4(light.shadow.matrix),fx=uv.x*size%1,fy=uv.y*size%1;
  if(first)assert.ok(Math.abs(fx-first[0])<1e-4&&Math.abs(fy-first[1])<1e-4,'a still post keeps its place within the texel');else first=[fx,fy];
 }
 assert.ok(moves>20,`the box followed the car (${moves} texel steps)`);
}
// The lean eases: a sudden look round slides the box over a few frames; dt 1 places it at once.
{
 const placement=new SunPlacement(SUN_DIRECTION),p=new THREE.Vector3();
 placement.place(p,new THREE.Vector3(1,0,0),{reach:85,size:4096,dt:1});const a=placement.lean.clone();
 placement.place(p,new THREE.Vector3(-1,0,0),{reach:85,size:4096,dt:1/60});const b=placement.lean.clone();
 assert.ok(b.distanceTo(a)>0&&b.distanceTo(a)<a.length()*.2,'eased over frames');
 placement.place(p,new THREE.Vector3(-1,0,0),{reach:85,size:4096,dt:1});assert.ok(placement.lean.distanceTo(a.clone().negate())<1e-9,'placed at once with dt 1');
 assert.ok(snapToTexels(new THREE.Vector3(1.234,5,6),basis,.5).distanceTo(new THREE.Vector3(1.234,5,6))<.5,'snap stays within a texel');
}

// The cars' crisp map: Alto and Ultra only, in the shadow table, and the ground shader hook still
// finds three's sun shadow lookup (a three upgrade that renames it must fail here, not silently).
assert.ok(!SHADOW_LEVELS.baixa.car&&!SHADOW_LEVELS.media.car,'no car map below Alto');
assert.ok(SHADOW_LEVELS.alta.car.cars===1&&SHADOW_LEVELS.ultra.car.cars>=3,'Alto: the followed car; Ultra: and the nearest rivals');
for(const level of ['alta','ultra']){const c=SHADOW_LEVELS[level].car;assert.ok(c.size>=512&&c.reach>=3&&2*c.reach/c.size<.012,`${level}: texels under 1.2 cm`);}
const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
assert.ok(carShadowPatch(shader),'three still has the sun shadow lookup the hook wraps');
assert.ok(shader.fragmentShader.includes('carShadowMix( getShadow( directionalShadowMap[ i ]')||shader.fragmentShader.includes('carShadowMix(getShadow( directionalShadowMap[ i ]'),'the sun lookup is wrapped');
assert.ok(!shader.fragmentShader.includes('#include <lights_fragment_begin>'),'the light loop is inlined');
assert.ok(shader.vertexShader.includes('vCarShadowWorld=')&&shader.fragmentShader.includes('carShadowAt(vCarShadowWorld)'),'world position passed on');
assert.ok(shader.uniforms.carShadowMap&&shader.uniforms.carShadowMatrix.value.length===4,'uniforms shared');
assert.ok(CAR_SHADOW_LAYER>0&&CAR_SHADOW_LAYER<32);

// Shade keeps its skylight. The grade's contrast eases into black under mid grey (a cubic with the same
// slope at the middle and LOOK.toe at black) where it used to clip everything under about 7% (a car's
// shadow went pure black); the shader holds that curve and this copy checks its shape.
{
 const source=readFileSync(new URL('../teste/cinematic.js',import.meta.url),'utf8');
 assert.ok(source.includes('.5*t*(toe+t*(3.0-2.0*toe-contrast+t*(toe+contrast-2.0)))')&&source.includes('mix(.5*t*'),'the composite carries the toe');
 assert.ok(LOOK.toe>=1&&LOOK.toe<=1.6&&LOOK.contrast>1,'toe: a gentle lift at black, contrast kept');
 const c=LOOK.contrast,k=LOOK.toe,curve=x=>{const t=2*x;return x<.5?.5*t*(k+t*(3-2*k-c+t*(k+c-2))):(x-.5)*c+.5;},clip=x=>Math.min(1,Math.max(0,(x-.5)*c+.5));
 assert.ok(Math.abs(curve(.5-1e-6)-curve(.5+1e-6))<1e-5&&Math.abs((curve(.5)-curve(.5-1e-4))/1e-4-c)<1e-2,'continuous, same slope at the middle');
 assert.ok(curve(0)===0&&Math.abs(curve(1e-5)/1e-5-k)<1e-3,'black stays black, reached at the toe slope');
 for(let x=.005;x<.5;x+=.005)assert.ok(curve(x)>curve(x-.005)&&curve(x)>=clip(x)-1e-9&&curve(x)<=Math.min(k*x,.5)+1e-9,`under the middle: rising, never clipped, lifted no more than the toe (${x.toFixed(3)})`);
 // ...but not lifted into a milky floor (round 3: at toe 1.4 the frame's darkest twentieth sat at L 17-26).
 assert.ok(curve(.06)*255>=15&&clip(.06)===0,'a shade at 6% stays visible (was black)');
 assert.ok(k<=1.2&&curve(.03)*255<=9,'black reaches black: no milky floor');
 // The occlusion multiplies the sunlit picture too: its floor keeps the sky in the deepest shade.
 assert.ok(LOOK.aoFloor>=.25&&LOOK.aoFloor<=.5,'occlusion floor');
 // The shade's skylight near grey by day (the world's lighting map's sky desaturated in its bake: a car's shadow on
 // asphalt was 19,27,40, blue), the night's moonlit blue kept; the dome and the cars' map keep the sky's colours.
 const sky=readFileSync(new URL('../teste/sky.js',import.meta.url),'utf8');
 assert.ok(WORLD_FILL_SATURATION.dia>=.3&&WORLD_FILL_SATURATION.dia<=.7&&WORLD_FILL_SATURATION.fim_de_tarde>=WORLD_FILL_SATURATION.dia&&WORLD_FILL_SATURATION.noite===1,'skylight saturation by time of day');
 assert.ok(sky.includes('if(environment>.5&&environment<1.5)color=mix(vec3(dot(color,vec3(.2126,.7152,.0722))),color,fill);'),'only the world\'s lighting map is desaturated');
 // ...the shade's light only: the mirrors keep the sky's colour (a lake or Floripa's bay mirrored a grey sky, its zenith
 // .07,.22,.54 at .155,.215,.343). The lakes, the sea and the pits' glass wear SKY_REFLECTION's map: the same bake at
 // full saturation while the fill greys the world's (the world's own at night), at the scene's strength as before.
 assert.ok(sky.includes('if(fill<1){uniforms.fill.value=1;mirror=pmrem.fromScene(envScene,.025);uniforms.fill.value=fill;}')&&sky.includes('SKY_REFLECTION.texture=(mirror??world).texture;'),'a full-colour map for the mirrors');
 const water=skyMirror(new THREE.MeshStandardMaterial({envMapIntensity:1.2})),map={isTexture:true};SKY_REFLECTION.texture=map;SKY_REFLECTION.scene={environmentIntensity:.7};
 assert.ok(water.envMap===map&&water.envMapIntensity===.7,'a mirror reads the full-colour map at the scene\'s strength');
 water.envMap=null;water.envMapIntensity=3;assert.ok(water.envMap===map&&water.envMapIntensity===.7,'and keeps them');
 assert.ok(!Object.values(water).includes(map),'never handed to a circuit\'s clean-up (main.js clearCircuit disposes what Object.values finds)');
 SKY_REFLECTION.texture=SKY_REFLECTION.scene=null;assert.equal(water.envMap,null,'no map yet: the scene\'s');
 for(const [file,count] of [['landscape.js',3],['sea-water.js',1],['pit-building.js',1]])
  assert.ok(readFileSync(new URL('../teste/'+file,import.meta.url),'utf8').split('skyMirror(').length-1>=count,`${file}: its mirrors wear the sky's full colour`);
 // Lens ghosts: at most half their old strength (.05 of the flare), soft discs.
 assert.ok(LOOK.ghosts>0&&LOOK.ghosts<=.05*LOOK.flare*.5+1e-9,'ghosts dimmed');
 assert.ok(!source.includes('smoothstep(size*.55,size'),'no hard-rimmed ghost');
}
// The cars' crisp map softens away from the ground: a sill (20 cm up) stays inside the gap up the sun, the
// roof (1.2 m) beyond it.
{
 const elevation=Math.asin(SUN_DIRECTION.y/SUN_DIRECTION.length());
 assert.ok(CAR_SHADOW_LOOK.soft>1&&CAR_SHADOW_LOOK.soft<6,'a slightly wider penumbra, in texels');
 assert.ok(.2/Math.sin(elevation)<CAR_SHADOW_LOOK.gap&&1.2/Math.sin(elevation)>CAR_SHADOW_LOOK.gap,'tyres and sills crisp, roof and mirrors soft');
}
// A car on a kerb keeps its contact shadow: the footprint (CONTACT_LIFT over the road) is drawn nearer the
// camera than the kerb's crown (track-surface.js createCurbs: 6.5 cm) stands in front of it, seen from the
// chase camera's lowest look at the car (about 17° down).
assert.ok(CONTACT_PULL>=(.065-CONTACT_LIFT)/Math.sin(17*Math.PI/180)&&CONTACT_PULL<.2,'the kerb no longer hides the footprint, the sills stay clear of it');
// Each car's own pull keeps the footprint under its lowest body edge from any look (straight down the most): the
// Opala's distant model from .2 m, the race Fusca's sills 7 cm up (its distant profile from .09 m, fusca.js).
{
 const body=readFileSync(new URL('../teste/fusca.js',import.meta.url),'utf8').match(/FUSCA_PROFILE=Object\.freeze\(\{\s*body:(\[\[.*?\]\]),/s)[1];
 const fusca=[...body.matchAll(/\[(-?[\d.]+),(-?[\d.]+)\]/g)].map(m=>[Number(m[1]),Number(m[2])]);assert.ok(fusca.length>20,'the Fusca\'s profile read');
 const lowest={opala:Math.min(...FAR_PROFILE.body.map(q=>q[1])),fusca:Math.min(...fusca.map(q=>q[1]))};
 for(const [name,shape] of Object.entries(CONTACT_SHAPES)){
  assert.ok(shape.sill<=lowest[name]+1e-9&&CONTACT_LIFT+shape.pull<=shape.sill+1e-9,`${name}: footprint pulled ${shape.pull} m stays under its sills (${shape.sill} m)`);
  assert.ok(shape.pull<=CONTACT_PULL,`${name}: no more pull than the kerb needs`);
 }
 assert.equal(CONTACT_SHAPES.opala.pull,CONTACT_PULL,'the Opala keeps the whole pull over a kerb');
}
console.log('Luz: caixa de sombra inclinada para a vista e presa aos texels, carro sempre dentro; mapa nítido dos carros só no Alto/Ultra; sombra sem preto chapado, fantasmas suaves, contato sobre a zebra.');
