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
// (track-surface.js setMotion, main.js runFrame): on Leve too (Baixo's only road cue, no extra pass).
// kerbGrit: a faint puff of grit off the painted kerbs under a wheel at speed (tyre-smoke.js, its second ring).
// motes: Médio's few are all dark ones (MOTE_DARK); its road smear already sells the speed.
export const SPEED_EFFECTS=Object.freeze({
 off:Object.freeze({motes:0,windSweep:false,kerbBuzz:false,rivalDust:false,debris:false,grassWake:false,roadSmear:false,roadStreak:0,kerbGrit:false}),
 leve:Object.freeze({motes:0,windSweep:true,kerbBuzz:true,rivalDust:false,debris:false,grassWake:false,roadSmear:false,roadStreak:.45,kerbGrit:false}),
 media:Object.freeze({motes:24,windSweep:true,kerbBuzz:true,rivalDust:true,debris:false,grassWake:false,roadSmear:true,roadStreak:.6,kerbGrit:true}),
 completa:Object.freeze({motes:120,windSweep:true,kerbBuzz:true,rivalDust:true,debris:true,grassWake:true,roadSmear:true,roadStreak:1,kerbGrit:true})
});
export const speedEffects=value=>SPEED_EFFECTS[Object.hasOwn(SPEED_EFFECTS,value)?value:'off'];
export const MOTE_CAPACITY=400;
// The specks fill a box (world metres) that wraps round a point ahead of the camera: everything
// leaving one face comes back at the opposite one, faded out near every face so nothing pops.
// It sits on the ground under the camera, MOTE_FLOOR up, and no taller than a person: the dust hangs
// low over the road and the verges, and every speck fades out before it reaches the eye's height
// (MOTE_EYE under it), so it streams past against the ground and never across the sky (a speck below
// the eye always lands below the horizon, whatever the view's pitch). Wide enough to reach both verges of a wide
// straight (the specks hang there, not on the clean asphalt), drawn out to MOTE_REACH metres from the lens.
export const MOTE_BOX=Object.freeze([36,1.6,36]),MOTE_AHEAD=8,MOTE_FLOOR=.08,MOTE_EYE=[.5,.15],MOTE_REACH=Object.freeze([11,17]);
// Dust, not paint: a mid grey-brown, a dark brown and, rarely (MOTE_MIX), a pale sunlit tan (linear colour, drawn
// over the picture, not added light). Front-lit the mid one is no brighter than sunlit asphalt, a shade under the
// sunlit grass it mostly hangs over (the pale tan was white dashes on the road, a broken lane line); the sun behind
// the speck leaves only the sky's share (MOTE_SHADE): a backlit speck is a dark fleck, never a glow. The first
// MOTE_DARK specks are always dark (Médio draws those).
export const MOTE_TINTS=Object.freeze([[.14,.125,.105],[.07,.06,.05],[.3,.27,.225]]),MOTE_MIX=Object.freeze([.74,.18,.08]),MOTE_DARK=30,MOTE_SHADE=.36;
// Coverage of a speck (thin dust over the picture) and its streak's length against the camera's (no two dashes alike).
export const MOTE_COVER=Object.freeze([.15,.35]),MOTE_LENGTH=Object.freeze([.4,1.5]);
// One speck in twenty is a bigger fleck of chaff: it starts further from the lens and always draws a short
// streak, never a round blot.
export const MOTE_BIG=.05,MOTE_BIG_NEAR=1.8;
// Clean asphalt stays nearly empty (the asphalt's own streak is the cue there): only this share of the specks
// drifts over it; the rest hang over the verges, the kerbs and the grass. The followed car's wheels on the dirt
// (kerb-contact.js kerbDirt) fill the road round it, up to MOTE_DIRT_KEEP of them within MOTE_DIRT_REACH m.
export const MOTE_ROAD_KEEP=.07,MOTE_DIRT_KEEP=.55,MOTE_DIRT_REACH=[4,9];
// Faded out as they near the lens (from near, fully there at far, metres, chase and close; inside the car further
// out) and as they near the ground behind them along the view (MOTE_GAP m: a speck lying on the asphalt or a verge
// reads as paint, not as dust in the air).
export const MOTE_NEAR=Object.freeze({outside:[2,4.5],inside:[2.4,5]}),MOTE_GAP=Object.freeze([.25,.75]);
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
// The road round station i, in three.js x/z, as the shader reads it: a point on the centre line, its unit direction,
// the half width, the bend k (1/m) and its change kk (1/m²) that bow the line toward n=(-dz,dx) by
// along²·(k/2+kk·along/6), through the stations about twelve metres either side (good across the box's ±17 m).
// The fit holds near the camera and on gentle bends (every circuit's survey: within a third of a metre on 99% of the
// points where it is trusted): MOTE_TRUST, from/to metres along and from/to |k|·along (the bend's turn so far), past
// which a speck the fit sorts (folded off the asphalt, or kept just past its edge) fades out instead of landing on it.
export const MOTE_TRUST=Object.freeze({along:[12,16],turn:[.2,.4]});
// (scalar maths: called every frame, it allocates nothing)
export function moteRoadFrame(samples,i,out={cx:0,cz:0,dx:1,dz:0,half:6,k:0,kk:0}){
 const n=samples.length,p=samples[((i%n)+n)%n],m=6,dl=Math.hypot(p[7],p[8])||1;
 out.cx=p[1];out.cz=-p[2];out.dx=p[7]/dl;out.dz=-p[8]/dl;out.half=p[4]/2;
 // Solved for the two stations: lat = a²k/2 + a³kk/6 ahead (a>0) and behind (b<0).
 const q=samples[(((i+m)%n)+n)%n],r=samples[(((i-m)%n)+n)%n],qx=q[1]-out.cx,qz=-q[2]-out.cz,rx=r[1]-out.cx,rz=-r[2]-out.cz;
 const a=qx*out.dx+qz*out.dz,la=-qx*out.dz+qz*out.dx,b=rx*out.dx+rz*out.dz,lb=-rx*out.dz+rz*out.dx,det=a*a*b*b*(b-a)/12;
 if(Math.abs(det)>1e-6){out.k=(la*b*b*b-lb*a*a*a)/6/det;out.kk=(lb*a*a-la*b*b)/2/det;}else out.k=out.kk=0;
 return out;
}
// How much the shader trusts the fit at a point (1 near the camera on a straight, 0 far along a tight bend).
const smooth01=(e0,e1,x)=>{const t=Math.min(1,Math.max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t);};
export function moteTrust(x,z,f){const along=Math.abs((x-f.cx)*f.dx+(z-f.cz)*f.dz);return (1-smooth01(...MOTE_TRUST.along,along))*(1-smooth01(...MOTE_TRUST.turn,Math.abs(f.k)*along));}
// The pit lane beside the road (track data's pit block, its paved band lo..hi across its centre line), round the
// station nearest a point (x, z: three.js), as the shader reads it: centre x/z, unit direction x/z, the band across
// n=(-dz,dx) and how far along it holds (straight: a lane barely bends within the specks' reach). null when the
// lane is further than `reach` metres (none on most of a lap) or the circuit has no surveyed lane.
const pitColumns=new WeakMap();
export function motePitFrame(pit,x,z,reach=40,out={cx:0,cz:0,dx:1,dz:0,lo:0,hi:0,along:0}){
 if(!pit?.samples?.length)return null;
 if(!pitColumns.has(pit))pitColumns.set(pit,Object.fromEntries(pit.columns.map((name,i)=>[name,i])));
 const c=pitColumns.get(pit),a=pit.samples;let best=Infinity,hit=-1;
 for(let i=0;i<a.length;i++){const dx=a[i][c.x]-x,dz=-a[i][c.y]-z,d=dx*dx+dz*dz;if(d<best){best=d;hit=i;}}
 if(best>reach*reach)return null;
 const p=a[hit],tl=Math.hypot(p[c.tx],p[c.ty])||1;
 out.cx=p[c.x];out.cz=-p[c.y];out.dx=p[c.tx]/tl;out.dz=-p[c.ty]/tl;
 // (the lane's own d is to its left, (lx,ly) in track data; the shader's n=(-dz,dx) is its right: the band turned over)
 out.lo=-p[c.hi];out.hi=-p[c.lo];out.along=24;return out;
}
// How far off the pit lane's paved band a point is (metres past its edge, negative on it), the shader's test.
export function motePitOff(x,z,f){const rx=x-f.cx,rz=z-f.cz,along=rx*f.dx+rz*f.dz,lat=-rx*f.dz+rz*f.dx;return Math.max(f.lo-lat,lat-f.hi,Math.abs(along)-f.along);}
// How far off the asphalt a point is (metres past the road's edge, negative on it), the shader's test.
export function moteOffRoad(x,z,f){const rx=x-f.cx,rz=z-f.cz,along=rx*f.dx+rz*f.dz,lat=-rx*f.dz+rz*f.dx;return Math.abs(lat-along*along*(f.k*.5+f.kk*along/6))-f.half;}
// Where the shader draws a speck that is not one of the few left on the asphalt: one over the road is folded out past
// the edge on its own side (the middle's furthest, up to 1.7 half widths out), so the verges hold the dust.
export function moteFold(x,z,f,out=[0,0]){
 const rx=x-f.cx,rz=z-f.cz,along=rx*f.dx+rz*f.dz,lat=-rx*f.dz+rz*f.dx-along*along*(f.k*.5+f.kk*along/6),off=Math.abs(lat)-f.half;
 if(off>=0){out[0]=x;out[1]=z;return out;}
 const shift=Math.sign(lat||1)*(f.half+.35-off*.7)-lat;out[0]=x-f.dz*shift;out[1]=z+f.dx*shift;return out;
}
function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

// One instanced draw of camera-facing streaks; the CPU only moves the box and the breeze.
export class AirMotes {
 constructor(capacity=MOTE_CAPACITY){
  const rand=random(77041),seeds=new Float32Array(capacity*3),looks=new Float32Array(capacity*4),tints=new Float32Array(capacity*4),forms=new Float32Array(capacity*2);
  for(let i=0;i<capacity;i++){
   seeds.set([rand(),rand(),rand()],i*3);
   // look: width (px at 1080p), coverage, wander phase, wander rate; tint: one of MOTE_TINTS, a little
   // brighter or darker each, w: a big fleck (MOTE_BIG); form: the streak's length factor and which of them may
   // drift over clean asphalt (under MOTE_ROAD_KEEP, or MOTE_DIRT_KEEP by a car on the dirt).
   const big=rand()<MOTE_BIG,r=rand(),base=MOTE_TINTS[i<MOTE_DARK?1:r<MOTE_MIX[0]?0:r<MOTE_MIX[0]+MOTE_MIX[1]?1:2],shade=.85+rand()*.3;
   looks.set([big?2+rand()*.6:1.6+rand()*.7,big?.3+rand()*.05:MOTE_COVER[0]+rand()*(MOTE_COVER[1]-MOTE_COVER[0]),rand(),.25+rand()*.5],i*4);tints.set([base[0]*shade,base[1]*shade,base[2]*shade,big?1:0],i*4);
   forms.set([MOTE_LENGTH[0]+rand()*(MOTE_LENGTH[1]-MOTE_LENGTH[0]),rand()],i*2);
  }
  this.geometry=new THREE.InstancedBufferGeometry();
  // x 0 at the speck, 1 at the end of its streak; y across.
  this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,-1,0,1,-1,0,1,1,0,0,1,0],3));this.geometry.setIndex([0,1,2,0,2,3]);
  this.geometry.setAttribute('seed',new THREE.InstancedBufferAttribute(seeds,3));this.geometry.setAttribute('look',new THREE.InstancedBufferAttribute(looks,4));this.geometry.setAttribute('tint',new THREE.InstancedBufferAttribute(tints,4));this.geometry.setAttribute('form',new THREE.InstancedBufferAttribute(forms,2));
  this.geometry.instanceCount=0;this.capacity=capacity;
  this.uniforms={moteCentre:{value:new THREE.Vector3()},moteBox:{value:new THREE.Vector3(...MOTE_BOX)},moteDrift:{value:new THREE.Vector3()},moteStreak:{value:new THREE.Vector3()},
   moteViewport:{value:new THREE.Vector2(1920,1080)},moteTime:{value:0},moteNear:{value:MOTE_NEAR.outside[0]},moteFar:{value:MOTE_NEAR.outside[1]},moteAlpha:{value:1},moteEye:{value:new THREE.Vector2(...MOTE_EYE)},effectLight:EFFECT_LIGHT,
   // The road at the camera (moteRoadFrame: centre x/z, direction x/z; half width, bend, road share, bend's change), the followed
   // car (x, z, its dirt share eased), its screen box (uv from the bottom left; zero: none) and how far its far side is.
   moteRoad:{value:new THREE.Vector4(0,0,1,0)},moteRoadShape:{value:new THREE.Vector4(-1e4,0,1,0)},moteCar:{value:new THREE.Vector3(0,0,0)},
   moteCarBox:{value:new THREE.Vector4()},moteCarFar:{value:0},moteSun:{value:new THREE.Vector3(0,1,0)},
   // The pit lane near the camera (motePitFrame: centre x/z, direction x/z; its band lo, hi, reach along; reach 0: none).
   motePit:{value:new THREE.Vector4(0,0,1,0)},motePitBand:{value:new THREE.Vector4()}};
  // Dust drawn over the picture (its own colour at its coverage), but the HDR target's alpha (its occlusion
  // mask, cinematic.js) is left as it is: no speck ever writes the mask.
  this.material=new THREE.ShaderMaterial({name:'Ar_em_movimento',transparent:true,depthWrite:false,blending:THREE.CustomBlending,
   blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,uniforms:this.uniforms,
   vertexShader:`attribute vec3 seed;attribute vec4 look,tint;attribute vec2 form;
    uniform vec3 moteCentre,moteBox,moteDrift,moteStreak,moteCar,moteSun;uniform vec2 moteViewport,moteEye;uniform vec4 moteRoad,moteRoadShape,moteCarBox,motePit,motePitBand;uniform float moteTime,moteNear,moteFar,moteAlpha,moteCarFar;
    varying float vAlpha;varying vec2 vQuad;varying vec3 vTint;
    float inBox(vec4 c){vec2 p=c.xy/c.w*.5+.5,e=min(p-moteCarBox.xy,moteCarBox.zw-p);return c.w>0.?step(0.,min(e.x,e.y)):1.;}
    void main(){
     float t=moteTime*look.w+look.z*6.2832;
     // A slow wander of its own on top of the breeze, so the specks never move as one sheet.
     vec3 wander=vec3(sin(t),sin(t*1.37+1.7)*.4,cos(t*.83+.4))*.45;
     vec3 local=mod(seed*moteBox+moteDrift+wander-moteCentre+moteBox*.5,moteBox)-moteBox*.5;
     vec3 world=moteCentre+local,edge=abs(local)/(moteBox*.5);
     // Faded at the box's faces (no popping: the top and the floor to nothing too, on a climb the whole
     // lattice crosses them) and below the eye (never against the sky).
     float a=(1.-smoothstep(.62,1.,max(edge.x,edge.z)))*(1.-smoothstep(.7,1.,edge.y))*(1.-smoothstep(cameraPosition.y-moteEye.x,cameraPosition.y-moteEye.y,world.y))*moteAlpha;
     // Over the verges, the kerbs and the grass; on clean asphalt only a few (more round a car on the dirt): the rest of
     // the road's specks are folded out past its edge (the middle's furthest), faded where the fold changes sides.
     vec2 rel=world.xz-moteRoad.xy,nrm=vec2(-moteRoad.w,moteRoad.z);float along=dot(rel,moteRoad.zw),lat=dot(rel,nrm)-along*along*(moteRoadShape.y*.5+moteRoadShape.w*along/6.),off=abs(lat)-moteRoadShape.x;
     float keep=moteRoadShape.z+moteCar.z*(1.-smoothstep(${MOTE_DIRT_REACH[0].toFixed(1)},${MOTE_DIRT_REACH[1].toFixed(1)},distance(world.xz,moteCar.xy)));
     if(form.y>keep){
      // Where the fit is unsure (MOTE_TRUST: far along, round a tight bend) a speck it sorts fades out, unless it hangs
      // well out over the verge; the pit lane's paving is road too (motePitBand.z: its reach along, 0 away from it).
      float trust=(1.-smoothstep(${MOTE_TRUST.along[0].toFixed(1)},${MOTE_TRUST.along[1].toFixed(1)},abs(along)))*(1.-smoothstep(${MOTE_TRUST.turn[0].toFixed(2)},${MOTE_TRUST.turn[1].toFixed(2)},abs(moteRoadShape.y*along)));
      if(off<0.){world.xz+=nrm*(sign(lat)*(moteRoadShape.x+.35-off*.7)-lat);a*=smoothstep(0.,.6,abs(lat))*smoothstep(0.,.35,-off)*trust;}
      else a*=max(trust,smoothstep(1.,3.,off));
      if(motePitBand.z>0.){vec2 pr=world.xz-motePit.xy;float pl=dot(pr,vec2(-motePit.w,motePit.z));a*=smoothstep(0.,.35,max(max(motePitBand.x-pl,pl-motePitBand.y),abs(dot(pr,motePit.zw))-motePitBand.z));}
     }
     vec4 head=viewMatrix*vec4(world,1.),tail=viewMatrix*vec4(world+moteStreak*form.x,1.);
     float dist=length(head.xyz),near=moteNear+tint.w*${MOTE_BIG_NEAR.toFixed(2)};
     // Close to the lens (never a blot on the view; the big flecks further out) and past MOTE_REACH (clutter): gone.
     a*=smoothstep(near,near+moteFar-moteNear,-head.z)*(1.-smoothstep(${MOTE_REACH[0].toFixed(1)},${MOTE_REACH[1].toFixed(1)},dist));
     // Near the ground behind it along the view a speck reads as paint on the road: faded there (the ground under the
     // camera, the box's floor less MOTE_FLOOR).
     vec3 ray=world-cameraPosition;float ground=moteCentre.y-moteBox.y*.5-${MOTE_FLOOR.toFixed(2)};
     float gap=ray.y<-.001?(ground-cameraPosition.y)/ray.y*length(ray)-length(ray):1e3;a*=smoothstep(${MOTE_GAP[0].toFixed(2)},${MOTE_GAP[1].toFixed(2)},gap);
     if(tail.z>-.05)tail=mix(head,tail,clamp((-.05-head.z)/(tail.z-head.z),0.,1.));
     vec4 ch=projectionMatrix*head,ct=projectionMatrix*tail;
     // Never across the followed car: a speck between the lens and it, its head, tail or middle inside its box, is gone.
     if(moteCarFar>0.&&-head.z<moteCarFar)a*=1.-max(max(inBox(ch),inBox(ct)),inBox(mix(ch,ct,.5)));
     vec2 screen=moteViewport*.5,sh=ch.xy/ch.w*screen,st=ct.xy/ct.w*screen,dir=st-sh;float len=length(dir),scale=moteViewport.y/1080.,most=56.*scale*form.x;
     dir=len>.001?dir/len:vec2(1.,0.);
     // A speck right by the lens is a short dash, never a line across the picture; a fleck always a short streak.
     if(len>most){len=most;st=sh+dir*len;}
     if(tint.w>.5&&len<5.*scale){len=5.*scale;st=sh+dir*len;}
     // Nearer specks are a little fatter; a hairline would only shimmer (and read as a scratch).
     float width=max(1.8,look.x*scale*clamp(3.2/dist,.8,1.4));
     // A streak spreads the same dust over its length: the longer, the fainter.
     a*=look.y*clamp(4.*width/(len+width),.7,1.);
     vec2 pixel=mix(sh,st,position.x)+vec2(-dir.y,dir.x)*position.y*width+dir*(position.x*2.-1.)*width;
     vec4 clip=mix(ch,ct,position.x);
     // Lit as a speck of dust is (a small rough ball): its sunlit side faces the lens with the sun behind the camera, the
     // sun behind it leaves the sky's share (MOTE_SHADE) and a dark fleck, never a glow; a low or set sun lights less.
     float lit=pow(.5+.5*dot(normalize(-ray),moteSun),1.5)*smoothstep(-.05,.3,moteSun.y);
     vAlpha=a;vQuad=position.xy;vTint=tint.rgb*mix(${MOTE_SHADE.toFixed(2)},1.,lit);
     gl_Position=head.z<-.05&&a>.003?vec4(pixel/screen*clip.w,clip.z,clip.w):vec4(2.,2.,2.,1.);
    }`,
   // Thin at both ends, densest a third of the way along (no blunt dash), so no two specks draw the same mark.
   // effectLight: the weather's light on them (weather.js), so specks do not glow at night.
   fragmentShader:`varying float vAlpha;varying vec2 vQuad;varying vec3 vTint;uniform float effectLight;
    void main(){float across=1.-vQuad.y*vQuad.y,a=vAlpha*across*across*smoothstep(0.,.32,vQuad.x)*(1.-smoothstep(.42,1.,vQuad.x));if(a<.002)discard;gl_FragColor=vec4(vTint*effectLight,a);}`});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.name='Ar_em_movimento';this.mesh.frustumCulled=false;this.mesh.renderOrder=3;this.mesh.visible=false;
  // Only the picture on screen (cinematic.js marks its HDR target isMainView): mirrors and
  // reflection probes would wrap the box round the wrong camera.
  this.mesh.onBeforeRender=renderer=>{const target=renderer.getRenderTarget();this.uniforms.moteAlpha.value=target&&!target.isMainView?0:this.alpha;};
  this.alpha=1;this.velocity=new THREE.Vector3();this.last=new THREE.Vector3();this.hasLast=false;this.forward=new THREE.Vector3();this.centre=[0,0,0];this.at=[0,0,0];this.ahead=[0,0,0];this.count=0;
  this.road=null;this.pit=false;this.dirt=0;
 }
 setCount(n){this.count=Math.max(0,Math.min(this.capacity,Math.round(n)));this.geometry.instanceCount=this.count;this.mesh.visible=this.count>0;}
 // The followed car's screen box this frame ({box:[x0,y0,x1,y1] uv from the bottom left, far: metres to its far side},
 // main.js) or null (none: inside the car, a view without one).
 setCarBox(car){const u=this.uniforms;if(car){u.moteCarBox.value.fromArray(car.box);u.moteCarFar.value=car.far;}else{u.moteCarBox.value.set(0,0,0,0);u.moteCarFar.value=0;}}
 // The sun's direction in the world (toward it), for the specks' sunlit side.
 setSun(direction){this.uniforms.moteSun.value.copy(direction).normalize();}
 // dt 0 (paused) freezes the breeze and the streaks; the box keeps following a camera that moves.
 // ground: the height of the ground under the camera (world y); road: moteRoadFrame round it (null: no road, all
 // specks kept); car: the followed car ({x, z} world, dirt: its share of wheels on the dirt, 0..1); pit: motePitFrame
 // near the box (null: none).
 update(dt,camera,{inside=false,viewport,ground,road=null,car=null,pit=null}={}){
  if(!this.count)return;
  const u=this.uniforms,p=camera.position;
  if(viewport)u.moteViewport.value.set(viewport[0],viewport[1]);
  // From inside the car the specks start past the bonnet and the windscreen.
  const reach=inside?MOTE_NEAR.inside:MOTE_NEAR.outside;u.moteNear.value=reach[0];u.moteFar.value=reach[1];
  camera.getWorldDirection(this.forward);
  u.moteCentre.value.fromArray(moteCentre(p.toArray(this.at),this.forward.toArray(this.ahead),ground,this.centre));
  this.road=road;this.pit=!!pit;
  if(road){u.moteRoad.value.set(road.cx,road.cz,road.dx,road.dz);u.moteRoadShape.value.set(road.half,road.k,MOTE_ROAD_KEEP,road.kk);}else u.moteRoadShape.value.set(-1e4,0,1,0);
  if(pit){u.motePit.value.set(pit.cx,pit.cz,pit.dx,pit.dz);u.motePitBand.value.set(pit.lo,pit.hi,pit.along,0);}else u.motePitBand.value.z=0;
  if(dt>0){
   // The dirt round the followed car fills in quickly and clears over a second or two.
   const dirt=car?Math.min(1,car.dirt??0):0;this.dirt+=(dirt-this.dirt)*(1-Math.exp(-dt*(dirt>this.dirt?4:1.2)));
   u.moteTime.value+=dt;u.moteDrift.value.x+=WIND[0]*dt;u.moteDrift.value.z+=WIND[2]*dt;
   // Wrapped so the shader's float maths stays exact after hours of breeze.
   u.moteDrift.value.x%=MOTE_BOX[0]*64;u.moteDrift.value.z%=MOTE_BOX[2]*64;
   // The camera's own speed: a cut or a teleport (more than 8 m in a frame) is not a speed.
   if(this.hasLast&&p.distanceTo(this.last)<8){const k=1-Math.exp(-dt*12);this.velocity.x+=((p.x-this.last.x)/dt-this.velocity.x)*k;this.velocity.y+=((p.y-this.last.y)/dt-this.velocity.y)*k;this.velocity.z+=((p.z-this.last.z)/dt-this.velocity.z)*k;}
   this.last.copy(p);this.hasLast=true;
   const s=u.moteStreak.value.set(this.velocity.x-WIND[0],this.velocity.y,this.velocity.z-WIND[2]).multiplyScalar(EXPOSURE);if(s.length()>MAX_STREAK)s.setLength(MAX_STREAK);
  }
  u.moteCar.value.set(car?.x??0,car?.z??0,this.dirt*MOTE_DIRT_KEEP);
 }
 info(){const u=this.uniforms;return {count:this.count,visible:this.mesh.visible,streak:+u.moteStreak.value.length().toFixed(3),speed:+this.velocity.length().toFixed(2),floor:+(u.moteCentre.value.y-MOTE_BOX[1]/2).toFixed(2),
  road:this.road?{half:+this.road.half.toFixed(2),bend:+this.road.k.toFixed(4)}:null,pit:!!this.pit,dirt:+this.dirt.toFixed(2),carBox:u.moteCarFar.value>0?u.moteCarBox.value.toArray().map(v=>+v.toFixed(3)):null};}
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
 // (reused every frame: the specks' update allocates nothing)
 const road={cx:0,cz:0,dx:1,dz:0,half:6,k:0,kk:0},near={x:0,z:0,dirt:0},pitLane={cx:0,cz:0,dx:1,dz:0,lo:0,hi:0,along:0};
 const args={inside:false,viewport:null,ground:undefined,road:null,car:null,pit:null};
 const fx={root,motes,profile:speedEffects(level),
  setLevel(next){value=Object.hasOwn(SPEED_EFFECTS,next)?next:'off';fx.profile=speedEffects(value);motes.setCount(fx.profile.motes);if(smoke){smoke.debris=fx.profile.debris;smoke.kerbGrit=fx.profile.kerbGrit;}},
  // cars: the player's TestCar first, then the rivals'. landscape: for the verge grass. subject: the car the
  // camera follows (its dirt fills the road with specks round it; the player's by default).
  update(dt,camera,{cars=[],landscape=null,inside=false,viewport,subject=null}={}){
   const player=cars[0],ground=motes.count&&player?.sample?groundAt(player,camera.position.x,-camera.position.z,camera.position.y):undefined;
   const followed=subject??player;if(followed){near.x=followed.x;near.z=-followed.y;near.dirt=(followed.kerbDirt??0)*Math.min(1,Math.max(0,(Math.hypot(followed.vx,followed.vy)-4)/14));}
   args.inside=inside;args.viewport=viewport;args.ground=ground;args.road=ground!==undefined&&player?.a?moteRoadFrame(player.a,groundIndex,road):null;args.car=followed?near:null;
   args.pit=ground!==undefined?motePitFrame(player.data?.pit,camera.position.x,camera.position.z,40,pitLane):null;
   motes.update(dt,camera,args);
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
