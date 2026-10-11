import * as THREE from 'three';
import {EFFECT_LIGHT} from './weather.js';
import {SUSPENSION_WHEELS,HULL,CG_HEIGHT,clamp} from './physics.js';

// The Opala in a lake. The hull and the tyres push the water (lake-waves.js): a bow
// wave piles up at the bumper, a V of waves spreads behind, the water rushes back in
// behind the tail and sloshes against the car after it stops. The water drags on the
// car and its own waves push back on the body. The leading end shoves two sheets of
// spray aside, the tyres throw fans and rooster tails, and a body meeting the surface
// fast throws a wall of water ahead of it.
// Physics frame: x, y horizontal, z up; particles are written in three.js axes.
// The underbody and sills: the first nine points of the car's shell (car.body.hull, the Opala's HULL by default).
const LOW_HULL=9,GRAVITY=9.81,MASS=1250;
// Quadratic water drag, .5*rho*Cd*A/mass, scaled down to ~25% so a car driven into
// a lake stops within a few lengths instead of as if it hit a wall; the waves it
// piles up (LakeWaves.hullPush) add their own resistance on top.
const DRAG=.5*1000/1250*.25,TYRE_DIAMETER=.63,WAVE_PUSH=.8;
// Plan of the body for the water, from the centre of mass: bumpers, sills and the floor.
const SHAPE=Object.freeze({front:2.4,rear:2.33,half:.88,soft:.5,bottom:-.33});
// Spray is drawn as streaks: each drop smeared over the distance it covers in this time.
const STREAK=1/40;

export class LakeContact {
 constructor({water,mobile=false,onSound=null}){
  this.water=water;this.waves=water.waves??null;this.onSound=onSound;this.mobile=mobile;
  this.capacity=mobile?520:2000;this.cursor=0;
  const n=this.capacity;
  this.p=new Float32Array(n*3);this.v=new Float32Array(n*3);this.age=new Float32Array(n).fill(9);this.life=new Float32Array(n).fill(1);
  this.size=new Float32Array(n);this.alpha=new Float32Array(n);this.floor=new Float32Array(n);
  // One quad per drop, stretched along its motion on screen.
  const geometry=this.geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,1,1,0,-1,1,0],3));geometry.setIndex([0,1,2,0,2,3]);
  for(const [name,size] of [['dropAt',3],['dropVelocity',3],['drop',2]])geometry.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(n*size),size).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount=n;
  this.material=new THREE.ShaderMaterial({name:'Respingos_do_lago',transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{viewport:{value:900},streak:{value:STREAK},effectLight:EFFECT_LIGHT},
   vertexShader:`attribute vec3 dropAt,dropVelocity;attribute vec2 drop;uniform float viewport,streak;
    varying vec2 vLocal;varying float vLength,vRadius,vAlpha,vMist;
    void main(){
     if(drop.x<=0.){gl_Position=vec4(2.,2.,2.,1.);return;}
     vec4 head=modelViewMatrix*vec4(dropAt,1.);
     vec3 ray=normalize(head.xyz),trail=(modelViewMatrix*vec4(-dropVelocity*streak,0.)).xyz;trail-=ray*dot(trail,ray);
     // Never thinner than about two pixels; a drop blown up to that size is fainter.
     float pixel=2.*-head.z/(viewport*projectionMatrix[1][1]),radius=max(drop.x*.5,pixel),len=length(trail);
     vec3 along=len>1e-5?trail/len:normalize(vec3(-ray.y,ray.x,0.)+vec3(0.,1e-4,0.)),side=normalize(cross(along,ray));
     float y=position.y*(len+2.*radius)-radius,cover=drop.x*.5/radius;
     vLocal=vec2(position.x*radius,y);vLength=len;vRadius=radius;vMist=step(.25,drop.x);
     // Motion spreads the same water over a longer streak; drops right at the lens fade out.
     vAlpha=drop.y*cover*sqrt(radius/(radius+len*.35))*smoothstep(.8,2.5,-head.z);
     gl_Position=projectionMatrix*vec4(head.xyz+side*vLocal.x+along*y,1.);}`,
   fragmentShader:`varying vec2 vLocal;varying float vLength,vRadius,vAlpha,vMist;uniform float effectLight;
    void main(){vec2 q=vec2(vLocal.x,vLocal.y-clamp(vLocal.y,0.,vLength))/vRadius;float r=dot(q,q);if(r>1.)discard;
     // Bright at the drop, fading along the streak it leaves.
     float tail=vLength>0.?clamp(vLocal.y/vLength,0.,1.):0.;
     float a=vAlpha*mix(smoothstep(1.,.2,r)*.9*(1.-.65*tail),pow(1.-r,2.)*.5,vMist);if(a<.004)discard;
     gl_FragColor=vec4(mix(vec3(.74,.8,.82),vec3(.97,.99,1.),smoothstep(.8,0.,r)*(1.-vMist*.5))*effectLight,a);}`});
  this.mesh=new THREE.Mesh(geometry,this.material);this.mesh.name='Respingos_do_lago';this.mesh.frustumCulled=false;this.mesh.renderOrder=3;
  this.wheels=SUSPENSION_WHEELS.map(()=>({depth:0,level:0,x:0,y:0,z:0,emit:0}));
  this.hull=0;this.inWater=false;this.soundClock=0;this.bow=[0,0];this.landed=0;this.breaking=0;
  this.stats={splashes:0,drops:0,sheets:0,breakers:0,peakDrag:0,drag:0,wavePush:0};
 }
 reset(){this.age.fill(9);this.hull=0;this.inWater=false;this.bow=[0,0];for(const w of this.wheels){w.depth=0;w.emit=0;}this.write();}
 // Fixed physics step, right after the car has moved.
 step(car,dt){
  const axes=car.updateAxes(),{f,l,u}=axes,speed=Math.hypot(car.vx,car.vy);
  let tyres=0,wet=0,level=null;
  for(let i=0;i<4;i++){
   const w=SUSPENSION_WHEELS[i],c=this.wheels[i];
   c.x=car.x+f[0]*w.x+l[0]*w.y-u[0]*CG_HEIGHT;c.y=car.y+f[1]*w.x+l[1]*w.y-u[1]*CG_HEIGHT;c.z=car.z+f[2]*w.x+l[2]*w.y-u[2]*CG_HEIGHT;
   const surface=this.water.at(c.x,c.y);c.depth=surface?clamp(surface.level-c.z,0,1.5):0;c.level=surface?.level??0;
   if(c.depth>0){tyres+=Math.min(c.depth,TYRE_DIAMETER);wet++;level=surface.level;}
  }
  // Hull: how deep the underbody and sills sit below the surface, on average.
  let hull=0;
  const shell=car.body?.hull??HULL;
  if(level!==null)for(let k=0;k<LOW_HULL;k++){const [px,py,pz]=shell[k],z=car.z+f[2]*px+l[2]*py+u[2]*pz;hull+=clamp(level-z,0,1.3);}
  hull/=LOW_HULL;
  car.wet=this.wheels.map(w=>w.depth);car.wetHull=hull;
  const entering=!this.inWater&&wet>0,hullEntry=this.hull<.03&&hull>=.03;
  this.inWater=wet>0;
  // Water drag: submerged frontal and side areas, tyre by tyre and the body.
  const c=Math.cos(car.heading),s=Math.sin(car.heading);let along=car.vx*c+car.vy*s,across=-car.vx*s+car.vy*c;
  const front=1.7*hull+.22*tyres,side=4.3*hull+.5*tyres,before=Math.hypot(along,across);
  if(front>0){
   along/=1+DRAG*front*Math.abs(along)*dt;across/=1+DRAG*1.3*side*Math.abs(across)*dt;
   car.yaw/=1+1.2*side*dt;
  }
  // The water the car pushes: laid on the wave field every tick, and its waves pushing back on the body.
  const waves=this.waves;this.stats.wavePush=0;
  if(waves?.follow(car.x,car.y,car.vx,car.vy)){
   waves.step(dt,field=>{field.pressHull(car,axes,SHAPE);for(const w of this.wheels)if(w.depth>0)field.pressWheel(w.x,w.y,w.depth,speed);});
   if(hull>0){
    let [ahead,aside]=waves.hullPush(car,axes,SHAPE,hull,MASS);ahead=clamp(ahead*WAVE_PUSH,-12,12);aside=clamp(aside*WAVE_PUSH,-12,12);
    along+=ahead*dt;across+=aside*dt;this.stats.wavePush=ahead;
   }
  }
  if(front>0){
   car.vx=along*c-across*s;car.vy=along*s+across*c;
   this.stats.drag=(before-Math.hypot(along,across))/dt;this.stats.peakDrag=Math.max(this.stats.peakDrag,this.stats.drag);
  }else this.stats.drag=0;
  // Travel direction, and which end of the car leads.
  const dx=speed>.1?car.vx/speed:f[0],dy=speed>.1?car.vy/speed:f[1],forward=car.vx*f[0]+car.vy*f[1]>=0;
  // The body meeting the water, or wheels ploughing in fast: a wall of spray and a sound.
  const impact=Math.max(speed*(hullEntry?1:entering?.6:0),hullEntry?-car.vz*1.5:0);
  if(impact>2.5){
   const lead=forward?SHAPE.front:-SHAPE.rear,strength=clamp(impact/10,.3,1.6);
   this.wall(car.x+f[0]*lead,car.y+f[1]*lead,level,car,dx,dy,speed,strength,hullEntry);
   this.onSound?.('splash',{strength:clamp(impact/9,.3,1.5)});this.stats.splashes++;
  }
  this.hull=hull;
  // The bow wave breaking: what the simulation spills over its crest leaves as spray from
  // that spot, carried ahead with the car and thrown outwards from it.
  const spill=waves?.active?waves.takeSpill():null;
  if(spill?.volume>0){
   this.breaking+=spill.volume*(this.mobile?60:150);
   let ox=spill.x-car.x,oy=spill.y-car.y;const r=Math.hypot(ox,oy)||1;ox/=r;oy/=r;
   while(this.breaking>=1){
    this.breaking--;this.stats.breakers++;
    const q=Math.random(),mist=Math.random()<.22,fling=(.25+.5*Math.random())*speed+1,up=(1.5+Math.random()*2.5)*(.5+Math.min(speed,15)/15);
    this.spawn(spill.x+(Math.random()-.5)*1.2,spill.y+(Math.random()-.5)*1.2,waves.level+.3,
     car.vx*(.4+.4*Math.random())+ox*fling+(Math.random()-.5),car.vy*(.4+.4*Math.random())+oy*fling+(Math.random()-.5),up*(mist?.6:1),
     mist?.28+q*.25:.02+q*.04,mist?.06:.9,waves.level);
   }
  }
  if(!wet)return;
  // Bow sheets: the water the leading end shoves aside leaves its corners as two wings,
  // thrown outwards and ahead, higher the faster and deeper the car goes.
  if(hull>.04&&speed>1.8){
   const lead=forward?SHAPE.front-.15:-SHAPE.rear+.15,back=forward?-1:1,depth=Math.min(1,hull*2.2);
   const rate=Math.min(speed,22)*depth*(this.mobile?16:42);
   for(let k=0;k<2;k++){
    const out=k?1:-1;this.bow[k]+=rate*dt;
    while(this.bow[k]>=1){
     this.bow[k]--;this.stats.sheets++;
     const q=Math.random(),r=Math.random(),bx=lead+back*Math.random()*1.3,by=out*(SHAPE.half+.06),mist=speed>7&&Math.random()<.18;
     const aside=speed*(.18+.42*q),ahead=speed*(.2+.55*r),up=(1+speed*(.16+.3*Math.random()))*(.45+.55*depth);
     this.spawn(car.x+f[0]*bx+l[0]*by,car.y+f[1]*bx+l[1]*by,level+.05,
      dx*ahead+l[0]*out*aside+(Math.random()-.5)*.5,dy*ahead+l[1]*out*aside+(Math.random()-.5)*.5,up*(mist?.55:1),
      mist?.28+q*.25:.018+q*.035,mist?.06:.9,level);
    }
   }
  }
  // Tyres: the fronts fan the water out to the sides, the rears throw it up and back.
  // Deep under, the body does the pushing and the tyres throw little above the surface.
  for(let i=0;i<4;i++){
   const w=this.wheels[i],spec=SUSPENSION_WHEELS[i];if(w.depth<=0||speed<1.5)continue;
   const exposed=clamp(1-w.depth/TYRE_DIAMETER,0,1);
   w.emit+=Math.min(speed,28)*(spec.front?4:6)*Math.min(1,w.depth*5)*(.2+.8*exposed)*(this.mobile?.45:1)*dt;
   const out=Math.sign(spec.y);
   while(w.emit>=1){
    w.emit--;const q=Math.random(),lift=(1.2+Math.random()*2.6)*(.35+speed/20),fling=(.6+Math.random()*2)*(.3+speed/18);
    const back=spec.front?0:speed*(.12+Math.random()*.35),mist=speed>10&&Math.random()<.18;
    this.spawn(w.x+l[0]*out*.12,w.y+l[1]*out*.12,w.level+.05,
     car.vx*(spec.front?.55:.3)+l[0]*out*fling*(spec.front?1:.4)-dx*back+(Math.random()-.5)*.6,car.vy*(spec.front?.55:.3)+l[1]*out*fling*(spec.front?1:.4)-dy*back+(Math.random()-.5)*.6,lift*(mist?.5:spec.front?1:1.2),
     mist?.28+q*.25:.02+q*.04,mist?.07:.8,w.level);
   }
  }
  this.soundClock-=dt;
  if(speed>2&&this.soundClock<=0){this.soundClock=clamp(.9-speed*.03,.25,.9);this.onSound?.('wade',{strength:clamp(speed/12,.25,1.2)*Math.min(1,tyres+hull)});}
 }
 // The water the leading end hits is thrown up and ahead in a sheet, spread across the
 // travel direction; a car falling in flat also throws it all around.
 wall(x,y,level,car,dx,dy,speed,strength,hull){
  const count=Math.round((hull?220:90)*strength*(this.mobile?.45:1)),fall=Math.max(0,-car.vz);
  for(let k=0;k<count;k++){
   const spread=(Math.random()-.5)*Math.PI*(1.1+Math.min(1,fall/6)*.9),a=Math.atan2(dy,dx)+spread,r=Math.random(),mist=Math.random()<.14;
   const reach=(.35+.5*Math.cos(spread*.8))*speed*(.5+r*.6)+fall*(.4+r*.6),up=(2+Math.random()*4.5)*strength;
   this.spawn(x+Math.cos(a)*.5,y+Math.sin(a)*.5,level+.05,Math.cos(a)*reach,Math.sin(a)*reach,up*(mist?.6:1),mist?.3+r*.3:.02+r*.045,mist?.1:.9,level);
  }
 }
 spawn(x,y,z,vx,vy,vz,size,alpha,floor){
  const i=this.cursor;this.cursor=(this.cursor+1)%this.capacity;this.stats.drops++;
  this.p.set([x,y,z],i*3);this.v.set([vx,vy,vz],i*3);this.age[i]=0;this.life[i]=size>.25?.7+Math.random()*.5:2.5;this.size[i]=size;this.alpha[i]=alpha;this.floor[i]=floor;
 }
 // Per rendered frame: move the drops and hand them to the GPU.
 update(dt,viewport){
  this.material.uniforms.viewport.value=viewport;if(dt<=0)return;
  const air=Math.exp(-dt*.7);
  for(let i=0;i<this.capacity;i++){
   if(this.age[i]>=this.life[i])continue;this.age[i]+=dt;
   const k=i*3,mist=this.size[i]>.25;
   this.v[k]*=air;this.v[k+1]*=air;this.v[k+2]=this.v[k+2]*air-GRAVITY*(mist?.25:1)*dt;
   this.p[k]+=this.v[k]*dt;this.p[k+1]+=this.v[k+1]*dt;this.p[k+2]+=this.v[k+2]*dt;
   // A drop that falls back into the lake is gone, denting the surface; mist just fades.
   if(!mist&&this.p[k+2]<this.floor[i]&&this.v[k+2]<0){
    this.age[i]=this.life[i];
    if(this.waves?.active&&(this.landed++&1))this.waves.drop(this.p[k],this.p[k+1],Math.min(.12,this.size[i]*-this.v[k+2]*.25));
   }
  }
  this.write();
 }
 write(){
  const {dropAt,dropVelocity,drop}=this.geometry.attributes;
  for(let i=0;i<this.capacity;i++){
   const k=i*3,live=this.age[i]<this.life[i],t=this.age[i]/this.life[i];
   dropAt.setXYZ(i,this.p[k],this.p[k+2],-this.p[k+1]);dropVelocity.setXYZ(i,this.v[k],this.v[k+2],-this.v[k+1]);
   drop.setXY(i,live?this.size[i]*(this.size[i]>.25?1+t*1.5:1):0,live?this.alpha[i]*(1-t*t):0);
  }
  dropAt.needsUpdate=dropVelocity.needsUpdate=drop.needsUpdate=true;
 }
 info(){
  let active=0;for(let i=0;i<this.capacity;i++)if(this.age[i]<this.life[i])active++;
  return {inWater:this.inWater,wheels:this.wheels.map(w=>+w.depth.toFixed(3)),hull:+this.hull.toFixed(3),active,capacity:this.capacity,...this.stats,waves:this.waves?.info()??null};
 }
 dispose(){this.geometry.dispose();this.material.dispose();}
}
