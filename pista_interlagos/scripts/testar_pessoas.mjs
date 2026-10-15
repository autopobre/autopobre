import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {createPeople,POSES,IDLE_ARMS,IDLE_GESTURES,IDLE_KINDS,applyPose,clonePose,IdleMind,Idler,updatePeople,peopleInfo,setPeopleReach} from '../teste/pit-crew.js';

// People idle instead of standing like statues: the gesture targets land the hands where
// they should, everyone moves over time, cars catch the marshals' and cameramen's eyes.
const people=createPeople(),v=new THREE.Vector3();
const world=(o,x=0,y=0,z=0)=>(o.updateWorldMatrix(true,false),new THREE.Vector3(x,y,z).applyMatrix4(o.matrixWorld));

// --- The solved arm targets, on a standing figure (the arms hang from the torso).
const body=people.person({}),rig=body.userData.rig;
function hold(arms){const p=clonePose(POSES.stand);for(const i of [0,1]){if(!arms[i])continue;[p.arm[i],p.elbow[i],p.spread[i],p.roll[i]]=arms[i];}applyPose(rig,p);body.updateMatrixWorld(true);return [world(rig.limbs[-1].hand),world(rig.limbs[1].hand)];}
const mouth=world(rig.head,.1,.042,0);
// The chest: a tapered cylinder (radius .15 at the waist to .19 at the shoulders, 66% deep).
const inTorso=h=>{if(h.y<.95||h.y>1.45)return false;const r=.15+.04*(h.y-.95)/.5;return (h.x/(r*.66))**2+(h.z/r)**2<1;};
{const [,r]=hold([null,IDLE_ARMS.sip]);assert(r.distanceTo(mouth)<.08,`the cup reaches the mouth (${r.distanceTo(mouth).toFixed(3)} m)`);}
{const [,r]=hold([null,IDLE_ARMS.cap]);assert(r.y>1.72&&r.x>.1&&Math.abs(r.z)<.12,'the hand goes to the cap brim');}
{const [,r]=hold([null,IDLE_ARMS.ear]);assert(r.y>1.5&&r.y<1.7&&r.z>.1&&r.z<.24&&Math.abs(r.x)<.12,'the radio goes to the ear');}
{const [l]=hold([IDLE_ARMS.wrist,null]);assert(l.x>.2&&l.y>1.1&&l.y<1.3&&Math.abs(l.z)<.1,'the watch comes in front of the chest');}
{const [,r]=hold([null,IDLE_ARMS.phone]);assert(r.x>.25&&r.y>1.1&&r.y<1.3,'the phone is held in front of the chest');}
{const [l,r]=hold([IDLE_ARMS.back,IDLE_ARMS.back]);assert(l.x<-.14&&r.x<-.14&&l.y<1.05&&r.y<1.05,'hands clasped behind the back');}
{const [l,r]=hold([IDLE_ARMS.hip,IDLE_ARMS.hip]);assert(Math.abs(l.y-1)<.08&&Math.abs(r.y-1)<.08&&l.z<-.15&&r.z>.15,'hands on the hips');}
{const [l,r]=hold([IDLE_ARMS.clap,IDLE_ARMS.clap]);assert(l.distanceTo(r)<.08&&l.x>.3,'clapping hands meet in front');}
for(const [name,arms] of Object.entries(IDLE_ARMS)){const [l,r]=hold([arms,arms]);assert(!inTorso(l)&&!inTorso(r),`${name}: the hands stay out of the chest`);}
// Every kind only names gestures that exist.
for(const [kind,table] of Object.entries(IDLE_KINDS))for(const name of Object.keys(table))assert(IDLE_GESTURES[name],`${kind}: gesture ${name}`);

// --- Blinking: the lids come down over the pupils and fold into the brow when open.
{const p=clonePose(POSES.stand);p.lid=1;applyPose(rig,p);assert.equal(rig.lids.scale.y,1,'closed lids cover the eyes');
 p.lid=.5;applyPose(rig,p);assert.equal(rig.lids.scale.y,.5,'half way down');p.lid=0;applyPose(rig,p);assert(rig.lids.scale.x<.01&&rig.lids.scale.y<.01,'open lids fold away');
 // Closed, the lid (a flat ellipsoid below the bone) covers the pupil's front point.
 const pupil=new THREE.Vector3(.11,.118,.037),lid=new THREE.Vector3(.1,.118,.037),radii=[.0132,.024,.0252],d=pupil.clone().sub(lid);
 assert(d.toArray().reduce((sum,x,i)=>sum+(x/radii[i])**2,0)<1,'the lid covers the pupil');
 const mind=new IdleMind('stand',{seed:.9});let blinks=0,closed=false,longest=0,run=0;
 for(let i=0;i<60*30;i++){const s=clonePose(POSES.stand);mind.apply(s,1/60,{pose:'stand'});const shut=s.lid>.9;if(shut&&!closed)blinks++;closed=shut;run=s.lid>.05?run+1/60:0;if(!mind.gesture||mind.gesture.name!=='stretch')longest=Math.max(longest,run);}
 assert(blinks>=5&&blinks<=20,`blinks every few seconds (${blinks} in 30 s)`);assert(longest<.25,`a blink is quick (${longest.toFixed(2)} s)`);}

// --- A mind never freezes and picks gestures its hands and props allow.
{const mind=new IdleMind('crew',{hands:[true,false],seed:.3}),seen=new Set();let s=clonePose(POSES.stand);
 for(let i=0;i<60*240;i++){s=clonePose(POSES.stand);mind.apply(s,1/60,{pose:'stand'});if(mind.gesture)seen.add(mind.gesture.name+':'+mind.gesture.side);}
 for(const g of seen){const [name,side]=g.split(':');const G=IDLE_GESTURES[name];if(['one','right','left'].includes(G.hands))assert.equal(side,'0',`${name} uses the free left hand, not the one with the tool`);assert(!G.needs,`${name} needs a prop the crew does not carry`);}
 assert(seen.size>=6,`the crew waits in many ways (${[...seen].join(', ')})`);}

// --- A crowd: café customers, a rival crew, a marshal and a cameraman, 300 m apart.
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();scene.add(camera);
const entries=[
 {outfit:{top:0x2f6db5},pose:'stool',x:0,y:0,z:0,yaw:0},
 {outfit:{top:0xe0b25a},pose:'sit',x:1.5,y:0,z:1,yaw:1},
 {outfit:{top:0xc81d25,hat:'cap'},pose:'folded',x:3,y:0,z:2,yaw:.4},
 {outfit:{top:0xe8702a,hat:'cap'},pose:'rest',idle:'marshal',x:300,y:0,z:0,yaw:0},
 {outfit:{top:0x24292e,hat:'headset'},pose:'stand',idle:'camera',x:0,y:5.9,z:300,yaw:0,camera:{x:0,y:5.9,z:300,back:.62,drop:1.25}},
];
// Standing people are a little taller or shorter each; anyone seated keeps the height of the seat, whatever their idle
// (Box 99's desk engineers: a stool and the 'desk' idle, their hands on the desk).
{
 const desk=people.crowd([{outfit:{},pose:'stool',idle:'desk',x:0,y:0,z:0,yaw:0},{outfit:{},pose:'sit',x:1,y:0,z:0,yaw:0},...[2,3,4,5].map(x=>({outfit:{},pose:'stand',x,y:0,z:x*.7,yaw:0}))],{name:'Estatura',cell:48});
 const hips=desk.children[0].skeleton.bones.filter(b=>b.name==='Quadril').map(b=>b.scale.x);
 assert.ok(hips[0]===1&&hips[1]===1,`seated: the seat's height (${hips})`);
 assert.ok(hips.slice(2).every(s=>s>=.94&&s<=1.06)&&new Set(hips.slice(2)).size>1,`standing: each their own height (${hips})`);
}
const group=people.crowd(entries,{name:'Teste',cell:48});scene.add(group);
assert.equal(group.children.length,3,'one skinned mesh per neighbourhood');
for(const m of group.children){assert(m.isSkinnedMesh&&!Array.isArray(m.material),'a single skinned draw call each');}
const [cafe,marshalMesh,cameraMesh]=group.children,perPerson=cafe.geometry.attributes.position.count/3;
assert(perPerson<5000,`indexed figures stay light (${Math.round(perPerson)} vertices each)`);
const crowdOf=m=>peopleInfo().find(c=>c.name===m.name);
const bonesOf=m=>m.skeleton.bones;
const snapshot=m=>bonesOf(m).map(b=>b.rotation.toArray().slice(0,3).concat(b.position.toArray(),b.scale.x)).flat();
const car=new THREE.Object3D();scene.add(car);car.visible=false;
const step=(seconds,cars=[car])=>{for(let t=0;t<seconds;t+=1/30){scene.updateMatrixWorld();updatePeople(1/30,camera,cars);}};
// Camera next to each group in turn so all of them are updated every frame.
camera.position.set(0,2,8);step(1);
const before=snapshot(cafe);step(20);
const after=snapshot(cafe);assert(before.some((x,i)=>Math.abs(x-after[i])>.02),'the café customers move');
const doing=new Set();for(let i=0;i<60*3;i++){step(1/3);for(const d of crowdOf(cafe).doing)if(d)doing.add(d);}
assert(doing.has('sip'),`someone sips coffee (${[...doing].join(', ')})`);
// The customers hold a cup all along; phones only come out for a gesture.
{const props=bonesOf(cafe).filter(b=>b.name.startsWith('Objeto_'));assert(props.filter(b=>b.name==='Objeto_cup').every(b=>b.scale.x===1),'cups stay in hand');
 for(let i=0;i<600;i++){step(.1);const info=crowdOf(cafe);const phones=bonesOf(cafe).filter(b=>b.name==='Objeto_phone');phones.forEach((b,k)=>assert.equal(b.scale.x>.5,info.using[k]==='phone','a phone shows only while in use'));}}

// Marshal: a car 40 m away to his left catches his eye.
camera.position.set(300,2,8);step(1);
{const m=crowdOf(marshalMesh);assert(m,'marshal crowd is live');
 const head=bonesOf(marshalMesh).find(b=>b.name==='Cabeca');car.visible=true;car.position.set(300+30,1,-30);step(3);
 assert(head.rotation.y+bonesOf(marshalMesh).find(b=>b.name==='Tronco').rotation.y>.45,'the marshal turns to watch the car');
 car.position.set(300+30,1,30);step(3);
 assert(head.rotation.y+bonesOf(marshalMesh).find(b=>b.name==='Tronco').rotation.y<-.45,'and follows it past');car.visible=false;step(4);}

// Cameraman: pans the head (and walks round the tripod) to film the car, hands on the camera.
camera.position.set(0,6,308);step(1);
{const pivot=bonesOf(cameraMesh).find(b=>b.name==='Lugar'),tilt=bonesOf(cameraMesh).find(b=>b.name==='Camera_tv');
 car.visible=true;car.position.set(80,0,300-80);step(3);
 const want=Math.atan2(80,80);assert(Math.abs(pivot.rotation.y-want)<.08,`the camera pans onto the car (${pivot.rotation.y.toFixed(2)} vs ${want.toFixed(2)})`);
 assert(tilt.rotation.z<-.02,'and tilts down to it');assert.equal(crowdOf(cameraMesh).doing[0],'filmando');
 cameraMesh.updateMatrixWorld(true);const lens=world(tilt,0,.12,0);
 for(const side of ['Mao_-1','Mao_1']){const h=world(bonesOf(cameraMesh).find(b=>b.name===side));assert(h.distanceTo(lens)<.45,`${side} on the camera (${h.distanceTo(lens).toFixed(2)} m)`);}
 const head=world(bonesOf(cameraMesh).find(b=>b.name==='Cabeca'),0,.1,0),back=world(tilt,-.31,.12,0);
 assert(head.distanceTo(back)<.4&&head.distanceTo(back)>.1,`his eye near the back of the camera (${head.distanceTo(back).toFixed(2)} m)`);
 car.visible=false;step(12);assert(Math.abs(pivot.rotation.y)<.1,'with no car it drifts back to the track');}

// Every skinned vertex stays inside the group's culling sphere while they idle.
for(const m of group.children){m.updateMatrixWorld(true);const sphere=m.boundingSphere;for(let i=0;i<m.geometry.attributes.position.count;i+=7){m.getVertexPosition(i,v);assert(sphere.containsPoint(v),`${m.name} vertex inside its bounding sphere`);}}

// Their reach (PEOPLE_REACH) goes by the lens: 500 m off, past a 250 m reach through the chase lens, in it through the
// broadcast camera's long one.
{
 const far=people.crowd([{outfit:{},pose:'stand',x:500,y:0,z:0,yaw:0}],{name:'Lente',cell:48});scene.add(far);setPeopleReach(250);
 const lens=new THREE.PerspectiveCamera(58,16/9,.1,3000);scene.add(lens);lens.position.set(0,2,0);
 scene.updateMatrixWorld();updatePeople(1/30,lens,[]);assert.equal(far.children[0].visible,false,'past the reach through the chase lens');
 lens.fov=4.5;lens.updateProjectionMatrix();updatePeople(1/30,lens,[]);assert.equal(far.children[0].visible,true,'in it through a long lens');
 setPeopleReach(800);scene.remove(far,lens);
}
// Taken out of the scene (another circuit loaded), the crowd leaves the update list.
scene.remove(group);step(.1);assert(!peopleInfo().some(c=>c.name.startsWith('Teste')),'removed crowds stop updating');

// A single figure (supporters, judge, podium) idles too.
{const fan=people.person({}),idler=new Idler(fan,'fan',{props:{phone:people.carry('phone',fan.userData.rig.limbs[1].hand)},seed:.5}),seen=new Set();let moved=0,last=fan.userData.rig.head.rotation.y;
 for(let i=0;i<60*120;i++){idler.update(1/60,'stand');if(idler.mind.gesture)seen.add(idler.mind.gesture.name);moved+=Math.abs(fan.userData.rig.head.rotation.y-last);last=fan.userData.rig.head.rotation.y;}
 assert(seen.size>=4&&moved>1,`the supporter idles (${[...seen].join(', ')})`);}

console.log('Pessoas: gestos, multidões, fiscal e cinegrafista ok');
