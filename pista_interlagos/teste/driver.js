import * as THREE from 'three';
import {DriverMotion,solveArm} from './driver-rig.js';
import {DriverControls} from './driver-controls.js';
import {createHelmet} from './driver-helmet.js';
import {mergeStill} from './car-lod.js';
import {wrap} from './physics.js';

// Seated model based on geracoes_piloto/v01_omp_oli; +X front, -Z left.
// Suit UVs use the approved portrait; the helmet uses the new in-car photo.
// The right hand works the gear lever, the boots work the pedals
// (choreography in driver-controls.js, body dynamics in driver-rig.js).
const THIGH=.371,SHIN=.379;
// Boot frame: heel contact at the origin, toes along +X, sole on y=0.
const ANKLE=new THREE.Vector3(.055,.09,0),FLOOR=.312;
export async function createDriver(cockpit){
 const {wheel,wheelTurn,controls}=cockpit;
 const root=new THREE.Group();root.name='Heroi_99_pilotando';root.add(wheel);
 // Controls the driver touches ride in this group so they show through the windows too.
 for(const part of controls.parts)root.add(part);
 const motion=new DriverMotion(),choreography=new DriverControls();
 const tex=await new THREE.TextureLoader().loadAsync('./assets/piloto/referencia_frente.jpg');tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
 const red=new THREE.MeshStandardMaterial({color:0xd91920,roughness:.92});
 const fabric=tex.clone();fabric.repeat.set(.07,.09);fabric.offset.set(.36,.49);fabric.needsUpdate=true;
 red.map=fabric;red.bumpMap=fabric;red.bumpScale=.0008;red.color.setHex(0xffffff);
 const front=new THREE.MeshStandardMaterial({map:tex,roughness:.91});
 const black=new THREE.MeshStandardMaterial({color:0x15181a,roughness:.95});
 const sole=new THREE.MeshStandardMaterial({color:0x2a2d30,roughness:.8});
 const silver=new THREE.MeshStandardMaterial({color:0x74797c,metalness:.65,roughness:.42});
 // Modo História: the black overalls Kléber Eletric lends (story-career.js outfitOf 'emprestado') cover the
 // red suit of the photo; 'proprio' (his own) brings it back.
 const own={red:{map:red.map,bumpMap:red.bumpMap,color:red.color.getHex()},front:{map:front.map,color:front.color.getHex()}};let suitKind='proprio';
 function suit(kind){
  const loan=kind==='emprestado';if(loan===(suitKind==='emprestado'))return;suitKind=kind;
  for(const [m,o] of [[red,own.red],[front,own.front]]){m.map=loan?null:o.map;if('bumpMap' in o)m.bumpMap=loan?null:o.bumpMap;m.color.setHex(loan?0x1d1f22:o.color);m.needsUpdate=true;}
 }
 function mesh(g,m,p,parent=root){const o=new THREE.Mesh(g,m);o.position.set(...p);parent.add(o);o.castShadow=true;o.receiveShadow=true;return o;}
 const sphere=(p,s,m,parent=root)=>{const o=mesh(new THREE.SphereGeometry(1,20,12),m,p,parent);o.scale.set(...s);return o;};
 function segment(a,b,r1,r2,m,parent=root){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);const o=mesh(new THREE.CylinderGeometry(r2,r1,1,16,5),m,[0,0,0],parent);fit(o,av,bv);return o;}
 function fit(o,a,b){o.position.copy(a).add(b).multiplyScalar(.5);o.scale.y=Math.max(1e-4,a.distanceTo(b));o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());}
 function tube(points,r,m,parent=root){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,6,false),m,[0,0,0],parent);}
 function badge(text,p,w,h,parent=root){
  const c=document.createElement('canvas');c.width=256;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#181a1b';ctx.fillRect(0,0,256,96);ctx.fillStyle='#ecece8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='italic bold 51px Arial';ctx.fillText(text,128,52);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const o=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:1,side:THREE.DoubleSide}),p,parent);return o;
 }
 // Pelvis stays in the seat; the legs are solved onto the pedals every frame.
 sphere([-.18,.48,-.34],[.19,.09,.175],red);
 const toLocal=p=>root.worldToLocal(p),contactPoint=anchor=>toLocal(anchor.getWorldPosition(new THREE.Vector3()));
 root.updateWorldMatrix(true,true);
 const rest={throttle:contactPoint(controls.pedals.throttle.contact),brake:contactPoint(controls.pedals.brake.contact),clutch:contactPoint(controls.pedals.clutch.contact)};
 const legs=[];
 for(const side of [-1,1]){
  const z=-.34+side*.095;
  const thigh=segment([0,0,0],[0,1,0],.080,.066,red),shin=segment([0,0,0],[0,1,0],.063,.043,red);
  const knee=sphere([0,0,0],[.078,.070,.069],red);
  const boot=new THREE.Group();root.add(boot);
  sphere([.125,.038,0],[.135,.040,.048],black,boot);sphere([.05,.07,0],[.058,.058,.047],black,boot);
  mesh(new THREE.BoxGeometry(.25,.008,.075),sole,[.115,.004,0],boot);
  // Heels pivot here: right between throttle and brake, left between clutch and rest.
  legs.push({side,hip:new THREE.Vector3(-.14,.49,z),heel:new THREE.Vector3(.55,FLOOR,side>0?-.30:-.52),thigh,shin,knee,boot});
 }
 const torso=new THREE.Group();torso.position.set(-.20,.54,-.34);root.add(torso);
 const rings=[[0,.135,.09],[.07,.143,.102],[.20,.17,.111],[.33,.19,.105],[.39,.15,.091],[.425,.064,.064]];
 const vertices=[],uvs=[],indices=[];const segments=40;
 for(const [y,width,depth] of rings)for(let j=0;j<=segments;j++){
  const a=j/segments*Math.PI*2,x=Math.cos(a)*depth,z=Math.sin(a)*width;
  vertices.push(x,y,z);uvs.push(.496-z/.40*.40,1-(798-y/.425*510)/1536);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<segments;j++){
  const a=i*(segments+1)+j,b=a+segments+1,start=indices.length;indices.push(a,b,a+1,a+1,b,b+1);
  geo.addGroup(start,6,Math.cos((j+.5)/segments*Math.PI*2)>.35?1:0);
 }
 const groups=[];for(const g of geo.groups){const last=groups.at(-1);if(last&&last.materialIndex===g.materialIndex&&last.start+last.count===g.start)last.count+=g.count;else groups.push({...g});}geo.clearGroups();for(const g of groups)geo.addGroup(g.start,g.count,g.materialIndex);
 geo.setIndex(indices);geo.computeVertexNormals();const chest=mesh(geo,[red,front],[0,0,0],torso);
 // Side inserts, collar, harness and buckle.
 for(const side of [-1,1]){
  sphere([-.015,.20,side*.149],[.094,.158,.025],black,torso);
  tube([[.066,.403,side*.105],[.112,.29,side*.085],[.118,.15,side*.06],[.11,.056,side*.027]],.020,black,torso);
  const patch=badge('OMP',[.117,.321,side*.096],.065,.024,torso);patch.rotation.y=Math.PI/2;
 }
 sphere([0,.429,0],[.067,.028,.069],red,torso);
 sphere([.115,.067,0],[.016,.026,.038],silver,torso);
 // Neck pivot below the helmet, so nods and tilts swing the head, not spin it.
 const neck=new THREE.Group();neck.position.set(-.03,.46,0);torso.add(neck);
 const head=new THREE.Group();head.position.set(.015,.105,0);neck.add(head);
 neck.rotation.order=head.rotation.order='YZX';
 const helmet=await createHelmet();head.add(helmet.root);
 // Gloves are posed from anchors on the rim and levers, so contact never drifts.
 const arms=[];
 for(const side of [-1,1]){
  const anchor=new THREE.Object3D();anchor.position.set(side*.173,0,.008);wheelTurn.add(anchor);
  const glove=new THREE.Group();root.add(glove);
  sphere([side*.009,0,.024],[.032,.045,.026],black,glove);
  for(let finger=0;finger<4;finger++){
   const y=(finger-1.5)*.017;
   tube([[side*.030,y,.025],[0,y,.040],[-side*.023,y,.024],[-side*.021,y,-.008]],.007,black,glove);
  }
  tube([[side*.03,-side*.025,.02],[side*.022,-side*.047,.025],[-side*.002,-side*.034,.029]],.010,black,glove);
  const tag=badge('OMP',[side*.012,0,.053],.047,.020,glove);tag.rotation.z=side*.18;
  const upper=segment([0,0,0],[0,1,0],.061,.052,red);
  const lower=segment([0,0,0],[0,1,0],.053,.038,red);
  const elbow=sphere([0,0,0],[.054,.055,.054],red);
  const shoulder=sphere([0,0,0],[.073,.074,.077],red);
  const cuff=segment([0,0,0],[0,1,0],.037,.039,black);
  arms.push({side,anchor,glove,upper,lower,elbow,shoulder,cuff});
 }
 const right=arms[1],rootInverse=new THREE.Matrix4(),scratch=new THREE.Matrix4(),basis=new THREE.Matrix4(),unitScale=new THREE.Vector3();
 function anchorPose(object){scratch.multiplyMatrices(rootInverse,object.matrixWorld);const p=new THREE.Vector3(),q=new THREE.Quaternion();scratch.decompose(p,q,unitScale);return {p,q};}
 // A fist around a lever axis, back of the hand toward the shoulder, as on the rim.
 function leverPose(object,shoulder){
  const {p,q}=anchorPose(object),axis=new THREE.Vector3(0,1,0).applyQuaternion(q);
  const back=shoulder.clone().sub(p);back.addScaledVector(axis,-back.dot(axis)).normalize();
  basis.makeBasis(new THREE.Vector3().crossVectors(axis,back),axis,back);q.setFromRotationMatrix(basis);return {p,q};
 }
 const handPose=(target,shoulder)=>target==='knob'?leverPose(controls.knobGrip,shoulder):anchorPose(right.anchor);
 const handState={id:-1,from:null,p:new THREE.Vector3(),q:new THREE.Quaternion(),away:0};
 function moveRightHand(hand,shoulder,dt){
  const target=handPose(hand.to,shoulder);
  if(hand.id!==handState.id){handState.id=hand.id;handState.from={p:handState.p.clone(),q:handState.q.clone()};}
  if(hand.t<1&&handState.from){
   // Minimum-jerk reach on a shallow arc: up and back toward the body, then in.
   const from=handState.from,arc=Math.sin(Math.PI*hand.s)*Math.min(1,from.p.distanceTo(target.p)/.3);
   target.p.lerpVectors(from.p,target.p,hand.s).add(new THREE.Vector3(-.035,.06,0).multiplyScalar(arc));
   target.q.slerpQuaternions(from.q,target.q,Math.min(1,hand.s*1.15));
  }
  handState.p.copy(target.p);handState.q.copy(target.q);
  const away=hand.to==='wheel'?1-hand.s:hand.from==='wheel'?hand.s:1;
  handState.away=dt>0?handState.away+(away-handState.away)*(1-Math.exp(-dt*20)):away;
  right.glove.position.copy(target.p);right.glove.quaternion.copy(target.q);
 }
 function placeBoot(boot,heel,ball){
  const d=ball.clone().sub(heel),flat=Math.hypot(d.x,d.z);
  boot.position.copy(heel);boot.rotation.set(0,Math.atan2(-d.z,d.x),Math.atan2(d.y,flat),'YZX');boot.updateMatrix();
  return ANKLE.clone().applyMatrix4(boot.matrix);
 }
 // Look at the road about a second ahead: into the corner before the wheel turns.
 function roadAhead(car){
  const samples=car.data?.samples,speed=car.vx*Math.cos(car.heading)+car.vy*Math.sin(car.heading);
  if(!samples||!Number.isInteger(car.index)||speed<3)return undefined;
  const p=samples[(car.index+Math.round((10+speed*1.1)/2))%samples.length],angle=wrap(Math.atan2(p[2]-car.y,p[1]-car.x)-car.heading);
  return Math.abs(angle)<1.2?angle:undefined;
 }
 const lift=new THREE.Vector3(-.05,.05,0),heelLift=new THREE.Vector3(-.02,.025,0);
 let pose={lean:0,pitch:0,lateral:0},controlPose=choreography.info(),errors=[],legErrors=[];
 function update(car,dt,{command,impact=0,phoneArrived=false}={}){
  const speed=car.vx*Math.cos(car.heading)+car.vy*Math.sin(car.heading);
  controlPose=choreography.update({throttle:command?.throttle??0,brake:command?.brake??0,handbrake:command?.handbrake??0,gear:car.gear,kmh:speed*3.6,manual:!!car.manualGear,clutch:command?.clutch??0,gears:car.mechanics?.gears},dt);
  controls.apply(controlPose);
  pose=motion.update(car,dt,{look:roadAhead(car),wheel:wheelTurn.rotation.z,reach:handState.away,rough:car.surface&&!car.surface.onRoad&&car.wheelsDown!==0?1:0,impact,phoneArrived});
  torso.rotation.set(pose.lean,pose.twist,pose.pitch);chest.scale.set(1+pose.breath*.014,1,1+pose.breath*.006);
  neck.rotation.set(pose.headRoll*.6,pose.headYaw*.35,pose.headPitch*.6);
  head.rotation.set(pose.headRoll*.4,pose.headYaw*.65,pose.headPitch*.4);
  root.updateWorldMatrix(true,true);rootInverse.copy(root.matrixWorld).invert();errors=[];legErrors=[];
  for(const arm of arms){
   const s=toLocal(torso.localToWorld(new THREE.Vector3(.004,.355,arm.side*.18)));
   if(arm===right)moveRightHand(controlPose.hand,s,dt);
   else{const p=anchorPose(arm.anchor);arm.glove.position.copy(p.p);arm.glove.quaternion.copy(p.q);}
   arm.glove.updateMatrixWorld();
   const wrist=toLocal(arm.glove.localToWorld(new THREE.Vector3(0,0,.021)));
   // Elbow drops and swings out behind a hand reaching down to a lever.
   const away=arm===right?handState.away:0;
   const pole=s.clone().add(new THREE.Vector3(-.02-.1*away,-.25,arm.side*(.22-.06*away)));
   const ik=solveArm(s,wrist,pole);fit(arm.upper,s,ik.elbow);fit(arm.lower,ik.elbow,wrist);
   arm.shoulder.position.copy(s);arm.elbow.position.copy(ik.elbow);
   const cuffStart=wrist.clone().lerp(ik.elbow,.16);fit(arm.cuff,cuffStart,wrist);
   errors.push({side:arm.side,reachable:ik.reachable,upper:s.distanceTo(ik.elbow),lower:ik.elbow.distanceTo(wrist),gripRadius:Math.hypot(arm.anchor.position.x,arm.anchor.position.y),
    target:arm===right?controlPose.hand.to:'wheel',onTarget:arm!==right||controlPose.hand.t>=1});
  }
  // Right boot pivots on its heel between throttle and brake; the left covers the clutch.
  const p=controls.pedals,brake=contactPoint(p.brake.contact),clutch=contactPoint(p.clutch.contact);
  const f=controlPose.footOnBrake,l=controlPose.leftFoot,leftLift=Math.sin(Math.PI*l);
  const feet=[
   {leg:legs[0],ball:contactPoint(controls.restContact).lerp(clutch,l).addScaledVector(lift,leftLift),heel:legs[0].heel.clone().addScaledVector(clutch.clone().sub(rest.clutch),l).addScaledVector(heelLift,leftLift)},
   // A planted heel on the throttle; braking pushes the whole leg.
   {leg:legs[1],ball:contactPoint(p.throttle.contact).lerp(brake,f).addScaledVector(lift,controlPose.footLift),heel:legs[1].heel.clone().addScaledVector(brake.clone().sub(rest.brake),f).addScaledVector(heelLift,controlPose.footLift)}
  ];
  for(const {leg,ball,heel} of feet){
   const ankle=placeBoot(leg.boot,heel,ball);
   const ik=solveArm(leg.hip,ankle,leg.hip.clone().add(new THREE.Vector3(.3,1,leg.side*.35)),THIGH,SHIN);
   fit(leg.thigh,leg.hip,ik.elbow);fit(leg.shin,ik.elbow,ankle);leg.knee.position.copy(ik.elbow);
   legErrors.push({side:leg.side,reachable:ik.reachable,thigh:leg.hip.distanceTo(ik.elbow),shin:ik.elbow.distanceTo(ankle),knee:ik.elbow.toArray(),ball:ball.toArray()});
  }
 }
 function reset(){motion.reset();choreography.reset(1);handState.id=-1;handState.from=null;handState.away=0;}
 // Each glove, boot and the torso's straps move as one: a mesh per material (car-lod.js mergeStill), the head apart.
 for(const a of arms)mergeStill(a.glove);for(const leg of legs)mergeStill(leg.boot);mergeStill(torso,{skip:[neck]});
 return {root,update,reset,suit,info:()=>({reference:'geracoes_piloto/v01_omp_oli',suit:suitKind,...pose,arms:errors,legs:legErrors,controls:{...controlPose},visible:root.visible,helmet:helmet.info(),headHeight:1.105+.161})};
}
