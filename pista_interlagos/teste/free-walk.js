// Out of the car anywhere, GTA style (user, 2026-10-15: "apertar F e poder sair do carro em qualquer parte do jogo").
// F (the controller's Y, the touch button) brakes the car to a stop and the pilot gets out by the driver's door, as at
// the pit stop (pitstop.js) and in the story's paddock, and walks the same way (on-foot.js): W/A/S/D along the camera,
// Shift runs, Space jumps, C crouches, the mouse turns the camera and the wheel zooms; the driver's door stays open
// behind him and E at it shuts or opens it, E at the nose or the tail lifts or shuts the hood or the trunk lid, E by
// the passenger's door opens or shuts it (car-openings.js; they stay as he leaves them, on the move too: user,
// 2026-10-20); F near the car walks him to the driver's door and in, and that door alone shuts behind him (user,
// 2026-10-15). The race goes on:
// the car waits on its brakes with the engine idling and the rivals race past; one that hits him throws him like the
// marshals (pit-crew.js knockOver), and he gets up where he lands. Guardrails are jumped over (as the low pit walls), a
// street circuit's walls are not; in a city zone open to roam (meta.roam) its edges and what stands in it stop him, and
// he never walks into a lake or over a plateau's rim. Q takes his phone out for a selfie (selfie.js; user, 2026-10-18).
// Where the circuit has a game on foot (play: pampulha-futebol.js, the Mineirão's balls; user, 2026-10-19) he dribbles the
// small ball at his feet (taken, it is his: soft touches keep it ahead of him as he walks or runs, as in the football
// games), E (or the click) held winds up a shot, R (or the right click) a pass along the grass, harder the longer held,
// toward where the camera looks; the giant ball stands in his way, he pushes it, and it throws him when it comes fast.
import * as THREE from 'three';
import {keyName,keyText} from './key-bindings.js';
import {footState,stepOnFoot,footGround,placeFootCamera,turnFootView,zoomFootView,footJump} from './on-foot.js';
import {OPENINGS,carSpot,SPOT_ROLE,partName} from './car-openings.js';
import {createPeople,dressPerson,knockOver,applyPose,clonePose,POSES,OUTFITS,STEVAN_OUTFITS} from './pit-crew.js';
import {outfitOf} from './story-career.js';
import {guardrailPresent,guardrailClearance} from './physics.js';
import {Selfie} from './selfie.js';

// Under STOP m/s the braking car lets him out; a rival faster than HIT throws him (slower, it is solid); from REACH
// metres F walks him to the door; a guardrail stands RAIL high; MARGIN keeps him off a car's body.
const STOP=.6,HIT=2,REACH=6,RAIL=.75,MARGIN=.3,CG=.52,STILL=Object.freeze({throttle:0,brake:0,left:0,right:0});
// A kick: the foot meets the ball KICK_STRIKE into it, the leg back by KICK_TIME; held KICK_FULL seconds it is as hard
// as it gets (pampulha-futebol.js's numbers); let go, it waits PENDING seconds at most for the ball to be at his foot.
const KICK_STRIKE=.13,KICK_TIME=.36,KICK_FULL=1,PENDING=.6,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp01=x=>Math.max(0,Math.min(1,x));
// Where he gets out, in the car's frame (metres forward, metres to its left): the driver's door first, then the other
// side, the nose, the tail, and a step further out on either side.
const EXITS=[[.15,1.6],[.15,-1.6],[3.3,0],[-3.2,0],[.15,2.6],[.15,-2.6]];
const near=(x,y,ax,ay)=>Math.hypot(x-ax,y-ay);
// Who gets out: Stevan in the clothes of his story stage, the 99's driver in his red overalls (a cap for the helmet),
// another car's driver in its team's colour.
export function pilotOutfit({career=null,entry=null}={}){
 if(career)return STEVAN_OUTFITS[outfitOf(career)];
 return entry?{...OUTFITS.crew,top:entry.color,bottom:entry.color,back:false,hat:'cap',hatColor:0x1b1d20}:OUTFITS.driver;
}
// A car's plan (physics.js OPALA_BODY, FUSCA_BODY) round (x, y), on its level: the side of it the point is on
// (+1 left, -1 right), 0 outside.
function inPlan(c,x,y,z,margin){
 const b=c.body??{front:2.42,rear:2.35,halfWidth:.93};if(Math.abs(z-(c.z-CG))>1.3)return 0;
 const ch=Math.cos(c.heading),sh=Math.sin(c.heading),dx=x-c.x,dy=y-c.y,along=dx*ch+dy*sh,left=-dx*sh+dy*ch;
 return along>-(b.rear??b.halfLength)-margin&&along<(b.front??b.halfLength)+margin&&Math.abs(left)<b.halfWidth+margin?(Math.sign(left)||1):0;
}
// A roam solid's quad (physics.js RoamWorld addSolid: corners xs, ys in turn) round (x, y).
function inQuad(xs,ys,x,y){let inside=false;for(let i=0,j=3;i<4;j=i++)if((ys[i]>y)!==(ys[j]>y)&&x<xs[i]+(y-ys[i])*(xs[j]-xs[i])/(ys[j]-ys[i]))inside=!inside;return inside;}

export class FreeWalk {
 // car: the player's TestCar; driver: the driver in it (hidden while he walks); openings: its hinged parts; layout: the
 // circuit's Box 99 (pit-box99.js: its rooms, people and camera framing) where it has one; obstacles: the camera's
 // (main.js cameraObstacles); water(x, y): a lake there ({depth}, landscape.water.at); outfit(): pilotOutfit's answer
 // for the race; title(): the walking panel's heading; emit(name, options): a sound; onOut / onIn: main.js's camera
 // and mouse, as he gets out and back in; hud: the walking panel (none in the Node checks); selfie: the phone's options
 // (selfie.js: label, freeMouse, lockMouse); play: a game on foot (pampulha-futebol.js FootballGame: blocks, aim, kick).
 constructor({scene,car,driver,openings=null,layout=null,obstacles=[],water=null,outfit=()=>OUTFITS.driver,title=()=>'A PÉ · A CORRIDA CONTINUA',emit=()=>{},onOut=()=>{},onIn=()=>{},hud=typeof document!=='undefined',selfie={},play=null}){
  Object.assign(this,{scene,car,driver,openings,layout,obstacles,water,outfit,title,emit,onOut,onIn,play});
  this.data=car.data;this.street=this.data.meta?.barrier==='street';
  this.hero=createPeople().person(OUTFITS.driver);this.hero.name='Piloto_a_pe';this.hero.visible=false;this.outfitKey=JSON.stringify(OUTFITS.driver);scene.add(this.hero);
  this.foot=null;this.stopping=false;this.tumble=null;this.tumbleText='';this.goingIn=null;this.follow=null;this.rivals=[];this.message='';this.messageTime=0;this.hints={hero:null,eye:null};
  // His walk as the ball sees it (footInfo): the velocity he has (from his steps) and the one he asks for (the keys); a kick.
  this.motion={x:0,y:0,vx:0,vy:0};this.intent=[0,0];this.kicking=this.charge=this.pending=null;this.kicks=0;this.touchHold={chute:false,passe:false};
  // car.sample looks for the nearest station round the car's own: far off, he keeps his own (as the car, a short
  // window round the last one), and one for the camera.
  this.walker={pitGeo:car.pitGeo,sample:(x,y)=>this.sample(x,y,'hero')};
  this.groundAt=(x,y)=>this.sample(x,y,'eye').z-.055;
  const base=footGround({car:this.walker,pit:layout?.pit??null,layout,blocked:pos=>this.solid(pos)});
  this.ground=(pos,elevation,from)=>{const floor=base(pos,elevation,from);return floor===null||from&&!this.passes(from,pos,elevation)?null:floor;};
  this.selfie=new Selfie({hero:this.hero,emit,hud,...selfie});this.phoneView=false;
  if(hud)this.buildHud();
 }
 get active(){return !!this.foot;}
 // Braking to get out, or out.
 get busy(){return this.stopping||!!this.foot;}
 get touch(){return !!globalThis.document?.body?.classList.contains('touch-device');}
 sample(x,y,which){const hint=this.hints[which],q=this.car.sample(x,y,hint??this.car.index);this.hints[which]=q.i;return q;}
 // F in the car: brake to a stop, then out (drive). F again while it brakes changes his mind.
 request(){if(this.foot)return false;this.stopping=!this.stopping;return true;}
 cancel(){this.stopping=false;}
 // Each physics step (main.js), after the player's command: braking to get out the throttle is shut and the brakes on
 // (the steering stays his); out of the car it waits on its brakes. wait: the pit stop opens there, or just opened in
 // this frame's steps (main.js hands it the stop after them).
 drive(command,{wait=false}={}){
  if(!this.busy)return false;
  if(this.foot)Object.assign(command,{throttle:0,brake:1,left:0,right:0,reverse:0,handbrake:1,ignition:0});
  else Object.assign(command,{throttle:0,brake:1,reverse:0});
  const c=this.car;if(this.stopping&&!wait&&!c.fall&&Math.hypot(c.vx,c.vy)<STOP)this.getOut();
  return true;
 }
 // Car frame (forward f, left l, metres) to world (three.js axes) at the car's ground.
 carPoint(f,l,out=new THREE.Vector3()){const c=this.car,h=c.heading;return out.set(c.x+Math.cos(h)*f-Math.sin(h)*l,c.surface.z-.055,-(c.y+Math.sin(h)*f+Math.cos(h)*l));}
 getOut(){
  const c=this.car,from=new THREE.Vector3(c.x,c.surface.z-.055,-c.y);this.stopping=false;this.hints.hero=this.hints.eye=c.index;
  let spot=null,floor=null;
  for(const [f,l] of EXITS){const p=this.carPoint(f,l),q=this.ground(p,p.y+.2,from);if(q!==null&&Math.abs(q-p.y)<1){spot=p;floor=q;break;}}
  if(!spot){spot=this.carPoint(...EXITS[0]);floor=spot.y;}
  // The clothes of this race (another car's team, a story stage) before he shows.
  const outfit=this.outfit(),key=JSON.stringify(outfit);if(key!==this.outfitKey){dressPerson(this.hero,outfit);this.outfitKey=key;}
  applyPose(this.hero.userData.rig,clonePose(POSES.stand));
  // Facing away from the car, the camera behind him looking where the car points.
  this.foot=footState(c.heading,{floor});this.hero.position.copy(spot).setY(floor);this.hero.rotation.set(0,Math.atan2(-spot.z-c.y,spot.x-c.x),0);this.hero.visible=true;
  this.tumble=this.goingIn=this.follow=this.kicking=this.charge=this.pending=null;this.message='';this.messageTime=0;this.motion={x:spot.x,y:-spot.z,vx:0,vy:0};this.intent=[0,0];
  this.openings?.hold(OPENINGS.driverDoor,'manual');this.emit('click');this.onOut();
 }
 // The driver's door, where he gets in: its distance from him (metres, on the ground).
 doorDistance(){const d=this.carPoint(.15,1.25),p=this.hero.position;return near(p.x,p.z,d.x,d.z);}
 carDistance(){const c=this.car,p=this.hero.position;return near(p.x,-p.z,c.x,c.y);}
 // Where he stands by the car (car-openings.js carSpot): 'capo', 'porta_malas', 'porta', 'porta_carona' or null.
 spot(){const c=this.car,h=c.heading,dx=this.hero.position.x-c.x,dz=this.hero.position.z+c.y;return carSpot({x:dx*Math.cos(h)-dz*Math.sin(h),z:dx*Math.sin(h)+dz*Math.cos(h)});}
 // F on foot: at the door he gets in; a few metres off he walks there first; farther, a word of where the car is.
 getIn(){
  if(!this.foot||this.tumble)return false;
  if(this.doorDistance()<1.2||this.spot()==='porta'){this.enter();return true;}
  if(this.carDistance()<REACH){this.goingIn={t:0};return true;}
  this.say(`Seu carro está a ${Math.round(this.carDistance())} m: chegue perto dele para entrar.`);return false;
 }
 enter(){this.leave();this.openings?.pulse(OPENINGS.driverDoor,1.2);this.emit('click');}
 // Back in the car at once (a restart, the race ending, the circuit going), or to get in: the door he left open shuts.
 leave(){this.stopping=false;if(!this.foot)return;this.selfie.close(true);this.phoneView=false;this.openings?.hold(OPENINGS.driverDoor,'manual',false);this.foot=this.tumble=this.goingIn=this.follow=this.kicking=this.charge=this.pending=null;this.hero.visible=false;this.driver.root.visible=true;this.showHud(false);this.onIn();}
 reset(){this.leave();}
 say(text,seconds=3.5){this.message=text;this.messageTime=seconds;}
 // E on foot: the driver's door at the door (a car without hinges: in), the front lid at the nose, the rear one at the
 // tail (the Opala's trunk lid, the Fusca's engine lid: car-openings.js part), the passenger's door at that side; away
 // from them, a shot at the ball at his feet (held: harder).
 opening(spot){return spot==='porta'?OPENINGS.driverDoor:SPOT_ROLE[spot]&&this.openings?this.openings.part(SPOT_ROLE[spot]):null;}
 action(){
  const spot=this.spot(),part=this.opening(spot);
  if(!part||!this.openings?.has(part))return this.press('chute')||spot==='porta'&&this.getIn();
  this.openings.toggle(part);this.emit('click');return true;
 }
 actionLabel(){
  const spot=this.spot(),part=this.opening(spot),ball=this.canKick()?'chutar a bola':'';if(!part)return ball;
  if(!this.openings?.has(part))return ball||(spot==='porta'?'entrar no carro':'');const open=this.openings.held(part,'manual');
  return (open?'fechar ':'abrir ')+partName(part);
 }
 // ---- The game on foot (play)
 // His feet and his walk for the ball: track coordinates (x, y on the ground, z his feet's height), the velocity of his
 // steps, the one his keys ask for, the camera's yaw (where a kick goes), the way he faces, running, off the ground,
 // winding up or kicking.
 footInfo(){const p=this.hero.position,s=this.foot;return {x:p.x,y:-p.z,z:p.y,vx:this.motion.vx,vy:this.motion.vy,ix:this.intent[0],iy:this.intent[1],yaw:s?.yaw??this.hero.rotation.y,facing:this.hero.rotation.y,running:!!s?.running,lift:s?.lift??0,charging:!!(this.charge||this.pending),kicking:!!this.kicking,tumbling:!!this.tumble,active:!!s};}
 canKick(){const s=this.foot;return !!(this.play&&s&&!this.tumble&&!this.goingIn&&!this.selfie.busy&&this.play.aim(this.footInfo()));}
 // E (the click, the panel's Chutar) or R (the right click, Passe) with a ball at his feet: winds up a shot or a pass.
 // Held, it charges (stepCharge); let go, he kicks as soon as the ball is at his foot, turned to the camera's way, the
 // leg on the ball's side (play.kick: the harder the longer it was held).
 press(kind){
  if(!this.foot||this.kicking||this.charge||this.pending||!this.canKick())return false;
  this.charge={kind,t:0};return true;
 }
 // Each frame: hold (main.js: the key, the mouse button, the controller's) or the panel's buttons still held, it charges.
 stepCharge(dt,hold){
  const c=this.charge;
  if(c){if(hold?.[c.kind]||this.touchHold[c.kind]){c.t+=dt;return;}this.charge=null;this.pending={kind:c.kind,power:Math.min(1,c.t/KICK_FULL),t:0};}
  const p=this.pending;if(!p)return;
  const hit=this.play.reach(this.footInfo(),this.foot.yaw);
  if(hit){this.pending=null;this.kicking={t:0,side:hit.side,yaw:this.foot.yaw,kind:p.kind,power:p.power,struck:false,hit:null};this.kicks++;return;}
  p.t+=dt;if(p.t>PENDING)this.pending=null;
 }
 stepKick(dt){
  const k=this.kicking,hero=this.hero;k.t+=dt;
  hero.rotation.y+=wrap(k.yaw-hero.rotation.y)*Math.min(1,dt*20);
  if(!k.struck&&k.t>=KICK_STRIKE){k.struck=true;k.hit=this.lastKick=this.play.kick(this.footInfo(),{yaw:k.yaw,kind:k.kind,power:k.power});}
  // The leg: drawn back and bent, whipped through straight (further, the harder the kick), followed through; the other
  // arm swings forward.
  const t=k.t,u1=Math.min(1,t/KICK_STRIKE),u2=clamp01((t-KICK_STRIKE)/.08),u3=clamp01((t-KICK_STRIKE-.08)/(KICK_TIME-KICK_STRIKE-.08)),back=-.3-.35*k.power,through=.95+.5*k.power;
  const thigh=t<KICK_STRIKE?back*u1:t<KICK_STRIKE+.08?back+(through-back)*u2:through-(through-.2)*u3,knee=t<KICK_STRIKE?1.5*u1:t<KICK_STRIKE+.08?1.5-1.4*u2:.1+.3*u3;
  const rig=hero.userData.rig,leg=hero.getObjectByName('Membro_perna_'+k.side),arm=hero.getObjectByName('Membro_braco_'+(-k.side));
  if(leg)leg.rotation.z=thigh;if(rig)rig.limbs[k.side].shin.rotation.z=-knee;if(arm)arm.rotation.z=.9*Math.max(0,Math.sin(Math.min(1,t/KICK_TIME)*Math.PI));
  if(k.t>=KICK_TIME)this.kicking=null;
 }
 // Thrown by something that is not a car (play: the giant ball): from {x, y, z, vx, vy, heading}, on its side; why.
 knock(from,side,text){
  if(!this.foot||this.tumble)return false;this.selfie.close(true);this.kicking=this.charge=this.pending=this.goingIn=null;this.foot.crouch=false;
  this.tumble=knockOver(this.hero.position.clone(),this.hero.rotation.y,from,side);this.tumbleText=text;this.say(text,5);return true;
 }
 handleKey(code){
  const s=this.foot;if(!s)return false;
  // The phone out: its keys (F puts it away and goes to the car).
  if(this.selfie.busy){if(code==='KeyF'){this.selfie.close(true);this.getIn();}else this.selfie.handleKey(code);return true;}
  if(code==='KeyF'){this.getIn();return true;}
  if(this.tumble)return true;
  if(code==='KeyQ'){this.takeSelfie();return true;}
  if(code==='KeyE'){this.action();return true;}
  if(code==='KeyR'){this.press('passe');return true;}
  if(code==='Space'){footJump(s);return true;}
  if(code==='KeyC'){s.crouch=!s.crouch;return true;}
  return false;
 }
 turnView(dx,dy){if(this.selfie.busy)this.selfie.turn(dx,dy);else if(this.foot)turnFootView(this.foot,dx,dy);}
 zoom(k){if(this.selfie.busy)this.selfie.zoom(k);else if(this.foot)zoomFootView(this.foot,k);}
 // Q: the phone out for a selfie, on his feet (not in the air, falling or on his way to the door), turned round to face
 // the camera, so what it looked at is behind him in the picture.
 takeSelfie(){
  const s=this.foot;if(!s||this.tumble||this.goingIn||s.lift>0)return false;
  s.crouch=false;return this.selfie.open({facing:s.yaw+Math.PI,outfit:this.outfit()});
 }
 // A click on the captured mouse: the shutter, while framing; walking, a shot at the ball at his feet (held: harder); the
 // right button, a pass.
 click(){return this.selfie.busy?this.selfie.phase==='frame'&&this.selfie.shoot():this.press('chute');}
 rightClick(){return !this.selfie.busy&&this.press('passe');}
 // Not where he could stand: the bodies of his car and of the rivals at rest (a moving one throws him instead), the
 // drift arena's wall and solids (drift-arena-world.js), and a lake past wading depth.
 solid(pos){
  const x=pos.x,y=-pos.z;if(inPlan(this.car,x,y,pos.y,MARGIN)||this.car.world?.blocks?.(x,y)||this.play?.blocks(x,y,pos.y))return true;
  for(const r of this.rivals){const c=r.car??r;if(Math.hypot(c.vx,c.vy)<HIT&&inPlan(c,x,y,pos.y,MARGIN))return true;}
  return (this.water?.(x,y)?.depth??0)>.45;
 }
 // Where (x, y) stands from the lap: its side, how far past the barrier's face (out > 0: behind it), whether a barrier
 // stands there, whether it is by the pit lane (whose own walls stop him: footGround).
 side(x,y){
  const q=this.sample(x,y,'hero'),n=Math.hypot(q.lx,q.ly)||1,side=Math.sign(q.d)||1;
  return {q,side,out:Math.abs(q.d)/n-(q.width/2+guardrailClearance(this.data,q.s,side)),rail:guardrailPresent(this.data,q.s,side),pit:q.pit||q.pitS!==null};
 }
 // From where he stands to his next step: over a plateau's rim never; across the lap's barrier only a guardrail and only
 // in a jump high enough (a street circuit's wall never); in a city open to roam, not out of a zone's open ground into
 // what bounds it (buildings, the sea) nor into what stands in it.
 passes(from,pos,elevation){
  const a=this.side(from.x,-from.z),b=this.side(pos.x,-pos.z);if(b.q.abyss)return false;
  if(!a.pit&&!b.pit&&a.side===b.side&&(a.out>0)!==(b.out>0)&&(a.rail||b.rail)&&(this.street||elevation<b.q.z-.055+RAIL-.5))return false;
  // (The pit lane and its garages are behind the lap's walls but no zone's: their own walls hold him, footGround. Under
  // the zones' rule there he could only walk toward the lap, one way along the lane; user, 2026-10-15.)
  const roam=this.car.roam;if(!roam||b.out<=0||b.pit)return true;
  const x=pos.x,y=-pos.z,zone=roam.zones.find(z=>roam.inside(z,x,y)),was=roam.zones.find(z=>roam.inside(z,from.x,-from.z));
  if(!zone&&b.out>1.5&&(was||b.out>=a.out))return false;
  for(const it of roam.query(x,y,.3))if(it.t===2&&near(x,y,it.x,it.y)<it.r+.25||it.t===1&&inQuad(it.xs,it.ys,x,y))return false;
  return true;
 }
 // A rival through where he stands, faster than a walk, throws him.
 hitBy(rivals){
  const p=this.hero.position;
  for(const r of rivals){
   const c=r.car??r;if(Math.hypot(c.vx,c.vy)<HIT)continue;const side=inPlan(c,p.x,-p.z,p.y,MARGIN);if(!side)continue;
   this.tumble=knockOver(p.clone(),this.hero.rotation.y,c,side);this.tumbleText='';this.goingIn=this.kicking=this.charge=this.pending=null;this.foot.crouch=false;this.say('Atropelado! A corrida continua: cuidado na pista.',5);return true;
  }
  return false;
 }
 // The flight, the fall and getting up (pit-crew.js Tumble); a street wall or a rim stops the flight; once he has shaken
 // his fist at the car he is on his feet again where he is.
 stepTumble(dt){
  const t=this.tumble,hero=this.hero,s=this.foot,pose=clonePose(POSES.stand);
  if(t.phase!=='walk'&&t.phase!=='turn'){
   const before=t.hips.clone();t.floor=this.sample(t.hips.x,-t.hips.z,'hero').z-.055;
   if(t.update(dt,pose)){
    if(!this.passes(before,t.hips,Infinity)){t.hips.x=before.x;t.hips.z=before.z;t.v.x=t.v.z=0;}
    applyPose(hero.userData.rig,pose);hero.position.copy(t.feet);hero.quaternion.copy(t.q);return;
   }
  }
  applyPose(hero.userData.rig,clonePose(POSES.stand));hero.rotation.set(0,t.yaw,0);this.tumble=null;
  hero.position.set(t.hips.x,0,t.hips.z);s.floor=this.sample(hero.position.x,-hero.position.z,'hero').z-.055;s.lift=s.vz=0;hero.position.y=s.floor;
 }
 // Each frame (main.js): the walk (or the flight), then the camera behind him. input: main.js's command (keys, pads,
 // the controller's stick); shift: running; rivals: the race's ({car}); visible: the race on screen (not paused).
 update(dt,camera,{input=STILL,shift=false,rivals=[],visible=true,hold=null}={}){
  this.rivals=rivals;this.messageTime=Math.max(0,this.messageTime-dt);
  const s=this.foot;if(!s){this.showHud(false);return;}
  this.driver.root.visible=false;
  if(dt>0){
   this.intent[0]=this.intent[1]=0;
   if(this.tumble)this.stepTumble(dt);
   // Holding the phone he stands (selfie.js poses him); a rival still throws him, and the phone goes back in his pocket.
   else if(this.selfie.busy){this.charge=this.pending=null;if(this.hitBy(rivals))this.selfie.close(true);}
   else{
    let walk=input,touch=this.touch;
    // Walking himself to the door: straight there, whatever the camera does; in after a few seconds anyway.
    if(this.goingIn){
     const door=this.carPoint(.15,1.25),p=this.hero.position,aim=Math.atan2(-(door.z-p.z),door.x-p.x)-s.yaw;this.goingIn.t+=dt;
     if(near(p.x,p.z,door.x,door.z)<.6||this.spot()==='porta'||this.goingIn.t>3){this.enter();return;}
     walk={throttle:Math.max(0,Math.cos(aim)),brake:Math.max(0,-Math.cos(aim)),left:Math.max(0,Math.sin(aim)),right:Math.max(0,-Math.sin(aim))};touch=false;
    }
    // The walk his keys ask for (as stepOnFoot moves him): what he leans on a ball with when a ball stops him.
    {const forward=walk.throttle-walk.brake,strafe=touch?0:walk.left-walk.right,fx=Math.cos(s.yaw),fy=Math.sin(s.yaw),mx=fx*forward-fy*strafe,my=fy*forward+fx*strafe,amount=Math.min(1,Math.hypot(mx,my)),n=Math.hypot(mx,my)||1,speed=amount*(shift&&amount>.01?6.2:s.crouch?1.4:3);this.intent[0]=mx/n*speed;this.intent[1]=my/n*speed;}
    if(stepOnFoot(s,this.hero,walk,dt,{touch,shift,ground:this.ground}))this.emit('footstep');
    if(this.play)this.stepCharge(dt,hold);
    if(this.kicking)this.stepKick(dt);
    this.hitBy(rivals);
   }
   // The velocity of his steps (smoothed over a few frames).
   const p=this.hero.position,m=this.motion,k=1-Math.exp(-dt*20);m.vx+=((p.x-m.x)/dt-m.vx)*k;m.vy+=((-p.z-m.y)/dt-m.vy)*k;m.x=p.x;m.y=-p.z;
  }
  // Framing, the phone's front camera is the view; put away, the walking camera pulls back from it, looking the same way.
  if(this.selfie.busy&&this.selfie.update(dt,camera,{input,visible})){this.phoneView=true;this.showHud(visible);return;}
  if(this.phoneView){this.phoneView=false;this.selfie.releaseCamera(camera);s.yaw=this.selfie.viewYaw();s.pitch=.25;s.distance=Math.max(s.distance,2.5);this.follow=null;if(camera){camera.fov=s.zoomFov??58;camera.updateProjectionMatrix();}}
  this.showHud(visible);
  if(!visible||!camera)return;
  // The walking lens (on-foot.js zoom), a little wider at a run.
  const lens=s.zoomFov??58,fov=s.running&&lens>=57?65:lens;if(Math.abs(camera.fov-fov)>.05){camera.fov+=(fov-camera.fov)*(dt>0?1-Math.exp(-dt*5):1);camera.updateProjectionMatrix();}
  this.follow=placeFootCamera(camera,s,this.hero.position,{layout:this.layout,obstacles:this.obstacles,ground:this.groundAt,dt,follow:this.follow??camera.position.clone(),body:this.hero});
 }
 buildHud(){
  const hud=this.hud=document.createElement('aside');hud.id='walkHud';hud.hidden=true;
  hud.innerHTML='<div><b id="walkTitle"></b><span id="walkCarDistance"></span></div><span id="walkMessage" role="status"></span><small id="walkHint"></small><div id="walkPower" hidden><span id="walkPowerLabel"></span><b><i></i></b></div><div id="walkBall" hidden><button id="walkKick"></button><button id="walkPass"></button></div><button id="walkAction" hidden></button><button id="walkCar" hidden></button><button id="walkSelfie" hidden>Selfie</button>';
  document.body.append(hud);this.$=id=>hud.querySelector('#'+id);
  this.$('walkCar').onclick=()=>this.getIn();this.$('walkAction').onclick=()=>this.action();this.$('walkSelfie').onclick=()=>this.takeSelfie();
  // Chutar and Passe are held like the keys: pressed they wind up, let go they kick.
  for(const [id,kind] of [['walkKick','chute'],['walkPass','passe']]){const b=this.$(id),up=()=>{this.touchHold[kind]=false;};
   b.addEventListener('pointerdown',e=>{e.preventDefault();this.touchHold[kind]=true;this.press(kind);});for(const t of ['pointerup','pointercancel','pointerleave'])b.addEventListener(t,up);}
  this.shown={};
 }
 // The walking panel: where the car is, what E and F do here, and the same as buttons (touch screens).
 showHud(visible){
  // (The phone out: its own screen, selfie.js.)
  if(!this.hud)return;const out=visible&&!!this.foot,on=out&&!this.selfie.busy;
  if(this.hud.hidden===on)this.hud.hidden=!on;document.body.classList.toggle('free-walking',out);if(!on)return;
  const touch=this.touch,distance=this.carDistance(),atDoor=this.doorDistance()<1.2||this.spot()==='porta',close=distance<REACH,action=this.actionLabel();
  const fText=atDoor?'entrar no carro':close?'ir até a porta e entrar':'entrar (chegue perto do carro)';
  const set=(id,key,value)=>{if(this.shown[id+key]!==value){this.shown[id+key]=value;this.$(id)[key]=value;}};
  set('walkTitle','textContent',this.title());set('walkCarDistance','textContent',close?'Seu carro: aqui':`Seu carro: ${Math.round(distance)} m`);
  set('walkMessage','textContent',this.tumble?this.tumbleText||'Atropelado! Espere ele levantar…':this.messageTime>0?this.message:this.goingIn?'Indo até a porta…':'');
  // With a ball at his feet: the shot and the pass, held for more (keys and buttons), and the wind-up's bar.
  const ball=action==='chutar a bola'||!!(this.charge||this.pending),wind=this.charge??this.pending;
  set('walkHint','textContent',touch?'Pedais: andar · direção: virar':keyText('Mouse: câmera · {KeyW}/{KeyA}/{KeyS}/{KeyD}: andar · {ShiftLeft}: correr · {Space}: pular · {KeyC}: agachar · {KeyQ}: selfie')+(ball?keyText(' · {KeyE} ou clique: chutar (segure: mais forte) · {KeyR} ou botão direito: passe rasteiro'):`${action&&action!=='entrar no carro'?` · ${keyName('KeyE')}: ${action}`:''}`)+` · ${keyName('KeyF')}: ${fText}`);
  set('walkBall','hidden',!ball||!!this.tumble);set('walkKick','textContent',touch?'Chutar (segure)':`Chutar · ${keyName('KeyE')}`);set('walkPass','textContent',touch?'Passe (segure)':`Passe · ${keyName('KeyR')}`);
  set('walkPower','hidden',!wind);
  if(wind){const k=this.charge?Math.min(1,this.charge.t/KICK_FULL):this.pending.power;set('walkPower','className',wind.kind);set('walkPowerLabel','textContent',wind.kind==='passe'?'PASSE':'CHUTE');const w=`${Math.round(k*100)}%`;if(this.shown.power!==w){this.shown.power=w;this.$('walkPower').querySelector('i').style.width=w;}}
  set('walkAction','hidden',!action||ball||action==='entrar no carro'||!!this.tumble);if(action)set('walkAction','textContent',action[0].toUpperCase()+action.slice(1)+(touch?'':` · ${keyName('KeyE')}`));
  set('walkCar','hidden',!close||!!this.tumble);set('walkSelfie','hidden',!touch||!!this.tumble);set('walkCar','textContent',(atDoor?'Entrar no carro':'Voltar ao carro')+(touch?'':` · ${keyName('KeyF')}`));
 }
 // The circuit goes (main.js clearCircuit): the driver back in his seat, no camera to hand back.
 dispose(){this.stopping=false;this.selfie.dispose();if(this.foot){this.foot=this.tumble=this.goingIn=null;this.driver.root.visible=true;}this.hero.removeFromParent();this.hud?.remove();globalThis.document?.body?.classList.remove('free-walking');}
 info(){const p=this.hero.position;return {active:!!this.foot,stopping:this.stopping,tumble:this.tumble?.phase??null,goingIn:!!this.goingIn,hero:[p.x,p.y,p.z],car:this.carDistance(),door:this.doorDistance(),spot:this.foot?this.spot():null,floor:this.foot?.floor??null,lift:this.foot?.lift??0,crouch:!!this.foot?.crouch,message:this.messageTime>0?this.message:'',selfie:this.selfie.info(),kick:this.kicking?{t:this.kicking.t,kind:this.kicking.kind,power:this.kicking.power,side:this.kicking.side,hit:this.kicking.hit}:null,charge:this.charge?{kind:this.charge.kind,t:this.charge.t}:null,pending:!!this.pending,lastKick:this.lastKick??null,kicks:this.kicks,canKick:this.foot?this.canKick():false};}
}
