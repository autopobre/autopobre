// Arena de Drift's "Ver a IA fazer" (user 10-12): a pilot that drives a challenge with the player's own keys (↑ ← →),
// shown on screen as it presses them, so the player sees how it is done. It never touches the physics: it only chooses
// keys, every 0.1 s, as a person tapping them would.
// For the cone in the middle it looks ahead: from a copy of the car (drift-physics.js DriftCar, no world: nothing to
// knock over) it tries the six choices (↑ on or off, ← / none / →) held for 0.9 s and keeps the one whose drift stays
// best on a 6 m circle round the cone, sideways at about 31°, with speed (the tune it uses: throttle 65%, wheel 22°).
// In a test that held 4.9 laps in 30 s; it presses ↑ about 38% of the time, leaves the wheel alone 70%.
import {DriftCar} from './drift-physics.js';
import {ArenaWorld} from './drift-arena-world.js';
import {cleanLayout} from './drift-arena.js';

const STEP=1/120,DECIDE=12;
// The demonstrations: the tune each uses (drift-physics.js tune: throttle share, the wheel's angle at rest) and a line
// for the screen. A pilot without `ahead` holds its keys.
export const AI_DEMOS=Object.freeze({
 zerinho:{tune:{throttle:1,steer:49},hold:{throttle:1,left:1,right:0},
  caption:'↑ e ← seguros o tempo todo: o carro gira ao lado do cone, longe dele.'},
 rosquinha:{tune:{throttle:.65,steer:22},ahead:{H:.9,R:6,B:.54,V:6.4,Rmin:3.9,wr:.8,wb:9.7,wv:.21,wlost:6,wspin:36},
  caption:'Toques no ↑ (só ~40% do tempo), volante quase sempre solto, → (para fora) quando a traseira passa do ponto.'}
});
const COMBOS=[];for(const throttle of [0,1])for(const turn of [-1,0,1])COMBOS.push({throttle,left:turn>0?1:0,right:turn<0?1:0});
// What the copy takes from the car: its moving state, never the track, the world or the body.
const SKIP=new Set(['data','a','world','posts','cliff','pitGeo','body','condition','checkpoints']);
function copyState(from,to){
 for(const [k,v] of Object.entries(from)){
  if(SKIP.has(k))continue;
  to[k]=Array.isArray(v)?v.map(e=>Array.isArray(e)?[...e]:e&&typeof e==='object'?{...e}:e)
   :v&&typeof v==='object'?(k==='axes'?{f:[...v.f],l:[...v.l],u:[...v.u],j:[...v.j]}:{...v}):v;
 }
}
export class ArenaAi{
 // car: the player's DriftCar; world: the arena's (where the cone is); id: the challenge (AI_DEMOS).
 constructor(car,world,id){
  this.car=car;this.world=world;this.id=id;this.def=AI_DEMOS[id];this.count=0;this.keys={throttle:0,left:0,right:0};
  if(this.def.ahead){this.shadow=new DriftCar(car.data);this.shadow.setBody(car.body);this.shadow.world=new ArenaWorld(cleanLayout({items:[]}));this.shadow.tune(this.def.tune);}
 }
 // The cone's spot (the first prop's place on the layout).
 get cone(){const p=this.world.props[0],item=p&&this.world.layout.items[p.item];return item?{x:item.x,y:item.y}:{x:0,y:0};}
 // One physics step's command: a new choice every 0.1 s.
 command(){
  if(this.count++%DECIDE===0)this.keys=this.def.hold?{...this.def.hold}:this.choose();
  return {left:this.keys.left,right:this.keys.right,throttle:this.keys.throttle,brake:0,reverse:0,handbrake:0};
 }
 // The keys it holds now, as a command (the engine's sound and the driver's hands follow them).
 last(){return {left:this.keys.left,right:this.keys.right,throttle:this.keys.throttle,brake:0,reverse:0,handbrake:0};}
 state(c,cone){
  const dx=c.x-cone.x,dy=c.y-cone.y,r=Math.hypot(dx,dy)||1e-6,ch=Math.cos(c.heading),sh=Math.sin(c.heading),v=c.vx*ch+c.vy*sh,lat=-c.vx*sh+c.vy*ch;
  return {r,beta:-Math.atan2(lat-1.117*c.yaw,Math.max(v,.3)),vt:(-c.vx*dy+c.vy*dx)/r};
 }
 choose(){
  const P=this.def.ahead,cone=this.cone,shadow=this.shadow;let best=null;
  for(const keys of COMBOS){
   copyState(this.car,shadow);let J=0;
   for(let k=0;k<P.H/STEP;k++){
    shadow.step({brake:0,reverse:0,handbrake:0,...keys},STEP);
    if(k%6===5){const s=this.state(shadow,cone);J+=P.wr*(s.r-P.R)**2+P.wb*(s.beta-P.B)**2+P.wv*Math.min(0,s.vt-P.V)**2+(s.r<P.Rmin?1e4:0)+(s.beta<.15?P.wlost:0)+(s.beta>1.5?P.wspin:0);}
   }
   if(!best||J<best.J)best={J,keys};
  }
  return best.keys;
 }
}
