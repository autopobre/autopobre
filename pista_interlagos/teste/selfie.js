// A selfie out of the car (user, 2026-10-18: "quando sai do carro, aperta um botão que puxa o celular para tirar
// selfie... vai aparecer o rosto dele e uma tecla para bater a foto... vertical ou horizontal... ajusta pra aparecer a
// cena no fundo e quando apertar para tirar a foto ele sorri pra câmera e levanta a mão mostrando o dedo em V com o
// indicador e o médio... a pessoa pode compartilhar a foto").
// Q (the controller's B, the Selfie button on touch screens) takes the phone out: he turns round to face the view the
// player was looking at, so the scene the camera saw ends up behind him, and holds the phone up in his right hand at
// arm's length; the screen becomes its front camera, framed like a phone (3:4 upright or 4:3 lying, R turns it). The
// mouse or A/D turn him with the scene behind him, the mouse's height or W/S lift or drop the phone round his face, the
// wheel brings it closer or farther (past his reach the lens opens wider). Space, a click or the shutter: he smiles,
// shows the V of his index and middle fingers by his face, the shutter clicks, and the picture (cut from the screen, with
// the game's signature in a corner) comes up to share, download, copy or take again.
// The arms are placed by a small solver over the rig's own joints (pit-crew.js: raise, spread, elbow, forearm roll); the
// wrists turn the hand bones (the phone's grip, the V's palm toward the lens).
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyPose,clonePose,POSES} from './pit-crew.js';
import {keyName,keyText} from './key-bindings.js';

// The photo: its shape and its height's lens. 9:16 upright and 16:9 lying, a story's and a video's (user, 2026-10-18: "seria
// se a foto fosse 9:16 e 16:9"; it was a phone's 3:4), with SHORT degrees across the short side either way: wide enough
// for his face and the V beside it at arm's length.
const SHORT=54,LONG=2*Math.atan(Math.tan(SHORT*Math.PI/360)*16/9)*180/Math.PI;
export const PHOTO=Object.freeze({vertical:{aspect:9/16,fov:LONG,label:'Vertical'},horizontal:{aspect:16/9,fov:SHORT,label:'Horizontal'}});
// Round his eyes (hero frame: +x ahead of him, +y up, +z his right): the phone's height (radians), its distance (m, the
// arm's reach is ~.45) and its side (his right hand); WIDE: the widest lens past the reach (×tan).
export const SELFIE=Object.freeze({elevation:[-.3,.55],start:.2,reach:[.28,.44],side:.24,zoom:.75,wide:1.3});
// The shot is drawn sharper than the race: about SHARP pixels on the photo's long side, the whole frame at most MAX_PIXELS
// (a 4K picture) and the density at most 3 (2.5 on touch screens).
const SHARP=1920,MAX_PIXELS=8.3e6;
const EYES=new THREE.Vector3(.095,1.648,0),RAISE=.42,LOWER=.3,SMILE=.5,HOLD=.4,TURN=.0025,LIFT=.002;
// The hand on the hip while he frames (pit-crew.js ARMS.hip: raise, elbow, spread, roll).
const HIP={raise:-.43,elbow:1.59,spread:.69,roll:1.12};
// The V's wrist beside his face (hero frame from his eyes, his left hand: the right one mirrors z) and the way the forearm
// points (up, toward the face).
const V_WRIST=new THREE.Vector3(.05,-.08,-.08),V_FOREARM=new THREE.Vector3(.25,1,.35).normalize();
// The phone's grip never goes past ARM_REACH from its shoulder (the arm .57 m, a little bent); a natural reach to start from.
const ARM_REACH=.55,GRIP_REST=[1.9,.3,.35,.2],IDENTITY=new THREE.Quaternion();
// Where his face goes across the photo (-1 its left edge, +1 its right) for each place: left, middle, right.
const FACE_AT=Object.freeze({vertical:[-.3,-.14,.3],horizontal:[-.4,-.05,.4]});
const LIMITS=[[-.6,3.1],[-.5,1.7],[0,2.6],[-1.6,1.6]],PLACE_KEYS=Object.freeze({Digit1:-1,Digit2:0,Digit3:1});
// The window (1280 x 720 without one: the Node checks).
const screenSize=()=>({W:globalThis.innerWidth??1280,H:globalThis.innerHeight??720});
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);},lerp=(a,b,k)=>a+(b-a)*k,clamp=THREE.MathUtils.clamp;

// Vertex-coloured parts in the people's own material (no new shader: the head carries the same attributes).
function part(g,color,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1]){
 g.deleteAttribute('uv');g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(...scale)));
 const c=new THREE.Color(color),n=g.attributes.position.count,rgb=new Float32Array(n*3);for(let i=0;i<n;i++){rgb[i*3]=c.r;rgb[i*3+1]=c.g;rgb[i*3+2]=c.b;}
 g.setAttribute('color',new THREE.BufferAttribute(rgb,3));return g;
}
const merge=parts=>{const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());return g;};
// The phone in its own frame: width along x, height along y (the top, +y, carries the front camera), the screen on +z.
function phoneGeometry(){
 return merge([part(new THREE.BoxGeometry(.071,.146,.0085),0x16181b),part(new THREE.BoxGeometry(.066,.139,.001),0x0d1d2a,[0,0,.0043]),part(new THREE.SphereGeometry(.0028,8,6),0x05070a,[0,.064,.0047]),
  part(new THREE.BoxGeometry(.024,.036,.002),0x2b2e33,[-.019,.048,-.0052]),...[[-.025,.056],[-.013,.056],[-.025,.04]].map(([x,y])=>part(new THREE.CylinderGeometry(.0048,.0048,.002,12),0x0a0b0d,[x,y,-.0064],[Math.PI/2,0,0]))]);
}
// The V in the hand's frame (-y toward the fingers, the thumb on +x, the palm on `palm` z): index and middle out and
// apart, ring and little fingers curled into the palm.
function vGeometry(color,palm){
 const finger=(x,y,angle,len)=>{const dir=new THREE.Vector3(Math.sin(angle),-Math.cos(angle),0),c=new THREE.Vector3(x,y,0).addScaledVector(dir,len/2+.0095);return part(new THREE.CapsuleGeometry(.0095,len,3,8),color,c.toArray(),[0,0,angle]);};
 return merge([finger(.016,-.044,.2,.062),finger(-.006,-.047,-.14,.068),part(new THREE.SphereGeometry(.0115,8,6),color,[-.018,-.043,palm*.013]),part(new THREE.SphereGeometry(.0105,8,6),color,[-.03,-.035,palm*.011])]);
}
// The open smile in the head's frame (face toward +x, the mouth at y ≈ .042): a D of dark mouth bent round the jaw, the
// upper teeth across its top, both just in front of the flat mouth they replace.
function grinGeometry(){
 const top=z=>.049+7*z*z,shape=(bottom,inset)=>{const s=new THREE.Shape(),n=14;s.moveTo(-.025+inset,top(.025)-inset*.4);
  for(let i=1;i<=n;i++){const z=-.025+inset+(.05-2*inset)*i/n;s.lineTo(z,top(z));}
  for(let i=1;i<n;i++){const z=.025-inset-(.05-2*inset)*i/n,u=z/(.025-inset);s.lineTo(z,bottom(z,u));}return s;};
 const bend=(g,x)=>{g.rotateY(Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setX(i,x-9*p.getZ(i)**2);g.computeVertexNormals();return g;};
 const mouth=bend(part(new THREE.ShapeGeometry(shape((z,u)=>top(z)-.022*Math.sqrt(Math.max(0,1-u*u)),0),14),0x3b1213),.108);
 const teeth=bend(part(new THREE.ShapeGeometry(shape((z,u)=>top(z)-.0075*Math.sqrt(Math.max(0,1-u*u*u*u)),.003),14),0xf1ece2),.1086);
 return merge([mouth,teeth]);
}

// The arm's chain in the torso's frame (pit-crew.js applyPose): hand bone place and forearm way for [raise, spread,
// elbow, roll]; side +1 his right.
const QA=new THREE.Quaternion(),QF=new THREE.Quaternion(),EUL=new THREE.Euler(),T1=new THREE.Vector3();
function reachOf(limb,side,[raise,spread,elbow,roll],out={pos:new THREE.Vector3(),dir:new THREE.Vector3(),q:new THREE.Quaternion()}){
 QA.setFromEuler(EUL.set(-side*spread,0,raise));QF.setFromEuler(EUL.set(0,side*roll,elbow));
 out.q.copy(QA).multiply(QF);out.pos.copy(limb.hand.position).applyQuaternion(out.q).add(T1.copy(limb.fore.position).applyQuaternion(QA)).add(limb.arm.position);
 out.dir.set(0,-1,0).applyQuaternion(out.q);return out;
}
// Damped least squares over the four angles: the hand bone at `target` (torso frame), the forearm along `dir` if asked,
// close to `rest` (a natural pose) where the reach leaves freedom. Starts from `from`.
const RES=new THREE.Vector3();
export function solveArm(limb,side,from,target,{dir=null,dirWeight=.08,rest=from,restWeight=.03,steps=8}={}){
 const q=[...from],out={pos:new THREE.Vector3(),dir:new THREE.Vector3(),q:new THREE.Quaternion()};
 const residual=a=>{reachOf(limb,side,a,out);const r=[out.pos.x-target.x,out.pos.y-target.y,out.pos.z-target.z];if(dir)r.push((out.dir.x-dir.x)*dirWeight,(out.dir.y-dir.y)*dirWeight,(out.dir.z-dir.z)*dirWeight);for(let i=0;i<4;i++)r.push((a[i]-rest[i])*restWeight);return r;};
 for(let step=0;step<steps;step++){
  const r=residual(q),J=[];
  for(let j=0;j<4;j++){const a=[...q];a[j]+=1e-4;const r2=residual(a);J.push(r2.map((v,i)=>(v-r[i])/1e-4));}
  // (JᵀJ + λI) δ = Jᵀr, four by four.
  const A=[0,1,2,3].map(i=>[0,1,2,3].map(j=>J[i].reduce((s,v,k)=>s+v*J[j][k],0)+(i===j?1e-3:0))),b=[0,1,2,3].map(i=>J[i].reduce((s,v,k)=>s+v*r[k],0));
  for(let i=0;i<4;i++){let p=i;for(let k=i+1;k<4;k++)if(Math.abs(A[k][i])>Math.abs(A[p][i]))p=k;[A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];for(let k=i+1;k<4;k++){const f=A[k][i]/A[i][i];for(let j=i;j<4;j++)A[k][j]-=f*A[i][j];b[k]-=f*b[i];}}
  const d=[0,0,0,0];for(let i=3;i>=0;i--){let s=b[i];for(let j=i+1;j<4;j++)s-=A[i][j]*d[j];d[i]=s/A[i][i];}
  for(let i=0;i<4;i++)q[i]=clamp(q[i]-d[i],...LIMITS[i]);
 }
 reachOf(limb,side,q,out);return {angles:q,pos:out.pos.clone(),miss:out.pos.distanceTo(target)};
}
// A rotation from its x, y and z axes.
const BASIS=new THREE.Matrix4();
// Pictures can go to the clipboard here (a secure page with the async clipboard).
const clipboardImages=()=>!!globalThis.ClipboardItem&&!!globalThis.navigator?.clipboard?.write;
const fromAxes=(x,y,z,q=new THREE.Quaternion())=>q.setFromRotationMatrix(BASIS.makeBasis(x,y,z));

export class Selfie {
 // hero: the walking pilot (pit-crew.js person); emit(name): a sound; label(): where he is, pilot(): the player's name,
 // both for the signature; freeMouse / lockMouse: main.js lets the captured mouse go to click the photo's buttons, and
 // takes it again; hud: the screens.
 constructor({hero,emit=()=>{},label=()=>'',pilot=()=>'',freeMouse=()=>{},lockMouse=()=>{},hud=typeof document!=='undefined'}){
  Object.assign(this,{hero,emit,label,pilot,freeMouse,lockMouse});this.rig=hero.userData.rig;
  this.phase='off';this.t=0;this.orientation='vertical';this.elevation=SELFIE.start;this.zoomLevel=SELFIE.zoom;this.v=0;this.pending=false;this.photo=null;this.blob=null;this.note='';this.photos=0;
  const material=hero.userData.head.material;
  this.phone=new THREE.Mesh(phoneGeometry(),material);this.phone.name='Celular_selfie';this.phone.castShadow=true;this.phone.visible=false;hero.add(this.phone);
  this.grin=new THREE.Mesh(grinGeometry(),material);this.grin.name='Sorriso_selfie';this.grin.visible=false;this.rig.head.add(this.grin);
  this.fingers={};this.handColor=null;this.place=0;this.hand=1;this.handSide=1;this.u=FACE_AT.vertical[1];this.vArm=null;this.arms={};this.restArms();
  this.pose=clonePose(POSES.stand);this.blink=-1;this.blinkIn=2;this.lens=new THREE.Vector3();this.look=new THREE.Vector3();this.view=new THREE.Vector3(1,0,0);this.rect={x:0,y:0,w:1,h:1};
  this.mouthBase=null;this.mouthState='neutral';
  if(hud)this.buildHud();
 }
 // Phone out: raising it, framing, the pose for the shot, the photo on screen, putting it away.
 get busy(){return this.phase!=='off';}
 // The phone's camera is the view (main.js and free-walk.js stay off the camera).
 get owns(){return ['frame','pose','review'].includes(this.phase);}
 get touch(){return !!globalThis.document?.body?.classList.contains('touch-device');}
 // Takes the phone out, turning to `facing` (radians, the hero's rotation.y: back to the scene). outfit: his clothes
 // (the V's fingers in his gloves or his skin).
 open({facing=this.hero.rotation.y,outfit=null}={}){
  if(this.phase!=='off')return false;
  // The V's fingers on either hand (the palm on the inner side of each), in his gloves or his skin.
  const color=outfit?.hands??outfit?.skin??0xc98f68;
  if(color!==this.handColor){this.handColor=color;for(const side of [-1,1]){const old=this.fingers[side];old?.removeFromParent();old?.geometry.dispose();const m=this.fingers[side]=new THREE.Mesh(vGeometry(color,-side),this.hero.userData.head.material);m.name='Dedos_V';m.visible=false;this.rig.limbs[side].hand.add(m);}}
  this.phase='raise';this.t=0;this.from=this.hero.rotation.y;this.facing=facing;this.v=0;this.pending=false;this.shot=false;this.vArm=null;this.elevation=SELFIE.start;
  this.place=0;this.hand=1;this.handSide=1;this.u=this.faceAt();this.reach=null;this.restArms();
  this.pose=clonePose(POSES.stand);this.phone.visible=true;this.emit('click');return true;
 }
 // Both arms hanging, the phone's to start from a natural reach.
 restArms(){const stand=POSES.stand;for(const side of [-1,1]){const i=side>0?1:0,rest=[stand.arm[i],stand.spread[i],stand.elbow[i],0];this.arms[side]={angles:[...GRIP_REST],held:[...rest],shown:[...rest]};}}
 // Puts it away (at once: a rival knocking him over, back in the car, the race over).
 close(now=false){
  if(this.phase==='off')return;this.showReview(false);this.setMouth('neutral');this.grin.visible=false;this.hideFingers();this.pending=false;
  if(now||this.phase==='raise'||this.phase==='lower'){this.finish();return;}
  this.phase='lower';this.t=0;this.emit('click');
 }
 finish(){
  this.phase='off';this.phone.visible=false;this.rig.limbs[1].hand.quaternion.identity();this.rig.limbs[-1].hand.quaternion.identity();applyPose(this.rig,clonePose(POSES.stand));
  this.setMouth('neutral');this.grin.visible=false;this.hideFingers();this.showHud(false);
 }
 hideFingers(){for(const m of Object.values(this.fingers))m.visible=false;}
 // Space, a click or the shutter: the pose, then the click.
 shoot(){if(this.phase!=='frame')return false;this.phase='pose';this.t=0;this.v=0;this.copyOnShot();return true;}
 again(){if(this.phase!=='review')return false;this.showReview(false);this.phase='frame';this.lockMouse();return true;}
 turnPhone(){if(!this.owns||this.phase==='pose')return false;this.orientation=this.orientation==='vertical'?'horizontal':'vertical';this.emit('click');return true;}
 handleKey(code){
  if(this.phase==='review'){
   if(code==='Enter')this.share();else if(code==='KeyB'||code==='KeyE')this.save();else if(code==='KeyC')this.copy();else if(code==='Space')this.again();else if(code==='KeyQ')this.close();
   return true;
  }
  if(code==='KeyQ'){this.close();return true;}
  if(this.phase!=='frame')return true;
  if(code==='Space'||code==='Enter')this.shoot();else if(code==='KeyR')this.turnPhone();else if(PLACE_KEYS[code]!==undefined)this.setPlace(PLACE_KEYS[code]);
  return true;
 }
 // Him on the photo's left, middle or right (user, 2026-10-18: "ajustar pra pessoa ficar no centro, mais a esquerda e mais
 // a direita pra dar espaço pra paisagem"): 1 2 3 (the controller's ← ↑ →) or the buttons on the frame. On the right he
 // swaps hands, the phone to his left one, so the V stays on the side with the room.
 setPlace(place){if(!this.owns||this.phase==='pose'||place===this.place)return false;this.place=place;this.emit('click');return true;}
 faceAt(){return FACE_AT[this.orientation][this.place+1];}
 // The mouse (pixels): sideways turns him (the scene behind him with him), up and down moves the phone round his face.
 turn(dx,dy){if(!this.owns||this.phase==='pose')return;this.hero.rotation.y-=dx*TURN;this.elevation=clamp(this.elevation+dy*LIFT,...SELFIE.elevation);}
 // The wheel or the − + buttons: farther (k > 0) or closer; past his reach the lens opens.
 zoom(k){if(!this.owns)return;this.zoomLevel=clamp(this.zoomLevel+Math.sign(k)*.1,0,1);}
 distance(){return lerp(SELFIE.reach[0],SELFIE.reach[1],Math.min(1,this.zoomLevel/.7));}
 lensWidth(){return 1+(SELFIE.wide-1)*Math.max(0,(this.zoomLevel-.7)/.3);}
 // The flat mouth of his face (the head geometry's lip-coloured block) bent up into a smile, or tucked away behind the
 // open one; neutral puts it back.
 setMouth(state){
  if(state===this.mouthState)return;const g=this.hero.userData.head.geometry;
  if(this.mouthBase?.geometry!==g){
   const c=g.attributes.color,p=g.attributes.position,lip=new THREE.Color(0x8a4637),index=[];
   for(let i=0;i<c.count;i++)if(Math.abs(c.getX(i)-lip.r)<1e-4&&Math.abs(c.getY(i)-lip.g)<1e-4&&Math.abs(c.getZ(i)-lip.b)<1e-4)index.push(i);
   this.mouthBase={geometry:g,index,xyz:index.map(i=>[p.getX(i),p.getY(i),p.getZ(i)])};if(this.mouthState!=='neutral')this.mouthState='neutral';
  }
  const {index,xyz}=this.mouthBase,p=g.attributes.position;
  index.forEach((i,k)=>{const [x,y,z]=xyz[k];if(state==='smile')p.setXYZ(i,x,y+14*z*z,z*1.12);else if(state==='grin')p.setXYZ(i,x-.025,y,z);else p.setXYZ(i,x,y,z);});
  p.needsUpdate=true;this.mouthState=state;
 }
 // One frame. input: the walk's command (A/D turn him, W/S lift the phone); visible: the race on screen. Returns true
 // when the phone's camera placed the view.
 update(dt,camera,{input=null,visible=true}={}){
  if(this.phase==='off')return false;this.t+=dt;
  if(this.phase==='raise'&&this.t>=RAISE){this.phase='frame';this.t=0;}
  if(this.phase==='lower'&&this.t>=LOWER){this.finish();return false;}
  if(this.owns&&this.phase!=='pose'&&input&&dt>0){this.hero.rotation.y+=((input.left??0)-(input.right??0))*1.3*dt;this.elevation=clamp(this.elevation+((input.throttle??0)-(input.brake??0))*.7*dt,...SELFIE.elevation);}
  // How far into the selfie pose (the raise and the lowering blend it with standing) and into the V.
  const w=this.phase==='raise'?smooth(this.t/RAISE):this.phase==='lower'?1-smooth(this.t/LOWER):1;
  if(this.phase==='raise')this.hero.rotation.y=this.from+Math.atan2(Math.sin(this.facing-this.from),Math.cos(this.facing-this.from))*smooth(this.t/RAISE*1.4);
  const vWant=this.phase==='pose'?1:0;this.v+=(vWant-this.v)*Math.min(1,dt*(vWant?11:6));
  if(this.phase==='pose'&&this.t>=SMILE&&!this.shot){this.shot=true;this.pending=true;this.emit('shutter');this.flash();}
  if(this.phase==='pose'&&this.t>=SMILE+HOLD&&this.blob){this.phase='review';this.showReview(true);this.freeMouse();}
  // (No picture came: main.js never drew the frame for it. Back to framing.)
  if(this.phase==='pose'&&this.t>=SMILE+HOLD+3){this.phase='frame';this.t=0;this.pending=false;this.pngWaiting?.fail(new Error('sem foto'));this.pngWaiting=null;}
  if(this.phase!=='pose')this.shot=false;
  this.placeBody(dt,w);
  if(!this.owns){this.showHud(false);return false;}
  this.placeCamera(camera);this.showHud(visible);return true;
 }
 // The pose: lean and twist toward the phone, the head on the lens, the phone's arm out to it, the other hand on the hip
 // or up in the V; the wrists turn the grip and the V's palm. The phone is in his right hand, or his left when he stands
 // on the photo's right, and goes over in front of his face when he swaps.
 placeBody(dt,w){
  const rig=this.rig,p=this.pose,hero=this.hero,stand=POSES.stand,v=smooth(this.v),k=dt>0?1-Math.exp(-dt*16):1;
  this.handSide+=clamp((this.place>0?-1:1)-this.handSide,-dt*4,dt*4);const hand=this.handSide>=0?1:-1;if(hand!==this.hand){this.hand=hand;this.vArm=null;}
  // The blink while framing; smiling, the eyes narrow a little.
  let lid=0;if(this.blink>=0){this.blink+=dt;const b=this.blink;lid=b<.07?b/.07:Math.max(0,1-(b-.07)/.1);if(b>=.17){this.blink=-1;this.blinkIn=2+Math.random()*3.5;}}else if((this.blinkIn-=dt)<=0&&this.phase==='frame')this.blink=0;
  Object.assign(p,{y:-.01*w,lean:.05*w,twist:(.12*w+.04*v)*this.handSide,sway:.02*w,tilt:-hand*(.04+.12*v)*w,lid:Math.max(lid,.22*v)});
  for(const i of [0,1]){p.thigh[i]=lerp(stand.thigh[i],[0,.05][i],w);p.knee[i]=lerp(stand.knee[i],[0,.08][i],w);}
  applyPose(rig,p);hero.updateMatrixWorld(true);
  // Hero frame → torso frame, world → hero frame.
  const toTorso=new THREE.Matrix4().copy(rig.torso.matrixWorld).invert().multiply(hero.matrixWorld),turnTorso=new THREE.Quaternion().setFromRotationMatrix(toTorso),toHero=hero.matrixWorld.clone().invert();
  // The phone where he asks for it, the lens toward a point a little under his eyes (the face in the upper part of the
  // photo) moved aside so his face sits where the place puts it, upright or lying with its top away from the hand. Never
  // past the arm's reach: high up it comes in closer to his face instead of leaving his hand (user, 2026-10-18: "quando
  // sobe demais fica meio bugado pulando uns movimentos estranhos").
  const P=rig.limbs[hand],shoulder=P.arm.getWorldPosition(new THREE.Vector3()).applyMatrix4(toHero),vertical=this.orientation==='vertical',e=this.elevation,a=SELFIE.side*this.handSide,up=new THREE.Vector3(0,1,0);
  const photo=PHOTO[this.orientation],tanAcross=Math.tan(THREE.MathUtils.degToRad(photo.fov/2))*this.lensWidth()*photo.aspect;this.u+=(this.faceAt()-this.u)*(dt>0?1-Math.exp(-dt*6):1);
  let d=this.distance(),lens,aim,n,y,x,centre,grip;
  for(let it=0;it<6;it++){
   lens=EYES.clone().add(new THREE.Vector3(Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a)).multiplyScalar(d));aim=EYES.clone().add(new THREE.Vector3(0,vertical?-.06:-.025,0));
   const ahead=aim.clone().sub(lens),right=new THREE.Vector3().crossVectors(ahead,up).normalize();aim.addScaledVector(right,-this.u*ahead.length()*tanAcross);
   n=aim.clone().sub(lens).normalize();y=vertical?up.clone().addScaledVector(n,-n.y).normalize():new THREE.Vector3().crossVectors(n,up).normalize().multiplyScalar(hand);x=new THREE.Vector3().crossVectors(y,n);
   centre=lens.clone().addScaledVector(y,-.058).addScaledVector(n,-.0045);grip=centre.clone().addScaledVector(y,vertical?-.025:-.048).addScaledVector(n,-.03);
   const over=grip.distanceTo(shoulder)-ARM_REACH;if(over<=0)break;d=Math.max(.2,d-over*1.1);
  }
  // (Eased: swapping hands, the other shoulder's reach must not jump the view.)
  if(this.reach!==null&&Math.abs(d-this.reach)>1e-4){this.reach+=(d-this.reach)*k;d=this.reach;lens=EYES.clone().add(new THREE.Vector3(Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a)).multiplyScalar(d));const ahead=aim.clone().sub(lens);n=ahead.normalize();y=vertical?up.clone().addScaledVector(n,-n.y).normalize():new THREE.Vector3().crossVectors(n,up).normalize().multiplyScalar(hand);x=new THREE.Vector3().crossVectors(y,n);centre=lens.clone().addScaledVector(y,-.058).addScaledVector(n,-.0045);grip=centre.clone().addScaledVector(y,vertical?-.025:-.048).addScaledVector(n,-.03);}else this.reach=d;
  // The arms: the phone's out to the grip (warm start from the last frame's answer), the other on the hip or up in the V
  // by his face (solved once per pose: it hangs on the head, not the phone); both follow smoothly.
  const hip=[HIP.raise,HIP.spread,HIP.elbow,HIP.roll],mirror=new THREE.Vector3(1,1,hand);
  const sol=solveArm(P,hand,this.arms[hand].angles,grip.clone().applyMatrix4(toTorso),{rest:GRIP_REST,restWeight:.02});this.arms[hand].angles=sol.angles;
  if(v>0&&!this.vArm)this.vArm=solveArm(rig.limbs[-hand],-hand,[.9,.9,2.2,0],EYES.clone().add(V_WRIST.clone().multiply(mirror)).applyMatrix4(toTorso),{dir:V_FOREARM.clone().multiply(mirror).applyQuaternion(turnTorso),dirWeight:.12,rest:[.9,.9,2.2,0],restWeight:.02,steps:14}).angles;
  if(v===0&&this.phase!=='pose')this.vArm=null;
  for(const side of [-1,1]){
   const arm=this.arms[side],i=side>0?1:0,rest=[stand.arm[i],stand.spread[i],stand.elbow[i],0],want=side===hand?sol.angles:this.vArm?hip.map((h,j)=>lerp(h,this.vArm[j],v)):hip;
   for(let j=0;j<4;j++){arm.held[j]+=(want[j]-arm.held[j])*k;arm.shown[j]=lerp(rest[j],arm.held[j],w);}
   [p.arm[i],p.spread[i],p.elbow[i],p.roll[i]]=arm.shown;
  }
  // Head on the lens: yaw and nod from the neck (the eyes ride a little ahead of it), twice for the eyes' own swing.
  const lensT=lens.clone().applyMatrix4(toTorso),neck=rig.head.position;let turn=0,nod=0;
  for(let it=0;it<2;it++){const eye=new THREE.Vector3(.095,.118,0).applyEuler(new THREE.Euler(0,turn,-nod)).add(neck),dv=lensT.clone().sub(eye);turn=Math.atan2(-dv.z,dv.x);nod=-Math.atan2(dv.y,Math.hypot(dv.x,dv.z));}
  p.turn=clamp(turn,-1.2,1.2)*w;p.head=clamp(nod,-.7,.6)*w;
  applyPose(rig,p);
  // Wrists: the grip behind the phone (palm toward his face, fingers up its back), the V's palm to the lens, fingers up.
  const held=reachOf(P,hand,this.arms[hand].shown),grabQ=fromAxes(...this.handAxes(y.clone().applyQuaternion(turnTorso),n.clone().applyQuaternion(turnTorso),hand));
  P.hand.quaternion.copy(held.q).invert().multiply(grabQ).slerp(IDENTITY,1-w);
  const V=rig.limbs[-hand],raised=reachOf(V,-hand,this.arms[-hand].shown),toLens=lensT.clone().sub(raised.pos).normalize(),fingersUp=new THREE.Vector3(-.15,1,0).normalize().applyQuaternion(turnTorso),vQ=fromAxes(...this.handAxes(fingersUp,toLens,-hand));
  V.hand.quaternion.copy(raised.q).invert().multiply(vQ).slerp(IDENTITY,1-v);
  for(const side of [-1,1])if(this.fingers[side])this.fingers[side].visible=side===-hand&&v>.15;
  // The mouth: a smile while he frames, the open one for the photo.
  this.setMouth(w<.5?'neutral':v>.25?'grin':'smile');this.grin.visible=v>.25;if(this.grin.visible)this.grin.scale.setScalar(.6+.4*smooth((v-.25)/.5));
  hero.updateMatrixWorld(true);
  // The phone: in his hand as he raises or lowers it; framing, where the view is (the hand follows it).
  if(w<.99)this.phone.position.copy(P.hand.getWorldPosition(new THREE.Vector3()).applyMatrix4(toHero)).add(centre.clone().sub(grip));else this.phone.position.copy(centre);
  fromAxes(x,y,n,this.phone.quaternion);
  this.lens.copy(lens);this.look.copy(aim);this.view.copy(n);
 }
 // A hand's axes (hand frame: -y toward the fingers, the palm on -side·z, the thumb on +x) from where the fingers point
 // and where the palm looks.
 handAxes(fingers,palm,side){
  const yAxis=fingers.clone().negate().normalize(),zAxis=palm.clone().multiplyScalar(-side).addScaledVector(yAxis,-palm.dot(yAxis)*-side).normalize(),xAxis=new THREE.Vector3().crossVectors(yAxis,zAxis);
  return [xAxis,yAxis,zAxis];
 }
 // The view from the phone: just off its screen, level, toward his face; the lens across the phone's frame on screen.
 placeCamera(camera){
  if(!camera)return;const hero=this.hero,eye=hero.localToWorld(this.lens.clone().addScaledVector(this.view,.006)),at=hero.localToWorld(this.look.clone());
  camera.position.copy(eye);camera.up.set(0,1,0);camera.lookAt(at);
  const r=this.frameRect(),photo=PHOTO[this.orientation],high=r.h,tall=Math.tan(THREE.MathUtils.degToRad(photo.fov/2))*this.lensWidth(),full=THREE.MathUtils.radToDeg(2*Math.atan(tall*screenSize().H/high));
  if(camera.near!==.03||Math.abs(camera.fov-full)>.01){this.saved??={near:camera.near};camera.near=.03;camera.fov=full;camera.updateProjectionMatrix();}
 }
 // Back to the walk: his camera's near plane and lens, looking the way the phone did (free-walk.js).
 releaseCamera(camera){if(camera&&this.saved){camera.near=this.saved.near;camera.updateProjectionMatrix();}this.saved=null;}
 viewYaw(){const d=this.view.clone().transformDirection(this.hero.matrixWorld);return Math.atan2(-d.z,d.x);}
 // The photo's frame on screen (CSS pixels): as large as fits with room round it for the buttons.
 frameRect(){
  const {W,H}=screenSize(),aspect=PHOTO[this.orientation].aspect,maxW=W*(this.orientation==='vertical'?.9:.84),maxH=H*.84;
  let h=maxH,w=h*aspect;if(w>maxW){w=maxW;h=w/aspect;}
  const r=this.rect;r.x=(W-w)/2;r.y=(H-h)/2;r.w=w;r.h=h;return r;
 }
 // The pixel density for the frame of the shot (main.js raises the renderer's for that one frame): never under the race's.
 density(current){
  const {W,H}=screenSize(),r=this.frameRect(),cap=Math.min(this.touch?2.5:3,Math.sqrt(MAX_PIXELS/(W*H)));
  return Math.max(current,Math.min(cap,SHARP/Math.max(r.w,r.h)));
 }
 // After the frame is drawn (main.js, right after the render, while the canvas still holds it): the photo cut from the
 // phone's frame, signed in a corner.
 capture(canvas){
  if(!this.pending||!canvas||typeof document==='undefined')return false;this.pending=false;
  const r=this.frameRect(),k=canvas.width/(canvas.clientWidth||globalThis.innerWidth||canvas.width),w=Math.round(r.w*k),h=Math.round(r.h*k),photo=document.createElement('canvas');photo.width=w;photo.height=h;
  const g=photo.getContext('2d');g.drawImage(canvas,Math.round(r.x*k),Math.round(r.y*k),w,h,0,0,w,h);this.sign(g,w,h);
  this.photo=photo;this.blob=null;this.photos++;photo.toBlob(blob=>{this.blob=blob;this.url&&URL.revokeObjectURL(this.url);this.url=URL.createObjectURL(blob);if(this.hud)this.$('selfiePhoto').src=this.url;},'image/jpeg',.92);
  const wait=this.pngWaiting;if(wait)photo.toBlob(png=>{wait.blob=png;wait.done(png);if(wait.retry&&this.pngWaiting===wait)this.writePng(png);},'image/png');
  return true;
 }
 // The game's signature at the bottom left: "Piloto: <name>" over AUTO-POBRE RACING (the team's request, 2026-10-18: "coloca
 // o nome em cima do Auto Pobre Racing... adaptando pro nome de cada piloto"), where, and the address.
 sign(g,w,h){
  const s=Math.min(w,h),big=Math.round(s*.05),small=Math.round(s*.03),pad=Math.round(s*.04),place=this.label(),pilot=String(this.pilot()??'').trim(),band=big*(pilot?4.6:3.4);
  const shade=g.createLinearGradient(0,h-band,0,h);shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.5)');g.fillStyle=shade;g.fillRect(0,h-band,w,band);
  g.textBaseline='alphabetic';g.shadowColor='rgba(0,0,0,.55)';g.shadowBlur=s*.012;g.fillStyle='#ffffff';
  if(pilot){g.font=`700 ${Math.round(small*1.15)}px Inter, "Segoe UI", Arial, sans-serif`;g.fillText(`Piloto: ${pilot}`,pad,h-pad-small*1.35-big*1.15,w-pad*2);}
  g.font=`italic 900 ${big}px Inter, "Segoe UI", Arial, sans-serif`;g.fillText('AUTO-POBRE RACING',pad,h-pad-small*1.35);
  g.font=`600 ${small}px Inter, "Segoe UI", Arial, sans-serif`;g.fillStyle='#e2fb57';g.fillText(`${place?place+' · ':''}autopobre.com.br`,pad,h-pad);g.shadowBlur=0;
 }
 fileName(){const d=new Date(),z=n=>String(n).padStart(2,'0');return `autopobre-selfie-${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.jpg`;}
 file(){return new File([this.blob],this.fileName(),{type:'image/jpeg'});}
 shareData(){return {files:[this.file()],title:'Auto-Pobre Racing',text:`Minha selfie no Auto-Pobre Racing${this.label()?' · '+this.label():''}! autopobre.com.br`};}
 canShare(){try{return !!this.blob&&!!navigator.canShare?.(this.shareData());}catch{return false;}}
 async share(){
  if(!this.blob)return;if(!this.canShare()){this.save();return;}
  try{await navigator.share(this.shareData());this.say('Foto compartilhada!');}catch(error){if(error?.name!=='AbortError'){this.save();}}
 }
 save(){
  if(!this.blob)return;const a=document.createElement('a');a.href=this.url;a.download=this.fileName();document.body.append(a);a.click();a.remove();
  this.say(this.canShare()?'Foto salva nos downloads.':'Foto salva nos downloads: é só mandar pra galera!');
 }
 async copy(){
  if(!this.photo||!clipboardImages())return;
  try{const png=await new Promise(done=>this.photo.toBlob(done,'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);this.copiedNow();}catch{this.say('Não deu para copiar: use Baixar.');}
 }
 // The photo goes to the clipboard as it is taken (user, 2026-10-18: "quando a pessoa bater foto, já manda pra área de
 // transferência direto, vamos presumir que ela vai colar em algum lugar"). The write is asked for in the press itself
 // (Safari and Firefox only let a key or a click write it) with a picture still to come, given when the frame is cut;
 // a browser that cannot wait for it writes the PNG once it exists. (The controller's button is no press for the page:
 // there the Copiar button does it.)
 copyOnShot(){
  this.copied=false;this.pngWaiting?.fail(new Error('outra foto'));this.pngWaiting=null;if(!clipboardImages())return;
  let done,fail;const png=new Promise((a,b)=>{done=a;fail=b;});png.catch(()=>{});const wait=this.pngWaiting={done,fail,blob:null,retry:false};
  const retry=()=>{if(this.pngWaiting!==wait)return;wait.retry=true;if(wait.blob)this.writePng(wait.blob);};
  try{navigator.clipboard.write([new ClipboardItem({'image/png':png})]).then(()=>{if(this.pngWaiting===wait)this.copiedNow();},retry);}catch{retry();}
 }
 writePng(png){navigator.clipboard.write([new ClipboardItem({'image/png':png})]).then(()=>this.copiedNow(),()=>{});}
 copiedNow(){this.copied=true;if(this.phase==='review')this.say(this.copiedText());}
 copiedText(){return this.touch?'Foto copiada: é só colar na conversa.':'Foto copiada: é só colar (Ctrl+V) onde quiser.';}
 say(text){this.note=text;if(this.hud)this.$('selfieNote').textContent=text;}
 flash(){if(!this.hud)return;const f=this.$('selfieFlash');f.classList.remove('on');void f.offsetWidth;f.classList.add('on');}
 buildHud(){
  const hud=this.hud=document.createElement('div');hud.id='selfieHud';hud.hidden=true;
  hud.innerHTML='<div id="selfieFrame"><span class="selfie-notch"></span><b id="selfieMode"></b><button id="selfieClose" type="button" aria-label="Guardar o celular">✕</button><button id="selfieTurn" type="button" aria-label="Virar o celular">⟲</button><div class="selfie-place" role="group" aria-label="Onde você fica na foto"><button type="button" data-place="-1">Esquerda</button><button type="button" data-place="0">Centro</button><button type="button" data-place="1">Direita</button></div><button id="selfieShot" type="button" aria-label="Tirar a foto"></button><div class="selfie-zoom"><button id="selfieNear" type="button" aria-label="Aproximar">−</button><button id="selfieFar" type="button" aria-label="Afastar">+</button></div></div>'
   +'<small id="selfieHint"></small><div id="selfieFlash"></div>'
   +'<div id="selfieReview" hidden><img id="selfiePhoto" alt="Sua selfie"><p id="selfieNote" role="status"></p><div class="selfie-actions"><button id="selfieShare" type="button"></button><button id="selfieSave" type="button"></button><button id="selfieCopy" type="button"></button><button id="selfieAgain" type="button"></button><button id="selfieDone" type="button"></button></div></div>';
  document.body.append(hud);this.$=id=>hud.querySelector('#'+id);
  // (A clicked button lets go of the focus: Space is the shutter, not that button again.)
  const on=(id,fn)=>this.$(id).addEventListener('click',e=>{e.stopPropagation();e.currentTarget.blur();fn();});
  for(const b of hud.querySelectorAll('[data-place]'))b.addEventListener('click',e=>{e.stopPropagation();b.blur();this.setPlace(+b.dataset.place);});
  on('selfieShot',()=>this.shoot());on('selfieTurn',()=>this.turnPhone());on('selfieClose',()=>this.close());on('selfieNear',()=>this.zoom(-1));on('selfieFar',()=>this.zoom(1));
  on('selfieShare',()=>this.share());on('selfieSave',()=>this.save());on('selfieCopy',()=>this.copy());on('selfieAgain',()=>this.again());on('selfieDone',()=>this.close());
  // A click anywhere off the photo and its buttons frames another (user, 2026-10-18: "se ela clicar fora da foto batida,
  // volta para tirar uma outra").
  this.$('selfieReview').addEventListener('click',e=>{if(e.target.closest('button')||e.target.id==='selfiePhoto')return;e.stopPropagation();this.again();});
  // Touch screens (and a free mouse): a drag on the frame turns him and moves the phone, the wheel over it brings it
  // closer or farther, a click without a drag is the shutter (a captured mouse sends both to the game's canvas instead).
  const frame=this.$('selfieFrame');let drag=null;
  frame.addEventListener('pointerdown',e=>{if(e.target!==frame)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:0,mouse:e.pointerType==='mouse'};frame.setPointerCapture(e.pointerId);});
  frame.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved+=Math.abs(dx)+Math.abs(dy);this.turn(dx*1.4,dy*1.4);drag.x=e.clientX;drag.y=e.clientY;});
  frame.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;if(drag.mouse&&drag.moved<5)this.shoot();drag=null;});
  frame.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)drag=null;});
  frame.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.sign(e.deltaY));},{passive:false});
  this.shown={};
 }
 showReview(on){
  if(!this.hud)return;this.$('selfieReview').hidden=!on;if(!on)return;
  // (The keys the player chose, key-bindings.js; Enter is fixed.)
  const touch=this.touch,key=k=>touch?'':` · ${k}`;this.say(this.copied?this.copiedText():'');
  this.$('selfieShare').textContent='Compartilhar'+key('Enter');this.$('selfieShare').hidden=!this.canShare();
  this.$('selfieSave').textContent='Baixar foto'+key(keyName('KeyB'));
  this.$('selfieCopy').textContent='Copiar'+key(keyName('KeyC'));this.$('selfieCopy').hidden=touch||!clipboardImages();
  this.$('selfieAgain').textContent='Tirar outra'+key(keyName('Space'));this.$('selfieDone').textContent='Guardar celular'+key(keyName('KeyQ'));
 }
 // The phone's screen over the game: its frame round the photo, the rest dimmed, the buttons.
 showHud(visible){
  if(!this.hud)return;const on=visible&&this.owns;
  if(this.hud.hidden===on)this.hud.hidden=!on;document.body.classList.toggle('selfie-mode',on);if(!on)return;
  const r=this.frameRect(),set=(id,key,value)=>{if(this.shown[id+key]!==value){this.shown[id+key]=value;const el=this.$(id);if(key.startsWith('style.'))el.style[key.slice(6)]=value;else el[key]=value;}};
  const frame=this.$('selfieFrame');frame.classList.toggle('horizontal',this.orientation==='horizontal');
  set('selfieFrame','style.left',`${r.x}px`);set('selfieFrame','style.top',`${r.y}px`);set('selfieFrame','style.width',`${r.w}px`);set('selfieFrame','style.height',`${r.h}px`);
  set('selfieMode','textContent',`SELFIE · ${PHOTO[this.orientation].label.toUpperCase()}`);
  set('selfieHint','textContent',this.phase==='review'?'':this.phase==='pose'?'Sorria!':this.touch?'Arraste na tela: girar e subir/descer o celular · − +: perto/longe · ⟲: vertical/horizontal':keyText('Mouse ou {KeyA}/{KeyD}: girar · {KeyW}/{KeyS}: subir/descer · roda: perto/longe · {Digit1}/{Digit2}/{Digit3}: você à esquerda/no centro/à direita · {KeyR}: vertical/horizontal · {Space} ou clique: foto · {KeyQ}: guardar'));
  set('selfieShot','disabled',this.phase!=='frame');if(this.shown.place!==this.place){this.shown.place=this.place;for(const b of this.hud.querySelectorAll('[data-place]'))b.setAttribute('aria-pressed',String(+b.dataset.place===this.place));}
 }
 dispose(){this.finish();this.phone.removeFromParent();this.phone.geometry.dispose();this.grin.removeFromParent();this.grin.geometry.dispose();for(const m of Object.values(this.fingers)){m.removeFromParent();m.geometry.dispose();}this.url&&URL.revokeObjectURL(this.url);this.hud?.remove();globalThis.document?.body?.classList.remove('selfie-mode');}
 info(){return {phase:this.phase,orientation:this.orientation,place:this.place,hand:this.hand,u:this.u,elevation:this.elevation,zoom:this.zoomLevel,distance:this.distance(),v:this.v,photos:this.photos,blob:this.blob?.size??0,note:this.note,lens:this.lens.toArray(),mouth:this.mouthState,fingers:Object.values(this.fingers).some(m=>m.visible),rect:{...this.rect}};}
}
