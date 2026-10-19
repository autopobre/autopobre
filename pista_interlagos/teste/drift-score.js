// Arena de Drift's score: a drift is the car sliding sideways (the rear's slip angle past 10°, above 20 km/h);
// while it lasts it gathers points by its angle and speed, times a combo that grows the longer it is held and at
// each change of side, twice as many while a rear wheel is inside a painted zone (drift-arena-world.js), with a bonus
// when the front passes close to a clip. It is banked when the car straightens (0.7 s), lost when the car spins round or
// hits something hard. The challenges (CHALLENGES) read the same drift. No three.js: Node tests drive it.
import {CLIP_REACH} from './drift-arena.js';
import {keyName} from './key-bindings.js';

const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// spinAngle: past it the car has spun round (a donut's tail swings past 90° and still counts).
export const DRIFT=Object.freeze({minAngle:10,minKmh:20,donutYaw:1.2,donutKmh:11,spinAngle:125,grace:.7,crash:3.5,comboStep:2,comboMax:5,
 // A clip's bonus at the line, a zone's multiplier.
 clipBonus:250,zoneFactor:2});
// The rear axle's slip angle (degrees, -180..180: the travel against the nose, the sign telling the side the tail is
// out) and the car's speed. Past 125° (DRIFT.spinAngle) the car has spun round.
export function slip(car){
 const c=Math.cos(car.heading),s=Math.sin(car.heading),v=car.vx*c+car.vy*s,lat=-car.vx*s+car.vy*c,speed=Math.hypot(car.vx,car.vy);
 return {angle:speed>1?Math.atan2(lat-1.117*car.yaw,v)*180/Math.PI:0,kmh:speed*3.6};
}
// Points per second for an angle (degrees) at a speed (km/h): 40° at 60 km/h is about 85.
export const driftRate=(angle,kmh)=>10*Math.pow(Math.max(0,angle)/10,1.15)*clamp(kmh/40,.3,2.4);

export class DriftScore{
 constructor(){this.total=0;this.best=0;this.reset();}
 reset(){this.drift=null;this.last=null;this.events=[];this.total=0;this.inZone=false;this.angle=0;this.kmh=0;this.wheels=[[0,0],[0,0]];this.clipNear=null;}
 // One physics step of the player's car on the arena (world: ArenaWorld). impact: the hardest knock this step.
 update(car,world,dt,impact=0){
  const {angle,kmh}=slip(car),abs=Math.abs(angle);this.angle=angle;this.kmh=kmh;
  // A donut (zerinho) counts too: the car itself barely moves (9 km/h) while its tail sweeps round, the rear axle sliding
  // past 11 km/h with the car turning faster than 1.2 rad/s (user 10-12: the donut happened and scored nothing).
  const rearKmh=Math.hypot(car.vx+car.yaw*1.117*Math.sin(car.heading),car.vy-car.yaw*1.117*Math.cos(car.heading))*3.6;
  const donut=Math.abs(car.yaw)>=DRIFT.donutYaw&&rearKmh>=DRIFT.donutKmh;this.donut=donut;
  const down=car.wheelsDown>=3,drifting=down&&(kmh>=DRIFT.minKmh||donut)&&abs>=DRIFT.minAngle&&abs<DRIFT.spinAngle;
  world.rearWheels(car,this.wheels);
  const zones=this.wheels.map(([x,y])=>world.zoneAt(x,y)),inZone=zones.some(Boolean);this.inZone=drifting&&inZone;
  const ch=Math.cos(car.heading),sh=Math.sin(car.heading),front=car.body.front,clip=world.nearestClip(car.x+ch*front,car.y+sh*front);this.clipNear=clip;
  const d=this.drift;
  if(d){
   // Spun round, or a hard knock: the drift is lost.
   if(down&&abs>=DRIFT.spinAngle&&kmh>6)return this.lose('Rodou!');
   if(impact>DRIFT.crash)return this.lose('Bateu!');
  }
  if(drifting){
   const g=this.drift??=this.begin(angle);g.grace=0;g.time+=dt;
   const side=Math.sign(angle);
   // A change of side at speed (a transition): the combo jumps.
   if(side!==g.side&&abs>15){g.side=side;g.transitions++;g.combo=Math.min(DRIFT.comboMax,g.combo+.5);this.event('transition',{combo:g.combo});}
   g.combo=Math.min(DRIFT.comboMax,Math.max(g.combo,1+Math.floor(g.time/DRIFT.comboStep)*.5));
   const rate=driftRate(abs,Math.max(kmh,rearKmh))*(inZone?DRIFT.zoneFactor:1);g.points+=rate*g.combo*dt;g.angleSum+=abs*dt;g.maxAngle=Math.max(g.maxAngle,abs);g.kmhSum+=kmh*dt;
   if(inZone){g.zoneTime+=dt;for(const z of zones)if(z)g.zones.add(z.zone.item);}
   if(clip&&clip.distance<=CLIP_REACH&&!g.clips.has(clip.clip.item)){
    const bonus=Math.round(DRIFT.clipBonus*(1-clip.distance/CLIP_REACH*.6)*g.combo);g.clips.add(clip.clip.item);g.points+=bonus;this.event('clip',{bonus,distance:clip.distance});
   }
  }else if(d){d.grace+=dt;if(d.grace>DRIFT.grace)this.bank();}
  return this.drift;
 }
 begin(angle){const d={points:0,time:0,combo:1,side:Math.sign(angle),transitions:0,zoneTime:0,zones:new Set(),clips:new Set(),angleSum:0,maxAngle:0,kmhSum:0,grace:0};this.event('start',{});return d;}
 bank(){
  const d=this.drift;if(!d)return null;this.drift=null;
  const points=Math.round(d.points);this.total+=points;this.best=Math.max(this.best,points);
  this.last={...d,points,ok:true,meanAngle:d.time?d.angleSum/d.time:0,meanKmh:d.time?d.kmhSum/d.time:0};this.event('bank',{points});return this.last;
 }
 lose(reason){
  const d=this.drift;this.drift=null;if(!d)return null;
  this.last={...d,points:0,lostPoints:Math.round(d.points),ok:false,reason,meanAngle:d.time?d.angleSum/d.time:0,meanKmh:d.time?d.kmhSum/d.time:0};this.event('lost',{reason,points:Math.round(d.points)});return null;
 }
 event(type,detail){this.events.push({type,...detail});if(this.events.length>20)this.events.shift();}
 takeEvents(){const e=this.events;this.events=[];return e;}
 info(){const d=this.drift;return {drifting:!!d,points:d?Math.round(d.points):0,combo:d?.combo??1,angle:+this.angle.toFixed(1),kmh:+this.kmh.toFixed(1),inZone:this.inZone,zoneTime:d?+d.zoneTime.toFixed(2):0,total:this.total,best:this.best,last:this.last&&{points:this.last.points,ok:this.last.ok,reason:this.last.reason??null,time:+this.last.time.toFixed(2)}};}
}

// The challenges: each races on its own layout (drift-arena.js PRESETS) and measures one thing per attempt; medals at
// three marks (higher is better). unit: how the value is written. spawn: where the car waits for it (R brings it back).
export const CHALLENGES=Object.freeze({
 // Donuts beside the cone (user 10-12): the car's own turns, sideways and without a break, near the cone and with it
 // standing. Held flat out with the wheel turned, a donut turns about a point under the car, 5-7 m to the side it is
 // turned to: start beside the cone and turn away from it.
 zerinho:{name:'Zerinho ao lado do cone',preset:'um_cone',spawn:{x:-5,y:0,heading:Math.PI/2},unit:'giros',digits:1,medals:[3,6,10],reach:14,
  goal:'Zerinhos sem parar ao lado do cone: segure ↑ e vire para o lado de longe do cone (←). Conta cada giro completo do carro de lado, sem derrubar o cone.'},
 // The hard one (user 10-12: "o difícil é controlar o carro e fazer o zerinho com o cone no meio"): laps round the cone,
 // sideways all along. A drift circle round it holds by itself for a second or two (about 6 m, 22 km/h, the tail at
 // 40°): the wheel turned AWAY from the cone (counter-steer), the throttle keeping the tail out.
 rosquinha:{name:'Rosquinha com o cone no meio',preset:'um_cone',spawn:{x:0,y:-12,heading:0},unit:'voltas',digits:1,medals:[1,3,5],reach:15,
  goal:'Dê voltas de lado em volta do cone, com o cone no meio do círculo. O segredo: o volante vai para FORA (contraesterço, uns 10-15°) e o acelerador segura a traseira; virar para o cone faz o carro passar por cima dele.'},
 oito:{name:'Oito nos cones',preset:'oito',spawn:{x:-55,y:-16,heading:0},unit:'laços',digits:0,medals:[2,4,6],
  goal:'Faça o oito em volta dos dois cones sem endireitar o carro: cada laço completo em volta de um cone conta, trocando de cone.'},
 canteiro:{name:'Rodas na zona',preset:'canteiros',spawn:{x:5,y:24,heading:Math.PI},unit:'s',digits:1,medals:[3,6,10],
  goal:'Contorne os canteiros de lado com as rodas de trás dentro da faixa amarela: o tempo na zona em um drift só.'},
 qualificacao:{name:'Classificação Auto-Pobre',preset:'campeonato',spawn:{x:48,y:34,heading:Math.PI},unit:'pontos',digits:0,medals:[50,70,85],
  goal:'Como numa etapa de drift: cruze a largada e faça o traçado de lado, zona norte, canteiro oeste e o clipe, troca de lado, canteiro leste e o clipe, zona sul. Os juízes dão nota de 0 a 100.'}
});
export const CHALLENGE_ORDER=Object.freeze(['zerinho','rosquinha','oito','canteiro','qualificacao']);
export const medalOf=(id,value)=>{const m=CHALLENGES[id].medals;return value>=m[2]?'ouro':value>=m[1]?'prata':value>=m[0]?'bronze':null;};
export const MEDAL_NAMES=Object.freeze({ouro:'Ouro',prata:'Prata',bronze:'Bronze'});

// One challenge under way. update() each physics step after DriftScore's; an attempt ends with a result
// {value, medal, ...}; `current` is the attempt's value so far.
export class ArenaChallenge{
 constructor(id,world){this.id=id;this.def=CHALLENGES[id];this.world=world;this.results=[];this.reset();}
 reset(){this.current=0;this.state='ready';this.sweep=0;this.loops=0;this.lastCone=null;this.coneSweep=0;this.zoneTime=0;this.run=null;this.message=this.def.goal;this.lastAngle=null;}
 finish(value,extra={}){
  const v=+value.toFixed(this.def.digits),result={value:v,medal:medalOf(this.id,v),...extra};this.results.push(result);this.lastResult=result;this.current=0;
  this.state='ready';this.sweep=this.loops=this.coneSweep=this.zoneTime=0;this.lastCone=null;this.run=null;this.lastAngle=null;return result;
 }
 // score: the DriftScore after its update this step. Returns a finished attempt's result, or null.
 update(car,score,dt,impact=0){return this[this.id](car,score,dt,impact);}
 // Donuts by the cone: the car's own turning while one drift lasts within reach of the cone; the cone down ends the try.
 zerinho(car,score){
  const cone=this.world.props[0];if(!cone)return null;
  const spot=this.world.layout.items[cone.item],near=Math.hypot(car.x-spot.x,car.y-spot.y)<=this.def.reach;
  if(cone.hit){this.lastAngle=null;if(this.state==='running')return this.finish(0,{reason:`Derrubou o cone. ${keyName('KeyR')} arruma.`});return null;}
  if(score.drift&&near){
   if(this.lastAngle!==null)this.sweep+=wrap(car.heading-this.lastAngle);this.lastAngle=car.heading;this.state='running';this.current=Math.abs(this.sweep)/(2*Math.PI);
   return null;
  }
  this.lastAngle=null;
  if(this.state==='running')return this.finish(Math.floor(Math.abs(this.sweep)/(2*Math.PI)*10)/10);
  return null;
 }
 // Laps round the cone, the cone in the middle: the angle the car sweeps round the cone's spot while one drift lasts
 // within reach of it; the cone down ends the try.
 rosquinha(car,score){
  const cone=this.world.props[0];if(!cone)return null;
  const spot=this.world.layout.items[cone.item],near=Math.hypot(car.x-spot.x,car.y-spot.y)<=this.def.reach;
  if(cone.hit){this.lastAngle=null;if(this.state==='running')return this.finish(0,{reason:`Derrubou o cone. ${keyName('KeyR')} arruma.`});return null;}
  const a=Math.atan2(car.y-spot.y,car.x-spot.x);
  if(score.drift&&near){
   if(this.lastAngle!==null)this.sweep+=wrap(a-this.lastAngle);this.lastAngle=a;this.state='running';this.current=Math.abs(this.sweep)/(2*Math.PI);
   return null;
  }
  this.lastAngle=null;
  if(this.state==='running')return this.finish(Math.floor(Math.abs(this.sweep)/(2*Math.PI)*10)/10);
  return null;
 }
 // Loops round alternate cones in one drift: 300° round a cone counts, then the next must be round the other.
 oito(car,score){
  const cones=this.world.props.slice(0,2);if(cones.length<2)return null;
  const near=cones.reduce((b,c)=>Math.hypot(car.x-c.x,car.y-c.y)<Math.hypot(car.x-b.x,car.y-b.y)?c:b),a=Math.atan2(car.y-near.y,car.x-near.x);
  if(score.drift){
   this.state='running';
   if(near!==this.lastCone){this.lastCone=near;this.coneSweep=0;this.lastAngle=a;}
   else{this.coneSweep+=wrap(a-this.lastAngle);this.lastAngle=a;}
   if(Math.abs(this.coneSweep)>=Math.PI*5/3&&near!==this.counted){this.loops++;this.counted=near;this.coneSweep=0;}
   this.current=this.loops;return null;
  }
  this.lastCone=null;this.counted=null;
  if(this.state==='running')return this.finish(this.loops);
  return null;
 }
 // Seconds with a rear wheel in a planter's zone during one drift.
 canteiro(car,score,dt){
  if(score.drift){this.state='running';if(score.inZone)this.zoneTime+=dt;this.current=this.zoneTime;return null;}
  if(this.state==='running'){const v=this.zoneTime;if(v>=.3)return this.finish(v);this.state='ready';this.zoneTime=0;this.current=0;}
  return null;
 }
 // A judged run, as a drift event's qualifying: from the start gate, each zone and clip in the layout's order
 // (the items' order: zones and planters wide, clips tight), until the last is passed and the drift ends.
 qualificacao(car,score,dt,impact){
  const w=this.world;
  if(!this.run){
   if(w.crossedGate(car.prevX??car.x,car.prevY??car.y,car.x,car.y)){
    const targets=w.layout.items.map((item,i)=>({item,i})).filter(({item})=>['zona','meia_lua','clip'].includes(item.kind));
    this.run={t:0,targets:targets.map(({item,i})=>({i,kind:item.kind,bins:new Array(item.kind==='clip'?1:20).fill(false),best:Infinity})),next:0,driftTime:0,since:null,angleSum:0,angleTime:0,
     knocked:w.knocked,walls:0,entryKmh:null,spun:false,stopped:0};
    this.state='running';this.message='Valendo! Siga a sequência de lado.';
   }
   return null;
  }
  const r=this.run;r.t+=dt;
  if(impact>DRIFT.crash)r.walls++;
  if(score.last&&!score.last.ok&&score.last.reason==='Rodou!'&&score.last!==r.seenLoss){r.seenLoss=score.last;r.spun=true;}
  const drifting=!!score.drift;
  // Zones and planters: which twentieths of their length a rear wheel crossed sideways; clips: the front's closest pass.
  if(drifting){
   r.angleSum+=Math.abs(score.angle)*dt;r.angleTime+=dt;
   for(const [x,y] of score.wheels){const z=w.zoneAt(x,y);if(!z)continue;const t=r.targets.find(q=>q.i===z.zone.item);if(t){t.bins[Math.min(19,Math.floor(z.along*20))]=true;this.reach(r,t);}}
   const c=score.clipNear;if(c){const t=r.targets.find(q=>q.i===c.clip.item);if(t&&c.distance<t.best){t.best=c.distance;if(c.distance<=CLIP_REACH)this.reach(r,t);}}
  }
  // From the first target reached, the time spent sideways counts towards the flow.
  if(r.since!==null){r.flowTime=(r.flowTime??0)+dt;if(drifting)r.driftTime+=dt;}
  if(r.entryKmh===null&&r.since!==null)r.entryKmh=score.kmh;
  if(score.kmh<5)r.stopped+=dt;else r.stopped=0;
  const done=r.next>=r.targets.length&&!drifting;
  if(r.spun||done||r.t>40||r.stopped>2.5)return this.judge();
  this.current=this.provisional();
  return null;
 }
 reach(r,t){const k=r.targets.indexOf(t);if(k>=r.next){r.next=k+1;if(r.since===null)r.since=r.t;}}
 sheet(){
  const r=this.run,line=r.targets.length?r.targets.reduce((sum,t)=>sum+(t.kind==='clip'?(t.best<=.5?1:t.best>=CLIP_REACH*1.4?0:1-(t.best-.5)/(CLIP_REACH*1.4-.5)):t.bins.filter(Boolean).length/t.bins.length),0)/r.targets.length:0;
  const mean=r.angleTime?r.angleSum/r.angleTime:0,angle=clamp((mean-12)/(38-12),0,1)*(mean>65?Math.max(0,1-(mean-65)/30):1);
  const flow=r.flowTime?r.driftTime/r.flowTime:0,entry=r.entryKmh===null?0:clamp((r.entryKmh-25)/(55-25),0,1);
  // Angle and style count for the part of the course done: a run that skips half the zones keeps half of them.
  const knocked=this.world.knocked-r.knocked,penalty=knocked*3+r.walls*10,done=r.targets.length?r.next/r.targets.length:0;
  return {line:Math.round(line*40),angle:Math.round(angle*30*done),style:Math.round((flow*.75+entry*.25)*30*done),penalty,knocked,walls:r.walls,meanAngle:+mean.toFixed(1),missed:r.targets.length-r.next};
 }
 provisional(){const s=this.sheet();return Math.max(0,s.line+s.angle+s.style-s.penalty);}
 judge(){
  const r=this.run,sheet=this.sheet();
  if(r.spun)return this.finish(0,{sheet,reason:'Rodou: volta zerada.'});
  if(r.since===null)return this.finish(0,{sheet,reason:'Nenhuma zona feita.'});
  return this.finish(Math.max(0,sheet.line+sheet.angle+sheet.style-sheet.penalty),{sheet});
 }
 info(){return {id:this.id,state:this.state,current:+this.current.toFixed(this.def.digits),last:this.lastResult??null,run:this.run?{next:this.run.next,targets:this.run.targets.length,t:+this.run.t.toFixed(2)}:null};}
}
