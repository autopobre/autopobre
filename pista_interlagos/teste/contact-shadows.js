import * as THREE from 'three';
import {spinBlurMaterial,spinBlur,blurArc,setTyreDetail,tyreInfo,BLUR_PROFILES,BLUR_TURN} from './car-wheels.js';
// Every car sits on the ground: a soft dark footprint under the body, darkest where the tyres touch (the sun's
// shadow map is coarse on phones and off on Baixo; SSAO only comes with Completo), and at speed a blurred disc
// over each wheel's face so the rims stop strobing. One instanced draw for all the shadows and one for all
// the discs: the player's car (main.js updateCar begins each frame) and the rivals, the Opala 99 others race
// and the multiplayer seats as immersive-visuals.js poses them, both levels of detail.
// Both meshes hang from the player's carRoot (kept across circuits, hidden with it while the story's paddock
// and podium show), but their instances are placed in world space: their own world matrix stays the identity.

// Footprints in the car frame (x forward, z right; metres): the body from tail to nose and its half width,
// the axles, the wheels' half track and the tyre's width and radius. Opala: immersive-visuals.js FAR_PROFILE;
// Fusca: fusca.js FUSCA_PROFILE and physics.js FUSCA_BODY. row: its half of the shadow texture. sill: the body's
// lowest edge over the road (the Opala's distant model starts at .2 m; the race Fusca's sills are 7 cm up).
// pull: how much nearer the camera its footprint is drawn (CONTACT_PULL), never past its own sills.
export const CONTACT_MARGIN=.45,CONTACT_LIFT=.025;
// Drawn this much nearer the camera along its view ray (same place on screen): a kerb's crown stands up
// to 6.5 cm over the road, and from a low chase view it hid the footprint, so a car on a kerb floated. A car
// whose sills sit lower gets only what keeps the footprint under them (seen from straight above the most).
export const CONTACT_PULL=.15;
const pullUnder=sill=>Math.min(CONTACT_PULL,sill-CONTACT_LIFT);
export const CONTACT_SHAPES=Object.freeze({
 opala:Object.freeze({row:0,rear:-2.39,front:2.47,halfWidth:.92,axles:[1.55,-1.117],track:.804,tyre:.205,wheel:.316,disc:.11,sill:.2,pull:pullUnder(.2)}),
 fusca:Object.freeze({row:1,rear:-1.79,front:2.02,halfWidth:.76,axles:[1.417,-.983],track:.666,tyre:.18,wheel:.27,disc:.097,sill:.07,pull:pullUnder(.07)})
});
// The quad round a footprint: the body plus a soft margin; drawn CONTACT_LIFT over the ground.
export const contactQuad=shape=>({length:shape.front-shape.rear+2*CONTACT_MARGIN,width:2*(shape.halfWidth+CONTACT_MARGIN),center:(shape.front+shape.rear)/2});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
// Darkness at a point of the car frame: the body's occlusion (its rounded footprint, darkest in the middle,
// still dark at the sills and gone about 35 cm out, as the sky is hidden under a car 15 cm off the ground) and
// each tyre's contact patch, near black where it touches and spreading a little round the tyre.
export function contactShade(shape,x,z){
 const cx=(shape.front+shape.rear)/2,hx=(shape.front-shape.rear)/2,hz=shape.halfWidth,r=.35;
 const qx=Math.abs(x-cx)-(hx-r),qz=Math.abs(z)-(hz-r),d=Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-r;
 let light=1-(d<0?.7+.22*smooth(0,.5,-d):.66*(1-smooth(-.1,.36,d))**1.5);
 // The tyre's crease with the road, near black, inside a softer halo as wide as the tyre is tall.
 for(const ax of shape.axles){const ex=(x-ax)/shape.wheel,ez=(Math.abs(z)-shape.track)/shape.tyre;light*=(1-.97*Math.exp(-(ex*ex+ez*ez)/.25))*(1-.5*Math.exp(-(ex*ex+ez*ez)/1.4));}
 return 1-light;
}
// The texture: both footprints, one above the other (u along the car, nose at u=1); one channel.
export const CONTACT_TEXTURE=Object.freeze({width:256,height:256});
export function contactPixels({width,height}=CONTACT_TEXTURE){
 const data=new Uint8Array(width*height),rows=height/2;
 for(const shape of Object.values(CONTACT_SHAPES)){const q=contactQuad(shape);
  for(let j=0;j<rows;j++)for(let i=0;i<width;i++){const x=q.center+((i+.5)/width-.5)*q.length,z=-((j+.5)/rows-.5)*q.width;data[(shape.row*rows+j)*width+i]=Math.round(contactShade(shape,x,z)*255);}}
 return data;
}
// How far a point of the footprint may be pulled toward the camera (CONTACT_PULL × this, 0..1): none round the
// tyres. Pulled there, the dark patch under each tyre came out in front of its sidewall: a black band across the
// bottom of every tyre seen from the side, worst with the sun on that side (user, 2026-10-05). The tyre itself
// hides the road under it, so nothing is lost; the rest of the footprint keeps the pull (kerb crowns).
export function contactPullAt(shape,x,z){
 let near=Infinity;
 for(const ax of shape.axles){const dx=Math.max(Math.abs(x-ax)-(shape.wheel+.1),0),dz=Math.max(Math.abs(Math.abs(z)-shape.track)-(shape.tyre/2+.08),0);near=Math.min(near,Math.hypot(dx,dz));}
 return smooth(0,.14,near);
}
// The footprint quad, cut fine enough (about 9 × 11 cm on the Opala) for that pull to fall off round each tyre:
// aPull holds it for the Opala (x) and the Fusca (y), the instance's row picks one.
export const CONTACT_GRID=Object.freeze([64,24]);
function contactGeometry(){
 const g=new THREE.PlaneGeometry(1,1,...CONTACT_GRID).rotateX(-Math.PI/2),uv=g.attributes.uv,pulls=new Float32Array(uv.count*2);
 for(const shape of Object.values(CONTACT_SHAPES)){const q=contactQuad(shape);
  for(let i=0;i<uv.count;i++)pulls[i*2+shape.row]=contactPullAt(shape,q.center+(uv.getX(i)-.5)*q.length,-(uv.getY(i)-.5)*q.width);}
 g.setAttribute('aPull',new THREE.BufferAttribute(pulls,2));return g;
}
// How much of the shadow a car keeps: all of it on its wheels, gone a metre up (a jump) or once it lies on
// its side or roof (rollovers, physics.js upright).
export const contactFade=(height,upright)=>(1-smooth(.04,.9,height))*smooth(.3,.8,upright);
// Strength by the Gráficos values: strongest without sun shadows (Baixo: the only grounding there), lighter
// where the shadow map and the ambient occlusion already darken under the car.
// Under the body itself (15 cm of air with the car over it) the road is near black, as a camera shows it: at .74 with
// the occlusion's floor the gap under the car stayed at L 17 on screen, the Forza shot's at 2, and the frame looked milky.
export const contactStrength=({shadows,post,ao})=>shadows==='off'?.95:post==='full'&&ao?.9:.92;
// The wheel blur's opacity at full speed by Sensação de velocidade (off: none).
export const BLUR_LEVELS=Object.freeze({off:0,leve:.9,media:.96,completa:1});
// Surface speed of a car's front and rear tyres (m/s): rolling, plus the rear's wheelspin; the rear as the physics
// turns it (physics.js rearWheelSpeed: 0 while the handbrake locks it) when the car carries it.
export function wheelSpeeds(c){const along=c.vx*Math.cos(c.heading)+c.vy*Math.sin(c.heading);return [Math.abs(along),Math.abs(c.rearWheelSpeed??along+(c.rearSlipSpeed??0))];}

const vertexShader=`attribute vec2 aPull;varying vec2 vUv;varying float vShade;varying float vDepth;
void main(){vec4 p=vec4(position,1.);
#ifdef USE_INSTANCING
p=instanceMatrix*p;
#endif
float pull=${CONTACT_PULL};
#ifdef USE_INSTANCING_COLOR
vShade=instanceColor.r;vUv=vec2(uv.x,(uv.y+instanceColor.g)*.5);pull=instanceColor.b*mix(aPull.x,aPull.y,instanceColor.g);
#else
vShade=0.;vUv=uv;
#endif
vec4 mv=modelViewMatrix*p;vDepth=-mv.z;mv.xyz*=1.-pull/max(length(mv.xyz),.5);gl_Position=projectionMatrix*mv;}`;
// Black over the ground; the HDR target's alpha (its occlusion mask, cinematic.js) is left as it is.
const fragmentShader=`uniform sampler2D map;uniform float strength;varying vec2 vUv;varying float vShade;varying float vDepth;
void main(){gl_FragColor=vec4(0.,0.,0.,texture2D(map,vUv).r*vShade*strength*(1.-smoothstep(220.,380.,vDepth)));}`;
const keepAlpha={blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor};
const f=new THREE.Vector3(),n=new THREE.Vector3(),side=new THREE.Vector3(),at=new THREE.Vector3(),m=new THREE.Matrix4();
const axle=new THREE.Vector3(),hub=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3();
export class CarContact {
 constructor(capacity=48){
  // The footprints' texture is drawn at the first car placed (fill), not at import: main-thread time at every page
  // load, menu included. Until then a blank texel stands in (same programs). The discs need none (car-wheels.js).
  const map=new THREE.DataTexture(new Uint8Array(1),1,1,THREE.RedFormat);map.needsUpdate=true;
  const material=new THREE.ShaderMaterial({name:'Sombra_de_contato',vertexShader,fragmentShader,uniforms:{map:{value:map},strength:{value:.8}},transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4,...keepAlpha});
  const mesh=(geometry,mat,count,name,order)=>{const o=new THREE.InstancedMesh(geometry,mat,count);o.name=name;o.count=0;o.frustumCulled=false;o.renderOrder=order;o.matrixAutoUpdate=o.matrixWorldAutoUpdate=false;
   o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);o.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage);return o;};
  // Drawn first among the see-through things: under the skid marks' and smoke's, the car glass after.
  this.shadows=mesh(contactGeometry(),material,capacity,'Sombras_de_contato',-2);
  this.discs=mesh(new THREE.CircleGeometry(1,48),spinBlurMaterial(),capacity*4,'Rodas_borradas',-1);this.discs.receiveShadow=true;
  this.root=new THREE.Group();this.root.name='Contato_com_o_chao';this.root.add(this.shadows,this.discs);
  this.strength=.8;this.blur=.92;this.player=null;this.filled=false;
 }
 fill(){
  if(this.filled)return;this.filled=true;
  const {width,height}=CONTACT_TEXTURE,map=new THREE.DataTexture(contactPixels(),width,height,THREE.RedFormat),u=this.shadows.material.uniforms.map;
  map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  u.value.dispose();u.value=map;
 }
 // The Gráficos values in force (main.js applyGraphics): uniforms only, no new program.
 setQuality(values){this.strength=contactStrength(values);this.blur=BLUR_LEVELS[values.speedEffects]??BLUR_LEVELS.media;this.shadows.material.uniforms.strength.value=this.strength;}
 // Each frame from nothing: the player's car first, then the rivals as they are posed.
 begin(){this.shadows.count=this.discs.count=0;this.player=null;}
 // A car as drawn. obj: its root, at the ground under the centre of mass when on its wheels (the physics pose);
 // c: its physics (TestCar: surface under it, heading, upright, speeds); shape: 'opala' or 'fusca'; wheels: its
 // pivots ({obj}, front ones named Dianteira) when they show close up, else null (the distant model).
 car(obj,c,shape='opala',wheels=null){
  const s=c?.surface,k=this.shadows.count,first=!this.player;if(!s||k>=this.shadows.instanceMatrix.count)return;
  if(!this.filled)this.fill();
  const S=CONTACT_SHAPES[shape]??CONTACT_SHAPES.opala,q=contactQuad(S),gx=s.gx??0,gy=s.gy??0,p=obj.position;
  // The ground under the drawn car (the slope carries it from the physics step's point), its normal and the
  // car's nose along it: the footprint lies on the road whatever the body does.
  const ground=s.z+gx*(p.x-c.x)+gy*(-p.z-c.y),height=p.y-ground;
  n.set(-gx,1,gy).normalize();f.set(1,0,0).applyQuaternion(obj.quaternion).addScaledVector(n,-f.dot(n));
  if(f.lengthSq()<1e-4)f.set(Math.cos(c.heading),0,-Math.sin(c.heading)).addScaledVector(n,-f.dot(n));
  f.normalize();side.crossVectors(f,n);
  const shade=contactFade(height,c.upright??1),spread=1+.45*clamp(height,0,1.5);
  if(shade>.005){
   at.set(p.x,ground,p.z).addScaledVector(f,q.center).addScaledVector(n,CONTACT_LIFT);
   m.set(f.x*q.length*spread,n.x,side.x*q.width*spread,at.x, f.y*q.length*spread,n.y,side.y*q.width*spread,at.y, f.z*q.length*spread,n.z,side.z*q.width*spread,at.z, 0,0,0,1);
   this.shadows.setMatrixAt(k,m);this.shadows.instanceColor.setXYZ(k,shade,S.row,S.pull);this.shadows.count=k+1;
   this.shadows.instanceMatrix.needsUpdate=this.shadows.instanceColor.needsUpdate=true;
  }
  // The first car of the frame is the player's (begin): what the checks read of it.
  if(first)this.player={shape,height:+height.toFixed(3),shade:+shade.toFixed(3),discs:0,blur:0};
  if(!wheels?.length||!this.blur)return;
  // Wheel blur: a disc just off each tyre's outer face, on its axle but in a frame of its own round it (the
  // car's up as reference), turned BLUR_TURN as far as the wheel: never the pivot's spin, which would strobe. Its
  // spokes are smeared over the arc the wheel turns while the shutter is open (car-wheels.js blurArc), and over a
  // whole spoke's period while the disc fades in: the real spokes show through it then, never two sets of them.
  const [front,rear]=wheelSpeeds(c),P=BLUR_PROFILES[shape]??BLUR_PROFILES.opala,period=2*Math.PI/P.spokes[0],d=this.discs,r=S.wheel*.985;
  obj.updateWorldMatrix(true,false);const oe=obj.matrixWorld.elements;
  for(const w of wheels){
   const o=w.obj,isFront=o.name.includes('Dianteira'),amount=spinBlur(isFront?front:rear)*this.blur;if(amount<.02||d.count>=d.instanceMatrix.count)continue;
   o.updateWorldMatrix(true,false);const e=o.matrixWorld.elements;
   axle.set(e[8],e[9],e[10]).normalize();hub.setFromMatrixPosition(o.matrixWorld).addScaledVector(axle,o.position.z>0?S.disc:-S.disc);
   e1.set(oe[4],oe[5],oe[6]);e1.addScaledVector(axle,-e1.dot(axle));if(e1.lengthSq()<1e-6)e1.set(oe[0],oe[1],oe[2]).addScaledVector(axle,-axle.dot(e1));e1.normalize();e2.crossVectors(axle,e1);
   const speed=isFront?front:rear,turn=-BLUR_TURN*((isFront?c.spin:c.rearSpin??c.spin)||0),cs=Math.cos(turn)*r,sn=Math.sin(turn)*r;
   const arc=Math.max(blurArc(speed,S.wheel),(1-spinBlur(speed))*period);
   m.set(e1.x*cs+e2.x*sn,e2.x*cs-e1.x*sn,axle.x,hub.x, e1.y*cs+e2.y*sn,e2.y*cs-e1.y*sn,axle.y,hub.y, e1.z*cs+e2.z*sn,e2.z*cs-e1.z*sn,axle.z,hub.z, 0,0,0,1);
   d.setMatrixAt(d.count,m);d.instanceColor.setXYZ(d.count,amount,P.model+Math.min(arc/(2*Math.PI),1)*.9,obj.userData.rimStyle??o.userData.rimStyle??0);d.count++;
   d.instanceMatrix.needsUpdate=d.instanceColor.needsUpdate=true;
   if(first){this.player.discs++;this.player.blur=+Math.max(this.player.blur,amount).toFixed(3);}
  }
 }
 info(){return {shadows:this.shadows.count,discs:this.discs.count,strength:this.strength,blur:this.blur,player:this.player&&{...this.player},capacity:this.shadows.instanceMatrix.count};}
}
// One for the game: main.js hangs it under carRoot and places the player's car, immersive-visuals.js the rivals.
export const carContact=new CarContact();
// Checks and before/after photos: what is drawn; everything of this off (shadows, blur, lettering) or back as the
// level had it (enable); the shadows and discs alone (show).
let lettered=null;
if(typeof window!=='undefined')window.interlagosContato={info:()=>({...carContact.info(),shown:carContact.root.visible,tyres:tyreInfo()}),
 enable:on=>{carContact.root.visible=!!on;if(!on){lettered??=tyreInfo().detailed;setTyreDetail(false);}else if(lettered!==null){setTyreDetail(lettered);lettered=null;}return true;},
 show:on=>{carContact.root.visible=!!on;return true;}};
