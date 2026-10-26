import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {solveArm,steeringWheelAngle} from './driver-rig.js';
import {helmetSurface,HELMET_RINGS} from './driver-helmet.js';

// The rivals' drivers: the Opala 99 driver's seated pose (driver.js, same frame: +X front, -Z left)
// in each team's suit and helmet, cheap enough for the whole grid. One skinned mesh with two
// materials (cloth and the glossy helmet and visor), coloured per vertex, and seven rigid bones:
// body, head, the steering wheel with both gloves, and two per arm, solved onto the rim each frame
// so the hands turn the wheel. The head leans into the corners and nods under the brakes.
export const CABIN_DROP=-.093; // cockpit.js V06.drop: seat and controls sit on the V06 cabin floor
const TORSO=new THREE.Vector3(-.20,.54,-.34),NECK=new THREE.Vector3(-.23,1.0,-.34),HEAD=new THREE.Vector3(.015,.105,0);
const WHEEL=new THREE.Vector3(.22,.88,-.34),WHEEL_REST=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.38,-Math.PI/2,.035,'YXZ'));
const UPPER=.275,LOWER=.265,RIM=.175; // solveArm's arm lengths; the gloves grip the rim at 9 and 3
const BONE={body:0,head:1,wheel:2,upper:{[-1]:3,[1]:5},fore:{[-1]:4,[1]:6}};
const shoulder=side=>TORSO.clone().add(new THREE.Vector3(.004,.355,side*.18));
const wrist=side=>new THREE.Vector3(side*.173,0,.029); // wheel frame: +X to the passenger, +Z to the seat
const WHITE=0xf2f1ec,BLACK=0x17191b,GLOVE=0x141618,BALACLAVA=0xe6e3da,VISORS=[0x14171b,0xb9832b,0x2d5ea4];
const Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
let shared=null;
const materials=()=>shared??=[
 new THREE.MeshStandardMaterial({name:'Piloto_rival_tecido',vertexColors:true,roughness:.86}),
 new THREE.MeshStandardMaterial({name:'Piloto_rival_capacete',vertexColors:true,roughness:.24,metalness:.08})];
// Every driver's suit and helmet materials (kept when one car is thrown away).
export const sharedDriverMaterials=()=>shared??[];
const luminance=hex=>{const c=new THREE.Color(hex);return .2126*c.r+.7152*c.g+.0722*c.b;};
// Helmet and visor for a team: three paint schemes and three visors, picked by the car number.
export function rivalKit(color,number){
 const k=[...String(number)].reduce((sum,ch)=>sum*31+ch.charCodeAt(0),7)>>>0,contrast=luminance(color)>.45?BLACK:WHITE;
 const scheme=[{base:color,pin:contrast,crown:contrast},{base:contrast,pin:color,crown:color},{base:color,pin:contrast,crown:color}][k%3];
 return {suit:color,...scheme,visor:VISORS[(k>>2)%3]};
}
// kit: another suit and helmet (rivalKit's fields): a multiplayer pilot's own look (multiplayer.js lookKit).
export function createRivalDriver({color,number,kit:own=null}){
 const kit=own??rivalKit(color,number),parts=[[],[]];
 // Every part is one bone's, in that bone's frame, with one colour; cloth (0) or gloss (1).
 function add(g,bone,hex,gloss=0){
  for(const key of Object.keys(g.attributes))if(key!=='position'&&key!=='normal')g.deleteAttribute(key);
  if(!g.index)g.setIndex([...Array(g.attributes.position.count).keys()]);if(!g.attributes.normal)g.computeVertexNormals();
  const n=g.attributes.position.count,c=new THREE.Color(hex),colors=new Float32Array(n*3),index=new Uint16Array(n*4),weight=new Float32Array(n*4);
  for(let i=0;i<n;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;index[i*4]=bone;weight[i*4]=1;}
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(index,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(weight,4));
  parts[gloss].push(g);return g;
 }
 const ellipsoid=(p,s,bone,hex,w=12,h=8)=>add(new THREE.SphereGeometry(1,w,h).scale(...s).translate(...p),bone,hex);
 function segment(a,b,r1,r2,bone,hex,radial=10){
  const d=b.clone().sub(a),g=new THREE.CylinderGeometry(r2,r1,d.length(),radial,1,true).translate(0,d.length()/2,0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y,d.normalize())).translate(a.x,a.y,a.z);return add(g,bone,hex);
 }
 const tube=(points,r,bone,hex)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p).add(TORSO))),14,r,5,false),bone,hex);
 // --- Body (car frame): hips and legs to the pedals, torso, harness and HANS.
 ellipsoid([-.18,.48,-.34],[.19,.09,.175],BONE.body,kit.suit);
 for(const side of [-1,1]){
  const hip=new THREE.Vector3(-.14,.49,-.34+side*.095),heel=new THREE.Vector3(.55,.312,side>0?-.30:-.52),ankle=heel.clone().add(new THREE.Vector3(.07,.08,0));
  const knee=solveArm(hip,ankle,hip.clone().add(new THREE.Vector3(.3,1,side*.35)),.371,.379).elbow;
  segment(hip,knee,.080,.066,BONE.body,kit.suit);segment(knee,ankle,.063,.043,BONE.body,kit.suit);ellipsoid(knee.toArray(),[.075,.07,.07],BONE.body,kit.suit);
  add(new THREE.SphereGeometry(1,10,6).scale(.13,.045,.05).rotateZ(.45).translate(heel.x+.11,heel.y+.07,heel.z),BONE.body,BLACK);
  ellipsoid(shoulder(side).toArray(),[.073,.074,.077],BONE.body,kit.suit,18,12);
 }
 // Torso: the driver.js section rings (height, half width, half depth), 16 sides.
 const rings=[[0,.135,.09],[.07,.143,.102],[.20,.17,.111],[.33,.19,.105],[.39,.15,.091],[.425,.064,.064]],sides=16,pos=[],idx=[];
 for(const [y,width,depth] of rings)for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2;pos.push(TORSO.x+Math.cos(a)*depth,TORSO.y+y,TORSO.z+Math.sin(a)*width);}
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;idx.push(a,b,a+1,a+1,b,b+1);}
 const torso=new THREE.BufferGeometry();torso.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));torso.setIndex(idx);torso.computeVertexNormals();add(torso,BONE.body,kit.suit);
 ellipsoid(TORSO.clone().add(new THREE.Vector3(0,.429,0)).toArray(),[.067,.028,.069],BONE.body,kit.suit);
 // Sgarbi harness over the shoulders to the buckle, lap belts, and the HANS collar round the neck.
 for(const side of [-1,1]){
  tube([[-.11,.43,side*.10],[.02,.43,side*.105],[.066,.403,side*.105],[.112,.29,side*.085],[.118,.15,side*.06],[.11,.056,side*.027]],.019,BONE.body,BLACK);
  tube([[.11,.05,side*.02],[.10,.03,side*.10],[.05,.0,side*.155]],.019,BONE.body,BLACK);
 }
 ellipsoid(TORSO.clone().add(new THREE.Vector3(.118,.067,0)).toArray(),[.016,.026,.038],BONE.body,0x8a8f94);
 tube([[.105,.33,-.07],[.08,.40,-.085],[0,.415,-.105],[-.08,.42,-.08],[-.105,.42,0],[-.08,.42,.08],[0,.415,.105],[.08,.40,.085],[.105,.33,.07]],.021,BONE.body,0x1d1e20);
 // --- Head (neck frame): balaclava, then the full-face shell of the 99's helmet in bands, so
 // the paint scheme has sharp edges, and the visor shut over the eye opening.
 segment(new THREE.Vector3(0,-.03,0),new THREE.Vector3(.012,.08,0),.052,.049,BONE.head,BALACLAVA);
 function shell(y0,y1,a0,a1,cols,lift,hex,gloss){
  const rows=[y0,...HELMET_RINGS.filter(y=>y>y0+1e-4&&y<y1-1e-4),y1],p=[],ix=[];
  for(const y of rows)for(let j=0;j<=cols;j++)p.push(...helmetSurface(y,a0+(a1-a0)*j/cols,lift).add(HEAD).toArray());
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;ix.push(a,b,a+1,a+1,b,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return add(g,BONE.head,hex,gloss);
 }
 shell(-.139,.082,0,Math.PI*2,28,0,kit.base,1);shell(.082,.097,0,Math.PI*2,28,0,kit.pin,1);shell(.097,.161,0,Math.PI*2,28,0,kit.crown,1);
 shell(-.02,.079,-1.0,1.0,14,.004,kit.visor,1);
 // Rubber seal round the visor and its side pivots, as on the 99's helmet (driver-helmet.js).
 const rim=points=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>p.add(HEAD))),points.length*2,.0045,4,false),BONE.head,BLACK);
 for(const y of [-.02,.079])rim(Array.from({length:13},(_,i)=>helmetSurface(y,-1.02+i/12*2.04,.005)));
 for(const side of [-1,1]){rim([-.02,.03,.079].map(y=>helmetSurface(y,side*1.02,.005)));add(new THREE.CylinderGeometry(.014,.014,.008,12).rotateX(Math.PI/2).translate(HEAD.x+.041,HEAD.y+.038,side*.126),BONE.head,BLACK);}
 // --- Steering wheel (wheel frame) with the gloves closed round the rim.
 add(new THREE.TorusGeometry(RIM,.017,6,30),BONE.wheel,GLOVE);
 add(new THREE.BoxGeometry(.012,.032,.036).translate(0,RIM,0),BONE.wheel,0xe0a623);
 add(new THREE.BoxGeometry(.33,.03,.008).translate(0,0,-.012),BONE.wheel,0x2a2c2f);add(new THREE.BoxGeometry(.03,.17,.008).translate(0,-.085,-.012),BONE.wheel,0x2a2c2f);
 add(new THREE.CylinderGeometry(.036,.036,.045,12).rotateX(Math.PI/2).translate(0,0,-.03),BONE.wheel,0x2a2c2f);
 for(const side of [-1,1]){
  ellipsoid([side*.178,0,.026],[.034,.048,.028],BONE.wheel,GLOVE,10,7);ellipsoid([side*.168,0,-.006],[.028,.046,.02],BONE.wheel,GLOVE,10,7);
  // --- Arms (bone frames along +Y): upper arm with the elbow, forearm with the glove's cuff.
  segment(new THREE.Vector3(),new THREE.Vector3(0,UPPER,0),.061,.052,BONE.upper[side],kit.suit,18);ellipsoid([0,UPPER,0],[.054,.055,.054],BONE.upper[side],kit.suit,18,12);
  segment(new THREE.Vector3(),new THREE.Vector3(0,LOWER*.84,0),.053,.040,BONE.fore[side],kit.suit,18);segment(new THREE.Vector3(0,LOWER*.84,0),new THREE.Vector3(0,LOWER,0),.039,.037,BONE.fore[side],GLOVE,18);
 }
 const geometry=mergeGeometries(parts.map(list=>{const g=mergeGeometries(list,false);list.forEach(p=>p.dispose());return g;}),true);
 const root=new THREE.Group();root.name='Piloto_'+number;root.position.y=CABIN_DROP;
 const bones=Array.from({length:7},(_,i)=>{const b=new THREE.Bone();b.name='Piloto_'+number+'_osso_'+i;root.add(b);return b;});
 bones[BONE.head].position.copy(NECK);bones[BONE.head].rotation.order='YZX';bones[BONE.wheel].position.copy(WHEEL);bones[BONE.wheel].quaternion.copy(WHEEL_REST);
 const mesh=new THREE.SkinnedMesh(geometry,materials());mesh.name='Piloto_rival_'+number;mesh.castShadow=mesh.receiveShadow=true;
 // Geometry sits in each bone's own frame, so the bind is the identity; the bounds cover the seat to the pedals.
 mesh.bind(new THREE.Skeleton(bones,bones.map(()=>new THREE.Matrix4())),new THREE.Matrix4());
 mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(.1,.75,-.34),1.05);root.add(mesh);
 const head={roll:0,yaw:0,pitch:0},turn=new THREE.Quaternion(),arms=[];let wheelAngle=0;
 function update(car,dt=0,shown=true){
  if(!shown)return;
  // Wheel as in the cockpit; the head as driver-rig.js: into the corner, into the braking.
  wheelAngle=steeringWheelAngle(car.steerVisual??car.steer??0);
  const speed=car.vx*Math.cos(car.heading)+car.vy*Math.sin(car.heading),g=THREE.MathUtils.clamp(speed*(car.yaw??0)/9.81,-1.2,1.2),k=dt>0?1-Math.exp(-dt*7):1;
  head.roll+=(-g*.10-head.roll)*k;head.yaw+=(THREE.MathUtils.clamp((car.steerInput??0)*.3,-.35,.35)-head.yaw)*k;head.pitch+=(THREE.MathUtils.clamp((car.longAccel??0)*.006,-.07,.05)-head.pitch)*k;
  bones[BONE.head].rotation.set(head.roll,head.yaw,head.pitch);
  const wheel=bones[BONE.wheel];wheel.quaternion.copy(WHEEL_REST).multiply(turn.setFromAxisAngle(Z,wheelAngle));wheel.updateMatrix();arms.length=0;
  for(const side of [-1,1]){
   const s=shoulder(side),w=wrist(side).applyMatrix4(wheel.matrix),ik=solveArm(s,w,s.clone().add(new THREE.Vector3(-.02,-.25,side*.22)));
   const upper=bones[BONE.upper[side]],fore=bones[BONE.fore[side]];
   upper.position.copy(s);upper.quaternion.setFromUnitVectors(Y,ik.elbow.clone().sub(s).normalize());
   fore.position.copy(ik.elbow);fore.quaternion.setFromUnitVectors(Y,w.clone().sub(ik.elbow).normalize());
   arms.push({side,reachable:ik.reachable,gap:ik.elbow.distanceTo(w)-LOWER});
  }
 }
 update({vx:0,vy:0,heading:0,yaw:0,steer:0},0);
 return {root,mesh,update,kit,info:()=>({number,wheel:wheelAngle,head:{...head},arms:arms.map(a=>({...a})),triangles:geometry.index.count/3})};
}
