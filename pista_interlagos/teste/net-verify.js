// The host measures a guest's race from the positions it accepts. A guest supplies controls and
// poses, never the lap count, progress, best lap or finish time used by the rest of the room.
// This is a plausibility check, not an authoritative physics server: a modified client can still
// drive a plausible path. Keep the motion margin generous for collisions and delayed packets.
import {TestCar} from './physics.js';
import {packCar,readCar} from './net-cars.js';
import {branchPoint} from './branch-lane.js';

const SPEED=120,JITTER=45,MAX_GAP=5,STEP=8;
export class GuestRaceState {
 constructor(rival,{time=0,laps,lead=0}={}){
  this.probe=new TestCar(rival.car.data);this.laps=laps;this.lead=lead;
  this.finished=false;this.finishTime=null;this.rebase(rival,time);
 }
 // Only the host's own simulated car may establish a new baseline: its grid spot, or the car it
 // kept rolling/towed while the connection was gone. No received state reaches this method.
 rebase(rival,time){
  const car=rival.car,p=this.probe;
  Object.assign(p,car.lapBooks(),{x:car.x,y:car.y,z:car.z,index:car.index,clock:time});
  p.checkpoints=new Set(car.checkpoints);p.excursion=car.excursion?{...car.excursion}:null;
  p.surface=p.sample(p.x,p.y);this.at=time;this.credit=JITTER;
  this.finished=!!rival.finished;this.finishTime=rival.finishTime??null;
  this.retired=!!rival.stop?.flagged;
 }
 // Give the host's actual car the lap book as well: if the pilot disappears, the host's physics
 // continues these same checkpoints and times while that car coasts towards the grass.
 sync(car,time=this.probe.clock){Object.assign(car,this.probe.lapBooks(),{clock:time,excursion:this.probe.excursion?{...this.probe.excursion}:null});}
 receive(s,time,{running=true}={}){
  const p=this.probe,L=p.data.meta.reconstructed_xy_m,dt=Math.max(0,time-this.at);
  const distance=Math.hypot(s.x-p.x,s.y-p.y),height=Math.abs(s.z-p.z),travel=Math.hypot(distance,height);
  const budget=Math.min(JITTER+SPEED*MAX_GAP,this.credit+SPEED*Math.min(dt,MAX_GAP));
  const stepLimit=JITTER+SPEED*Math.min(dt,MAX_GAP);
  // R puts a car at rest on the centre of its current track station, even far out on the grass (on a
  // branch road, data.branches: of the branch's nearest station, physics.js recover). Recognize only
  // that particular recovery target; it gives no new checkpoints or crossed line.
  const fork=p.forks&&p.surface.branch!=null?branchPoint(p.forks[p.surface.branch].geo,p.surface.branchS):null;
  const station=fork?[0,fork.x,fork.y,fork.z]:p.a[p.index],recovered=running&&distance>12&&Math.hypot(s.vx,s.vy,s.vz)<1
   &&Math.hypot(s.x-station[1],s.y-station[2])<2&&Math.abs(s.z-station[3])<4;
  if(Math.hypot(s.vx,s.vy)>SPEED||Math.abs(s.vz)>SPEED||(!running&&distance>2)
   ||!recovered&&(travel>budget||travel>stepLimit))return null;
  // A stopped race cannot advance through a stream of small packets. The last position may be
  // delivered after the pause (the jitter allowance), but no fresh travel budget or lap time accrues.
  if(!running&&(Math.hypot(s.vx,s.vy)>1||height>2))return null;
  this.credit=Math.max(0,budget-(recovered?0:travel));this.at=time;
  const before=p.surface,start={x:p.x,y:p.y},elapsed=p.clock;
  // Subdivide the path so a delayed packet that straddles the line or a checkpoint still observes
  // it. Sampling the chord also applies the existing cut/off-road rules, using the host's track.
  const steps=Math.max(1,Math.ceil(distance/STEP));
  for(let i=1;i<=steps;i++){
   const previous=p.surface,k=i/steps;p.x=start.x+(s.x-start.x)*k;p.y=start.y+(s.y-start.y)*k;
   p.surface=p.sample(p.x,p.y);p.index=p.surface.i;p.clock=elapsed+(time-elapsed)*k;
   if(running&&!recovered&&!this.finished&&!this.retired){
    p.trackLap(previous,p.surface,distance/steps,Math.hypot(s.vx,s.vy));
    if(p.laps>=this.laps){this.finished=true;this.finishTime=p.clock;}
   }
  }
  p.z=s.z;
  // Recovery does not book a crossing. Keep the lap's off-road accounting from the last observed
  // point; subsequent normal driving continues it, just as after TestCar.recover on the guest.
  if(recovered&&Math.abs(p.surface.s-before.s)>L/2)p.lapValid=false;
  const progress=(p.awaitingStart?-L:p.laps*L)+p.surface.s+this.lead;
  const raw=packCar({...s,laps:p.laps,best:p.best},{progress,finished:this.finished,retired:this.retired,
   finishTime:this.finishTime,brake:s.brake,throttle:s.throttle,still:!running});
  return {state:readCar(raw),raw};
 }
}
