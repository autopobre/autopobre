import * as THREE from 'three';
import {ROAD_LAMPS,ROAD_LAMPS_MAX,BEAM_GLSL} from './headlights.js';
import {EFFECT_LIGHT} from './weather.js';
import {SUSPENSION_WHEELS} from './physics.js';

// The rain (weather.js: garoa, chuva): streaks falling round the eye and the spray the cars throw up behind them.
// Both are one draw call each and light themselves: a faint share of the sky (EFFECT_LIGHT) and the cars' lamps
// (headlights.js ROAD_LAMPS: the headlights' beams, the red tail lamps), so at night the rain shows in the beams
// and a car's spray glows red behind it. Added light only (the HDR target's alpha, the film look's occlusion mask,
// is left alone).
// Drops per Gráficos level (the materials' detail): the weather's drops share of them fall.
export const RAIN_DROPS=Object.freeze({baixo:1800,medio:3200,alto:6500,ultra:9000});
// The box of rain round the eye (m), how fast drops fall (m/s, the drizzle slower and finer), the streak's shutter
// (s) and width (m), and the drift of the wind.
// eyeShutter: the share of the eye's own motion in the streak (a film camera's 1/80 s), so at speed the rain slants
// and lengthens toward the vanishing point without turning into long lines.
export const RAIN_LOOK=Object.freeze({box:[22,15,22],fall:{garoa:4.2,chuva:9.5},shutter:{garoa:.05,chuva:.045},eyeShutter:.0125,width:{garoa:.004,chuva:.0075},
 wind:[1.1,0,.6],sky:{garoa:.3,chuva:.42},beam:.022,tail:.35});
const lampUniforms=`uniform vec4 roadLampPos[${ROAD_LAMPS_MAX}],roadLampDir[${ROAD_LAMPS_MAX}];uniform int roadLampCount;`;
// Light from the cars' lamps at a world point (the beams' shape as headlights.js beamShape; tail lamps red, near).
const lampLight=`${BEAM_GLSL}
vec3 lampsAt(vec3 p,float beam,float tail){
 vec3 sum=vec3(0.0);
 for(int i=0;i<${ROAD_LAMPS_MAX};i++){
  if(i>=roadLampCount)break;
  vec4 lp=roadLampPos[i],ld=roadLampDir[i];vec3 ray=p-lp.xyz;float d2=dot(ray,ray);if(d2>3600.0)continue;
  ray*=inversesqrt(d2);float along=dot(ray,ld.xyz);if(along<=0.0)continue;
  if(ld.w>0.0){
   vec3 upLamp=normalize(vec3(0.0,1.0,0.0)-ld.xyz*ld.y);
   float elevation=dot(ray,upLamp)/along,side=length(ray-ld.xyz*along-upLamp*dot(ray,upLamp))/along;
   // Over the axis the beam thins out fast in the air (the road's spill lights boards, not the rain far above).
   float shape=beamShape(elevation,side,.96);
   sum+=vec3(1.0,.98,.95)*lp.w*beam*shape/(d2+1.0);
  }else sum+=vec3(1.0,.05,.02)*abs(lp.w)*tail*smoothstep(-ld.w,1.0,along)/(d2+.3);
 }
 return sum;
}`;
const rainVertex=`attribute vec4 seed;attribute vec2 corner;
uniform vec3 rainCentre,rainBox,rainWind,eyeVelocity;uniform float eyeShutter,rainTime,rainDensity,rainFall,rainShutter,rainWidth,rainSky,rainBeam,rainTail,viewport,cutCabin;
uniform mat4 cabinInverse;
${lampUniforms}
varying float vAlpha,vAcross;varying vec3 vColor;
${lampLight}
void main(){
 vAlpha=0.0;vAcross=corner.x;vColor=vec3(0.0);
 if(seed.w>rainDensity){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
 vec3 fall=vec3(0.0,-rainFall*(.8+.4*fract(seed.w*7.31)),0.0)+rainWind;
 // A lattice of drops anchored to the world, falling, wrapped round the eye: they do not ride with the camera.
 vec3 p=mod(seed.xyz*rainBox+fall*rainTime-rainCentre+rainBox*.5,rainBox)+rainCentre-rainBox*.5;
 // Not inside the player's cabin (the cockpit and bonnet views look out through the glass).
 vec3 local=(cabinInverse*vec4(p,1.0)).xyz;
 if(cutCabin>.5&&all(lessThan(abs(local-vec3(.05,.75,0.0)),vec3(2.45,.75,.98)))){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
 // The streak: where the drop was a shutter ago, as the moving eye saw it (it slants when the car is fast).
 vec3 tail=p-fall*rainShutter+eyeVelocity*eyeShutter;
 vec4 head=viewMatrix*vec4(p,1.0),back=viewMatrix*vec4(tail,1.0);
 if(head.z>-.3||back.z>-.3){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
 vec4 view=mix(head,back,corner.y);
 // The streak's way across the screen (no normalize of a zero vector: D3D turns it to NaN in either branch).
 vec2 along=back.xy/back.z-head.xy/head.z;vec2 dir=along/max(length(along),1e-5)+vec2(0.0,step(length(along),1e-5));
 float pixel=-view.z*2.0/(viewport*projectionMatrix[1][1]),width=max(rainWidth,pixel*.75);
 view.xy+=vec2(-dir.y,dir.x)*corner.x*width;
 gl_Position=projectionMatrix*view;
 float dist=length(head.xyz);
 // Each drop a little fainter or brighter; the ones right at the lens and at the box's edge fade out.
 vAlpha=(rainWidth/width)*(.55+.45*fract(seed.w*13.7))*smoothstep(1.2,3.2,dist)*(1.0-smoothstep(rainBox.x*.36,rainBox.x*.5,dist));
 vColor=vec3(rainSky)+lampsAt(p,rainBeam,rainTail);
}`;
const rainFragment=`varying float vAlpha,vAcross;varying vec3 vColor;
void main(){float a=vAlpha*(1.0-vAcross*vAcross);if(a<.002)discard;gl_FragColor=vec4(vColor*a,1.0);}`;

// The spray: soft puffs of mist behind each car's rear wheels on the wet track, more as it goes faster, lit by the sky
// and the lamps, fading near the eye so the car behind still sees the road.
export const SPRAY=Object.freeze({capacity:1400,rate:16,life:[.5,.95],size:[.35,.6],opacity:.055,from:8,grey:.5});
const sprayVertex=`attribute vec3 puff;
uniform float viewport,sprayNear,sprayFar,sprayBeam,sprayTail,effectLight;
${lampUniforms}
varying float vAlpha;varying vec3 vColor;
${lampLight}
void main(){
 vec4 p=modelViewMatrix*vec4(position,1.0);
 vAlpha=puff.y*smoothstep(sprayNear,sprayFar,-p.z-puff.x);
 vColor=vec3(${SPRAY.grey},${SPRAY.grey+.03},${SPRAY.grey+.06})*effectLight+lampsAt(position,sprayBeam,sprayTail);
 gl_Position=projectionMatrix*p;gl_PointSize=vAlpha<.003?0.0:clamp(puff.x*viewport*projectionMatrix[1][1]/max(.2,-p.z),1.0,320.0);
}`;
const sprayFragment=`varying float vAlpha;varying vec3 vColor;
void main(){vec2 q=gl_PointCoord*2.0-1.0;float r=dot(q,q);if(r>1.0)discard;float a=vAlpha*pow(1.0-r,2.0);if(a<.003)discard;gl_FragColor=vec4(vColor,a);}`;

// The drops landing round the eye: a small ring bursting on the ground for a fifth of a second, here and there, on
// the plane of the road under the player's car (ground: its point and normal), out to SPLASH.box/2 metres.
export const SPLASH=Object.freeze({count:900,box:13,life:.2,rate:1.3,size:[.035,.09]});
const splashVertex=`attribute vec4 seed;attribute vec2 corner;
uniform vec3 splashEye,groundPoint,groundNormal;uniform float splashTime,splashDensity,splashSky,rainBeam,rainTail;
${lampUniforms}
varying vec2 vCorner;varying float vAlpha;varying vec3 vColor;
${lampLight}
void main(){
 vCorner=corner;vAlpha=0.0;vColor=vec3(0.0);
 float phase=fract(splashTime*${SPLASH.rate.toFixed(2)}*(.7+.6*seed.z)+seed.w),box=${SPLASH.box.toFixed(1)};
 if(seed.z>splashDensity||phase>${(SPLASH.rate*SPLASH.life).toFixed(3)}){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
 // A lattice anchored to the world, wrapped round the eye; on the road's plane, a centimetre and a half over it.
 vec2 xz=mod(seed.xy*box-splashEye.xz+box*.5,box)+splashEye.xz-box*.5;
 vec3 n=normalize(groundNormal);float y=groundPoint.y-((xz.x-groundPoint.x)*n.x+(xz.y-groundPoint.z)*n.z)/n.y;
 vec3 p=vec3(xz.x,y,xz.y)+n*.015,u=normalize(cross(n,vec3(0.0,0.0,1.0))),v=cross(u,n);
 float t=phase/${(SPLASH.rate*SPLASH.life).toFixed(3)},size=mix(${SPLASH.size[0]},${SPLASH.size[1]},t)*(.7+.6*seed.x);
 vec4 view=viewMatrix*vec4(p+(u*corner.x+v*corner.y)*size,1.0);gl_Position=projectionMatrix*view;
 float dist=length(splashEye-p);
 vAlpha=(1.0-t)*smoothstep(1.0,2.5,dist)*(1.0-smoothstep(box*.32,box*.5,dist));
 vColor=vec3(splashSky)+lampsAt(p+n*.1,rainBeam,rainTail);
}`;
const splashFragment=`varying vec2 vCorner;varying float vAlpha;varying vec3 vColor;
void main(){float r=length(vCorner);float ring=smoothstep(.6,.85,r)*(1.0-smoothstep(.85,1.0,r));float a=vAlpha*(ring*.8+(1.0-smoothstep(0.0,.35,r))*.25);if(a<.003)discard;gl_FragColor=vec4(vColor*a,1.0);}`;

export class Rain{
 constructor({count=RAIN_DROPS.alto}={}){
  this.root=new THREE.Group();this.root.name='Chuva';this.level=0;this.kind='chuva';this.time=0;this.count=0;
  this.eye=new THREE.Vector3();this.eyeVelocity=new THREE.Vector3();this.hasEye=false;
  this.uniforms={rainCentre:{value:new THREE.Vector3()},eyeShutter:{value:RAIN_LOOK.eyeShutter},rainBox:{value:new THREE.Vector3(...RAIN_LOOK.box)},rainWind:{value:new THREE.Vector3(...RAIN_LOOK.wind)},eyeVelocity:{value:new THREE.Vector3()},
   rainTime:{value:0},rainDensity:{value:0},rainFall:{value:RAIN_LOOK.fall.chuva},rainShutter:{value:RAIN_LOOK.shutter.chuva},rainWidth:{value:RAIN_LOOK.width.chuva},rainSky:{value:.1},rainBeam:{value:RAIN_LOOK.beam},rainTail:{value:RAIN_LOOK.tail},
   viewport:{value:900},cutCabin:{value:0},cabinInverse:{value:new THREE.Matrix4()},...ROAD_LAMPS};
  this.material=new THREE.ShaderMaterial({name:'Chuva_pingos',vertexShader:rainVertex,fragmentShader:rainFragment,uniforms:this.uniforms,transparent:true,depthWrite:false,fog:false,
   blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
  this.mesh=new THREE.Mesh(new THREE.BufferGeometry(),this.material);this.mesh.name='Pingos_de_chuva';this.mesh.frustumCulled=false;this.mesh.renderOrder=4;this.root.add(this.mesh);
  this.setCount(count);
  // The spray's puffs: a ring of particles in world space.
  const n=SPRAY.capacity;this.puffs=Array.from({length:n},()=>({age:9,life:1}));this.sprayCursor=0;this.sprayLive=0;
  this.sprayGeometry=new THREE.BufferGeometry();
  for(const [name,size] of [['position',3],['puff',3]])this.sprayGeometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(n*size),size).setUsage(THREE.DynamicDrawUsage));
  this.sprayMaterial=new THREE.ShaderMaterial({name:'Spray_dos_pneus',vertexShader:sprayVertex,fragmentShader:sprayFragment,
   uniforms:{viewport:{value:900},sprayNear:{value:1.2},sprayFar:{value:5},sprayBeam:{value:RAIN_LOOK.beam*1.6},sprayTail:{value:RAIN_LOOK.tail*1.4},effectLight:EFFECT_LIGHT,...ROAD_LAMPS},
   transparent:true,depthWrite:false,fog:false,blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
  this.spray=new THREE.Points(this.sprayGeometry,this.sprayMaterial);this.spray.name='Spray_dos_pneus';this.spray.frustumCulled=false;this.spray.renderOrder=3;this.root.add(this.spray);
  // The splashes: SPLASH.count flat quads placed by the shader.
  {const n=SPLASH.count,seed=new Float32Array(n*16),corner=new Float32Array(n*8),index=new Uint32Array(n*6);
   for(let i=0;i<n;i++){const s=[Math.random(),Math.random(),Math.random(),Math.random()];for(let k=0;k<4;k++){seed.set(s,(i*4+k)*4);corner.set([k&1?1:-1,k>>1?1:-1],(i*4+k)*2);}index.set([i*4,i*4+1,i*4+2,i*4+2,i*4+1,i*4+3],i*6);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*12),3));g.setAttribute('seed',new THREE.BufferAttribute(seed,4));g.setAttribute('corner',new THREE.BufferAttribute(corner,2));g.setIndex(new THREE.BufferAttribute(index,1));
   this.splashUniforms={splashEye:{value:new THREE.Vector3()},groundPoint:{value:new THREE.Vector3()},groundNormal:{value:new THREE.Vector3(0,1,0)},splashTime:{value:0},splashDensity:{value:0},splashSky:{value:.4},rainBeam:{value:RAIN_LOOK.beam},rainTail:{value:RAIN_LOOK.tail},...ROAD_LAMPS};
   this.splashMaterial=new THREE.ShaderMaterial({name:'Respingos_da_chuva',vertexShader:splashVertex,fragmentShader:splashFragment,uniforms:this.splashUniforms,transparent:true,depthWrite:false,fog:false,
    blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
   this.splashes=new THREE.Mesh(g,this.splashMaterial);this.splashes.name='Respingos_da_chuva';this.splashes.frustumCulled=false;this.splashes.renderOrder=3;this.root.add(this.splashes);}
  this.root.visible=false;
 }
 // How many drops can fall (the Gráficos level); the weather decides the share that does.
 setCount(count){
  if(count===this.count)return;this.count=count;const old=this.mesh.geometry;
  const seed=new Float32Array(count*16),corner=new Float32Array(count*8),index=new Uint32Array(count*6);
  for(let i=0;i<count;i++){
   const s=[Math.random(),Math.random(),Math.random(),Math.random()];
   for(let k=0;k<4;k++){seed.set(s,(i*4+k)*4);corner.set([k&1?1:-1,k>>1],(i*4+k)*2);}
   index.set([i*4,i*4+1,i*4+2,i*4+2,i*4+1,i*4+3],i*6);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*12),3));g.setAttribute('seed',new THREE.BufferAttribute(seed,4));g.setAttribute('corner',new THREE.BufferAttribute(corner,2));g.setIndex(new THREE.BufferAttribute(index,1));
  this.mesh.geometry=g;old.dispose();
 }
 // The weather (weather.js profile): the drops' share and kind, the spray's strength.
 setWeather(profile){
  const kind=profile.rain==='garoa'?'garoa':'chuva',u=this.uniforms;this.kind=kind;this.level=profile.drops;this.spraying=profile.spray;
  u.rainDensity.value=profile.drops;u.rainFall.value=RAIN_LOOK.fall[kind];u.rainShutter.value=RAIN_LOOK.shutter[kind];u.rainWidth.value=RAIN_LOOK.width[kind];
  // The sky's share: drops catch the overcast's light by day, almost none at night.
  u.rainSky.value=RAIN_LOOK.sky[kind]*profile.ambient;
  this.splashUniforms.splashDensity.value=profile.drops;this.splashUniforms.splashSky.value=(kind==='garoa'?.3:.55)*profile.ambient;
  this.root.visible=profile.drops>0;if(!this.root.visible)this.clearSpray();
 }
 // eye: the camera; cabin: the player's car body (its cabin keeps the rain out in the cockpit and bonnet views,
 // inside: true there); cars: TestCars throwing spray; viewport: the picture's height in pixels.
 // ground: {point, normal} of the road under the player's car (world), where the splashes land.
 update(dt,camera,{cabin=null,inside=false,cars=[],viewport=900,ground=null}={}){
  if(!this.root.visible)return;
  const u=this.uniforms,eye=camera.position;
  // A held frame keeps the streaks it had, but a jump of the eye meanwhile (a photo, a reposition) starts from rest.
  if(dt<=0&&this.hasEye&&this.eye.distanceToSquared(eye)>4){this.eyeVelocity.set(0,0,0);this.eye.copy(eye);}
  if(dt>0){
   this.time+=dt;u.rainTime.value=this.time%1000;
   // The eye's velocity, eased: a cut or a reposition (faster than any car) starts from rest.
   if(this.hasEye){const v=this.eye.clone().subVectors(eye,this.eye).divideScalar(dt);if(v.length()>120)v.set(0,0,0);this.eyeVelocity.lerp(v,1-Math.exp(-dt/.12));}
   this.eye.copy(eye);this.hasEye=true;
  }
  u.rainCentre.value.copy(eye);u.eyeVelocity.value.copy(this.eyeVelocity);u.viewport.value=viewport;this.sprayMaterial.uniforms.viewport.value=viewport;
  u.cutCabin.value=inside&&cabin?1:0;if(cabin)u.cabinInverse.value.copy(cabin.matrixWorld).invert();
  // The spray clears close to the eye: from inside the car the road ahead stays in sight.
  const s=this.sprayMaterial.uniforms;s.sprayNear.value=inside?2.5:1.2;s.sprayFar.value=inside?9:5;
  if(dt>0){for(const car of cars)this.throwSpray(car,dt);this.ageSpray(dt);}
  const sp=this.splashUniforms;sp.splashEye.value.copy(eye);sp.splashTime.value=this.time%1000;
  if(ground){sp.groundPoint.value.copy(ground.point);sp.groundNormal.value.copy(ground.normal);}this.splashes.visible=!!ground;
 }
 // Mist from the rear tyres of one car: nothing slow, more as it goes faster; behind the wheel, drifting with the car.
 throwSpray(car,dt){
  const speed=Math.hypot(car.vx,car.vy);if(!this.spraying||speed<SPRAY.from||!car.surface?.onRoad)return;
  const c=Math.cos(car.heading),s=Math.sin(car.heading),emit=car.sprayEmit??=[0,0],rate=this.spraying*SPRAY.rate*Math.min(1,(speed-SPRAY.from)/30);
  let k=0;
  for(const w of SUSPENSION_WHEELS){
   if(w.front)continue;const e=k++;emit[e]+=rate*dt;
   while(emit[e]>=1){
    emit[e]--;const x=car.x+c*(w.x-.35)-s*w.y,y=car.y+s*(w.x-.35)+c*w.y,z=(car.surface?.z??car.z??0),q=this.puffs[this.sprayCursor];this.sprayCursor=(this.sprayCursor+1)%this.puffs.length;
    const spread=(Math.random()-.5)*1.4;
    Object.assign(q,{x:x+(Math.random()-.5)*.3,y:z+.25+Math.random()*.25,z:-y+(Math.random()-.5)*.3,
     vx:car.vx*.35-s*spread,vy:.5+Math.random()*.7,vz:-(car.vy*.35+c*spread),age:0,life:SPRAY.life[0]+Math.random()*(SPRAY.life[1]-SPRAY.life[0]),
     size:SPRAY.size[0]+Math.random()*(SPRAY.size[1]-SPRAY.size[0]),strength:Math.min(1,.4+speed/45)});
   }
  }
 }
 ageSpray(dt){
  const {position,puff}=this.sprayGeometry.attributes;let live=0;
  for(let i=0;i<this.puffs.length;i++){
   const p=this.puffs[i];p.age+=dt;if(p.age>=p.life){puff.setY(i,0);continue;}live++;
   // The mist slows in the air and spreads as it thins.
   const drag=Math.exp(-dt*1.6);p.vx*=drag;p.vz*=drag;p.vy=p.vy*drag-.4*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   const t=p.age/p.life;position.setXYZ(i,p.x,p.y,p.z);puff.setXY(i,p.size*(1+1.6*t),SPRAY.opacity*p.strength*Math.sin(Math.PI*Math.min(1,t*1.4+.05)));
  }
  this.sprayLive=live;position.needsUpdate=puff.needsUpdate=true;
 }
 clearSpray(){for(const p of this.puffs)p.age=p.life;this.sprayGeometry.attributes.puff.array.fill(0);this.sprayGeometry.attributes.puff.needsUpdate=true;}
 info(){return {visible:this.root.visible,kind:this.kind,drops:this.count,share:this.level,falling:Math.round(this.count*this.level),spray:this.sprayLive,eyeSpeed:+this.eyeVelocity.length().toFixed(1)};}
 dispose(){this.mesh.geometry.dispose();this.material.dispose();this.sprayGeometry.dispose();this.sprayMaterial.dispose();this.splashes.geometry.dispose();this.splashMaterial.dispose();}
}
