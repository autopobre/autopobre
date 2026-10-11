import * as THREE from 'three';
import {OUTFITS,STEVAN_OUTFITS,POSES,clonePose,applyPose,dressPerson} from './pit-crew.js';

// Kléber Eletric's box in Modo História (story-career.js INTRO_LINES, DONE_LINES, MISSED_LINES): the talks
// played in 3D at the door of his team's garage (#70, pit-building.js), his orange Opala parked nose in.
// Kléber comes as a pilot (the welcome, a deadline missed) or as the businessman of his brand, in its black
// T-shirt (the overalls given back); Stevan in what the story has him wear then: street clothes when Kléber lends him
// his overalls, his own red ones when he brings them back in a bag, the loaned black ones when the money
// did not come. Each card of the talk (ImmersiveState.scene, a 'line') picks the shot and the gestures:
// a wide shot to open, the speaker over the other's shoulder, a closer two-shot when something changes hands.
const up=new THREE.Vector3(0,1,0);
const yawOf=v=>Math.atan2(-v.z,v.x);
const SCALARS=['y','lean','head','turn','twist','tilt','sway','lid'],PAIRS=['thigh','knee','arm','elbow','spread','roll'];
function blend(cur,target,k){for(const key of SCALARS)cur[key]+=((target[key]??0)-cur[key])*k;for(const key of PAIRS)for(const i of [0,1])cur[key][i]+=((target[key]?.[i]??0)-cur[key][i])*k;}
// What Stevan wears and how Kléber comes, by act.
const ACTS={intro:{pilot:'civil',kleber:'pilot'},done:{pilot:'proprio',kleber:'business'},missed:{pilot:'emprestado',kleber:'pilot'}};
const FOV={wide:40,medium:34,over:33};
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.82});
// A sports bag hung from its handles (origin at the grip): navy with an orange band.
function bagModel(){
 const g=new THREE.Group();g.name='Bolsa_macacao';
 const body=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.3,4,12),material(0x22324a));body.rotation.z=Math.PI/2;body.position.y=-.27;body.scale.set(1,1,.95);
 const band=new THREE.Mesh(new THREE.CylinderGeometry(.124,.124,.05,16),material(0xf07c18));band.rotation.z=Math.PI/2;band.position.y=-.27;
 const handle=new THREE.Mesh(new THREE.TorusGeometry(.075,.012,6,16,Math.PI),material(0x15171a));handle.position.y=-.16;
 for(const o of [body,band,handle]){o.castShadow=true;g.add(o);}return g;
}
// The black overalls folded in a pile, the yellow of his brand showing on the collar.
function foldedSuit(){
 const g=new THREE.Group();g.name='Macacao_dobrado';
 const pile=new THREE.Mesh(new THREE.BoxGeometry(.34,.08,.27),material(0x1b1d20));const stripe=new THREE.Mesh(new THREE.BoxGeometry(.06,.083,.27),material(0xf2c418));stripe.position.x=.11;
 for(const o of [pile,stripe]){o.castShadow=true;g.add(o);}return g;
}
export class StoryScene{
 // at(along,out): a world point on the lane floor, `along` metres down the lane from the middle of
 // Kléber's garage door and `out` metres from it toward the lane. car: his Opala, parked nose in.
 // groundAt(x,y): the floor height under a world point (physics y = -z), for the feet.
 constructor({people,parent,at,car=null,groundAt=null,logo=null}){
  this.at=at;this.groundAt=groundAt;this.group=new THREE.Group();this.group.name='Cena_box_Kleber_Eletric';this.group.visible=false;parent.add(this.group);
  this.kleber=people.person(OUTFITS.kleber);this.kleber.name='Kleber_Eletric';this.kleberLook='pilot';
  this.pilot=people.person(STEVAN_OUTFITS.civil);this.pilot.name='Stevan_na_cena';this.outfit='civil';
  this.group.add(this.kleber,this.pilot);
  // His brand on the chest and on the cap (the Eletric logo, one of the car's real sponsors).
  if(logo){const badge=(parent,p,w,h,ry,rz=0)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),logo);m.position.set(...p);m.rotation.set(0,ry,rz);parent.add(m);return m;};
   const rig=this.kleber.userData.rig;this.badges=[badge(rig.torso,[.142,.44,-.062],.12,.018,Math.PI/2),badge(rig.head,[.127,.19,0],.1,.016,Math.PI/2,-.3)];}
  if(car){this.car=car;if(car.userData.nameLabel)car.userData.nameLabel.visible=false;car.traverse(o=>{if(o.isSprite)o.visible=false;});this.group.add(car);}
  this.bag=bagModel();this.suit=foldedSuit();this.group.add(this.bag,this.suit);
  this.poses=new Map([[this.kleber,clonePose(POSES.stand)],[this.pilot,clonePose(POSES.stand)]]);
  this.time=0;this.cardTime=0;this.active=false;this.card=null;this.view=null;this.placed=false;
 }
 // Where everyone stands: Kléber by his car's flank near the door, Stevan facing him from the lane side.
 place(){
  const at=this.at,O=at(0,0),A=at(1,0).sub(O).setY(0).normalize(),U=at(0,1).sub(O).setY(0).normalize();this.along=A;this.out=U;
  const foot=p=>{if(this.groundAt){const y=this.groundAt(p.x,-p.z);if(Number.isFinite(y))p.y=y;}return p;};
  this.kleber.position.copy(foot(at(2.05,1.45)));this.pilot.position.copy(foot(at(3.2,2.45)));
  const toPilot=this.pilot.position.clone().sub(this.kleber.position).setY(0);this.kleber.rotation.y=yawOf(toPilot);this.pilot.rotation.y=yawOf(toPilot.clone().negate());
  if(this.car){this.car.position.copy(at(0,2.75));this.car.rotation.y=yawOf(U.clone().negate());}
  this.placed=true;
 }
 // A card of the scene (or none): a new line cuts to its shot; leaving the talk hides the stage.
 sync(card){
  const line=card?.type==='line'&&ACTS[card.act]?card:null;
  if(!line){if(this.active){this.active=false;this.group.visible=false;this.card=null;}return false;}
  if(!this.placed)this.place();
  if(!this.active){this.active=true;this.group.visible=true;this.cardTime=0;}
  if(line!==this.card){
   const act=ACTS[line.act];
   if(act.pilot!==this.outfit){dressPerson(this.pilot,STEVAN_OUTFITS[act.pilot]);this.outfit=act.pilot;}
   if(act.kleber!==this.kleberLook){dressPerson(this.kleber,act.kleber==='pilot'?OUTFITS.kleber:OUTFITS.kleberBusiness);this.kleberLook=act.kleber;}
   if(this.card?.act!==line.act)this.bagHolder=line.act==='done'?this.pilot:null;
   this.card=line;this.cardTime=0;this.view=this.shotFor(line);
  }
  return true;
 }
 shotFor(card){
  const how=card.how??'';
  if(card.index===0)return 'wide';
  if(how.includes('bolsa')||card.act==='intro'&&card.index===6)return 'medium';
  return card.who==='kleber'?'overKleber':'overPilot';
 }
 // Gestures: the speaker talks with the hands and nods, the other listens; how the line is said changes
 // the body (sad, embarrassed); the bag goes from Stevan's hand to Kléber's; Kléber offers the overalls.
 update(dt){
  if(!this.active)return;this.time+=dt;this.cardTime+=dt;const c=this.card,t=this.time,k=1-Math.exp(-dt*9);
  for(const [person,who] of [[this.kleber,'kleber'],[this.pilot,'pilot']]){
   const talking=c.who===who,p=clonePose(POSES.stand),seed=who==='pilot'?1.7:0,how=talking?c.how:'';
   p.y=Math.sin(t*1.6+seed)*.006;p.lid=(t+seed)%3.9<.13?1:0;
   if(talking){p.arm=[.12+.06*Math.sin(t*1.7+seed),.32+.2*Math.sin(t*2.1+seed)];p.elbow=[.3,.8+.35*Math.sin(t*2.9+seed)];p.head=.03*Math.sin(t*5.3);p.turn=.06*Math.sin(t*1.1+seed);}
   else{p.head=.05*Math.max(0,Math.sin(t*2.4+seed));p.arm=[.08,.08];p.elbow=[.25,.25];}
   if(how.includes('tristeza')){p.head=.42;p.lean=.06;p.arm=[.02,.02];p.elbow=[.1,.1];p.turn=.18;}
   if(how.includes('sem graça')){p.head=.2;p.arm=[.05,2.55];p.elbow=[.15,2.05];p.spread=[.1,.45];}
   // The bag: held out to Kléber, who takes it (after a moment) and lowers it.
   if(c.act==='done'){
    if(who==='pilot'&&(c.index===0||c.index===1&&this.cardTime<.8)){p.arm[1]=c.index===0?Math.min(1.05,this.cardTime*2):1.05;p.elbow[1]=.2;}
    if(who==='kleber'&&c.index===1){const reach=this.cardTime<.8?Math.min(1,this.cardTime*2):Math.max(0,1-(this.cardTime-.8)*1.5);p.arm[1]=.2+.85*reach;p.elbow[1]=.2+.5*(1-reach);}
   }
   // Kléber lends the overalls, both hands forward.
   if(c.act==='intro'&&c.index===6&&who==='kleber'){p.arm=[.95,.95];p.elbow=[.55,.55];p.spread=[.18,.18];}
   const cur=this.poses.get(person);blend(cur,p,k);applyPose(person.userData.rig,cur);
  }
  if(c.act==='done'&&c.index===1&&this.cardTime>=.8)this.bagHolder=this.kleber;
  this.group.updateMatrixWorld(true);
  this.bag.visible=!!this.bagHolder;
  if(this.bag.visible){const hand=this.bagHolder.userData.rig.limbs[1].hand.getWorldPosition(new THREE.Vector3());this.bag.position.copy(this.group.worldToLocal(hand));this.bag.rotation.y=this.bagHolder.rotation.y+Math.PI/2;}
  this.suit.visible=c.act==='intro'&&c.index===6;
  if(this.suit.visible){const l=this.kleber.userData.rig.limbs,a=l[-1].hand.getWorldPosition(new THREE.Vector3()),b=l[1].hand.getWorldPosition(new THREE.Vector3());this.suit.position.copy(this.group.worldToLocal(a.add(b).multiplyScalar(.5))).add(new THREE.Vector3(0,.02,0));this.suit.rotation.y=this.kleber.rotation.y;}
 }
 head(person){return person.position.clone().add(new THREE.Vector3(0,1.58,0));}
 // The camera of the shot, drifting slowly sideways and in, as a hand-held film camera would.
 camera(camera){
  if(!this.active)return false;
  const K=this.head(this.kleber),P=this.head(this.pilot),mid=K.clone().add(P).multiplyScalar(.5),d=P.clone().sub(K).setY(0).normalize();
  const side=this.out.clone().addScaledVector(d,-this.out.dot(d)).normalize(),drift=Math.min(this.cardTime,12)*.035;
  let pos,look,fov;
  // The subtitles take the bottom of the frame: the shots look a little low, so the people stand higher in it.
  if(this.view==='wide'){pos=mid.clone().addScaledVector(this.out,6).addScaledVector(this.along,.9-drift).add(new THREE.Vector3(0,.1,0));look=mid.clone().addScaledVector(this.out,-.5).add(new THREE.Vector3(0,-.62,0));fov=FOV.wide;}
  else if(this.view==='medium'){pos=mid.clone().addScaledVector(side,2.9-drift).add(new THREE.Vector3(0,-.1,0));look=mid.clone().add(new THREE.Vector3(0,-.55,0));fov=FOV.medium;}
  else{const kleber=this.view==='overKleber',from=kleber?P:K,to=kleber?K:P,away=kleber?d:d.clone().negate();pos=from.clone().addScaledVector(away,1.35-drift*.4).addScaledVector(side,.85).add(new THREE.Vector3(0,.02,0));look=to.clone().add(new THREE.Vector3(0,-.3,0));fov=FOV.over;}
  camera.fov=fov;camera.updateProjectionMatrix();camera.position.copy(pos);camera.up.copy(up);camera.lookAt(look);
  return true;
 }
 info(){return {active:this.active,act:this.card?.act??null,index:this.card?.index??null,view:this.view,outfit:this.outfit,kleberLook:this.kleberLook,kleber:this.kleber.position.toArray(),pilot:this.pilot.position.toArray(),car:this.car?.position.toArray()??null,bag:this.bag.visible?(this.bagHolder===this.kleber?'kleber':'pilot'):null,suit:this.suit.visible};}
}
