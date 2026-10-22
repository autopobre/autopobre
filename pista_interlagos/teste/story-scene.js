import * as THREE from 'three';
import {OUTFITS,STEVAN_OUTFITS,POSES,clonePose,applyPose,dressPerson} from './pit-crew.js';

// Kléber Eletric's box in Modo História (story-career.js INTRO_LINES, DONE_LINES, MISSED_LINES): the talks
// played in 3D at the door of his team's garage (#70, pit-building.js), his orange Opala parked nose in.
// Kléber comes as a pilot (the welcome, a deadline missed) or as the businessman of his brand, in its black
// T-shirt (the overalls given back); Stevan in what the story has him wear then: street clothes when Kléber lends him
// his overalls, his own red ones when he brings them back in a bag, the loaned black ones when the money
// did not come. Each card of the talk (ImmersiveState.scene, a 'line') picks the shot and the gestures:
// a wide shot to open, the speaker over the other's shoulder, a closer two-shot when something changes hands.
// The divorce (Central #15, story-career.js DIVORCE_LINES) is played at the door of the Box 99: the wife's lawyer,
// in suit and tie with a leather briefcase, walks up, says his lines and hands over the papers; Stevan signs them,
// the lawyer takes them and leaves, Stevan stays alone, head down, then gets his breath back.
const up=new THREE.Vector3(0,1,0);
const yawOf=v=>Math.atan2(-v.z,v.x);
const SCALARS=['y','lean','head','turn','twist','tilt','sway','lid'],PAIRS=['thigh','knee','arm','elbow','spread','roll'];
function blend(cur,target,k){for(const key of SCALARS)cur[key]+=((target[key]??0)-cur[key])*k;for(const key of PAIRS)for(const i of [0,1])cur[key][i]+=((target[key]?.[i]??0)-cur[key][i])*k;}
// What Stevan wears and who comes, by act (the divorce: Stevan as the card says, the lawyer at the Box 99).
const ACTS={intro:{pilot:'civil',kleber:'pilot'},done:{pilot:'proprio',kleber:'business'},missed:{pilot:'emprestado',kleber:'pilot'},divorce:{pilot:null,lawyer:true}};
const FOV={wide:40,medium:34,over:33,close:30,alone:36};
// The divorce's shots, card by card: the lawyer arriving, his words over Stevan's shoulder, the papers, the
// signature, Stevan left alone while the lawyer walks off, Stevan close as he gets up again.
const DIVORCE_SHOTS=['wide','overLawyer','medium','medium','alone','closePilot'];
const material=color=>new THREE.MeshStandardMaterial({color,roughness:.82});
const gold=()=>new THREE.MeshStandardMaterial({color:0xc9a43e,roughness:.35,metalness:.8});
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
// The lawyer's brown leather briefcase hung from its handle (origin at the grip), its long side along his walk.
function briefcaseModel(){
 const g=new THREE.Group();g.name='Maleta_advogado';
 const body=new THREE.Mesh(new THREE.BoxGeometry(.42,.3,.1),material(0x5b3420));body.position.y=-.2;
 const flap=new THREE.Mesh(new THREE.BoxGeometry(.424,.09,.104),material(0x4a2a19));flap.position.y=-.1;
 const handle=new THREE.Mesh(new THREE.TorusGeometry(.05,.011,6,14,Math.PI),material(0x3a2214));handle.position.y=-.045;
 const clasps=[-.11,.11].map(x=>{const m=new THREE.Mesh(new THREE.BoxGeometry(.03,.026,.108),gold());m.position.set(x,-.13,0);return m;});
 for(const o of [body,flap,handle,...clasps]){o.castShadow=true;g.add(o);}return g;
}
// The divorce papers: white sheets in a blue folder, held flat (origin at the near edge, in the hand).
function papersModel(){
 const g=new THREE.Group();g.name='Papeis_divorcio';
 const folder=new THREE.Mesh(new THREE.BoxGeometry(.23,.01,.31),material(0x284a78));folder.position.x=.115;
 const sheets=new THREE.Mesh(new THREE.BoxGeometry(.21,.012,.29),material(0xf3f1ea));sheets.position.set(.12,.006,0);
 for(const o of [folder,sheets]){o.castShadow=true;g.add(o);}return g;
}
function penModel(){const pen=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.14,8),material(0x1d2a52));pen.name='Caneta';return pen;}
export class StoryScene{
 // at(along,out): a world point on the lane floor, `along` metres down the lane from the middle of
 // Kléber's garage door and `out` metres from it toward the lane. car: his Opala, parked nose in.
 // boxAt(along,out): the same inside the Box 99, `out` toward its door (the divorce). groundAt(x,y): the floor height under a
 // world point (physics y = -z), for the feet.
 constructor({people,parent,at,boxAt=null,car=null,groundAt=null,logo=null}){
  this.at=at;this.boxAt=boxAt;this.groundAt=groundAt;this.group=new THREE.Group();this.group.name='Cena_box_Kleber_Eletric';this.group.visible=false;parent.add(this.group);
  this.kleber=people.person(OUTFITS.kleber);this.kleber.name='Kleber_Eletric';this.kleberLook='pilot';
  this.pilot=people.person(STEVAN_OUTFITS.civil);this.pilot.name='Stevan_na_cena';this.outfit='civil';
  this.lawyer=people.person(OUTFITS.lawyer);this.lawyer.name='Advogado_da_esposa';this.lawyer.visible=false;
  this.group.add(this.kleber,this.pilot,this.lawyer);this.other=this.kleber;
  // His brand on the chest and on the cap (the Eletric logo, one of the car's real sponsors).
  if(logo){const badge=(parent,p,w,h,ry,rz=0)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),logo);m.position.set(...p);m.rotation.set(0,ry,rz);parent.add(m);return m;};
   const rig=this.kleber.userData.rig;this.badges=[badge(rig.torso,[.142,.44,-.062],.12,.018,Math.PI/2),badge(rig.head,[.127,.19,0],.1,.016,Math.PI/2,-.3)];}
  if(car){this.car=car;if(car.userData.nameLabel)car.userData.nameLabel.visible=false;car.traverse(o=>{if(o.isSprite)o.visible=false;});this.group.add(car);}
  this.bag=bagModel();this.suit=foldedSuit();this.briefcase=briefcaseModel();this.papers=papersModel();this.pen=penModel();this.group.add(this.bag,this.suit,this.briefcase,this.papers,this.pen);
  this.poses=new Map([[this.kleber,clonePose(POSES.stand)],[this.pilot,clonePose(POSES.stand)],[this.lawyer,clonePose(POSES.stand)]]);
  this.time=0;this.cardTime=0;this.active=false;this.card=null;this.view=null;this.stage=null;this.papersHolder=null;
 }
 foot(p){if(this.groundAt){const y=this.groundAt(p.x,-p.z);if(Number.isFinite(y))p.y=y;}return p;}
 // Where everyone stands. At Kléber's garage: Kléber by his car's flank near the door, Stevan facing him from the
 // lane side. In the Box 99: Stevan inside, the lawyer's spot facing him, the door he comes in by and leaves by.
 place(stage){
  const at=stage==='box99'?this.boxAt??this.at:this.at,O=at(0,0),A=at(1,0).sub(O).setY(0).normalize(),U=at(0,1).sub(O).setY(0).normalize();this.along=A;this.out=U;
  if(stage==='box99'){
   this.pilot.position.copy(this.foot(at(-.6,1.1)));this.lawyerSpot=this.foot(at(.55,2.15));this.lawyerFrom=this.foot(at(1.6,8.2));this.lawyerTo=this.foot(at(2.4,10.5));
   this.lawyer.position.copy(this.lawyerFrom);this.pilot.rotation.y=yawOf(this.lawyerSpot.clone().sub(this.pilot.position).setY(0));
  }else{
   this.kleber.position.copy(this.foot(at(2.05,1.45)));this.pilot.position.copy(this.foot(at(3.2,2.45)));
   const toPilot=this.pilot.position.clone().sub(this.kleber.position).setY(0);this.kleber.rotation.y=yawOf(toPilot);this.pilot.rotation.y=yawOf(toPilot.clone().negate());
   if(this.car){this.car.position.copy(at(0,2.75));this.car.rotation.y=yawOf(U.clone().negate());}
  }
  this.stage=stage;
 }
 // A card of the scene (or none): a new line cuts to its shot; leaving the talk hides the stage.
 sync(card){
  const line=card?.type==='line'&&ACTS[card.act]?card:null;
  if(!line){if(this.active){this.active=false;this.group.visible=false;this.card=null;}return false;}
  const act=ACTS[line.act],stage=act.lawyer?'box99':'kleber';
  if(this.stage!==stage)this.place(stage);
  if(!this.active){this.active=true;this.group.visible=true;this.cardTime=0;}
  if(line!==this.card){
   const outfit=act.pilot??line.outfit??'civil';
   if(outfit!==this.outfit&&STEVAN_OUTFITS[outfit]){dressPerson(this.pilot,STEVAN_OUTFITS[outfit]);this.outfit=outfit;}
   if(!act.lawyer&&act.kleber!==this.kleberLook){dressPerson(this.kleber,act.kleber==='pilot'?OUTFITS.kleber:OUTFITS.kleberBusiness);this.kleberLook=act.kleber;}
   this.other=act.lawyer?this.lawyer:this.kleber;this.kleber.visible=!act.lawyer;this.lawyer.visible=!!act.lawyer&&line.index<5;if(this.car)this.car.visible=!act.lawyer;
   if(this.card?.act!==line.act)this.bagHolder=line.act==='done'?this.pilot:null;
   // The papers: in the lawyer's hand as he holds them out, in Stevan's to sign, back with the lawyer as he goes.
   this.papersHolder=line.act!=='divorce'?null:[null,null,this.lawyer,this.pilot,this.lawyer,null][line.index]??null;
   if(line.act==='divorce'&&line.index===4)this.lawyer.position.copy(this.lawyerSpot);
   this.card=line;this.cardTime=0;this.view=this.shotFor(line);
  }
  return true;
 }
 shotFor(card){
  const how=card.how??'';
  if(card.act==='divorce')return DIVORCE_SHOTS[card.index]??'wide';
  if(card.index===0)return 'wide';
  if(how.includes('bolsa')||card.act==='intro'&&card.index===6)return 'medium';
  return card.who==='kleber'?'overKleber':'overPilot';
 }
 // The lawyer walks: from `from` to `to` over `seconds` after `delay`, legs and the free arm swinging; facing the
 // way he goes, then (arrived) facing Stevan. Returns whether he is still walking.
 walk(p,from,to,seconds,delay=0,thenFace=null){
  const t=THREE.MathUtils.clamp((this.cardTime-delay)/seconds,0,1),walking=t>0&&t<1,law=this.lawyer;
  law.position.lerpVectors(from,to,t);this.foot(law.position);
  if(walking){law.rotation.y=yawOf(to.clone().sub(from).setY(0));const cycle=this.cardTime*6.4,swing=Math.sin(cycle)*.5;
   p.thigh=[-swing,swing];p.knee=[.08+.45*Math.max(0,-Math.cos(cycle)),.08+.45*Math.max(0,Math.cos(cycle))];p.arm[1]=.06-swing*.8;p.elbow[1]=.25;}
  else if(thenFace&&t>=1)law.rotation.y=yawOf(thenFace.clone().sub(law.position).setY(0));
  return walking;
 }
 // The divorce's gestures by card (DIVORCE_LINES): the briefcase always in the lawyer's left hand.
 divorcePose(p,who,c){
  const ct=this.cardTime;
  if(who==='lawyer'){
   p.arm[0]=.04;p.elbow[0]=.1;p.spread[0]=.14;
   if(c.index===0)this.walk(p,this.lawyerFrom,this.lawyerSpot,2.6,0,this.pilot.position);
   if(c.index===2){const reach=Math.min(1,ct*1.6);p.arm[1]=.12+.85*reach;p.elbow[1]=.55-.35*reach;if(ct>1.1){const back=Math.min(1,(ct-1.1)*1.5);p.arm[1]-=.75*back;p.elbow[1]+=.2*back;}}
   if(c.index===3){p.arm[1]=.1;p.elbow[1]=.25;p.head=.12;}
   if(c.index===4){if(!this.walk(p,this.lawyerSpot,this.lawyerTo,5,.6)&&ct<.6)this.lawyer.rotation.y=yawOf(this.pilot.position.clone().sub(this.lawyer.position).setY(0));p.arm[1]=.2;p.elbow[1]=.9;}
   return;
  }
  if(c.index===2&&ct>.7){const take=Math.min(1,(ct-.7)*1.8);p.arm[1]=.12+.75*take;p.elbow[1]=.3+.2*take;if(ct>1.1)this.papersHolder=this.pilot;}
  if(c.index===3){p.head=.48;p.lean=.07;p.turn=.04;if(ct<3.2){p.arm=[.62,.66+.04*Math.sin(this.time*13)];p.elbow=[1.32,1.42+.08*Math.sin(this.time*17)];p.spread=[.05,.02];}else{this.papersHolder=this.lawyer;p.arm=[.04,.04];p.elbow=[.12,.12];}}
  if(c.index===4){p.head=.62;p.lean=.12;p.arm=[.02,.02];p.elbow=[.08,.08];p.y=-.015;p.turn=.25;}
  if(c.index===5){const lift=Math.min(1,ct/1.6);p.head=.62*(1-lift)-.04*lift;p.lean=.12*(1-lift)-.02*lift;p.turn=.25*(1-lift);p.y=-.015*(1-lift)+.01*Math.sin(Math.min(ct,1.6)*2)*lift;}
 }
 // Gestures: the speaker talks with the hands and nods, the other listens; how the line is said changes
 // the body (sad, embarrassed); the bag goes from Stevan's hand to Kléber's; Kléber offers the overalls.
 update(dt){
  if(!this.active)return;this.time+=dt;this.cardTime+=dt;const c=this.card,t=this.time,k=1-Math.exp(-dt*9);
  for(const [person,who] of [[this.other,this.other===this.lawyer?'lawyer':'kleber'],[this.pilot,'pilot']]){
   const talking=c.who===who&&c.text!=='',p=clonePose(POSES.stand),seed=who==='pilot'?1.7:0,how=c.who===who?c.how:'';
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
   if(c.act==='divorce')this.divorcePose(p,who,c);
   const cur=this.poses.get(person);blend(cur,p,k);applyPose(person.userData.rig,cur);
  }
  if(c.act==='done'&&c.index===1&&this.cardTime>=.8)this.bagHolder=this.kleber;
  this.group.updateMatrixWorld(true);
  this.bag.visible=!!this.bagHolder;
  if(this.bag.visible){const hand=this.bagHolder.userData.rig.limbs[1].hand.getWorldPosition(new THREE.Vector3());this.bag.position.copy(this.group.worldToLocal(hand));this.bag.rotation.y=this.bagHolder.rotation.y+Math.PI/2;}
  this.suit.visible=c.act==='intro'&&c.index===6;
  if(this.suit.visible){const l=this.kleber.userData.rig.limbs,a=l[-1].hand.getWorldPosition(new THREE.Vector3()),b=l[1].hand.getWorldPosition(new THREE.Vector3());this.suit.position.copy(this.group.worldToLocal(a.add(b).multiplyScalar(.5))).add(new THREE.Vector3(0,.02,0));this.suit.rotation.y=this.kleber.rotation.y;}
  // The lawyer's briefcase in his left hand; the papers in the hand that holds them (Stevan signs on his left);
  // the pen in Stevan's right hand while he signs.
  const hand=(person,side)=>this.group.worldToLocal(person.userData.rig.limbs[side].hand.getWorldPosition(new THREE.Vector3()));
  this.briefcase.visible=this.lawyer.visible&&this.other===this.lawyer;
  if(this.briefcase.visible){this.briefcase.position.copy(hand(this.lawyer,-1));this.briefcase.rotation.y=this.lawyer.rotation.y;}
  this.papers.visible=!!this.papersHolder&&this.papersHolder.visible;
  if(this.papers.visible){const holder=this.papersHolder,side=holder===this.pilot&&c.index===3?-1:1;this.papers.position.copy(hand(holder,side));this.papers.rotation.set(0,holder.rotation.y+(side<0?-.35:0),holder===this.pilot&&c.index===3?.25:-.15);}
  this.pen.visible=c.act==='divorce'&&c.index===3&&this.papersHolder===this.pilot;
  if(this.pen.visible){this.pen.position.copy(hand(this.pilot,1));this.pen.rotation.set(.9,this.pilot.rotation.y,.5);}
 }
 head(person){return person.position.clone().add(new THREE.Vector3(0,1.58,0));}
 // The camera of the shot, drifting slowly sideways and in, as a hand-held film camera would.
 camera(camera){
  if(!this.active)return false;
  const K=this.head(this.other),P=this.head(this.pilot),mid=K.clone().add(P).multiplyScalar(.5),d=P.clone().sub(K).setY(0).normalize();
  const side=this.out.clone().addScaledVector(d,-this.out.dot(d)).normalize(),drift=Math.min(this.cardTime,12)*.035;
  let pos,look,fov;
  // The subtitles take the bottom of the frame: the shots look a little low, so the people stand higher in it.
  if(this.view==='wide'){pos=mid.clone().addScaledVector(this.out,6).addScaledVector(this.along,.9-drift).add(new THREE.Vector3(0,.1,0));look=mid.clone().addScaledVector(this.out,-.5).add(new THREE.Vector3(0,-.62,0));fov=FOV.wide;}
  else if(this.view==='medium'){pos=mid.clone().addScaledVector(side,(this.stage==='box99'?4.3:2.9)-drift).add(new THREE.Vector3(0,-.1,0));look=mid.clone().add(new THREE.Vector3(0,-.55,0));fov=FOV.medium;}
  // Stevan alone at his door (the lawyer walking out of the frame), and close on him as he lifts his head.
  else if(this.view==='alone'){pos=P.clone().addScaledVector(this.out,4.4).addScaledVector(this.along,-1.6+drift).add(new THREE.Vector3(0,.15,0));look=P.clone().addScaledVector(this.along,.3).add(new THREE.Vector3(0,-.7,0));fov=FOV.alone;}
  else if(this.view==='closePilot'){const f=new THREE.Vector3(Math.cos(this.pilot.rotation.y),0,-Math.sin(this.pilot.rotation.y));pos=P.clone().addScaledVector(f,3-drift*.3).addScaledVector(this.along,-.45).add(new THREE.Vector3(0,.08,0));look=P.clone().add(new THREE.Vector3(0,-.3,0));fov=FOV.close;}
  else{const toOther=this.view!=='overPilot',from=toOther?P:K,to=toOther?K:P,away=toOther?d:d.clone().negate();pos=from.clone().addScaledVector(away,1.35-drift*.4).addScaledVector(side,.85).add(new THREE.Vector3(0,.02,0));look=to.clone().add(new THREE.Vector3(0,-.3,0));fov=FOV.over;}
  camera.fov=fov;camera.updateProjectionMatrix();camera.position.copy(pos);camera.up.copy(up);camera.lookAt(look);
  return true;
 }
 info(){return {active:this.active,act:this.card?.act??null,index:this.card?.index??null,view:this.view,stage:this.stage,outfit:this.outfit,kleberLook:this.kleberLook,kleber:this.kleber.position.toArray(),pilot:this.pilot.position.toArray(),
  lawyer:this.lawyer.visible?this.lawyer.position.toArray():null,car:this.car?.visible?this.car.position.toArray():null,bag:this.bag.visible?(this.bagHolder===this.kleber?'kleber':'pilot'):null,suit:this.suit.visible,
  briefcase:this.briefcase.visible,papers:this.papers.visible?(this.papersHolder===this.lawyer?'lawyer':'pilot'):null,pen:this.pen.visible};}
}
