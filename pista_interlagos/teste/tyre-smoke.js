import * as THREE from 'three';
import {EFFECT_LIGHT} from './weather.js';
import {SUSPENSION_WHEELS} from './physics.js';
import {surfaceKind,KERB_WIDTH} from './kerb-contact.js';

// A bounded, single-draw-call cloud. Particles stay in world space behind the car.
// Rubber smoke on asphalt; dust when the tyres run on grass or dirt. Kerbs and paved run-offs (soft():
// the orthophoto's paving, main.js) are asphalt: they smoke like it and never throw dirt.
// A second ring (extra) holds the 'Sensação de velocidade' particles (speed-particles.js): the
// rivals' dust and the grit and grass kicked up at the verge, so they never eat the player's smoke.
// Bits live a moment (BIT_LIFE s), fade before they reach the lens and never grow past BIT_PIXELS.
export const BIT_LIFE=[.22,.38],BIT_PIXELS=12;
// A wheel riding a painted kerb at speed (kerbGrit, Sensação de velocidade Média and up) scuffs up a faint puff of
// grit: from KERB_GRIT.from m/s, at most KERB_GRIT.rate puffs a second a wheel, thin (strength) and short-lived, and
// now and then a speck of grit (bits). Never off a run-off or the grass (that is dirt, and raises its own cloud).
export const KERB_GRIT=Object.freeze({from:12,full:34,rate:9,strength:.2,life:[.45,.75],size:.16,bits:.3,wet:.3});
export class TyreSmoke {
 constructor(capacity=256,extra=256){
  this.capacity=capacity;this.extra=extra;this.cursor=0;this.extraCursor=0;this.total=0;this.extraTotal=0;this.emit=[0,0,0,0];this.grit=[0,0,0,0];this.kerb=[0,0,0,0];this.debris=false;this.kerbGrit=false;
  // The track's wetness (weather.js, main.js applyWeather): a wet kerb throws no grit.
  this.wet=0;
  // soft(x,y): whether the ground off the track there throws dust (null: everywhere off it).
  this.soft=null;
  const size=capacity+extra;this.size=size;
  this.particles=Array.from({length:size},()=>({age:9,life:1}));
  this.geometry=new THREE.BufferGeometry();
  for(const [name,n] of [['position',3],['puff',2],['dust',1]])this.geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(size*n),n).setUsage(THREE.DynamicDrawUsage));
  // Players could not see the road once the car sat in its own cloud (a spin, a slide on the
  // grass): a puff whose nearest edge comes within a few metres of the camera fades away, and
  // one puff never hides more than a third of what is behind it. The cloud still reads from
  // outside, a car length away; the cockpit and the chase camera look through it.
  // dust: 0 rubber smoke, 1 dirt (.28 an engine plume), 2..3 grit and grass bits (tint and shape in the
  // fraction: under .6 a tumbling grass blade, above it a speck of grit).
  // Drawn over the picture, the HDR target's alpha (cinematic.js occlusion mask) left as it is.
  this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,
   uniforms:{viewport:{value:900},clearNear:{value:1.2},clearFar:{value:5.5},maxOpacity:{value:.32},effectLight:EFFECT_LIGHT},
   vertexShader:`attribute vec2 puff;attribute float dust;uniform float viewport,clearNear,clearFar,maxOpacity;varying float opacity,vDust,vTurn;
    void main(){vec4 p=modelViewMatrix*vec4(position,1.);vDust=dust;vTurn=dot(position,vec3(2.3,3.1,1.7));
     bool bit=dust>1.5;
     opacity=min(puff.y,bit?.95:maxOpacity)*smoothstep(clearNear,clearFar,-p.z-puff.x)*(bit?smoothstep(1.6,3.6,-p.z):1.);
     gl_Position=projectionMatrix*p;gl_PointSize=opacity<.003?0.:clamp(puff.x*viewport*projectionMatrix[1][1]/max(.2,-p.z),1.,bit?${BIT_PIXELS.toFixed(1)}*viewport/1080.:256.);
     // Depth taken from the puff's near side: the ground just in front of a low cloud no longer
     // cuts it along a straight line.
     vec4 front=projectionMatrix*vec4(p.xy,p.z+min(puff.x*.4,-p.z*.5),1.);gl_Position.z=front.z/front.w*gl_Position.w;}`,
   // effectLight: the weather's light (weather.js); smoke has no lights of its own and would glow at night.
   fragmentShader:`varying float opacity,vDust,vTurn;uniform float effectLight;
    void main(){if(opacity<.003)discard;vec2 p=gl_PointCoord*2.-1.;float r=length(p);
     if(vDust>1.5){
      // A thin blade tapering to its tip, turned as it tumbles; grit a small dark speck.
      float g=vDust-2.,c=cos(vTurn),s=sin(vTurn);vec2 q=vec2(c*p.x+s*p.y,c*p.y-s*p.x);
      float shape=g<.6?(1.-smoothstep(.75,.95,abs(q.x)))*(1.-smoothstep(.55,1.,abs(q.y)/max(.02,.2*(1.-.75*abs(q.x))))):1.-smoothstep(.3,.5,r);
      float a=opacity*shape;if(a<.003)discard;gl_FragColor=vec4((g<.6?mix(vec3(.13,.17,.06),vec3(.25,.26,.11),g/.6):vec3(.24,.2,.14))*effectLight,a);return;}
     float cloud=.83+.12*sin(p.x*11.+sin(p.y*8.))+.05*sin(p.y*21.+p.x*7.);
     float a=opacity*pow(max(0.,1.-r*r),2.)*cloud;
     // Dust is a dull grey-brown, not the sunny tan that glowed round the car in the bloom.
     if(a<.003)discard;gl_FragColor=vec4(mix(vec3(.76+.12*(1.-r)),vec3(.4,.36,.3)*(.85+.2*(1.-r)),vDust)*effectLight,a);}`});
  this.mesh=new THREE.Points(this.geometry,this.material);this.mesh.name='Fumaca_dos_pneus';this.mesh.frustumCulled=false;this.mesh.renderOrder=2;
 }
 // How close to the camera a puff starts to clear (clearView in main.js follows the camera):
 // from inside the car the whole cloud around it clears, from the chase camera a car length.
 clearView(near,far){this.material.uniforms.clearNear.value=near;this.material.uniforms.clearFar.value=far;}
 reset(){for(const p of this.particles)p.age=p.life;this.emit.fill(0);this.grit.fill(0);this.geometry.attributes.puff.array.fill(0);this.geometry.attributes.puff.needsUpdate=true;}
 // The next particle of the player's ring, or of the speed-effects ring (extra).
 next(extra=false){
  if(extra&&this.extra){const q=this.particles[this.capacity+this.extraCursor];this.extraCursor=(this.extraCursor+1)%this.extra;this.extraTotal++;q.kerb=false;return q;}
  const q=this.particles[this.cursor];this.cursor=(this.cursor+1)%this.capacity;this.total++;return q;
 }
 // Grit and grass bits flung from a wheel running at the verge: thrown up and out, gone a moment later.
 kick(x,y,z,car,out,count){
  for(let k=0;k<count;k++){
   const q=this.next(true),speed=.6+Math.random()*1.6;
   Object.assign(q,{x:x+(Math.random()-.5)*.25,y:z+.06,z:-y+(Math.random()-.5)*.25,vx:car.vx*.22+out[0]*speed+(Math.random()-.5)*.8,vy:1.1+Math.random()*1.6,vz:-car.vy*.22-out[1]*speed+(Math.random()-.5)*.8,
    age:0,life:BIT_LIFE[0]+Math.random()*(BIT_LIFE[1]-BIT_LIFE[0]),size:.03+Math.random()*.03,strength:1,dust:2+Math.random()*.95,floor:z+.02});
  }
 }
 // Whether a wheel's contact throws dirt: off the track and the kerbs, on ground that is not paved.
 soil(kind,x,y){return kind==='dirt'&&(!this.soft||this.soft(x,y));}
 // Dirt dust from one wheel (player or rival), into the given ring.
 puffDust(x,y,z,car,intensity,extra,size=.45){
  const q=this.next(extra);
  Object.assign(q,{x:x+(Math.random()-.5)*.18,y:z+.10,z:-y+(Math.random()-.5)*.18,
   vx:car.vx*.08+(Math.random()-.5)*.4,vy:.18+Math.random()*.16,vz:-car.vy*.08+(Math.random()-.5)*.4,
   age:0,life:1.9+Math.random()*.8,size:size+Math.random()*.18,strength:intensity*.8,dust:1,floor:z});
 }
 update(car,wheels,dt,viewport){
  this.material.uniforms.viewport.value=viewport;
  if(dt<=0)return;
  const c=Math.cos(car.heading),s=Math.sin(car.heading),speed=Math.hypot(car.vx,car.vy);
  for(let i=0;i<wheels.length;i++){
   const w=wheels[i],x=car.x+c*w.x-s*w.y,y=car.y+s*w.x+c*w.y,p=car.sample(x,y,car.index),kind=surfaceKind(car.data,p),soil=this.soil(kind,x,y),paved=!soil;
   // Under water (LakeContact sets car.wet) there is no dust: the lake throws spray instead.
   const down=!car.wheelLoad||car.wheelLoad[i]>0,scraping=!!car.hullContact&&!paved&&speed>3&&!(car.wetHull>.02),dust=!paved&&!(car.wet?.[i]>.01)&&(speed>4&&down||scraping);
   // Tyres throw dust only while touching the ground; a body sliding over soil raises its own cloud.
   const intensity=!down&&!scraping?0:dust?Math.max(down?Math.min(.75,(speed-4)/22)*(w.front?.45:1):0,scraping?Math.min(.9,speed/15):0):paved?Math.max(0,w.strength-.12):0;
   this.emit[i]+=intensity*(dust?20:32)*dt;
   while(this.emit[i]>=1){
    this.emit[i]--;
    if(dust){this.puffDust(x,y,p.z,car,intensity,false);continue;}
    const q=this.next();
    Object.assign(q,{x:x+(Math.random()-.5)*.18,y:p.z+.10,z:-y+(Math.random()-.5)*.18,
     vx:car.vx*.08+(Math.random()-.5)*.4,vy:.35+Math.random()*.25,vz:-car.vy*.08+(Math.random()-.5)*.4,
     age:0,life:2+Math.random()*1.1,size:.28+Math.random()*.18,strength:intensity,dust:0});
   }
   if(this.debris&&down&&!(car.wet?.[i]>.01))this.gritFrom(i,this.grit,x,y,p,soil,speed,car,w.y>0?1:-1,dt);
   if(kind==='kerb'&&down)this.kerbFrom(i,this.kerb,x,y,p.z,speed,car,dt);
  }
  this.age(dt);
 }
 // A faint scuff of grit off a painted kerb (kerbGrit): thin grey puffs and a speck now and then, in the second ring.
 // Fading out as the track gets wet (none from KERB_GRIT.wet: a drizzle's .55 and the rain's 1 lay the dust).
 // (q.kerb: the player's own wheels' scuff, for the checks: interlagos.speedInfo().particles.kerb)
 kerbFrom(i,emit,x,y,z,speed,car,dt){
  if(!this.kerbGrit||car.wet?.[i]>.01||this.wet>=KERB_GRIT.wet)return;
  const share=Math.min(1,Math.max(0,(speed-KERB_GRIT.from)/(KERB_GRIT.full-KERB_GRIT.from)))*(1-this.wet/KERB_GRIT.wet);if(share<=0)return;
  emit[i]+=share*KERB_GRIT.rate*dt;
  while(emit[i]>=1){
   emit[i]--;const q=this.next(true),bit=Math.random()<KERB_GRIT.bits;q.kerb=emit===this.kerb;
   // (a bit: a speck of grit, never a grass blade, flicked up behind the tyre)
   Object.assign(q,bit?{x:x+(Math.random()-.5)*.2,y:z+.05,z:-y+(Math.random()-.5)*.2,vx:car.vx*.2+(Math.random()-.5)*.8,vy:.6+Math.random()*1.1,vz:-car.vy*.2+(Math.random()-.5)*.8,
     age:0,life:BIT_LIFE[0]+Math.random()*(BIT_LIFE[1]-BIT_LIFE[0]),size:.025+Math.random()*.02,strength:.8,dust:2.7+Math.random()*.25,floor:z+.02}
    :{x:x+(Math.random()-.5)*.2,y:z+.05,z:-y+(Math.random()-.5)*.2,vx:car.vx*.12+(Math.random()-.5)*.5,vy:.1+Math.random()*.15,vz:-car.vy*.12+(Math.random()-.5)*.5,
     age:0,life:KERB_GRIT.life[0]+Math.random()*(KERB_GRIT.life[1]-KERB_GRIT.life[0]),size:KERB_GRIT.size+Math.random()*.08,strength:KERB_GRIT.strength*(.6+.4*share),dust:1,floor:z});
  }
 }
 // At the verge at speed (speedEffects 'completa'): a wheel on the grass or soil beside the track (never a
 // kerb, the asphalt or a paved run-off) flings a few bits outward.
 gritFrom(i,emit,x,y,p,soil,speed,car,side,dt){
  const outside=Math.abs(p.d)-p.width/2,rate=soil&&outside<KERB_WIDTH+3?Math.min(1,(speed-14)/26)*16:0;
  if(rate<=0)return;emit[i]+=rate*dt;
  const n=Math.floor(emit[i]);if(!n)return;emit[i]-=n;
  // Away from the track: the car's left on the left side of the road.
  const away=Math.sign(p.d)||side,out=[p.lx*away,p.ly*away];
  this.kick(x,y,p.z,car,out,n);
 }
 // A rival's dust (speedEffects 'media' and up), only near the track's edge: each wheel sampled as the
 // player's are (TestCar.sample from the car's station), so the surveyed pit lane counts as paved.
 rival(car,dt){
  const p=car.surface,speed=Math.hypot(car.vx,car.vy);
  if(!p||!car.data||dt<=0||speed<4||p.pit||Math.abs(p.d)<p.width/2-1.3)return;
  const c=Math.cos(car.heading),s=Math.sin(car.heading),emit=car.dustEmit??=[0,0,0,0],grit=car.gritEmit??=[0,0,0,0];
  SUSPENSION_WHEELS.forEach((w,k)=>{
   if(car.wheelLoad&&!(car.wheelLoad[k]>0)||car.wet?.[k]>.01)return;
   const ox=c*w.x-s*w.y,oy=s*w.x+c*w.y,wheel=car.sample(car.x+ox,car.y+oy,car.index),kind=surfaceKind(car.data,wheel),soil=this.soil(kind,car.x+ox,car.y+oy);
   if(kind==='kerb')this.kerbFrom(k,car.kerbEmit??=[0,0,0,0],car.x+ox,car.y+oy,wheel.z,speed,car,dt);
   if(soil){
    const intensity=Math.min(.75,(speed-4)/22)*(w.front?.45:1);emit[k]+=intensity*22*dt;
    // Seen from further away than the player's own: bigger, thicker puffs.
    while(emit[k]>=1){emit[k]--;this.puffDust(car.x+ox,car.y+oy,wheel.z,car,Math.min(1,intensity*1.25),true,.85);}
   }
   if(this.debris)this.gritFrom(k,grit,car.x+ox,car.y+oy,wheel,soil,speed,car,w.y>0?1:-1,dt);
  });
 }
 age(dt){
  const {position,puff,dust}=this.geometry.attributes;let live=0;
  for(let i=0;i<this.size;i++){
   const p=this.particles[i];p.age+=dt;
   if(p.age>=p.life){puff.setXY(i,0,0);continue;}
   dust.setX(i,p.dust??0);live++;
   if(p.dust>=2){
    // Bits are heavy and small: a short arc, shrinking and fading as they drop back into the grass.
    p.vy-=9.8*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    if(p.y<p.floor){p.y=p.floor;p.vx=p.vy=p.vz=0;}
    const t=p.age/p.life;position.setXYZ(i,p.x,p.y,p.z);puff.setXY(i,p.size*(1-.4*t),p.strength*.9*(1-t*t));continue;
   }
   // Dust is heavy: it slows, stops rising and settles instead of hanging over the track.
   if(p.dust){const drag=Math.exp(-dt*1.6);p.vx*=drag;p.vz*=drag;p.vy*=drag;}
   p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   const t=p.age/p.life,size=p.size+p.age*(p.dust?.6:.75);
   // A growing dirt cloud stays on the ground, not half under it.
   position.setXYZ(i,p.x,p.dust===1?Math.max(p.y,p.floor+size*.36):p.y,p.z);puff.setXY(i,size,p.strength*.5*Math.min(1,t*12)*(1-t));
  }
  // Nothing in the air now nor last frame: no upload (most of a clean lap).
  if(live||this.live)position.needsUpdate=puff.needsUpdate=dust.needsUpdate=true;
  this.live=live;
 }
 // Engine smoke of a broken-down rival (race-field.js breakdowns): grey puffs from under the bonnet
 // that spread low and drift off with the breeze (a touch of the dust tint and its drag). rate: puffs per second.
 plume(car,dt,rate=8){
  const c=Math.cos(car.heading),s=Math.sin(car.heading),x=car.x+c*1.5,y=car.y+s*1.5;car.plumeEmit=(car.plumeEmit??0)+rate*dt;
  while(car.plumeEmit>=1){
   car.plumeEmit--;const q=this.next();
   Object.assign(q,{x:x+(Math.random()-.5)*.6,y:(car.z??car.surface.z)+.85,z:-y+(Math.random()-.5)*.6,vx:car.vx*.4+.9+(Math.random()-.5)*.5,vy:.8+Math.random()*.5,vz:-car.vy*.4+.5+(Math.random()-.5)*.5,
    age:0,life:2.2+Math.random(),size:.5+Math.random()*.25,strength:.8,dust:.28});
  }
 }
 // active: the player's ring (tyre smoke, dirt, plumes); speedFx: the rivals' dust and the bits.
 info(){
  const live=p=>p.age<p.life,main=this.particles.slice(0,this.capacity),extra=this.particles.slice(this.capacity);
  return {active:main.filter(live).length,total:this.total,capacity:this.capacity,drawCalls:1,
   speedFx:{active:extra.filter(live).length,dust:extra.filter(p=>live(p)&&p.dust===1).length,bits:extra.filter(p=>live(p)&&p.dust>=2).length,kerb:extra.filter(p=>live(p)&&p.kerb).length,total:this.extraTotal,capacity:this.extra}};
 }
 dispose(){this.geometry.dispose();this.material.dispose();}
}
