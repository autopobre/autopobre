// The cameras that ride behind the car (Perseguição, Perseguição próxima, Perseguição distante): where they
// sit, what they look at and their lens, and the springs and vibration that make them move with the car.
// Plain numbers, no three.js: main.js turns them into the camera, testar_camera.mjs checks the framing.

// back/up: the eye behind and above the ground under the car's centre of mass (m); ahead/lookUp: the point it
// looks at; fov: the vertical lens at 16:9 (deg); kick: how much wider it opens near the car's top speed (deg);
// wide: how far the aim drops on a 20:9 phone, whose lens loses height (m).
// Chase and close sit low, just over the roof, so the paint and the silhouette read against the scenery and the
// car fills a quarter (chase) or over a third (close) of the screen's width (the old ones 13% and 28%); far is
// the old high Perseguição. Both keep the roof well under the horizon (testar_camera: at least 6% of the
// screen's height), so a car ahead in traffic shows over it (close at roof height hid it completely).
export const CAMERA_FRAMES=Object.freeze({
 chase:Object.freeze({back:5.9,up:1.9,ahead:8,lookUp:1.12,fov:55,kick:6,wide:.12}),
 close:Object.freeze({back:4.85,up:1.72,ahead:9,lookUp:.45,fov:56,kick:6,wide:.45}),
 far:Object.freeze({back:9,up:3.8,ahead:13,lookUp:1,fov:58,kick:6,wide:.1})
});
export const FOLLOW_FRAMES=Object.freeze(Object.keys(CAMERA_FRAMES));
// The other views' lens at 16:9 and their widening at speed (the cockpit already sees wide, as the eyes do).
// grid: the story's low three-quarter shot of the car on the grid. The bonnet view sees about 83° side to side at
// rest and 89° at speed (at 58° it saw 89° to 95°: the road ahead shrank and the braking boards read late).
const VIEW_LENS={cockpit:{fov:74,kick:5},hood:{fov:53,kick:5},aerial:{fov:58,kick:0},orbit:{fov:58,kick:0},tv:{fov:58,kick:0},grid:{fov:48,kick:0}};
// The widest a screen sees side to side: a 20:9 phone gets a narrower vertical lens (Hor+ up to here), so
// the car is as big on it as on a 16:9 monitor instead of shrinking into a 100° panorama.
export const MAX_HFOV=90;
// The widest the speed lens may open side to side, kick included (past it the grandstands and the flags
// stretch at the edges); a view already wider than MAX_HFOV at rest (the cockpit) keeps its own widening. A 20:9
// phone, at MAX_HFOV already at rest in the follow views, keeps the old 95° (PHONE_SPEED_HFOV), or its lens would
// hardly open at all; screens between take the share between.
export const MAX_SPEED_HFOV=92,PHONE_SPEED_HFOV=95;
export const speedHfovCap=aspect=>MAX_SPEED_HFOV+(PHONE_SPEED_HFOV-MAX_SPEED_HFOV)*clamp((aspect-REFERENCE_ASPECT)/(20/9-REFERENCE_ASPECT),0,1);
// How much of the lens kick a Movimento da câmera keeps: the lens is not the shake, so Reduzido (Baixo, Médio,
// phones) still opens most of the way; Desligado and the system's reduced motion (motion 0) not at all.
export const LENS_FLOOR=.85;
export const lensScale=motion=>motion>0?Math.max(motion,LENS_FLOOR):0;
// The lens follows its target quickly when it opens and lets go slowly (about 0.6 s), so a braking zone does not
// make it breathe in and out (rates per second).
export const LENS_OPEN=5,LENS_RELEASE=1.7;
export const REFERENCE_ASPECT=16/9;
const REFERENCE_HALF_LENGTH=2.38;   // the Opala's (physics.js OPALA_BODY)
const PHONE_ASPECT=20/9;
const rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI,clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const horizontalFov=(fov,aspect)=>deg(2*Math.atan(Math.tan(rad(fov)/2)*aspect));
export const verticalFov=(hfov,aspect)=>deg(2*Math.atan(Math.tan(rad(hfov)/2)/aspect));
export function lens(mode){return CAMERA_FRAMES[mode]??VIEW_LENS[mode]??VIEW_LENS.hood;}
// A view's lens on this screen: its own at 16:9 and on narrower screens; on wider ones it keeps the width it
// has at 16:9 (or MAX_HFOV, if that is wider) and gives up height instead.
export function baseFov(mode,aspect=REFERENCE_ASPECT){
 const {fov}=lens(mode),cap=Math.max(MAX_HFOV,horizontalFov(fov,REFERENCE_ASPECT));
 return Math.min(fov,verticalFov(cap,aspect));
}
// A car's top speed (m/s): its top gear at the redline (the Opala's 217 km/h, the Fusca's 172).
export function topSpeed(mechanics,redline=7000){const g=mechanics?.gears;return g?.length>1?redline/g[g.length-1]/3.6:60;}
// How far into its widening the lens is: from a fifth of the car's top speed to nine tenths (the Opala from 43 to
// 196 km/h, the Fusca from 34 to 155), eased at both ends, so every car feels its own speed.
export function speedEase(speed,top=60){const t=clamp((speed/Math.max(top,1)-.2)/.7,0,1);return t*t*(3-2*t);}
// The lens opened by `extra` degrees of the 16:9 lens, in the same proportion on any screen.
export function widen(base,frameFov,extra){return deg(2*Math.atan(Math.tan(rad(base)/2)*Math.tan(rad(frameFov+extra)/2)/Math.tan(rad(frameFov)/2)));}
// The lens this frame: speed opens it (the world stretches past), a near miss (surge) and a full-throttle
// upshift (punch) punch it open for a moment, never past MAX_SPEED_HFOV side to side. motion: the Gráficos tab's
// Movimento da câmera (0 with reduced motion): the steady speed kick through lensScale, the quick pulses by motion
// itself (Reduzido, the comfortable setting, keeps them at its own 35%).
export function speedFov(mode,aspect,{speed=0,top=60,motion=1,surge=0,punch=0}={}){
 const l=lens(mode),base=baseFov(mode,aspect),scale=lensScale(motion);if(!l.kick||scale<=0)return base;
 const own=horizontalFov(l.fov,REFERENCE_ASPECT),cap=verticalFov(own>MAX_HFOV?horizontalFov(l.fov+l.kick,REFERENCE_ASPECT):speedHfovCap(aspect),aspect);
 return Math.max(base,Math.min(cap,widen(base,l.fov,scale*l.kick*speedEase(speed,top)+motion*Math.min(1,l.kick/6)*(2.6*surge+1.4*punch))));
}
// The lens eased toward this frame's speedFov: fast open, slow release.
export function easeLens(fov,target,dt){return fov+(target-fov)*(1-Math.exp(-Math.max(0,dt)*(target>fov?LENS_OPEN:LENS_RELEASE)));}
// Dolly: as the lens opens, the eye comes in, so the car shrinks by no more than `shrink` while the scenery
// around it stretches; the fraction of the frame's distance to keep.
export function dolly(base,fov,shrink=.08){return Math.min(1,Math.tan(rad(base)/2)/Math.tan(rad(fov)/2)/(1-shrink));}
// The eye's height as it comes in: it drops only a little, so the roof stays under the horizon at speed too.
export const dollyUp=keep=>.8+.2*keep;
// The car's length against the Opala's (the Fusca .8).
export function carScale(body){return clamp((body?.halfLength??REFERENCE_HALF_LENGTH)/REFERENCE_HALF_LENGTH,.6,1.6);}
// The frame of a follow view for this car and screen. A shorter car is framed closer, but only halfway by its
// length and hardly lower: a Fusca is nearly as tall as an Opala, framed by length alone its tail would fill the
// bottom of the screen. On screens wider than 16:9 the lens loses height, so the aim drops a little to keep the
// rear bumper off the bottom edge.
export function frameFor(mode,{body=null,aspect=REFERENCE_ASPECT}={}){
 const f=CAMERA_FRAMES[mode]??CAMERA_FRAMES.chase,s=carScale(body),near=(1+s)/2,h=s**.25,wide=clamp((aspect-REFERENCE_ASPECT)/(PHONE_ASPECT-REFERENCE_ASPECT),0,1.5);
 return {back:f.back*near,up:f.up*h,ahead:f.ahead*near,lookUp:(f.lookUp-wide*f.wide)*h,fov:f.fov,kick:f.kick};
}
// The car's outline for framing checks, [forward, left, up] from its ground point: its hull (physics.js HULL,
// round the centre of mass, cg above the ground) and where its tyres meet the road (the Opala's axles and
// track, scaled to the car's length and width).
export function carPoints(body,cg=.52){
 const s=carScale(body),w=(body?.halfWidth??.93)/.93,points=(body?.hull??[]).map(([x,y,z])=>[x,y,z+cg]);
 for(const x of [1.55*s,-1.117*s])for(const y of [.804*w,-.804*w])points.push([x,y,0]);
 return points;
}

// Critically damped spring of state {x,v} towards target, exact for a target held through the step: it
// settles in about 4.7/omega seconds and never overshoots.
export function spring(state,target,omega,dt){
 const e=state.x-target,v=state.v,k=Math.exp(-omega*dt),b=v+omega*e;
 state.x=target+(e+b*dt)*k;state.v=(v-omega*b*dt)*k;return state;
}
// Yaw follow: the camera turns after the car (a critically damped spring), so in a corner the car turns on
// screen before the view does, at most MAX_LAG behind it; sliding, it aims between the nose and the
// direction of travel, and the car's flank shows. Rolling over, it follows the travel slowly (main.js chaseForward).
export const YAW_OMEGA=6.5,MAX_LAG=.2;
// Past MAX_LAG the view keeps up with the nose's own turn, and closes what is left of a change of aim no
// faster than this (rad/s): the aim may not jump, but if it ever does, it is eased in, never a one-frame pop.
export const CATCH_RATE=2;
const PITCH_OMEGA=6,PULL_OMEGA=3.5,LIFT_OMEGA=9,LOOK_RATE=2.6,TUMBLE_RATE=4;
// The kerb's jolt through the camera's mount (the eye only, metres): a ride on the ridges shakes it up to `ride`, the
// moment the wheels climb on adds `hit` that dies away at `decay` per second, both at the mount's own 13-18 Hz (hz),
// scaled by the wheels on it (kerb-contact.js kerbRide) and by Movimento da câmera (none with it off).
export const KERB_JOLT=Object.freeze({ride:.009,hit:.011,decay:9,hz:[14.2,17.6]});
export function kerbJolt(t,ride,kick,motion){
 if(motion<=0)return 0;
 return motion*(KERB_JOLT.ride*ride+KERB_JOLT.hit*kick)*(.62*Math.sin(t*2*Math.PI*KERB_JOLT.hz[0])+.38*Math.sin(t*2*Math.PI*KERB_JOLT.hz[1]+1.3));
}

export class CameraRig{
 constructor(){this.yaw={x:0,v:0};this.pitch={x:0,v:0};this.pull={x:0,v:0};this.lift={x:0,v:0};this.side=0;this.punch=0;this.gear=0;this.tumble=0;this.heading=0;this.ready=false;this.clock=0;this.kerb=0;this.kick=0;this.out={back:0,up:0,ahead:0,lookUp:0,yaw:0,pitch:0,lift:0,side:0,pull:0,lag:0,jolt:0};}
 // The next update starts the camera in place (a new view, a new car, a reset): no swing from where it was.
 reset(){this.ready=false;}
 // c: {dt, mode, aspect, body, heading: the nose's yaw (rad, physics heading: +y left), pitch: the nose's
 // pitch, travel: the velocity's yaw, speed (m/s), yawRate (rad/s), longAccel (m/s2), heave: the car's ground
 // point above the road under it (bumps, kerbs, jumps; the road's own slope is followed rigidly), tumbling,
 // motion (0..1), gear, keep: dolly (1: none), kerb: the car's kerbRide (0..1)}.
 update(c){
  const f=frameFor(c.mode,c),dt=c.dt??0,motion=c.motion??1,speed=c.speed??0,tumbling=!!c.tumbling,kerb=Math.max(0,Math.min(1,c.kerb??0));
  // The kerb's jolt keeps its own clock (paused: held where it is).
  if(!this.ready||dt>=1){this.kick=0;this.kerb=kerb;}
  else if(dt>0){this.clock=(this.clock+dt)%100;this.kick=Math.min(1,this.kick*Math.exp(-dt*KERB_JOLT.decay)+Math.max(0,kerb-this.kerb)*1.6);this.kerb=kerb;}
  // Rolling over eases in and out (a step of the slip term or of the spring's rate turned the view in one frame).
  if(!this.ready||dt>=1)this.tumble=tumbling?1:0;else if(dt>0)this.tumble+=((tumbling?1:0)-this.tumble)*(1-Math.exp(-dt*TUMBLE_RATE));
  // Past about 70° of slip (a spin, reversing) it lets go and stays behind the nose instead of swinging round;
  // the slip counts fully from 7 m/s and fades out by 3 (sliding to a halt, donuts), never switched on or off.
  const slip=wrap((c.travel??c.heading)-c.heading),aim=c.heading+slip*.45*clamp((Math.abs(slip)-.06)/.3,0,1)*clamp((1.6-Math.abs(slip))/.6,0,1)*clamp((speed-3)/4,0,1)*(1-this.tumble);
  if(!this.ready||dt>=1){
   this.yaw.x=aim;this.yaw.v=0;this.pitch.x=c.pitch??0;this.pitch.v=0;this.pull.x=this.pull.v=0;this.lift.x=c.heave??0;this.lift.v=0;this.side=0;this.punch=0;this.ready=true;
  }else if(dt>0){
   const from=aim+wrap(this.yaw.x-aim);this.yaw.x=from;spring(this.yaw,aim,YAW_OMEGA+(2.5-YAW_OMEGA)*this.tumble,dt);
   const lag=this.yaw.x-aim;
   if(Math.abs(lag)>MAX_LAG){const edge=aim+Math.sign(lag)*MAX_LAG,most=Math.abs(wrap(c.heading-this.heading))+CATCH_RATE*dt;this.yaw.x+=clamp(edge-this.yaw.x,-most,most);this.yaw.v=0;}
   spring(this.pitch,c.pitch??0,PITCH_OMEGA,dt);
   // Pulling away the camera falls back a little, braking hard it closes in (the car's weight against the view).
   spring(this.pull,clamp((c.longAccel??0)*.05,-.32,.45)*motion,PULL_OMEGA,dt);
   // Bumps and kerbs lift the car a moment before the camera.
   spring(this.lift,c.heave??0,LIFT_OMEGA,dt);
   // Look into the corner: the aim slides toward the inside with the cornering force (yaw rate times speed),
   // by the same angle from every frame (up to about 6°).
   const side=clamp((c.yawRate??0)*speed*.075,-1.6,1.6)*(.5+.5*motion)*(f.back+f.ahead)/14.3;this.side+=(side-this.side)*(1-Math.exp(-dt*LOOK_RATE));
   if((c.gear??0)>this.gear&&this.gear>=1&&(c.longAccel??0)>1.2)this.punch=1;this.punch*=Math.exp(-dt*3);
  }
  this.gear=c.gear??0;this.heading=c.heading;
  const keep=c.keep??1,o=this.out;
  o.back=f.back*keep+this.pull.x;o.up=f.up*dollyUp(keep);o.ahead=f.ahead;o.lookUp=f.lookUp;o.yaw=this.yaw.x;o.pitch=this.pitch.x;
  o.lift=clamp(this.lift.x-(c.heave??0),-.3,.3);o.side=this.side;o.pull=this.pull.x;o.lag=wrap(this.yaw.x-aim);
  o.jolt=kerbJolt(this.clock,this.kerb,this.kick,motion);
  return o;
 }
}

// Vibration as small turns of the camera (rad: pitch, yaw, roll), never moving the eye: a fine buzz growing
// with the share of the car's top speed, a low buffet near it, grass (rough), kerbs (kerb) and a hit (impact).
// motion: 0 (reduced motion, Desligado) stills it all.
export function vibration(t,{u=0,motion=1,rough=0,kerb=0,impact=0}={},out={pitch:0,yaw:0,roll:0}){
 if(motion<=0){out.pitch=out.yaw=out.roll=0;return out;}
 const fast=clamp((u-.45)/.5,0,1),buzz=motion*(.0026*fast**1.5+.006*rough+.0045*kerb+.022*impact),buffet=motion*.0011*clamp((u-.62)/.3,0,1);
 const a=Math.sin(t*71)*.5+Math.sin(t*112.5+1.3)*.32+Math.sin(t*149+2.1)*.18,b=Math.sin(t*83+.4)*.55+Math.sin(t*131+2.7)*.45,c=Math.sin(t*97+1.1)*.6+Math.sin(t*61+.2)*.4;
 out.pitch=buzz*a+buffet*Math.sin(t*10.7);out.yaw=buzz*.55*b+buffet*.7*Math.sin(t*14.4+.9);out.roll=buzz*.45*c;
 return out;
}

// Where the car's outline (carPoints) lands on screen (fractions of width and height, from the top left), for a
// camera at eye looking at target with vertical lens fov (deg). Car pose: position p (ground point), forward and
// right unit vectors (y up). For the framing checks; main.js measures the real camera with three.js.
export function screenBox({eye,target,fov,aspect},{p,forward,right},points){
 const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],norm=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const z=norm(sub(target,eye)),x=norm(cross(z,[0,1,0])),y=cross(x,z),t=Math.tan(rad(fov)/2);
 let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 for(const [along,left,h] of points){
  const w=[p[0]+forward[0]*along-right[0]*left,p[1]+h,p[2]+forward[2]*along-right[2]*left],d=sub(w,eye),depth=dot(d,z);
  if(depth<=.01)return null;
  const sx=.5+dot(d,x)/depth/t/aspect/2,sy=.5-dot(d,y)/depth/t/2;
  x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,sy);y1=Math.max(y1,sy);
 }
 return {x0,x1,y0,y1,width:x1-x0,height:y1-y0};
}
// Where the horizon straight ahead (a level ray under the view's axis) crosses the screen, as a fraction of its
// height from the top, for the same camera: the roof must sit under it or a car ahead hides behind ours.
export function horizonY({eye,target,fov}){
 const d=[target[0]-eye[0],target[1]-eye[1],target[2]-eye[2]];
 return .5+d[1]/Math.hypot(d[0],d[2])/Math.tan(rad(fov)/2)/2;
}
// The frame's eye and aim for a car at rest on a level road heading along forward (for the checks).
export function framePose(mode,{p=[0,0,0],forward=[1,0,0],body=null,aspect=REFERENCE_ASPECT,keep=1}={}){
 const f=frameFor(mode,{body,aspect}),back=f.back*keep,up=f.up*dollyUp(keep);
 return {eye:[p[0]-forward[0]*back,p[1]+up,p[2]-forward[2]*back],target:[p[0]+forward[0]*f.ahead,p[1]+f.lookUp,p[2]+forward[2]*f.ahead]};
}
