// Arena de Drift's car: a physics of its own for drifting, used on the arena only. The race cars (physics.js TestCar)
// are left exactly as they are: this class borrows their body, suspension, shell and contacts, and replaces the tyres,
// the driven wheels, the engine's link to them and the steering with a drift car's.
//
// What makes a drift here is what makes it on a real car: the rear wheels are a spinning mass of their own. Too much
// throttle spins them past the road (wheelspin) and a spinning tyre has little left for the sideways: the tail steps
// out. The handbrake locks them: a locked tyre slides, the tail swings. Lifting off, the engine brakes them: the rear
// lets go a little and the car turns in. Each tyre has one grip for both ways (a friction circle) on a drift tyre's
// curve: past its peak (about 8°) it keeps 87-92% sliding sideways, so an angle can be held. The engine's revs come
// from the rear wheels, so it screams when they spin. A drift car's steering lock (49° at rest), narrowing with speed
// only, the same way every time. Nothing drives for the player (user, 10-12: "o carro tá pilotando sozinho"): no
// wheel turning by itself with the slide, no throttle easing off by itself; the keys turn the wheels, let go they
// come back to the middle, the throttle is the player's.
// Plan frame as physics.js: x, y horizontal, z up; the car's x forward, y left.
import {TestCar,SUSPENSION_WHEELS,CG_HEIGHT,IDLE_RPM,REDLINE_RPM,SHIFT_UP_RPM,SHIFT_DOWN_RPM,RIGHTING_DELAY,engineTorque,clamp} from './physics.js';

// The Opala's rigid body (physics.js): 1250 kg, the axles 1.55 m ahead and 1.117 m behind the centre of mass.
const MASS=1250,G=9.81,A=SUSPENSION_WHEELS[0].x,B=-SUSPENSION_WHEELS[2].x;
const ROAD_MU=1.24,GRASS_MU=.78,ROAD_ROLLING=.16,GRASS_ROLLING=.7,SHIFT_TIME=.16,TYRE_RELAXATION=.08;
// The drift tyre's curve over its combined slip (the theoretical slip of both ways): peak 1 at 0.148, 0.91 at 0.5, 0.87
// at 1 (a wheel spinning flat out, or locked).
const tyre=s=>Math.sin(1.4*Math.atan(14*s));
// Each model's drift setup: its engine's torque times this, its rear tyres' grip, its flywheel and wheels' inertia
// (kg m²: what the engine has to spin up), the brake bias.
export const DRIFT_SETUPS=Object.freeze({
 opala:{torque:1.45,rearMu:.87,engineInertia:.25,wheelInertia:2.4},
 // A Copa Fusca's engine never spins its tyres: the drift Fusca gets a much stronger one and harder rear tyres.
 fusca:{torque:2.2,rearMu:.88,engineInertia:.14,wheelInertia:1.6}
});
// Steering: the lock (rad), narrowing with speed alone: 49° at rest, 38° at 30 km/h, 33° at 50, 27° at 80.
export const DRIFT_STEER=Object.freeze({lock:.85,narrow:30});
// The player's own map of the keys (the arena's panel, user 10-12: the throttle and the wheel felt too sharp): how much
// of the throttle a full press gives (20-100%) and the wheels' angle at rest for a full turn of the keys (10-49°, still
// narrowing with speed in the same proportion). Analog pedals and sticks are mapped the same way.
export const DRIFT_TUNE=Object.freeze({throttle:Object.freeze({min:.2,max:1,initial:1}),steer:Object.freeze({min:10,max:49,initial:49})});
// Brakes as physics.js: 11 m/s² at most, 62% on the front; the handbrake a hard pull on the rear wheels.
const BRAKE=11,BRAKE_FRONT=.62,HANDBRAKE=16000,REAR_BRAKE_TORQUE_SCALE=1;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const ZERO={front:0,rear:0,loose:false};

export class DriftCar extends TestCar{
 constructor(data){super(data);this.wheelSpeed=0;this.throttleMax=DRIFT_TUNE.throttle.initial;this.steerMax=DRIFT_STEER.lock;}
 // The player's map (DRIFT_TUNE): throttle 0.2-1, the wheels' angle at rest in degrees.
 tune({throttle,steer}={}){if(Number.isFinite(throttle))this.throttleMax=clamp(throttle,DRIFT_TUNE.throttle.min,DRIFT_TUNE.throttle.max);if(Number.isFinite(steer))this.steerMax=clamp(steer,DRIFT_TUNE.steer.min,DRIFT_TUNE.steer.max)*Math.PI/180;return this;}
 get setup(){return DRIFT_SETUPS[this.mechanics.name]??DRIFT_SETUPS.opala;}
 recover(index){super.recover(index);this.wheelSpeed=0;this.slip=0;}
 // The arena's floor (drift-arena-world.js): a planter's grass is loose ground, its kerbs a few centimetres proud.
 sample(x,y,hint=null){
  const p=super.sample(x,y,hint),floor=this.world?.surface(x,y);
  if(floor){if(floor.lift)p.z+=floor.lift;if(floor.loose)p.onRoad=false;}
  return p;
 }
 // No laps on the arena.
 trackLap(){}
 // The rear wheels' surface speed's mass: the wheels and, through the gears and a closed clutch, the engine.
 wheelMass(ratio,engaged){const R=this.mechanics.tyre,n=ratio*R/2.653,s=this.setup;return (s.wheelInertia+s.engineInertia*n*n*engaged)/(R*R);}
 step(input,dt){
  this.wallImpactSpeed=0;this.crashImpactSpeed=0;
  if(!(Math.hypot(this.x-this.stepX,this.y-this.stepY)<.5))this.settle();
  const p=this.surface,m=this.mechanics,s=this.setup,condition=this.condition?.factors,pedal=clamp(input.throttle||0,0,1)*this.throttleMax;
  const c=Math.cos(this.heading),sn=Math.sin(this.heading),u=this.vx*c+this.vy*sn,lat=-this.vx*sn+this.vy*c,speed=Math.hypot(this.vx,this.vy);
  // --- Steering. The keyboard's input eases in as in physics.js; a wheel or a pad's stick is where the hands put it.
  const command=clamp(input.left-input.right,-1,1),response=command*(this.steerInput??0)<0?20:12;
  this.steerInput=input.wheel?command:(this.steerInput??0)+(command-(this.steerInput??0))*(1-Math.exp(-dt*response));
  // The rear's slip angle (for the gearbox: it holds its gear sideways) and the wheels where the keys put them.
  const rearSlip=u>.5?Math.atan2(lat-B*this.yaw,u):0,sideways=speed>2?smooth((Math.abs(rearSlip)-.07)/.16):0;this.slip=rearSlip;
  this.steer=this.steerInput*this.steerMax/(1+speed/DRIFT_STEER.narrow)*(condition?.steering??1);
  this.steerVisual=this.steer;
  // --- Gearbox: automatic (holding its gear while sideways: a drifter never shifts mid-slide) or the player's.
  const manual=Number.isInteger(input.gear)&&input.gear>=-1&&input.gear<=5;this.manualGear=manual;
  const kmh=Math.abs(u)*3.6;this.shiftTimer=Math.max(0,(this.shiftTimer??0)-dt);
  if(input.reverse)this.gear=-1;
  else if(manual){if(input.gear!==this.gear){if(this.gear>0&&input.gear>0)this.shiftTimer=SHIFT_TIME*(input.gear>this.gear?1:.6);this.gear=input.gear;this.shifts=(this.shifts??0)+1;}}
  else{
   if(!(this.gear>0))this.gear=1;
   const spinning=this.wheelSpeed-u>3;
   if(this.shiftTimer===0){
    if(this.gear<5&&kmh*m.gears[this.gear]>SHIFT_UP_RPM&&sideways<.3&&!spinning){this.gear++;this.shiftTimer=SHIFT_TIME;this.shifts=(this.shifts??0)+1;}
    else if(this.gear>1&&kmh*m.gears[this.gear]<SHIFT_DOWN_RPM+(input.brake>.3?700:0)&&kmh*m.gears[this.gear-1]<SHIFT_UP_RPM-400){this.gear--;this.shiftTimer=SHIFT_TIME*.6;this.shifts=(this.shifts??0)+1;}
   }
  }
  // --- Engine: its revs from the rear wheels (a clutch slipping from rest in first); its force at their tread.
  // A drifter pulls the hydraulic handbrake with the clutch in: the engine lets the rear wheels lock.
  const ratio=m.gears[Math.max(1,this.gear)],engaged=input.handbrake?0:!manual||input.reverse?1:this.gear===0?0:clamp((.85-(input.clutch||0))/.6,0,1);
  const wheelRpm=Math.abs(this.wheelSpeed)*3.6*ratio,engineRpm=Math.max(wheelRpm,this.gear===1?IDLE_RPM+pedal*2600:IDLE_RPM);
  const throttle=pedal,power=(this.engineScale??1)*(condition?.power??1);
  let drive=0;
  if(this.gear>0){
   drive=throttle*engineTorque(Math.min(engineRpm,REDLINE_RPM),m.torque)*s.torque*ratio*m.torqueToAccel*MASS*power*engaged;
   if(wheelRpm>=REDLINE_RPM)drive=0;if(this.shiftTimer>0)drive*=.12;
  }
  const back=input.reverse?Math.min(1,input.reverse):manual&&this.gear<0?pedal*engaged:0;
  if(back)drive=-3*back*MASS*(condition?.power??1);
  // Lifting off, the engine holds the wheels back (more in the low gears).
  const engineBrake=this.gear>0&&pedal<.05&&this.shiftTimer===0&&Math.abs(this.wheelSpeed)>1?(.18+.5*clamp(wheelRpm/REDLINE_RPM,0,1))*MASS*engaged:0;
  this.rpm=this.gear<0?IDLE_RPM+Math.abs(u)*3.6*110+back*400:clamp(engineRpm,IDLE_RPM,REDLINE_RPM+80);
  if(engaged<1)this.rpm=this.rpm*engaged+(IDLE_RPM+pedal*(REDLINE_RPM-IDLE_RPM))*(1-engaged);
  const brake=Math.max(0,input.brake||0)*BRAKE*(condition?.brakes??1)*MASS,mu=(p.onRoad?ROAD_MU*m.grip:GRASS_MU)*(condition?.grip??1)*this.weatherGrip;
  const tyres={drive,engineBrake,brake,handbrake:input.handbrake?HANDBRAKE:0,mu,rearMu:mu*(p.onRoad?s.rearMu:1),mass:this.wheelMass(ratio,this.gear===0?0:engaged)};
  // (Clutch in, the engine revs free.)
  if(input.handbrake&&this.gear>0)this.rpm=IDLE_RPM+pedal*(REDLINE_RPM-IDLE_RPM)*.85;
  // --- The body (physics.js), its own tyre forces switched off: the suspension, the shell, gravity and the air.
  const wild=this.wheelsDown<4||this.hullContact||this.upright<.9,count=dt>0?Math.max(1,Math.ceil(dt*(wild?360:120)-1e-6)):0,h=dt/count;
  const grounded=this.wheelsDown>0,hold=grounded&&speed<.3&&!!(input.brake||input.handbrake)&&!throttle;
  const body={dt:h,drive:0,rolling:p.onRoad?ROAD_ROLLING:GRASS_ROLLING,engineBrake:0,brakeDecel:0,burning:false,grip:ZERO,drag:m.drag*(1-clamp(this.draft||0,0,.5)),crawl:0,swing:false,braced:false,hold};
  this.longAccel=this.latAccel=0;this.draft=0;this.burnout=0;this.limiter=false;
  for(let k=0;k<count;k++){this.tyres(h,tyres);if(hold)this.wheelSpeed=0;this.integrate(h,body);}
  if(count){this.longAccel/=dt;this.latAccel/=dt;}
  this.surface=this.sample(this.x,this.y);this.index=this.surface.i;
  // --- The arena's wall and what stands on its floor (drift-arena-world.js), and any trunks.
  if(this.world){const hit=this.world.collide(this);if(hit)this.wallImpactSpeed=Math.max(this.wallImpactSpeed,hit);this.surface=this.sample(this.x,this.y);}
  if(this.posts){const hit=this.posts.collide(this);if(hit)this.wallImpactSpeed=Math.max(this.wallImpactSpeed,hit);}
  const v=this.vx*c+this.vy*sn;
  this.distance+=speed*dt;this.clock+=dt;this.spin+=v*dt/m.tyre;
  // The rear wheels' tread speed and how much it runs past the road (tyre smoke, the squeal, the wheels' blur).
  this.rearWheelSpeed=this.wheelSpeed;this.rearSlipSpeed=grounded?clamp(Math.abs(this.wheelSpeed-v),0,30):0;this.rearSpin=(this.rearSpin??0)+this.wheelSpeed*dt/m.tyre;
  const resting=speed<1.5&&Math.abs(this.vz)<1.5&&Math.abs(this.yaw)+Math.abs(this.rollRate)+Math.abs(this.pitchRate)<1.2;
  if(this.upright<.45&&resting)this.overturned+=dt;else if(this.upright>.8)this.overturned=0;
  if(this.overturned>RIGHTING_DELAY){this.vx=this.vy=this.yaw=0;this.wheelSpeed=0;this.settle();this.rightings++;this.rightedAt=this.clock;}
  this.stepX=this.x;this.stepY=this.y;
 }
 // One sub-step of the tyres: each axle's force from its slip on the drift tyre's curve, applied at its contact patch
 // (the body pitches, rolls and turns with them), and the rear wheels' own speed pushed by the engine and held back by
 // the road, the brakes and the handbrake.
 tyres(h,t){
  const {f:F,u:U}=this.updateAxes(),ch=Math.cos(this.heading),sh=Math.sin(this.heading),loads=this.wheelLoad;
  const relax=1-Math.exp(-h/TYRE_RELAXATION);
  this.loadFront=(this.loadFront??loads[0]+loads[1])+((loads[0]+loads[1])-(this.loadFront??0))*relax;
  this.loadRear=(this.loadRear??loads[2]+loads[3])+((loads[2]+loads[3])-(this.loadRear??0))*relax;
  const front=Math.max(0,this.loadFront),rear=Math.max(0,this.loadRear),M=this.mass??MASS,Mw=t.mass;
  let wheelForce=0;
  const u=this.vx*ch+this.vy*sh,w=-this.vx*sh+this.vy*ch,r=this.yaw;
  // Contact patches below the axles, relative to the centre of mass (world frame).
  const patch=(x,out)=>{out[0]=F[0]*x-U[0]*CG_HEIGHT;out[1]=F[1]*x-U[1]*CG_HEIGHT;out[2]=F[2]*x-U[2]*CG_HEIGHT;return out;};
  const pf=patch(A,this.patchFront??=[0,0,0]),pr=patch(-B,this.patchRear??=[0,0,0]);
  let fx=0,fy=0,rx=0,ry=0;
  if(front>0&&this.wheelsDown>0){
   // Front: free rolling wheels; the brake asks for the grip the sideways leaves.
   const cd=Math.cos(this.steer),sd=Math.sin(this.steer),vy=w+A*r,along=u*cd+vy*sd,side=-u*sd+vy*cd;
   const slip=side/Math.max(Math.abs(along),1),cap=t.mu*front;
   let fs=-cap*tyre(Math.abs(slip))*Math.sign(slip);
   // Never more than stops the sideways slide in this sub-step (low speed: no shiver).
   const meff=M/(1+A/B*cd*cd);fs=clamp(fs,-meff*Math.abs(side)/h,meff*Math.abs(side)/h);
   let fl=-Math.sign(along)*Math.min(t.brake*BRAKE_FRONT,Math.sqrt(Math.max(0,cap*cap-fs*fs)));fl=clamp(fl,-M*Math.abs(along)/h,M*Math.abs(along)/h);
   fx=fl*cd-fs*sd;fy=fl*sd+fs*cd;
  }
  if(rear>0&&this.wheelsDown>0){
   // Rear: the wheels' tread against the road, both ways on one curve (theoretical slip).
   const vx=u,vy=w-B*r,ws=this.wheelSpeed,den=Math.max(Math.abs(ws),Math.abs(vx),1),sx=(ws-vx)/den,sy=vy/den,s=Math.hypot(sx,sy),cap=t.rearMu*rear;
   if(s>1e-6){
    const f=cap*tyre(s);
    rx=f*sx/s;ry=-f*sy/s;
    const meff=M/(1+B/A);ry=clamp(ry,-meff*Math.abs(vy)/h,meff*Math.abs(vy)/h);
    // Along: what brings tread and road to one speed, shared by the wheels' mass and the car's.
    const most=Math.abs(ws-vx)/(1/Mw+1/M)/h;rx=clamp(rx,-most,most);
   }
   wheelForce=-rx;
  }
  // The rear wheels: the engine, the road's reaction, engine braking, the brakes and the handbrake (never past rest).
  let ws=this.wheelSpeed+(t.drive+wheelForce)*h/Mw;
  const hold=(t.engineBrake+t.brake*(1-BRAKE_FRONT)*REAR_BRAKE_TORQUE_SCALE+t.handbrake)*h/Mw;
  ws=Math.abs(ws)<=hold?0:ws-Math.sign(ws)*hold;this.wheelSpeed=ws;
  // The forces on the body at the patches.
  const Fx=fx,Fy=fy,k=h/M;
  this.impulse(pf,(Fx*ch-Fy*sh)*k,(Fx*sh+Fy*ch)*k,0);
  this.impulse(pr,(rx*ch-ry*sh)*k,(rx*sh+ry*ch)*k,0);
  this.longAccel+=(Fx+rx)*k;this.latAccel+=(Fy+ry)*k;
 }
 info(){return {wheelSpeed:+this.wheelSpeed.toFixed(2),slip:+((this.slip??0)*57.3).toFixed(1),steer:+(this.steer*57.3).toFixed(1),gear:this.gear,rpm:Math.round(this.rpm)};}
}
