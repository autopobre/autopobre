import * as THREE from 'three';
import {EFFECT_LIGHT} from './weather.js';
import {kerbSound} from './kerb-contact.js';

// The Gráficos tab's 'Sensação de velocidade' (speedEffects) for the air and the ground round the
// cars: specks of dust in the air streaming past the camera, dust thrown by rivals that run wide,
// grass and grit kicked up at the verge, the roadside grass pushed by passing cars. The kerbs'
// rumble and the pad's buzz are gameplay feel and play on every level (kerb-contact.js); Leve adds
// the body's shiver on the ridges and the wind's rising hiss. roadSmear: the near road streams past
// on the phones' lite film look while the full Desfoque de velocidade is off (cinematic.js ROAD_SMEAR).
// roadStreak: the asphalt shader's own streak near the camera where no film smear reaches the road
// (track-surface.js setMotion, main.js runFrame): none on Leve, which keeps only the flags.
export const SPEED_EFFECTS=Object.freeze({
 off:Object.freeze({motes:0,windSweep:false,kerbBuzz:false,rivalDust:false,debris:false,grassWake:false,roadSmear:false,roadStreak:0}),
 leve:Object.freeze({motes:0,windSweep:true,kerbBuzz:true,rivalDust:false,debris:false,grassWake:false,roadSmear:false,roadStreak:0}),
 media:Object.freeze({motes:180,windSweep:true,kerbBuzz:true,rivalDust:true,debris:false,grassWake:false,roadSmear:true,roadStreak:.6}),
 completa:Object.freeze({motes:320,windSweep:true,kerbBuzz:true,rivalDust:true,debris:true,grassWake:true,roadSmear:true,roadStreak:1})
});
export const speedEffects=value=>SPEED_EFFECTS[Object.hasOwn(SPEED_EFFECTS,value)?value:'off'];
export const MOTE_CAPACITY=400;
// The specks fill a box (world metres) that wraps round a point ahead of the camera: everything
// leaving one face comes back at the opposite one, faded out near every face so nothing pops.
// It sits on the ground under the camera, MOTE_FLOOR up, and no taller than a person: the dust hangs
// low over the road and the verges, and every speck fades out before it reaches the eye's height
// (MOTE_EYE under it), so it streams past against the asphalt and never across the sky (a speck below
// the eye always lands below the horizon, whatever the view's pitch).
export const MOTE_BOX=Object.freeze([22,1.6,22]),MOTE_AHEAD=6,MOTE_FLOOR=.08,MOTE_EYE=[.5,.15];
// Dust, not light: a pale sunlit tan, a mid grey and a dark brown speck (linear colour, under the bloom's
// threshold at any exposure), drawn over the picture rather than added to it, so they read on the asphalt.
export const MOTE_TINTS=Object.freeze([[.72,.64,.52],[.5,.49,.47],[.24,.2,.16]]);
// One speck in twenty is a bigger fleck of chaff: it starts further from the lens and always draws a short
// streak, never a round blot.
export const MOTE_BIG=.05,MOTE_BIG_NEAR=1.8;
// The breeze the lakes and the grass already show (landscape.js windDir), in world x/z, m/s.
export const WIND=Object.freeze([.821*1.4,0,.571*1.4]);
// A speck seen for a short exposure draws a streak along its motion relative to the camera
// (about 60 cm at 200 km/h): long enough to flow from frame to frame, too short to read as rain.
export const EXPOSURE=.011,MAX_STREAK=1.3;

// The wrap the vertex shader does (wander left out): the copy of a speck nearest the box's centre.
export function moteWrap(seed,box,drift,centre,out=[0,0,0]){
 for(let k=0;k<3;k++){const v=seed[k]*box[k]+drift[k]-centre[k]+box[k]*.5;out[k]=centre[k]+v-Math.floor(v/box[k])*box[k]-box[k]*.5;}
 return out;
}
// Where the box sits for a camera: MOTE_AHEAD in front of it along the ground, its floor on the ground.
export function moteCentre(position,forward,ground,out=[0,0,0]){
 const fl=Math.hypot(forward[0],forward[2])||1;
 out[0]=position[0]+forward[0]/fl*MOTE_AHEAD;out[2]=position[2]+forward[2]/fl*MOTE_AHEAD;
 out[1]=(Number.isFinite(ground)?ground:position[1]-1.8)+MOTE_FLOOR+MOTE_BOX[1]/2;
 return out;
}
function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

// One instanced draw of camera-facing streaks; the CPU only moves the box and the breeze.
export class AirMotes {
 constructor(capacity=MOTE_CAPACITY){
  const rand=random(77041),seeds=new Float32Array(capacity*3),looks=new Float32Array(capacity*4),tints=new Float32Array(capacity*4);
  for(let i=0;i<capacity;i++){
   seeds.set([rand(),rand(),rand()],i*3);
   // look: width (px at 1080p), coverage, wander phase, wander rate; tint: one of MOTE_TINTS, a little
   // brighter or darker each. Mostly fine dust; one in twenty (MOTE_BIG) a bigger fleck of chaff.
   const big=rand()<MOTE_BIG,base=MOTE_TINTS[Math.min(2,Math.floor(rand()*rand()*3.2))],shade=.85+rand()*.3;
   looks.set([big?2+rand()*.6:1.3+rand()*.6,big?.7+rand()*.15:.55+rand()*.4,rand(),.25+rand()*.5],i*4);tints.set([base[0]*shade,base[1]*shade,base[2]*shade,big?1:0],i*4);
  }
  this.geometry=new THREE.InstancedBufferGeometry();
  // x 0 at the speck, 1 at the end of its streak; y across.
  this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,1,1,0,0,1,0],3));this.geometry.setIndex([0,1,2,0,2,3]);
  this.geometry.setAttribute('seed',new THREE.InstancedBufferAttribute(seeds,3));this.geometry.setAttribute('look',new THREE.InstancedBufferAttribute(looks,4));this.geometry.setAttribute('tint',new THREE.InstancedBufferAttribute(tints,4));
  this.geometry.instanceCount=0;this.capacity=capacity;
  this.uniforms={moteCentre:{value:new THREE.Vector3()},moteBox:{value:new THREE.Vector3(...MOTE_BOX)},moteDrift:{value:new THREE.Vector3()},moteStreak:{value:new THREE.Vector3()},
   moteViewport:{value:new THREE.Vector2(1920,1080)},moteTime:{value:0},moteNear:{value:1.4},moteFar:{value:4},moteAlpha:{value:1},moteEye:{value:new THREE.Vector2(...MOTE_EYE)},effectLight:EFFECT_LIGHT};
  // Dust drawn over the picture (its own colour at its coverage), but the HDR target's alpha (its occlusion
  // mask, cinematic.js) is left as it is: no speck ever writes the mask.
  this.material=new THREE.ShaderMaterial({name:'Ar_em_movimento',transparent:true,depthWrite:false,blending:THREE.CustomBlending,
   blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,uniforms:this.uniforms,
   vertexShader:`attribute vec3 seed;attribute vec4 look,tint;
    uniform vec3 moteCentre,moteBox,moteDrift,moteStreak;uniform vec2 moteViewport,moteEye;uniform float moteTime,moteNear,moteFar,moteAlpha;
    varying float vAlpha;varying vec2 vQuad;varying vec3 vTint;
    void main(){
     float t=moteTime*look.w+look.z*6.2832;
     // A slow wander of its own on top of the breeze, so the specks never move as one sheet.
     vec3 wander=vec3(sin(t),sin(t*1.37+1.7)*.4,cos(t*.83+.4))*.45;
     vec3 local=mod(seed*moteBox+moteDrift+wander-moteCentre+moteBox*.5,moteBox)-moteBox*.5;
     vec3 world=moteCentre+local,edge=abs(local)/(moteBox*.5);
     vec4 head=viewMatrix*vec4(world,1.),tail=viewMatrix*vec4(world+moteStreak,1.);
     float dist=length(head.xyz),near=moteNear+tint.w*${MOTE_BIG_NEAR.toFixed(2)};
     // Faded at the box's faces (no popping: the top and the floor to nothing too, on a climb the whole
     // lattice crosses them), below the eye (never against the sky), close to the lens (never a blot on
     // the view; the big flecks further out) and past a dozen metres, where they would only clutter the road.
     float a=(1.-smoothstep(.62,1.,max(edge.x,edge.z)))*(1.-smoothstep(.7,1.,edge.y))*(1.-smoothstep(cameraPosition.y-moteEye.x,cameraPosition.y-moteEye.y,world.y))
      *smoothstep(near,near+moteFar-moteNear,-head.z)*(1.-smoothstep(7.5,12.,dist))*moteAlpha;
     if(tail.z>-.05)tail=mix(head,tail,clamp((-.05-head.z)/(tail.z-head.z),0.,1.));
     vec4 ch=projectionMatrix*head,ct=projectionMatrix*tail;
     vec2 screen=moteViewport*.5,sh=ch.xy/ch.w*screen,st=ct.xy/ct.w*screen,dir=st-sh;float len=length(dir),scale=moteViewport.y/1080.;
     dir=len>.001?dir/len:vec2(1.,0.);
     // A speck right by the lens is a short dash, never a line across the picture; a fleck always a short streak.
     if(len>56.*scale){len=56.*scale;st=sh+dir*len;}
     if(tint.w>.5&&len<5.*scale){len=5.*scale;st=sh+dir*len;}
     // Nearer specks are a little fatter; a hairline would only shimmer (and read as a scratch).
     float width=max(1.8,look.x*scale*clamp(3.2/dist,.8,1.4));
     // A streak spreads the same dust over its length: the longer, the fainter (but never lost in the asphalt's grain).
     a*=look.y*clamp(4.*width/(len+width),.7,1.);
     vec2 pixel=mix(sh,st,position.x)+vec2(-dir.y,dir.x)*position.y*width+dir*(position.x*2.-1.)*width;
     vec4 clip=mix(ch,ct,position.x);
     vAlpha=a;vQuad=position.xy;vTint=tint.rgb;
     gl_Position=head.z<-.05&&a>.003?vec4(pixel/screen*clip.w,clip.z,clip.w):vec4(2.,2.,2.,1.);
    }`,
   // A dense head and a tail that thins out behind it.
   // effectLight: the weather's light on them (weather.js), so specks do not glow at night.
   fragmentShader:`varying float vAlpha;varying vec2 vQuad;varying vec3 vTint;uniform float effectLight;
    void main(){float across=1.-vQuad.y*vQuad.y,a=vAlpha*across*across*mix(1.,.3,smoothstep(0.,1.,vQuad.x));if(a<.002)discard;gl_FragColor=vec4(vTint*effectLight,a);}`});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.name='Ar_em_movimento';this.mesh.frustumCulled=false;this.mesh.renderOrder=3;this.mesh.visible=false;
  // Only the picture on screen (cinematic.js marks its HDR target isMainView): mirrors and
  // reflection probes would wrap the box round the wrong camera.
  this.mesh.onBeforeRender=renderer=>{const target=renderer.getRenderTarget();this.uniforms.moteAlpha.value=target&&!target.isMainView?0:this.alpha;};
  this.alpha=1;this.velocity=new THREE.Vector3();this.last=new THREE.Vector3();this.hasLast=false;this.forward=new THREE.Vector3();this.centre=[0,0,0];this.at=[0,0,0];this.ahead=[0,0,0];this.count=0;
 }
 setCount(n){this.count=Math.max(0,Math.min(this.capacity,Math.round(n)));this.geometry.instanceCount=this.count;this.mesh.visible=this.count>0;}
 // dt 0 (paused) freezes the breeze and the streaks; the box keeps following a camera that moves.
 // ground: the height of the ground under the camera (world y).
 update(dt,camera,{inside=false,viewport,ground}={}){
  if(!this.count)return;
  const u=this.uniforms,p=camera.position;
  if(viewport)u.moteViewport.value.set(viewport[0],viewport[1]);
  // From inside the car the specks start past the bonnet and the windscreen.
  u.moteNear.value=inside?2.4:1.4;u.moteFar.value=inside?5:4;
  camera.getWorldDirection(this.forward);
  u.moteCentre.value.fromArray(moteCentre(p.toArray(this.at),this.forward.toArray(this.ahead),ground,this.centre));
  if(dt>0){
   u.moteTime.value+=dt;u.moteDrift.value.x+=WIND[0]*dt;u.moteDrift.value.z+=WIND[2]*dt;
   // Wrapped so the shader's float maths stays exact after hours of breeze.
   for(const k of ['x','z'])u.moteDrift.value[k]%=MOTE_BOX[k==='x'?0:2]*64;
   // The camera's own speed: a cut or a teleport (more than 8 m in a frame) is not a speed.
   if(this.hasLast&&p.distanceTo(this.last)<8){const k=1-Math.exp(-dt*12);this.velocity.x+=((p.x-this.last.x)/dt-this.velocity.x)*k;this.velocity.y+=((p.y-this.last.y)/dt-this.velocity.y)*k;this.velocity.z+=((p.z-this.last.z)/dt-this.velocity.z)*k;}
   this.last.copy(p);this.hasLast=true;
   const s=u.moteStreak.value.set(this.velocity.x-WIND[0],this.velocity.y,this.velocity.z-WIND[2]).multiplyScalar(EXPOSURE);if(s.length()>MAX_STREAK)s.setLength(MAX_STREAK);
  }
 }
 info(){return {count:this.count,visible:this.mesh.visible,streak:+this.uniforms.moteStreak.value.length().toFixed(3),speed:+this.velocity.length().toFixed(2),floor:+(this.uniforms.moteCentre.value.y-MOTE_BOX[1]/2).toFixed(2)};}
 dispose(){this.geometry.dispose();this.material.dispose();}
}

// The cars that push the verge grass: up to six nearest the camera, moving, within reach. The list and its
// entries are reused frame to frame (read it before the next call): nothing allocated per frame.
const wakeNear=[],wakePool=[],wakeOut=[],NONE=Object.freeze([]),byDistance=(a,b)=>a.d-b.d;
export function wakeCars(cars,camera,reach=150,max=6){
 const x=camera.position.x,z=camera.position.z;wakeNear.length=wakeOut.length=0;
 for(const c of cars){if(!c||Math.hypot(c.vx,c.vy)<3)continue;const d=Math.hypot(c.x-x,-c.y-z);if(d>=reach)continue;
  const e=wakePool[wakeNear.length]??(wakePool[wakeNear.length]={d:0,c:null});e.d=d;e.c=c;wakeNear.push(e);}
 // Slots left over from a fuller frame let go of their cars (an old circuit's, with its track data, after a reload).
 for(let i=wakeNear.length;i<wakePool.length&&wakePool[i].c;i++)wakePool[i].c=null;
 wakeNear.sort(byDistance);for(let i=0;i<Math.min(max,wakeNear.length);i++)wakeOut.push(wakeNear[i].c);
 return wakeOut;
}
// A new circuit (main.js loadCircuit): the pool forgets the old cars even where the wake is off.
export function releaseWakeCars(){wakeNear.length=wakeOut.length=0;for(const e of wakePool)e.c=null;}

// Built with each circuit (main.js loadCircuit, before the load-time compile). smoke: the shared
// TyreSmoke pool (rival dust and grit go in its second ring, no extra draw).
export function createSpeedEffects({smoke=null,level='off'}={}){
 const root=new THREE.Group();root.name='Sensacao_de_velocidade';
 const motes=new AirMotes();root.add(motes.mesh);
 let value=level,wake=0,groundIndex=null;
 // The ground under the camera, from the camera's own last station (a short search), or the whole lap when
 // it jumps (TV towers, a watched rival far from the player's car, the opening shots): the player's
 // station as the hint gave the road beside that car, specks floating in the air or gone.
 // (z, the camera's height, picks the level where the lap passes over itself: physics.js levelNearest.)
 const groundAt=(car,x,y,z)=>{
  if(groundIndex!==null){const q=car.nearest(x,y,false,groundIndex),n=car.n;if(q.i!==(groundIndex-4+n)%n&&q.i!==(groundIndex+4)%n){groundIndex=q.i;return car.sample(x,y,q.i).z;}}
  groundIndex=car.nearest(x,y,true,null,z).i;return car.sample(x,y,groundIndex).z;
 };
 const fx={root,motes,profile:speedEffects(level),
  setLevel(next){value=Object.hasOwn(SPEED_EFFECTS,next)?next:'off';fx.profile=speedEffects(value);motes.setCount(fx.profile.motes);if(smoke)smoke.debris=fx.profile.debris;},
  // cars: the player's TestCar first, then the rivals'. landscape: for the verge grass.
  update(dt,camera,{cars=[],landscape=null,inside=false,viewport}={}){
   const player=cars[0],ground=motes.count&&player?.sample?groundAt(player,camera.position.x,-camera.position.z,camera.position.y):undefined;
   motes.update(dt,camera,{inside,viewport,ground});
   if(smoke&&fx.profile.rivalDust&&dt>0)for(let i=1;i<cars.length;i++){const c=cars[i];if(c&&Math.hypot(c.x-camera.position.x,-c.y-camera.position.z)<170)smoke.rival(c,dt);}
   const pushing=fx.profile.grassWake?wakeCars(cars,camera):NONE;wake=pushing.length;landscape?.setCars?.(pushing);
  },
  // For carAudio.updateScene: the kerb rumble of the car heard (null: a rival's, not felt) and
  // whether the wind's hiss rises with speed.
  sound(car){return {kerb:car?kerbSound(car):null,windSweep:fx.profile.windSweep};},
  info(){return {level:value,...fx.profile,motes:motes.info(),wakeCars:wake,drawCalls:motes.mesh.visible?1:0};},
  dispose(){motes.dispose();}};
 fx.setLevel(level);
 return fx;
}
