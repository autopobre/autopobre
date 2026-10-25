// The pilot's controls on each lap that goes online (recordes-online.js), beside its ghost (ghost-lap.js). The server
// checks that they explain the lap and logs their rhythm, to tell a pilot's hands from a program's
// (conta-cloudflare/src/comandos.js reads this format back). Only the build with accounts carries this.
// - steps: what the physics got on every 1/120 s step of the lap's clock (main.js input()): throttle, brake,
//   steering (right minus left), the handbrake and reverse, the gear a manual gearbox holds, the clutch. Kept as the
//   changes only: a keyboard's lap is a few hundred, a controller's a few thousand.
// - keys: the driving keys as the keyboard sent them (the instant, which, pressed or let go, and whether a person's
//   keyboard sent it: a page's script cannot make a trusted key), auto-repeats only counted.
// - dev: on how many steps each device drove (keyboard, touch, controller, wheel), and how many moved the car with
//   none of them.
export const STEP_RATE=120;
// Keys by what they do (the player's own keys read as these: key-bindings.js), and the most a lap keeps (9 minutes of
// Pampulha tapped ten times a second).
const ACTIONS=Object.freeze({KeyW:0,ArrowUp:0,KeyS:1,ArrowDown:1,KeyA:2,ArrowLeft:2,KeyD:3,ArrowRight:3,Space:4,KeyN:4,KeyQ:5});
const MAX_KEYS=8000,MAX_CHANGES=200000;
// The text a lap's controls may take, and the strides that thin a long lap to fit it (a controller's 9-minute lap).
export const INPUT_CHARS=80000,STRIDES=Object.freeze([1,2,4,8]);
const quantize=c=>[Math.round(clamp01(c.throttle)*100),Math.round(clamp01(c.brake)*100),Math.round((clamp01(c.right)-clamp01(c.left))*100),
 (c.handbrake?1:0)|(c.reverse?2:0),Number.isInteger(c.gear)&&c.gear>=-1&&c.gear<=9?c.gear:-2,Math.round(clamp01(c.clutch)*100)];
function clamp01(x){return Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;}
const NONE=Object.freeze([0,0,0,0,-2,0]);

export class LapInputs {
 // now(): the page's clock (ms), as the keys' timeStamp counts; target: where the keys are heard.
 constructor({now=()=>performance.now(),target=globalThis.document}={}){
  this.now=now;this.reset();
  target?.addEventListener?.('keydown',e=>this.key(e,true),true);target?.addEventListener?.('keyup',e=>this.key(e,false),true);
 }
 reset(){this.lapStart=null;this.last=null;this.n=0;this.changes=[];this.state=NONE;this.keys=[];this.repeats=0;this.wall=0;this.dev=[0,0,0,0,0];this.full=false;}
 key(e,down){
  const a=ACTIONS[e.code];if(a===undefined||this.lapStart===null)return;
  if(e.repeat){this.repeats++;return;}
  const at=Number.isFinite(e.timeStamp)&&e.timeStamp>0?e.timeStamp:this.now();
  if(this.keys.length<MAX_KEYS)this.keys.push([Math.max(0,Math.round((at-this.wall)*10)),a|(down?8:0)|(e.isTrusted?16:0)]);else this.full=true;
 }
 // After each physics step (main.js recordGhost, before the ghost's). Returns the controls of the lap the step
 // finished, as the ghost recorder sees laps: the step onto the line is the old lap's, a car put back starts over,
 // and steps with the clock stopped (the 3-2-1, a pause) are not the lap's. sources(): main.js inputSources.
 step(car,command,sources=()=>0){
  const t=car.clock-car.lapStart;
  if(car.lapStart!==this.lapStart||this.last===null||t<this.last-1e-9){
   const crossed=this.lapStart!==null&&this.last!==null&&car.lapStart>this.lapStart;
   if(crossed)this.push(command,sources());
   const done=crossed?this.finish():null;
   this.begin(car,t);return done;
  }
  if(t>this.last+1e-9)this.push(command,sources());
  this.last=t;return null;
 }
 begin(car,t){this.lapStart=car.lapStart;this.last=t;this.n=0;this.changes=[];this.state=NONE;this.keys=[];this.repeats=0;this.wall=this.now();this.dev=[0,0,0,0,0];this.full=false;}
 push(command,src){
  const q=quantize(command??{});
  if(q.some((x,i)=>x!==this.state[i])){if(this.changes.length<MAX_CHANGES)this.changes.push([this.n,q]);else this.full=true;this.state=q;}
  for(let d=0;d<4;d++)if(src&1<<d)this.dev[d]++;
  if(!src&&(q[0]||q[1]||q[2]||q[3]))this.dev[4]++;
  this.n++;
 }
 // The lap's controls as they go online, or null (too long to keep whole: no lap for the records then).
 finish(){
  if(this.full||!this.n)return null;
  const keys=packKeys(this.keys);
  for(const s of STRIDES){const data=packSteps(this.changes,this.n,s);if(data.length+keys.length<=INPUT_CHARS)return {v:1,n:this.n,s,data,keys,r:this.repeats,dev:[...this.dev]};}
  return null;
 }
}

// The steps at one in `stride`: each a change from the one kept before it, as a gap (in kept steps, a varint), which
// values changed (a byte of bits), then those values (throttle, brake and clutch 0-100; steering -100-100; handbrake 1 and
// reverse 2; the gear, -2 for none). The lap starts with all at rest.
export function packSteps(changes,n,stride=1){
 const out=[],units=Math.ceil(n/stride);let state=NONE,at=-1,c=0,current=NONE;
 for(let u=0;u<units;u++){
  const step=u*stride;while(c<changes.length&&changes[c][0]<=step)current=changes[c++][1];
  if(current===state)continue;
  const mask=current.reduce((m,x,i)=>x!==state[i]?m|1<<i:m,0);if(!mask)continue;
  varint(out,u-at-1);out.push(mask);for(let i=0;i<6;i++)if(mask&1<<i)out.push(current[i]&255);
  state=current;at=u;
 }
 return toBase64(out);
}
// The keys: the time from the one before (tenths of a millisecond, a varint), then which (0 throttle, 1 brake, 2 left,
// 3 right, 4 handbrake, 5 reverse) + 8 pressed + 16 a person's keyboard.
export function packKeys(keys){
 const out=[];let before=0;
 for(const [t,b] of keys){varint(out,Math.max(0,t-before));out.push(b);before=Math.max(before,t);}
 return toBase64(out);
}
function varint(out,x){while(x>127){out.push(x&127|128);x=Math.floor(x/128);}out.push(x);}
function toBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=0x8000)text+=String.fromCharCode.apply(null,bytes.slice(i,i+0x8000));return btoa(text);}
