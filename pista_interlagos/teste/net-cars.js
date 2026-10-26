// Multiplayer (multiplayer.js): a car's state on the wire and the remote cars it drives.
// A remote car is a real TestCar that is never stepped. Every physics step puts it where its
// owner's last state says it is by now (the state's age: the network delay plus the time since
// it arrived, carried on along the arc of its turn at its speed and fore-aft acceleration), on this
// window's own ground, and a fading correction hides the jump when a fresher state disagrees
// (the netcode study of 10-07, reports/Netcode em jogos de corrida.md, steps 1, 2, 4 and 5).
// No DOM here: testar_multiplayer.mjs runs it in Node.
import {clamp,wrap,CG_HEIGHT} from './physics.js';
const WHEEL_RADIUS=.31595,TAU=2*Math.PI;
// How far ahead a state is carried at full speed (s); past it the car runs on, slowing with RUN_ON (s), instead of
// standing there until a late state makes it jump (a resend of the TCP under it takes 200 ms or more).
export const PREDICT_AHEAD=.35;
const RUN_ON=.5;
// A correction fades slowly while small (under CALM metres: SMOOTH_CALM s) and quickly while large (over BIG: SMOOTH_FAST
// s), as Fiedler's state synchronisation does; past SNAP metres, or SNAP_TIME seconds at the car's speed, it jumps.
const SMOOTH_CALM=.3,SMOOTH_FAST=.1,CALM=.25,BIG=1,SNAP=6,SNAP_TIME=.15;
// The carry bends with the car's turn (up to TURN rad/s) and follows its fore-aft acceleration (up to ACCEL m/s²).
const TURN=1.5,ACCEL=12;
// On its wheels (its owner's clearance over the ground up to CG_HEIGHT+AIR) the car stands on this window's ground at that
// clearance, wherever the carry took it (the team's report, 10-07: cars under the track uphill, over it downhill); off
// them, its height is carried on under gravity, never below the ground.
const AIR=.25,G=9.81;
// The time a state is carried by at an age: all of it up to PREDICT_AHEAD, then less and less.
export const reach=age=>age<=PREDICT_AHEAD?age:PREDICT_AHEAD+RUN_ON*(1-Math.exp(-(age-PREDICT_AHEAD)/RUN_ON));
// Where a state goes in t seconds: [dx, dy, turn]. Its speed changes by its acceleration (it never backs up), along an
// arc of its turn.
export function carry(s,t){
 const v=Math.hypot(s.vx,s.vy),w=clamp(s.yaw,-TURN,TURN),th=w*t;if(v<1e-3||t<=0)return [0,0,th];
 const a=clamp(s.longAccel,-ACCEL,ACCEL),tt=a<0?Math.min(t,-v/a):t,d=v*tt+.5*a*tt*tt,ux=s.vx/v,uy=s.vy/v;
 if(Math.abs(th)<1e-4)return [ux*d,uy*d,th];
 const k=d/t/w,sn=Math.sin(th),cs=1-Math.cos(th);
 return [k*(sn*ux-cs*uy),k*(cs*ux+sn*uy),th];
}
export const CAR_FIELDS=Object.freeze(['x','y','z','heading','pitch','roll','vx','vy','vz','yaw','pitchRate','rollRate','steer','spin','rearSpin','rpm','gear','brake','throttle','latAccel','longAccel','rearSlipSpeed','progress','laps','finished','finishTime','best']);
// Accepted range of each field; a message with anything outside is dropped whole.
// finished: 0 racing, 1 past the flag, 2 retired (a bot's breakdown, RaceField).
const RANGE={x:5e4,y:5e4,z:5e3,heading:4,pitch:60,roll:60,vx:250,vy:250,vz:250,yaw:40,pitchRate:80,rollRate:80,steer:2,spin:7,rearSpin:7,rpm:[0,12000],gear:[-1,9],brake:[0,1],throttle:[0,1],
 latAccel:500,longAccel:500,rearSlipSpeed:300,progress:[-1e3,1e7],laps:[0,999],finished:[0,2],finishTime:[-1,1e6],best:[-1,1e5]};
const LIMITS=CAR_FIELDS.map(k=>Array.isArray(RANGE[k])?RANGE[k]:[-RANGE[k],RANGE[k]]);
const round=v=>Math.round(v*1000)/1000;
// extra: what the car does not know itself (race distance, the flag, the pedals). still sends a
// car at rest (paused, or held on the grid) so the others do not carry it on.
export function packCar(car,{progress=0,finished=false,retired=false,finishTime=null,brake=0,throttle=0,still=false}={}){
 const k=still?0:1,turn=a=>((a%TAU)+TAU)%TAU;
 const v={x:car.x,y:car.y,z:car.z??car.surface?.z??0,heading:wrap(car.heading),pitch:car.pitch??0,roll:car.roll??0,vx:car.vx*k,vy:car.vy*k,vz:(car.vz??0)*k,yaw:(car.yaw??0)*k,
  pitchRate:(car.pitchRate??0)*k,rollRate:(car.rollRate??0)*k,steer:car.steerVisual??car.steer??0,spin:turn(car.spin??0),rearSpin:turn(car.rearSpin??0),rpm:car.rpm??0,gear:car.gear??0,
  brake,throttle,latAccel:car.latAccel??0,longAccel:car.longAccel??0,rearSlipSpeed:car.rearSlipSpeed??0,progress,laps:car.laps??0,finished:retired?2:finished?1:0,finishTime:finishTime??-1,best:car.best??-1};
 return CAR_FIELDS.map((key,i)=>round(clamp(Number.isFinite(v[key])?v[key]:0,...LIMITS[i])));
}
// The state object from a received array, or null for anything malformed.
export function readCar(values){
 if(!Array.isArray(values)||values.length!==CAR_FIELDS.length)return null;
 const s={};
 for(let i=0;i<CAR_FIELDS.length;i++){const v=values[i];if(typeof v!=='number'||!Number.isFinite(v)||v<LIMITS[i][0]||v>LIMITS[i][1])return null;s[CAR_FIELDS[i]]=v;}
 s.retired=s.finished>=1.5;s.finished=s.finished>=.5&&!s.retired;s.finishTime=s.finishTime<0?null:s.finishTime;s.best=s.best<0?null:s.best;return s;
}
export class RemoteCar {
 // car: where the remote car stands until its owner is first heard (a grid slot, at rest), its race
 // distance and whether it is past the flag.
 constructor(car=null,{progress=0,finished=false,finishTime=null}={}){
  this.state=car?readCar(packCar(car,{progress,finished,finishTime,still:true})):null;this.raw=null;this.age=0;this.seq=-1;this.err=[0,0,0,0];this.shown=null;
  // (its owner's clearance over the ground, read from the state where it was sent: drive; the jumps and the largest
  // correction, for the network panel and the checks)
  this.clear=null;this.hint=null;this.snaps=0;this.worst=0;
 }
 // age: how old the state already is (s). Older or repeated messages (seq) are ignored.
 receive(state,{age=0,seq=0,raw=null}={}){
  if(!state||seq<=this.seq)return false;
  this.seq=seq;this.state=state;this.raw=raw;this.age=clamp(age,0,5);this.clear=null;
  if(this.shown){
   const p=this.predict(),e=[this.shown[0]-p[0],this.shown[1]-p[1],0,wrap(this.shown[3]-p[3])],off=Math.hypot(e[0],e[1]);
   this.worst=Math.max(this.worst,off);
   if(off>this.snapDistance()||Math.abs(e[3])>1){this.err=[0,0,0,0];this.snaps++;}else this.err=e;
  }
  return true;
 }
 snapDistance(){const s=this.state;return Math.max(SNAP,SNAP_TIME*Math.hypot(s.vx,s.vy));}
 // x, y, z and heading carried on from the state to now (z only for the record: drive stands the car on the ground).
 predict(){const s=this.state,[dx,dy,turn]=carry(s,reach(this.age));return [s.x+dx,s.y+dy,s.z,s.heading+turn];}
 // One physics step: place the car; returns its owner's pedals for the brake lights and sound.
 drive(car,dt){
  const s=this.state;if(!s)return {throttle:0,brake:0,left:0,right:0};
  this.age+=dt;
  {const e=Math.hypot(this.err[0],this.err[1]),tau=e<=CALM?SMOOTH_CALM:e>=BIG?SMOOTH_FAST:SMOOTH_CALM+(SMOOTH_FAST-SMOOTH_CALM)*(e-CALM)/(BIG-CALM),fade=Math.exp(-dt/tau);for(let i=0;i<4;i++)this.err[i]*=fade;}
  const p=this.predict(),t=reach(this.age),tr=Math.min(this.age,.1);
  // The first state or a jump may land where the lap passes over itself (a viaduct over a street): the stretch is looked
  // for at the state's height there (physics.js levelNearest), not the nearest in plan.
  const jumped=!this.shown||Math.hypot(p[0]+this.err[0]-this.shown[0],p[1]+this.err[1]-this.shown[1])>this.snapDistance();
  car.x=p[0]+this.err[0];car.y=p[1]+this.err[1];car.heading=p[3]+this.err[3];
  if(jumped&&car.nearest)car.index=car.nearest(car.x,car.y,true,null,s.z).i;
  car.surface=car.sample(car.x,car.y);car.index=car.surface.i;
  // Its owner's clearance, read once a state where that state was sent (near the car: the last stretch found there).
  if(this.clear===null){const q=car.sample(s.x,s.y,jumped||this.hint===null?car.nearest(s.x,s.y,true,null,s.z).i:this.hint);this.hint=q.i;this.clear=s.z-q.z;}
  if(this.clear<=CG_HEIGHT+AIR)car.z=car.surface.z+Math.max(this.clear,CG_HEIGHT-.25);
  else{const ta=Math.min(this.age,1);car.z=Math.max(car.surface.z+CG_HEIGHT*.8,s.z+s.vz*ta-.5*G*ta*ta);}
  car.pitch=s.pitch+s.pitchRate*tr;car.roll=s.roll+s.rollRate*tr;
  Object.assign(car,{vx:s.vx,vy:s.vy,vz:s.vz,yaw:s.yaw,pitchRate:s.pitchRate,rollRate:s.rollRate,steer:s.steer,steerVisual:s.steer,steerInput:s.steer,rpm:s.rpm,gear:s.gear,
   latAccel:s.latAccel,longAccel:s.longAccel,rearSlipSpeed:s.rearSlipSpeed,laps:s.laps,best:s.best});
  const rolled=(s.vx*Math.cos(s.heading)+s.vy*Math.sin(s.heading))*t/WHEEL_RADIUS;car.spin=s.spin+rolled;car.rearSpin=s.rearSpin+rolled;
  car.stepX=car.x;car.stepY=car.y;car.updateAxes();
  this.shown=[car.x,car.y,car.z,car.heading];
  return {throttle:s.throttle,brake:s.brake,left:0,right:0,handbrake:0,reverse:0};
 }
}
