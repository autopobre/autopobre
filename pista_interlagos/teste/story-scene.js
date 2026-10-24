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
// The daughter's kart (Central #16, DONE_LINES.kart) too: she drives round on the lane in front of the Box 99 while
// her father watches from the door, then stops in front of him.
const up=new THREE.Vector3(0,1,0);
const yawOf=v=>Math.atan2(-v.z,v.x);
const SCALARS=['y','lean','head','turn','twist','tilt','sway','lid'],PAIRS=['thigh','knee','arm','elbow','spread','roll'];
function blend(cur,target,k){for(const key of SCALARS)cur[key]+=((target[key]??0)-cur[key])*k;for(const key of PAIRS)for(const i of [0,1])cur[key][i]+=((target[key]?.[i]??0)-cur[key][i])*k;}
// What Stevan wears and who comes, by act (the divorce: Stevan as the card says, the lawyer at the Box 99; the kart:
// his daughter at the Box 99).
const ACTS={intro:{pilot:'civil',kleber:'pilot'},done:{pilot:'proprio',kleber:'business'},missed:{pilot:'emprestado',kleber:'pilot'},divorce:{pilot:null,lawyer:true},kart:{pilot:null,daughter:true}};
const FOV={wide:40,medium:34,over:33,close:30,alone:36};
// The divorce's shots, card by card: the lawyer arriving, his words over Stevan's shoulder, the papers, the
// signature, Stevan left alone while the lawyer walks off, Stevan close as he gets up again.
const DIVORCE_SHOTS=['wide','overLawyer','medium','medium','alone','closePilot'];
// The kart's: the lane from the door with her going round, over Stevan's shoulder following her, both as she stops in
// front of him, Stevan close. KART: her loop's half-length along the lane (its width fits the lane: place), her speed,
// where she stops (out from Stevan) and how long the stop takes, her size.
const KART_SHOTS=['kartWide','kartOver','kartStop','kartClose'];
const KART=Object.freeze({along:5.4,speed:3.4,stop:1.9,stopTime:2.6,child:.62});
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
// The 99 of her father's car on the kart's nose plate: black on yellow (none outside a browser).
function plateTexture(){
 if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=128;c.height=80;const ctx=c.getContext('2d');
 ctx.fillStyle='#f2c418';ctx.fillRect(0,0,128,80);ctx.fillStyle='#151617';ctx.font='900 62px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('99',64,44);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
// A cadet kart, pink and yellow like her overalls: tube frame, floor tray, nose, side pods, seat, wheel and the engine
// beside her. Origin on the ground under the seat, nose to +x. userData.wheels: {pivot (steers), tyre (rolls), r, front}.
function kartModel(){
 const g=new THREE.Group();g.name='Kart_filha';
 const pink=material(0xd8418f),yellow=material(0xf2c418),black=new THREE.MeshStandardMaterial({color:0x151617,roughness:.62}),grey=material(0x5d6166);
 const chrome=new THREE.MeshStandardMaterial({color:0xb9bec4,roughness:.3,metalness:.85});
 const add=(geometry,mat,[x,y,z],[rx,ry,rz]=[0,0,0],parent=g)=>{const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;parent.add(m);return m;};
 for(const z of [-.24,.24])add(new THREE.CylinderGeometry(.016,.016,1.3,8),chrome,[.02,.07,z],[0,0,Math.PI/2]);
 for(const x of [-.5,.05,.48])add(new THREE.CylinderGeometry(.014,.014,.5,8),chrome,[x,.07,0],[Math.PI/2,0,0]);
 add(new THREE.BoxGeometry(.92,.012,.44),black,[.08,.062,0]);
 add(new THREE.BoxGeometry(.3,.11,.66),pink,[.7,.12,0],[0,0,-.22]);
 add(new THREE.BoxGeometry(.06,.2,.46),pink,[.53,.2,0],[0,0,-.32]);
 const plate=plateTexture();if(plate)add(new THREE.PlaneGeometry(.2,.125),new THREE.MeshStandardMaterial({map:plate,roughness:.55}),[.567,.215,0],[0,Math.PI/2,0]).castShadow=false;
 for(const z of [-1,1]){add(new THREE.BoxGeometry(.6,.1,.12),pink,[-.02,.12,z*.4]);add(new THREE.BoxGeometry(.6,.025,.125),yellow,[-.02,.18,z*.4]);}
 add(new THREE.BoxGeometry(.13,.1,1.02),yellow,[-.76,.12,0]);
 // The seat leaned back, the column and the wheel tilted up to her hands.
 add(new THREE.BoxGeometry(.3,.035,.3),black,[-.12,.1,0]);add(new THREE.BoxGeometry(.04,.32,.32),black,[-.29,.25,0],[0,0,.32]);
 add(new THREE.CylinderGeometry(.012,.012,.4,8),chrome,[.33,.2,0],[0,0,1.02]);
 const ring=add(new THREE.TorusGeometry(.115,.014,8,28),black,[.18,.33,0]);ring.rotation.order='ZYX';ring.rotation.set(0,Math.PI/2,-.62);
 // The engine on her right, behind the side pod, its exhaust out to the back.
 add(new THREE.BoxGeometry(.22,.2,.15),grey,[-.4,.2,.31]);add(new THREE.CylinderGeometry(.03,.03,.3,10),chrome,[-.58,.2,.31],[0,0,Math.PI/2]);
 const wheels=[];
 for(const [x,z,r,w,front] of [[-.56,-.5,.135,.17,false],[-.56,.5,.135,.17,false],[.46,-.47,.125,.12,true],[.46,.47,.125,.12,true]]){
  const pivot=new THREE.Group();pivot.position.set(x,r,z);g.add(pivot);const tyre=new THREE.Group();pivot.add(tyre);
  add(new THREE.CylinderGeometry(r,r,w,18),black,[0,0,0],[Math.PI/2,0,0],tyre);add(new THREE.CylinderGeometry(r*.55,r*.55,w+.006,12),chrome,[0,0,0],[Math.PI/2,0,0],tyre);
  wheels.push({pivot,tyre,r,front});
 }
 g.userData.wheels=wheels;return g;
}
// Her open-face helmet (the face shows: she talks), white with a yellow peak; it sits on the head bone.
function helmetModel(){
 const g=new THREE.Group();g.name='Capacete_filha';
 const shell=new THREE.Mesh(new THREE.SphereGeometry(.143,20,14,Math.PI+.66,Math.PI*2-1.32,0,Math.PI*.66),new THREE.MeshStandardMaterial({color:0xf4f1ea,roughness:.25,side:THREE.DoubleSide}));
 shell.position.set(-.008,.1,0);shell.scale.set(1.05,1.13,1.02);shell.castShadow=true;
 const peak=new THREE.Mesh(new THREE.BoxGeometry(.07,.012,.17),material(0xf2c418));peak.position.set(.12,.205,0);peak.rotation.z=-.25;
 g.add(shell,peak);return g;
}
export class StoryScene{
 // at(along,out): a world point on the lane floor, `along` metres down the lane from the middle of
 // Kléber's garage door and `out` metres from it toward the lane. car: his Opala, parked nose in.
 // boxAt(along,out): the same inside the Box 99, `out` toward its door (the divorce); boxLane: its door and the lane's
 // far edge in those `out` metres (the kart). groundAt(x,y): the floor height under a world point (physics y = -z), for the feet.
 constructor({people,parent,at,boxAt=null,boxLane=null,car=null,groundAt=null,logo=null}){
  this.at=at;this.boxAt=boxAt;this.boxLane=boxLane;this.groundAt=groundAt;this.group=new THREE.Group();this.group.name='Cena_box_Kleber_Eletric';this.group.visible=false;parent.add(this.group);
  this.kleber=people.person(OUTFITS.kleber);this.kleber.name='Kleber_Eletric';this.kleberLook='pilot';
  this.pilot=people.person(STEVAN_OUTFITS.civil);this.pilot.name='Stevan_na_cena';this.outfit='civil';
  this.lawyer=people.person(OUTFITS.lawyer);this.lawyer.name='Advogado_da_esposa';this.lawyer.visible=false;
  this.group.add(this.kleber,this.pilot,this.lawyer);this.other=this.kleber;
  // His daughter at a child's size (a bigger head for her age), seated in her kart, helmet on.
  this.kart=kartModel();this.kart.visible=false;this.group.add(this.kart);
  this.daughter=people.person(OUTFITS.daughter);this.daughter.name='Filha_do_Stevan';this.daughter.scale.setScalar(KART.child);this.daughter.position.set(-.12,0,0);
  this.daughter.userData.rig.head.scale.setScalar(1.22);this.daughter.userData.rig.head.add(helmetModel());this.kart.add(this.daughter);
  this.kartState={u:0,stop:null,heading:0,steer:0,last:null};
  // His brand on the chest and on the cap (the Eletric logo, one of the car's real sponsors).
  if(logo){const badge=(parent,p,w,h,ry,rz=0)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),logo);m.position.set(...p);m.rotation.set(0,ry,rz);parent.add(m);return m;};
   const rig=this.kleber.userData.rig;this.badges=[badge(rig.torso,[.142,.44,-.062],.12,.018,Math.PI/2),badge(rig.head,[.127,.19,0],.1,.016,Math.PI/2,-.3)];}
  if(car){this.car=car;if(car.userData.nameLabel)car.userData.nameLabel.visible=false;car.traverse(o=>{if(o.isSprite)o.visible=false;});this.group.add(car);}
  this.bag=bagModel();this.suit=foldedSuit();this.briefcase=briefcaseModel();this.papers=papersModel();this.pen=penModel();this.group.add(this.bag,this.suit,this.briefcase,this.papers,this.pen);
  this.poses=new Map([[this.kleber,clonePose(POSES.stand)],[this.pilot,clonePose(POSES.stand)],[this.lawyer,clonePose(POSES.stand)],[this.daughter,clonePose(POSES.stand)]]);
  this.time=0;this.cardTime=0;this.active=false;this.card=null;this.view=null;this.stage=null;this.papersHolder=null;
 }
 foot(p){if(this.groundAt){const y=this.groundAt(p.x,-p.z);if(Number.isFinite(y))p.y=y;}return p;}
 // Where everyone stands. At Kléber's garage: Kléber by his car's flank near the door, Stevan facing him from the
 // lane side. In the Box 99: Stevan inside, the lawyer's spot facing him, the door he comes in by and leaves by.
 place(stage){
  const at=stage!=='kleber'?this.boxAt??this.at:this.at,O=at(0,0),A=at(1,0).sub(O).setY(0).normalize(),U=at(0,1).sub(O).setY(0).normalize();this.along=A;this.out=U;
  if(stage==='kart'){
   // Stevan just outside the Box 99's door, facing the lane; her loop beyond him, short of the lane's far edge (the
   // pit wall), the stop in front of him.
   const {door,wall}=this.boxLane??{door:9,wall:18},near=door+.6+KART.stop+1.3,far=Math.max(near+1.6,wall-.9);
   this.pilot.position.copy(this.foot(at(-.4,door+.6)));this.pilot.rotation.y=yawOf(U);this.kartAcross=(far-near)/2;
   this.kartCentre=this.foot(at(0,(near+far)/2));this.kartStop=this.foot(this.pilot.position.clone().addScaledVector(U,KART.stop));
  }else if(stage==='box99'){
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
  const act=ACTS[line.act],stage=act.lawyer?'box99':act.daughter?'kart':'kleber';
  if(this.stage!==stage)this.place(stage);
  if(!this.active){this.active=true;this.group.visible=true;this.cardTime=0;}
  if(line!==this.card){
   const outfit=act.pilot??line.outfit??'civil';
   if(outfit!==this.outfit&&STEVAN_OUTFITS[outfit]){dressPerson(this.pilot,STEVAN_OUTFITS[outfit]);this.outfit=outfit;}
   if(!act.lawyer&&act.kleber!==this.kleberLook){dressPerson(this.kleber,act.kleber==='pilot'?OUTFITS.kleber:OUTFITS.kleberBusiness);this.kleberLook=act.kleber;}
   this.other=act.lawyer?this.lawyer:act.daughter?this.daughter:this.kleber;this.kleber.visible=!act.lawyer&&!act.daughter;this.lawyer.visible=!!act.lawyer&&line.index<5;if(this.car)this.car.visible=!act.lawyer&&!act.daughter;
   this.kart.visible=!!act.daughter;if(act.daughter&&this.card?.act!=='kart'){this.kartState={u:-Math.PI/2,stop:null,heading:0,steer:0,last:null};this.driveKart(0);}
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
  if(card.act==='kart')return KART_SHOTS[card.index]??'kartWide';
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
 // Her kart: round the loop at a steady speed while the first two lines play, then (the third) a smooth curve to a
 // stop in front of her father; the wheels roll by the distance, the front ones steer by the turn.
 kartPoint(u){const a=KART.along,b=this.kartAcross;return {p:this.kartCentre.clone().addScaledVector(this.along,a*Math.cos(u)).addScaledVector(this.out,b*Math.sin(u)),d:this.along.clone().multiplyScalar(-a*Math.sin(u)).addScaledVector(this.out,b*Math.cos(u))};}
 driveKart(dt){
  const k=this.kartState,c=this.card;let p,d;
  if(c?.act!=='kart'||c.index<2){const now=this.kartPoint(k.u);k.u+=dt*KART.speed/Math.max(.5,now.d.length());({p,d}=this.kartPoint(k.u));}
  else{
   if(!k.stop){const from=this.kart.position.clone(),dir=new THREE.Vector3(Math.cos(k.heading),0,-Math.sin(k.heading)),end=this.kartStop.clone(),side=Math.sign(dir.dot(this.along))||1;
    const reach=Math.max(1,from.distanceTo(end)/3);k.stop={b:[from,from.clone().addScaledVector(dir,reach),end.clone().addScaledVector(this.along,-side*reach),end],t:0};}
   k.stop.t=Math.min(KART.stopTime,k.stop.t+dt);const s=k.stop.t/KART.stopTime,t=1-(1-s)**3,[b0,b1,b2,b3]=k.stop.b,u=1-t;
   p=b0.clone().multiplyScalar(u*u*u).addScaledVector(b1,3*u*u*t).addScaledVector(b2,3*u*t*t).addScaledVector(b3,t*t*t);
   d=b1.clone().sub(b0).multiplyScalar(3*u*u).addScaledVector(b2.clone().sub(b1),6*u*t).addScaledVector(b3.clone().sub(b2),3*t*t);
  }
  this.foot(p);const heading=d.lengthSq()>1e-8?yawOf(d):k.heading,moved=k.last?p.distanceTo(k.last):0;
  const turn=Math.atan2(Math.sin(heading-k.heading),Math.cos(heading-k.heading));
  k.steer+=(THREE.MathUtils.clamp(moved>1e-4?turn/moved*.9:0,-.45,.45)-k.steer)*Math.min(1,dt*8);
  k.heading=heading;k.last=p.clone();this.kart.position.copy(p);this.kart.rotation.set(0,heading,-k.steer*.05);
  for(const w of this.kart.userData.wheels){w.tyre.rotation.z-=moved/w.r;if(w.front)w.pivot.rotation.y=k.steer;}
 }
 // Seated in the kart she drives, looks over to her father and (stopped) waves; Stevan follows her with his eyes,
 // proud (clapping), then moved (a hand on his chest).
 kartPose(p,who,c){
  const ct=this.cardTime,P=this.pilot.position,K=this.kart.position;
  if(who==='daughter'){
   Object.assign(p,{y:-.74,lean:-.14,head:-.05,turn:0,tilt:0,twist:0,sway:0,thigh:[1.38,1.38],knee:[.32,.32],arm:[1.02,1.02],elbow:[.62,.62],spread:[.05,.05]});
   const toDad=Math.atan2(Math.sin(yawOf(P.clone().sub(K).setY(0))-this.kart.rotation.y),Math.cos(yawOf(P.clone().sub(K).setY(0))-this.kart.rotation.y));
   const stopped=c.index>=2&&ct>KART.stopTime*.85;p.turn=THREE.MathUtils.clamp(toDad,-1.1,1.1)*(stopped||c.index===0?.9:.35);
   if(stopped&&c.index===2){const wave=Math.sin(this.time*9);p.arm[1]=2.5;p.elbow[1]=.4+.25*wave;p.spread[1]=.25;}
   if(c.text&&c.who==='daughter')p.head+=.03*Math.sin(this.time*5.3);
   return;
  }
  const look=Math.atan2(Math.sin(yawOf(K.clone().sub(P).setY(0))-this.pilot.rotation.y),Math.cos(yawOf(K.clone().sub(P).setY(0))-this.pilot.rotation.y));
  p.turn=THREE.MathUtils.clamp(look,-1.15,1.15);p.twist=THREE.MathUtils.clamp(look*.35,-.4,.4);
  if(c.index===1){const clap=Math.abs(Math.sin(this.time*7));p.arm=[.95,.95];p.elbow=[.75+.25*clap,.75+.25*clap];p.spread=[.02-.12*clap,.02-.12*clap];}
  if(c.index===3){p.head=.18;p.arm[1]=.55;p.elbow[1]=2.05;p.spread[1]=.55;p.lean=.03;}
 }
 // Gestures: the speaker talks with the hands and nods, the other listens; how the line is said changes
 // the body (sad, embarrassed); the bag goes from Stevan's hand to Kléber's; Kléber offers the overalls.
 update(dt){
  if(!this.active)return;this.time+=dt;this.cardTime+=dt;const c=this.card,t=this.time,k=1-Math.exp(-dt*9);
  if(c.act==='kart')this.driveKart(dt);
  for(const [person,who] of [[this.other,this.other===this.lawyer?'lawyer':this.other===this.daughter?'daughter':'kleber'],[this.pilot,'pilot']]){
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
   if(c.act==='kart')this.kartPose(p,who,c);
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
 head(person){return person===this.daughter?person.userData.rig.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.08,0)):person.position.clone().add(new THREE.Vector3(0,1.58,0));}
 // The kart's shots (KART_SHOTS), the lane seen from the Box 99's door and back.
 kartCamera(camera){
  const P=this.head(this.pilot),K=this.head(this.daughter),toK=K.clone().sub(P).setY(0).normalize(),side=new THREE.Vector3(-toK.z,0,toK.x),drift=Math.min(this.cardTime,12)*.03;
  let pos,look,fov;
  // Wide and over the shoulder from above the crew's heads at the door, down the lane at her loop.
  if(this.view==='kartWide'){pos=P.clone().addScaledVector(this.along,-7.5+drift).addScaledVector(this.out,1.2).add(new THREE.Vector3(0,1.1,0));look=this.kartCentre.clone().addScaledVector(this.along,1.2).add(new THREE.Vector3(0,-.2,0));fov=46;}
  else if(this.view==='kartOver'){pos=P.clone().addScaledVector(toK,-1.5).addScaledVector(side,.75).add(new THREE.Vector3(0,.45,0));look=K.clone().add(new THREE.Vector3(0,-.3,0));fov=40;}
  else if(this.view==='kartStop'){const mid=P.clone().lerp(this.kartStop,.5);pos=mid.clone().addScaledVector(this.out,4.6).addScaledVector(this.along,1.6-drift).add(new THREE.Vector3(0,.15,0));look=mid.clone().add(new THREE.Vector3(0,-.75,0));fov=38;}
  else{pos=P.clone().addScaledVector(this.out,2.4).addScaledVector(this.along,.55).add(new THREE.Vector3(0,-.02,0));look=P.clone().add(new THREE.Vector3(0,-.18,0));fov=FOV.close;}
  camera.fov=fov;camera.updateProjectionMatrix();camera.position.copy(pos);camera.up.copy(up);camera.lookAt(look);
  return true;
 }
 // The camera of the shot, drifting slowly sideways and in, as a hand-held film camera would.
 camera(camera){
  if(!this.active)return false;
  if(this.stage==='kart')return this.kartCamera(camera);
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
  briefcase:this.briefcase.visible,papers:this.papers.visible?(this.papersHolder===this.lawyer?'lawyer':'pilot'):null,pen:this.pen.visible,
  kart:this.active&&this.kart.visible?{position:this.kart.position.toArray(),heading:this.kart.rotation.y,stopped:!!this.kartState.stop&&this.kartState.stop.t>=KART.stopTime,daughter:this.head(this.daughter).toArray()}:null};}
}
