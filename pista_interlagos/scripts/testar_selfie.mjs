// Selfie a pe (teste/selfie.js, pedido da equipe em 2026-10-18): fora do carro, Q tira o celular; o piloto vira de frente
// para a camera (o que ela olhava fica atras dele), ergue o celular na mao direita e a tela vira a camera frontal; mouse
// e A/D giram, W/S sobem e descem o celular, a roda aproxima; R troca vertical/horizontal; Espaco: ele sorri, faz o V
// com indicador e medio ao lado do rosto e a foto sai (recortada da tela, assinada); depois compartilhar, baixar ou outra.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {TestCar,OPALA_BODY} from '../teste/physics.js';

// The overalls' 99 and the photo are painted on canvases: do-nothing ones here (the photo's turns into a real Blob).
// What is written on them is kept (the photo's signature).
const written=[],ctx=new Proxy({fillText:text=>written.push(text)},{get:(target,key)=>key in target?target[key]:key.startsWith?.('create')?()=>({addColorStop(){}}):()=>({width:0})});
// A clipboard that keeps what is written to it (the page's own would be the system's).
const clipboard=[];globalThis.ClipboardItem=class{constructor(items){this.items=items;}};
Object.defineProperty(globalThis.navigator,'clipboard',{configurable:true,value:{write:async items=>{for(const item of items){const blob=await item.items['image/png'];clipboard.push(blob);}}}});
globalThis.document??={createElement:()=>({width:0,height:0,getContext:()=>ctx,toBlob:done=>done(new Blob(['foto'],{type:'image/jpeg'}))})};
const {FreeWalk}=await import('../teste/free-walk.js');
const {OUTFITS,STEVAN_OUTFITS}=await import('../teste/pit-crew.js');
const {PHOTO,SELFIE}=await import('../teste/selfie.js');

const load=id=>{const d=JSON.parse(fs.readFileSync(new URL(`../dados/${id==='interlagos'?'pista':'pista_'+id}.json`,import.meta.url)));d.meta.id=id;return d;};
const FRAME=1/60,STILL={throttle:0,brake:0,left:0,right:0};
function setup(outfit=OUTFITS.driver){
 const data=load('interlagos'),car=new TestCar(data),scene=new THREE.Scene(),driver={root:{visible:true}},sounds=[],calls={free:0,lock:0};
 const walk=new FreeWalk({scene,car,driver,hud:false,outfit:()=>outfit,emit:name=>sounds.push(name),selfie:{label:()=>'Interlagos',pilot:()=>'Stevan',freeMouse:()=>calls.free++,lockMouse:()=>calls.lock++}});
 car.recover(Math.floor(data.samples.length*.42));walk.getOut();
 const camera=new THREE.PerspectiveCamera(58,16/9,.1,6500);walk.update(FRAME,camera,{});
 return {data,car,walk,camera,sounds,calls,scene};
}
const frames=(walk,camera,seconds,options={})=>{for(let t=0;t<seconds;t+=FRAME)walk.update(FRAME,camera,{input:STILL,...options});};
const rig=walk=>walk.hero.userData.rig,world=o=>o.getWorldPosition(new THREE.Vector3()),showsV=walk=>Object.values(walk.selfie.fingers).some(m=>m.visible);
const eyes=walk=>new THREE.Vector3(.095,.118,0).applyMatrix4(rig(walk).head.matrixWorld);
// Where a point lands in the photo (-1..1 across its width and height): the photo is the middle of the screen
// (selfie.js frameRect, 1280x720 without a window).
function inPhoto(walk,camera,point){
 camera.updateMatrixWorld();const p=point.clone().project(camera),r=walk.selfie.frameRect(),W=1280,H=720;
 const x=(p.x+1)/2*W,y=(1-p.y)/2*H;return [(x-r.x)/r.w*2-1,1-(y-r.y)/r.h*2,p.z];
}

// 1. Q: the phone out. He turns to face the walking camera, raises it, and the view becomes its front camera.
{
 const {walk,camera,sounds}=setup(),s=walk.foot,before=walk.hero.rotation.y;s.yaw=before+1.1;
 assert.equal(walk.handleKey('KeyQ'),true,'Q is taken on foot');assert.equal(walk.selfie.phase,'raise');
 assert.ok(sounds.includes('click'),'the phone comes out with a click');
 frames(walk,camera,.2);assert.equal(walk.selfie.owns,false,'raising it the walking camera still shows him');
 frames(walk,camera,.4);assert.equal(walk.selfie.phase,'frame','then he frames');
 const turned=Math.atan2(Math.sin(walk.hero.rotation.y-(s.yaw+Math.PI)),Math.cos(walk.hero.rotation.y-(s.yaw+Math.PI)));
 assert.ok(Math.abs(turned)<.02,`he turned round to face the camera (${turned.toFixed(3)} rad off): its view is behind him now`);
 assert.equal(camera.near,.03,'the phone sees his arm up close');
 const e=eyes(walk),d=camera.position.distanceTo(e);
 assert.ok(d>SELFIE.reach[0]-.02&&d<SELFIE.reach[1]+.02,`the lens is at arm's length from his eyes (${d.toFixed(2)} m)`);
 const face=new THREE.Vector3(1,0,0).transformDirection(rig(walk).head.matrixWorld),toLens=camera.position.clone().sub(e).normalize();
 assert.ok(face.dot(toLens)>.98,`he looks into the lens (${face.dot(toLens).toFixed(3)})`);
 const [u,v]=inPhoto(walk,camera,e);assert.ok(Math.abs(u)<.25&&v>0&&v<.6,`his eyes in the upper middle of the 9:16 photo (${u.toFixed(2)}, ${v.toFixed(2)})`);
 // The phone is in his right hand, its screen toward him, and the camera just in front of the screen.
 const phone=walk.selfie.phone,hand=world(rig(walk).limbs[1].hand),centre=world(phone);
 assert.ok(hand.distanceTo(centre)<.09,`the phone in his right hand (${hand.distanceTo(centre).toFixed(3)} m)`);
 const screen=new THREE.Vector3(0,0,1).transformDirection(phone.matrixWorld);assert.ok(screen.dot(e.clone().sub(centre).normalize())>.95,'its screen faces him');
 assert.ok(camera.position.clone().sub(centre).dot(screen)>.004,'the view starts in front of the screen, not inside the phone');
 assert.equal(walk.selfie.mouthState,'smile','framing, a smile');assert.equal(showsV(walk),false,'no V yet');
 const photo=PHOTO.vertical,full=2*Math.atan(Math.tan(THREE.MathUtils.degToRad(photo.fov/2))*walk.selfie.lensWidth()*720/walk.selfie.frameRect().h);
 assert.ok(Math.abs(THREE.MathUtils.degToRad(camera.fov)-full)<1e-3,`the screen lens makes the 9:16 frame the photo's (${photo.fov.toFixed(1)}° high)`);
 assert.ok(Math.abs(walk.selfie.frameRect().w/walk.selfie.frameRect().h-9/16)<1e-9,'9:16 upright');
}

// 2. Framing: the mouse and A/D turn him, W/S and the mouse's height move the phone, the wheel brings it closer or
// farther, R lays it down; nothing walks.
{
 const {walk,camera}=setup();walk.handleKey('KeyQ');frames(walk,camera,.6);
 const at=walk.hero.position.clone(),yaw=walk.hero.rotation.y;
 walk.turnView(200,0);assert.ok(Math.abs(walk.hero.rotation.y-(yaw-.5))<1e-9,'the mouse turns him (and the scene behind him)');
 frames(walk,camera,.5,{input:{...STILL,left:1}});assert.ok(walk.hero.rotation.y>yaw-.5+.5,'A turns him the other way');
 frames(walk,camera,1,{input:{...STILL,throttle:1}});assert.ok(walk.hero.position.distanceTo(at)<1e-6,'W does not walk with the phone out');
 assert.ok(walk.selfie.elevation>SELFIE.elevation[1]-1e-9,`W lifts the phone, up to the top (${walk.selfie.elevation.toFixed(2)})`);
 const high=camera.position.y-eyes(walk).y;walk.turnView(0,-1000);frames(walk,camera,.1);const low=camera.position.y-eyes(walk).y;
 assert.ok(high>.1&&low<-.05,`from above (${high.toFixed(2)} m) to below his eyes (${low.toFixed(2)} m)`);
 walk.turnView(0,250);frames(walk,camera,.1);
 const far=camera.position.distanceTo(eyes(walk));for(let i=0;i<10;i++)walk.zoom(-1);frames(walk,camera,.1);const near=camera.position.distanceTo(eyes(walk));
 assert.ok(near<far-.08,`the wheel brings it closer (${far.toFixed(2)} → ${near.toFixed(2)} m)`);
 for(let i=0;i<10;i++)walk.zoom(1);frames(walk,camera,.1);const wide=camera.fov;walk.zoom(-1);walk.zoom(-1);walk.zoom(-1);walk.zoom(-1);frames(walk,camera,.1);
 assert.ok(wide>camera.fov+5,`past his reach the lens opens (${camera.fov.toFixed(1)}° → ${wide.toFixed(1)}°)`);
 walk.handleKey('KeyR');frames(walk,camera,.1);assert.equal(walk.selfie.orientation,'horizontal','R lays the phone down');
 const y=new THREE.Vector3(0,1,0).transformDirection(walk.selfie.phone.matrixWorld);assert.ok(Math.abs(y.y)<.05,'lying: its top points sideways');
 assert.ok(walk.selfie.frameRect().w>walk.selfie.frameRect().h,'and the frame is wide');
 walk.handleKey('KeyR');assert.equal(walk.selfie.orientation,'vertical');
}

// 3. Space: he smiles with his teeth and shows the V by his face, palm to the lens; the shutter clicks, the frame is cut,
// the photo is signed with the pilot's name, goes to the clipboard and comes up (the mouse let go to click its buttons).
// Upright and lying, the V is in the picture.
for(const orientation of ['vertical','horizontal']){
 const {walk,camera,sounds,calls}=setup();walk.handleKey('KeyQ');frames(walk,camera,.6);if(orientation==='horizontal')walk.handleKey('KeyR');frames(walk,camera,.1);
 assert.equal(walk.click(),true,'a click (or Space) is the shutter');assert.equal(walk.selfie.phase,'pose');
 frames(walk,camera,.4);
 const L=rig(walk).limbs[-1],wrist=world(L.hand),tip=new THREE.Vector3(0,-.13,0).applyMatrix4(L.hand.matrixWorld),e=eyes(walk);
 assert.equal(showsV(walk),true,'the V shows');assert.equal(walk.selfie.fingers[-1].visible,true,'on his left hand');assert.equal(walk.selfie.mouthState,'grin','the open smile');assert.equal(walk.selfie.grin.visible,true);
 assert.ok(tip.y>wrist.y+.09,`the fingers point up (${(tip.y-wrist.y).toFixed(3)} m)`);
 assert.ok(Math.abs(wrist.y-e.y)<.2&&wrist.distanceTo(e)<.3,`the hand by his face (${wrist.distanceTo(e).toFixed(2)} m from the eyes)`);
 const palm=new THREE.Vector3(0,0,1).transformDirection(L.hand.matrixWorld),toLens=camera.position.clone().sub(wrist).normalize();
 assert.ok(palm.dot(toLens)>.75,`the palm to the lens (${palm.dot(toLens).toFixed(2)})`);
 const side=x=>new THREE.Vector3(x,-.14,0).applyMatrix4(L.hand.matrixWorld);
 for(const [name,point] of [['fingertips',tip],['fingers\' outer side',side(.035)],['fingers\' inner side',side(-.035)],['wrist',wrist],['eyes',e]]){const [u,v,z]=inPhoto(walk,camera,point);assert.ok(Math.abs(u)<.95&&Math.abs(v)<.95&&z<1,`${orientation}: ${name} in the photo (${u.toFixed(2)}, ${v.toFixed(2)})`);}
 const [uv]=inPhoto(walk,camera,tip),[ue]=inPhoto(walk,camera,e);assert.ok(uv>ue+.2,'his left hand on the photo\'s right of his face');
 assert.equal(walk.selfie.pending,false,'not yet: the smile first');frames(walk,camera,.12);
 assert.equal(walk.selfie.pending,true,'the shot waits for the frame to be drawn');assert.ok(sounds.includes('shutter'),'the shutter clicks');
 written.length=0;const copies=clipboard.length;
 assert.equal(walk.selfie.capture({width:2560,height:1440,clientWidth:1280}),true,'main.js hands it the drawn frame');
 assert.ok(written.includes('Piloto: Stevan')&&written.includes('AUTO-POBRE RACING')&&written.some(t=>/Interlagos · autopobre\.com\.br/.test(t)),`signed with the pilot's name over the game's (${written.join(' / ')})`);
 await new Promise(done=>setTimeout(done,0));assert.equal(clipboard.length,copies+1,'the photo went to the clipboard as it was taken');assert.equal(walk.selfie.copied,true);
 frames(walk,camera,.5);assert.equal(walk.selfie.phase,'review','the photo comes up');assert.equal(calls.free,1,'the mouse let go to click the buttons');
 assert.equal(walk.info().selfie.photos,1);assert.ok(walk.selfie.blob.size>0,'the photo is a file to share');
 assert.match(walk.selfie.fileName(),/^autopobre-selfie-\d{8}-\d{6}\.jpg$/);assert.match(walk.selfie.shareData().text,/Interlagos.*autopobre\.com\.br/);
 frames(walk,camera,.6);assert.equal(showsV(walk),false,'the V comes down while the photo shows');
 walk.handleKey('Space');assert.equal(walk.selfie.phase,'frame','Space: another one');assert.equal(calls.lock,1,'the mouse captured again');
}

// 4. The photo's sharpness: the shot is drawn denser than the race (up to 1080x1920), never thinner, never past a 4K picture.
{
 const {walk}=setup();walk.handleKey('KeyQ');
 const dense=walk.selfie.density(1),rect=walk.selfie.frameRect(),long=Math.max(rect.w,rect.h)*dense;
 assert.ok(long>1700&&long<=1921,`about Full HD on the photo's long side (${long.toFixed(0)} px)`);
 assert.equal(walk.selfie.density(3.4),3.4,'never under the race\'s own');assert.ok(1280*720*walk.selfie.density(1)**2<=8.3e6+1);
}

// 5. Put away (Q): the arm comes down, the walking camera pulls back from the phone looking the same way, and his face
// is as it was. F with the phone out puts it away and goes to the car.
{
 const {walk,camera,car}=setup(),head=walk.hero.userData.head.geometry,original=head.attributes.position.array.slice();
 walk.handleKey('KeyQ');frames(walk,camera,.6);walk.handleKey('Space');frames(walk,camera,.3);
 const look=new THREE.Vector3();camera.getWorldDirection(look);
 walk.handleKey('KeyQ');assert.equal(walk.selfie.phase,'lower');frames(walk,camera,.05);
 assert.equal(camera.near,.1,'the walking camera\'s near plane is back');
 const yaw=walk.foot.yaw,flat=Math.atan2(-look.z,look.x);assert.ok(Math.abs(Math.atan2(Math.sin(yaw-flat),Math.cos(yaw-flat)))<.05,'the walking camera looks where the phone did');
 frames(walk,camera,.4);assert.equal(walk.selfie.phase,'off');assert.equal(walk.selfie.phone.visible,false,'the phone back in his pocket');
 assert.deepEqual([...head.attributes.position.array],[...original],'his face as it was');
 assert.ok(rig(walk).limbs[1].hand.quaternion.equals(new THREE.Quaternion()),'the wrists back straight');
 // Walking again.
 const at=walk.hero.position.clone();frames(walk,camera,1,{input:{...STILL,throttle:1}});assert.ok(walk.hero.position.distanceTo(at)>2,'he walks again');
 walk.handleKey('KeyQ');frames(walk,camera,.6);walk.hero.position.copy(walk.carPoint(.15,1.25));walk.handleKey('KeyF');
 assert.equal(walk.selfie.phase,'off','F puts the phone away');assert.equal(walk.active,false,'and he is in the car');
 assert.ok(Math.hypot(car.vx,car.vy)<1);
}

// 6. A rival through him with the phone out still throws him: the phone goes away, he flies, gets up and walks.
{
 const {walk,camera}=setup();walk.handleKey('KeyQ');frames(walk,camera,.6);
 const p=walk.hero.position,h=walk.car.heading,rival={x:p.x-Math.cos(h)*.5,y:-p.z-Math.sin(h)*.5,z:walk.car.z,vx:Math.cos(h)*25,vy:Math.sin(h)*25,heading:h,body:OPALA_BODY};
 walk.update(FRAME,camera,{input:STILL,rivals:[{car:rival}]});
 assert.ok(walk.tumble,'run over');assert.equal(walk.selfie.phase,'off','the phone away');assert.equal(camera.near,.1,'his walking camera back');
 rival.vx=rival.vy=0;rival.x+=80;for(let t=0;t<15&&walk.tumble;t+=FRAME)walk.update(FRAME,camera,{input:STILL,rivals:[{car:rival}]});assert.equal(walk.tumble,null,'up again');
 assert.equal(walk.handleKey('KeyQ'),true);assert.equal(walk.selfie.phase,'raise','and he can take another');
}

// 7. Not in the air, and the V in the clothes he wears: racing gloves on the 99's driver, bare hands on Stevan in his
// T-shirt (story mode). Getting back in (a restart) puts the phone away at once.
{
 const {walk,camera}=setup(STEVAN_OUTFITS.civil);walk.foot.vz=3;walk.foot.lift=.3;
 assert.equal(walk.handleKey('KeyQ'),true);assert.equal(walk.selfie.phase,'off','not in the middle of a jump');
 walk.foot.vz=0;walk.foot.lift=0;walk.handleKey('KeyQ');frames(walk,camera,.6);walk.handleKey('Space');frames(walk,camera,.3);
 const skin=new THREE.Color(STEVAN_OUTFITS.civil.skin),c=walk.selfie.fingers[-1].geometry.attributes.color;assert.ok(Math.abs(c.getX(0)-skin.r)<1e-4&&Math.abs(c.getZ(0)-skin.b)<1e-4,'bare fingers on Stevan');
 walk.reset();assert.equal(walk.selfie.phase,'off');assert.equal(walk.selfie.phone.visible,false);
 const racer=setup();racer.walk.handleKey('KeyQ');const g=racer.walk.selfie.fingers[1].geometry.attributes.color,glove=new THREE.Color(OUTFITS.driver.hands);
 assert.ok(Math.abs(g.getX(0)-glove.r)<1e-4,'gloves on the racing driver');
}
// 8. Up and down: the phone never goes past his reach (high up it comes closer to his face), so the view glides with the
// mouse, no jumps (user, 2026-10-18: "quando sobe demais fica meio bugado pulando uns movimentos estranhos").
for(const orientation of ['vertical','horizontal']){
 const {walk,camera}=setup();walk.handleKey('KeyQ');frames(walk,camera,.6);if(orientation==='horizontal')walk.handleKey('KeyR');frames(walk,camera,.2);
 const before=camera.position.clone(),turned=camera.quaternion.clone();let step=0,turn=0;
 for(let f=0;f<240;f++){walk.turnView(0,f<120?-8:8);walk.update(FRAME,camera,{input:STILL});step=Math.max(step,camera.position.distanceTo(before));turn=Math.max(turn,camera.quaternion.angleTo(turned));before.copy(camera.position);turned.copy(camera.quaternion);
  if(walk.selfie.elevation>=SELFIE.elevation[1]-1e-9){const P=rig(walk).limbs[1],hand=world(P.hand),phone=world(walk.selfie.phone);assert.ok(hand.distanceTo(phone)<.1,`${orientation}: up high the phone is still in his hand (${hand.distanceTo(phone).toFixed(3)} m)`);}}
 assert.ok(step<.012&&turn<.02,`${orientation}: from the lowest to the highest and back, smooth (${(step*1000).toFixed(1)} mm, ${(turn*57.3).toFixed(2)}° a frame at most)`);
}

// 9. Where he stands in the photo (user, 2026-10-18: "ajustar pra pessoa ficar no centro, mais a esquerda e mais a direita
// pra dar espaço pra paisagem"): 1 2 3 put his face left, middle or right; on the right the phone goes to his left hand,
// over in front of his face, and the V comes from his right hand, on the side with the room. Upright and lying, low and
// high, the V is in the picture.
for(const orientation of ['vertical','horizontal'])for(const elevation of [-.3,.2,SELFIE.elevation[1]]){
 const {walk,camera}=setup();walk.handleKey('KeyQ');frames(walk,camera,.6);if(orientation==='horizontal')walk.handleKey('KeyR');walk.selfie.elevation=elevation;frames(walk,camera,.3);
 for(const [key,place] of [['Digit1',-1],['Digit3',1],['Digit2',0]]){
  const before=camera.position.clone(),turned=camera.quaternion.clone();let step=0,turn=0;
  walk.handleKey(key);for(let t=0;t<1.2;t+=FRAME){walk.update(FRAME,camera,{input:STILL});step=Math.max(step,camera.position.distanceTo(before));turn=Math.max(turn,camera.quaternion.angleTo(turned));before.copy(camera.position);turned.copy(camera.quaternion);}
  assert.equal(walk.selfie.place,place);assert.equal(walk.selfie.hand,place>0?-1:1,`${orientation} ${place}: the phone in his ${place>0?'left':'right'} hand`);
  assert.ok(step<.03&&turn<.1,`${orientation} ${place}: the view glides there (${(step*1000).toFixed(0)} mm, ${(turn*57.3).toFixed(1)}° a frame at most)`);
  const P=rig(walk).limbs[walk.selfie.hand],held=world(P.hand).distanceTo(world(walk.selfie.phone));assert.ok(held<.1,`${orientation} ${place}: the phone in that hand (${held.toFixed(3)} m)`);
  const [u]=inPhoto(walk,camera,eyes(walk));assert.ok(place===0?Math.abs(u)<.3:Math.sign(u)===place&&Math.abs(u)>.2,`${orientation} ${place}: his face where asked (${u.toFixed(2)})`);
  walk.handleKey('Space');frames(walk,camera,.45);
  const V=rig(walk).limbs[-walk.selfie.hand].hand;assert.equal(walk.selfie.fingers[-walk.selfie.hand].visible,true,'the V on the other hand');
  for(const x of [.035,-.035]){const [vu,vv]=inPhoto(walk,camera,new THREE.Vector3(x,-.14,0).applyMatrix4(V.matrixWorld));assert.ok(Math.abs(vu)<.97&&Math.abs(vv)<.97,`${orientation} ${place} at ${elevation}: the V in the photo (${vu.toFixed(2)}, ${vv.toFixed(2)})`);}
  const [vu]=inPhoto(walk,camera,world(V));if(place!==0)assert.ok(Math.sign(vu-u)===-place,'the V on the side with the room');
  frames(walk,camera,.12);assert.equal(walk.selfie.capture({width:1280,height:720,clientWidth:1280}),true);frames(walk,camera,.5);assert.equal(walk.selfie.phase,'review');walk.handleKey('Space');frames(walk,camera,.1);
 }
}
console.log('testar_selfie: ok');
