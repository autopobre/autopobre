import {GEAR_RPM_PER_KMH,REDLINE_RPM,SHIFT_UP_RPM} from './physics.js';
// Câmbio manual (the Controles tab): the gear the player asks for, which physics.js engages (input.gear).
// The keyboard (X up, Z down), the controller (X up, A down: pad-bindings.js) and a wheel's paddles or sequential lever
// step through R, 1st to 5th; an H shifter puts in the gear its lever is in, neutral between slots.
export const TOP_GEAR=5;
// A paddle never throws the engine past this on a downshift (it stays in gear); an H lever can.
const DOWNSHIFT_RPM=REDLINE_RPM+150,REVERSE_KMH=5;
const kmhOf=car=>Math.hypot(car?.vx??0,car?.vy??0)*3.6;
export class ManualGearbox {
 constructor(){this.gear=1;this.lever=undefined;}
 // The player takes the car over (a race start, the recon lap's autopilot, the cool-down after the
 // flag): the gear it is in, or the H lever's when there is one.
 sync(car,lever){this.lever=lever;this.gear=lever!==undefined?lever??0:Number.isInteger(car?.gear)&&car.gear>=-1&&car.gear<=TOP_GEAR?car.gear:1;}
 up(){if(this.gear<TOP_GEAR)this.gear=this.gear<1?1:this.gear+1;return this.gear;}
 // Down a gear unless the engine would over-rev; from 1st (or neutral) to reverse only nearly stopped.
 down(car){
  if(this.gear>1){if(kmhOf(car)*(car?.mechanics?.gears??GEAR_RPM_PER_KMH)[this.gear-1]<=DOWNSHIFT_RPM)this.gear--;}
  else if(this.gear>=0&&kmhOf(car)<REVERSE_KMH)this.gear=-1;
  return this.gear;
 }
 // An H shifter's slot (1-5, -1 reverse, null between slots, undefined when there is none): moving
 // the lever engages its gear; a lever left where it is lets the paddles or keys shift too.
 setLever(slot){if(slot===this.lever)return;this.lever=slot;if(slot!==undefined)this.gear=slot??0;}
}
// Câmbio automático with the player's say (the team's pedido of 10-22: the controller's X and A, also the keys and a
// wheel's paddles): a gear up or down goes in at once and stays AUTO_HOLD seconds, since the automatic would undo it at
// once (an upshift drops the revs under its downshift point); held, it still shifts up at its own point, never to the
// limiter. Then the automatic carries on from there. Never neutral or reverse (Q, or the brake at rest, backs up).
export const AUTO_HOLD=3;
export class AutoShift {
 constructor(){this.gear=null;this.left=0;}
 get holding(){return this.gear!==null;}
 // A shift asked for: up to 5th, down unless the engine would over-rev (then nothing, as in the manual).
 ask(car,step){
  const from=this.gear??(car?.gear>0?car.gear:1),gears=car?.mechanics?.gears??GEAR_RPM_PER_KMH;
  const to=step>0?Math.min(TOP_GEAR,from+1):from>1&&kmhOf(car)*gears[from-1]<=DOWNSHIFT_RPM?from-1:from;
  if(to===from)return null;
  this.gear=to;this.left=AUTO_HOLD;return to;
 }
 // Each physics step: the gear held (undefined: the automatic's own). Backing up lets it go.
 hold(car,dt,reverse){
  if(this.gear===null)return undefined;
  this.left-=dt;if(this.left<=0||reverse){this.cancel();return undefined;}
  const gears=car?.mechanics?.gears??GEAR_RPM_PER_KMH;
  if(this.gear<TOP_GEAR&&kmhOf(car)*gears[this.gear]>SHIFT_UP_RPM)this.gear++;
  return this.gear;
 }
 // Let go (a reset, the manual chosen): whether it was holding.
 cancel(){const was=this.gear!==null;this.gear=null;this.left=0;return was;}
}
