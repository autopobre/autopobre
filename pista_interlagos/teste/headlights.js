import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Headlights for the night and the rain (weather.js lights). The Opala 99 races with its original headlamps blanked
// (they are stickers on the race car) and lights the road with the four round auxiliary lamps on brackets under
// them (carro_23 in the pits, carro_15 at night: white LED, "faróis de milha"); a car without them (the Seiva
// livery) uses the headlamps' places, the Fusca its own headlamps. Car frame: +X forward, +Y up, +Z right.
//  - every car: a lit lens and a glare that faces the eye (one billboard per lamp, brightest seen from in front);
//  - the player's car: two real spot lights (one per side pair) on the car's sprung body, so the road, the rails,
//    the trees and the car ahead light up; H switches them (PlayerHeadlights);
//  - the rivals: their lamps light the road, kerbs and ground through ROAD_LAMPS (lampPatch on those materials), a
//    few dozen lamps for the price of a loop, with no extra light in every other material's program.
export const LAMP_SETS=Object.freeze({
 // Lens centres measured on the V06 OMP model (Farol_auxiliar: x 2.356-2.362, y .527-.623, |z| .50 and .64).
 milha:Object.freeze({lamps:[[2.366,.575,-.64],[2.366,.575,-.5],[2.366,.575,.5],[2.366,.575,.64]],radius:.046,color:[1,1.02,1.08],pairs:[[2.37,.575,-.57],[2.37,.575,.57]]}),
 // The Opala's round headlamps (Lente_farol: x 2.273-2.301, y .545-.717, |z| to .721).
 farol:Object.freeze({lamps:[[2.306,.631,-.635],[2.306,.631,.635]],radius:.078,color:[1,.94,.82],pairs:[[2.31,.631,-.635],[2.31,.631,.635]]}),
 // The Fusca's (Vidro_farol: x 1.868-1.972, y .399-.546, centre |z| .514).
 fusca:Object.freeze({lamps:[[1.976,.472,-.514],[1.976,.472,.514]],radius:.07,color:[1,.92,.78],pairs:[[1.98,.472,-.514],[1.98,.472,.514]]})
});
// Which lamps a car carries: the auxiliary lamps where the model has them (the OMP livery), else the headlamps.
const lampSetCache=new WeakMap();
export function lampSetFor(root,fusca=false){
 if(fusca)return 'fusca';if(!root)return 'milha';if(lampSetCache.has(root))return lampSetCache.get(root);let aux=false;
 root.traverse(o=>{if(!aux&&o.isMesh)aux=[o.material].flat().some(m=>m?.name==='Lente_auxiliar_LED');});
 const set=aux?'milha':'farol';lampSetCache.set(root,set);return set;
}

// The glare: a quad per lamp turned to the eye in the vertex shader, pulled toward it so the lamp's own housing does
// not cut it; strongest straight down the beam, only the lit lens from the side. Added light only (the colour
// channels; the HDR target's alpha, the film look's occlusion mask, is left alone).
const glowVertex=`attribute vec3 lampCentre;attribute vec2 corner;uniform float glowSize;varying vec2 vCorner;varying float vFacing;
void main(){
 vec4 world=modelMatrix*vec4(lampCentre,1.0);
 vec3 forward=normalize(mat3(modelMatrix)*vec3(1.0,0.0,0.0)),toEye=cameraPosition-world.xyz;float dist=length(toEye);
 vFacing=dot(forward,toEye/max(dist,1e-4));vCorner=corner;
 vec4 view=viewMatrix*world;view.xyz+=normalize(-view.xyz)*min(.22,dist*.4);
 float size=glowSize*(.3+.7*smoothstep(-.2,.9,vFacing))+dist*.0022;
 view.xy+=corner*size;gl_Position=projectionMatrix*view;
}`;
const glowFragment=`uniform vec3 glowColor;uniform float glowStrength;varying vec2 vCorner;varying float vFacing;
void main(){
 float r2=dot(vCorner,vCorner);if(r2>1.0)discard;
 float beam=smoothstep(-.1,.95,vFacing);
 float core=exp(-r2*70.0)*(.2+.8*beam),halo=exp(-r2*7.0)*beam*beam,streak=exp(-vCorner.y*vCorner.y*600.0)*(1.0-sqrt(r2))*beam*beam*beam;
 gl_FragColor=vec4(glowColor*glowStrength*(core*10.0+halo*.18+streak*.22),1.0);
}`;
const glowMaterials=new Map();let glare=1;
function glowMaterial(set){
 if(!glowMaterials.has(set)){const s=LAMP_SETS[set];glowMaterials.set(set,new THREE.ShaderMaterial({name:'Farol_brilho',vertexShader:glowVertex,fragmentShader:glowFragment,
  uniforms:{glowSize:{value:set==='milha'?.3:.4},glowColor:{value:new THREE.Color(...s.color)},glowStrength:{value:glare}},
  transparent:true,depthWrite:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,fog:false}));}
 return glowMaterials.get(set);
}
const lensMaterial=new THREE.MeshBasicMaterial({name:'Farol_lente_acesa',color:new THREE.Color().setRGB(5,5.1,5.4)});
const shapes=new Map();
function lampShapes(set){
 if(shapes.has(set))return shapes.get(set);const s=LAMP_SETS[set];
 const quads=s.lamps.map(c=>{const g=new THREE.PlaneGeometry(2,2),n=g.attributes.position.count,centre=new Float32Array(n*3),corner=new Float32Array(n*2);
  for(let i=0;i<n;i++){centre.set(c,i*3);corner[i*2]=g.attributes.position.getX(i)/1;corner[i*2+1]=g.attributes.position.getY(i)/1;}
  g.setAttribute('lampCentre',new THREE.BufferAttribute(centre,3));g.setAttribute('corner',new THREE.BufferAttribute(corner,2));return g;});
 const lenses=s.lamps.map(([x,y,z])=>new THREE.CircleGeometry(s.radius,20).rotateY(Math.PI/2).translate(x+.003,y,z));
 const glow=mergeGeometries(quads,false),lens=mergeGeometries(lenses,false);[...quads,...lenses].forEach(g=>g.dispose());
 // The quads are placed in the shader: the box only has to hold the car's nose for culling.
 glow.boundingSphere=new THREE.Sphere(new THREE.Vector3(s.lamps[0][0],s.lamps[0][1],0),1.5);
 const out={glow,lens};shapes.set(set,out);return out;
}
// What every car's lamps share (kept when a car is thrown away, immersive-visuals.js disposeCar).
export const sharedHeadlights=()=>[lensMaterial,...glowMaterials.values(),...[...shapes.values()].flatMap(s=>[s.glow,s.lens])];
// One car's lamps (the lit lens and the glare), hidden until on.
export function createHeadlights(set='milha'){
 const {glow,lens}=lampShapes(set),group=new THREE.Group();group.name='Farois_acesos';
 const g=new THREE.Mesh(glow,glowMaterial(set)),l=new THREE.Mesh(lens,lensMaterial);g.renderOrder=3;g.frustumCulled=false;
 for(const m of [l,g]){m.castShadow=m.receiveShadow=false;group.add(m);}
 group.visible=false;group.userData.lampSet=set;return group;
}
// The glare's strength under the weather: faint by day in the rain, full at night.
export function setGlare(strength){glare=strength;for(const m of glowMaterials.values())m.uniforms.glowStrength.value=strength;lensMaterial.color.setRGB(5*Math.max(.35,strength),5.1*Math.max(.35,strength),5.4*Math.max(.35,strength));}

// The beam's shape, the same for the spot lights' cookie, the road's lamps and the rain. Full from a little over the
// axis (BEAM_HIGH) to BEAM_LOW under it (the road from about 20 m on, for lamps 0.6 m up), so the body's pitch under
// throttle or braking (a degree or so) never lifts it off the road; nearer the car it thins as the distance to the
// power 2.4 (with the lamps' ceiling, roadLampCap, the asphalt reads about even from the bumper to some 45 m instead of
// a white pool); over the axis a dimmer spill (signs, trees; spill: how much, the rain's is less); a soft spread to
// the sides. elevation and side: tangents of the ray's angle under/over and beside the axis.
export const BEAM_LOW=.03,BEAM_HIGH=.006;
export function beamShape(elevation,side,spill=.75){
 const s=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
 const vertical=elevation<-BEAM_LOW?(BEAM_LOW/-elevation)**2.4:1-spill*s(BEAM_HIGH,BEAM_HIGH+.16,elevation);
 return vertical*Math.exp(-side*side*14);
}
// The same in GLSL (headlights' road loop, rain.js).
export const BEAM_GLSL=`float beamShape(float elevation,float side,float spill){
 float vertical=elevation<-${BEAM_LOW.toFixed(4)}?pow(${BEAM_LOW.toFixed(4)}/-elevation,2.4):1.0-spill*smoothstep(${BEAM_HIGH.toFixed(4)},${(BEAM_HIGH+.16).toFixed(4)},elevation);
 return vertical*exp(-side*side*14.0);
}`;
let cookie=null;
function beamCookie(angle){
 if(cookie)return cookie;const n=128,data=new Uint8Array(n*n*4),t=Math.tan(angle);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=Math.round(255*beamShape(((y+.5)/n*2-1)*t,((x+.5)/n*2-1)*t)),k=(y*n+x)*4;data[k]=data[k+1]=data[k+2]=v;data[k+3]=255;}
 cookie=new THREE.DataTexture(data,n,n);cookie.magFilter=cookie.minFilter=THREE.LinearFilter;cookie.needsUpdate=true;return cookie;
}
// The player's two spot lights (one per side pair of lamps), on the car's sprung body, aimed level: they light what
// stands up in the beam (the car ahead, rails, boards, trees); the road's own pool comes from ROAD_LAMPS, which
// lights the asphalt at its grazing angle as the eye sees it. Their number in the scene decides every lit
// material's program: install() puts them in or takes them out with the weather (main.js then precompiles), on()
// only changes their strength.
export const BEAM=Object.freeze({intensity:650,angle:.55,penumbra:.15,decay:2,distance:260,aim:30,drop:.25,color:'#eef2ff'});
export class PlayerHeadlights{
 constructor(holder){
  this.holder=holder;this.installed=false;this.lit=false;this.set='milha';this.strength=1;
  this.lights=[-1,1].map(()=>{const light=new THREE.SpotLight(BEAM.color,0,BEAM.distance,BEAM.angle,BEAM.penumbra,BEAM.decay);light.name='Farol_do_jogador';light.castShadow=false;light.map=beamCookie(BEAM.angle);light.target.name='Mira_do_farol';return light;});
  this.place('milha');
 }
 // Where the lamps are on the car (LAMP_SETS key): the lights sit at each side pair, aimed down the road.
 place(set){
  this.set=set;const pairs=LAMP_SETS[set].pairs;
  this.lights.forEach((light,i)=>{const [x,y,z]=pairs[i];light.position.set(x,y,z);light.target.position.set(x+BEAM.aim,y-BEAM.drop,z);});
 }
 // In the scene or not (the weather wants lights). True when that changed: programs must be compiled again.
 install(wanted){
  if(wanted===this.installed)return false;this.installed=wanted;
  for(const light of this.lights){if(wanted)this.holder.add(light,light.target);else this.holder.remove(light,light.target);}
  this.update();return true;
 }
 on(value){this.lit=!!value;this.update();return this.lit;}
 toggle(){return this.on(!this.lit);}
 // strength: the weather's (weather.js lamps): full at night, less at dusk and by day in the rain.
 setStrength(value){this.strength=value;this.update();}
 update(){for(const light of this.lights)light.intensity=this.installed&&this.lit?BEAM.intensity*this.strength:0;}
 info(){return {installed:this.installed,lit:this.lit,set:this.set,intensity:this.lights[0].intensity,position:this.lights.map(l=>l.position.toArray())};}
}

// The rivals' lamps on the road: world positions with strength (w; negative: a red tail lamp) and the beam's axis
// with the cosine of its edge (w). main.js fills them every frame with the lamps nearest the camera.
export const ROAD_LAMPS_MAX=24;
export const ROAD_LAMPS={roadLampPos:{value:Array.from({length:ROAD_LAMPS_MAX},()=>new THREE.Vector4())},roadLampDir:{value:Array.from({length:ROAD_LAMPS_MAX},()=>new THREE.Vector4())},roadLampCount:{value:0},roadLampCap:{value:1.1},roadLampBudget:{value:1.35}};
// The lamps as direct lights in the material's own lighting model (RE_Direct, view space), after three's lights.
const lampLoop=`
#if defined( RE_Direct )
{
 IncidentLight lampLight;lampLight.visible=true;
 // All the white lamps together light a point no more than roadLampBudget (a pack's beams overlapping, the masts):
 // past it the asphalt went white as snow.
 float budget=roadLampBudget;
 vec3 upView=(viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz;
 for(int i=0;i<${ROAD_LAMPS_MAX};i++){
  if(i>=roadLampCount)break;
  vec4 lp=roadLampPos[i],ld=roadLampDir[i];
  vec3 toLamp=(viewMatrix*vec4(lp.xyz,1.0)).xyz-geometryPosition;float d2=dot(toLamp,toLamp);
  if(d2>25600.0)continue;
  vec3 l=toLamp*inversesqrt(d2),axis=normalize((viewMatrix*vec4(ld.xyz,0.0)).xyz);
  float along=dot(-l,axis);if(along<=0.0)continue;
  float shape;vec3 tint;
  if(ld.w>0.0){
   // A headlight: the beam's shape (beamShape in headlights.js) by the ray's angle under and beside the axis, in the
   // car's own frame (its up tilts with the car: down a slope the beam follows the road, as the lamps do).
   vec3 upLamp=normalize(upView-axis*dot(upView,axis));
   float elevation=dot(-l,upLamp)/along,side=length(-l-axis*along-upLamp*dot(-l,upLamp))/along;
   shape=beamShape(elevation,side,.75);tint=vec3(1.0,.98,.95);
  // A wide cone (-ld.w its edge): a red tail lamp (negative strength) or a floodlight mast, warm white (floodlights.js).
  }else{shape=smoothstep(-ld.w,min(1.0,-ld.w+.25),along);tint=lp.w>0.0?vec3(1.0,.93,.82):vec3(1.0,.04,.015);}
  if(shape<=0.0)continue;
  // The road is lit at a grazing angle: the eye sees its pool brighter than the bare cosine gives (a film camera's
  // night look), so the far road shows without flooding what stands up in the beam.
  // Capped (roadLampCap): what stands up in the beam close by (rails, a car's tail) is lit, not burnt white.
  // A tail lamp's glow (red: negative strength) stays a faint patch, an eighth of the white lamps' ceiling.
  float facing=max(dot(geometryNormal,l),.004),light=min(abs(lp.w)*shape*pow(facing,.4)/(d2+.5),lp.w>0.0?roadLampCap:roadLampCap*.12);
  if(lp.w>0.0){light=min(light,budget);budget-=light;if(light<=0.0)continue;}
  lampLight.direction=l;
  lampLight.color=tint*light/facing;
  RE_Direct(lampLight,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
 }
}
#endif`;
// Lets a lit material (road, kerbs, ground) take the rivals' lamps; keeps its own onBeforeCompile and program key.
export function lampPatch(material){
 if(!material||material.userData.lampPatch)return material;material.userData.lampPatch=true;
 const before=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,renderer){
  before?.call(this,shader,renderer);
  Object.assign(shader.uniforms,ROAD_LAMPS);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nuniform vec4 roadLampPos[${ROAD_LAMPS_MAX}],roadLampDir[${ROAD_LAMPS_MAX}];uniform int roadLampCount;uniform float roadLampCap,roadLampBudget;
${BEAM_GLSL}`)
   .replace('#include <lights_fragment_end>','#include <lights_fragment_end>'+lampLoop);
 };
 material.customProgramCacheKey=function(){return (key?key.call(this):'')+'|farois-v7';};
 material.needsUpdate=true;return material;
}

// Fills ROAD_LAMPS from the cars (each {obj, set, head, tail}: the car's root in the world, its LAMP_SETS key, the
// strengths of its headlights and tail lamps) nearest the eye. Returns how many went in.
const lampPos=new THREE.Vector3(),lampAxis=new THREE.Vector3();
// head: a headlight's strength on the road (both of a car's beams as one, from the middle of its nose); tail: a tail
// lamp's red glow on the road behind; tailEdge: the cosine of its spread; reach: metres from the eye.
export const LAMP_BEAM=Object.freeze({head:16000,tail:.8,tailEdge:.15,reach:170});
// floods: fixed lamps (floodlights.js {pos, dir, edge, strength}) that take up to floodSlots of the places first.
export function updateRoadLamps(cars,eye,limit=ROAD_LAMPS_MAX,strength=1,floods=[],floodSlots=8){
 const list=[],pos=ROAD_LAMPS.roadLampPos.value,dir=ROAD_LAMPS.roadLampDir.value;let f=0;
 if(floods.length&&floods[0].strength>0){
  const near=floods.map(l=>({l,d:l.pos.distanceTo(eye)})).filter(x=>x.d<LAMP_BEAM.reach).sort((a,b)=>a.d-b.d).slice(0,Math.min(floodSlots,limit));
  for(const {l} of near){pos[f].set(l.pos.x,l.pos.y,l.pos.z,l.strength);dir[f].set(l.dir.x,l.dir.y,l.dir.z,-l.edge);f++;}
 }
 for(const c of cars){
  if(!c.obj?.visible)continue;const d=lampPos.setFromMatrixPosition(c.obj.matrixWorld).distanceTo(eye);if(d>LAMP_BEAM.reach)continue;
  if(c.head>0)list.push({c,d,head:true});if(c.tail>0)list.push({c,d:d+20,head:false});
 }
 list.sort((a,b)=>a.d-b.d);const n=f+Math.min(list.length,limit-f,ROAD_LAMPS_MAX-f);
 for(let i=f;i<n;i++){
  const {c,head}=list[i-f],s=LAMP_SETS[c.set??'milha'],m=c.obj.matrixWorld;
  if(head){lampPos.set(s.pairs[0][0]+.05,s.pairs[0][1],0).applyMatrix4(m);lampAxis.set(1,0,0).transformDirection(m);pos[i].set(lampPos.x,lampPos.y,lampPos.z,LAMP_BEAM.head*c.head*strength);dir[i].set(lampAxis.x,lampAxis.y,lampAxis.z,1);}
  else{lampPos.set(-2.2,.68,0).applyMatrix4(m);lampAxis.set(-1,-.25,0).normalize().transformDirection(m);pos[i].set(lampPos.x,lampPos.y,lampPos.z,-LAMP_BEAM.tail*c.tail);dir[i].set(lampAxis.x,lampAxis.y,lampAxis.z,-LAMP_BEAM.tailEdge);}
 }
 ROAD_LAMPS.roadLampCount.value=n;return n;
}
